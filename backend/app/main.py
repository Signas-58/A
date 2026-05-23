import hashlib
import os
import logging
import secrets
import tempfile
import time
from typing import Any
from datetime import datetime
from io import BytesIO

from pathlib import Path

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import DateTime, Integer, LargeBinary, String, Text, create_engine, func, select
from typing import List, Optional
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


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_number: Mapped[str] = mapped_column(String(64), nullable=False)
    investigator_id: Mapped[int] = mapped_column(Integer, nullable=False)
    prosecutor_id: Mapped[int] = mapped_column(Integer, nullable=False)
    custodian_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pdf_blob: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    pdf_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    verdict: Mapped[str | None] = mapped_column(String(128), nullable=True)
    filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    score: Mapped[float | None] = mapped_column(nullable=True)
    report_status: Mapped[str] = mapped_column(String(64), nullable=False, default="forwarded_to_prosecutor")
    override_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    override_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_blob: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    video_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    video_content_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[Any] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Disclosure(Base):
    __tablename__ = "disclosures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    docket_number: Mapped[str] = mapped_column(String(64), nullable=False)
    report_id: Mapped[int] = mapped_column(Integer, nullable=False)
    prosecutor_id: Mapped[int] = mapped_column(Integer, nullable=False)
    clerk_id: Mapped[int] = mapped_column(Integer, nullable=False)
    judge_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assessment: Mapped[str] = mapped_column(Text, nullable=False)
    judge_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    court_date: Mapped[str] = mapped_column(String(64), nullable=False)
    docket_pdf_blob: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    docket_pdf_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    created_at: Mapped[Any] = mapped_column(DateTime(timezone=True), server_default=func.now())


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
        logger.info("startup: tables created/verified OK")
    except Exception as e:
        logger.warning("startup: failed to create tables: %s", e)

    # Migration: if reports.pdf_blob was created as TEXT instead of LONGBLOB, fix it.
    try:
        with engine.connect() as conn:
            row = conn.exec_driver_sql(
                "SELECT DATA_TYPE FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() "
                "AND TABLE_NAME = 'reports' "
                "AND COLUMN_NAME = 'pdf_blob'"
            ).fetchone()
            if row is not None:
                col_type = str(row[0]).lower()
                if col_type in ("text", "mediumtext", "tinytext", "varchar"):
                    logger.warning(
                        "startup: reports.pdf_blob is %s — migrating to LONGBLOB", col_type
                    )
                    conn.exec_driver_sql(
                        "ALTER TABLE reports MODIFY COLUMN pdf_blob LONGBLOB NOT NULL"
                    )
                    conn.commit()
                    logger.info("startup: reports.pdf_blob migrated to LONGBLOB OK")
                else:
                    logger.info("startup: reports.pdf_blob type is %s — OK", col_type)
    except Exception as e:
        logger.warning("startup: pdf_blob migration check failed: %s", e)

    # Migration: add missing columns to reports if needed
    try:
        with engine.connect() as conn:
            existing = {row[0] for row in conn.exec_driver_sql(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'"
            ).fetchall()}
            if "verdict" not in existing:
                conn.exec_driver_sql("ALTER TABLE reports ADD COLUMN verdict VARCHAR(128) NULL")
                logger.info("startup: added reports.verdict column")
            if "filename" not in existing:
                conn.exec_driver_sql("ALTER TABLE reports ADD COLUMN filename VARCHAR(512) NULL")
                logger.info("startup: added reports.filename column")
            conn.commit()
    except Exception as e:
        logger.warning("startup: reports column migration failed: %s", e)

    # Migration: add triage + override columns to reports if needed
    try:
        with engine.connect() as conn:
            existing = {row[0] for row in conn.exec_driver_sql(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'"
            ).fetchall()}
            migrations = {
                "custodian_id":       "ALTER TABLE reports ADD COLUMN custodian_id INT NULL",
                "score":              "ALTER TABLE reports ADD COLUMN score FLOAT NULL",
                "report_status":      "ALTER TABLE reports ADD COLUMN report_status VARCHAR(64) NOT NULL DEFAULT 'forwarded_to_prosecutor'",
                "override_by":        "ALTER TABLE reports ADD COLUMN override_by INT NULL",
                "override_notes":     "ALTER TABLE reports ADD COLUMN override_notes TEXT NULL",
                "video_blob":         "ALTER TABLE reports ADD COLUMN video_blob LONGBLOB NULL",
                "video_filename":     "ALTER TABLE reports ADD COLUMN video_filename VARCHAR(512) NULL",
                "video_content_type": "ALTER TABLE reports ADD COLUMN video_content_type VARCHAR(64) NULL",
            }
            for col, sql in migrations.items():
                if col not in existing:
                    conn.exec_driver_sql(sql)
                    logger.info("startup: added reports.%s column", col)
            conn.commit()
    except Exception as e:
        logger.warning("startup: reports triage migration failed: %s", e)

    # Migration: add missing columns to disclosures if needed
    try:
        with engine.connect() as conn:
            existing = {row[0] for row in conn.exec_driver_sql(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'disclosures'"
            ).fetchall()}
            if "judge_id" not in existing:
                conn.exec_driver_sql("ALTER TABLE disclosures ADD COLUMN judge_id INT NULL")
                logger.info("startup: added disclosures.judge_id column")
            if "judge_notes" not in existing:
                conn.exec_driver_sql("ALTER TABLE disclosures ADD COLUMN judge_notes TEXT NULL")
                logger.info("startup: added disclosures.judge_notes column")
            conn.commit()
    except Exception as e:
        logger.warning("startup: disclosures column migration failed: %s", e)

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

