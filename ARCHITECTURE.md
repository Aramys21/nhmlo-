# Architecture de Rihla

## Vue d'ensemble

Rihla est un monolithe Django avec une API REST versionnée et un frontend React/TypeScript indépendant. PostgreSQL est la cible de déploiement; SQLite simplifie le développement local. L'API utilise des jetons DRF. La plateforme distingue deux univers communs visuellement — les voyages et évasions, puis les randonnées et le camping — tout en adaptant les champs et filtres aux activités.

```text
Navigateur React / TypeScript
          │ API JSON + jeton DRF
          ▼
Django REST Framework ─ Django Admin
  ├── accounts       comptes utilisateurs et permissions
  ├── organizers     organisations, membres et vérification
  ├── trips          activités, catégories, lieux et photos
  ├── bookings       réservations et capacité
  ├── reviews        avis, notes et modération
  ├── reports        signalements
  └── notifications  messages internes
          │
      PostgreSQL / SQLite
```

## Modèle de données

- `User` représente une personne et reste distinct d'une organisation. Une personne peut être membre de plusieurs organisations.
- `Organization` représente une agence, un club de randonnée ou une association; elle porte le profil public, la zone d'activité et le statut de vérification.
- `OrganizationMembership` relie un utilisateur à une organisation avec un rôle explicite et une contrainte d'unicité par paire organisation/utilisateur.
- `OrganizationDocument` stocke les pièces justificatives dans un stockage privé.
- `Trip` est une activité liée à une organisation, avec dates, destination, capacité, informations pratiques et univers `voyages` ou `nature`. Les champs d'hébergement et de pension sont destinés aux séjours qui les utilisent.
- `TripPhoto` et `PickupPoint` portent respectivement les images et les points de rendez-vous d'une activité.
- `Booking` relie un participant à une activité et conserve le statut, la quantité et les informations de réservation nécessaires à l'éligibilité d'un avis.
- `Review` relie de façon unique une réservation à son auteur, à l'organisation et à l'activité. Les notes complémentaires sont facultatives. Les seuls avis comptant dans les moyennes sont ceux publiés.
- `Report` peut viser une activité, une organisation ou un avis. Les contraintes empêchent plusieurs cibles sur le même signalement.
- `Notification` adresse un message interne à un utilisateur.

## Rôles d'organisation

- `owner` : contrôle complet de l'organisation et de ses membres.
- `admin` : administration du profil, de l'équipe, des annonces et des réservations.
- `publisher` : création et gestion des annonces.
- `bookings` : consultation et gestion des réservations.
- `profile` : modification du profil et consultation des justificatifs.

Les permissions sont vérifiées dans l'API et les opérations d'administration. L'interface masque les fonctions selon le rôle, mais elle n'est pas la frontière de sécurité. Les membres ne peuvent pas déposer d'avis pour leur propre organisation ni réserver ses activités.

## Vérification des organisations

Un nouveau profil commence en attente. Le responsable téléverse les justificatifs qui s'appliquent; ceux-ci restent privés. Un administrateur examine les pièces et ajoute une décision motivée avant d'approuver l'organisation. Une organisation ne peut pas passer de l'état en attente à l'état vérifié sans justificatif et note de décision. Le statut de vérification est indépendant des avis et de la note moyenne.

## Éligibilité et modération des avis

L'API n'accepte un avis que de la personne associée à une réservation confirmée, une fois la réservation et l'activité terminées. La contrainte d'unicité de la réservation empêche les doublons, y compris lors de requêtes simultanées. Un membre de l'organisation concernée ne peut pas noter cette organisation. Un avis comprend une note d'organisation sur cinq, un commentaire facultatif et des critères facultatifs pour l'activité, la communication, le respect du programme et le rapport qualité-prix.

Les voyageurs peuvent signaler un avis. Seuls les administrateurs changent son statut de modération; l'organisateur ne peut ni modifier ni supprimer un avis. Les pages publiques n'affichent que les avis publiés et les moyennes sont dérivées de ces avis valides.

## Réservations et capacité

Les demandes `pending` ne retiennent pas de places. Seules les réservations `confirmed` consomment la capacité. Une confirmation verrouille l'activité sous transaction, recalcule les places confirmées puis change le statut. Les confirmations concurrentes ne peuvent pas dépasser la capacité sur PostgreSQL. La capacité ne peut pas être abaissée sous le nombre de places déjà confirmées. SQLite ne garantit pas les mêmes verrous de ligne.

## API principale

Les routes sont préfixées par `/api/v1/`.

- `/auth/` : inscription, connexion, déconnexion et compte courant.
- `/organizations/` : profils et membres; `/organizers/` reste un alias compatible.
- `/organization-documents/` : justificatifs accessibles aux rôles autorisés.
- `/trips/`, `/bookings/`, `/reviews/` et `/reports/` : activités, réservations, avis et signalements.
- `/admin/stats/` : statistiques réservées aux administrateurs.

## Stockage des fichiers

Les photos de profil et d'activité sont des médias publics. Les justificatifs organisationnels utilisent un backend de stockage distinct sous `private_media`, et leur téléchargement passe par un endpoint qui contrôle les permissions. En production, le volume privé doit rester hors du serveur statique public et être sauvegardé avec des contrôles d'accès adaptés.
