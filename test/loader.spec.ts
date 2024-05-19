import { describe, it } from "node:test";
import assert from "assert";
import { argv0 } from "process";
import { exec } from "child_process";
import { promisify } from "util";
import { compilers, load } from "../src/loader.ts";

const execAsync = promisify(exec);

function runFixture(name: string) {
	return execAsync(`"${argv0}" --import ./lib/register.js test/fixtures/${name}`);
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

for (const create of compilers) {
	describe(create.name, async () => {
		const compile = await create();

		await it("should generate JS & source map", async () => {
			const sourceCode = "export default a ?? b as string";
			const js = await compile(sourceCode, "script.ts", true);

			const b64 = js.slice(js.lastIndexOf(",") + 1);
			const sourceMap = JSON.parse(Buffer.from(b64, "base64").toString());
			assert.match(js, /export default a \?\? b;/);
			assert.deepEqual(sourceMap.sources, ["script.ts"]);
		});

		await it("should transform file to CJS",async () => {
			const sourceCode = "export default a ?? b as string";
			const js = await compile(sourceCode, "script.cts", false);

			assert.doesNotMatch(js, /export default/);
		});

		await it("should transform decorators",async () => {
			const sourceCode = `\
				function addFoo(clazz: any) {
					clazz.foo = 11;
				}
				@addFoo class AClass {}
			`;
			const js = await compile(sourceCode, "test/decorators/script.ts", true);

			const AClass = eval(js);

			assert.strictEqual(AClass.foo, 11);
		});
	});
}
