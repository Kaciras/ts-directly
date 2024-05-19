import { globSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { createGunzip } from "zlib";
import { Readable } from "node:stream";
import { once } from "events";
import { existsSync } from "node:fs";
import { defineSuite } from "esbench";
import tar from "tar-fs";
import { load, typeCache } from "../src/loader.js";

/**
 * Originally used TypeScript's repository, but it doesn't compile with SWC.
 * https://github.com/swc-project/swc/issues/7899
 */
const ASSET_VERSION = "8.1.1";
const ASSET_URL = `https://github.com/storybookjs/storybook/archive/refs/tags/v${ASSET_VERSION}.tar.gz`;

const root = join(import.meta.dirname, `storybook-${ASSET_VERSION}`);

if (!existsSync(root)) {
	console.info("Downloading benchmark data...");
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

const urls = globSync("code/**/*.ts", { cwd: root })
	.map(f => pathToFileURL(join(root, f)).toString());

console.info(`Benchmark with ${urls.length} files`);

function nextLoad(url: string) {
	return { source: readFileSync(url.slice(8)) } as any;
}

export default defineSuite({
	timing: {
		iterations: 1,
	},
	setup(scene) {
		scene.benchAsync("load", () => {
			typeCache.clear();
			return Promise.all(urls.map(url => load(url, {} as any, nextLoad)));
		});
	},
});
