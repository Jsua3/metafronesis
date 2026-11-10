import pytest
from types import SimpleNamespace

from shared import eventos


@pytest.mark.parametrize(
    "senal",
    [eventos.convocatoria_emitida, eventos.convocados_cambiaron, eventos.intento_calificado,
     eventos.retroalimentacion_registrada],
)
def test_las_senales_llegan_a_un_receptor(senal, monkeypatch):
    recibidos = []
    monkeypatch.setattr("apps.notificaciones.receptores.crear", lambda *args: None)
    estudiante = SimpleNamespace(pk=1)
    docente = SimpleNamespace()
    caso = SimpleNamespace(title="Caso", created_by=docente)
    version = SimpleNamespace(simulation_case=caso)
    sesion = SimpleNamespace(case_version=version, mensaje="Mensaje", creada_por=docente)
    intento = SimpleNamespace(student=estudiante, case_version=version)
    argumentos = {
        eventos.convocatoria_emitida: {"sesion": sesion, "convocatorias": [SimpleNamespace(estudiante=estudiante)], "codigos": {1: "CODIGO"}},
        eventos.convocados_cambiaron: {"sesion": sesion, "agregados": [], "retirados": [estudiante], "codigos": {}},
        eventos.intento_calificado: {"intento": intento, "evaluacion": object()},
        eventos.retroalimentacion_registrada: {"intento": intento, "docente": docente},
    }[senal]

    def receptor(sender, **kwargs):
        recibidos.append(kwargs)

    senal.connect(receptor, weak=False)
    try:
        senal.send(sender=object, **argumentos)
    finally:
        senal.disconnect(receptor)
    assert recibidos == [{"signal": senal, **argumentos}]
