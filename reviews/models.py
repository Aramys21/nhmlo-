from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q


class Review(models.Model):
    class Status(models.TextChoices):
        PUBLISHED = "published", "Publié"
        HIDDEN = "hidden", "Masqué après modération"

    booking = models.OneToOneField("bookings.Booking", on_delete=models.PROTECT, related_name="review")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews")
    organization = models.ForeignKey("organizers.Organization", on_delete=models.CASCADE, related_name="reviews")
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="reviews")
    organization_rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    activity_rating = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)])
    communication_rating = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)])
    program_rating = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)])
    value_rating = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(max_length=1800, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PUBLISHED, db_index=True)
    moderator_note = models.TextField(max_length=1200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("organization", "status", "created_at")), models.Index(fields=("trip", "status"))]
        constraints = [
            models.CheckConstraint(condition=Q(organization_rating__gte=1, organization_rating__lte=5), name="review_org_rating_1_5"),
            models.CheckConstraint(condition=Q(activity_rating__isnull=True) | Q(activity_rating__gte=1, activity_rating__lte=5), name="review_activity_rating_1_5"),
            models.CheckConstraint(condition=Q(communication_rating__isnull=True) | Q(communication_rating__gte=1, communication_rating__lte=5), name="review_communication_rating_1_5"),
            models.CheckConstraint(condition=Q(program_rating__isnull=True) | Q(program_rating__gte=1, program_rating__lte=5), name="review_program_rating_1_5"),
            models.CheckConstraint(condition=Q(value_rating__isnull=True) | Q(value_rating__gte=1, value_rating__lte=5), name="review_value_rating_1_5"),
        ]

    def __str__(self):
        return f"Avis de {self.reviewer} sur {self.organization} ({self.organization_rating}/5)"
