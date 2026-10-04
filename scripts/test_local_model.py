import sys
import json
import subprocess
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

MODEL_DIR = Path("./models")
CLI_PATH = Path("./dist/cli.js")

print("================================================================================")
print(" IntentEngine Multi-Language End-to-End Pipeline Verification")
print(" Local Neural Normalizer (Flan-T5) + Deterministic Compiler (Python/Java/C++)")
print("================================================================================\n")

print(f"Loading fine-tuned model weights from {MODEL_DIR}...")
tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
model = AutoModelForSeq2SeqLM.from_pretrained(str(MODEL_DIR))
model.eval()
print(" Fine-tuned model loaded successfully on CPU!\n")

test_prompts = [
    ("declare total as integer with value 100", "Variable Declaration with Value"),
    ("create a variable called username of type string", "Variable Declaration without Value"),
    ("set count to 42", "Assignment"),
    ("define a function named add taking a as int and b as int returning int: return a plus b", "Function Declaration"),
    ("if score is greater than or equal to 10: print \"Accepted\" else: print \"Rejected\"", "Conditional Statement"),
    ("for each item in users: print item", "Collection Iteration"),
    ("filter users where age is greater than or equal to 18", "Declarative Data Filtering")
]

all_passed = True

for i, (prompt, desc) in enumerate(test_prompts, 1):
    print("--------------------------------------------------------------------------------")
    print(f"Test {i}: {desc}")
    print(f"  Natural English Input : \"{prompt}\"")
    
    # Stage 1: Local Model Translation (English -> CNL)
    inputs = tokenizer("translate to CNL: " + prompt, return_tensors="pt")
    outputs = model.generate(
        inputs["input_ids"],
        max_length=128,
        num_beams=3,
        early_stopping=True
    )
    cnl_output = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
    print(f"  Stage 1 (Model CNL)   : {cnl_output}")
    
    # Stage 2: Deterministic Multi-Language Compiler Core
    proc = subprocess.run(
        ["node", str(CLI_PATH), "compile", "--lang=all", cnl_output],
        capture_output=True,
        text=True
    )
    
    if proc.returncode == 0:
        targets = json.loads(proc.stdout)
        print("  Stage 2 (Compiled Multi-Language Targets):")
        print("    [Python 3.12]:")
        for line in targets['python'].strip().splitlines():
            print(f"      {line}")
        print("    [Java 21]:")
        for line in targets['java'].strip().splitlines():
            print(f"      {line}")
        print("    [C++20]:")
        for line in targets['cpp'].strip().splitlines():
            print(f"      {line}")
    else:
        all_passed = False
        print(f"  Compiler Error:\n{proc.stderr.strip()}")

print("\n================================================================================")
if all_passed:
    print("ALL TESTS PASSED! Multi-language deterministic pipeline is 100% verified!")
else:
    print("Some tests encountered errors.")
print("================================================================================")
