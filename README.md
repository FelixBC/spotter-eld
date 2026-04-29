# Spotter ELD

Trip planner for property-carrying truck drivers that auto-generates
FMCSA-compliant ELD daily logs and route maps from a single trip input.

**Live Demo:** https://spotter-eld-gamma.vercel.app

## What It Does

Enter four fields — current location, pickup, dropoff, and cycle hours
used — and get back a fully planned, legally-compliant trip schedule with:

- Interactive route map with mandatory stop markers
- Day-by-day timeline view with color-coded duty status
- FMCSA Driver's Daily Log sheets (faithful paper form replica)
- Automatic HOS rule enforcement (11h limit, 14h window, 30-min break,
  70-hour cycle, 34-hour restart)

## Stack

- **Backend:** Django 5 + Django REST Framework → Railway
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS → Vercel
- **Maps:** Leaflet + OpenRouteService
- **Testing:** pytest (26 tests, all passing)

## Architecture

The HOS simulator (`backend/simulator/`) is pure Python with zero Django
dependency. It takes a `TripInput` and returns a `TripPlanResult` —
Django is a thin REST wrapper around it.

See `docs/` for full specifications:
- `BRIEF.md` — product vision
- `HOS_RULES.md` — FMCSA rules enforced
- `ALGORITHM.md` — simulation decisions and edge cases

## Running Locally

**Backend:**
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # add your ORS_API_KEY
python manage.py migrate
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env.local  # set VITE_API_URL=http://localhost:8000
npm run dev
```

**Tests:**
```bash
cd backend
pytest simulator/tests/ -v
```

## Known Limitations

- Sleeper berth 7+3 split not implemented (full 10h reset only)
- Cycle hours use flat balance (no rolling 8-day window falloff)
- Map stop positions use linear interpolation (not real highway routing)
- Home terminal timezone hardcoded to America/Chicago

## Assessment Notes

Built for Spotter AI Full Stack Developer assessment.
Time spent: ~16 hours over 2 days.
