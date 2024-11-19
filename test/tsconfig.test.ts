import { it } from "node:test";
import assert from "assert";
import { getTSConfig } from "../src/tsconfig.ts";

it("should parse alias", async () => {
	const result = await getTSConfig("test/alias/dummy.ts");

	const [mapper0]= result!.maps!;
	assert(typeof mapper0.getPaths === "function");
	assert.strictEqual(result!.maps?.length, 6);
});

it("should cache parsed alias", async () => {
	const got0 = await getTSConfig("test/alias/dummy.ts");
	const maps0 = got0!.maps;
	const got1 = await getTSConfig("test/alias/src/file.js");
	const maps1 = got1!.maps;

	assert.strictEqual(maps0, maps1);
});
