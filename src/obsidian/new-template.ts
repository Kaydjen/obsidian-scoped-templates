import { Notice, TFile } from "obsidian";
import {
	AVAILABLE_EVERYWHERE_LABEL,
	AVAILABLE_IN_PREFIX,
	COPY_BASE_PREFIX,
	CONFIG_PREFIX,
	EMPTY_BASE_LABEL,
	KNOWN_KEYS,
	NEW_TEMPLATE_BASENAME,
	SKELETON_DIALOG_PROPERTY_LIMIT,
	SKELETON_KEY_THRESHOLD,
} from "../constants";
import { uniqueName } from "../core/filename";
import { folderAndAncestors, isInside, joinPath, parentPath, splitPath, templateFolderFor } from "../core/paths";
import { buildSkeleton, commonKeys } from "../core/skeleton";
import type { TemplateEntry } from "./discover";
import { ensureFolder } from "./folders";
import { errorMessage, type Host } from "./host";
import { pickFrom } from "./picker";
import { chooseSkeleton } from "./skeleton-dialog";

type Base = TemplateEntry | "empty";

const availabilityLabel = (folder: string) =>
	folder === "" ? AVAILABLE_EVERYWHERE_LABEL : `${AVAILABLE_IN_PREFIX}${folder}`;

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

async function chooseBase(host: Host, scope: string): Promise<Base | null> {
	const templates = await copyableTemplates(host, scope);
	if (templates.length === 0) return "empty";
	return pickFrom<Base>(
		host.app,
		["empty", ...templates],
		(item) =>
			item === "empty"
				? EMPTY_BASE_LABEL
				: item.scope.root === ""
					? `${COPY_BASE_PREFIX}"${item.scope.label}"`
					: `${COPY_BASE_PREFIX}"${item.scope.label}"  ·  ${item.scope.root}`,
		undefined,
		// The copies are a block of their own, apart from the empty template.
		templates[0],
	);
}

async function createIn(host: Host, picked: string, choose: boolean): Promise<void> {
	const { app, settings } = host;
	const target = templateFolderFor(picked, settings.folderName);
	if (target === null) return;
	const scope = parentPath(target);

	const base = await chooseBase(host, scope);
	if (base === null) return;
	let content: string;
	if (base !== "empty") {
		content = await app.vault.read(base.file);
	} else {
		const notes = notePropertyKeys(host, scope);
		const usual = commonKeys(notes, SKELETON_KEY_THRESHOLD, CONFIG_PREFIX);
		let keys: readonly string[] = KNOWN_KEYS;
		let properties = usual;
		if (choose) {
			const choice = await chooseSkeleton(app, {
				keys: KNOWN_KEYS,
				checkedKeys: settings.templateKeys,
				properties: commonKeys(notes, 0, CONFIG_PREFIX, SKELETON_DIALOG_PROPERTY_LIMIT),
				checkedProperties: usual,
			});
			if (choice === null) return;
			keys = choice.keys;
			properties = choice.properties;
			settings.templateKeys = choice.keys;
			await host.saveSettings();
		}
		content = buildSkeleton(properties, await readPropertyTypes(host), keys);
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
export async function runNewTemplateFromPicker(host: Host, folder: string): Promise<void> {
	const choices = folderAndAncestors(folder).filter(
		(candidate) => !splitPath(candidate).includes(host.settings.folderName),
	);
	const chosen =
		choices.length <= 1
			? (choices[0] ?? "")
			: await pickFrom(host.app, choices, availabilityLabel);
	if (chosen === null) return;
	await runNewTemplate(host, chosen);
}
