/**
 * Konvert Deterministic Intent Normalizer
 *
 * Normalizes conversational / informal English into formal Controlled Natural Language (CNL)
 * with 0% hallucinations, 0 MB model download, and sub-millisecond execution time.
 */

export class IntentNormalizer {
  /**
   * Normalizes plain English input into valid CNL statements.
   */
  public static normalize(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return trimmed;

    // Split into individual statements / lines if multiline
    const lines = trimmed.split(/\r?\n/);
    const normalizedLines = lines.map((line) => this.normalizeSingleStatement(line));
    return normalizedLines.join('\n');
  }

  private static normalizeSingleStatement(stmt: string): string {
    let s = stmt.trim();
    if (!s) return s;

    // 0. Multi-line block boundaries & keywords
    if (/^(?:define\s+(?:a\s+)?function|def|fn)\b/i.test(s)) {
      s = s.replace(/^(?:define\s+(?:a\s+)?function|def|fn)\b/i, 'DEFINE FUNCTION');
    }
    if (/^(?:end\s+function)\b/i.test(s)) return 'END FUNCTION';
    if (/^(?:define\s+(?:a\s+)?class|class)\b/i.test(s)) {
      s = s.replace(/^(?:define\s+(?:a\s+)?class|class)\b/i, 'DEFINE CLASS');
    }
    if (/^(?:end\s+class)\b/i.test(s)) return 'END CLASS';
    if (/^(?:field)\b/i.test(s)) {
      s = s.replace(/^(?:field)\b/i, 'FIELD')
           .replace(/\b(?:as)\b/i, 'AS')
           .replace(/\b(?:with\s+default)\b/i, 'WITH DEFAULT');
    }

    // 0.1 Type-first variable declarations (e.g. "int a,b", "int a, b", "int a = 10, b = 20", "float x, y", "string s = \"hello\"")
    const typeFirstRegex = /^(int|integer|float|double|string|str|char|bool|boolean|auto|long|short|void|vector<[a-zA-Z_][a-zA-Z0-9_]*>|list<[a-zA-Z_][a-zA-Z0-9_]*>)\s+([a-zA-Z_].*?);?$/i;
    const tfMatch = s.match(typeFirstRegex);
    if (tfMatch && !s.includes('(')) {
      const rawType = tfMatch[1].trim();
      const rawDecls = tfMatch[2].trim();
      const typeName = this.normalizeTypeName(rawType);

      const declItems = this.splitDeclItems(rawDecls);
      if (declItems.length > 0) {
        return declItems.map(item => {
          if (item.value !== undefined) {
            return `DECLARE ${item.name} AS ${typeName} WITH VALUE ${item.value}`;
          } else {
            return `DECLARE ${item.name} AS ${typeName}`;
          }
        }).join('\n');
      }
    }

    // 0.2 Multi-variable declarations: "declare a, b as int", "declare a and b as int", "create x, y as float with value 0"
    const multiDeclMatch = s.match(/^(?:declare|create)\s+([a-zA-Z_][a-zA-Z0-9_,\s\band\b]+)\s+(?:as|of\s+type|:)\s+([a-zA-Z_][a-zA-Z0-9_<>]*)(?:\s*(?:with\s+value\s*=|with\s+value\s+to|with\s+value|=)\s*(.+))?;?$/i);
    if (multiDeclMatch) {
      const rawNames = multiDeclMatch[1];
      const typeName = this.normalizeTypeName(multiDeclMatch[2]);
      const rawVal = multiDeclMatch[3]?.trim();
      const names = rawNames.split(/\s*(?:,|and)\s*/i).map(n => n.trim()).filter(n => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n));
      if (names.length > 0) {
        return names.map(n => {
          return rawVal ? `DECLARE ${n} AS ${typeName} WITH VALUE ${rawVal}` : `DECLARE ${n} AS ${typeName}`;
        }).join('\n');
      }
    }

    // 0.3 C-style functions: "int add(int a, int b) {", "void solve() {"
    const cStyleFnMatch = s.match(/^(int|float|double|string|bool|void)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)\s*\{?$/i);
    if (cStyleFnMatch) {
      const retType = this.normalizeTypeName(cStyleFnMatch[1]);
      const fnName = cStyleFnMatch[2];
      const rawParams = cStyleFnMatch[3].trim();
      const params = rawParams ? rawParams.split(',').map(p => {
        const pParts = p.trim().split(/\s+/);
        if (pParts.length >= 2) {
          const pType = this.normalizeTypeName(pParts[0]);
          const pName = pParts[1];
          return `${pName}: ${pType}`;
        }
        return p.trim();
      }).join(', ') : '';
      return `DEFINE FUNCTION ${fnName}(${params}) -> ${retType}:`;
    }

