"""Siembra de demostración (SIEP-234): deja un entorno listo para mostrar el simulador.

Crea, solo lo que falta, docentes, estudiantes, grupos con membresía activa y una rúbrica. Publica y asigna a los
grupos la versión vigente del caso insignia SIM-VBG-002 y retira las anteriores. Todo en una transacción.

Las cuentas nuevas reciben una contraseña TEMPORAL común que llega de fuera (variable de entorno, nunca del código) y
quedan con cambio obligatorio al primer ingreso. Las cuentas que ya existían no se tocan. El módulo no imprime la clave.
"""
import json
from dataclasses import dataclass, field, replace
from decimal import Decimal
from pathlib import Path
from types import MappingProxyType

from django.conf import settings
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone

from apps.grupos import assignment_service
from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante, MembershipStatus
from apps.publicacion import ciclo
from apps.publicacion.arbol import arbol_de
from apps.simulation.casedef.escritor_insignia import ErrorDeCarga, cargar
from apps.simulation.casedef.insignia import traducir
from apps.simulation.models import CaseVersion, CaseVersionStatus, Competency, Rubric, RubricCriterion, SimulationCase
from apps.simulation.services import rubricas
from apps.simulation.services.portadas import crear_portada
from apps.users.models import CustomUser, PermisoDeAutoria, UserRole
from shared.exceptions import ApiError

DOMINIO = "demo.metafronesis.test"
MINUTOS_ESTIMADOS = 40  # el caso lineal se juega en unos 40 minutos
RUTA_DOCUMENTO = Path(__file__).resolve().parents[1] / "simulation/data/casos/SIM-VBG-002.dsl.json"
RUTA_PORTADA = RUTA_DOCUMENTO.with_name("SIM-VBG-002.portada.png")

DOCENTES = (
    ("laura.mendoza", "Laura", "Mendoza"),
    ("camilo.ortega", "Camilo", "Ortega"),
    ("natalia.rincon", "Natalia", "Rincón"),
)
ESTUDIANTES = (
    ("valentina.rios", "Valentina", "Ríos"), ("mateo.salazar", "Mateo", "Salazar"),
    ("isabela.cardona", "Isabela", "Cardona"), ("santiago.mejia", "Santiago", "Mejía"),
    ("sofia.herrera", "Sofía", "Herrera"), ("andres.quintero", "Andrés", "Quintero"),
    ("daniela.pardo", "Daniela", "Pardo"), ("julian.arango", "Julián", "Arango"),
    ("mariana.londono", "Mariana", "Londoño"), ("sebastian.vega", "Sebastián", "Vega"),
    ("camila.restrepo", "Camila", "Restrepo"), ("tomas.giraldo", "Tomás", "Giraldo"),
)
# (código, nombre, índice del docente, índices de estudiantes)
GRUPOS = (
    ("DEMO-PSI-SOC-A", "Psicología Social · Grupo A", 0, (0, 1, 2, 3, 4)),
    ("DEMO-PSI-SOC-B", "Psicología Social · Grupo B", 1, (5, 6, 7, 8, 9)),
    ("DEMO-PRACTICA-AP", "Práctica en Atención Psicosocial", 2, (2, 3, 8, 9, 10, 11)),
)

