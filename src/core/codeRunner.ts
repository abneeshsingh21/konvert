import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface RunOptions {
  args?: string;
  benchmark?: boolean;
  compiler?: string;
}

export class CodeRunner {
  private static terminal: vscode.Terminal | undefined;

  /**
   * Returns an active terminal instance dedicated to Konvert executions.
   */
  public static getOrCreateTerminal(cwd?: string): vscode.Terminal {
    // Check if terminal exists and has not been closed
    const allTerminals = vscode.window.terminals;
    const existing = allTerminals.find((t) => t.name === '⚡ Konvert: Run');
    if (existing && existing.exitStatus === undefined) {
      this.terminal = existing;
      return existing;
    }

    this.terminal = vscode.window.createTerminal({
      name: '⚡ Konvert: Run',
      cwd: cwd,
    });
    return this.terminal;
  }

  /**
   * Builds the execution command string for a given file and target language.
   */
  public static buildRunCommand(
    filePath: string,
    options?: RunOptions,
    platform: string = process.platform
  ): { command: string; language: string; dir: string; fileName: string; baseName: string } {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, ext);
    const fileName = path.basename(filePath);
    const isWindows = platform === 'win32';
    const argsStr = options?.args ? ` ${options.args}` : '';

    let command = '';
    let language = '';

    if (ext === '.cpp' || ext === '.cc' || ext === '.cxx') {
      language = 'C++20';
      const compiler = options?.compiler || 'g++';
      if (isWindows) {
        command = `${compiler} -std=c++20 "${fileName}" -o "${baseName}.exe" ; if ($?) { .\\"${baseName}.exe"${argsStr} }`;
      } else {
        command = `${compiler} -std=c++20 "${fileName}" -o "${baseName}" && ./"${baseName}"${argsStr}`;
      }
    } else if (ext === '.c') {
      language = 'C';
      const compiler = options?.compiler || 'gcc';
      if (isWindows) {
        command = `${compiler} "${fileName}" -o "${baseName}.exe" ; if ($?) { .\\"${baseName}.exe"${argsStr} }`;
      } else {
        command = `${compiler} "${fileName}" -o "${baseName}" && ./"${baseName}"${argsStr}`;
      }
    } else if (ext === '.java') {
      language = 'Java';
      command = `java "${fileName}"${argsStr}`;
    } else if (ext === '.py') {
      language = 'Python';
      const pyCmd = isWindows ? 'python' : 'python3';
      command = `${pyCmd} "${fileName}"${argsStr}`;
    } else if (ext === '.knv') {
      language = 'Konvert';
      const pyCmd = isWindows ? 'python' : 'python3';
      command = `${pyCmd} "${baseName}.py"${argsStr}`;
    } else {
      language = 'Unknown';
      command = '';
    }

