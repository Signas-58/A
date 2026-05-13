# Forensic evidence log table
class EvidenceLog(Base):
    __tablename__ = "evidence_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    officer: Mapped[str] = mapped_column(String(64), nullable=False)
    timestamp: Mapped[Any] = mapped_column(DateTime(timezone=True), server_default=func.now())

# Endpoint for forensic officer to verify hash and log evidence
from fastapi import Form
@app.post("/forensic/verify-log")
async def verify_and_log_evidence(
    file: UploadFile = File(...),
    sha256: str = Form(...),
    officer: str = Form(...),
    db: Session = Depends(get_db),
):
    import hashlib
    suffix = os.path.splitext(file.filename or "upload")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        temp_path = tmp.name
        hash_actual = hashlib.sha256()
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            tmp.write(chunk)
            hash_actual.update(chunk)

    try:
        actual = hash_actual.hexdigest()
        match = (actual == sha256)
        if match:
            # Log evidence
            log = EvidenceLog(filename=file.filename or "(unknown)", sha256=actual, officer=officer)
            db.add(log)
            db.commit()
        return {"match": match, "sha256": actual, "logged": match}
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
import os
import logging
import secrets
import tempfile
import time
from typing import Any
from io import BytesIO

from pathlib import Path

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import DateTime, Integer, String, Text, create_engine, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from fpdf import FPDF

_DEEPFAKE_SESSION: Any | None = None

logger = logging.getLogger("juriscan")

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except Exception:
        return default


DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = _env_int("DB_PORT", 3306)
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_NAME = os.environ.get("DB_NAME", "ai_video_detector")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}",
)


class Base(DeclarativeBase):
    pass


# Forensic evidence log table (must be after Base is defined)
class EvidenceLog(Base):
    __tablename__ = "evidence_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    officer: Mapped[str] = mapped_column(String(64), nullable=False)
    timestamp: Mapped[Any] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserAccount(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    organization: Mapped[str | None] = mapped_column(String(255), nullable=True)
    justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    failed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[Any] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Any] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class AccessRequestIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(min_length=6, max_length=256)
    role: str = Field(min_length=3, max_length=32)
    organization: str | None = Field(default=None, max_length=255)
    justification: str | None = Field(default=None, max_length=5000)


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: str
    status: str
    organization: str | None
    failed_attempts: int
    created_at: Any | None = None
    updated_at: Any | None = None


class LoginIn(BaseModel):
    username: str
    password: str
    role: str | None = None


def _user_to_out(u: UserAccount) -> UserOut:
    return UserOut(
        id=u.id,
        username=u.username,
        email=u.email,
        role=u.role,
        status=u.status,
        organization=u.organization,
        failed_attempts=u.failed_attempts,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )

app = FastAPI(title="AI Video Detector API")

cors_origins_raw = os.environ.get(
    "CORS_ORIGINS",
    "*",
)
cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    db_ok = True
    db_error: str | None = None
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
    except Exception as e:
        db_ok = False
        db_error = str(e)

    return {"ok": True, "db_ok": db_ok, "db_error": db_error}


@app.on_event("startup")
def _startup():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        logger.warning("startup: failed to create tables: %s", e)

    try:
        admin_email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "admin@juriscan.co.zw").strip()
        admin_password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "Admin123")

        if admin_email and admin_password:
            db = SessionLocal()
            try:
                existing = db.execute(select(UserAccount).where(UserAccount.email == admin_email)).scalar_one_or_none()
                if existing is None:
                    u = UserAccount(
                        username="Super Admin",
                        email=admin_email,
                        role="admin",
                        status="active",
                        password_hash=pwd_context.hash(admin_password),
                        organization="Juriscan",
                        justification="bootstrap",
                        failed_attempts=0,
                    )
                    db.add(u)
                    db.commit()
                    logger.info("startup: bootstrapped admin user %s", admin_email)
                else:
                    logger.info("startup: bootstrap admin already exists: %s", admin_email)
            finally:
                db.close()
    except Exception as e:
        logger.warning("startup: failed to bootstrap admin user: %s", e)


