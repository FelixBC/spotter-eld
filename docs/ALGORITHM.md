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

## Algorithm Design Decisions

### Grilling Session — April 28, 2026

1. 30-minute break counter tracks cumulative driving minutes only (driving_minutes_since_break). Increments on DRIVING status exclusively. Resets only on a qualifying break: 30+ consecutive minutes of OFF_DUTY, SLEEPER_BERTH, or ON_DUTY_NOT_DRIVING. Completely independent from the 11-hour and 14-hour counters.
2. Sleeper-berth split (7/3) is out of scope. Every HOS reset is a full 10 consecutive hours off-duty. Document as known limitation in ALGORITHM.md, README trade-offs, and Loom walkthrough.
3. Cycle balance is a flat number. remaining = 70 - cycle_hours_used, constant for the trip. No per-day falloff modeling. Document as known limitation — rolling window requires historical data the API doesn't accept.
4. Mid-leg splits use linear interpolation. split_leg(leg, drive_minutes_remaining) → (partial_leg, remainder_leg). Loop invariant: check all remaining capacities before consuming any leg segment, split at the tightest constraint, insert mandatory event, resume with remainder.
5. 14-hour window starts at trip_start_time. window_end = trip_start_time + 14h. All on-duty time (driving and not-driving) counts against it. Pickup and dropoff dwells consume window time.
6. Coincident stops merge locations, never duty statuses. Proximity threshold: 50 miles or 1 hour. Fuel stop advances to break location. Sequence: BREAK first (satisfies HOS), FUEL second (separate ON_DUTY_NOT_DRIVING event). miles_since_fuel resets after the fuel event only.
7. Log sheet day boundaries use a fixed home terminal timezone. HOME_TERMINAL_TZ = "America/Chicago" hardcoded for assessment. Never switches as truck moves. Document as known limitation — production would accept home_terminal_timezone as optional API input.
8. Exactly one 34-hour restart is modeled. When cycle balance hits zero: insert 34-hour OFF_DUTY block, reset cycle hours to 0, reset daily driving hours, reset window_start to restart end time, continue. If trip still infeasible after one restart, return hos_infeasible violation. Multiple restarts are out of scope.
