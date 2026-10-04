import { createToken, Lexer } from 'chevrotain';

export const Identifier = createToken({ name: 'Identifier', pattern: /[a-zA-Z_]\w*/ });

const createKeywordToken = (name: string, pattern: RegExp) => {
    return createToken({
        name,
        pattern,
        longer_alt: Identifier
    });
};

// Keywords
export const DEFINE = createKeywordToken('DEFINE', /DEFINE/);
export const FUNCTION = createKeywordToken('FUNCTION', /FUNCTION/);
export const END = createKeywordToken('END', /END/);
export const DECLARE = createKeywordToken('DECLARE', /DECLARE/);
export const SET = createKeywordToken('SET', /SET/);
export const TO = createKeywordToken('TO', /TO/);
export const AS = createKeywordToken('AS', /AS/);
export const WITH = createKeywordToken('WITH', /WITH/);
export const VALUE = createKeywordToken('VALUE', /VALUE/);
export const FILTER = createKeywordToken('FILTER', /FILTER/);
export const WHERE = createKeywordToken('WHERE', /WHERE/);
export const SORT = createKeywordToken('SORT', /SORT/);
export const BY = createKeywordToken('BY', /BY/);
export const FOR = createKeywordToken('FOR', /FOR/);
export const EACH = createKeywordToken('EACH', /EACH/);
export const IN = createKeywordToken('IN', /IN/);
export const FROM = createKeywordToken('FROM', /FROM/);
export const STEP = createKeywordToken('STEP', /STEP/);
export const WHILE = createKeywordToken('WHILE', /WHILE/);
export const IF = createKeywordToken('IF', /IF/);
export const ELSE = createKeywordToken('ELSE', /ELSE/);
export const RETURN = createKeywordToken('RETURN', /RETURN/);
export const PRINT = createKeywordToken('PRINT', /PRINT/);
export const TRY = createKeywordToken('TRY', /TRY/);
export const CATCH = createKeywordToken('CATCH', /CATCH/);
export const FINALLY = createKeywordToken('FINALLY', /FINALLY/);
export const CLASS = createKeywordToken('CLASS', /CLASS/);
export const EXTENDS = createKeywordToken('EXTENDS', /EXTENDS/);
export const IMPLEMENTS = createKeywordToken('IMPLEMENTS', /IMPLEMENTS/);
export const FIELD = createKeywordToken('FIELD', /FIELD/);
export const APPEND = createKeywordToken('APPEND', /APPEND/);
export const REMOVE = createKeywordToken('REMOVE', /REMOVE/);
export const MAP = createKeywordToken('MAP', /MAP/);
export const REDUCE = createKeywordToken('REDUCE', /REDUCE/);
export const USING = createKeywordToken('USING', /USING/);
export const LAMBDA = createKeywordToken('LAMBDA', /LAMBDA/);
export const ASSERT = createKeywordToken('ASSERT', /ASSERT/);
export const IMPORT = createKeywordToken('IMPORT', /IMPORT/);
export const RAW = createKeywordToken('RAW', /RAW/);
export const CAST = createKeywordToken('CAST', /CAST/);
export const NEW = createKeywordToken('NEW', /NEW/);
export const CALL = createKeywordToken('CALL', /CALL/);
export const NOTE = createKeywordToken('NOTE', /NOTE/);
export const MESSAGE = createKeywordToken('MESSAGE', /MESSAGE/);
export const IS = createKeywordToken('IS', /IS/);
export const INSTANCE = createKeywordToken('INSTANCE', /INSTANCE/);
export const OF = createKeywordToken('OF', /OF/);
export const CONTAINS = createKeywordToken('CONTAINS', /CONTAINS/);
export const FLATTEN = createKeywordToken('FLATTEN', /FLATTEN/);
export const SLICE = createKeywordToken('SLICE', /SLICE/);
export const REVERSE = createKeywordToken('REVERSE', /REVERSE/);
export const UNIQUE = createKeywordToken('UNIQUE', /UNIQUE/);
export const ZIP = createKeywordToken('ZIP', /ZIP/);
export const MERGE = createKeywordToken('MERGE', /MERGE/);
export const PUT = createKeywordToken('PUT', /PUT/);
export const INTO = createKeywordToken('INTO', /INTO/);
export const GET = createKeywordToken('GET', /GET/);
export const KEY = createKeywordToken('KEY', /KEY/);
export const KEYS = createKeywordToken('KEYS', /KEYS/);
export const VALUES = createKeywordToken('VALUES', /VALUES/);
export const LENGTH = createKeywordToken('LENGTH', /LENGTH/);
export const ITEM = createKeywordToken('ITEM', /ITEM/);
export const AT = createKeywordToken('AT', /AT/);
export const INITIAL = createKeywordToken('INITIAL', /INITIAL/);
export const DEFAULT = createKeywordToken('DEFAULT', /DEFAULT/);
export const NOT = createKeywordToken('NOT', /NOT/);
export const AND = createKeywordToken('AND', /AND/);
export const OR = createKeywordToken('OR', /OR/);
export const CONCAT = createKeywordToken('CONCAT', /CONCAT/);
export const SPLIT = createKeywordToken('SPLIT', /SPLIT/);
export const REPLACE = createKeywordToken('REPLACE', /REPLACE/);
export const TRIM = createKeywordToken('TRIM', /TRIM/);
export const UPPER = createKeywordToken('UPPER', /UPPER/);
export const LOWER = createKeywordToken('LOWER', /LOWER/);
export const STARTS = createKeywordToken('STARTS', /STARTS/);
export const ENDS = createKeywordToken('ENDS', /ENDS/);
export const SUBSTRING = createKeywordToken('SUBSTRING', /SUBSTRING/);
export const ASC = createKeywordToken('ASC', /ASC/);
export const DESC = createKeywordToken('DESC', /DESC/);
export const PYTHON = createKeywordToken('PYTHON', /PYTHON/);
export const JAVA = createKeywordToken('JAVA', /JAVA/);
export const CPP = createKeywordToken('CPP', /CPP/);
export const VOID = createKeywordToken('VOID', /VOID/);

