import { Plugin, TFolder, debounce, type TAbstractFile } from "obsidian";
import { COMMANDS, DEFAULT_SETTINGS, NEW_TEMPLATE_CHOOSE_LABEL, NEW_TEMPLATE_LABEL, type PluginSettings } from "./constants";
import { splitPath, templateFolderFor } from "./core/paths";
import { runApply } from "./obsidian/apply";
import { runCreate } from "./obsidian/create";
import { TemplateIndex } from "./obsidian/discover";
import { registerEditorCompletion } from "./obsidian/editor-completion";
import { folderPathOf, type Host } from "./obsidian/host";
import { runNewTemplate } from "./obsidian/new-template";
import { runShowScope } from "./obsidian/show-scope";
import { registerTemplateView } from "./obsidian/template-view";
import { ScopedTemplatesSettingTab } from "./settings";

export default class ScopedTemplatesPlugin extends Plugin implements Host {
	settings: PluginSettings = { ...DEFAULT_SETTINGS, templateKeys: [...DEFAULT_SETTINGS.templateKeys], mru: {} };
	index!: TemplateIndex;

	/** Registered per-template commands: local command id -> display name. */
	private readonly dynamicCommands = new Map<string, string>();
	private readonly refreshCommands = debounce(() => void this.syncCommands(), 500, true);
	private unloaded = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.index = new TemplateIndex(this.app, () => this.settings.folderName);

		this.addCommand({ id: COMMANDS.create.id, name: COMMANDS.create.name, callback: () => void runCreate(this) });
		this.addCommand({ id: COMMANDS.apply.id, name: COMMANDS.apply.name, callback: () => void runApply(this) });
		this.addCommand({
			id: COMMANDS.showScope.id,
			name: COMMANDS.showScope.name,
			callback: () => void runShowScope(this),
		});
		this.addSettingTab(new ScopedTemplatesSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFolder)) return;
				const folder = folderPathOf(file);
				if (templateFolderFor(folder, this.settings.folderName) === null) return;
				menu.addItem((item) =>
					item
						.setTitle(NEW_TEMPLATE_LABEL)
						.setIcon("file-plus")
						.onClick(() => void runNewTemplate(this, folder)),
				);
				menu.addItem((item) =>
					item
						.setTitle(NEW_TEMPLATE_CHOOSE_LABEL)
						.setIcon("file-cog")
						.onClick(() => void runNewTemplate(this, folder, true)),
				);
			}),
		);
		registerTemplateView(this);
		registerEditorCompletion(this);

		this.app.workspace.onLayoutReady(() => {
			void this.syncCommands();
			const changed = (file: TAbstractFile, oldPath?: string) => {
				if (this.inTemplateFolder(file.path) || (oldPath !== undefined && this.inTemplateFolder(oldPath))) {
					this.refreshCommands();
				}
			};
			this.registerEvent(this.app.vault.on("create", (file) => changed(file)));
			this.registerEvent(this.app.vault.on("delete", (file) => changed(file)));
			this.registerEvent(this.app.vault.on("modify", (file) => changed(file)));
			this.registerEvent(this.app.vault.on("rename", (file, oldPath) => changed(file, oldPath)));
		});
	}

	onunload(): void {
		this.unloaded = true;
		this.refreshCommands.cancel();
	}

	scheduleCommandRefresh(): void {
		this.refreshCommands();
	}

	async loadSettings(): Promise<void> {
		const saved = ((await this.loadData()) ?? {}) as Partial<PluginSettings>;
		this.settings = {
			...DEFAULT_SETTINGS,
			...saved,
			templateKeys: [...(saved.templateKeys ?? DEFAULT_SETTINGS.templateKeys)],
			mru: { ...(saved.mru ?? {}) },
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async recordUse(templatePath: string): Promise<void> {
		this.settings.mru[templatePath] = Date.now();
		await this.saveSettings();
	}

	private inTemplateFolder(path: string): boolean {
		return splitPath(path).includes(this.settings.folderName);
	}

	/** One create-* and one apply-* command per distinct `tpl-command` id, so each can get a hotkey. */
	private async syncCommands(): Promise<void> {
		const { valid } = await this.index.load();
		if (this.unloaded) return;
		const wanted = new Map<string, string>();
		for (const entry of valid) {
			const id = entry.scope.command;
			if (id !== undefined && !wanted.has(id)) {
				wanted.set(id, entry.scope.label);
			}
		}

		const desired = new Map<string, { name: string; run: () => void }>();
		for (const [id, label] of wanted) {
			desired.set(`${COMMANDS.createPrefix}${id}`, {
				name: `${COMMANDS.createLabel}${label}`,
				run: () => void runCreate(this, id),
			});
			desired.set(`${COMMANDS.applyPrefix}${id}`, {
				name: `${COMMANDS.applyLabel}${label}`,
				run: () => void runApply(this, id),
			});
		}

		for (const [localId, name] of [...this.dynamicCommands]) {
			if (desired.get(localId)?.name === name) continue;
			// removeCommand exists since Obsidian 1.7.2; older versions keep the stale command.
			this.removeCommand?.(localId);
			this.dynamicCommands.delete(localId);
		}
		for (const [localId, { name, run }] of desired) {
			if (this.dynamicCommands.has(localId)) continue;
			this.addCommand({ id: localId, name, callback: run });
			this.dynamicCommands.set(localId, name);
		}
	}
}
