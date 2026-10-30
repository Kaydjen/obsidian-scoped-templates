import { TFolder } from "obsidian";
import { joinPath, splitPath } from "../core/paths";
import type { Host } from "./host";

export async function ensureFolder(host: Host, path: string): Promise<TFolder> {
	const { vault } = host.app;
	if (path === "") return vault.getRoot();
	let current = "";
	for (const segment of splitPath(path)) {
		current = joinPath(current, segment);
		const existing = vault.getAbstractFileByPath(current);
		if (existing instanceof TFolder) continue;
		if (existing) throw new Error(`${current} is a file, not a folder`);
		try {
			await vault.createFolder(current);
		} catch (error) {
			// The file system ignores case, so the folder may exist under another spelling.
			if (!(vault.getAbstractFileByPath(current) instanceof TFolder)) throw error;
		}
	}
	const folder = vault.getAbstractFileByPath(path);
	if (!(folder instanceof TFolder)) throw new Error(`Could not create folder ${path}`);
	return folder;
}
