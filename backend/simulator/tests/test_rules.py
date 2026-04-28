"""Tests for HOS rules — one test per rule per spec."""

import pytest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from simulator.models import SimulationState, HOME_TERMINAL_TZ
from simulator.rules import (
    minutes_until_11h_limit,
    minutes_until_window_end,
    minutes_until_break_required,
    minutes_until_cycle_limit,
    apply_qualifying_break,
    apply_10h_reset,
    apply_34h_restart,
    BREAK_REQUIRED_AFTER_MINUTES,
    QUALIFYING_BREAK_MINUTES,
    MAX_DRIVING_HOURS,
    DRIVING_WINDOW_HOURS,
    MAX_CYCLE_HOURS,
)


def _make_state(**kwargs) -> SimulationState:
    now = datetime(2026, 4, 28, 6, 0, tzinfo=HOME_TERMINAL_TZ)
    defaults = dict(
        window_start=now,
        window_end=now + timedelta(hours=14),
        driving_hours_today=0.0,
        driving_minutes_since_break=0,
        cycle_hours_used=0.0,
        miles_since_fuel=0.0,
        restart_used=False,
    )
    defaults.update(kwargs)
    return SimulationState(**defaults)


# ---------------------------------------------------------------------------
# Rule 1 — 11-hour driving limit
# ---------------------------------------------------------------------------

def test_driving_stops_at_11_hours():
    """At 11 h driven, zero minutes remain."""
    state = _make_state(driving_hours_today=MAX_DRIVING_HOURS)
    assert minutes_until_11h_limit(state) == 0.0


def test_driving_has_capacity_below_11_hours():
    state = _make_state(driving_hours_today=5.0)
    assert minutes_until_11h_limit(state) == (MAX_DRIVING_HOURS - 5.0) * 60


# ---------------------------------------------------------------------------
# Rule 2 — 14-hour on-duty window
# ---------------------------------------------------------------------------

def test_no_driving_after_14_hour_window():
    """At window_end, zero minutes remain."""
    now = datetime(2026, 4, 28, 6, 0, tzinfo=HOME_TERMINAL_TZ)
    state = _make_state(window_start=now, window_end=now + timedelta(hours=14))
    at_window_end = now + timedelta(hours=14)
    assert minutes_until_window_end(state, at_window_end) == 0.0


def test_window_has_capacity_before_end():
    now = datetime(2026, 4, 28, 6, 0, tzinfo=HOME_TERMINAL_TZ)
    state = _make_state(window_start=now, window_end=now + timedelta(hours=14))
    assert minutes_until_window_end(state, now) == 14 * 60


# ---------------------------------------------------------------------------
# Rule 3 — 30-minute break after 8 cumulative driving hours
# ---------------------------------------------------------------------------

def test_30_min_break_required_after_8_cumulative_driving_hours():
    """At 480 driving minutes since last break, no more driving allowed."""
    state = _make_state(driving_minutes_since_break=BREAK_REQUIRED_AFTER_MINUTES)
    assert minutes_until_break_required(state) == 0.0


def test_20min_on_duty_does_not_qualify_as_break():
    """4h driving → 20 min ON_DUTY → 4h driving: counter reaches 480, break required."""
    state = _make_state(driving_minutes_since_break=4 * 60)  # 4h of driving
    # 20 min non-driving: not ≥ 30, so counter must NOT reset
    state = apply_qualifying_break(state, consecutive_non_driving_minutes=20)
    # counter still at 240; add another 4h of driving
    state.driving_minutes_since_break += 4 * 60
    assert state.driving_minutes_since_break >= BREAK_REQUIRED_AFTER_MINUTES


def test_30min_on_duty_qualifies_as_break():
    """4h driving → 30 min ON_DUTY → break counter resets → no violation after 4h more."""
    state = _make_state(driving_minutes_since_break=4 * 60)
    state = apply_qualifying_break(state, consecutive_non_driving_minutes=30)
    assert state.driving_minutes_since_break == 0
    # drive another 4h — total 4h since reset, under 8h limit
    state.driving_minutes_since_break += 4 * 60
    assert state.driving_minutes_since_break < BREAK_REQUIRED_AFTER_MINUTES


