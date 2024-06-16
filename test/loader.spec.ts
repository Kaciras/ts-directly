import { it } from "node:test";
import assert from "assert";
import { argv0 } from "process";
import { exec } from "child_process";
import { promisify } from "util";

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

// Check if the issues is fixed.
it("currently cannot intercept require with non-exist file", () => {
	return assert.rejects(import("./fixtures/require-ne.ts"));
});
