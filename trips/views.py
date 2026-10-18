from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Case, Exists, F, IntegerField, OuterRef, Q, Sum, Value, When
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from bookings.models import Booking
from bookings.services import change_booking_status
from organizers.models import Organization
from organizers.permissions import can_manage
from .models import Category, Trip, TripPhoto
from .permissions import TripAccess
from .serializers import CategorySerializer, TripPhotoSerializer, TripSerializer


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]


class TripViewSet(viewsets.ModelViewSet):
    serializer_class = TripSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, TripAccess]
    filter_backends = []

    def get_queryset(self):
        qs = Trip.objects.select_related("organizer", "category").prefetch_related("pickup_points", "photos")
        qs = qs.annotate(confirmed_seats=Coalesce(Sum(Case(
            When(bookings__status=Booking.Status.CONFIRMED, then=F("bookings__quantity")),
            default=Value(0), output_field=IntegerField(),
        )), Value(0)))
        user = self.request.user
        if not (user.is_authenticated and user.is_staff):
            public_trips = Q(status__in=(Trip.Status.PUBLISHED, Trip.Status.FULL), organizer__verification=Organization.Verification.VERIFIED)
            if self.action != "retrieve" and not self.request.query_params.get("organizer"):
                public_trips &= Q(start_at__gt=timezone.now())
            if user.is_authenticated:
                qs = qs.annotate(user_has_booking=Exists(Booking.objects.filter(trip_id=OuterRef("pk"), traveler=user)))
                qs = qs.filter(public_trips | Q(organizer__memberships__user=user) | Q(user_has_booking=True))
            else:
                qs = qs.filter(public_trips)
        params = self.request.query_params
        keyword = params.get("q") or params.get("search")
        if keyword:
            qs = qs.filter(Q(title__icontains=keyword) | Q(description__icontains=keyword) | Q(destination__icontains=keyword))
        if params.get("activity"):
            qs = qs.filter(activity_type=params["activity"])
        if params.get("universe"):
            if params["universe"] not in Trip.Universe.values:
                raise ValidationError({"universe": "Univers inconnu."})
            qs = qs.filter(universe=params["universe"])
        if params.get("accommodation"):
            qs = qs.filter(accommodation__icontains=params["accommodation"])
        if params.get("category"):
            qs = qs.filter(Q(category__slug=params["category"]) | Q(category_id=params["category"]) if params["category"].isdigit() else Q(category__slug=params["category"]))
        if params.get("destination"):
            qs = qs.filter(Q(destination__icontains=params["destination"]) | Q(departure_region__icontains=params["destination"]))
        if params.get("organizer"):
            qs = qs.filter(organizer_id=params["organizer"]) if params["organizer"].isdigit() else qs.filter(organizer__name__icontains=params["organizer"])
        if params.get("difficulty"):
            qs = qs.filter(difficulty=params["difficulty"])
        if params.get("family") in ("true", "1"):
            qs = qs.filter(family_friendly=True)
        filter_specs = (
            ("start_after", "start_at__date__gte", date.fromisoformat),
            ("start_before", "start_at__date__lte", date.fromisoformat),
            ("price_min", "price__gte", Decimal),
            ("price_max", "price__lte", Decimal),
            ("duration_min", "duration_days__gte", int),
            ("duration_max", "duration_days__lte", int),
        )
        for parameter, lookup, converter in filter_specs:
            raw_value = params.get(parameter)
            if raw_value:
                try:
                    value = converter(raw_value)
                    if parameter.startswith("price_") and (not value.is_finite() or value < 0):
                        raise ValueError
                    if parameter.startswith("duration_") and value < 1:
                        raise ValueError
                    qs = qs.filter(**{lookup: value})
                except (TypeError, ValueError, InvalidOperation):
                    raise ValidationError({parameter: "Valeur de filtre invalide."})
        if params.get("available") in ("true", "1"):
            qs = qs.filter(declared_available_seats__gt=0)
        if params.get("featured") in ("true", "1"):
            qs = qs.filter(featured=True)
        ordering = params.get("ordering")
        if ordering == "price_asc":
            qs = qs.order_by("price", "id")
        elif ordering == "price_desc":
            qs = qs.order_by("-price", "id")
        elif ordering == "soonest":
            qs = qs.order_by("start_at", "id")
        elif ordering == "recent":
            qs = qs.order_by("-created_at", "id")
        else:
            qs = qs.order_by("start_at", "id")
        return qs

    def perform_create(self, serializer):
        organization = serializer.validated_data.get("organizer")
        if organization is None or not can_manage(self.request.user, organization, "publish"):
            raise PermissionDenied("Vous avez besoin du droit de publication pour cette organisation.")
        serializer.save()

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, TripAccess])
    def submit(self, request, pk=None):
        trip = self.get_object()
        if trip.status != Trip.Status.DRAFT:
            raise ValidationError("Seul un brouillon peut être envoyé pour validation.")
        if trip.organizer.verification != Organization.Verification.VERIFIED and not request.user.is_staff:
            raise ValidationError("Votre profil organisateur doit être vérifié avant publication.")
        trip.status = Trip.Status.PENDING
        trip.save(update_fields=("status", "updated_at"))
        return Response(self.get_serializer(trip).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, TripAccess])
    @transaction.atomic
    def close(self, request, pk=None):
        trip = self.get_object()
        trip = Trip.objects.select_for_update().get(pk=trip.pk)
        if trip.status not in (Trip.Status.PUBLISHED, Trip.Status.FULL):
            raise ValidationError("Cette annonce ne peut pas être clôturée.")
        for booking in trip.bookings.filter(status=Booking.Status.PENDING).select_related("traveler", "trip", "trip__organizer"):
            change_booking_status(booking=booking, actor=request.user, target_status=Booking.Status.DECLINED)
        trip.status = Trip.Status.CLOSED
        trip.save(update_fields=("status", "updated_at"))
        return Response(self.get_serializer(trip).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, TripAccess])
    @transaction.atomic
    def cancel(self, request, pk=None):
        trip = self.get_object()
        trip = Trip.objects.select_for_update().get(pk=trip.pk)
        if trip.status not in (Trip.Status.DRAFT, Trip.Status.PENDING, Trip.Status.PUBLISHED, Trip.Status.FULL, Trip.Status.CLOSED):
            raise ValidationError("Cette annonce ne peut pas être annulée.")
        active_bookings = trip.bookings.filter(status__in=(Booking.Status.PENDING, Booking.Status.CONFIRMED)).select_related("traveler", "trip", "trip__organizer")
        for booking in active_bookings:
            change_booking_status(booking=booking, actor=request.user, target_status=Booking.Status.ORGANIZER_CANCELLED)
        trip.status = Trip.Status.CANCELLED
        trip.save(update_fields=("status", "updated_at"))
        return Response(self.get_serializer(trip).data)


class TripPhotoViewSet(viewsets.ModelViewSet):
    serializer_class = TripPhotoSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        qs = TripPhoto.objects.select_related("trip", "trip__organizer")
        user = self.request.user
        if user.is_staff:
            return qs
        if user.is_authenticated:
            return qs.filter(trip__organizer__memberships__user=user)
        return qs.none()

    def perform_create(self, serializer):
        trip = serializer.validated_data["trip"] if "trip" in serializer.validated_data else None
        if trip is None or not can_manage(self.request.user, trip.organizer, "publish"):
            raise PermissionDenied("Vous ne pouvez ajouter des photos qu'à vos propres annonces.")
        serializer.save()
