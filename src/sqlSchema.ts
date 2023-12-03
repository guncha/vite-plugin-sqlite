/// <reference path="sqlite-parser.d.ts" />

import SQLiteParser, {
  Assignment,
  BinaryExpression,
  ColumnIdentifier,
  DeleteStatement,
  FunctionCall,
  InsertStatement,
  LimitExpression,
  ListExpression,
  LiteralExpression,
  SelectStatement,
  UpdateStatement,
  Variable,
} from "@appland/sql-parser";
import { ColumnDefinition, Database } from "better-sqlite3";
import { assert, assertEqual, assertNever, raise } from "./util.js";

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

/** Condensed table information for a specific select statement */
interface TableInfo {
  alias?: string;
  name: string;
  /** If all columns in the table are optional */
  optional: boolean;
  columns: Array<ColumnInfo>;
}

export function getSchema(queryText: string, db: Database): QuerySchema {
  const cachedTableInfo = new Map<string, Array<ColumnInfo>>();
  const query = db.prepare(queryText);
  const parsedQuery = SQLiteParser(queryText);

  /** Tables in the query where all of the columns are optional */
  const optionalTables: Array<string> = [];
  const lastStmt = parsedQuery.statement[parsedQuery.statement.length - 1];
  if (isSelectStatement(lastStmt)) {
    for (const table of getTablesFromStatement(lastStmt)) {
      if (table.optional) {
        optionalTables.push(table.name);
      }
    }
  }

  /** The input fields to the query such as ? and :foo */
  const inputFields: Array<InputField> = [];

  visitNode(parsedQuery, [], []);

  // Use the input field offsets to assign param indices as used by sqlite3_bind_*
  // TODO: This doesn't support explicit indices like ?1, ?2, etc.
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
  const outputFields = columns.map(getTypescriptType);

  return {
    inputFields,
    outputFields,
  };

  function addInputField(val: Variable, extra: Partial<InputField> = {}) {
    assertEqual(val.type, "variable");

    // Try to extract the preceding JSDoc comment, if any, and look for @type {Foo} or @type {Foo|null}
    const queryPrefix = queryText.slice(0, val.location.start.offset);
    const [_, type, orNull] =
      queryPrefix.match(
        /\/\*\*\s*@type\s+{\s*([\w_]+)\s*(\|\s*null)?\s*}\s*\*\/\s*$/
      ) ?? [];

    if (type) {
      extra = {
        ...extra,
        type: type.trim(),
        nullable: !!orNull,
      };
    }

    // Always use the :name, $name or @name for named parameters
    const isNamed = val.format === "named" || val.format === "tcl";
    const name = isNamed ? val.name : extra.name ?? val.name;

    // Don't add named parameters twice
    if (isNamed && inputFields.some((field) => field.name === name)) {
      return;
    }

    inputFields.push({
      name,
      type: extra.type ?? "unknown",
      nullable: extra.nullable ?? true,
      idx: val.location.start.offset,
    });
  }

  function visitNode(node: object, keys: string[], parents: object[]) {
    if (isVariable(node)) {
      visitVariable(node, keys, parents);
    } else {
      parents.push(node);
      for (const key of Object.keys(node)) {
        const child = (node as any)[key];
        keys.push(key);
        if (child && typeof child === "object") {
          if (Array.isArray(child)) {
            for (const item of child) {
              visitNode(item, keys, parents);
            }
          } else {
            visitNode(child, keys, parents);
          }
        }
        keys.pop();
      }
      parents.pop();
    }
  }

  function visitVariable(
    node: Variable,
    parentKeys: string[],
    parents: object[]
  ) {
    // Handle the various situations where we could get type info for a variable
    // 1. variable is used in a binary expression (e.g. WHERE foo = ?)
    // 2. variable is used in a list expression (e.g. INSERT INTO foo VALUES (?, ?))
    // 3. variable is used in a function call (e.g. SELECT foo(?) FROM bar)
    // 4. variable is used in a table expression (e.g. SELECT * FROM foo(?) AS bar)
    const parentNode = parents[parents.length - 1];
    const parentKey = parentKeys[parentKeys.length - 1];
    if (isBinaryExp(parentNode)) {
      assert(parentKey === "left" || parentKey === "right");
      const otherNode =
        parentKey === "left" ? parentNode.right : parentNode.left;
      // Get type information from otherNode. This assumes that all binary operations
      // use the same types for both arguments, which is mostly the case.
      if (isColumnIdentifier(otherNode)) {
        const selectNode =
          parents.find(isTableStatement) ?? raise("No table statement found");
        addInputField(node, {
          name: otherNode.name,
          ...getTypeFromTable(otherNode.name, selectNode),
        });
      } else if (isLiteralExp(otherNode)) {
        switch (otherNode.variant) {
          case "text":
            addInputField(node, {
              type: "string",
              nullable: true,
            });
            break;
          case "decimal":
          case "hexidecimal":
            addInputField(node, {
              type: "number",
              nullable: true,
            });
            break;
          case "null":
            addInputField(node, {
              type: "unknown",
              nullable: true,
            });
            break;
          default:
            throw new Error(
              "Unexpected literal in binary expression: " + otherNode.variant
            );
        }
      } else {
        throw new Error("Not implemented!");
      }
    } else if (isLimitExpression(parentNode)) {
      const name =
        parentKey === "start"
          ? "limit"
          : parentKey === "offset"
          ? "offset"
          : node.name;
      addInputField(node, {
        name,
        type: "number",
        nullable: false,
      });
    } else if (isListExpression(parentNode)) {
      const grantParentNode = parents[parents.length - 2];
      const grandParentKey = parentKeys[parentKeys.length - 2];

      if (isInsertStatement(grantParentNode) && grandParentKey === "result") {
        const into = grantParentNode.into;
        const index = parentNode.expression.indexOf(node);
        assertEqual(into.type, "identifier");
        if (into.variant === "table") {
          const columns = getTableInfo(into.name);
          const column = columns[index] ?? raise("Missing column");
          addInputField(node, {
            name: column.name,
            type: getType(into.name, column.name),
            nullable: getNullable(into.name, column.name),
          });
        } else if (into.variant === "expression") {
          assertEqual(into.format, "table");
          const column = into.columns[index] ?? raise("Missing column");
          addInputField(node, {
            name: column.name,
            type: getType(into.name, column.name),
            nullable: getNullable(into.name, column.name),
          });
        } else {
          assertNever(into);
        }
      } else if (isFunction(grantParentNode)) {
        // TODO Try to figure out a way to get the function definition and use that
        // to get the types of the arguments.
        addInputField(node);
      } else {
        throw new Error("Unknown list expression parent");
      }
    } else if (isAssignment(parentNode)) {
      assertEqual(parentKey, "value");
      assertEqual(parentNode.target.type, "identifier");
      assertEqual(parentNode.target.variant, "column");
      const tableStmt =
        parents.find(isTableStatement) ?? raise("No table statement found");
      addInputField(node, {
        name: parentNode.target.name,
        ...getTypeFromTable(parentNode.target.name, tableStmt),
      });
    } else {
      // TODO Handle other cases
      addInputField(node);
    }
  }

  function getTableType(tableName: string) {
    const tableList = db.pragma("table_list") as TableListDetails[];

    const tableInfo =
      tableList.find((t) => t.name.toLowerCase() === tableName) ??
      raise("Table not found: " + tableName);
    return tableInfo.type;
  }

  function getTypescriptType({
    column,
    database,
    name,
    table,
    type,
  }: ColumnDefinition): TypescriptField {
    if (!column || !table) {
      if (name.toLowerCase().startsWith("count(")) {
        return {
          name,
          type: "number",
          nullable: false,
        };
      }
      return {
        name,
        type: "unknown",
        nullable: true,
      };
    }
    assertEqual(database, "main");
    return {
      name,
      type: mapType(type),
      nullable: getNullable(table, column),
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
      case null: // SQLite returns this for fts5 and possibly other virtual tables
        return "unknown";
      default:
        throw new Error("Unhandled type: " + type);
    }
  }

  function getTableInfo(table: string): Array<ColumnInfo> {
    const cachedInfo = cachedTableInfo.get(table);
    if (cachedInfo) return cachedInfo;
    const tableInfo = db.pragma(`table_xinfo(${table})`) as ColumnInfo[];
    cachedTableInfo.set(table, tableInfo);
    return tableInfo;
  }

  function getColumnInfo(table: string, column: string) {
    const tableInfo = getTableInfo(table);
    return tableInfo.find(
      (colInfo) => colInfo.name.toLowerCase() === column.toLowerCase()
    );
  }

  function getNullable(table: string, column: string): boolean {
    if (optionalTables.includes(table)) {
      return true;
    }

    const colInfo = getColumnInfo(table, column) ?? raise("Column not found");
    return colInfo.notnull === 0;
  }

  function getTablesFromStatement(
    stmt: SelectStatement | UpdateStatement | DeleteStatement
  ): TableInfo[] {
    const tables: TableInfo[] = [];

    if (isUpdateStatement(stmt)) {
      assert(stmt.into.type === "identifier");
      assert(stmt.into.variant === "table");
      tables.push({
        alias: stmt.into.alias,
        name: stmt.into.name,
        optional: false,
        columns: getTableInfo(stmt.into.name),
      });
    } else if (isSelectStatement(stmt)) {
      if (stmt.from?.type === "identifier" && stmt.from.variant === "table") {
        tables.push({
          alias: stmt.from.alias,
          name: stmt.from.name,
          optional: false,
          columns: getTableInfo(stmt.from.name),
        });
      } else if (stmt.from?.type === "map" && stmt.from.variant === "join") {
        tables.push({
          alias: stmt.from.source.alias,
          name: stmt.from.source.name,
          optional: false,
          columns: getTableInfo(stmt.from.source.name),
        });
        for (const join of stmt.from.map) {
          assertEqual(join.variant, "left join");
          assertEqual(join.source.type, "identifier");
          assertEqual(join.source.variant, "table");
          tables.push({
            alias: join.source.alias,
            name: join.source.name,
            optional: true, // Depends on the join type
            columns: getTableInfo(join.source.name),
          });
        }
      } else if (stmt.from?.type === "function" || stmt.from === undefined) {
        // Nothing to do
      } else {
        assertNever(stmt.from);
      }
    } else if (isDeleteStatement(stmt)) {
      assert(stmt.from.type === "identifier");
      assert(stmt.from.variant === "table");
      tables.push({
        alias: stmt.from.alias,
        name: stmt.from.name,
        optional: false,
        columns: getTableInfo(stmt.from.name),
      });
    } else {
      assertNever(stmt);
    }

    return tables;
  }

  function getTypeFromTable(
    column: string,
    tableStmt: SelectStatement | UpdateStatement | DeleteStatement
  ): { type: string; nullable: boolean } {
    const tables = getTablesFromStatement(tableStmt);
    const [targetDb, targetTable, targetColumn] = getDatabaseAndTable(column);

    if (targetDb) {
      throw new Error(
        "Column specifiers with databases not supported: " + targetDb
      );
    }

    const matchingTables = tables.filter((table) => {
      if (targetTable) {
        return table.alias
          ? table.alias === targetTable
          : table.name === targetTable;
      } else {
        return table.columns.some(
          (col) => col.name.toLowerCase() === targetColumn.toLowerCase()
        );
      }
    });

    if (matchingTables.length === 0) {
      throw new Error("No matching table found for column: " + column);
    } else if (matchingTables.length > 1) {
      throw new Error("Ambiguous column name: " + column);
    }

    const table = matchingTables[0];
    const colInfo =
      table.columns.find(
        (col) => col.name.toLowerCase() === targetColumn.toLowerCase()
      ) ?? raise("Column not found");

    return {
      type: mapType(colInfo.type),
      nullable: colInfo.notnull === 0 || table.optional,
    };
  }

  function getDatabaseAndTable(
    column: string
  ): [string | null, string | null, string] {
    const parts = column.split(".");
    if (parts.length === 1) {
      return [null, null, parts[0]];
    } else if (parts.length === 2) {
      return [null, parts[0], parts[1]];
    } else if (parts.length === 3) {
      return [parts[0], parts[1], parts[2]];
    } else {
      throw new Error("Invalid column name: " + column);
    }
  }

  function getType(table: string, column: string): string {
    const colInfo =
      getColumnInfo(table, column) ??
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

function isVariable(node: unknown): node is Variable {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "variable"
  );
}

function isBinaryExp(node: unknown): node is BinaryExpression {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "expression" &&
    (node as any).format === "binary"
  );
}

