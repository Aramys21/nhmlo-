from django.contrib import admin
from .models import Category, PickupPoint, Trip, TripPhoto


class PickupPointInline(admin.TabularInline):
    model = PickupPoint
    extra = 0


class TripPhotoInline(admin.TabularInline):
    model = TripPhoto
    extra = 0


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ("title", "destination", "organizer", "start_at", "status", "featured")
    list_filter = ("status", "featured", "category", "start_at")
    search_fields = ("title", "destination", "organizer__name")
    list_editable = ("status", "featured")
    inlines = (PickupPointInline, TripPhotoInline)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
