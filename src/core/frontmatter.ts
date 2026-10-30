export interface BuildDeps {
	/** Substitute variables inside a plain string value. */
	text(value: string): string;
	/** Resolved value for `{{from:key}}`; undefined when nothing was found. */
	from(key: string): unknown;
}

export type Frontmatter = Record<string, unknown>;

const FROM_RE = /^\{\{\s*from:\s*([^{}]+?)\s*\}\}$/;

export function isEmpty(value: unknown): boolean {
	return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

export function deepClone<T>(value: T): T {
	return value === undefined ? value : (structuredClone(value) as T);
}

export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) return false;
	return keysA.every((key) =>
		deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
	);
}

function wholeFrom(value: unknown): string | null {
	if (typeof value !== "string") return null;
	return FROM_RE.exec(value)?.[1] ?? null;
}

function walk(value: unknown, deps: BuildDeps): unknown {
	if (typeof value === "string") {
		const key = wholeFrom(value);
		if (key !== null) return deepClone(deps.from(key) ?? null);
		return deps.text(value);
	}
	if (Array.isArray(value)) {
		const onlyKey = value.length === 1 ? wholeFrom(value[0]) : null;
		if (onlyKey !== null) return deepClone(deps.from(onlyKey) ?? null);
		return value.map((item) => walk(item, deps));
	}
	if (value !== null && typeof value === "object") {
		const result: Frontmatter = {};
		for (const [key, inner] of Object.entries(value as Frontmatter)) result[key] = walk(inner, deps);
		return result;
	}
	return value;
}

/** Substitutes variables structurally so list-typed and quoted values stay valid YAML. */
export function buildFrontmatter(template: Frontmatter, deps: BuildDeps): Frontmatter {
	return walk(template, deps) as Frontmatter;
}

/**
 * Existing non-empty values are never changed. Missing keys are appended in template order;
 * empty existing values are filled in place.
 */
export function mergeFrontmatter(
	existing: Frontmatter | null,
	template: Frontmatter,
): { merged: Frontmatter; changed: boolean } {
	const merged: Frontmatter = { ...(existing ?? {}) };
	let changed = false;
	for (const [key, value] of Object.entries(template)) {
		if (!(key in merged)) {
			merged[key] = value;
			changed = true;
		} else if (isEmpty(merged[key]) && !isEmpty(value)) {
			merged[key] = value;
			changed = true;
		}
	}
	return { merged, changed };
}

/** `---` block ending with a newline, or "" for an empty map. Null values are written as `key:`. */
export function serializeFrontmatter(frontmatter: Frontmatter, stringify: (value: unknown) => string): string {
	if (Object.keys(frontmatter).length === 0) return "";
	let yaml = stringify(frontmatter);
	yaml = yaml.replace(/^(\s*(?:- )?[^\s:#][^:\n]*?):[ \t]+null[ \t]*$/gm, "$1:");
	if (!yaml.endsWith("\n")) yaml += "\n";
	return `---\n${yaml}---\n`;
}
