import core from "@kaciras/eslint-config-core";
import typescript from "@kaciras/eslint-config-typescript";

export default [...core, ...typescript,
	{
		ignores: ["{lib,coverage}/**"],
	},
	{
		rules: {
			"kaciras/import-group-sort": "warn",
		},
	},
];
