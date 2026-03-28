import httpx, asyncio, base64

API_KEY  = "S5QTYQOzlXL1szrJO7A4"
BASE_URL = "https://detect.roboflow.com"

MODELS = {
    "Furniture":  "furniture-detection-qiufc/20",
    "Electrical": "electrical-appliance/2",
    "Privacy":    "person-detection-9a6mk/16",
    "COCO":       "coco/14",
}

# Matching the 4 real campus images shared:
# 1. Broken plastic chair (Infrastructure)
# 2. Blue dustbin/trash can (Hygiene)
# 3. Electrical socket/switch board (Technology)
# 4. Blue Star water dispenser (Health)
TEST_IMAGES = {
    "Broken Chair     [Infrastructure]": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Simple_chair.jpg/640px-Simple_chair.jpg",
    "Dustbin          [Hygiene]":        "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Waste_container_-_Household_waste.jpg/640px-Waste_container_-_Household_waste.jpg",
    "Electrical Socket[Technology]":     "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Socket_double_UK.jpg/640px-Socket_double_UK.jpg",
    "Water Dispenser  [Health]":         "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Water_cooler.jpg/640px-Water_cooler.jpg",
}

async def fetch_b64(url):
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
        r = await c.get(url, headers={"Accept": "image/jpeg"})
        return base64.b64encode(r.content).decode()

async def run_model(model_id, img_url):
    """Use URL-based inference — more reliable than base64."""
    async with httpx.AsyncClient(timeout=25) as c:
        r = await c.get(
            f"{BASE_URL}/{model_id}",
            params={"api_key": API_KEY, "image": img_url},
        )
        if r.status_code != 200:
            return [], r.text[:120]
        return r.json().get("predictions", []), None

async def main():
    print("=" * 62)
    print("  CampusVoice — Roboflow Model Test on Real Campus Images")
    print("=" * 62)
    summary = []
    for img_label, img_url in TEST_IMAGES.items():
        print(f"\n📸  {img_label}")
        print("    " + "-" * 50)
        b64 = img_url  # use URL directly
        row = {"image": img_label, "results": {}}
        for model_name, model_id in MODELS.items():
            preds, err = await run_model(model_id, img_url)
            if err:
                print(f"    {model_name:<14} ❌  {err}")
                row["results"][model_name] = "ERROR"
            elif preds:
                top = max(preds, key=lambda p: p.get("confidence", 0))
                conf = round(top["confidence"] * 100)
                cls  = top["class"]
                print(f"    {model_name:<14} ✅  {len(preds)} obj — Top: {cls} ({conf}%)")
                row["results"][model_name] = f"{cls} {conf}%"
            else:
                print(f"    {model_name:<14} ⚠️   0 detections")
                row["results"][model_name] = "none"
        summary.append(row)

    print("\n" + "=" * 62)
    print("  FINAL SUMMARY")
    print("=" * 62)
    for row in summary:
        detected = [f"{m}:{v}" for m, v in row["results"].items() if v not in ("none", "ERROR")]
        status = "✅ PASS" if detected else "❌ FAIL"
        print(f"  {status}  {row['image']}")
        if detected:
            print(f"         Detected by: {', '.join(detected)}")

if __name__ == "__main__":
    asyncio.run(main())
