from django.urls import path
from .views import ReverseGeocodeView, TripPlanView

urlpatterns = [
    path("trip/plan/", TripPlanView.as_view()),
    path("geocode/reverse/", ReverseGeocodeView.as_view()),
]
