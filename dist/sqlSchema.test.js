import * as sqlite from "better-sqlite3";
import { getSchema } from "./sqlSchema.js";
import { describe, beforeEach, it, expect } from "vitest";
describe("getSchema", () => {
    let db;
    beforeEach(async () => {
        db = await sqlite.default(":memory:");
        await db.exec(`
      CREATE TABLE a(id TEXT NOT NULL PRIMARY KEY, a1 TEXT);
      CREATE TABLE b(
        b1 INTEGER NOT NULL PRIMARY KEY,
        aId TEXT NOT NULL REFERENCES a(id)
      );
    `);
    });
    function parseTest(query, cb) {
        return [
            `should parse ${query}`,
            async () => cb(await getSchema(query, db)),
        ];
    }
    it(...parseTest("SELECT * FROM a;", (query) => expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [],
          "outputFields": [
            {
              "name": "id",
              "nullable": false,
              "type": "string",
            },
            {
              "name": "a1",
              "nullable": true,
              "type": "string",
            },
          ],
        }
      `)));
    it(...parseTest("SELECT a.a1, b.b1 FROM a LEFT JOIN b ON a.id = b.aId;", (query) => expect(query).toMatchInlineSnapshot(`
          {
            "inputFields": [],
            "outputFields": [
              {
                "name": "a1",
                "nullable": true,
                "type": "string",
              },
              {
                "name": "b1",
                "nullable": true,
                "type": "number",
              },
            ],
          }
        `)));
    it(...parseTest("SELECT ?", (query) => expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "?",
              "nullable": true,
              "type": "unknown",
            },
          ],
          "outputFields": [
            {
              "name": "?",
              "nullable": true,
              "type": "unknown",
            },
          ],
        }
      `)));
    it(...parseTest("SELECT a1 FROM a WHERE id = ?", (query) => expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "id",
              "nullable": false,
              "type": "string",
            },
          ],
          "outputFields": [
            {
              "name": "a1",
              "nullable": true,
              "type": "string",
            },
          ],
        }
      `)));
    it(...parseTest("SELECT id FROM a WHERE a1 = ?", (query) => expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "a1",
              "nullable": true,
              "type": "string",
            },
          ],
          "outputFields": [
            {
              "name": "id",
              "nullable": false,
              "type": "string",
            },
          ],
        }
      `)));
    it(...parseTest("SELECT id FROM a WHERE a1 = ? AND id = true", (query) => expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "a1",
              "nullable": true,
              "type": "string",
            },
          ],
          "outputFields": [
            {
              "name": "id",
              "nullable": false,
              "type": "string",
            },
          ],
        }
      `)));
    it(...parseTest("SELECT id FROM a LIMIT ?", (query) => expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "limit",
              "nullable": false,
              "type": "number",
            },
          ],
          "outputFields": [
            {
              "name": "id",
              "nullable": false,
              "type": "string",
            },
          ],
        }
      `)));
    it(...parseTest("SELECT id FROM a LIMIT ? OFFSET ?", (query) => expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "limit",
              "nullable": false,
              "type": "number",
            },
            {
              "idx": 2,
              "name": "offset",
              "nullable": false,
              "type": "number",
            },
          ],
          "outputFields": [
            {
              "name": "id",
              "nullable": false,
              "type": "string",
            },
          ],
        }
      `)));
    it(...parseTest("SELECT COUNT(*) FROM a", (query) => expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [],
          "outputFields": [
            {
              "name": "COUNT(*)",
              "nullable": false,
              "type": "number",
            },
          ],
        }
      `)));
    it(...parseTest("SELECT COUNT(*) as foo_count FROM a", (query) => 
    // TODO Try to improve this case
    expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [],
          "outputFields": [
            {
              "name": "foo_count",
              "nullable": true,
              "type": "unknown",
            },
          ],
        }
      `)));
    it("should parse virtual table calls", async () => {
        db.exec(`CREATE VIRTUAL TABLE fts USING fts5(foo);`);
        const query = await getSchema("SELECT * FROM fts(?)", db);
        expect(query).toMatchInlineSnapshot(`
      {
        "inputFields": [
          {
            "idx": 1,
            "name": "?",
            "nullable": true,
            "type": "unknown",
          },
        ],
        "outputFields": [
          {
            "name": "foo",
            "nullable": true,
            "type": "unknown",
          },
        ],
      }
    `);
    });
    it("should parse virtual table calls with joins", async () => {
        db.exec(`CREATE VIRTUAL TABLE fts USING fts5(foo);`);
        const query = await getSchema("SELECT fts.foo FROM fts(?) LEFT JOIN a ON fts.rowid = a.rowid", db);
        expect(query).toMatchInlineSnapshot(`
      {
        "inputFields": [
          {
            "idx": 1,
            "name": "?",
            "nullable": true,
            "type": "unknown",
          },
        ],
        "outputFields": [
          {
            "name": "foo",
            "nullable": true,
            "type": "unknown",
          },
        ],
      }
    `);
    });
    it(...parseTest("INSERT INTO a(id, a1) VALUES (?, ?)", (query) => expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "id",
              "nullable": false,
              "type": "string",
            },
            {
              "idx": 2,
              "name": "a1",
              "nullable": true,
              "type": "string",
            },
          ],
          "outputFields": [],
        }
      `)));
    it(...parseTest("INSERT INTO a(id, a1) VALUES (?, ?) RETURNING *", (query) => expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "id",
              "nullable": false,
              "type": "string",
            },
            {
              "idx": 2,
              "name": "a1",
              "nullable": true,
              "type": "string",
            },
          ],
          "outputFields": [
            {
              "name": "id",
              "nullable": false,
              "type": "string",
            },
            {
              "name": "a1",
              "nullable": true,
              "type": "string",
            },
          ],
        }
      `)));
    describe("with views", () => {
        beforeEach(() => {
            db.exec("CREATE VIEW a_with_b AS SELECT a.a1, b.b1 FROM a LEFT JOIN b ON a.id = b.aId");
        });
        it("should parse simple LEFT JOIN views", async () => {
            expect(await getSchema("SELECT * FROM a_with_b", db))
                .toMatchInlineSnapshot(`
      {
        "inputFields": [],
        "outputFields": [
          {
            "name": "a1",
            "nullable": true,
            "type": "string",
          },
          {
            "name": "b1",
            "nullable": true,
            "type": "number",
          },
        ],
      }
    `);
        });
    });
    it("should parse LEFT JOINs with variables", async () => {
        expect(await getSchema("SELECT a.a1 FROM a LEFT JOIN b ON a.id = b.aId WHERE a.a1 = ?", db))
            .toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "a.a1",
              "nullable": true,
              "type": "unknown",
            },
          ],
          "outputFields": [
            {
              "name": "a1",
              "nullable": true,
              "type": "string",
            },
          ],
        }
      `);
    });
});
