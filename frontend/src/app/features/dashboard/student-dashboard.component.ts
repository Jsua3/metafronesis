import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { CaseAccessCache } from '../../core/api/case-access.cache';
import { InvitationsApi } from '../../core/api/invitations.api';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogItem, StudentAttemptSummary } from '../../core/models/simulation.model';
import { NavBadgesService } from '../../shared/layout/nav-badges.service';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { plural } from '../../shared/ui/labels';
import { UiPortadaCaso } from '../../shared/ui/portada-caso/ui-portada-caso';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { EstadoCaso, estadoCaso, ultimoRecorrido } from '../simulator/estado-caso.util';
import { INICIO_COPY } from './inicio-copy';
import { formatDate, lastClosings, siguientePaso } from './student-dashboard.util';

/** Cuántos casos caben en «Tus casos» antes de mandar a la biblioteca completa. */
const MAX_FILAS = 6;

/**
 * Por debajo de este ancho la portada héroe no cabe: su puerta va a ×2 (148 px de alto) y pide unos 340 px de portada;
 * en un teléfono de 390 px la tarjeta deja ~318 y la puerta se cortaba arriba. Ahí se pinta en tamaño «tarjeta» (puerta
 * ×1, nítida y entera) a todo el ancho de la tarjeta.
 */
const CONSULTA_ESTRECHA = '(max-width: 28rem)';

/** Una fila de «Tus casos»: el caso, su estado en palabras y adónde lleva (`null`: bloqueado, no lleva a ningún lado). */
interface FilaCaso {
  caso: CatalogItem;
  estado: EstadoCaso;
  meta: string;
  destino: unknown[] | null;
  queryParams: Record<string, string> | null;
}

/**
 * Inicio del estudiante (DISENO §4.1, DP-14): responde una sola pregunta, «¿qué sigo?». Hay UN protagonista, el siguiente
 * paso, con una sola acción primaria; debajo, sus casos en palabras (sin porcentajes ni cifras) y sus últimos cierres.
 * Las tarjetas de cifras, «Tu evolución» y la tabla de intentos se fueron: el historial completo vive en Casos.
 *
 * El acceso (catálogo + historial) sale de `CaseAccessCache` si está fresco, para que la guarda de la entrada al juego no
 * vuelva a pedirlo. La caché solo pinta antes; nada destructivo se decide con ella.
 */
