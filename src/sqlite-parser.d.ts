declare module "@appland/sql-parser" {
  export type Identifier =
    | TableIdentifier
    | ColumnIdentifier
    | StarIdentifier
    | ViewIdentifier;

  export type Expression =
    | BinaryExpression
    | LiteralExpression
    | Identifier
    | Variable
    | ListExpression;

  export type Variable = NumberedVariable | NamedVariable;

  export interface StatementList {
    type: "statement";
    variant: "list";
    statement: Array<SelectStatement | CreateStatement | InsertStatement | UpdateStatement>;
  }

  export interface LiteralExpression {
    type: "literal";
    variant: "blob" | "decimal" | "hexidecimal" | "null" | "text";
    value: string;
  }

  export interface BinaryExpression {
    type: "expression";
    variant: "operation";
    format: "binary";
    operation:
      | "*"
      | "+"
      | "-"
      | "and"
      | "="
      | "<="
      | "||"
      | ">="
      | ">"
      | "|"
      | "&"
      | "<>"
      | "<"
      | "<=~"
      | "in"
      | "<>~"
      | "/"
      | "or"
      | "=~"
      | "between"
      | "not between"
      | "=="
      | ">=+~"
      | "not in"
      | ">=~"
      | "%"
      | "!="
      | "<~"
      | "is"
      | "like"
      | "not"
      | "~"
      | "not exists"
      | "exists"
      | ">~"
      | "<~+"
      | "collate"
      | "glob"
      | "<+~"
      | "<<"
      | "<=+~"
      | "distinct"
      | "is not"
      | "match"
      | "not like"
      | "ilike"
      | "regexp"
      | "not glob"
      | "->>"
      | "<->";
    left: Expression;
    right: Expression;
  }

  export interface CreateStatement {
    type: "statement";
    variant: "create";
    format: "view";
    target: ViewIdentifier;
    result: SelectStatement;
  }

  export interface InsertStatement {
    type: "statement";
    variant: "insert";
    action: "insert";
    into: TableIdentifier | TableExpressionIdentifier;
    result: ListExpression[];
  }

  export interface UpdateStatement {
    type: "statement";
    variant: "update";
    into: TableIdentifier | TableExpressionIdentifier;
    set: Assignment[];
    where?: Array<Expression>;
  }

  export interface Assignment {
    type: "assignment";
    target: ColumnIdentifier;
    value: Expression;
  }

  export interface Join {
    type: "join";
    variant:
      | "join"
      | "table"
      | "cross join"
      | "left join"
      | "natural join"
      | "natural left join"
      | "inner join"
      | "left outer join"
      | "natural cross join"
      | "natural inner join"
      | "natural left outer join";
    source: TableIdentifier;
    constraint: unknown;
  }

  export interface JoinMap {
    type: "map";
    variant: "join";
    source: TableIdentifier;
    map: Join[];
  }

  export interface ListExpression {
    type: "expression";
    variant: "list";
    expression: Variable[];
  }

  export interface FunctionIdentifier {
    type: "identifier";
    variant: "function";
    name: string;
  }

  export interface FunctionCall {
    type: "function";
    variant?: "table";
    name: FunctionIdentifier;
    args: ListExpression;
  }

  export interface SelectStatement {
    type: "statement";
    variant: "select";
    result: Array<ColumnIdentifier | StarIdentifier | Variable>;
    from?: TableIdentifier | JoinMap | FunctionCall;
    where?: Array<Expression>;
    limit?: LimitExpression;
  }

  export interface TableIdentifier {
    type: "identifier";
    variant: "table";
    name: string;
    alias?: string;
  }

  export interface ColumnIdentifier {
    type: "identifier";
    variant: "column";
    name: string;
  }

  export interface TableExpressionIdentifier {
    type: "identifier";
    variant: "expression";
    format: "table";
    name: string;
    columns: Array<ColumnIdentifier>;
  }

  export interface StarIdentifier {
    type: "identifier";
    variant: "star";
    name: "*";
  }

  export interface ViewIdentifier {
    type: "identifier";
    variant: "view";
    name: string;
  }

  interface Location {
    start: {
      offset: number;
      line: number;
      column: number;
    };
    end: {
      offset: number;
      line: number;
      column: number;
    };
  }

  export interface NumberedVariable {
    type: "variable";
    format: "numbered";
    name: string;
    location: Location;
  }

  export interface NamedVariable {
    type: "variable";
    format: "named" | "tcl";
    name: string;
    location: Location;
  }

  export interface LimitExpression {
    type: "expression";
    variant: "limit";
    start: Expression;
    offset?: Expression;
  }

  function parse(sql: string): StatementList;

  export default parse;
}
