"""
Keep-alive script — ping Render services every 14 minutes.
Run this locally or on any always-on machine during the hackathon.
"""
import httpx, asyncio, time

SERVICES = [
    "https://campusvoice-ai-en6e.onrender.com/health",
    "https://campusvoice-backend-4ct0.onrender.com/api/health",
    "https://campusvoice-admin-q3uf.onrender.com",
]

async def ping():
    async with httpx.AsyncClient(timeout=30) as c:
        for url in SERVICES:
            try:
                r = await c.get(url)
                print(f"✅ {url.split('/')[2]} — {r.status_code}")
            except Exception as e:
                print(f"❌ {url.split('/')[2]} — {e}")

async def main():
    print("🔄 Keep-alive started — pinging every 14 minutes")
    while True:
        print(f"\n[{time.strftime('%H:%M:%S')}] Pinging services...")
        await ping()
        await asyncio.sleep(14 * 60)  # 14 minutes

if __name__ == "__main__":
    asyncio.run(main())
