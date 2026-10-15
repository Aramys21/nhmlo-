from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import User


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"], SECURE_SSL_REDIRECT=False)
class RegistrationApiTests(TestCase):
    def test_registration_returns_a_traveler_token_by_default(self):
        response = APIClient().post("/api/v1/auth/register/", {
            "username": "newtraveler", "email": "traveler@example.test", "password": "Soleil!Rando2026",
            "first_name": "Nadia", "last_name": "Test",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["token"])
        self.assertEqual(response.data["user"]["role"], User.Role.TRAVELER)

    def test_registration_allows_an_organizer_but_not_an_admin_role(self):
        client = APIClient()
        response = client.post("/api/v1/auth/register/", {
            "username": "neworganizer", "email": "organizer@example.test", "password": "Soleil!Rando2026", "role": "organizer",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user"]["role"], User.Role.ORGANIZER)
        denied = client.post("/api/v1/auth/register/", {
            "username": "badadmin", "email": "badadmin@example.test", "password": "Soleil!Rando2026", "role": "admin",
        }, format="json")
        self.assertEqual(denied.status_code, 400)

    def test_logout_revokes_the_api_token(self):
        client = APIClient()
        created = client.post("/api/v1/auth/register/", {
            "username": "logoutuser", "email": "logout@example.test", "password": "Soleil!Rando2026",
        }, format="json")
        client.credentials(HTTP_AUTHORIZATION=f"Token {created.data['token']}")
        self.assertEqual(client.post("/api/v1/auth/logout/", {}, format="json").status_code, 204)
        self.assertEqual(client.get("/api/v1/auth/me/").status_code, 401)
