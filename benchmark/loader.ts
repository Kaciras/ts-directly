import { existsSync, globSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { createGunzip } from "zlib";
import { Readable } from "stream";
import { once } from "events";
import { defineSuite } from "esbench";
import tar from "tar-fs";
import { CompileFn, compilers, load, typeCache } from "../src/loader.ts";

/*
 * pnpm exec esbench --file loader.ts
 *
 * | No. | Name |        compiler |      time |  time.SD | time.ratio |
 * | --: | ---: | --------------: | --------: | -------: | ---------: |
 * |   0 | load |     swcCompiler | 329.79 ms |   2.9 ms |      0.00% |
 * |   1 | load | esbuildCompiler |    372 ms |  9.41 ms |    +12.80% |
 * |   2 | load |      tsCompiler |    4.96 s | 37.47 ms |  +1403.45% |
 */

/**
 * Originally used TypeScript's repository, but it doesn't compile with SWC.
 * https://github.com/swc-project/swc/issues/7899
 */
const ASSET_VERSION = "8.1.1";
const ASSET_URL = `https://github.com/storybookjs/storybook/archive/refs/tags/v${ASSET_VERSION}.tar.gz`;

const dataDir = join(import.meta.dirname, `../storybook-${ASSET_VERSION}`);

if (!existsSync(dataDir)) {
	console.info("Downloading & extracting benchmark data...");
	const { body, ok, status } = await fetch(ASSET_URL);
	if (!ok) {
		throw new Error(`Assets download failed (${status}).`);
	}

	// Broken files & declarations, we do not compile them.
	const filter = (name: string) =>
		name.includes("__testfixtures__") || name.endsWith(".d.ts");

	const extracting = Readable.fromWeb(body as any)
		.pipe(createGunzip())
		.pipe(tar.extract(import.meta.dirname, { filter }));

	await once(extracting, "finish");
}

const urls = (globSync("code/**/*.ts", { cwd: dataDir }) as string[])
	.map(f => pathToFileURL(join(dataDir, f)).toString());

console.info(`Benchmark for transform ${urls.length} files.`);

function nextLoad(url: string) {
	return {
		format: "ts" as any,
		source: readFileSync(url.slice(8)),
	};
}

let selectedCompiler: CompileFn;

export default defineSuite({
	params: {
		compiler: compilers,
	},
	baseline: {
		type: "compiler",
		value: compilers[0],
	},
	timing: {
		iterations: 1,
	},
	async setup(scene) {
		selectedCompiler = await scene.params.compiler();
		compilers[0] = async () => (...args) => selectedCompiler(...args);

		scene.benchAsync("load", () => {
			typeCache.clear();
			return Promise.all(urls.map(url => load(url, {} as any, nextLoad)));
		});
	},
});
