from django.contrib import admin
from django.http import FileResponse
from django.urls import path, reverse
from django.utils.html import format_html

from .models import Organization, OrganizationDocument, OrganizationMembership


class MembershipInline(admin.TabularInline):
    model = OrganizationMembership
    extra = 0


class OrganizationDocumentInline(admin.TabularInline):
    model = OrganizationDocument
    extra = 0
    fields = ("kind", "download_link", "uploaded_by", "created_at")
    readonly_fields = fields

    @admin.display(description="Justificatif confidentiel")
    def download_link(self, obj):
        if not obj.pk:
            return ""
        url = reverse("admin:organizers_organizationdocument_download", args=(obj.pk,))
        return format_html('<a href="{}">Télécharger le justificatif</a>', url)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "region", "verification", "created_at")
    list_filter = ("verification", "kind", "region")
    search_fields = ("name", "owner__username", "public_email")
    inlines = (MembershipInline, OrganizationDocumentInline)
    fields = ("owner", "kind", "name", "about", "region", "logo", "cover", "public_email", "public_phone", "website", "instagram", "facebook", "tiktok", "verification", "verification_note", "created_at")
    readonly_fields = ("owner", "created_at")


@admin.register(OrganizationDocument)
class OrganizationDocumentAdmin(admin.ModelAdmin):
    list_display = ("organization", "kind", "uploaded_by", "created_at")
    list_filter = ("kind", "created_at")
    search_fields = ("organization__name", "uploaded_by__username")
    fields = ("organization", "kind", "download_link", "uploaded_by", "created_at")
    readonly_fields = fields

    def get_urls(self):
        return [path("<int:document_id>/download/", self.admin_site.admin_view(self.download_document), name="organizers_organizationdocument_download")] + super().get_urls()

    def download_document(self, request, document_id):
        document = self.get_object(request, document_id)
        if document is None:
            from django.http import Http404
            raise Http404
        return FileResponse(document.file.open("rb"), as_attachment=True, filename=document.file.name.rsplit("/", 1)[-1])

    @admin.display(description="Justificatif confidentiel")
    def download_link(self, obj):
        if not obj.pk:
            return ""
        url = reverse("admin:organizers_organizationdocument_download", args=(obj.pk,))
        return format_html('<a href="{}">Télécharger le justificatif</a>', url)
