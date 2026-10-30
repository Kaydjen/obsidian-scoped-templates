import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { parseTemplate, quoteTemplateValues, splitFrontmatter } from "../src/core/template";

const parse = (text: string) => parseTemplate(text, (yaml) => YAML.parse(yaml));

describe("splitFrontmatter", () => {
	it("splits frontmatter and body", () => {
		const result = splitFrontmatter("---\na: 1\n---\nbody\nmore");
		expect(result).toEqual({ yaml: "a: 1", body: "body\nmore", end: 13 });
	});

	it("handles empty frontmatter, CRLF and a missing block", () => {
		expect(splitFrontmatter("---\n---\nx").yaml).toBe("");
		expect(splitFrontmatter("---\r\na: 1\r\n---\r\nbody").yaml).toBe("a: 1");
		expect(splitFrontmatter("no front").end).toBe(0);
		expect(splitFrontmatter("text\n---\na: 1\n---\n").yaml).toBeNull();
	});

	it("does not end at a line that merely starts with ---", () => {
		expect(splitFrontmatter("---\na: 1\n---x\n---\nb").yaml).toBe("a: 1\n---x");
	});
});

describe("quoteTemplateValues", () => {
	it("quotes unquoted values starting with {{", () => {
		expect(quoteTemplateValues("d-time: {{date:YYYY-MM-DD HH:mm}}")).toBe('d-time: "{{date:YYYY-MM-DD HH:mm}}"');
		expect(quoteTemplateValues("list:\n  - {{from:project}}")).toBe('list:\n  - "{{from:project}}"');
	});

	it("leaves quoted and plain values alone", () => {
		const text = 'a: "{{x}}"\nb: plain\nc:\n  - "[[x]]"';
		expect(quoteTemplateValues(text)).toBe(text);
	});

	it("escapes inner quotes", () => {
		expect(quoteTemplateValues('a: {{x}} "y"')).toBe('a: "{{x}} \\"y\\""');
	});
});

describe("parseTemplate", () => {
	it("separates config from output frontmatter", () => {
		const parsed = parse(
			[
				"---",
				"tpl-label: Decision",
				'tpl-where: "{{project}}"',
				"tpl-except: [_*]",
				'tpl-into: "{{project}}/decisions"',
				'tpl-filename: "decision-{{date:YYMMDDHHmm}}"',
				"tpl-open: true",
				"tpl-command: decision",
				'project: "{{from:project}}"',
				"d-time: {{date:YYYY-MM-DD}}",
				"status:",
				"---",
				"body {{cursor}}",
			].join("\n"),
		);
		expect(parsed.config.label).toBe("Decision");
		expect(parsed.config.where?.[0]?.source).toBe("{{project}}");
		expect(parsed.config.except).toHaveLength(1);
		expect(parsed.config.into).toBe("{{project}}/decisions");
		expect(parsed.config.open).toBe(true);
		expect(parsed.config.command).toBe("decision");
		expect(parsed.frontmatter).toEqual({
			project: "{{from:project}}",
			"d-time": "{{date:YYYY-MM-DD}}",
			status: null,
		});
		expect(parsed.body).toBe("body {{cursor}}");
	});

	it("defaults for a template without config", () => {
		const parsed = parse("---\nlinks:\n---\ntext");
		expect(parsed.config).toEqual({ where: null, except: [], open: false });
		expect(parsed.frontmatter).toEqual({ links: null });
	});

	it("accepts a template without frontmatter", () => {
		const parsed = parse("just body");
		expect(parsed.frontmatter).toEqual({});
		expect(parsed.body).toBe("just body");
	});

	it("rejects invalid templates with a reason", () => {
		expect(() => parse("---\na: [1\n---\n")).toThrow(/Invalid YAML/);
		expect(() => parse("---\ntpl-wher: x\n---\n")).toThrow(/Unknown key tpl-wher/);
		expect(() => parse("---\ntpl-open: yes please\n---\n")).toThrow(/tpl-open/);
		expect(() => parse("---\ntpl-where: 5\n---\n")).toThrow(/tpl-where/);
		expect(() => parse('---\ntpl-where: "{{x}}/{{x}}"\n---\n')).toThrow(/Duplicate/);
		expect(() => parse('---\ntpl-where: "{{date}}"\n---\n')).toThrow(/Reserved/);
		expect(() => parse('---\ntpl-filename: "{{title}}"\n---\n')).toThrow(/title/);
		expect(() => parse("---\ntpl-command: has space\n---\n")).toThrow(/tpl-command/);
		expect(() => parse("---\n- a\n---\n")).toThrow(/map/);
	});
});

describe("empty tpl-where", () => {
	it("treats an empty list like a missing key", () => {
		expect(parse("---\ntpl-where: []\n---\n").config.where).toBeNull();
	});
});
