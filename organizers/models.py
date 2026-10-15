from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from .storage import PrivateDocumentStorage


class Organization(models.Model):
    class Kind(models.TextChoices):
        AGENCY = "agency", "Agence de voyages"
        CLUB = "club", "Club de randonnée"
        ASSOCIATION = "association", "Association"

    class Verification(models.TextChoices):
        PENDING = "pending", "En attente"
        VERIFIED = "verified", "Vérifiée"
        REJECTED = "rejected", "Refusée"

    # Creator is an audit field; all access is granted through memberships.
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_organizations")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    name = models.CharField(max_length=140)
    about = models.TextField(blank=True)
    region = models.CharField(max_length=100, blank=True)
    logo = models.ImageField(upload_to="organizations/logos/", blank=True)
    cover = models.ImageField(upload_to="organizations/covers/", blank=True)
    public_email = models.EmailField(blank=True)
    public_phone = models.CharField(max_length=40, blank=True)
    website = models.URLField(blank=True)
    instagram = models.URLField(blank=True)
    facebook = models.URLField(blank=True)
    tiktok = models.URLField(blank=True)
    verification = models.CharField(max_length=12, choices=Verification.choices, default=Verification.PENDING, db_index=True)
    verification_note = models.TextField(max_length=1200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name", "id")

    def clean(self):
        super().clean()
        if self.verification != self.Verification.VERIFIED:
            return
        previous = None
        if self.pk:
            previous = type(self).objects.filter(pk=self.pk).values_list("verification", flat=True).first()
        if previous == self.Verification.VERIFIED:
            return
        if not self.pk or not self.documents.exists():
            raise ValidationError({"verification": "Ajoutez et examinez les justificatifs avant de vérifier l’organisation."})
        if not self.verification_note.strip():
            raise ValidationError({"verification_note": "Consignez brièvement la décision de vérification."})

    def __str__(self):
        return self.name


class OrganizationMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Propriétaire"
        ADMIN = "admin", "Administrateur"
        PUBLISHER = "publisher", "Publication des activités"
        BOOKINGS = "bookings", "Gestion des réservations"
        PROFILE = "profile", "Modification du profil"

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="organization_memberships")
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.PUBLISHER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("organization__name", "user__username")
        constraints = [models.UniqueConstraint(fields=("organization", "user"), name="unique_organization_member")]

    def __str__(self):
        return f"{self.user} — {self.organization} ({self.get_role_display()})"

    def clean(self):
        if self.role == self.Role.OWNER and self.organization.owner_id != self.user_id:
            raise ValidationError("Le rôle propriétaire est réservé au créateur de l'organisation.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.role == self.Role.OWNER:
            raise ValidationError("Le propriétaire ne peut pas être retiré de l'organisation.")
        return super().delete(*args, **kwargs)


class OrganizationDocument(models.Model):
    class Kind(models.TextChoices):
        BUSINESS = "business", "Registre ou agrément"
        IDENTITY = "identity", "Justificatif d'identité"
        OTHER = "other", "Autre justificatif"

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="documents")
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.BUSINESS)
    file = models.FileField(upload_to="organizations/verification/", storage=PrivateDocumentStorage())
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="organization_documents")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.organization} — {self.get_kind_display()}"


# Transitional import alias for older integrations; the Django model is Organization.
Organizer = Organization
