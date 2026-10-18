from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from threading import Barrier
from unittest import skipUnless

from django.core.exceptions import ValidationError
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from bookings.models import Booking
from bookings.services import change_booking_status, confirmed_seats
from organizers.models import Organizer, OrganizationMembership
from notifications.models import Notification
from trips.models import Category, PickupPoint, Trip


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"], SECURE_SSL_REDIRECT=False)
class BookingFlowTests(TestCase):
    def setUp(self):
        self.organizer_user = User.objects.create_user(username="guide", email="guide@example.test", password="Soleil!Rando2026", role=User.Role.ORGANIZER)
        self.organizer = Organizer.objects.create(owner=self.organizer_user, kind=Organizer.Kind.CLUB, name="Sentiers", verification=Organizer.Verification.VERIFIED)
        OrganizationMembership.objects.create(organization=self.organizer, user=self.organizer_user, role=OrganizationMembership.Role.OWNER)
        self.traveler = User.objects.create_user(username="walker", email="walker@example.test", password="Soleil!Rando2026")
        category = Category.objects.create(name="Montagne", slug="montagne")
        self.trip = Trip.objects.create(organizer=self.organizer, category=category, title="Boucle en montagne", description="Une sortie", destination="Tikjda", start_at=timezone.now() + timedelta(days=5), price=Decimal("1800"), capacity=2, status=Trip.Status.PUBLISHED)

    def make_request(self, user, trip=None, quantity=1):
        client = APIClient()
        client.force_authenticate(user)
        return client.post("/api/v1/bookings/", {"trip": (trip or self.trip).id, "quantity": quantity}, format="json")

    def test_booking_keeps_pickup_details_after_organizer_removes_stop(self):
        point = PickupPoint.objects.create(
            trip=self.trip, name="Gare de Blida", description="Devant l'entrée principale",
            latitude=Decimal("36.4700"), longitude=Decimal("2.8300"), estimated_time="07:00", position=0,
        )
        client = APIClient()
        client.force_authenticate(self.traveler)
        response = client.post("/api/v1/bookings/", {"trip": self.trip.id, "quantity": 1, "pickup_point": point.id}, format="json")
        self.assertEqual(response.status_code, 201)
        booking_id = response.data["id"]

        point.delete()
        response = client.get(f"/api/v1/bookings/{booking_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["pickup_name"], "Gare de Blida")
        self.assertEqual(response.data["pickup_description"], "Devant l'entrée principale")
        self.assertEqual(response.data["pickup_time"], "07:00:00")

    def test_booking_does_not_decrement_manual_availability(self):
        initial_available = self.trip.capacity - confirmed_seats(self.trip)
        response = self.make_request(self.traveler)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.trip.capacity - confirmed_seats(self.trip), initial_available)

    def test_inactive_pickup_point_cannot_be_selected(self):
        point = PickupPoint.objects.create(
            trip=self.trip, name="Arrêt fermé", latitude=Decimal("36.4700"),
            longitude=Decimal("2.8300"), position=0, is_active=False,
        )
        client = APIClient()
        client.force_authenticate(self.traveler)
        response = client.post("/api/v1/bookings/", {"trip": self.trip.id, "quantity": 1, "pickup_point": point.id}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_organizer_can_set_declared_availability_but_not_above_capacity(self):
        client = APIClient()
        client.force_authenticate(self.organizer_user)
        response = client.patch(f"/api/v1/trips/{self.trip.id}/", {"available_seats": 1}, format="json")
        self.assertEqual(response.status_code, 200)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.declared_available_seats, 1)

        response = client.patch(f"/api/v1/trips/{self.trip.id}/", {"available_seats": 3}, format="json")
        self.assertEqual(response.status_code, 400)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.declared_available_seats, 1)

    def test_pending_requests_and_confirmations_do_not_consume_declared_availability(self):
        first = self.make_request(self.traveler)
        second_user = User.objects.create_user(username="walker2", email="walker2@example.test", password="Soleil!Rando2026")
        second = self.make_request(second_user, quantity=2)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(self.trip.declared_available_seats, 2)
        self.assertTrue(Notification.objects.filter(recipient=self.organizer_user, booking_id=first.data["id"]).exists())
        self.assertEqual(confirmed_seats(self.trip), 0)
        organizer_client = APIClient()
        organizer_client.force_authenticate(self.organizer_user)
        confirmed = organizer_client.post(f"/api/v1/bookings/{first.data['id']}/confirm/", {}, format="json")
        self.assertEqual(confirmed.status_code, 200)
        refused_for_capacity = organizer_client.post(f"/api/v1/bookings/{second.data['id']}/confirm/", {}, format="json")
        self.assertEqual(refused_for_capacity.status_code, 400)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, Trip.Status.PUBLISHED)
        self.assertEqual(self.trip.declared_available_seats, 2)
        self.assertEqual(confirmed_seats(self.trip), 1)

    def test_confirming_and_cancelling_does_not_change_declared_availability(self):
        created = self.make_request(self.traveler, quantity=2)
        organizer_client = APIClient()
        organizer_client.force_authenticate(self.organizer_user)
        self.assertEqual(organizer_client.post(f"/api/v1/bookings/{created.data['id']}/confirm/", {}, format="json").status_code, 200)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, Trip.Status.PUBLISHED)
        self.assertEqual(self.trip.declared_available_seats, 2)
        self.assertEqual(APIClient().get(f"/api/v1/trips/{self.trip.id}/").status_code, 200)
        traveler_client = APIClient()
        traveler_client.force_authenticate(self.traveler)
        self.assertEqual(traveler_client.post(f"/api/v1/bookings/{created.data['id']}/cancel/", {}, format="json").status_code, 200)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, Trip.Status.PUBLISHED)
        self.assertEqual(self.trip.declared_available_seats, 2)
        self.assertEqual(confirmed_seats(self.trip), 0)

    def test_capacity_cannot_be_lowered_below_confirmed_seats(self):
        booking = Booking.objects.create(traveler=self.traveler, trip=self.trip, quantity=2, status=Booking.Status.CONFIRMED)
        client = APIClient()
        client.force_authenticate(self.organizer_user)
        response = client.patch(f"/api/v1/trips/{self.trip.id}/", {"capacity": 1}, format="json")
        self.assertEqual(response.status_code, 400)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.capacity, 2)

    def test_other_organizer_cannot_see_or_confirm_a_booking(self):
        created = self.make_request(self.traveler)
        stranger = User.objects.create_user(username="stranger", email="stranger@example.test", password="Soleil!Rando2026", role=User.Role.ORGANIZER)
        Organizer.objects.create(owner=stranger, kind=Organizer.Kind.AGENCY, name="Other agency", verification=Organizer.Verification.VERIFIED)
        client = APIClient()
        client.force_authenticate(stranger)
        self.assertEqual(client.get(f"/api/v1/bookings/{created.data['id']}/").status_code, 404)
        self.assertEqual(client.post(f"/api/v1/bookings/{created.data['id']}/confirm/", {}, format="json").status_code, 404)

    def test_organizer_cancellation_notifies_travelers_and_cancels_active_bookings(self):
        booking = Booking.objects.create(traveler=self.traveler, trip=self.trip, quantity=1, status=Booking.Status.CONFIRMED)
        client = APIClient()
        client.force_authenticate(self.organizer_user)
        response = client.post(f"/api/v1/trips/{self.trip.id}/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.trip.refresh_from_db()
        booking.refresh_from_db()
        self.assertEqual(self.trip.status, Trip.Status.CANCELLED)
        self.assertEqual(booking.status, Booking.Status.ORGANIZER_CANCELLED)
        self.assertTrue(Notification.objects.filter(recipient=self.traveler, booking=booking).exists())


@skipUnless(connection.features.has_select_for_update, "Row-lock concurrency requires PostgreSQL or another database with SELECT FOR UPDATE.")
@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"], SECURE_SSL_REDIRECT=False)
class ConcurrentBookingCapacityTests(TransactionTestCase):
    reset_sequences = True

    def test_simultaneous_confirmations_cannot_exceed_capacity(self):
        organizer_user = User.objects.create_user(username="race-owner", email="race-owner@example.test", password="Soleil!Rando2026", role=User.Role.ORGANIZER)
        organizer = Organizer.objects.create(owner=organizer_user, kind=Organizer.Kind.CLUB, name="Race club", verification=Organizer.Verification.VERIFIED)
        OrganizationMembership.objects.create(organization=organizer, user=organizer_user, role=OrganizationMembership.Role.OWNER)
        category = Category.objects.create(name="Course", slug="course")
        trip = Trip.objects.create(organizer=organizer, category=category, title="Course", description="Test", destination="Alger", start_at=timezone.now() + timedelta(days=3), price=Decimal("100"), capacity=1, status=Trip.Status.PUBLISHED)
        travelers = [User.objects.create_user(username=f"race-{n}", email=f"race-{n}@example.test", password="Soleil!Rando2026") for n in range(2)]
        bookings = [Booking.objects.create(traveler=user, trip=trip, quantity=1) for user in travelers]
        barrier = Barrier(2)

        def confirm(booking_id):
            close_old_connections()
            barrier.wait(timeout=10)
            try:
                booking = Booking.objects.get(pk=booking_id)
                change_booking_status(booking=booking, actor=organizer_user, target_status=Booking.Status.CONFIRMED)
                return "confirmed"
            except ValidationError:
                return "capacity-rejected"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(confirm, [item.id for item in bookings]))
        self.assertEqual(outcomes.count("confirmed"), 1)
        self.assertEqual(confirmed_seats(trip), 1)
