import { existsSync, globSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { createGunzip } from "zlib";
import { once } from "events";
import { pathToFileURL } from "url";
import * as tar from "tar-fs";
import { CompileFn, compilers, names } from "../src/compiler.js";

/**
 * Originally used TypeScript's repository, but it doesn't compile with SWC.
 * https://github.com/swc-project/swc/issues/7899
 */
const ASSET_URL = "https://github.com/storybookjs/storybook/archive/refs/tags/v8.1.1.tar.gz";

const dataDir = join(import.meta.dirname, "../bench-data");

async function downloadAssets() {
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

	return once(extracting, "finish");
}

export async function getFilesToTransform() {
	if (!existsSync(dataDir)) {
		await downloadAssets();
	}
	return (globSync("./code/**/*.ts", { cwd: dataDir }) as string[])
		.map(file => pathToFileURL(join(dataDir, file)).href);
}

// Bypass compiler instance cache.
export const actualCompilers = [...compilers];
let selectedCompiler: CompileFn;
compilers[0] = async () => (...args) => selectedCompiler(...args);

export async function setCompiler(type: CompileFn | string) {
	selectedCompiler = typeof type === "function"
		? type
		: await actualCompilers[names.indexOf(type)]();
}
