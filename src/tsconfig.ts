import { join, resolve as resolvePath } from "path";
import { fileURLToPath } from "url";
import { parse, TSConfckCache } from "tsconfck";

interface AliasEntry {
	root: string;
	maps?: PathAlias[];
}

export const tsconfigCache = new TSConfckCache<any>();
export const aliasCache = new Map<string, AliasEntry>();

const EMPTY: readonly string[] = [];

/**
 * Parse the closest tsconfig.json, and normalize some options.
 *
 * @param file path to a tsconfig.json or a source file or directory (absolute or relative to cwd)
 * @see https://github.com/dominikg/tsconfck
 * @return tsconfig JSON object, with some additional properties.
 */
export async function getTSConfig(file: string) {
	const result = await parse(file, { cache: tsconfigCache });
	const { tsconfig, tsconfigFile } = result;
	if (!tsconfigFile) {
		return;
	}
	if (!aliasCache.has(tsconfigFile)) {
		const options = tsconfig.compilerOptions ??= {};
		const { paths, baseUrl = "" } = options;

		options.inlineSourceMap = true;
		options.removeComments = true;

		// Avoid modify source path in the source map.
		delete options.outDir;

		const root = resolvePath(tsconfigFile, "..", baseUrl);
		let maps: PathAlias[] | undefined;
		if (paths) {
			maps = PathAlias.parse(root, paths);
		}
		aliasCache.set(tsconfigFile, { root, maps });

		options.target &&= options.target.toLowerCase();
		options.module &&= options.module.toLowerCase();
	}
	return result;
}

class PathAlias {
	/**
	 * File paths (have resolved with `baseUrl`) provided for the path mapping.
	 */
	readonly templates: string[];

	/**
	 * String before the wildcard, or the whole pattern if no wildcard found.
	 *
	 * Since paths patterns can only contain a single * wildcard, we split it
	 * into prefix and suffix and use `startsWith` to match specifiers.
	 */
	readonly prefix: string;

	/**
	 * String after the wildcard, or undefined if the pattern is exact match.
	 */
	readonly suffix?: string;

	constructor(root: string, key: string, list: string[]) {
		const parts = key.split("*");
		this.prefix = parts[0];
		this.suffix = parts[1];
		this.templates = list.map(p => join(root, p));
	}

	test(id: string) {
		const { prefix, suffix } = this;
		return suffix === undefined
			? id === prefix
			: id.startsWith(prefix) && id.endsWith(suffix);
	}

	getPaths(id: string) {
		const { prefix, suffix, templates } = this;
		if (suffix === undefined) {
			return templates;
		}
		const s = id.slice(prefix.length, id.length - suffix.length);
		return templates.map(t => t.replace("*", s));
	}

	static parse(root: string, paths: Record<string, string[]>) {
		const alias: PathAlias[] = [];
		for (const [key, templates] of Object.entries(paths)) {
			alias.push(new PathAlias(root, key, templates));
		}
		// Pattern with the longer prefix before any * takes higher precedence.
		return alias.sort((a, b) => b.prefix.length - a.prefix.length);
	}
}

/**
 * Get alias paths of the import specifier, depend on tsconfig.json
 *
 * https://www.typescriptlang.org/docs/handbook/modules/reference.html#paths
 * https://www.typescriptlang.org/docs/handbook/modules/reference.html#baseurl
 *
 * @return Possible paths of the specifier.
 */
export async function getAlias(id: string, parent?: string) {
	if (
		/^\.{0,2}\//.test(id) ||		  // Alias is only for bare specifier.
		!parent?.startsWith("file:") ||	  // tsconfig is only include local files.
		parent.includes("/node_modules/") // Library should not use alias.
	) {
		return EMPTY;
	}
	const found = await getTSConfig(fileURLToPath(parent));
	if (!found) {
		return EMPTY; // The package of `parent` does not have tsconfig.
	}
	const { compilerOptions } = found.tsconfig;
	const { maps, root } = aliasCache.get(found.tsconfigFile)!;
	const match = maps?.find(item => item.test(id));
	if (match) {
		return match.getPaths(id);
	}
	return compilerOptions.baseUrl ? [join(root, id)] : EMPTY;
}
