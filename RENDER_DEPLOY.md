# Render Deployment Guide — Trinity Sales Mission

## Prerequisites
- GitHub account
- Render account (render.com) — free tier works

---

## Step 1: Push to GitHub

```bash
# On your local machine (or paste these into the Render shell):
git remote add origin https://github.com/YOUR_USERNAME/trinity-sales-mission.git
git push -u origin master
```

Or create a new repo at github.com/new, name it `trinity-sales-mission`, then push.

---

## Step 2: Create Render Web Service

1. Go to https://dashboard.render.com/new/web
2. Connect your GitHub repo
3. Fill in:

| Field | Value |
|---|---|
| Name | trinity-sales-mission |
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `NODE_ENV=production node dist/index.cjs` |
| Instance Type | Free |

4. Click **Advanced** → **Add Disk**:

| Field | Value |
|---|---|
| Name | sqlite-data |
| Mount Path | `/data` |
| Size | 1 GB |

---

## Step 3: Set Environment Variables

In Render dashboard → Environment tab, add:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `/data/data.db` |
| `SMTP_USER` | `ryan@trinitystaffing.com` |
| `SMTP_PASS` | your M365 app password |
| `APP_URL` | https://trinity-sales-mission.onrender.com (your Render URL) |

---

## Step 4: Deploy

Click **Deploy** — Render builds and starts the server in ~2 minutes.
Your live URL will be: `https://trinity-sales-mission.onrender.com`

---

## Step 5: Update the Extension

1. Open the Trinity Sales Mission Clipper extension
2. Click **⚙ Settings** at the bottom
3. Paste your Render URL: `https://trinity-sales-mission.onrender.com`
4. Click **Save**

The extension now saves events directly to your live Render backend — no more preview-only limitation.

---

## Step 6: Update the Bookmarklet

In the Sales Mission app → Settings, the bookmarklet URL will automatically use the live backend once `APP_URL` is set.

You can also update the bookmarklet manually:
```
javascript:(function(){var u=encodeURIComponent(location.href);window.open('https://trinity-sales-mission.onrender.com/#/add?url='+u,'_blank','noopener');})();
```

---

## Render Free Tier Notes

- Free services **spin down after 15 min of inactivity** and take ~30 sec to wake up on next request
- Upgrade to Starter ($7/mo) to keep it always-on
- The SQLite database persists on the disk — data survives deploys and restarts
