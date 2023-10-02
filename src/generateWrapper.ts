import { QuerySchema } from "./sqlSchema.js";
import { generateArgumentName } from "./util.js";

// Return a string representation of a function that massages the arguments into the correct format
export function generateWrapper(query: string, schema: QuerySchema, execSql: (query: string, schema: QuerySchema) => string): string {
  const args = schema.inputFields.map(generateArgumentName).join(", ");
  return `function(${args}) {
  return (${execSql(query, schema)}).apply(null, arguments);
}`;
}
