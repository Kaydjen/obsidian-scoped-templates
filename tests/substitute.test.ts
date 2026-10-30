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
