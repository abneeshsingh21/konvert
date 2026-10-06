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

function handleBlockHeaderSnippet(normalized: string, langId: string): string | null {
    const s = normalized.trim();

    // IF header: "IF <cond>:"
    const ifM = s.match(/^IF\s+(.+?)\s*:?$/i);
    if (ifM) {
        const cond = ifM[1].trim();
        if (langId === 'python') return `if ${cond}:`;
        return `if (${cond}) {`;
    }

    // ELSE IF header: "ELSE IF <cond>:"
    const elifM = s.match(/^(?:ELSE\s+IF|ELIF)\s+(.+?)\s*:?$/i);
    if (elifM) {
        const cond = elifM[1].trim();
        if (langId === 'python') return `elif ${cond}:`;
        return `} else if (${cond}) {`;
    }

    // ELSE header: "ELSE:"
    if (/^ELSE\s*:?$/i.test(s)) {
        if (langId === 'python') return `else:`;
        return `} else {`;
    }

    // WHILE header: "WHILE <cond>:"
    const whileM = s.match(/^WHILE\s+(.+?)\s*:?$/i);
    if (whileM) {
        const cond = whileM[1].trim();
        if (langId === 'python') return `while ${cond}:`;
        return `while (${cond}) {`;
    }

    // FOR EACH: "FOR EACH <var> IN <expr>:"
    const forEachM = s.match(/^FOR\s+EACH\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+IN\s+(.+?)\s*:?$/i);
    if (forEachM) {
        const v = forEachM[1];
        const iter = forEachM[2].trim();
        if (langId === 'python') return `for ${v} in ${iter}:`;
        if (langId === 'java') return `for (var ${v} : ${iter}) {`;
        return `for (const auto& ${v} : ${iter}) {`;
    }

    // FOR FROM TO: "FOR <var> FROM <a> TO <b> (STEP <c>)?"
    const forM = s.match(/^FOR\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+FROM\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?\s*:?$/i);
    if (forM) {
        const v = forM[1];
        const from = forM[2].trim();
        const to = forM[3].trim();
        const step = forM[4] ? `, ${forM[4].trim()}` : '';
        if (to.endsWith('- 1') || to.endsWith('-1')) {
            const bound = to.replace(/-\s*1$/, '').trim();
            if (langId === 'python') {
                return `for ${v} in range(${from === '0' ? bound : `${from}, ${bound}`}${step}):`;
            }
            return `for (int ${v} = ${from}; ${v} < ${bound}; ${v}++) {`;
        }
        if (langId === 'python') return `for ${v} in range(${from}, ${to} + 1${step}):`;
        return `for (int ${v} = ${from}; ${v} <= ${to}; ${v}++) {`;
    }

    // FUNCTION header: "DEFINE FUNCTION <name>(<params>) -> <ret>:"
    const fnM = s.match(/^DEFINE\s+FUNCTION\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)\s*->\s*([a-zA-Z_][a-zA-Z0-9_<>]*)\s*:?$/i);
    if (fnM) {
        const name = fnM[1];
        const params = fnM[2].trim();
        const ret = fnM[3].trim();
        if (langId === 'python') {
            const pyParams = params.replace(/:/g, ': ').replace(/Int/g, 'int').replace(/Float/g, 'float').replace(/String/g, 'str').replace(/Bool/g, 'bool');
            const pyRet = ret === 'Void' ? 'None' : ret.toLowerCase();
            return `def ${name}(${pyParams}) -> ${pyRet}:`;
        }
        if (langId === 'java') {
            const jParams = params.split(',').map(p => {
                const parts = p.trim().split(/\s*:\s*/);
                const pType = parts[1] === 'Int' ? 'int' : parts[1] === 'Float' ? 'double' : parts[1] === 'String' ? 'String' : 'var';
                return `${pType} ${parts[0]}`;
            }).join(', ');
            const jRet = ret === 'Void' ? 'void' : ret === 'Int' ? 'int' : ret === 'Float' ? 'double' : 'Object';
            return `public static ${jRet} ${name}(${jParams}) {`;
        }
        const cppParams = params.split(',').map(p => {
            const parts = p.trim().split(/\s*:\s*/);
            const pType = parts[1] === 'Int' ? 'int' : parts[1] === 'Float' ? 'double' : parts[1] === 'String' ? 'string' : 'auto';
            return `${pType} ${parts[0]}`;
        }).join(', ');
        const cppRet = ret === 'Void' ? 'void' : ret === 'Int' ? 'int' : ret === 'Float' ? 'double' : 'auto';
        return `${cppRet} ${name}(${cppParams}) {`;
    }

    // TRY / FINALLY headers
    if (/^TRY\s*:?$/i.test(s)) {
        if (langId === 'python') return `try:`;
        return `try {`;
    }
    if (/^FINALLY\s*:?$/i.test(s)) {
        if (langId === 'python') return `finally:`;
        return `} finally {`;
    }

    // BLOCK CLOSERS: "END IF", "END FOR", "END WHILE", "END FUNCTION", "END CLASS", "}"
    if (/^(?:END\s+(?:IF|FOR|WHILE|FUNCTION|CLASS|TRY)|\})$/i.test(s)) {
        if (langId === 'python') return `# end`;
        return `}`;
    }

    return null;
}

export function compileSnippetToPython(input: string): { code: string; errors: ast.DiagnosticError[] } {
    const normalized = IntentNormalizer.normalize(input);
    const blockCode = handleBlockHeaderSnippet(normalized, 'python');
    if (blockCode) {
        return { code: blockCode, errors: [] };
    }
    const parseResult = parseWithIntentNormalization(input);
    if (parseResult.errors.length > 0) {
        return { code: '', errors: parseResult.errors };
    }
    const code = emitPython(parseResult.program, { isSnippet: true });
    return { code, errors: [] };
}

export function compileSnippetToJava(input: string): { code: string; errors: ast.DiagnosticError[] } {
    const normalized = IntentNormalizer.normalize(input);
    const blockCode = handleBlockHeaderSnippet(normalized, 'java');
    if (blockCode) {
        return { code: blockCode, errors: [] };
    }
    const parseResult = parseWithIntentNormalization(input);
    if (parseResult.errors.length > 0) {
        return { code: '', errors: parseResult.errors };
    }
    const code = emitJava(parseResult.program, { isSnippet: true });
    return { code, errors: [] };
}

export function compileSnippetToCpp(input: string, options?: { useNamespaceStd?: boolean }): { code: string; errors: ast.DiagnosticError[] } {
    const normalized = IntentNormalizer.normalize(input);
    const blockCode = handleBlockHeaderSnippet(normalized, 'cpp');
    if (blockCode) {
        return { code: blockCode, errors: [] };
    }
    const parseResult = parseWithIntentNormalization(input);
    if (parseResult.errors.length > 0) {
        return { code: '', errors: parseResult.errors };
    }
    const code = emitCpp(parseResult.program, { isSnippet: true, useNamespaceStd: options?.useNamespaceStd ?? false });
    return { code, errors: [] };
}

export function compileSnippetForLang(input: string, langId: string, options?: { useNamespaceStd?: boolean }): { code: string; errors: ast.DiagnosticError[] } {
    if (langId === 'java') {
        return compileSnippetToJava(input);
    } else if (langId === 'cpp' || langId === 'c') {
        return compileSnippetToCpp(input, options);
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
