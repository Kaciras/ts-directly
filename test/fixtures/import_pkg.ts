import { stdout } from "node:process";

stdout.write((await import("_pkg")).default);
