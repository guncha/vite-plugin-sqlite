import { QuerySchema } from "./sqlSchema.js";
import { generateArgumentName } from "./util.js";

// Return a string representation of a function that massages the arguments into the correct format
export function generateWrapper(query: string, schema: QuerySchema, execSql: (query: string, schema: QuerySchema) => string): string {
  // Create a set of all parameters that have duplicate names
  const duplicateNames = new Set<string>();
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
