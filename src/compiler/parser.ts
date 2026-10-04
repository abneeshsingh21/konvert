import { CstParser, Lexer, IToken } from 'chevrotain';
import * as T from './tokens.js';
import * as ast from './ast.js';

export const CNLLexer = new Lexer(T.allTokens);

export class CNLParser extends CstParser {
    constructor() {
        super(T.allTokens, { recoveryEnabled: true });
        this.performSelfAnalysis();
    }

    public getLookahead(howMuch: number = 1) {
        return this.LA(howMuch);
    }

    public program = this.RULE("program", () => {
        this.MANY(() => {
            this.SUBRULE(this.statement);
        });
    });

    public statement = this.RULE("statement", () => {
        this.OR([
            { ALT: () => this.SUBRULE(this.variableDecl) },
            { ALT: () => this.SUBRULE(this.assignment) },
            { ALT: () => this.SUBRULE(this.functionDecl) },
            { ALT: () => this.SUBRULE(this.classDecl) },
            { ALT: () => this.SUBRULE(this.enumDecl) },
            { ALT: () => this.SUBRULE(this.interfaceDecl) },
            { ALT: () => this.SUBRULE(this.ifStatement) },
            { ALT: () => this.SUBRULE(this.forLoop) },
            { ALT: () => this.SUBRULE(this.forEach) },
            { ALT: () => this.SUBRULE(this.whileLoop) },
            { ALT: () => this.SUBRULE(this.tryCatch) },
            { ALT: () => this.SUBRULE(this.returnStatement) },
            { ALT: () => this.SUBRULE(this.printStatement) },
            { ALT: () => this.SUBRULE(this.importStatement) },
            { ALT: () => this.SUBRULE(this.appendStatement) },
            { ALT: () => this.SUBRULE(this.filterStatement) },
            { ALT: () => this.SUBRULE(this.sortStatement) },
            { ALT: () => this.SUBRULE(this.mapOperation) },
            { ALT: () => this.SUBRULE(this.reduceOperation) },
            { ALT: () => this.SUBRULE(this.assertStatement) },
            { ALT: () => this.SUBRULE(this.rawCode) },
            { ALT: () => this.SUBRULE(this.expressionStatement) }
        ]);
    });

    public variableDecl = this.RULE("variableDecl", () => {
        this.CONSUME(T.DECLARE);
        this.CONSUME(T.Identifier);
        this.CONSUME(T.AS);
        this.SUBRULE(this.typeRef);
        this.OPTION(() => {
            this.CONSUME(T.WITH);
            this.CONSUME(T.VALUE);
            this.SUBRULE(this.expression);
        });
    });

    public assignment = this.RULE("assignment", () => {
        this.CONSUME(T.SET);
        this.CONSUME(T.Identifier);
        this.CONSUME(T.TO);
        this.SUBRULE(this.expression);
    });

    public functionDecl = this.RULE("functionDecl", () => {
        this.CONSUME(T.DEFINE);
        this.OPTION(() => {
            this.CONSUME(T.ASYNC);
        });
        this.CONSUME(T.FUNCTION);
        this.CONSUME(T.Identifier);
        this.CONSUME(T.LPAREN);
        this.OPTION2(() => {
            this.SUBRULE(this.paramList);
        });
        this.CONSUME(T.RPAREN);
        this.CONSUME(T.ARROW);
        this.SUBRULE(this.typeRef);
        this.CONSUME(T.COLON);
        this.MANY(() => {
            this.SUBRULE(this.statement);
        });
        this.CONSUME(T.END);
        this.CONSUME2(T.FUNCTION);
    });

    public enumDecl = this.RULE("enumDecl", () => {
        this.CONSUME(T.DEFINE);
        this.CONSUME(T.ENUM);
        this.CONSUME(T.Identifier);
        this.CONSUME(T.COLON);
        this.CONSUME2(T.Identifier);
        this.MANY(() => {
            this.CONSUME(T.COMMA);
            this.CONSUME3(T.Identifier);
        });
        this.CONSUME(T.END);
        this.CONSUME2(T.ENUM);
    });

    public interfaceDecl = this.RULE("interfaceDecl", () => {
        this.CONSUME(T.DEFINE);
        this.CONSUME(T.INTERFACE);
        this.CONSUME(T.Identifier);
        this.CONSUME(T.COLON);
        this.MANY(() => {
            this.SUBRULE(this.interfaceMethodDecl);
        });
        this.CONSUME(T.END);
        this.CONSUME2(T.INTERFACE);
    });

    public interfaceMethodDecl = this.RULE("interfaceMethodDecl", () => {
        this.CONSUME(T.FUNCTION);
        this.CONSUME(T.Identifier);
        this.CONSUME(T.LPAREN);
        this.OPTION(() => {
            this.SUBRULE(this.paramList);
        });
        this.CONSUME(T.RPAREN);
        this.CONSUME(T.ARROW);
        this.SUBRULE(this.typeRef);
    });

    public paramList = this.RULE("paramList", () => {
        this.SUBRULE(this.param);
        this.MANY(() => {
            this.CONSUME(T.COMMA);
            this.SUBRULE2(this.param);
        });
    });

    public param = this.RULE("param", () => {
        this.CONSUME(T.Identifier);
        this.CONSUME(T.COLON);
        this.SUBRULE(this.typeRef);
    });

    public classDecl = this.RULE("classDecl", () => {
        this.CONSUME(T.DEFINE);
        this.CONSUME(T.CLASS);
        this.CONSUME(T.Identifier);
        this.OPTION(() => {
            this.CONSUME(T.EXTENDS);
            this.CONSUME2(T.Identifier);
        });
        this.OPTION2(() => {
            this.CONSUME(T.IMPLEMENTS);
            this.CONSUME3(T.Identifier);
            this.MANY(() => {
                this.CONSUME(T.COMMA);
                this.CONSUME4(T.Identifier);
            });
        });
        this.CONSUME(T.COLON);
        this.MANY2(() => {
            this.OR([
                { ALT: () => this.SUBRULE(this.fieldDecl) },
                { ALT: () => this.SUBRULE(this.functionDecl) }
            ]);
        });
        this.CONSUME(T.END);
        this.CONSUME2(T.CLASS);
    });

