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

/**
 * Templates ordered by closeness to `folder` in the folder tree, closest first.
 * Templates whose scope contains `folder` come first, the deepest first; then the ones sharing the
 * longest folder prefix, then the ones with the shallower root, then most recently used, then label.
 */
export function rankTemplates<T extends { scope: ScopeTemplate }>(
	entries: T[],
	folder: string,
	mru: Record<string, number>,
): T[] {
	const target = splitPath(folder);
	const measure = (entry: T) => {
		const root = splitPath(entry.scope.root);
		let shared = 0;
		while (shared < root.length && shared < target.length && root[shared] === target[shared]) shared++;
		return { shared, inside: shared === root.length, rootLength: root.length };
	};
	const ranked = entries.map((entry) => ({ entry, ...measure(entry) }));
	ranked.sort(
		(a, b) =>
			Number(b.inside) - Number(a.inside) ||
			b.shared - a.shared ||
			a.rootLength - b.rootLength ||
			(mru[b.entry.scope.path] ?? 0) - (mru[a.entry.scope.path] ?? 0) ||
			a.entry.scope.label.localeCompare(b.entry.scope.label),
	);
	return ranked.map((item) => item.entry);
}

/** The closest template of `rankTemplates`, or undefined when there are none. */
export function nearestTemplate<T extends { scope: ScopeTemplate }>(
	entries: T[],
	folder: string,
	mru: Record<string, number>,
): T | undefined {
	return rankTemplates(entries, folder, mru)[0];
}