class ForwardReportIn(BaseModel):
    # case_number is now optional — generated server-side if omitted
    case_number: str | None = None
    investigator_id: int
    prosecutor_id: int | None = None
    filename: str | None = None
    verdict: str
    score: float | None = None
    tamper_score: float | None = None
    deepfake_score: float | None = None
    signals: list[Any] = Field(default_factory=list)
    explanations: dict[str, str] | None = None
    events: list[dict[str, Any]] = Field(default_factory=list)


def _pdf_text(v: Any) -> str:
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


def _build_pdf_bytes(payload: VerdictPdfIn) -> bytes:
    """Render the verdict PDF and return raw bytes."""
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
        def _format_event(ev: dict) -> str:
            t = ev.get("time_s")
            fr = ev.get("frame")
            typ = ev.get("type")
            if typ == "abrupt_change":
                mad = ev.get("mad")
                if isinstance(t, (int, float)):
                    return f"Abrupt change detected at {t:.2f}s (frame {fr}) with MAD={mad:.1f}, suggesting possible tampering."
                return f"Abrupt change detected at frame {fr} with MAD={mad:.1f}, suggesting possible tampering."
            if typ == "deepfake_frame":
                prob = ev.get("prob")
                if isinstance(t, (int, float)):
                    return f"Deepfake probability of {prob:.3f} observed at {t:.2f}s (frame {fr})."
                return f"Deepfake probability of {prob:.3f} observed at frame {fr}."
            return f"Event type {typ} at frame {fr}."
        for ev in payload.events[:20]:
            if not isinstance(ev, dict):
                continue
            line = _format_event(ev)
            _mc(5, f"- {line}")

        pdf.ln(1)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Signals (top 20)", ln=1)
    pdf.set_font("Helvetica", "", 10)
    for s in (payload.signals or [])[:20]:
        line = _pdf_text(s)
        if len(line) > 240:
            line = line[:240] + "..."
        _mc(5, f"- {line}")

    out = pdf.output(dest="S")
    return out.encode("latin-1", "replace") if isinstance(out, str) else bytes(out)


@app.post("/reports/verdict.pdf")
def verdict_pdf(payload: VerdictPdfIn):
    b = _build_pdf_bytes(payload)
    fn = payload.filename or "verdict"
    buf = BytesIO(b)
    buf.seek(0)
    safe_name = fn.replace("\\", "_").replace("/", "_")
    headers = {"Content-Disposition": f"attachment; filename=juriscan-verdict-{safe_name}.pdf"}
    return StreamingResponse(buf, media_type="application/pdf", headers=headers)


@app.get("/users/prosecutors", response_model=list[UserOut])
def list_prosecutors(db: Session = Depends(get_db)):
    """Return all active prosecutor accounts so the investigator can pick one."""
    users = db.execute(
        select(UserAccount)
        .where(UserAccount.role == "prosecutor", UserAccount.status == "active")
        .order_by(UserAccount.username)
    ).scalars().all()
    return [_user_to_out(u) for u in users]


