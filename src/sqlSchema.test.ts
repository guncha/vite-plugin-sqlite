import * as sqlite from "better-sqlite3";
import { getSchema, QuerySchema } from "./sqlSchema.js";
import { describe, beforeEach, it, expect } from "vitest";

describe("getSchema", () => {
  let db: sqlite.Database;
  beforeEach(async () => {
    db = await sqlite.default(":memory:");
    await db.exec(`
      CREATE TABLE fruit(id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, color TEXT);
      CREATE TABLE stock(
        quantity INTEGER NOT NULL PRIMARY KEY,
        fruitId TEXT NOT NULL REFERENCES fruit(id) UNIQUE
      );
    `);
  });

  function parseTest(query: string, cb: (query: QuerySchema) => void) {
    return [
      `should parse ${query}`,
      async () => cb(await getSchema(query, db)),
    ] as const;
  }

  it(
    ...parseTest("SELECT * FROM fruit", (query) =>
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
              "name": "name",
              "nullable": false,
              "type": "string",
            },
            {
              "name": "color",
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
      "SELECT id FROM fruit WHERE color = 'green' AND name = 'kale'",
      (query) =>
        expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [],
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
    ...parseTest("SELECT id FROM fruit WHERE color = :the_color", (query) =>
      expect(query.inputFields).toMatchInlineSnapshot(`
        [
          {
            "idx": 1,
            "name": ":the_color",
            "nullable": true,
            "type": "string",
          },
        ]
      `)
    )
  );
  it(
    ...parseTest("SELECT id FROM fruit WHERE color = @the_color", (query) =>
      expect(query.inputFields).toMatchInlineSnapshot(`
        [
          {
            "idx": 1,
            "name": "@the_color",
            "nullable": true,
            "type": "string",
          },
        ]
      `)
    )
  );
  it(
    ...parseTest("SELECT id FROM fruit WHERE color = $the_color", (query) =>
      expect(query.inputFields).toMatchInlineSnapshot(`
        [
          {
            "idx": 1,
            "name": "$the_color",
            "nullable": true,
            "type": "string",
          },
        ]
      `)
    )
  );
  it(
    ...parseTest(
      "SELECT id FROM fruit WHERE color = iif(:color IS NULL, 'red', :color)",
      (query) =>
        expect(query.inputFields).toMatchInlineSnapshot(`
        [
          {
            "idx": 1,
            "name": ":color",
            "nullable": true,
            "type": "unknown",
          },
        ]
      `)
    )
  );
  it(
    ...parseTest(
      "SELECT id FROM fruit WHERE name = ? OR color = $the_color",
      (query) =>
        expect(query.inputFields).toMatchInlineSnapshot(`
        [
          {
            "idx": 1,
            "name": "name",
            "nullable": false,
            "type": "string",
          },
          {
            "idx": 2,
            "name": "$the_color",
            "nullable": true,
            "type": "string",
          },
        ]
      `)
    )
  );
  describe("with camel cased names", () => {
    beforeEach(() => {
      db.exec(
        "ALTER TABLE fruit ADD COLUMN isTasty INTEGER NOT NULL DEFAULT 1;"
      );
    });
    it(
      ...parseTest("SELECT id FROM fruit WHERE isTasty = ?", (query) =>
        expect(query.inputFields).toMatchInlineSnapshot(`
          [
            {
              "idx": 1,
              "name": "istasty",
              "nullable": false,
              "type": "number",
            },
          ]
        `)
      )
    );
    it(
      ...parseTest('SELECT id FROM fruit WHERE "isTasty" = ?', (query) =>
        expect(query.inputFields).toMatchInlineSnapshot(`
          [
            {
              "idx": 1,
              "name": "isTasty",
              "nullable": false,
              "type": "number",
            },
          ]
        `)
      )
    );
  });
  it(
    ...parseTest("SELECT id FROM fruit WHERE fruit.color = ?1", (query) =>
      expect(query.inputFields).toMatchInlineSnapshot(`
        [
          {
            "idx": 1,
            "name": "fruit.color",
            "nullable": true,
            "type": "string",
          },
        ]
      `)
    )
  );
  it(
    ...parseTest("SELECT id FROM fruit as f WHERE f.color = ?", (query) =>
      expect(query.inputFields).toMatchInlineSnapshot(`
        [
          {
            "idx": 1,
            "name": "f.color",
            "nullable": true,
            "type": "string",
          },
        ]
      `)
    )
  );
  it(
    ...parseTest(
      "SELECT id, quantity FROM fruit LEFT JOIN stock ON fruit.id = stock.fruitId;",
      (query) =>
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
                "name": "quantity",
                "nullable": true,
                "type": "number",
              },
            ],
          }
        `)
    )
  );
  it(
    ...parseTest(
      "SELECT fruit.color FROM fruit LEFT JOIN stock ON fruit.id = stock.fruitId WHERE fruit.color = ?",
      (query) =>
        expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "fruit.color",
              "nullable": true,
              "type": "string",
            },
          ],
          "outputFields": [
            {
              "name": "color",
              "nullable": true,
              "type": "string",
            },
          ],
        }
      `)
    )
  );
  it(
    ...parseTest("SELECT 'hello'", (query) =>
      expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [],
          "outputFields": [
            {
              "name": "'hello'",
              "nullable": true,
              "type": "unknown",
            },
          ],
        }
      `)
    )
  );
  it(
    ...parseTest("SELECT 'hello_' || ?", (query) =>
      expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "?",
              "nullable": true,
              "type": "string",
            },
          ],
          "outputFields": [
            {
              "name": "'hello_' || ?",
              "nullable": true,
              "type": "unknown",
            },
          ],
        }
      `)
    )
  );
  it(
    ...parseTest("SELECT ? + 1", (query) =>
      expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "?",
              "nullable": true,
              "type": "number",
            },
          ],
          "outputFields": [
            {
              "name": "? + 1",
              "nullable": true,
              "type": "unknown",
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
    ...parseTest("SELECT color FROM fruit WHERE id = ?", (query) =>
      expect(query.inputFields).toMatchInlineSnapshot(`
        [
          {
            "idx": 1,
            "name": "id",
            "nullable": false,
            "type": "string",
          },
        ]
      `)
    )
  );
  it(
    ...parseTest("SELECT id FROM fruit WHERE color = ?", (query) =>
      expect(query.inputFields).toMatchInlineSnapshot(`
        [
          {
            "idx": 1,
            "name": "color",
            "nullable": true,
            "type": "string",
          },
        ]
      `)
    )
  );
  it(
    ...parseTest(
      "SELECT id FROM fruit WHERE color = ? AND id = true",
      (query) =>
        expect(query.inputFields).toMatchInlineSnapshot(`
          [
            {
              "idx": 1,
              "name": "color",
              "nullable": true,
              "type": "string",
            },
          ]
        `)
    )
  );
  it(
    ...parseTest("SELECT id FROM fruit LIMIT ?", (query) =>
      expect(query.inputFields).toMatchInlineSnapshot(`
        [
          {
            "idx": 1,
            "name": "limit",
            "nullable": false,
            "type": "number",
          },
        ]
      `)
    )
  );
  it(
    ...parseTest("SELECT id FROM fruit LIMIT ? OFFSET ?", (query) =>
      expect(query.inputFields).toMatchInlineSnapshot(`
        [
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
        ]
      `)
    )
  );
  it(
    ...parseTest("SELECT COUNT(*) FROM fruit", (query) =>
      expect(query).toMatchInlineSnapshot(`
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
      `)
    )
  );
  it(
    ...parseTest("SELECT COUNT(*) as foo_count FROM fruit", (query) =>
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
      `)
    )
  );
  it(
    ...parseTest("SELECT * FROM (SELECT * FROM FRUIT WHERE id = ?)", (query) =>
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
              "name": "id",
              "nullable": false,
              "type": "string",
            },
            {
              "name": "name",
              "nullable": false,
              "type": "string",
            },
            {
              "name": "color",
              "nullable": true,
              "type": "string",
            },
          ],
        }
      `)
    )
  );
  it.only(
    ...parseTest("SELECT id FROM (SELECT * FROM fruit WHERE color = 'red') UNION ALL SELECT fruitId FROM (SELECT * FROM stock WHERE fruitId = ?)", (query) =>
      expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "fruitid",
              "nullable": false,
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
  it("should parse SELECT * FROM fts(?)", async () => {
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
  it("should parse SELECT fts.foo FROM fts(?) LEFT JOIN fruit ON fts.rowid = fruit.rowid", async () => {
    db.exec(`CREATE VIRTUAL TABLE fts USING fts5(foo);`);
    const query = await getSchema(
      "SELECT fts.foo FROM fts(?) LEFT JOIN fruit ON fts.rowid = fruit.rowid",
      db
    );
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
  it(
    ...parseTest("UPDATE fruit SET name = ? WHERE id = ?", (query) =>
      expect(query).toMatchInlineSnapshot(`
        {
          "inputFields": [
            {
              "idx": 1,
              "name": "name",
              "nullable": false,
              "type": "string",
            },
            {
              "idx": 2,
              "name": "id",
              "nullable": false,
              "type": "string",
            },
          ],
          "outputFields": [],
        }
      `)
    )
  );
  it(
    ...parseTest("DELETE FROM fruit WHERE id = ?", (query) =>
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
          "outputFields": [],
        }
      `)
    )
  );
  it(
    ...parseTest("INSERT INTO fruit VALUES (?, ?, ?)", (query) =>
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
              "name": "name",
              "nullable": false,
              "type": "string",
            },
            {
              "idx": 3,
              "name": "color",
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
    ...parseTest("INSERT INTO fruit(id, color) VALUES (?, ?)", (query) =>
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
              "name": "color",
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
    ...parseTest(
      "INSERT INTO fruit(id, color) VALUES (?, ?) RETURNING *",
      (query) =>
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
              "name": "color",
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
              "name": "name",
              "nullable": false,
              "type": "string",
            },
            {
              "name": "color",
              "nullable": true,
              "type": "string",
            },
          ],
        }
      `)
    )
  );
  describe("comments", () => {
    it(
      ...parseTest("SELECT id FROM fruit WHERE color = /** @type {number} */ ?", (query) =>
        expect(query.inputFields).toMatchInlineSnapshot(`
          [
            {
              "idx": 1,
              "name": "color",
              "nullable": false,
              "type": "number",
            },
          ]
        `)
      )
    );
    it(
      ...parseTest("SELECT id FROM fruit WHERE color = /** @type {fOo_BaR2} */ :barbaz", (query) =>
        expect(query.inputFields).toMatchInlineSnapshot(`
          [
            {
              "idx": 1,
              "name": ":barbaz",
              "nullable": false,
              "type": "fOo_BaR2",
            },
          ]
        `)
      )
    );
    it(
      ...parseTest("SELECT id FROM fruit WHERE color = /** @type {number | null} */ ?", (query) =>
        expect(query.inputFields).toMatchInlineSnapshot(`
          [
            {
              "idx": 1,
              "name": "color",
              "nullable": true,
              "type": "number",
            },
          ]
        `)
      )
    );
  });
  describe.todo("with views", () => {
    beforeEach(() => {
      db.exec(
        "CREATE VIEW fruit_with_stock AS SELECT fruit.color, stock.quantity FROM fruit LEFT JOIN stock ON fruit.id = stock.fruitId"
      );
    });
    it("should parse SELECT * FROM fruit_with_stock", async () => {
      expect(await getSchema("SELECT * FROM fruit_with_stock", db))
        .toMatchInlineSnapshot(`
      {
        "inputFields": [],
        "outputFields": [
          {
            "name": "color",
            "nullable": true,
            "type": "string",
          },
          {
            "name": "quantity",
            "nullable": true,
            "type": "number",
          },
        ],
      }
    `);
    });
  });
});
