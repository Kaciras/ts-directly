import { readFileSync } from "fs";
import { defineSuite, Profiler } from "esbench";
import { names } from "../src/compiler.ts";
import { load, resolve, tsconfigCache, typeCache } from "../src/loader.ts";
import { getFilesToTransform, setCompiler } from "./helper.ts";

const urls = await getFilesToTransform();
console.info(`Benchmark for import ${urls.length} files.`);

function nextResolve(url: string) {
	return { url, importAttributes: {} };
}

function nextLoad(url: string) {
	return {
		format: "ts" as any,
		source: readFileSync(url.slice(8)),
	};
}

const ctx = {} as any;

async function emulateImport(file: string) {
	return load((await resolve(file, ctx, nextResolve)).url, ctx, nextLoad);
}

const fileSizeProfiler: Profiler = {
	onStart: ctx => ctx.defineMetric({
		key: "filesize",
		format: "{dataSize}",
		analysis: 1,
		lowerIsBetter: true,
	}),
	async onCase(ctx, case_, metrics) {
		const results = await case_.invoke() as any[];
		metrics.filesize = results.reduce((v, c) => v + c.source.length, 0);
	},
};

// Run benchmark: pnpm exec esbench --file loader.ts
export default defineSuite({
	profilers: [fileSizeProfiler],
	params: {
		compiler: names,
	},
	baseline: {
		type: "compiler",
		value: names[0],
	},
	async setup(scene) {
		await setCompiler(scene.params.compiler);

		scene.benchAsync("load", () => {
			tsconfigCache.clear();
			typeCache.clear();
			return Promise.all(urls.map(emulateImport));
		});
	},
});
