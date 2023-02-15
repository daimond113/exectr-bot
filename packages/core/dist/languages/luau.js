// This is a child_process
import luau from "../../luau.cjs";
luau.print = console.log;
const code = process.argv[2];
if (!code) throw new Error("no code");
// It errors if I don't do this
setTimeout(()=>{
    // Should be safe since Luau is sandboxed
    const output = luau.ccall("executeScript", "string", [
        "string"
    ], [
        code
    ]);
    if (output !== "") console.error(output);
}, 500);
