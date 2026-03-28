"""
Test all Roboflow models against the 4 real campus images.
Images: broken chair, dustbin, electrical socket, water dispenser
"""
import httpx
import base64
import asyncio
import os
from pathlib import Path

API_KEY  = "S5QTYQOzlXL1szrJO7A4"
BASE_URL = "https://detect.roboflow.com"

MODELS = {
    "Furniture":  "furniture-detection-qiufc/20",
    "Pothole":    "pothole-voxrl/1",
    "Electrical": "electrical-appliance/2",
    "Privacy":    "person-detection-9a6mk/16",
    "COCO":       "coco/14",
}

# Real campus image URLs (from the test images provided)
TEST_IMAGES = {
    "broken_chair":      "https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=640",
    "dustbin":           "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=640",
    "electrical_socket": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=640",
    "water_dispenser":   "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=640",
}

# Use local saved images if available
LOCAL_IMAGES = {
    "broken_chair":      "test_images/chair.jpg",
    "dustbin":           "test_images/dustbin.jpg",
    "electrical_socket": "test_images/socket.jpg",
    "water_dispenser":   "test_images/dispenser.jpg",
}

async def test_model(model_id: str, image_b64: str, label: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{BASE_URL}/{model_id}",
            params={"api_key": API_KEY},
            json={"image": {"type": "base64", "value": image_b64}},
        )
        if r.status_code != 200:
            return {"error": r.text[:200], "predictions": []}
        return r.json()

def load_image_b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

async def main():
    print("=" * 65)
    print("  CampusVoice — Roboflow Model Test Suite")
    print("  Testing 4 real campus images across 5 models")
    print("=" * 65)

    # Check which local images exist
    images = {}
    for name, path in LOCAL_IMAGES.items():
        if Path(path).exists():
            images[name] = ("local", path)
        else:
            images[name] = ("missing", None)

    missing = [k for k, (t, _) in images.items() if t == "missing"]
    if missing:
        print(f"\n⚠️  Local images not found: {missing}")
        print("   Run: python save_test_images.py first\n")
        return

    results = {}
    for img_name, (_, img_path) in images.items():
        print(f"\n📸 Image: {img_name.replace('_', ' ').title()}")
        print("-" * 50)
        img_b64 = load_image_b64(img_path)
        results[img_name] = {}

        for model_name, model_id in MODELS.items():
            result = await test_model(model_id, img_b64, img_name)
            preds = result.get("predictions", [])
            if preds:
                top = max(preds, key=lambda p: p.get("confidence", 0))
                conf = round(top.get("confidence", 0) * 100)
                cls  = top.get("class", "?")
                print(f"  {model_name:<12} ✅  {len(preds)} detection(s) — Top: {cls} {conf}%")
                results[img_name][model_name] = {"detected": True, "class": cls, "confidence": conf, "count": len(preds)}
            elif "error" in result:
                print(f"  {model_name:<12} ❌  Error: {result['error'][:80]}")
                results[img_name][model_name] = {"detected": False, "error": True}
            else:
                print(f"  {model_name:<12} ⚠️   0 detections")
                results[img_name][model_name] = {"detected": False}

    # Summary
    print("\n" + "=" * 65)
    print("  SUMMARY")
    print("=" * 65)
    for img_name, model_results in results.items():
        detected = [m for m, r in model_results.items() if r.get("detected")]
        print(f"  {img_name.replace('_',' ').title():<25} → Detected by: {', '.join(detected) if detected else 'None'}")

if __name__ == "__main__":
    asyncio.run(main())
