from rest_framework import serializers
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from .models import Booking
from trips.models import PickupPoint, Trip


class BookingSerializer(serializers.ModelSerializer):
    trip = serializers.PrimaryKeyRelatedField(queryset=Trip.objects.all(), write_only=True)
    trip_id = serializers.IntegerField(read_only=True)
    trip_title = serializers.CharField(source="trip.title", read_only=True)
    destination = serializers.CharField(source="trip.destination", read_only=True)
    start_at = serializers.DateTimeField(source="trip.start_at", read_only=True)
    end_at = serializers.DateTimeField(source="trip.end_at", read_only=True)
    price_per_person = serializers.DecimalField(source="trip.price", max_digits=10, decimal_places=2, read_only=True)
    pickup_point_name = serializers.CharField(source="pickup_point.name", read_only=True, allow_null=True)
    pickup_point = serializers.PrimaryKeyRelatedField(queryset=PickupPoint.objects.all(), required=False, allow_null=True)
    traveler_name = serializers.CharField(source="traveler.get_full_name", read_only=True)
    review_id = serializers.SerializerMethodField()
    review_eligible = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = ("id", "trip", "trip_id", "trip_title", "destination", "start_at", "end_at", "price_per_person", "traveler_name", "pickup_point", "pickup_point_name", "quantity", "status", "review_id", "review_eligible", "created_at", "updated_at")
        read_only_fields = ("id", "trip_id", "traveler_name", "status", "created_at", "updated_at")

    def get_review_id(self, obj):
        try:
            review = obj.review
        except ObjectDoesNotExist:
            review = None
        return review.id if review else None

    def get_review_eligible(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or obj.traveler_id != request.user.id:
            return False
        if obj.status not in (Booking.Status.CONFIRMED, Booking.Status.COMPLETED):
            return False
        if (obj.trip.end_at or obj.trip.start_at) > timezone.now():
            return False
        if obj.trip.organizer.memberships.filter(user=request.user).exists():
            return False
        try:
            obj.review
            return False
        except ObjectDoesNotExist:
            return True
