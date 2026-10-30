import { describe, expect, it } from "vitest";
import {
	folderAndAncestors,
	isInside,
	joinPath,
	parentPath,
	relativeSegments,
	resolveFolder,
	splitPath,
	templateFolderFor,
} from "../src/core/paths";

describe("paths", () => {
	it("splits and joins ignoring empty segments", () => {
		expect(splitPath("")).toEqual([]);
		expect(splitPath("/a//b/")).toEqual(["a", "b"]);
		expect(joinPath("", "a/b", "", "c")).toBe("a/b/c");
		expect(parentPath("a/b/c")).toBe("a/b");
		expect(parentPath("a")).toBe("");
	});

	it("checks containment by whole segments", () => {
		expect(isInside("project/a9", "project")).toBe(true);
		expect(isInside("project", "project")).toBe(true);
		expect(isInside("project2/a9", "project")).toBe(false);
		expect(isInside("project", "project/a9")).toBe(false);
		expect(isInside("anything/deep", "")).toBe(true);
	});

	it("returns segments below the root", () => {
		expect(relativeSegments("project/a9/research", "project")).toEqual(["a9", "research"]);
		expect(relativeSegments("project", "project")).toEqual([]);
		expect(relativeSegments("x/y", "")).toEqual(["x", "y"]);
	});
});

describe("resolveFolder", () => {
	it("falls back to the context folder", () => {
		expect(resolveFolder(undefined, "project", "project/a9/research", "_tpl")).toBe("project/a9/research");
		expect(resolveFolder(undefined, "", "", "_tpl")).toBe("");
	});

	it("resolves relative to the scope root", () => {
		expect(resolveFolder("a9/decisions", "project", "x", "_tpl")).toBe("project/a9/decisions");
		expect(resolveFolder("a9", "", "x", "_tpl")).toBe("a9");
	});

	it("treats a leading slash as vault-relative", () => {
		expect(resolveFolder("/inbox/new", "project", "x", "_tpl")).toBe("inbox/new");
	});

	it("rejects traversal, template folders and unresolved variables", () => {
		expect(() => resolveFolder("../x", "project", "", "_tpl")).toThrow();
		expect(() => resolveFolder("a/_tpl", "project", "", "_tpl")).toThrow();
		expect(() => resolveFolder("{{nope}}/x", "project", "", "_tpl")).toThrow();
	});
});

describe("folderAndAncestors / templateFolderFor", () => {
	it("lists the folder up to the vault root", () => {
		expect(folderAndAncestors("a/b")).toEqual(["a/b", "a", ""]);
		expect(folderAndAncestors("")).toEqual([""]);
	});

	it("resolves the template folder for a picked folder", () => {
		expect(templateFolderFor("project", "_tpl")).toBe("project/_tpl");
		expect(templateFolderFor("", "_tpl")).toBe("_tpl");
		expect(templateFolderFor("project/_tpl", "_tpl")).toBe("project/_tpl");
		expect(templateFolderFor("project/_tpl/img", "_tpl")).toBeNull();
	});
});

describe("resolveFolder edge cases", () => {
	it("reads backslashes as separators, including a leading one", () => {
		expect(resolveFolder("a\\b", "project", "", "_tpl")).toBe("project/a/b");
		expect(resolveFolder("\\inbox", "project", "", "_tpl")).toBe("inbox");
	});

	it("ignores blank segments, extra slashes and surrounding spaces", () => {
		expect(resolveFolder(" a / / b/ ", "project", "", "_tpl")).toBe("project/a/b");
		expect(resolveFolder("/a/ /b", "project", "", "_tpl")).toBe("a/b");
	});

	it("an empty value means the scope root, a lone slash the vault root", () => {
		expect(resolveFolder("", "project", "x", "_tpl")).toBe("project");
		expect(resolveFolder("/", "project", "x", "_tpl")).toBe("");
	});

	it("rejects a dot segment", () => {
		expect(() => resolveFolder("a/./b", "", "", "_tpl")).toThrow(/"\."/);
	});
});

describe("path helpers on odd input", () => {
	it("handles the root and trailing slashes", () => {
		expect(parentPath("")).toBe("");
		expect(parentPath("a/b/")).toBe("a");
		expect(isInside("project/", "project/")).toBe(true);
		expect(isInside("", "project")).toBe(false);
		expect(folderAndAncestors("/a/b/")).toEqual(["a/b", "a", ""]);
	});

	it("is case-sensitive for containment", () => {
		expect(isInside("Project/a", "project")).toBe(false);
	});

	it("finds the template folder only for an exact name", () => {
		expect(templateFolderFor("a/_tpl_x", "_tpl")).toBe("a/_tpl_x/_tpl");
		expect(templateFolderFor("_tpl", "_tpl")).toBe("_tpl");
		expect(templateFolderFor("/a/", "_tpl")).toBe("a/_tpl");
	});
});

describe("resolveFolder messages", () => {
	it("names the variable and the template folder", () => {
		expect(() => resolveFolder("{{nope}}/x", "project", "", "_tpl")).toThrow("{{nope}} has no value here");
		expect(() => resolveFolder("a/{{broken", "", "", "_tpl")).toThrow(/has no value here/);
		expect(() => resolveFolder("a/_tpl", "project", "", "_tpl")).toThrow('tpl-into cannot point into a "_tpl" folder');
	});
});
