# Rihla — voyages, randonnées et aventures en Algérie

Rihla réunit les séjours premium et les activités de plein air dans une plateforme francophone de découverte et de réservation. Le projet comprend une API Django REST Framework, une interface React/TypeScript et un déploiement local avec Docker Compose. Les réservations sont confirmées par les organisateurs; aucun paiement en ligne n'est intégré.

## Fonctionnalités

- Deux univers visuels et éditoriaux : **Voyages & Évasions** (hôtels, resorts avec piscine et séjours en Algérie ou à l'international) et **Randonnées & Camping** (treks, bivouacs et activités de plein air), avec des filtres adaptés à chaque type d'activité.
- Profils publics d'agences, de clubs et d'associations, avec plusieurs membres et des permissions par organisation.
- Vérification des organisations par un administrateur, à partir de justificatifs privés et d'une décision motivée.
- Annonces, demandes de réservation, gestion de capacité et notifications.
- Itinéraires de bus avec départ, arrêts ordonnés et arrivée géolocalisés; les demandes conservent un instantané du point de montée choisi.
- Disponibilité restante déclarée manuellement par l'organisateur; une demande ou son acceptation ne modifie pas le compteur.
- Avis liés à une réservation terminée, notes par critères, signalements et modération administrateur.
- Interface d'administration Django et tableaux de bord adaptés aux rôles.

## Prérequis

- Python 3.11 ou ultérieur
- Node.js 20 ou ultérieur et npm
- PostgreSQL pour le déploiement et les tests de verrouillage concurrent; SQLite est disponible pour le développement local

## Démarrage local

À la racine du dépôt, dans PowerShell :

```powershell
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py createsuperuser
python manage.py runserver
```

Dans un second terminal :

```powershell
Set-Location frontend
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Ouvrez `http://localhost:5173`. L'API est disponible sous `http://localhost:8000/api/v1/` et l'administration Django sous `http://localhost:8000/admin/`. Vite transmet les requêtes `/api` et `/media` au backend.

La commande `seed_demo` crée des utilisateurs de démonstration avec des mots de passe aléatoires affichés une seule fois dans la sortie de la commande. Elle ne doit pas servir à créer des comptes de production. Les organisations de démonstration sont en attente de vérification; leur approbation nécessite un justificatif et une décision d'administration.

## Organisations et permissions

Les comptes utilisateur sont indépendants des organisations. Une personne peut gérer plusieurs organisations via `OrganizationMembership`. Les rôles `owner` et `admin` gèrent l'organisation et ses membres; `publisher` gère les annonces; `bookings` gère les réservations; `profile` modifie le profil et consulte les justificatifs. Les contrôles sont appliqués côté serveur.

Les documents de vérification sont conservés dans le stockage privé `private_media`; ils ne sont pas servis par l'URL publique des médias. En déploiement, montez un stockage privé persistant et limitez les accès aux utilisateurs autorisés et aux administrateurs. Le statut « Vérifié » désigne l'examen administratif de l'organisation; il ne constitue pas une note de qualité.

## Avis et modération

Un voyageur peut envoyer un seul avis pour sa propre réservation confirmée et terminée, une fois l'activité achevée. Il peut noter l'organisation et, facultativement, l'activité et quelques critères complémentaires. Les moyennes publiques sont calculées à partir des avis publiés. Les voyageurs peuvent signaler un avis; seuls les administrateurs peuvent en changer le statut de modération. Les organisateurs ne peuvent pas modifier ou supprimer les avis.

## API principale

Toutes les routes sont préfixées par `/api/v1/`. L'authentification utilise les jetons DRF : transmettre `Authorization: Token <jeton>` pour les routes privées.

- `POST /auth/register/`, `POST /auth/login/`, `POST /auth/logout/`, `GET/PATCH /auth/me/`
- `GET /trips/` et `GET /trips/{id}/` pour la recherche et les fiches d'activité; les filtres incluent l'univers, la destination, le prix, les dates et les critères propres au type d'activité
- `GET/POST /organizations/` pour les profils d'organisation (`/organizers/` reste disponible comme alias de compatibilité)
- `GET/POST /organizations/{id}/members/` pour les membres, selon les permissions
- `GET/POST /organization-documents/` pour les justificatifs privés autorisés
- `GET/POST /reviews/` pour consulter ou déposer un avis éligible; les administrateurs modèrent les avis
- `GET/POST /bookings/` et actions `confirm`, `decline`, `cancel` sur `/bookings/{id}/`
- `GET/POST /reports/` pour les signalements; `PATCH /reports/{id}/` pour la modération administrateur
- `GET /admin/stats/` pour les statistiques d'administration

Les catégories d'activité se gèrent dans l'administration Django. Les annonces restent soumises au cycle de modération existant avant publication.

## Tests et vérifications

```powershell
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test
Set-Location frontend
npm.cmd run build
```

Le test de confirmations simultanées nécessite PostgreSQL ou une base prenant en charge `SELECT FOR UPDATE`; il est ignoré sous SQLite, qui ne fournit pas ces verrous de ligne.

## Docker Compose

Copiez `.env.example` vers `.env`, définissez une valeur privée pour `DB_PASSWORD`, puis lancez :

```powershell
docker compose up --build
```

L'API est sur `http://localhost:8000` et l'interface de développement sur `http://localhost:5173`. Compose monte séparément les médias publics et les justificatifs privés. Pour charger les données de démonstration : `docker compose exec api python manage.py seed_demo`.

## Cartographie

La carte s'appuie sur OpenStreetMap. Les organisateurs enregistrent les coordonnées réelles du départ, des arrêts et de l'arrivée, ainsi que l'ordre et les horaires prévisionnels. La ligne affichée n'existe que lorsqu'un GeoJSON a été fourni; aucun itinéraire routier ni temps de trajet n'est calculé ou inventé. La liste textuelle des étapes reste disponible sous la carte. Les demandes conservent une copie du lieu, de l'horaire et des consignes sélectionnés afin qu'une modification ultérieure de l'itinéraire ne change pas l'historique. La disponibilité restante est déclarée manuellement; les demandes et confirmations ne la décrémentent pas. L'export CSV des participants est disponible dans l'espace organisateur pour les membres disposant du droit de gestion des réservations.

La recherche de lieu est déclenchée depuis le formulaire et mise en cache dans la session du navigateur; il n'y a pas d'autocomplétion. Le service public Nominatim est réservé à un usage modéré et limite l'application à une requête par seconde au total. Une audience plus importante doit utiliser un fournisseur compatible ou un service dédié. Les URL du géocodeur et des tuiles sont configurables dans `frontend/.env`.

## Déploiement

Pour la production, configurez PostgreSQL, `DEBUG=False`, une clé `SECRET_KEY` forte et confidentielle, `ALLOWED_HOSTS` et HTTPS. Appliquez les migrations, collectez les fichiers statiques et servez Django via Gunicorn derrière un proxy TLS. Configurez un stockage persistant privé pour les justificatifs, distinct des médias publics; ne rendez jamais ce stockage accessible anonymement. Les médias publics peuvent être servis par un stockage objet ou un serveur statique. Prévoyez des sauvegardes, une politique de rétention et une gestion sécurisée des secrets. Le Docker Compose fourni sert au développement.
