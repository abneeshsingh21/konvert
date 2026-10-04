import sys
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

if len(sys.argv) < 2:
    print("Error: No prompt provided", file=sys.stderr)
    sys.exit(1)

prompt = " ".join(sys.argv[1:])
import os
MODEL_DIR = Path(os.environ.get("KONVERT_MODEL_DIR", str(Path(__file__).resolve().parent.parent / "models")))

tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
model = AutoModelForSeq2SeqLM.from_pretrained(str(MODEL_DIR))
model.eval()

inputs = tokenizer("translate to CNL: " + prompt, return_tensors="pt")
outputs = model.generate(
    inputs["input_ids"],
    max_length=128,
    num_beams=3,
    early_stopping=True
)

cnl_output = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
print(cnl_output)
