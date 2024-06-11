import { join, sep } from "path";

// `as` makes it invalid for JS.
export default join("Hello", "World").replace(sep, " ") as "Hello, World";
