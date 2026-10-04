import { SymbolEntry, TypeNode, DiagnosticError } from './ast';

export class SymbolTable {
  private scopes: Map<string, Map<string, SymbolEntry>> = new Map();
  private scopeStack: string[] = [];
  private currentScopeId = 0;

  constructor() {
    this.enterScope('global');
  }

  public enterScope(name = 'block'): string {
    const scopeId = `${name}_${this.currentScopeId++}`;
    this.scopes.set(scopeId, new Map());
    this.scopeStack.push(scopeId);
    return scopeId;
  }

  public exitScope(): void {
    if (this.scopeStack.length > 1) {
      this.scopeStack.pop();
    }
  }

  public getCurrentScopeId(): string {
    return this.scopeStack[this.scopeStack.length - 1];
  }

  public insert(
    name: string,
    type: TypeNode,
    isMutable = true,
    line = 0
  ): { success: boolean; error?: DiagnosticError } {
    const currentScope = this.scopes.get(this.getCurrentScopeId())!;
    if (currentScope.has(name)) {
      return {
        success: false,
        error: {
          message: `Duplicate declaration of variable '${name}' in current scope`,
          line,
          col: 0,
          severity: 'error',
        },
      };
    }

    const entry: SymbolEntry = {
      name,
      type,
      scope: this.getCurrentScopeId(),
      scopeId: this.currentScopeId,
      isMutable,
      declaredAtLine: line,
    };

    currentScope.set(name, entry);
    return { success: true };
  }

  public lookup(name: string): SymbolEntry | undefined {
    // Traverse from innermost scope to outermost global scope
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const scopeId = this.scopeStack[i];
      const scope = this.scopes.get(scopeId);
      if (scope && scope.has(name)) {
        return scope.get(name);
      }
    }
    return undefined;
  }

  public getAllInCurrentContext(): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const seen = new Set<string>();

    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const scopeId = this.scopeStack[i];
      const scope = this.scopes.get(scopeId);
      if (scope) {
        for (const [name, entry] of scope.entries()) {
          if (!seen.has(name)) {
            seen.add(name);
            symbols.push(entry);
          }
        }
      }
    }
    return symbols;
  }

  public reset(): void {
    this.scopes.clear();
    this.scopeStack = [];
    this.currentScopeId = 0;
    this.enterScope('global');
  }
}
