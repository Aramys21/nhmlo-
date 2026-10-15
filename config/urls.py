from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts.views import LoginView, LogoutView, MeView, RegisterView
from bookings.views import BookingViewSet
from notifications.views import NotificationViewSet
from organizers.views import OrganizationDocumentViewSet, OrganizationViewSet
from reports.views import AdminStatsView, ReportViewSet
from reviews.views import ReviewViewSet
from trips.views import CategoryViewSet, TripPhotoViewSet, TripViewSet

router = DefaultRouter()
router.register("trips", TripViewSet, basename="trip")
router.register("categories", CategoryViewSet, basename="category")
router.register("trip-photos", TripPhotoViewSet, basename="trip-photo")
router.register("organizations", OrganizationViewSet, basename="organization")
router.register("organizers", OrganizationViewSet, basename="legacy-organizer")
router.register("organization-documents", OrganizationDocumentViewSet, basename="organization-document")
router.register("bookings", BookingViewSet, basename="booking")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("reports", ReportViewSet, basename="report")
router.register("reviews", ReviewViewSet, basename="review")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/register/", RegisterView.as_view(), name="register"),
    path("api/v1/auth/login/", LoginView.as_view(), name="login"),
    path("api/v1/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/v1/auth/me/", MeView.as_view(), name="me"),
    path("api/v1/admin/stats/", AdminStatsView.as_view(), name="admin-stats"),
    path("api/v1/", include(router.urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
