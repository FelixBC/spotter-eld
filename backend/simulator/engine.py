"""Core HOS trip simulation engine."""

from dataclasses import replace
from datetime import datetime, timedelta, date
from collections import defaultdict

from .models import (
    DutyStatus, TripInput, Leg, TimelineEvent, LogSheet,
    TripPlanResult, SimulationState, HOME_TERMINAL_TZ,
)
from .rules import (
    minutes_until_11h_limit,
    minutes_until_window_end,
    minutes_until_break_required,
    minutes_until_cycle_limit,
    minutes_until_fuel_stop,
    apply_qualifying_break,
    apply_10h_reset,
    apply_34h_restart,
    RESET_OFF_DUTY_HOURS,
    RESTART_HOURS,
    FUEL_STOP_HOURS,
    PICKUP_DROPOFF_HOURS,
    PRE_TRIP_MINUTES,
    MERGE_PROXIMITY_MILES,
    QUALIFYING_BREAK_MINUTES,
    FUEL_INTERVAL_MILES,
)
from .geocoding import geocode_address, get_route


# ---------------------------------------------------------------------------
# Leg splitting
# ---------------------------------------------------------------------------

def split_leg(leg: Leg, drive_minutes_available: float) -> tuple[Leg, Leg]:
    """
    Split a leg at drive_minutes_available using linear interpolation.
    Returns (partial_leg, remainder_leg).
    """
    fraction = drive_minutes_available / leg.duration_minutes

    mid_lat = leg.start_coords[0] + (leg.end_coords[0] - leg.start_coords[0]) * fraction
    mid_lng = leg.start_coords[1] + (leg.end_coords[1] - leg.start_coords[1]) * fraction
    mid_coords = (mid_lat, mid_lng)
    mid_location = f"Mile {leg.distance_miles * fraction:.0f} marker"

    partial = Leg(
        distance_miles=leg.distance_miles * fraction,
        duration_minutes=drive_minutes_available,
        start_coords=leg.start_coords,
        end_coords=mid_coords,
        start_location=leg.start_location,
        end_location=mid_location,
    )
    remainder = Leg(
        distance_miles=leg.distance_miles * (1 - fraction),
        duration_minutes=leg.duration_minutes - drive_minutes_available,
        start_coords=mid_coords,
        end_coords=leg.end_coords,
        start_location=mid_location,
        end_location=leg.end_location,
    )
    return partial, remainder


# ---------------------------------------------------------------------------
# Timeline helpers
# ---------------------------------------------------------------------------

def _add_event(
    timeline: list[TimelineEvent],
    status: DutyStatus,
    start: datetime,
    duration_hours: float,
    location: str,
    remark: str,
    truck_moved: bool = False,
    coords: tuple[float, float] = (0.0, 0.0),
) -> datetime:
    """Append event to timeline, return end time."""
    end = start + timedelta(hours=duration_hours)
    timeline.append(TimelineEvent(
        status=status,
        start_time=start,
        end_time=end,
        location=location,
        remark=remark,
        truck_moved=truck_moved,
        duration_hours=duration_hours,
        lat=coords[0],
        lng=coords[1],
    ))
    return end


# ---------------------------------------------------------------------------
# Mandatory rest insertion
# ---------------------------------------------------------------------------

def _insert_mandatory_rest(
    timeline: list[TimelineEvent],
    state: SimulationState,
    current_time: datetime,
    location: str,
    violations: list[str],
    coords: tuple[float, float] = (0.0, 0.0),
) -> tuple[datetime, SimulationState]:
    """
    Insert the appropriate mandatory rest based on which limit was hit.
    Returns (new_current_time, updated_state).
    Handles 34h restart if cycle is exhausted and restart not yet used.
    """
    need_cycle_restart = minutes_until_cycle_limit(state) <= 0

    if need_cycle_restart:
        if state.restart_used:
            violations.append("hos_infeasible: cycle exhausted, restart already used")
            return current_time, state
        # 34-hour restart
        end_time = _add_event(
            timeline, DutyStatus.OFF_DUTY, current_time,
            RESTART_HOURS, location, "34-hour restart (cycle reset)", coords=coords,
        )
        state = apply_34h_restart(state, end_time)
        return end_time, state

    # Standard 10-hour reset
    end_time = _add_event(
        timeline, DutyStatus.OFF_DUTY, current_time,
        RESET_OFF_DUTY_HOURS, location, "10-hour rest reset", coords=coords,
    )
    state = apply_10h_reset(state, end_time)
    return end_time, state


