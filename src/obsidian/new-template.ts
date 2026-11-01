import { Notice, TFile, stringifyYaml } from "obsidian";
import {
	AVAILABLE_EVERYWHERE_LABEL,
	COMMON_IN_PREFIX,
	COMMON_IN_VAULT_LABEL,
	COPY_BASE_PREFIX,
	CONFIG_PREFIX,
	EMPTY_BASE_LABEL,
	KNOWN_KEYS,
	MAX_SOURCES,
	NEW_TEMPLATE_BASENAME,
	SKELETON_DIALOG_PROPERTY_LIMIT,
	SKELETON_KEY_THRESHOLD,
	USED_EVERYWHERE_LABEL,
	USED_INSIDE_LABEL,
	USED_WHERE_CAPTION,
} from "../constants";
import { uniqueName } from "../core/filename";
import { folderAndAncestors, isInside, joinPath, parentPath, splitPath, templateFolderFor } from "../core/paths";
import { rankTemplates } from "../core/scope";
import { buildSkeleton, commonKeys, type PropertyValues } from "../core/skeleton";
import type { TemplateEntry } from "./discover";
import { ensureFolder } from "./folders";
import { errorMessage, type Host } from "./host";
import { pickFrom } from "./picker";
import { chooseSkeleton, type SkeletonSource } from "./skeleton-dialog";

type Base = TemplateEntry | "empty";

const usedInLabel = (folder: string) => (folder === "" ? USED_EVERYWHERE_LABEL : folder);

/** Property types the user assigned in Obsidian (`types.json`); empty when unavailable. */
async function readPropertyTypes(host: Host): Promise<Record<string, string>> {
	const { vault } = host.app;
	try {
		const parsed = JSON.parse(await vault.adapter.read(`${vault.configDir}/types.json`)) as {
			types?: Record<string, string>;
		};
		return parsed.types ?? {};
	} catch {
		return {};
	}
}

/** Property names of the notes under `scope`, one list per note. Template files are not notes. */
export function notePropertyKeys(host: Host, scope: string): string[][] {
	const { vault, metadataCache } = host.app;
	const result: string[][] = [];
	for (const file of vault.getMarkdownFiles()) {
		const segments = splitPath(file.path);
		if (segments.includes(host.settings.folderName) || !isInside(parentPath(file.path), scope)) continue;
		const frontmatter = metadataCache.getFileCache(file)?.frontmatter;
		if (frontmatter) result.push(Object.keys(frontmatter).filter((key) => key !== "position"));
	}
	return result;
}

/** Every template whose scope contains `scope`, ignoring where / except: any of them can be copied. */
async function copyableTemplates(host: Host, scope: string): Promise<TemplateEntry[]> {
	const { valid } = await host.index.load();
	return valid
		.filter((entry) => isInside(scope, entry.scope.root))
		.sort(
			(a, b) =>
				splitPath(b.scope.root).length - splitPath(a.scope.root).length ||
				a.scope.label.localeCompare(b.scope.label),
		);
}

async function chooseBase(host: Host, templates: TemplateEntry[]): Promise<Base | null> {
	if (templates.length === 0) return "empty";
	return pickFrom<Base>(
		host.app,
		["empty", ...templates],
		(item) => (item === "empty" ? EMPTY_BASE_LABEL : `${COPY_BASE_PREFIX}"${item.scope.label}"`),
		{
			// The copies are a block of their own, apart from the empty template.
			blockStart: templates[0],
			aux: (item) => (item === "empty" || item.scope.root === "" ? undefined : item.scope.root),
		},
	);
}

