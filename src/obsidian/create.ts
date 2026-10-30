import { MarkdownView, Notice, TFile, normalizePath, stringifyYaml } from "obsidian";
import { DEFAULT_NAME_DATE_FORMAT } from "../constants";
import { sanitizeAlias, sanitizeName, uniqueName } from "../core/filename";
import { buildFrontmatter, serializeFrontmatter } from "../core/frontmatter";
import { joinPath, resolveFolder } from "../core/paths";
import { extractCursor, substitute } from "../core/substitute";
import {
	chooseTemplate,
	currentTime,
	errorMessage,
	frontmatterOf,
	getActiveContext,
	makeFromResolver,
	makeSubstituteDeps,
	type Host,
} from "./host";
import { ensureFolder } from "./folders";

export async function runCreate(host: Host, command?: string): Promise<void> {
	try {
		await create(host, command);
	} catch (error) {
		new Notice(errorMessage(error));
	}
}

async function create(host: Host, command?: string): Promise<void> {
	const { app, settings } = host;
	const context = getActiveContext(app);
	const picked = await chooseTemplate(host, context.folder, command);
	if (!picked) return;

	const { entry, captures } = picked;
	const { config } = entry.parsed;
	const now = currentTime();
	const resolveSourceValue = makeFromResolver(host, {
		source: context.file,
		sourceFrontmatter: context.file ? frontmatterOf(app, context.file) : undefined,
		folder: context.folder,
		root: entry.scope.root,
	});
	const common = { now, captures, selection: context.selection, from: resolveSourceValue };

	// Stage 1: folder and file name. The title is not known yet.
	const early = makeSubstituteDeps(host, { ...common, source: "" });
	const into = config.into === undefined ? undefined : substitute(config.into, early);
	const folderPath = resolveFolder(into, entry.scope.root, context.folder, settings.folderName);

	const defaultName = `${entry.file.basename}-${now.format(DEFAULT_NAME_DATE_FORMAT)}`;
	let rawName = config.filename !== undefined ? substitute(config.filename, early) : context.selection || defaultName;
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

	if (context.editor && context.file) {
		const alias = sanitizeAlias(context.selection);
		const link = app.fileManager.generateMarkdownLink(
			file,
			context.file.path,
			undefined,
			alias !== "" && alias !== finalName ? alias : undefined,
		);
		context.editor.replaceSelection(link);
	}

	if (config.open || !context.editor) await openFile(host, file, offset === null ? null : block.length + offset);
}

async function openFile(host: Host, file: TFile, cursor: number | null): Promise<void> {
	const leaf = host.app.workspace.getLeaf("tab");
	await leaf.openFile(file);
	if (cursor !== null && leaf.view instanceof MarkdownView) {
		leaf.view.editor.setCursor(leaf.view.editor.offsetToPos(cursor));
	}
}
