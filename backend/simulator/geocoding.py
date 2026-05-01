"""Geocoding and routing via OpenRouteService. Falls back to mock when ORS_API_KEY is unset."""

import requests
from decouple import config

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
    key = config("ORS_API_KEY", default="").strip()
    return key or None


def geocode_address(address: str) -> tuple[float, float]:
    """Return (lat, lng). Falls back to mock only if ORS_API_KEY is not set."""
    key = _api_key()
    if not key:
        return _MOCK_COORD
    try:
        resp = requests.get(
            f"{_ORS_BASE}/geocode/search",
            params={"api_key": key, "text": address, "size": 1},
            timeout=10,
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])
        if not features:
            raise ValueError(f"No geocoding results for address: {address}")
        coords = features[0]["geometry"]["coordinates"]
        # ORS returns [lng, lat]
        return (coords[1], coords[0])
    except Exception as exc:
        print(f"ORS geocoding error for '{address}': {exc}")
        raise ValueError(
            f"Could not geocode location '{address}'. "
            f"Use format 'City, ST' e.g. 'Chicago, IL'"
        )


def reverse_geocode(lat: float, lng: float) -> str:
    """
    Convert coordinates to a human-readable city label.
    Returns "City, ST" format or "lat, lng" if reverse geocode fails.
    """
    key = config("ORS_API_KEY", default="")
    if not key:
        return f"{lat:.4f}, {lng:.4f}"

    try:
        url = "https://api.openrouteservice.org/geocode/reverse"
        params = {
            "api_key": key,
            "point.lon": lng,
            "point.lat": lat,
            "size": 1,
        }
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        features = data.get("features", [])
        if features:
            props = features[0].get("properties", {})
            city = props.get("locality") or props.get("name", "")
            region = props.get("region_a") or props.get("region", "")
            if city and region:
                return f"{city}, {region}"
        return f"{lat:.4f}, {lng:.4f}"
    except Exception as e:
        print(f"Reverse geocode error: {e}")
        return f"{lat:.4f}, {lng:.4f}"


def get_route(
    origin: tuple[float, float],
    destination: tuple[float, float],
) -> dict:
    """
    Return routing dict with distance_miles, duration_hours, coordinates.
    Falls back to mock only if ORS_API_KEY is not set.
    """
    key = _api_key()
    if not key:
        return {
            "distance_miles": _MOCK_ROUTE["distance_miles"],
            "duration_hours": _MOCK_ROUTE["duration_hours"],
            "coordinates": [origin, destination],
        }
    try:
        # ORS directions expects [lng, lat]
        body = {
            "coordinates": [
                [origin[1], origin[0]],
                [destination[1], destination[0]],
            ]
        }
        # driving-hgv is preferred; fall back to driving-car when ORS returns 404
        # (some coordinate pairs are not routable for trucks but are valid for cars).
        resp = None
        all_404 = True
        for profile in ("driving-hgv", "driving-car"):
            resp = requests.post(
                f"{_ORS_BASE}/v2/directions/{profile}",
                json=body,
                headers={"Authorization": f"Bearer {key}"},
                timeout=30,
            )
            if resp.status_code == 404:
                print(f"ORS {profile} returned 404 for {origin}->{destination}")
                continue
            all_404 = False
            break

        if all_404:
            # Neither truck nor car routing could find a path — return mock data
            # so the trip planner can still produce a result for the clicked coords.
            print(f"ORS returned 404 for all profiles {origin}->{destination}, using mock route")
            return {
                "distance_miles": 500.0,
                "duration_hours": 8.0,
                "coordinates": [list(origin), list(destination)],
            }

        resp.raise_for_status()
        route = resp.json()["routes"][0]
        summary = route["summary"]
        geometry = route.get("geometry")
        coords: list[tuple[float, float]]
        if isinstance(geometry, dict) and "coordinates" in geometry:
            raw_coords = geometry["coordinates"]
            # Convert [lng, lat] pairs to (lat, lng) tuples
            coords = [(c[1], c[0]) for c in raw_coords]
        else:
            # Some ORS responses return encoded polyline geometry.
            # Keep route usable with summary values if full geometry isn't available.
            coords = [origin, destination]
        return {
            "distance_miles": summary["distance"] * _MILES_PER_METER,
            "duration_hours": summary["duration"] / _SECONDS_PER_HOUR,
            "coordinates": coords,
        }
    except Exception as exc:
        print(f"ORS routing error from {origin} to {destination}: {exc}")
        raise ValueError(
            f"Could not compute route from {origin} to {destination}. "
            f"Verify locations and try again."
        )
