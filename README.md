TISATI TAENDA KURE, CHANGE PESE PAKANZI TSAKANE TO YOUR PATH


# AI Video Detector (MVP)

This repo contains a simple web app for uploading a video and running a CPU-friendly analysis to surface basic signals that may correlate with heavy editing/tampering.

## Structure

- `backend/`: FastAPI service (`/health`, `/analyze`)
- `web/`: Next.js UI (uploads directly to the backend)

## Requirements

### Windows (local)

- Node.js (includes `npm`)
- Python 3.12+

### GitHub Codespaces

- Node.js + Python are available by default in most Codespaces.

## Run locally

### Backend

```powershell
cd C:\Users\Tsakane\Projects\ai-video-detector
python -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Optional: Deepfake model (ONNX)

The backend can optionally add a model-based `deepfake_score` (frame-based) using ONNX Runtime.

Recommended model:

- https://huggingface.co/onnx-community/Deep-Fake-Detector-v2-Model-ONNX

Download one of the `.onnx` files from the model repo (in the `onnx/` folder). For CPU compatibility, start with:

- `model.onnx` (recommended)

Some quantized models (e.g. `model_int8.onnx`) may fail on certain ONNX Runtime builds with errors like `ConvInteger ... NOT_IMPLEMENTED`.

Place the downloaded file here (folders are local-only and ignored by git):

- `backend/models/deepfake_v2.onnx/model.onnx`

Then start the backend in one of these ways:

1) Auto-detect (no env vars needed)

If you keep the default path above, the backend will attempt to auto-detect and load the model.

2) Explicit path (recommended if you rename the file)

```powershell
$env:DEEPFAKE_MODEL_PATH = "C:\Users\Tsakane\Projects\ai-video-detector\backend\models\deepfake_v2.onnx\model.onnx"
$env:DEEPFAKE_POSITIVE_CLASS = "1"
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

If your deepfake predictions look inverted, set:

```powershell
$env:DEEPFAKE_POSITIVE_CLASS = "0"
```

### Frontend

```powershell
cd C:\Users\Tsakane\Projects\ai-video-detector\web
npm install
npm run dev
```

Open:

- Frontend: http://localhost:3000
- Backend: http://127.0.0.1:8000/health

## Notes

- This is an MVP heuristic analyzer (not a definitive deepfake detector).
- Do not commit `node_modules` or `backend/.venv` (root `.gitignore` is included).
