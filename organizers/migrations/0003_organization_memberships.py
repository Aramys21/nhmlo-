import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def create_owner_memberships(apps, schema_editor):
    Organization = apps.get_model("organizers", "Organization")
    OrganizationMembership = apps.get_model("organizers", "OrganizationMembership")
    for organization in Organization.objects.all().iterator():
        OrganizationMembership.objects.get_or_create(
            organization_id=organization.pk,
            user_id=organization.owner_id,
            defaults={"role": "owner"},
        )


def remove_migrated_owner_memberships(apps, schema_editor):
    apps.get_model("organizers", "OrganizationMembership").filter(role="owner").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("organizers", "0002_alter_organizer_options"),
        ("trips", "0001_initial"),
        ("reports", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameModel(old_name="Organizer", new_name="Organization"),
        migrations.AlterField(
            model_name="organization",
            name="owner",
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="created_organizations", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name="organization",
            name="kind",
            field=models.CharField(choices=[("agency", "Agence de voyages"), ("club", "Club de randonnée"), ("association", "Association")], max_length=16),
        ),
        migrations.AlterField(
            model_name="organization",
            name="logo",
            field=models.ImageField(blank=True, upload_to="organizations/logos/"),
        ),
        migrations.AlterField(
            model_name="organization",
            name="verification",
            field=models.CharField(choices=[("pending", "En attente"), ("verified", "Vérifiée"), ("rejected", "Refusée")], db_index=True, default="pending", max_length=12),
        ),
        migrations.AddField(model_name="organization", name="cover", field=models.ImageField(blank=True, upload_to="organizations/covers/")),
        migrations.AddField(model_name="organization", name="instagram", field=models.URLField(blank=True)),
        migrations.AddField(model_name="organization", name="facebook", field=models.URLField(blank=True)),
        migrations.AddField(model_name="organization", name="tiktok", field=models.URLField(blank=True)),
        migrations.AddField(model_name="organization", name="verification_note", field=models.TextField(blank=True, max_length=1200)),
        migrations.CreateModel(
            name="OrganizationMembership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("owner", "Propriétaire"), ("admin", "Administrateur"), ("publisher", "Publication des activités"), ("bookings", "Gestion des réservations"), ("profile", "Modification du profil")], default="publisher", max_length=16)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="organizers.organization")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="organization_memberships", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("organization__name", "user__username")},
        ),
        migrations.AddConstraint(model_name="organizationmembership", constraint=models.UniqueConstraint(fields=("organization", "user"), name="unique_organization_member")),
        migrations.CreateModel(
            name="OrganizationDocument",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("business", "Registre ou agrément"), ("identity", "Justificatif d'identité"), ("other", "Autre justificatif")], default="business", max_length=16)),
                ("file", models.FileField(upload_to="organizations/verification/")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="documents", to="organizers.organization")),
                ("uploaded_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="organization_documents", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.RunPython(create_owner_memberships, remove_migrated_owner_memberships),
    ]
