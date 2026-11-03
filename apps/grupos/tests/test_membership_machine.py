"""E2-10 · La máquina de estados de la membresía (§3.3 del plan), sin base de datos.

``INVITED → ACTIVE | DECLINED`` por el estudiante (o ``ACTIVE`` por el ADMIN),
``ACTIVE → REMOVED`` por el profesor o el estudiante, y un ``DECLINED`` o ``REMOVED`` se puede
volver a invitar. La tabla está escrita a mano y se contrasta con ``can_transition``.
"""
import itertools

import pytest

from apps.grupos import memberships

pytestmark = [pytest.mark.req("D-14"), pytest.mark.req("RF-04")]

STATUSES = (None, "INVITED", "ACTIVE", "DECLINED", "REMOVED")  # None = aún no hay fila
ACTIONS = ("invite", "accept", "decline", "remove")
ROLES = ("ESTUDIANTE", "PROFESOR", "ADMIN")

#: (estado, acción) → roles que pueden hacerla.
TABLE = {
    (None, "invite"): {"PROFESOR", "ADMIN"},
    ("DECLINED", "invite"): {"PROFESOR", "ADMIN"},
    ("REMOVED", "invite"): {"PROFESOR", "ADMIN"},
    ("INVITED", "accept"): {"ESTUDIANTE", "ADMIN"},
    ("INVITED", "decline"): {"ESTUDIANTE"},
    ("INVITED", "remove"): {"PROFESOR"},
    ("ACTIVE", "remove"): {"PROFESOR", "ESTUDIANTE"},
}


@pytest.mark.parametrize("status,action,role", list(itertools.product(STATUSES, ACTIONS, ROLES)))
def test_can_transition_matches_the_table(status, action, role):
    expected = role in TABLE.get((status, action), set())

    assert memberships.can_transition(status, action, role=role) is expected


@pytest.mark.parametrize(
    "status,action,target",
    [
        (None, "invite", "INVITED"),
        ("DECLINED", "invite", "INVITED"),
        ("REMOVED", "invite", "INVITED"),
        ("INVITED", "accept", "ACTIVE"),
        ("INVITED", "decline", "DECLINED"),
        ("INVITED", "remove", "REMOVED"),
        ("ACTIVE", "remove", "REMOVED"),
    ],
)
def test_the_target_state_of_each_transition(status, action, target):
    assert memberships.target_of(status, action) == target


def test_an_active_member_is_never_reinvited_and_a_removed_one_is_not_resurrected_by_accept():
    assert memberships.can_transition("ACTIVE", "invite", role="PROFESOR") is False
    assert memberships.can_transition("REMOVED", "accept", role="ESTUDIANTE") is False
    assert memberships.can_transition("DECLINED", "accept", role="ESTUDIANTE") is False


def test_unknown_status_or_action_allows_nothing():
    assert memberships.can_transition("ZOMBIE", "accept", role="ADMIN") is False
    assert memberships.can_transition("INVITED", "teleport", role="ADMIN") is False
