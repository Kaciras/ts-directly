# TS Directly

![NPM Version](https://img.shields.io/npm/v/ts-directly?style=flat-square)
![Node Current](https://img.shields.io/node/v/ts-directly?style=flat-square)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/Kaciras/ts-directly/test.yml?style=flat-square)

Let Node execute TypeScript files directly. Using [ESM Loader Hooks](https://nodejs.org/docs/latest/api/module.html#customization-hooks).

* Tiny: 2.8 KB + 1 dependency (4.7 KB) gzipped.
* Automatic detects installed compilers, support [SWC](https://swc.rs/), [esbuild](https://esbuild.github.io), and [tsc](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#a-simple-transform-function).
* Transform files based on `tsconfig.json`.
* Support transform `.cts` and `.mts` files, as well as `module: "ESNext"`.

## Usage

Since ts-directly does not include a compiler, you need to install one of the `@swc/core`, `esbuild`, `typescript`. In the vast majority of cases where projects using TypeScript have `typescript` installed, ts-directly comes out of the box.

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

## No Alias Support

Resolving alias is outside of the scope for ts-directly, because TypeScript does not change how import paths are emitted by `tsc`.

Also, directory import and omitting file extension are not supported.

## Performance

Transform 1480 TS files, see [benchmark/loader.ts](https://github.com/Kaciras/ts-directly/blob/main/benchmark/loader.ts).

OS: Windows11, AMD Ryzen 5 5625U, PCIe 3.0 NVMe SSD.

| No. | Name |        compiler | filesize | filesize.ratio |        time |   time.SD | time.ratio |
|----:|-----:|----------------:|---------:|---------------:|------------:|----------:|-----------:|
|   0 | load |     swcCompiler | 9.36 MiB |          0.00% |   355.13 ms |   3.75 ms |      0.00% |
|   1 | load | esbuildCompiler | 8.98 MiB |         -4.09% |   398.08 ms |   9.14 ms |    +12.10% |
|   2 | load |      tsCompiler | 9.38 MiB |         +0.18% | 5,028.82 ms | 126.26 ms |  +1316.07% |
