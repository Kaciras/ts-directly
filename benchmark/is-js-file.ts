import { defineSuite } from "esbench";

/*
 * pnpm exec esbench --file is-js-file.ts
 *
 * | No. |            Name |     time | time.SD |
 * | --: | --------------: | -------: | ------: |
 * |   0 |   single regexp | 91.24 ns | 0.09 ns |
 * |   1 |   double regexp | 30.35 ns | 0.09 ns |
 * |   2 | manual matching |  7.34 ns | 0.03 ns |
 */
const url = "file:/usr/local/projects/javascript/esbench/docs/node_modules/.pnpm/monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js";

const fileRE = /^(?:file:|\.{1,2}\/)/i;
const jsRE = /\.([cm]?jsx?)$/i;
const jsFileRE = /^(?:file:|\.{1,2}\/).+\.([cm]?jsx?)$/i;

function isFile(spec: string) {
	if (spec.charCodeAt(0) === 46) {
		const c1 = spec.charCodeAt(1);
		return c1 === 47 || c1 === 46 && spec.charCodeAt(2) === 47;
	}
	return spec.startsWith("file:");
}

function isJS(spec: string) {
	let i = spec.length - 1;
	if (spec.charCodeAt(i) === 120) {
		i -= 1;
	}
	if (
		spec.charCodeAt(i) !== 115 ||
		spec.charCodeAt(i - 1) !== 106
	) {
		return false;
	}
	switch (spec.charCodeAt(i - 2)) {
		case 46:
			return true;
		case 99:
		case 109:
			return spec.charCodeAt(i - 3) === 46;
		default:
			return false;
	}
}

export default defineSuite(scene => {
	scene.bench("single regexp", () => jsFileRE.test(url));
	scene.bench("double regexp", () => fileRE.test(url) && jsRE.test(url));
	scene.bench("manual matching", () => isFile(url) && isJS(url));
});
