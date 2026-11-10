"""Cada app declara la auditoría de sus rutas en su propio ``superficie.py`` (Open/Closed: una app nueva no edita ``shared``)."""

import sys
import types

import pytest
from django.core.exceptions import ImproperlyConfigured

from shared import surface


def _app_falsa(monkeypatch, declaraciones):
    modulo = types.ModuleType("apps.users.superficie")
    modulo.AUDITORIA_POR_RUTA = declaraciones
    monkeypatch.setitem(sys.modules, "apps.users.superficie", modulo)


def test_una_app_declara_su_auditoria(monkeypatch):
    _app_falsa(monkeypatch, {("api/x", "POST"): "X_CREATED"})
    assert surface.auditoria_por_ruta()[("api/x", "POST")] == "X_CREATED"


def test_las_declaraciones_centrales_se_conservan(monkeypatch):
    _app_falsa(monkeypatch, {("api/x", "POST"): "X_CREATED"})
    assert surface.auditoria_por_ruta()[("api/auth/login", "POST")] == surface.AUDIT_BY_ROUTE[("api/auth/login", "POST")]


def test_clave_repetida_rompe(monkeypatch):
    _app_falsa(monkeypatch, {("api/auth/login", "POST"): "OTRA"})
    with pytest.raises(ImproperlyConfigured):
        surface.auditoria_por_ruta()
