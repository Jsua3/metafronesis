import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import type { CaseLifecycle, ValidationIssue } from '../../../../core/models/simulation.model';
import { UiStat } from '../../../../shared/ui/stat/ui-stat';
import { CaseReviewPanelComponent } from '../../../simulator/case-review-panel.component';
import { UiDialog } from '../../../../shared/ui/dialog/ui-dialog';
import { AutoriaApiService } from '../../api/autoria-api.service';
import { CasoStore } from '../../estado/caso.store';
import { GuiaService } from '../../guia/guia.service';
import { PanelPendientesComponent } from '../../marco/panel-pendientes.component';
import { ProgresoDelCaso } from '../../marco/progreso.service';
import type { Etapa } from '../../modelo/pendientes';
import { type Falta, avisosDeLectura, faltasDelServidor, puedeEnviar, sugerencias } from '../../modelo/revision';
import { RutasAutoria, rutaDelEditor } from '../../rutas';
import { RUTA_ENSAYO, alPulsarProbar } from '../../ensayo';
import {
  type Comando, EstudioHerramientaComponent, EstudioRanuraDirective, EstudioService, injectComandos,
} from '../../marco/estudio';
import type { Pendiente } from '../../modelo/pendientes';

/** Cómo se nombra el estado del caso ante el docente. */
const NOMBRE_ESTADO: Record<string, string> = {
  DRAFT: 'Borrador', IN_REVIEW: 'En revisión', PUBLISHED: 'Publicado', ARCHIVED: 'Archivado',
};

/** Las etapas que resume esta pantalla, en el orden del hilo (la etapa «Enviar» es esta misma pantalla). */
const ETAPAS_DE_ENVIO: ReadonlyArray<{ etapa: Etapa; nombre: string }> = [
  { etapa: 'datos', nombre: 'Datos del caso' }, { etapa: 'lugar', nombre: 'Lugar y salas' },
  { etapa: 'historia', nombre: 'Historia' }, { etapa: 'evaluacion', nombre: 'Evaluación' },
];

/** Dónde está un problema, como el «archivo:línea» de un IDE: «Escena 3 · Recepción», o nada si no es de una escena. */
function dondeEsta(p: Pendiente, escenas: ReadonlyArray<{ id: string; titulo: string }>): string | null {
  if (!p.escenaId) return null;
  const i = escenas.findIndex((e) => e.id === p.escenaId);
  if (i < 0) return null;
  const titulo = escenas[i].titulo.trim();
  return titulo ? `Escena ${i + 1} · ${titulo}` : `Escena ${i + 1}`;
}

/** Cómo se nombra el motivo con el que Psicología devuelve un caso. */
const NOMBRE_MOTIVO: Record<string, string> = { FORMA: 'Forma', CONTENIDO: 'Contenido' };

/** Lo que dice el docente cuando el envío no pasó por una razón que no es un bloqueo de la compuerta. */
const OTRA_PERSONA_CAMBIO_EL_CASO = 'Otra persona cambió el caso mientras lo revisabas, así que no se envió. Recarga el caso (el aviso de arriba tiene el botón) y vuelve a enviarlo.';
const NO_SE_PUDO_ENVIAR = 'No se pudo enviar el caso. No se cambió nada: vuelve a intentarlo en un momento.';

/**
 * Enviar a revisión (tablero 32): qué falta resolver (lo mismo que mide la compuerta de publicación, en lenguaje del docente
 * y con «Llévame ahí» a lo concreto), sugerencias (no bloquean), lo que ya está listo y el envío a Psicología. Una vez enviado,
 * el caso queda «En revisión»: se puede ver, pero no editar.
 *
 * Disposición del estudio (EDITOR-PRO.md): el lienzo es un panel de «Problemas» como el de un IDE, agrupado por etapa, con
 * una fila por problema que lleva a él con un clic (↑/↓ para moverse entre filas); el Inspector lleva el caso, su recorrido
 * (Borrador → En revisión → Publicado), la lista de verificación y el envío, que es la única acción primaria de la vista.
 * Patrón: State (lo que se muestra sale del estado del ciclo del caso) y Observer (señales); el envío pasa por la Facade
 * del store y el servidor por el Adapter de `AutoriaApiService`.
 */
