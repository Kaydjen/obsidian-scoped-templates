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
		expect(() => parse("---\na: [1\n---\n")).toThrow(/Properties are broken/);
		expect(() => parse("---\ntpl-wher: x\n---\n")).toThrow(/tpl-wher is not a template key/);
		expect(() => parse("---\ntpl-open: yes please\n---\n")).toThrow(/tpl-open/);
		expect(() => parse("---\ntpl-where: 5\n---\n")).toThrow(/tpl-where/);
		expect(() => parse('---\ntpl-where: "{{x}}/{{x}}"\n---\n')).toThrow(/used twice/);
		expect(() => parse('---\ntpl-where: "{{date}}"\n---\n')).toThrow(/already a variable/);
		expect(() => parse('---\ntpl-filename: "{{title}}"\n---\n')).toThrow(/title/);
		expect(() => parse("---\ntpl-command: has space\n---\n")).toThrow(/tpl-command/);
		expect(() => parse("---\n- a\n---\n")).toThrow(/name: value/);
	});
});

describe("empty tpl-where", () => {
	it("treats an empty list like a missing key", () => {
		expect(parse("---\ntpl-where: []\n---\n").config.where).toBeNull();
	});
});

describe("config value edge cases", () => {
	it("rejects {{title}} in tpl-into and a non-text label", () => {
		expect(() => parse('---\ntpl-into: "{{title}}/x"\n---\n')).toThrow(/tpl-into/);
		expect(() => parse("---\ntpl-label: [a]\n---\n")).toThrow(/tpl-label/);
	});

	it("ignores blank label and file name, keeps a single string as one pattern", () => {
		const config = parse('---\ntpl-label: "  "\ntpl-filename: ""\ntpl-where: a9\ntpl-except: ["x", "y"]\n---\n').config;
		expect(config.label).toBeUndefined();
		expect(config.filename).toBeUndefined();
		expect(config.where).toHaveLength(1);
		expect(config.except).toHaveLength(2);
	});

	it("names the key whose pattern is invalid", () => {
		expect(() => parse('---\ntpl-except: ["../x"]\n---\n')).toThrow(/tpl-except: .*"\.\."/);
		expect(() => parse("---\ntpl-where: [1]\n---\n")).toThrow(/tpl-where/);
	});

	it("treats empty frontmatter and a comment-only block as no config", () => {
		expect(parse("---\n---\nbody").config).toEqual({ where: null, except: [], open: false });
		expect(parse("---\n# only a comment\n---\nbody").frontmatter).toEqual({});
	});

	it("normalizes CRLF in the body", () => {
		expect(parse("---\r\na:\r\n---\r\nx\r\ny").body).toBe("x\ny");
	});
});

describe("|| in values", () => {
	it("accepts alternatives in tpl-filename, tpl-into and properties", () => {
		const parsed = parse(
			'---\ntpl-filename: "{{selection}} || x"\ntpl-into: "{{from:project}} || {{here}}"\nstatus: "{{from:status}} || draft"\n---\n',
		);
		expect(parsed.config.filename).toBe("{{selection}} || x");
		expect(parsed.config.into).toBe("{{from:project}} || {{here}}");
		expect(parsed.frontmatter.status).toBe("{{from:status}} || draft");
	});

	it("rejects an operator without a value on both sides", () => {
		expect(() => parse('---\ntpl-filename: "{{selection}} ||"\n---\n')).toThrow(/tpl-filename: "\|\|" needs a value on both sides/);
		expect(() => parse('---\ntpl-into: "|| x"\n---\n')).toThrow(/tpl-into: "\|\|" needs a value/);
		expect(() => parse('---\nstatus: "a || || b"\n---\n')).toThrow(/status: "\|\|" needs a value/);
		expect(() => parse('---\nlist:\n  - "a ||"\n---\n')).toThrow(/list: "\|\|" needs a value/);
	});

	it("does not touch the body", () => {
		expect(() => parse("---\nx: 1\n---\na || \n")).not.toThrow();
	});

	it("rejects {{title}} anywhere in the chain", () => {
		expect(() => parse('---\ntpl-filename: "{{selection}} || {{title}}"\n---\n')).toThrow(/cannot use \{\{title\}\}/);
	});
});

describe("reserved variable names", () => {
	it("keeps {{template}} and {{here}} out of folder labels", () => {
		expect(() => parse('---\ntpl-where: "{{here}}"\n---\n')).toThrow(/already a variable/);
		expect(() => parse('---\ntpl-where: "{{template}}"\n---\n')).toThrow(/already a variable/);
	});
});
