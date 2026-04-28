from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime, date
from zoneinfo import ZoneInfo

HOME_TERMINAL_TZ = ZoneInfo("America/Chicago")


class DutyStatus(Enum):
    OFF_DUTY = "off_duty"
    SLEEPER_BERTH = "sleeper_berth"
    DRIVING = "driving"
    ON_DUTY = "on_duty"


@dataclass
class TripInput:
    current_location: str
    pickup_location: str
    dropoff_location: str
    cycle_hours_used: float  # 0.0 to 70.0


@dataclass
class Leg:
    distance_miles: float
    duration_minutes: float
    start_coords: tuple[float, float]
    end_coords: tuple[float, float]
    start_location: str
    end_location: str


@dataclass
class TimelineEvent:
    status: DutyStatus
    start_time: datetime
    end_time: datetime
    location: str
    remark: str
    truck_moved: bool
    duration_hours: float


@dataclass
class LogSheet:
    date: date
    events: list[TimelineEvent]
    totals: dict[str, float]
    total_miles: float


@dataclass
class TripPlanResult:
    timeline: list[TimelineEvent]
    log_sheets: list[LogSheet]
    total_distance_miles: float
    total_duration_hours: float
    cycle_hours_remaining: float
    violations: list[str]


@dataclass
class SimulationState:
    window_start: datetime
    window_end: datetime
    driving_hours_today: float = 0.0
    driving_minutes_since_break: int = 0
    cycle_hours_used: float = 0.0
    miles_since_fuel: float = 0.0
    restart_used: bool = False
