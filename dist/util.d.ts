import { InputField } from "./sqlSchema.js";
import assert from "assert";
export { assert };
type AssertFn = <T>(actual: unknown, expected: T) => asserts actual is T;
export declare const assertEqual: AssertFn;
export declare function assertNever(_x: never): never;
export declare function generateArgumentName(arg: InputField, suffixIdx?: boolean): string;
export declare function raise(message: string): never;
