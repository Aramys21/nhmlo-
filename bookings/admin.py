from django.contrib import admin
from .models import Booking


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("id", "trip", "traveler", "quantity", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("trip__title", "traveler__username", "traveler__email")
    readonly_fields = ("created_at", "updated_at")
