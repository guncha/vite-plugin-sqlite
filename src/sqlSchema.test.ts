import * as sqlite from "better-sqlite3";
import { getSchema } from "./sqlSchema.js";
import { describe, beforeEach, it, expect } from "vitest";

describe("getSchema", () => {
  let db: sqlite.Database;
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

  function parseTest(query: string, cb: (query: any) => void) {
    return [
      `should parse ${query}`,
      async () => cb(await getSchema(query, db)),
    ] as const;
  }

  it(
    ...parseTest("SELECT * FROM a;", (query) =>
      expect(query).toMatchInlineSnapshot(`
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
      `)
    )
  );
  it(
    ...parseTest(
      "SELECT a.a1, b.b1 FROM a LEFT JOIN b ON a.id = b.aId;",
      (query) =>
        expect(query).toMatchInlineSnapshot(`
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
        `)
    )
  );
  it(
    ...parseTest("SELECT ?", (query) =>
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
              "name": "?",
              "nullable": true,
              "type": "unknown",
            },
          ],
        }
      `)
    )
  );
  it(
    ...parseTest("SELECT a1 FROM a WHERE id = ?", (query) =>
      expect(query).toMatchInlineSnapshot(`
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
      `)
    )
  );
  it(
    ...parseTest("SELECT id FROM a WHERE a1 = ?", (query) =>
      expect(query).toMatchInlineSnapshot(`
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
      `)
    )
  );
  it(
    ...parseTest("SELECT id FROM a LIMIT ?", (query) =>
      expect(query).toMatchInlineSnapshot(`
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
      `)
    )
  );
  it(
    ...parseTest("SELECT id FROM a LIMIT ? OFFSET ?", (query) =>
      expect(query).toMatchInlineSnapshot(`
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
      `)
    )
  );
  it(
    ...parseTest("INSERT INTO a(id, a1) VALUES (?, ?)", (query) =>
      expect(query).toMatchInlineSnapshot(`
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
      `)
    )
  );
  it(
    ...parseTest("INSERT INTO a(id, a1) VALUES (?, ?) RETURNING *", (query) =>
      expect(query).toMatchInlineSnapshot(`
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
      `)
    )
  );
  it("should parse simple LEFT JOIN views", async () => {
    db.exec(
      "CREATE VIEW a_with_b AS SELECT a.a1, b.b1 FROM a LEFT JOIN b ON a.id = b.aId"
    );
    const query = await getSchema("SELECT * FROM a_with_b", db);
    expect(query).toMatchInlineSnapshot(`
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
