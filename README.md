# TS Directly

[![NPM Version](https://img.shields.io/npm/v/ts-directly?style=flat-square)](https://www.npmjs.com/package/ts-directly)
![Node Current](https://img.shields.io/node/v/ts-directly?style=flat-square)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/Kaciras/ts-directly/test.yml?style=flat-square)](https://github.com/Kaciras/ts-directly/actions/workflows/test.yml)

Let Node run TS files or add to your library to give it the ability to execute TypeScript.

* Tiny: [4 KB](https://pkg-size.dev/ts-directly) + 1 dependency (9 KB) minified.
* Automatic detects installed compilers, support [SWC](https://swc.rs), [esbuild](https://esbuild.github.io), [sucrase](https://github.com/alangpierce/sucrase) and [tsc](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#a-simple-transform-function).
* Transform files based on `tsconfig.json`.
* Support `.cts` and `.mts` files, as well as `module: "ESNext"`.
* Support fallback `*.js` imports to `*.ts` files.

Different with builder:

* ts-directly use [ESM Loader Hooks](https://nodejs.org/docs/latest/api/module.html#customization-hooks) that is more efficient than builder. After transpiling the code, builder will merge chunks and write the result to files, which takes more time and is redundant for Node.

## Usage

Since ts-directly does not bundle a compiler, you need to install one of the `@swc/core`, `esbuild`, `sucrase`, `typescript`. In the vast majority of cases where projects using TypeScript have `typescript` installed, ts-directly works out-of-box.

```shell
pnpm add ts-directly
```

You can register ts-directly with Node options:

```shell
node --import ts-directly/register main.ts
```

Or register in code:

```javascript
import module from "module";

// Use nullable check for compatibility with runtimes other than Node.
module.register?.("ts-directly", import.meta.url);

// TS files can be imported after registration.
await import("./file/import/ts/modules.ts");
```

Use the API:

```typescript
declare function transform(code: string, filename: string, format?: ScriptType): Promise<LoadFnOutput>;
```

Transform the module from TypeScript to JavaScript using a supported compiler, the compiler options is read from closest tsconfig.json.

* `code`: TypeScript code to compile.
* `filename`: The filename, must have a valid JS or TS extension.
* `format`: Specify the output format `commonjs` or `module`, if omitted it is determined automatically.

Returns a promise of object with properties:

* `format`: `module` if the file is ESM, `commonjs` for CJS.
* `source`: The JS code.
* `shortCircuit`: always `true`, make the object satisfies `LoadFnOutput`

```javascript
import { readFileSync, writeFileSync } from "fs";
import { transform } from "ts-directly";

const file = "module.ts";
const tsCode = readFileSync(file, "utf8");

const { source, format } = await transform(tsCode, file);
```

## No Alias Support

Resolving alias is outside of the scope for ts-directly, because TypeScript does not change how import paths are emitted by `tsc`.

Also, directory import and omitting file extension are not supported.

## Configuration

You can specify the compiler by set `TS_COMPILER` environment variable, possible values: `swc`, `esbuild`, `sucrase` and `tsc`.

```shell
TS_COMPILER=tsc && node --import ts-directly/register main.ts
```

## Performance

Transform 1322 files, see [benchmark/loader.ts](https://github.com/Kaciras/ts-directly/blob/master/benchmark/loader.ts).

OS: Windows11, AMD Ryzen 5 5625U, PCIe 3.0 NVMe SSD.

| No. |        compiler |        time |  time.SD | time.ratio | filesize | filesize.ratio |
|----:|----------------:|------------:|---------:|-----------:|---------:|---------------:|
|   0 |     swcCompiler |   324.87 ms |  3.44 ms |      0.00% | 8.67 MiB |          0.00% |
|   1 | esbuildCompiler |   382.57 ms |  3.41 ms |    +17.76% | 8.33 MiB |         -3.94% |
|   2 | sucraseCompiler |   436.99 ms |  4.54 ms |    +34.51% | 8.96 MiB |         +3.35% |
|   3 |     tscCompiler | 4,498.32 ms | 34.30 ms |  +1284.64% | 8.75 MiB |         +0.92% |

## CONTRIBUTING

Download the latest version of this project, and build it:

```shell
git clone https://github.com/Kaciras/ts-directly.git
cd ts-directly
pnpm install
pnpm run build
```

Then you can use the loader, or run tests:

```shell
pnpm run test
```

Run a benchmark (files in `benchmark/`):

```shell
pnpm exec esbench --file <filename.ts>
```
