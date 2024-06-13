import { after, beforeEach, describe, it, mock } from "node:test";
import assert from "assert";
import { argv0 } from "process";
import { exec } from "child_process";
import { promisify } from "util";
import { compile, compilers, getTSConfig, load } from "../src/loader.ts";

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

for (const entry of entries) {
	it(`should load: ${entry}`, async () => {
		const module = await import(entry);
		assert.strictEqual(module.default, "Hello World");
	});
}

it("currently cannot intercept require with non-exist file", () => {
	return assert.rejects(import("./fixtures/require-ne.ts"));
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

it("should fail when no compiler installed", async () => {
	const compilersBackup = [...compilers];
	compilers.length = 0;
	try {
		const url = "file://module.ts";
		const p = load(url, {} as any, () => ({ source: "" } as any));
		await assert.rejects(p as Promise<any>);
	} finally {
		compilers.length = 0;
		compilers.push(...compilersBackup);
	}
});

describe("config", () => {
	const mockCompiler = () => (() => "") as any;
	const backup = [...compilers];

	beforeEach(() => {
		compilers.forEach((_, i, s) => s[i] = mock.fn(mockCompiler));
	});

	after(() => {
		compilers.forEach((_, i, s) => s[i] = backup[i]);
	});

	it("should specify compiler", async () => {
		await compile("", "test/config/set/module.ts", true);

		assert.strictEqual(compilers[0].mock.calls.length, 0);
		assert.strictEqual(compilers[1].mock.calls.length, 1);
		assert.strictEqual(compilers[2].mock.calls.length, 0);
	});

	it("should detect compiler if ts-directly is empty", async () => {
		await compile("", "test/config/set/reset/module.ts", true);

		assert.strictEqual(compilers[0].mock.calls.length, 1);
		assert.strictEqual(compilers[1].mock.calls.length, 0);
		assert.strictEqual(compilers[2].mock.calls.length, 0);
	});

	it("should throw error for invalid value", () => {
		return assert.rejects(compile("", "test/config/invalid/module.ts", true));
	});
});


for (const create of compilers) {
	describe(create.name, async () => {

		async function testCompile(code: string, filename: string, isESM: boolean) {
			const x = await getTSConfig(filename);
			const transform = await create();
			return transform(code, filename, isESM, x.tsconfig);
		}

		await it("should generate JS & source map", async () => {
			const ts = "export default <string> a ?? b;";
			const js = await testCompile(ts, "module.ts", true);

			assert.match(js, /export default a \?\? b;/);
			assert.doesNotMatch(js, /Object\.defineProperty/);

			const b64 = js.slice(js.lastIndexOf(",") + 1);
			const sourceMap = JSON.parse(Buffer.from(b64, "base64").toString());
			assert.deepEqual(sourceMap.sources, ["module.ts"]);
			assert.strictEqual(sourceMap.sourcesContent, undefined);
		});

		await it("should remove comments", async () => {
			const ts = `\
				/* Block comment */
				// Line comment
				/** Document comment */
				export default () => {};
			`;
			const js = await testCompile(ts, "module.ts", true);
			assert.doesNotMatch(js, /\/[*/][* ]/);
		});

		await it("should transform file to CJS", async () => {
			const ts = "export default <string> a ?? b;";
			const js = await testCompile(ts, "module.cts", false);

			assert.doesNotMatch(js, /export default/);
		});

		await it("should transform class fields", async () => {
			const ts = `\
				class CleverBase {
					get p() {}
					set p(_) {}
				}
				class Simple extends CleverBase {
					p = "just a value";
				}
			`;
			const js = await testCompile(ts, "test/ignores/module.ts", true);
			assert.match(js, /Object\.defineProperty/);
		});

		await it("should transform decorators", async () => {
			const ts = `\
				function addFoo(clazz: any) {
					clazz.foo = 11;
				}
				@addFoo class TestClass {}
			`;
			const js = await testCompile(ts, "test/decorators/module.ts", true);

			assert.strictEqual(eval(js).foo, 11);
		});

		await it("should support JSX", async () => {
			const ts = "<div>Hello World</div>";
			const js = await testCompile(ts, "test/jsx/module.tsx", true);
			assert.strictEqual(js.includes(ts), false);
			assert.match(js, /} from "react\/jsx-runtime";/);
		});
	});
}