NOMBRE_RUBRICA = "Rúbrica de primeros auxilios psicológicos · Violencia basada en género"
# Cada criterio apunta a una de las cuatro competencias que el caso insignia ya registra en sus decisiones,
# para que la evidencia del intento llegue a la rúbrica.
COMPETENCIAS = {
    "CONTENCION": ("Contención emocional", "Estabiliza a la persona y a su red de apoyo en la crisis."),
    "MARCO_NORMATIVO": ("Marco normativo y rutas de atención", "Aplica referentes legales y activa las rutas institucionales."),
    "INTERVENCION_ETICA": ("Intervención técnica y ética", "Decide sin revictimizar y minimizando el riesgo."),
    "REFLEXION": ("Reflexión profesional", "Registra aprendizajes y justifica su criterio de intervención."),
}
CRITERIOS = (
    ("CONTENCION", "Primeros auxilios psicológicos",
     "Brinda contención emocional y atiende las necesidades inmediatas de la persona.",
     {"EN_INICIO": "Prioriza el trámite sobre el estado emocional de la persona.",
      "EN_PROCESO": "Ofrece apoyo emocional, pero sin atender todas las necesidades inmediatas.",
      "LOGRADO": "Estabiliza a la persona y atiende sus necesidades inmediatas de seguridad y calma.",
      "DESTACADO": "Estabiliza, ajusta su apoyo al ritmo de la persona y activa su red de apoyo."}),
    ("INTERVENCION_ETICA", "Valoración del riesgo",
     "Identifica señales de riesgo para la integridad de la persona y actúa en consecuencia.",
     {"EN_INICIO": "No explora el riesgo o lo minimiza.",
      "EN_PROCESO": "Explora el riesgo de forma parcial y no siempre ajusta su decisión.",
      "LOGRADO": "Identifica los factores de riesgo y ajusta su intervención a su gravedad.",
      "DESTACADO": "Valora el riesgo de forma continua y anticipa medidas de protección."}),
    ("MARCO_NORMATIVO", "Información de derechos y rutas de atención",
     "Informa a la persona sus derechos y las rutas de atención disponibles.",
     {"EN_INICIO": "No informa derechos ni rutas, o lo hace con datos erróneos.",
      "EN_PROCESO": "Menciona derechos o rutas, pero de forma incompleta.",
      "LOGRADO": "Explica con claridad sus derechos y las rutas de atención que le corresponden.",
      "DESTACADO": "Explica derechos y rutas con claridad y verifica que la persona los comprendió."}),
    ("MARCO_NORMATIVO", "Derivación",
     "Deriva a la entidad competente con consentimiento y sin dejar a la persona sola en el proceso.",
     {"EN_INICIO": "Deriva sin explicar o sin acompañar, o no deriva.",
      "EN_PROCESO": "Deriva a la entidad adecuada, pero sin el seguimiento necesario.",
      "LOGRADO": "Deriva a la entidad competente, con consentimiento y acompañamiento.",
      "DESTACADO": "Deriva, acompaña y deja acordado el seguimiento posterior."}),
    ("INTERVENCION_ETICA", "Escucha sin revictimización",
     "Escucha sin juzgar ni cuestionar el relato, y evita preguntas que repitan el daño.",
     {"EN_INICIO": "Cuestiona o juzga el relato, o exige repetirlo.",
      "EN_PROCESO": "Escucha con respeto, pero formula preguntas que pueden revictimizar.",
      "LOGRADO": "Escucha sin juzgar y evita preguntas innecesarias sobre lo ocurrido.",
      "DESTACADO": "Escucha con validación y cuida el lenguaje y los tiempos de la persona."}),
)


class ErrorDeSiembra(Exception):
    """La siembra no puede continuar; el mensaje está pensado para quien opera el comando."""


@dataclass
class Informe:
    creado: list = field(default_factory=list)
    existente: list = field(default_factory=list)
    archivado: list = field(default_factory=list)

    def anotar(self, creado, texto):
        (self.creado if creado else self.existente).append(texto)


def validar_clave(clave):
    """La clave sale de una variable de entorno y debe cumplir la política de contraseñas de la app."""
    if not clave:
        raise ErrorDeSiembra("Falta la variable de entorno SIEP_SEMILLA_CLAVE con la contraseña temporal.")
    try:
        password_validation.validate_password(clave)
    except DjangoValidationError as error:
        raise ErrorDeSiembra("SIEP_SEMILLA_CLAVE no cumple la política de contraseñas: " + " ".join(error.messages)) from None


