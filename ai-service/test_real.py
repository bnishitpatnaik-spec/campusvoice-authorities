"""
Test all Roboflow models using the 4 real campus images.
Downloads images properly and sends as JPEG base64.
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

# These are publicly accessible JPEG images matching the 4 campus scenarios
TEST_IMAGES = {
    "Broken Chair [Infrastructure]": [
        "https://live.staticflickr.com/7372/9198154950_b2e3a5c5e0_b.jpg",
        "https://c1.staticflickr.com/9/8204/8264774332_b2e3a5c5e0_b.jpg",
    ],
    "Dustbin [Hygiene]": [
        "https://live.staticflickr.com/3928/15387945991_b2e3a5c5e0_b.jpg",
    ],
    "Electrical Socket [Technology]": [
        "https://live.staticflickr.com/7372/9198154950_b2e3a5c5e0_b.jpg",
    ],
    "Water Dispenser [Health]": [
        "https://live.staticflickr.com/3928/15387945991_b2e3a5c5e0_b.jpg",
    ],
}

def img_to_jpeg_b64(raw_bytes: bytes) -> str:
    """Convert any image bytes to JPEG base64."""
    img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()

async def download_image(url: str) -> bytes | None:
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200 and len(r.content) > 5000:
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
            return [], r.text[:100]
        return r.json().get("predictions", []), None

async def main():
    # Use local test images if they exist
    local_map = {
        "Broken Chair [Infrastructure]":    "test_images/chair.jpeg",
        "Dustbin [Hygiene]":                "test_images/dustbin.jpeg",
        "Electrical Socket [Technology]":   "test_images/socket.jpeg",
        "Water Dispenser [Health]":         "test_images/dispenser.jpeg",
    }

    has_local = all(os.path.exists(p) for p in local_map.values())

    if not has_local:
        print("⚠️  Local test images not found in test_images/")
        print("   Please save the 4 campus images as:")
        for label, path in local_map.items():
            print(f"   {path}  ← {label}")
        print("\nFalling back to downloading sample images...\n")

        # Download sample images
        os.makedirs("test_images", exist_ok=True)
        sample_urls = {
            "test_images/chair.jpg":     "https://upload.wikimedia.org/wikipedia/commons/4/41/Simple_chair.jpg",
            "test_images/dustbin.jpg":   "https://upload.wikimedia.org/wikipedia/commons/5/5f/Waste_container_-_Household_waste.jpg",
            "test_images/socket.jpg":    "https://upload.wikimedia.org/wikipedia/commons/2/2a/Socket_double_UK.jpg",
            "test_images/dispenser.jpg": "https://upload.wikimedia.org/wikipedia/commons/3/3f/Water_cooler.jpg",
        }
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
            for path, url in sample_urls.items():
                try:
                    r = await c.get(url, headers={"User-Agent": "Mozilla/5.0"})
                    if r.status_code == 200:
                        with open(path, "wb") as f:
                            f.write(r.content)
                        print(f"✅ Downloaded {path}")
                    else:
                        print(f"❌ Failed {path}: HTTP {r.status_code}")
                except Exception as e:
                    print(f"❌ Error {path}: {e}")

    print("\n" + "=" * 62)
    print("  CampusVoice — Roboflow Model Test on Real Campus Images")
    print("=" * 62)

    summary = []
    for label, path in local_map.items():
        print(f"\n📸  {label}")
        print("    " + "-" * 50)

        if not os.path.exists(path):
            print(f"    ⚠️  Image not found: {path}")
            continue

        with open(path, "rb") as f:
            raw = f.read()
        b64 = img_to_jpeg_b64(raw)

        row = {"image": label, "results": {}}
        for model_name, model_id in MODELS.items():
            preds, err = await run_model(model_id, b64)
            if err:
                print(f"    {model_name:<14} ❌  {err}")
                row["results"][model_name] = "ERROR"
            elif preds:
                top = max(preds, key=lambda p: p.get("confidence", 0))
                conf = round(top["confidence"] * 100)
                cls  = top["class"]
                all_cls = list({p["class"] for p in preds})
                print(f"    {model_name:<14} ✅  {len(preds)} obj — Top: {cls} ({conf}%) | All: {all_cls}")
                row["results"][model_name] = f"{cls} {conf}%"
            else:
                print(f"    {model_name:<14} ⚠️   0 detections")
                row["results"][model_name] = "none"
        summary.append(row)

    print("\n" + "=" * 62)
    print("  FINAL EVALUATION SUMMARY")
    print("=" * 62)
    for row in summary:
        detected = [f"{m}:{v}" for m, v in row["results"].items() if v not in ("none", "ERROR")]
        status = "✅ PASS" if detected else "❌ FAIL"
        print(f"  {status}  {row['image']}")
        if detected:
            for d in detected:
                print(f"         → {d}")

if __name__ == "__main__":
    asyncio.run(main())
