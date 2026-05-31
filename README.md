# Tejas — Personal Operating System

> AI-powered personal health agent fleet. Sanskrit for *radiance / vitality*.
> Goal: Cut (lose fat) · Diet: Eggetarian · Training: Gym + Running

A multi-agent system that helps you cut fat through eggetarian nutrition, gym
training, and running. Five agents, one daily rhythm, photo-first logging.

## The fleet

| Agent | Sanskrit | Domain | Accent |
|-------|----------|--------|--------|
| **Anna** | अन्न | Nutrition — eggetarian Indian food, photo + voice logging | lime |
| **Agni** | अग्नि | Calories & macros — TDEE recalibration, deficit tracking | amber |
| **Bala** | बल | Workout — PPL split + 2-3 runs/week, progressive overload | blue |
| **Nidra** | निद्रा | Recovery — sleep, hydration, soreness | purple |
| **Sage** | — | Chief coach — morning briefing, evening check-in, weekly recap | pink |

## Killer features

1. **Photo-first food logging** — snap a thali, Claude vision returns structured
   macros (knows dal, sabzi, paneer, eggs natively).
2. **Voice logging** — "had 2 rotis and dal for lunch" → parsed automatically.
3. **Morning briefing + evening check-in** — a daily rhythm, not passive tracking.
4. **Multi-agent lens** — the same data through 5 perspectives.
5. **Persistent memory** — episodes → entities; the system learns your patterns.

## Stack

- **Frontend:** React (Vite) + Tailwind CSS + Recharts
- **Backend:** Node.js + Express
- **Database:** SQLite (better-sqlite3)
- **AI:** Anthropic Claude (vision for food photos, chat per agent)
- **PWA:** installable on your phone (manifest + service worker)

## Quick start

```bash
# 1. Install everything (root, backend, frontend)
cd tejas
npm install          # installs root dev dep (concurrently)
npm run install:all  # installs backend + frontend deps

# 2. Add your Anthropic key (optional — app runs in MOCK mode without it)
cp backend/.env.example backend/.env
#   then edit backend/.env and set ANTHROPIC_API_KEY

# 3. Run both servers
npm run dev
#   backend → http://localhost:3001
#   frontend → http://localhost:5173
```

Open http://localhost:5173, complete onboarding, and start logging.

> **No API key?** The app still works end-to-end in **MOCK mode**: the photo
> analyzer, meal parser, chat, and briefing return realistic placeholder data so
> you can explore the full UI. Add `ANTHROPIC_API_KEY` to switch to live Claude.

## Safety guardrails (built in)

- Hard calorie floor at **1500 kcal/day** (requires explicit override to go lower)
- Deficit capped at **500 kcal/day**
- Protein minimum **1.2 g/kg** (target 1.8 g/kg)
- Weight-loss rate **>1%/week is flagged**
- Streaks celebrate consistency, never shame a missed day
- Every agent finding is a **suggestion you can dismiss**, not a rule

## Project layout

```
tejas/
├── backend/   Express API, SQLite, Claude calls, nutrition math + guardrails
└── frontend/  React UI shell (Vite + Tailwind), PWA assets
```

## Deploy to your iPhone (always on)

See **[DEPLOY.md](./DEPLOY.md)** — Railway (backend) + Vercel (frontend), then **Add to Home Screen** in Safari.

## Roadmap

Voice logging ✓ · PWA ✓ · Deploy guide ✓ · then: wearable sync (HealthKit / Health Connect),
photo gallery, recipe generation, restaurant mode, one-command deploy.

---

*Built for: Sorabh — eggetarian, cutting, gym + runs. Powered by Claude + SQLite + your daily logs.*