def _cuenta(correo_local, nombre, apellido, rol, clave, informe):
    correo = f"{correo_local}@{DOMINIO}"
    existente = CustomUser.objects.filter(email=correo).first()
    if existente:
        if existente.role != rol:
            raise ErrorDeSiembra(f"El correo {correo} ya existe con otro rol; no se toca.")
        informe.anotar(False, f"{rol.lower()} {correo}")
        return existente
    cuenta = CustomUser(email=correo, nombre=nombre, apellido=apellido, role=rol, activo=True)
    try:
        password_validation.validate_password(clave, cuenta)
    except DjangoValidationError as error:
        raise ErrorDeSiembra(f"SIEP_SEMILLA_CLAVE no sirve para la cuenta {correo}: " + " ".join(error.messages)) from None
    cuenta.set_password(clave)
    cuenta.must_change_password = True
    cuenta.temp_password_set_at = timezone.now()
    cuenta.save()
    informe.anotar(True, f"{rol.lower()} {correo}")
    return cuenta


def _grupo(codigo, nombre, docente, estudiantes, informe):
    grupo, creado = Grupo.objects.get_or_create(codigo=codigo, defaults={"nombre": nombre, "profesor": docente})
    informe.anotar(creado, f"grupo «{grupo.nombre}» ({codigo})")
    ahora = timezone.now()
    for estudiante in estudiantes:
        _, nuevo = GrupoEstudiante.objects.get_or_create(
            grupo=grupo, estudiante=estudiante,
            defaults={"status": MembershipStatus.ACTIVE, "invited_by": docente, "invited_at": ahora, "responded_at": ahora})
        if nuevo:
            informe.creado.append(f"  miembro {estudiante.email} en {codigo}")
    return grupo


def _rubrica(autora, informe):
    rubrica = Rubric.objects.filter(name=NOMBRE_RUBRICA, case_version__isnull=True).first()
    if rubrica:
        informe.anotar(False, f"rúbrica «{NOMBRE_RUBRICA}»")
        return rubrica
    competencias = {codigo: Competency.objects.get_or_create(
        code=codigo, defaults={"name": datos[0], "description": datos[1], "sort_order": orden})[0]
        for orden, (codigo, datos) in enumerate(COMPETENCIAS.items(), start=1)}
    rubrica = Rubric.objects.create(name=NOMBRE_RUBRICA, created_by=autora,
        description="Evalúa la atención inicial a una persona víctima de violencia basada en género.")
    peso = Decimal(100) / len(CRITERIOS)
    for orden, (codigo, titulo, descripcion, descriptores) in enumerate(CRITERIOS, start=1):
        RubricCriterion.objects.create(
            rubric=rubrica, competency=codigo, competency_ref=competencias[codigo], title=titulo,
            description=descripcion, weight=peso, max_score=5, display_order=orden,
            level_descriptors_json=json.dumps(descriptores, ensure_ascii=False))
    informe.anotar(True, f"rúbrica «{NOMBRE_RUBRICA}» con {len(CRITERIOS)} criterios")
    return rubrica


def _adjuntar_portada_insignia(version):
    if version.cover_id or not RUTA_PORTADA.is_file():
        return
    try:
        with RUTA_PORTADA.open("rb") as archivo:
            version.cover = crear_portada(archivo)
    except (ApiError, OSError) as error:
        raise ErrorDeSiembra(f"No se pudo adjuntar la portada del caso insignia: {error}") from error
    version.cover_pixel_art = True
    version.save(update_fields=["cover", "cover_pixel_art"])


