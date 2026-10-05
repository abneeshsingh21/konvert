import { parseCNL } from './parser.js';
import { emitPython } from './emitters/pythonEmitter.js';
import { emitJava } from './emitters/javaEmitter.js';
import { emitCpp } from './emitters/cppEmitter.js';
import { IntentNormalizer } from '../core/intentNormalizer.js';
import * as ast from './ast.js';

function parseWithIntentNormalization(input: string): ast.ParseResult {
    const normalized = IntentNormalizer.normalize(input);
    let parseResult = parseCNL(normalized);
    if (parseResult.errors.length > 0 && normalized !== input) {
        const rawResult = parseCNL(input);
        if (rawResult.errors.length === 0) {
            parseResult = rawResult;
        }
    }
    return parseResult;
}

export function compileToPython(input: string): { code: string; errors: ast.DiagnosticError[] } {
    const parseResult = parseWithIntentNormalization(input);
    if (parseResult.errors.length > 0) {
        return { code: '', errors: parseResult.errors };
    }
    const code = emitPython(parseResult.program);
    return { code, errors: [] };
}

export function compileToJava(input: string): { code: string; errors: ast.DiagnosticError[] } {
    const parseResult = parseWithIntentNormalization(input);
    if (parseResult.errors.length > 0) {
        return { code: '', errors: parseResult.errors };
    }
    const code = emitJava(parseResult.program);
    return { code, errors: [] };
}

export function compileToCpp(input: string): { code: string; errors: ast.DiagnosticError[] } {
    const parseResult = parseWithIntentNormalization(input);
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
    const parseResult = parseWithIntentNormalization(input);
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

export function compileSnippetToPython(input: string): { code: string; errors: ast.DiagnosticError[] } {
    const parseResult = parseWithIntentNormalization(input);
    if (parseResult.errors.length > 0) {
        return { code: '', errors: parseResult.errors };
    }
    const code = emitPython(parseResult.program, { isSnippet: true });
    return { code, errors: [] };
}

export function compileSnippetToJava(input: string): { code: string; errors: ast.DiagnosticError[] } {
    const parseResult = parseWithIntentNormalization(input);
    if (parseResult.errors.length > 0) {
        return { code: '', errors: parseResult.errors };
    }
    const code = emitJava(parseResult.program, { isSnippet: true });
    return { code, errors: [] };
}

export function compileSnippetToCpp(input: string): { code: string; errors: ast.DiagnosticError[] } {
    const parseResult = parseWithIntentNormalization(input);
    if (parseResult.errors.length > 0) {
        return { code: '', errors: parseResult.errors };
    }
    const code = emitCpp(parseResult.program, { isSnippet: true });
    return { code, errors: [] };
}

export function compileSnippetForLang(input: string, langId: string): { code: string; errors: ast.DiagnosticError[] } {
    if (langId === 'java') {
        return compileSnippetToJava(input);
    } else if (langId === 'cpp' || langId === 'c') {
        return compileSnippetToCpp(input);
    } else {
        return compileSnippetToPython(input);
    }
}

export function compileToPythonFromAST(astNode: ast.ProgramNode): string {
    return emitPython(astNode);
}

export { parseCNL, emitPython, emitJava, emitCpp, IntentNormalizer };
export * from './projectCompiler.js';
export * from './ast.js';
