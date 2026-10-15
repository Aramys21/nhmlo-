from django.db import transaction
from django.db.models import Avg, Count
from rest_framework import serializers

from bookings.models import Booking
from bookings.services import confirmed_seats
from organizers.models import Organization
from organizers.permissions import can_manage
from .models import Category, PickupPoint, Trip, TripPhoto


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "slug", "description")


class PickupPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = PickupPoint
        fields = ("id", "name", "description", "latitude", "longitude", "estimated_time", "position")
        read_only_fields = ("id",)


class TripPhotoSerializer(serializers.ModelSerializer):
    trip = serializers.PrimaryKeyRelatedField(queryset=Trip.objects.all(), write_only=True)

    class Meta:
        model = TripPhoto
        fields = ("id", "trip", "image", "caption", "position")
        read_only_fields = ("id",)

    def validate_image(self, image):
        if image.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("L'image ne peut pas dépasser 5 Mo.")
        return image


class TripSerializer(serializers.ModelSerializer):
    organization_id = serializers.PrimaryKeyRelatedField(source="organizer", queryset=Organization.objects.all(), write_only=True, required=False)
    organizer = serializers.IntegerField(source="organizer_id", read_only=True)
    organizer_name = serializers.CharField(source="organizer.name", read_only=True)
    organizer_verification = serializers.CharField(source="organizer.verification", read_only=True)
    organizer_current_user_role = serializers.SerializerMethodField()
    organizer_average_rating = serializers.SerializerMethodField()
    organizer_review_count = serializers.SerializerMethodField()
    category_name = serializers.CharField(source="category.name", read_only=True)
    pickup_points = PickupPointSerializer(many=True, required=False)
    photos = TripPhotoSerializer(many=True, read_only=True)
    confirmed_seats = serializers.IntegerField(read_only=True)
    available_seats = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    average_activity_rating = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = (
            "id", "organizer", "organization_id", "organizer_name", "organizer_verification", "organizer_current_user_role", "organizer_average_rating", "organizer_review_count", "category", "category_name",
            "title", "description", "universe", "activity_type", "accommodation", "board", "destination", "departure_region", "start_at", "end_at",
            "duration_days", "price", "capacity", "confirmed_seats", "available_seats", "difficulty",
            "review_count", "average_activity_rating",
            "family_friendly", "itinerary", "requirements", "included", "excluded", "cancellation_policy",
            "meeting_name", "meeting_latitude", "meeting_longitude", "route_geojson", "pickup_points", "photos",
            "status", "featured", "created_at", "updated_at",
        )
        read_only_fields = ("status", "featured", "created_at", "updated_at", "confirmed_seats")

    def get_available_seats(self, obj):
        confirmed = getattr(obj, "confirmed_seats", None)
        if confirmed is None:
            confirmed = confirmed_seats(obj)
        return max(obj.capacity - confirmed, 0)

    def _review_stats(self, obj):
        from reviews.models import Review
        return Review.objects.filter(trip=obj, status=Review.Status.PUBLISHED).aggregate(count=Count("id"), average=Avg("activity_rating"))

    def get_review_count(self, obj):
        return self._review_stats(obj)["count"] or 0

    def get_average_activity_rating(self, obj):
        return self._review_stats(obj)["average"]

    def _organization_review_stats(self, obj):
        from reviews.models import Review
        return Review.objects.filter(organization_id=obj.organizer_id, status=Review.Status.PUBLISHED).aggregate(count=Count("id"), average=Avg("organization_rating"))

    def get_organizer_average_rating(self, obj):
        return self._organization_review_stats(obj)["average"]

    def get_organizer_review_count(self, obj):
        return self._organization_review_stats(obj)["count"] or 0

    def get_organizer_current_user_role(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        membership = obj.organizer.memberships.filter(user=request.user).first()
        return membership.role if membership else None

    def validate(self, attrs):
        organization = attrs.get("organizer")
        request = self.context["request"]
        if self.instance and organization and organization.pk != self.instance.organizer_id:
            raise serializers.ValidationError({"organization_id": "Une activité ne peut pas changer d'organisation."})
        if organization and not can_manage(request.user, organization, "publish"):
            raise serializers.ValidationError({"organization_id": "Vous n'avez pas les droits de publication pour cette organisation."})
        start = attrs.get("start_at", getattr(self.instance, "start_at", None))
        end = attrs.get("end_at", getattr(self.instance, "end_at", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"end_at": "La date de retour doit suivre la date de départ."})
        points = attrs.get("pickup_points", [])
        positions = [point.get("position", index) for index, point in enumerate(points)]
        if len(positions) != len(set(positions)):
            raise serializers.ValidationError({"pickup_points": "L'ordre des points de ramassage doit être unique."})
        return attrs

    def validate_route_geojson(self, value):
        if value is None:
            return value
        if not isinstance(value, dict) or value.get("type") not in ("LineString", "MultiLineString", "Feature", "FeatureCollection"):
            raise serializers.ValidationError("Le tracé doit être un GeoJSON LineString, MultiLineString, Feature ou FeatureCollection.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        points = validated_data.pop("pickup_points", [])
        if "organizer" not in validated_data:
            raise serializers.ValidationError({"organization_id": "Choisissez l'organisation qui publie cette activité."})
        trip = Trip.objects.create(**validated_data)
        for index, point in enumerate(points):
            PickupPoint.objects.create(trip=trip, position=point.pop("position", index), **point)
        return trip

    @transaction.atomic
    def update(self, instance, validated_data):
        points = validated_data.pop("pickup_points", None)
        trip = Trip.objects.select_for_update().get(pk=instance.pk)
        if "capacity" in validated_data and validated_data["capacity"] < confirmed_seats(trip):
            raise serializers.ValidationError({"capacity": "La capacité ne peut pas être inférieure aux places déjà confirmées."})
        for field, value in validated_data.items():
            setattr(trip, field, value)
        if trip.status in (Trip.Status.PUBLISHED, Trip.Status.FULL):
            trip.status = Trip.Status.FULL if confirmed_seats(trip) >= trip.capacity else Trip.Status.PUBLISHED
        trip.save()
        if points is not None:
            trip.pickup_points.all().delete()
            for index, point in enumerate(points):
                PickupPoint.objects.create(trip=trip, position=point.pop("position", index), **point)
        return trip
