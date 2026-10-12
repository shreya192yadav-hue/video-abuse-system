

import os
import json
import uuid
import tempfile
from pathlib import Path
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
CASES_FILE = DATA_DIR / "cases.json"

MAX_VIDEO_BYTES = 80 * 1024 * 1024
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

app = FastAPI(title="Fast Video Abuse Review System")

STATIC_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def load_cases():
    try:
        if CASES_FILE.exists():
            return json.loads(CASES_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        pass
    return []


def save_cases(cases):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp_file = CASES_FILE.with_suffix(".tmp")
    temp_file.write_text(
        json.dumps(cases, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    temp_file.replace(CASES_FILE)


async def save_upload(upload: UploadFile):
    suffix = Path(upload.filename or "").suffix.lower()

    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "वीडियो का फॉर्मेट समर्थित नहीं है।")

    fd, path = tempfile.mkstemp(suffix=suffix)
    size = 0

    try:
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break

                size += len(chunk)
                if size > MAX_VIDEO_BYTES:
                    raise HTTPException(
                        413, "वीडियो 80 MB की सीमा से बड़ा है।"
                    )

                out.write(chunk)

        if size == 0:
            raise HTTPException(400, "खाली वीडियो अपलोड नहीं किया जा सकता।")

        return path

    except Exception:
        Path(path).unlink(missing_ok=True)
        raise


def frame_signature(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    small = cv2.resize(gray, (64, 64))
    return cv2.calcHist([small], [0], None, [64], [0, 256])


def compare_videos(original_path, suspect_path):
    def extract_signatures(path):
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise ValueError("वीडियो खोला नहीं जा सका।")

        count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        duration = count / fps if fps and fps > 0 else 0

        signatures = []
        # अधिकतम 12 जगहों पर फ्रेम जाँचें
        positions = np.linspace(0, max(count - 1, 0), 12).astype(int)

        for pos in positions:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(pos))
            ok, frame = cap.read()
            if ok and frame is not None:
                signatures.append((pos, frame_signature(frame)))

        cap.release()
        return signatures, round(duration, 2)

    first, duration_a = extract_signatures(original_path)
    second, duration_b = extract_signatures(suspect_path)

    if not first or not second:
        raise ValueError("एक या दोनों वीडियो से फ्रेम नहीं निकले।")

    matches = []
    for pos_a, hist_a in first:
        best = 0
        best_pos = None

        for pos_b, hist_b in second:
            score = cv2.compareHist(
                hist_a, hist_b, cv2.HISTCMP_CORREL
            )
            if score > best:
                best = score
                best_pos = pos_b

        matches.append({
            "original_frame": int(pos_a),
            "suspect_frame": int(best_pos) if best_pos is not None else None,
            "visual_similarity": round(float(max(0, best)) * 100, 1)
        })

    avg = sum(x["visual_similarity"] for x in matches) / len(matches)

    return {
        "original_duration_seconds": duration_a,
        "suspect_duration_seconds": duration_b,
        "sampled_frames": len(matches),
        "average_histogram_similarity_percent": round(avg, 1),
        "frame_matches": matches,
        "warning": (
            "यह केवल नमूना फ्रेमों की रंग-हिस्टोग्राम तुलना है। "
            "यह समान व्यक्ति, कॉपी, छेड़छाड़ या उल्लंघन का निर्णायक प्रमाण नहीं है।"
        )
    }


@app.get("/", response_class=HTMLResponse)
def home():
    page = STATIC_DIR / "index.html"
    if not page.exists():
        return HTMLResponse(
            "<h2>static/index.html फाइल अभी बनाएँ।</h2>",
            status_code=200
        )
    return HTMLResponse(page.read_text(encoding="utf-8"))


@app.get("/api/health")
def health():
    return {"status": "online", "service": "video-abuse-review"}


@app.get("/api/cases")
def get_cases():
    # यह शुरुआती संस्करण निजी लॉगिन के बिना है।
    # सार्वजनिक डिप्लॉयमेंट से पहले authentication जोड़ें।
    return load_cases()


@app.post("/api/analyze")
async def analyze(
    original: UploadFile = File(...),
    suspect: UploadFile = File(...),
    original_url: str = Form(""),
    suspect_url: str = Form(""),
    description: str = Form("")
):
    paths = []

    try:
        path_a = await save_upload(original)
        paths.append(path_a)

        path_b = await save_upload(suspect)
        paths.append(path_b)

        try:
            comparison = compare_videos(path_a, path_b)
        except (ValueError, cv2.error) as exc:
            raise HTTPException(422, f"वीडियो विश्लेषण नहीं हो पाया: {exc}")

        case_id = "CASE-" + uuid.uuid4().hex[:10].upper()
        now = datetime.now(timezone.utc).isoformat()

        report = {
            "case_id": case_id,
            "created_at": now,
            "status": "REPORT_READY",
            "original_url": original_url.strip(),
            "suspect_url": suspect_url.strip(),
            "description": description.strip(),
            "comparison": comparison,
            "review_note": (
                "सिस्टम ने केवल दृश्य समानता के संकेत जाँचे हैं। "
                "भाषा, वॉइसओवर, व्यक्ति की पहचान और नीति उल्लंघन की "
                "अलग से मानव समीक्षा जरूरी है।"
            ),
            "platform_action": "NOT_SUBMITTED"
        }

        cases = load_cases()
        cases.insert(0, report)
        save_cases(cases)

        return report

    finally:
        for path in paths:
            Path(path).unlink(missing_ok=True)
        await original.close()
        await suspect.close()


@app.get("/api/report/{case_id}")
def get_report(case_id: str):
    for case in load_cases():
        if case.get("case_id") == case_id:
            return case
    raise HTTPException(404, "यह केस नहीं मिला।")
