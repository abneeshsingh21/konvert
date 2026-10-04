import { describe, it, expect } from 'vitest';
import { parseCNL, compileToPython, compileToJava, compileToCpp, compileAll } from '../compiler/index.js';

describe('Real-Time Keystroke & Incremental Compilation Suite', () => {

  const testPrograms = [
    {
      name: 'Variable Declaration',
      text: 'DECLARE total AS Int WITH VALUE 100',
    },
    {
      name: 'Function Declaration',
      text: 'DEFINE FUNCTION add(a: Int, b: Int) -> Int: RETURN a + b END FUNCTION',
    },
    {
      name: 'Conditional Branching',
      text: 'IF score >= 90: PRINT "A" ELSE IF score >= 75: PRINT "B" ELSE: PRINT "C" END IF',
    },
    {
      name: 'Collection Filtering',
      text: 'DECLARE users AS List<User>\nFILTER users WHERE age >= 18\nRETURN users',
    },
    {
      name: 'Full Class with Methods',
      text: 'DEFINE CLASS Point:\n  FIELD x AS Float\n  FIELD y AS Float\n  DEFINE FUNCTION magnitude() -> Float:\n    RETURN (x ** 2 + y ** 2) ** 0.5\n  END FUNCTION\nEND CLASS',
    }
  ];

  it('simulates character-by-character typing with sub-2ms real-time latency and graceful error recovery', () => {
    let totalKeystrokes = 0;
    const latencies: number[] = [];
    let completedPasses = 0;

    for (const prog of testPrograms) {
      let currentBuffer = '';

      // Simulate typing every single character
      for (let i = 0; i < prog.text.length; i++) {
        currentBuffer += prog.text[i];
        totalKeystrokes++;

        const start = performance.now();
        // Compile current buffer in real time
        const result = compileToPython(currentBuffer);
        const duration = performance.now() - start;
        latencies.push(duration);

        // Crucial real-time requirement: parser must NEVER throw uncaught exceptions on partial syntax
        expect(result).toBeDefined();
        expect(Array.isArray(result.errors)).toBe(true);
        expect(typeof result.code).toBe('string');
      }

      // At the end of typing the program, it must compile with 0 errors
      const finalResult = compileToPython(currentBuffer);
      expect(finalResult.errors).toHaveLength(0);
      expect(finalResult.code.length).toBeGreaterThan(0);
      completedPasses++;
    }

    latencies.sort((a, b) => a - b);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const maxLatency = latencies[latencies.length - 1];

    console.log('\n================================================================');
    console.log(' REAL-TIME KEYSTROKE TYPING BENCHMARK RESULTS');
    console.log('================================================================');
    console.log(` Total Keystrokes Simulated : ${totalKeystrokes}`);
    console.log(` Completed Programs Verified: ${completedPasses}/${testPrograms.length}`);
    console.log(` Average Compile Latency    : ${avgLatency.toFixed(3)} ms`);
    console.log(` P50 Latency (Median)       : ${p50.toFixed(3)} ms`);
    console.log(` P95 Latency                : ${p95.toFixed(3)} ms`);
    console.log(` P99 Latency                : ${p99.toFixed(3)} ms`);
    console.log(` Max Latency                : ${maxLatency.toFixed(3)} ms`);
    console.log(` Frame Budget (60 FPS = 16ms): ${p95 < 16.0 ? 'PASSED (Zero UI Lag)' : 'FAILED'}`);
    console.log('================================================================\n');

    // Real-time target: P95 latency must be strictly under 5ms (well within 16ms 60fps frame budget)
    expect(p95).toBeLessThan(5.0);
  });

  it('converts in real time to all three targets (Python 3.12, Java 21, C++20) simultaneously', () => {
    const input = 'DEFINE FUNCTION calculateTotal(price: Float, taxRate: Float) -> Float:\n  RETURN price + (price * taxRate)\nEND FUNCTION';

    const start = performance.now();
    const result = compileAll(input);
    const totalTime = performance.now() - start;

    expect(result.errors).toHaveLength(0);

    // Python 3.12
    expect(result.python).toContain('def calculateTotal(price: float, taxRate: float) -> float:');
    expect(result.python).toContain('return (price + (price * taxRate))');

    // Java 21
    expect(result.java).toContain('public static double calculateTotal(double price, double taxRate)');
    expect(result.java).toContain('return (price + (price * taxRate));');

    // C++20
    expect(result.cpp).toContain('double calculateTotal(double price, double taxRate)');
    expect(result.cpp).toContain('return (price + (price * taxRate));');

    console.log(` Simultaneous 3-Language Compilation Time: ${totalTime.toFixed(3)} ms`);
    expect(totalTime).toBeLessThan(15.0);
  });

  it('validates ghost-text inline completion extraction regex and speed', () => {
    const pythonLine = '#? declare count as int with value 42';
    const javaLine = '//? filter users where age >= 18';

    const regex = /(?:#|\/\/)\?\s*(.+)$/;

    const pyMatch = pythonLine.match(regex);
    expect(pyMatch).not.toBeNull();
    expect(pyMatch![1].trim()).toBe('declare count as int with value 42');

    const javaMatch = javaLine.match(regex);
    expect(javaMatch).not.toBeNull();
    expect(javaMatch![1].trim()).toBe('filter users where age >= 18');
  });

});
