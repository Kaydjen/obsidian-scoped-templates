import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const production = process.argv[2] === "production";
const outDir = process.env.OBSIDIAN_PLUGIN_DIR;
const staticFiles = ["manifest.json", "styles.css"];

const copyToVault = {
	name: "copy-to-vault",
	setup(build) {
		build.onEnd((result) => {
			if (!outDir || result.errors.length > 0) return;
			mkdirSync(outDir, { recursive: true });
			copyFileSync("main.js", join(outDir, "main.js"));
			for (const file of staticFiles) {
				if (existsSync(file)) copyFileSync(file, join(outDir, file));
			}
			console.log(`copied to ${outDir}`);
		});
	},
};

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/*",
		"@lezer/*",
		...builtinModules,
		...builtinModules.map((name) => `node:${name}`),
	],
	format: "cjs",
	target: "es2020",
	logLevel: "info",
	sourcemap: production ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	plugins: [copyToVault],
});

if (production) {
	await context.rebuild();
	await context.dispose();
} else {
	await context.watch();
}
