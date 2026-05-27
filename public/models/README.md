# Real-ESRGAN ONNX model

- **File:** `realesrgan-x4.onnx` (~4.9 MB)
- **Architecture:** Real-ESRGAN-General-x4v3 (128×128 tiles → 512×512 at 4×)
- **Served from:** same origin as the app (`/models/realesrgan-x4.onnx`) so browsers never hit Hugging Face CORS/auth at runtime.

## Regenerate

```bash
node scripts/download-esrgan-model.js
```

Build runs this automatically if the file is missing.

## Upstream

[qualcomm/Real-ESRGAN-General-x4v3](https://huggingface.co/qualcomm/Real-ESRGAN-General-x4v3) on Hugging Face (public resolve URL, build-time download only).

The original Xenova `real-esrgan-x4` repo now returns **HTTP 401** for anonymous fetches and does not allow cross-origin browser access.
