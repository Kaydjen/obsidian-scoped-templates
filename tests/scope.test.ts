import { describe, expect, it } from "vitest";
import { parsePattern } from "../src/core/pattern";
import { evaluate, findByCommand, nearestTemplate, rankTemplates, visibleTemplates, type ScopeTemplate } from "../src/core/scope";

const make = (path: string, root: string, options: { where?: string[]; except?: string[]; command?: string; label?: string } = {}): ScopeTemplate => {
	const basename = path.split("/").pop()!.replace(/\.md$/, "");
	const template: ScopeTemplate = {
		path,
		basename,
		label: options.label ?? basename,
		root,
		where: options.where ? options.where.map(parsePattern) : null,
		except: (options.except ?? []).map(parsePattern),
	};
	if (options.command) template.command = options.command;
	return template;
};

const decision = make("project/_tpl/decision.md", "project", { where: ["{{project}}"], except: ["_*"] });

describe("evaluate", () => {
	it("matches the documented examples", () => {
		expect(evaluate(decision, "project/a9-pascaline", "_tpl")?.captures).toEqual({ project: "a9-pascaline" });
		expect(evaluate(decision, "project/a9-pascaline/research", "_tpl")?.captures).toEqual({ project: "a9-pascaline" });
		expect(evaluate(decision, "project", "_tpl")).toBeNull();
		expect(evaluate(decision, "project/_backlog", "_tpl")).toBeNull();
		expect(evaluate(decision, "project/__p.start", "_tpl")).toBeNull();
		expect(evaluate(decision, "project/_backlog/sub", "_tpl")).toBeNull();
	});

	it("is limited to its scope root", () => {
		expect(evaluate(decision, "domain/ai", "_tpl")).toBeNull();
		expect(evaluate(decision, "project2/a", "_tpl")).toBeNull();
	});

	it("is hidden inside template folders", () => {
		const everywhere = make("_tpl/note.md", "");
		expect(evaluate(everywhere, "project/_tpl", "_tpl")).toBeNull();
		expect(evaluate(everywhere, "project", "_tpl")).not.toBeNull();
	});

	it("shows a template without where everywhere under its root, including the root", () => {
		const t = make("project/_tpl/p.md", "project");
		expect(evaluate(t, "project", "_tpl")).not.toBeNull();
		expect(evaluate(t, "project/a/b", "_tpl")).not.toBeNull();
	});

	it("uses the first matching where pattern for captures", () => {
		const t = make("_tpl/t.md", "", { where: ["project/{{project}}", "core/areas/01_project"] });
		expect(evaluate(t, "project/a9/log", "_tpl")?.captures).toEqual({ project: "a9" });
		expect(evaluate(t, "core/areas/01_project", "_tpl")?.captures).toEqual({});
		expect(evaluate(t, "core/areas/00_domain", "_tpl")).toBeNull();
	});

	it("supports nested captures in where", () => {
		const t = make("project/_tpl/spec.md", "project", { where: ["{{project}}/ui/{{component}}"] });
		expect(evaluate(t, "project/a9/ui/button", "_tpl")?.captures).toEqual({ project: "a9", component: "button" });
		expect(evaluate(t, "project/a9/ui", "_tpl")).toBeNull();
	});

	it("serves different folders from one root template list", () => {
		const one = make("_tpl/one.md", "", { where: ["A", "B"] });
		const two = make("_tpl/two.md", "", { where: ["C", "D"] });
		const names = (folder: string) => visibleTemplates([one, two], folder, "_tpl", {}).map((v) => v.template.basename);
		expect(names("A/x")).toEqual(["one"]);
		expect(names("D")).toEqual(["two"]);
		expect(names("E")).toEqual([]);
	});
});

describe("visibleTemplates", () => {
	it("lets a deeper template override a same-named shallower one", () => {
		const shared = make("project/_tpl/decision.md", "project");
		const own = make("project/a9/_tpl/decision.md", "project/a9", { label: "A9 decision" });
		const result = visibleTemplates([shared, own], "project/a9/research", "_tpl", {});
		expect(result.map((v) => v.template.path)).toEqual(["project/a9/_tpl/decision.md"]);
		const elsewhere = visibleTemplates([shared, own], "project/b1", "_tpl", {});
		expect(elsewhere.map((v) => v.template.path)).toEqual(["project/_tpl/decision.md"]);
	});

	it("orders nearest scope first, then most recently used, then label", () => {
		const near = make("project/a9/_tpl/status.md", "project/a9");
		const farB = make("project/_tpl/b.md", "project", { label: "B" });
		const farA = make("project/_tpl/a.md", "project", { label: "A" });
		const farC = make("project/_tpl/c.md", "project", { label: "C" });
		const order = (mru: Record<string, number>) =>
			visibleTemplates([farB, farA, near, farC], "project/a9", "_tpl", mru).map((v) => v.template.label);
		expect(order({})).toEqual(["status", "A", "B", "C"]);
		expect(order({ "project/_tpl/c.md": 10, "project/_tpl/b.md": 5 })).toEqual(["status", "C", "B", "A"]);
	});

	it("returns nothing when no template applies", () => {
		expect(visibleTemplates([decision], "dk", "_tpl", {})).toEqual([]);
	});
});

