import { sanitizeFolderSegment } from "./filename";

/** Vault-relative, `/`-separated paths. The vault root is the empty string. */

export function splitPath(path: string): string[] {
	return path.split("/").filter((segment) => segment.length > 0);
}

export function joinPath(...parts: string[]): string {
	return parts.flatMap(splitPath).join("/");
}

export function parentPath(path: string): string {
	const segments = splitPath(path);
	segments.pop();
	return segments.join("/");
}

export function isInside(folder: string, root: string): boolean {
	const rootSegments = splitPath(root);
	const folderSegments = splitPath(folder);
	if (folderSegments.length < rootSegments.length) return false;
	return rootSegments.every((segment, index) => folderSegments[index] === segment);
}

/** Segments of `folder` below `root`. Caller must check `isInside` first. */
export function relativeSegments(folder: string, root: string): string[] {
	return splitPath(folder).slice(splitPath(root).length);
}

/**
 * Target folder for a created note.
 * `into` is relative to the template scope root `root`; a leading `/` makes it
 * vault-relative. Without `into` the note goes next to the active file (`context`).
 */
export function resolveFolder(
	into: string | undefined,
	root: string,
	context: string,
	templateFolderName: string,
): string {
	if (into === undefined) return joinPath(context);
	if (into.includes("{{")) {
		const variable = /\{\{[^{}]*\}\}/.exec(into)?.[0] ?? "{{";
		throw new Error(`${variable} has no value here (it is not defined in tpl-where)`);
	}
	const normalized = into.trim().replace(/\\/g, "/");
	const absolute = normalized.startsWith("/");
	const rawSegments = splitPath(normalized)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	for (const segment of rawSegments) {
		if (segment === ".." || segment === ".") {
			throw new Error(`tpl-into cannot contain "${segment}": ${into}`);
		}
	}
	// A substituted value such as {{time}} may carry characters a folder name cannot have.
	const segments = rawSegments.map(sanitizeFolderSegment).filter((s) => s.length > 0);
	for (const segment of segments) {
		if (segment === templateFolderName) {
			throw new Error(`tpl-into cannot point into a "${templateFolderName}" folder: ${into}`);
		}
	}
	return absolute ? segments.join("/") : joinPath(root, ...segments);
}

/** `folder`, its parent, and so on up to the vault root (the empty string). */
export function folderAndAncestors(folder: string): string[] {
	const segments = splitPath(folder);
	const result: string[] = [];
	for (let length = segments.length; length >= 0; length--) {
		result.push(segments.slice(0, length).join("/"));
	}
	return result;
}

/**
 * Where a new template goes when the user picks `folder`: its own template folder, or
 * `folder` itself when that already is one. Null below a template folder (those subfolders
 * are not scanned for templates).
 */
export function templateFolderFor(folder: string, templateFolderName: string): string | null {
	const segments = splitPath(folder);
	const index = segments.indexOf(templateFolderName);
	if (index === -1) return joinPath(folder, templateFolderName);
	return index === segments.length - 1 ? folder : null;
}
