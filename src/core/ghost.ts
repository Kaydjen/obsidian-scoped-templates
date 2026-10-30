import { DEFAULT_FILENAME, DEFAULT_INTO, GHOST_WHERE_ROOT, KEYS } from "../constants";

/** What an empty config key of a template effectively means; shown as a faint placeholder. */
export function ghostDefaults(basename: string, rootFolderName: string): Record<string, string> {
	return {
		[KEYS.label]: basename,
		[KEYS.where]: rootFolderName === "" ? GHOST_WHERE_ROOT : rootFolderName,
		[KEYS.into]: DEFAULT_INTO,
		// Nothing to show: blank instead of the built-in "Empty", which reads as unfinished.
		[KEYS.command]: "",
		[KEYS.filename]: DEFAULT_FILENAME,
	};
}
