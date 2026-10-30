import { editorInfoField, type Plugin } from "obsidian";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Text } from "@codemirror/state";
import type { FieldKind, Suggestion } from "../core/catalog";
import { suggest } from "../core/catalog";
import { renderDetail } from "./field-suggest";
import type { Host } from "./host";
import { buildContext, kindForKey } from "./suggest-context";

const KEY_LINE = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/;

/** Line number of the closing `---` of the frontmatter; 0 when the note has none. */
function frontmatterEnd(doc: Text): number {
	if (doc.lines < 2 || doc.line(1).text.trimEnd() !== "---") return 0;
	for (let number = 2; number <= doc.lines; number++) {
		if (doc.line(number).text.trimEnd() === "---") return number;
	}
	return 0;
}

/**
 * Same catalog as the Properties list, for text typed in the editor: variables in the body and
 * simple `key: value` lines of the frontmatter. CodeMirror shows the definition beside the
 * highlighted option, like a code editor does.
 */
export function registerEditorCompletion(plugin: Plugin & Host): void {
	try {
		// Provided by Obsidian at run time; required here so a missing module cannot break the plugin.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { autocompletion, startCompletion } = require("@codemirror/autocomplete") as typeof import("@codemirror/autocomplete");

		const toOption = (item: Suggestion): Completion => ({
			label: item.label,
			detail: item.tag,
			info: () => {
				const el = document.createElement("div");
				el.addClass("scoped-templates-detail");
				renderDetail(el, item);
				return el;
			},
			apply: (view, _completion, from, to) => {
				view.dispatch({
					changes: { from, to, insert: item.insert },
					selection: { anchor: from + item.insert.length },
				});
				if (/[/:]$/.test(item.insert)) startCompletion(view);
			},
		});

		const source = (context: CompletionContext): CompletionResult | null => {
			const file = context.state.field(editorInfoField, false)?.file;
			if (!file || file.extension !== "md" || file.parent?.name !== plugin.settings.folderName) return null;

			const { doc } = context.state;
			const line = doc.lineAt(context.pos);
			const end = frontmatterEnd(doc);
			let kind: FieldKind | null = "body";
			let start = 0;
			let text = line.text;

			if (end > 0 && line.number <= end) {
				if (line.number === 1 || line.number === end) return null;
				const match = KEY_LINE.exec(line.text);
				if (!match) return null;
				kind = kindForKey(match[1] ?? "");
				text = match[2] ?? "";
				start = line.to - text.length;
				if (/^["']/.test(text)) {
					text = text.slice(1);
					start += 1;
				}
				if (kind === null || text.startsWith("[") || context.pos < start) return null;
			} else {
				start = line.from;
			}

			const result = suggest(kind, text, context.pos - start, buildContext(plugin, file));
			if (result.items.length === 0) return null;
			return { from: start + result.from, to: start + result.to, options: result.items.map(toOption), filter: false };
		};

		plugin.registerEditorExtension(autocompletion({ override: [source], icons: false }));
		plugin.app.workspace.updateOptions();
	} catch (error) {
		console.warn("[scoped-templates] editor completion is unavailable", error);
	}
}