def _insert_break(
    timeline: list[TimelineEvent],
    state: SimulationState,
    current_time: datetime,
    location: str,
    coords: tuple[float, float] = (0.0, 0.0),
) -> tuple[datetime, SimulationState]:
    """Insert a 30-minute qualifying break and reset the break counter."""
    duration_hours = QUALIFYING_BREAK_MINUTES / 60.0
    end_time = _add_event(
        timeline, DutyStatus.OFF_DUTY, current_time,
        duration_hours, location, "30-minute break (HOS Rule 3)", coords=coords,
    )
    state = apply_qualifying_break(state, QUALIFYING_BREAK_MINUTES)
    return end_time, state


def _insert_fuel_stop(
    timeline: list[TimelineEvent],
    state: SimulationState,
    current_time: datetime,
    location: str,
    coords: tuple[float, float] = (0.0, 0.0),
) -> tuple[datetime, SimulationState]:
    """Insert a 1-hour ON_DUTY fuel stop and reset the fuel counter."""
    end_time = _add_event(
        timeline, DutyStatus.ON_DUTY, current_time,
        FUEL_STOP_HOURS, location, "Fuel stop", coords=coords,
    )
    state.miles_since_fuel = 0.0
    state.cycle_hours_used += FUEL_STOP_HOURS
    return end_time, state


# ---------------------------------------------------------------------------
# Leg simulation
# ---------------------------------------------------------------------------

