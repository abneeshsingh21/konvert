import * as ast from '../ast.js';

export class JavaEmitter {
  private indentLevel: number = 0;

  private indent(): string {
    return '    '.repeat(this.indentLevel);
  }

  public emit(program: ast.ProgramNode): string {
    let code = 'import java.util.*;\nimport java.util.stream.*;\n\n';
    code += 'public class Main {\n';
    this.indentLevel++;

    for (const stmt of program.body) {
      code += this.visitStatement(stmt) + '\n';
    }

    this.indentLevel--;
    code += '}\n';
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
        return `${this.indent()}// unhandled statement ${node.type}`;
    }
  }

  private visitVariableDecl(node: ast.VariableDeclNode): string {
    const typeStr = this.mapType(node.varType);
    if (node.initialValue) {
      return `${this.indent()}${typeStr} ${node.name} = ${this.visitExpression(node.initialValue)};`;
    }
    return `${this.indent()}${typeStr} ${node.name};`;
  }

  private visitAssignment(node: ast.AssignmentNode): string {
    return `${this.indent()}${node.name} = ${this.visitExpression(node.value)};`;
  }

  private visitEnumDecl(node: ast.EnumDeclNode): string {
    const members = node.members.join(', ');
    return `${this.indent()}public enum ${node.name} { ${members} }`;
  }

  private visitInterfaceDecl(node: ast.InterfaceDeclNode): string {
    let code = `${this.indent()}public interface ${node.name} {\n`;
    this.indentLevel++;
    for (const m of node.methods) {
      const params = m.params
        .map((p: ast.ParamNode) => `${this.mapType(p.paramType)} ${p.name}`)
        .join(', ');
      code += `${this.indent()}${this.mapType(m.returnType)} ${m.name}(${params});\n`;
    }
    this.indentLevel--;
    code += `${this.indent()}}`;
    return code;
  }

  private visitFunctionDecl(node: ast.FunctionDeclNode): string {
    const params = node.params
      .map((p: ast.ParamNode) => `${this.mapType(p.paramType)} ${p.name}`)
      .join(', ');
    let retType = this.mapType(node.returnType);
    if (node.isAsync) {
      retType = `CompletableFuture<${this.boxType(retType)}>`;
    }
    let code = `${this.indent()}public static ${retType} ${node.name}(${params}) {\n`;
    this.indentLevel++;
    for (const stmt of node.body) {
      code += this.visitStatement(stmt) + '\n';
    }
    this.indentLevel--;
    code += `${this.indent()}}`;
    return code;
  }

  private visitClassDecl(node: ast.ClassDeclNode): string {
    const hasMethods = node.methods && node.methods.length > 0;
    const hasInheritance = !!node.extends || (node.implements && node.implements.length > 0);

    // If pure data record with no inheritance (records can have methods in Java 16+)
    if (!node.extends) {
      const fields = node.fields
        .map((f: ast.FieldNode) => `${this.mapType(f.fieldType)} ${f.name}`)
        .join(', ');
      
      const implClause = (node.implements && node.implements.length > 0)
        ? ` implements ${node.implements.join(', ')}`
        : '';

      if (!hasMethods) {
        return `${this.indent()}public record ${node.name}(${fields})${implClause} {}`;
      }

      let code = `${this.indent()}public record ${node.name}(${fields})${implClause} {\n`;
      this.indentLevel++;
      for (const method of node.methods) {
        code += this.visitMethodDecl(method) + '\n';
      }
      this.indentLevel--;
      code += `${this.indent()}}`;
      return code;
    }

    // Standard Java Class when extending a base class
    const extendsClause = node.extends ? ` extends ${node.extends}` : '';
    const implementsClause = (node.implements && node.implements.length > 0)
      ? ` implements ${node.implements.join(', ')}`
      : '';

    let code = `${this.indent()}public static class ${node.name}${extendsClause}${implementsClause} {\n`;
    this.indentLevel++;

    // Fields
    for (const f of node.fields) {
      const defVal = f.defaultValue ? ` = ${this.visitExpression(f.defaultValue)}` : '';
      code += `${this.indent()}public ${this.mapType(f.fieldType)} ${f.name}${defVal};\n`;
    }

    // Constructor
    if (node.fields.length > 0) {
      const ctorParams = node.fields
        .map((f: ast.FieldNode) => `${this.mapType(f.fieldType)} ${f.name}`)
        .join(', ');
      code += `\n${this.indent()}public ${node.name}(${ctorParams}) {\n`;
      this.indentLevel++;
      for (const f of node.fields) {
        code += `${this.indent()}this.${f.name} = ${f.name};\n`;
      }
      this.indentLevel--;
      code += `${this.indent()}}\n\n`;
      code += `${this.indent()}public ${node.name}() {}\n`;
    }

    // Methods
    for (const method of node.methods) {
      code += '\n' + this.visitMethodDecl(method) + '\n';
    }

    this.indentLevel--;
    code += `${this.indent()}}`;
    return code;
  }

  private visitMethodDecl(node: ast.FunctionDeclNode): string {
    const params = node.params
      .map((p: ast.ParamNode) => `${this.mapType(p.paramType)} ${p.name}`)
      .join(', ');
    const retType = this.mapType(node.returnType);
    let code = `${this.indent()}public ${retType} ${node.name}(${params}) {\n`;
    this.indentLevel++;
    for (const stmt of node.body) {
      code += this.visitStatement(stmt) + '\n';
    }
    this.indentLevel--;
    code += `${this.indent()}}`;
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
    let code = `${this.indent()}for (var ${node.variable} : ${iter}) {\n`;
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
      const errType = clause.errorType.name === 'String' ? 'Exception' : this.mapType(clause.errorType);
      code += ` catch (${errType} ${clause.errorName}) {\n`;
      this.indentLevel++;
      code += this.emitBlock(clause.block);
      this.indentLevel--;
      code += `${this.indent()}}`;
    }

    if (node.finallyBlock && node.finallyBlock.length > 0) {
      code += ` finally {\n`;
      this.indentLevel++;
      code += this.emitBlock(node.finallyBlock);
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
    return `${this.indent()}System.out.println(${this.visitExpression(node.value)});`;
  }

  private visitAppend(node: ast.AppendNode): string {
    return `${this.indent()}${this.visitExpression(node.target)}.add(${this.visitExpression(node.value)});`;
  }

  private visitFilter(node: ast.FilterNode): string {
    const target = this.visitExpression(node.target);
    const cond = this.visitExpression(node.condition);
    return `${this.indent()}${target} = ${target}.stream().filter(x -> ${cond}).toList();`;
  }

  private visitSort(node: ast.SortNode): string {
    const target = this.visitExpression(node.target);
    const order = node.order === 'DESC' ? '.reversed()' : '';
    return `${this.indent()}${target}.sort(Comparator.naturalOrder()${order});`;
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
        if (node.valueType === 'String') return `"${node.value}"`;
        if (node.valueType === 'Bool') return node.value ? 'true' : 'false';
        if (node.valueType === 'Null') return 'null';
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
        return `new ${node.className}(${args})`;
      }
      case 'ListLiteral': {
        if (node.elements.length === 0) {
          return `new ArrayList<>()`;
        }
        const items = node.elements.map((e: ast.ExpressionNode) => this.visitExpression(e)).join(', ');
        return `new ArrayList<>(List.of(${items}))`;
      }
      case 'MapLiteral': {
        if (node.entries.length === 0) {
          return `new HashMap<>()`;
        }
        const entries = node.entries
          .map((e: { key: ast.ExpressionNode; value: ast.ExpressionNode }) =>
            `Map.entry(${this.visitExpression(e.key)}, ${this.visitExpression(e.value)})`
          )
          .join(', ');
        return `new HashMap<>(Map.ofEntries(${entries}))`;
      }
      case 'Lambda': {
        const params = node.params.map((p: ast.ParamNode) => p.name).join(', ');
        if (!Array.isArray(node.body)) {
          return `(${params}) -> ${this.visitExpression(node.body)}`;
        }
        return `(${params}) -> null`;
      }
      case 'Ternary': {
        return `(${this.visitExpression(node.condition)} ? ${this.visitExpression(node.trueExpr)} : ${this.visitExpression(node.falseExpr)})`;
      }
      case 'Cast': {
        return `((${this.mapType(node.targetType)}) (${this.visitExpression(node.expr)}))`;
      }
      case 'AwaitExpr': {
        return `${this.visitExpression(node.expr)}.join()`;
      }
      default:
        return 'null';
    }
  }

  private boxType(typeName: string): string {
    switch (typeName) {
      case 'int': return 'Integer';
      case 'double': return 'Double';
      case 'float': return 'Float';
      case 'boolean': return 'Boolean';
      case 'char': return 'Character';
      case 'long': return 'Long';
      case 'byte': return 'Byte';
      case 'short': return 'Short';
      default: return typeName;
    }
  }

  private mapType(t: ast.TypeNode, boxed: boolean = false): string {
    const typeName = t.name || t.kind;
    switch (typeName) {
      case 'Int':
        return boxed ? 'Integer' : 'int';
      case 'Float':
        return boxed ? 'Double' : 'double';
      case 'String':
        return 'String';
      case 'Bool':
        return boxed ? 'Boolean' : 'boolean';
      case 'Char':
        return boxed ? 'Character' : 'char';
      case 'Void':
        return 'void';
      case 'List': {
        const inner = t.typeArgs && t.typeArgs[0] ? this.mapType(t.typeArgs[0], true) : 'Object';
        return `List<${this.boxType(inner)}>`;
      }
      case 'Set': {
        const inner = t.typeArgs && t.typeArgs[0] ? this.mapType(t.typeArgs[0], true) : 'Object';
        return `Set<${this.boxType(inner)}>`;
      }
      case 'Map': {
        const keyType = t.typeArgs && t.typeArgs[0] ? this.mapType(t.typeArgs[0], true) : 'String';
        const valType = t.typeArgs && t.typeArgs[1] ? this.mapType(t.typeArgs[1], true) : 'Object';
        return `Map<${this.boxType(keyType)}, ${this.boxType(valType)}>`;
      }
      default:
        return typeName || 'Object';
    }
  }
}

export function emitJava(program: ast.ProgramNode): string {
  const emitter = new JavaEmitter();
  return emitter.emit(program);
}
