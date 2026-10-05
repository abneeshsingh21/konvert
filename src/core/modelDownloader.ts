import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { Readable } from 'stream';

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

export class ModelDownloader {
  public static DEFAULT_MODEL_URL =
    process.env.KONVERT_MODEL_URL ||
    'https://github.com/abneeshsingh21/konvert/releases/download/v0.1.0/intentengine_model.zip';

  /**
   * Resolves the authoritative storage path for Konvert model weights.
   * Priority:
   * 1. Environment variable KONVERT_MODEL_DIR
   * 2. VS Code extension global storage path
   * 3. ~/.konvert/models
   */
  public static getTargetModelDir(preferredDir?: string): string {
    if (process.env.KONVERT_MODEL_DIR && fs.existsSync(process.env.KONVERT_MODEL_DIR)) {
      return path.resolve(process.env.KONVERT_MODEL_DIR);
    }

    if (preferredDir && this.isModelInstalled(path.join(preferredDir, 'models'))) {
      return path.join(preferredDir, 'models');
    }

    const homeDir = path.join(os.homedir(), '.konvert', 'models');
    if (this.isModelInstalled(homeDir)) {
      return homeDir;
    }

    if (preferredDir) {
      return path.join(preferredDir, 'models');
    }

    return homeDir;
  }

  /**
   * Checks whether the model files are already present and verified.
   */
  public static isModelInstalled(modelDir: string): boolean {
    if (!fs.existsSync(modelDir)) {
      return false;
    }

    const hasWeights =
      fs.existsSync(path.join(modelDir, 'model.safetensors')) ||
      fs.existsSync(path.join(modelDir, 'encoder_model.onnx'));
    const hasConfig = fs.existsSync(path.join(modelDir, 'config.json'));

    return hasWeights && hasConfig;
  }

  /**
   * Downloads the model zip archive with live progress reporting and extracts it.
   */
  public static async downloadAndExtractModel(options: {
    downloadUrl?: string;
    targetDir: string;
    onProgress?: (progress: DownloadProgress) => void;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    const url = options.downloadUrl || this.DEFAULT_MODEL_URL;
    const targetDir = options.targetDir;

    fs.mkdirSync(targetDir, { recursive: true });
    const tempZipPath = path.join(targetDir, 'model_bundle.zip');

    // 1. Fetch file stream
    const response = await fetch(url, {
      signal: options.abortSignal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Konvert-VSCode-Extension/0.1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download model from ${url} (HTTP ${response.status}: ${response.statusText})`);
    }

    const totalBytes = Number(response.headers.get('content-length') || 0);
    let downloadedBytes = 0;

    const fileStream = fs.createWriteStream(tempZipPath);

    if (!response.body) {
      throw new Error('Response body stream is empty');
    }

    // 2. Stream to disk and report progress
    const nodeReadable = Readable.fromWeb(response.body as any);

    await new Promise<void>((resolve, reject) => {
      nodeReadable.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (options.onProgress && totalBytes > 0) {
          const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
          options.onProgress({
            downloadedBytes,
            totalBytes,
            percent
          });
        }
      });

      nodeReadable.pipe(fileStream);

      fileStream.on('finish', () => resolve());
      fileStream.on('error', (err) => reject(err));
      nodeReadable.on('error', (err) => reject(err));
    });

    // 3. Extract Archive natively
    try {
      await this.extractZip(tempZipPath, targetDir);
    } finally {
      // Clean up temporary zip file
      if (fs.existsSync(tempZipPath)) {
        try {
          fs.unlinkSync(tempZipPath);
        } catch {
          // ignore cleanup error
        }
      }
    }
  }

  /**
   * Extracts a zip archive using native OS tooling (tar on Windows/Mac/Linux).
   */
  private static extractZip(zipPath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 'tar -xf <zip> -C <dest>' is supported natively in Windows 10/11, macOS, and Linux
      const tarProc = spawn('tar', ['-xf', zipPath, '-C', destDir]);

      tarProc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          // Fallback to powershell on Windows if tar returned non-zero
          if (process.platform === 'win32') {
            const psCmd = `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`;
            const psProc = spawn('powershell', ['-NoProfile', '-Command', psCmd]);
            psProc.on('close', (psCode) => {
              if (psCode === 0) {
                resolve();
              } else {
                reject(new Error(`Failed to extract model archive (code ${psCode})`));
              }
            });
            psProc.on('error', (err) => reject(err));
          } else {
            reject(new Error(`tar extraction failed with code ${code}`));
          }
        }
      });

      tarProc.on('error', () => {
        if (process.platform === 'win32') {
          const psCmd = `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`;
          const psProc = spawn('powershell', ['-NoProfile', '-Command', psCmd]);
          psProc.on('close', (psCode) => {
            if (psCode === 0) resolve();
            else reject(new Error(`PowerShell Expand-Archive failed with code ${psCode}`));
          });
          psProc.on('error', (err) => reject(err));
        } else {
          reject(new Error('tar binary not available on system'));
        }
      });
    });
  }
}
