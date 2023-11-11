import { readFileSync } from "fs";
import { InputField } from "./sqlSchema.js";
import assert from "assert";

export { assert };
type AssertFn = <T>(actual: unknown, expected: T) => asserts actual is T;
export const assertEqual: AssertFn = assert.strictEqual;

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
      .split("\n")
      [parseInt(line, 10) - 1].trim();
    return "Assertion failed: " + sourceLine;
  }
  return "Assertion failed";
}

export function assertNever(_x: never): never {
  throw new Error("Unexpected value");
}

export function generateArgumentName(arg: InputField): string {
  if (arg.name.startsWith("?")) {
    return `p${arg.idx}`;
  } else {
    return arg.name;
  }
}

export function raise(message: string): never {
  throw new Error(message);
}
