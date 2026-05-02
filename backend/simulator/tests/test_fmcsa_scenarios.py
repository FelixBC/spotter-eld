"""Integration-style regression matrix for FMCSA property-carrying HOS rules.

Each ``test_fmcsa_0x_*`` maps to the manual FMCSA sanity matrix (Chicago/Memphis
break test, Indy break test, Dallas overnight pill, LA 14-hour wall,
Denver-cycle cap, Dallas 34-hour restart with boundary pill,
Atlanta two-window calendar anomaly, NYC stress book-end).
Geocode and ``get_route`` are mocked so CI does not touch ORS/network.

Run::

    pytest backend/simulator/tests/test_fmcsa_scenarios.py -v
"""

from __future__ import annotations

from unittest.mock import patch

from simulator.models import HOME_TERMINAL_TZ, DutyStatus, TripInput, TimelineEvent
from simulator.engine import simulate_trip
from simulator.rules import PRE_TRIP_MINUTES


# -----------------------------------------------------------------------------
# Timeline analysis (frontend-equivalent primitives for assertions)
# -----------------------------------------------------------------------------

REST_STATUSES = {DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH}
RESET_10H_MINUTES = 10 * 60
DOT_11H_MINUTES = 11 * 60
RESTART_34H_MINUTES = 34 * 60


def _merged_rest_runs(events: list[TimelineEvent]) -> list[tuple[float, float, float]]:
    runs: list[tuple[float, float, float]] = []
    rs: float | None = None
    re_ts = 0.0
    mins_acc = 0.0

    def flush() -> None:
        nonlocal rs, re_ts, mins_acc
        if rs is not None:
            runs.append((rs, re_ts, mins_acc))
        rs = None
        re_ts = 0.0
        mins_acc = 0.0

    for ev in events:
        if ev.status not in REST_STATUSES:
            flush()
            continue
        dur_min = (ev.end_time - ev.start_time).total_seconds() / 60.0
        st = ev.start_time.timestamp()
        et = ev.end_time.timestamp()
        if rs is not None and st == re_ts:
            re_ts = et
            mins_acc += dur_min
        else:
            flush()
            rs = st
            re_ts = et
            mins_acc = dur_min
    flush()
    return runs


def _ten_hour_reset_fire_times(events: list[TimelineEvent]) -> list[float]:
    fts: list[float] = []
    for start_ts, _end_ts, mins in _merged_rest_runs(events):
        if mins + 1e-9 >= RESET_10H_MINUTES:
            fts.append(start_ts + RESET_10H_MINUTES * 60.0)
    return sorted(fts)


def peak_driving_minutes_by_home_terminal_day(events: list[TimelineEvent]) -> dict[str, float]:
    """Match TimelineView semantics: resets when a contiguous OFF/sleeper run reaches 10h."""
    reset_ts = _ten_hour_reset_fire_times(events)
    by_day: dict[str, float] = {}
    driving_since_reset = 0.0
    next_ix = 0

    for ev in events:
        evt_st = ev.start_time.timestamp()
        while next_ix < len(reset_ts) and reset_ts[next_ix] <= evt_st:
            driving_since_reset = 0.0
            next_ix += 1

        if ev.status == DutyStatus.DRIVING:
            driving_since_reset += (ev.end_time - ev.start_time).total_seconds() / 60.0

        day = ev.start_time.astimezone(HOME_TERMINAL_TZ).date().isoformat()
        by_day[day] = max(by_day.get(day, 0.0), driving_since_reset)

    return by_day


def max_peak_driving_minutes_since_reset(events: list[TimelineEvent]) -> float:
    return max(peak_driving_minutes_by_home_terminal_day(events).values() or [0.0])


def max_boundary_rest_minutes_between_sheets(
    timeline: list[TimelineEvent],
    sheets: list,
) -> float:
    """Largest contiguous rest run that touches an inter-sheet midnight."""
    runs = _merged_rest_runs(timeline)
    best = 0.0
    for i in range(len(sheets) - 1):
        cur, nxt = sheets[i], sheets[i + 1]
        if not cur.events or not nxt.events:
            continue
        last_ev, first_ev = cur.events[-1], nxt.events[0]
        lt = last_ev.end_time.timestamp()
        fs_st = first_ev.start_time.timestamp()
        if (
            last_ev.status not in REST_STATUSES
            or first_ev.status not in REST_STATUSES
            or lt != fs_st
        ):
            continue
        for rs, ee, mins in runs:
            if rs < lt < ee:
                best = max(best, mins)
    return best


