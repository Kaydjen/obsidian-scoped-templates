import { describe, expect, it } from "vitest";
import { applyEdits, computeApplyEdits } from "../src/core/edit";
import { splitFrontmatter } from "../src/core/template";

const run = (doc: string, block: string | null, body: string, selection: [number, number], bodyCursor: number | null = null) => {
	const { end } = splitFrontmatter(doc);
	const result = computeApplyEdits({
		doc,
		frontmatterEnd: end,
		frontmatterBlock: block,
		body,
		bodyCursor,
		selectionFrom: selection[0],
		selectionTo: selection[1],
	});
	return { text: applyEdits(doc, result.edits), cursor: result.cursor, edits: result.edits };
};

describe("computeApplyEdits", () => {
	it("inserts the body at the cursor when frontmatter is unchanged", () => {
		const { text, cursor } = run("---\na: 1\n---\nhello world", null, "X", [19, 19]);
		expect(text).toBe("---\na: 1\n---\nhello Xworld");
		expect(cursor).toBe(20);
	});

	it("replaces the selection", () => {
		expect(run("abc def", null, "X", [4, 7]).text).toBe("abc X");
	});

	it("replaces the frontmatter and inserts the body after it in one edit set", () => {
		const doc = "---\na: 1\n---\nbody";
		const { text, edits } = run(doc, "---\na: 1\nb: 2\n---\n", "T", [doc.length, doc.length]);
		expect(text).toBe("---\na: 1\nb: 2\n---\nbodyT");
		expect(edits).toHaveLength(2);
	});

	it("moves the body out of the frontmatter when the cursor is inside it", () => {
		const doc = "---\na: 1\n---\nbody";
		const { text, cursor } = run(doc, "---\na: 1\nb: 2\n---\n", "T", [5, 5]);
		expect(text).toBe("---\na: 1\nb: 2\n---\nTbody");
		expect(cursor).toBe(19);
	});

	it("adds frontmatter to a note without one, with the cursor at the top", () => {
		const { text } = run("plain", "---\na: 1\n---\n", "T", [0, 0]);
		expect(text).toBe("---\na: 1\n---\nTplain");
	});

	it("adds frontmatter to a note without one, with the cursor lower", () => {
		const { text } = run("plain", "---\na: 1\n---\n", "T", [5, 5]);
		expect(text).toBe("---\na: 1\n---\nplainT");
	});

	it("places the cursor at the template marker", () => {
		const { text, cursor } = run("", "---\na: 1\n---\n", "ab cd", [0, 0], 3);
		expect(text).toBe("---\na: 1\n---\nab cd");
		expect(text.slice(cursor)).toBe("cd");
	});

	it("keeps a position-correct marker when the frontmatter grows and the cursor is lower", () => {
		const doc = "---\na: 1\n---\nxyz";
		const { text, cursor } = run(doc, "---\na: 1\nb: 2\n---\n", "ab cd", [14, 14], 3);
		expect(text).toBe("---\na: 1\nb: 2\n---\nxab cdyz");
		expect(text.slice(cursor)).toBe("cdyz");
	});

	it("does nothing for an empty body with unchanged frontmatter", () => {
		expect(run("abc", null, "", [1, 1]).edits).toEqual([]);
	});

	it("handles CRLF frontmatter ranges", () => {
		const doc = "---\r\na: 1\r\n---\r\nbody";
		const { text } = run(doc, "---\na: 1\nb: 2\n---\n", "", [doc.length, doc.length]);
		expect(text).toBe("---\na: 1\nb: 2\n---\nbody");
	});
});