@app.get("/users/clerks", response_model=list[UserOut])
def list_clerks(db: Session = Depends(get_db)):
    """Return all active clerk accounts so the prosecutor can pick one."""
    users = db.execute(
        select(UserAccount)
        .where(UserAccount.role == "clerk", UserAccount.status == "active")
        .order_by(UserAccount.username)
    ).scalars().all()
    return [_user_to_out(u) for u in users]


@app.get("/users/custodians", response_model=list[UserOut])
def list_custodians(db: Session = Depends(get_db)):
    """Return all active forensic officer (custodian) accounts."""
    users = db.execute(
        select(UserAccount)
        .where(UserAccount.role == "custodian", UserAccount.status == "active")
        .order_by(UserAccount.username)
    ).scalars().all()
    return [_user_to_out(u) for u in users]


@app.get("/users/judges", response_model=list[UserOut])
def list_judges(db: Session = Depends(get_db)):
    """Return all active judge accounts so the clerk can assign one."""
    users = db.execute(
        select(UserAccount)
        .where(UserAccount.role == "judge", UserAccount.status == "active")
        .order_by(UserAccount.username)
    ).scalars().all()
    return [_user_to_out(u) for u in users]


# ─── Disclosure helpers ──────────────────────────────────────────────────────

def _generate_docket_number() -> str:
    import random, string
    year = time.strftime("%Y")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"DCK-{year}-{suffix}"


