import * as ast from '../ast.js';

export class CppEmitter {
  private indentLevel: number = 0;

  private indent(): string {
    return '    '.repeat(this.indentLevel);
  }

  public emit(program: ast.ProgramNode): string {
    let code = '#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\n#include <ranges>\n\n';

    for (const stmt of program.body) {
      code += this.visitStatement(stmt) + '\n';
    }

    return code;
  }

  private visitStatement(node: ast.StatementNode): string {
    switch (node.type) {
      case 'VariableDecl':
        return this.visitVariableDecl(node);
      case 'Assignment':
        return this.visitAssignment(node);
      case 'FunctionDecl':
        return this.visitFunctionDecl(node);
      case 'ClassDecl':
        return this.visitClassDecl(node);
      case 'If':
        return this.visitIf(node);
      case 'ForLoop':
        return this.visitForLoop(node);
      case 'ForEach':
        return this.visitForEach(node);
      case 'While':
        return this.visitWhile(node);
      case 'TryCatch':
        return this.visitTryCatch(node);
      case 'Return':
        return this.visitReturn(node);
      case 'Print':
        return this.visitPrint(node);
      case 'Append':
        return this.visitAppend(node);
      case 'Filter':
        return this.visitFilter(node);
      case 'Sort':
        return this.visitSort(node);
      default:
        if ('operator' in node || 'name' in node || 'valueType' in node) {
          return `${this.indent()}${this.visitExpression(node as ast.ExpressionNode)};`;
        }
        return `${this.indent()}// unhandled ${node.type}`;
    }
  }

  private visitVariableDecl(node: ast.VariableDeclNode): string {
    const t = this.mapType(node.varType);
    if (node.initialValue) {
      return `${this.indent()}${t} ${node.name} = ${this.visitExpression(node.initialValue)};`;
    }
    return `${this.indent()}${t} ${node.name};`;
  }

  private visitAssignment(node: ast.AssignmentNode): string {
    return `${this.indent()}${node.name} = ${this.visitExpression(node.value)};`;
  }

  private visitFunctionDecl(node: ast.FunctionDeclNode): string {
    const params = node.params
      .map((p: ast.ParamNode) => `${this.mapType(p.paramType)} ${p.name}`)
      .join(', ');
    const retType = this.mapType(node.returnType);
    let code = `${this.indent()}${retType} ${node.name}(${params}) {\n`;
    this.indentLevel++;
    for (const stmt of node.body) {
      code += this.visitStatement(stmt) + '\n';
    }
    this.indentLevel--;
    code += `${this.indent()}}`;
    return code;
  }

  private visitClassDecl(node: ast.ClassDeclNode): string {
    let code = `${this.indent()}struct ${node.name} {\n`;
    this.indentLevel++;
    for (const f of node.fields) {
      code += `${this.indent()}${this.mapType(f.fieldType)} ${f.name};\n`;
    }
    this.indentLevel--;
    code += `${this.indent()}};`;
    return code;
  }

  private visitIf(node: ast.IfNode): string {
    let code = `${this.indent()}if (${this.visitExpression(node.condition)}) {\n`;
    this.indentLevel++;
    code += this.emitBlock(node.thenBlock);
    this.indentLevel--;
    code += `${this.indent()}}`;

    for (const clause of node.elseIfClauses) {
      code += ` else if (${this.visitExpression(clause.condition)}) {\n`;
      this.indentLevel++;
      code += this.emitBlock(clause.block);
      this.indentLevel--;
      code += `${this.indent()}}`;
    }

    if (node.elseBlock && node.elseBlock.length > 0) {
      code += ` else {\n`;
      this.indentLevel++;
      code += this.emitBlock(node.elseBlock);
      this.indentLevel--;
      code += `${this.indent()}}`;
    }
    return code;
  }

  private visitForLoop(node: ast.ForLoopNode): string {
    const from = this.visitExpression(node.from);
    const to = this.visitExpression(node.to);
    const step = node.step ? this.visitExpression(node.step) : '1';
    let code = `${this.indent()}for (int ${node.variable} = ${from}; ${node.variable} < ${to}; ${node.variable} += ${step}) {\n`;
    this.indentLevel++;
    code += this.emitBlock(node.body);
    this.indentLevel--;
    code += `${this.indent()}}`;
    return code;
  }

