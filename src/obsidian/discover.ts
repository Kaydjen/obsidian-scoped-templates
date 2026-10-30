import { App, TFile, parseYaml } from "obsidian";
import { parseTemplate, type ParsedTemplate } from "../core/template";
import type { ScopeTemplate } from "../core/scope";
import { folderPathOf } from "./host";

export interface TemplateEntry {
	file: TFile;
	scope: ScopeTemplate;
	parsed: ParsedTemplate;
}

export interface InvalidEntry {
	path: string;
	error: string;
}

interface CacheItem {
	mtime: number;
	result: { entry: TemplateEntry } | { error: string };
}

export class TemplateIndex {
	private readonly cache = new Map<string, CacheItem>();
	private readonly warned = new Set<string>();

	constructor(
		private readonly app: App,
		private readonly folderName: () => string,
	) {}

	templateFiles(): TFile[] {
		const name = this.folderName();
		return this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.parent !== null && file.parent.name === name)
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	async load(): Promise<{ valid: TemplateEntry[]; invalid: InvalidEntry[] }> {
		const valid: TemplateEntry[] = [];
		const invalid: InvalidEntry[] = [];
		const seen = new Set<string>();
		for (const file of this.templateFiles()) {
			seen.add(file.path);
			const item = await this.read(file);
			if ("entry" in item.result) valid.push(item.result.entry);
			else invalid.push({ path: file.path, error: item.result.error });
		}
		for (const path of this.cache.keys()) {
			if (!seen.has(path)) this.cache.delete(path);
		}
		return { valid, invalid };
	}

	private async read(file: TFile): Promise<CacheItem> {
		const cached = this.cache.get(file.path);
		if (cached && cached.mtime === file.stat.mtime) return cached;

		let result: CacheItem["result"];
		try {
			const parsed = parseTemplate(await this.app.vault.cachedRead(file), parseYaml);
			const scope: ScopeTemplate = {
				path: file.path,
				basename: file.basename,
				label: parsed.config.label ?? file.basename,
				root: folderPathOf(file.parent?.parent ?? null),
				where: parsed.config.where,
				except: parsed.config.except,
			};
			if (parsed.config.command !== undefined) scope.command = parsed.config.command;
			result = { entry: { file, scope, parsed } };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			result = { error: message };
			const key = `${file.path}@${file.stat.mtime}`;
			if (!this.warned.has(key)) {
				this.warned.add(key);
				console.warn(`[scoped-templates] ${file.path}: ${message}`);
			}
		}
		const item = { mtime: file.stat.mtime, result };
		this.cache.set(file.path, item);
		return item;
	}
}
