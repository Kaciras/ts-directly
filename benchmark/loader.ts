import { access, readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { defineSuite, Profiler } from "esbench";
import { names } from "../src/compiler.ts";
import { load, resolve, typeCache } from "../src/loader.ts";
import { tsconfigCache } from "../src/tsconfig.ts";
import { getFilesToTransform, setCompiler } from "./helper.ts";

const urls = await getFilesToTransform();
console.info(`Benchmark for import ${urls.length} files.`);

async function nextResolve(url: string) {
	try {
		await access(fileURLToPath(url));
		return { url, importAttributes: {} };
	} catch {
		throw Object.assign(new Error(), {
			code: "ERR_MODULE_NOT_FOUND",
		});
	}
}

async function nextLoad(url: string) {
	return {
		format: "ts" as any,
		source: await readFile(url.slice(8)),
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
	async onCase(_, case_, metrics) {
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
