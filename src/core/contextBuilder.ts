import { SymbolEntry } from '../compiler/ast.js';

export interface ContextSnapshot {
  variables: string[];
  recentStatements: string[];
}

export class ContextBuilder {
  private recentCNLStatements: string[] = [];
  private symbols: Map<string, SymbolEntry> = new Map();
  private maxHistory: number = 8;

  public addStatement(statement: string): void {
    this.recentCNLStatements.push(statement.trim());
    if (this.recentCNLStatements.length > this.maxHistory) {
      this.recentCNLStatements.shift();
    }
  }

  public registerSymbol(entry: SymbolEntry): void {
    this.symbols.set(entry.name, entry);
  }

  public buildPrefix(): string {
    if (this.recentCNLStatements.length === 0 && this.symbols.size === 0) {
      return '';
    }

    const varList = Array.from(this.symbols.values())
      .map((s) => `${s.name}: ${s.type.name}`)
      .join(', ');

    const contextParts: string[] = [];
    if (varList) {
      contextParts.push(`[VARS: ${varList}]`);
    }
    if (this.recentCNLStatements.length > 0) {
      contextParts.push(`[HISTORY:\n${this.recentCNLStatements.join('\n')}\n]`);
    }

    return contextParts.join(' ');
  }

  public clear(): void {
    this.recentCNLStatements = [];
    this.symbols.clear();
  }
}
