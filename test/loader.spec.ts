import { afterEach, describe, it, mock } from "node:test";
import assert from "assert";
import { tmpdir } from "os";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import { argv0, platform } from "process";
import { exec } from "child_process";
import { promisify } from "util";
import { pathToFileURL } from "url";
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

// Absolute path, only test on Unix as Windows volume separator is illegal for import.
if (platform !== "win32") {
	entries.push(resolve("test/fixtures/module.js"));
}

for (const entry of entries) it(`should load: ${entry}`, async () => {
	const module = await import(entry);
	assert.strictEqual(module.default, "Hello World");
});

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

// Check if https://github.com/nodejs/node/issues/53198 is fixed.
it("currently cannot intercept require with non-exist file", () => {
	return assert.rejects(import("./fixtures/require-ne.ts"));
});

it("should support require directory and omit extension", async () => {
	const module = await import("./directory/main.ts");
	assert.strictEqual(module.default, "Hello World");
});

it("should support resolve file without tsconfig.json", () => {
	const root = mkdtempSync(tmpdir() + "/test-");
	const pkg = root + "/node_modules/pkg";
	const parent = pathToFileURL(root + "/main.js").href;
	try {
		mkdirSync(pkg, { recursive: true });
		writeFileSync(pkg + "/index.js", "");

		const url = import.meta.resolve("pkg/index.js", parent);
		assert(url.endsWith("/node_modules/pkg/index.js"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("should fallback to original if file does not exists", () => {
	assert.match(import.meta.resolve("./NON_EXISTS.js"), /NON_EXISTS\.js$/);
});

describe("Path Alias", () => {
	const moduleTs = pathToFileURL("test/fixtures/module.ts").href;
	const pkgEntry = pathToFileURL("test/node_modules/_pkg/foo.ts").href;
	const top = pathToFileURL("test/alias/main.js").href;
	const nested = pathToFileURL("test/alias/nested/main.js").href;

	const aliasImports = [
		"prefix/module.ts",
		"module.ts/suffix",
		"exact-match",
		"@app/module/index.ts",
	];

	for (const i of aliasImports) it(`should resolve: ${i}`, async () => {
		assert.strictEqual(import.meta.resolve(i, top), moduleTs);
	});

	it("should look at baseUrl", () => {
		assert.strictEqual(import.meta.resolve("module.js", nested), moduleTs);
	});

	it("should fallback to the original", () => {
		assert.strictEqual(import.meta.resolve("_pkg", nested), pkgEntry);
	});

	it("should skip declaration files", () => {
		assert.strictEqual(import.meta.resolve("_pkg", top), pkgEntry);
		assert.strictEqual(import.meta.resolve("prefix/module.ts", top), moduleTs);
	});

	it("should not inherit alias options", () => {
		assert.throws(() => import.meta.resolve("exact-match", nested));
	});

	it("should correct cache the alias mapper", () => {
		const importer = import.meta.resolve("./src/file.js", top);
		assert.strictEqual(import.meta.resolve("node:fs", importer), "node:fs");
	});
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

		const [, , options] = mockCompile.mock.calls[0].arguments;
		assert.strictEqual(output.format, "commonjs");
		assert.strictEqual(options.module, "commonjs");
	});

	it("should enforce module type to ESM", async () => {
		const output = await transform("", "test/commonjs/module.ts", "module");

		const [, , options] = mockCompile.mock.calls[0].arguments;
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

		const [, , options] = mockCompile.mock.calls[0].arguments;
		assert.strictEqual(options.module, "es6");
		assert.strictEqual(output.format, "module");
	});
});
