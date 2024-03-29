import { generateDts } from "./generateDts.js";
import { describe, it, expect } from "vitest";

describe("generateDts", () => {
  it("should generate empty OutputType", () => {
    expect(
      generateDts({
        inputFields: [],
        outputFields: [],
      })
    ).toMatchInlineSnapshot(`
      "// Auto-generated by vite-plugin-sqlite

      export default async function(): Promise<void>;
      "
    `);
  });
  it("should generate correct OutputType", () => {
    expect(
      generateDts({
        inputFields: [],
        outputFields: [
          {
            name: "id",
            nullable: false,
            type: "string",
          },
          {
            name: "a1",
            nullable: true,
            type: "string",
          },
        ],
      })
    ).toMatchInlineSnapshot(`
      "// Auto-generated by vite-plugin-sqlite
      export type OutputType = {
        id: string;
        a1: string | null;
      }
      export default async function(): Promise<OutputType[]>;
      "
    `);
  });
  it("should generate correct function signature", () => {
    expect(
      generateDts({
        inputFields: [
          {
            name: "id",
            nullable: false,
            type: "string",
            idx: 1,
          },
          {
            name: "a1",
            nullable: true,
            type: "string",
            idx: 2,
          },
        ],
        outputFields: [],
      })
    ).toMatchInlineSnapshot(`
      "// Auto-generated by vite-plugin-sqlite

      export default async function(id: string, a1: string | null): Promise<void>;
      "
    `);
  });
  it("should generate correct function signature with anonymous parameters", () => {
    expect(
      generateDts({
        inputFields: [
          {
            name: "?",
            nullable: false,
            type: "string",
            idx: 1,
          },
        ],
        outputFields: [],
      })
    ).toMatchInlineSnapshot(`
      "// Auto-generated by vite-plugin-sqlite

      export default async function(p1: string): Promise<void>;
      "
    `);
  });
  it("should generate correct function signature with table-prefixed parameters", () => {
    expect(
      generateDts({
        inputFields: [
          {
            name: "foo.id",
            nullable: false,
            type: "string",
            idx: 1,
          },
        ],
        outputFields: [],
      })
    ).toMatchInlineSnapshot(`
      "// Auto-generated by vite-plugin-sqlite

      export default async function(foo_id: string): Promise<void>;
      "
    `);
  });
  it("should generate types with columns with special characters for COUNTs", () => {
    expect(
      generateDts({
        inputFields: [],
        outputFields: [
          {
            name: "COUNT(*)",
            nullable: false,
            type: "number",
          },
        ],
      })
    ).toMatchInlineSnapshot(`
      "// Auto-generated by vite-plugin-sqlite
      export type OutputType = {
        \\"COUNT(*)\\": number;
      }
      export default async function(): Promise<OutputType[]>;
      "
    `);
  });
  it("should generate types with columns with the same name", () => {
    expect(
      generateDts({
        inputFields: [
          {
            name: "id",
            nullable: false,
            type: "string",
            idx: 1,
          },
          {
            name: "id",
            nullable: false,
            type: "string",
            idx: 2,
          },          
        ],
        outputFields: [],
      })
    ).toMatchInlineSnapshot(`
      "// Auto-generated by vite-plugin-sqlite

      export default async function(id1: string, id2: string): Promise<void>;
      "
    `);
  });
  it("should generate types with columns using named parameters", () => {
    expect(
      generateDts({
        inputFields: [
          {
            name: ":id",
            nullable: false,
            type: "string",
            idx: 1,
          },
          {
            name: ":a1",
            nullable: true,
            type: "string",
            idx: 2,
          },
        ],
        outputFields: [],
      })
    ).toMatchInlineSnapshot(`
      "// Auto-generated by vite-plugin-sqlite

      export default async function(args: {id: string, a1: string | null}): Promise<void>;
      "
    `);
  });
  it("should generate types for mixed columns of anonymous and named parameters", () => {
    expect(
      generateDts({
        inputFields: [
          {
            name: "?",
            nullable: true,
            type: "string",
            idx: 1,
          },
          {
            name: ":name",
            nullable: false,
            type: "string",
            idx: 2,
          },
        ],
        outputFields: [],
      })
    ).toMatchInlineSnapshot(`
      "// Auto-generated by vite-plugin-sqlite

      export default async function(p1: string | null, args: {name: string}): Promise<void>;
      "
    `);
  });
});
