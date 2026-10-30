import { CURSOR_MARKER, OR_OPERATOR } from "../constants";

export interface SubstituteDeps {
	formatDate(kind: "date" | "time", format: string | undefined): string;
	captures: Record<string, string>;
	/** Undefined while the title is not known yet (folder and file name stage). */
	title?: string;
	selection: string;
	source: string;
	from(key: string): unknown;
	/** File name of the template (without extension); `{{template}}` stays as written when absent. */
	template?: string;
	/** Folder of the note the template runs from, as a vault path with a leading "/"; `{{here}}` stays as written when absent. */
	here?: string;
}

const VARIABLE_RE = /\{\{([^{}]*)\}\}/g;

/** The parts of `text` between `||` operators; an operator inside `{{ }}` is not one. */
export function splitAlternatives(text: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < text.length; index++) {
		if (text.startsWith("{{", index)) {
			depth++;
			index++;
		} else if (depth > 0 && text.startsWith("}}", index)) {
			depth--;
			index++;
		} else if (depth === 0 && text.startsWith(OR_OPERATOR, index)) {
			parts.push(text.slice(start, index));
			index += OR_OPERATOR.length - 1;
			start = index + 1;
		}
	}
	parts.push(text.slice(start));
	return parts;
}

/** Whether `text` uses `||` with nothing (or only spaces) before or after it. */
export function hasEmptyAlternative(text: string): boolean {
	const parts = splitAlternatives(text);
	return parts.length > 1 && parts.some((part) => part.trim() === "");
}

export function formatValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (Array.isArray(value)) return value.map(formatValue).join(", ");
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

/** Single pass: substituted values are never scanned again. Unknown variables stay as written. */
export function substitute(text: string, deps: SubstituteDeps): string {
	return text.replace(VARIABLE_RE, (match, inner: string) => {
		const trimmed = inner.trim();
		const colon = trimmed.indexOf(":");
		const name = colon === -1 ? trimmed : trimmed.slice(0, colon).trim();
		const arg = colon === -1 ? undefined : trimmed.slice(colon + 1);

		switch (name) {
			case "date":
			case "time":
				return deps.formatDate(name, arg === undefined || arg.trim() === "" ? undefined : arg.trim());
			case "title":
				return deps.title === undefined ? match : deps.title;
			case "selection":
				return deps.selection;
			case "source":
				return deps.source;
			case "from":
				return arg === undefined ? match : formatValue(deps.from(arg.trim()));
			case "template":
				return deps.template ?? match;
			case "here":
				return deps.here ?? match;
			case "cursor":
				return match;
		}
		if (colon === -1 && Object.prototype.hasOwnProperty.call(deps.captures, name)) {
			return deps.captures[name] ?? match;
		}
		return match;
	});
}

/**
 * Like `substitute`, but a value written as `a || b` becomes the first alternative that is not
 * blank (the last one when all are). The text is split before substituting, so a substituted
 * value that contains `||` is left alone. Without `||` it is exactly `substitute`.
 */
export function substituteChain(text: string, deps: SubstituteDeps): string {
	const parts = splitAlternatives(text);
	if (parts.length === 1) return substitute(text, deps);
	let result = "";
	for (const part of parts) {
		result = substitute(part.trim(), deps);
		if (result.trim() !== "") return result;
	}
	return result;
}

/** Removes every cursor marker and reports where the first one was. */
export function extractCursor(text: string): { text: string; offset: number | null } {
	const index = text.indexOf(CURSOR_MARKER);
	if (index === -1) return { text, offset: null };
	return { text: text.split(CURSOR_MARKER).join(""), offset: index };
}
