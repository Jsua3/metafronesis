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
from django.http import Http404
from django.utils import timezone

from apps.grupos import assignment_service
from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante, MembershipStatus
from apps.publicacion import ciclo, clonado
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

NOMBRE_RUBRICA = "Rúbrica de atención psicosocial · Violencia familiar y tentativa de feminicidio"
DESCRIPCION_RUBRICA = (
    "Evalúa las cuatro competencias que el caso SIM-VBG-002 registra en sus 20 decisiones, desde la crisis en urgencias "
    "hasta el restablecimiento de derechos en la Comisaría de Familia. Cada criterio recoge todas las decisiones de su "
    "competencia; el peso refleja cuántas decisiones la evidencian.")
# Las cuatro competencias que el caso insignia registra en sus decisiones: la calificación del sistema promedia, por
# competencia, el nivel de cada decisión que la toca. Por eso hay UN criterio por competencia: dos criterios con la misma
# competencia recibirían siempre el mismo nivel, y una competencia sin criterio dejaría evidencia sin evaluar.
COMPETENCIAS = {
    "CONTENCION": ("Contención emocional", "Estabiliza a la persona y a su red de apoyo en la crisis."),
    "MARCO_NORMATIVO": ("Marco normativo y rutas de atención", "Aplica referentes legales y activa las rutas institucionales."),
    "INTERVENCION_ETICA": ("Intervención técnica y ética", "Decide sin revictimizar y minimizando el riesgo."),
    "REFLEXION": ("Reflexión profesional", "Registra aprendizajes y justifica su criterio de intervención."),
}
# (competencia, peso, título, descripción, descriptores por nivel). Pesos: 5 decisiones de contención, 9 de intervención
# ética, 5 de marco normativo y 2 de reflexión.
CRITERIOS = (
    ("CONTENCION", Decimal("25"), "Primeros auxilios psicológicos y contención en crisis",
     "Con la familia en urgencias y con Yuliana, verifica la seguridad, se presenta, contiene antes de informar, prepara "
     "un espacio privado y acompaña el duelo por Salomé sin apresurar los trámites. Se observa en la llegada, la sala de "
     "espera, la elección del lugar para hablar, el silencio tras la noticia y lo que sigue esa noche.",
     {"EN_INICIO": "Informa o actúa antes de contener: da la noticia sin confirmarla o en un lugar sin privacidad, separa "
                   "a la red de apoyo, responde al dolor con consejos («tiene que ser fuerte») o se retira.",
      "EN_PROCESO": "Ofrece apoyo, pero salta pasos de los primeros auxilios psicológicos: lee la historia antes de mirar "
                    "la escena, elige un rincón poco privado o pasa a los trámites justo después de la noticia.",
      "LOGRADO": "Aplica los primeros auxilios psicológicos en orden: verifica la seguridad, se presenta, contiene antes de "
                 "informar, prepara la sala de escucha y acompaña el silencio validando la emoción.",
      "DESTACADO": "Además mantiene unida a la familia y conectada con su red, ajusta el ritmo a lo que cada persona "
                   "necesita y deja acordado con trabajo social quién se queda con ellos."}),
    ("INTERVENCION_ETICA", Decimal("35"), "Intervención técnica y ética sin revictimización",
     "Acuerda una sola voz con el equipo médico, explora lo que la familia sabe antes de informar (EPICEE), protege la "
     "confidencialidad y la seguridad de Yuliana, no le miente al despertar, prioriza la protección sobre la mediación, "
     "valora el riesgo de feminicidio sin pedirle que repita el relato y valora a las personas dependientes. Se observa "
     "en la estación de enfermería, la noticia, la llamada, el plan, el despertar, la Comisaría y la valoración del riesgo.",
     {"EN_INICIO": "Decide de forma que revictimiza o expone: confirma datos por teléfono a un desconocido, le miente a "
                   "Yuliana sobre su hija, propone mediación o perdón con el agresor, o le pide contar de nuevo lo ocurrido.",
      "EN_PROCESO": "Evita el daño mayor, pero improvisa: delega la noticia sin acordarla, aplica el instrumento de riesgo "
                    "como una lista, o centra la intervención solo en Yuliana o en su historia personal.",
      "LOGRADO": "Acuerda la información con el equipo, comunica con EPICEE, protege la confidencialidad, dice la verdad "
                 "en el momento y con el equipo adecuados, y valora el riesgo de feminicidio en privado, preguntando solo "
                 "lo necesario.",
      "DESTACADO": "Además integra en su plan la valoración psicosocial de la familia, el ciclo de la violencia y a las "
                   "personas dependientes, con manejo interdisciplinario y sin poner a nadie como testigo."}),
    ("MARCO_NORMATIVO", Decimal("25"), "Marco normativo y activación de rutas de protección",
     "Actúa con el marco de cada escenario —Resolución 459 de 2012 y Ley 1257 de 2008 en el hospital; Leyes 2126 de 2021, "
     "1098 de 2006 y 1257 de 2008 en la Comisaría—, activa las rutas sin trasladarle la carga a la víctima (notificación "
     "en salud, Fiscalía, medidas de protección, salud mental) y le explica sus derechos y qué hace cada entidad. Se "
     "observa con la psicóloga jefe, en la entrega de turno, en el marco del restablecimiento, al orientar a Yuliana y en "
     "el concepto final.",
     {"EN_INICIO": "Espera a que Yuliana decida si denuncia, le promete lo que la ley no garantiza («él no podrá "
                   "acercarse nunca más») o desconoce las rutas que se activan de oficio.",
      "EN_PROCESO": "Cita normas pertinentes, pero toma como eje una que no corresponde (Ley 1448 de 2011), deja rutas para "
                    "después del alta o entrega los pasos por escrito sin acompañar.",
      "LOGRADO": "Aplica el marco de cada escenario y deja activadas la notificación en salud, el reporte a la Fiscalía y "
                 "la solicitud de medidas de protección; explica con palabras sencillas el papel de cada entidad.",
      "DESTACADO": "Además sustenta el restablecimiento con el marco completo, incluye medidas para las personas "
                   "dependientes y la derivación a salud mental, y verifica que Yuliana comprendió sus derechos."}),
    ("REFLEXION", Decimal("15"), "Registro y reflexión profesional",
     "Deja un informe de remisión útil para la Comisaría y que no revictimiza (hechos con su fuente, lo observado, lo "
     "activado), y cierra el caso registrando lo que hizo, por qué, lo que faltó y cómo le afectó, con supervisión. Se "
     "observa en el informe de remisión y en la bitácora de cierre.",
     {"EN_INICIO": "No registra, o el informe culpa a la víctima («todo empezó porque ella le reclamó») o expone detalles "
                   "que no aportan a su protección.",
      "EN_PROCESO": "El informe es tan breve que no sirve de base («víctima de violencia intrafamiliar, remitida») o la "
                    "bitácora solo recoge lo que salió bien.",
      "LOGRADO": "Redacta hechos con su fuente, lo observado y lo activado, y registra en la bitácora su actuación, sus "
                 "razones y lo que faltó.",
      "DESTACADO": "Además reconoce cómo le afectó el caso, pide supervisión y convierte lo aprendido en criterios para la "
                   "próxima intervención."}),
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


def docentes_reales(correos):
    """Las cuentas PROFESOR activas que ya existen y serán dueñas de los grupos sembrados (``--docentes``), de 1 a 3."""
    if len(correos) > len(GRUPOS):
        raise ErrorDeSiembra(f"--docentes admite hasta {len(GRUPOS)} correos, uno por grupo sembrado.")
    docentes = []
    for correo in correos:
        docente = CustomUser.objects.filter(email__iexact=correo, role=UserRole.PROFESOR, activo=True).first()
        if docente is None:
            raise ErrorDeSiembra(f"--docentes: {correo} no es una cuenta PROFESOR activa que ya exista.")
        docentes.append(docente)
    return docentes


def _grupo(codigo, nombre, docente, estudiantes, informe):
    grupo, creado = Grupo.objects.get_or_create(codigo=codigo, defaults={"nombre": nombre, "profesor": docente})
    informe.anotar(creado, f"grupo «{grupo.nombre}» ({codigo})" + (f", a cargo de {docente.email}" if creado else ""))
    if not creado and grupo.profesor_id != docente.pk:
        grupo.profesor = docente
        grupo.save(update_fields=["profesor"])
        informe.creado.append(f"  el grupo {codigo} ahora es de {docente.email}")
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
    rubrica = Rubric.objects.create(name=NOMBRE_RUBRICA, created_by=autora, description=DESCRIPCION_RUBRICA)
    for orden, (codigo, peso, titulo, descripcion, descriptores) in enumerate(CRITERIOS, start=1):
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
    """Deja publicada una versión del caso insignia con la rúbrica de la siembra.

    La rúbrica entra en la huella de la versión: se asigna ANTES de publicar, porque después cambiarla rompería el sello.
    Si la versión publicada tiene otra rúbrica (una siembra anterior), se clona en una versión nueva que recibe la rúbrica
    actual y se publica; ``sembrar`` archiva después la anterior. Una versión ya publicada solo recibe la portada si
    todavía le falta: es un recurso de presentación fuera del sello.
    """
    plan = traducir(json.loads(RUTA_DOCUMENTO.read_text(encoding="utf-8")))
    plan = replace(plan, version=MappingProxyType({**plan.version, "estimated_minutes": MINUTOS_ESTIMADOS}))
    # Serializa el reemplazo por caso, también cuando la versión del documento ya estaba publicada.
    caso = SimulationCase.objects.select_for_update().filter(code=plan.caso["code"]).first()
    existente = caso.versions.filter(semantic_version=plan.version["semantic_version"]).first() if caso else None
    vigente = None
    if existente is not None:
        vigente = existente if existente.status == CaseVersionStatus.PUBLISHED else (
            caso.versions.filter(status=CaseVersionStatus.PUBLISHED).order_by("-pk").first())
    if vigente is not None:
        activa = rubricas.rubrica_activa_de(vigente.pk)
        if activa is not None and activa.pk == rubrica.pk:
            _adjuntar_portada_insignia(vigente)
            informe.existente.append(f"caso {plan.caso['code']} versión {vigente.semantic_version} (PUBLISHED)")
            return vigente
        try:
            version = clonado.clonar(autora, vigente.pk)
        except (ApiError, Http404) as error:
            raise ErrorDeSiembra(f"No se pudo crear una versión nueva del caso insignia para cambiar su rúbrica: {error}") from error
        informe.creado.append(f"versión {version.semantic_version} del caso, copia de la {vigente.semantic_version} con la rúbrica nueva")
        return _publicar_con_rubrica(version, autora, publicador, rubrica, informe)
    try:
        version = cargar(plan, autora)
    except ErrorDeCarga as error:
        raise ErrorDeSiembra(f"No se pudo cargar el caso insignia: {error}") from error
    if version.status != CaseVersionStatus.DRAFT:
        raise ErrorDeSiembra(f"El caso insignia está en estado {version.status}; la siembra no lo publica.")
    return _publicar_con_rubrica(version, autora, publicador, rubrica, informe)


def _publicar_con_rubrica(version, autora, publicador, rubrica, informe):
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
def sembrar(publicador_correo, clave, correos_docentes=()):
    """Siembra el entorno y devuelve el ``Informe``. Falla con ``ErrorDeSiembra`` sin dejar nada escrito.

    Con ``correos_docentes`` (``--docentes``), los grupos sembrados quedan a cargo de esas cuentas PROFESOR reales, en
    orden y repartidos si son menos que los grupos: así ven a sus estudiantes, los intentos y los reportes. El caso
    insignia sigue siendo de la docente demo que lo escribió (el editor solo muestra los casos propios).
    """
    validar_clave(clave)
    publicador = CustomUser.objects.filter(email=publicador_correo, role=UserRole.ADMIN, activo=True).first()
    if publicador is None:
        raise ErrorDeSiembra("El publicador debe ser un administrador activo que ya exista; el comando no crea ADMIN.")
    reales = docentes_reales(list(correos_docentes))
    informe = Informe()
    docentes = [_cuenta(*datos, UserRole.PROFESOR, clave, informe) for datos in DOCENTES]
    for docente in docentes:
        PermisoDeAutoria.objects.get_or_create(docente=docente, defaults={"otorgado_por": publicador})
    estudiantes = [_cuenta(*datos, UserRole.ESTUDIANTE, clave, informe) for datos in ESTUDIANTES]
    grupos = [_grupo(codigo, nombre, reales[orden % len(reales)] if reales else docentes[docente],
                     [estudiantes[i] for i in miembros], informe)
              for orden, (codigo, nombre, docente, miembros) in enumerate(GRUPOS)]
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
