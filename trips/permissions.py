from rest_framework.permissions import BasePermission, SAFE_METHODS
from organizers.permissions import can_manage


class TripAccess(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS and obj.status in (obj.Status.PUBLISHED, obj.Status.FULL) and obj.organizer.verification == obj.organizer.Verification.VERIFIED:
            return True
        if request.method in SAFE_METHODS and request.user.is_authenticated and obj.bookings.filter(traveler_id=request.user.id).exists():
            return True
        return request.user.is_authenticated and (request.user.is_staff or can_manage(request.user, obj.organizer, "publish"))
