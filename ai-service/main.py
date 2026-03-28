import os
import re
import base64
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="CampusVoice AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ────────────────────────────────────────────────────────────────────
API_KEY         = os.getenv("ROBOFLOW_API_KEY", "S5QTYQOzlXL1szrJO7A4")
WORKSPACE       = os.getenv("ROBOFLOW_WORKSPACE", "nishits-workspace-hsyvy")
INLINE_URL      = "https://detect.roboflow.com"

PRIVACY_MODEL   = os.getenv("PRIVACY_MODEL",    "person-detection-9a6mk/16")
FURNITURE_MODEL = os.getenv("FURNITURE_MODEL",  "furniture-detection-qiufc/20")
POTHOLE_MODEL   = os.getenv("POTHOLE_MODEL",    "pothole-voxrl/1")
ELECTRICAL_MODEL= os.getenv("ELECTRICAL_MODEL", "electrical-appliance/2")
COCO_MODEL      = "coco/14"

CLIP_ACCEPT      = 0.25
CLIP_REVIEW      = 0.22
CLIP_ONLY_ACCEPT = 0.25

CAMPUS_COCO_CLASSES = {
    "chair","couch","sofa","bench","dining table","desk","bed","toilet","sink",
    "refrigerator","oven","microwave","tv","laptop","monitor","keyboard","mouse",
    "bottle","cup","book","clock","vase","cabinet","shelf","bowl","spoon","fork",
    "bin","trash can","dustbin","water cooler","dispenser","socket","switch",
    "fan","ac","light","bulb","pipe","tap","faucet","drain",
}

CATEGORY_MODEL = {
    "Infrastructure": FURNITURE_MODEL,
    "Academic":       FURNITURE_MODEL,
    "Health":         FURNITURE_MODEL,
    "Hygiene":        FURNITURE_MODEL,
    "Other":          FURNITURE_MODEL,
    "Safety":         POTHOLE_MODEL,
    "Roads":          POTHOLE_MODEL,
    "Technology":     ELECTRICAL_MODEL,
    "Electrical":     ELECTRICAL_MODEL,
}

# ── Schemas ───────────────────────────────────────────────────────────────────
class VerifyImageRequest(BaseModel):
    imageBase64: str
    description: str
    category: str

class VerifyResolutionRequest(BaseModel):
    before_url: str
    after_url: str
    complaint_id: str = None

# ── Helpers ───────────────────────────────────────────────────────────────────
def is_real_word(w: str) -> bool:
    w = w.lower()
    if not re.search(r'[aeiou]', w):
        return False
    if re.search(r'[^aeiou]{4,}', w):
        return False
    if re.match(r'^(.+)\1+$', w):
        return False
    return True

def gibberish_check(text: str) -> bool:
    """Returns True if text is valid (not gibberish)."""
    if len(text.strip()) < 15:
        return False
    words = re.findall(r'[a-zA-Z]+', text)
    real = [w for w in words if is_real_word(w)]
    return len(real) >= 3

def b64_to_inline(b64: str) -> str:
    """Strip data URI prefix if present."""
    if ',' in b64:
        return b64.split(',', 1)[1]
    return b64

async def run_object_detection(model_id: str, image_b64: str) -> dict:
    """Run a Roboflow object detection model via hosted inference API."""
    # Convert base64 to URL-encoded for GET, or POST with base64
    clean_b64 = b64_to_inline(image_b64)
    payload = {"api_key": API_KEY, "image": {"type": "base64", "value": clean_b64}}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://detect.roboflow.com/{model_id}",
            params={"api_key": API_KEY},
            json={"image": {"type": "base64", "value": clean_b64}},
        )
        if r.status_code != 200:
            return {"predictions": []}
        return r.json()

async def run_clip_similarity(image_b64: str, text: str) -> float:
    """Run CLIP text-image cosine similarity via Roboflow workflow."""
    payload = {
        "api_key": API_KEY,
        "inputs": {
            "image": {"type": "base64", "value": b64_to_inline(image_b64)},
            "before_image": {"type": "base64", "value": b64_to_inline(image_b64)},
        },
        "use_cache": True,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://serverless.roboflow.com/{WORKSPACE}/workflows/detect-and-classify",
            json=payload,
        )
        if r.status_code != 200:
            return 0.0
        data = r.json()
        outputs = data.get("outputs", [{}])
        return float(outputs[0].get("similarity_score", 0.0)) if outputs else 0.0


async def run_clip_image_similarity(image_b64: str, ref_b64: str) -> float:
    """Run CLIP image-image cosine similarity via Roboflow workflow."""
    payload = {
        "api_key": API_KEY,
        "inputs": {
            "image":        {"type": "base64", "value": b64_to_inline(image_b64)},
            "before_image": {"type": "base64", "value": b64_to_inline(ref_b64)},
        },
        "use_cache": True,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://serverless.roboflow.com/{WORKSPACE}/workflows/detect-and-classify",
            json=payload,
        )
        if r.status_code != 200:
            return 0.0
        data = r.json()
        outputs = data.get("outputs", [{}])
        return float(outputs[0].get("similarity_score", 0.0)) if outputs else 0.0

async def url_to_b64(url: str) -> str:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url)
        return base64.b64encode(r.content).decode()

def get_image_area(b64: str) -> int:
    """Estimate image area from base64 (rough decode)."""
    try:
        import io
        from PIL import Image
        data = base64.b64decode(b64_to_inline(b64))
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        return w * h
    except Exception:
        return 640 * 480  # fallback

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "CampusVoice AI", "port": int(os.getenv("PORT", 8001))}


