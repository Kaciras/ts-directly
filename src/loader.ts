import { LoadHook, ResolveHook } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join, resolve as resolvePath, sep } from "path";
import { readFileSync } from "fs";
import { parse, TSConfckCache } from "tsconfck";
import { CompileFn, detectTypeScriptCompiler } from "./compiler.js";

type ScriptType = "commonjs" | "module";

export const tsconfigCache = new TSConfckCache<any>();
export const typeCache = new Map<string, ScriptType>();

const node_modules = sep + "node_modules";

/**
 * Parse the closest tsconfig.json, and normalize some compiler options.
 *
 * @param file path to a tsconfig.json or a source file or directory (absolute or relative to cwd)
 * @see https://github.com/dominikg/tsconfck
 */
async function getTSConfig(file: string) {
	const { tsconfig, tsconfigFile } = await parse(file, {
		cache: tsconfigCache,
	});
	if (tsconfig) {
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
		return tsconfig;
	}
	throw new Error(`Cannot find tsconfig.json for ${file}`);
}

class PathAlias {

	readonly templates: string[];
	readonly prefix: string;
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

function cacheAndReturn(dir: string, type: ScriptType) {
	typeCache.set(dir, type);
	return type;
}

/**
 * Detect module type (module or commonjs) by extension and package.json
 *
 * @param filename File path of the module, must have JS or TS extension.
 * @see https://github.com/nodejs/node/blob/5a19a9bd2616280d4a1a71da653cdf5f1ab57fde/lib/internal/modules/esm/get_format.js#L92
 */
function detectModuleType(filename: string) {
	const i = filename.lastIndexOf(".") + 1;
	if (i === 0) {
		throw new Error(`${filename} is not a module`);
	}
	switch (filename.charCodeAt(i)) {
		case 99: /* c */
			return "commonjs";
		case 109: /* m */
			return "module";
		default: /* t */
			return getPackageType(filename);
	}
}

/**
 * Find nearest package.json and detect the file is ESM or CJS.
 *
 * typescript has `getImpliedNodeFormatForFile`, but we do not require user install it.
 * Node also has such a function, but does not export it.
 *
 * https://nodejs.org/docs/latest/api/packages.html#type
 */
function getPackageType(filename: string): ScriptType {
	const dir = dirname(filename);

	const cached = typeCache.get(dir);
	if (cached) {
		return cached;
	}
	try {
		const json = readFileSync(join(dir, "package.json"), "utf8");
		return cacheAndReturn(dir, JSON.parse(json).type ?? "commonjs");
	} catch (e) {
		if (e.code !== "ENOENT") throw e;
	}

	if (!dir || dir.endsWith(node_modules)) {
		return cacheAndReturn(dir, "commonjs");
	} else {
		return cacheAndReturn(dir, getPackageType(dir));
	}
}

let importedCompileFn: CompileFn;

/**
 * Transform the module from TypeScript to JavaScript using a supported compiler,
 * the compiler options is read from closest tsconfig.json.
 *
 * @param code TypeScript code to compile.
 * @param filename The filename must have a valid JS or TS extension.
 * @param format Specify the output format, if omitted it is determined automatically.
 * @return JS source and format, and additional properties to satisfy `load` hooks.
 */
export async function transform(code: string, filename: string, format?: ScriptType) {
	importedCompileFn ??= await detectTypeScriptCompiler();

	const tsconfig = await getTSConfig(filename);
	const compilerOptions = { ...tsconfig.compilerOptions };

	if (format === "module") {
		const { module = "" } = compilerOptions;
		if (!module.startsWith("es")) {
			compilerOptions.module = "esnext";
		}
	} else if (format === "commonjs") {
		compilerOptions.module = "commonjs";
	} else {
		format = detectModuleType(filename);
	}

	/*
	 * "Node16" & "NodeNext" do not work with transpileModule().
	 * https://github.com/microsoft/TypeScript/issues/53022
	 */
	switch (compilerOptions.module) {
		case "node16":
		case "nodenext":
			compilerOptions.module = format === "module" ? "esnext" : "commonjs";
	}

	return {
		shortCircuit: true,
		format,
		source: await importedCompileFn(code, filename, compilerOptions),
	};
}

async function getAlias(id: string, parent?: string) {
	if (/^\.{0,2}\//.test(id)) {
		return; // Alias are only work for bare specifier.
	}
	if (!parent) {
		parent = "module.ts";
	} else {
		if (parent.includes("/node_modules/")) {
			return;
		}
		if (!parent.startsWith("file:")) {
			return;
		}
		parent = fileURLToPath(parent);
	}
	const tsconfig = await getTSConfig(parent);
	const alias = tsconfig.alias as PathAlias[];
	const match = alias?.find(item => item.test(id));
	if (match) {
		return match.getPaths(id);
	}
	const { baseUrl } = tsconfig.compilerOptions ?? {};
	return baseUrl ? [resolvePath(baseUrl, id)] : undefined;
}

/**
 * For a JS file, if it doesn't exist, then look for the corresponding TS source.
 *
 * When both `.ts` and `.js` files exist for a name, it's safe to assume
 * that the `.js` is compiled from the `.ts`.
 *
 * TODO: Cannot intercept require() with non-exists files.
 */
export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
	const resolvedPaths = await getAlias(specifier, context.parentURL);
	if (resolvedPaths) {
		for (const newPath of resolvedPaths) {
			const url = pathToFileURL(newPath).toString();
			try {
				return await doResolve(url, context, nextResolve);
			} catch (e) {
				if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
			}
		}
	}
	return doResolve(specifier, context, nextResolve);
};

export const doResolve: ResolveHook = async (specifier, context, nextResolve) => {
	try {
		return await nextResolve(specifier, context);
	} catch (e) {
		// Two regexps is faster than one, see benchmark/url-matching.ts
		const isFile = /^(?:file:|\.{0,2}\/)/i.test(specifier);
		const isJSFile = isFile && /\.[cm]?jsx?$/i.test(specifier);

		if (!isJSFile || e.code !== "ERR_MODULE_NOT_FOUND") {
			throw e;
		}
		// Replace "j" with "t" in extension and resolve again.
		if (specifier.at(-1) !== "x") {
			return nextResolve(specifier.slice(0, -2) + "ts", context);
		} else {
			return nextResolve(specifier.slice(0, -3) + "tsx", context);
		}
	}
};

export const load: LoadHook = async (url, context, nextLoad) => {
	// Lost import attributes when importing json.
	if (context.format === "json") {
		context.importAttributes.type = "json";
		return nextLoad(url, context);
	}

	const match = /\.[cm]?tsx?$/i.test(url);
	if (!match || !url.startsWith("file:")) {
		return nextLoad(url, context);
	}

	context.format = "ts" as any;
	const loaded = await nextLoad(url, context);

	return transform(loaded.source!.toString(), fileURLToPath(url));
};
