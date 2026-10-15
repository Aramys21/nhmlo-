from pathlib import Path
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from bookings.models import Booking
from trips.models import Category, Trip
from .models import Organization, OrganizationDocument, OrganizationMembership


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"], SECURE_SSL_REDIRECT=False)
class OrganizationMembershipTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="org-owner", email="org-owner@example.test", password="not-a-real-secret")
        self.organization = Organization.objects.create(owner=self.owner, kind=Organization.Kind.ASSOCIATION, name="Collectif des dunes", verification=Organization.Verification.VERIFIED)
        OrganizationMembership.objects.create(organization=self.organization, user=self.owner, role=OrganizationMembership.Role.OWNER)
        self.publisher = User.objects.create_user(username="publisher", email="publisher@example.test", password="not-a-real-secret")
        self.bookings_manager = User.objects.create_user(username="reservations", email="reservations@example.test", password="not-a-real-secret")
        self.profile_editor = User.objects.create_user(username="profile-editor", email="profile-editor@example.test", password="not-a-real-secret")
        OrganizationMembership.objects.create(organization=self.organization, user=self.publisher, role=OrganizationMembership.Role.PUBLISHER)
        OrganizationMembership.objects.create(organization=self.organization, user=self.bookings_manager, role=OrganizationMembership.Role.BOOKINGS)
        OrganizationMembership.objects.create(organization=self.organization, user=self.profile_editor, role=OrganizationMembership.Role.PROFILE)
        self.category = Category.objects.create(name="Excursion", slug="excursion")

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_a_user_can_create_multiple_organizations_and_is_owner_of_both(self):
        client = self.client_for(self.owner)
        first = client.post("/api/v1/organizations/", {"name": "Atlas Voyages", "kind": "agency", "region": "Alger"}, format="json")
        second = client.post("/api/v1/organizations/", {"name": "Les Sentiers", "kind": "club", "region": "Béjaïa"}, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(self.owner.organization_memberships.count(), 3)
        self.assertEqual(first.data["current_user_role"], OrganizationMembership.Role.OWNER)
        self.assertEqual(first.data["verification"], Organization.Verification.PENDING)

    def test_owner_can_invite_existing_accounts_with_scoped_roles(self):
        client = self.client_for(self.owner)
        response = client.post(f"/api/v1/organizations/{self.organization.id}/members/", {"user_email": "new-member@example.test", "role": "bookings"}, format="json")
        self.assertEqual(response.status_code, 400)
        member = User.objects.create_user(username="new-member", email="new-member@example.test", password="not-a-real-secret")
        response = client.post(f"/api/v1/organizations/{self.organization.id}/members/", {"user_email": member.email, "role": "bookings"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["role"], OrganizationMembership.Role.BOOKINGS)
        forbidden = self.client_for(self.publisher).post(f"/api/v1/organizations/{self.organization.id}/members/", {"user_email": "x@example.test", "role": "admin"}, format="json")
        self.assertEqual(forbidden.status_code, 403)

    def test_publisher_and_booking_roles_are_separate_and_profile_editor_can_edit(self):
        start = timezone.now() + timedelta(days=5)
        trip_payload = {"organization_id": self.organization.id, "category": self.category.id, "title": "La côte sauvage", "description": "Une sortie guidée.", "universe": "nature", "activity_type": "excursion", "destination": "Béjaïa", "start_at": start.isoformat(), "duration_days": 1, "price": "1500", "capacity": 8}
        publisher = self.client_for(self.publisher)
        created = publisher.post("/api/v1/trips/", trip_payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        created_trip = Trip.objects.get(pk=created.data["id"])
        created_trip.status = Trip.Status.PUBLISHED
        created_trip.save(update_fields=("status",))
        rejected = self.client_for(self.bookings_manager).post("/api/v1/trips/", {**trip_payload, "title": "Sans droit"}, format="json")
        self.assertEqual(rejected.status_code, 400)
        traveler = User.objects.create_user(username="guest", email="guest@example.test", password="not-a-real-secret")
        booking = Booking.objects.create(traveler=traveler, trip=created_trip, quantity=1)
        booking_client = self.client_for(self.bookings_manager)
        self.assertEqual(booking_client.get(f"/api/v1/bookings/{booking.id}/").status_code, 200)
        self.assertEqual(booking_client.post(f"/api/v1/bookings/{booking.id}/confirm/", {}, format="json").status_code, 200)
        self.assertEqual(self.client_for(self.publisher).get(f"/api/v1/bookings/{booking.id}/").status_code, 404)
        edit = self.client_for(self.profile_editor).patch(f"/api/v1/organizations/{self.organization.id}/", {"about": "Association locale."}, format="json")
        self.assertEqual(edit.status_code, 200)

    def test_verification_documents_are_private_and_download_requires_membership(self):
        document_file = SimpleUploadedFile("registre.pdf", b"%PDF-1.4\nexample", content_type="application/pdf")
        owner_client = self.client_for(self.owner)
        uploaded = owner_client.post("/api/v1/organization-documents/", {"organization": self.organization.id, "kind": "business", "file": document_file}, format="multipart")
        self.assertEqual(uploaded.status_code, 201, uploaded.data)
        self.assertNotIn("file", uploaded.data)
        document = OrganizationDocument.objects.get(pk=uploaded.data["id"])
        media_root = Path(settings.MEDIA_ROOT).resolve()
        private_path = Path(document.file.path).resolve()
        self.assertNotIn(media_root, private_path.parents)
        download = owner_client.get(f"/api/v1/organization-documents/{document.id}/download/")
        self.assertEqual(download.status_code, 200)
        download.close()
        stranger = User.objects.create_user(username="outsider", email="outsider@example.test", password="not-a-real-secret")
        self.assertEqual(self.client_for(stranger).get(f"/api/v1/organization-documents/{document.id}/download/").status_code, 404)
        document.file.delete(save=False)

    def test_verification_requires_reviewed_documents_and_a_decision_note(self):
        organization = Organization.objects.create(owner=self.owner, kind=Organization.Kind.AGENCY, name="Nouvelle agence")
        document = OrganizationDocument.objects.create(
            organization=organization,
            uploaded_by=self.owner,
            kind=OrganizationDocument.Kind.BUSINESS,
            file=SimpleUploadedFile("agrement.pdf", b"%PDF-1.4\nexample", content_type="application/pdf"),
        )
        organization.verification = Organization.Verification.VERIFIED
        with self.assertRaises(DjangoValidationError):
            organization.full_clean()
        organization.verification_note = "Agrément contrôlé par l’équipe Rihla."
        organization.full_clean()
        organization.save()
        organization.refresh_from_db()
        self.assertEqual(organization.verification, Organization.Verification.VERIFIED)
        document.file.delete(save=False)
