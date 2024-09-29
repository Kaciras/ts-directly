# TS-Directly

[![NPM Version](https://img.shields.io/npm/v/ts-directly?style=flat-square)](https://www.npmjs.com/package/ts-directly)
![Node Current](https://img.shields.io/node/v/ts-directly?style=flat-square)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/Kaciras/ts-directly/test.yml?style=flat-square)](https://github.com/Kaciras/ts-directly/actions/workflows/test.yml)

Let Node run TS files, or add to your app to give it the ability to execute TypeScript.

* Transform TS files with **closest tsconfig.json**, monorepo friendly.
* Does not bundle a compiler, instead **uses the compiler installed in the project.**
* Tiny: [5 KB](https://pkg-size.dev/ts-directly) + 1 dependency (9 KB) minified.
* Transform files based on closest `tsconfig.json`.
* Support `baseDir` & `paths` alias.
* Support `.cts` and `.mts` files, as well as `module: "ESNext"`.

> [!NOTE]
> Directory indexes and omit file extensions are only work for `require()`, and does not support alias.
> 
> Redirection of `*.js` imports to `*.ts` files is supported, but TS-Directly always tries the original file first.

Supported compilers:

* [SWC](https://swc.rs)
* [esbuild](https://esbuild.github.io)
* [sucrase](https://github.com/alangpierce/sucrase)
* [tsc](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#a-simple-transform-function)

Why not builder:

* TS-Directly use [ESM Loader Hooks](https://nodejs.org/docs/latest/api/module.html#customization-hooks) that is more efficient than builder. After transpiling the code, builder will merge chunks and write the result to files, which takes more time and is redundant for Node.

Different with [ts-node](https://github.com/TypeStrong/ts-node), [tsx](https://github.com/privatenumber/tsx) ...:

* TS-Directly is intended to be an enhancement library for CLI apps, which adapts popular compilers but doesn't bundle them, so that users can use the compiler they already have in their project instead of introducing a new one.

VS [--experimental-strip-types](https://github.com/nodejs/loaders/issues/21):

* `--experimental-strip-types` currently is experimental and does not support enums, namespace, alias...
* TS-Directly exposes the transform API that useful for integration.

## Usage

Since TS-Directly does not have a compiler, you need to install one of the `@swc/core`, `esbuild`, `sucrase`, `typescript`. In the vast majority of cases TS-Directly works out-of-box:

* Projects using TypeScript usually have `typescript` installed.
* Compilers from other installed packages (e.g. `vite` has dependency `esbuild`) can also be used by TS-Directly.

If multiple compilers available, the fastest will be used (see [Performance](#performance)).

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
* `format`: Specify the output format `commonjs` or `module`, if omitted it will be determined automatically.

Returns a promise of object with properties:

* `format`: `module` if the output module is ESM, `commonjs` for CJS.
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

Simulate importing 1322 files, see [benchmark/loader.ts](https://github.com/Kaciras/ts-directly/blob/master/benchmark/loader.ts).

OS: Windows11, AMD Ryzen 5 5625U, PCIe 3.0 NVMe SSD.

| No. | compiler |        time |  time.SD | time.ratio | filesize | filesize.ratio |
|----:|---------:|------------:|---------:|-----------:|---------:|---------------:|
|   0 |      swc |   344.24 ms |  1.25 ms |      0.00% | 8.45 MiB |          0.00% |
|   1 |  esbuild |   422.70 ms |  6.73 ms |    +22.79% | 8.33 MiB |         -1.49% |
|   2 |  sucrase |   481.72 ms |  7.07 ms |    +39.94% | 8.93 MiB |         +5.67% |
|   3 |      tsc | 2,844.11 ms | 22.32 ms |   +726.21% | 8.74 MiB |         +3.37% |

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

Run benchmark (file in `benchmark/`):

```shell
pnpm exec esbench --file <filename.ts>
```
