from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils.crypto import get_random_string
from django.utils import timezone

from accounts.models import User
from organizers.models import Organizer, OrganizationMembership
from trips.models import Category, PickupPoint, Trip


class Command(BaseCommand):
    help = "Crée des comptes, organisateurs et annonces de démonstration réutilisables."

    def handle(self, *args, **options):
        categories = [
            ("Randonnée", "randonnee"), ("Excursion", "excursion"), ("Voyage organisé", "voyage-organise"),
            ("Camping", "camping"), ("Aventure en montagne", "montagne"), ("Plage et mer", "plage-mer"),
            ("Séjour premium", "sejour"), ("Hôtels & resorts", "hotellerie"), ("Expériences exclusives", "experiences-exclusives"),
        ]
        category_map = {slug: Category.objects.update_or_create(slug=slug, defaults={"name": name})[0] for name, slug in categories}

        accounts = [
            ("demo.agence", "Atlas Aventure", Organizer.Kind.AGENCY, "Voyages accompagnés et séjours découverte en Algérie.", "Alger"),
            ("demo.club", "Les Sentiers Verts", Organizer.Kind.CLUB, "Un club passionné de randonnée et de nature.", "Tizi Ouzou"),
        ]
        organizers = {}
        generated_credentials = []
        for username, name, kind, about, region in accounts:
            user, created = User.objects.get_or_create(username=username, defaults={"email": f"{username}@example.test", "role": User.Role.ORGANIZER, "first_name": "Équipe"})
            if created:
                password = get_random_string(24)
                user.set_password(password)
                user.save()
                generated_credentials.append(f"{username} : {password}")
            organizers[username] = Organizer.objects.update_or_create(owner=user, defaults={
                "kind": kind, "name": name, "about": about, "region": region,
                "public_email": f"contact+{username}@example.test", "verification": Organizer.Verification.PENDING,
            })[0]
            OrganizationMembership.objects.get_or_create(organization=organizers[username], user=user, defaults={"role": OrganizationMembership.Role.OWNER})

        now = timezone.now()
        samples = [
            ("demo.club", "Lever du soleil au Djurdjura", "Tikjda", "montagne", 8, 1800, "easy", True, 36.45, 4.12),
            ("demo.agence", "Une journée à Tipaza", "Tipaza", "excursion", 14, 6500, "", True, 36.59, 2.45),
            ("demo.club", "Les cascades de Kefrida", "Béjaïa", "randonnee", 20, 2200, "moderate", False, 36.63, 5.27),
            ("demo.agence", "Week-end dans le désert", "Timimoun", "voyage-organise", 32, 28500, "easy", True, 29.26, 0.23),
            ("demo.agence", "Campement sous les étoiles", "Djanet", "camping", 45, 42000, "moderate", False, 24.55, 9.48),
            ("demo.club", "Sentier côtier de Béjaïa", "Béjaïa", "plage-mer", 11, 1500, "easy", True, 36.75, 5.08),
        ]
        for index, (owner, title, destination, slug, offset, price, difficulty, family, lat, lon) in enumerate(samples):
            organizer = organizers[owner]
            universe = Trip.Universe.VOYAGES if slug in {"voyage-organise", "plage-mer", "sejour", "hotellerie", "experiences-exclusives"} else Trip.Universe.NATURE
            trip, _ = Trip.objects.update_or_create(title=title, organizer=organizer, defaults={
                "category": category_map[slug], "universe": universe, "accommodation": "Écolodge et hôtel 4 étoiles" if universe == Trip.Universe.VOYAGES else "",
                "description": f"Partez à la découverte de {destination} avec un guide local. Une sortie conviviale, pensée pour profiter pleinement du paysage et partager un beau moment.",
                "activity_type": slug, "destination": destination, "departure_region": organizer.region,
                "start_at": now + timedelta(days=offset), "end_at": now + timedelta(days=offset, hours=8 if slug != "voyage-organise" else 48),
                "duration_days": 2 if slug == "voyage-organise" else 1, "price": Decimal(price), "capacity": 16 + index * 2,
                "difficulty": difficulty, "family_friendly": family, "itinerary": "Accueil du groupe, départ accompagné, pauses et retour au point de rassemblement.",
                "requirements": "Prévoir de l'eau, une tenue adaptée et des chaussures confortables.",
                "included": "Accompagnement et organisation de la sortie.", "excluded": "Repas et dépenses personnelles.",
                "cancellation_policy": "Annulation possible avant confirmation par l'organisateur.",
                "meeting_name": f"Centre-ville de {organizer.region}", "meeting_latitude": Decimal(str(lat)),
                "meeting_longitude": Decimal(str(lon)), "status": Trip.Status.PUBLISHED, "featured": index < 3,
            })
            PickupPoint.objects.update_or_create(trip=trip, position=0, defaults={
                "name": f"Départ {organizer.region}", "description": "Point de rencontre principal", "latitude": lat, "longitude": lon,
            })

        self.stdout.write(self.style.SUCCESS("Données de démonstration créées."))
        if generated_credentials:
            self.stdout.write("Mots de passe temporaires, affichés une seule fois :\n" + "\n".join(generated_credentials))
