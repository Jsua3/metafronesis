from django.urls import path

from .views import LugarDetailView, LugarListView

# Montado en "api/biblioteca/": /api/biblioteca/lugares y /api/biblioteca/lugares/<id>.
urlpatterns = [
    path("lugares", LugarListView.as_view()),
    path("lugares/<str:lugar_id>", LugarDetailView.as_view()),
]
