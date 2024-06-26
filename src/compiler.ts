import type { Options as SwcOptions } from "@swc/core";
import type { TransformOptions } from "esbuild";
import type { Transform as SucraseTransform } from "sucrase";

/**
 * Compile the code from TypeScript to JavaScript. The options is normalized:
 * - Lowercase `module` & `target`.
 * - If `module` is "node16" or "nodenext", it resolved to "commonjs" or "esnext".
 *
 * @param code TypeScript code to compile.
 * @param filename The filename associated with the code currently being compiled
 * @param options The `compilerOptions` property of `tsconfig.json`
 */
export type CompileFn = (code: string, filename: string, options: any) => Promise<string> | string;

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
	// TODO: TS 5.5 has fixed the ugly import.
	const { default: ts } = await import("typescript");

	return (code, fileName, compilerOptions) => {
		const opts = { fileName, compilerOptions };
		return ts.transpileModule(code, opts).outputText;
	};
}

// Fast compiler first, benchmarks are in benchmark/loader.ts
export const compilers = [swcCompiler, esbuildCompiler, sucraseCompiler, tscCompiler];

export const names = ["swc", "esbuild", "sucrase", "tsc"];

/**
 * Import a supported TypeScript compiler,
 * or throw an exception if none of them are installed.
 */
export async function detectTypeScriptCompiler() {
	const name = process.env.TS_COMPILER;
	if (name) {
		return compilers[names.indexOf(name)]();
	}
	for (const create of compilers) {
		try {
			return await create();
		} catch (e) {
			if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
		}
	}
	throw new Error("No supported TypeScript compiler found");
}
