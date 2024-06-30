import { pathToFileURL } from "url";
import { defineSuite } from "esbench";
import { load, resolve } from "../src/loader.ts";
import { setCompiler } from "./helper.js";

function createMockImport(specifier: string) {
	const url = pathToFileURL(specifier).toString();

	function nextResolve() {
		return { url, importAttributes: {} };
	}

	function nextLoad() {
		return { format: "ts" as any, source: "" };
	}

	const ctx: any = {
		conditions: ["node", "import"],
		importAttributes: {},
	};

	return async () => {
		const resolved = await resolve(specifier, ctx, nextResolve);
		return load(resolved.url, ctx, nextLoad);
	};
}

await setCompiler(code => code);

/**
 * Measure the cost of the ESM hook (exclude compiler and the next hook).
 *
 * pnpm exec esbench --file overhead.ts
 */
export default defineSuite({
	params: {
		file: ["src/loader.ts", "lib/loader.js"],
	},
	async setup(scene) {
		const { file } = scene.params;
		scene.benchAsync("load", createMockImport(file));
	},
});
