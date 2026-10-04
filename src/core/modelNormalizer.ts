import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface NormalizerResponse {
  id: number;
  output: string | null;
  error: string | null;
}

export class ModelNormalizer {
  private static instance: ModelNormalizer | null = null;
  private process: ChildProcess | null = null;
  private isReady: boolean = false;
  private nextId: number = 1;
  private pendingRequests: Map<number, { resolve: (res: string) => void; reject: (err: Error) => void }> = new Map();
  private buffer: string = '';
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.cwd();
  }

  public static getInstance(baseDir?: string): ModelNormalizer {
    if (!ModelNormalizer.instance) {
      ModelNormalizer.instance = new ModelNormalizer(baseDir);
    }
    return ModelNormalizer.instance;
  }

  public isModelAvailable(): boolean {
    const modelDir = path.join(this.baseDir, 'models');
    return fs.existsSync(modelDir) && fs.existsSync(path.join(modelDir, 'model.safetensors'));
  }

  public start(): Promise<boolean> {
    if (this.isReady && this.process) {
      return Promise.resolve(true);
    }

    if (!this.isModelAvailable()) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const scriptPath = path.join(this.baseDir, 'scripts', 'infer_daemon.py');
      if (!fs.existsSync(scriptPath)) {
        resolve(false);
        return;
      }

      this.process = spawn('python', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.includes('{"status": "READY"}')) {
            this.isReady = true;
            resolve(true);
            continue;
          }

          // Try to extract JSON object
          const jsonMatch = trimmed.match(/\{.*"id"\s*:\s*\d+.*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.id !== undefined) {
                const pending = this.pendingRequests.get(parsed.id);
                if (pending) {
                  this.pendingRequests.delete(parsed.id);
                  if (parsed.error) {
                    pending.reject(new Error(parsed.error));
                  } else {
                    pending.resolve(parsed.output || '');
                  }
                }
              }
            } catch {
              // Ignore non-json
            }
          }
        }
      });

      this.process.stderr?.on('data', () => {
        // Suppress stderr logs from transformers
      });

      this.process.on('close', () => {
        this.isReady = false;
        this.process = null;
        for (const [id, req] of this.pendingRequests.entries()) {
          req.reject(new Error('Inference daemon closed unexpectedly'));
        }
        this.pendingRequests.clear();
      });

      // Timeout fallback if daemon doesn't start in 15 seconds
      setTimeout(() => {
        if (!this.isReady) {
          resolve(false);
        }
      }, 15000);
    });
  }

  public async normalize(prompt: string, timeoutMs: number = 3000): Promise<string> {
    if (!this.isReady || !this.process) {
      const started = await this.start();
      if (!started || !this.process) {
        throw new Error('Konvert local inference daemon unavailable');
      }
    }

    const reqId = this.nextId++;
    const payload = JSON.stringify({ id: reqId, prompt }) + '\n';

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error(`Inference timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(reqId, {
        resolve: (out: string) => {
          clearTimeout(timer);
          resolve(out);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        }
      });

      this.process!.stdin?.write(payload);
    });
  }

  public stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isReady = false;
    }
  }
}
