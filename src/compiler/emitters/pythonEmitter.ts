import * as ast from '../ast.js';

export class PythonEmitter {
    private indentLevel: number = 0;
    
    private indent(): string {
        return '    '.repeat(this.indentLevel);
    }

    public emit(node: ast.ProgramNode): string {
        return this.visitProgram(node);
    }

    private visitProgram(node: ast.ProgramNode): string {
        let code = '';
        for (const stmt of node.body) {
            code += this.visitStatement(stmt) + '\n';
        }
        return code;
    }

    private visitStatement(node: ast.StatementNode): string {
        switch (node.type) {
            case 'VariableDecl': return this.visitVariableDecl(node);
            case 'Assignment': return this.visitAssignment(node);
            case 'FunctionDecl': return this.visitFunctionDecl(node);
            case 'ClassDecl': return this.visitClassDecl(node);
            case 'EnumDecl': return this.visitEnumDecl(node);
            case 'InterfaceDecl': return this.visitInterfaceDecl(node);
            case 'If': return this.visitIf(node);
            case 'ForLoop': return this.visitForLoop(node);
            case 'ForEach': return this.visitForEach(node);
            case 'While': return this.visitWhile(node);
            case 'TryCatch': return this.visitTryCatch(node);
            case 'Return': return this.visitReturn(node);
            case 'Print': return this.visitPrint(node);
            case 'Import': return this.visitImport(node);
            case 'Append': return this.visitAppend(node);
            case 'Filter': return this.visitFilter(node);
            case 'Sort': return this.visitSort(node);
            case 'MapOperation': return this.visitMapOperation(node);
            case 'Reduce': return this.visitReduce(node);
            case 'Assert': return this.visitAssert(node);
            case 'RawCode': return this.visitRawCode(node);
            default:
                if (this.isExpression(node)) {
                    return this.indent() + this.visitExpression(node as ast.ExpressionNode);
                }
                return this.indent() + `# Unknown statement: ${node.type}`;
        }
    }

    private isExpression(node: any): boolean {
        return ['BinaryExpr', 'UnaryExpr', 'Literal', 'Identifier', 'FunctionCall', 'MethodCall', 'ListLiteral', 'MapLiteral', 'Lambda', 'Ternary', 'Cast', 'NewObject', 'MemberAccess', 'AwaitExpr'].includes(node.type);
    }

    private visitVariableDecl(node: ast.VariableDeclNode): string {
        const typeStr = this.mapType(node.varType);
        let code = `${this.indent()}${node.name}: ${typeStr}`;
        if (node.initialValue) {
            code += ` = ${this.visitExpression(node.initialValue)}`;
        }
        return code;
    }

    private visitAssignment(node: ast.AssignmentNode): string {
        return `${this.indent()}${node.name} = ${this.visitExpression(node.value)}`;
    }

    private visitEnumDecl(node: ast.EnumDeclNode): string {
        let code = `${this.indent()}from enum import Enum\n`;
        code += `${this.indent()}class ${node.name}(Enum):\n`;
        this.indentLevel++;
        if (node.members.length === 0) {
            code += `${this.indent()}pass\n`;
        } else {
            for (const m of node.members) {
                code += `${this.indent()}${m} = "${m}"\n`;
            }
        }
        this.indentLevel--;
        return code;
    }

    private visitInterfaceDecl(node: ast.InterfaceDeclNode): string {
        let code = `${this.indent()}from abc import ABC, abstractmethod\n`;
        code += `${this.indent()}class ${node.name}(ABC):\n`;
        this.indentLevel++;
        if (node.methods.length === 0) {
            code += `${this.indent()}pass\n`;
        } else {
            for (const m of node.methods) {
                const paramStrs = ['self'];
                for (const p of m.params) {
                    paramStrs.push(`${p.name}: ${this.mapType(p.paramType)}`);
                }
                code += `${this.indent()}@abstractmethod\n`;
                code += `${this.indent()}def ${m.name}(${paramStrs.join(', ')}) -> ${this.mapType(m.returnType)}:\n`;
                this.indentLevel++;
                code += `${this.indent()}pass\n`;
                this.indentLevel--;
            }
        }
        this.indentLevel--;
        return code;
    }

