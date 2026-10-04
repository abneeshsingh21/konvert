import { compileToPython, compileToJava, compileToCpp } from '../compiler/index.js';
import { IntentNormalizer } from './intentNormalizer.js';

export interface SourceSpan {
  startLine: number; // 1-indexed
  endLine: number;   // 1-indexed
}

export interface EmittedSpan {
  startLine: number; // 1-indexed
  endLine: number;   // 1-indexed
  lineCount: number;
}

export interface StatementBlock {
  id: string;
  sourceSpan: SourceSpan;
  rawText: string;
  normalizedCNL: string;
  emittedCode: string;
  emittedSpan: EmittedSpan;
  isValid: boolean;
  isTransient: boolean;
  errorMessage?: string;
}

export interface SpanDiff {
  type: 'insert' | 'update' | 'delete' | 'unchanged';
  prevBlock?: StatementBlock;
  newBlock?: StatementBlock;
  targetStartLine: number;
  targetEndLine: number;
  newTargetLines: string[];
}

export interface DocumentReconciliationResult {
  blocks: StatementBlock[];
  diffs: SpanDiff[];
  fullTargetCode: string;
  hasErrors: boolean;
}

/**
 * ASTSpanTracker
 *
 * Tracks the bi-directional mapping between lines of plain English intent
 * and generated target code (Python, Java, C++), enabling atomic, incremental
 * live synchronization without full-document replacement.
 */
export class ASTSpanTracker {
  private currentBlocks: StatementBlock[] = [];
  private targetLanguage: string;

  constructor(targetLanguage: string = 'python') {
    this.targetLanguage = targetLanguage;
  }

  public setLanguage(lang: string) {
    this.targetLanguage = lang;
  }

  public getLanguage(): string {
    return this.targetLanguage;
  }

  public getCurrentBlocks(): StatementBlock[] {
    return this.currentBlocks;
  }

  /**
   * Parses English text into logical statement blocks and computes the reconciliation diff
   * against the previous state.
   */
  public reconcile(newEnglishText: string): DocumentReconciliationResult {
    const rawChunks = this.splitIntoLogicalStatements(newEnglishText);
    const newBlocks: StatementBlock[] = [];
    let currentEmittedLine = 1;
    let hasErrors = false;

    for (let i = 0; i < rawChunks.length; i++) {
      const chunk = rawChunks[i];
      const trimmed = chunk.text.trim();

      if (!trimmed) {
        continue;
      }

      // Check for transient incomplete typing (e.g. user just typed "pr" or "ca")
      const isTransient = this.isTransientInput(trimmed);
      const normalized = IntentNormalizer.normalize(trimmed);

      // Attempt compilation
      const compileResult = this.compileStatement(normalized);
      const isValid = compileResult.errors.length === 0 && compileResult.code.trim().length > 0;

      if (!isValid) {
        hasErrors = true;
      }

      // If invalid and transient, attempt to retrieve previous block's valid code to prevent flicker
      let emittedCode = compileResult.code;
      if (!isValid && isTransient && this.currentBlocks[i]?.isValid) {
        emittedCode = this.currentBlocks[i].emittedCode;
      }

      const cleanEmitted = emittedCode.endsWith('\n') ? emittedCode : emittedCode + (emittedCode ? '\n' : '');
      const emittedLines = cleanEmitted ? cleanEmitted.split('\n').filter((l, idx, arr) => idx < arr.length - 1 || l.length > 0) : [];
      const lineCount = emittedLines.length;

      const block: StatementBlock = {
        id: `stmt_${i}_${this.hashString(trimmed)}`,
        sourceSpan: {
          startLine: chunk.startLine,
          endLine: chunk.endLine,
        },
        rawText: trimmed,
        normalizedCNL: normalized,
        emittedCode: cleanEmitted,
        emittedSpan: {
          startLine: currentEmittedLine,
          endLine: currentEmittedLine + Math.max(0, lineCount - 1),
          lineCount,
        },
        isValid,
        isTransient,
        errorMessage: compileResult.errors[0]?.message,
      };

      currentEmittedLine += lineCount;
      newBlocks.push(block);
    }

    // Compute diffs against previous blocks
    const diffs = this.computeDiffs(this.currentBlocks, newBlocks);
    this.currentBlocks = newBlocks;

    const fullTargetCode = newBlocks.map((b) => b.emittedCode).join('');

    return {
      blocks: newBlocks,
      diffs,
      fullTargetCode,
      hasErrors,
    };
  }

