import { describe, expect, it } from "vitest";
import { fieldHelp, keyHelp, suggest, type CatalogContext } from "../src/core/catalog";

const folders: Record<string, string[]> = {
	project: ["a9-pascaline", "_backlog"],
	"project/a9-pascaline": ["research", "decisions"],
	"": ["project", "domain"],
};

const ctx = (overrides: Partial<CatalogContext> = {}): CatalogContext => ({
	root: "project",
	subfolders: (path) => folders[path] ?? [],
	captures: ["project"],
	captureExamples: { project: "a9-pascaline" },
		sampleFolder: "project/a9-pascaline",
	propertyKeys: ["status", "links", "project"],
	format: (kind, format) => `${kind}:${format ?? "default"}`,
	...overrides,
});

const labels = (kind: Parameters<typeof suggest>[0], text: string, caret = text.length, c = ctx()) =>
	suggest(kind, text, caret, c).items.map((item) => item.label);

describe("tpl-where / tpl-except", () => {
	it("lists everything possible on an empty field", () => {
		expect(labels("where", "")).toEqual(["a9-pascaline", "_backlog", "*", "{{project2}}"]);
		expect(labels("except", "")).toEqual(["a9-pascaline", "_backlog", "*", "_*"]);
	});

	it("completes the next path segment", () => {
		expect(labels("where", "a9-pascaline/")).toEqual(["research", "decisions", "*", "{{a9-pascaline}}"]);
		const result = suggest("where", "a9-pascaline/re", 15, ctx({ root: "project" }));
		expect(result.from).toBe(13);
		expect(result.items.map((item) => item.label)).toEqual(["research", "re*"]);
	});

	it("filters folders by what is typed", () => {
		expect(labels("where", "a9")).toEqual(["a9-pascaline", "a9*"]);
	});

	it("uses the example capture value to look inside a captured folder", () => {
		expect(labels("where", "{{project}}/")).toEqual(["research", "decisions", "*", "{{folder}}"]);
	});
});

describe("continuing a path", () => {
	it("inserts folders with a trailing slash so the next level can open", () => {
		const inserts = suggest("into", "", 0, ctx()).items.map((item) => item.insert);
		expect(inserts).toContain("a9-pascaline/");
		expect(inserts).toContain("{{project}}/");
		expect(inserts).toContain("{{date}}");
		expect(suggest("where", "", 0, ctx()).items[0]?.insert).toBe("a9-pascaline/");
	});
});

describe("tpl-into", () => {
	it("offers the vault root, folders and variables on an empty field", () => {
		const items = labels("into", "");
		expect(items.slice(0, 3)).toEqual(["/", "a9-pascaline", "_backlog"]);
		expect(items).toContain("{{project}}");
		expect(items).toContain("{{date}}");
		expect(items).not.toContain("{{title}}");
	});

	it("starts from the vault root after a leading slash", () => {
		expect(labels("into", "/")).toEqual(["project", "domain", "{{date}}", "{{date:YYYY-MM}}", "{{from:}}", "{{project}}"]);
	});

	it("follows a capture into its example folder", () => {
		expect(labels("into", "{{project}}/")).toContain("decisions");
	});

	it("offers only folder-safe variables", () => {
		const items = labels("into", "");
		expect(items).not.toContain("{{time}}");
		expect(items).not.toContain("{{selection}}");
		expect(labels("into", "x/{{date:")).toEqual(["{{date:YYYY-MM-DD}}", "{{date:YYMMDDHHmm}}", "{{date:DD.MM.YYYY}}", "{{date:YYYY-MM}}"]);
		expect(labels("into", "{{time:")).toEqual([]);
	});

	it("shows the example value of a capture", () => {
		const item = suggest("into", "", 0, ctx()).items.find((entry) => entry.label === "{{project}}");
		expect(item?.example).toBe("project/a9-pascaline/");
		expect(item?.exampleLabel).toBe("Result:");
	});

	it("shows the resulting folder path for a chosen item", () => {
		const result = suggest("into", "{{project}}/", 12, ctx());
		const folder = result.items.find((entry) => entry.label === "decisions");
		expect(folder?.example).toBe("project/a9-pascaline/decisions/");
		expect(folder?.definition).toBe('Lets the new note be saved in the "decisions" folder.');
		const date = suggest("into", "", 0, ctx()).items.find((entry) => entry.label === "{{date}}");
		expect(date?.example).toBe("project/date:default/");
		const root = suggest("into", "", 0, ctx()).items.find((entry) => entry.label === "/");
		expect(root?.example).toBeUndefined();
	});

	it("shows the resulting file name", () => {
		const item = suggest("filename", "decision-", 9, ctx()).items.find((entry) => entry.label === "{{date}}");
		expect(item?.example).toBe("decision-date:default");
	});
});

