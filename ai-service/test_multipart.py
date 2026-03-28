"""
Final working test — uses multipart file upload (confirmed working format).
Tests all 4 real campus images across all 5 Roboflow models.
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
    "Pothole":    "pothole-voxrl/1",
}

IMAGES = {
    "Broken Chair [Infrastructure]":  "test_images/chair.jpeg",
    "Dustbin [Hygiene]":              "test_images/dustbin.jpeg",
    "Electrical Socket [Technology]": "test_images/socket.jpeg",
    "Water Dispenser [Health]":       "test_images/dispenser.jpeg",
}

def load_jpeg(path: str) -> bytes:
    with open(path, "rb") as f:
        raw = f.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((800, 800), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()

async def run_model(model_id: str, img_bytes: bytes):
    async with httpx.AsyncClient(timeout=30) as c:
        files = {"file": ("image.jpg", img_bytes, "image/jpeg")}
        r = await c.post(
            f"{BASE_URL}/{model_id}",
            params={"api_key": API_KEY},
            files=files,
        )
        if r.status_code != 200:
            return [], r.text[:120]
        return r.json().get("predictions", []), None

async def main():
    print("=" * 65)
    print("  CampusVoice — Real Campus Image Model Evaluation")
    print("  Format: Multipart file upload")
    print("=" * 65)

    summary = []
    for label, path in IMAGES.items():
        print(f"\n📸  {label}")
        print("    " + "-" * 55)

        img_bytes = load_jpeg(path)
        print(f"    Size: {len(img_bytes)//1024}KB")

        row = {"image": label, "results": {}}
        for model_name, model_id in MODELS.items():
            preds, err = await run_model(model_id, img_bytes)
            if err:
                print(f"    {model_name:<14} ❌  {err}")
                row["results"][model_name] = "ERROR"
            elif preds:
                top  = max(preds, key=lambda p: p.get("confidence", 0))
                conf = round(top["confidence"] * 100)
                cls  = top["class"]
                all_cls = list({p["class"] for p in preds})
                print(f"    {model_name:<14} ✅  {len(preds)} obj — Top: {cls} ({conf}%) | All: {all_cls}")
                row["results"][model_name] = {"class": cls, "confidence": conf, "count": len(preds), "all": all_cls}
            else:
                print(f"    {model_name:<14} ⚠️   0 detections")
                row["results"][model_name] = None
        summary.append(row)

    # Final report
    print("\n" + "=" * 65)
    print("  FINAL EVALUATION REPORT")
    print("=" * 65)
    passed = 0
    for row in summary:
        detected = {m: v for m, v in row["results"].items() if v and v != "ERROR"}
        status = "✅ PASS" if detected else "❌ FAIL"
        if detected:
            passed += 1
        print(f"\n  {status}  {row['image']}")
        for m, v in detected.items():
            print(f"         {m:<14} → {v['class']} ({v['confidence']}%) — {v['count']} object(s)")
        if not detected:
            print(f"         No objects detected by any model")

    print(f"\n  Score: {passed}/{len(summary)} images passed")
    print("=" * 65)

    # Model performance summary
    print("\n  MODEL PERFORMANCE ACROSS ALL IMAGES")
    print("  " + "-" * 55)
    for model_name in MODELS:
        hits = sum(1 for r in summary if r["results"].get(model_name) and r["results"][model_name] != "ERROR")
        print(f"  {model_name:<14} {hits}/{len(summary)} images detected")

if __name__ == "__main__":
    asyncio.run(main())
