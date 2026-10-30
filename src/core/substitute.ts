import { CURSOR_MARKER } from "../constants";

export interface SubstituteDeps {
	formatDate(kind: "date" | "time", format: string | undefined): string;
	captures: Record<string, string>;
	/** Undefined while the title is not known yet (folder and file name stage). */
	title?: string;
	selection: string;
	source: string;
	from(key: string): unknown;
}

const VARIABLE_RE = /\{\{([^{}]*)\}\}/g;

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
			case "cursor":
				return match;
		}
		if (colon === -1 && Object.prototype.hasOwnProperty.call(deps.captures, name)) {
			return deps.captures[name] ?? match;
		}
		return match;
	});
}

/** Removes every cursor marker and reports where the first one was. */
export function extractCursor(text: string): { text: string; offset: number | null } {
	const index = text.indexOf(CURSOR_MARKER);
	if (index === -1) return { text, offset: null };
	return { text: text.split(CURSOR_MARKER).join(""), offset: index };
}
