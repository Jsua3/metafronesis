"""Permisos de DRF: la puerta de rol de cada vista sale de la matriz de políticas.

``policy_permission(recurso, acción)`` genera la clase a partir de ``shared.policies.MATRIX``:
una vista nunca decide por su cuenta quién entra. Las decisiones sobre un objeto concreto
(el dueño, el alcance) las toma el servicio con ``shared.policies.can``.

La regla de arquitectura ``permisos-por-politica`` prohíbe declarar en una vista una clase
de rol suelta: toda puerta sale de aquí.
"""
from rest_framework.permissions import BasePermission

from . import policies


class _PolicyPermission(BasePermission):
    policy: tuple[str, str] = ("", "")
    roles: frozenset = frozenset()

    def has_permission(self, request, view):
        return policies.has_role(request.user, *self.roles)


def policy_permission(resource: str, action: str):
    """Clase de permiso que admite a los roles con algún alcance sobre ``(resource, action)``."""
    return type(
        f"Policy[{resource}.{action}]",
        (_PolicyPermission,),
        {"policy": (resource, action), "roles": policies.allowed_roles(resource, action)},
    )




def policy_permission_any(*policy_pairs: tuple[str, str]):
    """Como ``policy_permission``, pero admite a los roles de CUALQUIERA de las políticas (p. ej. jugar o ensayar).

    ``policy`` es la primera pareja; ``policies`` las trae todas. El alcance (dueño, miembro) lo sigue decidiendo el servicio.
    """
    roles = frozenset().union(*(policies.allowed_roles(resource, action) for resource, action in policy_pairs))
    return type(
        "Policy[" + "|".join(f"{resource}.{action}" for resource, action in policy_pairs) + "]",
        (_PolicyPermission,),
        {"policy": policy_pairs[0], "policies": tuple(policy_pairs), "roles": roles},
    )