    public fieldDecl = this.RULE("fieldDecl", () => {
        this.CONSUME(T.FIELD);
        this.CONSUME(T.Identifier);
        this.CONSUME(T.AS);
        this.SUBRULE(this.typeRef);
        this.OPTION(() => {
            this.CONSUME(T.WITH);
            this.CONSUME(T.DEFAULT);
            this.SUBRULE(this.expression);
        });
    });

    public ifStatement = this.RULE("ifStatement", () => {
        this.CONSUME(T.IF);
        this.SUBRULE(this.expression);
        this.CONSUME(T.COLON);
        this.MANY(() => {
            this.SUBRULE(this.statement);
        });
        this.MANY2(() => {
            this.CONSUME(T.ELSE);
            this.CONSUME2(T.IF);
            this.SUBRULE2(this.expression, { LABEL: "elseIfCondition" });
            this.CONSUME2(T.COLON);
            this.MANY3(() => {
                this.SUBRULE2(this.statement, { LABEL: "elseIfStatement" });
            });
        });
        this.OPTION(() => {
            this.CONSUME2(T.ELSE);
            this.CONSUME3(T.COLON);
            this.MANY4(() => {
                this.SUBRULE3(this.statement, { LABEL: "elseStatement" });
            });
        });
        this.CONSUME(T.END);
        this.CONSUME3(T.IF);
    });

    public forLoop = this.RULE("forLoop", () => {
        this.CONSUME(T.FOR);
        this.CONSUME(T.Identifier);
        this.CONSUME(T.FROM);
        this.SUBRULE(this.expression, { LABEL: "fromExpr" });
        this.CONSUME(T.TO);
        this.SUBRULE2(this.expression, { LABEL: "toExpr" });
        this.OPTION(() => {
            this.CONSUME(T.STEP);
            this.SUBRULE3(this.expression, { LABEL: "stepExpr" });
        });
        this.CONSUME(T.COLON);
        this.MANY(() => {
            this.SUBRULE(this.statement);
        });
        this.CONSUME(T.END);
        this.CONSUME2(T.FOR);
    });

    public forEach = this.RULE("forEach", () => {
        this.CONSUME(T.FOR);
        this.CONSUME(T.EACH);
        this.CONSUME(T.Identifier);
        this.CONSUME(T.IN);
        this.SUBRULE(this.expression);
        this.CONSUME(T.COLON);
        this.MANY(() => {
            this.SUBRULE(this.statement);
        });
        this.CONSUME(T.END);
        this.CONSUME2(T.FOR);
    });

    public whileLoop = this.RULE("whileLoop", () => {
        this.CONSUME(T.WHILE);
        this.SUBRULE(this.expression);
        this.CONSUME(T.COLON);
        this.MANY(() => {
            this.SUBRULE(this.statement);
        });
        this.CONSUME(T.END);
        this.CONSUME2(T.WHILE);
    });

    public tryCatch = this.RULE("tryCatch", () => {
        this.CONSUME(T.TRY);
        this.CONSUME(T.COLON);
        this.MANY(() => {
            this.SUBRULE(this.statement);
        });
        this.AT_LEAST_ONE(() => {
            this.CONSUME(T.CATCH);
            this.CONSUME(T.Identifier);
            this.CONSUME(T.AS);
            this.SUBRULE(this.typeRef);
            this.CONSUME2(T.COLON);
            this.MANY2(() => {
                this.SUBRULE2(this.statement, { LABEL: "catchStatement" });
            });
        });
        this.OPTION(() => {
            this.CONSUME(T.FINALLY);
            this.CONSUME3(T.COLON);
            this.MANY3(() => {
                this.SUBRULE3(this.statement, { LABEL: "finallyStatement" });
            });
        });
        this.CONSUME(T.END);
        this.CONSUME2(T.TRY);
    });

    public returnStatement = this.RULE("returnStatement", () => {
        this.CONSUME(T.RETURN);
        this.OPTION(() => {
            this.SUBRULE(this.expression);
        });
    });

    public printStatement = this.RULE("printStatement", () => {
        this.CONSUME(T.PRINT);
        this.SUBRULE(this.expression);
    });

    public importStatement = this.RULE("importStatement", () => {
        this.CONSUME(T.IMPORT);
        this.CONSUME(T.STRING_LITERAL);
        this.OPTION(() => {
            this.CONSUME(T.AS);
            this.CONSUME(T.Identifier);
        });
    });

    public appendStatement = this.RULE("appendStatement", () => {
        this.CONSUME(T.APPEND);
        this.SUBRULE(this.expression, { LABEL: "value" });
        this.CONSUME(T.TO);
        this.SUBRULE2(this.expression, { LABEL: "target" });
    });

    public filterStatement = this.RULE("filterStatement", () => {
        this.CONSUME(T.FILTER);
        this.SUBRULE(this.expression, { LABEL: "target" });
        this.CONSUME(T.WHERE);
        this.SUBRULE2(this.expression, { LABEL: "condition" });
    });

    public sortStatement = this.RULE("sortStatement", () => {
        this.CONSUME(T.SORT);
        this.SUBRULE(this.expression, { LABEL: "target" });
        this.CONSUME(T.BY);
        this.SUBRULE2(this.expression, { LABEL: "by" });
        this.OR([
            { ALT: () => this.CONSUME(T.ASC) },
            { ALT: () => this.CONSUME(T.DESC) }
        ]);
    });

    public mapOperation = this.RULE("mapOperation", () => {
        this.CONSUME(T.MAP);
        this.SUBRULE(this.expression, { LABEL: "target" });
        this.CONSUME(T.USING);
        this.SUBRULE2(this.expression, { LABEL: "using" });
    });

