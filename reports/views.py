from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from bookings.models import Booking
from organizers.models import Organizer
from reviews.models import Review
from trips.models import Trip
from .models import Report
from .serializers import AdminReportSerializer, ReportSerializer


class ReportViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = Report.objects.select_related("reporter", "trip", "organizer", "review", "review__reviewer")
        if not self.request.user.is_staff:
            qs = qs.filter(reporter=self.request.user)
        if self.request.query_params.get("status"):
            qs = qs.filter(status=self.request.query_params["status"])
        return qs

    def get_serializer_class(self):
        if self.request.user.is_staff and self.action == "partial_update":
            return AdminReportSerializer
        return ReportSerializer

    def get_permissions(self):
        if self.action == "partial_update":
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(reporter=self.request.user)


class AdminStatsView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        trips_by_status = {row["status"]: row["total"] for row in Trip.objects.values("status").annotate(total=Count("id"))}
        bookings_by_status = {row["status"]: row["total"] for row in Booking.objects.values("status").annotate(total=Count("id"))}
        organizer_by_status = {row["verification"]: row["total"] for row in Organizer.objects.values("verification").annotate(total=Count("id"))}
        return Response({
            "users_total": User.objects.count(),
            "travelers_total": User.objects.filter(role=User.Role.TRAVELER).count(),
            "organizers_total": Organizer.objects.count(),
            "organizers_pending": organizer_by_status.get(Organizer.Verification.PENDING, 0),
            "trips_total": Trip.objects.count(),
            "trips_by_status": trips_by_status,
            "upcoming_public_trips": Trip.objects.filter(status__in=(Trip.Status.PUBLISHED, Trip.Status.FULL), start_at__gt=timezone.now()).count(),
            "bookings_by_status": bookings_by_status,
            "confirmed_seats": Booking.objects.filter(status=Booking.Status.CONFIRMED).aggregate(total=Sum("quantity"))["total"] or 0,
            "reports_pending": Report.objects.filter(status=Report.Status.PENDING).count(),
            "reports_in_review": Report.objects.filter(status=Report.Status.IN_REVIEW).count(),
            "reviews_total": Review.objects.filter(status=Review.Status.PUBLISHED).count(),
            "reviews_hidden": Review.objects.filter(status=Review.Status.HIDDEN).count(),
        })
