import { KEY_HELP_CLASS, PANE_CLASS } from "../constants";
import type { Suggestion } from "../core/catalog";
import { PANE_GAP, PANE_WIDTH, renderDetail } from "./field-suggest";

const SHOW_DELAY = 250;

/** The same explanation panel as beside the option list, opened by pointing at a property's name. */
export class KeyHelp {
	private pane: HTMLElement | null = null;
	private timer = 0;

	show(anchor: HTMLElement, item: () => Suggestion | null): void {
		this.hide();
		document.body.addClass(KEY_HELP_CLASS);
		this.timer = window.setTimeout(() => {
			const help = item();
			if (help === null || !anchor.isConnected) return;
			const pane = document.body.createDiv({ cls: PANE_CLASS });
			renderDetail(pane, help);
			const box = anchor.getBoundingClientRect();
			pane.style.width = `${PANE_WIDTH}px`;
			pane.style.left = `${Math.max(0, Math.min(box.left, window.innerWidth - PANE_WIDTH - PANE_GAP))}px`;
			pane.style.top = `${box.bottom + PANE_GAP}px`;
			this.pane = pane;
		}, SHOW_DELAY);
	}

	hide(): void {
		window.clearTimeout(this.timer);
		document.body.removeClass(KEY_HELP_CLASS);
		this.pane?.remove();
		this.pane = null;
	}
}
