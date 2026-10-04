import { parseCNL } from './parser.js';
import { emitPython } from './emitters/pythonEmitter.js';
import { emitJava } from './emitters/javaEmitter.js';
import { emitCpp } from './emitters/cppEmitter.js';
import * as ast from './ast.js';

export function compileToPython(input: string): { code: string; errors: ast.DiagnosticError[] } {
    const parseResult = parseCNL(input);
    if (parseResult.errors.length > 0) {
        return { code: '', errors: parseResult.errors };
    }
    const code = emitPython(parseResult.program);
    return { code, errors: [] };
}

export function compileToJava(input: string): { code: string; errors: ast.DiagnosticError[] } {
    const parseResult = parseCNL(input);
    if (parseResult.errors.length > 0) {
        return { code: '', errors: parseResult.errors };
    }
    const code = emitJava(parseResult.program);
    return { code, errors: [] };
}

export function compileToCpp(input: string): { code: string; errors: ast.DiagnosticError[] } {
    const parseResult = parseCNL(input);
    if (parseResult.errors.length > 0) {
        return { code: '', errors: parseResult.errors };
    }
    const code = emitCpp(parseResult.program);
    return { code, errors: [] };
}

export function compileAll(input: string): {
    python: string;
    java: string;
    cpp: string;
    errors: ast.DiagnosticError[];
} {
    const parseResult = parseCNL(input);
    if (parseResult.errors.length > 0) {
        return { python: '', java: '', cpp: '', errors: parseResult.errors };
    }
    return {
        python: emitPython(parseResult.program),
        java: emitJava(parseResult.program),
        cpp: emitCpp(parseResult.program),
        errors: []
    };
}

export function compileToPythonFromAST(astNode: ast.ProgramNode): string {
    return emitPython(astNode);
}

export { parseCNL, emitPython, emitJava, emitCpp };
export * from './ast.js';
