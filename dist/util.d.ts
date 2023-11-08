import { InputField } from "./sqlSchema.js";
export declare function assert(condition: boolean, message?: string): asserts condition;
export declare function assertNever(_x: never): never;
export declare function generateArgumentName(arg: InputField): string;
export declare function raise(message: string): never;
