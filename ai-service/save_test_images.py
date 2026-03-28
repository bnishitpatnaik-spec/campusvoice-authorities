"""Download and save the 4 campus test images."""
import httpx, asyncio, os
from pathlib import Path

os.makedirs("test_images", exist_ok=True)

# Using real campus-style images from Unsplash as proxies
IMAGES = {
    "chair.jpg":     "https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800",
    "dustbin.jpg":   "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
    "socket.jpg":    "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800",
    "dispenser.jpg": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
}

async def download():
    async with httpx.AsyncClient(timeout=30) as client:
        for fname, url in IMAGES.items():
            r = await client.get(url)
            Path(f"test_images/{fname}").write_bytes(r.content)
            print(f"✅ Saved {fname} ({len(r.content)//1024}KB)")

asyncio.run(download())
print("Done.")
