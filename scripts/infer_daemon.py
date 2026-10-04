import sys
import os
import json
from pathlib import Path
import warnings

# Suppress transformer warnings and progress bars
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TRANSFORMERS_VERBOSITY"] = "error"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
warnings.filterwarnings("ignore")

from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, logging as hf_logging
hf_logging.set_verbosity_error()
hf_logging.disable_progress_bar()

import torch
torch.set_num_threads(4)

MODEL_DIR = Path(os.environ.get("KONVERT_MODEL_DIR", str(Path(__file__).resolve().parent.parent / "models")))

try:
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
    model = AutoModelForSeq2SeqLM.from_pretrained(str(MODEL_DIR))
    model.eval()
    print(json.dumps({"status": "READY"}), flush=True)
except Exception as e:
    print(json.dumps({"status": "ERROR", "error": str(e)}), flush=True)
    sys.exit(1)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req_id = None
    try:
        req = json.loads(line)
        req_id = req.get("id")
        prompt = req.get("prompt", "")

        inputs = tokenizer("translate to CNL: " + prompt, return_tensors="pt")
        with torch.inference_mode():
            outputs = model.generate(
                inputs["input_ids"],
                max_new_tokens=48,
                do_sample=False,
                num_beams=1
            )
        cnl_output = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
        print(json.dumps({"id": req_id, "output": cnl_output, "error": None}), flush=True)
    except Exception as e:
        print(json.dumps({"id": req_id, "output": None, "error": str(e)}), flush=True)
