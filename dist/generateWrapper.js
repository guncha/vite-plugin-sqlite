import { generateArgumentName } from "./util.js";
// Return a string representation of a function that massages the arguments into the correct format
export function generateWrapper(query, schema, execSql) {
    // Create a set of all parameters that have duplicate names
    const duplicateNames = new Set();
    for (const field of schema.inputFields) {
        if (schema.inputFields.filter((f) => f.name === field.name).length > 1) {
            duplicateNames.add(field.name);
        }
    }
    const args = schema.inputFields.map(p => generateArgumentName(p, duplicateNames.has(p.name))).join(", ");
    return `function(${args}) {
  return (${execSql(query, schema)}).apply(null, arguments);
}`;
}
