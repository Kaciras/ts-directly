# TSFC

Let Node execute TypeScript files directly, with fast compiler.

* Automatic detects installed compilers, support SWC, esbuild, and tsc.
* Support transform `.cts` and `.mts` files, as well as `module: "ESNext"`.

## Usage

```shell
pnpm add tsfc
```

You can register TSFC with Node options:

```shell
node --import tsfc/register main.ts
```

Or register in code:

```javascript
import { register } from "module";

register("tsfc", import.meta.url);

await import("./file/import/ts/modules.ts");
```

## No Alias Support

Resolving alias is outside of the scope for TSFC, as TypeScript does not change how import paths are emitted by `tsc`.