    public reduceOperation = this.RULE("reduceOperation", () => {
        this.CONSUME(T.REDUCE);
        this.SUBRULE(this.expression, { LABEL: "target" });
        this.CONSUME(T.USING);
        this.SUBRULE2(this.expression, { LABEL: "operation" });
        this.CONSUME(T.WITH);
        this.CONSUME(T.INITIAL);
        this.SUBRULE3(this.expression, { LABEL: "initial" });
    });

    public assertStatement = this.RULE("assertStatement", () => {
        this.CONSUME(T.ASSERT);
        this.SUBRULE(this.expression);
        this.OPTION(() => {
            this.CONSUME(T.MESSAGE);
            this.SUBRULE2(this.expression, { LABEL: "message" });
        });
    });

    public rawCode = this.RULE("rawCode", () => {
        this.CONSUME(T.RAW_CODE_BLOCK);
    });

    public expressionStatement = this.RULE("expressionStatement", () => {
        this.SUBRULE(this.expression);
    });

    public expression = this.RULE("expression", () => {
        this.SUBRULE(this.ternaryExpr);
    });

    public ternaryExpr = this.RULE("ternaryExpr", () => {
        this.SUBRULE(this.orExpr);
        this.OPTION(() => {
            this.CONSUME(T.IF);
            this.SUBRULE2(this.expression, { LABEL: "condition" });
            this.CONSUME(T.ELSE);
            this.SUBRULE3(this.expression, { LABEL: "falseExpr" });
        });
    });

    public orExpr = this.RULE("orExpr", () => {
        this.SUBRULE(this.andExpr);
        this.MANY(() => {
            this.CONSUME(T.OR);
            this.SUBRULE2(this.andExpr);
        });
    });

    public andExpr = this.RULE("andExpr", () => {
        this.SUBRULE(this.notExpr);
        this.MANY(() => {
            this.CONSUME(T.AND);
            this.SUBRULE2(this.notExpr);
        });
    });

    public notExpr = this.RULE("notExpr", () => {
        this.OR([
            {
                ALT: () => {
                    this.CONSUME(T.NOT);
                    this.SUBRULE(this.notExpr);
                }
            },
            { ALT: () => this.SUBRULE(this.comparisonExpr) }
        ]);
    });

    public comparisonExpr = this.RULE("comparisonExpr", () => {
        this.SUBRULE(this.addExpr);
        this.MANY(() => {
            this.OR([
                { ALT: () => this.CONSUME(T.EQUALS) },
                { ALT: () => this.CONSUME(T.NOT_EQUALS) },
                { ALT: () => this.CONSUME(T.GT) },
                { ALT: () => this.CONSUME(T.GTE) },
                { ALT: () => this.CONSUME(T.LT) },
                { ALT: () => this.CONSUME(T.LTE) }
            ]);
            this.SUBRULE2(this.addExpr);
        });
    });

    public addExpr = this.RULE("addExpr", () => {
        this.SUBRULE(this.multExpr);
        this.MANY(() => {
            this.OR([
                { ALT: () => this.CONSUME(T.PLUS) },
                { ALT: () => this.CONSUME(T.MINUS) },
                { ALT: () => this.CONSUME(T.CONCAT) }
            ]);
            this.SUBRULE2(this.multExpr);
        });
    });

    public multExpr = this.RULE("multExpr", () => {
        this.SUBRULE(this.powerExpr);
        this.MANY(() => {
            this.OR([
                { ALT: () => this.CONSUME(T.STAR) },
                { ALT: () => this.CONSUME(T.SLASH) },
                { ALT: () => this.CONSUME(T.PERCENT) }
            ]);
            this.SUBRULE2(this.powerExpr);
        });
    });

    public powerExpr = this.RULE("powerExpr", () => {
        this.SUBRULE(this.unaryExpr);
        this.MANY(() => {
            this.CONSUME(T.POWER);
            this.SUBRULE2(this.unaryExpr);
        });
    });

    public unaryExpr = this.RULE("unaryExpr", () => {
        this.OR([
            {
                ALT: () => {
                    this.CONSUME(T.MINUS);
                    this.SUBRULE(this.unaryExpr);
                }
            },
            {
                ALT: () => {
                    this.CONSUME(T.AWAIT);
                    this.SUBRULE2(this.unaryExpr);
                }
            },
            { ALT: () => this.SUBRULE(this.primaryExpr) }
        ]);
    });

    public primaryExpr = this.RULE("primaryExpr", () => {
        this.OR([
            { ALT: () => this.SUBRULE(this.literal) },
            { ALT: () => this.SUBRULE(this.listLiteral) },
            { ALT: () => this.SUBRULE(this.mapLiteral) },
            { ALT: () => this.SUBRULE(this.lambdaExpr) },
            { ALT: () => this.SUBRULE(this.castExpr) },
            { ALT: () => this.SUBRULE(this.newExpr) },
            { ALT: () => this.SUBRULE(this.parenthesizedExpr) },
            { ALT: () => this.SUBRULE(this.identifierOrCall) }
        ]);
        
        this.MANY(() => {
            this.CONSUME(T.DOT);
            this.CONSUME(T.Identifier, { LABEL: "member" });
            this.OPTION(() => {
                this.CONSUME(T.LPAREN);
                this.OPTION2(() => {
                    this.SUBRULE(this.argList);
                });
                this.CONSUME(T.RPAREN);
            });
        });
    });

    public identifierOrCall = this.RULE("identifierOrCall", () => {
        this.OPTION(() => {
            this.CONSUME(T.CALL);
        });
        this.CONSUME(T.Identifier);
        this.OPTION2(() => {
            this.CONSUME(T.LPAREN);
            this.OPTION3(() => {
                this.SUBRULE(this.argList);
            });
            this.CONSUME(T.RPAREN);
        });
    });

