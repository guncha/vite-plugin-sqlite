/// <reference path="../src/sqlite-parser.d.ts" />
import { Database } from "better-sqlite3";
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
export declare function getSchema(queryText: string, db: Database): Promise<QuerySchema>;
