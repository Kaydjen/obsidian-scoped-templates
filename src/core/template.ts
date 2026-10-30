import { CONFIG_PREFIX, KEYS, KNOWN_KEYS } from "../constants";
import { parsePattern, type Pattern } from "./pattern";

export interface TemplateConfig {
	label?: string;
	where: Pattern[] | null;
	except: Pattern[];
	into?: string;
	filename?: string;
	open: boolean;
	command?: string;
}

export interface ParsedTemplate {
	config: TemplateConfig;
	/** Frontmatter without config keys. */
	frontmatter: Record<string, unknown>;
	body: string;
}

export type ParseYaml = (text: string) => unknown;

const FRONTMATTER_RE = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const TITLE_RE = /\{\{\s*title\s*\}\}/;
const COMMAND_RE = /^[A-Za-z0-9_-]+$/;

/** `end` is the offset where the body starts; 0 when there is no frontmatter. */
export function splitFrontmatter(text: string): { yaml: string | null; body: string; end: number } {
	const match = FRONTMATTER_RE.exec(text);
	if (!match) return { yaml: null, body: text, end: 0 };
	return { yaml: match[1] ?? "", body: text.slice(match[0].length), end: match[0].length };
}

function quote(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Makes core-style templates (`key: {{date}}`) valid YAML by quoting values that start with `{{`. */
export function quoteTemplateValues(yaml: string): string {
	return yaml
		.split("\n")
		.map((line) => {
			const item = /^(\s*-\s+)(\{\{.*?)(\s*)$/.exec(line);
			if (item) return `${item[1]}${quote(item[2] ?? "")}${item[3]}`;
			const pair = /^(\s*[^\s#-][^:]*?:[ \t]+)(\{\{.*?)(\s*)$/.exec(line);
			if (pair) return `${pair[1]}${quote(pair[2] ?? "")}${pair[3]}`;
			return line;
		})
		.join("\n");
}

function asString(value: unknown, key: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") throw new Error(`${key} must be text`);
	return value;
}

function asPatterns(value: unknown, key: string): Pattern[] | null {
	if (value === undefined || value === null) return null;
	const items = Array.isArray(value) ? value : [value];
	// An empty list (what the Properties editor leaves behind) means "not set", not "never matches".
	if (items.length === 0) return null;
	return items.map((item) => {
		if (typeof item !== "string") throw new Error(`${key} must be text or a list of text`);
		try {
			return parsePattern(item);
		} catch (error) {
			throw new Error(`${key}: ${(error as Error).message}`);
		}
	});
}

function extractConfig(raw: Record<string, unknown>): TemplateConfig {
	for (const key of Object.keys(raw)) {
		if (key.startsWith(CONFIG_PREFIX) && !KNOWN_KEYS.includes(key)) {
			throw new Error(`Unknown key ${key}`);
		}
	}
	const into = asString(raw[KEYS.into], KEYS.into);
	const filename = asString(raw[KEYS.filename], KEYS.filename);
	if (into !== undefined && TITLE_RE.test(into)) throw new Error(`${KEYS.into} cannot use {{title}}`);
	if (filename !== undefined && TITLE_RE.test(filename)) throw new Error(`${KEYS.filename} cannot use {{title}}`);

	const open = raw[KEYS.open];
	if (open !== undefined && open !== null && typeof open !== "boolean") {
		throw new Error(`${KEYS.open} must be true or false`);
	}
	const command = asString(raw[KEYS.command], KEYS.command);
	if (command !== undefined && !COMMAND_RE.test(command)) {
		throw new Error(`${KEYS.command} may only contain letters, digits, - and _`);
	}

	const config: TemplateConfig = {
		where: asPatterns(raw[KEYS.where], KEYS.where),
		except: asPatterns(raw[KEYS.except], KEYS.except) ?? [],
		open: open === true,
	};
	const label = asString(raw[KEYS.label], KEYS.label);
	if (label !== undefined && label.trim() !== "") config.label = label.trim();
	if (into !== undefined) config.into = into;
	if (filename !== undefined && filename.trim() !== "") config.filename = filename;
	if (command !== undefined) config.command = command;
	return config;
}

/** Throws an Error with a readable message when the template is invalid. */
export function parseTemplate(text: string, parseYaml: ParseYaml): ParsedTemplate {
	const normalized = text.replace(/\r\n/g, "\n");
	const { yaml, body } = splitFrontmatter(normalized);

	let raw: Record<string, unknown> = {};
	if (yaml !== null && yaml.trim() !== "") {
		let parsed: unknown;
		try {
			parsed = parseYaml(quoteTemplateValues(yaml));
		} catch (error) {
			throw new Error(`Invalid YAML: ${(error as Error).message.split("\n")[0]}`);
		}
		if (parsed === null || parsed === undefined) parsed = {};
		if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Frontmatter must be a map");
		raw = parsed as Record<string, unknown>;
	}

	const config = extractConfig(raw);
	const frontmatter: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (!key.startsWith(CONFIG_PREFIX)) frontmatter[key] = value;
	}
	return { config, frontmatter, body };
}