/** What the note properties of a new template can be taken from: one row per source, closest first. */
async function propertySources(
	host: Host,
	scope: string,
): Promise<{ source: SkeletonSource; values?: Record<string, unknown> }[]> {
	const hidden = new Set(host.settings.hiddenProperties);
	const result: { source: SkeletonSource; values?: Record<string, unknown> }[] = [];

	// The closest folder (this one, then its parents) whose notes have common properties.
	for (const level of folderAndAncestors(scope)) {
		const notes = notePropertyKeys(host, level);
		const common = commonKeys(notes, SKELETON_KEY_THRESHOLD, CONFIG_PREFIX).filter((name) => !hidden.has(name));
		if (common.length === 0) continue;
		result.push({
			source: {
				label: level === "" ? COMMON_IN_VAULT_LABEL : `${COMMON_IN_PREFIX}${level}`,
				aux: `${notes.length} ${notes.length === 1 ? "note" : "notes"}`,
				properties: common,
			},
		});
		break;
	}

	const { valid } = await host.index.load();
	for (const entry of rankTemplates(valid, scope, host.settings.mru)) {
		const properties = Object.keys(entry.parsed.frontmatter).filter((name) => !hidden.has(name));
		if (properties.length === 0) continue;
		result.push({
			source: {
				label: entry.scope.label,
				aux: entry.scope.root === "" ? AVAILABLE_EVERYWHERE_LABEL : entry.scope.root,
				properties,
			},
			values: entry.parsed.frontmatter,
		});
	}
	return result.slice(0, MAX_SOURCES);
}

async function createIn(host: Host, picked: string, choose: boolean): Promise<void> {
	const { app, settings } = host;
	const target = templateFolderFor(picked, settings.folderName);
	if (target === null) return;
	const scope = parentPath(target);

	const templates = await copyableTemplates(host, scope);
	const base = await chooseBase(host, templates);
	if (base === null) return;
	let content: string;
	if (base !== "empty") {
		content = await app.vault.read(base.file);
	} else {
		const notes = notePropertyKeys(host, scope);
		const hidden = new Set(settings.hiddenProperties);
		const usual = commonKeys(notes, SKELETON_KEY_THRESHOLD, CONFIG_PREFIX).filter((name) => !hidden.has(name));
		const inScope = commonKeys(notes, 0, CONFIG_PREFIX, SKELETON_DIALOG_PROPERTY_LIMIT);
		let keys: readonly string[] = KNOWN_KEYS;
		let properties = usual;
		let values: PropertyValues | undefined;
		if (choose) {
			const found = await propertySources(host, scope);
			const choice = await chooseSkeleton(app, {
				keys: KNOWN_KEYS,
				checkedKeys: settings.templateKeys,
				properties: inScope,
				otherProperties: commonKeys(notePropertyKeys(host, ""), 0, CONFIG_PREFIX, Infinity).filter(
					(name) => !inScope.includes(name),
				),
				checkedProperties: usual,
				hiddenProperties: settings.hiddenProperties,
				sources: found.map((item) => item.source),
			});
			if (choice === null) return;
			const data = choice.source === null ? undefined : found[choice.source]?.values;
			if (data) values = { data, stringify: (entry) => stringifyYaml(entry) };
			keys = choice.keys;
			properties = choice.properties;
			settings.templateKeys = choice.keys;
			settings.hiddenProperties = choice.hidden;
			await host.saveSettings();
		}
		content = buildSkeleton(properties, await readPropertyTypes(host), keys, values);
	}

	const folder = await ensureFolder(host, target);
	const name = uniqueName(
		NEW_TEMPLATE_BASENAME,
		"md",
		folder.children.map((child) => child.name),
	);
	const file = await app.vault.create(joinPath(target, `${name}.md`), content);
	await openForRename(host, file);
}

/** Opens the file with the title selected, like Obsidian's own "New note". */
async function openForRename(host: Host, file: TFile): Promise<void> {
	await host.app.workspace.getLeaf("tab").openFile(file, { eState: { rename: "all" } });
}

/** Entry point from a folder's context menu. */
export async function runNewTemplate(host: Host, folder: string, choose = false): Promise<void> {
	try {
		await createIn(host, folder, choose);
	} catch (error) {
		new Notice(errorMessage(error));
	}
}

/** Entry point from the template picker: asks which of the active folder's ancestors gets the template. */
export async function runNewTemplateFromPicker(host: Host, folder: string, choose = false): Promise<void> {
	const choices = folderAndAncestors(folder).filter(
		(candidate) => !splitPath(candidate).includes(host.settings.folderName),
	);
	const chosen =
		choices.length <= 1
			? (choices[0] ?? "")
			: await pickFrom(host.app, choices, usedInLabel, {
				placeholder: USED_WHERE_CAPTION,
				aux: (candidate) => (candidate === "" ? undefined : USED_INSIDE_LABEL),
			});
	if (chosen === null) return;
	await runNewTemplate(host, chosen, choose);
}
