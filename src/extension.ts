import * as vscode from 'vscode';
import { parseCNL, compileToPython, compileToJava, compileToCpp, compileAll } from './compiler/index.js';
import { ContextBuilder } from './core/contextBuilder.js';
import { ModelNormalizer } from './core/modelNormalizer.js';
import { ModelDownloader } from './core/modelDownloader.js';
import { IntentNormalizer } from './core/intentNormalizer.js';
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
  statusBarItem.tooltip = 'Konvert: English to Code (Ctrl+Alt+K for Realtime HUD)';
  statusBarItem.command = 'konvert.quickHUD';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 2. Command: Real-Time Floating Quick-HUD (Popup window right inside the editor)
  const showQuickConvertHUD = () => {
    // Determine the target editor and language
    const currentEditor = vscode.window.activeTextEditor || lastActiveEditor || vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === 'file');
    let targetLang = currentEditor ? currentEditor.document.languageId : 'python';
    if (!['python', 'java', 'cpp', 'c'].includes(targetLang)) {
      targetLang = 'python';
    }

    const inputBox = vscode.window.createInputBox();
    inputBox.title = '⚡ Konvert — English to Code (Realtime HUD)';
    inputBox.placeholder = 'Write plain English (e.g. "print hello world", "calculate total = price * 1.18", "function add a b -> int")...';
    inputBox.prompt = `[Target: ${targetLang.toUpperCase()}] Type English intent — press Enter to write code into editor`;
    inputBox.ignoreFocusOut = false;

    const langBtn: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('symbol-variable'),
      tooltip: `Target Language: ${targetLang.toUpperCase()} (Click to change)`,
    };

    const previewBtn: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('layout-sidebar-right'),
      tooltip: 'Open Split Live Preview Panel',
    };

    inputBox.buttons = [langBtn, previewBtn];

    let currentCompiledCode = '';
    let isSyntaxValid = false;

    const runLiveCompilation = (rawInput: string) => {
      const text = rawInput.trim();
      if (!text) {
        inputBox.prompt = `[Target: ${targetLang.toUpperCase()}] Type English intent — press Enter to write code into editor`;
        inputBox.validationMessage = undefined;
        currentCompiledCode = '';
        isSyntaxValid = false;
        return;
      }

      const t0 = performance.now();
      const res = compileForLang(text, targetLang);
      const elapsedMs = (performance.now() - t0).toFixed(1);

      if (res.errors.length === 0 && res.code.trim().length > 0) {
        currentCompiledCode = res.code;
        isSyntaxValid = true;
        const compactPreview = res.code.trim().replace(/\r?\n\s*/g, ' ↵ ');
        inputBox.prompt = `✨ [${elapsedMs}ms] ${targetLang.toUpperCase()} Output: ${compactPreview}`;
        inputBox.validationMessage = undefined;
      } else {
        currentCompiledCode = '';
        isSyntaxValid = false;
        const hint = res.errors[0]?.message || 'Type complete intent...';
        inputBox.prompt = `⏳ Typing intent... (${hint})`;
      }
    };

    inputBox.onDidChangeValue((val) => {
      runLiveCompilation(val);
    });

    inputBox.onDidTriggerButton(async (btn) => {
      if (btn === langBtn) {
        const choice = await vscode.window.showQuickPick(
          [
            { label: 'Python 3.12', description: 'python' },
            { label: 'Java 21', description: 'java' },
            { label: 'C++20', description: 'cpp' },
          ],
          { placeHolder: 'Select target compilation language' }
        );
        if (choice) {
          targetLang = choice.description;
          inputBox.buttons = [
            {
              iconPath: new vscode.ThemeIcon('symbol-variable'),
              tooltip: `Target Language: ${targetLang.toUpperCase()} (Click to change)`,
            },
            previewBtn,
          ];
          runLiveCompilation(inputBox.value);
        }
      } else if (btn === previewBtn) {
        inputBox.hide();
        vscode.commands.executeCommand('konvert.openLivePreview');
      }
    });

    inputBox.onDidAccept(async () => {
      const text = inputBox.value.trim();
      if (!text) {
        inputBox.hide();
        return;
      }

      let finalCode = currentCompiledCode;
      if (!isSyntaxValid || !finalCode) {
        const res = compileForLang(text, targetLang);
        if (res.errors.length === 0 && res.code.trim()) {
          finalCode = res.code;
        } else {
          vscode.window.showWarningMessage(`Konvert: Could not compile intent "${text}".`);
          return;
        }
      }

      inputBox.hide();

      // Find the editor to insert into
      const editor = vscode.window.activeTextEditor || currentEditor || lastActiveEditor || vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === 'file');

      if (editor) {
        await editor.edit((editBuilder) => {
          const pos = editor.selection.active;
          const lineText = editor.document.lineAt(pos.line).text;
          const indentMatch = lineText.match(/^(\s*)/);
          const currentIndent = indentMatch ? indentMatch[1] : '';

          let codeToInsert = finalCode;
          if (currentIndent && codeToInsert.includes('\n')) {
            codeToInsert = codeToInsert
              .split('\n')
              .map((line, idx) => (idx > 0 && line.trim() ? currentIndent + line : line))
              .join('\n');
          }
          if (!codeToInsert.endsWith('\n')) {
            codeToInsert += '\n';
          }

          if (!editor.selection.isEmpty) {
            editBuilder.replace(editor.selection, codeToInsert);
          } else {
            editBuilder.insert(pos, codeToInsert);
          }
        });

        contextBuilder.addStatement(text);
        vscode.window.setStatusBarMessage(`⚡ Konvert: Generated ${targetLang.toUpperCase()} code in <2ms!`, 3000);
      } else {
        // Fallback: If no editor is open, open a new untitled file with the code
        const doc = await vscode.workspace.openTextDocument({
          content: finalCode,
          language: targetLang,
        });
        await vscode.window.showTextDocument(doc);
      }
    });

    inputBox.show();
  };

  context.subscriptions.push(vscode.commands.registerCommand('konvert.quickHUD', showQuickConvertHUD));
  context.subscriptions.push(vscode.commands.registerCommand('konvert.convertEnglishToCode', showQuickConvertHUD));
  context.subscriptions.push(vscode.commands.registerCommand('intentengine.convertEnglishToCode', showQuickConvertHUD));

  // 3. Command: Open Split-Pane Live Preview Webview
  const runLivePreview = () => {
    const panel = vscode.window.createWebviewPanel(
      'konvertLivePreview',
      'Konvert — Live Compiler',
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

        // Step 1: Use deterministic instant normalizer first (sub-millisecond, zero hallucination)
        const normalizedCNL = IntentNormalizer.normalize(rawInput);
        if (normalizedCNL !== rawInput) {
          panel.webview.postMessage({
            command: 'setNormalizedCNL',
            cnl: normalizedCNL,
          });
          return;
        }

        // Step 2: Check if neural weights are available locally
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
            info: 'Instant normalizer active. Download AI Language Engine from Command Palette for neural models.',
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

  // 4. Inline Ghost-Text Provider (Triggers on comments like #? or //?)
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
    // Graceful fallback to standalone script if daemon failed
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
  <title>Konvert — Live Compiler</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --input-bg: var(--vscode-input-background, #252526);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --accent: var(--vscode-button-background, #007acc);
      --accent-hover: var(--vscode-button-hoverBackground, #0062a3);
      --accent-fg: var(--vscode-button-foreground, #ffffff);
      --panel-border: var(--vscode-panel-border, #2d2d2d);
      --badge-bg: var(--vscode-badge-background, #4d4d4d);
      --badge-fg: var(--vscode-badge-foreground, #ffffff);
      --error: #f48771;
      --success: #89d185;
      --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace;
      --font-ui: var(--vscode-font-family, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-ui);
      background-color: var(--bg);
      color: var(--fg);
      height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 12px 16px;
      overflow: hidden;
      user-select: none;
    }

    /* Top Brand Bar */
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--panel-border);
      margin-bottom: 10px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-icon {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      background: var(--accent);
      color: var(--accent-fg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
    }

    .brand-title {
      font-weight: 700;
      font-size: 14px;
      letter-spacing: -0.2px;
      color: var(--fg);
    }

    .brand-tag {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888);
      margin-left: 8px;
    }

    .status-chips {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .chip {
      font-size: 10.5px;
      padding: 3px 8px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--vscode-descriptionForeground, #aaa);
      font-family: var(--font-mono);
    }

    .chip-latency {
      color: #38bdf8;
      border-color: rgba(56, 189, 248, 0.25);
    }

    .chip-success {
      color: var(--success);
      border-color: rgba(137, 209, 133, 0.25);
    }

    /* Controls Bar */
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      gap: 8px;
    }

    .segmented-control {
      display: flex;
      background: var(--input-bg);
      border: 1px solid var(--panel-border);
      border-radius: 6px;
      padding: 2px;
      gap: 2px;
    }

    .segmented-btn {
      background: transparent;
      border: none;
      color: var(--vscode-descriptionForeground, #999);
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .segmented-btn:hover {
      color: var(--fg);
      background: rgba(255, 255, 255, 0.04);
    }

    .segmented-btn.active {
      background: var(--accent);
      color: var(--accent-fg);
    }

    .tool-actions {
      display: flex;
      gap: 6px;
    }

    .btn-action {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--panel-border);
      color: var(--fg);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }

    .btn-action:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-action:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Template Snippets Pills */
    .snippets-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 10px;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .snippet-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #808080);
      margin-right: 4px;
      white-space: nowrap;
    }

    .snippet-pill {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--vscode-descriptionForeground, #b0b0b0);
      padding: 2px 9px;
      border-radius: 10px;
      font-size: 10.5px;
      font-family: var(--font-mono);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.12s ease;
    }

    .snippet-pill:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--fg);
      border-color: var(--accent);
    }

    /* Split Panes */
    .panes-container {
      display: flex;
      flex: 1;
      gap: 12px;
      min-height: 0;
    }

    .pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: var(--input-bg);
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      overflow: hidden;
    }

    .pane-header {
      padding: 7px 12px;
      background: rgba(0, 0, 0, 0.15);
      border-bottom: 1px solid var(--panel-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .pane-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #9e9e9e);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .pane-status {
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--success);
    }

    .status-dot.error {
      background: var(--error);
    }

    .editor-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      position: relative;
      min-height: 0;
    }

    textarea {
      flex: 1;
      width: 100%;
      padding: 10px 12px;
      font-family: var(--font-mono);
      font-size: 12.5px;
      line-height: 1.5;
      background: transparent;
      color: var(--fg);
      border: none;
      outline: none;
      resize: none;
      user-select: text;
    }

    pre {
      flex: 1;
      width: 100%;
      padding: 10px 12px;
      font-family: var(--font-mono);
      font-size: 12.5px;
      line-height: 1.5;
      background: transparent;
      color: var(--fg);
      border: none;
      overflow: auto;
      user-select: text;
      white-space: pre;
    }

    .error-drawer {
      padding: 6px 12px;
      background: rgba(244, 135, 113, 0.12);
      border-top: 1px solid rgba(244, 135, 113, 0.3);
      color: var(--error);
      font-size: 11px;
      font-family: var(--font-mono);
      max-height: 80px;
      overflow-y: auto;
      display: none;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Footer Action Bar */
    .footer-bar {
      margin-top: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 8px;
      border-top: 1px solid var(--panel-border);
    }

    .hints {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #7a7a7a);
      display: flex;
      gap: 14px;
    }

    .kbd {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--fg);
    }

    .primary-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-primary {
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
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

    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: var(--fg);
      border: 1px solid var(--panel-border);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }
  </style>
</head>
<body>

  <!-- Top Brand Bar -->
  <div class="top-bar">
    <div class="brand">
      ${logoSrc ? `<img src="${logoSrc}" alt="Konvert" style="width: 26px; height: 26px; border-radius: 6px; object-fit: contain; background: rgba(255,255,255,0.05); padding: 2px;" />` : `<div class="brand-icon">K</div>`}
      <div>
        <span class="brand-title">Konvert</span>
        <span class="brand-tag">Deterministic English-to-Code</span>
      </div>
    </div>
    <div class="status-chips">
      <div class="chip chip-latency" id="latencyChip">⚡ 0.8ms compile</div>
      <div class="chip chip-success">✓ 0% Hallucination</div>
      <div class="chip">🔒 100% Offline</div>
    </div>
  </div>

  <!-- Controls Bar -->
  <div class="toolbar">
    <div class="segmented-control" id="langTabs">
      <button class="segmented-btn active" data-lang="python">Python 3.12</button>
      <button class="segmented-btn" data-lang="java">Java 21</button>
      <button class="segmented-btn" data-lang="cpp">C++20</button>
      <button class="segmented-btn" data-lang="all">All Targets</button>
    </div>

    <div class="tool-actions">
      <button id="normalizeBtn" class="btn-action">
        <span>✨</span> Normalize English
      </button>
      <button id="clearBtn" class="btn-action">
        <span>🗑️</span> Clear
      </button>
    </div>
  </div>

  <!-- Quick Templates Row -->
  <div class="snippets-row">
    <span class="snippet-label">Quick Snippets:</span>
    <span class="snippet-pill" data-template="print">Print</span>
    <span class="snippet-pill" data-template="function">Function</span>
    <span class="snippet-pill" data-template="variable">Variable</span>
    <span class="snippet-pill" data-template="filter">Filter List</span>
    <span class="snippet-pill" data-template="conditional">If / Else</span>
    <span class="snippet-pill" data-template="loop">For Each</span>
    <span class="snippet-pill" data-template="class">Class Record</span>
  </div>

  <!-- Split Panes -->
  <div class="panes-container">
    <!-- Left Pane: Input -->
    <div class="pane">
      <div class="pane-header">
        <span class="pane-title">English Intent / CNL</span>
        <div class="pane-status" id="grammarStatus">
          <span class="status-dot"></span>
          <span style="font-size: 10px; font-weight: 600; color: var(--success);" id="grammarLabel">Valid</span>
        </div>
      </div>
      <div class="editor-wrapper">
        <textarea id="input" spellcheck="false" placeholder="Write plain English or Structured CNL...&#10;e.g.&#10;print hello world&#10;calculate total = price * 1.18&#10;define function add(a: Int, b: Int) -> Int:&#10;  return a + b&#10;end function">print hello world</textarea>
      </div>
      <div id="errorDrawer" class="error-drawer"></div>
    </div>

    <!-- Right Pane: Output -->
    <div class="pane">
      <div class="pane-header">
        <span class="pane-title" id="outputPaneTitle">Generated Python 3.12 (PEP 8)</span>
        <span id="charCount" style="font-size: 10px; color: var(--vscode-descriptionForeground);">0 chars</span>
      </div>
      <div class="editor-wrapper">
        <pre id="output"></pre>
      </div>
    </div>
  </div>

  <!-- Footer Action Bar -->
  <div class="footer-bar">
    <div class="hints">
      <span><span class="kbd">Ctrl</span> + <span class="kbd">Enter</span> Insert to Editor</span>
      <span><span class="kbd">Ctrl</span> + <span class="kbd">Alt</span> + <span class="kbd">K</span> Quick HUD</span>
    </div>
    <div class="primary-actions">
      <button id="copyBtn" class="btn-secondary">
        <span id="copyIcon">📋</span> Copy Code
      </button>
      <button id="insertBtn" class="btn-primary">
        <span>↵</span> Insert into Active Editor
      </button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const inputEl = document.getElementById('input');
    const outputEl = document.getElementById('output');
    const errorDrawer = document.getElementById('errorDrawer');
    const grammarStatus = document.getElementById('grammarStatus');
    const grammarLabel = document.getElementById('grammarLabel');
    const outputPaneTitle = document.getElementById('outputPaneTitle');
    const charCount = document.getElementById('charCount');
    const latencyChip = document.getElementById('latencyChip');
    const langTabs = document.getElementById('langTabs');
    const normalizeBtn = document.getElementById('normalizeBtn');
    const copyBtn = document.getElementById('copyBtn');
    const insertBtn = document.getElementById('insertBtn');
    const clearBtn = document.getElementById('clearBtn');

    let currentLang = 'python';

    const templates = {
      print: 'print hello world',
      function: ['define function add(a: Int, b: Int) -> Int:', '  return a + b', 'end function'].join('\\n'),
      variable: 'declare total as Int with value 100',
      filter: ['declare users as List<User>', 'filter users where age >= 18', 'return result'].join('\\n'),
      conditional: ['if score >= 90:', '  print "Grade A"', 'else if score >= 75:', '  print "Grade B"', 'else:', '  print "Grade C"', 'end if'].join('\\n'),
      loop: ['for each item in items:', '  print item', 'end for'].join('\\n'),
      class: ['define class User:', '  field name as String', '  field age as Int', '  field active as Bool with default true', 'end class'].join('\\n')
    };

    function triggerCompile() {
      vscode.postMessage({
        command: 'compile',
        text: inputEl.value,
        lang: currentLang
      });
    }

    inputEl.addEventListener('input', triggerCompile);

    // Segmented language button click
    langTabs.querySelectorAll('.segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        langTabs.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentLang = btn.getAttribute('data-lang');

        if (currentLang === 'java') {
          outputPaneTitle.textContent = 'Generated Java 21 (Streams & Records)';
        } else if (currentLang === 'cpp') {
          outputPaneTitle.textContent = 'Generated C++20 (Ranges & RAII)';
        } else if (currentLang === 'all') {
          outputPaneTitle.textContent = 'Multi-Target (Python, Java, C++)';
        } else {
          outputPaneTitle.textContent = 'Generated Python 3.12 (PEP 8)';
        }

        triggerCompile();
      });
    });

    // Snippets click
    document.querySelectorAll('.snippet-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const type = pill.getAttribute('data-template');
        if (templates[type]) {
          inputEl.value = templates[type];
          triggerCompile();
        }
      });
    });

    // Normalize AI button
    normalizeBtn.addEventListener('click', () => {
      normalizeBtn.disabled = true;
      normalizeBtn.innerHTML = '<span>⏳</span> Normalizing...';
      vscode.postMessage({ command: 'normalize', text: inputEl.value });
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
      inputEl.value = '';
      outputEl.textContent = '';
      charCount.textContent = '0 chars';
      errorDrawer.style.display = 'none';
      grammarStatus.querySelector('.status-dot').className = 'status-dot';
      grammarLabel.textContent = 'Ready';
      grammarLabel.style.color = 'var(--vscode-descriptionForeground)';
      inputEl.focus();
    });

    // Copy Code button
    copyBtn.addEventListener('click', () => {
      if (outputEl.textContent) {
        vscode.postMessage({ command: 'copy', text: outputEl.textContent });
        copyBtn.innerHTML = '<span>✓</span> Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = '<span id="copyIcon">📋</span> Copy Code';
        }, 1500);
      }
    });

    // Insert into editor
    insertBtn.addEventListener('click', () => {
      if (outputEl.textContent) {
        vscode.postMessage({ command: 'insertToEditor', code: outputEl.textContent, lang: currentLang });
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        insertBtn.click();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault();
        normalizeBtn.click();
      }
    });

    // Listen for incoming messages from extension
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'updateOutput') {
        if (msg.latency) {
          latencyChip.textContent = '⚡ ' + msg.latency + 'ms compile';
        }

        if (msg.errors && msg.errors.length > 0) {
          grammarStatus.querySelector('.status-dot').className = 'status-dot error';
          grammarLabel.textContent = 'Syntax Diagnostic';
          grammarLabel.style.color = 'var(--error)';
          errorDrawer.style.display = 'block';
          errorDrawer.style.background = 'rgba(244, 135, 113, 0.12)';
          errorDrawer.style.borderColor = 'rgba(244, 135, 113, 0.3)';
          errorDrawer.style.color = 'var(--error)';
          errorDrawer.textContent = 'Line ' + (msg.errors[0].line || 1) + ': ' + msg.errors[0].message;
          outputEl.style.opacity = '0.4';
        } else {
          grammarStatus.querySelector('.status-dot').className = 'status-dot';
          grammarLabel.textContent = 'Valid';
          grammarLabel.style.color = 'var(--success)';
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
        charCount.textContent = outputEl.textContent.length + ' chars';
      } else if (msg.command === 'setNormalizedCNL') {
        normalizeBtn.disabled = false;
        normalizeBtn.innerHTML = '<span>✨</span> Normalize English';
        inputEl.value = msg.cnl;
        errorDrawer.style.display = 'none';
        triggerCompile();
      } else if (msg.command === 'normalizeInfo') {
        normalizeBtn.disabled = false;
        normalizeBtn.innerHTML = '<span>✨</span> Normalize English';
        errorDrawer.style.display = 'block';
        errorDrawer.style.background = 'rgba(0, 122, 204, 0.1)';
        errorDrawer.style.borderColor = 'rgba(0, 122, 204, 0.3)';
        errorDrawer.style.color = 'var(--accent)';
        errorDrawer.textContent = 'ℹ️ ' + msg.info;
      } else if (msg.command === 'normalizeError') {
        normalizeBtn.disabled = false;
        normalizeBtn.innerHTML = '<span>✨</span> Normalize English';
        errorDrawer.style.display = 'block';
        errorDrawer.style.background = 'rgba(244, 135, 113, 0.12)';
        errorDrawer.style.borderColor = 'rgba(244, 135, 113, 0.3)';
        errorDrawer.style.color = 'var(--error)';
        errorDrawer.textContent = 'Normalization: ' + msg.error;
      }
    });

    // Initial trigger
    triggerCompile();
  </script>
</body>
</html>`;
}
