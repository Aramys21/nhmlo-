from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q


class Category(models.Model):
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=90, unique=True)
    description = models.CharField(max_length=180, blank=True)

    class Meta:
        ordering = ("name",)
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Trip(models.Model):
    class Universe(models.TextChoices):
        VOYAGES = "voyages", "Voyages & Évasions"
        NATURE = "nature", "Randonnées & Camping"

    class Status(models.TextChoices):
        DRAFT = "draft", "Brouillon"
        PENDING = "pending", "En attente de validation"
        PUBLISHED = "published", "Publiée"
        FULL = "full", "Complète"
        CLOSED = "closed", "Clôturée"
        CANCELLED = "cancelled", "Annulée"

    class Difficulty(models.TextChoices):
        EASY = "easy", "Facile"
        MODERATE = "moderate", "Modérée"
        HARD = "hard", "Difficile"

    organizer = models.ForeignKey("organizers.Organization", on_delete=models.CASCADE, related_name="trips")
    universe = models.CharField(max_length=12, choices=Universe.choices, default=Universe.NATURE, db_index=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="trips")
    title = models.CharField(max_length=180)
    description = models.TextField()
    activity_type = models.CharField(max_length=30, default="trip")
    accommodation = models.CharField(max_length=80, blank=True)
    board = models.CharField(max_length=80, blank=True)
    destination = models.CharField(max_length=120, db_index=True)
    destination_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, validators=[MinValueValidator(-90), MaxValueValidator(90)])
    destination_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, validators=[MinValueValidator(-180), MaxValueValidator(180)])
    departure_region = models.CharField(max_length=120, blank=True)
    start_at = models.DateTimeField(db_index=True)
    end_at = models.DateTimeField(null=True, blank=True)
    duration_days = models.PositiveSmallIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    capacity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    declared_available_seats = models.PositiveIntegerField(null=True, blank=True)
    difficulty = models.CharField(max_length=12, choices=Difficulty.choices, blank=True)
    family_friendly = models.BooleanField(default=False)
    itinerary = models.TextField(blank=True)
    requirements = models.TextField(blank=True)
    included = models.TextField(blank=True)
    excluded = models.TextField(blank=True)
    cancellation_policy = models.TextField(blank=True)
    meeting_name = models.CharField(max_length=150, blank=True)
    meeting_time = models.TimeField(null=True, blank=True)
    meeting_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, validators=[MinValueValidator(-90), MaxValueValidator(90)])
    meeting_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, validators=[MinValueValidator(-180), MaxValueValidator(180)])
    destination_estimated_time = models.TimeField(null=True, blank=True)
    route_geojson = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT, db_index=True)
    featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("start_at",)
        indexes = [models.Index(fields=("status", "start_at")), models.Index(fields=("destination", "start_at"))]
        constraints = [
            models.CheckConstraint(condition=Q(capacity__gte=1), name="trip_capacity_at_least_one"),
            models.CheckConstraint(condition=Q(declared_available_seats__isnull=True) | Q(declared_available_seats__lte=models.F("capacity")), name="trip_declared_seats_not_over_capacity"),
            models.CheckConstraint(condition=Q(price__gte=0), name="trip_price_nonnegative"),
            models.CheckConstraint(condition=Q(meeting_latitude__isnull=True) | Q(meeting_latitude__gte=-90, meeting_latitude__lte=90), name="trip_meeting_latitude_bounds"),
            models.CheckConstraint(condition=Q(meeting_longitude__isnull=True) | Q(meeting_longitude__gte=-180, meeting_longitude__lte=180), name="trip_meeting_longitude_bounds"),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.declared_available_seats is None:
            self.declared_available_seats = self.capacity
        super().save(*args, **kwargs)


class TripPhoto(models.Model):
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to="trips/photos/")
    caption = models.CharField(max_length=140, blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("position", "id")


class PickupPoint(models.Model):
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="pickup_points")
    name = models.CharField(max_length=140)
    description = models.CharField(max_length=240, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, validators=[MinValueValidator(-90), MaxValueValidator(90)])
    longitude = models.DecimalField(max_digits=9, decimal_places=6, validators=[MinValueValidator(-180), MaxValueValidator(180)])
    estimated_time = models.TimeField(null=True, blank=True)
    position = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("position", "id")
        constraints = [
            models.UniqueConstraint(fields=("trip", "position"), name="unique_pickup_order_per_trip"),
            models.CheckConstraint(condition=Q(latitude__gte=-90, latitude__lte=90), name="pickup_latitude_bounds"),
            models.CheckConstraint(condition=Q(longitude__gte=-180, longitude__lte=180), name="pickup_longitude_bounds"),
        ]

    def __str__(self):
        return f"{self.name} — {self.trip.title}"