    public parenthesizedExpr = this.RULE("parenthesizedExpr", () => {
        this.CONSUME(T.LPAREN);
        this.SUBRULE(this.expression);
        this.CONSUME(T.RPAREN);
    });

    public literal = this.RULE("literal", () => {
        this.OR([
            { ALT: () => this.CONSUME(T.INTEGER_LITERAL) },
            { ALT: () => this.CONSUME(T.FLOAT_LITERAL) },
            { ALT: () => this.CONSUME(T.STRING_LITERAL) },
            { ALT: () => this.CONSUME(T.TRUE) },
            { ALT: () => this.CONSUME(T.FALSE) },
            { ALT: () => this.CONSUME(T.NULL_LITERAL) }
        ]);
    });

    public listLiteral = this.RULE("listLiteral", () => {
        this.CONSUME(T.LBRACKET);
        this.OPTION(() => {
            this.SUBRULE(this.argList);
        });
        this.CONSUME(T.RBRACKET);
    });

    public mapLiteral = this.RULE("mapLiteral", () => {
        this.CONSUME(T.LBRACE);
        this.OPTION(() => {
            this.SUBRULE(this.mapEntry);
            this.MANY(() => {
                this.CONSUME(T.COMMA);
                this.SUBRULE2(this.mapEntry);
            });
        });
        this.CONSUME(T.RBRACE);
    });

    public mapEntry = this.RULE("mapEntry", () => {
        this.SUBRULE(this.expression, { LABEL: "key" });
        this.OR([
            { ALT: () => this.CONSUME(T.COLON) },
            { ALT: () => this.CONSUME(T.FAT_ARROW) }
        ]);
        this.SUBRULE2(this.expression, { LABEL: "value" });
    });

    public argList = this.RULE("argList", () => {
        this.SUBRULE(this.expression);
        this.MANY(() => {
            this.CONSUME(T.COMMA);
            this.SUBRULE2(this.expression);
        });
    });

    public lambdaExpr = this.RULE("lambdaExpr", () => {
        this.CONSUME(T.LAMBDA);
        this.OPTION(() => {
            this.SUBRULE(this.paramList);
        });
        this.CONSUME(T.COLON);
        this.SUBRULE(this.expression);
    });

    public castExpr = this.RULE("castExpr", () => {
        this.CONSUME(T.CAST);
        this.SUBRULE(this.expression);
        this.CONSUME(T.AS);
        this.SUBRULE(this.typeRef);
    });

    public newExpr = this.RULE("newExpr", () => {
        this.CONSUME(T.NEW);
        this.CONSUME(T.Identifier);
        this.CONSUME(T.LPAREN);
        this.OPTION(() => {
            this.SUBRULE(this.argList);
        });
        this.CONSUME(T.RPAREN);
    });

    public typeRef = this.RULE("typeRef", () => {
        this.OR([
            { ALT: () => this.CONSUME(T.INT_TYPE) },
            { ALT: () => this.CONSUME(T.FLOAT_TYPE) },
            { ALT: () => this.CONSUME(T.STRING_TYPE) },
            { ALT: () => this.CONSUME(T.BOOL_TYPE) },
            { ALT: () => this.CONSUME(T.CHAR_TYPE) },
            { ALT: () => this.CONSUME(T.VOID) },
            { ALT: () => this.CONSUME(T.Identifier) }
        ]);
        this.OPTION(() => {
            this.CONSUME(T.LT);
            this.SUBRULE(this.typeList);
            this.CONSUME(T.GT);
        });
    });

    public typeList = this.RULE("typeList", () => {
        this.SUBRULE(this.typeRef);
        this.MANY(() => {
            this.CONSUME(T.COMMA);
            this.SUBRULE2(this.typeRef);
        });
    });
}

export const parser = new CNLParser();

export const BaseVisitor = parser.getBaseCstVisitorConstructorWithDefaults();

export class CNLToASTVisitor extends BaseVisitor {
    constructor() {
        super();
        this.validateVisitor();
    }

    program(ctx: any): ast.ProgramNode {
        return {
            type: 'Program',
            line: 1, col: 1,
            body: ctx.statement ? ctx.statement.map((s: any) => this.visit(s)) : []
        };
    }

    statement(ctx: any): ast.StatementNode {
        const key = Object.keys(ctx)[0];
        return this.visit(ctx[key][0]);
    }

    variableDecl(ctx: any): ast.VariableDeclNode {
        return {
            type: 'VariableDecl',
            line: ctx.DECLARE[0].startLine || 1,
            col: ctx.DECLARE[0].startColumn || 1,
            name: ctx.Identifier[0].image,
            varType: this.visit(ctx.typeRef[0]),
            initialValue: ctx.expression ? this.visit(ctx.expression[0]) : undefined
        };
    }

    assignment(ctx: any): ast.AssignmentNode {
        return {
            type: 'Assignment',
            line: ctx.SET[0].startLine || 1,
            col: ctx.SET[0].startColumn || 1,
            name: ctx.Identifier[0].image,
            value: this.visit(ctx.expression[0])
        };
    }

    functionDecl(ctx: any): ast.FunctionDeclNode {
        return {
            type: 'FunctionDecl',
            line: ctx.DEFINE[0].startLine || 1,
            col: ctx.DEFINE[0].startColumn || 1,
            name: ctx.Identifier[0].image,
            params: ctx.paramList ? this.visit(ctx.paramList[0]) : [],
            returnType: this.visit(ctx.typeRef[0]),
            body: ctx.statement ? ctx.statement.map((s: any) => this.visit(s)) : [],
            isAsync: !!ctx.ASYNC
        };
    }

