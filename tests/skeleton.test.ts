import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { ghostDefaults } from "../src/core/ghost";
import { buildSkeleton, commonKeys } from "../src/core/skeleton";
import { parseTemplate } from "../src/core/template";

describe("commonKeys", () => {
	it("keeps keys present in at least the threshold share, most common first", () => {
		const notes = [["status", "project", "d-time"], ["status", "project"], ["status", "domain"], ["aliases"]];
		expect(commonKeys(notes, 0.5, "tpl-")).toEqual(["status", "project"]);
	});

	it("skips config keys and handles no notes", () => {
		expect(commonKeys([["tpl-where", "a"]], 0.5, "tpl-")).toEqual(["a"]);
		expect(commonKeys([], 0.5, "tpl-")).toEqual([]);
	});
});

describe("buildSkeleton", () => {
	const text = buildSkeleton(["status", "d-time", "created"], { "d-time": "datetime", created: "date" });

	it("writes explicit config values and date values for date-typed properties", () => {
		expect(text).toContain("tpl-where: []\n");
		expect(text).toContain("tpl-open: false\n");
		expect(text).toContain('d-time: "{{date:YYYY-MM-DDTHH:mm:ss}}"\n');
		expect(text).toContain('created: "{{date:YYYY-MM-DD}}"\n');
		expect(text).toContain("\nstatus:\n");
	});

	it("is a valid template that is visible everywhere in its scope", () => {
		const parsed = parseTemplate(text, (yaml) => YAML.parse(yaml));
		expect(parsed.config.where).toBeNull();
		expect(parsed.config.except).toEqual([]);
		expect(Object.keys(parsed.frontmatter)).toEqual(["status", "d-time", "created"]);
	});
});

describe("ghostDefaults", () => {
	it("shows the effective defaults", () => {
		const ghost = ghostDefaults("decision", "project");
		expect(ghost["tpl-label"]).toBe("decision");
		expect(ghost["tpl-where"]).toBe("project");
		expect(ghost["tpl-filename"]).toBe("{{selection}} | decision-{{date:YYMMDDHHmm}}");
		expect(ghostDefaults("x", "")["tpl-where"]).toBe("/");
	});
});

describe("buildSkeleton with chosen keys", () => {
	it("writes only the chosen template keys, in file order", () => {
		const text = buildSkeleton(["status"], {}, ["tpl-where", "tpl-label"]);
		expect(text).toBe("---\ntpl-label:\ntpl-where: []\nstatus:\n---\n");
	});

	it("allows no keys at all", () => {
		expect(buildSkeleton([], {}, [])).toBe("---\n---\n");
	});
});
