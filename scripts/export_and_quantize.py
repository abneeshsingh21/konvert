import os
import sys
import shutil
from pathlib import Path
import onnx
from onnxruntime.quantization import quantize_dynamic, QuantType

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "models"
ONNX_OUT_DIR = BASE_DIR / "models" / "onnx"
QUANT_OUT_DIR = BASE_DIR / "models" / "onnx_int8"

def main():
    print(f"Loading model from {MODEL_DIR}...")
    from optimum.onnxruntime import ORTModelForSeq2SeqLM
    from transformers import AutoTokenizer

    os.makedirs(ONNX_OUT_DIR, exist_ok=True)
    os.makedirs(QUANT_OUT_DIR, exist_ok=True)

    print("Step 1: Exporting PyTorch T5 model to standard ONNX...")
    model = ORTModelForSeq2SeqLM.from_pretrained(str(MODEL_DIR), export=True)
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))

    model.save_pretrained(str(ONNX_OUT_DIR))
    tokenizer.save_pretrained(str(ONNX_OUT_DIR))
    tokenizer.save_pretrained(str(QUANT_OUT_DIR))
    print(f"Exported base ONNX model to {ONNX_OUT_DIR}")

    print("\nStep 2: Quantizing ONNX models to INT8...")
    onnx_files = list(ONNX_OUT_DIR.glob("*.onnx"))
    print(f"Found {len(onnx_files)} ONNX files to quantize:")

    total_orig_size = 0
    total_quant_size = 0

    for onnx_file in onnx_files:
        orig_size = onnx_file.stat().st_size
        total_orig_size += orig_size
        quant_file = QUANT_OUT_DIR / onnx_file.name

        print(f"  • Quantizing {onnx_file.name} ({orig_size / (1024*1024):.2f} MB)...")
        quantize_dynamic(
            model_input=str(onnx_file),
            model_output=str(quant_file),
            weight_type=QuantType.QUInt8
        )
        quant_size = quant_file.stat().st_size
        total_quant_size += quant_size
        print(f"    -> Done: {quant_file.name} ({quant_size / (1024*1024):.2f} MB)")

    # Copy config files
    for cfg in ONNX_OUT_DIR.glob("*.json"):
        shutil.copy(cfg, QUANT_OUT_DIR / cfg.name)

    print("\n" + "="*50)
    print(f"Original ONNX Size:  {total_orig_size / (1024*1024):.2f} MB")
    print(f"Quantized INT8 Size: {total_quant_size / (1024*1024):.2f} MB")
    print(f"Compression Ratio:   {total_quant_size * 100 / max(1, total_orig_size):.1f}%")
    print("="*50)

    print("\nStep 3: Testing inference with INT8 Quantized ORT model...")
    quant_model = ORTModelForSeq2SeqLM.from_pretrained(str(QUANT_OUT_DIR))
    
    test_prompts = [
        "declare total as int with value 10",
        "define function add with a as int, b as int returning int",
        "filter numbers where item is greater than 5"
    ]

    for p in test_prompts:
        inputs = tokenizer("translate to CNL: " + p, return_tensors="pt")
        outputs = quant_model.generate(**inputs, max_new_tokens=48)
        decoded = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
        print(f"\nPrompt:  '{p}'")
        print(f"INT8 CNL: '{decoded}'")

    print("\nAll export & quantization steps completed successfully!")

if __name__ == "__main__":
    main()
