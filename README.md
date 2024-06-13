# TS Directly

[![NPM Version](https://img.shields.io/npm/v/ts-directly?style=flat-square)](https://www.npmjs.com/package/ts-directly)
![Node Current](https://img.shields.io/node/v/ts-directly?style=flat-square)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/Kaciras/ts-directly/test.yml?style=flat-square)](https://github.com/Kaciras/ts-directly/actions/workflows/test.yml)

Let Node run TypeScript files with the compiler you installed. Using [ESM Loader Hooks](https://nodejs.org/docs/latest/api/module.html#customization-hooks).

* Tiny: 2.8 KB + 1 dependency (4.7 KB) gzipped.
* Automatic detects installed compilers, support [SWC](https://swc.rs), [esbuild](https://esbuild.github.io), and [tsc](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#a-simple-transform-function).
* Transform files based on `tsconfig.json`.
* Support `.cts` and `.mts` files, as well as `module: "ESNext"`.
* Support fallback `*.js` imports to `*.ts` files.

## Usage

Since ts-directly does not include a compiler, you need to install one of the `@swc/core`, `esbuild`, `typescript`. In the vast majority of cases where projects using TypeScript have `typescript` installed, ts-directly works out-of-box.

```shell
pnpm add ts-directly
```

You can register ts-directly with Node options:

```shell
node --import ts-directly/register main.ts
```

Or register in code:

```javascript
import { register } from "module";

register("ts-directly", import.meta.url);

// TS files can be imported after registration.
await import("./file/import/ts/modules.ts");
```

Use the API:

```javascript
import { detectTypeScriptCompiler } from "ts-directly";
import { readFileSync, writeFileSync } from "fs";

const compile = await detectTypeScriptCompiler();

const file = "module.ts";
const isESM = true;
const tsCode = readFileSync(file, "utf8");

const jsCode = await compile(tsCode, file, isESM);
```

## No Alias Support

Resolving alias is outside of the scope for ts-directly, because TypeScript does not change how import paths are emitted by `tsc`.

Also, directory import and omitting file extension are not supported.

## Configuration

You can specify the compiler by set `TS_COMPILER` environment variable, possible values: `swc`, `esbuild` and `tsc`.

```shell
TS_COMPILER=tsc && node --import ts-directly/register main.ts
```

## Performance

Transform 1468 files, see [benchmark/loader.ts](https://github.com/Kaciras/ts-directly/blob/master/benchmark/loader.ts).

OS: Windows11, AMD Ryzen 5 5625U, PCIe 3.0 NVMe SSD.

| No. | Name |        compiler | filesize | filesize.ratio |        time |   time.SD | time.ratio |
|----:|-----:|----------------:|---------:|---------------:|------------:|----------:|-----------:|
|   0 | load |     swcCompiler | 9.36 MiB |          0.00% |   355.13 ms |   3.75 ms |      0.00% |
|   1 | load | esbuildCompiler | 8.98 MiB |         -4.09% |   398.08 ms |   9.14 ms |    +12.10% |
|   2 | load |      tsCompiler | 9.38 MiB |         +0.18% | 5,028.82 ms | 126.26 ms |  +1316.07% |

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
