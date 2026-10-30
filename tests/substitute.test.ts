import { describe, expect, it } from "vitest";
import { extractCursor, formatValue, substitute, type SubstituteDeps } from "../src/core/substitute";

const deps = (overrides: Partial<SubstituteDeps> = {}): SubstituteDeps => ({
	formatDate: (kind, format) => `${kind}(${format ?? "default"})`,
	captures: { project: "a9-pascaline" },
	title: "my-title",
	selection: "picked text",
	source: "[[log]]",
	from: (key) => (key === "project" ? ["[[a9-pascaline]]"] : undefined),
	...overrides,
});

describe("substitute", () => {
	it("replaces known variables", () => {
		expect(substitute("{{date}} {{time}}", deps())).toBe("date(default) time(default)");
		expect(substitute("{{date:YYMMDDHHmm}}", deps())).toBe("date(YYMMDDHHmm)");
		expect(substitute("{{date:YYYY-MM-DD HH:mm}}", deps())).toBe("date(YYYY-MM-DD HH:mm)");
		expect(substitute("{{title}} / {{selection}} / {{source}}", deps())).toBe("my-title / picked text / [[log]]");
		expect(substitute("{{project}}/decisions", deps())).toBe("a9-pascaline/decisions");
		expect(substitute("{{ project }}", deps())).toBe("a9-pascaline");
	});

	it("handles from: with list values and missing keys", () => {
		expect(substitute("p: {{from:project}}", deps())).toBe("p: [[a9-pascaline]]");
		expect(substitute("p: {{from:missing}}", deps())).toBe("p: ");
	});

	it("keeps unknown variables and the cursor marker", () => {
		expect(substitute("{{unknown}} {{foo:bar}} {{cursor}}", deps())).toBe("{{unknown}} {{foo:bar}} {{cursor}}");
	});

	it("leaves {{title}} alone while the title is not known", () => {
		expect(substitute("{{title}}", deps({ title: undefined }))).toBe("{{title}}");
	});

	it("does not rescan substituted values", () => {
		expect(substitute("{{selection}}", deps({ selection: "{{date}}" }))).toBe("{{date}}");
	});

	it("does not treat a capture with an argument as a capture", () => {
		expect(substitute("{{project:x}}", deps())).toBe("{{project:x}}");
	});
});

describe("formatValue", () => {
	it("formats values for inline text", () => {
		expect(formatValue(null)).toBe("");
		expect(formatValue(["a", "b"])).toBe("a, b");
		expect(formatValue(5)).toBe("5");
	});
});

describe("extractCursor", () => {
	it("removes all markers and reports the first offset", () => {
		expect(extractCursor("ab{{cursor}}cd{{cursor}}")).toEqual({ text: "abcd", offset: 2 });
		expect(extractCursor("none")).toEqual({ text: "none", offset: null });
	});
});

describe("substitute edge cases", () => {
	it("reports plain-text forms for object and nested list values", () => {
		expect(formatValue({ a: 1 })).toBe('{"a":1}');
		expect(formatValue([["x"], null, "y"])).toBe("x, , y");
		expect(formatValue(false)).toBe("false");
		expect(formatValue(0)).toBe("0");
	});

	it("keeps malformed or empty braces as written", () => {
		expect(substitute("{{}} {{ }} {{from}} {{from:", deps())).toBe("{{}} {{ }} {{from}} {{from:");
		expect(substitute("{{{date}}}", deps())).toBe("{date(default)}");
	});

	it("ignores whitespace around names and arguments", () => {
		expect(substitute("{{ date : YYYY }}", deps())).toBe("date(YYYY)");
		expect(substitute("{{ from : project }}", deps())).toBe("[[a9-pascaline]]");
		expect(substitute("{{date: }}", deps())).toBe("date(default)");
	});

	it("does not resolve inherited object keys as captures", () => {
		expect(substitute("{{constructor}} {{toString}}", deps())).toBe("{{constructor}} {{toString}}");
	});

	it("allows an empty selection, source and title", () => {
		expect(substitute("[{{selection}}][{{source}}]", deps({ selection: "", source: "" }))).toBe("[][]");
		expect(substitute("a{{title}}b", deps({ title: "" }))).toBe("ab");
	});
});

describe("extractCursor edge cases", () => {
	it("handles a marker at the start and at the end", () => {
		expect(extractCursor("{{cursor}}x")).toEqual({ text: "x", offset: 0 });
		expect(extractCursor("x{{cursor}}")).toEqual({ text: "x", offset: 1 });
	});

	it("does not treat a spaced marker as a cursor", () => {
		expect(extractCursor("a{{ cursor }}")).toEqual({ text: "a{{ cursor }}", offset: null });
	});
});
