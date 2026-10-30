import { describe, expect, it } from "vitest";
import { matchPattern, parsePattern } from "../src/core/pattern";

const match = (pattern: string, rel: string[]) => matchPattern(parsePattern(pattern), rel);

describe("parsePattern", () => {
	it("accepts captures, literals and globs", () => {
		expect(parsePattern("{{project}}/ui/{{component}}").segments).toHaveLength(3);
		expect(parsePattern("").segments).toEqual([]);
		expect(parsePattern("_*").segments).toHaveLength(1);
	});

	it("rejects invalid patterns", () => {
		expect(() => parsePattern("/abs")).toThrow();
		expect(() => parsePattern("a/../b")).toThrow();
		expect(() => parsePattern("a/**")).toThrow();
		expect(() => parsePattern("{{x}}/{{x}}")).toThrow(/Duplicate/);
		expect(() => parsePattern("{{date}}")).toThrow(/Reserved/);
		expect(() => parsePattern("{{from:x}}")).toThrow();
		expect(() => parsePattern("pre{{x}}")).toThrow(/whole/);
		expect(() => parsePattern("{{}}")).toThrow();
	});
});

describe("matchPattern", () => {
	it("captures segments", () => {
		expect(match("{{project}}", ["a9-pascaline"])).toEqual({ project: "a9-pascaline" });
		expect(match("{{project}}/ui/{{component}}", ["a9", "ui", "button"])).toEqual({
			project: "a9",
			component: "button",
		});
	});

	it("matches as a prefix so deeper folders stay in scope", () => {
		expect(match("{{project}}", ["a9", "research", "deep"])).toEqual({ project: "a9" });
	});

	it("does not match when the path is shorter or a literal differs", () => {
		expect(match("{{project}}", [])).toBeNull();
		expect(match("{{project}}/ui", ["a9"])).toBeNull();
		expect(match("{{project}}/ui", ["a9", "api"])).toBeNull();
	});

	it("supports * and ? globs, case-sensitive", () => {
		expect(match("_*", ["_backlog"])).toEqual({});
		expect(match("_*", ["backlog"])).toBeNull();
		expect(match("a?", ["a9"])).toEqual({});
		expect(match("a?", ["a99"])).toBeNull();
		expect(match("ABC", ["abc"])).toBeNull();
		expect(match("a.c", ["abc"])).toBeNull();
	});

	it("empty pattern matches everything", () => {
		expect(match("", [])).toEqual({});
		expect(match("", ["x", "y"])).toEqual({});
	});
});
