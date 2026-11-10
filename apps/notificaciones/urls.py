from django.urls import path
from . import views

urlpatterns = [
    path("me/notifications", views.NotificacionesView.as_view()),
    path("me/notifications/<int:pk>/read", views.LeerView.as_view()),
    path("notifications/<int:pk>/resend", views.ReenviarView.as_view()),
]
