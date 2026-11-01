import { App, SuggestModal, prepareFuzzySearch } from "obsidian";
import {
	AVAILABLE_EVERYWHERE_LABEL,
	NEW_TEMPLATE_ACTION_LABEL,
	NEW_TEMPLATE_CHOOSE_ACTION_LABEL,
	SEPARATED_CLASS,
} from "../constants";
import type { VisibleTemplate } from "../core/scope";

export interface PickOptions<T> {
	/** Always shown after the filtered items; the first of them gets a divider above it. */
	last?: T[];
	/** The first row of a second block: it gets a divider above it. */
	blockStart?: T;
	/** Caption of the search field; it names what the list asks for. */
	placeholder?: string;
	/** Muted second part of a row; searched together with the main text. */
	aux?: (item: T) => string | undefined;
}

class ListPicker<T> extends SuggestModal<T> {
	private settled = false;

	constructor(
		app: App,
		private readonly items: T[],
		private readonly text: (item: T) => string,
		private readonly options: PickOptions<T>,
		private readonly finish: (value: T | null) => void,
	) {
		super(app);
		if (options.placeholder !== undefined) this.setPlaceholder(options.placeholder);
	}

	getSuggestions(query: string): T[] {
		const tail = this.options.last ?? [];
		if (query.trim() === "") return [...this.items, ...tail];
		const fuzzy = prepareFuzzySearch(query);
		const matches = this.items
			.map((item) => ({ item, result: fuzzy(this.searchText(item)) }))
			.filter((entry) => entry.result !== null)
			.sort((a, b) => (b.result?.score ?? 0) - (a.result?.score ?? 0))
			.map((entry) => entry.item);
		return [...matches, ...tail];
	}

	private searchText(item: T): string {
		const aux = this.options.aux?.(item);
		return aux ? `${this.text(item)} ${aux}` : this.text(item);
	}

	renderSuggestion(item: T, el: HTMLElement): void {
		const aux = this.options.aux?.(item);
		if (aux) {
			el.addClass("mod-complex");
			el.createDiv({ cls: "suggestion-content" }).createDiv({ cls: "suggestion-title", text: this.text(item) });
			el.createDiv({ cls: "suggestion-aux", text: aux });
		} else {
			el.setText(this.text(item));
		}
		// The trailing item is an action, not one of the choices above it.
		const { last, blockStart } = this.options;
		if ((last !== undefined && item === last[0]) || (blockStart !== undefined && item === blockStart)) {
			el.addClass(SEPARATED_CLASS);
		}
	}

	onChooseSuggestion(item: T): void {
		this.settled = true;
		this.finish(item);
	}

	onClose(): void {
		// The modal closes before the choice callback runs, so wait a tick.
		window.setTimeout(() => {
			if (!this.settled) this.finish(null);
		}, 0);
	}
}

/** Null when the user dismisses the list. */
export function pickFrom<T>(
	app: App,
	items: T[],
	text: (item: T) => string,
	options: PickOptions<T> = {},
): Promise<T | null> {
	return new Promise((resolve) => new ListPicker(app, items, text, options, resolve).open());
}

export const NEW_TEMPLATE = "new" as const;
export const NEW_TEMPLATE_CHOOSE = "new-choose" as const;
type NewTemplateAction = typeof NEW_TEMPLATE | typeof NEW_TEMPLATE_CHOOSE;

/** The list always ends with the two "New template" items, so an empty scope is not a dead end. */
export function pickTemplate(app: App, items: VisibleTemplate[]): Promise<VisibleTemplate | NewTemplateAction | null> {
	// Same label in different scopes: the folder tells them apart.
	const counts = new Map<string, number>();
	for (const { template } of items) counts.set(template.label, (counts.get(template.label) ?? 0) + 1);
	const isAction = (item: VisibleTemplate | NewTemplateAction): item is NewTemplateAction => typeof item === "string";
	return pickFrom<VisibleTemplate | NewTemplateAction>(
		app,
		items,
		(item) => {
			if (item === NEW_TEMPLATE) return NEW_TEMPLATE_ACTION_LABEL;
			if (item === NEW_TEMPLATE_CHOOSE) return NEW_TEMPLATE_CHOOSE_ACTION_LABEL;
			return item.template.label;
		},
		{
			last: [NEW_TEMPLATE, NEW_TEMPLATE_CHOOSE],
			aux: (item) => {
				if (isAction(item) || (counts.get(item.template.label) ?? 0) < 2) return undefined;
				return item.template.root === "" ? AVAILABLE_EVERYWHERE_LABEL : item.template.root;
			},
		},
	);
}
