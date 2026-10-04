# IntentEngine

> **Write English. Ship Code. No Cloud. No Hallucinations.**

IntentEngine is an offline, deterministic English-to-Code compiler packaged as a VS Code extension. It compiles human intent into verified, idiomatic **Python 3.12**, **Java 21**, and **C++20** in **< 2 milliseconds** with zero cloud API dependencies.

---

## ⚡ Key Features

- **0% Syntax Hallucinations:** Code is synthesized through a formal AST compiler (Chevrotain recursive-descent parser), guaranteeing syntactically valid code.
- **Multi-Target Code Emission:** A single English description compiles simultaneously to **Python**, **Java**, and **C++**.
- **Real-Time Latency:** Sub-millisecond compiler execution runs smoothly at 60 FPS on every keystroke.
- **100% Offline & Air-Gapped:** Zero code ever leaves your machine. Suitable for defense, healthcare, and enterprise environments.
- **Self-Validating Dataset Filter:** Synthesized training data is tested against the actual compiler before being saved.

---

## 🏗️ Architecture

```
User Input (English)
       │
       ▼
[Stage 1: Lightweight Local Model (ONNX Runtime)]
  • Fine-tuned Flan-T5-small (~50MB INT8 quantized)
  • Normalizes messy phrasing into Controlled Natural Language (CNL)
       │
       ▼
[Stage 2: Deterministic Compiler Core (<2ms)]
  • Chevrotain Tokenizer & Recursive-Descent Parser
  • Universal Intermediate Representation (AST)
  • Scoped Symbol Table & Context Window Cache
       │
  ┌────┼────────────┐
  ▼    ▼            ▼
Python 3.12       Java 21           C++20
(PEP 8, Dataclass) (Records, Streams) (STL Ranges, RAII)
```

---

## 📁 Repository Structure

```
intentengine/
├── dataset/                        # Verified dataset splits
│   ├── train.jsonl
│   ├── validation.jsonl
│   └── test.jsonl
├── scripts/
│   ├── generate_dataset.ts        # In-memory high-speed dataset generator
│   └── kaggle_training_pipeline.py # Kaggle GPU fine-tuning & ONNX quantization
├── src/
│   ├── compiler/
│   │   ├── ast.ts                 # Universal AST definitions
│   │   ├── tokens.ts              # CNL token definitions
│   │   ├── lexer.ts               # Chevrotain lexer
│   │   ├── parser.ts              # Recursive-descent parser & AST visitor
│   │   ├── symbolTable.ts         # Scoped lexical symbol table
│   │   ├── index.ts               # Compiler API (compileToPython, compileToJava, compileToCpp)
│   │   └── emitters/
│   │       ├── pythonEmitter.ts   # Python 3.12 emitter
│   │       ├── javaEmitter.ts     # Java 21 emitter
│   │       └── cppEmitter.ts      # C++20 emitter
│   ├── core/
│   │   └── contextBuilder.ts      # Sliding context & symbol state manager
│   ├── test/
│   │   ├── compiler.test.ts       # Compiler core test suite
│   │   └── multiLanguage.test.ts  # Multi-language emitter tests
│   ├── cli.ts                     # CLI validation & compilation bridge
│   └── extension.ts               # VS Code extension entry point
└── package.json
```

---

## 🚀 Quickstart

### 1. Build & Run Tests
```bash
npm install
npm run build
npm test
```

### 2. Compile via CLI
```bash
node dist/cli.js compile "DEFINE FUNCTION add(a: Int, b: Int) -> Int: RETURN a + b END FUNCTION"
```

Output:
```python
def add(a: int, b: int) -> int:
    return (a + b)
```

### 3. Generate New Verified Datasets
```bash
npx tsx scripts/generate_dataset.ts
```

### 4. Train on Kaggle T4 GPU
Upload `dataset/` and `scripts/kaggle_training_pipeline.py` to a Kaggle Notebook with GPU accelerator enabled. Run the script to export the quantized ONNX models into `intentengine_model.zip`.

---

## 📄 License
MIT
