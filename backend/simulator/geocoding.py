"""Geocoding and routing via OpenRouteService. Falls back to mock when ORS_API_KEY is unset."""

import os
import requests

_ORS_BASE = "https://api.openrouteservice.org"
_MILES_PER_METER = 0.000621371
_SECONDS_PER_HOUR = 3600.0

_MOCK_COORD = (41.8781, -87.6298)
_MOCK_ROUTE = {
    "distance_miles": 1000.0,
    "duration_hours": 15.0,
    "coordinates": [],  # populated per call
}


def _api_key() -> str | None:
    return os.environ.get("ORS_API_KEY")


def geocode_address(address: str) -> tuple[float, float]:
    """Return (lat, lng). Falls back to mock if ORS_API_KEY is not set."""
    key = _api_key()
    if not key:
        return _MOCK_COORD

    resp = requests.get(
        f"{_ORS_BASE}/geocode/search",
        params={"api_key": key, "text": address, "size": 1},
        timeout=10,
    )
    resp.raise_for_status()
    coords = resp.json()["features"][0]["geometry"]["coordinates"]
    # ORS returns [lng, lat]
    return (coords[1], coords[0])


def get_route(
    origin: tuple[float, float],
    destination: tuple[float, float],
) -> dict:
    """
    Return routing dict with distance_miles, duration_hours, coordinates.
    Falls back to mock if ORS_API_KEY is not set.
    """
    key = _api_key()
    if not key:
        return {
            "distance_miles": _MOCK_ROUTE["distance_miles"],
            "duration_hours": _MOCK_ROUTE["duration_hours"],
            "coordinates": [origin, destination],
        }

    # ORS directions expects [lng, lat]
    body = {
        "coordinates": [
            [origin[1], origin[0]],
            [destination[1], destination[0]],
        ]
    }
    resp = requests.post(
        f"{_ORS_BASE}/v2/directions/driving-hgv/json",
        json=body,
        headers={"Authorization": key},
        timeout=30,
    )
    resp.raise_for_status()
    summary = resp.json()["routes"][0]["summary"]
    raw_coords = resp.json()["routes"][0]["geometry"]["coordinates"]
    # Convert [lng, lat] pairs to (lat, lng) tuples
    coords = [(c[1], c[0]) for c in raw_coords]
    return {
        "distance_miles": summary["distance"] * _MILES_PER_METER,
        "duration_hours": summary["duration"] / _SECONDS_PER_HOUR,
        "coordinates": coords,
    }
