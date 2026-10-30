import { App, SuggestModal, prepareFuzzySearch } from "obsidian";
import { NEW_TEMPLATE_ACTION_LABEL, SEPARATED_CLASS } from "../constants";
import type { VisibleTemplate } from "../core/scope";

class ListPicker<T> extends SuggestModal<T> {
	private settled = false;

	constructor(
		app: App,
		private readonly items: T[],
		private readonly text: (item: T) => string,
		/** Always shown after the filtered items. */
		private readonly last: T | undefined,
		/** The first row of a second block: it gets a divider above it. */
		private readonly blockStart: T | undefined,
		private readonly finish: (value: T | null) => void,
	) {
		super(app);
	}

	getSuggestions(query: string): T[] {
		const tail = this.last === undefined ? [] : [this.last];
		if (query.trim() === "") return [...this.items, ...tail];
		const fuzzy = prepareFuzzySearch(query);
		const matches = this.items
			.map((item) => ({ item, result: fuzzy(this.text(item)) }))
			.filter((entry) => entry.result !== null)
			.sort((a, b) => (b.result?.score ?? 0) - (a.result?.score ?? 0))
			.map((entry) => entry.item);
		return [...matches, ...tail];
	}

	renderSuggestion(item: T, el: HTMLElement): void {
		el.setText(this.text(item));
		// The trailing item is an action, not one of the choices above it.
		if ((this.last !== undefined && item === this.last) || (this.blockStart !== undefined && item === this.blockStart)) {
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
	last?: T,
	blockStart?: T,
): Promise<T | null> {
	return new Promise((resolve) => new ListPicker(app, items, text, last, blockStart, resolve).open());
}

export const NEW_TEMPLATE = "new" as const;

/** The list always ends with a "New template" item, so an empty scope is not a dead end. */
export function pickTemplate(
	app: App,
	items: VisibleTemplate[],
): Promise<VisibleTemplate | typeof NEW_TEMPLATE | null> {
	return pickFrom<VisibleTemplate | typeof NEW_TEMPLATE>(
		app,
		items,
		(item) => (item === NEW_TEMPLATE ? NEW_TEMPLATE_ACTION_LABEL : item.template.label),
		NEW_TEMPLATE,
	);
}
