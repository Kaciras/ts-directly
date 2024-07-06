import { pathToFileURL } from "url";
import { defineSuite } from "esbench";
import { load, resolve } from "../src/loader.ts";
import { setCompiler } from "./helper.js";

await setCompiler(code => code);

/**
 * Measure the cost of the ESM hook (exclude compiler and the next hook).
 *
 * Run benchmark: pnpm exec esbench --file overhead.ts
 */
export default defineSuite({
	params: {
		file: ["src/loader.ts", "lib/loader.js"],
	},
	async setup(scene) {
		const { file } = scene.params;
		const url = pathToFileURL(file).href;

		function nextResolve() {
			return { url, importAttributes: {} };
		}

		function nextLoad() {
			return { format: "ts" as any, source: "" };
		}

		const ctx: any = {
			conditions: ["node", "import"],
			importAttributes: {},
			parentURL: pathToFileURL("module.ts").href,
		};

		scene.benchAsync("resolve", () => resolve(file, ctx, nextResolve));
		scene.benchAsync("load", () => load(url, ctx, nextLoad));
	},
});
