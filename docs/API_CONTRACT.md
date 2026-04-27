# API Contract

Base URL is environment-specific. Paths below are relative to the API root.

## Endpoint

### `POST /api/trip/plan/`

Plans a trip: resolves route, simulates HOS-compliant timeline, and returns log sheets and summary.

#### Request body (JSON)

| Field | Type | Description |
|--------|------|-------------|
| `current_location` | object | Driver’s present position. `latitude` (number), `longitude` (number), optional `label` (string). |
| `pickup` | object | Pickup stop: `latitude`, `longitude`, optional `label`, optional `scheduled_at` (ISO-8601 datetime). |
| `dropoff` | object | Dropoff stop: same shape as `pickup`. |
| `cycle_hours_used` | number | Non-negative hours already counted toward the active **70-hour / 8-day** (or configured) cycle at trip start. |

Example:

```json
{
  "current_location": { "latitude": 40.7128, "longitude": -74.006, "label": "Yard" },
  "pickup": { "latitude": 39.9526, "longitude": -75.1652 },
  "dropoff": { "latitude": 38.9072, "longitude": -77.0369 },
  "cycle_hours_used": 12.5
}
```

#### Success response (JSON, `200 OK`)

| Field | Type | Description |
|--------|------|-------------|
| `route` | object | Geometry and/or legs: e.g. `legs` array with `distance_m`, `duration_s`, `polyline` or coordinate arrays. |
| `timeline_events` | array | Ordered events: `{ "start", "end", "duty_status", "description", "location" }` (exact keys TBD in implementation; must be documented alongside types). |
| `log_sheets` | array | Per-calendar-day log representations aligned to FMCSA-style output (grid or event list). |
| `summary` | object | Aggregates: e.g. total distance, driving hours, on-duty hours, ETA, flags for restarts used. |

#### Error response (JSON)

Errors use a consistent envelope, for example:

| Field | Type | Description |
|--------|------|-------------|
| `error` | string | Machine-readable code (e.g. `validation_error`, `routing_failed`, `hos_infeasible`). |
| `message` | string | Human-readable summary. |
| `details` | object or array | Optional field-level errors or diagnostic info (safe for clients; no secrets). |

Example (`400 Bad Request`):

```json
{
  "error": "validation_error",
  "message": "pickup coordinates are out of range",
  "details": { "field": "pickup.latitude" }
}
```

HTTP status codes map to error classes (e.g. `400` validation, `422` business/HOS infeasible, `502` upstream routing failure) — finalize in implementation with a small status table in this doc.