    return { command, language, dir, fileName, baseName };
  }

  /**
   * Saves and runs the active editor file in the integrated terminal.
   */
  public static async runActiveEditor(options?: RunOptions): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Konvert: No active file open to run.');
      return;
    }

    const doc = editor.document;
    if (doc.isUntitled) {
      const saveChoice = await vscode.window.showWarningMessage(
        'Konvert: Please save the file before running.',
        'Save File',
        'Cancel'
      );
      if (saveChoice === 'Save File') {
        const saved = await doc.save();
        if (!saved) return;
      } else {
        return;
      }
    } else if (doc.isDirty) {
      await doc.save();
    }

    await this.runFile(doc.fileName, options);
  }

  /**
   * Compiles and executes a file path directly in the terminal.
   */
  public static async runFile(filePath: string, options?: RunOptions): Promise<void> {
    if (!fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`Konvert: File not found: ${filePath}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();

    // If it's a Konvert .knv file, compile it to Python first
    if (ext === '.knv') {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const { compileToPython } = await import('../compiler/index.js');
        const res = compileToPython(content);
        if (res.errors.length > 0) {
          vscode.window.showErrorMessage(`Konvert Compilation Error: ${res.errors[0].message}`);
          return;
        }
        const dir = path.dirname(filePath);
        const baseName = path.basename(filePath, ext);
        const targetPyPath = path.join(dir, `${baseName}.py`);
        fs.writeFileSync(targetPyPath, res.code, 'utf8');
      } catch (err: any) {
        vscode.window.showErrorMessage(`Konvert Compile failed: ${err?.message || err}`);
        return;
      }
    }

    const { command, language, dir, fileName } = this.buildRunCommand(filePath, options);
    if (!command) {
      vscode.window.showInformationMessage(`Konvert: Unsupported file type for direct execution: ${ext}`);
      return;
    }

    const terminal = this.getOrCreateTerminal(dir);
    terminal.show(false);

    // Ensure working directory is the file's folder
    terminal.sendText(`cd "${dir}"`);
    terminal.sendText(command);

    vscode.window.setStatusBarMessage(`⚡ [Konvert Runner] Executing ${language} (${fileName})...`, 3500);
  }

  /**
   * Prompts the user with advanced execution options:
   * 1. Run Standard
   * 2. Run with Command-Line Arguments
   * 3. Benchmark Execution Time
   * 4. Clean Build Artifacts
   */
  public static async runWithOptions(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Konvert: No active file to run.');
      return;
    }

    const fileName = path.basename(editor.document.fileName);
    const ext = path.extname(fileName).toLowerCase();

    const items: (vscode.QuickPickItem & { action: string })[] = [
      {
        label: '$(play) Run Code',
        description: `Execute ${fileName} in integrated terminal`,
        action: 'run',
      },
      {
        label: '$(terminal) Run with Arguments',
        description: 'Prompt for custom command-line arguments to pass to the program',
        action: 'args',
      },
      {
        label: '$(watch) Benchmark Execution Time',
        description: 'Measure execution runtime duration accurately in terminal',
        action: 'benchmark',
      },
      {
        label: '$(trash) Clean Build Artifacts',
        description: 'Delete compiled .exe, .class, and object files in current directory',
        action: 'clean',
      },
    ];

    const choice = await vscode.window.showQuickPick(items, {
      placeHolder: `Konvert Universal Runner — Select action for ${fileName}`,
    });

    if (!choice) return;

    if (choice.action === 'run') {
      await this.runActiveEditor();
    } else if (choice.action === 'args') {
      const args = await vscode.window.showInputBox({
        prompt: `Enter command-line arguments for ${fileName}`,
        placeHolder: 'e.g. 10 20 --verbose',
      });
      if (args !== undefined) {
        await this.runActiveEditor({ args: args.trim() });
      }
    } else if (choice.action === 'benchmark') {
      await this.runBenchmark(editor.document.fileName);
    } else if (choice.action === 'clean') {
      await this.cleanArtifacts(editor.document.fileName);
    }
  }

  /**
   * Runs the code wrapped in a high-precision performance timer.
   */
  public static async runBenchmark(filePath: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.isDirty) {
      await editor.document.save();
    }

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, ext);
    const fileName = path.basename(filePath);
    const isWindows = process.platform === 'win32';

    const terminal = this.getOrCreateTerminal(dir);
    terminal.show(false);
    terminal.sendText(`cd "${dir}"`);

    let benchCmd = '';
    if (ext === '.cpp' || ext === '.cc' || ext === '.cxx') {
      if (isWindows) {
        benchCmd = `g++ -std=c++20 "${fileName}" -o "${baseName}.exe" ; if ($?) { Measure-Command { .\\"${baseName}.exe" } }`;
      } else {
        benchCmd = `g++ -std=c++20 "${fileName}" -o "${baseName}" && time ./"${baseName}"`;
      }
    } else if (ext === '.c') {
      if (isWindows) {
        benchCmd = `gcc "${fileName}" -o "${baseName}.exe" ; if ($?) { Measure-Command { .\\"${baseName}.exe" } }`;
      } else {
        benchCmd = `gcc "${fileName}" -o "${baseName}" && time ./"${baseName}"`;
      }
    } else if (ext === '.java') {
      if (isWindows) {
        benchCmd = `Measure-Command { java "${fileName}" }`;
      } else {
        benchCmd = `time java "${fileName}"`;
      }
    } else if (ext === '.py') {
      const py = isWindows ? 'python' : 'python3';
      if (isWindows) {
        benchCmd = `Measure-Command { ${py} "${fileName}" }`;
      } else {
        benchCmd = `time ${py} "${fileName}"`;
      }
    }

    if (benchCmd) {
      terminal.sendText(benchCmd);
      vscode.window.setStatusBarMessage(`⏱️ Running benchmark for ${fileName}...`, 3500);
    }
  }

  /**
   * Cleans binary and compilation artifacts from the directory.
   */
  public static async cleanArtifacts(filePath: string): Promise<number> {
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const targets = [
      path.join(dir, `${baseName}.exe`),
      path.join(dir, `${baseName}.o`),
      path.join(dir, `${baseName}.obj`),
      path.join(dir, `${baseName}.class`),
      path.join(dir, `${baseName}`),
    ];

    let count = 0;
    for (const t of targets) {
      if (fs.existsSync(t)) {
        try {
          const stat = fs.statSync(t);
          if (stat.isFile()) {
            fs.unlinkSync(t);
            count++;
          }
        } catch {
          // Ignore locks
        }
      }
    }

    vscode.window.showInformationMessage(`Konvert: Cleaned ${count} build artifact(s) in ${path.basename(dir)}`);
    return count;
  }
}
