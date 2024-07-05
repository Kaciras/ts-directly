import { join, resolve as resolvePath } from "path";
import { fileURLToPath } from "url";
import { parse, TSConfckCache } from "tsconfck";

export const tsconfigCache = new TSConfckCache<any>();

interface TSConfigEssential {
	root: string;
	alias?: PathAlias[];
	compilerOptions: any;
}

/**
 * Parse the closest tsconfig.json, and normalize some options.
 *
 * @param file path to a tsconfig.json or a source file or directory (absolute or relative to cwd)
 * @see https://github.com/dominikg/tsconfck
 * @return tsconfig JSON object, with some additional properties.
 */
export async function getTSConfig(file: string) {
	const { tsconfig, tsconfigFile } = await parse(file, {
		cache: tsconfigCache,
	});
	if (!tsconfigFile) {
		return;
	}
	if (!tsconfig.root) {
		const options = tsconfig.compilerOptions ??= {};
		const { paths, baseUrl = "" } = options;
		tsconfig.root = resolvePath(tsconfigFile, "..", baseUrl);

		options.inlineSourceMap = true;
		options.removeComments = true;

		// Avoid modify source path in the source map.
		delete options.outDir;

		if (paths) {
			tsconfig.alias = PathAlias.parse(tsconfig, paths);
		}

		options.target &&= options.target.toLowerCase();
		options.module &&= options.module.toLowerCase();
	}
	return tsconfig as TSConfigEssential;
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

	constructor(root: string, key: string, templates: string[]) {
		const parts = key.split("*");
		this.prefix = parts[0];
		this.suffix = parts[1];
		this.templates = templates.map(p => join(root, p));
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

	static parse({ root }: any, paths: Record<string, string[]>) {
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
 */
export async function getAlias(id: string, parent?: string) {
	if (
		/^\.{0,2}\//.test(id) ||		  // Alias are only for bare specifier.
		!parent?.startsWith("file:") ||	  // tsconfig is only apply to local files.
		parent.includes("/node_modules/") // Library should not use alias.
	) {
		return;
	}
	const tsconfig = await getTSConfig(fileURLToPath(parent));
	if (!tsconfig) {
		return; // The package of `parent` does not have tsconfig.
	}
	const { alias, compilerOptions, root } = tsconfig;
	const match = alias?.find(item => item.test(id));
	if (match) {
		return match.getPaths(id);
	}
	return compilerOptions.baseUrl ? [join(root, id)] : undefined;
}
