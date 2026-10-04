export interface ASTNode {
    type: string;
    line: number;
    col: number;
    isIncomplete?: boolean;
}

export interface ProgramNode extends ASTNode {
    type: 'Program';
    body: StatementNode[];
}

export interface VariableDeclNode extends ASTNode {
    type: 'VariableDecl';
    name: string;
    varType: TypeNode;
    initialValue?: ExpressionNode;
}

export interface AssignmentNode extends ASTNode {
    type: 'Assignment';
    name: string;
    value: ExpressionNode;
}

export interface FunctionDeclNode extends ASTNode {
    type: 'FunctionDecl';
    name: string;
    params: ParamNode[];
    returnType: TypeNode;
    body: StatementNode[];
    isAsync?: boolean;
}

export interface EnumDeclNode extends ASTNode {
    type: 'EnumDecl';
    name: string;
    members: string[];
}

export interface InterfaceMethodNode extends ASTNode {
    type: 'InterfaceMethod';
    name: string;
    params: ParamNode[];
    returnType: TypeNode;
}

export interface InterfaceDeclNode extends ASTNode {
    type: 'InterfaceDecl';
    name: string;
    methods: InterfaceMethodNode[];
}

export interface ClassDeclNode extends ASTNode {
    type: 'ClassDecl';
    name: string;
    extends?: string;
    implements?: string[];
    fields: FieldNode[];
    methods: FunctionDeclNode[];
}

export interface IfNode extends ASTNode {
    type: 'If';
    condition: ExpressionNode;
    thenBlock: StatementNode[];
    elseIfClauses: { condition: ExpressionNode; block: StatementNode[] }[];
    elseBlock?: StatementNode[];
}

export interface ForLoopNode extends ASTNode {
    type: 'ForLoop';
    variable: string;
    from: ExpressionNode;
    to: ExpressionNode;
    step?: ExpressionNode;
    body: StatementNode[];
}

export interface ForEachNode extends ASTNode {
    type: 'ForEach';
    variable: string;
    iterable: ExpressionNode;
    body: StatementNode[];
}

export interface WhileNode extends ASTNode {
    type: 'While';
    condition: ExpressionNode;
    body: StatementNode[];
}

export interface TryCatchNode extends ASTNode {
    type: 'TryCatch';
    tryBlock: StatementNode[];
    catchClauses: { errorName: string; errorType: TypeNode; block: StatementNode[] }[];
    finallyBlock?: StatementNode[];
}

export interface ReturnNode extends ASTNode {
    type: 'Return';
    value?: ExpressionNode;
}

export interface PrintNode extends ASTNode {
    type: 'Print';
    value: ExpressionNode;
}

export interface ImportNode extends ASTNode {
    type: 'Import';
    module: string;
    alias?: string;
}

export interface CommentNode extends ASTNode {
    type: 'Comment';
    text: string;
}

export interface RawCodeNode extends ASTNode {
    type: 'RawCode';
    language: string;
    code: string;
}

export interface AssertNode extends ASTNode {
    type: 'Assert';
    condition: ExpressionNode;
    message?: ExpressionNode;
}

export interface AppendNode extends ASTNode {
    type: 'Append';
    value: ExpressionNode;
    target: ExpressionNode;
}

export interface FilterNode extends ASTNode {
    type: 'Filter';
    target: ExpressionNode;
    condition: ExpressionNode;
}

export interface SortNode extends ASTNode {
    type: 'Sort';
    target: ExpressionNode;
    by: ExpressionNode;
    order: 'ASC' | 'DESC';
}

export interface MapOperationNode extends ASTNode {
    type: 'MapOperation';
    target: ExpressionNode;
    using: ExpressionNode;
}

export interface ReduceNode extends ASTNode {
    type: 'Reduce';
    target: ExpressionNode;
    operation: ExpressionNode;
    initial: ExpressionNode;
}

