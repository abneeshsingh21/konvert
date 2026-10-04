import os
import sys
import requests
from kaggle.api.kaggle_api_extended import KaggleApi

api = KaggleApi()
api.authenticate()

ApiListKernelSessionOutputRequest = getattr(sys.modules[KaggleApi.__module__], 'ApiListKernelSessionOutputRequest')

print("Authenticating and querying kernel output...")
with api.build_kaggle_client() as kaggle_client:
    request = ApiListKernelSessionOutputRequest()
    request.user_name = "abneeshsingh"
    request.kernel_slug = "intentengine-t4-training"
    response = kaggle_client.kernels.kernels_api_client.list_kernel_session_output(request)

os.makedirs("models_v6", exist_ok=True)

if response.log:
    print(f"Kernel log size: {len(response.log)} characters")
    with open("models_v6/kernel.log", "w", encoding="utf-8") as f:
        f.write(response.log)
    print("Saved models_v6/kernel.log")

print(f"Number of output files: {len(response.files)}")
for item in response.files:
    outfile = os.path.join("models_v6", item.file_name)
    print(f"Downloading {item.file_name} to {outfile}...")
    resp = requests.get(item.url, stream=True)
    resp.raise_for_status()
    total_size = int(resp.headers.get('content-length', 0))
    print(f"Total size: {total_size / (1024*1024):.2f} MB")
    
    downloaded = 0
    with open(outfile, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1024*1024):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                sys.stdout.write(f"\r  {downloaded / (1024*1024):.1f} / {total_size / (1024*1024):.1f} MB ({downloaded*100/max(1, total_size):.1f}%)")
                sys.stdout.flush()
    print("\n  Done!")

print("All downloads finished successfully!")
