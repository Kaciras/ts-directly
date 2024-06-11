import packageJson from "../../package.json" with { type: "json" };

export default packageJson && "Hello World" as const;