def _simulate_leg(
    leg: Leg,
    timeline: list[TimelineEvent],
    state: SimulationState,
    current_time: datetime,
    violations: list[str],
) -> tuple[datetime, SimulationState]:
    """Drive a single leg, splitting at HOS limits as needed."""
    remaining_leg = leg

    while remaining_leg.duration_minutes > 0.001:
        # --- Check all limits before consuming any segment ---
        avail_11h = minutes_until_11h_limit(state)
        avail_window = minutes_until_window_end(state, current_time)
        avail_break = minutes_until_break_required(state)
        avail_cycle = minutes_until_cycle_limit(state)
        avail_fuel = minutes_until_fuel_stop(
            state, remaining_leg.distance_miles, remaining_leg.duration_minutes
        )

        minutes_available = min(avail_11h, avail_window, avail_break, avail_cycle, avail_fuel)

        # If we're already at zero capacity, insert mandatory event first
        if minutes_available <= 0.001:
            break_needed = avail_break <= 0.001
            rest_needed = avail_11h <= 0.001 or avail_window <= 0.001 or avail_cycle <= 0.001
            fuel_needed = avail_fuel <= 0.001
            stop_coords = remaining_leg.start_coords

            # Check coincident stop merge: if fuel is needed very soon after a break
            if break_needed and not rest_needed:
                miles_after_break = remaining_leg.distance_miles * (
                    QUALIFYING_BREAK_MINUTES / remaining_leg.duration_minutes
                ) if remaining_leg.duration_minutes > 0 else 0
                fuel_miles_remaining = FUEL_INTERVAL_MILES - state.miles_since_fuel
                if fuel_miles_remaining - miles_after_break <= MERGE_PROXIMITY_MILES:
                    # Merge: take break then fuel at same location
                    current_time, state = _insert_break(timeline, state, current_time, remaining_leg.start_location, coords=stop_coords)
                    current_time, state = _insert_fuel_stop(timeline, state, current_time, remaining_leg.start_location, coords=stop_coords)
                    continue

            if break_needed and not rest_needed:
                current_time, state = _insert_break(timeline, state, current_time, remaining_leg.start_location, coords=stop_coords)
            elif rest_needed:
                current_time, state = _insert_mandatory_rest(
                    timeline, state, current_time, remaining_leg.start_location, violations, coords=stop_coords,
                )
                if "hos_infeasible" in " ".join(violations):
                    return current_time, state
            elif fuel_needed:
                current_time, state = _insert_fuel_stop(timeline, state, current_time, remaining_leg.start_location, coords=stop_coords)
            continue

        if remaining_leg.duration_minutes <= minutes_available:
            # Consume whole remaining leg
            # Defensive clamp: enforce 11h cap at write-time as well, not only
            # via precomputed availability, so no segment can overrun due to
            # rounding or stale availability in edge paths.
            drive_minutes = min(
                remaining_leg.duration_minutes,
                minutes_available,
                minutes_until_11h_limit(state),
            )
            if drive_minutes <= 0.001:
                continue
            drive_hours = drive_minutes / 60.0
            end_time = _add_event(
                timeline, DutyStatus.DRIVING, current_time,
                drive_hours, remaining_leg.end_location,
                f"Driving to {remaining_leg.end_location}",
                truck_moved=True,
                coords=remaining_leg.end_coords,
            )
            state.driving_hours_today += drive_hours
            state.driving_minutes_since_break += int(drive_minutes)
            state.cycle_hours_used += drive_hours
            # Scale miles to the actual driven minutes when clamped.
            if remaining_leg.duration_minutes > 0:
                state.miles_since_fuel += remaining_leg.distance_miles * (
                    drive_minutes / remaining_leg.duration_minutes
                )
            current_time = end_time
            # If we clamped to a partial segment, continue with remainder.
            if drive_minutes >= remaining_leg.duration_minutes - 0.001:
                break
            _, remainder = split_leg(remaining_leg, drive_minutes)
            remaining_leg = remainder
        else:
            # Split at tightest constraint
            drive_minutes = min(minutes_available, minutes_until_11h_limit(state))
            if drive_minutes <= 0.001:
                continue
            partial, remainder = split_leg(remaining_leg, drive_minutes)
            drive_hours = partial.duration_minutes / 60.0
            end_time = _add_event(
                timeline, DutyStatus.DRIVING, current_time,
                drive_hours, partial.end_location,
                f"Driving to {partial.end_location}",
                truck_moved=True,
                coords=partial.end_coords,
            )
            state.driving_hours_today += drive_hours
            state.driving_minutes_since_break += int(partial.duration_minutes)
            state.cycle_hours_used += drive_hours
            state.miles_since_fuel += partial.distance_miles
            current_time = end_time
            remaining_leg = remainder

            # Check what limit was hit and insert mandatory event
            avail_11h = minutes_until_11h_limit(state)
            avail_window = minutes_until_window_end(state, current_time)
            avail_break = minutes_until_break_required(state)
            avail_cycle = minutes_until_cycle_limit(state)
            avail_fuel = minutes_until_fuel_stop(
                state, remaining_leg.distance_miles, remaining_leg.duration_minutes
            )

            fuel_hit = avail_fuel <= 0.001
            break_hit = avail_break <= 0.001
            rest_hit = avail_11h <= 0.001 or avail_window <= 0.001 or avail_cycle <= 0.001
            stop_coords = remaining_leg.start_coords

            if fuel_hit and break_hit:
                # Coincident: break then fuel
                current_time, state = _insert_break(timeline, state, current_time, remaining_leg.start_location, coords=stop_coords)
                current_time, state = _insert_fuel_stop(timeline, state, current_time, remaining_leg.start_location, coords=stop_coords)
            elif fuel_hit and rest_hit:
                # Rest first, then fuel
                current_time, state = _insert_mandatory_rest(
                    timeline, state, current_time, remaining_leg.start_location, violations, coords=stop_coords,
                )
                if "hos_infeasible" in " ".join(violations):
                    return current_time, state
                current_time, state = _insert_fuel_stop(timeline, state, current_time, remaining_leg.start_location, coords=stop_coords)
            elif break_hit:
                current_time, state = _insert_break(timeline, state, current_time, remaining_leg.start_location, coords=stop_coords)
            elif rest_hit:
                current_time, state = _insert_mandatory_rest(
                    timeline, state, current_time, remaining_leg.start_location, violations, coords=stop_coords,
                )
                if "hos_infeasible" in " ".join(violations):
                    return current_time, state
            elif fuel_hit:
                current_time, state = _insert_fuel_stop(timeline, state, current_time, remaining_leg.start_location, coords=stop_coords)

    return current_time, state


