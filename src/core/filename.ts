import { MAX_NAME_LENGTH } from "../constants";

// eslint-disable-next-line no-control-regex
const FORBIDDEN_RE = /[\\/:*?"<>|#^[\]\u0000-\u001f]/g;

/** Safe note name without extension; may be empty. */
export function sanitizeName(raw: string): string {
	let name = raw.replace(/\s+/g, " ").replace(FORBIDDEN_RE, "").trim();
	if (name.length > MAX_NAME_LENGTH) name = name.slice(0, MAX_NAME_LENGTH);
	return name.replace(/[. ]+$/, "");
}

// eslint-disable-next-line no-control-regex
const FOLDER_FORBIDDEN_RE = /[:*?"<>|\u0000-\u001f]/g;

/** One folder name: drops what Windows rejects (`#`, `^`, brackets stay: they are legal in folders). */
export function sanitizeFolderSegment(raw: string): string {
	return raw.replace(FOLDER_FORBIDDEN_RE, "").replace(/[. ]+$/, "").trim();
}

/** "History of the name" -> "History-of-the-name". */
export function dashWords(raw: string): string {
	return raw.trim().split(/\s+/).join("-");
}

/** Text for a link alias: no characters that would break the link. */
export function sanitizeAlias(raw: string): string {
	return raw.replace(/[|[\]\r\n]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * `existing` holds the file names (with extension) already in the target folder.
 * The comparison ignores case because the file system does.
 */
export function uniqueName(base: string, extension: string, existing: Iterable<string>): string {
	const taken = new Set([...existing].map((name) => name.toLowerCase()));
	if (!taken.has(`${base}.${extension}`.toLowerCase())) return base;
	for (let counter = 2; ; counter++) {
		const candidate = `${base}-${counter}`;
		if (!taken.has(`${candidate}.${extension}`.toLowerCase())) return candidate;
	}
}
