#!/usr/bin/env node
import * as path from 'path';
import { parseCNL, compileToPython, compileToJava, compileToCpp, compileAll, ProjectCompiler } from './compiler/index.js';
import { ModelDownloader } from './core/modelDownloader.js';

const args = process.argv.slice(2);
const command = args[0];

// Parse flags
let lang: 'python' | 'java' | 'cpp' | 'all' = 'python';
let projectDir = '.';
let outDir: string | undefined = undefined;
const remainingArgs: string[] = [];

for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith('--lang=')) {
    lang = args[i].split('=')[1].toLowerCase() as any;
  } else if (args[i] === '--lang' && i + 1 < args.length) {
    lang = args[++i].toLowerCase() as any;
  } else if (args[i].startsWith('--project=')) {
    projectDir = args[i].split('=')[1];
  } else if (args[i] === '--project' && i + 1 < args.length) {
    projectDir = args[++i];
  } else if (args[i].startsWith('--out=')) {
    outDir = args[i].split('=')[1];
  } else if (args[i] === '--out' && i + 1 < args.length) {
    outDir = args[++i];
  } else {
    remainingArgs.push(args[i]);
  }
}

const input = remainingArgs.join(' ');

// 1. Command: init
if (command === 'init') {
  const targetName = remainingArgs[0] || 'my-konvert-app';
  const targetPath = path.resolve(process.cwd(), targetName);
  console.log(`🚀 Initializing new Konvert multi-file project in: ${targetPath}...`);
  ProjectCompiler.initProject(targetPath, targetName);
  console.log(`✅ Project '${targetName}' initialized successfully!`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${targetName}`);
  console.log(`  konvert build --lang=all`);
  process.exit(0);
}

// 2. Command: build (Project-level)
else if (command === 'build') {
  const targetPath = path.resolve(process.cwd(), projectDir);
  console.log(`📦 Compiling Konvert project at '${targetPath}' for target [${lang}]...`);
  const result = ProjectCompiler.compileProject(targetPath, lang, outDir);

  if (!result.success) {
    console.error(`❌ Compilation failed with ${result.totalErrors} syntax error(s):`);
    for (const errItem of result.allErrors) {
      console.error(`  📄 ${errItem.file}:`);
      for (const e of errItem.errors) {
        console.error(`     Line ${e.line}, Col ${e.col}: ${e.message}`);
      }
    }
    process.exit(1);
  }

  console.log(`✨ Project compiled successfully in ${result.compilationTimeMs}ms!`);
  console.log(`📁 Modules compiled: ${result.modules.length}`);
  console.log(`📄 Generated output files: ${result.outputFiles.length}`);
  for (const f of result.outputFiles) {
    console.log(`  • [${f.target}] ${path.relative(targetPath, f.filePath)}`);
  }
  process.exit(0);
}

// 3. Command: check (Project-level validation)
else if (command === 'check') {
  const targetPath = path.resolve(process.cwd(), projectDir);
  console.log(`🔍 Checking Konvert project at '${targetPath}'...`);
  const result = ProjectCompiler.compileProject(targetPath, 'python');

  if (!result.success) {
    console.error(`❌ Found ${result.totalErrors} syntax error(s):`);
    for (const errItem of result.allErrors) {
      console.error(`  📄 ${errItem.file}:`);
      for (const e of errItem.errors) {
        console.error(`     Line ${e.line}, Col ${e.col}: ${e.message}`);
      }
    }
    process.exit(1);
  }

  console.log(`✅ All ${result.modules.length} module(s) are syntactically valid! (0 errors)`);
  process.exit(0);
}

// 4. Command: validate (Snippet-level)
else if (command === 'validate') {
  const result = parseCNL(input);
  if (result.errors.length > 0) {
    console.error(JSON.stringify({ valid: false, errors: result.errors }));
    process.exit(1);
  } else {
    console.log(JSON.stringify({ valid: true }));
    process.exit(0);
  }
}

// 5. Command: compile (Snippet-level)
else if (command === 'compile') {
  if (lang === 'all') {
    const result = compileAll(input);
    if (result.errors.length > 0) {
      console.error(JSON.stringify({ success: false, errors: result.errors }));
      process.exit(1);
    } else {
      console.log(JSON.stringify({
        python: result.python,
        java: result.java,
        cpp: result.cpp
      }, null, 2));
      process.exit(0);
    }
  } else if (lang === 'java') {
    const result = compileToJava(input);
    if (result.errors.length > 0) {
      console.error(JSON.stringify({ success: false, errors: result.errors }));
      process.exit(1);
    } else {
      console.log(result.code);
      process.exit(0);
    }
  } else if (lang === 'cpp') {
    const result = compileToCpp(input);
    if (result.errors.length > 0) {
      console.error(JSON.stringify({ success: false, errors: result.errors }));
      process.exit(1);
    } else {
      console.log(result.code);
      process.exit(0);
    }
  } else {
    const result = compileToPython(input);
    if (result.errors.length > 0) {
      console.error(JSON.stringify({ success: false, errors: result.errors }));
      process.exit(1);
    } else {
      console.log(result.code);
      process.exit(0);
    }
  }
}

// 6. Command: model (Download and status management)
else if (command === 'model') {
  const sub = remainingArgs[0] || 'download';
  const targetDir = ModelDownloader.getTargetModelDir();

  if (sub === 'status') {
    const installed = ModelDownloader.isModelInstalled(targetDir);
    console.log(`🧠 Konvert Model Directory: ${targetDir}`);
    console.log(`Status: ${installed ? '✅ Installed & Ready' : '❌ Not Installed'}`);
    process.exit(0);
  }

  console.log(`⚡ Downloading Konvert compressed AI model to ${targetDir}...`);
  try {
    let lastPercent = -1;
    await ModelDownloader.downloadAndExtractModel({
      targetDir,
      onProgress: (p) => {
        if (p.percent !== lastPercent && p.percent % 10 === 0) {
          lastPercent = p.percent;
          const mbDown = (p.downloadedBytes / (1024 * 1024)).toFixed(1);
          const mbTot = (p.totalBytes / (1024 * 1024)).toFixed(1);
          process.stdout.write(`\r  Progress: ${mbDown}MB / ${mbTot}MB (${p.percent}%)`);
        }
      }
    });
    console.log(`\n✨ Model downloaded and extracted successfully! Ready for offline inference.`);
    process.exit(0);
  } catch (err: any) {
    console.error(`\n❌ Download failed: ${err.message}`);
    process.exit(1);
  }
}

// Usage Help
else {
  console.log(`
Konvert — Deterministic English-to-Code Industrial Compiler

Commands:
  konvert init <dir>                   Scaffold a new enterprise multi-file project
  konvert build [--lang all|py|java|cpp] Compile an entire multi-file project
  konvert check                        Check all project files for syntax errors
  konvert compile "<code>"             Compile single English/CNL snippet
  konvert validate "<code>"            Validate syntax of a snippet
  konvert model [download|status]      Download or check local AI model weights

Options:
  --lang=python|java|cpp|all           Target language (default: python)
  --project=<dir>                      Project directory (default: current directory)
  --out=<dir>                          Output directory (default: dist/)
`);
  process.exit(0);
}