def _caso_insignia(autora, publicador, rubrica, informe):
    """Carga el caso como borrador, le asigna la rúbrica de la siembra y lo publica.

    La rúbrica entra en la huella de la versión: se asigna ANTES de publicar, porque después cambiarla rompería el sello.
    Una versión ya publicada solo recibe la portada si todavía le falta: es un recurso de presentación fuera del sello.
    """
    plan = traducir(json.loads(RUTA_DOCUMENTO.read_text(encoding="utf-8")))
    plan = replace(plan, version=MappingProxyType({**plan.version, "estimated_minutes": MINUTOS_ESTIMADOS}))
    # Serializa el reemplazo por caso, también cuando la versión del documento ya estaba publicada.
    caso = SimulationCase.objects.select_for_update().filter(code=plan.caso["code"]).first()
    existente = caso.versions.filter(semantic_version=plan.version["semantic_version"]).first() if caso else None
    if existente is not None and existente.status == CaseVersionStatus.PUBLISHED:
        _adjuntar_portada_insignia(existente)
        informe.existente.append(f"caso {plan.caso['code']} versión {existente.semantic_version} (PUBLISHED)")
        return existente
    try:
        version = cargar(plan, autora)
    except ErrorDeCarga as error:
        raise ErrorDeSiembra(f"No se pudo cargar el caso insignia: {error}") from error
    if version.status != CaseVersionStatus.DRAFT:
        raise ErrorDeSiembra(f"El caso insignia está en estado {version.status}; la siembra no lo publica.")
    _adjuntar_portada_insignia(version)
    rubricas.asociar_a_version(autora, rubrica.pk, version.pk)
    problemas = arbol_de(version).problemas()
    if problemas:
        raise ErrorDeSiembra("El caso insignia no quedó publicable: " + "; ".join(str(getattr(p, "message", p)) for p in problemas))
    try:
        if settings.REVIEW_WORKFLOW_STRICT:
            ciclo.enviar_a_revision(autora, version.pk)
        version = ciclo.publicar(publicador, version.pk)
    except ApiError as error:
        raise ErrorDeSiembra(f"No se pudo publicar el caso insignia: {error.detail}") from error
    informe.creado.append(f"caso {version.simulation_case.code} versión {version.semantic_version} (PUBLISHED)")
    informe.creado.append("rúbrica asignada a la versión del caso insignia")
    return version


@transaction.atomic
def sembrar(publicador_correo, clave):
    """Siembra el entorno y devuelve el ``Informe``. Falla con ``ErrorDeSiembra`` sin dejar nada escrito."""
    validar_clave(clave)
    publicador = CustomUser.objects.filter(email=publicador_correo, role=UserRole.ADMIN, activo=True).first()
    if publicador is None:
        raise ErrorDeSiembra("El publicador debe ser un administrador activo que ya exista; el comando no crea ADMIN.")
    informe = Informe()
    docentes = [_cuenta(*datos, UserRole.PROFESOR, clave, informe) for datos in DOCENTES]
    for docente in docentes:
        PermisoDeAutoria.objects.get_or_create(docente=docente, defaults={"otorgado_por": publicador})
    estudiantes = [_cuenta(*datos, UserRole.ESTUDIANTE, clave, informe) for datos in ESTUDIANTES]
    grupos = [_grupo(codigo, nombre, docentes[docente], [estudiantes[i] for i in miembros], informe)
              for codigo, nombre, docente, miembros in GRUPOS]
    autora = docentes[0]
    version = _caso_insignia(autora, publicador, _rubrica(autora, informe), informe)
    for grupo in grupos:
        if CaseAssignment.objects.filter(grupo=grupo, case_version=version).exists():
            informe.existente.append(f"asignación del caso a {grupo.codigo}")
            continue
        assignment_service.create_assignment(
            grupo.profesor, {"caseVersionId": version.pk, "target": {"type": "GROUP", "groupId": grupo.pk}})
        informe.creado.append(f"asignación del caso a {grupo.codigo}")
    otras_publicadas = (CaseVersion.objects.select_for_update()
        .filter(simulation_case_id=version.simulation_case_id, status=CaseVersionStatus.PUBLISHED)
        .exclude(pk=version.pk).order_by("pk"))
    for anterior in otras_publicadas:
        ciclo.archivar(publicador, anterior.pk)
        informe.archivado.append(f"versión {anterior.semantic_version} archivada: la reemplaza la {version.semantic_version}")
    CaseAssignment.objects.filter(
        grupo__in=grupos, case_version__simulation_case_id=version.simulation_case_id, active=True,
    ).exclude(case_version=version).update(active=False)
    return informe
