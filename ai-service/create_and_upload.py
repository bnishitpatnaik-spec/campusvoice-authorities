"""
Creates new projects in your Roboflow workspace and uploads campus images.
Run this, then annotate in the UI, then train.
"""
import httpx, asyncio, base64, io, os
from PIL import Image

API_KEY   = "S5QTYQOzlXL1szrJO7A4"
WORKSPACE = "nishits-workspace-hsyvy"

NEW_PROJECTS = [
    {
        "name": "campus-furniture",
        "annotation": "object-detection",
        "images": [
            ("test_images/chair.jpeg",     "chair"),
            ("test_images/dustbin.jpeg",   "dustbin"),
            ("test_images/dispenser.jpeg", "water_dispenser"),
        ],
    },
    {
        "name": "campus-electrical",
        "annotation": "object-detection",
        "images": [
            ("test_images/socket.jpeg", "electrical_socket"),
        ],
    },
]

def load_jpeg(path: str) -> bytes:
    with open(path, "rb") as f:
        raw = f.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((640, 640), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()

async def create_project(name: str, annotation: str) -> str | None:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"https://api.roboflow.com/{WORKSPACE}/projects",
            params={"api_key": API_KEY},
            json={"name": name, "annotation": annotation, "license": "CC BY 4.0"},
        )
        if r.status_code in (200, 201):
            data = r.json()
            project_id = data.get("id") or data.get("project", {}).get("id")
            return project_id
        print(f"  Create failed: {r.text[:200]}")
        return None

async def upload_image(project_id: str, img_path: str, split: str = "train") -> bool:
    img_bytes = load_jpeg(img_path)
    name = os.path.basename(img_path)
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"https://api.roboflow.com/dataset/{project_id}/upload",
            params={"api_key": API_KEY, "name": name, "split": split},
            content=img_bytes,
            headers={"Content-Type": "image/jpeg"},
        )
        return r.status_code in (200, 201), r.text[:150]

async def main():
    print("=" * 60)
    print("  Creating Campus Projects & Uploading Images")
    print("=" * 60)

    created = {}
    for proj in NEW_PROJECTS:
        print(f"\n📦  Creating project: {proj['name']}")
        pid = await create_project(proj["name"], proj["annotation"])
        if pid:
            print(f"  ✅ Created: {pid}")
            created[proj["name"]] = pid
        else:
            # Try using name directly as project ID
            pid = f"{WORKSPACE}/{proj['name']}"
            print(f"  ⚠️  Using: {pid}")
            created[proj["name"]] = pid

        for img_path, label in proj["images"]:
            if not os.path.exists(img_path):
                print(f"  ⚠️  Not found: {img_path}")
                continue
            ok, msg = await upload_image(created[proj["name"]], img_path)
            status = "✅" if ok else "❌"
            print(f"  {status} {os.path.basename(img_path)} ({label}) — {msg[:80]}")

    print("\n" + "=" * 60)
    print("  ANNOTATION & TRAINING STEPS")
    print("=" * 60)
    print(f"""
  1. Go to: https://app.roboflow.com/{WORKSPACE}

  2. For 'campus-furniture' project:
     - Annotate: chair, dustbin, water_dispenser
     - Generate version with: Auto-Orient + 640x640 + H-Flip + Random Crop

  3. For 'campus-electrical' project:
     - Annotate: electrical_socket, switch
     - Generate version with same settings

  4. Train each:
     - Model: YOLOv8n
     - Strategy: Train from scratch (first time) or checkpoint

  5. After training, get the new model IDs and run:
     python update_model_versions.py <furniture_version> <electrical_version>
""")

if __name__ == "__main__":
    asyncio.run(main())
