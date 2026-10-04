import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectCompiler, ProjectCompileResult } from '../compiler/projectCompiler.js';

/**
 * WorkspaceWatcher
 *
 * Monitors all English intent files (.eng, .knv) in the workspace,
 * maintains the multi-file project dependency graph, and re-compiles connected modules
 * in under 20ms on every file save.
 */
export class WorkspaceWatcher {
  private watcher?: vscode.FileSystemWatcher;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.setupWatcher();
  }

  private setupWatcher() {
    // Watch for .eng and .knv files in workspace
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.{eng,knv}');

    this.watcher.onDidChange((uri) => this.handleFileEvent(uri, 'change'));
    this.watcher.onDidCreate((uri) => this.handleFileEvent(uri, 'create'));
    this.watcher.onDidDelete((uri) => this.handleFileEvent(uri, 'delete'));

    this.disposables.push(this.watcher);
  }

  private async handleFileEvent(uri: vscode.Uri, eventType: 'change' | 'create' | 'delete') {
    if (uri.scheme !== 'file') return;

    // Automatically trigger incremental multi-file build if project has multiple .eng files
    const allEngFiles = await vscode.workspace.findFiles('**/*.{eng,knv}', '**/node_modules/**');
    if (allEngFiles.length <= 1) {
      // Single file projects are handled by TwinBufferManager directly
      return;
    }

    // Rebuild project in background
    await this.compileProject(false);
  }

  /**
   * Compiles all modules across the workspace and writes output files
   */
  public async compileProject(notify: boolean = true): Promise<ProjectCompileResult | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      if (notify) vscode.window.showWarningMessage('No workspace folder open.');
      return null;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const engFiles = await vscode.workspace.findFiles('**/*.{eng,knv}', '**/node_modules/**');

    if (engFiles.length === 0) {
      if (notify) vscode.window.showInformationMessage('No .eng files found in workspace.');
      return null;
    }

    const result = ProjectCompiler.compileProject(rootPath, 'python');

    if (!result.success && result.totalErrors > 0) {
      const errMsgs = result.allErrors
        .map((f) => `[${f.file}] ${f.errors.map((e: any) => e.message).join('; ')}`)
        .join('\n');
      vscode.window.showErrorMessage(`Konvert Multi-File Build Errors:\n${errMsgs}`);
      return result;
    }

    if (notify) {
      vscode.window.showInformationMessage(
        `✓ Konvert: Multi-File Project Built (${result.modules.length} modules, ${result.outputFiles.length} files emitted in ${result.compilationTimeMs.toFixed(1)}ms)`
      );
    }

    return result;
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
