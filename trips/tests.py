from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from organizers.models import Organizer, OrganizationMembership
from bookings.models import Booking
from .models import Category, Trip


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"], SECURE_SSL_REDIRECT=False)
class TripVisibilityAndSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(username="owner", email="owner@example.test", password="Soleil!Rando2026", role=User.Role.ORGANIZER)
        self.organizer = Organizer.objects.create(owner=self.owner, kind=Organizer.Kind.CLUB, name="Club du Nord", verification=Organizer.Verification.VERIFIED)
        OrganizationMembership.objects.create(organization=self.organizer, user=self.owner, role=OrganizationMembership.Role.OWNER)
        self.category = Category.objects.create(name="Randonnée", slug="randonnee")
        self.trip = Trip.objects.create(
            organizer=self.organizer, category=self.category, title="Crête du Djurdjura", description="Sentier de montagne",
            destination="Tikjda", start_at=timezone.now() + timedelta(days=5), price=Decimal("2500"), capacity=12,
            status=Trip.Status.PUBLISHED,
        )

    def test_public_search_finds_published_trips_and_filters_destination(self):
        response = self.client.get("/api/v1/trips/?q=Crête&destination=Tikjda")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.trip.id)

    def test_price_order_and_invalid_filter_values(self):
        Trip.objects.create(organizer=self.organizer, category=self.category, title="Balade économique", description="Petite balade", destination="Béjaïa", start_at=timezone.now() + timedelta(days=4), price=Decimal("900"), capacity=10, status=Trip.Status.PUBLISHED)
        ordered = self.client.get("/api/v1/trips/?ordering=price_asc")
        self.assertEqual(ordered.status_code, 200)
        self.assertEqual(ordered.data["results"][0]["title"], "Balade économique")
        invalid = self.client.get("/api/v1/trips/?price_min=not-a-price")
        self.assertEqual(invalid.status_code, 400)

    def test_unverified_organizer_trips_are_not_public(self):
        self.organizer.verification = Organizer.Verification.PENDING
        self.organizer.save()
        response = self.client.get("/api/v1/trips/")
        self.assertEqual(response.data["count"], 0)

    def test_an_organizer_can_read_own_draft_but_another_cannot(self):
        self.trip.status = Trip.Status.DRAFT
        self.trip.save()
        own_client = APIClient()
        own_client.force_authenticate(self.owner)
        self.assertEqual(own_client.get(f"/api/v1/trips/{self.trip.id}/").status_code, 200)
        stranger = User.objects.create_user(username="stranger", email="stranger@example.test", password="Soleil!Rando2026", role=User.Role.ORGANIZER)
        other_client = APIClient()
        other_client.force_authenticate(stranger)
        self.assertEqual(other_client.get(f"/api/v1/trips/{self.trip.id}/").status_code, 404)

    def test_travelers_with_a_booking_can_reopen_a_closed_trip_detail(self):
        self.trip.status = Trip.Status.CLOSED
        self.trip.save()
        traveler = User.objects.create_user(username="pastguest", email="pastguest@example.test", password="Soleil!Rando2026")
        Booking.objects.create(traveler=traveler, trip=self.trip, quantity=1)
        participant_client = APIClient()
        participant_client.force_authenticate(traveler)
        self.assertEqual(participant_client.get(f"/api/v1/trips/{self.trip.id}/").status_code, 200)
        stranger = User.objects.create_user(username="no-booking", email="no-booking@example.test", password="Soleil!Rando2026")
        stranger_client = APIClient()
        stranger_client.force_authenticate(stranger)
        self.assertEqual(stranger_client.get(f"/api/v1/trips/{self.trip.id}/").status_code, 404)
