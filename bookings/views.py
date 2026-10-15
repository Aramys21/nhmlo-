from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import Booking
from .serializers import BookingSerializer
from .services import change_booking_status, create_booking
from organizers.models import OrganizationMembership
from organizers.permissions import can_manage


class BookingViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = BookingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Booking.objects.select_related("trip", "trip__organizer", "traveler", "pickup_point", "review")
        user = self.request.user
        if not user.is_staff:
            qs = qs.filter(Q(traveler=user) | Q(
                trip__organizer__memberships__user=user,
                trip__organizer__memberships__role__in=(OrganizationMembership.Role.OWNER, OrganizationMembership.Role.ADMIN, OrganizationMembership.Role.BOOKINGS),
            ))
        organization = self.request.query_params.get("organization")
        if organization:
            qs = qs.filter(trip__organizer_id=organization)
        return qs.distinct()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            booking = create_booking(traveler=request.user, trip=data["trip"], quantity=data["quantity"], pickup_point=data.get("pickup_point"))
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages) from exc
        return Response(self.get_serializer(booking).data, status=status.HTTP_201_CREATED)

    def _change_status(self, request, pk, target):
        booking = self.get_object()
        try:
            booking = change_booking_status(booking=booking, actor=request.user, target_status=target)
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages) from exc
        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        return self._change_status(request, pk, Booking.Status.CONFIRMED)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        return self._change_status(request, pk, Booking.Status.DECLINED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        if booking.traveler_id == request.user.id or request.user.is_staff:
            target = Booking.Status.TRAVELER_CANCELLED
        elif can_manage(request.user, booking.trip.organizer, "bookings"):
            target = Booking.Status.ORGANIZER_CANCELLED
        else:
            raise PermissionDenied("Vous ne pouvez pas annuler cette réservation.")
        return self._change_status(request, pk, target)
