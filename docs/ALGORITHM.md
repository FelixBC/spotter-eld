# Trip Simulator Algorithm

High-level pseudocode for turning trip inputs into a compliant timeline, route, and ELD-style log sheets. Implementation details belong in backend services and tests.

## Inputs

- **Geography:** Current location, pickup location, dropoff location (coordinates or resolvable addresses).
- **HOS state:** Hours already used in the current cycle (e.g. `cycle_hours_used` toward the 70-hour/8-day limit).
- **Assumptions:** Vehicle speed profile, mandatory breaks, fuel-stop spacing, pickup/dropoff dwell times (see [HOS_RULES.md](HOS_RULES.md) project assumptions).

## Outputs

- **Route:** Ordered path or legs with distances and cumulative miles.
- **Timeline events:** Time-ordered segments (driving, on-duty not driving, off duty, sleeper, fuel, break) with start/end timestamps.
- **Log sheets:** FMCSA-style daily grids or event lists derived from the timeline.
- **Summary:** Totals (distance, driving time, on-duty time, ETA, violations avoided or flagged).

## Pseudocode

1. **Normalize inputs** — Geocode or validate coordinates; resolve pickup/dropoff order and dwell durations.
2. **Build base route** — Call routing engine (e.g. OpenRouteService) for path geometry and leg distances/times at a reference speed.
3. **Initialize clock** — Set simulation clock to trip start; load remaining daily driving limit, 14-hour window, break requirement, and 70-hour bank from `cycle_hours_used`.
4. **Walk the route** — For each leg, accumulate driving time; when a limit is hit (11h drive, 14h window, 8h without break, 70h cycle), insert mandatory off-duty or sleeper segment per rules.
5. **Insert operational stops** — Add pickup/dropoff on-duty blocks; insert fuel stops every ~1000 driven miles as on-duty or off-duty per product decision.
6. **Emit timeline** — Produce ordered events with duty status and location (or leg index).
7. **Roll up by calendar day** — Split timeline at midnight (driver’s time zone) to build daily log sheets.
8. **Compute summary** — Aggregate miles, hours by duty status, arrival time, and any rule violations or warnings.

## Edge Cases

- **Infeasible trip:** Total driving required cannot fit within HOS even with legal rest; return a clear error or partial plan with explanation.
- **Cycle exhaustion mid-trip:** Driver hits 70/8 before completion; require extended off-duty (e.g. 34-hour) in the plan or fail fast per API contract.
- **Timezone boundaries:** Midnight rollover and DST transitions must not corrupt day boundaries on log sheets.
- **Short legs / urban routing:** Very short driving segments should still respect minimum dwell and break sequencing without oscillation.
- **Missing or ambiguous addresses:** Validation fails before routing; partial coordinates use documented defaults or errors only as specified in the API.
