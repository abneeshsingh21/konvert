import { parseCNL, compileToPython, compileToJava, compileToCpp, compileAll } from './compiler/index.js';

const args = process.argv.slice(2);
const command = args[0];

// Parse flags like --lang=java or --lang java
let lang = 'python';
const remainingArgs: string[] = [];

for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith('--lang=')) {
    lang = args[i].split('=')[1].toLowerCase();
  } else if (args[i] === '--lang' && i + 1 < args.length) {
    lang = args[++i].toLowerCase();
  } else {
    remainingArgs.push(args[i]);
  }
}

const input = remainingArgs.join(' ');

if (command === 'validate') {
  const result = parseCNL(input);
  if (result.errors.length > 0) {
    console.error(JSON.stringify({ valid: false, errors: result.errors }));
    process.exit(1);
  } else {
    console.log(JSON.stringify({ valid: true }));
    process.exit(0);
  }
} else if (command === 'compile') {
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
  } else if (lang === 'cpp' || lang === 'c++') {
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
} else {
  console.log('Usage: konvert [validate|compile] [--lang python|java|cpp|all] "<code>"');
  process.exit(0);
}
