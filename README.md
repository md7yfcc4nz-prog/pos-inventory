# Kasuwa — Multi-Store POS & Inventory

Browser-based point of sale and inventory system with admin/staff roles, multi-store support, low-stock and expiry alerts, barcodes, and product images.

## Where is the project?

**Folder path on this Dell:**

`C:\Users\ikwydick\Desktop\pos-inventory`

Open that folder in File Explorer, or in Cursor / VS Code:

1. **File → Open Folder…**
2. Choose `Desktop\pos-inventory`

## Use it on this Dell laptop (quick start)

1. Open **File Explorer** → **Desktop** → folder **`pos-inventory`**
2. Double-click **`START.bat`**
3. Wait until the terminal says the app is ready
4. Browser should open to [http://localhost:3000](http://localhost:3000) (if not, open that link yourself)
5. Sign in:
   - Admin: `admin@store.local` / `password123`
   - Staff: `staff@store.local` / `password123`
6. Leave the black terminal window **open** while you use the site
7. To stop: click that window and press **Ctrl+C**

### If START.bat fails

1. Install **Node.js LTS** from [https://nodejs.org](https://nodejs.org) (Restart the laptop after install)
2. Open **PowerShell** and run:

```powershell
cd C:\Users\ikwydick\Desktop\pos-inventory
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000)

### Move to a different Dell laptop

1. Copy the whole `pos-inventory` folder (USB drive, OneDrive, etc.)
2. On the other Dell, install Node.js LTS from [https://nodejs.org](https://nodejs.org)
3. Double-click `START.bat` inside the copied folder
4. First run may take a few minutes while it installs packages

## Put it online (no code on other laptops)

Yes — host it once, then anyone opens the link in a browser.

See **[DEPLOY.md](DEPLOY.md)** for step-by-step Railway (permanent URL) or ngrok (temporary link from this Dell).

Short version:
1. Push this folder to GitHub
2. Deploy on [railway.app](https://railway.app)
3. Share the `https://…railway.app` link
4. Others only need that link + a login — no Node, no project files

## Requirements

- Node.js 20+ (LTS recommended)
- npm

## Setup / run the site

```bash
cd C:\Users\ikwydick\Desktop\pos-inventory
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Leave the terminal open while you use the site. Stop it with `Ctrl+C`.

## Demo accounts

| Role  | Email               | Password     |
|-------|---------------------|--------------|
| Admin | admin@store.local   | password123  |
| Staff | staff@store.local   | password123  |

Admin can access both seeded stores. Staff is assigned to **Downtown Pharmacy** only.

---

## How to edit the site

### 1. Open the project

Open `C:\Users\ikwydick\Desktop\pos-inventory` in Cursor or VS Code.

### 2. Start the site in development mode

In the terminal:

```bash
cd C:\Users\ikwydick\Desktop\pos-inventory
npm run dev
```

Keep this running. When you save a file, the browser usually refreshes automatically.

### 3. Edit the page you care about

| What you want to change | File to edit |
|-------------------------|--------------|
| Login page | `src\app\login\page.tsx` |
| Dashboard | `src\app\(app)\page.tsx` |
| Inventory list | `src\app\(app)\inventory\page.tsx` |
| Add / edit product form | `src\app\(app)\inventory\[id]\page.tsx` |
| Point of Sale | `src\app\(app)\pos\page.tsx` |
| Sales history | `src\app\(app)\sales\page.tsx` |
| Admin stores | `src\app\(app)\admin\stores\page.tsx` |
| Admin users | `src\app\(app)\admin\users\page.tsx` |
| Sidebar / top bar | `src\components\AppShell.tsx` |
| Colors, fonts, layout look | `src\app\globals.css` |
| Site title / fonts | `src\app\layout.tsx` |

### 4. Edit backend / data behavior

| What you want to change | File / folder |
|-------------------------|---------------|
| Login / logout / session | `src\app\api\auth\` and `src\lib\auth.ts` |
| Products API | `src\app\api\products\` |
| Sales / checkout API | `src\app\api\sales\` |
| Stores / users (admin) | `src\app\api\stores\`, `src\app\api\users\` |
| Dashboard numbers | `src\app\api\dashboard\route.ts` |
| Database tables | `prisma\schema.prisma` |
| Demo products / users | `prisma\seed.ts` |

After changing `prisma\schema.prisma`, run:

```bash
npx prisma migrate dev --name describe_your_change
```

After changing seed data and wanting a fresh demo database:

```bash
npm run db:seed
```

### 5. Change branding (name, colors)

1. App name in the sidebar: edit `src\components\AppShell.tsx` (look for `Kasuwa`).
2. Colors: edit CSS variables at the top of `src\app\globals.css` (`--brand`, `--accent`, `--bg`, etc.).
3. Browser tab title: edit `src\app\layout.tsx` (`metadata.title`).

### 6. Check your changes

1. Save the file.
2. Refresh [http://localhost:3000](http://localhost:3000) if it did not update.
3. Sign in again if you were logged out.

---

## Project layout

- `prisma/schema.prisma` — data model (SQLite)
- `prisma/seed.ts` — demo users, stores, products
- `src/app/(app)` — authenticated pages (dashboard, inventory, POS, sales, admin)
- `src/app/api` — REST API routes
- `src/components` — shared UI (sidebar, store switcher)
- `src/lib` — auth, database, helpers
- `public/uploads` — product images

## Notes

- Data is stored locally in `prisma/dev.db`
- Product images are saved under `public/uploads`
- Barcode scanners that act as keyboards work in the POS search field (scan + Enter)
- Editing the site means editing these project files — the browser only *displays* the app; it does not store the source code
