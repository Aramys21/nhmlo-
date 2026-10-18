from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q


class Booking(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "En attente de confirmation"
        CONFIRMED = "confirmed", "Confirmée"
        DECLINED = "declined", "Refusée par l'organisateur"
        TRAVELER_CANCELLED = "traveler_cancelled", "Annulée par le voyageur"
        ORGANIZER_CANCELLED = "organizer_cancelled", "Annulée par l'organisateur"
        COMPLETED = "completed", "Terminée"

    traveler = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookings")
    trip = models.ForeignKey("trips.Trip", on_delete=models.PROTECT, related_name="bookings")
    pickup_point = models.ForeignKey("trips.PickupPoint", null=True, blank=True, on_delete=models.SET_NULL, related_name="bookings")
    pickup_name_snapshot = models.CharField(max_length=140, blank=True)
    pickup_description_snapshot = models.CharField(max_length=240, blank=True)
    pickup_latitude_snapshot = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    pickup_longitude_snapshot = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    pickup_time_snapshot = models.TimeField(null=True, blank=True)
    quantity = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PENDING, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("trip", "status")), models.Index(fields=("traveler", "status"))]
        constraints = [models.CheckConstraint(condition=Q(quantity__gte=1), name="booking_quantity_at_least_one")]

    def __str__(self):
        return f"{self.traveler} — {self.trip} ({self.get_status_display()})"
