import * as ast from '../ast.js';

export class CppEmitter {
  private indentLevel: number = 0;

  private indent(): string {
    return '    '.repeat(this.indentLevel);
  }

  public emit(program: ast.ProgramNode): string {
    let code = '#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\n#include <ranges>\n#include <map>\n#include <memory>\n#include <future>\n\n';

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
      case 'EnumDecl':
        return this.visitEnumDecl(node);
      case 'InterfaceDecl':
        return this.visitInterfaceDecl(node);
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

  private visitEnumDecl(node: ast.EnumDeclNode): string {
    const members = node.members.join(', ');
    return `${this.indent()}enum class ${node.name} { ${members} };`;
  }

  private visitInterfaceDecl(node: ast.InterfaceDeclNode): string {
    let code = `${this.indent()}struct ${node.name} {\n`;
    this.indentLevel++;
    code += `${this.indent()}virtual ~${node.name}() = default;\n`;
    for (const m of node.methods) {
      const params = m.params
        .map((p: ast.ParamNode) => `${this.mapType(p.paramType)} ${p.name}`)
        .join(', ');
      code += `${this.indent()}virtual ${this.mapType(m.returnType)} ${m.name}(${params}) = 0;\n`;
    }
    this.indentLevel--;
    code += `${this.indent()}};`;
    return code;
  }

  private visitFunctionDecl(node: ast.FunctionDeclNode): string {
    const params = node.params
      .map((p: ast.ParamNode) => `${this.mapType(p.paramType)} ${p.name}`)
      .join(', ');
    let retType = this.mapType(node.returnType);
    if (node.isAsync) {
      retType = `std::future<${retType}>`;
    }
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
    let inheritance = '';
    const bases: string[] = [];
    if (node.extends) bases.push(`public ${node.extends}`);
    if (node.implements) {
      for (const iface of node.implements) bases.push(`public ${iface}`);
    }
    if (bases.length > 0) {
      inheritance = ` : ${bases.join(', ')}`;
    }

    let code = `${this.indent()}struct ${node.name}${inheritance} {\n`;
    this.indentLevel++;
    for (const f of node.fields) {
      const defVal = f.defaultValue ? ` = ${this.visitExpression(f.defaultValue)}` : '';
      code += `${this.indent()}${this.mapType(f.fieldType)} ${f.name}${defVal};\n`;
    }

    if (node.methods && node.methods.length > 0) {
      code += '\n';
      for (const m of node.methods) {
        code += this.visitFunctionDecl(m) + '\n';
      }
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
      case 'MethodCall': {
        const target = this.visitExpression(node.target);
        const args = node.args.map((a: ast.ExpressionNode) => this.visitExpression(a)).join(', ');
        return `${target}.${node.methodName}(${args})`;
      }
      case 'MemberAccess': {
        return `${this.visitExpression(node.target)}.${node.member}`;
      }
      case 'NewObject': {
        const args = node.args.map((a: ast.ExpressionNode) => this.visitExpression(a)).join(', ');
        return `${node.className}{${args}}`;
      }
      case 'ListLiteral': {
        const items = node.elements.map((e: ast.ExpressionNode) => this.visitExpression(e)).join(', ');
        return `{${items}}`;
      }
      case 'MapLiteral': {
        const entries = node.entries
          .map((e: { key: ast.ExpressionNode; value: ast.ExpressionNode }) =>
            `{${this.visitExpression(e.key)}, ${this.visitExpression(e.value)}}`
          )
          .join(', ');
        return `{${entries}}`;
      }
      case 'Lambda': {
        const params = node.params.map((p: ast.ParamNode) => `const auto& ${p.name}`).join(', ');
        if (!Array.isArray(node.body)) {
          return `[&](${params}) { return ${this.visitExpression(node.body)}; }`;
        }
        return `[&](${params}) {}`;
      }
      case 'Ternary': {
        return `(${this.visitExpression(node.condition)} ? ${this.visitExpression(node.trueExpr)} : ${this.visitExpression(node.falseExpr)})`;
      }
      case 'Cast': {
        return `static_cast<${this.mapType(node.targetType)}>(${this.visitExpression(node.expr)})`;
      }
      case 'AwaitExpr': {
        return `${this.visitExpression(node.expr)}.get()`;
      }
      default:
        return 'nullptr';
    }
  }

  private mapType(t: ast.TypeNode): string {
    const typeName = t.name || t.kind;
    switch (typeName) {
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
      case 'Set': {
        const inner = t.typeArgs && t.typeArgs[0] ? this.mapType(t.typeArgs[0]) : 'auto';
        return `std::set<${inner}>`;
      }
      case 'Map': {
        const keyType = t.typeArgs && t.typeArgs[0] ? this.mapType(t.typeArgs[0]) : 'std::string';
        const valType = t.typeArgs && t.typeArgs[1] ? this.mapType(t.typeArgs[1]) : 'auto';
        return `std::map<${keyType}, ${valType}>`;
      }
      default:
        return typeName || 'auto';
    }
  }
}

export function emitCpp(program: ast.ProgramNode): string {
  const emitter = new CppEmitter();
  return emitter.emit(program);
}
