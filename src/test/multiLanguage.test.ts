import { describe, it, expect } from 'vitest';
import { compileAll, compileToJava, compileToCpp } from '../compiler/index.js';

describe('IntentEngine Multi-Target Compiler (Java & C++)', () => {
  it('compiles a function to Python, Java, and C++ simultaneously', () => {
    const cnl = `
      DEFINE FUNCTION add(a: Int, b: Int) -> Int:
        RETURN a + b
      END FUNCTION
    `;

    const all = compileAll(cnl);
    expect(all.errors).toHaveLength(0);

    // Python check
    expect(all.python).toContain('def add(a: int, b: int) -> int:');
    expect(all.python).toContain('return (a + b)');

    // Java check
    expect(all.java).toContain('public static int add(int a, int b) {');
    expect(all.java).toContain('return (a + b);');

    // C++ check
    expect(all.cpp).toContain('#include <iostream>');
    expect(all.cpp).toContain('int add(int a, int b) {');
    expect(all.cpp).toContain('return (a + b);');
  });

  it('compiles class with fields to Java Record and C++ Struct', () => {
    const cnl = `
      DEFINE CLASS User:
        FIELD name AS String
        FIELD age AS Int
      END CLASS
    `;

    const java = compileToJava(cnl);
    expect(java.errors).toHaveLength(0);
    expect(java.code).toContain('public record User(String name, int age) {}');

    const cpp = compileToCpp(cnl);
    expect(cpp.errors).toHaveLength(0);
    expect(cpp.code).toContain('struct User {');
    expect(cpp.code).toContain('std::string name;');
    expect(cpp.code).toContain('int age;');
  });

  it('compiles for each loop to Java and C++', () => {
    const cnl = `
      FOR EACH item IN items:
        PRINT item
      END FOR
    `;

    const java = compileToJava(cnl);
    expect(java.errors).toHaveLength(0);
    expect(java.code).toContain('for (var item : items) {');
    expect(java.code).toContain('System.out.println(item);');

    const cpp = compileToCpp(cnl);
    expect(cpp.errors).toHaveLength(0);
    expect(cpp.code).toContain('for (const auto& item : items) {');
    expect(cpp.code).toContain('std::cout << item << std::endl;');
  });
});
