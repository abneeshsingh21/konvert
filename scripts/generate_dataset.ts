import * as fs from 'fs';
import * as path from 'path';
import { parseCNL } from '../src/compiler/index.js';

const OUTPUT_DIR = path.resolve('dataset');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

interface TemplateDef {
  category: string;
  englishVariants: string[];
  cnl: string;
}

const TEMPLATES: TemplateDef[] = [
  {
    category: 'variables',
    englishVariants: [
      'declare a variable named {name} as {type}',
      'create a variable called {name} of type {type}',
      'define {name} as a {type}',
      'initialize {name} as {type}',
      'make a new {type} variable {name}',
    ],
    cnl: 'DECLARE {name} AS {cnl_type}',
  },
  {
    category: 'variables_with_value',
    englishVariants: [
      'declare {name} as {type} with value {val}',
      'create a {type} variable {name} set to {val}',
      'set a new variable {name} as {type} equal to {val}',
      'initialize {name} of type {type} with {val}',
      'make a {type} named {name} holding {val}',
    ],
    cnl: 'DECLARE {name} AS {cnl_type} WITH VALUE {val}',
  },
  {
    category: 'assignments',
    englishVariants: [
      'set {name} to {val}',
      'assign {val} to {name}',
      'update {name} to equal {val}',
      'change {name} to {val}',
      'put {val} into {name}',
    ],
    cnl: 'SET {name} TO {val}',
  },
  {
    category: 'functions',
    englishVariants: [
      'define a function named {fn} taking {p1} as {t1} and {p2} as {t2} returning {ret}: return {p1} plus {p2}',
      'create a function {fn}({p1}: {t1}, {p2}: {t2}) -> {ret} that returns {p1} + {p2}',
      'write a function called {fn} with parameters {p1} of type {t1} and {p2} of type {t2} which returns {ret}: return {p1} + {p2}',
      'make a function {fn} that takes two {t1} arguments {p1} and {p2} and returns their sum',
      'function {fn} accepting {p1}: {t1} and {p2}: {t2} returning {ret}: return {p1} + {p2}',
    ],
    cnl: 'DEFINE FUNCTION {fn}({p1}: {cnl_t1}, {p2}: {cnl_t2}) -> {cnl_ret}:\n  RETURN {p1} + {p2}\nEND FUNCTION',
  },
  {
    category: 'control_flow',
    englishVariants: [
      'if {var} is greater than or equal to {val}: print "Accepted" else: print "Rejected"',
      'check if {var} >= {val}: output "Accepted", otherwise output "Rejected"',
      'if condition {var} >= {val}: print "Accepted" else print "Rejected"',
      'write an if statement checking if {var} >= {val} then print "Accepted" else print "Rejected"',
      'branch: if {var} >= {val} print "Accepted" else print "Rejected"',
    ],
    cnl: 'IF {var} >= {val}:\n  PRINT "Accepted"\nELSE:\n  PRINT "Rejected"\nEND IF',
  },
  {
    category: 'loops_for',
    englishVariants: [
      'loop from 0 to {val} with index i: print i',
      'run a for loop i from 0 to {val}: print i',
      'iterate i from 0 to {val} step 1: print i',
      'repeat from 0 to {val} using i: display i',
      'for i starting at 0 up to {val}: print i',
    ],
    cnl: 'FOR i FROM 0 TO {val} STEP 1:\n  PRINT i\nEND FOR',
  },
  {
    category: 'loops_foreach',
    englishVariants: [
      'for each {item} in {list_name}: print {item}',
      'iterate over each {item} in {list_name} and print it',
      'loop through every {item} in {list_name}: display {item}',
      'for every {item} in the collection {list_name}: print {item}',
      'traverse {list_name} using {item}: print {item}',
    ],
    cnl: 'FOR EACH {item} IN {list_name}:\n  PRINT {item}\nEND FOR',
  },
  {
    category: 'append',
    englishVariants: [
      'append {val} to {list_name}',
      'add {val} to the list {list_name}',
      'push {val} into {list_name}',
      'insert {val} at the end of {list_name}',
      'put {val} into list {list_name}',
    ],
    cnl: 'APPEND {val} TO {list_name}',
  },
  {
    category: 'filter',
    englishVariants: [
      'filter {list_name} where age is greater than or equal to 18',
      'filter the list {list_name} keeping only those where age >= 18',
      'get all elements in {list_name} with age >= 18',
      'extract from {list_name} where age >= 18',
      'filter items in {list_name} where age >= 18',
    ],
    cnl: 'FILTER {list_name} WHERE age >= 18',
  },
  {
    category: 'sort',
    englishVariants: [
      'sort {list_name} by age descending',
      'order {list_name} by age in descending order',
      'sort the list {list_name} by age desc',
      'arrange {list_name} by age from highest to lowest',
      'sort collection {list_name} by age in reverse order',
    ],
    cnl: 'SORT {list_name} BY age DESC',
  },
  {
    category: 'try_catch',
    englishVariants: [
      'try: call {fn}() catch err as String: print err',
      'run a try catch block calling {fn}(), catching String error as err and printing it',
      'wrap call to {fn}() in try catch: on error err of type String print err',
      'attempt to call {fn}() catching any String err and printing it',
      'try calling {fn}() catch err as String then print err',
    ],
    cnl: 'TRY:\n  CALL {fn}()\nCATCH err AS String:\n  PRINT err\nEND TRY',
  },
];

