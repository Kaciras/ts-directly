import { LoadHook, ResolveHook } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join, sep } from "path";
import { readFileSync } from "fs";
import { CompileFn, detectTypeScriptCompiler } from "./compiler.js";
import { getAlias, getTSConfig } from "./tsconfig.js";

type ScriptType = "commonjs" | "module";

export const typeCache = new Map<string, ScriptType>();

// eslint-disable-next-line no-sequences
const addToCache = (k: string, v: ScriptType) => (typeCache.set(k, v), v);

const node_modules = sep + "node_modules";

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
		return addToCache(dir, JSON.parse(json).type ?? "commonjs");
	} catch (e) {
		if (e.code !== "ENOENT") throw e;
	}

	if (!dir || dir.endsWith(node_modules)) {
		return addToCache(dir, "commonjs");
	} else {
		return addToCache(dir, getPackageType(dir));
	}
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

let importedCompileFn: CompileFn;

/**
 * Transform the module from TypeScript to JavaScript using a supported compiler,
 * the compiler options is read from closest tsconfig.json.
 *
 * @param code TypeScript code to compile.
 * @param filename The filename must have a valid JS or TS extension.
 * @param format Specify the output format, if omitted it will be determined automatically.
 * @return JS source and format, and additional properties to satisfy `load` hooks.
 */
export async function transform(code: string, filename: string, format?: ScriptType) {
	importedCompileFn ??= await detectTypeScriptCompiler();

	const tsconfig = await getTSConfig(filename);
	if (!tsconfig) {
		throw new Error(`Cannot find tsconfig.json for ${filename}`);
	}
	const compilerOptions = { ...tsconfig.compilerOptions };

	// Resolve `compilerOptions.module` and `format`.
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

// TODO: Cannot intercept require() with non-exists files.
//  https://github.com/nodejs/node/issues/53198
export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
	const paths = await getAlias(specifier, context.parentURL);
	for (const path of paths) {
		if (path.endsWith(".d.ts")) {
			continue; // Alias can be a declaration file.
		}
		const url = pathToFileURL(path).href;
		try {
			return await doResolve(url, context, nextResolve);
		} catch (e) {
			if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
		}
	}
	return doResolve(specifier, context, nextResolve);
};

function throwIfModuleIsFound(e: any, specifier: string) {
	if (e.code !== "ERR_MODULE_NOT_FOUND") {
		throw e;
	}
	e.specifier ??= specifier;
	if (e.specifier !== specifier) throw e;
}

/**
 * Try to find the JS file, if it doesn't exist, then look for the corresponding TS source.
 *
 * When both `.ts` and `.js` files exist for a name, it's safe to assume that the JS file
 * is compiled from the TS file, so we choose the JS file to avoid transformation.
 *
 * The specifier of `require` with directory and file without extension is already resolved by Node.
 */
const doResolve: ResolveHook = async (specifier, context, nextResolve) => {
	try {
		return await nextResolve(specifier, context);
	} catch (e) {
		throwIfModuleIsFound(e, specifier);

		// Two regexps is faster than one, see benchmark/url-matching.ts
		const isFile = /^(?:file:|\.{0,2}\/)/i.test(specifier);
		if (!isFile || !/\.[cm]?jsx?$/i.test(specifier)) {
			throw e;
		}
		// Replace "j" with "t" in extension and resolve again.
		const tsSource = specifier.at(-1) !== "x"
			? specifier.slice(0, -2) + "ts"
			: specifier.slice(0, -3) + "tsx";

		try {
			return await nextResolve(tsSource, context);
		} catch (e) {
			throwIfModuleIsFound(e, specifier);
		}
		throw e;
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
