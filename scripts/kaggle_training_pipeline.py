"""
IntentEngine Phase 3: Kaggle T4 GPU Training & Quantization Pipeline
Run this notebook script on Kaggle with Accelerator: GPU T4 x 2 (or single T4).

Output: /kaggle/working/intentengine_model.zip (~50MB) containing:
  - encoder_model_quantized.onnx
  - decoder_model_quantized.onnx
  - tokenizer.json
"""

import os
import shutil
import time
import zipfile
from pathlib import Path

# 1. Install optimization dependencies
os.system("pip install -q transformers datasets accelerate optimum[onnxruntime] onnx")

import torch
from datasets import load_dataset
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    DataCollatorForSeq2Seq,
    EarlyStoppingCallback
)
from optimum.onnxruntime import ORTModelForSeq2SeqLM, ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig

print("CUDA Available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("Device Name:", torch.cuda.get_device_name(0))

# 2. Configuration
BASE_MODEL = "google/flan-t5-small"
OUTPUT_DIR = "./results"
SAVED_MODEL_DIR = "./saved_intentengine_model"
ONNX_EXPORT_DIR = "./onnx_export"
FINAL_QUANTIZED_DIR = "./final_quantized_model"

MAX_INPUT_LENGTH = 128
MAX_TARGET_LENGTH = 256
BATCH_SIZE = 32
EPOCHS = 5
LEARNING_RATE = 3e-4

# 3. Load Tokenizer & Model
print(f"Loading {BASE_MODEL}...")
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
model = AutoModelForSeq2SeqLM.from_pretrained(BASE_MODEL)

# Add special tokens for CNL vocabulary
CNL_SPECIAL_TOKENS = [
    "DEFINE", "FUNCTION", "END", "DECLARE", "SET", "TO", "AS", "WITH",
    "VALUE", "FILTER", "WHERE", "SORT", "BY", "FOR", "EACH", "IN", "FROM",
    "STEP", "WHILE", "IF", "ELSE", "RETURN", "PRINT", "TRY", "CATCH",
    "FINALLY", "CLASS", "EXTENDS", "FIELD", "APPEND", "REMOVE", "MAP",
    "REDUCE", "USING", "LAMBDA", "ASSERT", "IMPORT", "RAW", "CAST", "NEW",
    "CALL", "NOTE", "MESSAGE", "ASC", "DESC", "PYTHON", "JAVA", "CPP",
    "Int", "Float", "String", "Bool", "Char", "Void", "List", "Map"
]
tokenizer.add_tokens(CNL_SPECIAL_TOKENS)
model.resize_token_embeddings(len(tokenizer))

# 4. Load Dataset
# On Kaggle, upload dataset files to /kaggle/input/intentengine-dataset/
dataset_path = Path("./dataset")
if not (dataset_path / "train.jsonl").exists():
    dataset_path = Path("/kaggle/input/intentengine-dataset")

print(f"Loading dataset from {dataset_path}...")
dataset = load_dataset("json", data_files={
    "train": str(dataset_path / "train.jsonl"),
    "validation": str(dataset_path / "validation.jsonl"),
    "test": str(dataset_path / "test.jsonl")
})

def preprocess(batch):
    inputs = ["translate to CNL: " + text for text in batch["english"]]
    targets = batch["cnl"]
    model_inputs = tokenizer(inputs, max_length=MAX_INPUT_LENGTH, truncation=True, padding="max_length")
    labels = tokenizer(targets, max_length=MAX_TARGET_LENGTH, truncation=True, padding="max_length")
    labels["input_ids"] = [
        [(label if label != tokenizer.pad_token_id else -100) for label in seq]
        for seq in labels["input_ids"]
    ]
    model_inputs["labels"] = labels["input_ids"]
    return model_inputs

print("Tokenizing datasets...")
tokenized_data = dataset.map(preprocess, batched=True, remove_columns=dataset["train"].column_names)

# 5. Training Arguments (FP16 on T4 GPU)
training_args = Seq2SeqTrainingArguments(
    output_dir=OUTPUT_DIR,
    eval_strategy="epoch",
    save_strategy="epoch",
    learning_rate=LEARNING_RATE,
    per_device_train_batch_size=BATCH_SIZE,
    per_device_eval_batch_size=BATCH_SIZE,
    num_train_epochs=EPOCHS,
    weight_decay=0.01,
    fp16=torch.cuda.is_available(),
    predict_with_generate=True,
    generation_max_length=MAX_TARGET_LENGTH,
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss",
    save_total_limit=2,
    logging_steps=50,
    report_to="none"
)

trainer = Seq2SeqTrainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_data["train"],
    eval_dataset=tokenized_data["validation"],
    tokenizer=tokenizer,
    data_collator=DataCollatorForSeq2Seq(tokenizer, model=model),
    callbacks=[EarlyStoppingCallback(early_stopping_patience=2)]
)

print("Starting training on Kaggle GPU...")
trainer.train()

print(f"Saving fine-tuned model to {SAVED_MODEL_DIR}...")
trainer.save_model(SAVED_MODEL_DIR)
tokenizer.save_pretrained(SAVED_MODEL_DIR)

# 6. Export to ONNX
print("Exporting PyTorch weights to ONNX graph...")
onnx_model = ORTModelForSeq2SeqLM.from_pretrained(SAVED_MODEL_DIR, export=True)
onnx_model.save_pretrained(ONNX_EXPORT_DIR)

# 7. Apply Dynamic INT8 Quantization
print("Applying Dynamic INT8 Quantization...")
os.makedirs(FINAL_QUANTIZED_DIR, exist_ok=True)

# Quantize Encoder
quantizer_encoder = ORTQuantizer.from_pretrained(ONNX_EXPORT_DIR, file_name="encoder_model.onnx")
qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
quantizer_encoder.quantize(save_dir=FINAL_QUANTIZED_DIR, quantization_config=qconfig)

# Quantize Decoder
quantizer_decoder = ORTQuantizer.from_pretrained(ONNX_EXPORT_DIR, file_name="decoder_model.onnx")
quantizer_decoder.quantize(save_dir=FINAL_QUANTIZED_DIR, quantization_config=qconfig)

# Save tokenizer into final package
tokenizer.save_pretrained(FINAL_QUANTIZED_DIR)

# 8. Package into ZIP for VS Code Extension
zip_path = "/kaggle/working/intentengine_model.zip"
if not os.path.exists("/kaggle/working"):
    zip_path = "./intentengine_model.zip"

print(f"Packaging model into {zip_path}...")
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    for root, _, files in os.walk(FINAL_QUANTIZED_DIR):
        for file in files:
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, FINAL_QUANTIZED_DIR)
            zipf.write(file_path, arcname)

size_mb = os.path.getsize(zip_path) / (1024 * 1024)
print(f"Done! Quantized Model Package Size: {size_mb:.2f} MB")
print(f"Ready to drop directly into VS Code extension /models folder!")
