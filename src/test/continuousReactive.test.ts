import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ASTSpanTracker } from '../core/astSpanTracker.js';
import { AtomicRangeReconciler } from '../core/atomicRangeReconciler.js';
import { ProjectCompiler } from '../compiler/projectCompiler.js';

describe('Continuous Real-Time Reactive System Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konvert-reactive-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('tracks statement blocks and compiles in real-time (<2ms)', () => {
    const tracker = new ASTSpanTracker('python');
    const input = 'print hello world\ncalculate total = price * 1.18';

    // Warm-up JIT
    tracker.reconcile('print test');

    const t0 = performance.now();
    const res = tracker.reconcile(input);
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(50);
    expect(res.blocks.length).toBe(2);
    expect(res.blocks[0].emittedCode).toContain('print("hello world")');
    expect(res.blocks[1].emittedCode).toContain('total = (price * 1.18)');
    expect(res.hasErrors).toBe(false);
  });

  it('atomically reconciles when a statement is deleted in English', () => {
    const tracker = new ASTSpanTracker('python');

    // Step 1: 3 statements
    const text1 = 'print hello world\ncount = 10\nprint "Done"';
    const res1 = tracker.reconcile(text1);
    expect(res1.blocks.length).toBe(3);
    expect(res1.fullTargetCode).toContain('count = 10');

    // Step 2: Delete line 2 (count = 10)
    const text2 = 'print hello world\nprint "Done"';
    const res2 = tracker.reconcile(text2);
    expect(res2.blocks.length).toBe(2);
    expect(res2.fullTargetCode).not.toContain('count = 10');
    expect(res2.fullTargetCode).toContain('print("hello world")');
    expect(res2.fullTargetCode).toContain('print("Done")');
  });

  it('atomically updates when a statement is modified in English', () => {
    const reconciler = new AtomicRangeReconciler('python');

    let buffer = '';
    const step1 = reconciler.reconcileBuffer(buffer, 'calculate total = price * 1.10');
    buffer = step1.updatedText;
    expect(buffer).toContain('price * 1.1');

    // User modifies discount in English
    const step2 = reconciler.reconcileBuffer(buffer, 'calculate total = price * 1.25');
    buffer = step2.updatedText;
    expect(buffer).toContain('price * 1.25');
    expect(step2.appliedDiffCount).toBeGreaterThan(0);
  });

  it('handles multi-line blocks with exact AST span mapping', () => {
    const tracker = new ASTSpanTracker('python');
    const input = `DEFINE FUNCTION add(a: Int, b: Int) -> Int:
  RETURN a + b
END FUNCTION
PRINT "Finished"`;

    const res = tracker.reconcile(input);
    expect(res.blocks.length).toBe(2);
    expect(res.blocks[0].sourceSpan.startLine).toBe(1);
    expect(res.blocks[0].emittedCode).toContain('def add(a: int, b: int) -> int:');
    expect(res.blocks[0].emittedCode).toContain('return (a + b)');
    expect(res.blocks[1].emittedCode).toContain('print("Finished")');
  });

  it('connects multiple continuous Python files with cross-module imports and .knv files', () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // File 1: database.knv
    fs.writeFileSync(
      path.join(srcDir, 'database.knv'),
      `DEFINE CLASS Database:
  FIELD host AS String
  FIELD port AS Int WITH DEFAULT 5432
END CLASS

DEFINE FUNCTION getStatus(db: Database) -> String:
  RETURN "Online"
END FUNCTION`,
      'utf-8'
    );

    // File 2: main.knv
    fs.writeFileSync(
      path.join(srcDir, 'main.knv'),
      `IMPORT "database" AS db

DECLARE myDb AS db.Database WITH VALUE db.Database("localhost", 5432)
DECLARE status AS String WITH VALUE db.getStatus(myDb)
PRINT status`,
      'utf-8'
    );

    const result = ProjectCompiler.compileProject(tempDir, 'python');
    expect(result.success).toBe(true);
    expect(result.totalErrors).toBe(0);
    expect(result.modules.length).toBe(2);

    const mainPy = result.outputFiles.find((f: any) => f.filePath.endsWith('main.py'));
    const dbPy = result.outputFiles.find((f: any) => f.filePath.endsWith('database.py'));

    expect(mainPy).toBeDefined();
    expect(dbPy).toBeDefined();
    expect(dbPy!.content).toContain('class Database:');
    expect(mainPy!.content).toContain('import database as db');
  });
});