@Component({
  selector: 'app-student-dashboard',
  imports: [NgTemplateOutlet, RouterLink, UiBadge, UiButton, UiCabeceraIlustrada, UiCard, UiPortadaCaso, UiSection, UiSkeleton, UiErrorState, UiEmptyState],
  templateUrl: './student-dashboard.component.html',
  styleUrl: './student-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentDashboardComponent {
  private readonly api = inject(SimulationService);
  private readonly cache = inject(CaseAccessCache);
  private readonly auth = inject(AuthService);
  private readonly invitations = inject(InvitationsApi);
  private readonly badges = inject(NavBadgesService);
  private readonly router = inject(Router);

  protected readonly copy = INICIO_COPY;
  protected readonly casos = signal<CatalogItem[]>([]);
  protected readonly historial = signal<StudentAttemptSummary[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal(false);
  protected readonly pendientes = signal(0);
  /** El título de la escena donde se retoma (solo con un intento abierto); `null` mientras no se sabe. */
  protected readonly escena = signal<string | null>(null);
  /** La portada del protagonista en tamaño compacto (teléfono estrecho). Observer sobre la consulta de medios. */
  protected readonly portadaCompacta = signal(false);

  protected readonly siguiente = computed(() => siguientePaso(this.casos(), this.historial()));
  protected readonly estadoDelPaso = computed(() => {
    const paso = this.siguiente();
    return paso ? estadoCaso(paso.caso, this.historial(), this.casos()) : null;
  });
  protected readonly saludo = computed(() => {
    const nombre = this.auth.currentUser()?.nombre?.trim().split(/\s+/)[0];
    return nombre ? `Hola, ${nombre}` : this.copy.tituloSinNombre;
  });
  protected readonly descripcion = computed(() => {
    if (this.cargando() || this.error()) return null;
    const paso = this.siguiente();
    return this.copy.descripcion[paso ? paso.tipo : 'vacio'];
  });
  /** La línea bajo el título del protagonista: dónde se retoma, cuántas escenas tiene o por qué todavía no abre. */
  protected readonly contexto = computed(() => {
    const paso = this.siguiente();
    const estado = this.estadoDelPaso();
    if (!paso || !estado) return '';
    switch (paso.tipo) {
      case 'continuar':
        return this.escena() ? `Retomas en ${this.escena()}.` : this.copy.paso.retomasSinEscena;
      case 'ficha':
        return paso.caso.escenas ? `${estado.etiqueta} · ${plural(paso.caso.escenas, 'escena')}` : estado.etiqueta;
      case 'espera':
        return estado.detalle ? `${estado.etiqueta}. ${estado.detalle}` : estado.etiqueta;
      case 'terminado':
        return `Terminaste «${paso.caso.title}».`;
    }
  });
  /** Lo que viaja con la navegación para que el umbral del juego pinte desde el primer cuadro (DP-10). */
  protected readonly umbral = computed(() => {
    const paso = this.siguiente();
    return paso ? { umbral: { titulo: paso.caso.title, portada: paso.caso.portada ?? null } } : undefined;
  });
  protected readonly filas = computed<FilaCaso[]>(() => {
    const paso = this.siguiente();
    const ordenados = [...this.casos()].sort((a, b) => a.order - b.order);
    // El caso del «Siguiente paso» no se repite en la lista (con todo terminado el protagonista es el último caso).
    return ordenados
      .filter(caso => !paso || caso.caseVersionId !== paso.caso.caseVersionId)
      .map(caso => this.fila(caso, ordenados));
  });
  protected readonly filasVisibles = computed(() => this.filas().slice(0, MAX_FILAS));
  protected readonly cierres = computed(() => lastClosings(this.historial()));
  protected readonly progresoIntentos = computed(() => {
    const intentos = this.historial();
    const terminados = intentos.filter(intento => intento.status === 'COMPLETED').length;
    return `${terminados} de ${intentos.length} intentos completados`;
  });
  protected readonly invitacionTitulo = computed(() => (this.pendientes() === 1 ? this.copy.invitaciones.uno : this.copy.invitaciones.varias(this.pendientes())));
  protected readonly fecha = formatDate;

  constructor() {
    this.observarAncho();
    this.cargar();
    this.invitations.list().subscribe({
      next: lista => {
        const n = lista.filter(invitacion => invitacion.status === 'INVITED').length;
        this.pendientes.set(n);
        this.badges.fijar('invitaciones', n);
      },
      // Sin las invitaciones Inicio sigue sirviendo: solo no avisa de ellas.
      error: () => undefined,
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.error.set(false);
    const previo = this.cache.acceso();
    if (previo) {
      this.recibir(previo.catalogo, previo.historial);
      return;
    }
    forkJoin({ catalogo: this.api.getCatalog(), historial: this.api.attemptHistory() })
      .pipe(this.cache.guardandoAcceso())
      .subscribe({
        next: datos => this.recibir(datos.catalogo, datos.historial),
        error: () => {
          this.error.set(true);
          this.cargando.set(false);
        },
      });
  }

  private observarAncho(): void {
    if (typeof matchMedia !== 'function') return;
    const consulta = matchMedia(CONSULTA_ESTRECHA);
    this.portadaCompacta.set(consulta.matches);
    const alCambiar = (evento: MediaQueryListEvent): void => this.portadaCompacta.set(evento.matches);
    consulta.addEventListener?.('change', alCambiar);
    inject(DestroyRef).onDestroy(() => consulta.removeEventListener?.('change', alCambiar));
  }

  protected abrirInvitaciones(): void {
    void this.router.navigate(['/portal/invitaciones']);
  }

  private recibir(catalogo: CatalogItem[], historial: StudentAttemptSummary[]): void {
    this.casos.set(catalogo);
    this.historial.set(historial);
    this.cargando.set(false);
    this.cargarEscena();
  }

  /** Solo para el caso en curso: la escena donde se retoma. Si falla, la línea queda genérica; nada se rompe. */
  private cargarEscena(): void {
    const paso = this.siguiente();
    if (paso?.tipo !== 'continuar') {
      this.escena.set(null);
      return;
    }
    const id = paso.caso.caseVersionId;
    const guardado = this.cache.intentoAbierto(id);
    if (guardado !== undefined) {
      this.escena.set(guardado?.currentNode.title ?? null);
      return;
    }
    this.api.getActiveAttempt(id).pipe(this.cache.guardandoIntentoAbierto(id)).subscribe({
      next: intento => this.escena.set(intento?.currentNode.title ?? null),
      error: () => this.escena.set(null),
    });
  }

  private fila(caso: CatalogItem, catalogo: readonly CatalogItem[]): FilaCaso {
    const estado = estadoCaso(caso, this.historial(), catalogo);
    const meta = estado.detalle ?? (caso.escenas ? plural(caso.escenas, 'escena') : '');
    const id = caso.caseVersionId;
    if (estado.clave === 'en-curso' || estado.clave === 'en-pausa') {
      return { caso, estado, meta, destino: ['/portal/simulador', id], queryParams: { intento: 'continuar' } };
    }
    if (estado.clave === 'terminado') {
      const recorrido = ultimoRecorrido(this.historial(), id);
      return { caso, estado, meta, destino: recorrido ? ['/portal/simulador', id, 'cierre', recorrido.attemptId] : null, queryParams: null };
    }
    if (estado.clave === 'sin-empezar') return { caso, estado, meta, destino: ['/portal/simulador', id, 'ficha'], queryParams: null };
    return { caso, estado, meta, destino: null, queryParams: null };
  }
}
