#!/usr/bin/env python3
"""
IntentEngine Phase 2: Dataset Engineering & Validation Pipeline
Generates high-quality paired dataset (English -> Controlled Natural Language).
Applies a self-validating compiler gate: every candidate sample is verified
against the IntentEngine compiler before being saved.
"""

import json
import os
import random
import subprocess
import sys
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT_DIR / "dataset"
CLI_PATH = ROOT_DIR / "dist" / "cli.js"

OUTPUT_DIR.mkdir(exist_ok=True)

# 1. TEMPLATES & COMBINATORIAL EXPANSION

TEMPLATES = [
    # Variables
    {
        "category": "variables",
        "english_variants": [
            "declare a variable named {name} as {type}",
            "create a variable called {name} of type {type}",
            "define {name} as a {type}",
            "initialize {name} as {type}",
            "make a new {type} variable {name}"
        ],
        "cnl": "DECLARE {name} AS {cnl_type}"
    },
    {
        "category": "variables_with_value",
        "english_variants": [
            "declare {name} as {type} with value {val}",
            "create a {type} variable {name} set to {val}",
            "set a new variable {name} as {type} equal to {val}",
            "initialize {name} of type {type} with {val}",
            "make a {type} named {name} holding {val}"
        ],
        "cnl": "DECLARE {name} AS {cnl_type} WITH VALUE {val}"
    },
    # Assignments
    {
        "category": "assignments",
        "english_variants": [
            "set {name} to {val}",
            "assign {val} to {name}",
            "update {name} to equal {val}",
            "change {name} to {val}",
            "put {val} into {name}"
        ],
        "cnl": "SET {name} TO {val}"
    },
    # Functions
    {
        "category": "functions",
        "english_variants": [
            "define a function named {fn} taking {p1} as {t1} and {p2} as {t2} returning {ret}: return {p1} plus {p2}",
            "create a function {fn}({p1}: {t1}, {p2}: {t2}) -> {ret} that returns {p1} + {p2}",
            "write a function called {fn} with parameters {p1} of type {t1} and {p2} of type {t2} which returns {ret}: return {p1} + {p2}",
            "make a function {fn} that takes two {t1} arguments {p1} and {p2} and returns their sum",
            "function {fn} accepting {p1}: {t1} and {p2}: {t2} returning {ret}: return {p1} + {p2}"
        ],
        "cnl": "DEFINE FUNCTION {fn}({p1}: {cnl_t1}, {p2}: {cnl_t2}) -> {cnl_ret}:\n  RETURN {p1} + {p2}\nEND FUNCTION"
    },
    # Control flow
    {
        "category": "control_flow",
        "english_variants": [
            "if {var} is greater than or equal to {val}: print \"Accepted\" else: print \"Rejected\"",
            "check if {var} >= {val}: output \"Accepted\", otherwise output \"Rejected\"",
            "if condition {var} >= {val}: print \"Accepted\" else print \"Rejected\"",
            "write an if statement checking if {var} >= {val} then print \"Accepted\" else print \"Rejected\"",
            "branch: if {var} >= {val} print \"Accepted\" else print \"Rejected\""
        ],
        "cnl": "IF {var} >= {val}:\n  PRINT \"Accepted\"\nELSE:\n  PRINT \"Rejected\"\nEND IF"
    },
    # Loops
    {
        "category": "loops_for",
        "english_variants": [
            "loop from 0 to {val} with index i: print i",
            "run a for loop i from 0 to {val}: print i",
            "iterate i from 0 to {val} step 1: print i",
            "repeat from 0 to {val} using i: display i",
            "for i starting at 0 up to {val}: print i"
        ],
        "cnl": "FOR i FROM 0 TO {val} STEP 1:\n  PRINT i\nEND FOR"
    },
    {
        "category": "loops_foreach",
        "english_variants": [
            "for each {item} in {list_name}: print {item}",
            "iterate over each {item} in {list_name} and print it",
            "loop through every {item} in {list_name}: display {item}",
            "for every {item} in the collection {list_name}: print {item}",
            "traverse {list_name} using {item}: print {item}"
        ],
        "cnl": "FOR EACH {item} IN {list_name}:\n  PRINT {item}\nEND FOR"
    },
    # Data structures
    {
        "category": "append",
        "english_variants": [
            "append {val} to {list_name}",
            "add {val} to the list {list_name}",
            "push {val} into {list_name}",
            "insert {val} at the end of {list_name}",
            "put {val} into list {list_name}"
        ],
        "cnl": "APPEND {val} TO {list_name}"
    },
    {
        "category": "filter",
        "english_variants": [
            "filter {list_name} where age is greater than or equal to 18",
            "filter the list {list_name} keeping only those where age >= 18",
            "get all elements in {list_name} with age >= 18",
            "extract from {list_name} where age >= 18",
            "filter items in {list_name} where age >= 18"
        ],
        "cnl": "FILTER {list_name} WHERE age >= 18"
    },
    {
        "category": "sort",
        "english_variants": [
            "sort {list_name} by age descending",
            "order {list_name} by age in descending order",
            "sort the list {list_name} by age desc",
            "arrange {list_name} by age from highest to lowest",
            "sort collection {list_name} by age in reverse order"
        ],
        "cnl": "SORT {list_name} BY age DESC"
    },
    # Error Handling
    {
        "category": "try_catch",
        "english_variants": [
            "try: call {fn}() catch err as String: print err",
            "run a try catch block calling {fn}(), catching String error as err and printing it",
            "wrap call to {fn}() in try catch: on error err of type String print err",
            "attempt to call {fn}() catching any String err and printing it",
            "try calling {fn}() catch err as String then print err"
        ],
        "cnl": "TRY:\n  CALL {fn}()\nCATCH err AS String:\n  PRINT err\nEND TRY"
    }
]

