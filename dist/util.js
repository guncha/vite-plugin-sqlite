import { readFileSync } from "fs";
import assert from "assert";
export { assert };
export const assertEqual = assert.strictEqual;
// export function assertEqual<T>(actual: unknown, expected: T): asserts actual is T {
//   assert.equal(actual, expected);
// }
function getDefaultAssertionMessage() {
    const stack = new Error().stack;
    if (stack) {
        const lines = stack.split("\n");
        const [_, filePath, line] = lines[3].match(/\((.*?):(\d+):(\d+)\)$/) ?? [];
        const filePathTrimmed = filePath.replace(/^file:\/\//, "");
        const sourceLine = readFileSync(filePathTrimmed, "utf-8")
            .split("\n")[parseInt(line, 10) - 1].trim();
        return "Assertion failed: " + sourceLine;
    }
    return "Assertion failed";
}
export function assertNever(_x) {
    throw new Error("Unexpected value");
}
export function generateArgumentName(arg, suffixIdx = false) {
    const suffix = suffixIdx ? arg.idx : "";
    if (arg.name.startsWith("?")) {
        return `p${arg.idx}${suffix}`;
    }
    else {
        return arg.name.replace(/[^a-zA-Z0-9_]/g, "_") + suffix;
    }
}
export function raise(message) {
    throw new Error(message);
}
