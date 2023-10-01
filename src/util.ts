import { readFileSync } from "fs";

export function assert(
  condition: boolean,
  message = getDefaultAssertionMessage()
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

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

export function raise(message: string): never {
  throw new Error(message);
}
