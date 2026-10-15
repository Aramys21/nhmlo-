from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from organizers.models import Organizer
from trips.models import Category, Trip
from .models import Report


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"], SECURE_SSL_REDIRECT=False)
class ReportAndAdminStatsTests(TestCase):
    def setUp(self):
        self.traveler = User.objects.create_user(username="reporter", email="reporter@example.test", password="Soleil!Rando2026")
        self.owner = User.objects.create_user(username="report-owner", email="report-owner@example.test", password="Soleil!Rando2026", role=User.Role.ORGANIZER)
        self.organizer = Organizer.objects.create(owner=self.owner, kind=Organizer.Kind.CLUB, name="Club sentier", verification=Organizer.Verification.VERIFIED)
        category = Category.objects.create(name="Nature", slug="nature")
        self.trip = Trip.objects.create(organizer=self.organizer, category=category, title="Sortie de test", description="À signaler", destination="Alger", start_at=timezone.now() + timedelta(days=5), price=Decimal("1200"), capacity=10, status=Trip.Status.PUBLISHED)
        self.client = APIClient()
        self.client.force_authenticate(self.traveler)

    def test_traveler_can_report_a_trip_and_only_see_own_reports(self):
        response = self.client.post("/api/v1/reports/", {"trip": self.trip.id, "reason": "inaccurate", "description": "La date semble incorrecte."}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], Report.Status.PENDING)
        other = User.objects.create_user(username="other-reporter", email="other-reporter@example.test", password="Soleil!Rando2026")
        other_client = APIClient()
        other_client.force_authenticate(other)
        self.assertEqual(other_client.get("/api/v1/reports/").data["count"], 0)
        self.assertEqual(other_client.get(f"/api/v1/reports/{response.data['id']}/").status_code, 404)

    def test_only_admins_can_review_reports_and_read_global_stats(self):
        report = Report.objects.create(reporter=self.traveler, trip=self.trip, reason=Report.Reason.SAFETY, description="À vérifier")
        self.assertEqual(self.client.get("/api/v1/admin/stats/").status_code, 403)
        admin = User.objects.create_superuser(username="site-admin", email="site-admin@example.test", password="Strong!Admin2026")
        admin_client = APIClient()
        admin_client.force_authenticate(admin)
        stats = admin_client.get("/api/v1/admin/stats/")
        self.assertEqual(stats.status_code, 200)
        self.assertEqual(stats.data["reports_pending"], 1)
        reviewed = admin_client.patch(f"/api/v1/reports/{report.id}/", {"status": "resolved", "moderator_note": "Vérifié"}, format="json")
        self.assertEqual(reviewed.status_code, 200)
        report.refresh_from_db()
        self.assertEqual(report.status, Report.Status.RESOLVED)
