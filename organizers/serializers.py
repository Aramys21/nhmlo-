from django.db.models import Avg, Count
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

from .models import Organization, OrganizationDocument, OrganizationMembership
from .permissions import can_manage


class OrganizationSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.get_full_name", read_only=True)
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    current_user_role = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ("id", "owner", "owner_name", "kind", "name", "about", "region", "logo", "cover", "public_email", "public_phone", "website", "instagram", "facebook", "tiktok", "verification", "verification_note", "average_rating", "review_count", "current_user_role", "created_at")
        read_only_fields = ("id", "owner", "owner_name", "verification", "verification_note", "average_rating", "review_count", "current_user_role", "created_at")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request and not can_manage(request.user, instance, "profile"):
            data.pop("verification_note", None)
        return data

    def _rating_stats(self, obj):
        from reviews.models import Review
        return Review.objects.filter(organization=obj, status=Review.Status.PUBLISHED).aggregate(total=Count("id"), average=Avg("organization_rating"))

    def get_average_rating(self, obj):
        return self._rating_stats(obj)["average"]

    def get_review_count(self, obj):
        return self._rating_stats(obj)["total"] or 0

    def get_current_user_role(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            membership = obj.memberships.filter(user=request.user).first()
            return membership.role if membership else None
        return None

    def validate_logo(self, image):
        return self._validate_image(image, "Le logo")

    def validate_cover(self, image):
        return self._validate_image(image, "La couverture")

    @staticmethod
    def _validate_image(image, label):
        if image and image.size > 5 * 1024 * 1024:
            raise serializers.ValidationError(f"{label} ne peut pas dépasser 5 Mo.")
        return image


class OrganizationMembershipSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    user_email = serializers.EmailField(write_only=True, required=True)

    class Meta:
        model = OrganizationMembership
        fields = ("id", "user", "username", "email", "user_email", "role", "created_at")
        read_only_fields = ("id", "user", "username", "email", "created_at")

    def validate_role(self, role):
        request = self.context["request"]
        if role == OrganizationMembership.Role.OWNER:
            raise serializers.ValidationError("Le rôle propriétaire ne peut pas être attribué ici.")
        membership = self.context["organization"].memberships.filter(user=request.user).first()
        if role == OrganizationMembership.Role.ADMIN and membership and membership.role != OrganizationMembership.Role.OWNER:
            raise serializers.ValidationError("Seul le propriétaire peut nommer un administrateur.")
        return role

    def create(self, validated_data):
        from accounts.models import User
        email = validated_data.pop("user_email")
        organization = validated_data.pop("organization")
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            raise serializers.ValidationError({"user_email": "Aucun compte ne correspond à cette adresse."})
        organization = self.context["organization"]
        if organization.memberships.filter(user=user).exists():
            raise serializers.ValidationError({"user_email": "Cette personne est déjà membre de l'organisation."})
        return OrganizationMembership.objects.create(organization=organization, user=user, **validated_data)


class OrganizationDocumentSerializer(serializers.ModelSerializer):
    organization = serializers.PrimaryKeyRelatedField(queryset=Organization.objects.all(), write_only=True)
    file = serializers.FileField(write_only=True)

    class Meta:
        model = OrganizationDocument
        fields = ("id", "organization", "kind", "file", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_file(self, file):
        if file.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("Un justificatif ne peut pas dépasser 10 Mo.")
        if file.name.rsplit(".", 1)[-1].lower() not in {"pdf", "jpg", "jpeg", "png", "webp"}:
            raise serializers.ValidationError("Formats acceptés : PDF, JPG, PNG et WebP.")
        extension = file.name.rsplit(".", 1)[-1].lower()
        try:
            if extension == "pdf":
                if file.read(5) != b"%PDF-":
                    raise serializers.ValidationError("Le fichier n'est pas un document PDF valide.")
            else:
                image = Image.open(file)
                image.verify()
        except (UnidentifiedImageError, OSError) as exc:
            raise serializers.ValidationError("Le fichier image ne peut pas être lu.") from exc
        finally:
            file.seek(0)
        return file
