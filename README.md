# Konvert

> **Write English. Ship Code. No Cloud. No Hallucinations.**

**Konvert** is an offline, deterministic English-to-Code compiler packaged as a VS Code extension and command-line tool. It converts human intent into verified, idiomatic **Python 3.12**, **Java 21**, and **C++20** in **< 2 milliseconds** with zero cloud API dependencies.

---

## ⚡ Key Features

- **0% Syntax Hallucinations:** Code is synthesized through a formal AST compiler (Chevrotain recursive-descent parser), guaranteeing syntactically valid code.
- **Multi-Target Code Emission:** A single English description compiles simultaneously to **Python 3.12**, **Java 21**, and **C++20**.
- **Real-Time Latency:** Sub-millisecond compiler execution runs smoothly on every keystroke.
- **100% Offline & Air-Gapped:** Zero code ever leaves your machine. Suitable for defense, financial compliance, and enterprise environments.
- **Local AI Normalizer:** Lightweight local neural model (fine-tuned Flan-T5) translates messy, casual English into Controlled Natural Language (CNL).

---

## 🏗️ Architecture

```
User Input (Casual English)
       │
       ▼
[Stage 1: Lightweight Local Model (Offline CPU)]
  • Fine-tuned Flan-T5 model
  • Normalizes messy phrasing into Controlled Natural Language (CNL)
       │
       ▼
[Stage 2: Deterministic Compiler Core (<2ms)]
  • Chevrotain Tokenizer & Recursive-Descent Parser
  • Universal Intermediate Representation (AST)
  • Scoped Symbol Table & Lexical Scopes
       │
  ┌────┼────────────┐
  ▼    ▼            ▼
Python 3.12       Java 21           C++20
(PEP 8, Dataclass) (Records, Streams) (STL Ranges, RAII)
```

---

## 📁 Repository Structure

```
konvert/
├── dataset/                        # Compiler-verified dataset splits
│   ├── train.jsonl
│   ├── validation.jsonl
│   └── test.jsonl
├── kaggle-kernel/                  # Automated Kaggle T4 GPU fine-tuning pipeline
│   ├── train.py
│   └── kernel-metadata.json
├── models/                         # Local fine-tuned model weights
│   ├── model.safetensors
│   ├── tokenizer.json
│   └── config.json
├── scripts/
│   ├── infer_cnl.py               # Standalone local model inference CLI
│   ├── test_local_model.py        # Multi-language end-to-end pipeline verification
│   └── generate_dataset.ts        # In-memory high-speed dataset generator
├── src/
│   ├── compiler/                  # Deterministic Compiler Core
│   │   ├── ast.ts                 # Universal AST definitions
│   │   ├── tokens.ts              # CNL token definitions
│   │   ├── lexer.ts               # Chevrotain lexer
│   │   ├── parser.ts              # Recursive-descent parser & AST visitor
│   │   ├── symbolTable.ts         # Scoped lexical symbol table
│   │   └── emitters/
│   │       ├── pythonEmitter.ts   # Python 3.12 emitter
│   │       ├── javaEmitter.ts     # Java 21 emitter
│   │       └── cppEmitter.ts      # C++20 emitter
│   ├── core/
│   │   └── contextBuilder.ts      # Sliding-window context tracker
│   ├── cli.ts                     # Multi-target command-line interface
│   └── extension.ts               # VS Code Extension entry point & Live Preview Webview
├── package.json
└── tsconfig.json
```

---

## 🚀 Getting Started

### 1. Build and Run Tests
```bash
npm install
npm run build
npm test
```

### 2. Verify End-to-End Pipeline
```bash
python scripts/test_local_model.py
```

### 3. Launch VS Code Extension
Open the directory in VS Code and press `F5` to start debugging.
* Press `Ctrl + Alt + K` to open the **Konvert Live Compiler Preview**.
* In any file, type `#? <your intent>` or `//? <your intent>` to get ghost-text inline code completions.