def _next_court_datetime(db: Session) -> str:
    """
    Auto-schedule the next court slot:
    - Base: today + 2 days at 09:00
    - Each new disclosure is 2 hours after the last one
    - Court day runs 09:00–17:00; overflow spills to next day 09:00
    """
    from datetime import datetime as dt, timedelta
    base = (dt.now() + timedelta(days=2)).replace(hour=9, minute=0, second=0, microsecond=0)

    # Find the latest scheduled court datetime
    rows = db.execute(select(Disclosure).order_by(Disclosure.created_at.desc())).scalars().all()
    latest: dt | None = None
    for d in rows:
        try:
            parsed = dt.strptime(d.court_date, "%Y-%m-%d %H:%M")
            if latest is None or parsed > latest:
                latest = parsed
        except Exception:
            pass

    if latest is None or latest < base:
        return base.strftime("%Y-%m-%d %H:%M")

    next_slot = latest + timedelta(hours=2)
    if next_slot.hour >= 17:
        next_day = (next_slot + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        next_slot = next_day
    return next_slot.strftime("%Y-%m-%d %H:%M")


def _build_docket_pdf_bytes(
    docket_number: str,
    case_number: str,
    verdict: str | None,
    filename: str | None,
    evidence_pdf_hash: str,
    assessment: str,
    court_date: str,
    prosecutor_name: str,
    clerk_name: str,
) -> bytes:
    """Generate the separate Court Disclosure Docket PDF."""
    pdf = FPDF(unit="mm", format="A4")
    pdf.set_margins(15, 15, 15)
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    page_w = float(pdf.w - pdf.l_margin - pdf.r_margin)

    def _mc(h: float, txt: Any):
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(page_w, h, _pdf_text(txt))

    # ── Header ──
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 12, "COURT DISCLOSURE DOCKET", ln=1, align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(90, 90, 90)
    pdf.cell(0, 6, "Juriscan AI Evidence Verification System", ln=1, align="C")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(3)
    pdf.set_draw_color(31, 107, 43)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(6)

    # ── Docket info ──
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Docket Information", ln=1)
    pdf.set_font("Helvetica", "", 10)
    _mc(6, f"Docket Number:        {docket_number}")
    _mc(6, f"Linked Case Number:   {case_number}")
    _mc(6, f"Filing Date/Time:     {time.strftime('%Y-%m-%d %H:%M:%S')}")
    _mc(6, f"Scheduled Court Date: {court_date}")
    _mc(6, f"Filed By Prosecutor:  {prosecutor_name}")
    _mc(6, f"Assigned Clerk:       {clerk_name}")
    pdf.ln(4)

    # ── Evidence summary ──
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Evidence Summary", ln=1)
    pdf.set_font("Helvetica", "", 10)
    _mc(6, f"Evidence File: {filename or '(unknown)'}")
    _mc(6, f"AI Verdict:    {verdict or '(none)'}")
    pdf.ln(4)

    # ── Chain of custody hash ──
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Chain of Custody - AI Report SHA-256 Hash", ln=1)
    pdf.set_font("Courier", "", 9)
    _mc(5, evidence_pdf_hash)
    pdf.set_font("Helvetica", "", 10)
    pdf.ln(4)

    # ── Prosecutor's assessment ──
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Prosecutor's Legal Assessment", ln=1)
    pdf.set_font("Helvetica", "", 10)
    _mc(6, assessment)
    pdf.ln(10)

    # ── Signature lines ──
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(page_w / 2, 6, "_______________________________", ln=0)
    pdf.cell(page_w / 2, 6, "_______________________________", ln=1)
    pdf.cell(page_w / 2, 6, "Prosecutor Signature", ln=0)
    pdf.cell(page_w / 2, 6, "Court Clerk Signature", ln=1)


    out = pdf.output(dest="S")
    return out.encode("latin-1", "replace") if isinstance(out, str) else bytes(out)


# ─── Disclosure Pydantic models ──────────────────────────────────────────────

class DisclosureIn(BaseModel):
    report_id: int
    prosecutor_id: int
    clerk_id: int
    assessment: str


class DisclosureOut(BaseModel):
    id: int
    docket_number: str
    report_id: int
    prosecutor_id: int
    clerk_id: int
    judge_id: int | None = None
    assessment: str
    judge_notes: str | None = None
    court_date: str
    docket_pdf_hash: str
    status: str
    created_at: datetime | None = None
    # Joined from reports table
    case_number: str | None = None
    verdict: str | None = None
    filename: str | None = None
    evidence_pdf_hash: str | None = None
    # Joined user names
    prosecutor_name: str | None = None
    clerk_name: str | None = None
    judge_name: str | None = None

    model_config = {"from_attributes": True}


class DisclosureStatusIn(BaseModel):
    status: str


# ─── Disclosure endpoints ────────────────────────────────────────────────────

@app.post("/disclosures")
def create_disclosure(payload: DisclosureIn, db: Session = Depends(get_db)):
    report = db.get(Report, payload.report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    prosecutor = db.get(UserAccount, payload.prosecutor_id)
    clerk = db.get(UserAccount, payload.clerk_id)
    if not clerk:
        raise HTTPException(status_code=404, detail="Clerk not found")

    court_date = _next_court_datetime(db)
    docket_number = _generate_docket_number()

    docket_pdf_bytes = _build_docket_pdf_bytes(
        docket_number=docket_number,
        case_number=report.case_number,
        verdict=report.verdict,
        filename=report.filename,
        evidence_pdf_hash=report.pdf_hash,
        assessment=payload.assessment,
        court_date=court_date,
        prosecutor_name=prosecutor.username if prosecutor else f"ID#{payload.prosecutor_id}",
        clerk_name=clerk.username,
    )
    docket_pdf_hash = hashlib.sha256(docket_pdf_bytes).hexdigest()

    disclosure = Disclosure(
        docket_number=docket_number,
        report_id=payload.report_id,
        prosecutor_id=payload.prosecutor_id,
        clerk_id=payload.clerk_id,
        assessment=payload.assessment,
        court_date=court_date,
        docket_pdf_blob=docket_pdf_bytes,
        docket_pdf_hash=docket_pdf_hash,
        status="pending",
    )
    db.add(disclosure)
    db.commit()
    db.refresh(disclosure)
    return {
        "id": disclosure.id,
        "docket_number": disclosure.docket_number,
        "court_date": disclosure.court_date,
        "docket_pdf_hash": disclosure.docket_pdf_hash,
        "status": disclosure.status,
        "message": "Disclosure docket forwarded to clerk",
    }


@app.get("/disclosures", response_model=list[DisclosureOut])
def list_disclosures(
    clerk_id: Optional[int] = None,
    prosecutor_id: Optional[int] = None,
    judge_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = select(Disclosure).order_by(Disclosure.created_at.desc())
    if clerk_id is not None:
        query = query.where(Disclosure.clerk_id == clerk_id)
    if prosecutor_id is not None:
        query = query.where(Disclosure.prosecutor_id == prosecutor_id)
    if judge_id is not None:
        query = query.where(Disclosure.judge_id == judge_id)

    disclosures = db.execute(query).scalars().all()
    result = []
    for d in disclosures:
        report = db.get(Report, d.report_id)
        prosecutor = db.get(UserAccount, d.prosecutor_id)
        clerk = db.get(UserAccount, d.clerk_id)
        judge = db.get(UserAccount, d.judge_id) if d.judge_id else None
        result.append(DisclosureOut(
            id=d.id,
            docket_number=d.docket_number,
            report_id=d.report_id,
            prosecutor_id=d.prosecutor_id,
            clerk_id=d.clerk_id,
            judge_id=d.judge_id,
            assessment=d.assessment,
            judge_notes=d.judge_notes,
            court_date=d.court_date,
            docket_pdf_hash=d.docket_pdf_hash,
            status=d.status,
            created_at=d.created_at,
            case_number=report.case_number if report else None,
            verdict=report.verdict if report else None,
            filename=report.filename if report else None,
            evidence_pdf_hash=report.pdf_hash if report else None,
            prosecutor_name=prosecutor.username if prosecutor else None,
            clerk_name=clerk.username if clerk else None,
            judge_name=judge.username if judge else None,
        ))
    return result


@app.patch("/disclosures/{disclosure_id}/status")
def update_disclosure_status(
    disclosure_id: int,
    payload: DisclosureStatusIn,
    db: Session = Depends(get_db),
):
    disclosure = db.get(Disclosure, disclosure_id)
    if not disclosure:
        raise HTTPException(status_code=404, detail="Disclosure not found")
    allowed = {"pending", "received", "accepted", "rejected", "routed"}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {allowed}")
    disclosure.status = payload.status
    db.commit()
    db.refresh(disclosure)
    return {"id": disclosure.id, "status": disclosure.status, "message": "Status updated"}


class RouteToJudgeIn(BaseModel):
    judge_id: int
    judge_notes: str | None = None


@app.post("/disclosures/{disclosure_id}/route-to-judge")
def route_to_judge(
    disclosure_id: int,
    payload: RouteToJudgeIn,
    db: Session = Depends(get_db),
):
    disclosure = db.get(Disclosure, disclosure_id)
    if not disclosure:
        raise HTTPException(status_code=404, detail="Disclosure not found")
    judge = db.get(UserAccount, payload.judge_id)
    if not judge:
        raise HTTPException(status_code=404, detail="Judge not found")
    if disclosure.status not in {"accepted", "routed"}:
        raise HTTPException(status_code=400, detail="Docket must be accepted before routing to judge")
    disclosure.judge_id = payload.judge_id
    disclosure.judge_notes = payload.judge_notes or ""
    disclosure.status = "routed"
    db.commit()
    db.refresh(disclosure)
    judge_obj = db.get(UserAccount, payload.judge_id)
    return {
        "id": disclosure.id,
        "docket_number": disclosure.docket_number,
        "status": disclosure.status,
        "judge_id": disclosure.judge_id,
        "judge_name": judge_obj.username if judge_obj else None,
        "message": f"Docket routed to judge {judge_obj.username if judge_obj else payload.judge_id}",
    }


@app.get("/disclosures/{disclosure_id}/pdf")
def get_disclosure_pdf(disclosure_id: int, db: Session = Depends(get_db)):
    d = db.get(Disclosure, disclosure_id)
    if not d:
        raise HTTPException(status_code=404, detail="Disclosure not found")
    blob = d.docket_pdf_blob
    if isinstance(blob, str):
        blob = blob.encode("latin-1")
    buf = BytesIO(blob)
    buf.seek(0)
    headers = {"Content-Disposition": f"attachment; filename=docket-{d.docket_number}.pdf"}
    return StreamingResponse(buf, media_type="application/pdf", headers=headers)


def _generate_case_number() -> str:

    """Generate a randomized case number like JSC-2026-A3F7."""
    import random, string
    year = time.strftime("%Y")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"JSC-{year}-{suffix}"


@app.post("/reports/forward")
def forward_report(payload: ForwardReportIn, db: Session = Depends(get_db)):
    """Triage routing:
    - score < 0.30 (likely real) → forward to prosecutor
    - score >= 0.30 (suspicious/fake) → forward to forensic officer for manual review
    """
    FORENSIC_THRESHOLD = 0.30
    score = payload.score  # 0.0–1.0 float

    # Determine if forensic review is needed
    needs_forensic = (score is not None and score >= FORENSIC_THRESHOLD)

    case_number = payload.case_number or _generate_case_number()

    # Build PDF bytes
    pdf_payload = VerdictPdfIn(
        filename=payload.filename,
        verdict=payload.verdict,
        score=payload.score,
        tamper_score=payload.tamper_score,
        deepfake_score=payload.deepfake_score,
        signals=payload.signals,
        explanations=payload.explanations,
        events=payload.events,
    )
    pdf_bytes = _build_pdf_bytes(pdf_payload)
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()

    if needs_forensic:
        # Route to forensic officer (custodian)
        custodian = db.execute(
            select(UserAccount).where(UserAccount.role == "custodian", UserAccount.status == "active")
        ).scalar_one_or_none()
        custodian_id = custodian.id if custodian else None

        # Still need a prosecutor_id for schema (use default or payload)
        prosecutor_id = payload.prosecutor_id
        if prosecutor_id is None:
            prov = db.execute(
                select(UserAccount).where(UserAccount.role == "prosecutor", UserAccount.status == "active")
            ).scalar_one_or_none()
            prosecutor_id = prov.id if prov else 0

        new_report = Report(
            case_number=case_number,
            investigator_id=payload.investigator_id,
            prosecutor_id=prosecutor_id,
            custodian_id=custodian_id,
            pdf_blob=pdf_bytes,
            pdf_hash=pdf_hash,
            verdict=payload.verdict,
            filename=payload.filename,
            score=score,
            report_status="pending_forensic_review",
        )
        db.add(new_report)
        db.commit()
        db.refresh(new_report)
        return {
            "report_id": new_report.id,
            "case_number": new_report.case_number,
            "pdf_hash": new_report.pdf_hash,
            "verdict": new_report.verdict,
            "report_status": new_report.report_status,
            "routed_to": "forensic_officer",
            "message": f"Score {score:.0%} >= 30% — routed to forensic officer for manual review",
        }
    else:
        # Route directly to prosecutor
        prosecutor_id = payload.prosecutor_id
        if prosecutor_id is None:
            prov = db.execute(
                select(UserAccount).where(UserAccount.role == "prosecutor", UserAccount.status == "active")
            ).scalar_one_or_none()
            if prov is None:
                raise HTTPException(status_code=404, detail="No active prosecutor found")
            prosecutor_id = prov.id

        new_report = Report(
            case_number=case_number,
            investigator_id=payload.investigator_id,
            prosecutor_id=prosecutor_id,
            pdf_blob=pdf_bytes,
            pdf_hash=pdf_hash,
            verdict=payload.verdict,
            filename=payload.filename,
            score=score,
            report_status="forwarded_to_prosecutor",
        )
        db.add(new_report)
        db.commit()
        db.refresh(new_report)
        return {
            "report_id": new_report.id,
            "case_number": new_report.case_number,
            "pdf_hash": new_report.pdf_hash,
            "verdict": new_report.verdict,
            "report_status": new_report.report_status,
            "routed_to": "prosecutor",
            "message": f"Score {score:.0%} < 30% — forwarded directly to prosecutor",
        }


class ForensicReviewIn(BaseModel):
    action: str   # "accept_override" | "reject_override"
    custodian_id: int
    override_notes: str | None = None


@app.post("/reports/{report_id}/forensic-review")
def forensic_review(
    report_id: int,
    payload: ForensicReviewIn,
    db: Session = Depends(get_db),
):
    """Forensic officer accepts or rejects a manual override.
    - accept_override → report routed to clerk (status=override_accepted)
    - reject_override → report sent to prosecutor as not admissible (status=override_rejected)
    """
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.report_status != "pending_forensic_review":
        raise HTTPException(status_code=400, detail=f"Report is not pending forensic review (status={report.report_status})")

    allowed_actions = {"accept_override", "reject_override"}
    if payload.action not in allowed_actions:
        raise HTTPException(status_code=400, detail=f"action must be one of {allowed_actions}")

    report.override_by = payload.custodian_id
    report.override_notes = payload.override_notes or ""
    # Self-assign custodian if the report arrived before any custodian existed
    if report.custodian_id is None:
        report.custodian_id = payload.custodian_id

    if payload.action == "accept_override":
        report.report_status = "override_accepted"
        db.commit()
        db.refresh(report)
        custodian = db.get(UserAccount, payload.custodian_id)
        return {
            "report_id": report.id,
            "case_number": report.case_number,
            "report_status": report.report_status,
            "routed_to": "clerk",
            "overridden_by": custodian.username if custodian else f"ID#{payload.custodian_id}",
            "message": "Manual override ACCEPTED — report forwarded to clerk as manually verified",
        }
    else:  # reject_override
        report.report_status = "override_rejected"
        db.commit()
        db.refresh(report)
        custodian = db.get(UserAccount, payload.custodian_id)
        return {
            "report_id": report.id,
            "case_number": report.case_number,
            "report_status": report.report_status,
            "routed_to": "prosecutor",
            "overridden_by": custodian.username if custodian else f"ID#{payload.custodian_id}",
            "message": "Manual override REJECTED — report sent to prosecutor as NOT ADMISSIBLE",
        }

class ReportOut(BaseModel):
    id: int
    case_number: str
    investigator_id: int
    prosecutor_id: int
    custodian_id: int | None = None
    pdf_hash: str
    verdict: str | None = None
    filename: str | None = None
    score: float | None = None
    report_status: str = "forwarded_to_prosecutor"
    override_by: int | None = None
    override_notes: str | None = None
    has_video: bool = False
    video_filename: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}

@app.get("/reports", response_model=list[ReportOut])
def list_reports(
    investigator_id: Optional[int] = None,
    prosecutor_id: Optional[int] = None,
    custodian_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = select(Report).order_by(Report.created_at.desc())
    if investigator_id is not None:
        query = query.where(Report.investigator_id == investigator_id)
    if prosecutor_id is not None:
        # Prosecutor sees: forwarded directly OR rejected by forensic officer
        query = query.where(
            Report.prosecutor_id == prosecutor_id,
            Report.report_status.in_(["forwarded_to_prosecutor", "override_rejected", "override_accepted"])
        )
    if custodian_id is not None:
        # Show reports explicitly assigned to this custodian
        # OR any unassigned (NULL) reports pending forensic review
        from sqlalchemy import or_
        query = query.where(
            or_(
                Report.custodian_id == custodian_id,
                (Report.custodian_id == None) & (Report.report_status == "pending_forensic_review")  # noqa: E711
            )
        )
    reports = db.execute(query).scalars().all()
    return [
        ReportOut(
            id=r.id,
            case_number=r.case_number,
            investigator_id=r.investigator_id,
            prosecutor_id=r.prosecutor_id,
            custodian_id=r.custodian_id,
            pdf_hash=r.pdf_hash,
            verdict=r.verdict,
            filename=r.filename,
            score=r.score,
            report_status=r.report_status or "forwarded_to_prosecutor",
            override_by=r.override_by,
            override_notes=r.override_notes,
            has_video=bool(r.video_blob),
            video_filename=r.video_filename,
            created_at=r.created_at,
        )
        for r in reports
    ]

# Endpoint to stream a stored PDF by report id
@app.get("/reports/{report_id}/pdf")
def get_report_pdf(report_id: int, db: Session = Depends(get_db)):
    rpt = db.get(Report, report_id)
    if not rpt:
        raise HTTPException(status_code=404, detail="Report not found")
    blob = rpt.pdf_blob
    if isinstance(blob, str):
        blob = blob.encode("latin-1")
    buf = BytesIO(blob)
    headers = {"Content-Disposition": f"attachment; filename=case-{rpt.case_number}.pdf"}
    return StreamingResponse(buf, media_type="application/pdf", headers=headers)


@app.post("/reports/{report_id}/video")
async def upload_report_video(
    report_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Attach the original video evidence file to a forensic report."""
    rpt = db.get(Report, report_id)
    if not rpt:
        raise HTTPException(status_code=404, detail="Report not found")
    video_bytes = await file.read()
    rpt.video_blob = video_bytes
    rpt.video_filename = file.filename
    rpt.video_content_type = file.content_type or "video/mp4"
    db.commit()
    return {
        "report_id": report_id,
        "video_filename": file.filename,
        "size_bytes": len(video_bytes),
        "message": "Video attached to forensic report",
    }


@app.get("/reports/{report_id}/video")
def get_report_video(report_id: int, db: Session = Depends(get_db)):
    """Stream the original evidence video for forensic officer review."""
    rpt = db.get(Report, report_id)
    if not rpt:
        raise HTTPException(status_code=404, detail="Report not found")
    if not rpt.video_blob:
        raise HTTPException(status_code=404, detail="No video attached to this report")
    buf = BytesIO(rpt.video_blob)
    ct = rpt.video_content_type or "video/mp4"
    safe_name = (rpt.video_filename or f"evidence-{rpt.case_number}.mp4").replace('"', '')
    headers = {"Content-Disposition": f'attachment; filename="{safe_name}"'}
    return StreamingResponse(buf, media_type=ct, headers=headers)
@app.post("/auth/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    lock_after = _env_int("LOCK_AFTER_FAILS", 4)  # block after 4 failed attempts
    u = db.execute(
        select(UserAccount).where((UserAccount.username == payload.username) | (UserAccount.email == payload.username))
    ).scalar_one_or_none()
    if u is None:
        raise HTTPException(status_code=401, detail="invalid credentials")

    if payload.role and u.role != payload.role:
        raise HTTPException(status_code=403, detail="Incorrect role")

    if u.status == "pending":
        raise HTTPException(status_code=403, detail="account pending — awaiting admin approval")
    if u.status in {"blocked", "disabled"}:
        raise HTTPException(status_code=403, detail=f"account {u.status}")
    if u.status in {"locked", "inactive"}:
        raise HTTPException(
            status_code=403,
            detail="account locked after too many failed attempts — contact an administrator to reactivate"
        )

    ok = pwd_context.verify(payload.password, u.password_hash)
    if not ok:
        u.failed_attempts = int(u.failed_attempts or 0) + 1
        remaining = lock_after - u.failed_attempts
        if u.failed_attempts >= lock_after:
            u.status = "inactive"  # admin must reactivate via /admin/users/{id}/approve
            db.commit()
            raise HTTPException(
                status_code=403,
                detail=f"account locked after {lock_after} failed attempts — contact an administrator to reactivate"
            )
        db.commit()
        raise HTTPException(
            status_code=401,
            detail=f"invalid credentials — {remaining} attempt{'s' if remaining != 1 else ''} remaining before lockout"
        )

    u.failed_attempts = 0
    if u.status not in {"active"}:
        u.status = "active"
    db.commit()
    return {"ok": True, "user": _user_to_out(u).model_dump()}


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

# Helper to generate user‑friendly sentence for abrupt‑change events
def _format_abrupt_change(event: dict) -> str:
    t = event.get("time_s")
    f = event.get("frame")
    mad = event.get("mad")
    if t is not None:
        return f"Abrupt change detected at {t:.2f}s (frame {f}) with MAD={mad:.1f}, which may indicate tampering."
    return f"Abrupt change detected at frame {f} with MAD={mad:.1f}, which may indicate tampering."


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
    # Add natural language sentences for the most significant abrupt‑change events
    if cut_candidates:
        top_abrupt = sorted(cut_candidates, key=lambda x: float(x.get("mad") or 0), reverse=True)[:3]
        for ev in top_abrupt:
            reasons_tamper.append(_format_abrupt_change(ev))
    # Other heuristics expressed in friendly language
    if blur_low_frac > 0.6:
        reasons_tamper.append(f"A high fraction ({blur_low_frac:.0%}) of frames appear blurred, which can indicate heavy recompression or smoothing.")
    if hf_var > 25.0:
        reasons_tamper.append(f"High variability in high‑frequency energy ({hf_var:.1f}) suggests segment‑level re‑encoding.")
    if exposure_clip > 0.15:
        reasons_tamper.append(f"{exposure_clip:.0%} of frames are near‑black or near‑white, reducing analysis reliability.")
    if contrast_low > 0.5:
        reasons_tamper.append(f"{contrast_low:.0%} of frames have low contrast, often caused by compression or post‑processing.")
    if not reasons_tamper:
        reasons_tamper.append("No strong tampering heuristics exceeded thresholds in the sampled frames.")

    reasons_deepfake: list[str] = []
    if deepfake_score is None:
        reasons_deepfake.append("Deep‑fake detection model not found – no deep‑fake score was calculated.")
    else:
        if deepfake_score >= 0.7:
            reasons_deepfake.append(f"Deep‑fake model confidence is {deepfake_score:.2f}, indicating a high likelihood of synthetic manipulation.")
        elif deepfake_score >= 0.35:
            reasons_deepfake.append(f"Deep‑fake model confidence is {deepfake_score:.2f}, indicating a moderate likelihood of synthetic manipulation.")
        else:
            reasons_deepfake.append(f"Deep‑fake model confidence is {deepfake_score:.2f}, indicating a low likelihood of synthetic manipulation.")

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
