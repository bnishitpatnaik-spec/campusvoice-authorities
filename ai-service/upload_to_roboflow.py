"""
Upload the 4 real campus images to each Roboflow project for retraining.
Uses Roboflow Upload API to add images to the dataset.
"""
import httpx, asyncio, base64, io, os
from PIL import Image

API_KEY   = "S5QTYQOzlXL1szrJO7A4"
WORKSPACE = "nishits-workspace-hsyvy"

# Projects to upload to
PROJECTS = {
    "furniture-detection-qiufc": {
        "images": ["test_images/chair.jpeg", "test_images/dustbin.jpeg", "test_images/dispenser.jpeg"],
        "split": "train",
    },
    "electrical-appliance": {
        "images": ["test_images/socket.jpeg"],
        "split": "train",
    },
    "pothole-voxrl": {
        "images": [],  # no pothole images in this batch
        "split": "train",
    },
}

def load_jpeg_b64(path: str) -> str:
    with open(path, "rb") as f:
        raw = f.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((640, 640), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()

async def upload_image(project_id: str, img_path: str, split: str) -> tuple:
    b64 = load_jpeg_b64(img_path)
    name = os.path.basename(img_path)
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"https://api.roboflow.com/{WORKSPACE}/{project_id}/upload",
            params={"api_key": API_KEY, "name": name, "split": split},
            content=base64.b64decode(b64),
            headers={"Content-Type": "image/jpeg"},
        )
        return r.status_code == 200, r.text[:200]

async def main():
    print("=" * 60)
    print("  Uploading Campus Images to Roboflow Projects")
    print("=" * 60)

    for project_id, config in PROJECTS.items():
        images = config["images"]
        if not images:
            print(f"\n⏭️  {project_id} — no images to upload")
            continue

        print(f"\n📦  Project: {project_id}")
        for img_path in images:
            if not os.path.exists(img_path):
                print(f"  ⚠️  Not found: {img_path}")
                continue
            ok, msg = await upload_image(project_id, img_path, config["split"])
            status = "✅" if ok else "❌"
            print(f"  {status} {os.path.basename(img_path)} — {msg[:80]}")

    print("\n" + "=" * 60)
    print("  NEXT STEPS (Manual in Roboflow UI)")
    print("=" * 60)
    print("""
  1. Go to app.roboflow.com → nishits-workspace-hsyvy
  2. For each project (furniture-detection-qiufc, electrical-appliance):
     a. Open 'Annotate' tab → find uploaded images
     b. Use 'Label Assist' → adjust bounding boxes
     c. Assign classes: Chair / Dustbin / Dispenser / Socket / Switch
  3. Generate Dataset Version:
     - Auto-Orient: ON
     - Resize: 640x640
     - Augmentations: Horizontal Flip + Random Crop 0-20%
  4. Train → 'Train from Checkpoint' → YOLOv8n → Start Training
  5. After training completes, note the new version number
  6. Run: python update_model_versions.py <furniture_v> <electrical_v>
""")

if __name__ == "__main__":
    asyncio.run(main())
