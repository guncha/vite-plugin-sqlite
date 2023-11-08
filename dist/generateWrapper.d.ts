import { QuerySchema } from "./sqlSchema.js";
export declare function generateWrapper(query: string, schema: QuerySchema, execSql: (query: string, schema: QuerySchema) => string): string;
