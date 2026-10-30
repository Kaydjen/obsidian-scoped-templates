import { describe, expect, it } from "vitest";
import { isCaptureName, matchPattern, parsePattern } from "../src/core/pattern";

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
		expect(() => parsePattern("{{x}}/{{x}}")).toThrow(/used twice/);
		expect(() => parsePattern("{{date}}")).toThrow(/already a variable/);
		expect(() => parsePattern("{{from:x}}")).toThrow();
		expect(() => parsePattern("pre{{x}}")).toThrow(/whole folder name/);
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

describe("backslashes and unusual segments", () => {
	it("reads backslashes as separators", () => {
		const pattern = parsePattern("{{project}}\\ui");
		expect(pattern.segments).toHaveLength(2);
		expect(() => parsePattern("\\abs")).toThrow();
		expect(() => parsePattern("a\\..\\b")).toThrow();
	});

	it("tolerates spaces in a capture and trailing slashes", () => {
		expect(match("{{ project }}/", ["a9"])).toEqual({ project: "a9" });
	});

	it("escapes regex characters in globs", () => {
		expect(match("a+b", ["a+b"])).toEqual({});
		expect(match("a+b", ["aab"])).toBeNull();
		expect(match("(x)", ["(x)"])).toEqual({});
		expect(match("[a]*", ["[a]1"])).toEqual({});
	});

	it("rejects stray braces and bad capture names", () => {
		expect(() => parsePattern("{{a b}}")).toThrow(/cannot be a folder label/);
		expect(() => parsePattern("{{1x}}")).toThrow(/cannot be a folder label/);
		expect(() => parsePattern("x}}")).toThrow(/whole folder name/);
		expect(() => parsePattern("{{cursor}}")).toThrow(/already a variable/);
	});

	it("matches non-ASCII names", () => {
		expect(match("Аль*", ["Альфа"])).toEqual({});
		expect(match("аль*", ["Альфа"])).toBeNull();
	});
});

describe("isCaptureName", () => {
	it("accepts plain words and rejects built-ins and non-words", () => {
		expect(isCaptureName("project")).toBe(true);
		expect(isCaptureName("my-folder")).toBe(true);
		expect(isCaptureName("date")).toBe(false);
		expect(isCaptureName("2024")).toBe(false);
		expect(isCaptureName("")).toBe(false);
		expect(isCaptureName("a b")).toBe(false);
	});
});