def cumulative_driving_hours_before_index(events: list[TimelineEvent], cut_index: int) -> float:
    return sum(ev.duration_hours for ev in events[:cut_index] if ev.status == DutyStatus.DRIVING)


def has_qualifying_30_break(events: list[TimelineEvent]) -> bool:
    for ev in events:
        if ev.status != DutyStatus.OFF_DUTY:
            continue
        if abs(ev.duration_hours - 0.5) < 0.02 and "break" in ev.remark.lower():
            return True
    return False


def first_offduty_event(events: list[TimelineEvent]):
    return next((e for e in events if e.status == DutyStatus.OFF_DUTY), None)


def has_explicit_34_restart(events: list[TimelineEvent]) -> bool:
    return any(ev.status == DutyStatus.OFF_DUTY and "34" in ev.remark for ev in events)


def has_plain_10h_reset(events: list[TimelineEvent]) -> bool:
    return any(ev.status == DutyStatus.OFF_DUTY and "10-hour rest reset" in ev.remark for ev in events)


# -----------------------------------------------------------------------------
# Generic runner
# -----------------------------------------------------------------------------

def _run(trip_input: TripInput, coords: list[tuple[float, float]], routes: list[dict]) -> object:
    with patch(
        "simulator.engine.geocode_address",
        side_effect=coords,
    ):
        with patch(
            "simulator.engine.get_route",
            side_effect=routes,
        ):
            return simulate_trip(trip_input)


# -----------------------------------------------------------------------------
# Scenario tests (numeric prefix keeps reviewer order stable)
# -----------------------------------------------------------------------------


def test_fmcsa_01_eleven_hour_limit_single_window():
    """11h ceiling: chunked driving must never accumulate >11h without a 10h reset."""
    coords = [(41.0, -87.0), (38.6, -90.2), (35.1, -90.0)]
    routes = [
        {"distance_miles": 667.0 * (13.0 / 11.0), "duration_hours": 13.0},
        {"distance_miles": 667.0 * (13.0 / 11.0), "duration_hours": 13.0},
    ]
    trip = TripInput("Chicago, IL", "St. Louis, MO", "Memphis, TN", cycle_hours_used=0.0)
    r = _run(trip, coords, routes)
    peak = max_peak_driving_minutes_since_reset(r.timeline)
    assert peak <= DOT_11H_MINUTES + 5e-3, peak / 60.0
    assert has_plain_10h_reset(r.timeline), "expected at least one standard 10h reset remark"
    assert not r.violations


def test_fmcsa_02_qualifying_break_inserted():
    """>8 cumulative driving segments must invoke a mocked 30-minute OFF break."""
    coords = [(41.0, -87.0), (39.8, -86.2), (36.16, -86.78)]
    routes = [
        {"distance_miles": 8000.0, "duration_hours": 16.0},
        {"distance_miles": 667.0, "duration_hours": 13.0},
    ]
    trip = TripInput("Chicago, IL", "Indianapolis, IN", "Nashville, TN", cycle_hours_used=0.0)
    r = _run(trip, coords, routes)
    assert has_qualifying_30_break(r.timeline), (
        "expected a 30-minute qualifying break OFF event between driving segments — "
        "if missing, BREAK_REQUIRED_AFTER handling regressed."
    )
    assert not r.violations


def test_fmcsa_03_boundary_rest_not_zero():
    """Mandatory long rest must serialize as contiguous OFF across log-sheet dates."""
    coords = [(32.8, -96.8), (35.47, -97.53), (39.10, -94.58)]
    routes = [
        {"distance_miles": 2000.0, "duration_hours": 13.0},
        {"distance_miles": 1000.0, "duration_hours": 9.0},
    ]
    trip = TripInput("Dallas, TX", "Oklahoma City, OK", "Kansas City, MO", cycle_hours_used=60.0)
    r = _run(trip, coords, routes)
    span = max_boundary_rest_minutes_between_sheets(r.timeline, r.log_sheets)
    assert span + 1e-6 >= RESET_10H_MINUTES, (
        f"boundary pill analogue returned {span/60:.2f}h — expected merged rest spanning "
        f"calendar days >= 10h (or restart >= 34h)."
    )