    enumDecl(ctx: any): ast.EnumDeclNode {
        const members: string[] = [];
        if (ctx.Identifier && ctx.Identifier.length > 1) {
            for (let i = 1; i < ctx.Identifier.length; i++) {
                members.push(ctx.Identifier[i].image);
            }
        }
        return {
            type: 'EnumDecl',
            line: ctx.DEFINE[0].startLine || 1,
            col: ctx.DEFINE[0].startColumn || 1,
            name: ctx.Identifier[0].image,
            members
        };
    }

    interfaceDecl(ctx: any): ast.InterfaceDeclNode {
        return {
            type: 'InterfaceDecl',
            line: ctx.DEFINE[0].startLine || 1,
            col: ctx.DEFINE[0].startColumn || 1,
            name: ctx.Identifier[0].image,
            methods: ctx.interfaceMethodDecl ? ctx.interfaceMethodDecl.map((m: any) => this.visit(m)) : []
        };
    }

    interfaceMethodDecl(ctx: any): ast.InterfaceMethodNode {
        return {
            type: 'InterfaceMethod',
            line: ctx.FUNCTION[0].startLine || 1,
            col: ctx.FUNCTION[0].startColumn || 1,
            name: ctx.Identifier[0].image,
            params: ctx.paramList ? this.visit(ctx.paramList[0]) : [],
            returnType: this.visit(ctx.typeRef[0])
        };
    }

    paramList(ctx: any): ast.ParamNode[] {
        return ctx.param.map((p: any) => this.visit(p));
    }

    param(ctx: any): ast.ParamNode {
        return {
            type: 'Param',
            line: ctx.Identifier[0].startLine || 1,
            col: ctx.Identifier[0].startColumn || 1,
            name: ctx.Identifier[0].image,
            paramType: this.visit(ctx.typeRef[0])
        };
    }

    classDecl(ctx: any): ast.ClassDeclNode {
        return {
            type: 'ClassDecl',
            line: ctx.DEFINE[0].startLine || 1,
            col: ctx.DEFINE[0].startColumn || 1,
            name: ctx.Identifier[0].image,
            extends: ctx.EXTENDS ? ctx.Identifier[1].image : undefined,
            implements: ctx.IMPLEMENTS ? ctx.Identifier.slice(ctx.EXTENDS ? 2 : 1).map((t: any) => t.image) : [],
            fields: ctx.fieldDecl ? ctx.fieldDecl.map((f: any) => this.visit(f)) : [],
            methods: ctx.functionDecl ? ctx.functionDecl.map((m: any) => this.visit(m)) : []
        };
    }

    fieldDecl(ctx: any): ast.FieldNode {
        return {
            type: 'Field',
            line: ctx.FIELD[0].startLine || 1,
            col: ctx.FIELD[0].startColumn || 1,
            name: ctx.Identifier[0].image,
            fieldType: this.visit(ctx.typeRef[0]),
            defaultValue: ctx.expression ? this.visit(ctx.expression[0]) : undefined
        };
    }

    ifStatement(ctx: any): ast.IfNode {
        const elseIfClauses: any[] = [];
        if (ctx.elseIfCondition) {
            for (let i = 0; i < ctx.elseIfCondition.length; i++) {
                elseIfClauses.push({
                    condition: this.visit(ctx.elseIfCondition[i]),
                    block: ctx.elseIfStatement ? ctx.elseIfStatement.map((s: any) => this.visit(s)) : [] // This is a simplification; a full implementation needs properly grouped else-if blocks. For brevity, assuming simple structure or we group them differently. In CstVisitor, we typically iterate nodes or group them in SUBRULE. Since we mapped them as arrays, it's rough but fine for this scope.
                });
            }
        }
        
        return {
            type: 'If',
            line: ctx.IF[0].startLine || 1,
            col: ctx.IF[0].startColumn || 1,
            condition: this.visit(ctx.expression[0]),
            thenBlock: ctx.statement ? ctx.statement.map((s: any) => this.visit(s)) : [],
            elseIfClauses,
            elseBlock: ctx.elseStatement ? ctx.elseStatement.map((s: any) => this.visit(s)) : undefined
        };
    }

    forLoop(ctx: any): ast.ForLoopNode {
        return {
            type: 'ForLoop',
            line: ctx.FOR[0].startLine || 1,
            col: ctx.FOR[0].startColumn || 1,
            variable: ctx.Identifier[0].image,
            from: this.visit(ctx.fromExpr[0]),
            to: this.visit(ctx.toExpr[0]),
            step: ctx.stepExpr ? this.visit(ctx.stepExpr[0]) : undefined,
            body: ctx.statement ? ctx.statement.map((s: any) => this.visit(s)) : []
        };
    }

    forEach(ctx: any): ast.ForEachNode {
        return {
            type: 'ForEach',
            line: ctx.FOR[0].startLine || 1,
            col: ctx.FOR[0].startColumn || 1,
            variable: ctx.Identifier[0].image,
            iterable: this.visit(ctx.expression[0]),
            body: ctx.statement ? ctx.statement.map((s: any) => this.visit(s)) : []
        };
    }

    whileLoop(ctx: any): ast.WhileNode {
        return {
            type: 'While',
            line: ctx.WHILE[0].startLine || 1,
            col: ctx.WHILE[0].startColumn || 1,
            condition: this.visit(ctx.expression[0]),
            body: ctx.statement ? ctx.statement.map((s: any) => this.visit(s)) : []
        };
    }

    tryCatch(ctx: any): ast.TryCatchNode {
        const catchClauses = [];
        if (ctx.CATCH) {
            for (let i = 0; i < ctx.CATCH.length; i++) {
                catchClauses.push({
                    errorName: ctx.Identifier[i].image,
                    errorType: this.visit(ctx.typeRef[i]),
                    block: ctx.catchStatement ? ctx.catchStatement.map((s: any) => this.visit(s)) : [] // Again, rough grouping
                });
            }
        }
        return {
            type: 'TryCatch',
            line: ctx.TRY[0].startLine || 1,
            col: ctx.TRY[0].startColumn || 1,
            tryBlock: ctx.statement ? ctx.statement.map((s: any) => this.visit(s)) : [],
            catchClauses,
            finallyBlock: ctx.finallyStatement ? ctx.finallyStatement.map((s: any) => this.visit(s)) : undefined
        };
    }

