import os
import sys
import subprocess

print("==================================================")
print("IntentEngine Phase 3: Kaggle GPU Training Pipeline")
print("==================================================")

# Step 1: Upgrade huggingface ecosystem cleanly
print("Upgrading huggingface-hub, diffusers, transformers...")
subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "--upgrade", "huggingface-hub>=0.26.0", "diffusers>=0.31.0", "transformers>=4.45.0", "datasets", "accelerate", "onnx", "onnxruntime", "optimum"
], check=True)

import torch
from pathlib import Path
from datasets import load_dataset
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    DataCollatorForSeq2Seq
)
import zipfile
import shutil

print("CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))

# Step 2: Locate dataset
possible_dirs = [
    Path("/kaggle/input/intentengine-dataset"),
    Path("/kaggle/input/intentengine-cnl-dataset"),
    Path("./dataset")
]

data_dir = None
for d in possible_dirs:
    if (d / "train.jsonl").exists():
        data_dir = d
        break

if not data_dir:
    matches = list(Path("/kaggle/input").rglob("train.jsonl"))
    if matches:
        data_dir = matches[0].parent

if not data_dir:
    raise FileNotFoundError("Could not find train.jsonl in /kaggle/input!")

print(f"Using dataset from: {data_dir}")

# Step 3: Load Tokenizer & Model (Native SentencePiece for optimal transfer learning)
MODEL_ID = "google/flan-t5-small"
print(f"Loading {MODEL_ID}...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_ID)

# Step 4: Tokenize Dataset
dataset = load_dataset("json", data_files={
    "train": str(data_dir / "train.jsonl"),
    "validation": str(data_dir / "validation.jsonl")
})

def preprocess(batch):
    inputs = ["translate to CNL: " + text for text in batch["english"]]
    targets = batch["cnl"]
    model_inputs = tokenizer(inputs, max_length=128, truncation=True, padding="max_length")
    labels = tokenizer(targets, max_length=256, truncation=True, padding="max_length")
    labels["input_ids"] = [
        [(label if label != tokenizer.pad_token_id else -100) for label in seq]
        for seq in labels["input_ids"]
    ]
    model_inputs["labels"] = labels["input_ids"]
    return model_inputs

print("Preprocessing dataset...")
tokenized = dataset.map(preprocess, batched=True, remove_columns=dataset["train"].column_names)

# Step 5: Train
training_args = Seq2SeqTrainingArguments(
    output_dir="./training_output",
    eval_strategy="epoch",
    save_strategy="epoch",
    learning_rate=5e-4,
    per_device_train_batch_size=32,
    per_device_eval_batch_size=32,
    num_train_epochs=5,
    weight_decay=0.01,
    fp16=torch.cuda.is_available(),
    logging_steps=25,
    save_total_limit=1,
    report_to="none"
)

trainer_kwargs = {
    "model": model,
    "args": training_args,
    "train_dataset": tokenized["train"],
    "eval_dataset": tokenized["validation"],
    "data_collator": DataCollatorForSeq2Seq(tokenizer, model=model)
}
try:
    trainer = Seq2SeqTrainer(processing_class=tokenizer, **trainer_kwargs)
except TypeError:
    trainer = Seq2SeqTrainer(tokenizer=tokenizer, **trainer_kwargs)

print("Starting model fine-tuning...")
trainer.train()

saved_dir = "./saved_model"
trainer.save_model(saved_dir)
tokenizer.save_pretrained(saved_dir)
print(f"Model successfully saved to {saved_dir}!")

# Step 6: ONNX Export & INT8 Quantization
onnx_dir = "./onnx_export"
final_dir = "./intentengine_onnx_quantized"
os.makedirs(final_dir, exist_ok=True)

try:
    print("Exporting model to ONNX via ORTModelForSeq2SeqLM...")
    from optimum.onnxruntime import ORTModelForSeq2SeqLM, ORTQuantizer
    from optimum.onnxruntime.configuration import AutoQuantizationConfig

    onnx_model = ORTModelForSeq2SeqLM.from_pretrained(saved_dir, export=True)
    onnx_model.save_pretrained(onnx_dir)
    print("ONNX files created:", os.listdir(onnx_dir))

    # Step 7: INT8 Dynamic Quantization
    print("Applying INT8 Quantization...")
    qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)

    quantizer_enc = ORTQuantizer.from_pretrained(onnx_dir, file_name="encoder_model.onnx")
    quantizer_enc.quantize(save_dir=final_dir, quantization_config=qconfig)

    quantizer_dec = ORTQuantizer.from_pretrained(onnx_dir, file_name="decoder_model.onnx")
    quantizer_dec.quantize(save_dir=final_dir, quantization_config=qconfig)
    print("Quantized ONNX files in final_dir:", os.listdir(final_dir))
except Exception as e:
    print(f"Notice: ONNX export exception ({e}). Packaging fine-tuned PyTorch model into distribution package...")
    for item in os.listdir(saved_dir):
        s = os.path.join(saved_dir, item)
        d = os.path.join(final_dir, item)
        if os.path.isfile(s):
            shutil.copy2(s, d)

# Ensure tokenizer is in final package
tokenizer.save_pretrained(final_dir)

# Step 8: Package output into ZIP
zip_output = "/kaggle/working/intentengine_model.zip"
print(f"Creating final distribution zip at {zip_output}...")
with zipfile.ZipFile(zip_output, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(final_dir):
        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, final_dir)
            z.write(full_path, rel_path)

size_mb = os.path.getsize(zip_output) / (1024 * 1024)
print(f"SUCCESS! Output package size: {size_mb:.2f} MB")
print("IntentEngine model is fully compiled, packaged, and ready for VS Code extension!")
