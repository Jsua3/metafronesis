import pytest

from shared import eventos


@pytest.mark.parametrize(
    "senal",
    [eventos.convocatoria_emitida, eventos.convocados_cambiaron, eventos.intento_calificado,
     eventos.retroalimentacion_registrada],
)
def test_las_senales_llegan_a_un_receptor(senal):
    recibidos = []

    def receptor(sender, **kwargs):
        recibidos.append(kwargs)

    senal.connect(receptor, weak=False)
    try:
        senal.send(sender=object, dato=1)
    finally:
        senal.disconnect(receptor)
    assert recibidos == [{"signal": senal, "dato": 1}]