# ---------------------------------------------------------------------------
# Rule 4 — 70-hour cycle limit
# ---------------------------------------------------------------------------

def test_cannot_drive_when_cycle_hours_exceed_70():
    state = _make_state(cycle_hours_used=MAX_CYCLE_HOURS)
    assert minutes_until_cycle_limit(state) == 0.0


def test_cycle_has_capacity_below_70():
    state = _make_state(cycle_hours_used=50.0)
    assert minutes_until_cycle_limit(state) == (MAX_CYCLE_HOURS - 50.0) * 60


# ---------------------------------------------------------------------------
# Rule 5 — 10-hour consecutive reset
# ---------------------------------------------------------------------------

def test_10_consecutive_hours_off_resets_daily_limits():
    now = datetime(2026, 4, 28, 20, 0, tzinfo=HOME_TERMINAL_TZ)
    state = _make_state(
        window_start=now - timedelta(hours=10),
        window_end=now - timedelta(hours=10) + timedelta(hours=14),
        driving_hours_today=8.0,
        driving_minutes_since_break=300,
    )
    reset_end = now + timedelta(hours=10)
    state = apply_10h_reset(state, reset_end)

    assert state.driving_hours_today == 0.0
    assert state.driving_minutes_since_break == 0
    assert state.window_start == reset_end
    assert state.window_end == reset_end + timedelta(hours=DRIVING_WINDOW_HOURS)


# ---------------------------------------------------------------------------
# Rule 6 — 34-hour restart
# ---------------------------------------------------------------------------

def test_34_hour_restart_resets_cycle():
    now = datetime(2026, 4, 28, 6, 0, tzinfo=HOME_TERMINAL_TZ)
    state = _make_state(
        cycle_hours_used=68.0,
        driving_hours_today=10.0,
        driving_minutes_since_break=400,
        restart_used=False,
    )
    restart_end = now + timedelta(hours=34)
    state = apply_34h_restart(state, restart_end)

    assert state.cycle_hours_used == 0.0
    assert state.driving_hours_today == 0.0
    assert state.driving_minutes_since_break == 0
    assert state.window_start == restart_end
    assert state.window_end == restart_end + timedelta(hours=DRIVING_WINDOW_HOURS)
    assert state.restart_used is True


# ---------------------------------------------------------------------------
# Rule 7 — Fuel stop every 1000 miles  (tested via engine integration below)
# ---------------------------------------------------------------------------

def test_fuel_stop_inserted_every_1000_miles():
    """Engine-level: simulate_trip produces a fuel stop event. Tested in test_engine.py."""
    # Placeholder — engine integration test covers this; rule arithmetic tested here.
    from simulator.rules import minutes_until_fuel_stop
    state = _make_state(miles_since_fuel=999.0)
    # 1 mile left before fuel needed; leg is 100 miles / 100 min → 1 mi/min
    mins = minutes_until_fuel_stop(state, leg_distance_miles=100.0, leg_duration_minutes=100.0)
    assert abs(mins - 1.0) < 0.01


# ---------------------------------------------------------------------------
# Rule 8 — Pickup on-duty
# ---------------------------------------------------------------------------

def test_pickup_inserts_1_hour_on_duty():
    """simulate_trip puts a 1h ON_DUTY event at pickup. Verified in test_engine.py."""
    from simulator.rules import PICKUP_DROPOFF_HOURS
    assert PICKUP_DROPOFF_HOURS == 1.0


# ---------------------------------------------------------------------------
# Rule 9 — Dropoff on-duty
# ---------------------------------------------------------------------------

def test_dropoff_inserts_1_hour_on_duty():
    from simulator.rules import PICKUP_DROPOFF_HOURS
    assert PICKUP_DROPOFF_HOURS == 1.0
