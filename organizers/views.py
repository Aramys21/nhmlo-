from django.db import transaction
from django.http import FileResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import Organization, OrganizationDocument, OrganizationMembership
from .permissions import OrganizationAccess, can_manage
from .serializers import OrganizationDocumentSerializer, OrganizationMembershipSerializer, OrganizationSerializer


class OrganizationViewSet(viewsets.ModelViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, OrganizationAccess]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_queryset(self):
        qs = Organization.objects.select_related("owner").prefetch_related("memberships")
        user = self.request.user
        if user.is_authenticated and user.is_staff:
            return qs
        if user.is_authenticated:
            if self.request.query_params.get("managed") == "true":
                return qs.filter(memberships__user=user).distinct()
            return (qs.filter(verification=Organization.Verification.VERIFIED) | qs.filter(memberships__user=user)).distinct()
        return qs.filter(verification=Organization.Verification.VERIFIED)

    def perform_create(self, serializer):
        with transaction.atomic():
            organization = serializer.save(owner=self.request.user, verification=Organization.Verification.PENDING)
            OrganizationMembership.objects.create(organization=organization, user=self.request.user, role=OrganizationMembership.Role.OWNER)

    @action(detail=True, methods=["get", "post"], url_path="members")
    def members(self, request, pk=None):
        organization = self.get_object()
        if request.method == "POST" and not can_manage(request.user, organization, "members"):
            raise PermissionDenied("Seuls le propriétaire et les administrateurs gèrent les membres.")
        queryset = organization.memberships.select_related("user").all()
        if request.method == "GET":
            page = self.paginate_queryset(queryset)
            if page is not None:
                serializer = OrganizationMembershipSerializer(page, many=True, context={"request": request, "organization": organization})
                return self.get_paginated_response(serializer.data)
            return Response(OrganizationMembershipSerializer(queryset, many=True, context={"request": request, "organization": organization}).data)
        serializer = OrganizationMembershipSerializer(data=request.data, context={"request": request, "organization": organization})
        serializer.is_valid(raise_exception=True)
        membership = serializer.save(organization=organization)
        return Response(OrganizationMembershipSerializer(membership, context={"request": request, "organization": organization}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"members/(?P<membership_id>[^/.]+)")
    def remove_member(self, request, pk=None, membership_id=None):
        organization = self.get_object()
        if not can_manage(request.user, organization, "members"):
            raise PermissionDenied("Seuls le propriétaire et les administrateurs gèrent les membres.")
        membership = organization.memberships.filter(pk=membership_id).first()
        if membership is None:
            raise ValidationError("Membre introuvable.")
        if membership.role == OrganizationMembership.Role.OWNER:
            raise ValidationError("Le propriétaire ne peut pas être retiré de l'organisation.")
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrganizationDocumentViewSet(viewsets.ModelViewSet):
    serializer_class = OrganizationDocumentSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        queryset = OrganizationDocument.objects.select_related("organization", "uploaded_by")
        organization_id = self.request.query_params.get("organization")
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)
        if self.request.user.is_staff:
            return queryset
        return queryset.filter(
            organization__memberships__user=self.request.user,
            organization__memberships__role__in=(OrganizationMembership.Role.OWNER, OrganizationMembership.Role.ADMIN, OrganizationMembership.Role.PROFILE),
        ).distinct()

    def perform_create(self, serializer):
        organization = serializer.validated_data.get("organization")
        if organization is None or not can_manage(self.request.user, organization, "profile"):
            raise PermissionDenied("Vous devez gérer le profil de l'organisation pour ajouter un justificatif.")
        serializer.save(uploaded_by=self.request.user)

    def perform_destroy(self, instance):
        if not can_manage(self.request.user, instance.organization, "profile"):
            raise PermissionDenied("Vous ne pouvez pas supprimer ce justificatif.")
        instance.file.delete(save=False)
        instance.delete()

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        document = self.get_object()
        if not can_manage(request.user, document.organization, "profile"):
            raise PermissionDenied("Vous n'avez pas accès aux justificatifs de cette organisation.")
        return FileResponse(document.file.open("rb"), as_attachment=True, filename=document.file.name.rsplit("/", 1)[-1])
