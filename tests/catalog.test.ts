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
		for (const key of ["tpl-label", "tpl-where", "tpl-except", "tpl-into", "tpl-filename", "tpl-open", "tpl-command"]) {
			const help = keyHelp(key, ctx({ templateName: "Decision" }));
			expect(help?.help).toBe(true);
			expect(help?.definition).toMatch(/^Lets you /);
		}
		expect(keyHelp("tpl-command", ctx({ templateName: "Decision" }))?.scenario).toContain('"Create: Decision"');
		expect(keyHelp("status", ctx())).toBeNull();
	});
});
