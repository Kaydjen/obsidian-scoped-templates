import { KEYS } from "../constants";
import { joinPath, splitPath } from "./paths";
import { isCaptureName } from "./pattern";

/** Where a value is being typed; decides which suggestions make sense. */
export type FieldKind = "where" | "except" | "into" | "filename" | "value" | "body";

export interface Suggestion {
	/** What the list shows. */
	label: string;
	/** What replaces the typed token. */
	insert: string;
	/** Short kind word shown next to the label. */
	tag: string;
	/** What the item gives the user. */
	definition: string;
	/** One concrete case ending in a result; shown after the "Example" label. */
	scenario?: string;
	/** Concrete value for the current vault, when one can be computed. */
	example?: string;
	/** Word in front of the example; "e.g." when absent. */
	exampleLabel?: string;
	/** Explains the field itself; choosing it changes nothing. */
	help?: boolean;
}

export interface Suggestions {
	/** Range of the text that `insert` replaces. */
	from: number;
	to: number;
	items: Suggestion[];
}

export interface CatalogContext {
	/** Scope root of the template being edited. */
	root: string;
	/** Names of the folders directly inside a vault-relative path. */
	subfolders(path: string): string[];
	/** Capture names defined by the template's `tpl-where`. */
	captures: string[];
	/** Capture values taken from a real folder in scope. */
	captureExamples: Record<string, string>;
	/** The real folder those capture values came from; examples run the template from it. */
	sampleFolder?: string;
	propertyKeys: string[];
	/** File name of the template being edited, for examples. */
	templateName?: string;
	/** The name the template has in the list: `tpl-label` when set, else the file name. */
	templateLabel?: string;
	/** A real value of a property in the notes of the scope, for examples. */
	propertyExample?(key: string): string | undefined;
	format(kind: "date" | "time", format?: string): string;
}

const DATE_FORMATS = ["YYYY-MM-DD", "YYMMDDHHmm", "YYYY-MM-DDTHH:mm:ss", "DD.MM.YYYY", "YYYY-MM"];
const TIME_FORMATS = ["HH:mm", "HH:mm:ss", "HHmm"];
const RESULT_LABEL = "Result:";
const SAMPLE_NOTE = "Notes";

/**
 * Every text first says what the item lets the user do, then gives one example that ends in a result.
 * Three groups: `tpl-into` (a folder), `tpl-filename` (the name), anything else (note text).
 */
type Group = "folder" | "name" | "note";
const groupOf = (kind: FieldKind): Group => (kind === "into" ? "folder" : kind === "filename" ? "name" : "note");

const CREATED_IF_MISSING = "If that folder does not exist yet, it is created automatically.";
const FORMAT_LETTERS =
	"To use another format, change the letters after the colon: YY year, MM month, DD day, HH hour, mm minute.";
const NEXT_LIST = "Choose the property in the next list.";
const ORIGIN = "the note you run the template from";

/** The result of a date or time item, said for the place where it is used. */
const created = (group: Group, when: "today" | "now", value: string): string =>
	group === "folder"
		? `a note created ${when} is saved in "${value}/".`
		: group === "name"
			? `a note created ${when} gets "${value}" in its name.`
			: `the value becomes "${value}".`;

const sampleFolder = (ctx: CatalogContext): string => ctx.sampleFolder ?? ctx.root;
const runFrom = (ctx: CatalogContext): string =>
	`you run the template from "${joinPath(sampleFolder(ctx), `${SAMPLE_NOTE}.md`)}"`;

const quoteList = (names: string[]): string => names.map((name) => `"${name}"`).join(" and ");

const DATE = {
	folder: `Lets the new note be saved in a folder named with the date of creation, so each day gets its own folder. ${CREATED_IF_MISSING}`,
	name: "Lets the new note's name include the date of creation.",
	note: "Lets the note show the date of creation.",
} satisfies Record<Group, string>;

const MONTH = `Lets the new note be saved in a folder named with the year and month of creation, so each month gets its own folder. ${CREATED_IF_MISSING}`;

const MINUTE = {
	name: `Lets the new note's name include the date and time of creation, down to the minute. ${FORMAT_LETTERS}`,
	note: `Lets the note show the date and time of creation, down to the minute. ${FORMAT_LETTERS}`,
};

const DATE_FORMAT = {
	folder: `Lets the new note be saved in a folder named with the date of creation in this format. ${CREATED_IF_MISSING}`,
	name: "Lets the new note's name include the date of creation, in this format.",
	note: "Lets the note show the date of creation, in this format.",
} satisfies Record<Group, string>;

