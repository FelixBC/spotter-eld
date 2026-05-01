"""Integration tests for the HOS engine (simulate_trip + split_leg)."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from simulator.models import (
    DutyStatus, TripInput, Leg, SimulationState, HOME_TERMINAL_TZ,
)
from simulator.engine import split_leg, simulate_trip, get_log_sheet_date


# ---------------------------------------------------------------------------
# split_leg
# ---------------------------------------------------------------------------

def test_split_leg_proportional():
    leg = Leg(
        distance_miles=100.0,
        duration_minutes=100.0,
        start_coords=(0.0, 0.0),
        end_coords=(1.0, 1.0),
        start_location="A",
        end_location="B",
    )
    partial, remainder = split_leg(leg, 40.0)

    assert abs(partial.distance_miles - 40.0) < 0.01
    assert abs(partial.duration_minutes - 40.0) < 0.01
    assert abs(remainder.distance_miles - 60.0) < 0.01
    assert abs(remainder.duration_minutes - 60.0) < 0.01
    # Midpoint interpolation
    assert abs(partial.end_coords[0] - 0.4) < 0.001
    assert abs(partial.end_coords[1] - 0.4) < 0.001


# ---------------------------------------------------------------------------
# simulate_trip — golden path with mock geocoding
# (ORS_API_KEY not set → mock returns 1000 mi / 15 h per leg)
# ---------------------------------------------------------------------------

CHICAGO_DALLAS_LA = TripInput(
    current_location="Chicago, IL",
    pickup_location="Dallas, TX",
    dropoff_location="Los Angeles, CA",
    cycle_hours_used=20.0,
)


def _run():
    """Run the standard assessment trip."""
    return simulate_trip(CHICAGO_DALLAS_LA)


def test_simulate_trip_returns_result():
    result = _run()
    assert result is not None
    assert len(result.timeline) > 0


def test_simulate_trip_has_log_sheets():
    result = _run()
    assert len(result.log_sheets) >= 1


def test_simulate_trip_no_syntax_errors():
    """Confirm import + call completes without exception."""
    result = _run()
    assert isinstance(result.violations, list)


def test_simulate_trip_pickup_event_present():
    result = _run()
    pickup_events = [
        e for e in result.timeline
        if e.status == DutyStatus.ON_DUTY and "Pickup" in e.remark
    ]
    assert len(pickup_events) == 1
    assert abs(pickup_events[0].duration_hours - 1.0) < 0.001


def test_simulate_trip_dropoff_event_present():
    result = _run()
    dropoff_events = [
        e for e in result.timeline
        if e.status == DutyStatus.ON_DUTY and "Dropoff" in e.remark
    ]
    assert len(dropoff_events) == 1
    assert abs(dropoff_events[0].duration_hours - 1.0) < 0.001


def test_simulate_trip_fuel_stop_present():
    """Mock legs are 1000 mi each → at least one fuel stop expected."""
    result = _run()
    fuel_events = [
        e for e in result.timeline
        if e.status == DutyStatus.ON_DUTY and "Fuel" in e.remark
    ]
    assert len(fuel_events) >= 1


@patch("simulator.engine.get_route")
@patch("simulator.engine.geocode_address")
def test_simulate_trip_cycle_remaining_correct(mock_geocode, mock_route):
    """Starting with 20h used; total on-duty should leave < 50h remaining."""
    mock_geocode.side_effect = [
        (41.8781, -87.6298),
        (32.7767, -96.7970),
        (34.0522, -118.2437),
    ]
    mock_route.side_effect = [
        {"distance_miles": 1000.0, "duration_hours": 15.0},
        {"distance_miles": 1000.0, "duration_hours": 15.0},
    ]
    result = _run()
    assert result.cycle_hours_remaining < 50.0
    assert result.cycle_hours_remaining >= 0.0


@patch("simulator.engine.get_route")
@patch("simulator.engine.geocode_address")
def test_simulate_trip_no_11h_violation(mock_geocode, mock_route):
    """No single day should show > 11h of driving in totals."""
    mock_geocode.side_effect = [
        (41.8781, -87.6298),
        (32.7767, -96.7970),
        (34.0522, -118.2437),
    ]
    mock_route.side_effect = [
        {"distance_miles": 1000.0, "duration_hours": 15.0},
        {"distance_miles": 1000.0, "duration_hours": 15.0},
    ]
    result = _run()
    for sheet in result.log_sheets:
        assert sheet.totals.get(DutyStatus.DRIVING.value, 0.0) <= 11.0 + 0.01


def test_simulate_trip_mandatory_breaks_inserted():
    """30-min breaks must appear for a 30-hour total driving trip (2 × 15h legs)."""
    result = _run()
    off_events = [e for e in result.timeline if e.status == DutyStatus.OFF_DUTY]
    assert len(off_events) >= 1


def test_get_log_sheet_date_uses_chicago_tz():
    utc_midnight = datetime(2026, 4, 29, 5, 0, tzinfo=ZoneInfo("UTC"))  # midnight Chicago
    assert get_log_sheet_date(utc_midnight).isoformat() == "2026-04-29"


@patch("simulator.engine.get_route")
@patch("simulator.engine.geocode_address")
def test_simulate_trip_total_distance(mock_geocode, mock_route):
    """Mock route returns 1000 mi per leg → 2000 mi total."""
    mock_geocode.side_effect = [
        (41.8781, -87.6298),
        (32.7767, -96.7970),
        (34.0522, -118.2437),
    ]
    mock_route.side_effect = [
        {"distance_miles": 1000.0, "duration_hours": 15.0},
        {"distance_miles": 1000.0, "duration_hours": 15.0},
    ]
    result = _run()
    assert abs(result.total_distance_miles - 2000.0) < 0.01
