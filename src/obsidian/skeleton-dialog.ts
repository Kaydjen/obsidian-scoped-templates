import { Modal, Setting, type App } from "obsidian";
import { GROUP_LABELS } from "../constants";
import { keyDefinition } from "../core/catalog";

export interface SkeletonChoice {
	/** Template keys to write, in file order. */
	keys: string[];
	/** Note properties to write. */
	properties: string[];
}

export interface SkeletonOptions {
	keys: readonly string[];
	/** Keys that start checked. */
	checkedKeys: readonly string[];
	properties: string[];
	/** Properties that start checked. */
	checkedProperties: readonly string[];
}

class SkeletonDialog extends Modal {
	private done = false;

	constructor(
		app: App,
		private readonly options: SkeletonOptions,
		private readonly finish: (choice: SkeletonChoice | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		const keys = new Set(options.checkedKeys);
		const properties = new Set(options.checkedProperties);

		const toggles = (names: readonly string[], chosen: Set<string>, describe: (name: string) => string | null) => {
			for (const name of names) {
				const setting = new Setting(contentEl).setName(name);
				const text = describe(name);
				if (text !== null) setting.setDesc(text);
				setting.addToggle((toggle) =>
					toggle.setValue(chosen.has(name)).onChange((value) => {
						if (value) chosen.add(name);
						else chosen.delete(name);
					}),
				);
			}
		};

		new Setting(contentEl).setName(GROUP_LABELS.keys).setHeading();
		toggles(options.keys, keys, keyDefinition);
		if (options.properties.length > 0) {
			new Setting(contentEl).setName(GROUP_LABELS.notes).setHeading();
			toggles(options.properties, properties, () => null);
		}

		new Setting(contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText("Create")
					.setCta()
					.onClick(() => {
						this.done = true;
						this.finish({
							keys: options.keys.filter((key) => keys.has(key)),
							properties: options.properties.filter((name) => properties.has(name)),
						});
						this.close();
					}),
			);
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
