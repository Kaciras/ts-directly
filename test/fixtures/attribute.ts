import packageJson from "../../package.json" with { type: "json" };

if (packageJson) {
	process.stdout.write("Hello World" as const);
}