describe("variables", () => {
	it("filters while typing inside braces and replaces the whole token", () => {
		const result = suggest("filename", "x-{{da", 6, ctx());
		expect(result.from).toBe(2);
		expect(result.items.map((item) => item.label)).toEqual(["{{date}}", "{{date:YYMMDDHHmm}}"]);
	});

	it("swallows an already typed closing pair", () => {
		expect(suggest("filename", "{{da}}", 4, ctx()).to).toBe(6);
	});

	it("lists property names after from:", () => {
		expect(labels("value", "{{from:st")).toEqual(["{{from:status}}"]);
	});

	it("lists date formats after date:", () => {
		const result = suggest("filename", "{{date:", 7, ctx());
		expect(result.items[1]?.label).toBe("{{date:YYMMDDHHmm}}");
		expect(result.items[1]?.example).toBe("date:YYMMDDHHmm");
	});

	it("offers every variable on an empty file name, none for unrelated text", () => {
		expect(labels("filename", "")).toContain("{{selection}}");
		expect(labels("filename", "decision")).toEqual([]);
		expect(labels("filename", "")).not.toContain("{{title}}");
	});

	it("an ordinary property opens the list only after braces, so Obsidian's own value list is not covered", () => {
		expect(labels("value", "")).toEqual([]);
		expect(labels("value", "da")).toEqual([]);
		expect(labels("value", "{{")).toContain("{{date}}");
	});

	it("body only reacts to braces and includes cursor and title", () => {
		expect(labels("body", "plain text")).toEqual([]);
		const items = labels("body", "see {{");
		expect(items).toContain("{{cursor}}");
		expect(items).toContain("{{title}}");
	});
});