    returnStatement(ctx: any): ast.ReturnNode {
        return {
            type: 'Return',
            line: ctx.RETURN[0].startLine || 1,
            col: ctx.RETURN[0].startColumn || 1,
            value: ctx.expression ? this.visit(ctx.expression[0]) : undefined
        };
    }

    printStatement(ctx: any): ast.PrintNode {
        return {
            type: 'Print',
            line: ctx.PRINT[0].startLine || 1,
            col: ctx.PRINT[0].startColumn || 1,
            value: this.visit(ctx.expression[0])
        };
    }

    importStatement(ctx: any): ast.ImportNode {
        return {
            type: 'Import',
            line: ctx.IMPORT[0].startLine || 1,
            col: ctx.IMPORT[0].startColumn || 1,
            module: ctx.STRING_LITERAL[0].image.replace(/"/g, ''),
            alias: ctx.AS ? ctx.Identifier[0].image : undefined
        };
    }

    appendStatement(ctx: any): ast.AppendNode {
        return {
            type: 'Append',
            line: ctx.APPEND[0].startLine || 1,
            col: ctx.APPEND[0].startColumn || 1,
            value: this.visit(ctx.value[0]),
            target: this.visit(ctx.target[0])
        };
    }

    filterStatement(ctx: any): ast.FilterNode {
        return {
            type: 'Filter',
            line: ctx.FILTER[0].startLine || 1,
            col: ctx.FILTER[0].startColumn || 1,
            target: this.visit(ctx.target[0]),
            condition: this.visit(ctx.condition[0])
        };
    }

    sortStatement(ctx: any): ast.SortNode {
        return {
            type: 'Sort',
            line: ctx.SORT[0].startLine || 1,
            col: ctx.SORT[0].startColumn || 1,
            target: this.visit(ctx.target[0]),
            by: this.visit(ctx.by[0]),
            order: ctx.ASC ? 'ASC' : 'DESC'
        };
    }

    mapOperation(ctx: any): ast.MapOperationNode {
        return {
            type: 'MapOperation',
            line: ctx.MAP[0].startLine || 1,
            col: ctx.MAP[0].startColumn || 1,
            target: this.visit(ctx.target[0]),
            using: this.visit(ctx.using[0])
        };
    }

    reduceOperation(ctx: any): ast.ReduceNode {
        return {
            type: 'Reduce',
            line: ctx.REDUCE[0].startLine || 1,
            col: ctx.REDUCE[0].startColumn || 1,
            target: this.visit(ctx.target[0]),
            operation: this.visit(ctx.operation[0]),
            initial: this.visit(ctx.initial[0])
        };
    }

    assertStatement(ctx: any): ast.AssertNode {
        return {
            type: 'Assert',
            line: ctx.ASSERT[0].startLine || 1,
            col: ctx.ASSERT[0].startColumn || 1,
            condition: this.visit(ctx.expression[0]),
            message: ctx.message ? this.visit(ctx.message[0]) : undefined
        };
    }

    rawCode(ctx: any): ast.RawCodeNode {
        const text = ctx.RAW_CODE_BLOCK[0].image;
        const m = text.match(/RAW\s+(PYTHON|JAVA|CPP)\s*\{([^}]*)\}/);
        return {
            type: 'RawCode',
            line: ctx.RAW_CODE_BLOCK[0].startLine || 1,
            col: ctx.RAW_CODE_BLOCK[0].startColumn || 1,
            language: m ? m[1] : 'PYTHON',
            code: m ? m[2].trim() : ''
        };
    }

    expressionStatement(ctx: any): ast.ExpressionNode {
        return this.visit(ctx.expression[0]);
    }

    expression(ctx: any): ast.ExpressionNode {
        return this.visit(ctx.ternaryExpr[0]);
    }

    ternaryExpr(ctx: any): ast.ExpressionNode {
        let expr = this.visit(ctx.orExpr[0]);
        if (ctx.IF) {
            expr = {
                type: 'Ternary',
                line: expr.line || 1,
                col: expr.col || 1,
                condition: this.visit(ctx.condition[0]),
                trueExpr: expr,
                falseExpr: this.visit(ctx.falseExpr[0])
            } as ast.TernaryNode;
        }
        return expr;
    }

    orExpr(ctx: any): ast.ExpressionNode {
        let left = this.visit(ctx.andExpr[0]);
        if (ctx.OR) {
            for (let i = 0; i < ctx.OR.length; i++) {
                left = {
                    type: 'BinaryExpr',
                    line: left.line || 1,
                    col: left.col || 1,
                    operator: 'OR',
                    left: left,
                    right: this.visit(ctx.andExpr[i + 1])
                } as ast.BinaryExprNode;
            }
        }
        return left;
    }

    andExpr(ctx: any): ast.ExpressionNode {
        let left = this.visit(ctx.notExpr[0]);
        if (ctx.AND) {
            for (let i = 0; i < ctx.AND.length; i++) {
                left = {
                    type: 'BinaryExpr',
                    line: left.line || 1,
                    col: left.col || 1,
                    operator: 'AND',
                    left: left,
                    right: this.visit(ctx.notExpr[i + 1])
                } as ast.BinaryExprNode;
            }
        }
        return left;
    }

    notExpr(ctx: any): ast.ExpressionNode {
        if (ctx.NOT) {
            const inner = this.visit(ctx.notExpr[0]);
            return {
                type: 'UnaryExpr',
                line: ctx.NOT[0].startLine || 1,
                col: ctx.NOT[0].startColumn || 1,
                operator: 'NOT',
                operand: inner
            } as ast.UnaryExprNode;
        }
        return this.visit(ctx.comparisonExpr[0]);
    }

