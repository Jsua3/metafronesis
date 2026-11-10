import json
from django.db import IntegrityError, transaction
from apps.simulation.models import SimulationCase, CaseVersion, SimulationNode
from shared.exceptions import ApiError


class ConstructorDeBorrador:
    def __init__(self, autor):
        self.autor = autor
        self.ficha = {}
        self.contexto = ""
        self.objetivos = []
        self.minutos = None
        self.escena = ("Inicio", "", "")

    def con_ficha(self, code, title, description=""):
        self.ficha = {"code": code, "title": title, "description": description}
        return self

    def con_contexto(self, narrative_context):
        self.contexto = narrative_context
        return self

    def con_objetivos(self, objetivos: list[str]):
        self.objetivos = objetivos
        return self

    def con_tiempo_estimado(self, minutos: int):
        self.minutos = minutos
        return self

    def con_escena_inicial(self, titulo, narrativa, pregunta=""):
        self.escena = (titulo, narrativa, pregunta)
        return self

    def construir(self) -> CaseVersion:
        if not self.ficha.get("code", "").strip() or not self.ficha.get("title", "").strip():
            raise ApiError("VALIDATION_ERROR", "El código y el título son obligatorios.", 400)
        if self.minutos is not None and (not isinstance(self.minutos, int) or isinstance(self.minutos, bool) or self.minutos <= 0):
            raise ApiError("VALIDATION_ERROR", "El tiempo estimado debe ser mayor que cero.", 400)
        try:
            with transaction.atomic():
                caso = SimulationCase.objects.create(created_by=self.autor, **self.ficha)
                version = CaseVersion.objects.create(simulation_case=caso, created_by=self.autor,
                    semantic_version="1.0.0", narrative_context=self.contexto,
                    learning_objectives=json.dumps(self.objetivos, ensure_ascii=False), estimated_minutes=self.minutos)
                titulo, narrativa, pregunta = self.escena
                SimulationNode.objects.create(case_version=version, node_key="inicio", title=titulo,
                    narrative=narrativa, decision_prompt=pregunta, start_node=True)
                return version
        except IntegrityError:
            if SimulationCase.objects.filter(code=self.ficha["code"]).exists():
                raise ApiError("CASE_CODE_TAKEN", "El código ya está en uso.", 409) from None
            raise
