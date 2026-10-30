import { App, Editor, MarkdownView, Notice, TFile, TFolder, moment } from "obsidian";
import type { PluginSettings } from "../constants";
import { isEmpty, type Frontmatter } from "../core/frontmatter";
import { resolveFrom } from "../core/inherit";
import { findByCommand, visibleTemplates, type VisibleTemplate } from "../core/scope";
import type { SubstituteDeps } from "../core/substitute";
import type { TemplateEntry, TemplateIndex } from "./discover";
import { NEW_TEMPLATE, pickTemplate } from "./picker";
import { runNewTemplateFromPicker } from "./new-template";

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

/** Resolves the template to use, or null after telling the user why there is none. */
export async function chooseTemplate(host: Host, folder: string, command?: string): Promise<PickedTemplate | null> {
	const { valid } = await host.index.load();
	const visible = visibleTemplates(
		valid.map((entry) => entry.scope),
		folder,
		host.settings.folderName,
		host.settings.mru,
	);
	const byPath = new Map(valid.map((entry) => [entry.scope.path, entry]));
	const toPicked = (item: VisibleTemplate): PickedTemplate | null => {
		const entry = byPath.get(item.template.path);
		return entry ? { entry, captures: item.captures } : null;
	};

	if (command !== undefined) {
		const found = findByCommand(visible, command);
		if (found) return toPicked(found);
		const known = valid.find((entry) => entry.scope.command === command);
		new Notice(`${known?.scope.label ?? command} is not available here`);
		return null;
	}
	const chosen = await pickTemplate(host.app, visible);
	if (chosen === NEW_TEMPLATE) {
		await runNewTemplateFromPicker(host, folder);
		return null;
	}
	return chosen ? toPicked(chosen) : null;
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
