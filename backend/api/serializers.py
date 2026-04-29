from rest_framework import serializers


class TripPlanRequestSerializer(serializers.Serializer):
    current_location = serializers.CharField(min_length=1)
    pickup_location = serializers.CharField(min_length=1)
    dropoff_location = serializers.CharField(min_length=1)
    cycle_hours_used = serializers.FloatField(min_value=0.0, max_value=70.0)


class TimelineEventSerializer(serializers.Serializer):
    status = serializers.SerializerMethodField()
    start_time = serializers.SerializerMethodField()
    end_time = serializers.SerializerMethodField()
    location = serializers.CharField()
    remark = serializers.CharField()
    truck_moved = serializers.BooleanField()
    duration_hours = serializers.FloatField()
    lat = serializers.FloatField()
    lng = serializers.FloatField()

    def get_status(self, obj):
        return obj.status.value

    def get_start_time(self, obj):
        return obj.start_time.isoformat()

    def get_end_time(self, obj):
        return obj.end_time.isoformat()


class LogSheetSerializer(serializers.Serializer):
    date = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()
    total_miles = serializers.FloatField()

    def get_date(self, obj):
        return obj.date.isoformat()

    def get_events(self, obj):
        return TimelineEventSerializer(obj.events, many=True).data

    def get_totals(self, obj):
        # Keys are already DutyStatus string values from the engine
        return obj.totals


class TripPlanResponseSerializer(serializers.Serializer):
    timeline = serializers.SerializerMethodField()
    log_sheets = serializers.SerializerMethodField()
    total_distance_miles = serializers.FloatField()
    total_duration_hours = serializers.FloatField()
    cycle_hours_remaining = serializers.FloatField()
    violations = serializers.ListField(child=serializers.CharField())

    def get_timeline(self, obj):
        return TimelineEventSerializer(obj.timeline, many=True).data

    def get_log_sheets(self, obj):
        return LogSheetSerializer(obj.log_sheets, many=True).data
