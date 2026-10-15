from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import OrganizationMembership


ALL_ROLES = {OrganizationMembership.Role.OWNER, OrganizationMembership.Role.ADMIN}
CAPABILITY_ROLES = {
    "publish": ALL_ROLES | {OrganizationMembership.Role.PUBLISHER},
    "bookings": ALL_ROLES | {OrganizationMembership.Role.BOOKINGS},
    "profile": ALL_ROLES | {OrganizationMembership.Role.PROFILE},
    "members": ALL_ROLES,
}


def membership_for(user, organization):
    if not getattr(user, "is_authenticated", False):
        return None
    return OrganizationMembership.objects.filter(organization=organization, user=user).first()


def can_manage(user, organization, capability):
    if getattr(user, "is_staff", False):
        return True
    membership = membership_for(user, organization)
    return bool(membership and membership.role in CAPABILITY_ROLES[capability])


class OrganizationAccess(BasePermission):
    def has_object_permission(self, request, view, obj):
        if view.action == "members":
            return can_manage(request.user, obj, "members")
        if view.action == "documents":
            return can_manage(request.user, obj, "profile")
        if request.method in SAFE_METHODS:
            return obj.verification == obj.Verification.VERIFIED or can_manage(request.user, obj, "profile") or request.user.is_staff
        if view.action in {"partial_update", "update", "profile"}:
            return can_manage(request.user, obj, "profile")
        return request.user.is_staff
