import { existsSync, globSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { createGunzip } from "zlib";
import { Readable } from "stream";
import { once } from "events";
import { defineSuite, Profiler } from "esbench";
import * as tar from "tar-fs";
import { CompileFn, compilers, load, resolve, tsconfigCache, typeCache } from "../src/loader.ts";

/**
 * Originally used TypeScript's repository, but it doesn't compile with SWC.
 * https://github.com/swc-project/swc/issues/7899
 */
const ASSET_URL = "https://github.com/storybookjs/storybook/archive/refs/tags/v8.1.1.tar.gz";

const dataDir = join(import.meta.dirname, "../bench-data");

if (!existsSync(dataDir)) {
	console.info("Downloading & extracting benchmark data...");
	const { body, ok, status } = await fetch(ASSET_URL);
	if (!ok) {
		throw new Error(`Assets download failed (${status}).`);
	}

	const filter = (name: string) =>
		name.endsWith(".d.ts") ||			// Not need to transform.
		name.includes("angular") ||			// Use decorators.
		name.includes("__mocks") ||			// Broken files.
		name.includes("__testfixtures__");	// Broken files.

	const extracting = Readable.fromWeb(body as any)
		.pipe(createGunzip())
		.pipe(tar.extract(dataDir, { filter, strip: 1 }));

	await once(extracting, "finish");
}

const urls = globSync("code/**/*.ts", { cwd: dataDir }) as string[];
console.info(`Benchmark for import ${urls.length} files.`);

function nextResolve(file: string) {
	return { url: pathToFileURL(join(dataDir, file)).toString() };
}

function nextLoad(url: string) {
	return {
		format: "ts" as any,
		source: readFileSync(url.slice(8)),
	};
}

const ctx = {} as any;

async function doImport(file: string) {
	return load((await resolve(file, ctx, nextResolve)).url, ctx, nextLoad);
}

let selectedCompiler: CompileFn;

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
		compiler: compilers,
	},
	baseline: {
		type: "compiler",
		value: compilers[0],
	},
	async setup(scene) {
		selectedCompiler = await scene.params.compiler();
		compilers[0] = async () => (...args) => selectedCompiler(...args);

		scene.benchAsync("load", () => {
			tsconfigCache.clear();
			typeCache.clear();
			return Promise.all(urls.map(doImport));
		});
	},
});
