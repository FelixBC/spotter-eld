"""End-to-end validation of the two cross-day HOS invariants that the
TimelineView UI shows:

1. For every day, max(driving minutes accumulated since the last contiguous
   >= 10h off-duty/sleeper run) must be <= 660 (FMCSA 11h cap).
2. For every pair of adjacent days, the boundary-pill "continuous rest"
   calculation must AGREE with the DOT 11h check — both derived from the
   same single-pass rest-run analysis.

Scenario: Chicago, IL -> Denver, CO -> Los Angeles, CA, cycle hours used 65.
This is the exact input that produced the contradictory UI in the bug
report.
"""

from unittest.mock import patch

from simulator.models import DutyStatus, TripInput
from simulator.engine import simulate_trip


CHICAGO_DENVER_LA = TripInput(
    current_location="Chicago, IL",
    pickup_location="Denver, CO",
    dropoff_location="Los Angeles, CA",
    cycle_hours_used=65.0,
)

REST_STATUSES = {DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH}
RESET_10H_MIN = 10 * 60
DOT_11H_MIN = 11 * 60


def _detect_rest_runs(events):
    """Mirror of the frontend detectRestRuns: maximal contiguous rest runs
    where each event's end_time exactly equals the next event's start_time."""
    runs = []
    run_start = None
    run_end = None
    run_minutes = 0.0

    def flush():
        nonlocal run_start, run_end, run_minutes
        if run_start is not None:
            runs.append((run_start, run_end, run_minutes))
        run_start = None
        run_end = None
        run_minutes = 0.0

    for event in events:
        if event.status not in REST_STATUSES:
            flush()
            continue
        duration = (event.end_time - event.start_time).total_seconds() / 60.0
        if run_start is not None and event.start_time == run_end:
            run_end = event.end_time
            run_minutes += duration
        else:
            flush()
            run_start = event.start_time
            run_end = event.end_time
            run_minutes = duration
    flush()
    return runs


def _compute_driving_max_by_day(events, runs):
    """Mirror of the frontend driving-max-by-day walk."""
    reset_moments = sorted(
        run_start.timestamp() + RESET_10H_MIN * 60
        for run_start, _, total in runs
        if total >= RESET_10H_MIN
    )

    driving_max = {}
    driving_since_reset = 0.0
    next_reset = 0

    for event in events:
        start_ts = event.start_time.timestamp()
        while next_reset < len(reset_moments) and reset_moments[next_reset] <= start_ts:
            driving_since_reset = 0.0
            next_reset += 1

        if event.status == DutyStatus.DRIVING:
            duration = (event.end_time - event.start_time).total_seconds() / 60.0
            driving_since_reset += duration

        day = event.start_time.astimezone().date().isoformat()
        driving_max[day] = max(driving_max.get(day, 0.0), driving_since_reset)

    return driving_max


@patch("simulator.engine.get_route")
@patch("simulator.engine.geocode_address")
def test_chicago_denver_la_cycle65_no_11h_violation(mock_geocode, mock_route):
    mock_geocode.side_effect = [
        (41.8781, -87.6298),
        (39.7392, -104.9903),
        (34.0522, -118.2437),
    ]
    mock_route.side_effect = [
        {"distance_miles": 1000.0, "duration_hours": 15.0},
        {"distance_miles": 1000.0, "duration_hours": 17.0},
    ]
    result = simulate_trip(CHICAGO_DENVER_LA)

    runs = _detect_rest_runs(result.timeline)
    driving_max = _compute_driving_max_by_day(result.timeline, runs)

    offenders = {day: mins for day, mins in driving_max.items() if mins > DOT_11H_MIN}
    assert not offenders, (
        "Simulator produced driving runs exceeding 11h between 10h resets: "
        f"{offenders}. Full per-day max: {driving_max}"
    )


@patch("simulator.engine.get_route")
@patch("simulator.engine.geocode_address")
def test_chicago_denver_la_cycle65_pill_and_check_agree(mock_geocode, mock_route):
    """For every adjacent day pair where a >=10h rest run spans the boundary,
    the next day's DOT 11h check MUST show 'since last reset' below the
    cumulative that led to the reset. Specifically: the run's start-of-day
    carry-over must be 0 immediately after the reset (<= DOT_11H_MIN trivially)
    and the next-day max must not exceed DOT_11H_MIN."""
    mock_geocode.side_effect = [
        (41.8781, -87.6298),
        (39.7392, -104.9903),
        (34.0522, -118.2437),
    ]
    mock_route.side_effect = [
        {"distance_miles": 1000.0, "duration_hours": 15.0},
        {"distance_miles": 1000.0, "duration_hours": 17.0},
    ]
    result = simulate_trip(CHICAGO_DENVER_LA)

    runs = _detect_rest_runs(result.timeline)
    driving_max = _compute_driving_max_by_day(result.timeline, runs)

    # Boundary rest per day, same rule as the frontend pill.
    sheets = result.log_sheets
    for i in range(len(sheets) - 1):
        curr, nxt = sheets[i], sheets[i + 1]
        if not curr.events or not nxt.events:
            continue
        last, first = curr.events[-1], nxt.events[0]
        if (
            last.end_time != first.start_time
            or last.status not in REST_STATUSES
            or first.status not in REST_STATUSES
        ):
            continue
        boundary_ts = last.end_time.timestamp()
        containing = next(
            (
                total
                for run_start, run_end, total in runs
                if run_start.timestamp() < boundary_ts < run_end.timestamp()
            ),
            None,
        )
        assert containing is not None, (
            f"Boundary between {curr.date} and {nxt.date} has contiguous rest "
            "on both sides but no rest run contains it — pill/check will disagree."
        )
        if containing >= RESET_10H_MIN:
            next_day_max = driving_max.get(nxt.date.isoformat(), 0.0)
            assert next_day_max <= DOT_11H_MIN, (
                f"Pill says 10h reset ✓ for {curr.date}->{nxt.date} but DOT 11h "
                f"check on {nxt.date} reports {next_day_max} min > {DOT_11H_MIN}."
            )
