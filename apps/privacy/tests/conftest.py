"""Fixtures de las pruebas de consentimiento (S3-2a). Los ayudantes viven en ``support``."""
import pytest

from .support import crear_persona, crear_version, version_publicada as _version_publicada


@pytest.fixture
def estudiante_a(db):
    return crear_persona("ESTUDIANTE", "ana")


@pytest.fixture
def estudiante_b(db):
    return crear_persona("ESTUDIANTE", "beto")


@pytest.fixture
def docente(db):
    return crear_persona("PROFESOR", "docente")


@pytest.fixture
def administrador(db):
    return crear_persona("ADMIN", "admin")


@pytest.fixture
def version_publicada(db):
    return _version_publicada()


@pytest.fixture
def version_borrador(docente):
    return crear_version(docente, estado="DRAFT")
