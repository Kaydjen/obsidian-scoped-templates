import { Notice } from "obsidian";
import { NOTICE_NO_TEMPLATE_FOR_HOTKEY } from "../constants";
import { isInside, parentPath } from "../core/paths";
import { findByCommand, visibleTemplates, type VisibleTemplate } from "../core/scope";
import type { Host, PickedTemplate } from "./host";
import { runNewTemplateFromPicker } from "./new-template";
import { NEW_TEMPLATE, NEW_TEMPLATE_CHOOSE, pickTemplate } from "./picker";

/** One notice for the broken templates whose scope contains `folder`; they are not listed as choices. */
async function warnAboutInvalid(host: Host, folder: string): Promise<void> {
	const { invalid } = await host.index.load();
	const here = invalid.filter((entry) => isInside(folder, parentPath(parentPath(entry.path))));
	const first = here[0];
	if (!first) return;
	const name = first.path.slice(first.path.lastIndexOf("/") + 1).replace(/\.md$/, "");
	const more = here.length > 1 ? ` (+${here.length - 1} more)` : "";
	new Notice(`"${name}" has an error: ${first.error}${more}`);
}

/** Resolves the template to use, or null after telling the user why there is none. */
export async function chooseTemplate(host: Host, folder: string, command?: string): Promise<PickedTemplate | null> {
	await warnAboutInvalid(host, folder);
	const { valid } = await host.index.load();
	const visible = visibleTemplates(
		valid.map((entry) => entry.scope),
		folder,
		host.settings.folderName,
		host.settings.mru,
	);
	const byPath = new Map(valid.map((entry) => [entry.scope.path, entry]));
	const toPicked = (item: VisibleTemplate): PickedTemplate | null => {
		const entry = byPath.get(item.template.path);
		return entry ? { entry, captures: item.captures } : null;
	};

	if (command !== undefined) {
		const found = findByCommand(visible, command);
		if (found) return toPicked(found);
		const known = valid.find((entry) => entry.scope.command === command);
		new Notice(known ? `"${known.scope.label}" cannot be run from this folder` : NOTICE_NO_TEMPLATE_FOR_HOTKEY);
		return null;
	}
	const chosen = await pickTemplate(host.app, visible);
	if (chosen === NEW_TEMPLATE || chosen === NEW_TEMPLATE_CHOOSE) {
		await runNewTemplateFromPicker(host, folder, chosen === NEW_TEMPLATE_CHOOSE);
		return null;
	}
	return chosen ? toPicked(chosen) : null;
}

