/// <reference path="sqlite-parser.d.ts" />
import SQLiteParser from "@appland/sql-parser";
import { assert, assertNever, raise } from "./util.js";
export async function getSchema(queryText, db) {
    const cachedTableInfo = new Map();
    const query = db.prepare(queryText);
    const parsedQuery = SQLiteParser(queryText);
    /** Tables in the query where all of the columns are optional */
    const optionalTables = [];
    /** The input fields to the query such as ? and :foo */
    const inputFields = [];
    await visitQuery(parsedQuery);
    // Use the input field offsets to assign param indices as used by sqlite3_bind_*
    // TODO: This doesn't support explicit indices like ?1 or named params (with duplicates)
    inputFields.sort((a, b) => a.idx - b.idx);
    for (let i = 0; i < inputFields.length; i++) {
        inputFields[i].idx = i + 1;
    }
    const columns = [];
    try {
        // Some queries don't have a result, like INSERT
        columns.push(...query.columns());
    }
    catch (err) { }
    /** Output fields */
    const outputFields = await Promise.all(columns.map(getTypescriptType));
    return {
        inputFields,
        outputFields,
    };
    function addInputField(val, extra = {}) {
        assert(val.type === "variable");
        assert(val.format === "numbered");
        inputFields.push({
            name: extra.name ?? val.name,
            type: extra.type ?? "unknown",
            nullable: extra.nullable ?? true,
            idx: val.location.start.offset,
        });
    }
    async function visitResult(result) {
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
                    addInputField(res);
                    break;
                default:
                    break;
            }
        }
    }
    async function visitBinaryExp(exp, select) {
        // TODO Refactor this to handle more than just AND/OR/= and to handle nested expressions
        assert(exp.type === "expression");
        assert(exp.variant === "operation");
        assert(exp.format === "binary");
        if (exp.operation === "and" || exp.operation === "or") {
            assert(exp.left.type === "expression");
            await visitBinaryExp(exp.left, select);
            assert(exp.right.type === "expression");
            await visitBinaryExp(exp.right, select);
            return;
        }
        assert(exp.operation === "=");
        assert(exp.left.type === "identifier");
        assert(exp.left.variant === "column");
        if (exp.right.type === "variable") {
            assert(select.from?.type === "identifier" && select.from.variant === "table");
            assert(!exp.left.name.includes("."));
            assert(exp.right.name === "?");
            addInputField(exp.right, {
                name: exp.left.name,
                type: await getType(select.from.name, exp.left.name),
                nullable: await getNullable(select.from.name, exp.left.name),
            });
        }
        else if (exp.right.type === "literal" || exp.right.type === "identifier") {
            // Nothing to do here
        }
        else {
            throw new Error("Not implemented!");
        }
    }
    async function visitWhere(where, select) {
        for (const exp of where) {
            await visitBinaryExp(exp, select);
        }
    }
    async function getTableType(tableName) {
        const tableList = (await db.pragma("table_list"));
        const tableInfo = tableList.find((t) => t.name.toLowerCase() === tableName) ??
            raise("Table not found: " + tableName);
        return tableInfo.type;
    }
    async function visitFrom(from) {
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
                        .get(tableName));
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
        }
        else if (from.type === "map" && from.variant === "join") {
            assert(from.map.length === 1);
            const join = from.map[0];
            assert(join.type === "join");
            assert(join.source.type === "identifier" && join.source.variant === "table");
            assert(join.variant === "left join");
            optionalTables.push(join.source.name);
            visitFrom(from.source);
        }
        else if (from.type === "function" && from.variant === "table") {
            assert(from.args.type === "expression");
            assert(from.args.variant === "list");
            for (const arg of from.args.expression) {
                // NOTE We could get better argument names from the function definition
                addInputField(arg);
            }
        }
        else {
            assertNever(from);
        }
    }
    async function visitSelect(statement) {
        assert(statement.type === "statement");
        assert(statement.variant === "select");
        await visitResult(statement.result);
        if (statement.from) {
            await visitFrom(statement.from);
        }
        if (statement.where) {
            await visitWhere(statement.where, statement);
        }
        if (statement.limit) {
            await visitLimit(statement.limit);
        }
    }
    async function visitInsert(statement) {
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
            addInputField(exp, {
                name: column.name,
                type: await getType(into.name, column.name),
                nullable: await getNullable(into.name, column.name),
            });
        }
    }
    function visitLimit(limit) {
        if (limit.start.type === "variable") {
            addInputField(limit.start, {
                name: "limit",
                type: "number",
                nullable: false,
            });
        }
        if (limit.offset?.type === "variable") {
            addInputField(limit.offset, {
                name: "offset",
                type: "number",
                nullable: false,
            });
        }
    }
    function visitQuery(list) {
        assert(list.type === "statement");
        assert(list.variant === "list");
        assert(list.statement.length === 1);
        const statement = list.statement[0];
        assert(statement.type === "statement");
        if (statement.variant === "select") {
            return visitSelect(statement);
        }
        else if (statement.variant === "insert") {
            return visitInsert(statement);
        }
        else if (statement.variant === "create") {
            throw new Error("Not implemented!");
        }
        else {
            assertNever(statement);
        }
    }
    async function getTypescriptType({ column, database, name, table, type, }) {
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
        assert(database === "main");
        return {
            name,
            type: mapType(type),
            nullable: await getNullable(table, column),
        };
    }
    function mapType(type) {
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
    async function getTableInfo(table) {
        const cachedInfo = cachedTableInfo.get(table);
        if (cachedInfo)
            return cachedInfo;
        const tableInfo = (await db.pragma(`table_xinfo(${table})`));
        cachedTableInfo.set(table, tableInfo);
        return tableInfo;
    }
    async function getColumnInfo(table, column) {
        const tableInfo = await getTableInfo(table);
        return tableInfo.find((colInfo) => colInfo.name.toLowerCase() === column.toLowerCase());
    }
    async function getNullable(table, column) {
        if (optionalTables.includes(table)) {
            return true;
        }
        const colInfo = (await getColumnInfo(table, column)) ?? raise("Column not found");
        return colInfo.notnull === 0;
    }
    async function getType(table, column) {
        const colInfo = (await getColumnInfo(table, column)) ??
            raise(`Column "${column}" for table "${table}" not found`);
        return mapType(colInfo.type);
    }
    /** Serialize the model so it can be inserted into the db */
    function toDBRow(val, col) {
        if (val === undefined || val === null) {
            if (!col.nullable) {
                throw new Error("Value for non-nullable column is null");
            }
            return null;
        }
        if (col.type === "Date") {
            if (val instanceof Date) {
                return val.toISOString();
            }
            else {
                throw new Error(`Value for "${col.name}" not a Date`);
            }
        }
        else {
            return val;
        }
    }
    /** Deserialize the model from the db row */
    function fromDBRow(row) {
        const data = {};
        for (const col of columns) {
            const value = row[col.name];
            if (col.type === "DATETIME" && value != null) {
                data[col.name] = new Date(value);
            }
            else if (col.type?.startsWith("BLOB_") && value != null) {
                switch (col.type) {
                    case "BLOB_FLOAT32":
                        data[col.name] = new Float32Array(value.buffer);
                        break;
                    default:
                        throw new Error(`Unhandled BLOB type: ${col.type}`);
                }
            }
            else {
                data[col.name] = value;
            }
        }
        return data;
    }
}
