from django.utils import timezone
from rest_framework import serializers

from bookings.models import Booking
from organizers.models import OrganizationMembership
from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    booking = serializers.PrimaryKeyRelatedField(queryset=Booking.objects.select_related("trip", "trip__organizer"), write_only=True)
    booking_id = serializers.IntegerField(read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    trip_title = serializers.CharField(source="trip.title", read_only=True)
    reviewer_name = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ("id", "booking", "booking_id", "reviewer", "reviewer_name", "organization", "organization_name", "trip", "trip_title", "organization_rating", "activity_rating", "communication_rating", "program_rating", "value_rating", "comment", "status", "moderator_note", "created_at", "updated_at")
        read_only_fields = ("id", "booking_id", "reviewer", "reviewer_name", "organization", "organization_name", "trip", "trip_title", "status", "moderator_note", "created_at", "updated_at")

    def get_reviewer_name(self, obj):
        return obj.reviewer.get_full_name() or obj.reviewer.username

    def validate(self, attrs):
        request = self.context["request"]
        if self.instance and request.user.is_staff:
            return attrs
        booking = attrs.get("booking")
        if booking is None:
            raise serializers.ValidationError({"booking": "Une réservation est nécessaire pour déposer un avis."})
        if booking.traveler_id != request.user.id:
            raise serializers.ValidationError({"booking": "Cette réservation ne vous appartient pas."})
        if booking.status not in (Booking.Status.CONFIRMED, Booking.Status.COMPLETED):
            raise serializers.ValidationError({"booking": "Seule une réservation confirmée et non annulée peut recevoir un avis."})
        activity_end = booking.trip.end_at or booking.trip.start_at
        if activity_end > timezone.now():
            raise serializers.ValidationError({"booking": "Vous pourrez publier un avis après la fin de l'activité."})
        if OrganizationMembership.objects.filter(organization=booking.trip.organizer, user=request.user).exists():
            raise serializers.ValidationError({"booking": "Les membres de l'organisation ne peuvent pas évaluer leurs propres activités."})
        if Review.objects.filter(booking=booking).exists():
            raise serializers.ValidationError({"booking": "Un avis existe déjà pour cette réservation."})
        return attrs

    def create(self, validated_data):
        booking = validated_data.pop("booking")
        return Review.objects.create(
            booking=booking,
            reviewer=self.context["request"].user,
            organization=booking.trip.organizer,
            trip=booking.trip,
            **validated_data,
        )


class AdminReviewSerializer(ReviewSerializer):
    class Meta(ReviewSerializer.Meta):
        read_only_fields = tuple(field for field in ReviewSerializer.Meta.read_only_fields if field not in {"status", "moderator_note"})
