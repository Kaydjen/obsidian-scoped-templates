import { Modal, Setting, type App } from "obsidian";
import { FROM_SOURCE_LABEL, GROUP_LABELS, NEW_TEMPLATE_LABEL, NO_SOURCE_LABEL } from "../constants";
import { keyDefinition } from "../core/catalog";
import { pickFrom } from "./picker";

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
	/** Index in `SkeletonOptions.sources` of the source the user took properties from; null: none. */
	source: number | null;
}

/** Something the note properties can be taken from: a template, or the most common properties of notes. */
export interface SkeletonSource {
	label: string;
	/** Muted second part of the row. */
	aux?: string;
	properties: string[];
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
	/** Sources of note properties, closest first; none: no button. */
	sources?: SkeletonSource[];
}

class SkeletonDialog extends Modal {
	private done = false;
	// Open from the start: properties of this scope come first, the rest of the vault follows.
	private showAll = true;
	private showHidden = false;
	private chosen: number | null = null;
	/** Properties the chosen source checked, so changing the source can uncheck exactly those. */
	private addedBySource: string[] = [];
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

	private taken(): string[] {
		const { sources } = this.options;
		return this.chosen === null || !sources ? [] : (sources[this.chosen]?.properties ?? []);
	}

	/** Properties of the chosen source first, so what was taken over is easy to see. */
	private withSource(names: string[]): string[] {
		const taken = this.taken();
		return [...taken, ...names.filter((name) => !taken.includes(name))];
	}

	private listedProperties(): string[] {
		const { properties, otherProperties } = this.options;
		return this.withSource(this.showAll ? [...properties, ...otherProperties] : properties);
	}

	private async chooseSource(): Promise<void> {
		const sources = this.options.sources ?? [];
		const items: (number | "none")[] = sources.map((_, index) => index);
		if (this.chosen !== null) items.unshift("none");
		const picked = await pickFrom(
			this.app,
			items,
			(item) => (item === "none" ? NO_SOURCE_LABEL : (sources[item]?.label ?? "")),
			{ aux: (item) => (item === "none" ? undefined : sources[item]?.aux) },
		);
		if (picked === null) return;
		for (const name of this.addedBySource) this.properties.delete(name);
		this.addedBySource = [];
		this.chosen = picked === "none" ? null : picked;
		const taken = this.taken();
		this.addedBySource = taken.filter((name) => !this.properties.has(name));
		for (const name of taken) this.properties.add(name);
		this.render();
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

		const everything = this.withSource([...options.properties, ...options.otherProperties]);
		const hiddenCount = everything.filter((name) => this.hidden.has(name)).length;
		const sources = options.sources ?? [];
		if (everything.length > 0 || sources.length > 0) {
			const heading = new Setting(contentEl).setName(GROUP_LABELS.notes).setHeading();
			if (sources.length > 0) {
				heading.addButton((button) => {
					const current = this.chosen === null ? undefined : sources[this.chosen];
					button.setButtonText(current?.label ?? FROM_SOURCE_LABEL).onClick(() => void this.chooseSource());
					button.buttonEl.toggleClass(ACTIVE_CLASS, current !== undefined);
				});
			}
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
							properties: everything.filter((name) => this.properties.has(name) && !this.hidden.has(name)),
							hidden: [...this.hidden],
							source: this.chosen,
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
