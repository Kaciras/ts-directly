# TS Directly

![NPM Version](https://img.shields.io/npm/v/ts-directly?style=flat-square)
![Node Current](https://img.shields.io/node/v/ts-directly?style=flat-square)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/Kaciras/ts-directly/test.yml?style=flat-square)

Let Node execute TypeScript files directly. Using [ESM Loader Hooks](https://nodejs.org/docs/latest/api/module.html#customization-hooks).

* Tiny: 3.59 KB + 1 dependency (4.7 KB) gzipped.
* Automatic detects installed compilers, support SWC, esbuild, and tsc.
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
