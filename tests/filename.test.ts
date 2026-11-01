import { describe, expect, it } from "vitest";
import { dashWords, sanitizeAlias,sanitizeName, uniqueName } from "../src/core/filename";

describe("sanitizeName", () => {
	it("removes characters Obsidian and Windows reject", () => {
		expect(sanitizeName('a/b\\c:d*e?f"g<h>i|j#k^l[m]n')).toBe("abcdefghijklmn");
	});

	it("collapses whitespace and trims", () => {
		expect(sanitizeName("  Choose   a\nTelegram  bot  ")).toBe("Choose a Telegram bot");
	});

	it("strips trailing dots and spaces", () => {
		expect(sanitizeName("name. . ")).toBe("name");
	});

	it("cuts long names", () => {
		expect(sanitizeName("x".repeat(500))).toHaveLength(200);
	});

	it("can end up empty", () => {
		expect(sanitizeName("???")).toBe("");
	});

	it("keeps cyrillic and digits", () => {
		expect(sanitizeName("Решение 2610291420")).toBe("Решение 2610291420");
	});
});

describe("dashWords", () => {
	it("joins words with dashes", () => {
		expect(dashWords("  History of  the\nname ")).toBe("History-of-the-name");
		expect(dashWords("")).toBe("");
	});
});

describe("sanitizeAlias", () => {
	it("removes link-breaking characters", () => {
		expect(sanitizeAlias("a | [b]\nc")).toBe("a b c");
	});
});

describe("uniqueName", () => {
	it("returns the base when free", () => {
		expect(uniqueName("note", "md", ["other.md"])).toBe("note");
	});

	it("appends -2, -3 on collisions", () => {
		expect(uniqueName("note", "md", ["note.md"])).toBe("note-2");
		expect(uniqueName("note", "md", ["note.md", "note-2.md"])).toBe("note-3");
	});

	it("compares case-insensitively", () => {
		expect(uniqueName("Decision", "md", ["decision.md"])).toBe("Decision-2");
	});

	it("ignores other extensions", () => {
		expect(uniqueName("note", "md", ["note.png"])).toBe("note");
	});
});

describe("name edge cases", () => {
	it("drops the space left at the cut", () => {
		expect(sanitizeName(`${"a".repeat(199)} b`)).toBe("a".repeat(199));
	});

	it("removes control characters and link syntax", () => {
		expect(sanitizeName("a\u0000b\tc[[d]]#e^f")).toBe("ab cdef");
	});

	it("is empty for names made only of forbidden characters", () => {
		expect(sanitizeName(' ?*"<>| ')).toBe("");
		expect(sanitizeName("...")).toBe("");
	});

	it("uniqueName compares unicode case and skips taken counters", () => {
		expect(uniqueName("Заметка", "md", ["заметка.md", "Заметка-2.md"])).toBe("Заметка-3");
		expect(uniqueName("a", "md", new Set<string>())).toBe("a");
	});
});
