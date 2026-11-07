from django.urls import include, path

urlpatterns = [
    path("api/biblioteca/", include("apps.biblioteca.urls")),
    path("api/", include("apps.simulation.urls")),
]