describe("explanation texts", () => {
	const find = (kind: Parameters<typeof suggest>[0], text: string, label: string, c = ctx()) =>
		suggest(kind, text, text.length, c).items.find((item) => item.label === label);

	it("explains {{name}} with a result from a real folder", () => {
		const item = find("where", "", "{{project2}}");
		expect(item?.tag).toBe("folder name");
		expect(item?.insert).toBe("{{project2}}/");
		expect(item?.definition).toBe("Lets the new note reuse the name of a folder.");
		expect(item?.scenario).toBe(
			`you run the template from "project/a9-pascaline/Notes.md", so the name "a9-pascaline" can be used in the new note's name, folder or properties.`,
		);
	});

	it("names the folders in where / except examples", () => {
		expect(find("where", "a9-pascaline/", "decisions")?.scenario).toBe(
			`you can run it from "project/a9-pascaline/decisions/Notes.md", but not from "project/a9-pascaline/research/Notes.md".`,
		);
		expect(find("except", "", "_*")?.scenario).toBe(`you cannot run it from "project/_backlog/Notes.md".`);
		expect(find("where", "", "*")?.scenario).toBe(
			`"*" covers "a9-pascaline" and "_backlog", and "a*" covers "a9-pascaline".`,
		);
	});

	it("says what a capture gives in each place", () => {
		expect(find("filename", "", "{{project}}")?.scenario).toBe(
			`you run the template from "project/a9-pascaline/Notes.md", so "a9-pascaline" appears in the new note's name.`,
		);
		expect(find("value", "{{", "{{project}}")?.scenario).toBe(
			`you run the template from "project/a9-pascaline/Notes.md", so the value becomes "a9-pascaline".`,
		);
	});

	it("uses a real property value for from:", () => {
		const c = ctx({ propertyExample: (key) => (key === "status" ? "active" : undefined) });
		expect(find("value", "{{from:", "{{from:status}}", c)?.scenario).toContain(`that note's status is "active"`);
		expect(find("value", "{{from:", "{{from:links}}", c)?.scenario).toContain(`"links value"`);
	});

	it("explains the field only for fields that have a list", () => {
		expect(fieldHelp("where", ctx())?.scenario).toBe(
			'leave it empty, and you can run it from "project/" and every folder inside it.',
		);
		expect(fieldHelp("into", ctx())?.help).toBe(true);
		expect(fieldHelp("value", ctx())).toBeNull();
		expect(fieldHelp("body", ctx())).toBeNull();
	});

	it("names a new folder label after its folder, never reusing a taken one", () => {
		expect(labels("where", "", 0, ctx({ captures: [] }))).toContain("{{project}}");
		expect(labels("where", "", 0, ctx({ root: "", captures: [] }))).toContain("{{folder}}");
		expect(labels("where", "", 0, ctx({ captures: ["project", "project2"] }))).toContain("{{project3}}");
	});

	it("does not offer another * after a glob or a variable", () => {
		expect(labels("where", "a*")).not.toContain("a**");
		expect(labels("where", "{{project2}}")).not.toContain("{{project2}}*");
		expect(labels("except", "x*")).not.toContain("x**");
	});

	it("explains every template key", () => {
		for (const key of ["tpl-label", "tpl-where", "tpl-except", "tpl-into", "tpl-filename", "tpl-open", "tpl-link", "tpl-command"]) {
			const help = keyHelp(key, ctx({ templateName: "Decision" }));
			expect(help?.help).toBe(true);
			expect(help?.definition).toMatch(/^Lets you /);
		}
		expect(keyHelp("tpl-command", ctx({ templateName: "Decision" }))?.scenario).toContain('"Create: Decision"');
		expect(keyHelp("status", ctx())).toBeNull();
	});
});

