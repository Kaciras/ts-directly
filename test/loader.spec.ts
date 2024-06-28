import { afterEach, describe, it, mock } from "node:test";
import assert from "assert";
import { resolve } from "path";
import { argv0, platform } from "process";
import { exec } from "child_process";
import { promisify } from "util";
import { CompileFn, compilers } from "../src/compiler.ts";
import { transform } from "../src/loader.ts";

// Top-Level test cases are use the loader registered in CLI, assume the compiler is working properly.

const execAsync = promisify(exec);
const node = JSON.stringify(argv0);

function runFixture(name: string, options = "") {
	return execAsync(`${node} ${options} --import ./lib/register.js ${name}`);
}

const entries = [
	"./fixtures/attribute.ts",
	"data:text/javascript,const o = { ts: 'Hello World' }; export default o.ts",
	"./fixtures/module.ts",
	"./fixtures/module.js",
	"./fixtures/module.cjs",
	"./fixtures/module.mjs",
];

if (platform !== "win32") {
	entries.push(resolve("./fixtures/module.ts"));
}

for (const entry of entries) {
	it(`should load: ${entry}`, async () => {
		const module = await import(entry);
		assert.strictEqual(module.default, "Hello World");
	});
}

it("should be able to import node module", async () => {
	const { stdout } = await runFixture("./test/fixtures/import_pkg.ts");
	assert.strictEqual(stdout, "Hello World");
});

it("should support custom conditions", async () => {
	const { stdout } = await runFixture(
		"./test/fixtures/import_pkg.ts",
		"--conditions bar",
	);
	assert.strictEqual(stdout, "This is bar");
});

it("should skip JS files", () => {
	return assert.rejects(import("./fixtures/invalid.js"), SyntaxError);
});

// Check if the issues is fixed.
it("currently cannot intercept require with non-exist file", () => {
	return assert.rejects(import("./fixtures/require-ne.ts"));
});

describe("transform", () => {
	const mockCompile = mock.fn<CompileFn>(() => "baz");
	compilers[0] = () => Promise.resolve(mockCompile);

	delete process.env.TS_COMPILER;

	afterEach(() => mockCompile.mock.resetCalls());

	it("should return value satisfies LoadFnOutput", async () => {
		const output = await transform("foo.bar", "test/config/module.ts");
		assert.strictEqual(output.source, "baz");
		assert.strictEqual(output.format, "module");
		assert.strictEqual(output.shortCircuit, true);
	});

	it("should call compiler", async () => {
		await transform("foo.bar", "test/config/module.ts");

		const [code, filename, options] = mockCompile.mock.calls[0].arguments;
		assert.deepEqual(options, {
			target: "esnext",
			module: "esnext",
			moduleResolution: "NodeNext",
			skipLibCheck: true,
			declaration: true,
			removeComments: true,
			inlineSourceMap: true,
		});
		assert.strictEqual(code, "foo.bar");
		assert.strictEqual(filename, "test/config/module.ts");
	});

	it("should enforce module type to CJS", async () => {
		const output = await transform("", "module.ts", "commonjs");

		const [,, options] = mockCompile.mock.calls[0].arguments;
		assert.strictEqual(output.format, "commonjs");
		assert.strictEqual(options.module, "commonjs");
	});

	it("should enforce module type to ESM", async () => {
		const output = await transform("", "test/commonjs/module.ts", "module");

		const [,, options] = mockCompile.mock.calls[0].arguments;
		assert.deepEqual(options, {
			target: "esnext",
			module: "esnext",
			moduleResolution: "NodeNext",
			skipLibCheck: true,
			declaration: true,
			removeComments: true,
			inlineSourceMap: true,
		});
		assert.strictEqual(output.format, "module");
	});

	it("should allow legacy ES version for module format", async () => {
		const output = await transform("", "test/es6/module.ts", "module");

		const [,, options] = mockCompile.mock.calls[0].arguments;
		assert.strictEqual(options.module, "es6");
		assert.strictEqual(output.format, "module");
	});
});
