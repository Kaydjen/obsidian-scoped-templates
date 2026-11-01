import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { ghostDefaults } from "../src/core/ghost";
import { buildSkeleton, commonKeys } from "../src/core/skeleton";
import { parseTemplate } from "../src/core/template";

describe("commonKeys", () => {
	it("keeps keys present in at least the threshold share, most common first", () => {
		const notes = [["status", "project", "d-time"], ["status", "project"], ["status", "domain"], ["aliases"]];
		expect(commonKeys(notes, 0.5, "tpl-")).toEqual(["status", "project"]);
	});

	it("skips config keys and handles no notes", () => {
		expect(commonKeys([["tpl-where", "a"]], 0.5, "tpl-")).toEqual(["a"]);
		expect(commonKeys([], 0.5, "tpl-")).toEqual([]);
	});
});

describe("buildSkeleton", () => {
	const text = buildSkeleton(["status", "d-time", "created"], { "d-time": "datetime", created: "date" });

	it("writes explicit config values and date values for date-typed properties", () => {
		expect(text).toContain("tpl-where: []\n");
		expect(text).toContain("tpl-open: false\n");
		expect(text).toContain('d-time: "{{date:YYYY-MM-DDTHH:mm:ss}}"\n');
		expect(text).toContain('created: "{{date:YYYY-MM-DD}}"\n');
		expect(text).toContain("\nstatus:\n");
	});

	it("is a valid template that is visible everywhere in its scope", () => {
		const parsed = parseTemplate(text, (yaml) => YAML.parse(yaml));
		expect(parsed.config.where).toBeNull();
		expect(parsed.config.except).toEqual([]);
		expect(Object.keys(parsed.frontmatter)).toEqual(["status", "d-time", "created"]);
	});
});

describe("ghostDefaults", () => {
	it("shows the effective defaults", () => {
		const ghost = ghostDefaults("decision", "project");
		expect(ghost["tpl-label"]).toBe("decision");
		expect(ghost["tpl-where"]).toBe("project");
		expect(ghost["tpl-filename"]).toBe("{{selection}} || {{template}}-{{date:YYMMDDHHmm}}");
		expect(ghost["tpl-into"]).toBe("{{here}}");
		expect(ghostDefaults("x", "")["tpl-where"]).toBe("/");
	});
});

describe("buildSkeleton with chosen keys", () => {
	it("writes only the chosen template keys, in file order", () => {
		const text = buildSkeleton(["status"], {}, ["tpl-where", "tpl-label"]);
		expect(text).toBe("---\ntpl-label:\ntpl-where: []\nstatus:\n---\n");
	});

	it("allows no keys at all", () => {
		expect(buildSkeleton([], {}, [])).toBe("---\n---\n");
	});
});

describe("skeleton edge cases", () => {
	it("quotes property names that are not plain words", () => {
		const text = buildSkeleton(["due date", "a:b", "ok-key_1"], {});
		expect(text).toContain('\n"due date":\n');
		expect(text).toContain('\n"a:b":\n');
		expect(text).toContain("\nok-key_1:\n");
		const parsed = parseTemplate(text, (yaml) => YAML.parse(yaml));
		expect(Object.keys(parsed.frontmatter)).toEqual(["due date", "a:b", "ok-key_1"]);
	});

	it("ignores unknown config keys and unknown property types", () => {
		expect(buildSkeleton(["n"], { n: "number" }, ["tpl-open", "tpl-bogus"])).toBe("---\ntpl-open: false\nn:\n---\n");
	});

	it("writes a date property with a value that parses back unchanged", () => {
		const parsed = parseTemplate(buildSkeleton(["d"], { d: "date" }), (yaml) => YAML.parse(yaml));
		expect(parsed.frontmatter["d"]).toBe("{{date:YYYY-MM-DD}}");
	});
});

describe("commonKeys edge cases", () => {
	it("counts a key once per note and respects the limit", () => {
		expect(commonKeys([["a", "a", "a"], ["b"]], 1, "tpl-")).toEqual([]);
		expect(commonKeys([["a", "b", "c"]], 0.5, "tpl-", 2)).toEqual(["a", "b"]);
	});

	it("keeps first-seen order on ties and always needs at least one note", () => {
		expect(commonKeys([["b", "a"], ["a", "b"]], 0, "tpl-")).toEqual(["b", "a"]);
		expect(commonKeys([["a"], []], 0, "tpl-")).toEqual(["a"]);
	});
});

describe("buildSkeleton with values from another template", () => {
	const values = {
		data: { status: "draft", tags: ["a", "b"], project: "", created: "{{date}}" },
		stringify: (entry: Record<string, unknown>) => YAML.stringify(entry),
	};

	it("writes non-empty values, keeps the rest as before", () => {
		const text = buildSkeleton(["status", "tags", "project", "other"], {}, [], values);
		const parsed = parseTemplate(text, (yaml) => YAML.parse(yaml));
		expect(parsed.frontmatter).toEqual({ status: "draft", tags: ["a", "b"], project: null, other: null });
	});

	it("keeps a template value over the date default", () => {
		const text = buildSkeleton(["created"], { created: "date" }, [], values);
		expect(parseTemplate(text, (yaml) => YAML.parse(yaml)).frontmatter).toEqual({ created: "{{date}}" });
	});

	it("without values nothing changes", () => {
		expect(buildSkeleton(["status"], {}, [])).toBe("---\nstatus:\n---\n");
	});
});
