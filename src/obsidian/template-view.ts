import { MarkdownView, type Plugin } from "obsidian";
import {
	CONFIG_PREFIX,
	GHOST_CLASS,
	GROUP_ATTRIBUTE,
	GROUP_FIRST_CLASS,
	GROUP_LABELS,
	GROUP_START_CLASS,
	TEMPLATE_VIEW_CLASS,
	VARIABLE_CLASS,
} from "../constants";
import { keyHelp } from "../core/catalog";
import { ghostDefaults } from "../core/ghost";
import { FieldSuggest, type TextEl } from "./field-suggest";
import type { Host } from "./host";
import { KeyHelp } from "./key-help";
import { buildContext, kindForKey } from "./suggest-context";

const TEXT_INPUT = ".metadata-input-longtext, .multi-select-input";

/**
 * Decorates the Properties of an open template file: faint effective defaults in empty config
 * fields, `{{variable}}` values marked as such, and type-ahead with definitions in the text fields.
 * It relies on Obsidian's Properties markup (`data-property-key`, `placeholder`, the input
 * classes); if that markup changes, the properties simply stay as Obsidian draws them.
 */
export function registerTemplateView(plugin: Plugin & Host): void {
	const { workspace, vault } = plugin.app;
	let observer: MutationObserver | null = null;
	let decorated: HTMLElement | null = null;
	let frame = 0;
	const attached = new WeakSet<HTMLElement>();
	const hovered = new WeakSet<HTMLElement>();
	const help = new KeyHelp();

	const paint = (view: MarkdownView): void => {
		const file = view.file;
		if (!file?.parent) return;
		const root = file.parent.parent;
		const defaults = ghostDefaults(file.basename, root === null || root.isRoot() ? "" : root.name);

		let previous: keyof typeof GROUP_LABELS | null = null;
		view.contentEl.querySelectorAll<HTMLElement>(".metadata-property[data-property-key]").forEach((row) => {
			const key = row.getAttribute("data-property-key") ?? "";

			// A caption over the first property of each group: ours (template keys) and the note's own.
			const group = key.startsWith(CONFIG_PREFIX) ? "keys" : "notes";
			row.toggleClass(GROUP_START_CLASS, group !== previous);
			row.toggleClass(GROUP_FIRST_CLASS, previous === null);
			if (group !== previous) row.setAttribute(GROUP_ATTRIBUTE, GROUP_LABELS[group]);
			previous = group;
			const input = row.querySelector<HTMLElement>(TEXT_INPUT);

			const valueEl = row.querySelector<HTMLElement>(".metadata-property-value");
			if (valueEl) {
				const text =
					(valueEl.textContent ?? "") +
					Array.from(valueEl.querySelectorAll("input"))
						.map((field) => field.value)
						.join("");
				valueEl.classList.toggle(VARIABLE_CLASS, text.includes("{{"));
			}

			// A list keeps an empty input after its values; the default is only true while there are none.
			const hasValues = row.querySelector(".multi-select-pill") !== null;
			const ghost = key.startsWith(CONFIG_PREFIX) ? defaults[key] : undefined;
			if (ghost !== undefined && input && input.textContent === "" && !hasValues) {
				input.addClass(GHOST_CLASS);
				if (input.getAttribute("placeholder") !== ghost) input.setAttribute("placeholder", ghost);
			} else {
				input?.removeClass(GHOST_CLASS);
			}

			const keyEl = row.querySelector<HTMLElement>(".metadata-property-key");
			if (keyEl && key.startsWith(CONFIG_PREFIX) && !hovered.has(keyEl)) {
				hovered.add(keyEl);
				keyEl.addEventListener("mouseenter", () => help.show(keyEl, () => keyHelp(key, buildContext(plugin, file))));
				keyEl.addEventListener("mouseleave", () => help.hide());
			}

			const kind = kindForKey(key);
			if (kind !== null && input && !attached.has(input)) {
				attached.add(input);
				new FieldSuggest(plugin.app, input as TextEl, kind, () => buildContext(plugin, file));
			}
		});
	};

	const detach = (): void => {
		help.hide();
		window.cancelAnimationFrame(frame);
		frame = 0;
		observer?.disconnect();
		observer = null;
		decorated?.removeClass(TEMPLATE_VIEW_CLASS);
		decorated = null;
	};

	const attach = (): void => {
		detach();
		const view = workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file || view.file.parent?.name !== plugin.settings.folderName) return;

		decorated = view.contentEl;
		decorated.addClass(TEMPLATE_VIEW_CLASS);
		const run = () => {
			frame = 0;
			paint(view);
		};
		observer = new MutationObserver(() => {
			if (frame === 0) frame = window.requestAnimationFrame(run);
		});
		observer.observe(view.contentEl, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
			attributeFilter: ["placeholder"],
		});
		run();
	};

	plugin.registerEvent(workspace.on("active-leaf-change", attach));
	plugin.registerEvent(workspace.on("file-open", attach));
	plugin.registerEvent(workspace.on("layout-change", attach));
	plugin.registerEvent(vault.on("rename", attach));
	plugin.register(detach);
	workspace.onLayoutReady(attach);
}
