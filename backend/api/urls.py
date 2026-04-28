from django.urls import path
from .views import TripPlanView

urlpatterns = [
    path("trip/plan/", TripPlanView.as_view()),
]
