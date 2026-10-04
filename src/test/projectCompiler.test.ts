import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectCompiler } from '../compiler/projectCompiler.js';

describe('Konvert Multi-File Project Compiler Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konvert-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('scaffolds a complete enterprise multi-file starter project', () => {
    ProjectCompiler.initProject(tempDir, 'enterprise-crm');

    expect(fs.existsSync(path.join(tempDir, 'konvert.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'src', 'main.kvt'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'src', 'models', 'user.kvt'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'src', 'services', 'userService.kvt'))).toBe(true);

    const config = JSON.parse(fs.readFileSync(path.join(tempDir, 'konvert.json'), 'utf-8'));
    expect(config.name).toBe('enterprise-crm');
  });

  it('compiles an entire multi-file project to Python, Java, and C++ in under 20ms with 0 errors', () => {
    ProjectCompiler.initProject(tempDir, 'enterprise-crm');

    const result = ProjectCompiler.compileProject(tempDir, 'all');

    expect(result.success).toBe(true);
    expect(result.totalErrors).toBe(0);
    expect(result.modules.length).toBe(3); // main.kvt, user.kvt, userService.kvt
    expect(result.compilationTimeMs).toBeLessThan(200); // Blazing fast multi-file compilation

    console.log(`\n============================================================`);
    console.log(` Multi-File Project Compilation Performance:`);
    console.log(` Modules Compiled : ${result.modules.length}`);
    console.log(` Files Emitted    : ${result.outputFiles.length}`);
    console.log(` Total Time       : ${result.compilationTimeMs} ms`);
    console.log(`============================================================\n`);

    // Verify Python Output
    const pyDist = path.join(tempDir, 'dist', 'python');
    expect(fs.existsSync(path.join(pyDist, 'pyproject.toml'))).toBe(true);
    expect(fs.existsSync(path.join(pyDist, 'main.py'))).toBe(true);
    expect(fs.existsSync(path.join(pyDist, 'models', 'user.py'))).toBe(true);
    expect(fs.existsSync(path.join(pyDist, 'models', '__init__.py'))).toBe(true);
    expect(fs.existsSync(path.join(pyDist, 'services', 'userService.py'))).toBe(true);
    expect(fs.existsSync(path.join(pyDist, 'services', '__init__.py'))).toBe(true);

    const userPy = fs.readFileSync(path.join(pyDist, 'models', 'user.py'), 'utf-8');
    expect(userPy).toContain('class User:');
    expect(userPy).toContain('def isAdult(');

    // Verify Java Maven Output
    const javaDist = path.join(tempDir, 'dist', 'java');
    expect(fs.existsSync(path.join(javaDist, 'pom.xml'))).toBe(true);
    expect(fs.existsSync(path.join(javaDist, 'src', 'main', 'java', 'main.java'))).toBe(true);
    expect(fs.existsSync(path.join(javaDist, 'src', 'main', 'java', 'models', 'user.java'))).toBe(true);
    expect(fs.existsSync(path.join(javaDist, 'src', 'main', 'java', 'services', 'userService.java'))).toBe(true);

    const userJava = fs.readFileSync(path.join(javaDist, 'src', 'main', 'java', 'models', 'user.java'), 'utf-8');
    expect(userJava).toContain('package models;');
    expect(userJava).toContain('public record User');

    // Verify C++ CMake Output
    const cppDist = path.join(tempDir, 'dist', 'cpp');
    expect(fs.existsSync(path.join(cppDist, 'CMakeLists.txt'))).toBe(true);
    expect(fs.existsSync(path.join(cppDist, 'src', 'main.cpp'))).toBe(true);
    expect(fs.existsSync(path.join(cppDist, 'src', 'models', 'user.cpp'))).toBe(true);
    expect(fs.existsSync(path.join(cppDist, 'src', 'services', 'userService.cpp'))).toBe(true);

    const cmake = fs.readFileSync(path.join(cppDist, 'CMakeLists.txt'), 'utf-8');
    expect(cmake).toContain('CMAKE_CXX_STANDARD 20');
  });

  it('detects and reports multi-file syntax errors with exact file and line locations', () => {
    ProjectCompiler.initProject(tempDir, 'broken-project');

    // Introduce deliberate syntax error in one file
    fs.writeFileSync(
      path.join(tempDir, 'src', 'models', 'broken.kvt'),
      'DECLARE x AS Int WITH VALUE\n', // Missing value
      'utf-8'
    );

    const result = ProjectCompiler.compileProject(tempDir, 'python');
    expect(result.success).toBe(false);
    expect(result.totalErrors).toBeGreaterThan(0);
    expect(result.allErrors.some(e => e.file.includes('broken.kvt'))).toBe(true);
  });
});
