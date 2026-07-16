# Put Kasuwa on the internet (no code on other laptops)

Anyone with the link can open the site in a normal browser. They do **not** install Node or copy the project.

## Option A — Railway (recommended)

Railway gives you a public URL like `https://your-app.up.railway.app`.

### 1. Create an account

1. Go to [https://railway.app](https://railway.app)
2. Sign up (GitHub login is easiest)

### 2. Put the project on GitHub (needed for easy deploy)

On your Dell, in PowerShell:

```powershell
cd C:\Users\ikwydick\Desktop\pos-inventory
git init
git add .
git commit -m "Kasuwa POS ready to host"
```

Then create a new empty repo on GitHub and push (GitHub will show the exact `git remote` / `git push` commands).

### 3. Deploy on Railway

1. In Railway: **New Project** → **Deploy from GitHub repo**
2. Select `pos-inventory`
3. After the first deploy starts, open the service → **Variables** and add:

| Variable | Value |
|----------|--------|
| `SESSION_SECRET` | a long random string (at least 32 characters) |
| `DATABASE_URL` | `file:/data/prod.db` |
| `UPLOAD_DIR` | `/data/uploads` |
| `SEED_ON_START` | `true` (first time only, then remove or set to `false`) |

4. Add a **Volume** so your data is kept:
   - Mount path: `/data`
5. Open **Settings** → **Networking** → **Generate Domain**
6. Wait for the deploy to finish, then open the public URL
7. Sign in with `admin@store.local` / `password123`
8. Change the admin password after first login (create a new admin user, or edit users in Admin)

### 4. Share the link

Send people the Railway URL. They only need a browser.

---

## Option B — Temporary link from your Dell (no Railway)

Your Dell stays on and shares the site for a short time with [https://ngrok.com](https://ngrok.com):

1. Start the app with `START.bat`
2. Install ngrok and run: `ngrok http 3000`
3. Share the `https://....ngrok-free.app` link

**Downside:** when the Dell sleeps or `START.bat` stops, the site goes offline.

---

## What other people need

- A phone, tablet, or laptop
- The website link
- A login you create for them (Admin → Users)

They never need the `pos-inventory` folder or any code.
