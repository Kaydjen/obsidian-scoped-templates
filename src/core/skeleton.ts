import { KEYS, KNOWN_KEYS } from "../constants";
import { isEmpty } from "./frontmatter";

const MAX_PROPERTY_KEYS = 12;
const DATE_VALUES: Record<string, string> = {
	datetime: "{{date:YYYY-MM-DDTHH:mm:ss}}",
	date: "{{date:YYYY-MM-DD}}",
};

/**
 * Property names used by at least `threshold` of the given notes, most common first
 * (ties keep first-seen order). Config keys are never returned.
 */
export function commonKeys(
	notes: string[][],
	threshold: number,
	configPrefix: string,
	limit = MAX_PROPERTY_KEYS,
): string[] {
	const counts = new Map<string, number>();
	for (const keys of notes) {
		for (const key of new Set(keys)) {
			if (key.startsWith(configPrefix)) continue;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	const needed = Math.max(1, Math.ceil(notes.length * threshold));
	return [...counts]
		.filter(([, count]) => count >= needed)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([key]) => key);
}

function yamlKey(key: string): string {
	return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

/** How each template key starts: an explicit value where it fixes the Properties widget type. */
const CONFIG_LINES: Record<string, string> = {
	[KEYS.label]: `${KEYS.label}:`,
	[KEYS.where]: `${KEYS.where}: []`,
	[KEYS.except]: `${KEYS.except}: []`,
	[KEYS.into]: `${KEYS.into}:`,
	[KEYS.filename]: `${KEYS.filename}:`,
	[KEYS.open]: `${KEYS.open}: false`,
	[KEYS.link]: `${KEYS.link}: true`,
	[KEYS.command]: `${KEYS.command}:`,
};

/** Values another template gives to properties, and how to write one `key: value` entry as YAML. */
export interface PropertyValues {
	data: Record<string, unknown>;
	stringify(entry: Record<string, unknown>): string;
}

/**
 * Text of a new template. Config keys are written with explicit values where the value type
 * is unambiguous (so the Properties editor picks list / checkbox widgets); date-typed
 * properties get the matching `{{date}}`. Everything else stays empty, unless `values`
 * holds a non-empty value for the property.
 */
export function buildSkeleton(
	propertyKeys: string[],
	propertyTypes: Record<string, string>,
	configKeys: readonly string[] = KNOWN_KEYS,
	values?: PropertyValues,
): string {
	const lines = KNOWN_KEYS.filter((key) => configKeys.includes(key)).map((key) => CONFIG_LINES[key] ?? `${key}:`);
	for (const key of propertyKeys) {
		const given = values?.data[key];
		if (values && !isEmpty(given)) {
			lines.push(values.stringify({ [key]: given }).trimEnd());
			continue;
		}
		const date = DATE_VALUES[propertyTypes[key] ?? ""];
		lines.push(date === undefined ? `${yamlKey(key)}:` : `${yamlKey(key)}: "${date}"`);
	}
	const body = lines.map((line) => `${line}\n`).join("");
	return `---\n${body}---\n`;
}
