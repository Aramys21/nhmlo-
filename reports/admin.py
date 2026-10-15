from django.contrib import admin
from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("id", "reason", "trip", "organizer", "reporter", "status", "created_at")
    list_filter = ("status", "reason", "created_at")
    search_fields = ("trip__title", "organizer__name", "reporter__username", "description")
    readonly_fields = ("reporter", "trip", "organizer", "reason", "description", "created_at", "updated_at")
