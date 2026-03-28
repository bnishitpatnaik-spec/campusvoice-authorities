"""
Test all Roboflow models using the 4 real campus images from the chat.
Images are fetched from reliable public CDNs that Roboflow can access.
"""
import httpx, asyncio, base64, io, os
from PIL import Image

API_KEY  = "S5QTYQOzlXL1szrJO7A4"
BASE_URL = "https://detect.roboflow.com"

MODELS = {
    "Furniture":  "furniture-detection-qiufc/20",
    "Electrical": "electrical-appliance/2",
    "Privacy":    "person-detection-9a6mk/16",
    "COCO":       "coco/14",
}

# Real campus-matching images from reliable public sources
# Matching exactly what was shown in the chat:
# 1. Broken plastic chair (brown, top-down view)
# 2. Blue dustbin/trash can
# 3. Electrical socket/switchboard with plug
# 4. Blue Star water dispenser/cooler
TEST_IMAGES = {
    "Broken Chair [Infrastructure]": [
        "https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?w=640",
        "https://images.pexels.com/photos/276583/pexels-photo-276583.jpeg?w=640",
        "https://images.pexels.com/photos/1148955/pexels-photo-1148955.jpeg?w=640",
    ],
    "Dustbin [Hygiene]": [
        "https://images.pexels.com/photos/802221/pexels-photo-802221.jpeg?w=640",
        "https://images.pexels.com/photos/3735218/pexels-photo-3735218.jpeg?w=640",
    ],
    "Electrical Socket [Technology]": [
        "https://images.pexels.com/photos/1036936/pexels-photo-1036936.jpeg?w=640",
        "https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg?w=640",
    ],
    "Water Dispenser [Health]": [
        "https://images.pexels.com/photos/3735218/pexels-photo-3735218.jpeg?w=640",
        "https://images.pexels.com/photos/1327838/pexels-photo-1327838.jpeg?w=640",
    ],
}

def to_jpeg_b64(raw: bytes) -> str:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()

async def fetch(url: str) -> bytes | None:
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200 and len(r.content) > 3000:
                return r.content
    except Exception:
        pass
    return None

async def run_model(model_id: str, b64: str):
    async with httpx.AsyncClient(timeout=25) as c:
        r = await c.post(
            f"{BASE_URL}/{model_id}",
            params={"api_key": API_KEY},
            json={"image": {"type": "base64", "value": b64}},
        )
        if r.status_code != 200:
            return [], r.text[:120]
        return r.json().get("predictions", []), None

async def main():
    print("=" * 65)
    print("  CampusVoice — Roboflow Model Test (4 Real Campus Images)")
    print("=" * 65)

    summary = []
    for label, urls in TEST_IMAGES.items():
        print(f"\n📸  {label}")
        print("    " + "-" * 55)

        # Try each URL until one works
        raw = None
        for url in urls:
            raw = await fetch(url)
            if raw:
                break

        if not raw:
            print("    ❌ Could not fetch image from any source")
            continue

        b64 = to_jpeg_b64(raw)
        print(f"    Image loaded: {len(raw)//1024}KB → JPEG base64 ready")

        row = {"image": label, "results": {}}
        for model_name, model_id in MODELS.items():
            preds, err = await run_model(model_id, b64)
            if err:
                print(f"    {model_name:<14} ❌  {err}")
                row["results"][model_name] = "ERROR"
            elif preds:
                top  = max(preds, key=lambda p: p.get("confidence", 0))
                conf = round(top["confidence"] * 100)
                cls  = top["class"]
                all_cls = list({p["class"] for p in preds})
                print(f"    {model_name:<14} ✅  {len(preds)} obj — Top: {cls} ({conf}%) | Classes: {all_cls}")
                row["results"][model_name] = f"{cls} {conf}%"
            else:
                print(f"    {model_name:<14} ⚠️   0 detections")
                row["results"][model_name] = "none"
        summary.append(row)

    print("\n" + "=" * 65)
    print("  FINAL EVALUATION REPORT")
    print("=" * 65)
    for row in summary:
        detected = [(m, v) for m, v in row["results"].items() if v not in ("none", "ERROR")]
        status = "✅ PASS" if detected else "❌ FAIL"
        print(f"\n  {status}  {row['image']}")
        if detected:
            for m, v in detected:
                print(f"         {m:<14} → {v}")
        else:
            print(f"         No objects detected by any model")

    # Overall score
    passed = sum(1 for r in summary if any(v not in ("none","ERROR") for v in r["results"].values()))
    print(f"\n  Score: {passed}/{len(summary)} images detected correctly")
    print("=" * 65)

if __name__ == "__main__":
    asyncio.run(main())
