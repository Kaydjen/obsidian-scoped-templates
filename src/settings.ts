import { App, PluginSettingTab, Setting } from "obsidian";
import type ScopedTemplatesPlugin from "./main";

export class ScopedTemplatesSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ScopedTemplatesPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const { settings } = this.plugin;

		new Setting(containerEl).setName("Template folder name").addText((text) =>
			text.setValue(settings.folderName).onChange(async (value) => {
				const name = value.trim();
				if (name === "" || name.includes("/") || name.includes("\\")) return;
				settings.folderName = name;
				await this.plugin.saveSettings();
				this.plugin.scheduleCommandRefresh();
			}),
		);

		new Setting(containerEl).setName("Date format").addText((text) =>
			text.setValue(settings.dateFormat).onChange(async (value) => {
				settings.dateFormat = value;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl).setName("Time format").addText((text) =>
			text.setValue(settings.timeFormat).onChange(async (value) => {
				settings.timeFormat = value;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl).setName("Inherit from neighbor files").addToggle((toggle) =>
			toggle.setValue(settings.inheritFromNeighbors).onChange(async (value) => {
				settings.inheritFromNeighbors = value;
				await this.plugin.saveSettings();
			}),
		);
	}
}