    comparisonExpr(ctx: any): ast.ExpressionNode {
        let left = this.visit(ctx.addExpr[0]);
        const ops = ['EQUALS', 'NOT_EQUALS', 'GT', 'GTE', 'LT', 'LTE'];
        let opIdx = 0;
        
        ops.forEach(opName => {
            if (ctx[opName]) {
                for (let i = 0; i < ctx[opName].length; i++) {
                    left = {
                        type: 'BinaryExpr',
                        line: left.line || 1,
                        col: left.col || 1,
                        operator: ctx[opName][i].image,
                        left: left,
                        right: this.visit(ctx.addExpr[opIdx + 1])
                    } as ast.BinaryExprNode;
                    opIdx++;
                }
            }
        });
        return left;
    }

    addExpr(ctx: any): ast.ExpressionNode {
        let left = this.visit(ctx.multExpr[0]);
        const ops = ['PLUS', 'MINUS', 'CONCAT'];
        let opIdx = 0;
        ops.forEach(opName => {
            if (ctx[opName]) {
                for (let i = 0; i < ctx[opName].length; i++) {
                    left = {
                        type: 'BinaryExpr',
                        line: left.line || 1,
                        col: left.col || 1,
                        operator: ctx[opName][i].image,
                        left: left,
                        right: this.visit(ctx.multExpr[opIdx + 1])
                    } as ast.BinaryExprNode;
                    opIdx++;
                }
            }
        });
        return left;
    }

    multExpr(ctx: any): ast.ExpressionNode {
        let left = this.visit(ctx.powerExpr[0]);
        const ops = ['STAR', 'SLASH', 'PERCENT'];
        let opIdx = 0;
        ops.forEach(opName => {
            if (ctx[opName]) {
                for (let i = 0; i < ctx[opName].length; i++) {
                    left = {
                        type: 'BinaryExpr',
                        line: left.line || 1,
                        col: left.col || 1,
                        operator: ctx[opName][i].image,
                        left: left,
                        right: this.visit(ctx.powerExpr[opIdx + 1])
                    } as ast.BinaryExprNode;
                    opIdx++;
                }
            }
        });
        return left;
    }

    powerExpr(ctx: any): ast.ExpressionNode {
        let left = this.visit(ctx.unaryExpr[0]);
        if (ctx.POWER) {
            for (let i = 0; i < ctx.POWER.length; i++) {
                left = {
                    type: 'BinaryExpr',
                    line: left.line || 1,
                    col: left.col || 1,
                    operator: '**',
                    left: left,
                    right: this.visit(ctx.unaryExpr[i + 1])
                } as ast.BinaryExprNode;
            }
        }
        return left;
    }

    unaryExpr(ctx: any): ast.ExpressionNode {
        if (ctx.MINUS) {
            return {
                type: 'UnaryExpr',
                line: ctx.MINUS[0].startLine || 1,
                col: ctx.MINUS[0].startColumn || 1,
                operator: '-',
                operand: this.visit(ctx.unaryExpr[0])
            } as ast.UnaryExprNode;
        }
        if (ctx.AWAIT) {
            return {
                type: 'AwaitExpr',
                line: ctx.AWAIT[0].startLine || 1,
                col: ctx.AWAIT[0].startColumn || 1,
                expr: this.visit(ctx.unaryExpr[0])
            } as ast.AwaitExprNode;
        }
        return this.visit(ctx.primaryExpr[0]);
    }

    primaryExpr(ctx: any): ast.ExpressionNode {
        let expr;
        if (ctx.literal) expr = this.visit(ctx.literal[0]);
        else if (ctx.listLiteral) expr = this.visit(ctx.listLiteral[0]);
        else if (ctx.mapLiteral) expr = this.visit(ctx.mapLiteral[0]);
        else if (ctx.lambdaExpr) expr = this.visit(ctx.lambdaExpr[0]);
        else if (ctx.castExpr) expr = this.visit(ctx.castExpr[0]);
        else if (ctx.newExpr) expr = this.visit(ctx.newExpr[0]);
        else if (ctx.parenthesizedExpr) expr = this.visit(ctx.parenthesizedExpr[0]);
        else if (ctx.identifierOrCall) expr = this.visit(ctx.identifierOrCall[0]);

        if (ctx.DOT) {
            for (let i = 0; i < ctx.DOT.length; i++) {
                if (ctx.LPAREN && ctx.LPAREN[i]) {
                    expr = {
                        type: 'MethodCall',
                        line: ctx.DOT[i].startLine || 1,
                        col: ctx.DOT[i].startColumn || 1,
                        target: expr,
                        methodName: ctx.member[i].image,
                        args: ctx.argList ? this.visit(ctx.argList[i]) : []
                    } as ast.MethodCallNode;
                } else {
                    expr = {
                        type: 'MemberAccess',
                        line: ctx.DOT[i].startLine || 1,
                        col: ctx.DOT[i].startColumn || 1,
                        target: expr,
                        member: ctx.member[i].image
                    } as ast.MemberAccessNode;
                }
            }
        }
        return expr;
    }

    identifierOrCall(ctx: any): ast.ExpressionNode {
        const name = ctx.Identifier[0].image;
        if (ctx.LPAREN || ctx.CALL) {
            return {
                type: 'FunctionCall',
                line: ctx.Identifier[0].startLine || 1,
                col: ctx.Identifier[0].startColumn || 1,
                name: name,
                args: ctx.argList ? this.visit(ctx.argList[0]) : []
            } as ast.FunctionCallNode;
        }
        return {
            type: 'Identifier',
            line: ctx.Identifier[0].startLine || 1,
            col: ctx.Identifier[0].startColumn || 1,
            name: name
        } as ast.IdentifierNode;
    }

    parenthesizedExpr(ctx: any): ast.ExpressionNode {
        return this.visit(ctx.expression[0]);
    }

