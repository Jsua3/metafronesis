import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { apiErrorMessage } from '../../../../core/api/api-error.util';
import { revisionConflictOf } from '../../../../core/api/revision-conflict.util';
import { type RubricAdmin, RubricService } from '../../../../core/api/rubric.service';
import type { RubricAdoptRequest } from '../../../../core/models/simulation.model';
import { UiFiguraPixel } from '../../../../shared/ui/figura-pixel/ui-figura-pixel';
import { UiProgress } from '../../../../shared/ui/progress/ui-progress';
import { CasoStore } from '../../estado/caso.store';
import { injectLlevar } from '../../marco/llevar';
import { codigoDeCompetencia, competenciasMarcadas } from '../../modelo/efectos';
import { escenasEnOrden } from '../../modelo/progreso';
import { RutasAutoria } from '../../rutas';
import { type FichaDeRespuesta, FichasDeRespuestasComponent } from '../evaluacion/fichas-de-respuestas.component';
import { PestanasEvaluacionComponent } from '../evaluacion/pestanas-evaluacion.component';
import { ElectorDeRubricaComponent, type OpcionDeRubrica } from './elector-de-rubrica.component';
import { type CriterioVista, type VistaRubrica, criteriosDe, pesoEnPalabras, tipoDeRubrica } from './rubrica-del-caso.modelo';

/**
 * «Rúbrica» del caso (EDITOR.md §5.3), la segunda pestaña de Evaluación. La rúbrica viaja con el caso: la docente ADOPTA
 * una (RK-1) y el caso guarda una copia propia de la versión, que se sella al publicar. Estados: sin rúbrica (vacío con
 * sus dos acciones), propia (criterios, peso y «Dónde se evidencia»), compartida (una asignada de la biblioteca: se
 * ofrece traer una copia) y predeterminada de la institución (lo mismo).
 *
 * La adopción viaja por la cola del store (`adoptarRubrica`): sale después de lo pendiente, con la revisión vigente, y la
 * vista que devuelve el servidor pasa a ser el caso: la faceta «Criterios» de las respuestas ya muestra las competencias,
 * sin conflicto de revisión. No bloquea el
 * envío si falta la rúbrica (el servidor no lo exige).
 *
 * Patrón: contenedor con estados explícitos (State: cargando, error, sin rúbrica, propia, compartida, predeterminada);
 * lee por los adaptadores de `core/api` (`RubricService`) y escribe por la fachada del store.
 */
