from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from organizers.models import OrganizationMembership
from organizers.permissions import can_manage

from .models import Booking


def confirmed_seats(trip):
    return trip.bookings.filter(status=Booking.Status.CONFIRMED).aggregate(total=Sum("quantity"))["total"] or 0


def notify_booking_managers(organization, booking, message):
    from notifications.models import Notification
    recipients = organization.memberships.filter(role__in=(OrganizationMembership.Role.OWNER, OrganizationMembership.Role.ADMIN, OrganizationMembership.Role.BOOKINGS)).values_list("user_id", flat=True)
    Notification.objects.bulk_create([Notification(recipient_id=user_id, booking=booking, message=message) for user_id in recipients])


@transaction.atomic
def create_booking(*, traveler, trip, quantity, pickup_point=None):
    trip = trip.__class__.objects.select_for_update().get(pk=trip.pk)
    if trip.status != trip.Status.PUBLISHED:
        raise ValidationError("Cette annonce n'accepte pas de réservations.")
    if trip.start_at <= timezone.now():
        raise ValidationError("La date de départ est passée.")
    if quantity < 1:
        raise ValidationError("Réservez au moins une place.")
    if pickup_point and pickup_point.trip_id != trip.pk:
        raise ValidationError("Ce point de ramassage ne correspond pas à cette annonce.")
    if pickup_point and not pickup_point.is_active:
        raise ValidationError("Ce point de ramassage n'est plus disponible.")
    if trip.organizer.memberships.filter(user=traveler).exists():
        raise ValidationError("Les membres de l'organisation ne peuvent pas réserver leurs propres activités.")
    if confirmed_seats(trip) + quantity > trip.capacity:
        raise ValidationError("Il ne reste pas assez de places disponibles.")
    if trip.declared_available_seats < quantity:
        raise ValidationError("La disponibilité déclarée par l'organisateur ne permet pas cette demande.")
    pickup = pickup_point or None
    booking = Booking.objects.create(
        traveler=traveler,
        trip=trip,
        quantity=quantity,
        pickup_point=pickup,
        pickup_name_snapshot=pickup.name if pickup else trip.meeting_name or trip.departure_region or "Départ du bus",
        pickup_description_snapshot=pickup.description if pickup else "",
        pickup_latitude_snapshot=pickup.latitude if pickup else trip.meeting_latitude,
        pickup_longitude_snapshot=pickup.longitude if pickup else trip.meeting_longitude,
        pickup_time_snapshot=pickup.estimated_time if pickup else trip.meeting_time,
    )
    notify_booking_managers(trip.organizer, booking, f"Nouvelle demande de réservation pour « {trip.title} ».")
    return booking


@transaction.atomic
def change_booking_status(*, booking, actor, target_status):
    trip_model = booking.trip.__class__
    trip = trip_model.objects.select_for_update().select_related("organizer").get(pk=booking.trip_id)
    booking = Booking.objects.select_for_update().select_related("traveler", "pickup_point").get(pk=booking.pk)
    manages_bookings = can_manage(actor, trip.organizer, "bookings")
    is_traveler = booking.traveler_id == actor.pk

    if target_status == Booking.Status.CONFIRMED:
        if not manages_bookings:
            raise ValidationError("Seul l'organisateur peut confirmer cette réservation.")
        if booking.status != Booking.Status.PENDING:
            raise ValidationError("Seule une demande en attente peut être confirmée.")
        if trip.status != trip.Status.PUBLISHED or trip.start_at <= timezone.now():
            raise ValidationError("Cette annonce n'accepte plus de confirmation.")
        if confirmed_seats(trip) + booking.quantity > trip.capacity:
            raise ValidationError("La capacité disponible ne permet pas cette confirmation.")
    elif target_status == Booking.Status.DECLINED:
        if not manages_bookings:
            raise ValidationError("Seul l'organisateur peut refuser cette réservation.")
        if booking.status != Booking.Status.PENDING:
            raise ValidationError("Seule une demande en attente peut être refusée.")
    elif target_status == Booking.Status.TRAVELER_CANCELLED:
        if not (is_traveler or is_staff):
            raise ValidationError("Vous ne pouvez pas annuler cette réservation.")
        if booking.status not in (Booking.Status.PENDING, Booking.Status.CONFIRMED):
            raise ValidationError("Cette réservation ne peut plus être annulée.")
    elif target_status == Booking.Status.ORGANIZER_CANCELLED:
        if not manages_bookings:
            raise ValidationError("Seul l'organisateur peut annuler cette réservation.")
        if booking.status not in (Booking.Status.PENDING, Booking.Status.CONFIRMED):
            raise ValidationError("Cette réservation ne peut plus être annulée.")
    else:
        raise ValidationError("Transition de réservation inconnue.")

    booking.status = target_status
    booking.save(update_fields=("status", "updated_at"))

    message = f"Votre réservation pour « {trip.title} » : {booking.get_status_display().lower()}."
    if target_status in (Booking.Status.CONFIRMED, Booking.Status.DECLINED, Booking.Status.ORGANIZER_CANCELLED):
        from notifications.models import Notification
        Notification.objects.create(recipient=booking.traveler, booking=booking, message=message)
    else:
        notify_booking_managers(trip.organizer, booking, message)
    return booking
