import { Notice, parseYaml, stringifyYaml, type TFile } from "obsidian";
import { NOTICE_INVALID_FRONTMATTER, NOTICE_OPEN_NOTE_FIRST } from "../constants";
import { applyEdits, computeApplyEdits, type ApplyEditResult } from "../core/edit";
import { buildFrontmatter, mergeFrontmatter, serializeFrontmatter, type Frontmatter } from "../core/frontmatter";
import { extractCursor, substitute } from "../core/substitute";
import { splitFrontmatter } from "../core/template";
import { chooseTemplate } from "./choose";
import {
	currentTime,
	errorMessage,
	getActiveContext,
	makeFromResolver,
	makeSubstituteDeps,
	withLabel,
	type ActiveContext,
	type Host,
	type PickedTemplate,
} from "./host";

export async function runApply(host: Host, command?: string): Promise<void> {
	try {
		await apply(host, command);
	} catch (error) {
		new Notice(errorMessage(error));
	}
}

function parseNoteFrontmatter(yaml: string | null): Frontmatter | null {
	if (yaml === null || yaml.trim() === "") return null;
	let parsed: unknown;
	try {
		parsed = parseYaml(yaml);
	} catch {
		throw new Error(NOTICE_INVALID_FRONTMATTER);
	}
	if (parsed === null || parsed === undefined) return null;
	if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(NOTICE_INVALID_FRONTMATTER);
	return parsed as Frontmatter;
}

/** Pure with respect to the document: reads `doc`, returns edits against it. */
function compute(
	host: Host,
	context: ActiveContext,
	picked: PickedTemplate,
	doc: string,
	selection: { from: number; to: number },
): ApplyEditResult {
	const { entry, captures } = picked;
	const split = splitFrontmatter(doc);
	const existing = parseNoteFrontmatter(split.yaml);
	const file = context.file;
	if (!file) throw new Error(NOTICE_OPEN_NOTE_FIRST);

	const from = makeFromResolver(host, {
		source: file,
		sourceFrontmatter: existing ?? {},
		folder: context.folder,
		root: entry.scope.root,
	});
	const deps = makeSubstituteDeps(host, {
		now: currentTime(),
		captures,
		title: file.basename,
		selection: context.selection,
		source: "",
		from,
		template: entry.file.basename,
		here: `/${context.folder}`,
	});
	const templateFrontmatter = buildFrontmatter(entry.parsed.frontmatter, {
		text: (value) => substitute(value, deps),
		from,
	});
	const { text: body, offset } = extractCursor(substitute(entry.parsed.body, deps));
	const { merged, changed } = mergeFrontmatter(existing, templateFrontmatter);

	return computeApplyEdits({
		doc,
		frontmatterEnd: split.end,
		frontmatterBlock: changed ? serializeFrontmatter(merged, stringifyYaml) : null,
		body,
		bodyCursor: offset,
		selectionFrom: selection.from,
		selectionTo: selection.to,
	});
}

async function apply(host: Host, command?: string): Promise<void> {
	const { app } = host;
	const context = getActiveContext(app);
	const file = context.file;
	if (!file) {
		new Notice(NOTICE_OPEN_NOTE_FIRST);
		return;
	}
	const picked = await chooseTemplate(host, context.folder, command);
	if (!picked) return;

	await withLabel(picked.entry.scope.label, () => write(host, context, file, picked));
	await host.recordUse(picked.entry.scope.path);
}

async function write(host: Host, context: ActiveContext, file: TFile, picked: PickedTemplate): Promise<void> {
	const { app } = host;
	const editor = context.editor;
	if (editor) {
		// One transaction: a single undo step, and no race with the file on disk.
		const result = compute(host, context, picked, editor.getValue(), {
			from: editor.posToOffset(editor.getCursor("from")),
			to: editor.posToOffset(editor.getCursor("to")),
		});
		if (result.edits.length > 0) {
			editor.transaction({
				changes: result.edits.map((edit) => ({
					from: editor.offsetToPos(edit.from),
					to: editor.offsetToPos(edit.to),
					text: edit.text,
				})),
			});
			editor.setCursor(editor.offsetToPos(result.cursor));
		}
	} else {
		await app.vault.process(file, (data) => {
			const result = compute(host, context, picked, data, { from: data.length, to: data.length });
			return applyEdits(data, result.edits);
		});
	}
}