// Expression Nodes
export interface BinaryExprNode extends ASTNode {
    type: 'BinaryExpr';
    operator: string;
    left: ExpressionNode;
    right: ExpressionNode;
}

export interface UnaryExprNode extends ASTNode {
    type: 'UnaryExpr';
    operator: string;
    operand: ExpressionNode;
}

export interface LiteralNode extends ASTNode {
    type: 'Literal';
    valueType: 'Int' | 'Float' | 'String' | 'Bool' | 'Null';
    value: any;
}

export interface IdentifierNode extends ASTNode {
    type: 'Identifier';
    name: string;
}

export interface FunctionCallNode extends ASTNode {
    type: 'FunctionCall';
    name: string;
    args: ExpressionNode[];
}

export interface MethodCallNode extends ASTNode {
    type: 'MethodCall';
    target: ExpressionNode;
    methodName: string;
    args: ExpressionNode[];
}

export interface ListLiteralNode extends ASTNode {
    type: 'ListLiteral';
    elements: ExpressionNode[];
}

export interface MapLiteralNode extends ASTNode {
    type: 'MapLiteral';
    entries: { key: ExpressionNode; value: ExpressionNode }[];
}

export interface LambdaNode extends ASTNode {
    type: 'Lambda';
    params: ParamNode[];
    body: ExpressionNode | StatementNode[];
}

export interface TernaryNode extends ASTNode {
    type: 'Ternary';
    condition: ExpressionNode;
    trueExpr: ExpressionNode;
    falseExpr: ExpressionNode;
}

export interface CastNode extends ASTNode {
    type: 'Cast';
    expr: ExpressionNode;
    targetType: TypeNode;
}

export interface NewObjectNode extends ASTNode {
    type: 'NewObject';
    className: string;
    args: ExpressionNode[];
}

export interface MemberAccessNode extends ASTNode {
    type: 'MemberAccess';
    target: ExpressionNode;
    member: string;
}

export interface TypeNode extends ASTNode {
    type: 'Type';
    kind: string; // e.g., 'Int', 'Float', 'String', 'List', 'Map', 'Identifier'
    name: string;
    typeArgs?: TypeNode[];
}

export interface ParamNode extends ASTNode {
    type: 'Param';
    name: string;
    paramType: TypeNode;
}

export interface FieldNode extends ASTNode {
    type: 'Field';
    name: string;
    fieldType: TypeNode;
    defaultValue?: ExpressionNode;
}

export interface SymbolEntry {
    name: string;
    type: TypeNode;
    scope: string;
    scopeId: number;
    isMutable: boolean;
    declaredAtLine: number;
}

export interface AwaitExprNode extends ASTNode {
    type: 'AwaitExpr';
    expr: ExpressionNode;
}

export type StatementNode = 
    | VariableDeclNode
    | AssignmentNode
    | FunctionDeclNode
    | ClassDeclNode
    | EnumDeclNode
    | InterfaceDeclNode
    | IfNode
    | ForLoopNode
    | ForEachNode
    | WhileNode
    | TryCatchNode
    | ReturnNode
    | PrintNode
    | ImportNode
    | CommentNode
    | RawCodeNode
    | AssertNode
    | AppendNode
    | FilterNode
    | SortNode
    | MapOperationNode
    | ReduceNode
    | ExpressionNode; // Expressions can be statements in some contexts

export type ExpressionNode = 
    | BinaryExprNode
    | UnaryExprNode
    | LiteralNode
    | IdentifierNode
    | FunctionCallNode
    | MethodCallNode
    | ListLiteralNode
    | MapLiteralNode
    | LambdaNode
    | TernaryNode
    | CastNode
    | NewObjectNode
    | MemberAccessNode
    | AwaitExprNode;

export interface DiagnosticError {
    message: string;
    line: number;
    col: number;
    severity: 'error' | 'warning';
}

export interface ParseResult {
    program: ProgramNode;
    errors: DiagnosticError[];
    symbolTable: Map<string, SymbolEntry[]>;
}
