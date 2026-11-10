from django.urls import path

from .views import (
    AccessRequestCreateView,
    ChangePasswordView,
    CodeLoginView,
    GoogleConfigView,
    GoogleLoginView,
    LoginView,
    MeView,
)

urlpatterns = [
    path("login", LoginView.as_view()),
    path("code-login", CodeLoginView.as_view()),
    path("google", GoogleLoginView.as_view()),
    path("google/config", GoogleConfigView.as_view()),
    path("access-request", AccessRequestCreateView.as_view()),
    path("me", MeView.as_view()),
    path("change-password", ChangePasswordView.as_view()),
]
