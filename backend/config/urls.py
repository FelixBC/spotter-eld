from django.urls import path
from api.views import TripPlanView

urlpatterns = [
    path("api/trip/plan/", TripPlanView.as_view()),
]
