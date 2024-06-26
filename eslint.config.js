import core from "@kaciras/eslint-config-core";
import typescript from "@kaciras/eslint-config-typescript";

export default [
	{ ignores: ["{lib,coverage,bench-data}/**"] },
	...core,
	...typescript,
	{
		rules: {
			"kaciras/import-group-sort": "warn",
			"@typescript-eslint/no-var-requires": "off",
		},
	},
];
