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
	if (into.includes("{{")) throw new Error(`Unresolved variable in folder: ${into}`);
	const absolute = into.trim().startsWith("/");
	const segments = splitPath(into.trim().replace(/\\/g, "/")).map((s) => s.trim());
	for (const segment of segments) {
		if (segment === ".." || segment === ".") {
			throw new Error(`Folder must not contain "${segment}": ${into}`);
		}
		if (segment === templateFolderName) {
			throw new Error(`Folder must not be inside ${templateFolderName}: ${into}`);
		}
	}
	return absolute ? segments.join("/") : joinPath(root, segments.join("/"));
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