describe("suggestion edge cases", () => {
	it("gives no folder suggestions below an unknown capture or a glob", () => {
		expect(labels("where", "{{nope}}/")).toEqual(["*", "{{folder}}"]);
		expect(labels("where", "a*/")).toEqual(["*", "{{folder}}"]);
	});

	it("walks an absolute tpl-into from the vault root", () => {
		expect(labels("into", "/project/")).toContain("a9-pascaline");
		expect(suggest("into", "/project/", 9, ctx()).from).toBe(9);
	});

	it("hides the vault root item once something is typed", () => {
		expect(labels("into", "a")).not.toContain("/");
		expect(labels("into", "")).toContain("/");
	});

	it("filters folders case-insensitively and by substring", () => {
		expect(labels("where", "PASC")).toContain("a9-pascaline");
		expect(labels("into", "back")).toContain("_backlog");
	});

	it("offers the underscore pattern only for except and only while it can still match", () => {
		expect(labels("where", "")).not.toContain("_*");
		expect(labels("except", "_")).toContain("_*");
		expect(labels("except", "a")).not.toContain("_*");
	});

	it("previews variables with spaces inside braces", () => {
		const item = suggest("filename", "{{ date }}-", 11, ctx()).items.find((entry) => entry.label === "{{time}}");
		expect(item?.example).toBe("date:default-time:default");
	});

	it("does not preview a result while a variable stays unresolved", () => {
		const item = suggest("filename", "{{unknown}}-", 12, ctx()).items.find((entry) => entry.label === "{{date}}");
		expect(item?.example).toBeUndefined();
	});

	it("completes after an opened brace pair in the middle of the text", () => {
		const text = "a-{{ti}}-b";
		const result = suggest("filename", text, 6, ctx());
		expect(result.from).toBe(2);
		expect(result.to).toBe(8);
		expect(result.items.map((item) => item.label)).toEqual(["{{time}}"]);
	});

	it("offers {{from:}} with a property list and only matching keys", () => {
		expect(labels("filename", "{{from:")).toEqual(["{{from:status}}", "{{from:links}}", "{{from:project}}"]);
		expect(labels("filename", "{{from:LIN")).toEqual(["{{from:links}}"]);
		expect(labels("filename", "{{from:zzz")).toEqual([]);
	});

	it("filters date formats and drops time formats for folders", () => {
		expect(labels("filename", "{{time:")).toEqual(["{{time:HH:mm}}", "{{time:HH:mm:ss}}", "{{time:HHmm}}"]);
		expect(labels("filename", "{{date:YYMM")).toEqual(["{{date:YYMMDDHHmm}}"]);
		expect(labels("into", "{{date:").some((label) => label.slice(2).includes(":HH:"))).toBe(false);
	});

	it("describes the date items for the place where they are used", () => {
		const find = (kind: Parameters<typeof suggest>[0], text: string, label: string) =>
			suggest(kind, text, text.length, ctx()).items.find((item) => item.label === label);
		expect(find("into", "", "{{date}}")?.scenario).toBe('a note created today is saved in "date:default/".');
		expect(find("filename", "", "{{date:YYMMDDHHmm}}")?.scenario).toBe('a note created now gets "date:YYMMDDHHmm" in its name.');
		expect(find("value", "{{", "{{time}}")?.scenario).toBe('the value becomes "time:default".');
	});

	it("names the key help for a root template and without a sample folder", () => {
		const root = ctx({ root: "", subfolders: () => [] });
		expect(keyHelp("tpl-where", root)?.scenario).toBe("leave it empty, and you can run it from any folder.");
		expect(keyHelp("tpl-except", root)?.scenario).toBeUndefined();
		expect(keyHelp("tpl-label", ctx())?.scenario).toContain('"Decision"');
	});

	it("explains the vault root item according to the scope", () => {
		const rootItem = (c: CatalogContext) => suggest("into", "", 0, c).items[0];
		expect(rootItem(ctx())?.definition).toContain('"project"');
		expect(rootItem(ctx())?.scenario).toBe('"/project" saves the new note in "project/" of the vault.');
		expect(rootItem(ctx({ root: "" }))?.definition).toBe("Lets the path start at the vault root.");
		expect(rootItem(ctx({ root: "" }))?.scenario).toBeUndefined();
	});
});

describe("key help details", () => {
	it("names both commands after the effective label, falling back to the file name", () => {
		const text = (c: CatalogContext) => keyHelp("tpl-command", c)?.scenario;
		expect(text(ctx({ templateName: "decision-file", templateLabel: "Decision" }))).toBe(
			`write "decision" here, then assign a key to "Create: Decision" or "Apply: Decision" in Obsidian's Hotkeys settings.`,
		);
		expect(text(ctx({ templateName: "file" }))).toContain('"Create: file" or "Apply: file"');
	});

	it("says what open does without an editor and which name the default uses", () => {
		expect(keyHelp("tpl-open", ctx())?.scenario).toContain("If no note is being edited, it opens anyway.");
		expect(keyHelp("tpl-filename", ctx())?.scenario).toContain("the template's file name");
	});

	it("uses plain tags", () => {
		expect(keyHelp("tpl-into", ctx())?.tag).toBe("info");
		expect(suggest("into", "", 0, ctx()).items[0]?.tag).toBe("vault");
		expect(suggest("where", "", 0, ctx()).items.find((item) => item.label === "*")?.tag).toBe("wildcard");
	});
});

