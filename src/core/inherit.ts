import { deepClone, deepEqual } from "./frontmatter";
import { parentPath, splitPath } from "./paths";

export interface InheritOptions {
	key: string;
	/** Value in the source file itself; empty values count as missing. */
	sourceValue: unknown;
	/** Folder of the source file (or vault root). */
	folder: string;
	/** Scope root of the template; the search stops there. */
	root: string;
	enabled: boolean;
	/** Non-empty values of `key` in the .md files directly inside `folder`, source file excluded. */
	listFolderValues(folder: string, key: string): unknown[];
}

function isMissing(value: unknown): boolean {
	return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

/**
 * source file -> neighbors in its folder -> parent folder ... up to the scope root.
 * Neighbors count only when they all agree; a conflict yields nothing rather than a guess.
 */
export function resolveFrom(options: InheritOptions): unknown {
	if (!isMissing(options.sourceValue)) return deepClone(options.sourceValue);
	if (!options.enabled) return undefined;

	const rootDepth = splitPath(options.root).length;
	let folder = options.folder;
	for (;;) {
		const values = options.listFolderValues(folder, options.key);
		const first = values[0];
		if (first !== undefined) {
			return values.every((value) => deepEqual(value, first)) ? deepClone(first) : undefined;
		}
		if (splitPath(folder).length <= rootDepth) return undefined;
		folder = parentPath(folder);
	}
}
