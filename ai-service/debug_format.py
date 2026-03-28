"""Debug the exact format Roboflow expects for base64 images."""
import httpx, asyncio, base64, io, json
from PIL import Image

API_KEY = "S5QTYQOzlXL1szrJO7A4"
MODEL   = "furniture-detection-qiufc/20"

def load_jpeg_b64(path: str) -> str:
    with open(path, "rb") as f:
        raw = f.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    # Resize to 640x640 max
    img.thumbnail((640, 640), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("utf-8")

async def test(label, payload, method="POST", url=None):
    async with httpx.AsyncClient(timeout=30) as c:
        if method == "POST":
            r = await c.post(url or f"https://detect.roboflow.com/{MODEL}",
                             params={"api_key": API_KEY}, json=payload)
        else:
            r = await c.get(url or f"https://detect.roboflow.com/{MODEL}",
                            params=payload)
        status = "✅" if r.status_code == 200 else "❌"
        preds = r.json().get("predictions", []) if r.status_code == 200 else []
        msg = f"{len(preds)} detections" if r.status_code == 200 else r.text[:120]
        print(f"  {status} {label}: {msg}")

async def main():
    b64 = load_jpeg_b64("test_images/chair.jpeg")
    print(f"Image b64 length: {len(b64)} chars")
    print(f"First 50 chars: {b64[:50]}")
    print()

    # Format 1: plain base64 string
    await test("Plain b64 string",
               {"image": b64})

    # Format 2: data URI
    await test("Data URI",
               {"image": f"data:image/jpeg;base64,{b64}"})

    # Format 3: nested type/value
    await test("Nested type/value",
               {"image": {"type": "base64", "value": b64}})

    # Format 4: Roboflow infer format
    await test("Roboflow infer format",
               {"image": b64, "confidence": 40, "overlap": 30})

    # Format 5: multipart form
    async with httpx.AsyncClient(timeout=30) as c:
        files = {"file": ("image.jpg", base64.b64decode(b64), "image/jpeg")}
        r = await c.post(f"https://detect.roboflow.com/{MODEL}",
                         params={"api_key": API_KEY}, files=files)
        status = "✅" if r.status_code == 200 else "❌"
        preds = r.json().get("predictions", []) if r.status_code == 200 else []
        msg = f"{len(preds)} detections" if r.status_code == 200 else r.text[:120]
        print(f"  {status} Multipart file upload: {msg}")

asyncio.run(main())