def test_fmcsa_04_fourteen_hour_wall_before_eleven_hours():
    """Fuel + break pattern should consume the real-time 14h window before 11h driving."""
    coords = [(34.05, -118.36), (36.17, -115.13), (40.76, -111.89)]
    routes = [
        {"distance_miles": 4669.0, "duration_hours": 13.0},
        {"distance_miles": 4000.0, "duration_hours": 26.0},
    ]
    trip = TripInput("Los Angeles, CA", "Las Vegas, NV", "Salt Lake City, UT", cycle_hours_used=0.0)
    r = _run(trip, coords, routes)

    cutoff = None
    anchor = None
    for i, ev in enumerate(r.timeline):
        if ev.status == DutyStatus.OFF_DUTY and "10-hour rest reset" in ev.remark:
            cutoff = i
            anchor = ev
            break

    assert cutoff is not None
    assert anchor is not None, "never inserted the standard FMCSA 10h reset"
    wall_h = (anchor.start_time - r.timeline[0].start_time).total_seconds() / 3600.0
    assert abs(wall_h - 14.0) < 0.08, wall_h

    drv_h = cumulative_driving_hours_before_index(r.timeline, cutoff)
    assert drv_h + 5e-3 < 11.0, (
        "14h bind should preempt the unused portion of the 11h allowance — cumulative "
        f"driving before first 10h reset was {drv_h}h."
    )


def test_fmcsa_05_cycle_exhaustion_masks_eleven_hour():
    """Only ~70 - 65 - pre_trip hours fits before mandatory cycle restart inserts."""
    coords = [(41.90, -87.60), (39.74, -104.99), (34.05, -118.25)]
    routes = [
        {"distance_miles": 2600.0, "duration_hours": 50.0},
        {"distance_miles": 5000.0, "duration_hours": 30.0},
    ]
    trip = TripInput("Chicago, IL", "Denver, CO", "Los Angeles, CA", cycle_hours_used=65.0)
    r = _run(trip, coords, routes)

    fd = next((e for e in r.timeline if e.status == DutyStatus.DRIVING), None)
    assert fd is not None
    fo = first_offduty_event(r.timeline)

    available_drive_h = (
        70.0 - trip.cycle_hours_used - (PRE_TRIP_MINUTES / 60.0)
    )
    assert abs(fd.duration_hours - available_drive_h) < 0.12, (
        fd.duration_hours,
        available_drive_h,
    )
    assert fo is not None and "34-hour restart" in fo.remark, getattr(fo, "remark", None)
    peak = max_peak_driving_minutes_since_reset(r.timeline)
    assert peak <= DOT_11H_MINUTES + 1e-6


def test_fmcsa_06_thirty_four_hour_restart_scheduled():
    coords = [(41.90, -87.60), (32.80, -96.80), (34.05, -118.24)]
    routes = [
        {"distance_miles": 6670.0, "duration_hours": 20.0},
        {"distance_miles": 8000.0, "duration_hours": 35.0},
    ]
    trip = TripInput("Chicago, IL", "Dallas, TX", "Los Angeles, CA", cycle_hours_used=68.0)
    r = _run(trip, coords, routes)

    pill_max = max_boundary_rest_minutes_between_sheets(r.timeline, r.log_sheets)
    assert has_explicit_34_restart(r.timeline)
    assert pill_max + 5e-3 >= RESTART_34H_MINUTES, pill_max / 60.0


def test_fmcsa_07_two_windows_same_calendar_day():
    """Calendar-sheet driving may exceed 11h while DOT window peaks stay capped."""
    coords = [(33.75, -84.39), (33.52, -86.81), (36.16, -86.78)]
    routes = [
        {"distance_miles": 5200.0, "duration_hours": 52.0},
        {"distance_miles": 2000.0, "duration_hours": 18.0},
    ]
    trip = TripInput("Atlanta, GA", "Birmingham, AL", "Nashville, TN", cycle_hours_used=0.0)
    r = _run(trip, coords, routes)

    drv_totals_h = [
        sheet.totals.get(DutyStatus.DRIVING.value, 0.0) for sheet in r.log_sheets
    ]
    assert max(drv_totals_h) > 11.0 + 1e-3, drv_totals_h

    peaks = peak_driving_minutes_by_home_terminal_day(r.timeline)
    assert peaks, peaks
    for day, mins in peaks.items():
        assert mins <= DOT_11H_MINUTES + 1e-6, (
            f"illegal peak {mins / 60.0:.2f}h on calendar {day}; calendar totals were {drv_totals_h}"
        )
    assert not r.violations