const TYPES = [
  { cnl: 'Int', eng: 'integer', val: '10' },
  { cnl: 'Int', eng: 'int', val: '42' },
  { cnl: 'Float', eng: 'float', val: '3.14' },
  { cnl: 'String', eng: 'string', val: '"active"' },
  { cnl: 'Bool', eng: 'boolean', val: 'TRUE' },
];

const VARS = ['count', 'total', 'score', 'index', 'size', 'limit', 'offset', 'status', 'maxAge'];
const FNS = ['calculateSum', 'processData', 'validateInput', 'computeTax', 'mergeResults'];
const LISTS = ['users', 'scores', 'items', 'records', 'tokens', 'students'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatStr(tpl: string, dict: Record<string, string>): string {
  let result = tpl;
  for (const [k, v] of Object.entries(dict)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return result;
}

async function run() {
  console.log('⚡ Starting high-speed in-memory dataset generation...');
  const targetSamples = 2500;
  const maxAttempts = 15000;
  const validSamples: Array<{ english: string; cnl: string; category: string }> = [];
  const seen = new Set<string>();

  const startTime = Date.now();
  let attempts = 0;

  while (validSamples.length < targetSamples && attempts < maxAttempts) {
    attempts++;
    const tpl = pick(TEMPLATES);
    const engTpl = pick(tpl.englishVariants);
    const typeInfo = pick(TYPES);
    const varName = pick(VARS) + (attempts % 10 === 0 ? String(attempts % 5) : '');
    const fnName = pick(FNS) + (attempts % 7 === 0 ? String(attempts % 3) : '');
    const listName = pick(LISTS);

    const replacements: Record<string, string> = {
      name: varName,
      var: varName,
      type: typeInfo.eng,
      cnl_type: typeInfo.cnl,
      val: typeInfo.val,
      fn: fnName,
      p1: 'a',
      p2: 'b',
      t1: 'int',
      t2: 'int',
      cnl_t1: 'Int',
      cnl_t2: 'Int',
      ret: 'int',
      cnl_ret: 'Int',
      item: 'x',
      list_name: listName,
    };

    const english = formatStr(engTpl, replacements);
    const cnl = formatStr(tpl.cnl, replacements);

    const key = `${english}|${cnl}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Fast In-Memory Compiler Gate
    const res = parseCNL(cnl);
    if (res.errors.length === 0) {
      validSamples.push({ english, cnl, category: tpl.category });
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Generated and verified ${validSamples.length} samples in ${duration} seconds!`);

  // Shuffle
  for (let i = validSamples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [validSamples[i], validSamples[j]] = [validSamples[j], validSamples[i]];
  }

  const n = validSamples.length;
  const trainSplit = Math.floor(0.85 * n);
  const valSplit = Math.floor(0.95 * n);

  const trainData = validSamples.slice(0, trainSplit);
  const valData = validSamples.slice(trainSplit, valSplit);
  const testData = validSamples.slice(valSplit);

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'train.jsonl'),
    trainData.map((d) => JSON.stringify(d)).join('\n') + '\n'
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'validation.jsonl'),
    valData.map((d) => JSON.stringify(d)).join('\n') + '\n'
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'test.jsonl'),
    testData.map((d) => JSON.stringify(d)).join('\n') + '\n'
  );

  console.log(`📁 Files written to ${OUTPUT_DIR}:`);
  console.log(`   - train.jsonl: ${trainData.length} samples`);
  console.log(`   - validation.jsonl: ${valData.length} samples`);
  console.log(`   - test.jsonl: ${testData.length} samples`);
}

run();