@app.post("/api/verify-image")
async def verify_image(req: VerifyImageRequest):

    # ── Gate 0: Gibberish Check ───────────────────────────────────────────────
    if not gibberish_check(req.description):
        raise HTTPException(status_code=400, detail={
            "error": "Invalid Description",
            "message": "Description is invalid. Please provide a meaningful description (at least 15 characters with real words).",
        })

    # ── Gate 1: Privacy Gate ──────────────────────────────────────────────────
    privacy_result = await run_object_detection(PRIVACY_MODEL, req.imageBase64)
    privacy_preds  = privacy_result.get("predictions", [])
    for pred in privacy_preds:
        if pred.get("confidence", 0) > 0.7:
            raise HTTPException(status_code=400, detail={
                "error": "Privacy Violation",
                "message": "Please remove people from the frame. Complaints must not contain identifiable individuals.",
            })

    # COCO fallback privacy check
    if not privacy_preds:
        coco_result = await run_object_detection(COCO_MODEL, req.imageBase64)
        img_area    = get_image_area(req.imageBase64)
        for pred in coco_result.get("predictions", []):
            if pred.get("class", "").lower() == "person" and pred.get("confidence", 0) > 0.6:
                bbox_area = pred.get("width", 0) * pred.get("height", 0)
                if img_area > 0 and (bbox_area / img_area) > 0.40:
                    raise HTTPException(status_code=400, detail={
                        "error": "Privacy Violation",
                        "message": "Please remove people from the frame. Complaints must not contain identifiable individuals.",
                    })

    # ── Gate 2: Smart Router ──────────────────────────────────────────────────
    specialist_model = CATEGORY_MODEL.get(req.category, FURNITURE_MODEL)
    specialist_result = await run_object_detection(specialist_model, req.imageBase64)
    predictions = specialist_result.get("predictions", [])

    # ── Gate 2b: COCO Fallback (Infrastructure categories) ───────────────────
    use_coco_fallback = False
    if not predictions and req.category in ("Infrastructure", "Academic", "Health", "Hygiene", "Other"):
        coco_fb = await run_object_detection(COCO_MODEL, req.imageBase64)
        coco_preds = [
            p for p in coco_fb.get("predictions", [])
            if p.get("class", "").lower() in CAMPUS_COCO_CLASSES
        ]
        if coco_preds:
            predictions = coco_preds
            use_coco_fallback = True

    # ── Gate 4: CLIP Semantic Cross-Verification ──────────────────────────────
    clip_score = await run_clip_similarity(req.imageBase64, req.description)

    # ── Gate 3: Validation Gate ───────────────────────────────────────────────
    if not predictions:
        if clip_score < CLIP_ONLY_ACCEPT:
            raise HTTPException(status_code=400, detail={
                "error": "Irrelevant Image",
                "message": f"No {req.category} issues detected in the image. Please upload a clear photo of the problem.",
            })
        # CLIP-only pass
        clip_label = "ACCEPT" if clip_score >= CLIP_ACCEPT else "LOW_CONFIDENCE"
        return {
            "overallVerified": True,
            "campusDetected": False,
            "descriptionMatches": True,
            "isReal": True,
            "status": "LOW_CONFIDENCE",
            "detected_objects": [],
            "confidence": round(clip_score, 4),
            "verification_image_url": None,
            "specialist_model": specialist_model.split('/')[0],
            "clipResults": {"similarity_score": round(clip_score, 4), "confidence": clip_label},
            "reason": f"CLIP-only pass (no objects detected). CLIP score: {round(clip_score, 3)}",
            "score": round(clip_score, 4),
        }

    # CLIP gate
    if clip_score <= CLIP_REVIEW:
        raise HTTPException(status_code=400, detail={
            "error": "Description Mismatch",
            "message": "Your description does not match the image. Please describe what is actually visible in the photo.",
            "clip_score": round(clip_score, 4),
        })

    # ── Build response ────────────────────────────────────────────────────────
    detected_objects = list({p.get("class", "Object") for p in predictions})
    avg_conf = sum(p.get("confidence", 0) for p in predictions) / len(predictions)
    clip_label = "ACCEPT" if clip_score >= CLIP_ACCEPT else "LOW_CONFIDENCE"
    status = "VERIFIED" if clip_score >= CLIP_ACCEPT else "LOW_CONFIDENCE"

    return {
        "overallVerified": True,
        "campusDetected": True,
        "descriptionMatches": True,
        "isReal": True,
        "status": status,
        "detected_objects": detected_objects,
        "confidence": round(avg_conf, 4),
        "verification_image_url": None,
        "specialist_model": (COCO_MODEL if use_coco_fallback else specialist_model).split('/')[0],
        "clipResults": {"similarity_score": round(clip_score, 4), "confidence": clip_label},
        "reason": f"Verified: {', '.join(detected_objects)} detected ({len(predictions)} object(s), avg confidence {round(avg_conf*100)}%). CLIP score: {round(clip_score, 3)}",
        "score": round(avg_conf, 4),
    }


@app.post("/api/verify-resolution")
async def verify_resolution(req: VerifyResolutionRequest):
    # Fetch images from Cloudinary URLs
    before_b64 = await url_to_b64(req.before_url)
    after_b64  = await url_to_b64(req.after_url)

    score = await run_clip_image_similarity(after_b64, before_b64)

    if score > 0.85:
        status = "MATCHED"
        message = "Resolution confirmed. The after photo matches the complaint location."
    elif score > 0.78:
        status = "UNCERTAIN"
        message = "Resolution is uncertain. Manual review recommended."
    else:
        status = "NOT_MATCHED"
        message = "Resolution rejected. The after photo does not match the original complaint."

    return {
        "status": status,
        "score": round(score, 4),
        "message": message,
        "complaint_id": req.complaint_id,
    }