describe("the || operator and the new variables", () => {
	const named = ctx({ templateName: "decision" });
	const items = (kind: Parameters<typeof suggest>[0], text: string, c = named) => suggest(kind, text, text.length, c).items;
	const find = (kind: Parameters<typeof suggest>[0], text: string, label: string, c = named) =>
		items(kind, text, c).find((item) => item.label === label);

	it("starts an empty file name from the default, written out", () => {
		const first = items("filename", "")[0];
		expect(first?.label).toBe("{{selection}} || {{template}}-{{date:YYMMDDHHmm}}");
		expect(first?.insert).toBe(first?.label);
		expect(first?.tag).toBe("default");
		expect(items("filename", "x").some((item) => item.tag === "default")).toBe(false);
	});

	it("tells a value that depends on the selection as a case with both outcomes", () => {
		const first = items("filename", "")[0];
		expect(first?.scenario).toBe(
			'you select "Meeting" in the note you run the template from, so the new note is named "Meeting". With nothing selected, it is named "decision-date:YYMMDDHHmm".',
		);
		expect(first?.example).toBeUndefined();
		expect(first?.definition).toBe("Lets you start from the name the new note gets when this field is empty, and change it.");
		// An item with its own case keeps it, and a value that does not depend on the selection keeps its result.
		expect(find("filename", "decision-", "{{selection}}")?.scenario).toContain("appears in the new note's name");
		expect(find("filename", "decision-", "{{date}}")?.example).toBe("decision-date:default");
		expect(find("filename", "decision-", "{{date}}")?.scenario).toBe('a note created today gets "date:default" in its name.');
	});

	it("offers the template's file name for names only", () => {
		const item = find("filename", "", "{{template}}");
		expect(item?.scenario).toBe('the template file is "decision", so "decision" appears in the new note\'s name.');
		expect(item?.example).toBe("decision");
		expect(items("into", "").some((entry) => entry.label === "{{template}}")).toBe(false);
		expect(items("value", "{{").some((entry) => entry.label === "{{template}}")).toBe(false);
	});

	it("offers || after a finished variable and says what it does", () => {
		const item = find("filename", "{{selection}}", "||");
		expect(item?.insert).toBe(" || ");
		expect(item?.tag).toBe("or");
		expect(item?.definition).toBe("Lets you add a second name, used when the first one is empty.");
		expect(item?.scenario).toContain('"{{selection}} || decision"');
		expect(find("filename", "{{selection}} ", "||")?.insert).toBe("|| ");
		expect(find("into", "{{from:project}}", "||")?.definition).toBe("Lets you add a second folder, used when the first one is empty.");
	});

	it("builds the || example from a property of the vault, not from a fixed name", () => {
		expect(find("into", "{{here}}", "||")?.scenario).toContain('"{{from:status}} || {{here}}"');
		expect(find("into", "{{here}}", "||", ctx({ propertyKeys: ["kind"] }))?.scenario).toContain('{{from:kind}}');
		expect(find("into", "{{here}}", "||", ctx({ propertyKeys: [] }))?.scenario).toContain('{{from:status}}');
	});

	it("does not offer || where nothing is finished", () => {
		for (const text of ["", "decision", "{{selection}} || ", "{{sel"]) {
			expect(find("filename", text, "||")).toBeUndefined();
		}
		expect(find("into", "", "||")).toBeUndefined();
		expect(find("where", "{{project}}", "||")).toBeUndefined();
		expect(find("value", "{{from:status}}", "||")).toBeUndefined();
	});

	it("keeps the typed folder text when || is offered for a path", () => {
		expect(find("into", "x/{{from:p}}", "||")?.insert).toBe("{{from:p}} || ");
		expect(suggest("into", "x/{{from:p}}", 12, named).from).toBe(2);
	});

	it("offers {{here}} only at the start of the folder", () => {
		expect(items("into", "").map((item) => item.label)).toContain("{{here}}");
		expect(items("into", "{{he").map((item) => item.label)).toEqual(["{{here}}"]);
		expect(items("into", "/").map((item) => item.label)).not.toContain("{{here}}");
		expect(items("into", "x/").map((item) => item.label)).not.toContain("{{here}}");
		expect(items("into", "x/{{he").map((item) => item.label)).toEqual([]);
		expect(items("filename", "").map((item) => item.label)).not.toContain("{{here}}");
	});

	it("explains {{here}} with the folder the template runs from", () => {
		const item = find("into", "", "{{here}}");
		expect(item?.definition).toContain("next to the note you run the template from");
		expect(item?.scenario).toBe(
			'you run the template from "project/a9-pascaline/Notes.md", so the new note is saved in "project/a9-pascaline/".',
		);
		expect(item?.example).toBe("project/a9-pascaline/");
		expect(find("into", "", "{{here}}", ctx({ sampleFolder: "", root: "" }))?.scenario).toContain("the vault root");
	});

	it("tells that a name without {{selection}} turns the selection into the link label", () => {
		const selection = find("filename", "", "{{selection}}");
		expect(selection?.scenario).not.toContain("label");
		expect(selection?.also?.definition).toBe(
			"Lets the text you selected stay as the label of the link, when the name does not include {{selection}}.",
		);
		expect(selection?.also?.scenario).toBe(
			'the name is "decision-{{date:YYMMDDHHmm}}" and you select "Meeting", so the note is named "decision-date:YYMMDDHHmm" and the link to it reads "Meeting".',
		);
		expect(selection?.also?.example).toBe("[[decision-date:YYMMDDHHmm|Meeting]]");
		expect(find("value", "{{", "{{selection}}")?.also).toBeUndefined();
		expect(keyHelp("tpl-filename", named)?.scenario).not.toContain("label");
		expect(keyHelp("tpl-filename", named)?.also?.example).toBe("[[decision-date:YYMMDDHHmm|Meeting]]");
		expect(keyHelp("tpl-filename", named)?.scenario).toContain("the template's file name");
	});

	it("previews a folder chain with the first alternative that has a value", () => {
		const c = ctx({ propertyExample: (key) => (key === "status" ? "active" : undefined) });
		const date = suggest("into", "{{from:status}} || ", 19, c).items.find((entry) => entry.label === "{{date}}");
		expect(date?.example).toBe("project/active/");
	});

	it("works on the part after || and replaces only that part", () => {
		const text = "{{from:status}} || {{he";
		const result = suggest("into", text, text.length, named);
		expect(result.items.map((item) => item.label)).toEqual(["{{here}}"]);
		expect(result.from).toBe(19);
		const next = suggest("into", "{{from:status}} || ", 19, named);
		expect(next.from).toBe(19);
		expect(next.items.map((item) => item.label)).toContain("/");
		expect(next.items.map((item) => item.label)).toContain("{{here}}");
		expect(next.items.map((item) => item.label)).toContain("a9-pascaline");
	});
});

