from django.urls import path
from . import views_s3 as views

urlpatterns = [
    path("catalog", views.Catalog.as_view()),
    path("attempts/<uuid:pk>/evaluation", views.Evaluation.as_view()),
    path("cases", views.Cases.as_view()),
    path("cases/<int:pk>", views.CaseDetail.as_view()),
    path("attempts", views.Attempts.as_view()),
    path("attempts/<uuid:pk>", views.AttemptDetail.as_view()),
    path(
        "attempts/<uuid:pk>/pause",
        views.AttemptTransition.as_view(),
        {"action": "pause"},
    ),
    path(
        "attempts/<uuid:pk>/resume",
        views.AttemptTransition.as_view(),
        {"action": "resume"},
    ),
    path(
        "attempts/<uuid:pk>/replace",
        views.AttemptTransition.as_view(),
        {"action": "replace"},
    ),
    path("attempts/<uuid:pk>/decisions", views.Decision.as_view()),
]