function isColumnIdentifier(node: unknown): node is ColumnIdentifier {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "identifier" &&
    (node as any).variant === "column"
  );
}

function isLiteralExp(node: unknown): node is LiteralExpression {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "literal"
  );
}

function isLimitExpression(node: unknown): node is LimitExpression {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "expression" &&
    (node as any).variant === "limit"
  );
}
function isSelectStatement(node: unknown): node is SelectStatement {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "statement" &&
    (node as any).variant === "select"
  );
}
function isUpdateStatement(node: unknown): node is UpdateStatement {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "statement" &&
    (node as any).variant === "update"
  );
}

function isTableStatement(
  node: unknown
): node is SelectStatement | UpdateStatement | DeleteStatement {
  return (
    isSelectStatement(node) ||
    isUpdateStatement(node) ||
    isDeleteStatement(node)
  );
}

function isListExpression(node: unknown): node is ListExpression {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "expression" &&
    (node as any).variant === "list"
  );
}
function isInsertStatement(node: unknown): node is InsertStatement {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "statement" &&
    (node as any).variant === "insert"
  );
}
function isDeleteStatement(node: unknown): node is DeleteStatement {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "statement" &&
    (node as any).variant === "delete"
  );
}
function isFunction(node: unknown): node is FunctionCall {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "function"
  );
}
function isAssignment(node: unknown): node is Assignment {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as any).type === "assignment"
  );
}
