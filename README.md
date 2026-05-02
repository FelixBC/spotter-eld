# Spotter ELD

Trip planner for property-carrying truck drivers that auto-generates
FMCSA-compliant ELD daily logs and route maps from a single trip input.

**Live Demo:** https://spotter-eld-gamma.vercel.app  
**Backend:** https://spotter-eld-production.up.railway.app

## What It Does

Enter four fields — current location, pickup, dropoff, and cycle hours
used — and get back a fully planned, legally-compliant trip schedule with:

- Interactive route map with click-to-set location pins
- Day-by-day timeline with color-coded duty status bars
- DOT 11h check per day showing driving since last 10h reset
- Cross-day continuous rest pills (10h reset ✓ and 34h restart ✓)
- FMCSA Driver's Daily Log sheets (faithful paper form replica)
- Hours displayed in hours and minutes (not decimal) for DOT readability
- Automatic HOS rule enforcement:
  - 11-hour driving limit per duty window
  - 14-hour on-duty window
  - 30-minute mandatory break after 8 cumulative driving hours
  - 10-hour consecutive rest requirement
  - 70-hour/8-day cycle limit
  - 34-hour cycle restart

## Stack

- **Backend:** Django 5 + Django REST Framework → Railway
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS → Vercel
- **Maps:** Leaflet + OpenRouteService
- **Testing:** pytest (37 tests, all passing)

## Architecture

The HOS simulator (`backend/simulator/`) is pure Python with zero Django
dependency. It takes a `TripInput` and returns a `TripPlanResult` —
Django is a thin REST wrapper around it.

The frontend compliance display (`TimelineView`) walks all events as one
continuous timestamp stream using real ISO timestamps, never resetting
the driving accumulator at calendar midnight. Rest runs are detected by
exact timestamp contiguity so cross-midnight rest periods are correctly
merged before the 10h threshold check.

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

## Test Scenarios

The test suite covers eight explicit FMCSA compliance scenarios:

| # | Route | Cycle h | Rule exercised |
|---|-------|---------|----------------|
| 1 | Chicago → St. Louis → Memphis | 0 | 11h driving limit, single window |
| 2 | Chicago → Indianapolis → Nashville | 0 | 30-min break after 8h driving |
| 3 | Dallas → Oklahoma City → Kansas City | 60 | Cross-midnight 10h rest detection |
| 4 | Los Angeles → Las Vegas → Salt Lake City | 0 | 14h window before 11h driving |
| 5 | Chicago → Denver → Los Angeles | 65 | 70h cycle exhaustion masks 11h limit |
| 6 | Chicago → Dallas → Los Angeles | 68 | 34h restart scheduled and credited |
| 7 | Atlanta → Birmingham → Nashville | 0 | Two legal windows on same calendar day |
| 8 | New York → Chicago → Los Angeles | 0 | Full stress test, all rules fire |

## Known Limitations

- Sleeper berth 7+3 split not implemented (full 10h reset only)
- Cycle hours use flat balance (no rolling 8-day window falloff)
- Map stop positions use linear interpolation (not real highway routing)
- Home terminal timezone hardcoded to America/Chicago

## About

Built for Spotter AI Full Stack Developer assessment.  
Time spent: ~16 hours over 2 days.