const TIME = {
	name: "Lets the new note's name include the time of creation.",
	note: "Lets the note show the time of creation.",
};

const TIME_FORMAT = {
	name: "Lets the new note's name include the time of creation, in this format.",
	note: "Lets the note show the time of creation, in this format.",
};

const fromText = (group: Group, key: string | undefined, ctx: CatalogContext): { definition: string; scenario?: string } => {
	if (key === undefined) {
		return {
			definition:
				group === "folder"
					? `Lets the new note be saved in a folder named after a property of ${ORIGIN}. ${NEXT_LIST}`
					: group === "name"
						? `Lets the new note's name include a property of ${ORIGIN}. ${NEXT_LIST}`
						: `Lets the note copy a property of ${ORIGIN}. ${NEXT_LIST}`,
		};
	}
	const value = ctx.propertyExample?.(key) ?? `${key} value`;
	const given = `that note's ${key} is "${value}"`;
	return group === "folder"
		? {
				definition: `Lets the new note be saved in a folder named after the "${key}" property of ${ORIGIN}. ${CREATED_IF_MISSING}`,
				scenario: `${given}, so the new note is saved in "${value}/". If it has none, this part of the path is left out.`,
			}
		: group === "name"
			? {
					definition: `Lets the new note's name include the "${key}" property of ${ORIGIN}.`,
					scenario: `${given}, so "${value}" appears in the new note's name. If it has none, nothing is added.`,
				}
			: {
					definition: `Lets the note copy the "${key}" property of ${ORIGIN}.`,
					scenario: `${given}, so the value becomes "${value}". If it has none, the value is taken from nearby notes when they all agree; otherwise it stays empty.`,
				};
};

const captureText = (group: Group, name: string, ctx: CatalogContext): { definition: string; scenario?: string } => {
	const folder = ctx.captureExamples[name];
	const definition =
		group === "folder"
			? `Lets the new note be saved in the folder that {{${name}}} stands for.`
			: group === "name"
				? "Lets the new note's name include the name of a folder."
				: "Lets the note contain the name of a folder.";
	if (folder === undefined) return { definition };
	const scenario =
		group === "folder"
			? `${runFrom(ctx)}, so the new note is saved in "${joinPath(ctx.root, folder)}/".`
			: group === "name"
				? `${runFrom(ctx)}, so "${folder}" appears in the new note's name.`
				: `${runFrom(ctx)}, so the value becomes "${folder}".`;
	return { definition, scenario };
};

const empty = (at: number): Suggestions => ({ from: at, to: at, items: [] });

const variable = (label: string, definition: string, scenario?: string, insert = label): Suggestion => {
	const item: Suggestion = { label, insert, tag: "variable", definition };
	if (scenario !== undefined) item.scenario = scenario;
	return item;
};

/** Variables usable in a field of this kind, in the order the list shows them. */
function variablesFor(kind: FieldKind, ctx: CatalogContext): Suggestion[] {
	const group = groupOf(kind);
	// A folder path is not sanitized like a file name: no time (has ":") and no free text.
	const forFolder = group === "folder";
	const items: Suggestion[] = [
		variable("{{date}}", DATE[group], created(group, "today", ctx.format("date"))),
		forFolder
			? variable("{{date:YYYY-MM}}", MONTH, created(group, "today", ctx.format("date", "YYYY-MM")))
			: variable("{{date:YYMMDDHHmm}}", MINUTE[group as "name" | "note"], created(group, "now", ctx.format("date", "YYMMDDHHmm"))),
	];
	if (!forFolder) {
		const textGroup = group as "name" | "note";
		items.push(
			variable("{{time}}", TIME[textGroup], created(group, "now", ctx.format("time"))),
			variable(
				"{{selection}}",
				group === "name"
					? "Lets the new note's name include the text you selected."
					: `Lets the note contain the text you selected in ${ORIGIN}.`,
				group === "name"
					? `you select "Pascaline" in ${ORIGIN}, so "Pascaline" appears in the new note's name. Without a selection, nothing is added.`
					: `you select "Pascaline", so the value becomes "Pascaline". Empty if nothing was selected.`,
			),
		);
	}
	const from = fromText(group, undefined, ctx);
	items.push(variable("{{from:}}", from.definition, from.scenario, "{{from:"));
	for (const name of ctx.captures) {
		const text = captureText(group, name, ctx);
		items.push(variable(`{{${name}}}`, text.definition, text.scenario));
	}
	if (group === "note") {
		items.push(
			variable("{{title}}", "Lets the note repeat its own name.", `the new note is named "Meeting", so the value becomes "Meeting".`),
			variable(
				"{{source}}",
				`Lets the new note link back to ${ORIGIN}.`,
				`the value becomes [[${joinPath(sampleFolder(ctx), SAMPLE_NOTE)}]]. Empty when you apply the template to an existing note.`,
			),
		);
	}
	if (kind === "body") {
		items.push(
			variable(
				"{{cursor}}",
				"Lets you choose where the cursor stands after the template is inserted.",
				`you write "Decision: {{cursor}}", and the cursor lands after "Decision: ". The marker itself disappears.`,
			),
		);
	}
	return items;
}

