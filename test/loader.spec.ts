import { describe, it } from "node:test";
import assert from "assert";
import { argv0 } from "process";
import { exec } from "child_process";
import { promisify } from "util";
import { compilers } from "../src/loader.js";

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
	describe(create.name, () => {
		it("should compile TS", async () => {
			const sourceCode = "export default a ?? b as string";

			const compile = await create();
			const js = await compile(sourceCode, "script.ts", true);

			const b64 = js.slice(js.lastIndexOf(",") + 1);
			const sourceMap = JSON.parse(Buffer.from(b64, "base64").toString());
			assert.match(js, /export default a \?\? b;/);
			assert.deepEqual(sourceMap.sources, ["script.ts"]);
		});

		it("should transform file to CJS",async () => {
			const sourceCode = "export default a ?? b as string";
			const compile = await create();

			const js = await compile(sourceCode, "script.cts", false);
			assert.doesNotMatch(js, /export default/);
		});
	});
}