    private visitFunctionDecl(node: ast.FunctionDeclNode): string {
        const params = node.params.map((p: ast.ParamNode) => `${p.name}: ${this.mapType(p.paramType)}`).join(', ');
        const retType = this.mapType(node.returnType);
        const defKw = node.isAsync ? 'async def' : 'def';
        let code = `${this.indent()}${defKw} ${node.name}(${params}) -> ${retType}:\n`;
        this.indentLevel++;
        if (node.body.length === 0) {
            code += `${this.indent()}pass\n`;
        } else {
            for (const stmt of node.body) {
                code += this.visitStatement(stmt) + '\n';
            }
        }
        this.indentLevel--;
        return code;
    }

    private currentClassFields: Set<string> | null = null;
    private currentMethodParams: Set<string> | null = null;

    private visitClassDecl(node: ast.ClassDeclNode): string {
        let code = '';
        if (node.fields.length > 0) {
            code += `${this.indent()}from dataclasses import dataclass\n`;
            code += `${this.indent()}@dataclass\n`;
        }
        let base = node.extends ? `(${node.extends})` : '';
        code += `${this.indent()}class ${node.name}${base}:\n`;
        this.indentLevel++;
        
        if (node.fields.length === 0 && node.methods.length === 0) {
            code += `${this.indent()}pass\n`;
        } else {
            this.currentClassFields = new Set(node.fields.map(f => f.name));
            for (const field of node.fields) {
                const defVal = field.defaultValue ? ` = ${this.visitExpression(field.defaultValue)}` : '';
                code += `${this.indent()}${field.name}: ${this.mapType(field.fieldType)}${defVal}\n`;
            }
            if (node.fields.length > 0 && node.methods.length > 0) {
                code += '\n';
            }
            for (const method of node.methods) {
                code += this.visitClassMethodDecl(method) + '\n';
            }
            this.currentClassFields = null;
        }
        this.indentLevel--;
        return code;
    }

    private visitClassMethodDecl(node: ast.FunctionDeclNode): string {
        this.currentMethodParams = new Set(node.params.map(p => p.name));
        const paramStrs = ['self'];
        for (const p of node.params) {
            paramStrs.push(`${p.name}: ${this.mapType(p.paramType)}`);
        }
        const params = paramStrs.join(', ');
        const retType = this.mapType(node.returnType);
        let code = `${this.indent()}def ${node.name}(${params}) -> ${retType}:\n`;
        this.indentLevel++;
        code += this.emitBlock(node.body);
        this.indentLevel--;
        this.currentMethodParams = null;
        return code;
    }

    private visitIf(node: ast.IfNode): string {
        let code = `${this.indent()}if ${this.visitExpression(node.condition)}:\n`;
        this.indentLevel++;
        code += this.emitBlock(node.thenBlock);
        this.indentLevel--;
        
        for (const elif of node.elseIfClauses) {
            code += `${this.indent()}elif ${this.visitExpression(elif.condition)}:\n`;
            this.indentLevel++;
            code += this.emitBlock(elif.block);
            this.indentLevel--;
        }
        
        if (node.elseBlock && node.elseBlock.length > 0) {
            code += `${this.indent()}else:\n`;
            this.indentLevel++;
            code += this.emitBlock(node.elseBlock);
            this.indentLevel--;
        }
        return code;
    }

    private visitForLoop(node: ast.ForLoopNode): string {
        const start = this.visitExpression(node.from);
        const end = this.visitExpression(node.to);
        const step = node.step ? `, ${this.visitExpression(node.step)}` : '';
        let code = `${this.indent()}for ${node.variable} in range(${start}, ${end}${step}):\n`;
        this.indentLevel++;
        code += this.emitBlock(node.body);
        this.indentLevel--;
        return code;
    }

    private visitForEach(node: ast.ForEachNode): string {
        const iterable = this.visitExpression(node.iterable);
        let code = `${this.indent()}for ${node.variable} in ${iterable}:\n`;
        this.indentLevel++;
        code += this.emitBlock(node.body);
        this.indentLevel--;
        return code;
    }

    private visitWhile(node: ast.WhileNode): string {
        let code = `${this.indent()}while ${this.visitExpression(node.condition)}:\n`;
        this.indentLevel++;
        code += this.emitBlock(node.body);
        this.indentLevel--;
        return code;
    }

