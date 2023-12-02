import { describe, it, expect } from "vitest";
import { generateArgumentName } from "./util.js";
describe("generateArgumentName", () => {
    it("should generate argument names for anonymous arguments", () => {
        expect(generateArgumentName({
            name: "?",
            nullable: false,
            type: "string",
            idx: 0,
        })).toEqual("p0");
        expect(generateArgumentName({
            name: "?",
            nullable: false,
            type: "string",
            idx: 1,
        }, true)).toEqual("p1");
    });
    it("should generate argument name with suffix index", () => {
        expect(generateArgumentName({
            name: "id",
            nullable: false,
            type: "string",
            idx: 1,
        }, true)).toEqual("id1");
    });
    it("should generate argument name without suffix index", () => {
        expect(generateArgumentName({
            name: "name",
            nullable: true,
            type: "string",
            idx: 2,
        })).toEqual("name");
    });
    it("should replace special characters with underscore", () => {
        expect(generateArgumentName({
            name: "foo-bar",
            nullable: false,
            type: "string",
            idx: 3,
        })).toEqual("foo_bar");
    });
    it("should strip named argument prefixes", () => {
        expect(generateArgumentName({
            name: "$id",
            nullable: false,
            type: "string",
            idx: 4,
        })).toEqual("id");
        expect(generateArgumentName({
            name: ":id",
            nullable: false,
            type: "string",
            idx: 5,
        })).toEqual("id");
        expect(generateArgumentName({
            name: "@id",
            nullable: false,
            type: "string",
            idx: 6,
        })).toEqual("id");
    });
});