  private visitForEach(node: ast.ForEachNode): string {
    const iter = this.visitExpression(node.iterable);
    let code = `${this.indent()}for (const auto& ${node.variable} : ${iter}) {\n`;
    this.indentLevel++;
    code += this.emitBlock(node.body);
    this.indentLevel--;
    code += `${this.indent()}}`;
    return code;
  }

  private visitWhile(node: ast.WhileNode): string {
    let code = `${this.indent()}while (${this.visitExpression(node.condition)}) {\n`;
    this.indentLevel++;
    code += this.emitBlock(node.body);
    this.indentLevel--;
    code += `${this.indent()}}`;
    return code;
  }

  private visitTryCatch(node: ast.TryCatchNode): string {
    let code = `${this.indent()}try {\n`;
    this.indentLevel++;
    code += this.emitBlock(node.tryBlock);
    this.indentLevel--;
    code += `${this.indent()}}`;

    for (const clause of node.catchClauses) {
      code += ` catch (const std::exception& ${clause.errorName}) {\n`;
      this.indentLevel++;
      code += this.emitBlock(clause.block);
      this.indentLevel--;
      code += `${this.indent()}}`;
    }
    return code;
  }

  private visitReturn(node: ast.ReturnNode): string {
    if (node.value) {
      return `${this.indent()}return ${this.visitExpression(node.value)};`;
    }
    return `${this.indent()}return;`;
  }

  private visitPrint(node: ast.PrintNode): string {
    return `${this.indent()}std::cout << ${this.visitExpression(node.value)} << std::endl;`;
  }

  private visitAppend(node: ast.AppendNode): string {
    return `${this.indent()}${this.visitExpression(node.target)}.push_back(${this.visitExpression(node.value)});`;
  }

  private visitFilter(node: ast.FilterNode): string {
    const target = this.visitExpression(node.target);
    const cond = this.visitExpression(node.condition);
    return `${this.indent()}${target} = ${target} | std::views::filter([](const auto& x) { return ${cond}; }) | std::ranges::to<std::vector>();`;
  }

  private visitSort(node: ast.SortNode): string {
    const target = this.visitExpression(node.target);
    if (node.order === 'DESC') {
      return `${this.indent()}std::sort(${target}.rbegin(), ${target}.rend());`;
    }
    return `${this.indent()}std::sort(${target}.begin(), ${target}.end());`;
  }

  private emitBlock(statements: ast.StatementNode[]): string {
    if (statements.length === 0) return '';
    let code = '';
    for (const s of statements) {
      code += this.visitStatement(s) + '\n';
    }
    return code;
  }

  private visitExpression(node: ast.ExpressionNode): string {
    switch (node.type) {
      case 'BinaryExpr': {
        let op = node.operator;
        if (op === 'AND') op = '&&';
        if (op === 'OR') op = '||';
        if (op === 'CONCAT') op = '+';
        return `(${this.visitExpression(node.left)} ${op} ${this.visitExpression(node.right)})`;
      }
      case 'UnaryExpr': {
        let op = node.operator === 'NOT' ? '!' : node.operator;
        return `(${op}${this.visitExpression(node.operand)})`;
      }
      case 'Literal':
        if (node.valueType === 'String') return `std::string("${node.value}")`;
        if (node.valueType === 'Bool') return node.value ? 'true' : 'false';
        if (node.valueType === 'Null') return 'nullptr';
        return String(node.value);
      case 'Identifier':
        return node.name;
      case 'FunctionCall': {
        const args = node.args.map((a: ast.ExpressionNode) => this.visitExpression(a)).join(', ');
        return `${node.name}(${args})`;
      }
      case 'ListLiteral': {
        const items = node.elements.map((e: ast.ExpressionNode) => this.visitExpression(e)).join(', ');
        return `{${items}}`;
      }
      default:
        return 'nullptr';
    }
  }

  private mapType(t: ast.TypeNode): string {
    switch (t.name) {
      case 'Int':
        return 'int';
      case 'Float':
        return 'double';
      case 'String':
        return 'std::string';
      case 'Bool':
        return 'bool';
      case 'Void':
        return 'void';
      case 'List': {
        const inner = t.typeArgs && t.typeArgs[0] ? this.mapType(t.typeArgs[0]) : 'auto';
        return `std::vector<${inner}>`;
      }
      default:
        return t.name || 'auto';
    }
  }
}

export function emitCpp(program: ast.ProgramNode): string {
  const emitter = new CppEmitter();
  return emitter.emit(program);
}