describe("remarks kept in their own block", () => {
	const find = (kind: Parameters<typeof suggest>[0], text: string, label: string, c = ctx()) =>
		suggest(kind, text, text.length, c).items.find((item) => item.label === label);

	it("explains how to change the date format apart from the fixed one", () => {
		const name = find("filename", "", "{{date:YYMMDDHHmm}}");
		expect(name?.definition).not.toContain("To use another format");
		expect(name?.also?.definition).toContain("by changing the letters after the colon");
		expect(name?.also?.scenario).toBe('you write "{{date:DD.MM.YYYY}}", so a note created today gets "date:DD.MM.YYYY" in its name.');
		const note = find("value", "{{", "{{date:YYMMDDHHmm}}");
		expect(note?.also?.scenario).toBe('you write "{{date:DD.MM.YYYY}}", so the value becomes "date:DD.MM.YYYY".');
		expect(find("into", "", "{{date}}")?.also).toBeUndefined();
	});

	it("explains the nearby-notes lookup of {{from:}} apart from the plain copy", () => {
		const c = ctx({ propertyExample: (key) => (key === "status" ? "active" : undefined) });
		const item = find("value", "{{from:", "{{from:status}}", c);
		expect(item?.scenario).toBe(`that note's status is "active", so the value becomes "active".`);
		expect(item?.also?.definition).toBe("Lets the value come from the notes around it when the source note has no such property.");
		expect(item?.also?.scenario).toContain('the notes next to it all have "active"');
		expect(find("filename", "{{from:", "{{from:status}}", c)?.also).toBeUndefined();
		expect(find("into", "{{from:", "{{from:status}}", c)?.also).toBeUndefined();
	});
});
