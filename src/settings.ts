import { App, PluginSettingTab, Setting, type TextComponent } from "obsidian";
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

		// An invalid entry is not saved; the field goes back to the saved value when it loses focus.
		const revertOnBlur = (text: TextComponent, saved: () => string, isValid: (value: string) => boolean) =>
			text.inputEl.addEventListener("blur", () => {
				if (!isValid(text.getValue())) text.setValue(saved());
			});
		const isFolderName = (value: string) => {
			const name = value.trim();
			return name !== "" && !name.includes("/") && !name.includes("\\");
		};
		const isFormat = (value: string) => value !== "";

		new Setting(containerEl).setName("Template folder name").addText((text) => {
			text.setValue(settings.folderName).onChange(async (value) => {
				if (!isFolderName(value)) return;
				settings.folderName = value.trim();
				await this.plugin.saveSettings();
				this.plugin.scheduleCommandRefresh();
			});
			revertOnBlur(text, () => settings.folderName, isFolderName);
		});

		new Setting(containerEl).setName("Date format").addText((text) => {
			text.setValue(settings.dateFormat).onChange(async (value) => {
				if (!isFormat(value)) return;
				settings.dateFormat = value;
				await this.plugin.saveSettings();
			});
			revertOnBlur(text, () => settings.dateFormat, isFormat);
		});

		new Setting(containerEl).setName("Time format").addText((text) => {
			text.setValue(settings.timeFormat).onChange(async (value) => {
				if (!isFormat(value)) return;
				settings.timeFormat = value;
				await this.plugin.saveSettings();
			});
			revertOnBlur(text, () => settings.timeFormat, isFormat);
		});

		new Setting(containerEl).setName("Copy missing values from nearby notes").addToggle((toggle) =>
			toggle.setValue(settings.inheritFromNeighbors).onChange(async (value) => {
				settings.inheritFromNeighbors = value;
				await this.plugin.saveSettings();
			}),
		);
	}
}
