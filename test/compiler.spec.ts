import { afterEach, beforeEach, describe, it, Mock, mock } from "node:test";
import assert from "assert";
import { compilers, detectTypeScriptCompiler } from "../src/compiler.ts";

describe("detectTypeScriptCompiler", () => {
	const mockCompiler = () => Promise.resolve(() => "");
	const backup = [...compilers];

	beforeEach(() => {
		compilers.forEach((_, i, s) => s[i] = mock.fn(mockCompiler));
	});

	afterEach(() => {
		delete process.env.TS_COMPILER;
		compilers.length = 0;
		compilers.push(...backup);
	});

	function assertCompilerImported(index: number) {
		for (let i = 0; i < compilers.length; i++) {
			const { length } = (compilers[i] as Mock<any>).mock.calls;
			assert.strictEqual(length, i === index ? 1 : 0);
		}
	}

	it("should fail when no compiler installed", async () => {
		compilers.length = 0;
		await assert.rejects(detectTypeScriptCompiler());
	});

	it("should detect compiler", async () => {
		delete process.env.TS_COMPILER;
		await detectTypeScriptCompiler();
		assertCompilerImported(0);
	});

	it("should specify compiler by TS_COMPILER", async () => {
		process.env.TS_COMPILER = "esbuild";
		await detectTypeScriptCompiler();
		assertCompilerImported(1);
	});

	it("should throw error for invalid value", () => {
		process.env.TS_COMPILER = "FOO_BAR";
		return assert.rejects(detectTypeScriptCompiler());
	});
});

for (const create of compilers) describe(create.name, async () => {
	const skipSucrase = { skip: create.name.startsWith("sucrase") };
	const compile = await create();

	await it("should generate JS & source map", async () => {
		const ts = "export default <string> a ?? b;";
		const js = await compile(ts, "module.ts", {
			target: "esnext",
			module: "esnext",
			inlineSourceMap: true,
		});

		assert.match(js, /export default +a \?\? b;/);
		assert.doesNotMatch(js, /Object\.defineProperty/);

		const b64 = js.slice(js.lastIndexOf(",") + 1);
		const sourceMap = JSON.parse(Buffer.from(b64, "base64").toString());
		assert.deepEqual(sourceMap.sources, ["module.ts"]);
		assert.strictEqual(sourceMap.sourcesContent, undefined);
	});

	await it("should accept legacy ES version", async () => {
		const ts = "export default <string> a ?? b;";
		const js = await compile(ts, "module.ts", {
			module: "es6",
			target: "es2015",
		});
		assert.doesNotMatch(js, /string/);
		assert.match(js, /export default /); // Downlevel is optional.
	});

	await it("should transform file to CJS", async () => {
		const ts = "export default <string> a ?? b;";
		const js = await compile(ts, "module.cts", {
			target: "esnext",
			module: "commonjs",
		});
		assert.doesNotMatch(js, /export default/);
	});

	await it("should support JSX", async () => {
		const ts = "<div>Hello World</div>";
		const js = await compile(ts, "test/jsx/module.tsx", {
			target: "esnext",
			module: "esnext",
			jsx: "react-jsx",
		});
		assert.strictEqual(js.includes(ts), false);
		assert.match(js, /} from "react\/jsx-runtime";/);
	});

	await it("should remove comments", skipSucrase, async () => {
		const ts = `\
			/* Block comment */
			// Line comment
			/** Document comment */
			export default () => {};
		`;
		const js = await compile(ts, "module.ts", {
			target: "esnext",
			module: "esnext",
			removeComments: true,
		});
		assert.doesNotMatch(js, /\/[*/][* ]/);
	});

	await it("should transform class fields", skipSucrase, async () => {
		const ts = `\
			class CleverBase {
				get p() {}
				set p(_) {}
			}
			class Simple extends CleverBase {
				p = "just a value";
			}
		`;
		const js = await compile(ts, "test/ignores/module.ts", {
			target: "es2017",
			module: "esnext",
			experimentalDecorators: true,
			useDefineForClassFields: true,
		});
		assert.match(js, /Object\.defineProperty/);
	});

	await it("should transform decorators", skipSucrase, async () => {
		const ts = `\
			function addFoo(clazz: any) {
				clazz.foo = 11;
			}
			@addFoo class TestClass {}
		`;
		const js = await compile(ts, "test/decorators/module.ts", {
			target: "esnext",
			module: "esnext",
			experimentalDecorators: true,
			emitDecoratorMetadata: true,
		});

		assert.strictEqual(eval(js).foo, 11);
	});
});
