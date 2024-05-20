import type { TransformOptions } from "esbuild";
import { LoadHook, ModuleFormat, ResolveHook } from "module";
import { fileURLToPath } from "url";
import { dirname, join, sep } from "path";
import { readFileSync } from "fs";
import { parse, TSConfckCache } from "tsconfck";

/**
 * Compile the module from TypeScript to JavaScript.
 *
 * @param code TypeScript code to compile.
 * @param filename The filename associated with the code currently being compiled
 * @param isESM true if the file is ESM, false if is CJS.
 */
export type CompileFn = (code: string, filename: string, isESM: boolean) => Promise<string>;

const configCache = new TSConfckCache<any>();

async function getTSConfig(file: string) {
	const { tsconfig } = await parse(file, { cache: configCache });
	if (tsconfig) {
		const options = tsconfig.compilerOptions ??= {};
		options.target &&= options.target.toLowerCase();
		options.module &&= options.module.toLowerCase();
		return tsconfig;
	}
	throw new Error(`Cannot find tsconfig.json for ${file}`);
}

async function swcCompiler(): Promise<CompileFn> {
	const swc = await import("@swc/core");

	return async (code, filename, isESM) => {
		const { compilerOptions } = await getTSConfig(filename);
		const {
			target = "es2022", module = "esnext",
			experimentalDecorators, emitDecoratorMetadata,
		} = compilerOptions;

		const options: any = {
			filename,
			module: {
				noInterop: !compilerOptions.esModuleInterop,
				type: "es6",
			},
			swcrc: false,
			sourceMaps: "inline",
			jsc: {
				target,
				parser: {
					decorators: experimentalDecorators,
					syntax: "typescript",
					tsx: filename.endsWith("x"),
				},
				transform: {
					legacyDecorator: experimentalDecorators,
					decoratorMetadata: emitDecoratorMetadata,
				},
			},
		};

		options.jsc.transform.react = {
			runtime: compilerOptions.jsx?.startsWith("react-") ? "automatic" : "classic",
			useBuiltins: true,
			pragma: compilerOptions.jsxFactory,
			pragmaFrag: compilerOptions.jsxFragmentFactory,
			importSource: compilerOptions.jsxImportSource ?? "react",
		};

		switch (options.jsc.target) {
			case "esnext":
			case "latest":
				options.jsc.target = "es2022";
		}

		switch (module) {
			case "nodenext":
			case "node16":
				options.module.type = isESM ? "es6" : "commonjs";
				break;
			case "commonjs":
				options.module.type = "commonjs";
		}

		return (await swc.transform(code, options)).code;
	};
}

async function esbuildCompiler(): Promise<CompileFn> {
	const esbuild = await import("esbuild");

	return async (code, sourcefile, isESM) => {
		const tsconfigRaw = await getTSConfig(sourcefile);

		const options: TransformOptions = {
			sourcefile,
			tsconfigRaw,
			loader: sourcefile.endsWith("x") ? "tsx" : "ts",
			sourcemap: "inline",
		};

		switch (tsconfigRaw.compilerOptions.module) {
			case "commonjs":
				options.format = "cjs";
				break;
			case "nodenext":
			case "node16":
				isESM || (options.format = "cjs");
		}

		return (await esbuild.transform(code, options)).code;
	};
}

async function tsCompiler(): Promise<CompileFn> {
	const { default: ts } = await import("typescript");

	return async (code, fileName, isESM) => {
		let { compilerOptions } = await getTSConfig(fileName);
		compilerOptions = { ...compilerOptions };
		compilerOptions.sourceMap = true;
		compilerOptions.inlineSourceMap = true;

		// Avoid modify source path in the source map.
		delete compilerOptions.outDir;

		/*
		 * "Node16" & "NodeNext" do not work with transpileModule().
		 * https://github.com/microsoft/TypeScript/issues/53022
		 */
		switch (compilerOptions.module) {
			case "node16":
			case "nodenext":
				compilerOptions.module = isESM ? "ESNext" : "CommonJS";
		}

		return ts.transpileModule(code, { fileName, compilerOptions }).outputText;
	};
}

export const compilers = [swcCompiler, esbuildCompiler, tsCompiler];

let compile: CompileFn;

async function detectTypeScriptCompiler() {
	for (const create of compilers) {
		try {
			return await create();
		} catch (e) {
			if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
		}
	}
	throw new Error("No TypeScript transformer found");
}

const node_modules = sep + "node_modules";

// make `load` 15.47% faster
export const typeCache = new Map<string, ModuleFormat>();

function cacheAndReturn(dir: string, type: ModuleFormat) {
	typeCache.set(dir, type);
	return type;
}

/**
 * Find nearest package.json and detect the file is ESM or CJS.
 *
 * typescript has `getImpliedNodeFormatForFile`, but we do not require user install it.
 * Node also has such a function, but does not export it.
 *
 * https://nodejs.org/docs/latest/api/packages.html#type
 */
function getPackageType(filename: string): ModuleFormat {
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

/**
 * For a JS file, if it doesn't exist, then look for the corresponding TS source.
 *
 * When both `.ts` and `.js` files exist for a name, it's safe to assume
 * that the `.js` is compiled from the `.ts`.
 */
export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
	try {
		return await nextResolve(specifier, context);
	} catch (e) {
		const isFile = /^(?:file:|\.{1,2}\/)/i.test(specifier);
		const isJSFile = isFile && /\.[cm]?jsx?$/i.test(specifier);

		if (!isJSFile || e.code !== "ERR_MODULE_NOT_FOUND") {
			throw e;
		}
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

	const match = /\.[cm]?tsx?$/i.exec(url);
	if (!match || !url.startsWith("file:")) {
		return nextLoad(url, context);
	}

	context.format = "ts" as any;
	const ts = await nextLoad(url, context);
	const code = ts.source!.toString();
	const filename = fileURLToPath(url);

	let format: ModuleFormat;
	switch (match[0].charCodeAt(1)) {
		case 99: /* c */
			format = "commonjs";
			break;
		case 109: /* m */
			format = "module";
			break;
		default: /* t */
			format = getPackageType(filename);
	}

	if (!compile) {
		compile = await detectTypeScriptCompiler();
	}
	const source = await compile(code, filename, format === "module");

	return { source, format, shortCircuit: true };
};
