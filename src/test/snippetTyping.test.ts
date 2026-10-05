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
});
