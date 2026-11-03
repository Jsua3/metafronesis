import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
def test_create_user_with_role():
    user = User.objects.create_user(
        email="test_rf@example.com",
        password="Test123!",
        nombre="Ana",
        apellido="Lopez",
        role="ESTUDIANTE",
    )
    assert user.email == "test_rf@example.com"
    assert user.role == "ESTUDIANTE"
    assert user.activo is True
    assert user.is_active is True
    assert user.check_password("Test123!")
    assert not user.check_password("wrong")
    # Stored as a real BCrypt hash (Spring-compatible)
    assert user.password.startswith("$2")


@pytest.mark.django_db
def test_check_password_against_seeded_admin():
    """Read-only verification: the Flyway-seeded admin uses BCrypt and the
    documented demo credentials must validate (proves §10.4 compatibility)."""
    admin = User.objects.get(email="admin@psychosim.edu.co")
    assert admin.role == "ADMIN"
    assert admin.check_password("Admin123!")
    assert not admin.check_password("nope")
