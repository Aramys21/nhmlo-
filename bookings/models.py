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
