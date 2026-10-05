import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AtomicRangeReconciler } from './atomicRangeReconciler.js';
import { IntentNormalizer } from './intentNormalizer.js';
import { compileSnippetForLang } from '../compiler/index.js';

export interface TwinSession {
  sourceDocUri: vscode.Uri;
  targetDocUri: vscode.Uri;
  reconciler: AtomicRangeReconciler;
  debounceTimer?: NodeJS.Timeout;
}

/**
 * TwinBufferManager
 *
 * Manages continuous real-time synchronization between Konvert source files (.knv)
 * and target code files (.py, .java, .cpp), plus live inline #? comment expansion.
 */
export class TwinBufferManager {
  private activeSessions: Map<string, TwinSession> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.registerListeners();
  }

  private registerListeners() {
    // 1. Listen for continuous document edits
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const doc = event.document;

        // Check if this is an active .knv twin session
        const session = this.activeSessions.get(doc.uri.toString());
        if (session) {
          this.queueReconcile(session, doc.getText());
          return;
        }

        // Check if this is an inline #? intent block in a code file (.py, .java, .cpp)
        if (['python', 'java', 'cpp', 'c'].includes(doc.languageId)) {
          this.handleInlineIntentEdit(event);
        }
      })
    );

    // 2. Auto-save target file when source .knv is saved
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(async (doc) => {
        const session = this.activeSessions.get(doc.uri.toString());
        if (session) {
          const targetDoc = await vscode.workspace.openTextDocument(session.targetDocUri);
          await targetDoc.save();
        }
      })
    );

    // 3. Clean up closed sessions
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.activeSessions.delete(doc.uri.toString());
      })
    );
  }

  /**
   * Opens or attaches a continuous Reactive Twin split view:
   * Left pane: .knv file
   * Right pane: Target code file (.py / .java / .cpp)
   */
  public async openReactiveTwin(sourceUri?: vscode.Uri, targetLang: string = 'python'): Promise<void> {
    let sourceDoc: vscode.TextDocument;

    if (sourceUri) {
      sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
    } else if (vscode.window.activeTextEditor) {
      sourceDoc = vscode.window.activeTextEditor.document;
    } else {
      // Create new untitled .knv file if none open
      sourceDoc = await vscode.workspace.openTextDocument({
        language: 'konvert',
        content: 'print hello world\ncalculate total = price * 1.18\n',
      });
    }

    // Determine target file extension
    const extMap: Record<string, string> = {
      python: '.py',
      java: '.java',
      cpp: '.cpp',
    };
    const targetExt = extMap[targetLang] || '.py';

    // Derive target URI
    let targetUri: vscode.Uri;
    if (sourceDoc.uri.scheme === 'file') {
      const parsed = path.parse(sourceDoc.uri.fsPath);
      const targetPath = path.join(parsed.dir, parsed.name + targetExt);

      // Create target file on disk if it doesn't exist
      if (!fs.existsSync(targetPath)) {
        fs.writeFileSync(targetPath, '', 'utf8');
      }
      targetUri = vscode.Uri.file(targetPath);
    } else {
      targetUri = vscode.Uri.parse(`untitled:${sourceDoc.uri.path.replace(/\.[^/.]+$/, '')}${targetExt}`);
    }

    const reconciler = new AtomicRangeReconciler(targetLang);

    // Store active session
    const session: TwinSession = {
      sourceDocUri: sourceDoc.uri,
      targetDocUri: targetUri,
      reconciler,
    };
    this.activeSessions.set(sourceDoc.uri.toString(), session);

    // Display Left Pane: Konvert file
    await vscode.window.showTextDocument(sourceDoc, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: false,
    });

    // Display Right Pane: Target code file
    const targetDoc = await vscode.workspace.openTextDocument(targetUri);
    const targetEditor = await vscode.window.showTextDocument(targetDoc, {
      viewColumn: vscode.ViewColumn.Two,
      preserveFocus: true,
    });

    // Initial immediate reconciliation
    await reconciler.reconcileEditor(targetEditor, sourceDoc.getText(), vscode);

    vscode.window.setStatusBarMessage(
      `⚡ Konvert: Reactive Twin Active (${targetLang.toUpperCase()} Auto-Sync)`,
      4000
    );
  }

  /**
   * Ejects the source Konvert (.knv) file, leaving only the pure target code file
   */
  public async ejectEnglish(sourceUri?: vscode.Uri): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const uri = sourceUri || editor?.document.uri;

    if (!uri || uri.scheme !== 'file') {
      vscode.window.showWarningMessage('Konvert: Open a saved .knv file to eject.');
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      `Are you sure you want to eject "${path.basename(uri.fsPath)}"? The Konvert (.knv) source file will be deleted, leaving only the compiled code.`,
      { modal: true },
      'Eject & Keep Code Only',
      'Cancel'
    );

    if (choice !== 'Eject & Keep Code Only') return;

    try {
      this.activeSessions.delete(uri.toString());
      if (fs.existsSync(uri.fsPath)) {
        fs.unlinkSync(uri.fsPath);
      }
      vscode.window.showInformationMessage(`✓ Ejected: "${path.basename(uri.fsPath)}" removed. Pure target code preserved!`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to eject file: ${err.message}`);
    }
  }

  /**
   * Debounced real-time reconcile loop for smooth 60fps typing
   */
  private queueReconcile(session: TwinSession, englishText: string) {
    if (session.debounceTimer) {
      clearTimeout(session.debounceTimer);
    }

    session.debounceTimer = setTimeout(async () => {
      // Find visible editor displaying targetDocUri
      const targetEditor = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === session.targetDocUri.toString()
      );

      if (targetEditor) {
        await session.reconciler.reconcileEditor(targetEditor, englishText, vscode);
      }
    }, 40); // 40ms debounce = 25 updates/sec, optimal for typing without GC pressure
  }

  /**
   * Handles inline #? intent comments directly inside code files (.py, .java, .cpp)
   */
  private async handleInlineIntentEdit(event: vscode.TextDocumentChangeEvent) {
    const doc = event.document;
    const changes = event.contentChanges;
    if (changes.length === 0) return;

    // Check if user pressed enter or edited a line with #? or //?
    for (const change of changes) {
      const lineNum = change.range.start.line;
      if (lineNum >= doc.lineCount) continue;

      const lineText = doc.lineAt(lineNum).text;
      const match = lineText.match(/(?:#|\/\/)\?\s*(.+)$/);
      if (!match) continue;

      const englishQuery = match[1].trim();
      if (!englishQuery || englishQuery.length < 3) continue;

      // Compile intent as clean snippet for target language
      const normalized = IntentNormalizer.normalize(englishQuery);
      const res = compileSnippetForLang(normalized, doc.languageId);

      if (res.errors.length === 0 && res.code.trim()) {
        const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri === doc.uri);
        if (editor && change.text.includes('\n')) {
          // User pressed enter on the #? line: materialize code on next line
          const nextLinePos = new vscode.Position(lineNum + 1, 0);
          await editor.edit((builder) => {
            builder.insert(nextLinePos, res.code + (res.code.endsWith('\n') ? '' : '\n'));
          });
        }
      }
    }
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.activeSessions.clear();
  }
}