describe("findByCommand", () => {
	it("returns the nearest template registered under the command", () => {
		const far = make("project/_tpl/decision.md", "project", { command: "decision" });
		const near = make("project/a9/_tpl/decision2.md", "project/a9", { command: "decision" });
		const visible = visibleTemplates([far, near], "project/a9", "_tpl", {});
		expect(findByCommand(visible, "decision")?.template.path).toBe("project/a9/_tpl/decision2.md");
		expect(findByCommand(visible, "other")).toBeUndefined();
	});
});

describe("scope edge cases", () => {
	it("a template at the vault root applies in every folder, including the root", () => {
		const everywhere = make("_tpl/note.md", "");
		expect(evaluate(everywhere, "", "_tpl")).not.toBeNull();
		expect(evaluate(everywhere, "a/b", "_tpl")).not.toBeNull();
		expect(evaluate(everywhere, "a/_tpl", "_tpl")).toBeNull();
	});

	it("tries every where pattern and takes the first match's captures", () => {
		const t = make("project/_tpl/t.md", "project", { where: ["{{a}}/x", "{{b}}"] });
		expect(evaluate(t, "project/p/x", "_tpl")?.captures).toEqual({ a: "p" });
		expect(evaluate(t, "project/p/y", "_tpl")?.captures).toEqual({ b: "p" });
	});

	it("except wins over where", () => {
		const t = make("project/_tpl/t.md", "project", { where: ["*"], except: ["a*"] });
		expect(evaluate(t, "project/abc", "_tpl")).toBeNull();
		expect(evaluate(t, "project/b", "_tpl")).not.toBeNull();
	});

	it("sorts by depth, then recent use, then label; a deeper same-named template wins", () => {
		const root = make("_tpl/note.md", "", { label: "Note" });
		const deep = make("project/_tpl/note.md", "project", { label: "Project note" });
		const zeta = make("_tpl/zeta.md", "", { label: "Zeta" });
		const alpha = make("_tpl/alpha.md", "", { label: "Alpha" });
		const list = visibleTemplates([root, zeta, deep, alpha], "project/a", "_tpl", {});
		expect(list.map((item) => item.template.path)).toEqual(["project/_tpl/note.md", "_tpl/alpha.md", "_tpl/zeta.md"]);
		const used = visibleTemplates([zeta, alpha], "", "_tpl", { "_tpl/zeta.md": 5 });
		expect(used.map((item) => item.template.label)).toEqual(["Zeta", "Alpha"]);
	});

	it("findByCommand returns the first match or nothing", () => {
		const a = make("_tpl/a.md", "", { command: "x" });
		const list = visibleTemplates([a], "", "_tpl", {});
		expect(findByCommand(list, "x")?.template).toBe(a);
		expect(findByCommand(list, "y")).toBeUndefined();
	});
});

describe("nearestTemplate", () => {
	const wrap = (scope: ScopeTemplate) => ({ scope });
	const root = wrap(make("_tpl/r.md", ""));
	const project = wrap(make("project/_tpl/p.md", "project"));
	const b6 = wrap(make("project/b6/_tpl/note.md", "project/b6"));
	const b6other = wrap(make("project/b6/_tpl/decision.md", "project/b6"));
	const deepB6 = wrap(make("project/b6/x/y/_tpl/d.md", "project/b6/x/y"));

	it("is undefined without templates", () => {
		expect(nearestTemplate([], "project/b7", {})).toBeUndefined();
	});

	it("prefers the deepest template whose scope contains the folder", () => {
		expect(nearestTemplate([root, project, b6], "project/b6/sub", {})).toBe(b6);
		expect(nearestTemplate([root, b6, project], "project/b7", {})).toBe(project);
	});

	it("a containing scope beats a closer one that does not contain the folder", () => {
		expect(nearestTemplate([deepB6, root], "project/b6/x/z", {})).toBe(root);
	});

	it("otherwise takes the longest shared prefix, then the shallower root", () => {
		expect(nearestTemplate([b6], "project/b7", {})).toBe(b6);
		expect(nearestTemplate([deepB6, b6], "project/b6/q/w", {})).toBe(b6);
		expect(nearestTemplate([deepB6, b6], "project/b8", {})).toBe(b6);
	});

	it("breaks ties by most recent use, then by label", () => {
		expect(nearestTemplate([b6, b6other], "project/b6", { [b6other.scope.path]: 5 })).toBe(b6other);
		expect(nearestTemplate([b6, b6other], "project/b6", {})).toBe(b6other);
	});
});

describe("rankTemplates", () => {
	const wrap = (scope: ScopeTemplate) => ({ scope });
	const root = wrap(make("_tpl/r.md", ""));
	const project = wrap(make("project/_tpl/p.md", "project"));
	const b6 = wrap(make("project/b6/_tpl/note.md", "project/b6"));
	const b5 = wrap(make("project/b5/_tpl/note.md", "project/b5", { label: "a" }));

	it("lists the containing scopes deepest first, then the others by closeness", () => {
		expect(rankTemplates([root, b6, project, b5], "project/b7", {})).toEqual([project, root, b5, b6]);
		expect(rankTemplates([], "x", {})).toEqual([]);
	});
});
