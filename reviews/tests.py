from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from bookings.models import Booking
from organizers.models import Organization, OrganizationMembership
from trips.models import Category, Trip
from .models import Review


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"], SECURE_SSL_REDIRECT=False)
class VerifiedReviewTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="review-owner", email="review-owner@example.test", password="not-a-real-secret")
        self.organization = Organization.objects.create(owner=self.owner, kind=Organization.Kind.AGENCY, name="Voyages du Nord", verification=Organization.Verification.VERIFIED)
        OrganizationMembership.objects.create(organization=self.organization, user=self.owner, role=OrganizationMembership.Role.OWNER)
        self.traveler = User.objects.create_user(username="reviewer", email="reviewer@example.test", password="not-a-real-secret", first_name="Lina")
        category = Category.objects.create(name="Séjour", slug="sejour")
        now = timezone.now()
        self.trip = Trip.objects.create(organizer=self.organization, category=category, title="Escapade à Tipaza", description="Un séjour accompagné.", universe=Trip.Universe.VOYAGES, destination="Tipaza", start_at=now - timedelta(days=3), end_at=now - timedelta(days=2), price=Decimal("5000"), capacity=8, status=Trip.Status.CLOSED)
        self.booking = Booking.objects.create(traveler=self.traveler, trip=self.trip, quantity=2, status=Booking.Status.CONFIRMED)
        self.client = APIClient()
        self.client.force_authenticate(self.traveler)

    def review_payload(self):
        return {"booking": self.booking.id, "organization_rating": 5, "activity_rating": 4, "communication_rating": 5, "program_rating": 4, "value_rating": 4, "comment": "Une belle escapade, très bien préparée."}

    def test_only_a_participant_can_rate_a_completed_activity_once(self):
        response = self.client.post("/api/v1/reviews/", self.review_payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        duplicate = self.client.post("/api/v1/reviews/", self.review_payload(), format="json")
        self.assertEqual(duplicate.status_code, 400)
        stranger = User.objects.create_user(username="stranger-review", email="stranger-review@example.test", password="not-a-real-secret")
        other_client = APIClient()
        other_client.force_authenticate(stranger)
        self.assertEqual(other_client.post("/api/v1/reviews/", self.review_payload(), format="json").status_code, 400)
        organization = self.client.get(f"/api/v1/organizations/{self.organization.id}/")
        self.assertEqual(organization.data["average_rating"], 5.0)
        self.assertEqual(organization.data["review_count"], 1)
        self.assertEqual(self.client.get("/api/v1/reviews/?ordering=rating").data["results"][0]["reviewer_name"], "Lina")

    def test_future_activity_cannot_be_reviewed_even_with_confirmed_booking(self):
        self.trip.start_at = timezone.now() + timedelta(days=2)
        self.trip.end_at = timezone.now() + timedelta(days=3)
        self.trip.save()
        response = self.client.post("/api/v1/reviews/", self.review_payload(), format="json")
        self.assertEqual(response.status_code, 400)

    def test_admin_moderates_reviews_and_a_traveler_can_report_one(self):
        created = self.client.post("/api/v1/reviews/", self.review_payload(), format="json")
        self.assertEqual(created.status_code, 201)
        review = Review.objects.get(pk=created.data["id"])
        flagger = User.objects.create_user(username="flagger", email="flagger@example.test", password="not-a-real-secret")
        flagger_client = APIClient()
        flagger_client.force_authenticate(flagger)
        report = flagger_client.post("/api/v1/reports/", {"review": review.id, "reason": "abusive", "description": "À examiner."}, format="json")
        self.assertEqual(report.status_code, 201, report.data)
        self.assertEqual(self.client.patch(f"/api/v1/reviews/{review.id}/", {"status": "hidden"}, format="json").status_code, 403)
        admin = User.objects.create_superuser(username="review-admin", email="review-admin@example.test", password="not-a-real-secret")
        admin_client = APIClient()
        admin_client.force_authenticate(admin)
        hidden = admin_client.patch(f"/api/v1/reviews/{review.id}/", {"status": "hidden", "moderator_note": "Avis signalé et masqué."}, format="json")
        self.assertEqual(hidden.status_code, 200, hidden.data)
        self.assertEqual(self.client.get(f"/api/v1/reviews/?organization={self.organization.id}").data["count"], 0)
        self.organization.refresh_from_db()
        self.assertEqual(Review.objects.filter(organization=self.organization, status=Review.Status.PUBLISHED).count(), 0)
