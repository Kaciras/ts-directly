import { existsSync, globSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { pathToFileURL } from "url";
import { createGunzip } from "zlib";
import { Readable } from "stream";
import { once } from "events";
import { defineSuite } from "esbench";
import * as tar from "tar-fs";
import { CompileFn, compilers, load, resolve, tsconfigCache, typeCache } from "../src/loader.ts";

/**
 * Originally used TypeScript's repository, but it doesn't compile with SWC.
 * https://github.com/swc-project/swc/issues/7899
 */
const ASSET_VERSION = "8.1.1";
const ASSET_URL = `https://github.com/storybookjs/storybook/archive/refs/tags/v${ASSET_VERSION}.tar.gz`;

const root = dirname(import.meta.dirname);
const dataDir = join(root, `storybook-${ASSET_VERSION}`);

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
		.pipe(tar.extract(root, { filter }));

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
