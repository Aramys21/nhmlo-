from django.conf import settings
from django.db import models
from django.db.models import Q


class Report(models.Model):
    class Reason(models.TextChoices):
        INACCURATE = "inaccurate", "Informations inexactes"
        SAFETY = "safety", "Sécurité ou conditions préoccupantes"
        ABUSIVE = "abusive", "Contenu inapproprié"
        SPAM = "spam", "Publicité indésirable"
        OTHER = "other", "Autre"

    class Status(models.TextChoices):
        PENDING = "pending", "À examiner"
        IN_REVIEW = "in_review", "En cours d'examen"
        RESOLVED = "resolved", "Traité"
        DISMISSED = "dismissed", "Classé sans suite"

    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reports")
    trip = models.ForeignKey("trips.Trip", null=True, blank=True, on_delete=models.PROTECT, related_name="reports")
    organizer = models.ForeignKey("organizers.Organization", null=True, blank=True, on_delete=models.PROTECT, related_name="reports")
    review = models.ForeignKey("reviews.Review", null=True, blank=True, on_delete=models.PROTECT, related_name="reports")
    reason = models.CharField(max_length=20, choices=Reason.choices)
    description = models.TextField(max_length=1200, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True)
    moderator_note = models.TextField(max_length=1200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("status", "-created_at")
        indexes = [models.Index(fields=("status", "created_at"))]
        constraints = [models.CheckConstraint(
            condition=(
                Q(trip__isnull=False, organizer__isnull=True, review__isnull=True)
                | Q(trip__isnull=True, organizer__isnull=False, review__isnull=True)
                | Q(trip__isnull=True, organizer__isnull=True, review__isnull=False)
            ),
            name="report_has_exactly_one_target",
        )]

    def __str__(self):
        target = self.trip.title if self.trip_id else self.organizer.name if self.organizer_id else f"Avis de {self.review.reviewer}"
        return f"{self.get_reason_display()} — {target}"
