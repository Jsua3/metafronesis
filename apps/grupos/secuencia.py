"""Clave común de la secuencia usada por docentes y estudiantes."""


def clave_secuencia(entries):
    primera = entries[0]
    return (min(a.sort_order for a in entries), primera.case_version.simulation_case_id, primera.case_version_id)
