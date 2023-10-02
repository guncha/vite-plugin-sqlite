/// <reference path="sqlite-parser.d.ts" />

import SQLiteParser, {
  BinaryExpression,
  InsertStatement,
  SelectStatement,
  StatementList,
} from "@appland/sql-parser";
import { ColumnDefinition, Database } from "better-sqlite3";
import { assert, assertNever, raise } from "./util.js";

export interface TypescriptField {
  name: string;
  type: string;
  nullable: boolean;
}

export interface InputField extends TypescriptField {
  idx: number;
}

export type QuerySchema = {
  inputFields: InputField[];
  outputFields: TypescriptField[];
};

/** Result row for PRAGMA table_list  */
interface TableListDetails {
  schema: string;
  name: string;
  type: "view" | "table" | "shadow" | "virtual";
  /** Number of columns */
  ncol: number;
  /** If this table is WITHOUT ROWID */
  wr: 0;
  /** If this table is STRICT */
  strict: 0 | 1;
}

/** Result row for PRAGMA table_xinfo(name) */
interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: null;
  pk: 0 | 1;
  hidden: 0 | 1;
}

export async function getSchema(
  queryText: string,
  db: Database
): Promise<QuerySchema> {
  const cachedTableInfo = new Map<string, Array<ColumnInfo>>();
  const query = db.prepare(queryText);
  const parsedQuery = SQLiteParser(queryText);

  /** Tables in the query where all of the columns are optional */
  const optionalTables: Array<string> = [];

  /** The input fields to the query such as ? and :foo */
  const inputFields: Array<InputField> = [];

  await visitQuery(parsedQuery);

  // Use the input field offsets to assign param indices as used by sqlite3_bind_*
  // TODO: This doesn't support explicit indices like ?1 or named params (with duplicates)
  inputFields.sort((a, b) => a.idx - b.idx);
  for (let i = 0; i < inputFields.length; i++) {
    inputFields[i].idx = i + 1;
  }

  const columns: Array<ColumnDefinition> = [];
  try {
    // Some queries don't have a result, like INSERT
    columns.push(...query.columns());
  } catch (err) {}

  /** Output fields */
  const outputFields = await Promise.all(columns.map(getTypescriptType));

  return {
    inputFields,
    outputFields,
  };

  async function visitResult(result: NonNullable<SelectStatement["result"]>) {
    for (const res of result) {
      switch (res.type) {
        case "identifier":
          switch (res.variant) {
            case "column":
            case "star":
              break;
            default:
              assertNever(res);
          }
          break;
        case "variable":
          inputFields.push({
            name: res.name,
            type: "unknown",
            nullable: true,
            idx: res.location.start.offset,
          });
          break;
        default:
          assertNever(res);
      }
    }
  }

  async function visitWhereExp(exp: BinaryExpression, select: SelectStatement) {
    assert(exp.type === "expression");
    assert(exp.variant === "operation");
    assert(exp.format === "binary");
    assert(exp.operation === "=");
    assert(exp.left.type === "identifier");
    assert(exp.left.variant === "column");

    if (exp.right.type === "variable") {
      assert(
        select.from?.type === "identifier" && select.from.variant === "table"
      );
      assert(!exp.left.name.includes("."));
      assert(exp.right.name === "?");

      inputFields.push({
        name: exp.left.name,
        type: await getType(select.from.name, exp.left.name),
        nullable: await getNullable(select.from.name, exp.left.name),
        idx: exp.right.location.start.offset,
      });
    } else {
      throw new Error("Not implemented!");
    }
  }

  async function visitWhere(
    where: NonNullable<SelectStatement["where"]>,
    select: SelectStatement
  ) {
    for (const exp of where) {
      await visitWhereExp(exp, select);
    }
  }

  async function getTableType(tableName: string) {
    const tableList = (await db.pragma("table_list")) as TableListDetails[];

    const tableInfo =
      tableList.find((t) => t.name.toLowerCase() === tableName) ??
      raise("Table not found: " + tableName);
    return tableInfo.type;
  }

  async function visitFrom(from: NonNullable<SelectStatement["from"]>) {
    if (from.type === "identifier" && from.variant === "table") {
      const tableName = from.name;
      const tableType = await getTableType(tableName);

      switch (tableType) {
        case "table":
          // Regular table, nothing to do here. We'll get optionality from PRAGMA table_xinfo
          break;
        case "view": {
          const { sql } = (await db
            .prepare("SELECT sql FROM sqlite_schema WHERE name = ?")
            .get(tableName)) as { sql: string };
          const parsedView = SQLiteParser(sql);
          assert(parsedView.type === "statement");
          assert(parsedView.variant === "list");
          assert(parsedView.statement.length === 1);
          const createStatement = parsedView.statement[0];
          assert(createStatement.type === "statement");
          assert(createStatement.variant === "create");
          assert(createStatement.format === "view");
          await visitSelect(createStatement.result);
          break;
        }
        case "virtual":
        case "shadow":
          throw new Error("Not implemented!");
        default:
          assertNever(tableType);
      }
    } else if (from.type === "map" && from.variant === "join") {
      assert(from.map.length === 1);
      const join = from.map[0];
      assert(join.type === "join");
      assert(
        join.source.type === "identifier" && join.source.variant === "table"
      );
      assert(join.variant === "left join");

      optionalTables.push(join.source.name);
    }
  }

  async function visitSelect(statement: SelectStatement) {
    assert(statement.type === "statement");
    assert(statement.variant === "select");

    await visitResult(statement.result);

    if (statement.from) {
      await visitFrom(statement.from);
    }

    if (statement.where) {
      await visitWhere(statement.where, statement);
    }
  }

  async function visitInsert(statement: InsertStatement) {
    assert(statement.type === "statement");
    assert(statement.variant === "insert");
    assert(statement.action === "insert");
    const into = statement.into;
    assert(into.type === "identifier");
    assert(into.variant === "expression");
    assert(into.format === "table");

    assert(statement.result.length === 1);
    const result = statement.result[0];
    assert(result.type === "expression");
    assert(result.variant === "list");
    for (const [i, exp] of Object.entries(result.expression)) {
      assert(exp.type === "variable");
      assert(exp.format === "numbered");
      assert(exp.name === "?");

      const column = into.columns[parseInt(i, 10)] ?? raise("Missing column");
      inputFields.push({
        name: column.name,
        type: await getType(into.name, column.name),
        nullable: await getNullable(into.name, column.name),
        idx: exp.location.start.offset,
      });
    }
  }

  function visitQuery(list: StatementList) {
    assert(list.type === "statement");
    assert(list.variant === "list");
    assert(list.statement.length === 1);
    const statement = list.statement[0];
    assert(statement.type === "statement");

    if (statement.variant === "select") {
      return visitSelect(statement);
    } else if (statement.variant === "insert") {
      return visitInsert(statement);
    } else if (statement.variant === "create") {
      throw new Error("Not implemented!");
    } else {
      assertNever(statement);
    }
  }

  async function getTypescriptType({
    column,
    database,
    name,
    table,
    type,
  }: ColumnDefinition): Promise<TypescriptField> {
    if (!column || !table) {
      return {
        name,
        type: "unknown",
        nullable: true,
      };
    }
    assert(database === "main");
    return {
      name,
      type: mapType(type),
      nullable: await getNullable(table, column),
    };
  }

  function mapType(type: string | null) {
    switch (type) {
      case "DATETIME":
      case "TIMESTAMP":
        return "Date";
      case "INTEGER":
        return "number";
      case "TEXT":
        return "string";
      case "BLOB":
        return "Array";
      default:
        throw new Error("Unhandled type: " + type);
    }
  }

  async function getTableInfo(table: string): Promise<Array<ColumnInfo>> {
    const cachedInfo = cachedTableInfo.get(table);
    if (cachedInfo) return cachedInfo;
    const tableInfo = (await db.pragma(
      `table_xinfo(${table})`
    )) as ColumnInfo[];
    cachedTableInfo.set(table, tableInfo);
    return tableInfo;
  }

  async function getColumnInfo(table: string, column: string) {
    const tableInfo = await getTableInfo(table);
    return tableInfo.find(
      (colInfo) => colInfo.name.toLowerCase() === column.toLowerCase()
    );
  }

  async function getNullable(table: string, column: string): Promise<boolean> {
    if (optionalTables.includes(table)) {
      return true;
    }

    const colInfo =
      (await getColumnInfo(table, column)) ?? raise("Column not found");

    return colInfo.notnull === 0;
  }

  async function getType(table: string, column: string): Promise<string> {
    const colInfo =
      (await getColumnInfo(table, column)) ??
      raise(`Column "${column}" for table "${table}" not found`);

    return mapType(colInfo.type);
  }

  /** Serialize the model so it can be inserted into the db */
  function toDBRow(val: any, col: TypescriptField): unknown {
    if (val === undefined || val === null) {
      if (!col.nullable) {
        throw new Error("Value for non-nullable column is null");
      }
      return null;
    }
    if (col.type === "Date") {
      if (val instanceof Date) {
        return val.toISOString();
      } else {
        throw new Error(`Value for "${col.name}" not a Date`);
      }
    } else {
      return val;
    }
  }

  /** Deserialize the model from the db row */
  function fromDBRow<T>(row: Record<string, unknown>): T {
    const data: T = {} as T;
    for (const col of columns) {
      const value = row[col.name];
      if (col.type === "DATETIME" && value != null) {
        data[col.name as keyof T] = new Date(value as string) as any;
      } else if (col.type?.startsWith("BLOB_") && value != null) {
        switch (col.type) {
          case "BLOB_FLOAT32":
            data[col.name as keyof T] = new Float32Array(
              (value as Buffer).buffer
            ) as any;
            break;
          default:
            throw new Error(`Unhandled BLOB type: ${col.type}`);
        }
      } else {
        data[col.name as keyof T] = value as any;
      }
    }
    return data;
  }
}
