# 📦 Packing Tracker — Shrus / Majorrangas

Full-stack hourly order packing tracker with PostgreSQL backend.

## Stack
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Railway.app)
- **Frontend**: Single-file HTML (served from `/public`)
- **Auth**: JWT + bcrypt

## Default Logins
| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Admin |
| operator | operator123 | Operator |

> ⚠️ Change passwords after first login via Admin panel.

---

## Deploy to Railway.app

### 1. Create Railway Project
1. Go to [railway.app](https://railway.app) → New Project
2. Click **Deploy from GitHub repo** (push this folder first)
   OR use **Empty Project** → add service manually

### 2. Add PostgreSQL
1. In your Railway project → **+ New** → **Database** → **PostgreSQL**
2. Copy the `DATABASE_URL` from the PostgreSQL service's **Variables** tab

### 3. Set Environment Variables
In your web service → **Variables** tab, add:
```
DATABASE_URL=<paste from PostgreSQL service>
JWT_SECRET=pick_any_long_random_string
PORT=3000
```

### 4. Deploy
Railway auto-deploys on git push. The DB tables are created automatically on first run.

---

## Local Development

```bash
cd backend
npm install
cp .env.example .env
# Fill in DATABASE_URL in .env
npm run dev
```

Open: http://localhost:3000

---

## Features

### 📝 Daily Entry
- 9 hourly slots (08:30 – 17:30)
- Fields: Picked, Packed, Dispatched, Pending, Avg Pick/Pack Time, Errors, Picker, Packer, Supervisor, Notes
- **Auto-saves on every field blur** — no save button needed
- Current time slot highlighted in green
- Pick % and Pack % badges (green ≥90%, amber ≥70%, red <70%)
- Live KPI cards at top

### 📊 Dashboard
- KPI cards: Picked, Packed, Dispatched, Pending, Pack Rate, Errors, Avg Times
- Bar charts: Picked vs Packed per hour, Avg times per hour
- Full hourly detail table

### 📅 History
- Last 30 days at a glance
- Click any date to jump to that day's entry

### ⚙️ Admin (admin role only)
- Create new users
- View all users and roles
