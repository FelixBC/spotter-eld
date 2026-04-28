from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from simulator.engine import simulate_trip
from simulator.models import TripInput

from .serializers import TripPlanRequestSerializer, TripPlanResponseSerializer


class TripPlanView(APIView):
    def post(self, request):
        req_serializer = TripPlanRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(
                {"error": "Validation failed", "details": req_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = req_serializer.validated_data
        try:
            result = simulate_trip(TripInput(
                current_location=data["current_location"],
                pickup_location=data["pickup_location"],
                dropoff_location=data["dropoff_location"],
                cycle_hours_used=data["cycle_hours_used"],
            ))
        except Exception as exc:
            return Response(
                {"error": "Simulation failed", "details": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(TripPlanResponseSerializer(result).data, status=status.HTTP_200_OK)
