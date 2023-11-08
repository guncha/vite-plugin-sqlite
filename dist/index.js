import Database from "better-sqlite3";
import * as fs from "fs";
import { generateDts } from "./generateDts.js";
import { generateWrapper } from "./generateWrapper.js";
import { getSchema } from "./sqlSchema.js";
export default function sqlitePlugin(databasePath, execSql) {
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
                return {
                    code: `export default ${generateWrapper(src, schema, execSql)};`,
                    map: null,
                };
            }
            return null;
        },
    };
}
