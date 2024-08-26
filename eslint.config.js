import core from "@kaciras/eslint-config-core";
import typescript from "@kaciras/eslint-config-typescript";

export default [
	{ ignores: ["{lib,coverage,bench-data}/**"] },
	...core,
	...typescript,
	{
		rules: {
			"kaciras/import-specifier-order": "warn",
			"@typescript-eslint/no-var-requires": "off",
		},
	},
];