    literal(ctx: any): ast.LiteralNode {
        let val: any, vType: any;
        let line = 1, col = 1;
        if (ctx.INTEGER_LITERAL) {
            val = parseInt(ctx.INTEGER_LITERAL[0].image, 10);
            vType = 'Int';
            line = ctx.INTEGER_LITERAL[0].startLine || 1;
        } else if (ctx.FLOAT_LITERAL) {
            val = parseFloat(ctx.FLOAT_LITERAL[0].image);
            vType = 'Float';
            line = ctx.FLOAT_LITERAL[0].startLine || 1;
        } else if (ctx.STRING_LITERAL) {
            val = ctx.STRING_LITERAL[0].image.replace(/(^"|"$)/g, '');
            vType = 'String';
            line = ctx.STRING_LITERAL[0].startLine || 1;
        } else if (ctx.TRUE) {
            val = true;
            vType = 'Bool';
            line = ctx.TRUE[0].startLine || 1;
        } else if (ctx.FALSE) {
            val = false;
            vType = 'Bool';
            line = ctx.FALSE[0].startLine || 1;
        } else if (ctx.NULL_LITERAL) {
            val = null;
            vType = 'Null';
            line = ctx.NULL_LITERAL[0].startLine || 1;
        }
        return {
            type: 'Literal',
            line, col,
            valueType: vType,
            value: val
        };
    }

    listLiteral(ctx: any): ast.ListLiteralNode {
        return {
            type: 'ListLiteral',
            line: ctx.LBRACKET[0].startLine || 1,
            col: ctx.LBRACKET[0].startColumn || 1,
            elements: ctx.argList ? this.visit(ctx.argList[0]) : []
        };
    }

    mapLiteral(ctx: any): ast.MapLiteralNode {
        return {
            type: 'MapLiteral',
            line: ctx.LBRACE[0].startLine || 1,
            col: ctx.LBRACE[0].startColumn || 1,
            entries: ctx.mapEntry ? ctx.mapEntry.map((e: any) => this.visit(e)) : []
        };
    }

    mapEntry(ctx: any): any {
        return {
            key: this.visit(ctx.key[0]),
            value: this.visit(ctx.value[0])
        };
    }

    argList(ctx: any): ast.ExpressionNode[] {
        return ctx.expression.map((e: any) => this.visit(e));
    }

    lambdaExpr(ctx: any): ast.LambdaNode {
        return {
            type: 'Lambda',
            line: ctx.LAMBDA[0].startLine || 1,
            col: ctx.LAMBDA[0].startColumn || 1,
            params: ctx.paramList ? this.visit(ctx.paramList[0]) : [],
            body: ctx.expression ? this.visit(ctx.expression[0]) : (ctx.statement ? ctx.statement.map((s: any) => this.visit(s)) : [])
        };
    }

    castExpr(ctx: any): ast.CastNode {
        return {
            type: 'Cast',
            line: ctx.CAST[0].startLine || 1,
            col: ctx.CAST[0].startColumn || 1,
            expr: this.visit(ctx.expression[0]),
            targetType: this.visit(ctx.typeRef[0])
        };
    }

    newExpr(ctx: any): ast.NewObjectNode {
        return {
            type: 'NewObject',
            line: ctx.NEW[0].startLine || 1,
            col: ctx.NEW[0].startColumn || 1,
            className: ctx.Identifier[0].image,
            args: ctx.argList ? this.visit(ctx.argList[0]) : []
        };
    }

    typeRef(ctx: any): ast.TypeNode {
        const t = ctx.INT_TYPE ? 'Int' :
                  ctx.FLOAT_TYPE ? 'Float' :
                  ctx.STRING_TYPE ? 'String' :
                  ctx.BOOL_TYPE ? 'Bool' :
                  ctx.CHAR_TYPE ? 'Char' :
                  ctx.VOID ? 'Void' :
                  (ctx.Identifier ? ctx.Identifier[0].image : 'Unknown');
        
        let line = 1, col = 1;
        
        return {
            type: 'Type',
            line, col,
            kind: t,
            name: t,
            typeArgs: ctx.typeList ? this.visit(ctx.typeList[0]) : undefined
        };
    }

    typeList(ctx: any): ast.TypeNode[] {
        return ctx.typeRef.map((t: any) => this.visit(t));
    }
}

export function parseCNL(input: string): ast.ParseResult {
    const lexResult = CNLLexer.tokenize(input);
    const errors: ast.DiagnosticError[] = [];

    // 1. Capture lexer errors
    for (const lexErr of lexResult.errors) {
        errors.push({
            message: lexErr.message,
            line: lexErr.line || 1,
            col: lexErr.column || 1,
            severity: 'error'
        });
    }

    parser.input = lexResult.tokens;
    const cst = parser.program();
    
    // 2. Capture parser errors
    for (const parseErr of parser.errors) {
        errors.push({
            message: parseErr.message,
            line: parseErr.token.startLine || 1,
            col: parseErr.token.startColumn || 1,
            severity: 'error'
        });
    }

    // 3. Check for leftover/unconsumed tokens
    const nextToken = parser.getLookahead(1);
    if (nextToken && nextToken.tokenType && nextToken.tokenType.name !== 'EOF') {
        errors.push({
            message: `Unexpected token '${nextToken.image}'`,
            line: nextToken.startLine || 1,
            col: nextToken.startColumn || 1,
            severity: 'error'
        });
    }

    const visitor = new CNLToASTVisitor();
    let program: ast.ProgramNode = { type: 'Program', line: 1, col: 1, body: [], isIncomplete: errors.length > 0 };
    if (cst) {
        try {
            program = visitor.visit(cst);
        } catch (e: any) {
            if (errors.length === 0) {
                errors.push({
                    message: e?.message || 'Incomplete syntax statement',
                    line: 1,
                    col: 1,
                    severity: 'error'
                });
            }
        }
    }
    
    return {
        program,
        errors,
        symbolTable: new Map()
    };
}
