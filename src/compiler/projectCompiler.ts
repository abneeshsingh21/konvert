import * as fs from 'fs';
import * as path from 'path';
import { parseCNL } from './parser.js';
import { emitPython } from './emitters/pythonEmitter.js';
import { emitJava } from './emitters/javaEmitter.js';
import { emitCpp } from './emitters/cppEmitter.js';
import * as ast from './ast.js';

export interface ProjectConfig {
  name: string;
  version: string;
  entryPoint: string;
  targets: ('python' | 'java' | 'cpp')[];
  outDir: string;
}

export interface ModuleFile {
  relativePath: string;
  moduleName: string;
  fullPath: string;
  content: string;
  program: ast.ProgramNode;
  errors: ast.DiagnosticError[];
}

export interface ProjectCompileResult {
  success: boolean;
  modules: ModuleFile[];
  totalErrors: number;
  allErrors: { file: string; errors: ast.DiagnosticError[] }[];
  outputFiles: { target: string; filePath: string; content: string }[];
  compilationTimeMs: number;
}

export class ProjectCompiler {
  /**
   * Scans a directory recursively for all .kvt or .cnl files
   */
  static findSourceFiles(dir: string, baseDir: string = dir): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== 'dist' && file !== '.git') {
          results = results.concat(this.findSourceFiles(fullPath, baseDir));
        }
      } else if (file.endsWith('.kvt') || file.endsWith('.cnl') || file.endsWith('.eng') || file.endsWith('.knv')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  /**
   * Initializes a brand-new multi-file Konvert enterprise project
   */
  static initProject(targetDir: string, projectName: string = 'konvert-project'): void {
    fs.mkdirSync(targetDir, { recursive: true });
    const srcDir = path.join(targetDir, 'src');
    const modelsDir = path.join(srcDir, 'models');
    const servicesDir = path.join(srcDir, 'services');

    fs.mkdirSync(modelsDir, { recursive: true });
    fs.mkdirSync(servicesDir, { recursive: true });

    // 1. konvert.json
    const config: ProjectConfig = {
      name: projectName,
      version: '1.0.0',
      entryPoint: 'src/main.kvt',
      targets: ['python', 'java', 'cpp'],
      outDir: 'dist'
    };
    fs.writeFileSync(path.join(targetDir, 'konvert.json'), JSON.stringify(config, null, 2), 'utf-8');

    // 2. src/models/user.kvt
    const userModel = `NOTE: Enterprise User Domain Model

DEFINE CLASS User:
  FIELD id AS String
  FIELD name AS String
  FIELD email AS String
  FIELD age AS Int
  FIELD isActive AS Bool WITH DEFAULT TRUE

  DEFINE FUNCTION isAdult() -> Bool:
    RETURN age >= 18
  END FUNCTION
END CLASS
`;
    fs.writeFileSync(path.join(modelsDir, 'user.kvt'), userModel, 'utf-8');

    // 3. src/services/userService.kvt
    const userService = `NOTE: User Management Business Service

DEFINE CLASS UserService:
  FIELD companyName AS String

  DEFINE FUNCTION filterActiveAdults(users: List<User>) -> List<User>:
    DECLARE result AS List<User>
    FILTER users WHERE age >= 18 AND isActive == TRUE
    SORT users BY age DESC
    RETURN users
  END FUNCTION
END CLASS
`;
    fs.writeFileSync(path.join(servicesDir, 'userService.kvt'), userService, 'utf-8');

    // 4. src/main.kvt
    const mainEntry = `NOTE: Application Entry Point

DEFINE FUNCTION main() -> Void:
  DECLARE users AS List<User> WITH VALUE []
  DECLARE svc AS UserService
  PRINT "Konvert Multi-File Enterprise System Initialized!"
END FUNCTION
`;
    fs.writeFileSync(path.join(srcDir, 'main.kvt'), mainEntry, 'utf-8');
  }

  /**
   * Compiles an entire multi-file project into target languages
   */
  static compileProject(
    projectDir: string,
    targetLang: 'python' | 'java' | 'cpp' | 'all' = 'all',
    customOutDir?: string
  ): ProjectCompileResult {
    const startTime = performance.now();
    const configFile = path.join(projectDir, 'konvert.json');
    let config: ProjectConfig = {
      name: path.basename(projectDir),
      version: '1.0.0',
      entryPoint: 'src/main.kvt',
      targets: ['python', 'java', 'cpp'],
      outDir: customOutDir || 'dist'
    };

    if (fs.existsSync(configFile)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        config = { ...config, ...loaded };
      } catch {
        // Fallback to default config
      }
    }
    if (customOutDir) {
      config.outDir = customOutDir;
    }

    const sourceFiles = this.findSourceFiles(path.join(projectDir, 'src'));
    const modules: ModuleFile[] = [];
    const allErrors: { file: string; errors: ast.DiagnosticError[] }[] = [];
    let totalErrors = 0;

    // Phase 1: Parse all modules
    for (const filePath of sourceFiles) {
      const relPath = path.relative(projectDir, filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const parseResult = parseCNL(content);

      const moduleName = relPath
        .replace(/^src[\\/]/, '')
        .replace(/\.(kvt|cnl|eng|knv)$/, '')
        .replace(/[\\/]/g, '.');

      if (parseResult.errors.length > 0) {
        totalErrors += parseResult.errors.length;
        allErrors.push({ file: relPath, errors: parseResult.errors });
      }

      modules.push({
        relativePath: relPath,
        moduleName,
        fullPath: filePath,
        content,
        program: parseResult.program,
        errors: parseResult.errors
      });
    }

    const outputFiles: { target: string; filePath: string; content: string }[] = [];

    if (totalErrors === 0) {
      const targets = targetLang === 'all' ? ['python', 'java', 'cpp'] : [targetLang];
      const symbolIndex = this.buildSymbolIndex(modules);

      for (const target of targets) {
        if (target === 'python') {
          this.emitPythonProject(projectDir, config, modules, symbolIndex, outputFiles);
        } else if (target === 'java') {
          this.emitJavaProject(projectDir, config, modules, symbolIndex, outputFiles);
        } else if (target === 'cpp') {
          this.emitCppProject(projectDir, config, modules, symbolIndex, outputFiles);
        }
      }
    }

    const duration = performance.now() - startTime;

    return {
      success: totalErrors === 0,
      modules,
      totalErrors,
      allErrors,
      outputFiles,
      compilationTimeMs: Number(duration.toFixed(2))
    };
  }

  /**
   * Emits complete Python Package structure
   */
  private static emitPythonProject(
    projectDir: string,
    config: ProjectConfig,
    modules: ModuleFile[],
    symbolIndex: Map<string, ExportedSymbol>,
    outputFiles: { target: string; filePath: string; content: string }[]
  ): void {
    const baseOut = path.join(projectDir, config.outDir, 'python');
    fs.mkdirSync(baseOut, { recursive: true });

    // 1. pyproject.toml
    const pyproject = `[project]
name = "${config.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}"
version = "${config.version}"
description = "Generated deterministically via Konvert"
dependencies = []
requires-python = ">=3.12"
`;
    outputFiles.push({ target: 'python', filePath: path.join(baseOut, 'pyproject.toml'), content: pyproject });
    fs.writeFileSync(path.join(baseOut, 'pyproject.toml'), pyproject, 'utf-8');

    // 2. Emit each module file
    const createdDirs = new Set<string>();

    for (const mod of modules) {
      const targetRel = mod.relativePath
        .replace(/^src[\\/]/, '')
        .replace(/\.(kvt|cnl|eng|knv)$/, '.py');

      const fullTarget = path.join(baseOut, targetRel);
      const targetDir = path.dirname(fullTarget);

      fs.mkdirSync(targetDir, { recursive: true });

      // Track dir to write __init__.py
      let curr = targetDir;
      while (curr.startsWith(baseOut)) {
        createdDirs.add(curr);
        curr = path.dirname(curr);
      }

      let code = emitPython(mod.program);
      const imports = this.resolvePythonImports(mod, symbolIndex);
      if (imports.length > 0) {
        code = imports.join('\n') + '\n\n' + code;
      }

      outputFiles.push({ target: 'python', filePath: fullTarget, content: code });
      fs.writeFileSync(fullTarget, code, 'utf-8');
    }

    // Write __init__.py in all folders
    for (const d of createdDirs) {
      const initFile = path.join(d, '__init__.py');
      if (!fs.existsSync(initFile)) {
        fs.writeFileSync(initFile, '# Auto-generated package by Konvert\n', 'utf-8');
        outputFiles.push({ target: 'python', filePath: initFile, content: '# Auto-generated package by Konvert\n' });
      }
    }
  }

  /**
   * Emits complete Java Maven project structure
   */
  private static emitJavaProject(
    projectDir: string,
    config: ProjectConfig,
    modules: ModuleFile[],
    symbolIndex: Map<string, ExportedSymbol>,
    outputFiles: { target: string; filePath: string; content: string }[]
  ): void {
    const baseOut = path.join(projectDir, config.outDir, 'java');
    const javaSrc = path.join(baseOut, 'src', 'main', 'java');
    fs.mkdirSync(javaSrc, { recursive: true });

    // 1. pom.xml
    const pom = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.konvert.generated</groupId>
    <artifactId>${config.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}</artifactId>
    <version>${config.version}</version>
    <properties>
        <maven.compiler.source>21</maven.compiler.source>
        <maven.compiler.target>21</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
</project>
`;
    outputFiles.push({ target: 'java', filePath: path.join(baseOut, 'pom.xml'), content: pom });
    fs.writeFileSync(path.join(baseOut, 'pom.xml'), pom, 'utf-8');

    // 2. Emit each module into Java file
    for (const mod of modules) {
      const targetRel = mod.relativePath
        .replace(/^src[\\/]/, '')
        .replace(/\.(kvt|cnl|eng|knv)$/, '.java');

      const fullTarget = path.join(javaSrc, targetRel);
      const targetDir = path.dirname(fullTarget);
      fs.mkdirSync(targetDir, { recursive: true });

      const pkgName = path.dirname(targetRel).replace(/[\\/]/g, '.');
      const code = emitJava(mod.program);

      const header = pkgName && pkgName !== '.' ? `package ${pkgName};\n\n` : '';
      const imports = this.resolveJavaImports(mod, symbolIndex);
      const importBlock = imports.length > 0 ? imports.join('\n') + '\n\n' : '';
      const finalJavaCode = header + importBlock + code;

      outputFiles.push({ target: 'java', filePath: fullTarget, content: finalJavaCode });
      fs.writeFileSync(fullTarget, finalJavaCode, 'utf-8');
    }
  }

  /**
   * Emits complete modern C++20 CMake project structure
   */
  private static emitCppProject(
    projectDir: string,
    config: ProjectConfig,
    modules: ModuleFile[],
    symbolIndex: Map<string, ExportedSymbol>,
    outputFiles: { target: string; filePath: string; content: string }[]
  ): void {
    const baseOut = path.join(projectDir, config.outDir, 'cpp');
    const cppSrc = path.join(baseOut, 'src');
    const cppInc = path.join(baseOut, 'include');
    fs.mkdirSync(cppSrc, { recursive: true });
    fs.mkdirSync(cppInc, { recursive: true });

    // 1. CMakeLists.txt
    const cmake = `cmake_minimum_required(VERSION 3.20)
project(${config.name.replace(/[^a-zA-Z0-9_-]/g, '_')} CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(include)

file(GLOB_RECURSE SOURCES "src/*.cpp")

add_executable(\${PROJECT_NAME} \${SOURCES})
`;
    outputFiles.push({ target: 'cpp', filePath: path.join(baseOut, 'CMakeLists.txt'), content: cmake });
    fs.writeFileSync(path.join(baseOut, 'CMakeLists.txt'), cmake, 'utf-8');

    // 2. Emit each module as C++ file & header
    for (const mod of modules) {
      const targetRel = mod.relativePath
        .replace(/^src[\\/]/, '')
        .replace(/\.(kvt|cnl|eng|knv)$/, '');

      const fullCppTarget = path.join(cppSrc, targetRel + '.cpp');
      const fullHppTarget = path.join(cppInc, targetRel + '.hpp');
      fs.mkdirSync(path.dirname(fullCppTarget), { recursive: true });
      fs.mkdirSync(path.dirname(fullHppTarget), { recursive: true });

      const code = emitCpp(mod.program);
      const includes = this.resolveCppIncludes(mod, symbolIndex);
      const includeBlock = includes.length > 0 ? includes.join('\n') + '\n\n' : '';
      const finalCppCode = includeBlock + code;

      // Header file (.hpp)
      const headerCode = `#pragma once\n\n` + finalCppCode;
      outputFiles.push({ target: 'cpp', filePath: fullHppTarget, content: headerCode });
      fs.writeFileSync(fullHppTarget, headerCode, 'utf-8');

      // Source file (.cpp)
      outputFiles.push({ target: 'cpp', filePath: fullCppTarget, content: finalCppCode });
      fs.writeFileSync(fullCppTarget, finalCppCode, 'utf-8');
    }
  }

  private static buildSymbolIndex(modules: ModuleFile[]): Map<string, ExportedSymbol> {
    const index = new Map<string, ExportedSymbol>();
    for (const mod of modules) {
      const modRel = mod.relativePath
        .replace(/^src[\\/]/, '')
        .replace(/\.(kvt|cnl)$/, '')
        .replace(/\\/g, '/');
      const dir = path.dirname(modRel) === '.' ? '' : path.dirname(modRel).replace(/\\/g, '/');
      const baseName = path.basename(modRel);

      for (const stmt of mod.program.body) {
        if (stmt.type === 'ClassDecl' || stmt.type === 'EnumDecl' || stmt.type === 'InterfaceDecl' || stmt.type === 'FunctionDecl') {
          index.set(stmt.name, {
            name: stmt.name,
            kind: stmt.type === 'ClassDecl' ? 'class' : stmt.type === 'EnumDecl' ? 'enum' : stmt.type === 'InterfaceDecl' ? 'interface' : 'function',
            moduleRelPath: modRel,
            dir,
            baseName
          });
        }
      }
    }
    return index;
  }

  private static findReferencedSymbols(program: ast.ProgramNode): Set<string> {
    const refs = new Set<string>();
    const builtins = new Set(['Int', 'Float', 'String', 'Bool', 'Char', 'Void', 'List', 'Map', 'Set', 'Object', 'auto', 'main']);

    const walkType = (t: ast.TypeNode) => {
      if (!t) return;
      if (t.name && !builtins.has(t.name)) {
        refs.add(t.name);
      }
      if (t.kind && !builtins.has(t.kind)) {
        refs.add(t.kind);
      }
      if (t.typeArgs) {
        for (const arg of t.typeArgs) walkType(arg);
      }
    };

    const walkExpr = (expr: ast.ExpressionNode) => {
      if (!expr) return;
      if (expr.type === 'NewObject') {
        refs.add(expr.className);
        for (const a of expr.args) walkExpr(a);
      } else if (expr.type === 'Cast') {
        walkType(expr.targetType);
        walkExpr(expr.expr);
      } else if (expr.type === 'BinaryExpr') {
        walkExpr(expr.left);
        walkExpr(expr.right);
      } else if (expr.type === 'UnaryExpr') {
        walkExpr(expr.operand);
      } else if (expr.type === 'FunctionCall') {
        if (!builtins.has(expr.name)) refs.add(expr.name);
        for (const a of expr.args) walkExpr(a);
      } else if (expr.type === 'MethodCall') {
        walkExpr(expr.target);
        for (const a of expr.args) walkExpr(a);
      } else if (expr.type === 'MemberAccess') {
        walkExpr(expr.target);
      } else if (expr.type === 'ListLiteral') {
        for (const e of expr.elements) walkExpr(e);
      } else if (expr.type === 'MapLiteral') {
        for (const entry of expr.entries) {
          walkExpr(entry.key);
          walkExpr(entry.value);
        }
      } else if (expr.type === 'Ternary') {
        walkExpr(expr.condition);
        walkExpr(expr.trueExpr);
        walkExpr(expr.falseExpr);
      } else if (expr.type === 'Identifier') {
        if (!builtins.has(expr.name)) refs.add(expr.name);
      }
    };

    const walkStmt = (stmt: ast.StatementNode) => {
      if (!stmt) return;
      if (stmt.type === 'VariableDecl') {
        walkType(stmt.varType);
        if (stmt.initialValue) walkExpr(stmt.initialValue);
      } else if (stmt.type === 'Assignment') {
        walkExpr(stmt.value);
      } else if (stmt.type === 'ClassDecl') {
        if (stmt.extends) refs.add(stmt.extends);
        if (stmt.implements) for (const iface of stmt.implements) refs.add(iface);
        for (const f of stmt.fields) {
          walkType(f.fieldType);
          if (f.defaultValue) walkExpr(f.defaultValue);
        }
        for (const m of stmt.methods) {
          walkStmt(m);
        }
      } else if (stmt.type === 'FunctionDecl') {
        walkType(stmt.returnType);
        for (const p of stmt.params) walkType(p.paramType);
        for (const s of stmt.body) walkStmt(s);
      } else if (stmt.type === 'If') {
        walkExpr(stmt.condition);
        for (const s of stmt.thenBlock) walkStmt(s);
        for (const c of stmt.elseIfClauses) {
          walkExpr(c.condition);
          for (const s of c.block) walkStmt(s);
        }
        if (stmt.elseBlock) for (const s of stmt.elseBlock) walkStmt(s);
      } else if (stmt.type === 'ForLoop') {
        walkExpr(stmt.from);
        walkExpr(stmt.to);
        if (stmt.step) walkExpr(stmt.step);
        for (const s of stmt.body) walkStmt(s);
      } else if (stmt.type === 'ForEach') {
        walkExpr(stmt.iterable);
        for (const s of stmt.body) walkStmt(s);
      } else if (stmt.type === 'While') {
        walkExpr(stmt.condition);
        for (const s of stmt.body) walkStmt(s);
      } else if (stmt.type === 'Return') {
        if (stmt.value) walkExpr(stmt.value);
      } else if (stmt.type === 'Print') {
        walkExpr(stmt.value);
      } else if (stmt.type === 'Append') {
        walkExpr(stmt.value);
        walkExpr(stmt.target);
      } else if (stmt.type === 'Filter') {
        walkExpr(stmt.target);
        walkExpr(stmt.condition);
      } else if (stmt.type === 'Sort') {
        walkExpr(stmt.target);
        walkExpr(stmt.by);
      } else if (this.isExpressionNode(stmt)) {
        walkExpr(stmt as ast.ExpressionNode);
      }
    };

    for (const s of program.body) {
      walkStmt(s);
    }

    return refs;
  }

  private static isExpressionNode(node: any): boolean {
    return ['BinaryExpr', 'UnaryExpr', 'Literal', 'Identifier', 'FunctionCall', 'MethodCall', 'ListLiteral', 'MapLiteral', 'Lambda', 'Ternary', 'Cast', 'NewObject', 'MemberAccess', 'AwaitExpr'].includes(node.type);
  }

  private static resolvePythonImports(mod: ModuleFile, symbolIndex: Map<string, ExportedSymbol>): string[] {
    const currRel = mod.relativePath.replace(/^src[\\/]/, '').replace(/\.(kvt|cnl)$/, '').replace(/\\/g, '/');
    const currDir = path.dirname(currRel) === '.' ? '' : path.dirname(currRel).replace(/\\/g, '/');
    const refs = this.findReferencedSymbols(mod.program);

    const groups = new Map<string, { exp: ExportedSymbol; symbols: Set<string> }>();
    for (const sym of refs) {
      const exp = symbolIndex.get(sym);
      if (exp && exp.moduleRelPath !== currRel) {
        if (!groups.has(exp.moduleRelPath)) {
          groups.set(exp.moduleRelPath, { exp, symbols: new Set() });
        }
        groups.get(exp.moduleRelPath)!.symbols.add(sym);
      }
    }

    const lines: string[] = [];
    for (const [_, { exp, symbols }] of groups) {
      const symList = Array.from(symbols).sort().join(', ');
      if (currDir === exp.dir) {
        lines.push(`from .${exp.baseName} import ${symList}`);
      } else if (currDir === '') {
        const modPath = exp.dir ? `${exp.dir.replace(/\//g, '.')}.${exp.baseName}` : exp.baseName;
        lines.push(`from ${modPath} import ${symList}`);
      } else {
        const modPath = exp.dir ? `${exp.dir.replace(/\//g, '.')}.${exp.baseName}` : exp.baseName;
        lines.push(`from ..${modPath} import ${symList}`);
      }
    }
    return lines.sort();
  }

  private static resolveJavaImports(mod: ModuleFile, symbolIndex: Map<string, ExportedSymbol>): string[] {
    const currRel = mod.relativePath.replace(/^src[\\/]/, '').replace(/\.(kvt|cnl)$/, '').replace(/\\/g, '/');
    const currPkg = path.dirname(currRel).replace(/[\\/]/g, '.');
    const refs = this.findReferencedSymbols(mod.program);

    const imports = new Set<string>();
    for (const sym of refs) {
      const exp = symbolIndex.get(sym);
      if (exp && exp.moduleRelPath !== currRel && (exp.kind === 'class' || exp.kind === 'enum' || exp.kind === 'interface')) {
        const pkg = exp.dir.replace(/[\\/]/g, '.');
        if (pkg && pkg !== '.' && pkg !== currPkg) {
          imports.add(`import ${pkg}.${exp.name};`);
        }
      }
    }
    return Array.from(imports).sort();
  }

  private static resolveCppIncludes(mod: ModuleFile, symbolIndex: Map<string, ExportedSymbol>): string[] {
    const currRel = mod.relativePath.replace(/^src[\\/]/, '').replace(/\.(kvt|cnl)$/, '').replace(/\\/g, '/');
    const refs = this.findReferencedSymbols(mod.program);

    const includes = new Set<string>();
    for (const sym of refs) {
      const exp = symbolIndex.get(sym);
      if (exp && exp.moduleRelPath !== currRel) {
        includes.add(`#include "${exp.moduleRelPath}.hpp"`);
      }
    }
    return Array.from(includes).sort();
  }
}

interface ExportedSymbol {
  name: string;
  kind: 'class' | 'function' | 'enum' | 'interface';
  moduleRelPath: string;
  dir: string;
  baseName: string;
}
