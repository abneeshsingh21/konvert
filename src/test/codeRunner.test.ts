import { describe, it, expect } from 'vitest';
import { CodeRunner } from '../core/codeRunner.js';
import * as path from 'path';

describe('Universal CodeRunner Suite', () => {
  it('generates accurate C++20 compilation and execution command on Windows', () => {
    const filePath = 'C:\\workspace\\project\\main.cpp';
    const res = CodeRunner.buildRunCommand(filePath, undefined, 'win32');

    expect(res.language).toBe('C++20');
    expect(res.fileName).toBe('main.cpp');
    expect(res.baseName).toBe('main');
    expect(res.command).toBe('g++ -std=c++20 "main.cpp" -o "main.exe" ; if ($?) { .\\"main.exe" }');
  });

  it('generates accurate C++20 command on Linux/macOS', () => {
    const filePath = '/workspace/project/main.cpp';
    const res = CodeRunner.buildRunCommand(filePath, undefined, 'linux');

    expect(res.language).toBe('C++20');
    expect(res.command).toBe('g++ -std=c++20 "main.cpp" -o "main" && ./"main"');
  });

  it('generates accurate C++ command with CLI arguments', () => {
    const filePath = 'C:\\workspace\\project\\solution.cpp';
    const res = CodeRunner.buildRunCommand(filePath, { args: '10 20 --debug' }, 'win32');

    expect(res.command).toBe('g++ -std=c++20 "solution.cpp" -o "solution.exe" ; if ($?) { .\\"solution.exe" 10 20 --debug }');
  });

  it('generates accurate C compilation and execution command', () => {
    const filePath = 'C:\\workspace\\project\\app.c';
    const res = CodeRunner.buildRunCommand(filePath, undefined, 'win32');

    expect(res.language).toBe('C');
    expect(res.command).toBe('gcc "app.c" -o "app.exe" ; if ($?) { .\\"app.exe" }');
  });

  it('generates accurate Java execution command (JEP 330 Single-File Execution)', () => {
    const filePath = 'C:\\workspace\\project\\Main.java';
    const res = CodeRunner.buildRunCommand(filePath, undefined, 'win32');

    expect(res.language).toBe('Java');
    expect(res.command).toBe('java "Main.java"');
  });

  it('generates accurate Java command with arguments', () => {
    const filePath = 'C:\\workspace\\project\\App.java';
    const res = CodeRunner.buildRunCommand(filePath, { args: 'testArg' }, 'win32');

    expect(res.language).toBe('Java');
    expect(res.command).toBe('java "App.java" testArg');
  });

  it('generates accurate Python execution command on Windows and Unix', () => {
    const winPath = 'C:\\workspace\\project\\script.py';
    const winRes = CodeRunner.buildRunCommand(winPath, undefined, 'win32');
    expect(winRes.language).toBe('Python');
    expect(winRes.command).toBe('python "script.py"');

    const unixPath = '/workspace/project/script.py';
    const unixRes = CodeRunner.buildRunCommand(unixPath, undefined, 'darwin');
    expect(unixRes.language).toBe('Python');
    expect(unixRes.command).toBe('python3 "script.py"');
  });

  it('generates accurate Konvert execution command targeting compiled Python script', () => {
    const knvPath = 'C:\\workspace\\project\\app.knv';
    const res = CodeRunner.buildRunCommand(knvPath, undefined, 'win32');

    expect(res.language).toBe('Konvert');
    expect(res.command).toBe('python "app.py"');
  });
});
