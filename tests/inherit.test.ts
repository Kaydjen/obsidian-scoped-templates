import { describe, expect, it } from "vitest";
import { resolveFrom } from "../src/core/inherit";

type Tree = Record<string, unknown[]>;

const run = (tree: Tree, overrides: Partial<Parameters<typeof resolveFrom>[0]> = {}) => {
	const asked: string[] = [];
	const result = resolveFrom({
		key: "project",
		sourceValue: undefined,
		folder: "project/a9/research",
		root: "project",
		enabled: true,
		listFolderValues: (folder) => {
			asked.push(folder);
			return tree[folder] ?? [];
		},
		...overrides,
	});
	return { result, asked };
};

describe("resolveFrom", () => {
	it("prefers the source file's own value", () => {
		const { result, asked } = run({}, { sourceValue: ["[[own]]"] });
		expect(result).toEqual(["[[own]]"]);
		expect(asked).toEqual([]);
	});

	it("takes equal values from neighbors", () => {
		const link = ["[[a9]]"];
		expect(run({ "project/a9/research": [link, ["[[a9]]"]] }).result).toEqual(["[[a9]]"]);
	});

	it("returns nothing when neighbors disagree, without looking higher", () => {
		const { result, asked } = run({ "project/a9/research": [["[[a]]"], ["[[b]]"]], "project/a9": [["[[c]]"]] });
		expect(result).toBeUndefined();
		expect(asked).toEqual(["project/a9/research"]);
	});

	it("moves up through empty folders", () => {
		const { result, asked } = run({ "project/a9": [["[[a9]]"]] });
		expect(result).toEqual(["[[a9]]"]);
		expect(asked).toEqual(["project/a9/research", "project/a9"]);
	});

	it("stops at the scope root", () => {
		const { result, asked } = run({ "": [["[[x]]"]] });
		expect(result).toBeUndefined();
		expect(asked).toEqual(["project/a9/research", "project/a9", "project"]);
	});

	it("searches up to the vault root for a root scope", () => {
		const { asked } = run({}, { root: "", folder: "a/b" });
		expect(asked).toEqual(["a/b", "a", ""]);
	});

	it("does nothing when the setting is off", () => {
		const { result, asked } = run({ "project/a9/research": [["[[a]]"]] }, { enabled: false });
		expect(result).toBeUndefined();
		expect(asked).toEqual([]);
	});

	it("treats an empty source value as missing", () => {
		expect(run({ "project/a9/research": [["[[a]]"]] }, { sourceValue: [] }).result).toEqual(["[[a]]"]);
	});
});
