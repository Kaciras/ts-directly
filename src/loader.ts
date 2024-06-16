import type { Options as SwcOptions } from "@swc/core";
import type { TransformOptions } from "esbuild";
import type { Transform as SucraseTransform } from "sucrase";
import { LoadHook, ResolveHook } from "module";
import { fileURLToPath } from "url";
import { dirname, join, sep } from "path";
import { readFileSync } from "fs";
import { parse, TSConfckCache } from "tsconfck";

/**
 * Compile the code from TypeScript to JavaScript.
 *
 * @param code TypeScript code to compile.
 * @param filename The filename associated with the code currently being compiled
 * @param options The `compilerOptions` property of `tsconfig.json`
 */
export type CompileFn = (code: string, filename: string, options: any) => Promise<string> | string;

export const tsconfigCache = new TSConfckCache<any>();

/**
 * Parse the closest tsconfig.json, and normalize some compiler options:
 * - Lowercase `module` & `target`.
 * - Set `removeComments` & `inlineSourceMap` to true.
 * - Remove property `outDir`.
 *
 * @param file path to a tsconfig.json or a source file or directory (absolute or relative to cwd)
 * @see https://github.com/dominikg/tsconfck
 */
async function getTSConfig(file: string) {
	const { tsconfig } = await parse(file, { cache: tsconfigCache });
	if (tsconfig) {
		const options = tsconfig.compilerOptions ??= {};
		options.inlineSourceMap = true;
		options.removeComments = true;

		// Avoid modify source path in the source map.
		delete options.outDir;

		options.target &&= options.target.toLowerCase();
		options.module &&= options.module.toLowerCase();
		return tsconfig;
	}
	throw new Error(`Cannot find tsconfig.json for ${file}`);
}

async function sucraseCompiler(): Promise<CompileFn> {
	const { transform } = await import("sucrase");

	return (input, filePath, opts) => {
		const transforms: SucraseTransform[] = ["typescript"];

		if (filePath.endsWith("x")) {
			transforms.push("jsx");
		}
		if (opts.module === "commonjs") {
			transforms.push("imports");
		}

		const { code, sourceMap } = transform(input, {
			filePath,
			transforms,
			keepUnusedImports: opts.verbatimModuleSyntax,
			sourceMapOptions: { compiledFilename: filePath },
			preserveDynamicImport: true,
			disableESTransforms: true,
			injectCreateRequireForImportRequire: true,
			enableLegacyTypeScriptModuleInterop: !opts.esModuleInterop,

			jsxRuntime: opts.jsx?.startsWith("react-") ? "automatic" : "classic",
			production: opts.jsx !== "react-jsxdev",
			jsxImportSource: opts.jsxImportSource,
			jsxPragma: opts.jsxFactory,
			jsxFragmentPragma: opts.jsxFragmentFactory,
		});

		const base64 = Buffer.from(JSON.stringify(sourceMap)).toString("base64");
		return `${code}\n//# sourceMappingURL=data:application/json;base64,${base64}`;
	};
}

async function swcCompiler(): Promise<CompileFn> {
	const swc = await import("@swc/core");

	return async (code, filename, opts) => {
		const {
			target = "es2022", module = "esnext",
			experimentalDecorators, useDefineForClassFields,
		} = opts;

		const options: SwcOptions = {
			filename,
			module: {
				importInterop: opts.esModuleInterop ? "swc" : "none",
				type: "es6",
			},
			sourceMaps: "inline",
			inlineSourcesContent: false,
			swcrc: false,
			jsc: {
				target: target === "esnext" ? "es2022" : target,
				externalHelpers: opts.importHelpers,
				minify: {
					compress: false,
					mangle: false,
				},
				parser: {
					decorators: experimentalDecorators,
					syntax: "typescript",
					tsx: filename.endsWith("x"),
				},
				transform: {
					useDefineForClassFields,
					legacyDecorator: experimentalDecorators,
					decoratorMetadata: opts.emitDecoratorMetadata,
				},
			},
		};

		options.jsc!.transform!.react = {
			runtime: opts.jsx?.startsWith("react-") ? "automatic" : "classic",
			pragma: opts.jsxFactory,
			pragmaFrag: opts.jsxFragmentFactory,
			importSource: opts.jsxImportSource ?? "react",
		};

		if (module === "commonjs") {
			options.module!.type = "commonjs";
		}

		return (await swc.transform(code, options)).code;
	};
}

async function esbuildCompiler(): Promise<CompileFn> {
	const esbuild = await import("esbuild");

	return async (code, sourcefile, compilerOptions) => {
		const { target, module } = compilerOptions;

		const options: TransformOptions = {
			sourcefile,
			tsconfigRaw: { compilerOptions },
			target,
			loader: sourcefile.endsWith("x") ? "tsx" : "ts",
			sourcemap: "inline",
			sourcesContent: false,
		};

		if (module === "commonjs") {
			options.format = "cjs";
		}

		return (await esbuild.transform(code, options)).code;
	};
}

async function tscCompiler(): Promise<CompileFn> {
	const { default: ts } = await import("typescript");

	return (code, fileName, compilerOptions) => {
		const opts = { fileName, compilerOptions };
		return ts.transpileModule(code, opts).outputText;
	};
}

// Fast compiler first, benchmarks are in benchmark/loader.ts
export const compilers = [swcCompiler, esbuildCompiler, sucraseCompiler, tscCompiler];
const compilerNames = ["swc", "esbuild", "sucrase", "tsc"];

/**
 * Import a supported TypeScript compiler,
 * or throw an exception if none of them are installed.
 */
export async function detectTypeScriptCompiler() {
	const name = process.env.TS_COMPILER;
	if (name) {
		const i = compilerNames.indexOf(name);
		return compilers[i]();
	}
	for (const create of compilers) {
		try {
			return await create();
		} catch (e) {
			if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
		}
	}
	throw new Error("No TypeScript compiler found");
}

type ScriptType = "commonjs" | "module";

// make `load` 15.47% faster
export const typeCache = new Map<string, ScriptType>();

const node_modules = sep + "node_modules";

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

/**
 * For a JS file, if it doesn't exist, then look for the corresponding TS source.
 *
 * When both `.ts` and `.js` files exist for a name, it's safe to assume
 * that the `.js` is compiled from the `.ts`.
 *
 * TODO: Cannot intercept require() with non-exists files.
 */
export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
	try {
		return await nextResolve(specifier, context);
	} catch (e) {
		// Two regexps is faster than one, see benchmark/url-matching.ts
		const isFile = /^(?:file:|\.{1,2}\/)/i.test(specifier);
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
	const ts = await nextLoad(url, context);

	return transform(ts.source!.toString(), fileURLToPath(url));
};