@Component({
  selector: 'app-revision',
  imports: [RouterLink, CaseReviewPanelComponent, UiStat, EstudioRanuraDirective, EstudioHerramientaComponent],
  host: { '(document:visibilitychange)': 'alCambiarVisibilidad()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './revision.component.html',
  styleUrl: './revision.component.scss',
})
export class RevisionComponent {
  protected readonly rutas = inject(RutasAutoria);
  protected readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  private readonly guia = inject(GuiaService);
  private readonly autoria = inject(AutoriaApiService);
  private readonly progreso = inject(ProgresoDelCaso);
  private readonly dialogo = inject(UiDialog);
  protected readonly mensaje = signal('');
  protected readonly anuncio = signal('');
  protected readonly enviando = signal(false);
  protected readonly falloEnvio = signal<string | null>(null);

  /** Lo que la compuerta del servidor dijo la última vez que se le preguntó. */
  private readonly hallazgos = signal<ValidationIssue[]>([]);
  private readonly ciclo = signal<CaseLifecycle | null>(null);
  /** Bloqueos que el servidor devolvió al intentar enviar (por si cambiaron desde que se le preguntó). */
  private readonly bloqueosDelEnvio = signal<ValidationIssue[]>([]);
  protected readonly consultando = signal(false);
  protected readonly noSeComprobo = signal(false);
  protected readonly creandoVersion = signal(false);
  private readonly estudio = inject(EstudioService, { optional: true });
  protected readonly falloVersion = signal<string | null>(null);

  constructor() {
    // En la paleta (Ctrl+K): cada problema por resolver, «Comprobar de nuevo» y «Enviar a Psicología».
    injectComandos((): Comando[] => this.store.soloLectura() ? [] : [
      { id: 'rev:comprobar', grupo: 'Enviar a revisión', titulo: 'Comprobar de nuevo', ejecutar: () => void this.comprobar() },
      ...(this.puedeEnviarAhora() ? [{ id: 'rev:enviar', grupo: 'Enviar a revisión', titulo: 'Enviar a Psicología', ejecutar: () => void this.enviar() }] : []),
      ...this.etapas().flatMap((e) => e.problemas.map((p, i) => ({
        id: `rev:problema:${e.etapa}:${i}`, grupo: 'Por resolver', titulo: p.mensaje, detalle: p.donde ?? e.nombre, ejecutar: () => void this.llevar(p),
      }))),
    ]);
    void this.comprobar();
    void this.store.releerProbado();
    // Lo que comprueba el sistema no es una casilla de la docente, pero el servidor cuenta la lista por lo marcado: aquí se
    // pone al día solo (marcado = el dato existe). Lo que respalda la constancia SÍ es casilla: sin ella la docente no podría
    // completar la lista antes de que Psicología apruebe. Cada ítem se intenta una vez, para no repetir un guardado que falla.
    const intentados = new Set<string>();
    effect(() => {
      const caso = this.store.caso();
      if (!caso?.lista || this.store.soloLectura()) return;
      untracked(() => {
        let cambio = false;
        for (const i of caso.lista!.items) {
          if (i.quien !== 'system' || (i.respaldado === true) === i.cumplido || intentados.has(i.codigo)) continue;
          intentados.add(i.codigo);
          this.store.marcarItemLista(i.codigo, i.respaldado === true);
          cambio = true;
        }
        if (cambio) void this.comprobar();
      });
    });
    // Una decisión tomada en el panel (aprobar, devolver, archivar) cambia el caso en el servidor: se vuelve a leer para
    // que el editor, la revisión vigente y las acciones permitidas sean las nuevas.
    this.autoria.api.caseChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (String(id) === this.store.caso()?.id) void this.recargar();
    });
  }

  /** El caso abierto como número, que es como lo piden el panel y el servidor. */
  protected readonly casoId = computed(() => Number(this.store.caso()?.id ?? 0));

  /** Lo que se le dice a quien ve el caso cuando ya no es un borrador. */
  protected readonly textoSoloLectura = computed(() => {
    switch (this.store.caso()?.estado) {
      case 'PUBLISHED': return 'El caso está publicado. Se puede ver, pero no editar.';
      case 'ARCHIVED': return 'El caso está archivado. Se puede ver, pero no editar.';
      default: return 'El caso está en revisión de Psicología. Se puede ver, pero no editar.';
    }
  });

  /** La última decisión, si fue devolver el caso a borrador: quien lo autora tiene que poder leer por qué volvió. */
  protected readonly devuelto = computed(() => {
    const revision = this.ciclo()?.review;
    if (this.store.soloLectura() || revision?.decision !== 'REJECTED') return null;
    return { motivo: NOMBRE_MOTIVO[revision.reason ?? ''] ?? 'Sin motivo', nota: revision.note?.trim() ?? '' };
  });

  /** Crear una versión nueva solo se ofrece cuando el servidor la permite (un caso publicado o archivado). */
  protected readonly puedeCrearVersion = computed(() => this.ciclo()?.allowedTransitions.includes('clone') === true);

  /** El estado del caso: el que el servidor acaba de decir o, si no, el del borrador que se está viendo. */
  protected readonly nombreEstado = computed(() => NOMBRE_ESTADO[this.store.caso()?.estado ?? this.ciclo()?.state ?? 'DRAFT'] ?? 'Borrador');

  /** Lo que el editor ve por su cuenta en el borrador (lo mismo que cuenta la hoja «Pendientes»). */
  private readonly faltasLocales = computed<Falta[]>(() => {
    const caso = this.store.caso();
    return caso ? puedeEnviar(caso).faltas : [];
  });

  /** Lo que falta, de dos fuentes: lo que el editor ve en el borrador y lo que dice la compuerta del servidor (sin repetir). */
  protected readonly faltas = computed<Falta[]>(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const locales = this.faltasLocales();
    const delServidor: ValidationIssue[] = [...this.hallazgos(), ...this.bloqueosDelEnvio()];
    // El motivo que el servidor da para no dejar enviar, si no es uno de los hallazgos de arriba (por ejemplo, la lista de verificación).
    const motivo = this.ciclo()?.blockedReason;
    if (motivo && motivo.code !== 'VALIDATION_ERRORS') delServidor.push({ code: motivo.code, severity: 'error', message: motivo.message });
    const unicos = new Map(delServidor.map((h) => [`${h.code}|${h.message}`, h]));
    return [
      ...locales,
      ...faltasDelServidor([...unicos.values()], caso, {
        respuestaDeOpcion: (clave) => this.store.respuestaDeOpcion(clave),
        respuestasGuardadas: (escenaId) => this.store.respuestasGuardadasDe(escenaId),
        faltasLocales: locales,
      }),
    ];
  });

  /** Lo de la lista de verificación que impide enviar (viene del editor o del servidor): se muestra junto a la lista. */
  protected readonly faltasDeLista = computed(() => this.faltas().filter((f) => f.codigo === 'CHECKLIST_INCOMPLETE'));

  /** Lo que solo dice el servidor (no está en la hoja «Pendientes», que se arma con lo que ve el editor): se lista aquí. */
  protected readonly faltasDelServidor = computed(() => {
    const locales = new Set(this.faltasLocales());
    return this.faltas().filter((f) => !locales.has(f) && f.codigo !== 'CHECKLIST_INCOMPLETE');
  });

  /**
   * Un resumen por etapa de lo que el editor ve (por corregir y por escribir): la lista completa vive una sola vez, en la
   * hoja «Pendientes», que se abre desde aquí. La etapa «Enviar» no sale: es esta pantalla.
   */
  protected readonly etapas = computed(() => {
    const pendientes = this.progreso.pendientes().filter((p) => p.tipo !== 'sugerencia');
    const escenas = this.store.caso()?.escenas ?? [];
    return ETAPAS_DE_ENVIO.map(({ etapa, nombre }) => {
      const deEtapa = pendientes.filter((p) => p.etapa === etapa);
      const corregir = deEtapa.filter((p) => p.tipo === 'por-corregir').length;
      const escribir = deEtapa.filter((p) => p.tipo === 'por-escribir').length;
      const partes = [corregir ? `${corregir} por corregir` : '', escribir ? `${escribir} por escribir` : ''].filter(Boolean);
      // Lo que hay que corregir va antes que lo que falta escribir, como los errores antes que los avisos en un IDE.
      const problemas = [...deEtapa].sort((x, y) => Number(x.tipo !== 'por-corregir') - Number(y.tipo !== 'por-corregir'))
        .map((p) => ({ ...p, donde: dondeEsta(p, escenas) }));
      return { etapa, nombre, total: corregir + escribir, texto: partes.length ? partes.join(' · ') : 'Listo', problemas };
    });
  });

  /** El recorrido del caso en tres pasos, con el actual marcado; «Devuelto» ocupa el segundo si Psicología lo devolvió. */
  protected readonly pasosDelCiclo = computed(() => {
    const estado = this.store.caso()?.estado ?? this.ciclo()?.state ?? 'DRAFT';
    const indice = estado === 'PUBLISHED' || estado === 'ARCHIVED' ? 2 : estado === 'IN_REVIEW' ? 1 : 0;
    const devuelto = estado === 'DRAFT' && !!this.devuelto();
    return [
      { nombre: 'Borrador', estado: indice === 0 ? 'actual' : 'hecho' },
      { nombre: devuelto ? 'Devuelto' : 'En revisión', estado: devuelto ? 'devuelto' : indice === 1 ? 'actual' : indice > 1 ? 'hecho' : 'pendiente' },
      { nombre: estado === 'ARCHIVED' ? 'Archivado' : 'Publicado', estado: indice === 2 ? 'actual' : 'pendiente' },
    ];
  });

  /** La línea de estado del caso: en qué punto del ciclo está y qué sigue, en una frase. */
  protected readonly lineaDeEstado = computed(() => {
    switch (this.store.caso()?.estado ?? this.ciclo()?.state ?? 'DRAFT') {
      case 'IN_REVIEW': return 'Enviado a Psicología. Esperando su decisión.';
      case 'PUBLISHED': return 'Publicado: los estudiantes ya pueden jugarlo.';
      case 'ARCHIVED': return 'Archivado: ya no aparece para los estudiantes.';
      default: {
        if (this.devuelto()) return 'Psicología lo devolvió: corrige lo que pide y vuelve a enviarlo.';
        const n = this.faltas().length;
        return n === 0 ? 'Borrador listo para enviar.' : `Borrador: faltan ${n} ${n === 1 ? 'cosa' : 'cosas'} para poder enviarlo.`;
      }
    }
  });

  /**
   * Los ítems de la lista que la docente puede marcar: sus declaraciones y los que respalda la constancia (los declara al
   * enviar; Psicología los confirma al aprobar). Todos, con un servidor que no dice quién respalda.
   */
  protected readonly casillas = computed(() => (this.store.caso()?.lista?.items ?? []).filter((i) => i.quien !== 'system'));
  /** Los que no se marcan: los comprueba el sistema con los datos del caso. */
  protected readonly deSistema = computed(() => (this.store.caso()?.lista?.items ?? []).filter((i) => i.quien === 'system'));

  /** El tono de la línea de estado: aviso si quedan cosas por resolver, bien si está listo; el resto es neutro. */
  protected readonly tonoDeEstado = computed(() => {
    if (this.store.soloLectura()) return 'neutro';
    return this.faltas().length > 0 ? 'aviso' : this.consultando() ? 'neutro' : 'ok';
  });

  protected readonly puedeEnviarAhora = computed(
    () => this.faltas().length === 0 && !this.consultando() && !this.enviando() && !this.store.soloLectura()
      && (this.ciclo()?.allowedTransitions ?? ['submit']).includes('submit'),
  );

  protected readonly sugeridas = computed(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    // Un aviso del editor que la compuerta ya convirtió en falta no se repite como sugerencia.
    const codigosEnFaltas = new Set(this.faltas().map((f) => f.codigo).filter(Boolean));
    // Los textos largos los avisa el servidor (también en un caso escrito a mano): se suman como sugerencias, con su escena.
    // «Probar» no es una sugerencia suelta: tiene su fila, con su botón, junto a lo que falta (`data-probado`).
    return [...sugerencias(caso).filter((s) => s.ir.accionId !== 'probar' && (!s.codigo || !codigosEnFaltas.has(s.codigo))), ...avisosDeLectura(this.hallazgos())];
  });
  protected readonly cuantasRespuestas = computed(() => (this.store.caso()?.escenas ?? []).reduce((n, e) => n + e.respuestas.length, 0));
  /** Los finales que el caso puede dar: los cuatro del modelo, o los que escribió la docente. */
  protected readonly cuantosFinales = computed(() => {
    const caso = this.store.caso();
    return !caso ? 0 : caso.modoFinales === 'automatico' ? 4 : caso.finales.length;
  });
  /**
   * «Probar» abre el borrador en el juego real: con clic normal en esta pestaña; con Ctrl o clic central, en otra ya al día
   * (`alPulsarProbar`). El clic central no llega como `click` sino como `auxclick`: por eso se escuchan los dos.
   */
  protected readonly rutaEnsayo = computed(() => RUTA_ENSAYO(this.store.caso()?.id ?? ''));
  protected probar(evento: MouseEvent): void {
    void alPulsarProbar(evento, this.store);
  }
  /** El nombre del lugar del caso; nada si el caso no tiene lugar. */
  protected readonly lugar = computed(() => (this.store.caso(), this.store.nombreDelLugar()));
  protected readonly textoFinales = computed(() => {
    const caso = this.store.caso();
    if (!caso) return '';
    if (caso.modoFinales === 'automatico') return 'finales que se calculan solos';
    const n = caso.finales.length;
    return `${n} ${n === 1 ? 'final escrito' : 'finales escritos'} por ti`;
  });
  protected readonly listo = computed(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const hechos: string[] = [];
    if (caso.titulo.trim() && caso.lugarId) hechos.push('El caso tiene nombre y lugar.');
    if (caso.inicioId) hechos.push('Tiene una escena de inicio.');
    const respuestas = caso.escenas.flatMap((e) => e.respuestas);
    if (respuestas.length && respuestas.every((r) => r.texto.trim() && r.retroalimentacion.trim())) {
      hechos.push('Todas las respuestas tienen texto, clasificación y lo que lee el estudiante después.');
    }
    if (caso.escenas.some((e) => e.esFinal)) hechos.push('Hay al menos una escena final.');
    if (caso.modoFinales === 'propio' && caso.finales.length && caso.finales.every((f) => f.nombre.trim() && f.texto.trim())) {
      hechos.push(`Los ${caso.finales.length} finales tienen nombre y texto.`);
    }
    if (caso.probadoHastaElFinal) hechos.push('Ya lo probaste como estudiante.');
    return hechos;
  });

  /** La hoja «Pendientes» de la barra, desde aquí: la única lista completa de lo que falta. */
  protected abrirPendientes(evento: Event): void {
    this.dialogo.sheet(PanelPendientesComponent, { side: 'end', origen: evento.currentTarget as Element | null });
  }

  /** El ensayo corre en otra pestaña: al volver a esta, se pregunta si ya llegó a un final. */
  protected alCambiarVisibilidad(): void {
    if (document.visibilityState === 'visible') void this.store.releerProbado();
  }

  /** Marca o desmarca un ítem de la lista de verificación (se guarda con la revisión vigente) y vuelve a preguntar qué falta. */
  protected marcarItem(codigo: string, cumplido: boolean): void {
    this.store.marcarItemLista(codigo, cumplido);
    void this.comprobar();
  }

  /** Vuelve a leer el caso y lo que el servidor dice de él, después de una decisión tomada fuera de esta pantalla. */
  private async recargar(): Promise<void> {
    const id = this.casoId();
    if (!id) return;
    await this.store.cargar(id, true);
    await this.comprobar();
  }

  /** Clona la versión y abre la copia en el editor: un caso publicado o archivado no se cambia, se versiona. */
  protected async crearVersion(): Promise<void> {
    if (this.creandoVersion()) return;
    this.creandoVersion.set(true);
    this.falloVersion.set(null);
    try {
      const vista = await firstValueFrom(this.autoria.api.cloneCaseVersion(this.casoId()));
      await this.router.navigateByUrl(rutaDelEditor('/editor', String(vista.caseVersionId)));
    } catch {
      this.falloVersion.set('No se pudo crear la versión nueva. No se cambió nada: vuelve a intentarlo en un momento.');
    } finally {
      this.creandoVersion.set(false);
    }
  }

  /** Le pregunta a la compuerta del servidor qué impide enviar y qué estado tiene el caso. Sin red, deja lo que se ve en el borrador. */
  protected async comprobar(): Promise<void> {
    this.consultando.set(true);
    this.noSeComprobo.set(false);
    this.bloqueosDelEnvio.set([]);
    try {
      const { hallazgos, ciclo } = await this.store.revisarConServidor();
      this.hallazgos.set(hallazgos);
      this.ciclo.set(ciclo);
    } catch {
      // Un caso que aún no está guardado no tiene qué preguntarle al servidor; uno que sí, avisa que no pudo.
      this.noSeComprobo.set(this.store.caso()?.revision !== 0);
    } finally {
      this.consultando.set(false);
    }
  }

  /** «Llévame ahí»: abre la pantalla de lo que falta y, si es algo concreto (una respuesta, un hito, un final…), le da el foco. */
  protected async llevar(f: Falta): Promise<void> {
    if (f.ir.accionId) await this.guia.mostrar(f.ir.accionId, 'foco');
    const destino = this.rutas.a(f.ir.ruta);
    if (this.router.url.split('?')[0] !== destino) await this.router.navigateByUrl(destino);
    // La lista de verificación vive en el Inspector: si estaba oculto, se muestra para poder llegar a ella.
    if (f.ir.ancla === 'lista-verificacion') this.estudio?.alternar('inspector', true);
    if (f.ir.ancla) await this.enfocar(f.ir.ancla);
  }

  /** ↑/↓ entre las filas de problemas (como en el panel de un IDE); Inicio/Fin a la primera y a la última. */
  protected moverEntreFilas(e: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const actual = e.target as HTMLElement | null;
    if (!actual?.classList.contains('fila-problema')) return;
    const filas = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.fila-problema')];
    const i = filas.indexOf(actual);
    const destino = e.key === 'Home' ? 0 : e.key === 'End' ? filas.length - 1 : i + (e.key === 'ArrowDown' ? 1 : -1);
    if (destino < 0 || destino >= filas.length) return;
    e.preventDefault();
    filas[destino].focus();
  }

  /** Espera a que la pantalla de destino dibuje el elemento (hasta ~1,5 s) y le pasa el foco. */
  private async enfocar(id: string): Promise<void> {
    for (let intento = 0; intento < 60; intento++) {
      const el = document.getElementById(id);
      if (el) {
        if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
        el.scrollIntoView?.({ block: 'center' });
        el.focus();
        return;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  protected async enviar(): Promise<void> {
    if (!this.puedeEnviarAhora()) return;
    this.enviando.set(true);
    this.falloEnvio.set(null);
    try {
      const ciclo = await this.store.enviarARevision(this.mensaje());
      this.ciclo.set(ciclo);
      this.anuncio.set('El caso está en revisión de Psicología.');
    } catch (error) {
      const bloqueos = error instanceof HttpErrorResponse ? this.bloqueosDe(error) : null;
      if (bloqueos) {
        this.bloqueosDelEnvio.set(bloqueos);
        this.falloEnvio.set('Psicología no puede recibir el caso todavía: resuelve lo de arriba.');
      } else {
        this.falloEnvio.set(this.store.conflicto() ? OTRA_PERSONA_CAMBIO_EL_CASO : NO_SE_PUDO_ENVIAR);
      }
    } finally {
      this.enviando.set(false);
    }
  }

  /** Los bloqueos que trae el rechazo de la compuerta (cada bloqueo y, dentro, sus hallazgos), como hallazgos. */
  private bloqueosDe(error: HttpErrorResponse): ValidationIssue[] | null {
    const bloqueos = (error.error as { blockers?: Array<{ code: string; message: string; issues?: ValidationIssue[] }> } | null)?.blockers;
    if (error.status !== 409 || !Array.isArray(bloqueos)) return null;
    return bloqueos.flatMap((b) => (b.issues?.length ? b.issues : [{ code: b.code, severity: 'error' as const, message: b.message }]));
  }
}
