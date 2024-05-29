const { stdout } = require("process");

stdout.write(require("./nested.cts").default);
