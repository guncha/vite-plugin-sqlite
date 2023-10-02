import { describe, it, expect } from "vitest";
import { generateWrapper } from "./generateWrapper.js";

describe("generateWrapper", () => {
  it("should generate a function that directly calls the provided function", () => {
    expect(
      generateWrapper("SELECT * FROM a WHERE id = ?", {
        inputFields: [{
          name: "id",
          nullable: false,
          type: "string",
          idx: 1,
        }],
        outputFields: [],
      }, () => "executeQuery")
    ).toMatchInlineSnapshot(`
      "function(id) {
        return (executeQuery).apply(null, arguments);
      }"
    `);
  });
});