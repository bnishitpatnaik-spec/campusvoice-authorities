"""
Final test — uses GET ?image=url format (confirmed working earlier).
Uses Cloudinary demo images that are publicly accessible JPEGs.
"""
import httpx, asyncio

API_KEY  = "S5QTYQOzlXL1szrJO7A4"
BASE_URL = "https://detect.roboflow.com"

MODELS = {
    "Furniture":  "furniture-detection-qiufc/20",
    "Electrical": "electrical-appliance/2",
    "Privacy":    "person-detection-9a6mk/16",
    "COCO":       "coco/14",
}

# Cloudinary sample images — publicly accessible JPEGs, no auth needed
# Matching the 4 campus scenarios from the chat images
TEST_IMAGES = {
    "Broken Chair [Infrastructure]": [
        "https://res.cloudinary.com/demo/image/upload/w_640/sample.jpg",
        "https://images.pexels.com/photos/1148955/pexels-photo-1148955.jpeg",
        "https://images.pexels.com/photos/276583/pexels-photo-276583.jpeg",
    ],
    "Dustbin [Hygiene]": [
        "https://images.pexels.com/photos/802221/pexels-photo-802221.jpeg",
        "https://images.pexels.com/photos/3735218/pexels-photo-3735218.jpeg",
    ],
    "Electrical Socket [Technology]": [
        "https://images.pexels.com/photos/1036936/pexels-photo-1036936.jpeg",
        "https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg",
    ],
    "Water Dispenser [Health]": [
        "https://images.pexels.com/photos/1327838/pexels-photo-1327838.jpeg",
        "https://images.pexels.com/photos/3735218/pexels-photo-3735218.jpeg",
    ],
}

async def run_model_url(model_id: str, img_url: str):
    """GET ?image=url — confirmed working format."""
    async with httpx.AsyncClient(timeout=25) as c:
        r = await c.get(
            f"{BASE_URL}/{model_id}",
            params={"api_key": API_KEY, "image": img_url},
        )
        if r.status_code != 200:
            return None, r.text[:120]
        return r.json().get("predictions", []), None

async def try_image(model_id: str, urls: list[str]):
    """Try multiple URLs until one works."""
    for url in urls:
        preds, err = await run_model_url(model_id, url)
        if preds is not None:
            return preds, url
    return [], "all URLs failed"

async def main():
    print("=" * 65)
    print("  CampusVoice — Roboflow Model Test (GET URL format)")
    print("=" * 65)

    summary = []
    for label, urls in TEST_IMAGES.items():
        print(f"\n📸  {label}")
        print("    " + "-" * 55)

        row = {"image": label, "results": {}}
        for model_name, model_id in MODELS.items():
            preds, used_url = await try_image(model_id, urls)
            if isinstance(preds, list) and preds:
                top  = max(preds, key=lambda p: p.get("confidence", 0))
                conf = round(top["confidence"] * 100)
                cls  = top["class"]
                all_cls = list({p["class"] for p in preds})
                print(f"    {model_name:<14} ✅  {len(preds)} obj — Top: {cls} ({conf}%) | {all_cls}")
                row["results"][model_name] = f"{cls} {conf}%"
            elif isinstance(preds, list):
                print(f"    {model_name:<14} ⚠️   0 detections")
                row["results"][model_name] = "none"
            else:
                print(f"    {model_name:<14} ❌  {used_url}")
                row["results"][model_name] = "ERROR"
        summary.append(row)

    print("\n" + "=" * 65)
    print("  FINAL EVALUATION REPORT")
    print("=" * 65)
    total_pass = 0
    for row in summary:
        detected = [(m, v) for m, v in row["results"].items() if v not in ("none", "ERROR")]
        status = "✅ PASS" if detected else "❌ FAIL"
        if detected:
            total_pass += 1
        print(f"\n  {status}  {row['image']}")
        for m, v in detected:
            print(f"         {m:<14} → {v}")
        if not detected:
            print(f"         No objects detected")

    print(f"\n  Overall: {total_pass}/{len(summary)} images passed")
    print("=" * 65)

if __name__ == "__main__":
    asyncio.run(main())
