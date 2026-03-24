import os
import tempfile
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AI Video Detector API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "upload")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        temp_path = tmp.name
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            tmp.write(chunk)

    try:
        analysis = _analyze_video_file(temp_path)
        return {
            "filename": file.filename,
            "content_type": file.content_type,
            **analysis,
        }
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


def _sample_frames(cap: cv2.VideoCapture, frame_count: int, max_frames: int) -> list[tuple[int, np.ndarray]]:
    if frame_count <= 0:
        return []

    n = max(1, min(max_frames, frame_count))
    indices = np.linspace(0, frame_count - 1, num=n, dtype=np.int64)
    out: list[tuple[int, np.ndarray]] = []

    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, frame_bgr = cap.read()
        if not ok or frame_bgr is None:
            continue
        out.append((int(idx), frame_bgr))

    return out


def _frame_features(frame_bgr: np.ndarray) -> dict[str, float]:
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    gray_f = gray.astype(np.float32)

    blur = cv2.Laplacian(gray_f, cv2.CV_32F).var()
    mean = float(gray_f.mean())
    std = float(gray_f.std())

    lap = cv2.Laplacian(gray_f, cv2.CV_32F)
    hf_energy = float(np.mean(np.abs(lap)))

    return {
        "blur": float(blur),
        "mean": mean,
        "std": std,
        "hf_energy": hf_energy,
    }