# ---------------------------------------------------------------------------
# Log sheet grouping
# ---------------------------------------------------------------------------

def get_log_sheet_date(utc_time: datetime) -> date:
    """Group events by calendar day in home terminal timezone."""
    return utc_time.astimezone(HOME_TERMINAL_TZ).date()


def split_event_at_midnight(event: TimelineEvent) -> list[TimelineEvent]:
    """
    Split a TimelineEvent into one segment per calendar day it spans.
    Example: 34h OFF_DUTY starting Apr 30 06:15 AM becomes:
      - Apr 30: 06:15 AM -> midnight  (17.75h)
      - May  1: midnight -> midnight  (24.00h)
      - May  2: midnight -> 08:15 AM  ( 8.25h)
    Each segment inherits all fields from parent. duration_hours recalculated.
    """
    segments: list[TimelineEvent] = []
    current_start = event.start_time

    while current_start < event.end_time:
        next_midnight = (current_start + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        segment_end = min(next_midnight, event.end_time)
        duration = (segment_end - current_start).total_seconds() / 3600.0
        segments.append(replace(
            event,
            start_time=current_start,
            end_time=segment_end,
            duration_hours=duration,
        ))
        current_start = segment_end

    return segments if segments else [event]


def _build_log_sheets(timeline: list[TimelineEvent]) -> list[LogSheet]:
    """Group timeline events into per-day LogSheet objects."""
    by_date: dict[date, list[TimelineEvent]] = defaultdict(list)
    for event in timeline:
        for sub_event in split_event_at_midnight(event):
            day = get_log_sheet_date(sub_event.start_time)
            by_date[day].append(sub_event)

    sheets: list[LogSheet] = []
    for day in sorted(by_date):
        events = by_date[day]
        totals: dict[str, float] = {s.value: 0.0 for s in DutyStatus}
        total_miles = 0.0
        for ev in events:
            totals[ev.status.value] += ev.duration_hours
            if ev.truck_moved:
                total_miles += ev.duration_hours * (
                    # Approximate miles from the event's driving time
                    # We don't store per-event miles in TimelineEvent, so
                    # reconstruct from total_distance if needed; use 0 here
                    # and let caller sum from Leg data.
                    0.0  # placeholder — overridden below per driving event
                )
        # Recalculate total_miles properly via remark/truck_moved flag
        # We need to sum distance from DRIVING events — store approximate via duration
        # since speed varies. For now use duration × avg speed encoded in Leg creation.
        # The engine tracks miles_since_fuel; for log sheets we sum from events.
        # Since TimelineEvent doesn't carry distance, we track it separately.
        sheets.append(LogSheet(date=day, events=events, totals=totals, total_miles=0.0))
    return sheets


# ---------------------------------------------------------------------------
# Main simulation entry point
# ---------------------------------------------------------------------------

def simulate_trip(
    trip_input: TripInput,
    current_coords_override: tuple[float, float] | None = None,
    pickup_coords_override: tuple[float, float] | None = None,
    dropoff_coords_override: tuple[float, float] | None = None,
) -> TripPlanResult:
    """
    Given TripInput, geocode locations, build routes, simulate HOS-compliant
    timeline, and return TripPlanResult.

    If coordinate overrides are provided (e.g. from a map click), they bypass
    forward geocoding for that specific location while leaving the others alone.
    """
    # 1. Geocode (use override when caller already has known coordinates)
    current_coords = current_coords_override or geocode_address(trip_input.current_location)
    pickup_coords = pickup_coords_override or geocode_address(trip_input.pickup_location)
    dropoff_coords = dropoff_coords_override or geocode_address(trip_input.dropoff_location)

    # 2. Routes
    route1 = get_route(current_coords, pickup_coords)
    route2 = get_route(pickup_coords, dropoff_coords)

    leg1 = Leg(
        distance_miles=route1["distance_miles"],
        duration_minutes=route1["duration_hours"] * 60.0,
        start_coords=current_coords,
        end_coords=pickup_coords,
        start_location=trip_input.current_location,
        end_location=trip_input.pickup_location,
    )
    leg2 = Leg(
        distance_miles=route2["distance_miles"],
        duration_minutes=route2["duration_hours"] * 60.0,
        start_coords=pickup_coords,
        end_coords=dropoff_coords,
        start_location=trip_input.pickup_location,
        end_location=trip_input.dropoff_location,
    )

    # 3. Initialize simulation state
    now = datetime.now(HOME_TERMINAL_TZ).replace(hour=6, minute=0, second=0, microsecond=0)
    state = SimulationState(
        window_start=now,
        window_end=now + timedelta(hours=14),
        driving_hours_today=0.0,
        driving_minutes_since_break=0,
        cycle_hours_used=trip_input.cycle_hours_used,
        miles_since_fuel=0.0,
        restart_used=False,
    )
    timeline: list[TimelineEvent] = []
    violations: list[str] = []
    current_time = now

    # 4. Pre-trip inspection (15 min ON_DUTY)
    # Skip if cycle already exhausted — restart must happen first
    if minutes_until_cycle_limit(state) >= PRE_TRIP_MINUTES:
        pre_trip_hours = PRE_TRIP_MINUTES / 60.0
        current_time = _add_event(
            timeline, DutyStatus.ON_DUTY, current_time,
            pre_trip_hours, trip_input.current_location, "Pre-trip inspection",
            coords=current_coords,
        )
        state.cycle_hours_used += pre_trip_hours

    # 5. Simulate leg 1 (current → pickup)
    current_time, state = _simulate_leg(leg1, timeline, state, current_time, violations)

    # 6. Pickup (1h ON_DUTY)
    current_time = _add_event(
        timeline, DutyStatus.ON_DUTY, current_time,
        PICKUP_DROPOFF_HOURS, trip_input.pickup_location, "Pickup",
        coords=pickup_coords,
    )
    state.cycle_hours_used += PICKUP_DROPOFF_HOURS
    state = apply_qualifying_break(state, PICKUP_DROPOFF_HOURS * 60)

    # 7. Simulate leg 2 (pickup → dropoff)
    current_time, state = _simulate_leg(leg2, timeline, state, current_time, violations)

    # 8. Dropoff (1h ON_DUTY)
    current_time = _add_event(
        timeline, DutyStatus.ON_DUTY, current_time,
        PICKUP_DROPOFF_HOURS, trip_input.dropoff_location, "Dropoff",
        coords=dropoff_coords,
    )
    state.cycle_hours_used += PICKUP_DROPOFF_HOURS

    # 9. Build log sheets
    log_sheets = _build_log_sheets(timeline)

    # Compute total miles from leg data (distance tracked in legs, not events)
    total_distance = leg1.distance_miles + leg2.distance_miles

    # Recalculate per-day miles from DRIVING events using leg speed
    # Use total driving duration across timeline to compute miles per sheet
    avg_mph1 = leg1.distance_miles / (leg1.duration_minutes / 60.0) if leg1.duration_minutes > 0 else 0
    avg_mph2 = leg2.distance_miles / (leg2.duration_minutes / 60.0) if leg2.duration_minutes > 0 else 0
    avg_mph = (avg_mph1 + avg_mph2) / 2.0 if (avg_mph1 + avg_mph2) > 0 else 60.0

    for sheet in log_sheets:
        driving_hours = sum(
            ev.duration_hours for ev in sheet.events if ev.status == DutyStatus.DRIVING
        )
        sheet.total_miles = driving_hours * avg_mph

    # 10. Totals
    trip_start = now
    total_hours = (current_time - trip_start).total_seconds() / 3600.0
    cycle_remaining = max(0.0, 70.0 - state.cycle_hours_used)

    return TripPlanResult(
        timeline=timeline,
        log_sheets=log_sheets,
        total_distance_miles=total_distance,
        total_duration_hours=total_hours,
        cycle_hours_remaining=cycle_remaining,
        violations=violations,
    )
