import * as vscode from 'vscode';
import { parseCNL, compileToPython, compileToJava, compileToCpp, compileAll, compileSnippetForLang } from './compiler/index.js';
import { ContextBuilder } from './core/contextBuilder.js';
import { ModelNormalizer } from './core/modelNormalizer.js';
import { ModelDownloader } from './core/modelDownloader.js';
import { IntentNormalizer } from './core/intentNormalizer.js';
import { TwinBufferManager } from './core/twinBufferManager.js';
import { WorkspaceWatcher } from './core/workspaceWatcher.js';
import { spawn } from 'child_process';
import * as path from 'path';

let contextBuilder = new ContextBuilder();
let statusBarItem: vscode.StatusBarItem;
let lastActiveEditor: vscode.TextEditor | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('Konvert Extension is now active!');

  // Track the most recent active editor so webview or modal commands can insert code reliably
  lastActiveEditor = vscode.window.activeTextEditor;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.uri.scheme === 'file') {
        lastActiveEditor = editor;
      }
    })
  );

  // Helper: Download compressed model on install
  async function ensureModelDownloaded(interactive: boolean = false): Promise<boolean> {
    const targetDir = ModelDownloader.getTargetModelDir(context.globalStorageUri.fsPath);
    if (ModelDownloader.isModelInstalled(targetDir) || ModelDownloader.isModelInstalled(path.join(context.extensionPath, 'models'))) {
      if (statusBarItem) {
        statusBarItem.text = '$(zap) Konvert: Ready (AI Engine Online)';
        statusBarItem.tooltip = `Konvert: AI Engine Online (${targetDir})\nCtrl+Shift+I / Alt+K / Ctrl+Alt+K for Quick HUD`;
      }
      // Automatically pre-warm local model daemon in background so inference is instant
      ModelNormalizer.getInstance(context.extensionPath).start().catch(() => {});
      return true;
    }

    if (!interactive) {
      const choice = await vscode.window.showInformationMessage(
        '⚡ Konvert: Initializing Neural Engine. Would you like to download the compressed language model for casual English normalization?',
        'Download Now',
        'Later'
      );
      if (choice !== 'Download Now') {
        return false;
      }
    }

    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Konvert: Downloading AI Language Engine',
        cancellable: true,
      },
      async (progress, token) => {
        const abortController = new AbortController();
        token.onCancellationRequested(() => {
          abortController.abort();
        });

        try {
          statusBarItem.text = '$(sync~spin) Downloading AI Model...';
          await ModelDownloader.downloadAndExtractModel({
            targetDir,
            abortSignal: abortController.signal,
            onProgress: (p) => {
              const mbDownloaded = (p.downloadedBytes / (1024 * 1024)).toFixed(1);
              const mbTotal = (p.totalBytes / (1024 * 1024)).toFixed(1);
              progress.report({
                message: `${mbDownloaded}MB / ${mbTotal}MB (${p.percent}%)`,
                increment: 1,
              });
            },
          });
          vscode.window.showInformationMessage('✨ Konvert: AI Language Engine installed successfully!');
          statusBarItem.text = '$(zap) Konvert: Ready (AI Engine Online)';
          return true;
        } catch (err: any) {
          if (token.isCancellationRequested) {
            vscode.window.showWarningMessage('Konvert: AI Model download canceled.');
          } else {
            vscode.window.showErrorMessage(`Konvert: Failed to download model: ${err.message}`);
          }
          statusBarItem.text = '$(zap) Konvert: Ready';
          return false;
        }
      }
    );
  }

  // Check and trigger download asynchronously on install
  setTimeout(() => {
    ensureModelDownloaded(false);
  }, 1500);

  // Command to manually trigger model download
  context.subscriptions.push(
    vscode.commands.registerCommand('konvert.downloadModel', () => ensureModelDownloaded(true))
  );

  // Helper: Compile for given language
  function compileForLang(input: string, langId: string) {
    if (langId === 'java') {
      return compileToJava(input);
    } else if (langId === 'cpp' || langId === 'c') {
      return compileToCpp(input);
    } else {
      return compileToPython(input);
    }
  }

  // 1. Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(zap) Konvert';
  statusBarItem.tooltip = 'Konvert: English to Code HUD (Ctrl+Alt+K • Alt+K • Ctrl+Shift+I)';
  statusBarItem.command = 'konvert.quickHUD';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Execution Templates for runnable programs
  const EXECUTION_TEMPLATES: Record<string, { code: string; cursorLine: number; cursorCol: number }> = {
    cpp: {
      code: [
        '#include <iostream>',
        '#include <vector>',
        '#include <string>',
        '',
        'using namespace std;',
        '',
        'int main() {',
        '    ',
        '    return 0;',
        '}',
        ''
      ].join('\n'),
      cursorLine: 7,
      cursorCol: 4
    },
    c: {
      code: [
        '#include <stdio.h>',
        '#include <stdlib.h>',
        '',
        'int main() {',
        '    ',
        '    return 0;',
        '}',
        ''
      ].join('\n'),
      cursorLine: 4,
      cursorCol: 4
    },
    java: {
      code: [
        'import java.util.*;',
        '',
        'public class Main {',
        '    public static void main(String[] args) {',
        '        ',
        '    }',
        '}',
        ''
      ].join('\n'),
      cursorLine: 4,
      cursorCol: 8
    },
    python: {
      code: [
        'def main():',
        '    ',
        '',
        'if __name__ == "__main__":',
        '    main()',
        ''
      ].join('\n'),
      cursorLine: 1,
      cursorCol: 4
    }
  };

  const resolveLanguage = (ed: vscode.TextEditor): string => {
    const doc = ed.document;
    const ext = path.extname(doc.fileName).toLowerCase();
    if (ext === '.cpp' || ext === '.cc' || ext === '.cxx' || ext === '.hpp' || ext === '.h') return 'cpp';
    if (ext === '.c') return 'c';
    if (ext === '.java') return 'java';
    if (ext === '.py') return 'python';

    const langId = doc.languageId ? doc.languageId.toLowerCase() : '';
    if (langId === 'cpp' || langId === 'c++') return 'cpp';
    if (langId === 'c') return 'c';
    if (langId === 'java') return 'java';
    if (langId === 'python') return 'python';
    return 'python';
  };

  // 2. Command: Real-Time Floating Quick-HUD (Continuous live keystroke streaming into active editor)
  const showQuickConvertHUD = async () => {
    try {
      let currentEditor = vscode.window.activeTextEditor || lastActiveEditor || vscode.window.visibleTextEditors.find((e) => e.document && e.document.uri && e.document.uri.scheme === 'file');

      let targetLang = currentEditor ? resolveLanguage(currentEditor) : 'python';

      if (!currentEditor || currentEditor.document.isClosed) {
        // Open a scratch document so the user can immediately see real-time typing
        const doc = await vscode.workspace.openTextDocument({
          language: targetLang,
          content: ''
        });
        currentEditor = await vscode.window.showTextDocument(doc);
      } else {
        // Ensure the editor is active and focused
        await vscode.window.showTextDocument(currentEditor.document, currentEditor.viewColumn);
      }

      const editor = currentEditor;
      targetLang = resolveLanguage(editor);

      // Auto-populate execution template if document is completely empty
      const docText = editor.document.getText();
      const isDocEmpty = docText.trim().length === 0;
      if (isDocEmpty && EXECUTION_TEMPLATES[targetLang]) {
        const tpl = EXECUTION_TEMPLATES[targetLang];
        await editor.edit((edit) => {
          const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(docText.length)
          );
          edit.replace(fullRange, tpl.code);
        }, { undoStopBefore: false, undoStopAfter: false });

        const maxLine = Math.max(0, editor.document.lineCount - 1);
        const targetLine = Math.min(tpl.cursorLine, maxLine);
        const targetPos = new vscode.Position(targetLine, tpl.cursorCol);
        editor.selection = new vscode.Selection(targetPos, targetPos);
        editor.revealRange(new vscode.Range(targetPos, targetPos));
      }

      let startPos = (editor.selection && editor.selection.active)
        ? editor.selection.active
        : new vscode.Position(0, 0);

      let appliedRange = new vscode.Range(startPos, startPos);
      let hasAppliedAnyCode = false;
      let isAccepted = false;

      // Track session history for editing and undoing previous lines
      interface CommittedLine {
        english: string;
        code: string;
        codeRange: vscode.Range;
        newlineRange: vscode.Range;
        lineIndex: number;
      }
      const committedHistory: CommittedLine[] = [];

      const getActualLineNum = () => {
        return (editor.selection && editor.selection.active)
          ? editor.selection.active.line + 1
          : editor.document.lineCount;
      };

      const inputBox = vscode.window.createInputBox();
      inputBox.ignoreFocusOut = true;

      const editPrevBtn: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('arrow-left'),
        tooltip: 'Edit Previous Line (Ctrl+Z / type "undo")',
      };

      const deletePrevBtn: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('trash'),
        tooltip: 'Delete Previous Committed Line',
      };

      const langBtn: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('symbol-variable'),
        tooltip: `Target: ${targetLang.toUpperCase()} (Click to change)`,
      };

      const templateBtn: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('file-code'),
        tooltip: `Scaffold ${targetLang.toUpperCase()} Execution Template`,
      };

      const twinBtn: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('split-horizontal'),
        tooltip: 'Open Live Reactive Twin',
      };

      const previewBtn: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('layout-sidebar-right'),
        tooltip: 'Open Live Compiler Studio',
      };

      const updateButtonsAndPrompts = (customPrompt?: string) => {
        const curLine = getActualLineNum();
        const docName = (editor.document && editor.document.fileName) ? path.basename(editor.document.fileName) : 'editor';

        inputBox.title = `⚡ Konvert [Line ${curLine}] — Realtime English to Code (${targetLang.toUpperCase()})`;

        if (committedHistory.length > 0) {
          const prev = committedHistory[committedHistory.length - 1];
          inputBox.buttons = [editPrevBtn, deletePrevBtn, langBtn, templateBtn, twinBtn, previewBtn];
          inputBox.placeholder = `[Line ${curLine}] Type next statement, or click ⬅ to edit Line ${prev.lineIndex + 1} (or type "undo")...`;
          inputBox.prompt = customPrompt || `✓ Line ${prev.lineIndex + 1} committed ("${prev.english}"). Keep typing for Line ${curLine}, or click ⬅ to edit previous line.`;
        } else {
          inputBox.buttons = [langBtn, templateBtn, twinBtn, previewBtn];
          inputBox.placeholder = `[Line ${curLine}] Type English for ${docName} (e.g. "print hello world", "calculate total = price * 1.18")...`;
          inputBox.prompt = customPrompt || `[⚡ LIVE TYPING ACTIVE] Writing directly into ${docName} on Line ${curLine} in real time!`;
        }
      };

      updateButtonsAndPrompts();

      // Undo last committed line and restore it into HUD for editing
      const popAndEditPrevious = async () => {
        if (committedHistory.length === 0) {
          vscode.window.showInformationMessage('Konvert: No previous lines in this session to edit.');
          return;
        }

        // If there's uncommitted preview text on the current line, clear it
        if (hasAppliedAnyCode) {
          await editor.edit((edit) => {
            edit.replace(appliedRange, '');
          }, { undoStopBefore: false, undoStopAfter: false });
          hasAppliedAnyCode = false;
        }

        const last = committedHistory.pop()!;
        contextBuilder.popStatement();

        // Delete the newline and indentation that was placed after last
        await editor.edit((edit) => {
          edit.delete(last.newlineRange);
        }, { undoStopBefore: false, undoStopAfter: false });

        // Restore appliedRange to the previous statement's code range
        appliedRange = last.codeRange;
        startPos = last.codeRange.start;
        hasAppliedAnyCode = true;

        editor.selection = new vscode.Selection(appliedRange.end, appliedRange.end);
        editor.revealRange(appliedRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

        inputBox.value = last.english;
        updateButtonsAndPrompts(`✏️ Editing Line ${last.lineIndex + 1}: "${last.english}" (Modify and press Enter)`);
      };

      // Delete the previous line entirely from the file
      const deletePrevious = async () => {
        if (committedHistory.length === 0) {
          vscode.window.showInformationMessage('Konvert: No previous lines to delete.');
          return;
        }

        if (hasAppliedAnyCode) {
          await editor.edit((edit) => {
            edit.replace(appliedRange, '');
          }, { undoStopBefore: false, undoStopAfter: false });
          hasAppliedAnyCode = false;
        }

        const last = committedHistory.pop()!;
        contextBuilder.popStatement();

        await editor.edit((edit) => {
          const deleteRange = new vscode.Range(last.codeRange.start, last.newlineRange.end);
          edit.delete(deleteRange);
        }, { undoStopBefore: true, undoStopAfter: false });

        startPos = last.codeRange.start;
        appliedRange = new vscode.Range(startPos, startPos);
        editor.selection = new vscode.Selection(startPos, startPos);
        editor.revealRange(new vscode.Range(startPos, startPos));

        inputBox.value = '';
        updateButtonsAndPrompts(`🗑️ Deleted Line ${last.lineIndex + 1}. Now on Line ${startPos.line + 1}.`);
      };

      const applyLiveEdit = async (rawInput: string) => {
        const text = rawInput.trim();

        // If user erased everything in HUD, remove the generated code for the CURRENT line from editor immediately!
        if (!text) {
          if (hasAppliedAnyCode) {
            await editor.edit((edit) => {
              edit.replace(appliedRange, '');
            }, { undoStopBefore: false, undoStopAfter: false });
            appliedRange = new vscode.Range(startPos, startPos);
            hasAppliedAnyCode = false;
          }
          updateButtonsAndPrompts();
          inputBox.validationMessage = undefined;
          return;
        }

        const t0 = performance.now();
        const res = compileSnippetForLang(text, targetLang);
        const elapsedMs = (performance.now() - t0).toFixed(1);

        if (res.errors.length === 0 && res.code.trim().length > 0) {
          let codeToWrite = res.code.trimEnd();

          // Match current line indentation level safely
          let currentIndent = '';
          if (editor.document.lineCount > 0) {
            const currentLineNum = Math.max(0, Math.min(appliedRange.start.line, editor.document.lineCount - 1));
            const lineText = editor.document.lineAt(currentLineNum).text;
            const indentMatch = lineText.match(/^(\s*)/);
            currentIndent = indentMatch ? indentMatch[1] : '';
          }

          if (currentIndent && codeToWrite.includes('\n')) {
            codeToWrite = codeToWrite
              .split('\n')
              .map((line, idx) => (idx > 0 && line.trim() ? currentIndent + line : line))
              .join('\n');
          }

          // Atomically replace the current applied range with the new code in REAL TIME
          await editor.edit((edit) => {
            edit.replace(appliedRange, codeToWrite);
          }, { undoStopBefore: false, undoStopAfter: false });

          // Update the tracked range to match the newly inserted code
          const lines = codeToWrite.split('\n');
          const endLine = appliedRange.start.line + lines.length - 1;
          const endChar = (lines.length === 1 ? appliedRange.start.character : 0) + lines[lines.length - 1].length;
          appliedRange = new vscode.Range(appliedRange.start, new vscode.Position(endLine, endChar));
          hasAppliedAnyCode = true;

          // Position cursor right at the end of the freshly typed code
          editor.selection = new vscode.Selection(appliedRange.end, appliedRange.end);
          editor.revealRange(appliedRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

          const compactPreview = codeToWrite.replace(/\r?\n\s*/g, ' ↵ ');
          inputBox.prompt = `⚡ [${elapsedMs}ms] Live on Line ${appliedRange.start.line + 1}: ${compactPreview}`;
          inputBox.validationMessage = undefined;
        } else {
          const hint = res.errors[0]?.message || 'Type complete intent...';
          inputBox.prompt = `⏳ Line ${appliedRange.start.line + 1}: typing intent... (${hint})`;
        }
      };

      // Sequential lock queue to avoid race conditions when typing fast
      let isApplyingEdit = false;
      let pendingInput: string | null = null;

      const queueLiveEdit = (val: string) => {
        pendingInput = val;
        if (isApplyingEdit) return;

        const drain = async () => {
          if (pendingInput === null) return;
          const nextVal = pendingInput;
          pendingInput = null;
          isApplyingEdit = true;
          try {
            await applyLiveEdit(nextVal);
          } finally {
            isApplyingEdit = false;
            if (pendingInput !== null) {
              await drain();
            }
          }
        };

        drain();
      };

      inputBox.onDidChangeValue((val) => {
        const trimmed = val.trim().toLowerCase();
        if ((trimmed === 'undo' || trimmed === ':undo' || trimmed === 'back' || trimmed === ':back') && committedHistory.length > 0) {
          popAndEditPrevious();
          return;
        }
        queueLiveEdit(val);
      });

      // Synchronize HUD if the user moves their cursor in the editor
      const selectionListener = vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor === editor && !hasAppliedAnyCode && !isApplyingEdit) {
          startPos = e.selections[0].active;
          appliedRange = new vscode.Range(startPos, startPos);
          updateButtonsAndPrompts();
        }
      });

      inputBox.onDidTriggerButton(async (btn) => {
        if (btn === editPrevBtn) {
          await popAndEditPrevious();
        } else if (btn === deletePrevBtn) {
          await deletePrevious();
        } else if (btn === templateBtn) {
          await scaffoldExecutionTemplate(targetLang);
          startPos = editor.selection.active;
          appliedRange = new vscode.Range(startPos, startPos);
          updateButtonsAndPrompts(`✓ Scaffolded ${targetLang.toUpperCase()} execution template.`);
        } else if (btn === langBtn) {
          const choice = await vscode.window.showQuickPick(
            [
              { label: 'Python 3.12', description: 'python' },
              { label: 'Java 21', description: 'java' },
              { label: 'C++20', description: 'cpp' },
              { label: 'C', description: 'c' },
            ],
            { placeHolder: 'Select target compilation language' }
          );
          if (choice && choice.description) {
            targetLang = choice.description;
            updateButtonsAndPrompts();
            await applyLiveEdit(inputBox.value);
          }
        } else if (btn === twinBtn) {
          isAccepted = true;
          inputBox.hide();
          vscode.commands.executeCommand('konvert.openReactiveTwin');
        } else if (btn === previewBtn) {
          isAccepted = true;
          inputBox.hide();
          vscode.commands.executeCommand('konvert.openLivePreview');
        }
      });

      inputBox.onDidAccept(async () => {
        const rawVal = inputBox.value.trim();

        // Case 1: Enter on empty input -> user is finished writing!
        if (!rawVal) {
          isAccepted = true;
          inputBox.hide();
          if (committedHistory.length > 0) {
            vscode.window.setStatusBarMessage(
              `✓ Konvert: Finished writing (${committedHistory.length} statement${committedHistory.length > 1 ? 's' : ''} committed)`,
              3500
            );
          }
          return;
        }

        // Case 2: Code has been applied live to the editor -> commit this line and advance to next line!
        if (hasAppliedAnyCode) {
          // Inspect current line for indentation safely
          let nextIndent = '';
          if (editor.document.lineCount > 0) {
            const lastLineIndex = Math.max(0, Math.min(appliedRange.end.line, editor.document.lineCount - 1));
            const lineText = editor.document.lineAt(lastLineIndex).text;
            const indentMatch = lineText.match(/^(\s*)/);
            nextIndent = indentMatch ? indentMatch[1] : '';

            // If block opening (ends with ':' or '{'), increase indent by 4 spaces
            if (lineText.trimEnd().endsWith(':') || lineText.trimEnd().endsWith('{')) {
              nextIndent += '    ';
            }
          }

          const currentCodeRange = appliedRange;
          const currentLineIndex = appliedRange.start.line;
          const newlineText = '\n' + nextIndent;

          // Commit current line with newline and auto-indentation for next line
          await editor.edit((edit) => {
            edit.insert(appliedRange.end, newlineText);
          }, { undoStopBefore: true, undoStopAfter: false });

          // Calculate newlineRange
          const nextLineNum = currentCodeRange.end.line + 1;
          const nextCol = nextIndent.length;
          const nextPos = new vscode.Position(nextLineNum, nextCol);
          const newlineInsertedRange = new vscode.Range(currentCodeRange.end, nextPos);

          committedHistory.push({
            english: rawVal,
            code: editor.document.getText(currentCodeRange),
            codeRange: currentCodeRange,
            newlineRange: newlineInsertedRange,
            lineIndex: currentLineIndex,
          });

          contextBuilder.addStatement(rawVal);

          editor.selection = new vscode.Selection(nextPos, nextPos);
          editor.revealRange(new vscode.Range(nextPos, nextPos));

          startPos = nextPos;
          appliedRange = new vscode.Range(nextPos, nextPos);
          hasAppliedAnyCode = false;

          // Clear HUD input box and update prompt for continuous writing
          inputBox.value = '';
          updateButtonsAndPrompts();
          inputBox.validationMessage = undefined;

          // HUD STAYS OPEN! No inputBox.hide() called!
        } else {
          // Input text hasn't compiled yet (syntax error or incomplete)
          const res = compileSnippetForLang(rawVal, targetLang);
          if (res.errors.length > 0) {
            inputBox.validationMessage = `Incomplete statement: ${res.errors[0].message} (Complete it, or click ⬅ to edit previous line)`;
          }
        }
      });

      inputBox.onDidHide(async () => {
        selectionListener.dispose();
        if (!isAccepted && hasAppliedAnyCode) {
          // User cancelled via Escape on an uncommitted line: roll back only that line's preview
          await editor.edit((edit) => {
            edit.replace(appliedRange, '');
          });
        }
        if (committedHistory.length > 0) {
          vscode.window.setStatusBarMessage(
            `✓ Konvert: Committed ${committedHistory.length} statement${committedHistory.length > 1 ? 's' : ''} to ${path.basename(editor.document.fileName)}`,
            3500
          );
        }
        inputBox.dispose();
      });

      inputBox.show();
    } catch (err: any) {
      console.error('Konvert Quick HUD failed to open:', err);
      vscode.window.showErrorMessage(`Konvert Quick HUD failed to open: ${err?.message || err}`);
    }
  };

  const scaffoldExecutionTemplate = async (target?: string) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor open to insert execution template.');
      return;
    }

    let lang = target;
    if (!lang) {
      const resolved = resolveLanguage(editor);
      if (EXECUTION_TEMPLATES[resolved]) {
        lang = resolved;
      } else {
        const choice = await vscode.window.showQuickPick(
          [
            { label: 'Python 3.12 (def main)', description: 'python' },
            { label: 'Java 21 (public class Main)', description: 'java' },
            { label: 'C++20 (int main)', description: 'cpp' },
            { label: 'C (int main)', description: 'c' },
          ],
          { placeHolder: 'Select language template to scaffold' }
        );
        if (!choice || !choice.description) return;
        lang = choice.description;
      }
    }

    if (lang && EXECUTION_TEMPLATES[lang]) {
      const tpl = EXECUTION_TEMPLATES[lang];
      await editor.edit((edit) => {
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        edit.replace(fullRange, tpl.code);
      });
      const targetPos = new vscode.Position(tpl.cursorLine, tpl.cursorCol);
      editor.selection = new vscode.Selection(targetPos, targetPos);
      editor.revealRange(new vscode.Range(targetPos, targetPos));
      vscode.window.showInformationMessage(`✓ Scaffolded ${lang.toUpperCase()} execution template`);
    }
  };

  context.subscriptions.push(vscode.commands.registerCommand('konvert.quickHUD', showQuickConvertHUD));
  context.subscriptions.push(vscode.commands.registerCommand('konvert.quickHud', showQuickConvertHUD));
  context.subscriptions.push(vscode.commands.registerCommand('konvert.convertEnglishToCode', showQuickConvertHUD));
  context.subscriptions.push(vscode.commands.registerCommand('intentengine.convertEnglishToCode', showQuickConvertHUD));
  context.subscriptions.push(vscode.commands.registerCommand('konvert.scaffoldTemplate', scaffoldExecutionTemplate));

  // 3. Reactive Continuous Twin-Buffer & Multi-File Project Manager
  const twinBufferManager = new TwinBufferManager();
  context.subscriptions.push(twinBufferManager);

  const workspaceWatcher = new WorkspaceWatcher();
  context.subscriptions.push(workspaceWatcher);

  context.subscriptions.push(
    vscode.commands.registerCommand('konvert.openReactiveTwin', () => twinBufferManager.openReactiveTwin())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('konvert.ejectEnglish', (uri) => twinBufferManager.ejectEnglish(uri))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('konvert.rebuildProject', () => workspaceWatcher.compileProject(true))
  );

  // 4. Command: Open Split-Pane Live Preview Webview
  const runLivePreview = () => {
    const panel = vscode.window.createWebviewPanel(
      'konvertLivePreview',
      'Konvert — Live Compiler Studio',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    const logoUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'icon.png')));
    panel.webview.html = getWebviewContent(logoUri.toString());

    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'compile') {
        const lang = message.lang || 'python';
        const startTime = performance.now();
        let code = '';
        let errors: any[] = [];
        let allTargets: { python: string; java: string; cpp: string } | null = null;

        if (lang === 'all') {
          const res = compileAll(message.text);
          errors = res.errors;
          if (errors.length === 0) {
            allTargets = {
              python: res.python,
              java: res.java,
              cpp: res.cpp,
            };
            code = res.python;
          }
        } else if (lang === 'java') {
          const res = compileToJava(message.text);
          code = res.code;
          errors = res.errors;
        } else if (lang === 'cpp') {
          const res = compileToCpp(message.text);
          code = res.code;
          errors = res.errors;
        } else {
          const res = compileToPython(message.text);
          code = res.code;
          errors = res.errors;
        }

        const latencyMs = (performance.now() - startTime).toFixed(2);

        panel.webview.postMessage({
          command: 'updateOutput',
          code,
          errors,
          latency: latencyMs,
          allTargets,
        });
      } else if (message.command === 'normalize') {
        const rawInput = message.text || '';

        const normalizedCNL = IntentNormalizer.normalize(rawInput);
        if (normalizedCNL !== rawInput) {
          panel.webview.postMessage({
            command: 'setNormalizedCNL',
            cnl: normalizedCNL,
          });
          return;
        }

        const targetDir = ModelDownloader.getTargetModelDir(context.globalStorageUri.fsPath);
        const hasWeights = ModelDownloader.isModelInstalled(targetDir) || ModelDownloader.isModelInstalled(path.join(context.extensionPath, 'models'));

        if (hasWeights) {
          try {
            const cnl = await normalizeEnglishWithModel(rawInput, context.extensionPath);
            panel.webview.postMessage({
              command: 'setNormalizedCNL',
              cnl,
            });
          } catch (err: any) {
            panel.webview.postMessage({
              command: 'normalizeError',
              error: err.message,
            });
          }
        } else {
          panel.webview.postMessage({
            command: 'normalizeInfo',
            info: 'Instant rule normalizer active. Download AI Language Engine from Command Palette for neural models.',
          });
        }
      } else if (message.command === 'insertToEditor') {
        const editor = lastActiveEditor || vscode.window.activeTextEditor || vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === 'file');
        if (editor) {
          await editor.edit((editBuilder) => {
            const codeToInsert = message.code.endsWith('\n') ? message.code : message.code + '\n';
            if (!editor.selection.isEmpty) {
              editBuilder.replace(editor.selection, codeToInsert);
            } else {
              editBuilder.insert(editor.selection.active, codeToInsert);
            }
          });
          vscode.window.showInformationMessage(`✓ Code inserted into ${path.basename(editor.document.fileName)}`);
        } else {
          const doc = await vscode.workspace.openTextDocument({
            content: message.code,
            language: message.lang || 'python',
          });
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
          vscode.window.showInformationMessage('✓ Code opened in new document');
        }
      } else if (message.command === 'liveSyncToEditor') {
        const editor = lastActiveEditor || vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === 'file');
        if (editor && message.code) {
          const doc = editor.document;
          const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length)
          );
          const newCode = message.code.endsWith('\n') ? message.code : message.code + '\n';
          if (doc.getText() !== newCode) {
            await editor.edit((editBuilder) => {
              editBuilder.replace(fullRange, newCode);
            }, { undoStopBefore: false, undoStopAfter: false });
          }
        }
      } else if (message.command === 'copy') {
        if (message.text) {
          await vscode.env.clipboard.writeText(message.text);
          vscode.window.setStatusBarMessage('✓ Konvert: Code copied to clipboard', 2500);
        }
      }
    });
  };

  context.subscriptions.push(vscode.commands.registerCommand('konvert.openLivePreview', runLivePreview));
  context.subscriptions.push(vscode.commands.registerCommand('intentengine.openLivePreview', runLivePreview));

  // 5. Rich Hover Provider for Konvert files (.knv)
  const hoverDocs: Record<string, string> = {
    'DEFINE FUNCTION': '### ⚡ Konvert Function Declaration\n\nDeclares a deterministic, type-annotated function.\n\n```english\nDEFINE FUNCTION add(a: Int, b: Int) -> Int:\n  RETURN a + b\nEND FUNCTION\n```\n\n* Compiles to: `def add(a: int, b: int) -> int:` in Python.\n* Emits strict types in Java and C++20.',
    'DEFINE CLASS': '### ⚡ Konvert Class / Record\n\nDefines a structured data entity.\n\n```english\nDEFINE CLASS User:\n  FIELD name AS String\n  FIELD age AS Int\nEND CLASS\n```\n\n* Emits `@dataclass` in Python 3.12.\n* Emits `record` in Java 21.\n* Emits type-safe `struct` in C++20.',
    'DECLARE': '### ⚡ Konvert Variable Declaration\n\n```english\nDECLARE count AS Int WITH VALUE 10\n```\nDeclares an immutable or mutable typed variable with optional initialization.',
    'FILTER': '### ⚡ Konvert Stream Filter\n\n```english\nFILTER users WHERE age >= 18\n```\nCompiles to list comprehensions in Python, Streams in Java, and `std::ranges` in C++20.',
    'SORT': '### ⚡ Konvert Sort Operation\n\n```english\nSORT items BY price DESC\n```\nPerforms deterministic sorting on collections with 0% hallucinations.',
    'PRINT': '### ⚡ Konvert Print Statement\n\n```english\nPRINT "Hello World"\n```\nOutputs to standard console across all target runtimes.',
  };

  context.subscriptions.push(
    vscode.languages.registerHoverProvider('konvert', {
      provideHover(document, position) {
        const lineText = document.lineAt(position.line).text.toUpperCase();
        for (const [kw, doc] of Object.entries(hoverDocs)) {
          if (lineText.includes(kw)) {
            const md = new vscode.MarkdownString(doc);
            md.isTrusted = true;
            return new vscode.Hover(md);
          }
        }
        return undefined;
      },
    })
  );

  // 6. Document Symbol Provider for Outline view & Breadcrumbs in .knv files
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider('konvert', {
      provideDocumentSymbols(document) {
        const symbols: vscode.DocumentSymbol[] = [];
        for (let i = 0; i < document.lineCount; i++) {
          const line = document.lineAt(i);
          const text = line.text.trim();

          const fnMatch = text.match(/^(?:DEFINE\s+(?:A\s+)?FUNCTION|def|fn)\s+([a-zA-Z_]\w*)/i);
          if (fnMatch) {
            symbols.push(
              new vscode.DocumentSymbol(
                fnMatch[1],
                'Function',
                vscode.SymbolKind.Function,
                line.range,
                line.range
              )
            );
          }

          const classMatch = text.match(/^(?:DEFINE\s+(?:A\s+)?CLASS|class)\s+([a-zA-Z_]\w*)/i);
          if (classMatch) {
            symbols.push(
              new vscode.DocumentSymbol(
                classMatch[1],
                'Class Record',
                vscode.SymbolKind.Class,
                line.range,
                line.range
              )
            );
          }
        }
        return symbols;
      },
    })
  );

  // 7. Inline Ghost-Text Provider (Triggers on comments like #? or //?)
  const inlineProvider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems(document, position) {
      const lineText = document.lineAt(position.line).text.substring(0, position.character);
      const match = lineText.match(/(?:#|\/\/)\?\s*(.+)$/);
      if (!match) return;

      const englishQuery = match[1].trim();
      if (!englishQuery) return;

      const result = compileForLang(englishQuery, document.languageId);
      if (result.errors.length > 0 || !result.code) return;

      const completion = new vscode.InlineCompletionItem(
        '\n' + result.code,
        new vscode.Range(position, position)
      );
      return [completion];
    },
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      [
        { scheme: 'file', language: 'python' },
        { scheme: 'file', language: 'java' },
        { scheme: 'file', language: 'cpp' },
        { scheme: 'file', language: 'c' },
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'typescript' },
      ],
      inlineProvider
    )
  );
}

