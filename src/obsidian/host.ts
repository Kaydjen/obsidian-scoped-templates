import { App, Editor, MarkdownView, TFile, TFolder, moment } from "obsidian";
import type { PluginSettings } from "../constants";
import { isEmpty, type Frontmatter } from "../core/frontmatter";
import { resolveFrom } from "../core/inherit";
import type { SubstituteDeps } from "../core/substitute";
import type { TemplateEntry, TemplateIndex } from "./discover";

/** What the command flows need from the plugin. */
export interface Host {
	app: App;
	settings: PluginSettings;
	index: TemplateIndex;
	recordUse(templatePath: string): Promise<void>;
	saveSettings(): Promise<void>;
}

export interface ActiveContext {
	file: TFile | null;
	/** Only set in source / live preview mode. */
	editor: Editor | null;
	selection: string;
	/** Folder of the active file; vault root when there is none. */
	folder: string;
}

export interface PickedTemplate {
	entry: TemplateEntry;
	captures: Record<string, string>;
}

/** The only part of moment this plugin needs. */
export interface Clock {
	format(format?: string): string;
}

/** One instant per invocation, so every `{{date}}` in a note shows the same time. */
export function currentTime(): Clock {
	return (moment as unknown as () => Clock)();
}

export function folderPathOf(folder: TFolder | null): string {
	return folder === null || folder.isRoot() ? "" : folder.path;
}

export function getActiveContext(app: App): ActiveContext {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	const file = view?.file ?? app.workspace.getActiveFile();
	const editor = view !== null && view.getMode() === "source" ? view.editor : null;
	return {
		file,
		editor,
		selection: editor?.getSelection() ?? "",
		folder: file ? folderPathOf(file.parent) : "",
	};
}

export function frontmatterOf(app: App, file: TFile): Frontmatter | undefined {
	const cached = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!cached) return undefined;
	const { position: _position, ...rest } = cached as Frontmatter;
	return rest;
}

function listFolderValues(app: App, folder: string, key: string, excludePath: string | undefined): unknown[] {
	const target = folder === "" ? app.vault.getRoot() : app.vault.getAbstractFileByPath(folder);
	if (!(target instanceof TFolder)) return [];
	const values: unknown[] = [];
	for (const child of target.children) {
		if (!(child instanceof TFile) || child.extension !== "md" || child.path === excludePath) continue;
		const value = app.metadataCache.getFileCache(child)?.frontmatter?.[key];
		if (!isEmpty(value)) values.push(value);
	}
	return values;
}

/** `{{from:key}}` resolver; answers are cached for the duration of one invocation. */
export function makeFromResolver(
	host: Host,
	options: { source: TFile | null; sourceFrontmatter: Frontmatter | undefined; folder: string; root: string },
): (key: string) => unknown {
	const cache = new Map<string, unknown>();
	return (key) => {
		if (!cache.has(key)) {
			cache.set(
				key,
				resolveFrom({
					key,
					sourceValue: options.sourceFrontmatter?.[key],
					folder: options.folder,
					root: options.root,
					enabled: host.settings.inheritFromNeighbors,
					listFolderValues: (folder, k) => listFolderValues(host.app, folder, k, options.source?.path),
				}),
			);
		}
		return cache.get(key);
	};
}

export function makeSubstituteDeps(
	host: Host,
	args: Omit<SubstituteDeps, "formatDate"> & { now: Clock },
): SubstituteDeps {
	const { now, ...rest } = args;
	return {
		...rest,
		formatDate: (kind, format) =>
			now.format(format ?? (kind === "date" ? host.settings.dateFormat : host.settings.timeFormat)),
	};
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Starts the message with the template name, so a failure says which template caused it. */
export async function withLabel<T>(label: string, run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		throw new Error(`"${label}": ${errorMessage(error)}`);
	}
}
