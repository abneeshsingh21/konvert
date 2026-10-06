import { describe, it, expect } from 'vitest';
import {
  compileSnippetForLang,
  compileSnippetToCpp,
  compileSnippetToJava,
  compileSnippetToPython,
  compileToCpp,
  compileToJava,
  compileToPython
} from '../compiler/index.js';

describe('Real-Time Snippet & Clean Code Generation Suite', () => {
  it('emits clean C++ print snippet without headers or redundant std::string wrapping', () => {
    const res = compileSnippetForLang('print hello world', 'cpp');
    expect(res.errors).toHaveLength(0);
    // Must NOT contain file-level include headers
    expect(res.code).not.toContain('#include');
    // Must NOT contain redundant std::string("hello world")
    expect(res.code).not.toContain('std::string("hello world")');
    // Must be clean idiomatic C++ statement
    expect(res.code.trim()).toBe('std::cout << "hello world" << std::endl;');
  });

  it('emits clean Java print snippet without public class Main wrapper', () => {
    const res = compileSnippetForLang('print hello world', 'java');
    expect(res.errors).toHaveLength(0);
    // Must NOT contain class wrapper or package/imports
    expect(res.code).not.toContain('public class Main');
    expect(res.code).not.toContain('import java.util');
    // Must be clean idiomatic Java statement
    expect(res.code.trim()).toBe('System.out.println("hello world");');
  });

  it('emits clean Python print snippet', () => {
    const res = compileSnippetForLang('print hello world', 'python');
    expect(res.errors).toHaveLength(0);
    expect(res.code.trim()).toBe('print("hello world")');
  });

  it('emits clean calculation snippet in C++', () => {
    const res = compileSnippetToCpp('calculate total = price * 1.18');
    expect(res.errors).toHaveLength(0);
    expect(res.code).not.toContain('#include');
    expect(res.code.trim()).toBe('total = (price * 1.18);');
  });

  it('includes only necessary headers for full standalone C++ files', () => {
    const res = compileToCpp('print hello world');
    expect(res.errors).toHaveLength(0);
    // Should have iostream for print
    expect(res.code).toContain('#include <iostream>');
    // Should NOT have unused heavy headers
    expect(res.code).not.toContain('#include <future>');
    expect(res.code).not.toContain('#include <ranges>');
    expect(res.code).not.toContain('#include <map>');
    expect(res.code).not.toContain('#include <memory>');
  });

  it('emits clean function declaration snippet in C++ and Java', () => {
    const cnl = `DEFINE FUNCTION add(a: Int, b: Int) -> Int:
  RETURN a + b
END FUNCTION`;

    const cpp = compileSnippetToCpp(cnl);
    expect(cpp.errors).toHaveLength(0);
    expect(cpp.code).toContain('int add(int a, int b) {');
    expect(cpp.code).not.toContain('#include');

    const java = compileSnippetToJava(cnl);
    expect(java.errors).toHaveLength(0);
    expect(java.code).toContain('public static int add(int a, int b) {');
    expect(java.code).not.toContain('public class Main');
  });

  it('supports sequential line-by-line continuous typing stream in Python, Java, and C++', () => {
    const lines = [
      'declare scores as List<Int>',
      'append 95 to scores',
      'print scores',
    ];

    // Python continuous sequence
    const pyCodeLines = lines.map(line => {
      const res = compileSnippetForLang(line, 'python');
      expect(res.errors).toHaveLength(0);
      return res.code.trim();
    });
    expect(pyCodeLines[0]).toBe('scores: list[int]');
    expect(pyCodeLines[1]).toBe('scores.append(95)');
    expect(pyCodeLines[2]).toBe('print(scores)');

    const finalPyDoc = pyCodeLines.join('\n') + '\n';
    expect(finalPyDoc).toContain('scores: list[int]\nscores.append(95)\nprint(scores)\n');

    // Java continuous sequence
    const javaCodeLines = lines.map(line => {
      const res = compileSnippetForLang(line, 'java');
      expect(res.errors).toHaveLength(0);
      return res.code.trim();
    });
    expect(javaCodeLines[0]).toBe('List<Integer> scores;');
    expect(javaCodeLines[1]).toBe('scores.add(95);');
    expect(javaCodeLines[2]).toBe('System.out.println(scores);');

    // C++ continuous sequence
    const cppCodeLines = lines.map(line => {
      const res = compileSnippetForLang(line, 'cpp');
      expect(res.errors).toHaveLength(0);
      return res.code.trim();
    });
    expect(cppCodeLines[0]).toBe('std::vector<int> scores;');
    expect(cppCodeLines[1]).toBe('scores.push_back(95);');
    expect(cppCodeLines[2]).toBe('std::cout << scores << std::endl;');
  });

  it('simulates HUD continuous session: commits on Enter, preserves committed lines on subsequent cancel', () => {
    let editorBuffer = '';
    let committedCount = 0;

    const mockStatements = [
      'declare count as Int with value 0',
      'set count to count + 1',
    ];

    // Simulate typing Line 1 and hitting Enter
    const res1 = compileSnippetForLang(mockStatements[0], 'python');
    editorBuffer += res1.code.trim() + '\n';
    committedCount++;

    // Simulate typing Line 2 and hitting Enter
    const res2 = compileSnippetForLang(mockStatements[1], 'python');
    editorBuffer += res2.code.trim() + '\n';
    committedCount++;

    // Simulate typing unfinished statement on Line 3 then pressing Escape (cancel)
    let line3Preview = 'print "incomp';
    // User cancels -> preview is discarded, committed buffer remains intact
    line3Preview = '';

    expect(committedCount).toBe(2);
    expect(editorBuffer).toBe('count: int = 0\ncount = (count + 1)\n');
  });

  it('compiles production-grade type-first multi-variable declarations across all languages', () => {
    // int a,b
    const cppRes = compileSnippetForLang('int a,b', 'cpp');
    expect(cppRes.errors).toHaveLength(0);
    expect(cppRes.code.trim()).toBe('int a;\nint b;');

    const javaRes = compileSnippetForLang('int a,b', 'java');
    expect(javaRes.errors).toHaveLength(0);
    expect(javaRes.code.trim()).toBe('int a;\nint b;');

    const pyRes = compileSnippetForLang('int a,b', 'python');
    expect(pyRes.errors).toHaveLength(0);
    expect(pyRes.code.trim()).toContain('a: int');
    expect(pyRes.code.trim()).toContain('b: int');

    // int a = 10, b = 20
    const cppInit = compileSnippetForLang('int a = 10, b = 20', 'cpp');
    expect(cppInit.errors).toHaveLength(0);
    expect(cppInit.code.trim()).toBe('int a = 10;\nint b = 20;');

    const javaInit = compileSnippetForLang('int a = 10, b = 20', 'java');
    expect(javaInit.errors).toHaveLength(0);
    expect(javaInit.code.trim()).toBe('int a = 10;\nint b = 20;');
  });

  it('compiles multi-variable prints cleanly without literal string quotation', () => {
    const cppRes = compileSnippetForLang('print a, b', 'cpp');
    expect(cppRes.errors).toHaveLength(0);
    expect(cppRes.code.trim()).toBe('std::cout << a << std::endl;\nstd::cout << b << std::endl;');

    const cppStdRes = compileSnippetForLang('print a, b', 'cpp', { useNamespaceStd: true });
    expect(cppStdRes.errors).toHaveLength(0);
    expect(cppStdRes.code.trim()).toBe('cout << a << endl;\ncout << b << endl;');

    const javaRes = compileSnippetForLang('print a, b', 'java');
    expect(javaRes.errors).toHaveLength(0);
    expect(javaRes.code.trim()).toBe('System.out.println(a);\nSystem.out.println(b);');

    const pyRes = compileSnippetForLang('print a, b', 'python');
    expect(pyRes.errors).toHaveLength(0);
    expect(pyRes.code.trim()).toBe('print(a)\nprint(b)');
  });

  it('compiles block headers in real time without expecting END error', () => {
    // If statement header
    expect(compileSnippetForLang('if (a > b) {', 'cpp').code.trim()).toBe('if (a > b) {');
    expect(compileSnippetForLang('if (a > b) {', 'java').code.trim()).toBe('if (a > b) {');
    expect(compileSnippetForLang('if (a > b) {', 'python').code.trim()).toBe('if a > b:');

    // While loop header
    expect(compileSnippetForLang('while (n > 0)', 'cpp').code.trim()).toBe('while (n > 0) {');
    expect(compileSnippetForLang('while (n > 0)', 'java').code.trim()).toBe('while (n > 0) {');
    expect(compileSnippetForLang('while (n > 0)', 'python').code.trim()).toBe('while n > 0:');

    // For loop header
    expect(compileSnippetForLang('for (int i = 0; i < n; i++)', 'cpp').code.trim()).toBe('for (int i = 0; i < n; i++) {');
    expect(compileSnippetForLang('for (int i = 0; i < n; i++)', 'java').code.trim()).toBe('for (int i = 0; i < n; i++) {');
    expect(compileSnippetForLang('for (int i = 0; i < n; i++)', 'python').code.trim()).toBe('for i in range(n):');

    // Closer
    expect(compileSnippetForLang('}', 'cpp').code.trim()).toBe('}');
    expect(compileSnippetForLang('}', 'java').code.trim()).toBe('}');
    expect(compileSnippetForLang('}', 'python').code.trim()).toBe('# end');
  });
});
