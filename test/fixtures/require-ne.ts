const { stdout } = require("process");

stdout.write(require("./nested.cjs").default);