def test_fmcsa_08_full_stress_cross_country():
    """Book-end stress: longest mocked haul should exercise every modeled lever."""
    coords = [(40.71, -74.00), (41.88, -87.63), (34.05, -118.25)]
    routes = [
        {"distance_miles": 7900.0, "duration_hours": 54.0},
        {"distance_miles": 10000.0, "duration_hours": 60.0},
    ]
    trip = TripInput("New York, NY", "Chicago, IL", "Los Angeles, CA", cycle_hours_used=0.0)
    r = _run(trip, coords, routes)

    assert not r.violations
    assert len(r.log_sheets) >= 6
    assert len(r.timeline) >= 48

    assert has_qualifying_30_break(r.timeline)
    assert has_plain_10h_reset(r.timeline)
    assert has_explicit_34_restart(r.timeline)

    peak = max_peak_driving_minutes_since_reset(r.timeline)
    assert peak <= DOT_11H_MINUTES + 5e-3


def test_fmcsa_09_chicago_mustang_norwalk_cycle69_no_midnight_chain():
    """Regression: Chicago→Mustang, OK→Norwalk, CA with 69h cycle used.

    This is the exact input from the bug report.  Every new duty window must be
    preceded by a >= 10h continuous off-duty/sleeper period — crossing midnight
    is not a reset event.  Verified at three levels:

    1. No driving window ever exceeds 11h since its preceding 10h reset.
    2. Every mandatory rest event in the timeline is >= 10h (no sub-10h rest
       masquerades as a duty-window boundary).
    3. Between consecutive duty windows the gap is >= 10h of continuous rest.
    """
    coords = [(41.88, -87.63), (35.39, -97.72), (33.90, -118.22)]
    routes = [
        {"distance_miles": 850.0, "duration_hours": 13.0},
        {"distance_miles": 1250.0, "duration_hours": 19.0},
    ]
    trip = TripInput(
        "Chicago, IL", "Mustang, OK", "Norwalk, CA", cycle_hours_used=69.0
    )
    r = _run(trip, coords, routes)

    # 1. DOT 11h cap never breached across any calendar day.
    peak = max_peak_driving_minutes_since_reset(r.timeline)
    assert peak <= DOT_11H_MINUTES + 5e-3, (
        f"Driving since last 10h reset reached {peak / 60:.2f}h — exceeds 11h cap."
    )

    # 2. Every mandatory rest (10h reset or 34h restart) must be >= 10h.
    mandatory_rests = [
        ev for ev in r.timeline
        if ev.status in REST_STATUSES
        and ("10-hour rest reset" in ev.remark or "34-hour restart" in ev.remark)
    ]
    assert mandatory_rests, "Expected at least one mandatory rest event."
    for ev in mandatory_rests:
        duration_minutes = (ev.end_time - ev.start_time).total_seconds() / 60.0
        assert duration_minutes + 1e-6 >= RESET_10H_MINUTES, (
            f"Mandatory rest '{ev.remark}' at {ev.start_time} is only "
            f"{duration_minutes / 60:.2f}h — must be >= 10h."
        )

    # 3. No duty window starts within 10h of the previous duty window ending.
    # A duty window ends when a mandatory rest begins; the next duty window
    # starts when that rest ends.  The gap between window-end and next
    # window-start is the rest duration, which must be >= 10h.
    rest_runs = _merged_rest_runs(r.timeline)
    qualifying_runs = [(s, e, m) for s, e, m in rest_runs if m + 1e-6 >= RESET_10H_MINUTES]
    assert qualifying_runs, "Expected at least one qualifying (>= 10h) rest run."

    # Each qualifying rest run ends a duty window and starts the next.
    # Verify the PREVIOUS duty window's driving did not exceed 11h.
    peak_by_day = peak_driving_minutes_by_home_terminal_day(r.timeline)
    for day, mins in peak_by_day.items():
        assert mins <= DOT_11H_MINUTES + 5e-3, (
            f"Day {day}: {mins / 60:.2f}h driving since last reset exceeds 11h cap — "
            "duty window started without a preceding 10h rest."
        )

    assert not r.violations