function variableSuggestions(kind: FieldKind, text: string, caret: number, open: number, ctx: CatalogContext): Suggestions {
	const inner = text.slice(open + 2, caret);
	const to = caret + (text.slice(caret).startsWith("}}") ? 2 : 0);
	const lower = inner.toLowerCase();
	const group = groupOf(kind);
	let items: Suggestion[];

	if (lower.startsWith("from:")) {
		const query = lower.slice(5);
		items = ctx.propertyKeys
			.filter((key) => key.toLowerCase().includes(query))
			.map((key) => {
				const entry = fromText(group, key, ctx);
				return variable(`{{from:${key}}}`, entry.definition, entry.scenario);
			});
	} else if (lower.startsWith("date:") || lower.startsWith("time:")) {
		const isDate = lower.startsWith("date:");
		const query = lower.slice(5);
		const formats = group === "folder" ? DATE_FORMATS.filter((format) => !format.includes(":")) : DATE_FORMATS;
		items = (isDate ? formats : group === "folder" ? [] : TIME_FORMATS)
			.filter((format) => format.toLowerCase().includes(query))
			.map((format) => {
				const when = !isDate || /H|mm|ss/.test(format) ? "now" : "today";
				const definition = isDate ? DATE_FORMAT[group] : TIME_FORMAT[group as "name" | "note"];
				const value = ctx.format(isDate ? "date" : "time", format);
				return variable(`{{${isDate ? "date" : "time"}:${format}}}`, definition, created(group, when, value));
			});
	} else {
		items = variablesFor(kind, ctx).filter((item) => item.label.toLowerCase().includes(`{{${lower}`));
	}
	return { from: open, to, items };
}

/**
 * Label for a folder name in `tpl-where`: named after the folder it sits in ("project" -> {{project}}),
 * or "folder" when that folder has no usable name; never one that is already defined.
 */
function captureLabel(typedPath: string, ctx: CatalogContext): string {
	const segments = typedPath.split("/").filter((part) => part !== "");
	const parent = segments.length === 0 ? splitPath(ctx.root).pop() : segments[segments.length - 1];
	const base = parent !== undefined && isCaptureName(parent) ? parent : "folder";
	let name = base;
	for (let number = 2; ctx.captures.includes(name); number++) name = `${base}${number}`;
	return `{{${name}}}`;
}

const noteIn = (folder: string): string => `"${joinPath(folder, `${SAMPLE_NOTE}.md`)}"`;

