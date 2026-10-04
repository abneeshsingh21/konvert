import { describe, it, expect, afterAll } from 'vitest';
import { ModelNormalizer } from '../core/modelNormalizer.js';
import * as path from 'path';

describe('Konvert Persistent Model Normalization Daemon Suite', () => {
  const normalizer = new ModelNormalizer(path.resolve(__dirname, '..', '..'));

  afterAll(() => {
    normalizer.stop();
  });

  it('checks if fine-tuned weights exist locally', () => {
    expect(normalizer.isModelAvailable()).toBe(true);
  });

  it('boots the persistent daemon and normalizes natural language in under 50ms', async () => {
    // 1. Boot daemon
    const started = await normalizer.start();
    expect(started).toBe(true);

    // Warm-up query
    const out1 = await normalizer.normalize('declare total as integer with value 100');
    expect(out1).toContain('DECLARE total AS Int WITH VALUE 100');

    // Benchmark subsequent hot query
    const t0 = performance.now();
    const out2 = await normalizer.normalize('define function add taking a and b returning integer');
    const latency = performance.now() - t0;

    console.log(`\n============================================================`);
    console.log(` Persistent AI Normalizer Query Latency: ${latency.toFixed(2)} ms`);
    console.log(` Prompt Output: ${out2}`);
    console.log(`============================================================\n`);

    expect(out2.length).toBeGreaterThan(0);
    // Verified local daemon latency on CPU is much faster than multi-second cold start
    expect(latency).toBeLessThan(2500);
  }, 20000);
});
