# Project Brief

## What We're Building

Spotter ELD is a trip planner for property-carrying truck drivers that auto-generates FMCSA-compliant Electronic Logging Device (ELD) daily logs from a single trip input.

The driver provides four pieces of information — current location, pickup, dropoff, and hours already used in the current 8-day cycle — and the system computes the entire trip: route, mandatory stops, rest breaks, and daily duty status logs that comply with the federal Hours of Service regulations defined in 49 CFR Part 395.

The output is two-layered: a modern UI for the driver (interactive map, day-by-day timeline, compliance indicators) and a faithful reproduction of the FMCSA paper log sheet for inspectors and dispatchers who need to read the legal artifact in its expected format.

## Why It Matters

Today, even with electronic logging hardware in trucks, planning a trip that respects HOS regulations is largely a manual exercise. Drivers and dispatchers calculate driving windows, fueling stops, and rest periods by hand or rely on tools that surface raw data without recommending action.

This project replaces that mental math with a deterministic simulator. Given a trip, the system generates a legally compliant schedule and the corresponding daily log sheets — eliminating manual entry and reducing the risk of HOS violations.

The deeper bet is that the trip-to-logs problem is the foundation of modern fleet automation. Whoever owns this calculation owns the planning layer above ELD hardware.

## Target User

Primary user: a property-carrying CMV driver operating under the 70-hour / 8-day cycle in interstate commerce.

Secondary users: dispatchers planning loads, and DOT inspectors reviewing logs at roadside or audit. The dual-output design (modern UI + paper log clone) serves both audiences from the same data.

## Core Inputs

The user provides exactly four fields:

1. **Current location** — where the driver is starting from
2. **Pickup location** — where the load is picked up
3. **Dropoff location** — where the load is delivered
4. **Current cycle used (hours)** — total on-duty hours accumulated in the current 8-day period

No duty status entries. No manual log filling. The system derives everything.

## Core Outputs

1. **Route map** with the full driving path and markers for every required stop (fuel, mandatory breaks, rest periods, pickup, dropoff)

2. **Daily log sheets** — one per calendar day of the trip, rendered in two views:
   - Modern timeline view (4 duty status rows, color-coded blocks)
   - FMCSA paper-log view (visual replica of the official Driver's Daily Log form, exportable as PDF)

3. **Trip summary** — total drive time, total trip duration, fuel stops, cycle hours remaining, compliance status

## Key Constraints

**Regulatory (per 49 CFR Part 395):**
- 11-hour driving limit per duty cycle
- 14-hour driving window from start of duty
- 30-minute break required after 8 cumulative driving hours
- 70-hour on-duty limit on a rolling 8-day window
- 10 consecutive hours off-duty required before next cycle

**Project assumptions (per assessment brief):**
- Property-carrying driver, 70-hour / 8-day schedule
- No adverse driving conditions
- Fueling stop at least every 1,000 miles
- 1 hour on-duty for pickup, 1 hour on-duty for dropoff

**Engineering:**
- Stack constrained to Django (backend) and React (frontend) per the brief
- Free map API only (using OpenRouteService + Leaflet)
- 16-hour build budget — scope must be ruthlessly prioritized
- Hosted live (Vercel for frontend, Railway for backend)

## Success Criteria

The submission is successful if:

1. **The simulator is correct.** Given a valid trip input, the generated logs do not violate any of the seven HOS rules codified in `HOS_RULES.md`. This is verifiable by automated tests.

2. **The UI is credible.** The interface looks like 2026 software a fleet would actually deploy — not a homework assignment. The FMCSA log sheet view is recognizable to a DOT inspector at a glance.

3. **The architecture is clean.** The HOS simulation is a pure module independent of Django, fully testable, and the API surface is a thin wrapper around it. A senior engineer reading the codebase should see clear boundaries between calculation, transport, and presentation.

4. **The artifact tells a story.** The git history, README, and Loom walkthrough together demonstrate deliberate scoping, explicit tradeoffs, and senior-level judgment about where to invest the limited time.
