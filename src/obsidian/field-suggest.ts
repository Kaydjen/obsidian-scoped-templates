import { AbstractInputSuggest, type App } from "obsidian";
import { DETAIL_EXAMPLE_LABEL, PANE_CLASS } from "../constants";
import {
	fieldHelp,
	suggest,
	type CatalogContext,
	type Detail,
	type FieldKind,
	type Suggestion,
	type Suggestions,
} from "../core/catalog";

/** An insertion ending like this expects more typing, so the list is reopened. */
const CONTINUES = /(?:[/:]|\|\| )$/;

export const PANE_GAP = 6;
export const PANE_WIDTH = 300;

/** The same definition block is used beside the Properties list and in the editor's completion popup. */
export function renderDetail(parent: HTMLElement, item: Suggestion): void {
	parent.createDiv({ cls: "scoped-templates-detail-title", text: item.label });
	renderBlock(parent, item);
	if (item.also) renderBlock(parent.createDiv({ cls: "scoped-templates-detail-also" }), item.also);
}

function renderBlock(parent: HTMLElement, detail: Detail): void {
	parent.createDiv({ cls: "scoped-templates-detail-text", text: detail.definition });
	if (detail.scenario !== undefined && detail.scenario !== "") {
		const row = parent.createDiv({ cls: "scoped-templates-detail-scenario" });
		row.createEl("strong", { text: DETAIL_EXAMPLE_LABEL });
		row.createSpan({ text: `: ${detail.scenario}` });
	}
	if (detail.example !== undefined && detail.example !== "") {
		const row = parent.createDiv({ cls: "scoped-templates-detail-example" });
		row.createSpan({ text: `${detail.exampleLabel ?? "e.g."} ` });
		row.createEl("code", { text: detail.example });
	}
}

export type TextEl = HTMLInputElement | HTMLDivElement;

export function readText(el: TextEl): string {
	return el instanceof HTMLInputElement ? el.value : (el.textContent ?? "");
}

function readCaret(el: TextEl, fallback: number): number {
	if (el instanceof HTMLInputElement) return el.selectionStart ?? fallback;
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !el.contains(selection.anchorNode)) {
		return fallback;
	}
	const range = selection.getRangeAt(0).cloneRange();
	range.selectNodeContents(el);
	range.setEnd(selection.anchorNode, selection.anchorOffset);
	return range.toString().length;
}

function writeCaret(el: TextEl, position: number): void {
	if (el instanceof HTMLInputElement) {
		el.setSelectionRange(position, position);
		return;
	}
	const node = el.firstChild;
	const selection = window.getSelection();
	if (!node || !selection) return;
	const range = document.createRange();
	range.setStart(node, Math.min(position, node.textContent?.length ?? 0));
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

const itemsByElement = new WeakMap<HTMLElement, Suggestion>();

/**
 * Type-ahead for one Properties field: the full option list on an empty field, and a definition
 * panel beside the list that follows the highlighted item. The panel is our own element; it
 * follows Obsidian's `is-selected` marker on the list rows, which is not a documented API.
 */
export class FieldSuggest extends AbstractInputSuggest<Suggestion> {
	private range: Suggestions = { from: 0, to: 0, items: [] };
	private pane: HTMLElement | null = null;
	private watcher: MutationObserver | null = null;
	private container: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly field: TextEl,
		private readonly kind: FieldKind,
		private readonly context: () => CatalogContext,
	) {
		super(app, field);
		field.addEventListener("blur", () => this.closePane());
	}

	getSuggestions(): Suggestion[] {
		const text = readText(this.field);
		const context = this.context();
		this.range = suggest(this.kind, text, readCaret(this.field, text.length), context);
		// An empty field starts with what the field is for; it inserts nothing.
		const help = text === "" ? fieldHelp(this.kind, context) : null;
		return help ? [help, ...this.range.items] : this.range.items;
	}

	renderSuggestion(item: Suggestion, el: HTMLElement): void {
		el.addClass("mod-complex");
		el.createDiv({ cls: "suggestion-content" }).createDiv({ cls: "suggestion-title", text: item.label });
		el.createDiv({ cls: "suggestion-aux" }).createSpan({ cls: "suggestion-flair", text: item.tag });
		itemsByElement.set(el, item);
		window.requestAnimationFrame(() => this.showPane(el));
	}

	selectSuggestion(item: Suggestion): void {
		if (item.help) return;
		const text = readText(this.field);
		const { from, to } = this.range;
		this.setValue(text.slice(0, from) + item.insert + text.slice(to));
		writeCaret(this.field, from + item.insert.length);
		this.close();
		const notify = () => this.field.dispatchEvent(new Event("input", { bubbles: true }));
		if (CONTINUES.test(item.insert)) {
			// Closing first, then a fresh input event, so the list reopens for the next level.
			window.setTimeout(() => {
				this.field.focus();
				writeCaret(this.field, from + item.insert.length);
				notify();
			}, 0);
		} else {
			// Lets Obsidian save the new value.
			notify();
		}
	}

	close(): void {
		this.closePane();
		super.close();
	}

	private showPane(row: HTMLElement): void {
		const container = row.closest<HTMLElement>(".suggestion-container");
		if (!container || container === this.container) return;
		this.closePane();
		this.container = container;
		this.pane = document.body.createDiv({ cls: PANE_CLASS });
		this.watcher = new MutationObserver(() => this.syncPane());
		this.watcher.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
		this.syncPane();
	}

	private syncPane(): void {
		const { container, pane } = this;
		if (!container || !pane) return;
		if (!container.isConnected) {
			this.closePane();
			return;
		}
		const selected = container.querySelector<HTMLElement>(".suggestion-item.is-selected");
		const item = selected ? itemsByElement.get(selected) : undefined;
		pane.empty();
		pane.toggleClass("is-hidden", item === undefined);
		if (item === undefined) return;
		renderDetail(pane, item);

		const box = container.getBoundingClientRect();
		const fitsRight = box.right + PANE_GAP + PANE_WIDTH <= window.innerWidth;
		pane.style.left = `${fitsRight ? box.right + PANE_GAP : Math.max(0, box.left - PANE_GAP - PANE_WIDTH)}px`;
		pane.style.top = `${box.top}px`;
		pane.style.width = `${PANE_WIDTH}px`;
	}

	private closePane(): void {
		this.watcher?.disconnect();
		this.watcher = null;
		this.pane?.remove();
		this.pane = null;
		this.container = null;
	}
}