// Type Keywords
export const INT_TYPE = createKeywordToken('INT_TYPE', /Int/);
export const FLOAT_TYPE = createKeywordToken('FLOAT_TYPE', /Float/);
export const STRING_TYPE = createKeywordToken('STRING_TYPE', /String/);
export const BOOL_TYPE = createKeywordToken('BOOL_TYPE', /Bool/);
export const CHAR_TYPE = createKeywordToken('CHAR_TYPE', /Char/);

// Literals
export const TRUE = createKeywordToken('TRUE', /True/);
export const FALSE = createKeywordToken('FALSE', /False/);
export const NULL_LITERAL = createKeywordToken('NULL_LITERAL', /Null/);
export const FLOAT_LITERAL = createToken({ name: 'FLOAT_LITERAL', pattern: /-?\d+\.\d+/ });
export const INTEGER_LITERAL = createToken({ name: 'INTEGER_LITERAL', pattern: /-?\d+/ });
export const STRING_LITERAL = createToken({ name: 'STRING_LITERAL', pattern: /"(?:[^"\\]|\\.)*"/ });

// Operators
export const PLUS = createToken({ name: 'PLUS', pattern: /\+/ });
export const MINUS = createToken({ name: 'MINUS', pattern: /-/ });
export const POWER = createToken({ name: 'POWER', pattern: /\*\*/ });
export const STAR = createToken({ name: 'STAR', pattern: /\*/ });
export const SLASH = createToken({ name: 'SLASH', pattern: /\// });
export const PERCENT = createToken({ name: 'PERCENT', pattern: /%/ });
export const EQUALS = createToken({ name: 'EQUALS', pattern: /==/ });
export const NOT_EQUALS = createToken({ name: 'NOT_EQUALS', pattern: /!=/ });
export const GTE = createToken({ name: 'GTE', pattern: />=/ });
export const LTE = createToken({ name: 'LTE', pattern: /<=/ });
export const GT = createToken({ name: 'GT', pattern: />/ });
export const LT = createToken({ name: 'LT', pattern: /</ });
export const FAT_ARROW = createToken({ name: 'FAT_ARROW', pattern: /=>/ });
export const ARROW = createToken({ name: 'ARROW', pattern: /->/ });
export const DOT = createToken({ name: 'DOT', pattern: /\./ });

// Delimiters
export const LPAREN = createToken({ name: 'LPAREN', pattern: /\(/ });
export const RPAREN = createToken({ name: 'RPAREN', pattern: /\)/ });
export const LBRACKET = createToken({ name: 'LBRACKET', pattern: /\[/ });
export const RBRACKET = createToken({ name: 'RBRACKET', pattern: /\]/ });
export const LBRACE = createToken({ name: 'LBRACE', pattern: /\{/ });
export const RBRACE = createToken({ name: 'RBRACE', pattern: /\}/ });
export const COMMA = createToken({ name: 'COMMA', pattern: /,/ });
export const COLON = createToken({ name: 'COLON', pattern: /:/ });

// Whitespace and Comments
// NEWLINE must come before WHITESPACE so line breaks aren't consumed by \s+
export const NEWLINE = createToken({
    name: 'NEWLINE',
    pattern: /\n|\r\n?/,
    group: Lexer.SKIPPED
});
export const WHITESPACE = createToken({
    name: 'WHITESPACE',
    pattern: /[ \t]+/,
    group: Lexer.SKIPPED
});

// RAW_CODE_BLOCK must come before COMMENT and keywords so it's matched first
export const RAW_CODE_BLOCK = createToken({
    name: 'RAW_CODE_BLOCK',
    pattern: /RAW\s+(PYTHON|JAVA|CPP)\s*\{[^}]*\}/
});

// COMMENT (NOTE: ...) is skipped — must come before the NOTE keyword token
export const COMMENT = createToken({
    name: 'COMMENT',
    pattern: /NOTE:[^\n\r]*/,
    group: Lexer.SKIPPED
});

export const allTokens = [
    WHITESPACE,
    NEWLINE,
    COMMENT,
    RAW_CODE_BLOCK,

    // Operators with multi-char prefix first
    FAT_ARROW,   // '=>' before '='
    ARROW,       // '->' before '-'
    POWER,       // '**' before '*'
    EQUALS,      // '==' before '='
    NOT_EQUALS,  // '!='
    GTE,         // '>=' before '>'
    LTE,         // '<=' before '<'
    GT,
    LT,
    PLUS,
    MINUS,
    STAR,
    SLASH,
    PERCENT,
    DOT,

    // Delimiters
    LPAREN, RPAREN, LBRACKET, RBRACKET, LBRACE, RBRACE, COMMA, COLON,

    // Keywords: longer prefix keywords MUST precede shorter keywords
    // (e.g., IMPLEMENTS before IN, INSTANCE before IN, ASSERT before AS, etc.)
    IMPLEMENTS,
    SUBSTRING,
    FUNCTION,
    INSTANCE,
    REVERSE,
    FLATTEN,
    INITIAL,
    FINALLY,
    DECLARE,
    REDUCE,
    REMOVE,
    APPEND,
    STARTS,
    VALUES,
    ASSERT,
    EXTENDS,
    DEFAULT,
    CONTAINS,
    REPLACE,
    PYTHON,
    FILTER,
    UNIQUE,
    RETURN,
    STRING_TYPE,
    FLOAT_TYPE,
    NULL_LITERAL,
    LENGTH,
    LAMBDA,
    IMPORT,
    PRINT,
    CLASS,
    FIELD,
    USING,
    WHILE,
    SPLIT,
    LOWER,
    UPPER,
    VALUE,
    WHERE,
    FALSE,
    MERGE,
    MAP,
    SLICE,
    FLOAT_LITERAL,
    INTEGER_LITERAL,
    STRING_LITERAL,
    INT_TYPE,
    BOOL_TYPE,
    CHAR_TYPE,
    DEFINE,
    CATCH,
    CONCAT,
    INTO,
    ENDS,
    NOTE,
    STEP,
    EACH,
    FROM,
    TRUE,
    VOID,
    JAVA,
    CAST,
    KEYS,
    ITEM,
    TRIM,
    SORT,
    CALL,
    WITH,
    ELSE,
    DESC,
    MESSAGE,
    END,
    SET,
    FOR,
    PUT,
    GET,
    KEY,
    NOT,
    AND,
    CPP,
    ASC,
    ZIP,
    TRY,
    NEW,
    AS,
    IN,
    IF,
    OF,
    IS,
    TO,
    BY,
    OR,
    AT,

    // Identifier must come after all keywords
    Identifier,
];
