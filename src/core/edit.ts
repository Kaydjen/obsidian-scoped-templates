export interface Edit {
	from: number;
	to: number;
	text: string;
}

export interface ApplyEditInput {
	doc: string;
	/** Offset where the note's frontmatter block ends (0 when it has none). */
	frontmatterEnd: number;
	/** New frontmatter block, or null when the note's frontmatter stays as it is. */
	frontmatterBlock: string | null;
	body: string;
	/** Cursor offset inside `body`, or null to put the cursor after the inserted text. */
	bodyCursor: number | null;
	selectionFrom: number;
	selectionTo: number;
}

export interface ApplyEditResult {
	edits: Edit[];
	/** Cursor offset in the document after the edits. */
	cursor: number;
}

/**
 * Edits are non-overlapping and sorted, with offsets in the original document, so they can
 * go into one editor transaction (single undo step).
 */
export function computeApplyEdits(input: ApplyEditInput): ApplyEditResult {
	const { frontmatterEnd, frontmatterBlock, body, bodyCursor } = input;
	const insideFrontmatter = input.selectionFrom < frontmatterEnd;
	const insertFrom = insideFrontmatter ? frontmatterEnd : input.selectionFrom;
	const insertTo = insideFrontmatter ? frontmatterEnd : Math.max(input.selectionTo, insertFrom);
	const edits: Edit[] = [];
	let bodyStart: number;

	if (frontmatterBlock === null) {
		if (body !== "") edits.push({ from: insertFrom, to: insertTo, text: body });
		bodyStart = insertFrom;
	} else if (insertFrom <= frontmatterEnd) {
		edits.push({ from: 0, to: Math.max(frontmatterEnd, insertTo), text: frontmatterBlock + body });
		bodyStart = frontmatterBlock.length;
	} else {
		edits.push({ from: 0, to: frontmatterEnd, text: frontmatterBlock });
		if (body !== "") edits.push({ from: insertFrom, to: insertTo, text: body });
		bodyStart = insertFrom + frontmatterBlock.length - frontmatterEnd;
	}
	return { edits, cursor: bodyStart + (bodyCursor ?? body.length) };
}

export function applyEdits(doc: string, edits: Edit[]): string {
	let result = "";
	let position = 0;
	for (const edit of edits) {
		result += doc.slice(position, edit.from) + edit.text;
		position = edit.to;
	}
	return result + doc.slice(position);
}