    private visitTryCatch(node: ast.TryCatchNode): string {
        let code = `${this.indent()}try:\n`;
        this.indentLevel++;
        code += this.emitBlock(node.tryBlock);
        this.indentLevel--;
        
        for (const c of node.catchClauses) {
            code += `${this.indent()}except ${this.mapType(c.errorType)} as ${c.errorName}:\n`;
            this.indentLevel++;
            code += this.emitBlock(c.block);
            this.indentLevel--;
        }
        
        if (node.finallyBlock && node.finallyBlock.length > 0) {
            code += `${this.indent()}finally:\n`;
            this.indentLevel++;
            code += this.emitBlock(node.finallyBlock);
            this.indentLevel--;
        }
        return code;
    }

    private visitReturn(node: ast.ReturnNode): string {
        if (node.value) {
            return `${this.indent()}return ${this.visitExpression(node.value)}`;
        }
        return `${this.indent()}return`;
    }

    private visitPrint(node: ast.PrintNode): string {
        return `${this.indent()}print(${this.visitExpression(node.value)})`;
    }

    private visitImport(node: ast.ImportNode): string {
        if (node.alias) {
            return `${this.indent()}import ${node.module} as ${node.alias}`;
        }
        return `${this.indent()}import ${node.module}`;
    }

    private visitAppend(node: ast.AppendNode): string {
        const target = this.visitExpression(node.target);
        const value = this.visitExpression(node.value);
        return `${this.indent()}${target}.append(${value})`;
    }

    private visitFilter(node: ast.FilterNode): string {
        const target = this.visitExpression(node.target);
        const cond = this.visitExpression(node.condition);
        return `${this.indent()}${target} = [x for x in ${target} if ${cond}]`;
    }

    private visitSort(node: ast.SortNode): string {
        const target = this.visitExpression(node.target);
        const by = this.visitExpression(node.by);
        const reverse = node.order === 'DESC' ? 'True' : 'False';
        return `${this.indent()}${target}.sort(key=${by}, reverse=${reverse})`;
    }

    private visitMapOperation(node: ast.MapOperationNode): string {
        const target = this.visitExpression(node.target);
        const using = this.visitExpression(node.using);
        return `${this.indent()}${target} = list(map(${using}, ${target}))`;
    }

    private visitReduce(node: ast.ReduceNode): string {
        const target = this.visitExpression(node.target);
        const op = this.visitExpression(node.operation);
        const init = this.visitExpression(node.initial);
        return `${this.indent()}import functools\n${this.indent()}${target} = functools.reduce(${op}, ${target}, ${init})`;
    }

    private visitAssert(node: ast.AssertNode): string {
        let code = `${this.indent()}assert ${this.visitExpression(node.condition)}`;
        if (node.message) {
            code += `, ${this.visitExpression(node.message)}`;
        }
        return code;
    }

    private visitRawCode(node: ast.RawCodeNode): string {
        if (node.language === 'PYTHON') {
            const lines = node.code.split('\n');
            return lines.map((l: string) => this.indent() + l).join('\n');
        } else {
            return `${this.indent()}# RAW ${node.language}: ${node.code.replace(/\n/g, ' ')}`;
        }
    }

    private emitBlock(statements: ast.StatementNode[]): string {
        if (statements.length === 0) return `${this.indent()}pass\n`;
        let code = '';
        for (const stmt of statements) {
            code += this.visitStatement(stmt) + '\n';
        }
        return code;
    }

    private visitExpression(node: ast.ExpressionNode): string {
        switch (node.type) {
            case 'BinaryExpr': return this.visitBinaryExpr(node);
            case 'UnaryExpr': return this.visitUnaryExpr(node);
            case 'Literal': return this.visitLiteral(node);
            case 'Identifier':
                if (this.currentClassFields && this.currentClassFields.has(node.name) && (!this.currentMethodParams || !this.currentMethodParams.has(node.name))) {
                    return `self.${node.name}`;
                }
                return node.name;
            case 'FunctionCall': return this.visitFunctionCall(node);
            case 'MethodCall': return this.visitMethodCall(node);
            case 'ListLiteral': return this.visitListLiteral(node);
            case 'MapLiteral': return this.visitMapLiteral(node);
            case 'Lambda': return this.visitLambda(node);
            case 'Ternary': return this.visitTernary(node);
            case 'Cast': return this.visitCast(node);
            case 'NewObject': return this.visitNewObject(node);
            case 'MemberAccess': return this.visitMemberAccess(node);
            case 'AwaitExpr': return `await ${this.visitExpression(node.expr)}`;
            default: return `/* unknown expr */`;
        }
    }

