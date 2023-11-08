import type { Plugin } from "vite";
import { QuerySchema } from "./sqlSchema.js";
export default function sqlitePlugin(databasePath: string, execSql: (query: string, schema: QuerySchema) => string): Plugin;
