# TS-Directly

[![NPM Version](https://img.shields.io/npm/v/ts-directly?style=flat-square)](https://www.npmjs.com/package/ts-directly)
![Node Current](https://img.shields.io/node/v/ts-directly?style=flat-square)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/Kaciras/ts-directly/test.yml?style=flat-square)](https://github.com/Kaciras/ts-directly/actions/workflows/test.yml)

Let Node run TS files or add to your library to give it the ability to execute TypeScript.

* Tiny: [5 KB](https://pkg-size.dev/ts-directly) + 1 dependency (9 KB) minified.
* Automatic detects installed compilers, support [SWC](https://swc.rs), [esbuild](https://esbuild.github.io), [sucrase](https://github.com/alangpierce/sucrase) and [tsc](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#a-simple-transform-function).
* Transform files based on closest `tsconfig.json`.
* Support `baseDir` & `paths` alias.
* Support `.cts` and `.mts` files, as well as `module: "ESNext"`.

> [!WARNING]
> Directory indexes and omit file extensions are only work for `require()`, and `import` when target is set to `c TS files.
> 
> Fallback `*.js` import to `*.ts` file is supported.

Different with builder:

* TS-Directly use [ESM Loader Hooks](https://nodejs.org/docs/latest/api/module.html#customization-hooks) that is more efficient than builder. After transpiling the code, builder will merge chunks and write the result to files, which takes more time and is redundant for Node.

Why not:

* [ts-node](https://github.com/TypeStrong/ts-node) doesn't work when your package type is "module".
* [tsx](https://github.com/privatenumber/tsx) bundles `esbuild`, while TS-Directly supports several compilers - it's more friendly to projects that don't use `esbuild`.

## Usage

Since TS-Directly does not bundle a compiler, you need to install one of the `@swc/core`, `esbuild`, `sucrase`, `typescript`. In the vast majority of cases TS-Directly works out-of-box:

* Projects using TypeScript usually have `typescript` installed.
* Compilers from other installed packages (e.g. `vite` has dependency `esbuild`) can also be used by TS-Directly.

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

## Configuration

You can specify the compiler by set `TS_COMPILER` environment variable, possible values: `swc`, `esbuild`, `sucrase` and `tsc`.

```shell
TS_COMPILER=tsc && node --import ts-directly/register main.ts
```

## Performance

Transform 1322 files, see [benchmark/loader.ts](https://github.com/Kaciras/ts-directly/blob/master/benchmark/loader.ts).

OS: Windows11, AMD Ryzen 5 5625U, PCIe 3.0 NVMe SSD.

| No. | compiler |        time |  time.SD | time.ratio | filesize | filesize.ratio |
|----:|---------:|------------:|---------:|-----------:|---------:|---------------:|
|   0 |      swc |   299.56 ms |  3.12 ms |      0.00% | 8.67 MiB |          0.00% |
|   1 |  esbuild |   379.90 ms |  9.17 ms |    +26.82% | 8.33 MiB |         -3.94% |
|   2 |  sucrase |   455.83 ms |  5.47 ms |    +52.17% | 8.93 MiB |         +3.04% |
|   3 |      tsc | 2,847.94 ms | 65.22 ms |   +850.71% | 8.74 MiB |         +0.80% |

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

Run benchmark (files in `benchmark/`):

```shell
pnpm exec esbench --file loader.ts
```