  /**
   * Splits input English into multi-line or single-line logical statements.
   * Handles multi-line blocks (e.g. DEFINE FUNCTION ... END FUNCTION, IF ... END IF).
   */
  private splitIntoLogicalStatements(text: string): { text: string; startLine: number; endLine: number }[] {
    const rawLines = text.split(/\r?\n/);
    const statements: { text: string; startLine: number; endLine: number }[] = [];

    let currentChunk: string[] = [];
    let startLine = 1;
    let inBlock = false;
    let blockClosingKeyword: RegExp | null = null;

    for (let idx = 0; idx < rawLines.length; idx++) {
      const line = rawLines[idx];
      const trimmed = line.trim();
      const lineNum = idx + 1;

      if (currentChunk.length === 0) {
        startLine = lineNum;
      }

      if (!trimmed) {
        if (inBlock) {
          currentChunk.push(line);
        } else if (currentChunk.length > 0) {
          statements.push({
            text: currentChunk.join('\n'),
            startLine,
            endLine: lineNum - 1,
          });
          currentChunk = [];
        }
        continue;
      }

      // Check if this line starts a block construct
      if (!inBlock) {
        if (/^(?:define\s+(?:a\s+)?function|def|fn)\b/i.test(trimmed) && !/\bend\s+function\b/i.test(trimmed)) {
          inBlock = true;
          blockClosingKeyword = /^(?:end\s+function|end)\b/i;
        } else if (/^(?:define\s+(?:a\s+)?class|class)\b/i.test(trimmed) && !/\bend\s+class\b/i.test(trimmed)) {
          inBlock = true;
          blockClosingKeyword = /^(?:end\s+class|end)\b/i;
        } else if (/^(?:if)\b/i.test(trimmed) && !/\bend\s+if\b/i.test(trimmed)) {
          inBlock = true;
          blockClosingKeyword = /^(?:end\s+if|end)\b/i;
        } else if (/^(?:for)\b/i.test(trimmed) && !/\bend\s+for\b/i.test(trimmed)) {
          inBlock = true;
          blockClosingKeyword = /^(?:end\s+for|end)\b/i;
        } else if (/^(?:while)\b/i.test(trimmed) && !/\bend\s+while\b/i.test(trimmed)) {
          inBlock = true;
          blockClosingKeyword = /^(?:end\s+while|end)\b/i;
        }
      }

      currentChunk.push(line);

      // Check if this line closes the block construct
      if (inBlock && blockClosingKeyword && blockClosingKeyword.test(trimmed)) {
        inBlock = false;
        blockClosingKeyword = null;
        statements.push({
          text: currentChunk.join('\n'),
          startLine,
          endLine: lineNum,
        });
        currentChunk = [];
        continue;
      }

      // Single line statement completed if not in block
      if (!inBlock) {
        statements.push({
          text: currentChunk.join('\n'),
          startLine,
          endLine: lineNum,
        });
        currentChunk = [];
      }
    }

    if (currentChunk.length > 0) {
      statements.push({
        text: currentChunk.join('\n'),
        startLine,
        endLine: rawLines.length,
      });
    }

    return statements;
  }

  /**
   * Determines if input is in an incomplete transient typing state
   */
  private isTransientInput(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length < 3) return true;
    if (trimmed.endsWith(':') || trimmed.endsWith('=') || trimmed.endsWith('->') || trimmed.endsWith(',')) return true;
    if (/^(?:p|pr|pri|prin|c|ca|cal|calc|d|de|def|defi|defin|s|se|i)$/i.test(trimmed)) return true;
    return false;
  }

  private compileStatement(input: string): { code: string; errors: any[] } {
    if (this.targetLanguage === 'java') {
      return compileToJava(input);
    } else if (this.targetLanguage === 'cpp' || this.targetLanguage === 'c') {
      return compileToCpp(input);
    } else {
      return compileToPython(input);
    }
  }

  private computeDiffs(oldBlocks: StatementBlock[], newBlocks: StatementBlock[]): SpanDiff[] {
    const diffs: SpanDiff[] = [];
    const maxLen = Math.max(oldBlocks.length, newBlocks.length);

    for (let i = 0; i < maxLen; i++) {
      const oldB = oldBlocks[i];
      const newB = newBlocks[i];

      if (!oldB && newB) {
        // Inserted
        diffs.push({
          type: 'insert',
          newBlock: newB,
          targetStartLine: newB.emittedSpan.startLine,
          targetEndLine: newB.emittedSpan.startLine,
          newTargetLines: newB.emittedCode.split('\n').filter(Boolean),
        });
      } else if (oldB && !newB) {
        // Deleted
        diffs.push({
          type: 'delete',
          prevBlock: oldB,
          targetStartLine: oldB.emittedSpan.startLine,
          targetEndLine: oldB.emittedSpan.endLine,
          newTargetLines: [],
        });
      } else if (oldB && newB) {
        if (oldB.rawText !== newB.rawText || oldB.emittedCode !== newB.emittedCode) {
          // Updated
          diffs.push({
            type: 'update',
            prevBlock: oldB,
            newBlock: newB,
            targetStartLine: oldB.emittedSpan.startLine,
            targetEndLine: oldB.emittedSpan.endLine,
            newTargetLines: newB.emittedCode.split('\n').filter(Boolean),
          });
        } else {
          // Unchanged
          diffs.push({
            type: 'unchanged',
            prevBlock: oldB,
            newBlock: newB,
            targetStartLine: oldB.emittedSpan.startLine,
            targetEndLine: oldB.emittedSpan.endLine,
            newTargetLines: [],
          });
        }
      }
    }

    return diffs;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}
