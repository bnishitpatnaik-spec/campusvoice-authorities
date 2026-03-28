# CampusVoice — Render Deployment Guide

## Architecture on Render
3 separate services, all free tier:
- **campusvoice-frontend** → Static Site
- **campusvoice-backend** → Web Service (Node.js)
- **campusvoice-ai** → Web Service (Python)

---

## Step 1: Push to GitHub
```bash
git add .
git commit -m "chore: prepare for Render deployment"
git push origin main
```

---

## Step 2: Deploy AI Service (Python)

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Name**: `campusvoice-ai`
   - **Root Directory**: `campus voice authorities/ai-service`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add Environment Variables:
   ```
   ROBOFLOW_API_KEY=S5QTYQOzlXL1szrJO7A4
   ROBOFLOW_WORKSPACE=nishits-workspace-hsyvy
   PRIVACY_MODEL=person-detection-9a6mk/16
   FURNITURE_MODEL=furniture-detection-qiufc/20
   POTHOLE_MODEL=pothole-voxrl/1
   ELECTRICAL_MODEL=electrical-appliance/2
   ```
5. Click **Create Web Service**
6. Note the URL: `https://campusvoice-ai.onrender.com`

---

## Step 3: Deploy Authority Backend (Node.js)

1. **New → Web Service**
2. Settings:
   - **Name**: `campusvoice-backend`
   - **Root Directory**: `campus voice authorities/backend`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. Add Environment Variables:
   ```
   NODE_ENV=production
   FRONTEND_URL=https://campusvoice-admin.onrender.com
   JWT_SECRET=v1t_ch3nna1_h4ck4th0n_2026_s3cr3t_k3y_9921
   JWT_EXPIRES_IN=7d

   FIREBASE_PROJECT_ID=campusvoice-eed4c
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@campusvoice-eed4c.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY=<paste your private key>

   CLOUDINARY_CLOUD_NAME=dxmje0bcd
   CLOUDINARY_API_KEY=287685325986989
   CLOUDINARY_API_SECRET=hKCmPU6PtLRh0HI2iqkWxNDYmq8

   ANTHROPIC_API_KEY=<your key>

   ROBOFLOW_API_KEY=S5QTYQOzlXL1szrJO7A4
   ROBOFLOW_WORKSPACE=nishits-workspace-hsyvy
   ROBOFLOW_WORKFLOW_ID=detect-and-classify
   ROBOFLOW_MODEL_ID=furniture-detection-qiufc/20

   AI_SERVICE_URL=https://campusvoice-ai.onrender.com
   ```
4. Click **Create Web Service**
5. Note the URL: `https://campusvoice-backend.onrender.com`

---

## Step 4: Update Frontend API URL

Before deploying frontend, update `src/lib/api.ts`:
```ts
const BASE_URL = 'https://campusvoice-backend.onrender.com/api'
```

Then rebuild:
```bash
npm run build
```

---

## Step 5: Deploy Frontend (Static Site)

1. **New → Static Site**
2. Settings:
   - **Name**: `campusvoice-admin`
   - **Root Directory**: `campus voice authorities`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
3. No environment variables needed (Firebase config is in source)
4. Click **Create Static Site**
5. URL: `https://campusvoice-admin.onrender.com`

---

## Step 6: Verify

Check all 3 services are live:
```
https://campusvoice-ai.onrender.com/health
https://campusvoice-backend.onrender.com/api/health
https://campusvoice-admin.onrender.com
```

---

## Notes
- Free tier services **spin down after 15 min of inactivity** — first request takes ~30s to wake up
- Upgrade to Starter ($7/mo) to keep services always-on for the hackathon demo
- `FIREBASE_PRIVATE_KEY` must be pasted with literal `\n` — Render handles it correctly
