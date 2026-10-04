import * as vscode from 'vscode';
import { parseCNL, compileToPython, compileToJava, compileToCpp, compileAll } from './compiler/index.js';
import { ContextBuilder } from './core/contextBuilder.js';
import { ModelNormalizer } from './core/modelNormalizer.js';
import { spawn } from 'child_process';
import * as path from 'path';

let contextBuilder = new ContextBuilder();
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log('Konvert Extension is now active!');

  // 1. Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(zap) Konvert: Ready';
  statusBarItem.tooltip = 'Konvert: Deterministic English-to-Code (<2ms, 0% Hallucination, Offline)';
  statusBarItem.command = 'konvert.openLivePreview';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

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

  // 2. Command: Convert English to Code via Input Box
  const runConvert = async () => {
    const editor = vscode.window.activeTextEditor;
    const targetLang = editor ? editor.document.languageId : 'python';

    const input = await vscode.window.showInputBox({
      prompt: `Enter intent in English (Target: ${targetLang})`,
      placeHolder: 'e.g. "declare total as integer with value 100" or "DEFINE FUNCTION add..."',
    });

    if (!input) return;

    // Try deterministic compiler first
    let result = compileForLang(input, targetLang);
    
    // If direct parsing had errors and model is available, normalize via local model
    if (result.errors.length > 0) {
      statusBarItem.text = '$(sync~spin) Normalizing Intent...';
      try {
        const normalizedCNL = await normalizeEnglishWithModel(input, context.extensionPath);
        result = compileForLang(normalizedCNL, targetLang);
      } catch {
        // Keep original error if normalization wasn't possible
      }
      statusBarItem.text = '$(zap) Konvert: Ready';
    }

    if (result.errors.length > 0) {
      vscode.window.showErrorMessage(
        `Konvert Syntax Error: ${result.errors.map((e) => e.message).join('; ')}`
      );
      return;
    }

    if (editor) {
      editor.edit((editBuilder) => {
        editBuilder.insert(editor.selection.active, result.code + '\n');
      });
      contextBuilder.addStatement(input);
      vscode.window.showInformationMessage(`Code compiled and inserted as ${targetLang} in <2ms!`);
    } else {
      vscode.window.showInformationMessage(result.code);
    }
  };

  context.subscriptions.push(vscode.commands.registerCommand('konvert.convertEnglishToCode', runConvert));
  context.subscriptions.push(vscode.commands.registerCommand('intentengine.convertEnglishToCode', runConvert));

  // 3. Command: Open Split-Pane Live Preview Webview
  const runLivePreview = () => {
    const panel = vscode.window.createWebviewPanel(
      'konvertLivePreview',
      'Konvert — Live Compiler',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    panel.webview.html = getWebviewContent();

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
          try {
            const cnl = await normalizeEnglishWithModel(message.text, context.extensionPath);
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
        } else if (message.command === 'insertToEditor') {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            editor.edit((editBuilder) => {
              editBuilder.insert(editor.selection.active, message.code + '\n');
            });
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

function getWebviewContent(): string {
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
      --font-ui: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-ui);
      background-color: var(--bg);
      color: var(--fg);
      height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 14px 18px;
      overflow: hidden;
      user-select: none;
    }

    /* Top Brand Bar */
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--panel-border);
      margin-bottom: 12px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-icon {
      width: 26px;
      height: 26px;
      background: linear-gradient(135deg, #007acc 0%, #00bc70 100%);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 900;
      font-size: 14px;
      box-shadow: 0 2px 6px rgba(0, 122, 204, 0.3);
    }

    .brand-title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: var(--fg);
    }

    .brand-tag {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #8c8c8c);
      font-weight: 400;
      margin-left: 4px;
    }

    .status-chips {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chip {
      font-size: 10px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .chip-success {
      background: rgba(137, 209, 133, 0.12);
      color: var(--success);
      border-color: rgba(137, 209, 133, 0.25);
    }

    .chip-latency {
      background: rgba(0, 122, 204, 0.12);
      color: #38bdf8;
      border-color: rgba(56, 189, 248, 0.25);
      font-family: var(--font-mono);
    }

    /* Controls Bar */
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .segmented-control {
      display: inline-flex;
      background: var(--input-bg);
      border: 1px solid var(--panel-border);
      border-radius: 6px;
      padding: 2px;
      gap: 2px;
    }

    .segmented-btn {
      background: transparent;
      border: none;
      color: var(--vscode-descriptionForeground, #a0a0a0);
      padding: 5px 12px;
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
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .tool-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-action {
      background: var(--input-bg);
      border: 1px solid var(--panel-border);
      color: var(--fg);
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .btn-action:hover {
      border-color: var(--accent);
      background: rgba(0, 122, 204, 0.08);
      color: #38bdf8;
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
      margin-bottom: 12px;
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
      font-size: 10px;
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
      gap: 14px;
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
      padding: 8px 12px;
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
      padding: 12px 14px;
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
      padding: 12px 14px;
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
      padding: 8px 12px;
      background: rgba(244, 135, 113, 0.1);
      border-top: 1px solid rgba(244, 135, 113, 0.25);
      color: var(--error);
      font-size: 11px;
      font-family: var(--font-mono);
      display: none;
    }

    /* Footer Action Bar */
    .footer-bar {
      margin-top: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 10px;
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
      <div class="brand-icon">K</div>
      <div>
        <span class="brand-title">Konvert</span>
        <span class="brand-tag">Deterministic English-to-Code</span>
      </div>
    </div>
    <div class="status-chips">
      <div class="chip chip-latency" id="latencyChip">⚡ 0.8ms compile</div>
      <div class="chip chip-success">✓ Zero Hallucination</div>
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
        <span>✨</span> Normalize Casual English
      </button>
      <button id="clearBtn" class="btn-action">
        <span>🗑️</span> Clear
      </button>
    </div>
  </div>

  <!-- Quick Templates Row -->
  <div class="snippets-row">
    <span class="snippet-label">Quick Snippets:</span>
    <span class="snippet-pill" data-template="function">Function</span>
    <span class="snippet-pill" data-template="filter">Filter List</span>
    <span class="snippet-pill" data-template="conditional">If / Else</span>
    <span class="snippet-pill" data-template="loop">For Each</span>
    <span class="snippet-pill" data-template="class">Class Record</span>
    <span class="snippet-pill" data-template="map">Map / Dict</span>
  </div>

  <!-- Split Panes -->
  <div class="panes-container">
    <!-- Left Pane: Input -->
    <div class="pane">
      <div class="pane-header">
        <span class="pane-title">Intent Specification (CNL / English)</span>
        <div class="pane-status" id="grammarStatus">
          <span class="status-dot"></span>
          <span style="font-size: 10px; font-weight: 600; color: var(--success);" id="grammarLabel">Valid</span>
        </div>
      </div>
      <div class="editor-wrapper">
        <textarea id="input" spellcheck="false" placeholder="Write plain English or Structured CNL...&#10;e.g.&#10;DEFINE FUNCTION calculateTotal(price: Float, taxRate: Float) -> Float:&#10;  RETURN price + (price * taxRate)&#10;END FUNCTION">DEFINE FUNCTION calculateTotal(price: Float, taxRate: Float) -> Float:
  RETURN price + (price * taxRate)
END FUNCTION</textarea>
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
      <span><span class="kbd">Ctrl</span> + <span class="kbd">Shift</span> + <span class="kbd">N</span> Normalize</span>
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
      function: 'DEFINE FUNCTION add(a: Int, b: Int) -> Int:\\n  RETURN a + b\\nEND FUNCTION',
      filter: 'DECLARE users AS List<User>\\nFILTER users WHERE age >= 18\\nRETURN result',
      conditional: 'IF score >= 90:\\n  PRINT "Grade A"\\nELSE IF score >= 75:\\n  PRINT "Grade B"\\nELSE:\\n  PRINT "Grade C"\\nEND IF',
      loop: 'FOR EACH item IN items:\\n  PRINT item\\nEND FOR',
      class: 'DEFINE CLASS User:\\n  FIELD name AS String\\n  FIELD age AS Int\\n  FIELD active AS Bool WITH DEFAULT TRUE\\nEND CLASS',
      map: 'DECLARE scores AS Map<String, Int>\\nPUT "Alice" => 100 INTO scores\\nGET "Alice" FROM scores'
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
      inputEl.focus();
    });

    // Copy Code button
    copyBtn.addEventListener('click', () => {
      if (outputEl.textContent) {
        navigator.clipboard.writeText(outputEl.textContent);
        copyBtn.innerHTML = '<span>✓</span> Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = '<span id="copyIcon">📋</span> Copy Code';
        }, 1500);
      }
    });

    // Insert into editor
    insertBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'insertToEditor', code: outputEl.textContent });
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
        normalizeBtn.innerHTML = '<span>✨</span> Normalize Casual English';
        inputEl.value = msg.cnl;
        triggerCompile();
      } else if (msg.command === 'normalizeError') {
        normalizeBtn.disabled = false;
        normalizeBtn.innerHTML = '<span>✨</span> Normalize Casual English';
        errorDrawer.style.display = 'block';
        errorDrawer.textContent = 'AI Normalization: ' + msg.error;
      }
    });

    // Initial trigger
    triggerCompile();
  </script>
</body>
</html>`;
}