export function deactivate() {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  ModelNormalizer.getInstance().stop();
}

async function normalizeEnglishWithModel(prompt: string, extensionPath: string): Promise<string> {
  const normalizer = ModelNormalizer.getInstance(extensionPath);
  try {
    return await normalizer.normalize(prompt, 5000);
  } catch {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(extensionPath, 'scripts', 'infer_cnl.py');
      const proc = spawn('python', [scriptPath, prompt]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          const lines = stdout.trim().split('\n').map((l) => l.trim()).filter(Boolean);
          const lastLine = lines[lines.length - 1] || '';
          resolve(lastLine);
        } else {
          reject(new Error(stderr || `Exited with code ${code}`));
        }
      });
    });
  }
}

function getWebviewContent(logoSrc?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Konvert — Live Compiler Studio</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --sidebar-bg: var(--vscode-sideBar-background, #252526);
      --input-bg: var(--vscode-input-background, #1e1e1e);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --accent: var(--vscode-button-background, #007acc);
      --accent-hover: var(--vscode-button-hoverBackground, #0062a3);
      --accent-fg: var(--vscode-button-foreground, #ffffff);
      --panel-border: var(--vscode-panel-border, #2d2d2d);
      --tab-active-bg: var(--vscode-tab-activeBackground, #1e1e1e);
      --tab-inactive-bg: var(--vscode-tab-inactiveBackground, #2d2d2d);
      --line-number: var(--vscode-editorLineNumber-foreground, #858585);
      --error: #f48771;
      --success: #4ec9b0;
      --font-mono: var(--vscode-editor-font-family, 'JetBrains Mono', 'Fira Code', 'Consolas', monospace);
      --font-ui: var(--vscode-font-family, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      --font-size: var(--vscode-editor-font-size, 13px);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-ui);
      background-color: var(--bg);
      color: var(--fg);
      height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 0;
      overflow: hidden;
      user-select: none;
    }

    /* Top Studio Header */
    .studio-header {
      background: var(--sidebar-bg);
      border-bottom: 1px solid var(--panel-border);
      padding: 8px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-logo {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      object-fit: contain;
      background: rgba(255, 255, 255, 0.04);
      padding: 2px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .brand-meta {
      display: flex;
      flex-direction: column;
    }

    .brand-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.2px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .studio-badge {
      font-size: 9.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(0, 122, 204, 0.2);
      color: #38bdf8;
      border: 1px solid rgba(0, 122, 204, 0.4);
    }

    .telemetry-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pill {
      font-family: var(--font-mono);
      font-size: 11px;
      padding: 3px 9px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 5px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--vscode-descriptionForeground, #999);
    }

    .pill-latency {
      color: #38bdf8;
      border-color: rgba(56, 189, 248, 0.3);
      background: rgba(56, 189, 248, 0.06);
    }

    .pulsing-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #38bdf8;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.9); opacity: 0.7; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.9); opacity: 0.7; }
    }

    /* Sub-header / Tabs Bar */
    .studio-tabs-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--tab-inactive-bg);
      border-bottom: 1px solid var(--panel-border);
      padding: 0 10px;
    }

    .ide-tabs {
      display: flex;
      gap: 2px;
    }

    .ide-tab {
      background: transparent;
      border: none;
      border-top: 2px solid transparent;
      padding: 8px 14px;
      color: var(--vscode-descriptionForeground, #8c8c8c);
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.12s ease;
    }

    .ide-tab:hover {
      color: var(--fg);
      background: rgba(255, 255, 255, 0.03);
    }

    .ide-tab.active {
      background: var(--bg);
      color: var(--fg);
      border-top-color: var(--accent);
      font-weight: 600;
    }

    .tab-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .action-icon-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--vscode-descriptionForeground, #999);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.12s ease;
    }

    .action-icon-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: var(--panel-border);
      color: var(--fg);
    }

    /* Quick Snippets Pill Bar */
    .snippet-tray {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: rgba(0, 0, 0, 0.1);
      border-bottom: 1px solid var(--panel-border);
      overflow-x: auto;
    }

    .snippet-tag {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #808080);
      white-space: nowrap;
    }

    .snippet-chip {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--vscode-descriptionForeground, #b8b8b8);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: var(--font-mono);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.12s ease;
    }

    .snippet-chip:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--accent);
      color: var(--fg);
    }

    /* Main Single Workspace */
    .workspace-single {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      background: var(--bg);
    }

    .editor-breadcrumbs {
      background: rgba(0, 0, 0, 0.18);
      border-bottom: 1px solid var(--panel-border);
      padding: 6px 14px;
      font-size: 11.5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--vscode-descriptionForeground, #808080);
      font-family: var(--font-mono);
    }

    .breadcrumb-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .file-title {
      font-weight: 600;
      color: var(--fg);
    }

    .sync-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(78, 201, 176, 0.1);
      border: 1px solid rgba(78, 201, 176, 0.3);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10.5px;
      color: var(--success);
      font-weight: 500;
    }

    .live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 6px var(--success);
      animation: pulse 1.5s infinite;
    }

    .breadcrumb-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .peek-toggle-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: var(--vscode-descriptionForeground, #aaa);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: var(--font-ui);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.12s ease;
    }

    .peek-toggle-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--fg);
      border-color: var(--accent);
    }

    .char-badge {
      font-size: 10.5px;
      color: var(--vscode-descriptionForeground, #777);
    }

    .editor-body {
      flex: 1;
      display: flex;
      position: relative;
      min-height: 0;
      background: var(--input-bg);
    }

    .line-gutter {
      width: 44px;
      padding: 12px 8px 12px 0;
      text-align: right;
      font-family: var(--font-mono);
      font-size: var(--font-size);
      line-height: 1.6;
      color: var(--line-number);
      user-select: none;
      background: rgba(0, 0, 0, 0.06);
      border-right: 1px solid rgba(255, 255, 255, 0.05);
    }

    textarea {
      flex: 1;
      padding: 12px 14px;
      font-family: var(--font-mono);
      font-size: var(--font-size);
      line-height: 1.6;
      background: transparent;
      color: var(--fg);
      border: none;
      outline: none;
      resize: none;
      user-select: text;
      tab-size: 4;
      white-space: pre;
      overflow: auto;
    }

    .peek-drawer {
      border-top: 1px solid var(--panel-border);
      background: var(--sidebar-bg);
      max-height: 160px;
      display: flex;
      flex-direction: column;
    }

    .peek-header {
      padding: 4px 14px;
      background: rgba(0, 0, 0, 0.18);
      border-bottom: 1px solid var(--panel-border);
      font-size: 10.5px;
      font-family: var(--font-mono);
      display: flex;
      justify-content: space-between;
      color: var(--vscode-descriptionForeground, #888);
    }

    .peek-drawer pre {
      flex: 1;
      padding: 8px 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.5;
      overflow: auto;
      max-height: 130px;
      color: #9cdcfe;
      background: transparent;
      margin: 0;
      white-space: pre;
    }

    .error-tray {
      padding: 6px 14px;
      background: rgba(244, 135, 113, 0.12);
      border-top: 1px solid rgba(244, 135, 113, 0.3);
      color: var(--error);
      font-size: 11px;
      font-family: var(--font-mono);
      max-height: 70px;
      overflow-y: auto;
      display: none;
    }

    /* Footer Status Bar */
    .studio-footer {
      background: var(--sidebar-bg);
      border-top: 1px solid var(--panel-border);
      padding: 6px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
    }

    .key-hints {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--vscode-descriptionForeground, #777);
    }

    .kbd {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 3px;
      padding: 1px 4px;
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--fg);
    }

    .footer-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: var(--fg);
      border: 1px solid var(--panel-border);
      padding: 5px 12px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-primary {
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      padding: 5px 14px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }

    .btn-primary:hover {
      background: var(--accent-hover);
    }
  </style>
</head>
<body>

  <!-- Studio Header -->
  <div class="studio-header">
    <div class="brand-section">
      ${logoSrc ? `<img src="${logoSrc}" alt="Konvert" class="brand-logo" />` : `<div style="font-weight:900; color:var(--accent);">K</div>`}
      <div class="brand-meta">
        <div class="brand-title">
          <span>Konvert</span>
          <span class="studio-badge">IDE Studio</span>
        </div>
      </div>
    </div>

    <div class="telemetry-row">
      <div class="pill pill-latency" id="latencyPill">
        <div class="pulsing-dot"></div>
        <span id="latencyText">⚡ 0.8ms compile</span>
      </div>
      <div class="pill" style="color: var(--success); border-color: rgba(78, 201, 176, 0.3);">✓ 0.0% Hallucination</div>
      <div class="pill">🔒 100% Offline</div>
    </div>
  </div>

  <!-- Tabs Bar -->
  <div class="studio-tabs-bar">
    <div class="ide-tabs" id="langTabs">
      <button class="ide-tab active" data-lang="python">Python 3.12</button>
      <button class="ide-tab" data-lang="java">Java 21</button>
      <button class="ide-tab" data-lang="cpp">C++20</button>
      <button class="ide-tab" data-lang="all">All Targets</button>
    </div>

    <div class="tab-actions">
      <label class="live-sync-pill" title="Continuously types directly into active VS Code editor in real time">
        <input type="checkbox" id="liveSyncToggle" checked style="accent-color: var(--accent); cursor: pointer;" />
        <span style="font-size: 11px; font-weight: 600; color: var(--accent); cursor: pointer;">⚡ Live Sync to Editor</span>
      </label>
      <button id="normalizeBtn" class="action-icon-btn" title="Normalize Casual English (Ctrl+Shift+N)">
        <span>✨</span> Normalize
      </button>
      <button id="clearBtn" class="action-icon-btn" title="Clear Editor">
        <span>🗑️</span> Clear
      </button>
    </div>
  </div>

  <!-- Quick Snippets Tray -->
  <div class="snippet-tray">
    <span class="snippet-tag">Snippets:</span>
    <span class="snippet-chip" data-template="template" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);">⚡ Execution Template</span>
    <span class="snippet-chip" data-template="print">Print</span>
    <span class="snippet-chip" data-template="function">Function</span>
    <span class="snippet-chip" data-template="variable">Variable</span>
    <span class="snippet-chip" data-template="filter">Filter</span>
    <span class="snippet-chip" data-template="conditional">If / Else</span>
    <span class="snippet-chip" data-template="loop">For Each</span>
    <span class="snippet-chip" data-template="class">Class Record</span>
  </div>

  <!-- Unified Single Screen Workspace -->
  <div class="workspace-single">
    <div class="editor-breadcrumbs">
      <div class="breadcrumb-left">
        <span class="file-icon">📄</span>
        <span class="file-title">logic.knv</span>
        <span class="sync-badge" id="syncStatus">
          <span class="live-dot"></span>
          <span id="syncText">Streaming to Active Editor in Real-Time</span>
        </span>
      </div>
      <div class="breadcrumb-right">
        <button id="togglePeekBtn" class="peek-toggle-btn" title="Peek Emitted Target Code">
          <span>👁️</span> <span id="peekBtnText">Peek Code</span>
        </button>
        <span id="sourceCharCount" class="char-badge">0 chars</span>
      </div>
    </div>

    <div class="editor-body">
      <div class="line-gutter" id="inputGutter">1</div>
      <textarea id="input" spellcheck="false" placeholder="Write plain English in real time...&#10;e.g.&#10;print hello world&#10;calculate total = price * 1.18&#10;define function add(a: Int, b: Int) -> Int:&#10;  return a + b&#10;end function">print hello world</textarea>
    </div>

    <div id="errorDrawer" class="error-tray"></div>

    <!-- Collapsible Peek Target Drawer (hidden by default) -->
    <div id="peekDrawer" class="peek-drawer" style="display: none;">
      <div class="peek-header">
        <span id="targetBreadcrumb">⚡ Emitted Target Code</span>
        <span id="targetCharCount">0 chars</span>
      </div>
      <pre id="output"></pre>
    </div>
  </div>

  <!-- Studio Footer -->
  <div class="studio-footer">
    <div class="key-hints">
      <span><span class="kbd">Ctrl</span> + <span class="kbd">Alt</span> + <span class="kbd">K</span> Realtime HUD</span>
      <span><span class="kbd">Ctrl</span> + <span class="kbd">Shift</span> + <span class="kbd">N</span> Normalize</span>
      <span><span class="kbd">Ctrl</span> + <span class="kbd">Alt</span> + <span class="kbd">T</span> Reactive Twin</span>
    </div>

    <div class="footer-actions">
      <button id="copyBtn" class="btn-secondary" title="Copy Emitted Target Code">
        <span id="copyIcon">📋</span> Copy Code
      </button>
      <div class="sync-indicator-btn" id="syncIndicator">
        <span class="live-dot"></span>
        <span>Streaming to Editor in Real Time</span>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const inputEl = document.getElementById('input');
    const outputEl = document.getElementById('output');
    const inputGutter = document.getElementById('inputGutter');
    const errorDrawer = document.getElementById('errorDrawer');
    const latencyText = document.getElementById('latencyText');
    const targetBreadcrumb = document.getElementById('targetBreadcrumb');
    const sourceCharCount = document.getElementById('sourceCharCount');
    const targetCharCount = document.getElementById('targetCharCount');
    const langTabs = document.getElementById('langTabs');
    const normalizeBtn = document.getElementById('normalizeBtn');
    const copyBtn = document.getElementById('copyBtn');
    const clearBtn = document.getElementById('clearBtn');
    const liveSyncToggle = document.getElementById('liveSyncToggle');
    const togglePeekBtn = document.getElementById('togglePeekBtn');
    const peekDrawer = document.getElementById('peekDrawer');
    const peekBtnText = document.getElementById('peekBtnText');

    let currentLang = 'python';
    let liveSyncTimer = null;
    let isPeekOpen = false;

    if (togglePeekBtn && peekDrawer) {
      togglePeekBtn.addEventListener('click', () => {
        isPeekOpen = !isPeekOpen;
        peekDrawer.style.display = isPeekOpen ? 'flex' : 'none';
        peekBtnText.textContent = isPeekOpen ? 'Hide Code' : 'Peek Code';
        togglePeekBtn.style.borderColor = isPeekOpen ? 'var(--accent)' : 'rgba(255, 255, 255, 0.12)';
      });
    }

    function queueLiveSync() {
      if (!liveSyncToggle || !liveSyncToggle.checked) return;
      if (currentLang === 'all') return;
      clearTimeout(liveSyncTimer);
      liveSyncTimer = setTimeout(() => {
        if (outputEl && outputEl.textContent && (!errorDrawer.style.display || errorDrawer.style.display === 'none')) {
          vscode.postMessage({
            command: 'liveSyncToEditor',
            code: outputEl.textContent,
            lang: currentLang
          });
          const syncIndicator = document.getElementById('syncIndicator');
          if (syncIndicator) {
            syncIndicator.innerHTML = '<span class="live-dot"></span><span>Streaming in Real Time ✓</span>';
          }
        }
      }, 60);
    }

    const templates = {
      template: ['define function main() -> Void:', '  print "Hello from Konvert!"', 'end function'].join('\\n'),
      print: 'print hello world',
      function: ['define function add(a: Int, b: Int) -> Int:', '  return a + b', 'end function'].join('\\n'),
      variable: 'declare total as Int with value 100',
      filter: ['declare users as List<User>', 'filter users where age >= 18', 'return result'].join('\\n'),
      conditional: ['if score >= 90:', '  print "Grade A"', 'else if score >= 75:', '  print "Grade B"', 'else:', '  print "Grade C"', 'end if'].join('\\n'),
      loop: ['for each item in items:', '  print item', 'end for'].join('\\n'),
      class: ['define class User:', '  field name as String', '  field age as Int', '  field active as Bool with default true', 'end class'].join('\\n')
    };

    function updateGutters() {
      const inLines = (inputEl.value.match(/\\n/g) || []).length + 1;
      let inNums = '';
      for (let i = 1; i <= inLines; i++) inNums += i + '<br>';
      inputGutter.innerHTML = inNums;

      sourceCharCount.textContent = inputEl.value.length + ' chars';
      if (outputEl && targetCharCount) {
        targetCharCount.textContent = outputEl.textContent.length + ' chars';
      }
    }

    function triggerCompile() {
      updateGutters();
      vscode.postMessage({
        command: 'compile',
        text: inputEl.value,
        lang: currentLang
      });
    }

    inputEl.addEventListener('input', triggerCompile);
    inputEl.addEventListener('scroll', () => {
      inputGutter.scrollTop = inputEl.scrollTop;
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd;
        const val = inputEl.value;
        inputEl.value = val.substring(0, start) + '  ' + val.substring(end);
        inputEl.selectionStart = inputEl.selectionEnd = start + 2;
        triggerCompile();
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const start = inputEl.selectionStart;
        const val = inputEl.value;
        const currentLine = val.substring(0, start).split('\n').pop() || '';
        const indentMatch = currentLine.match(/^(\s*)/);
        let indent = indentMatch ? indentMatch[1] : '';
        if (currentLine.trimEnd().endsWith(':')) {
          indent += '  ';
        }
        if (indent) {
          e.preventDefault();
          const end = inputEl.selectionEnd;
          inputEl.value = val.substring(0, start) + '\n' + indent + val.substring(end);
          inputEl.selectionStart = inputEl.selectionEnd = start + 1 + indent.length;
          triggerCompile();
        }
      }
    });

    langTabs.querySelectorAll('.ide-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        langTabs.querySelectorAll('.ide-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentLang = btn.getAttribute('data-lang');

        if (currentLang === 'java') {
          targetBreadcrumb.textContent = '⚡ Emitted Java 21 Records';
        } else if (currentLang === 'cpp') {
          targetBreadcrumb.textContent = '⚡ Emitted C++20';
        } else if (currentLang === 'all') {
          targetBreadcrumb.textContent = '⚡ Multi-Target (Python, Java, C++)';
        } else {
          targetBreadcrumb.textContent = '⚡ Emitted Python 3.12 PEP 8';
        }

        triggerCompile();
      });
    });

    document.querySelectorAll('.snippet-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const type = chip.getAttribute('data-template');
        if (templates[type]) {
          inputEl.value = templates[type];
          triggerCompile();
        }
      });
    });

    normalizeBtn.addEventListener('click', () => {
      normalizeBtn.disabled = true;
      normalizeBtn.innerHTML = '<span>⏳</span> Normalizing...';
      vscode.postMessage({ command: 'normalize', text: inputEl.value });
    });

    clearBtn.addEventListener('click', () => {
      inputEl.value = '';
      if (outputEl) outputEl.textContent = '';
      updateGutters();
      errorDrawer.style.display = 'none';
      inputEl.focus();
    });

    copyBtn.addEventListener('click', () => {
      if (outputEl && outputEl.textContent) {
        vscode.postMessage({ command: 'copy', text: outputEl.textContent });
        copyBtn.innerHTML = '<span>✓</span> Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = '<span id="copyIcon">📋</span> Copy Code';
        }, 1500);
      }
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (outputEl && outputEl.textContent) {
          vscode.postMessage({ command: 'liveSyncToEditor', code: outputEl.textContent, lang: currentLang });
          const syncIndicator = document.getElementById('syncIndicator');
          if (syncIndicator) {
            syncIndicator.innerHTML = '<span class="live-dot"></span><span>Synced to Active Editor ✓</span>';
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault();
        normalizeBtn.click();
      }
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'updateOutput') {
        if (msg.latency) {
          latencyText.textContent = '⚡ ' + msg.latency + 'ms compile';
        }

        if (msg.errors && msg.errors.length > 0) {
          errorDrawer.style.display = 'block';
          errorDrawer.style.background = 'rgba(244, 135, 113, 0.12)';
          errorDrawer.style.borderColor = 'rgba(244, 135, 113, 0.3)';
          errorDrawer.style.color = 'var(--error)';
          errorDrawer.textContent = 'Line ' + (msg.errors[0].line || 1) + ': ' + msg.errors[0].message;
          outputEl.style.opacity = '0.4';
        } else {
          errorDrawer.style.display = 'none';

          if (currentLang === 'all' && msg.allTargets) {
            outputEl.textContent =
              '# =================== PYTHON 3.12 ===================\\n' +
              msg.allTargets.python +
              '\\n\\n// ==================== JAVA 21 =====================\\n' +
              msg.allTargets.java +
              '\\n\\n// ===================== C++20 ======================\\n' +
              msg.allTargets.cpp;
          } else {
            outputEl.textContent = msg.code;
          }
          outputEl.style.opacity = '1';
        }
        updateGutters();
        queueLiveSync();
      } else if (msg.command === 'setNormalizedCNL') {
        normalizeBtn.disabled = false;
        normalizeBtn.innerHTML = '<span>✨</span> Normalize';
        inputEl.value = msg.cnl;
        errorDrawer.style.display = 'none';
        triggerCompile();
      } else if (msg.command === 'normalizeInfo') {
        normalizeBtn.disabled = false;
        normalizeBtn.innerHTML = '<span>✨</span> Normalize';
        errorDrawer.style.display = 'block';
        errorDrawer.style.background = 'rgba(0, 122, 204, 0.1)';
        errorDrawer.style.borderColor = 'rgba(0, 122, 204, 0.3)';
        errorDrawer.style.color = 'var(--accent)';
        errorDrawer.textContent = 'ℹ️ ' + msg.info;
      } else if (msg.command === 'normalizeError') {
        normalizeBtn.disabled = false;
        normalizeBtn.innerHTML = '<span>✨</span> Normalize';
        errorDrawer.style.display = 'block';
        errorDrawer.style.background = 'rgba(244, 135, 113, 0.12)';
        errorDrawer.style.borderColor = 'rgba(244, 135, 113, 0.3)';
        errorDrawer.style.color = 'var(--error)';
        errorDrawer.textContent = 'Normalization: ' + msg.error;
      }
    });

    triggerCompile();
  </script>
</body>
</html>`;
}
