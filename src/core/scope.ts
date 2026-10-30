import { isInside, relativeSegments, splitPath } from "./paths";
import { matchPattern, type Pattern } from "./pattern";

export interface ScopeTemplate {
	path: string;
	/** File name without extension; templates sharing it override each other. */
	basename: string;
	label: string;
	/** Folder that contains the template folder. */
	root: string;
	where: Pattern[] | null;
	except: Pattern[];
	command?: string;
}

export interface VisibleTemplate {
	template: ScopeTemplate;
	captures: Record<string, string>;
}

/** Null when the template does not apply in `folder`. */
export function evaluate(template: ScopeTemplate, folder: string, folderName: string): VisibleTemplate | null {
	if (!isInside(folder, template.root)) return null;
	if (splitPath(folder).includes(folderName)) return null;

	const relative = relativeSegments(folder, template.root);
	if (template.except.some((pattern) => matchPattern(pattern, relative) !== null)) return null;

	if (template.where === null) return { template, captures: {} };
	for (const pattern of template.where) {
		const captures = matchPattern(pattern, relative);
		if (captures !== null) return { template, captures };
	}
	return null;
}

const depth = (template: ScopeTemplate) => splitPath(template.root).length;

/**
 * Visible templates in picker order: nearest scope first, then most recently used, then label.
 * A template overrides a same-named one from a shallower scope.
 */
export function visibleTemplates(
	all: ScopeTemplate[],
	folder: string,
	folderName: string,
	mru: Record<string, number>,
): VisibleTemplate[] {
	const byName = new Map<string, VisibleTemplate>();
	for (const template of all) {
		const visible = evaluate(template, folder, folderName);
		if (!visible) continue;
		const current = byName.get(template.basename);
		if (!current || depth(template) > depth(current.template)) byName.set(template.basename, visible);
	}
	return [...byName.values()].sort((a, b) => {
		const byDepth = depth(b.template) - depth(a.template);
		if (byDepth !== 0) return byDepth;
		const byUse = (mru[b.template.path] ?? 0) - (mru[a.template.path] ?? 0);
		if (byUse !== 0) return byUse;
		return a.template.label.localeCompare(b.template.label);
	});
}

/** The nearest visible template registered under `command`. Input must be in picker order. */
export function findByCommand(visible: VisibleTemplate[], command: string): VisibleTemplate | undefined {
	return visible.find((item) => item.template.command === command);
}