@Component({
  selector: 'app-rubrica-del-caso',
  imports: [RouterLink, UiFiguraPixel, UiProgress, PestanasEvaluacionComponent, FichasDeRespuestasComponent, ElectorDeRubricaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rubrica-del-caso.component.html',
  styleUrl: './rubrica-del-caso.component.scss',
})
export class RubricaDelCasoComponent {
  protected readonly store = inject(CasoStore);
  private readonly rutas = inject(RutasAutoria);
  private readonly rubricas = inject(RubricService);
  private readonly injector = inject(Injector);
  private readonly llevar = injectLlevar();

  protected readonly vista = signal<VistaRubrica>({ tipo: 'cargando' });
  protected readonly anuncio = signal('');
  /** El elector abierto, con lo elegido, sus opciones y lo que costaría el cambio. */
  protected readonly eligiendo = signal(false);
  protected readonly elegida = signal<OpcionDeRubrica['id'] | null>(null);
  protected readonly opciones = signal<OpcionDeRubrica[]>([]);
  protected readonly cargandoOpciones = signal(false);
  protected readonly errorElector = signal('');
  protected readonly perdidas = signal<string[]>([]);
  /**
   * Se está averiguando qué criterios marcados no tiene la rúbrica elegida. Mientras tanto no se confirma: el aviso de lo
   * que se pierde tiene que llegar antes del cambio, no después. Si la consulta falla, se dice y se ofrece volver a mirar.
   */
  protected readonly comprobando = signal(false);
  protected readonly errorComprobacion = signal('');
  protected readonly ocupado = signal(false);
  /** Lo que falló al adoptar sin el elector («Usar las competencias del programa», «Traer una copia»). */
  protected readonly errorAdopcion = signal('');
  /** Los códigos de los criterios que se perderían con la rúbrica elegida (las respuestas los marcan hoy). */
  private readonly perdidasCodigos = signal<string[]>([]);
  private catalogo: Set<string> | null = null;

  /** El número de la versión del caso en el servidor; `null` si el caso solo vive en memoria (pruebas, sin servidor). */
  private readonly versionId = computed(() => {
    const n = Number(this.store.caso()?.id);
    return Number.isInteger(n) && n > 0 ? n : null;
  });

  /** Las respuestas del caso que marcan cada competencia, como fichas (en el orden de la historia). */
  private readonly evidencias = computed(() => {
    const caso = this.store.caso();
    const porCodigo = new Map<string, FichaDeRespuesta[]>();
    if (!caso) return porCodigo;
    escenasEnOrden(caso).forEach((e, i) => {
      for (const r of e.respuestas) {
        for (const codigo of competenciasMarcadas(r.efectos)) {
          const lista = porCodigo.get(codigo) ?? [];
          lista.push({ escenaId: e.id, respuestaId: r.id, escena: `${i + 1} · ${e.titulo}`, texto: r.texto, href: this.rutas.a('/editor/escena', e.id) });
          porCodigo.set(codigo, lista);
        }
      }
    });
    return porCodigo;
  });

  protected readonly criterios = computed<CriterioVista[]>(() => {
    const v = this.vista();
    if (v.tipo !== 'propia' && v.tipo !== 'compartida' && v.tipo !== 'predeterminada') return [];
    return criteriosDe(v.rubrica, this.evidencias());
  });
  protected readonly mensajeDeError = computed(() => {
    const v = this.vista();
    return v.tipo === 'error' ? v.mensaje : '';
  });
  protected readonly pesoEnPalabras = pesoEnPalabras;
  protected readonly conEvidencia = computed(() => this.criterios().filter((c) => c.evidencias.length).length);

  constructor() {
    // Se lee al entrar y cada vez que el store relee el caso (después de adoptar, o al recargar tras un conflicto).
    effect(() => {
      this.store.lectura();
      const id = this.versionId();
      untracked(() => void this.cargar(id));
    });
  }

  /** Lee qué rúbrica tiene el caso. Sin servidor, lo único que se sabe es lo que trae el caso (sus competencias). */
  protected async cargar(id: number | null = this.versionId()): Promise<void> {
    if (id === null) {
      const competencias = this.store.caso()?.competencias ?? [];
      this.vista.set(competencias.length
        ? { tipo: 'propia', rubrica: { id: 0, nombre: 'Rúbrica del caso', criterios: competencias.map((c) => ({ codigo: c.codigo, titulo: c.nombre, competencia: c.nombre, peso: null, descripcion: '' })) } }
        : { tipo: 'sin-rubrica' });
      return;
    }
    if (this.vista().tipo === 'error') this.vista.set({ tipo: 'cargando' });
    try {
      const rubrica = await firstValueFrom(this.rubricas.caseVersionRubric(id));
      if (this.versionId() === id) this.vista.set(tipoDeRubrica(rubrica, id));
    } catch (error) {
      if (this.versionId() !== id) return;
      // 404 = el caso no tiene ninguna (ni la predeterminada): es el estado vacío, no un error.
      if ((error as { status?: number }).status === 404) this.vista.set({ tipo: 'sin-rubrica' });
      else this.vista.set({ tipo: 'error', mensaje: apiErrorMessage(error, 'No pudimos leer la rúbrica del caso.') ?? 'No pudimos leer la rúbrica del caso.' });
    }
  }

  /** «Usar las competencias del programa» o «Traer una copia al caso»: adopta sin pasar por el elector. */
  protected async adoptar(cuerpo: RubricAdoptRequest, nombre: string): Promise<void> {
    if (this.ocupado() || this.store.soloLectura()) return;
    this.ocupado.set(true);
    this.errorElector.set('');
    this.errorAdopcion.set('');
    try {
      await this.store.adoptarRubrica(cuerpo);
      this.eligiendo.set(false);
      this.anuncio.set(`El caso ya tiene su rúbrica propia: «${nombre}». Sus criterios aparecen en la faceta «Criterios» de cada respuesta.`);
      afterNextRender(() => document.getElementById('rubrica-titulo')?.focus(), { injector: this.injector });
    } catch (error) {
      // El conflicto de revisión lo avisa el marco (con «Recargar»); aquí solo lo demás, donde se pidió.
      if (revisionConflictOf(error)) return;
      const mensaje = apiErrorMessage(error, 'No se pudo cambiar la rúbrica del caso.') ?? (error instanceof Error ? error.message : '');
      if (this.eligiendo()) this.errorElector.set(mensaje);
      else this.errorAdopcion.set(mensaje);
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Abre el elector («Copiar una de mis rúbricas» o «Cambiar por otra») y carga la biblioteca. */
  protected async abrirElector(): Promise<void> {
    this.eligiendo.set(true);
    this.elegida.set(null);
    this.perdidas.set([]);
    this.comprobando.set(false);
    this.errorComprobacion.set('');
    this.errorElector.set('');
    const programa: OpcionDeRubrica = {
      id: 'programa', nombre: 'Las competencias del programa', motivo: '',
      detalle: 'Un criterio por cada competencia del programa, con el mismo peso.',
    };
    this.opciones.set([programa]);
    this.cargandoOpciones.set(true);
    try {
      const actual = this.vista();
      const propia = actual.tipo === 'propia' ? actual.rubrica.id : null;
      const lista = await firstValueFrom(this.rubricas.list());
      // De la biblioteca: las activas que no son la copia de otro caso (ni la de este).
      const deBiblioteca = lista.filter((r) => r.active && !r.caseVersion && r.id !== propia).map((r) => opcionDe(r));
      this.opciones.set([programa, ...deBiblioteca]);
    } catch (error) {
      this.errorElector.set(apiErrorMessage(error, 'No pudimos cargar tus rúbricas; puedes usar las competencias del programa.') ?? '');
    } finally {
      this.cargandoOpciones.set(false);
    }
  }

  protected cerrarElector(): void {
    this.eligiendo.set(false);
    afterNextRender(() => document.getElementById('rubrica-titulo')?.focus(), { injector: this.injector });
  }

  /** Al elegir, se calcula qué criterios marcados por las respuestas no existen en la elegida (para avisar antes). */
  protected async elegir(id: OpcionDeRubrica['id']): Promise<void> {
    this.elegida.set(id);
    this.perdidas.set([]);
    this.perdidasCodigos.set([]);
    this.errorComprobacion.set('');
    const marcadas = this.codigosMarcados();
    if (!marcadas.size) {
      this.comprobando.set(false);
      return;
    }
    this.comprobando.set(true);
    try {
      const codigos = id === 'programa' ? await this.codigosDelPrograma() : await this.codigosDe(id);
      if (this.elegida() !== id) return;
      const nombres = new Map((this.store.caso()?.competencias ?? []).map((c) => [c.codigo, c.nombre]));
      const perdidos = [...marcadas].filter((c) => !codigos.has(c));
      this.perdidasCodigos.set(perdidos);
      this.perdidas.set(perdidos.map((c) => nombres.get(c) ?? c));
    } catch {
      if (this.elegida() !== id) return;
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      this.errorComprobacion.set('No pudimos comprobar qué criterios marcados se conservan con esta rúbrica. Vuelve a intentarlo antes de usarla.');
    } finally {
      if (this.elegida() === id) this.comprobando.set(false);
    }
  }

  /** «Volver a comprobar» tras un fallo de la consulta. */
  protected recomprobar(): void {
    const id = this.elegida();
    if (id !== null) void this.elegir(id);
  }

  protected confirmar(): void {
    const id = this.elegida();
    if (id === null || this.comprobando() || this.errorComprobacion()) return;
    const opcion = this.opciones().find((o) => o.id === id);
    void this.adoptar(id === 'programa' ? { fromCompetencies: true } : { rubricId: id }, opcion?.nombre ?? 'la rúbrica elegida');
  }

  /** Cuántas respuestas marcan alguno de los criterios que se perderían. */
  protected readonly respuestasAfectadas = computed(() => {
    const perdidas = new Set(this.perdidasCodigos());
    if (!perdidas.size) return 0;
    return (this.store.caso()?.escenas ?? []).flatMap((e) => e.respuestas)
      .filter((r) => competenciasMarcadas(r.efectos).some((c) => perdidas.has(c))).length;
  });

  protected irA(r: FichaDeRespuesta): void {
    void this.llevar({ ruta: `/editor/escena/${r.escenaId}`, ancla: `respuesta-${r.respuestaId}` });
  }

  private codigosMarcados(): Set<string> {
    return new Set((this.store.caso()?.escenas ?? []).flatMap((e) => e.respuestas.flatMap((r) => competenciasMarcadas(r.efectos))));
  }

  private async codigosDelPrograma(): Promise<Set<string>> {
    if (!this.catalogo) {
      const lista = await firstValueFrom(this.rubricas.competencies());
      this.catalogo = new Set(lista.filter((c) => c.active).map((c) => codigoDeCompetencia(c.code || c.name)));
    }
    return this.catalogo;
  }

  private async codigosDe(id: number): Promise<Set<string>> {
    const detalle = await firstValueFrom(this.rubricas.detail(id));
    return new Set((detalle.criteria ?? []).filter((c) => c.active).map((c) => codigoDeCompetencia(c.competency || c.title)));
  }
}

/** Una rúbrica de la biblioteca como opción del elector. El servidor no adopta una cuyos pesos activos no suman 100. */
function opcionDe(r: RubricAdmin): OpcionDeRubrica {
  // El detalle distingue dos rúbricas con el mismo nombre: criterios, versión y en cuántos casos se usa.
  const partes = [r.criteriaCount === 1 ? '1 criterio' : `${r.criteriaCount} criterios`, `versión ${r.version}`];
  if (r.isDefault) partes.push('la predeterminada de la institución');
  if (r.usage?.caseVersions) partes.push(r.usage.caseVersions === 1 ? 'se usa en 1 caso' : `se usa en ${r.usage.caseVersions} casos`);
  const creada = r.createdAt ? new Date(r.createdAt) : null;
  if (creada && !Number.isNaN(creada.getTime())) partes.push(`creada el ${creada.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`);
  const suma = Math.round(r.totalWeight * 100) / 100;
  return {
    id: r.id, nombre: r.name, detalle: partes.join(' · '),
    motivo: suma === 100 ? '' : 'No se puede usar todavía: los pesos de sus criterios no suman 100. Corrígela en Rúbricas.',
  };
}