/** Folder-path completion for `tpl-where`, `tpl-except` and `tpl-into`. */
function pathSuggestions(kind: FieldKind, text: string, caret: number, ctx: CatalogContext): Suggestions {
	const before = text.slice(0, caret);
	const tokenStart = before.lastIndexOf("/") + 1;
	const token = before.slice(tokenStart);
	const absolute = kind === "into" && before.startsWith("/");

	let path = absolute ? "" : ctx.root;
	let known = true;
	for (const segment of before.slice(0, tokenStart).split("/").filter((part) => part !== "")) {
		const capture = /^\{\{\s*([\w-]+)\s*\}\}$/.exec(segment);
		if (capture) {
			const example = ctx.captureExamples[capture[1] ?? ""];
			if (example === undefined) {
				known = false;
				break;
			}
			path = joinPath(path, example);
		} else if (/[{*?]/.test(segment)) {
			known = false;
			break;
		} else {
			path = joinPath(path, segment);
		}
	}

	const matches = (value: string) => token === "" || value.toLowerCase().includes(token.toLowerCase());
	const names = known ? ctx.subfolders(path) : [];
	const items: Suggestion[] = [];

	if (kind === "into" && text === "") {
		const first = ctx.subfolders("")[0];
		const item: Suggestion = {
			label: "/",
			insert: "/",
			tag: "vault",
			definition:
				ctx.root === ""
					? "Lets the path start at the vault root."
					: `Lets the path start at the vault root instead of the "${ctx.root}" folder that this template belongs to.`,
		};
		if (first !== undefined && ctx.root !== "") {
			item.scenario = `"/${first}" saves the new note in "${first}/" of the vault.`;
		}
		items.push(item);
	}
	for (const name of names) {
		if (!matches(name)) continue;
		const full = joinPath(path, name);
		const inner = ctx.subfolders(full)[0];
		const other = names.find((entry) => entry !== name);
		// The slash lets the list continue with the folder's children; it is harmless at the end of a value.
		const item: Suggestion = { label: name, insert: `${name}/`, tag: "folder", definition: "" };
		if (kind === "into") {
			item.definition = `Lets the new note be saved in the "${name}" folder.`;
		} else if (kind === "except") {
			item.definition = `Lets you hide this template in the "${name}" folder.`;
			item.scenario = `you cannot run it from ${noteIn(full)}${inner === undefined ? "" : ` or ${noteIn(joinPath(full, inner))}`}.`;
		} else {
			item.definition = `Lets you run this template only from notes in the "${name}" folder.`;
			item.scenario =
				`you can run it from ${noteIn(full)}` +
				(inner === undefined ? "" : ` and ${noteIn(joinPath(full, inner))}`) +
				(other === undefined ? "" : `, but not from ${noteIn(joinPath(path, other))}`) +
				".";
		}
		items.push(item);
	}
	// A glob has no use after another glob or a variable: the item would only append more stars.
	if ((kind === "where" || kind === "except") && !/[*{]/.test(token)) {
		const hide = kind === "except";
		const letter = names[0]?.[0];
		const starting = (prefix: string) => names.filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()));
		const item: Suggestion = {
			label: `${token}*`,
			insert: `${token}*`,
			tag: "wildcard",
			definition:
				token === ""
					? hide
						? "Lets you hide this template in every folder, or only in those whose names start with the letters you write before it."
						: "Lets one item cover every folder, or only those whose names start with the letters you write before it."
					: hide
						? `Lets you hide this template in every folder whose name starts with "${token}".`
						: `Lets one item cover every folder whose name starts with "${token}".`,
		};
		if (token === "" && letter !== undefined) {
			item.scenario = `"*" covers ${quoteList(names.slice(0, 2))}, and "${letter}*" covers ${quoteList(starting(letter).slice(0, 2))}.`;
		} else if (token !== "" && starting(token).length > 0) {
			item.scenario = `"${token}*" covers ${quoteList(starting(token).slice(0, 2))}.`;
		}
		items.push(item);
	}
	const label = captureLabel(before.slice(0, tokenStart), ctx);
	if (kind === "where" && label.startsWith(token)) {
		const sample = names.find((name) => !name.startsWith("_")) ?? names[0];
		const item: Suggestion = {
			label,
			// The slash opens the next level, like for a folder; it is harmless at the end of a value.
			insert: `${label}/`,
			tag: "folder name",
			definition: "Lets the new note reuse the name of a folder.",
		};
		if (sample !== undefined) {
			item.scenario = `you run the template from ${noteIn(joinPath(path, sample))}, so the name "${sample}" can be used in the new note's name, folder or properties.`;
		}
		items.push(item);
	}
	if (kind === "except" && "_*".startsWith(token)) {
		const sample = names.find((name) => name.startsWith("_"));
		const item: Suggestion = {
			label: "_*",
			insert: "_*",
			tag: "wildcard",
			definition: `Lets you hide this template in every folder whose name starts with "_".`,
		};
		if (sample !== undefined) item.scenario = `you cannot run it from ${noteIn(joinPath(path, sample))}.`;
		items.push(item);
	}
	if (kind === "into" && (token === "" || token.startsWith("{"))) {
		for (const item of variablesFor(kind, ctx)) {
			if (!item.label.startsWith(token)) continue;
			const isCapture = ctx.captures.some((name) => item.label === `{{${name}}}`);
			items.push(isCapture ? { ...item, insert: `${item.insert}/` } : item);
		}
	}
	return { from: tokenStart, to: caret, items };
}

/** The value with every variable that has a known example replaced; others stay as written. */
function previewText(text: string, ctx: CatalogContext): string {
	return text.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (whole, inner: string) => {
		const [rawName = "", ...rest] = inner.split(":");
		const name = rawName.trim();
		const format = rest.length > 0 ? rest.join(":") : undefined;
		if (name === "date" || name === "time") return ctx.format(name, format);
		return ctx.captureExamples[name] ?? whole;
	});
}