    private visitBinaryExpr(node: ast.BinaryExprNode): string {
        const left = this.visitExpression(node.left);
        const right = this.visitExpression(node.right);
        let op = node.operator;
        if (op === 'AND') op = 'and';
        if (op === 'OR') op = 'or';
        if (op === 'CONCAT') op = '+';
        return `(${left} ${op} ${right})`;
    }

    private visitUnaryExpr(node: ast.UnaryExprNode): string {
        const inner = this.visitExpression(node.operand);
        let op = node.operator;
        if (op === 'NOT') op = 'not ';
        return `(${op}${inner})`;
    }

    private visitLiteral(node: ast.LiteralNode): string {
        if (node.valueType === 'String') return `"${node.value}"`;
        if (node.valueType === 'Bool') return node.value ? 'True' : 'False';
        if (node.valueType === 'Null') return 'None';
        return String(node.value);
    }

    private visitFunctionCall(node: ast.FunctionCallNode): string {
        const args = node.args.map((a: ast.ExpressionNode) => this.visitExpression(a)).join(', ');
        return `${node.name}(${args})`;
    }

    private visitMethodCall(node: ast.MethodCallNode): string {
        const target = this.visitExpression(node.target);
        const args = node.args.map((a: ast.ExpressionNode) => this.visitExpression(a)).join(', ');
        return `${target}.${node.methodName}(${args})`;
    }

    private visitListLiteral(node: ast.ListLiteralNode): string {
        const elements = node.elements.map((e: ast.ExpressionNode) => this.visitExpression(e)).join(', ');
        return `[${elements}]`;
    }

    private visitMapLiteral(node: ast.MapLiteralNode): string {
        const entries = node.entries.map((e: { key: ast.ExpressionNode; value: ast.ExpressionNode }) => `${this.visitExpression(e.key)}: ${this.visitExpression(e.value)}`).join(', ');
        return `{${entries}}`;
    }

    private visitLambda(node: ast.LambdaNode): string {
        const params = node.params.map((p: ast.ParamNode) => p.name).join(', ');
        if (!Array.isArray(node.body)) {
            const body = this.visitExpression(node.body);
            return `lambda ${params}: ${body}`;
        }
        return `lambda ${params}: None # unsupported multi-line lambda`;
    }

    private visitTernary(node: ast.TernaryNode): string {
        const cond = this.visitExpression(node.condition);
        const trueExpr = this.visitExpression(node.trueExpr);
        const falseExpr = this.visitExpression(node.falseExpr);
        return `(${trueExpr} if ${cond} else ${falseExpr})`;
    }

    private visitCast(node: ast.CastNode): string {
        const t = this.mapType(node.targetType);
        return `${t}(${this.visitExpression(node.expr)})`;
    }

    private visitNewObject(node: ast.NewObjectNode): string {
        const args = node.args.map((a: ast.ExpressionNode) => this.visitExpression(a)).join(', ');
        return `${node.className}(${args})`;
    }

    private visitMemberAccess(node: ast.MemberAccessNode): string {
        return `${this.visitExpression(node.target)}.${node.member}`;
    }

    private mapType(typeNode: ast.TypeNode): string {
        switch (typeNode.kind) {
            case 'Int': return 'int';
            case 'Float': return 'float';
            case 'String': return 'str';
            case 'Bool': return 'bool';
            case 'Char': return 'str';
            case 'Void': return 'None';
            case 'List': {
                const t = typeNode.typeArgs && typeNode.typeArgs[0] ? this.mapType(typeNode.typeArgs[0]) : 'Any';
                return `list[${t}]`;
            }
            case 'Map': {
                const k = typeNode.typeArgs && typeNode.typeArgs[0] ? this.mapType(typeNode.typeArgs[0]) : 'Any';
                const v = typeNode.typeArgs && typeNode.typeArgs[1] ? this.mapType(typeNode.typeArgs[1]) : 'Any';
                return `dict[${k}, ${v}]`;
            }
            case 'Set': {
                const t = typeNode.typeArgs && typeNode.typeArgs[0] ? this.mapType(typeNode.typeArgs[0]) : 'Any';
                return `set[${t}]`;
            }
            case 'Optional': {
                const t = typeNode.typeArgs && typeNode.typeArgs[0] ? this.mapType(typeNode.typeArgs[0]) : 'Any';
                return `${t} | None`;
            }
            default: return typeNode.name;
        }
    }
}

export function emitPython(astNode: ast.ProgramNode, options?: { isSnippet?: boolean }): string {
    const emitter = new PythonEmitter();
    return emitter.emit(astNode);
}
