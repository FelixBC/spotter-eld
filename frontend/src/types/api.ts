export type DutyStatus = "off_duty" | "sleeper_berth" | "driving" | "on_duty";

export interface TimelineEvent {
  status: DutyStatus;
  start_time: string;
  end_time: string;
  location: string;
  remark: string;
  truck_moved: boolean;
  duration_hours: number;
  lat: number;
  lng: number;
}

export interface LogSheet {
  date: string;
  events: TimelineEvent[];
  totals: Record<DutyStatus, number>;
  total_miles: number;
}

export interface TripPlanRequest {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  cycle_hours_used: number;
}

export interface TripPlanResponse {
  timeline: TimelineEvent[];
  log_sheets: LogSheet[];
  total_distance_miles: number;
  total_duration_hours: number;
  cycle_hours_remaining: number;
  violations: string[];
}
