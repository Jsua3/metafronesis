from django.urls import path
from .views import ClonarView, LifecycleView, PublicarView, ValidarView

urlpatterns = [
    path('cases/<int:case_version_id>/validate', ValidarView.as_view()),
    path('cases/<int:case_version_id>/lifecycle', LifecycleView.as_view()),
    path('cases/<int:case_version_id>/publish', PublicarView.as_view()),
    path('cases/<int:case_version_id>/clone-version', ClonarView.as_view()),
]