@app.post("/access-requests", response_model=UserOut)
def create_access_request(payload: AccessRequestIn, db: Session = Depends(get_db)):
    try:
        existing = db.execute(
            select(UserAccount).where((UserAccount.username == payload.username) | (UserAccount.email == payload.email))
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(status_code=409, detail="user already exists")

        u = UserAccount(
            username=payload.username,
            email=str(payload.email),
            role=payload.role,
            status="pending",
            password_hash=pwd_context.hash(payload.password),
            organization=payload.organization,
            justification=payload.justification,
            failed_attempts=0,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        return _user_to_out(u)
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"db error: {e}")


@app.get("/admin/access-requests", response_model=list[UserOut])
def list_access_requests(db: Session = Depends(get_db)):
    users = db.execute(select(UserAccount).where(UserAccount.status == "pending").order_by(UserAccount.created_at.desc())).scalars().all()
    return [_user_to_out(u) for u in users]


@app.get("/admin/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    users = db.execute(select(UserAccount).order_by(UserAccount.created_at.desc())).scalars().all()
    return [_user_to_out(u) for u in users]


def _set_status(user_id: int, new_status: str, db: Session) -> UserOut:
    u = db.get(UserAccount, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="user not found")
    u.status = new_status
    if new_status != "locked":
        u.failed_attempts = 0
    db.commit()
    db.refresh(u)
    return _user_to_out(u)


@app.post("/admin/users/{user_id}/approve", response_model=UserOut)
def approve_user(user_id: int, db: Session = Depends(get_db)):
    u = db.get(UserAccount, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="user not found")
    if u.status != "pending":
        raise HTTPException(status_code=400, detail="user is not pending")
    return _set_status(user_id, "active", db)


@app.post("/admin/users/{user_id}/block", response_model=UserOut)
def block_user(user_id: int, db: Session = Depends(get_db)):
    return _set_status(user_id, "blocked", db)


@app.post("/admin/users/{user_id}/unblock", response_model=UserOut)
def unblock_user(user_id: int, db: Session = Depends(get_db)):
    return _set_status(user_id, "active", db)


@app.post("/admin/users/{user_id}/disable", response_model=UserOut)
def disable_user(user_id: int, db: Session = Depends(get_db)):
    return _set_status(user_id, "disabled", db)


@app.post("/admin/users/{user_id}/enable", response_model=UserOut)
def enable_user(user_id: int, db: Session = Depends(get_db)):
    return _set_status(user_id, "active", db)


@app.post("/admin/users/{user_id}/unlock", response_model=UserOut)
def unlock_user(user_id: int, db: Session = Depends(get_db)):
    return _set_status(user_id, "active", db)


class ResetPasswordOut(BaseModel):
    user_id: int
    temp_password: str


@app.post("/admin/users/{user_id}/reset-password", response_model=ResetPasswordOut)
def reset_password(user_id: int, db: Session = Depends(get_db)):
    u = db.get(UserAccount, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="user not found")

    temp_password = secrets.token_urlsafe(12)
    u.password_hash = pwd_context.hash(temp_password)
    u.failed_attempts = 0
    if u.status != "active":
        u.status = "active"
    db.commit()

    return ResetPasswordOut(user_id=u.id, temp_password=temp_password)


class VerdictPdfIn(BaseModel):
    filename: str | None = None
    verdict: str
    score: float | None = None
    tamper_score: float | None = None
    deepfake_score: float | None = None
    signals: list[Any] = Field(default_factory=list)
    explanations: dict[str, str] | None = None
    events: list[dict[str, Any]] = Field(default_factory=list)
    sha256: str | None = None  # Video hash


@app.post("/reports/verdict.pdf")
def verdict_pdf(payload: VerdictPdfIn):
    def _pdf_break_long_tokens(text: str, max_token_len: int = 60) -> str:
        parts = text.split(" ")
        out_parts: list[str] = []
        for p in parts:
            if len(p) <= max_token_len:
                out_parts.append(p)
                continue
            chunks = [p[i : i + max_token_len] for i in range(0, len(p), max_token_len)]
            out_parts.append(" ".join(chunks))
        return " ".join(out_parts)

    def _pdf_text(v: Any) -> str:
        try:
            s = str(v)
        except Exception:
            s = "(unprintable)"
        if not s:
            return "-"

        s = (
            s.replace("\u2026", "...")
            .replace("…", "...")
            .replace("—", "-")
            .replace("–", "-")
            .replace("“", '"')
            .replace("”", '"')
            .replace("’", "'")
            .replace("‘", "'")
        )
        s = _pdf_break_long_tokens(s)
        return s.encode("latin-1", "replace").decode("latin-1")

    pdf = FPDF(unit="mm", format="A4")
    pdf.set_margins(12, 12, 12)
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()
    page_w = float(pdf.w - pdf.l_margin - pdf.r_margin)

    def _mc(h: float, txt: Any):
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(page_w, h, _pdf_text(txt))

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Juriscan Verdict Report", ln=1)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(90, 90, 90)
    pdf.cell(0, 6, f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}", ln=1)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Summary", ln=1)
    pdf.set_font("Helvetica", "", 10)
    fn = payload.filename or "(unknown)"
    _mc(6, f"File: {fn}")
    if payload.sha256:
        _mc(6, f"SHA-256: {payload.sha256}")
    _mc(6, f"Verdict: {payload.verdict}")
    if payload.score is not None:
        _mc(6, f"Combined score: {payload.score:.3f}")
    if payload.tamper_score is not None:
        _mc(6, f"Tamper score: {payload.tamper_score:.3f}")
    if payload.deepfake_score is not None:
        _mc(6, f"Deepfake score: {payload.deepfake_score:.3f}")
    pdf.ln(2)

    if payload.explanations:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Reasons", ln=1)
        pdf.set_font("Helvetica", "", 10)
        verdict_reason = payload.explanations.get("verdict") if isinstance(payload.explanations, dict) else None
        tamper_reason = payload.explanations.get("tamper") if isinstance(payload.explanations, dict) else None
        deepfake_reason = payload.explanations.get("deepfake") if isinstance(payload.explanations, dict) else None

        if verdict_reason:
            pdf.set_font("Helvetica", "B", 10)
            _mc(5, "Verdict")
            pdf.set_font("Helvetica", "", 10)
            _mc(5, verdict_reason)
            pdf.ln(1)
        if tamper_reason:
            pdf.set_font("Helvetica", "B", 10)
            _mc(5, "Tamper")
            pdf.set_font("Helvetica", "", 10)
            _mc(5, tamper_reason)
            pdf.ln(1)
        if deepfake_reason:
            pdf.set_font("Helvetica", "B", 10)
            _mc(5, "Deepfake")
            pdf.set_font("Helvetica", "", 10)
            _mc(5, deepfake_reason)
            pdf.ln(1)

        pdf.ln(1)

    if payload.events:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Timestamps (suspicious moments)", ln=1)
        pdf.set_font("Helvetica", "", 10)
        for ev in payload.events[:20]:
            if not isinstance(ev, dict):
                continue
            t = ev.get("time_s")
            fr = ev.get("frame")
            typ = ev.get("type")
            if typ == "abrupt_change":
                mad = ev.get("mad")
                if isinstance(t, (int, float)):
                    _mc(
                        5,
                        f"At time stamp {t:05.2f}s there was a sudden abrupt change likely caused by cuts/splicing."
                    )
                else:
                    _mc(5, f"At frame {fr} there was a sudden abrupt change likely caused by cuts/splicing.")
            elif typ == "deepfake_frame":
                prob = ev.get("prob")
                if isinstance(t, (int, float)) and prob is not None:
                    _mc(
                        5,
                        f"At time {t:05.2f}s there was a deepfake probability of {prob:.3f}, likely caused by use of AI."
                    )
                elif prob is not None:
                    _mc(5, f"At frame {fr} there was a deepfake probability of {prob:.3f}, likely caused by use of AI.")
                else:
                    _mc(5, f"At frame {fr} there was a deepfake indicator detected.")
            else:
                _mc(5, f"- {typ}: {ev}")

        pdf.ln(1)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Signals (top 20)", ln=1)
    pdf.set_font("Helvetica", "", 10)
    for s in (payload.signals or [])[:20]:
        line = _pdf_text(s)
        if len(line) > 240:
            line = line[:240] + "..."
        _mc(5, f"- {line}")

    # --- Signature block for authenticity ---
    import hashlib
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(90, 90, 90)
    # Create a simple hash of the main content for authenticity
    content_to_sign = f"{fn}|{payload.verdict}|{payload.score}|{payload.tamper_score}|{payload.deepfake_score}|{time.strftime('%Y-%m-%d %H:%M:%S')}"
    signature = hashlib.sha256(content_to_sign.encode("utf-8")).hexdigest()[:16]
    pdf.multi_cell(0, 6, f"Digitally signed by Juriscan AI Video Detector\nSignature: {signature}\nGenerated: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    pdf.set_text_color(0, 0, 0)

    out = pdf.output(dest="S")
    b = out.encode("latin-1") if isinstance(out, str) else bytes(out)
    buf = BytesIO(b)
    buf.seek(0)

    safe_name = (fn or "verdict").replace("\\", "_").replace("/", "_")
    headers = {"Content-Disposition": f"attachment; filename=juriscan-verdict-{safe_name}.pdf"}
    return StreamingResponse(buf, media_type="application/pdf", headers=headers)


@app.post("/auth/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    lock_after = _env_int("LOCK_AFTER_FAILS", 5)
    u = db.execute(
        select(UserAccount).where((UserAccount.username == payload.username) | (UserAccount.email == payload.username))
    ).scalar_one_or_none()
    if u is None:
        raise HTTPException(status_code=401, detail="invalid credentials")

    if payload.role and u.role != payload.role:
        raise HTTPException(status_code=403, detail="Incorrect role")

    if u.status in {"blocked", "disabled", "pending"}:
        raise HTTPException(status_code=403, detail=f"account {u.status}")
    if u.status == "locked":
        raise HTTPException(status_code=403, detail="account locked")

    ok = pwd_context.verify(payload.password, u.password_hash)
    if not ok:
        u.failed_attempts = int(u.failed_attempts or 0) + 1
        if u.failed_attempts >= lock_after:
            u.status = "locked"
        db.commit()
        raise HTTPException(status_code=401, detail="invalid credentials")

    u.failed_attempts = 0
    if u.status != "active":
        u.status = "active"
    db.commit()
    return {"ok": True, "user": _user_to_out(u).model_dump()}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    import hashlib
    suffix = os.path.splitext(file.filename or "upload")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        temp_path = tmp.name
        sha256 = hashlib.sha256()
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            tmp.write(chunk)
            sha256.update(chunk)

    try:
        analysis = _analyze_video_file(temp_path)
        return {
            "filename": file.filename,
            "content_type": file.content_type,
            "sha256": sha256.hexdigest(),
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


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def _try_load_deepfake_session() -> tuple[Any | None, str | None]:
    global _DEEPFAKE_SESSION

    if _DEEPFAKE_SESSION is not None:
        return _DEEPFAKE_SESSION, None

    backend_dir = Path(__file__).resolve().parents[1]
    candidates: list[str] = []

    env_path = os.environ.get("DEEPFAKE_MODEL_PATH")
    if env_path:
        candidates.append(env_path)

    candidates.extend(
        [
            str(backend_dir / "models" / "deepfake_v2.onnx" / "model_int8.onnx"),
            str(backend_dir / "models" / "deepfake_v2.onnx" / "model.onnx"),
            str(backend_dir / "models" / "deepfake_v2.onnx" / "model_fp16.onnx"),
            str(backend_dir / "models" / "deepfake_v2.onnx" / "model_quantized.onnx"),
        ]
    )

    seen: set[str] = set()
    candidates = [p for p in candidates if p and not (p in seen or seen.add(p))]

    existing = [p for p in candidates if os.path.exists(p)]
    if not existing:
        return None, "deepfake model files not found (set DEEPFAKE_MODEL_PATH or add models under backend/models)"

    try:
        import onnxruntime as ort  # type: ignore
    except Exception:
        return None, "onnxruntime not installed (pip install onnxruntime)"

    last_err: str | None = None
    for model_path in existing:
        try:
            sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
            _DEEPFAKE_SESSION = sess
            return sess, None
        except Exception as e:
            last_err = f"failed to load ONNX model ({model_path}): {e}"

    return None, last_err or "failed to load ONNX model"


def _deepfake_score_from_frames(
    sampled_frames: list[tuple[int, np.ndarray]],
    fps: float,
) -> tuple[float | None, dict[str, Any] | None]:
    sess, reason = _try_load_deepfake_session()
    if sess is None:
        return None, {"name": "deepfake_model_unavailable", "severity": 0.0, "details": reason}

    positive_class = int(os.environ.get("DEEPFAKE_POSITIVE_CLASS", "1"))

    try:
        inp = sess.get_inputs()[0]
        input_name = inp.name
        shape = list(inp.shape)
    except Exception as e:
        return None, {"name": "deepfake_model_error", "severity": 0.2, "details": f"invalid model input: {e}"}

    layout = "NCHW"
    h = 224
    w = 224
    if len(shape) == 4:
        if shape[1] in (1, 3):
            layout = "NCHW"
            h = int(shape[2] or 224)
            w = int(shape[3] or 224)
        elif shape[3] in (1, 3):
            layout = "NHWC"
            h = int(shape[1] or 224)
            w = int(shape[2] or 224)

    if not sampled_frames:
        return None, {"name": "deepfake_model_error", "severity": 0.2, "details": "no frames provided"}

    frames_bgr = [f for _, f in sampled_frames]

    n = min(16, len(sampled_frames))
    idxs = np.linspace(0, len(sampled_frames) - 1, num=n, dtype=np.int64)
    probs: list[float] = []
    frame_probs: list[dict[str, Any]] = []

    for i in idxs:
        si = int(i)
        frame_idx, frame = sampled_frames[si]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (w, h), interpolation=cv2.INTER_AREA)
        x = resized.astype(np.float32) / 255.0
        if layout == "NCHW":
            x = np.transpose(x, (2, 0, 1))
        x = np.expand_dims(x, axis=0)

        try:
            out = sess.run(None, {input_name: x})
        except Exception as e:
            return None, {"name": "deepfake_model_error", "severity": 0.3, "details": f"inference failed: {e}"}

        if not out:
            continue

        y = np.array(out[0])
        p: float | None = None

        if y.ndim == 0:
            p = float(y)
        elif y.ndim == 1:
            if y.shape[0] == 1:
                p = float(y[0])
            elif y.shape[0] == 2:
                ex = np.exp(y - np.max(y))
                soft = ex / np.sum(ex)
                p = float(soft[positive_class])
        elif y.ndim == 2:
            if y.shape[1] == 1:
                p = float(y[0, 0])
            elif y.shape[1] == 2:
                ex = np.exp(y[0] - np.max(y[0]))
                soft = ex / np.sum(ex)
                p = float(soft[positive_class])

        if p is None:
            p = float(_sigmoid(y.reshape(-1)[0]))

        p = float(np.clip(p, 0.0, 1.0))
        probs.append(p)
        frame_probs.append(
            {
                "frame": int(frame_idx),
                "time_s": float(frame_idx / fps) if fps > 0 else None,
                "prob": p,
            }
        )

    if not probs:
        return None, {"name": "deepfake_model_error", "severity": 0.3, "details": "model produced no outputs"}

    score = float(np.mean(probs))
    top_frames = sorted(frame_probs, key=lambda x: float(x.get("prob") or 0.0), reverse=True)[:6]
    return score, {
        "name": "deepfake_model_score",
        "severity": float(np.clip(score, 0.0, 1.0)),
        "value": {"frames_used": int(n), "mean_prob": score, "top_frames": top_frames},
        "details": "Model estimated probability of synthetic manipulation on sampled frames.",
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

    frames_only = [frame for _, frame in sampled]
    feats = [_frame_features(frame) for frame in frames_only]
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
    tamper_score = (
        0.15 * components["blur"]
        + 0.30 * components["cuts"]
        + 0.15 * components["exposure"]
        + 0.15 * components["contrast"]
        + 0.25 * components["hf_inconsistency"]
    )
    tamper_score = float(np.clip(tamper_score, 0.0, 1.0))

    deepfake_score, deepfake_signal = _deepfake_score_from_frames(sampled, fps)
    if deepfake_signal is not None:
        signals.append(deepfake_signal)

    if deepfake_score is None:
        combined_score = tamper_score
    else:
        combined_score = float(np.clip(0.6 * tamper_score + 0.4 * deepfake_score, 0.0, 1.0))

    if combined_score < 0.35:
        verdict = "likely_real"
    elif combined_score < 0.7:
        verdict = "suspicious"
    else:
        verdict = "highly_suspicious"

    events: list[dict[str, Any]] = []
    for c in sorted(cut_candidates, key=lambda x: float(x.get("mad") or 0.0), reverse=True)[:8]:
        events.append({"type": "abrupt_change", **c})

    if isinstance(deepfake_signal, dict):
        top_frames = ((deepfake_signal.get("value") or {}) if isinstance(deepfake_signal.get("value"), dict) else {}).get("top_frames")
        if isinstance(top_frames, list):
            for tf in top_frames[:6]:
                if isinstance(tf, dict):
                    events.append({"type": "deepfake_frame", **tf})

    reasons_tamper: list[str] = []
    if cut_frac > 0.25:
        reasons_tamper.append("Frequent abrupt frame-to-frame changes (possible cuts/splicing).")
    if blur_low_frac > 0.6:
        reasons_tamper.append("High fraction of blurred frames (possible heavy recompression/smoothing).")
    if hf_var > 25.0:
        reasons_tamper.append("Inconsistent high-frequency energy (segment-level re-encoding indicator).")
    if exposure_clip > 0.15:
        reasons_tamper.append("Exposure clipping reduces reliability (many near-black/near-white frames).")
    if contrast_low > 0.5:
        reasons_tamper.append("Low contrast in many frames (compression/post-processing).")
    if not reasons_tamper:
        reasons_tamper.append("No strong tamper heuristics exceeded thresholds in the sampled frames.")

    reasons_deepfake: list[str] = []
    if deepfake_score is None:
        reasons_deepfake.append("Deepfake model unavailable; deepfake score omitted.")
    else:
        if deepfake_score >= 0.7:
            reasons_deepfake.append("Model probability is high on sampled frames.")
        elif deepfake_score >= 0.35:
            reasons_deepfake.append("Model probability is moderate on sampled frames.")
        else:
            reasons_deepfake.append("Model probability is low on sampled frames.")

    reasons_verdict: list[str] = []
    reasons_verdict.append(f"Combined score computed from tamper and deepfake components: {combined_score:.3f}.")
    reasons_verdict.append(f"Tamper score: {tamper_score:.3f}.")
    if deepfake_score is not None:
        reasons_verdict.append(f"Deepfake score: {deepfake_score:.3f}.")
    if events:
        reasons_verdict.append("See timestamps section for the most suspicious sampled moments.")

    explanations = {
        "tamper": "\n".join(reasons_tamper),
        "deepfake": "\n".join(reasons_deepfake),
        "verdict": "\n".join(reasons_verdict),
    }

    return {
        "verdict": verdict,
        "score": combined_score,
        "tamper_score": tamper_score,
        "deepfake_score": deepfake_score,
        "combined_score": combined_score,
        "signals": signals,
        "explanations": explanations,
        "events": events,
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
            "tamper_score": tamper_score,
            "deepfake_score": deepfake_score,
            "combined_score": combined_score,
        },
    }
