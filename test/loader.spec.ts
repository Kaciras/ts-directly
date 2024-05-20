import { describe, it } from "node:test";
import assert from "assert";
import { argv0 } from "process";
import { exec } from "child_process";
import { promisify } from "util";
import { compilers, load } from "../src/loader.ts";

const execAsync = promisify(exec);
const node = JSON.stringify(argv0);

function runFixture(name: string) {
	return execAsync(`${node} --import ./lib/register.js test/fixtures/${name}`);
}

const entries = [
	"attribute.ts",
	"data-url.ts",
	"ts-file.ts",
	"ts-file.js",
	"ts-file.cjs",
	"ts-file.mjs",
];

for (const entry of entries) {
	it(`should load: ${entry}`, async () => {
		const { stdout } = await runFixture(entry);
		assert.strictEqual(stdout, "Hello World");
	});
}

it("should fail when no compiler installed", async () => {
	const compilersBackup = [...compilers];
	compilers.length = 0;
	try {
		const url = "file://script.ts";
		const p = load(url, {} as any, () => ({ source: "" } as any));
		await assert.rejects(p as Promise<any>);
	} finally {
		compilers.length = 0;
		compilers.push(...compilersBackup);
	}
});

for (const create of compilers) {
	describe(create.name, async () => {
		const compile = await create();

		await it("should generate JS & source map", async () => {
			const ts = "export default a ?? b as string";
			const js = await compile(ts, "script.ts", true);

			const b64 = js.slice(js.lastIndexOf(",") + 1);
			const sourceMap = JSON.parse(Buffer.from(b64, "base64").toString());
			assert.match(js, /export default a \?\? b;/);
			assert.deepEqual(sourceMap.sources, ["script.ts"]);
		});

		await it("should transform file to CJS", async () => {
			const ts = "export default a ?? b as string";
			const js = await compile(ts, "script.cts", false);

			assert.doesNotMatch(js, /export default/);
		});

		await it.only("should transform decorators", async () => {
			const ts = `\
				function addFoo(clazz: any) {
					clazz.foo = 11;
				}
				@addFoo class TestClass {}
			`;
			const js = await compile(ts, "test/decorators/script.ts", true);

			assert.strictEqual(eval(js).foo, 11);
		});
	});
}