# Vocabulary pools
TYPES = [
    ("Int", "integer", "10"),
    ("Int", "int", "42"),
    ("Float", "float", "3.14"),
    ("String", "string", '"active"'),
    ("Bool", "boolean", "TRUE")
]

VAR_NAMES = ["count", "total", "score", "index", "size", "limit", "offset", "status", "maxAge"]
FN_NAMES = ["calculateSum", "processData", "validateInput", "computeTax", "mergeResults"]
LIST_NAMES = ["users", "scores", "items", "records", "tokens", "students"]

def validate_cnl(cnl_code: str) -> bool:
    """Invokes our compiled CLI compiler to verify the sample parses."""
    try:
        proc = subprocess.run(
            ["node", str(CLI_PATH), "validate", cnl_code],
            capture_output=True,
            text=True,
            timeout=5
        )
        return proc.returncode == 0
    except Exception as e:
        return False

def generate_sample():
    tpl = random.choice(TEMPLATES)
    eng_template = random.choice(tpl["english_variants"])
    cnl_template = tpl["cnl"]
    
    type_info = random.choice(TYPES)
    var = random.choice(VAR_NAMES)
    fn = random.choice(FN_NAMES)
    lst = random.choice(LIST_NAMES)
    
    replacements = {
        "name": var,
        "var": var,
        "type": type_info[1],
        "cnl_type": type_info[0],
        "val": type_info[2],
        "fn": fn,
        "p1": "a",
        "p2": "b",
        "t1": "int",
        "t2": "int",
        "cnl_t1": "Int",
        "cnl_t2": "Int",
        "ret": "int",
        "cnl_ret": "Int",
        "item": "x",
        "list_name": lst
    }
    
    english = eng_template.format(**replacements)
    cnl = cnl_template.format(**replacements)
    
    return {
        "english": english,
        "cnl": cnl,
        "category": tpl["category"]
    }

def main():
    print("IntentEngine Dataset Generation Pipeline")
    print(f"Verifying against compiler CLI: {CLI_PATH}")
    
    # Quick health check
    if not validate_cnl("DECLARE x AS Int WITH VALUE 5"):
        print("ERROR: Compiler CLI check failed! Build the TypeScript project first.")
        sys.exit(1)
        
    print("Compiler CLI check passed! Generating samples...")
    
    total_samples = 5000  # For local generation (can scale to 100k for full training)
    valid_samples = []
    seen = set()
    
    while len(valid_samples) < total_samples:
        sample = generate_sample()
        key = (sample["english"], sample["cnl"])
        if key in seen:
            continue
        seen.add(key)
        
        # Self-validating compiler gate
        if validate_cnl(sample["cnl"]):
            valid_samples.append(sample)
            if len(valid_samples) % 500 == 0:
                print(f"Generated and validated {len(valid_samples)} / {total_samples} samples...")
        
    random.shuffle(valid_samples)
    
    # 85% train, 10% validation, 5% test
    n = len(valid_samples)
    train_split = int(0.85 * n)
    val_split = int(0.95 * n)
    
    train_data = valid_samples[:train_split]
    val_data = valid_samples[train_split:val_split]
    test_data = valid_samples[val_split:]
    
    print(f"\nWriting dataset splits:")
    print(f"  Train: {len(train_data)} samples -> {OUTPUT_DIR / 'train.jsonl'}")
    print(f"  Validation: {len(val_data)} samples -> {OUTPUT_DIR / 'validation.jsonl'}")
    print(f"  Test: {len(test_data)} samples -> {OUTPUT_DIR / 'test.jsonl'}")
    
    for split_name, data in [("train", train_data), ("validation", val_data), ("test", test_data)]:
        with open(OUTPUT_DIR / f"{split_name}.jsonl", "w", encoding="utf-8") as f:
            for item in data:
                f.write(json.dumps(item) + "\n")
                
    print("\nDataset generation completed successfully with 100% compiler validation!")

if __name__ == "__main__":
    main()
