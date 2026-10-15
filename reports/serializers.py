from rest_framework import serializers

from organizers.models import OrganizationMembership
from .models import Report


class ReportSerializer(serializers.ModelSerializer):
    reporter_name = serializers.CharField(source="reporter.username", read_only=True)
    trip_title = serializers.CharField(source="trip.title", read_only=True, allow_null=True)
    organizer_name = serializers.CharField(source="organizer.name", read_only=True, allow_null=True)
    review_comment = serializers.CharField(source="review.comment", read_only=True, allow_null=True)
    review_rating = serializers.IntegerField(source="review.organization_rating", read_only=True, allow_null=True)
    review_author = serializers.CharField(source="review.reviewer.username", read_only=True, allow_null=True)

    class Meta:
        model = Report
        fields = ("id", "reporter", "reporter_name", "trip", "trip_title", "organizer", "organizer_name", "review", "review_comment", "review_rating", "review_author", "reason", "description", "status", "moderator_note", "created_at", "updated_at")
        read_only_fields = ("id", "reporter", "reporter_name", "trip_title", "organizer_name", "status", "moderator_note", "created_at", "updated_at")

    def validate(self, attrs):
        trip = attrs.get("trip", self.instance.trip if self.instance else None)
        organizer = attrs.get("organizer", self.instance.organizer if self.instance else None)
        review = attrs.get("review", self.instance.review if self.instance else None)
        if sum(bool(target) for target in (trip, organizer, review)) != 1:
            raise serializers.ValidationError("Signalez une annonce, un profil organisateur ou un avis.")
        user = self.context["request"].user
        if trip and OrganizationMembership.objects.filter(organization=trip.organizer, user=user).exists():
            raise serializers.ValidationError("Vous ne pouvez pas signaler votre propre annonce.")
        if organizer and OrganizationMembership.objects.filter(organization=organizer, user=user).exists():
            raise serializers.ValidationError("Vous ne pouvez pas signaler votre propre profil.")
        if review and review.reviewer_id == user.id:
            raise serializers.ValidationError("Vous ne pouvez pas signaler votre propre avis.")
        return attrs


class AdminReportSerializer(ReportSerializer):
    class Meta(ReportSerializer.Meta):
        read_only_fields = ("id", "reporter", "reporter_name", "trip", "trip_title", "organizer", "organizer_name", "review", "review_comment", "review_rating", "review_author", "reason", "description", "created_at", "updated_at")
