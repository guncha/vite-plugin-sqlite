declare module "@appland/sql-parser" {
  export type Identifier = TableIdentifier | ColumnIdentifier | StarIdentifier | ViewIdentifier;
  export type Expression = BinaryExpression;
  export type Variable = NumberedVariable;

  export interface StatementList {
    type: "statement";
    variant: "list";
    statement: Array<SelectStatement | CreateStatement | InsertStatement>;
  }

  export interface BinaryExpression {
    type: "expression";
    variant: "operation",
    format: "binary";
    operation: "=";
    left: Identifier | Variable;
    right: Identifier | Variable;
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
    into: ExpressionIdentifier;
    result: ListExpression[];
  }

  export interface Join {
    type: "join",
    variant: "left join",
    source: TableIdentifier,
    constraint: unknown,
  };

  export interface JoinMap {
    type: "map",
    variant: "join",
    source: TableIdentifier,
    map: Join[],
  }

  export interface ListExpression {
    type: "expression";
    variant: "list";
    expression: Variable[];
  }

  export interface SelectStatement {
    type: "statement";
    variant: "select";
    result: Array<ColumnIdentifier | StarIdentifier | Variable>;
    from?: TableIdentifier | JoinMap;
    where?: Array<Expression>;
  }

  export interface TableIdentifier {
    type: "identifier";
    variant: "table";
    name: string;
  }

  export interface ColumnIdentifier {
    type: "identifier";
    variant: "column";
    name: string;
  }

  export interface ExpressionIdentifier {
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

  export interface NumberedVariable {
    type: "variable";
    format: "numbered";
    name: string;
  }

  function parse(sql): StatementList {}

  export = parse;
}
