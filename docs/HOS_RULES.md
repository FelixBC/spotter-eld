# HOS Rules (FMCSA Part 395 — Property-Carrying CMV)

This document lists numbered constraints used by the trip planner and simulator. It is a working summary for engineering; verify against current FMCSA rules before production use.

## Driving Limits

1. **11-hour driving limit:** A driver may drive at most 11 hours after coming on duty following 10 consecutive hours off duty before requiring another off-duty reset.
2. **14-hour on-duty window:** A driver may not drive after the 14th consecutive hour after coming on duty following 10 consecutive hours off duty, even if some time was off-duty or in the sleeper berth within that window (subject to sleeper-berth provisions where applicable).
3. **30-minute break:** A driver who has driven 8 cumulative hours without at least 30 consecutive minutes of non-driving time (OFF_DUTY, SLEEPER_BERTH, or ON_DUTY_NOT_DRIVING) may not drive until that break is taken. The break must be consecutive — short non-consecutive periods cannot be combined to reach 30 minutes. (FMCSA 395.3(a)(3)(ii), HOS Guide April 2022 p.10)

## Cycle Limits

4. **70-hour / 8-day limit:** A driver may not drive after accumulating 70 hours of on-duty time (driving and non-driving) in any rolling 8-day period when operating under the 70-hour/8-day rule.
5. **34-hour restart:** A driver may reset the 60/70-hour weekly clock after taking at least 34 consecutive hours off duty (and/or sleeper berth as permitted) before resuming driving under a fresh calculation period.

## Off-Duty Requirements

6. **10-hour consecutive reset:** Before starting a new daily driving period, the driver must have at least 10 consecutive hours off duty and/or in the sleeper berth (combined as allowed) after the prior qualifying period ends.
7. **7/3 sleeper-berth split (where used):** When using the optional sleeper-berth split, one off-duty period must be at least 7 consecutive hours in the sleeper berth and the other at least 3 consecutive hours off duty or in the sleeper, pairing to satisfy rest requirements without a single 10-hour block.

## Project Assumptions

- The driver operates under the **70-hour / 8-day** cycle unless the brief specifies otherwise.
- **No adverse driving conditions** extension is modeled unless explicitly added later.
- **Fuel stops** are planned approximately every **1000 miles** of driving along the route.
- **Pickup and dropoff** each block **1 hour** of on-duty, not-driving time at the respective locations.
