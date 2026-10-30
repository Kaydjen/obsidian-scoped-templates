import { Modal, Setting, type App } from "obsidian";
import { GROUP_LABELS, NEW_TEMPLATE_LABEL } from "../constants";
import { keyDefinition } from "../core/catalog";

const ACTIVE_CLASS = "is-active";
const HIDDEN_ROW_CLASS = "scoped-templates-hidden-row";
const ALL_LABEL = "All";

export interface SkeletonChoice {
	/** Template keys to write, in file order. */
	keys: string[];
	/** Note properties to write. */
	properties: string[];
	/** Note properties the user keeps out of the list. */
	hidden: string[];
}

export interface SkeletonOptions {
	keys: readonly string[];
	/** Keys that start checked. */
	checkedKeys: readonly string[];
	/** Properties of the notes in the template's scope. */
	properties: string[];
	/** Properties used elsewhere in the vault, listed only on request. */
	otherProperties: string[];
	/** Properties that start checked. */
	checkedProperties: readonly string[];
	/** Properties the user hid earlier. */
	hiddenProperties: readonly string[];
}

class SkeletonDialog extends Modal {
	private done = false;
	private showAll = false;
	private showHidden = false;
	private readonly keys: Set<string>;
	private readonly properties: Set<string>;
	private readonly hidden: Set<string>;

	constructor(
		app: App,
		private readonly options: SkeletonOptions,
		private readonly finish: (choice: SkeletonChoice | null) => void,
	) {
		super(app);
		this.keys = new Set(options.checkedKeys);
		this.properties = new Set(options.checkedProperties);
		this.hidden = new Set(options.hiddenProperties);
	}

	onOpen(): void {
		this.titleEl.setText(NEW_TEMPLATE_LABEL);
		this.render();
	}

	private listedProperties(): string[] {
		const { properties, otherProperties } = this.options;
		return this.showAll ? [...properties, ...otherProperties] : properties;
	}

	private render(): void {
		const { contentEl, options } = this;
		const scrollTop = contentEl.scrollTop;
		contentEl.empty();

		new Setting(contentEl).setName(GROUP_LABELS.keys).setHeading();
		for (const name of options.keys) {
			const setting = new Setting(contentEl).setName(name);
			const text = keyDefinition(name);
			if (text !== null) setting.setDesc(text);
			setting.addToggle((toggle) => this.bind(toggle, this.keys, name));
		}

		const everything = [...options.properties, ...options.otherProperties];
		const hiddenCount = everything.filter((name) => this.hidden.has(name)).length;
		if (everything.length > 0) {
			const heading = new Setting(contentEl).setName(GROUP_LABELS.notes).setHeading();
			if (options.otherProperties.length > 0) {
				heading.addButton((button) => {
					button
						.setButtonText(ALL_LABEL)
						.onClick(() => {
							this.showAll = !this.showAll;
							this.render();
						});
					button.buttonEl.toggleClass(ACTIVE_CLASS, this.showAll);
				});
			}
			if (hiddenCount > 0) {
				heading.addExtraButton((button) =>
					button
						.setIcon(this.showHidden ? "eye" : "eye-off")
						.setTooltip(String(hiddenCount))
						.onClick(() => {
							this.showHidden = !this.showHidden;
							this.render();
						}),
				);
			}
			for (const name of this.listedProperties()) {
				const isHidden = this.hidden.has(name);
				if (isHidden && !this.showHidden) continue;
				const setting = new Setting(contentEl).setName(name);
				setting.settingEl.toggleClass(HIDDEN_ROW_CLASS, isHidden);
				setting.addExtraButton((button) =>
					button.setIcon(isHidden ? "eye" : "eye-off").onClick(() => {
						if (isHidden) this.hidden.delete(name);
						else this.hidden.add(name);
						// Leaving the last hidden row in view would leave an empty "show hidden" state behind.
						if (this.hidden.size === 0) this.showHidden = false;
						this.render();
					}),
				);
				setting.addToggle((toggle) => this.bind(toggle, this.properties, name));
			}
		}

		new Setting(contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText("Create template")
					.setCta()
					.onClick(() => {
						this.done = true;
						this.finish({
							keys: options.keys.filter((key) => this.keys.has(key)),
							properties: [...options.properties, ...options.otherProperties].filter(
								(name) => this.properties.has(name) && !this.hidden.has(name),
							),
							hidden: [...this.hidden],
						});
						this.close();
					}),
			);

		contentEl.scrollTop = scrollTop;
	}

	private bind(
		toggle: { setValue(value: boolean): unknown; onChange(callback: (value: boolean) => void): unknown },
		chosen: Set<string>,
		name: string,
	): void {
		toggle.setValue(chosen.has(name));
		toggle.onChange((value) => {
			if (value) chosen.add(name);
			else chosen.delete(name);
		});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.done) this.finish(null);
	}
}

/** Asks which keys and properties a new template starts with; null when cancelled. */
export function chooseSkeleton(app: App, options: SkeletonOptions): Promise<SkeletonChoice | null> {
	return new Promise((resolve) => new SkeletonDialog(app, options, resolve).open());
}
