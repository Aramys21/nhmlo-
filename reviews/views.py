from django.db import IntegrityError, transaction
from rest_framework import permissions, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Review
from .serializers import AdminReviewSerializer, ReviewSerializer


class ReviewViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        queryset = Review.objects.select_related("reviewer", "organization", "trip", "booking")
        if not self.request.user.is_staff:
            queryset = queryset.filter(status=Review.Status.PUBLISHED)
        elif self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        organization = self.request.query_params.get("organization")
        trip = self.request.query_params.get("trip")
        if organization:
            queryset = queryset.filter(organization_id=organization)
        if trip:
            queryset = queryset.filter(trip_id=trip)
        ordering = self.request.query_params.get("ordering")
        if ordering == "rating":
            queryset = queryset.order_by("-organization_rating", "-created_at")
        elif ordering == "rating_asc":
            queryset = queryset.order_by("organization_rating", "-created_at")
        elif ordering == "recent":
            queryset = queryset.order_by("-created_at", "id")
        return queryset

    def get_serializer_class(self):
        if self.request.user.is_staff and self.action == "partial_update":
            return AdminReviewSerializer
        return ReviewSerializer

    def get_permissions(self):
        if self.action == "partial_update":
            return [permissions.IsAdminUser()]
        return [permission() for permission in self.permission_classes]

    def partial_update(self, request, *args, **kwargs):
        if not request.user.is_staff:
            raise PermissionDenied()
        if request.data.get("status") not in {Review.Status.PUBLISHED, Review.Status.HIDDEN}:
            raise ValidationError({"status": "Choisissez un statut de modération valide."})
        return super().partial_update(request, *args, **kwargs)

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError as exc:
            raise ValidationError({"booking": "Un avis existe déjà pour cette réservation."}) from exc