/** For the folder and the name: what the whole value becomes when this item is chosen. */
function withResult(kind: FieldKind, text: string, result: Suggestions, ctx: CatalogContext): Suggestions {
	if (kind !== "into" && kind !== "filename") return result;
	const items = result.items.map((item) => {
		const next = previewText(text.slice(0, result.from) + item.insert + text.slice(result.to), ctx);
		if (next.includes("{{")) return item;
		let value = next;
		if (kind === "into") {
			const path = next.startsWith("/") ? joinPath(next) : joinPath(ctx.root, next);
			if (path === "") return item;
			value = `${path}/`;
		}
		return { ...item, example: value, exampleLabel: RESULT_LABEL };
	});
	return { ...result, items };
}

/** Suggestions for the text before `caret`; the whole option list when nothing is typed yet. */
export function suggest(kind: FieldKind, text: string, caret: number, ctx: CatalogContext): Suggestions {
	const before = text.slice(0, caret);
	const open = before.lastIndexOf("{{");
	const inVariable = open !== -1 && !before.slice(open).includes("}}");

	if (kind === "where" || kind === "except") return pathSuggestions(kind, text, caret, ctx);
	if (inVariable) return withResult(kind, text, variableSuggestions(kind, text, caret, open, ctx), ctx);
	// Obsidian lists a property's existing values itself; ours would pile on top, so only `{{` opens ours.
	if (kind === "body" || kind === "value") return empty(caret);
	if (kind === "into") return withResult(kind, text, pathSuggestions(kind, text, caret, ctx), ctx);

	const token = /[A-Za-z]*$/.exec(before)?.[0] ?? "";
	const from = caret - token.length;
	const lower = token.toLowerCase();
	const items = variablesFor(kind, ctx).filter(
		(item) => token === "" || item.label.slice(2).toLowerCase().startsWith(lower),
	);
	return withResult(kind, text, { from, to: caret, items }, ctx);
}

const KEY_DEFINITIONS: Record<string, string> = {
	[KEYS.label]: "Lets you choose the template's name in the list.",
	[KEYS.where]: "Lets you choose the folders you can run this template from.",
	[KEYS.except]: "Lets you hide this template in some of the folders where it would otherwise be available.",
	[KEYS.into]: "Lets you choose the folder where the new note is saved.",
	[KEYS.filename]: "Lets you choose the name of the new note.",
	[KEYS.open]: "Lets you choose whether the new note opens right after it is created.",
	[KEYS.command]: "Lets you run this template with a hotkey.",
};

/** One line on what a template key is for; null for a key that is not ours. */
export const keyDefinition = (key: string): string | null => KEY_DEFINITIONS[key] ?? null;

/** What a template key is for, with an example; shown on hover and as the first row of an empty field. */
export function keyHelp(key: string, ctx: CatalogContext): Suggestion | null {
	const definition = keyDefinition(key);
	if (definition === null) return null;
	const item: Suggestion = { label: key, insert: "", tag: "info", definition, help: true };
	const name = ctx.templateName ?? "Decision";
	const folder = ctx.subfolders(ctx.root)[0];
	let scenario: string | undefined;
	switch (key) {
		case KEYS.label:
			scenario = `leave it empty, and the list shows the file name, "${name}".`;
			break;
		case KEYS.where:
			scenario =
				ctx.root === ""
					? "leave it empty, and you can run it from any folder."
					: `leave it empty, and you can run it from "${ctx.root}/" and every folder inside it.`;
			break;
		case KEYS.except:
			scenario =
				folder === undefined
					? undefined
					: `write "${folder}", and you cannot run it from ${noteIn(joinPath(ctx.root, folder))}.`;
			break;
		case KEYS.into:
			scenario = `leave it empty, and the new note is saved next to ${ORIGIN}.`;
			break;
		case KEYS.filename:
			scenario =
				"leave it empty, and the name is the text you selected, or the template's file name with the date and time if nothing is selected.";
			break;
		case KEYS.open:
			scenario = "unchecked, the new note is created in the background and a link to it appears where your cursor is. If no note is being edited, it opens anyway.";
			break;
		case KEYS.command: {
			const label =ctx.templateLabel ?? name;
			scenario = `write "decision" here, then assign a key to "Create: ${label}" or "Apply: ${label}" in Obsidian's Hotkeys settings.`;
			break;
		}
	}
	if (scenario !== undefined) item.scenario = scenario;
	return item;
}

/** The first row of an empty field's option list. */
export function fieldHelp(kind: FieldKind, ctx: CatalogContext): Suggestion | null {
	switch (kind) {
		case "where":
			return keyHelp(KEYS.where, ctx);
		case "except":
			return keyHelp(KEYS.except, ctx);
		case "into":
			return keyHelp(KEYS.into, ctx);
		case "filename":
			return keyHelp(KEYS.filename, ctx);
		default:
			return null;
	}
}
