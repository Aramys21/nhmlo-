from django.contrib import admin

from .models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("organization", "trip", "reviewer", "organization_rating", "status", "created_at")
    list_filter = ("status", "organization_rating", "created_at")
    search_fields = ("organization__name", "trip__title", "reviewer__username", "comment")
    readonly_fields = ("booking", "reviewer", "organization", "trip", "created_at", "updated_at")
