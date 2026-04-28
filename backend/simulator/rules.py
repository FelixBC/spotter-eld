"""HOS rule validators for FMCSA Part 395 property-carrying CMV."""

from datetime import datetime, timedelta
from .models import SimulationState, DutyStatus

# --- Constants (all time values in hours or minutes, distances in miles) ---

MAX_DRIVING_HOURS: float = 11.0          # Rule 1
DRIVING_WINDOW_HOURS: float = 14.0       # Rule 2
BREAK_REQUIRED_AFTER_MINUTES: int = 480  # Rule 3 — 8 hours × 60
QUALIFYING_BREAK_MINUTES: int = 30       # Rule 3
MAX_CYCLE_HOURS: float = 70.0            # Rule 4
RESET_OFF_DUTY_HOURS: float = 10.0       # Rule 5
RESTART_HOURS: float = 34.0             # Rule 6
FUEL_INTERVAL_MILES: float = 1000.0     # Rule 7
FUEL_STOP_HOURS: float = 1.0            # Rule 7
PICKUP_DROPOFF_HOURS: float = 1.0       # Rules 8 & 9
MERGE_PROXIMITY_MILES: float = 50.0     # Coincident stop merge threshold
PRE_TRIP_MINUTES: float = 15.0          # Pre-trip inspection


def minutes_until_11h_limit(state: SimulationState) -> float:
    """Rule 1: minutes of driving remaining before the 11-hour cap."""
    driven_minutes = state.driving_hours_today * 60.0
    limit_minutes = MAX_DRIVING_HOURS * 60.0
    return max(0.0, limit_minutes - driven_minutes)


def minutes_until_window_end(state: SimulationState, current_time: datetime) -> float:
    """Rule 2: minutes until the 14-hour on-duty window closes."""
    remaining = (state.window_end - current_time).total_seconds() / 60.0
    return max(0.0, remaining)


def minutes_until_break_required(state: SimulationState) -> float:
    """Rule 3: minutes of driving allowed before mandatory 30-min break."""
    return max(0.0, float(BREAK_REQUIRED_AFTER_MINUTES - state.driving_minutes_since_break))


def minutes_until_cycle_limit(state: SimulationState) -> float:
    """Rule 4: driving minutes remaining before 70-hour cycle exhausted."""
    remaining_hours = max(0.0, MAX_CYCLE_HOURS - state.cycle_hours_used)
    return remaining_hours * 60.0


def minutes_until_fuel_stop(state: SimulationState, leg_distance_miles: float, leg_duration_minutes: float) -> float:
    """Rule 7: driving minutes until next fuel stop is required."""
    if leg_duration_minutes <= 0 or leg_distance_miles <= 0:
        return float("inf")
    miles_per_minute = leg_distance_miles / leg_duration_minutes
    miles_remaining_before_fuel = max(0.0, FUEL_INTERVAL_MILES - state.miles_since_fuel)
    if miles_per_minute == 0:
        return float("inf")
    return miles_remaining_before_fuel / miles_per_minute


def needs_driving_reset(state: SimulationState, current_time: datetime) -> bool:
    """True when driver cannot drive any further without a rest break."""
    return (
        minutes_until_11h_limit(state) <= 0
        or minutes_until_window_end(state, current_time) <= 0
        or minutes_until_break_required(state) <= 0
        or minutes_until_cycle_limit(state) <= 0
    )


def apply_qualifying_break(state: SimulationState, consecutive_non_driving_minutes: float) -> SimulationState:
    """Reset the 30-min break counter if break is long enough (Rule 3)."""
    if consecutive_non_driving_minutes >= QUALIFYING_BREAK_MINUTES:
        state.driving_minutes_since_break = 0
    return state


def apply_10h_reset(state: SimulationState, reset_end_time: datetime) -> SimulationState:
    """Rule 5: after 10 consecutive hours off, reset daily limits."""
    state.driving_hours_today = 0.0
    state.driving_minutes_since_break = 0
    state.window_start = reset_end_time
    state.window_end = reset_end_time + timedelta(hours=DRIVING_WINDOW_HOURS)
    return state


def apply_34h_restart(state: SimulationState, restart_end_time: datetime) -> SimulationState:
    """Rule 6: 34-hour restart resets cycle hours and daily limits."""
    state.cycle_hours_used = 0.0
    state.driving_hours_today = 0.0
    state.driving_minutes_since_break = 0
    state.window_start = restart_end_time
    state.window_end = restart_end_time + timedelta(hours=DRIVING_WINDOW_HOURS)
    state.restart_used = True
    return state
