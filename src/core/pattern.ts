import { RESERVED_VARS } from "../constants";
import { splitPath } from "./paths";

export type Segment =
	| { kind: "capture"; name: string }
	| { kind: "glob"; source: string; regex: RegExp };

export interface Pattern {
	source: string;
	segments: Segment[];
}

const CAPTURE_RE = /^\{\{\s*([^{}]*?)\s*\}\}$/;
const NAME_RE = /^[A-Za-z_][\w-]*$/;

/** Whether `name` can label a folder in `tpl-where`: a plain word that is not a built-in variable. */
export const isCaptureName = (name: string): boolean => NAME_RE.test(name) && !RESERVED_VARS.includes(name);

function globToRegExp(glob: string): RegExp {
	let source = "";
	for (const char of glob) {
		if (char === "*") source += ".*";
		else if (char === "?") source += ".";
		else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${source}$`);
}

export function parsePattern(input: string): Pattern {
	const source = input.replace(/\\/g, "/");
	if (source.startsWith("/")) throw new Error(`Folders are written without a leading "/": ${source}`);
	const segments: Segment[] = [];
	const names = new Set<string>();
	for (const raw of splitPath(source)) {
		if (raw === ".." || raw === ".") throw new Error(`"${raw}" cannot be used in a folder path: ${source}`);
		if (raw.includes("**")) throw new Error(`Use one * per folder name: ${source}`);
		const capture = CAPTURE_RE.exec(raw);
		if (capture) {
			const name = capture[1] ?? "";
			if (!NAME_RE.test(name)) throw new Error(`"${name}" cannot be a folder label; use letters, digits, - or _ and start with a letter: ${source}`);
			if (RESERVED_VARS.includes(name)) throw new Error(`"${name}" is already a variable; pick another name: ${source}`);
			if (names.has(name)) throw new Error(`"${name}" is used twice; give each folder its own name: ${source}`);
			names.add(name);
			segments.push({ kind: "capture", name });
		} else if (raw.includes("{{") || raw.includes("}}")) {
			throw new Error(`Write {{name}} as a whole folder name, e.g. project/{{name}}: ${source}`);
		} else {
			segments.push({ kind: "glob", source: raw, regex: globToRegExp(raw) });
		}
	}
	return { source, segments };
}

/**
 * Prefix match against the path segments below the scope root.
 * Returns the captures, or null when the pattern does not match.
 */
export function matchPattern(pattern: Pattern, relative: string[]): Record<string, string> | null {
	if (relative.length < pattern.segments.length) return null;
	const captures: Record<string, string> = {};
	for (let i = 0; i < pattern.segments.length; i++) {
		const segment = pattern.segments[i];
		const value = relative[i];
		if (segment === undefined || value === undefined) return null;
		if (segment.kind === "capture") captures[segment.name] = value;
		else if (!segment.regex.test(value)) return null;
	}
	return captures;
}
