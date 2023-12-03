/// <reference path="sqlite-parser.d.ts" />
import SQLiteParser from "@appland/sql-parser";
import { assert, assertEqual, assertNever, raise } from "./util.js";
export function getSchema(queryText, db) {
    const cachedTableInfo = new Map();
    const query = db.prepare(queryText);
    const parsedQuery = SQLiteParser(queryText);
    /** Tables in the query where all of the columns are optional */
    const optionalTables = [];
    const lastStmt = parsedQuery.statement[parsedQuery.statement.length - 1];
    if (isSelectStatement(lastStmt)) {
        for (const table of getTablesFromStatement(lastStmt)) {
            if (table.optional) {
                optionalTables.push(table.name);
            }
        }
    }
    /** The input fields to the query such as ? and :foo */
    const inputFields = [];
    visitNode(parsedQuery, [], []);
    // Use the input field offsets to assign param indices as used by sqlite3_bind_*
    // TODO: This doesn't support explicit indices like ?1, ?2, etc.
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
    const outputFields = columns.map(getTypescriptType);
    return {
        inputFields,
        outputFields,
    };
    function addInputField(val, extra = {}) {
        assertEqual(val.type, "variable");
        // Try to extract the preceding JSDoc comment, if any, and look for @type {Foo} or @type {Foo|null}
        const queryPrefix = queryText.slice(0, val.location.start.offset);
        const [_, type, orNull] = queryPrefix.match(/\/\*\*\s*@type\s+{\s*([\w_]+)\s*(\|\s*null)?\s*}\s*\*\/\s*$/) ?? [];
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
    function visitNode(node, keys, parents) {
        if (isVariable(node)) {
            visitVariable(node, keys, parents);
        }
        else {
            parents.push(node);
            for (const key of Object.keys(node)) {
                const child = node[key];
                keys.push(key);
                if (child && typeof child === "object") {
                    if (Array.isArray(child)) {
                        for (const item of child) {
                            visitNode(item, keys, parents);
                        }
                    }
                    else {
                        visitNode(child, keys, parents);
                    }
                }
                keys.pop();
            }
            parents.pop();
        }
    }
    function visitVariable(node, parentKeys, parents) {
        // Handle the various situations where we could get type info for a variable
        // 1. variable is used in a binary expression (e.g. WHERE foo = ?)
        // 2. variable is used in a list expression (e.g. INSERT INTO foo VALUES (?, ?))
        // 3. variable is used in a function call (e.g. SELECT foo(?) FROM bar)
        // 4. variable is used in a table expression (e.g. SELECT * FROM foo(?) AS bar)
        const parentNode = parents[parents.length - 1];
        const parentKey = parentKeys[parentKeys.length - 1];
        if (isBinaryExp(parentNode)) {
            assert(parentKey === "left" || parentKey === "right");
            const otherNode = parentKey === "left" ? parentNode.right : parentNode.left;
            // Get type information from otherNode. This assumes that all binary operations
            // use the same types for both arguments, which is mostly the case.
            if (isColumnIdentifier(otherNode)) {
                const selectNode = parents.find(isTableStatement) ?? raise("No table statement found");
                addInputField(node, {
                    name: otherNode.name,
                    ...getTypeFromTable(otherNode.name, selectNode),
                });
            }
            else if (isLiteralExp(otherNode)) {
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
                        throw new Error("Unexpected literal in binary expression: " + otherNode.variant);
                }
            }
            else {
                throw new Error("Not implemented!");
            }
        }
        else if (isLimitExpression(parentNode)) {
            const name = parentKey === "start"
                ? "limit"
                : parentKey === "offset"
                    ? "offset"
                    : node.name;
            addInputField(node, {
                name,
                type: "number",
                nullable: false,
            });
        }
        else if (isListExpression(parentNode)) {
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
                }
                else if (into.variant === "expression") {
                    assertEqual(into.format, "table");
                    const column = into.columns[index] ?? raise("Missing column");
                    addInputField(node, {
                        name: column.name,
                        type: getType(into.name, column.name),
                        nullable: getNullable(into.name, column.name),
                    });
                }
                else {
                    assertNever(into);
                }
            }
            else if (isFunction(grantParentNode)) {
                // TODO Try to figure out a way to get the function definition and use that
                // to get the types of the arguments.
                addInputField(node);
            }
            else {
                throw new Error("Unknown list expression parent");
            }
        }
        else if (isAssignment(parentNode)) {
            assertEqual(parentKey, "value");
            assertEqual(parentNode.target.type, "identifier");
            assertEqual(parentNode.target.variant, "column");
            const tableStmt = parents.find(isTableStatement) ?? raise("No table statement found");
            addInputField(node, {
                name: parentNode.target.name,
                ...getTypeFromTable(parentNode.target.name, tableStmt),
            });
        }
        else {
            // TODO Handle other cases
            addInputField(node);
        }
    }
    function getTableType(tableName) {
        const tableList = db.pragma("table_list");
        const tableInfo = tableList.find((t) => t.name.toLowerCase() === tableName) ??
            raise("Table not found: " + tableName);
        return tableInfo.type;
    }
    function getTypescriptType({ column, database, name, table, type, }) {
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
    function getTableInfo(table) {
        const cachedInfo = cachedTableInfo.get(table);
        if (cachedInfo)
            return cachedInfo;
        const tableInfo = db.pragma(`table_xinfo(${table})`);
        cachedTableInfo.set(table, tableInfo);
        return tableInfo;
    }
    function getColumnInfo(table, column) {
        const tableInfo = getTableInfo(table);
        return tableInfo.find((colInfo) => colInfo.name.toLowerCase() === column.toLowerCase());
    }
    function getNullable(table, column) {
        if (optionalTables.includes(table)) {
            return true;
        }
        const colInfo = getColumnInfo(table, column) ?? raise("Column not found");
        return colInfo.notnull === 0;
    }
    function getTablesFromStatement(stmt) {
        const tables = [];
        if (isUpdateStatement(stmt)) {
            assert(stmt.into.type === "identifier");
            assert(stmt.into.variant === "table");
            tables.push({
                alias: stmt.into.alias,
                name: stmt.into.name,
                optional: false,
                columns: getTableInfo(stmt.into.name),
            });
        }
        else if (isSelectStatement(stmt)) {
            if (stmt.from?.type === "identifier" && stmt.from.variant === "table") {
                tables.push({
                    alias: stmt.from.alias,
                    name: stmt.from.name,
                    optional: false,
                    columns: getTableInfo(stmt.from.name),
                });
            }
            else if (stmt.from?.type === "map" && stmt.from.variant === "join") {
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
                        optional: true,
                        columns: getTableInfo(join.source.name),
                    });
                }
            }
            else if (stmt.from?.type === "function" || stmt.from === undefined) {
                // Nothing to do
            }
            else {
                assertNever(stmt.from);
            }
        }
        else if (isDeleteStatement(stmt)) {
            assert(stmt.from.type === "identifier");
            assert(stmt.from.variant === "table");
            tables.push({
                alias: stmt.from.alias,
                name: stmt.from.name,
                optional: false,
                columns: getTableInfo(stmt.from.name),
            });
        }
        else {
            assertNever(stmt);
        }
        return tables;
    }
    function getTypeFromTable(column, tableStmt) {
        const tables = getTablesFromStatement(tableStmt);
        const [targetDb, targetTable, targetColumn] = getDatabaseAndTable(column);
        if (targetDb) {
            throw new Error("Column specifiers with databases not supported: " + targetDb);
        }
        const matchingTables = tables.filter((table) => {
            if (targetTable) {
                return table.alias
                    ? table.alias === targetTable
                    : table.name === targetTable;
            }
            else {
                return table.columns.some((col) => col.name.toLowerCase() === targetColumn.toLowerCase());
            }
        });
        if (matchingTables.length === 0) {
            throw new Error("No matching table found for column: " + column);
        }
        else if (matchingTables.length > 1) {
            throw new Error("Ambiguous column name: " + column);
        }
        const table = matchingTables[0];
        const colInfo = table.columns.find((col) => col.name.toLowerCase() === targetColumn.toLowerCase()) ?? raise("Column not found");
        return {
            type: mapType(colInfo.type),
            nullable: colInfo.notnull === 0 || table.optional,
        };
    }
    function getDatabaseAndTable(column) {
        const parts = column.split(".");
        if (parts.length === 1) {
            return [null, null, parts[0]];
        }
        else if (parts.length === 2) {
            return [null, parts[0], parts[1]];
        }
        else if (parts.length === 3) {
            return [parts[0], parts[1], parts[2]];
        }
        else {
            throw new Error("Invalid column name: " + column);
        }
    }
    function getType(table, column) {
        const colInfo = getColumnInfo(table, column) ??
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
function isVariable(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "variable");
}
function isBinaryExp(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "expression" &&
        node.format === "binary");
}
function isColumnIdentifier(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "identifier" &&
        node.variant === "column");
}
function isLiteralExp(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "literal");
}
function isLimitExpression(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "expression" &&
        node.variant === "limit");
}
function isSelectStatement(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "statement" &&
        node.variant === "select");
}
function isUpdateStatement(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "statement" &&
        node.variant === "update");
}
function isTableStatement(node) {
    return (isSelectStatement(node) ||
        isUpdateStatement(node) ||
        isDeleteStatement(node));
}
function isListExpression(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "expression" &&
        node.variant === "list");
}
function isInsertStatement(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "statement" &&
        node.variant === "insert");
}
function isDeleteStatement(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "statement" &&
        node.variant === "delete");
}
function isFunction(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "function");
}
function isAssignment(node) {
    return (typeof node === "object" &&
        node !== null &&
        node.type === "assignment");
}
