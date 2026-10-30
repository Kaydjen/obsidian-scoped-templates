import YAML from "yaml";
import { describe, expect, it } from "vitest";
import {
	buildFrontmatter,
	deepEqual,
	isEmpty,
	mergeFrontmatter,
	serializeFrontmatter,
	type BuildDeps,
} from "../src/core/frontmatter";
import { parseTemplate } from "../src/core/template";

const deps: BuildDeps = {
	text: (value) => value.replace("{{date}}", "2026-10-29").replace("{{source}}", "[[log]]"),
	from: (key) => (key === "project" ? ["[[a9-pascaline]]"] : key === "status" ? "[[done]]" : undefined),
};

describe("isEmpty", () => {
	it("treats null, undefined, empty string and empty list as empty", () => {
		for (const value of [null, undefined, "", []]) expect(isEmpty(value)).toBe(true);
		for (const value of [0, false, "x", ["x"], {}]) expect(isEmpty(value)).toBe(false);
	});
});

describe("deepEqual", () => {
	it("compares nested values", () => {
		expect(deepEqual(["a"], ["a"])).toBe(true);
		expect(deepEqual(["a"], ["b"])).toBe(false);
		expect(deepEqual({ a: [1] }, { a: [1] })).toBe(true);
		expect(deepEqual([], {})).toBe(false);
	});
});

describe("buildFrontmatter", () => {
	it("replaces a whole {{from:}} string with the source value, keeping its type", () => {
		expect(buildFrontmatter({ project: "{{from:project}}", status: "{{from:status}}" }, deps)).toEqual({
			project: ["[[a9-pascaline]]"],
			status: "[[done]]",
		});
	});

	it("replaces a single-item list holding {{from:}}", () => {
		expect(buildFrontmatter({ project: ["{{from:project}}"] }, deps)).toEqual({
			project: ["[[a9-pascaline]]"],
		});
	});

	it("uses null for missing sources", () => {
		expect(buildFrontmatter({ x: "{{from:nothing}}", y: ["{{from:nothing}}"] }, deps)).toEqual({ x: null, y: null });
	});

	it("substitutes inside other strings and leaves other types alone", () => {
		expect(
			buildFrontmatter({ date: "{{date}}", note: "from {{source}}", n: 3, flag: true, none: null, list: ["a {{date}}"] }, deps),
		).toEqual({ date: "2026-10-29", note: "from [[log]]", n: 3, flag: true, none: null, list: ["a 2026-10-29"] });
	});

	it("does not mutate the source value", () => {
		const shared = ["[[x]]"];
		const result = buildFrontmatter({ a: "{{from:k}}" }, { ...deps, from: () => shared });
		(result.a as string[]).push("[[y]]");
		expect(shared).toEqual(["[[x]]"]);
	});
});

describe("mergeFrontmatter", () => {
	it("adds missing keys and fills empty ones, never overwriting values", () => {
		const { merged, changed } = mergeFrontmatter(
			{ status: ["[[done]]"], links: null, project: [], aliases: ["x"] },
			{ status: "other", links: ["[[a]]"], project: ["[[p]]"], aliases: ["y"], "d-time": "now", derived_from: null },
		);
		expect(changed).toBe(true);
		expect(merged).toEqual({
			status: ["[[done]]"],
			links: ["[[a]]"],
			project: ["[[p]]"],
			aliases: ["x"],
			"d-time": "now",
			derived_from: null,
		});
		expect(Object.keys(merged)).toEqual(["status", "links", "project", "aliases", "d-time", "derived_from"]);
	});

	it("reports no change when nothing would be added", () => {
		expect(mergeFrontmatter({ a: null, b: "x" }, { a: null, b: "y" }).changed).toBe(false);
		expect(mergeFrontmatter({ a: 1 }, {}).changed).toBe(false);
	});

	it("works on a note without frontmatter", () => {
		expect(mergeFrontmatter(null, { a: "1" })).toEqual({ merged: { a: "1" }, changed: true });
	});
});

describe("serializeFrontmatter", () => {
	const stringify = (value: unknown) => YAML.stringify(value);

	it("returns an empty string for an empty map", () => {
		expect(serializeFrontmatter({}, stringify)).toBe("");
	});

	it("writes null as an empty value and keeps links quoted strings", () => {
		const block = serializeFrontmatter({ status: null, project: ["[[a9-pascaline]]"], text: "x" }, stringify);
		expect(block.startsWith("---\n")).toBe(true);
		expect(block.endsWith("\n---\n")).toBe(true);
		expect(block).toContain("status:\n");
		expect(block).not.toContain("null");
		const reparsed = YAML.parse(block.slice(4, -4));
		expect(reparsed).toEqual({ status: null, project: ["[[a9-pascaline]]"], text: "x" });
	});

	it("does not touch a string that spells null", () => {
		const block = serializeFrontmatter({ a: "null" }, stringify);
		expect(YAML.parse(block.slice(4, -4))).toEqual({ a: "null" });
	});
});

describe("round trip with a real template", () => {
	it("builds valid frontmatter from a core-style template with unquoted variables", () => {
		const parsed = parseTemplate(
			"---\nd-time: {{date}}\nproject: {{from:project}}\nlinks:\n---\nbody",
			(yaml) => YAML.parse(yaml),
		);
		const built = buildFrontmatter(parsed.frontmatter, deps);
		expect(built).toEqual({ "d-time": "2026-10-29", project: ["[[a9-pascaline]]"], links: null });
		const reparsed = YAML.parse(serializeFrontmatter(built, (v) => YAML.stringify(v)).slice(4, -4));
		expect(reparsed).toEqual(built);
	});
});

describe("buildFrontmatter with ||", () => {
	it("uses the first alternative that has a value and keeps its type", () => {
		expect(buildFrontmatter({ status: "{{from:nothing}} || {{from:status}}" }, deps)).toEqual({ status: "[[done]]" });
		expect(buildFrontmatter({ project: "{{from:nothing}} || {{from:project}}" }, deps)).toEqual({ project: ["[[a9-pascaline]]"] });
	});

	it("falls back to plain text and trims the parts", () => {
		expect(buildFrontmatter({ status: "{{from:nothing}} || draft" }, deps)).toEqual({ status: "draft" });
	});

	it("gives null when every alternative is a missing source", () => {
		expect(buildFrontmatter({ x: "{{from:a}} || {{from:b}}" }, deps)).toEqual({ x: null });
	});

	it("works for items of a list and inside maps", () => {
		expect(buildFrontmatter({ tags: ["{{from:nothing}} || a", "b"], map: { k: "{{from:nothing}} || c" } }, deps)).toEqual({
			tags: ["a", "b"],
			map: { k: "c" },
		});
	});

	it("leaves a value without || exactly as before", () => {
		expect(buildFrontmatter({ a: "x | y", b: "{{from:nothing}}" }, deps)).toEqual({ a: "x | y", b: null });
	});
});