def _analyze_video_file(path: str) -> dict[str, Any]:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return {
            "verdict": "unknown",
            "score": None,
            "signals": [
                {
                    "name": "video_open_failed",
                    "severity": 1.0,
                    "details": "OpenCV could not open the video. It may be corrupted or use an unsupported codec.",
                }
            ],
        }

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration_s = float(frame_count / fps) if fps > 0 and frame_count > 0 else None

    sampled = _sample_frames(cap, frame_count=frame_count, max_frames=60)
    cap.release()

    signals: list[dict[str, Any]] = []
    signals.append(
        {
            "name": "basic_metadata",
            "severity": 0.0,
            "value": {
                "fps": fps,
                "frame_count": frame_count,
                "width": width,
                "height": height,
                "duration_s": duration_s,
            },
        }
    )

    if frame_count <= 0 or fps <= 0 or width <= 0 or height <= 0 or not sampled:
        signals.append(
            {
                "name": "metadata_incomplete",
                "severity": 0.8,
                "details": "Video metadata is missing or frames could not be sampled reliably.",
            }
        )
        return {
            "verdict": "unknown",
            "score": 0.8,
            "signals": signals,
        }

    feats = [_frame_features(frame) for _, frame in sampled]
    blurs = np.array([f["blur"] for f in feats], dtype=np.float32)
    hf = np.array([f["hf_energy"] for f in feats], dtype=np.float32)
    means = np.array([f["mean"] for f in feats], dtype=np.float32)
    stds = np.array([f["std"] for f in feats], dtype=np.float32)

    # Continuous metrics used for scoring (these are always computed)
    blur_med = float(np.median(blurs))
    blur_low_frac = float(np.mean(blurs < 40.0))
    exposure_clip = float(np.mean((means < 8.0) | (means > 247.0)))
    contrast_low = float(np.mean(stds < 20.0))
    hf_var = float(np.std(hf)) if len(hf) > 1 else 0.0

    if np.isfinite(blurs).all() and blur_low_frac > 0.6:
        signals.append(
            {
                "name": "high_blur_fraction",
                "severity": min(1.0, (blur_low_frac - 0.6) / 0.4),
                "value": {"median_blur": blur_med, "low_blur_fraction": blur_low_frac},
                "details": "Large portions of the video look heavily blurred; heavy recompression or smoothing can be a tamper signal.",
            }
        )

    jump_scores: list[float] = []
    cut_candidates: list[dict[str, Any]] = []
    prev_gray: np.ndarray | None = None
    prev_idx: int | None = None

    p95 = 0.0
    cut_frac = 0.0

    for (idx, frame_bgr) in sampled:
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
        if prev_gray is not None and prev_idx is not None:
            mad = float(np.mean(np.abs(gray - prev_gray)))
            jump_scores.append(mad)
            if mad > 35.0:
                t = float(idx / fps) if fps > 0 else None
                cut_candidates.append({"frame": idx, "time_s": t, "mad": mad})
        prev_gray = gray
        prev_idx = idx

    if jump_scores:
        jump_arr = np.array(jump_scores, dtype=np.float32)
        p95 = float(np.percentile(jump_arr, 95))
        cut_frac = float(np.mean(jump_arr > 35.0))
        if cut_frac > 0.25:
            signals.append(
                {
                    "name": "frequent_abrupt_changes",
                    "severity": min(1.0, (cut_frac - 0.25) / 0.5),
                    "value": {"p95_mad": p95, "cut_fraction": cut_frac, "examples": cut_candidates[:8]},
                    "details": "Many large frame-to-frame changes were detected. This can indicate splicing/cuts or aggressive editing.",
                }
            )

    if exposure_clip > 0.15:
        signals.append(
            {
                "name": "exposure_clipping",
                "severity": min(1.0, (exposure_clip - 0.15) / 0.5),
                "value": {"clipped_fraction": exposure_clip},
                "details": "A significant fraction of sampled frames appear near-black/near-white. This can reduce detector reliability.",
            }
        )

    if contrast_low > 0.5:
        signals.append(
            {
                "name": "low_contrast",
                "severity": min(1.0, (contrast_low - 0.5) / 0.5),
                "value": {"low_contrast_fraction": contrast_low},
                "details": "Many sampled frames are low contrast; this can be due to heavy compression or post-processing.",
            }
        )

    if hf_var > 25.0:
        signals.append(
            {
                "name": "inconsistent_high_frequency",
                "severity": min(1.0, (hf_var - 25.0) / 50.0),
                "value": {"hf_energy_std": hf_var},
                "details": "High-frequency energy varies significantly across frames, which can correlate with segment-level re-encoding.",
            }
        )

    # Continuous component scores (0..1). These ensure score rarely sticks at exactly 0.
    # Each component ramps up over a range rather than acting as a hard threshold.
    blur_component = float(np.clip(blur_low_frac / 0.6, 0.0, 1.0))
    cuts_component = float(np.clip(cut_frac / 0.25, 0.0, 1.0))
    exposure_component = float(np.clip(exposure_clip / 0.15, 0.0, 1.0))
    contrast_component = float(np.clip(contrast_low / 0.5, 0.0, 1.0))
    hf_component = float(np.clip(hf_var / 25.0, 0.0, 1.0))

    components = {
        "blur": blur_component,
        "cuts": cuts_component,
        "exposure": exposure_component,
        "contrast": contrast_component,
        "hf_inconsistency": hf_component,
    }

    # Weighted average. Cuts and HF inconsistency tend to be stronger tamper hints.
    score = (
        0.15 * components["blur"]
        + 0.30 * components["cuts"]
        + 0.15 * components["exposure"]
        + 0.15 * components["contrast"]
        + 0.25 * components["hf_inconsistency"]
    )
    score = float(np.clip(score, 0.0, 1.0))

    if score < 0.35:
        verdict = "likely_real"
    elif score < 0.7:
        verdict = "suspicious"
    else:
        verdict = "highly_suspicious"

    return {
        "verdict": verdict,
        "score": score,
        "signals": signals,
        "metrics": {
            "fps": fps,
            "frame_count": frame_count,
            "duration_s": duration_s,
            "width": width,
            "height": height,
            "blur_median": blur_med,
            "blur_low_fraction": blur_low_frac,
            "cut_fraction": cut_frac,
            "p95_frame_mad": p95,
            "exposure_clipped_fraction": exposure_clip,
            "low_contrast_fraction": contrast_low,
            "hf_energy_std": hf_var,
            "components": components,
        },
    }
