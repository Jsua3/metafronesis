import csv
import io
import json
from abc import ABC, abstractmethod
from dataclasses import asdict, fields

from shared.exceptions import ApiError

from .filas import FilaDeReporte


class Exportador(ABC):
    tipo: str
    extension: str

    @abstractmethod
    def contenido(self, filas) -> bytes:
        pass


class ExportadorCsv(Exportador):
    tipo = 'text/csv; charset=utf-8'
    extension = 'csv'

    def contenido(self, filas) -> bytes:
        salida = io.StringIO(newline='')
        escritor = csv.DictWriter(salida, fieldnames=[campo.name for campo in fields(FilaDeReporte)])
        escritor.writeheader()
        escritor.writerows(asdict(fila) for fila in filas)
        return salida.getvalue().encode('utf-8-sig')


class ExportadorJson(Exportador):
    tipo = 'application/json; charset=utf-8'
    extension = 'json'

    def contenido(self, filas) -> bytes:
        return json.dumps([asdict(fila) for fila in filas], ensure_ascii=False).encode('utf-8')


def exportador_para(formato: str) -> Exportador:
    exportadores = {'csv': ExportadorCsv, 'json': ExportadorJson}
    if formato not in exportadores:
        raise ApiError('FORMAT_UNSUPPORTED', 'Formato de reporte no admitido.', 400)
    return exportadores[formato]()
