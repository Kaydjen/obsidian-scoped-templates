import { TFile, TFolder } from "obsidian";
import { CONFIG_PREFIX, KEYS } from "../constants";
import type { CatalogContext, FieldKind } from "../core/catalog";
import { isInside, joinPath, parentPath, splitPath } from "../core/paths";
import { parsePattern, type Pattern } from "../core/pattern";
import { evaluate } from "../core/scope";
import { commonKeys } from "../core/skeleton";
import { currentTime, folderPathOf, type Host } from "./host";
import { notePropertyKeys } from "./new-template";

const PROPERTY_KEY_LIMIT = 200;

/** Reads patterns from half-edited frontmatter: invalid entries are skipped, not reported. */
function lenientPatterns(value: unknown): Pattern[] {
	const items = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
	const result: Pattern[] = [];
	for (const item of items) {
		if (typeof item !== "string") continue;
		try {
			result.push(parsePattern(item));
		} catch {
			// Still being typed.
		}
	}
	return result;
}

interface ExampleFolder {
	captures: Record<string, string>;
	/** The folder the captures came from. */
	folder?: string;
}

/** Capture values of the first real folder in scope that the template's `tpl-where` matches. */
function exampleCaptures(host: Host, root: string, where: Pattern[], except: Pattern[]): ExampleFolder {
	if (where.length === 0) return { captures: {} };
	const probe = { path: "", basename: "", label: "", root, where, except };
	const folders = host.app.vault
		.getAllLoadedFiles()
		.filter((entry): entry is TFolder => entry instanceof TFolder && !entry.isRoot())
		.map((folder) => folder.path)
		.filter((path) => isInside(path, root))
		.sort((a, b) => a.localeCompare(b));
	for (const path of folders) {
		const visible = evaluate(probe, path, host.settings.folderName);
		if (visible && Object.keys(visible.captures).length > 0) return { captures: visible.captures, folder: path };
	}
	return { captures: {} };
}

/** First plain value of every property in the notes of the scope; read once, on first use. */
function propertyExamples(host: Host, root: string): (key: string) => string | undefined {
	let values: Map<string, string> | undefined;
	return (key) => {
		if (values === undefined) {
			values = new Map();
			const { vault, metadataCache } = host.app;
			for (const file of vault.getMarkdownFiles()) {
				if (splitPath(file.path).includes(host.settings.folderName) || !isInside(parentPath(file.path), root)) continue;
				const frontmatter = metadataCache.getFileCache(file)?.frontmatter;
				for (const [name, value] of Object.entries(frontmatter ?? {})) {
					const plain = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
					if (plain !== "" && !values.has(name)) values.set(name, plain);
				}
			}
		}
		return values.get(key);
	};
}

/** Everything the suggestion catalog needs to know about the vault around one template file. */
export function buildContext(host: Host, file: TFile): CatalogContext {
	const { app, settings } = host;
	const root = folderPathOf(file.parent?.parent ?? null);
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	const rawLabel: unknown = frontmatter[KEYS.label];
	const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
	const where = lenientPatterns(frontmatter[KEYS.where]);
	const except = lenientPatterns(frontmatter[KEYS.except]);
	const now = currentTime();

	const captures = new Set<string>();
	for (const pattern of where) {
		for (const segment of pattern.segments) {
			if (segment.kind === "capture") captures.add(segment.name);
		}
	}

	const example = exampleCaptures(host, root, where, except);

	return {
		root,
		templateName: file.basename,
		templateLabel: label === "" ? file.basename : label,
		captures: [...captures],
		captureExamples: example.captures,
		...(example.folder === undefined ? {} : { sampleFolder: example.folder }),
		propertyExample: propertyExamples(host, root),
		propertyKeys: commonKeys(notePropertyKeys(host, root), 0, CONFIG_PREFIX, PROPERTY_KEY_LIMIT),
		subfolders: (path) => {
			const target = path === "" ? app.vault.getRoot() : app.vault.getAbstractFileByPath(joinPath(path));
			if (!(target instanceof TFolder)) return [];
			return target.children
				.filter((child): child is TFolder => child instanceof TFolder)
				.map((child) => child.name)
				.filter((name) => name !== settings.folderName && !name.startsWith("."))
				.sort((a, b) => a.localeCompare(b));
		},
		format: (kind, format) => now.format(format ?? (kind === "date" ? settings.dateFormat : settings.timeFormat)),
	};
}

/** Which suggestions a frontmatter key gets; null for keys without free text. */
export function kindForKey(key: string): FieldKind | null {
	switch (key) {
		case KEYS.where:
			return "where";
		case KEYS.except:
			return "except";
		case KEYS.into:
			return "into";
		case KEYS.filename:
			return "filename";
		case KEYS.label:
		case KEYS.command:
		case KEYS.open:
		case KEYS.link:
			return null;
		default:
			return "value";
	}
}
