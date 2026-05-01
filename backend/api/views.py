from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from simulator.engine import simulate_trip
from simulator.geocoding import reverse_geocode
from simulator.models import TripInput

from .serializers import TripPlanRequestSerializer, TripPlanResponseSerializer


def _coord_pair(data, lat_key: str, lng_key: str):
    """Return (lat, lng) tuple if both keys are present and non-null, else None."""
    lat = data.get(lat_key)
    lng = data.get(lng_key)
    if lat is None or lng is None:
        return None
    return (float(lat), float(lng))


class TripPlanView(APIView):
    def post(self, request):
        req_serializer = TripPlanRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(
                {"error": "Validation failed", "details": req_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = req_serializer.validated_data

        current_coords_override = _coord_pair(data, "current_lat", "current_lng")
        pickup_coords_override = _coord_pair(data, "pickup_lat", "pickup_lng")
        dropoff_coords_override = _coord_pair(data, "dropoff_lat", "dropoff_lng")

        try:
            result = simulate_trip(
                TripInput(
                    current_location=data["current_location"],
                    pickup_location=data["pickup_location"],
                    dropoff_location=data["dropoff_location"],
                    cycle_hours_used=data["cycle_hours_used"],
                ),
                current_coords_override=current_coords_override,
                pickup_coords_override=pickup_coords_override,
                dropoff_coords_override=dropoff_coords_override,
            )
        except Exception as exc:
            return Response(
                {"error": "Simulation failed", "details": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(TripPlanResponseSerializer(result).data, status=status.HTTP_200_OK)


class ReverseGeocodeView(APIView):
    """GET /api/geocode/reverse/?lat=...&lng=... -> {"label": "City, ST"}."""

    def get(self, request):
        try:
            lat = float(request.query_params.get("lat", 0))
            lng = float(request.query_params.get("lng", 0))
        except (TypeError, ValueError):
            return Response(
                {"error": "lat and lng must be numbers"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        label = reverse_geocode(lat, lng)
        return Response({"label": label})
