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
cd C:\Users\Munashe\CascadeProjects\ai-video-detector
python -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend

```powershell
cd C:\Users\Munashe\CascadeProjects\ai-video-detector\web
npm install
npm run dev
```

Open:

- Frontend: http://localhost:3000
- Backend: http://127.0.0.1:8000/health

## Notes

- This is an MVP heuristic analyzer (not a definitive deepfake detector).
- Do not commit `node_modules` or `backend/.venv` (root `.gitignore` is included).
