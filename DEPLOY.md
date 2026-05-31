# Deploy Tejas (iPhone-ready, always on)

Deploy the **backend** on [Railway](https://railway.app) and the **frontend** on [Vercel](https://vercel.com). You get HTTPS, a public URL, and **Add to Home Screen** on iPhone from anywhere (Wi‑Fi or cellular).

Estimated time: **15–20 minutes**.

---

## Before you start

1. **GitHub account** — push this `tejas` folder to a repo (Railway + Vercel connect to GitHub).
2. **Gemini API key** — from [Google AI Studio](https://aistudio.google.com/apikey) (starts with `AIza...`).  
   Set it only in Railway/Vercel dashboards, never in git.
3. **Free tiers** — Railway (~$5 credit/month) + Vercel (free hobby) are enough for personal use.

---

## Part 1 — Backend on Railway (~10 min)

### 1. Push code to GitHub

```bash
cd tejas
git init
git add .
git commit -m "Tejas initial deploy"
# Create an empty repo on GitHub, then:
git remote add origin https://github.com/YOUR_USER/tejas.git
git push -u origin main
```

### 2. Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Select your repo.
3. **Important:** set **Root Directory** to `backend` (Project → Settings → Root Directory → `backend`).

### 3. Environment variables

In Railway → your service → **Variables**, add:

| Variable | Value |
|----------|--------|
| `GEMINI_API_KEY` | Your Gemini key (`AIza...`) |
| `DATA_DIR` | `/data` |
| `ALLOWED_ORIGINS` | Leave empty for now — add your Vercel URL after Part 2 |

Railway sets `PORT` automatically.

### 4. Persistent storage (so logs are not wiped)

1. Railway → service → **Volumes** → **Add Volume**.
2. Mount path: **`/data`**
3. Redeploy if prompted.

SQLite + meal photos live under `/data/db` and `/data/uploads`.

### 5. Public URL

1. **Settings** → **Networking** → **Generate Domain**  
   Example: `https://tejas-backend-production.up.railway.app`
2. Open `https://YOUR-RAILWAY-URL/api/health` — you should see `"ai":"live"` and `"provider":"gemini"`.

Copy this URL — you need it for Vercel.

---

## Part 2 — Frontend on Vercel (~5 min)

### 1. Import project

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → import the same GitHub repo.
2. **Root Directory:** `frontend`
3. Framework: **Vite** (auto-detected)

### 2. Environment variable

| Name | Value |
|------|--------|
| `VITE_API_URL` | Your Railway URL **without** `/api` — e.g. `https://tejas-backend-production.up.railway.app` |

Apply to **Production** (and Preview if you want).

### 3. Deploy

Click **Deploy**. When done you get something like:

`https://tejas-xxxxx.vercel.app`

### 4. Finish CORS on Railway

Back in Railway → **Variables**, set:

```
ALLOWED_ORIGINS=https://tejas-xxxxx.vercel.app
```

Use your exact Vercel URL (no trailing slash). Redeploy the backend.

If you use Vercel preview URLs later, add them comma-separated:

```
ALLOWED_ORIGINS=https://tejas-xxxxx.vercel.app,https://tejas-git-main-you.vercel.app
```

---

## Part 3 — Install on iPhone

1. Open **Safari** (not Chrome — only Safari can “Add to Home Screen” with full PWA support).
2. Go to your Vercel URL: `https://tejas-xxxxx.vercel.app`
3. Complete **onboarding** once.
4. Tap **Share** (□↑) → **Add to Home Screen** → **Add**.

Tejas opens fullscreen with your flame icon. Works on cellular, with camera for food photos and Gemini live.

### Tips

- **Notifications / background:** iOS PWAs are limited; open the app daily for briefings.
- **Voice logging:** works better over HTTPS than on local Wi‑Fi HTTP.
- **Updates:** push to GitHub → Vercel/Railway auto-redeploy.

---

## Checklist

| Step | Done? |
|------|--------|
| Railway root = `backend` | ☐ |
| Volume mounted at `/data` | ☐ |
| `GEMINI_API_KEY` set on Railway | ☐ |
| `/api/health` shows `"ai":"live"` | ☐ |
| Vercel root = `frontend` | ☐ |
| `VITE_API_URL` = Railway URL | ☐ |
| `ALLOWED_ORIGINS` = Vercel URL | ☐ |
| Added to iPhone Home Screen | ☐ |

---

## Troubleshooting

**App loads but API fails (network / CORS)**  
- Check `VITE_API_URL` matches Railway URL exactly.  
- Check `ALLOWED_ORIGINS` includes your Vercel URL.  
- Redeploy both after changing env vars.

**`"ai":"mock"` on health**  
- `GEMINI_API_KEY` missing or wrong on Railway.

**Data disappeared after redeploy**  
- Volume not mounted at `/data`, or `DATA_DIR` not set to `/data`.

**Photo analyze fails**  
- Confirm Gemini key is valid; check Railway logs (Deployments → View logs).

---

## Optional: custom domain

- **Vercel:** Project → Settings → Domains → add e.g. `tejas.yourdomain.com`
- Update `ALLOWED_ORIGINS` on Railway to include that domain.

---

*Backend: Railway + SQLite on volume. Frontend: Vercel + PWA. AI: Gemini.*
