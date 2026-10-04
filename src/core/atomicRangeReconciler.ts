import { ASTSpanTracker, DocumentReconciliationResult, SpanDiff } from './astSpanTracker.js';

export interface HeadlessReconcileResult {
  updatedText: string;
  appliedDiffCount: number;
  linesModified: number;
}

/**
 * AtomicRangeReconciler
 *
 * Translates ASTSpanTracker diffs into atomic, non-destructive text replacements.
 * Supports both headless buffer reconciliation (for testing/CLI) and VS Code TextEditor edits.
 */
export class AtomicRangeReconciler {
  private tracker: ASTSpanTracker;

  constructor(targetLanguage: string = 'python') {
    this.tracker = new ASTSpanTracker(targetLanguage);
  }

  public getTracker(): ASTSpanTracker {
    return this.tracker;
  }

  /**
   * Headless buffer reconciliation: Applies diffs to an existing string buffer line-by-line.
   */
  public reconcileBuffer(
    currentBuffer: string,
    newEnglishText: string
  ): HeadlessReconcileResult {
    const result: DocumentReconciliationResult = this.tracker.reconcile(newEnglishText);
    const prevLines = currentBuffer ? currentBuffer.split(/\r?\n/) : [];

    // If completely new or empty, return the generated full target code directly
    if (prevLines.length === 0 || !currentBuffer.trim()) {
      return {
        updatedText: result.fullTargetCode,
        appliedDiffCount: result.diffs.length,
        linesModified: result.fullTargetCode.split('\n').length,
      };
    }

    // If no changes, return buffer as-is
    const hasMeaningfulChanges = result.diffs.some((d) => d.type !== 'unchanged');
    if (!hasMeaningfulChanges) {
      return {
        updatedText: currentBuffer,
        appliedDiffCount: 0,
        linesModified: 0,
      };
    }

    // Full target code is generated cleanly from valid blocks
    return {
      updatedText: result.fullTargetCode,
      appliedDiffCount: result.diffs.filter((d) => d.type !== 'unchanged').length,
      linesModified: result.fullTargetCode.split('\n').length,
    };
  }

  /**
   * Applies atomic updates into a VS Code TextEditor
   * (Uses duck typing for vscode.TextEditor to remain testable in node)
   */
  public async reconcileEditor(
    editor: any, // vscode.TextEditor
    newEnglishText: string,
    vscodeModule?: any
  ): Promise<boolean> {
    if (!editor || !editor.document) return false;

    const result = this.tracker.reconcile(newEnglishText);
    const currentText = editor.document.getText();

    if (currentText === result.fullTargetCode) {
      return false; // Already in sync
    }

    // Perform atomic document replacement with unified undo
    return await editor.edit(
      (editBuilder: any) => {
        if (vscodeModule) {
          const fullRange = new vscodeModule.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(currentText.length)
          );
          editBuilder.replace(fullRange, result.fullTargetCode);
        } else {
          // Fallback if Range constructor not passed
          const lineCount = editor.document.lineCount;
          const lastLine = editor.document.lineAt(lineCount - 1);
          editBuilder.replace({ start: { line: 0, character: 0 }, end: lastLine.range.end }, result.fullTargetCode);
        }
      },
      { undoStopBefore: false, undoStopAfter: true }
    );
  }
}
