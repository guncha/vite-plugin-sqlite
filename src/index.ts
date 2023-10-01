import type { Plugin } from "vite";
import Database from "better-sqlite3";
import { getSchema } from "./sqlSchema.js";
import * as fs from "fs";
import { generateDts } from "./generateDts.js";

export default function sqlitePlugin(databasePath: string): Plugin {
  const db = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
    // verbose: console.log,
  });

  return {
    name: "vite-plugin-sqlite",
    async transform(src, id) {
      if (id.endsWith(".sql")) {
        const schema = await getSchema(src, db);

        // Bit of a hack to write .d.ts file from the plugin like this, but it works
        fs.writeFileSync(id + ".d.ts", generateDts(schema));

        const code = `export default ${JSON.stringify(schema)};`;
        return { code, map: null };
      }
      return null;
    },
  };
}