    // 0.4 C-style control flow: "if (a > b) {", "while (n > 0) {", "for (int i = 0; i < n; i++)"
    const cIfMatch = s.match(/^if\s*\((.+)\)\s*\{?$/i);
    if (cIfMatch) {
      return `IF ${cIfMatch[1].trim()}:`;
    }
    const cWhileMatch = s.match(/^while\s*\((.+)\)\s*\{?$/i);
    if (cWhileMatch) {
      return `WHILE ${cWhileMatch[1].trim()}:`;
    }
    const cForMatch = s.match(/^for\s*\(\s*(?:int\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+?)\s*;\s*\1\s*<\s*(.+?)\s*;\s*\1\+\+\s*\)\s*\{?$/i);
    if (cForMatch) {
      const varName = cForMatch[1];
      const fromVal = cForMatch[2].trim();
      const toVal = cForMatch[3].trim();
      return `FOR ${varName} FROM ${fromVal} TO ${toVal} - 1:`;
    }

    // 0.5 Increments & compound operators: "a++", "a--", "a += 5", "increment a", "decrement a"
    if (/^(?:increment\s+|([a-zA-Z_][a-zA-Z0-9_]*)\+\+;?$)/i.test(s)) {
      const name = s.replace(/^(?:increment\s+)/i, '').replace(/\+\+;?$/, '').trim();
      return `SET ${name} TO ${name} + 1`;
    }
    if (/^(?:decrement\s+|([a-zA-Z_][a-zA-Z0-9_]*)\-\-;?$)/i.test(s)) {
      const name = s.replace(/^(?:decrement\s+)/i, '').replace(/\-\-;?$/, '').trim();
      return `SET ${name} TO ${name} - 1`;
    }
    const compoundMatch = s.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=|\*=|\/=)\s*(.+);?$/);
    if (compoundMatch) {
      const name = compoundMatch[1];
      const op = compoundMatch[2][0];
      const val = compoundMatch[3].trim();
      return `SET ${name} TO ${name} ${op} ${val}`;
    }

    // Conditionals multi-line headers
    if (/^(?:else\s+if|elif)\s+(.+?)\s*:?$/i.test(s)) {
      const cond = s.match(/^(?:else\s+if|elif)\s+(.+?)\s*:?$/i)![1].trim();
      return `ELSE IF ${cond}:`;
    }
    if (/^else\s*:?$/i.test(s)) return 'ELSE:';
    if (/^if\s+(.+?)\s*:?$/i.test(s) && !s.includes(' else ')) {
      const cond = s.match(/^if\s+(.+?)\s*:?$/i)![1].trim();
      return `IF ${cond}:`;
    }
    if (/^(?:end\s+if)\b/i.test(s)) return 'END IF';

    // Loop multi-line headers
    if (/^(?:for\s+each)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+(.+?)\s*:?$/i.test(s) && !s.includes('\n')) {
      const m = s.match(/^(?:for\s+each)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+(.+?)\s*:?$/i)!;
      return `FOR EACH ${m[1]} IN ${m[2].trim()}:`;
    }
    if (/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(.+?)\s+to\s+(.+?)(?:\s+step\s+(.+?))?\s*:?$/i.test(s)) {
      const m = s.match(/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(.+?)\s+to\s+(.+?)(?:\s+step\s+(.+?))?\s*:?$/i)!;
      const stepPart = m[4] ? ` STEP ${m[4].trim()}` : '';
      return `FOR ${m[1]} FROM ${m[2].trim()} TO ${m[3].trim()}${stepPart}:`;
    }
    if (/^while\s+(.+?)\s*:?$/i.test(s) && !s.toUpperCase().startsWith('END WHILE')) {
      const cond = s.match(/^while\s+(.+?)\s*:?$/i)![1].trim();
      return `WHILE ${cond}:`;
    }
    if (/^(?:end\s+for)\b/i.test(s)) return 'END FOR';
    if (/^(?:end\s+while)\b/i.test(s)) return 'END WHILE';

    // Exception handling headers
    if (/^try\s*:?$/i.test(s)) return 'TRY:';
    if (/^catch\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:as|:)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:?$/i.test(s)) {
      const m = s.match(/^catch\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:as|:)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:?$/i)!;
      return `CATCH ${m[1]} AS ${this.normalizeTypeName(m[2])}:`;
    }
    if (/^finally\s*:?$/i.test(s)) return 'FINALLY:';
    if (/^(?:end\s+try)\b/i.test(s)) return 'END TRY';

    if (/^(?:import)\b/i.test(s)) {
      s = s.replace(/^(?:import)\b/i, 'IMPORT').replace(/\b(?:as)\b/i, 'AS');
    }

    // 1. Check if already standard CNL uppercase keyword
    if (/^(DEFINE|DECLARE|SET|IF|ELSE|FOR|WHILE|RETURN|PRINT|TRY|CATCH|FINALLY|FILTER|SORT|MAP|APPEND|REMOVE|ASSERT|IMPORT|RAW)\b/.test(s)) {
      return s;
    }

    // 1.5. Normalizing Append / Push to collection
    // "append 95 to scores" / "add "alice" to names" / "push 95 into scores"
    const appendMatch = s.match(/^(?:append|add|push)\s+(.+?)\s+(?:to|into)\s+([a-zA-Z_][a-zA-Z0-9_]*);?$/i);
    if (appendMatch) {
      const val = appendMatch[1].trim();
      const target = appendMatch[2].trim();
      return `APPEND ${val} TO ${target}`;
    }

    // 2. Normalizing "print ..."
    // Matches: print hello world, print a, b, print "hello world", show hello world, display hello world, cout << ...
    const printMatch = s.match(/^(?:print|show|display|echo|log|cout\s*<<)\s*(.+);?$/i);
    if (printMatch) {
      let content = printMatch[1].trim();
      if (content.endsWith('<< endl')) {
        content = content.replace(/<<\s*endl$/, '').trim();
      }

      // If already enclosed in quotes or parentheses, normalize to PRINT expr
      if ((content.startsWith('"') && content.endsWith('"')) ||
          (content.startsWith("'") && content.endsWith("'"))) {
        return `PRINT ${content}`;
      }
      if (content.startsWith('(') && content.endsWith(')')) {
        return `PRINT ${content.slice(1, -1).trim()}`;
      }

      // If it contains commas, e.g. "a, b" or '"Hello", name'
      if (content.includes(',')) {
        const parts = content.split(',').map(p => p.trim());
        const cnlPrints = parts.map(p => {
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p) || /^[a-zA-Z0-9_\s\+\-\*\/\%]+$/.test(p) || (p.startsWith('"') && p.endsWith('"'))) {
            return `PRINT ${p}`;
          }
          return `PRINT "${p.replace(/"/g, '\\"')}"`;
        });
        return cnlPrints.join('\n');
      }

      // If it's a known single identifier or math expression (e.g. print total, print a + b)
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(content) || /^[a-zA-Z0-9_\s\+\-\*\/\%]+$/.test(content) && /[\+\-\*\/]/.test(content)) {
        return `PRINT ${content}`;
      }

      // Plain English text words without quotes (e.g. print hello world, print welcome to konvert!)
      // Wrap in double quotes!
      return `PRINT "${content.replace(/"/g, '\\"')}"`;
    }

    // 3. Normalizing Variable Declarations
    // "create variable count = 10" / "declare count as int = 10" / "let count = 10" / "var count: int = 10"
    const varDeclMatch = s.match(/^(?:create\s+(?:a\s+)?variable|declare|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+(?:as|of\s+type|:)\s+([a-zA-Z_][a-zA-Z0-9_<>]*))?(?:\s*(?:with\s+value\s*=|with\s+value\s+to|with\s+value|=)\s*(.+))?;?$/i);
    if (varDeclMatch) {
      const name = varDeclMatch[1];
      let typeName = varDeclMatch[2] ? this.normalizeTypeName(varDeclMatch[2]) : 'Auto';
      const rawVal = varDeclMatch[3]?.trim();

      if (rawVal) {
        // Infer type if unspecified
        if (typeName === 'Auto') {
          if (/^-?\d+$/.test(rawVal)) typeName = 'Int';
          else if (/^-?\d+\.\d+$/.test(rawVal)) typeName = 'Float';
          else if (/^(?:true|false)$/i.test(rawVal)) typeName = 'Bool';
          else if (rawVal.startsWith('"') || rawVal.startsWith("'")) typeName = 'String';
          else if (rawVal.startsWith('[') && rawVal.endsWith(']')) typeName = 'List<Int>';
          else typeName = 'Int';
        }
        return `DECLARE ${name} AS ${typeName} WITH VALUE ${rawVal}`;
      } else {
        return `DECLARE ${name} AS ${typeName === 'Auto' ? 'Int' : typeName}`;
      }
    }

    // 4. Normalizing Variable Assignment
    // "set total to 42" / "set total = 42" / "total = 42" / "calculate total = price * 1.18" / "compute sum = a + b"
    const assignMatch = s.match(/^(?:set\s+|calculate\s+|compute\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:to|=)\s*(.+);?$/i);
    if (assignMatch) {
      const name = assignMatch[1];
      const value = assignMatch[2].trim();
      return `SET ${name} TO ${value}`;
    }

    // 5. Normalizing Return Statements
    // "return x + y" / "return true" / "return 0;"
    const returnMatch = s.match(/^(?:return)\s*(.+)?;?$/i);
    if (returnMatch) {
      return returnMatch[1] ? `RETURN ${returnMatch[1].trim()}` : `RETURN`;
    }

    // 6. Normalizing Data Filtering
    // "filter users where age >= 18" / "filter items where item > 5"
    const filterMatch = s.match(/^(?:filter)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:where)\s+(.+);?$/i);
    if (filterMatch) {
      const target = filterMatch[1];
      const cond = filterMatch[2].trim();
      return `FILTER ${target} WHERE ${cond}`;
    }

    // 7. Normalizing Loops
    // "for each item in users: print item"
    const forEachMatch = s.match(/^(?:for\s+each)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/i);
    if (forEachMatch) {
      const item = forEachMatch[1];
      const list = forEachMatch[2];
      const body = this.normalizeSingleStatement(forEachMatch[3].trim());
      return `FOR EACH ${item} IN ${list}:\n  ${body}\nEND FOR`;
    }

    // 8. Normalizing Function Definitions
    // "define function add(a as int, b as int) returning int: return a + b"
    // "def add(a: int, b: int) -> int: return a + b"
    const fnMatch = s.match(/^(?:define\s+(?:a\s+)?function|def|fn)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)\s*(?:->|returning|returns|:)?\s*([a-zA-Z_][a-zA-Z0-9_<>]*|\bvoid\b)?\s*:\s*(.+)$/i);
    if (fnMatch) {
      const fnName = fnMatch[1];
      const rawParams = fnMatch[2].trim();
      const rawRet = fnMatch[3] ? this.normalizeTypeName(fnMatch[3]) : 'Void';
      const body = this.normalizeSingleStatement(fnMatch[4].trim());

      const params = rawParams
        ? rawParams.split(',').map((p) => {
            const parts = p.trim().split(/\s*(?:as|:)\s*/i);
            const pName = parts[0].trim();
            const pType = parts[1] ? this.normalizeTypeName(parts[1]) : 'Int';
            return `${pName}: ${pType}`;
          }).join(', ')
        : '';

      return `DEFINE FUNCTION ${fnName}(${params}) -> ${rawRet}:\n  ${body}\nEND FUNCTION`;
    }

    // 9. Normalizing Simple If / Else
    // "if score >= 90: print "Pass" else: print "Fail""
    const ifMatch = s.match(/^if\s+(.+?)\s*:\s*(.+?)\s+else\s*:\s*(.+)$/i);
    if (ifMatch) {
      const cond = ifMatch[1].trim();
      const thenBody = this.normalizeSingleStatement(ifMatch[2].trim());
      const elseBody = this.normalizeSingleStatement(ifMatch[3].trim());
      return `IF ${cond}:\n  ${thenBody}\nELSE:\n  ${elseBody}\nEND IF`;
    }

    // 10. Default fallback: keep original statement
    return s;
  }

  private static splitDeclItems(raw: string): Array<{ name: string; value?: string }> {
    const items: Array<{ name: string; value?: string }> = [];
    const parts = raw.split(',');
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      if (p.includes('=')) {
        const [name, val] = p.split(/\s*=\s*/, 2);
        if (name && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.trim())) {
          items.push({ name: name.trim(), value: val.trim() });
        }
      } else {
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p)) {
          items.push({ name: p });
        }
      }
    }
    return items;
  }

  private static normalizeTypeName(type: string): string {
    const t = type.trim().toLowerCase();
    if (t === 'int' || t === 'integer' || t === 'number' || t === 'short' || t === 'long' || t === 'auto') return 'Int';
    if (t === 'float' || t === 'double') return 'Float';
    if (t === 'str' || t === 'string' || t === 'text') return 'String';
    if (t === 'bool' || t === 'boolean') return 'Bool';
    if (t === 'char') return 'Char';
    if (t === 'void' || t === 'none') return 'Void';
    const vecMatch = type.trim().match(/^(?:vector|list)<([a-zA-Z_][a-zA-Z0-9_]*)>$/i);
    if (vecMatch) {
      return `List<${this.normalizeTypeName(vecMatch[1])}>`;
    }
    return type.trim();
  }
}
