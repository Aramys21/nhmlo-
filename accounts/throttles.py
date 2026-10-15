from rest_framework.throttling import AnonRateThrottle


class RegistrationRateThrottle(AnonRateThrottle):
    scope = "registration"


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"
