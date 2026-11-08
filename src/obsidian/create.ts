import { MarkdownView, Notice, TFile, normalizePath, stringifyYaml } from "obsidian";
import { DEFAULT_FILENAME, DEFAULT_NAME_DATE_FORMAT } from "../constants";
import { dashWords, sanitizeAlias,sanitizeName, uniqueName } from "../core/filename";
import { buildFrontmatter, serializeFrontmatter } from "../core/frontmatter";
import { joinPath, resolveFolder } from "../core/paths";
import { extractCursor, splitAlternatives, substitute, substituteChain } from "../core/substitute";
import { chooseTemplate } from "./choose";
import {
	currentTime,
	errorMessage,
	frontmatterOf,
	getActiveContext,
	makeFromResolver,
	makeSubstituteDeps,
	withLabel,
	type ActiveContext,
	type Host,
	type PickedTemplate,
} from "./host";
import { ensureFolder } from "./folders";

/** `insertLink: false` creates the note without a link at the cursor, whatever the template says. */
export async function runCreate(host: Host, command?: string, insertLink = true): Promise<void> {
	try {
		await create(host, command, insertLink);
	} catch (error) {
		new Notice(errorMessage(error));
	}
}

async function create(host: Host, command: string | undefined, insertLink: boolean): Promise<void> {
	const context = getActiveContext(host.app);
	const picked = await chooseTemplate(host, context.folder, command);
	if (!picked) return;
	await withLabel(picked.entry.scope.label, () => createNote(host, context, picked, insertLink));
}

async function createNote(
	host: Host,
	context: ActiveContext,
	picked: PickedTemplate,
	insertLink: boolean,
): Promise<void> {
	const { app, settings } = host;
	const { entry, captures } = picked;
	const { config } = entry.parsed;
	const now = currentTime();
	const resolveSourceValue = makeFromResolver(host, {
		source: context.file,
		sourceFrontmatter: context.file ? frontmatterOf(app, context.file) : undefined,
		folder: context.folder,
		root: entry.scope.root,
	});
	const common = {
		now,
		captures,
		selection: context.selection,
		from: resolveSourceValue,
		template: entry.file.basename,
		here: `/${context.folder}`,
	};

	// Stage 1: folder and file name. The title is not known yet.
	const early = makeSubstituteDeps(host, { ...common, source: "" });
	let into = config.into === undefined ? undefined : substituteChain(config.into, early);
	// Alternatives that are all empty leave the folder unset, like an empty tpl-into.
	if (config.into !== undefined && into?.trim() === "" && splitAlternatives(config.into).length > 1) into = undefined;
	const folderPath = resolveFolder(into, entry.scope.root, context.folder, settings.folderName);

	const defaultName = `${entry.file.basename}-${now.format(DEFAULT_NAME_DATE_FORMAT)}`;
	const nameDeps = settings.dashSelectionInName
		? makeSubstituteDeps(host, { ...common, selection: dashWords(context.selection), source: "" })
		: early;
	const rawName = substituteChain(config.filename ?? DEFAULT_FILENAME, nameDeps);
	if (rawName.includes("{{")) throw new Error(`Unresolved variable in file name: ${rawName}`);
	let name = sanitizeName(rawName);
	if (name === "") name = sanitizeName(defaultName);

	const folder = await ensureFolder(host, folderPath);
	const existingNames = folder.children.map((child) => child.name);
	const finalName = uniqueName(name, "md", existingNames);
	const path = normalizePath(joinPath(folderPath, `${finalName}.md`));

	// Stage 2: content.
	const frontmatterSource = context.file
		? `[[${app.metadataCache.fileToLinktext(context.file, path, true)}]]`
		: "";
	const bodySource = context.file ? app.fileManager.generateMarkdownLink(context.file, path) : "";
	const inFrontmatter = makeSubstituteDeps(host, { ...common, title: finalName, source: frontmatterSource });
	const inBody = makeSubstituteDeps(host, { ...common, title: finalName, source: bodySource });

	const frontmatter = buildFrontmatter(entry.parsed.frontmatter, {
		text: (value) => substitute(value, inFrontmatter),
		from: resolveSourceValue,
	});
	const block = serializeFrontmatter(frontmatter, stringifyYaml);
	const { text: body, offset } = extractCursor(substitute(entry.parsed.body, inBody));

	const file = await app.vault.create(path, block + body);

	// The note exists from here on; any failure below keeps it.
	await host.recordUse(entry.scope.path);

	const linked = insertLink && config.link && context.editor !== null && context.file !== null;
	if (linked && context.editor && context.file) {
		const alias = sanitizeAlias(context.selection);
		const link = app.fileManager.generateMarkdownLink(
			file,
			context.file.path,
			undefined,
			alias !== "" && alias !== finalName ? alias : undefined,
		);
		context.editor.replaceSelection(link);
	}

	if (config.open || !context.editor) {
		await openFile(host, file, offset === null ? null : block.length + offset);
	} else if (!linked) {
		// Nothing else shows that the note exists.
		new Notice(`Created ${finalName}`);
	}
}

async function openFile(host: Host, file: TFile, cursor: number | null): Promise<void> {
	const leaf = host.app.workspace.getLeaf("tab");
	await leaf.openFile(file);
	if (cursor !== null && leaf.view instanceof MarkdownView) {
		leaf.view.editor.setCursor(leaf.view.editor.offsetToPos(cursor));
	}
}
