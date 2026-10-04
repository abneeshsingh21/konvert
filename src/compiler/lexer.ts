import { Lexer, ILexingError, IToken } from 'chevrotain';
import { allTokens } from './tokens.js';

const lexer = new Lexer(allTokens, {
    ensureOptimizations: true
});

export interface LexerResult {
    tokens: IToken[];
    errors: ILexingError[];
}

/**
 * Tokenizes the input string using the CNL grammar.
 * @param input The CNL source code to tokenize.
 * @returns LexerResult containing tokens and any lexing errors.
 */
export function tokenize(input: string): LexerResult {
    const lexResult = lexer.tokenize(input);
    return {
        tokens: lexResult.tokens,
        errors: lexResult.errors
    };
}
