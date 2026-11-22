import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, inject, signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { APP_BRAND } from '../../core/config/brand.config';
import { TemaService } from '../../core/tema/tema.service';
import { PUBLIC_ANCHORS, PublicBarComponent } from '../../shared/layout/public-bar.component';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { MarcaComponent } from '../../shared/ui/marca/marca.component';
import { SiepParticleLayerComponent } from '../../shared/ui/siep-particle-layer.component';
import { DoodlesComponent } from '../../shared/ui/doodles/doodles.component';
import { ElencoComponent } from './elenco.component';
import { RielLetrasComponent, SeccionRiel } from './riel-letras.component';

interface TrainingCase {
  icon: string;
  title: string;
  text: string;
  tag: string;
  /** Solo hay un caso jugable hoy; los demás se anuncian como «Próximamente». */
  available: boolean;
}

interface WorkflowStep {
  step: string;
  icon: string;
  title: string;
  text: string;
  /** Clip del simulador real (assets/landing/video/<video>.webm|.mp4|.webp). */
  video: string;
}

interface RoleCard {
  icon: string;
  title: string;
  text: string;
  features: string[];
  /** Retratos del kit del simulador (32 × 32, se pintan a ×2): estudiantes del juego y NPC para docente y administración. */
  avatares: string[];
}

const RETRATO = (ruta: string) => `/assets/characters/kit/${ruta}/portrait-alegre.png`;

interface EthicsItem {
  icon: string;
  title: string;
  text: string;
}

/**
 * Portada de Metafrónesis (marca) y su simulador SIEP: acabado tipo iOS sobre la paleta del simulador, en modo claro u
 * oscuro (TemaService: sigue al sistema y se fija con el botón de la barra). La piel va en el contenedor de la página
 * (REGLA-010). «Cómo funciona» es un relato con scroll: el texto avanza con el scroll nativo y un escenario fijo muestra
 * el clip del simulador real de cada paso; los clips se cargan solo al acercarse y se pueden pausar (WCAG 2.2.2).
 * El contenido sigue siendo honesto: no presenta como jugables los casos futuros.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, MatIconModule, DoodlesComponent, ElencoComponent, MarcaComponent, PublicBarComponent, RielLetrasComponent, SiepParticleLayerComponent, UiBadge, UiButton],
  templateUrl: './landing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './landing.component.scss'
})
export class LandingComponent {
  readonly brand = APP_BRAND;
  /** Anclas de la barra pública: las secciones de esta página. */
  readonly anchors = PUBLIC_ANCHORS;
  /** Índice del riel de letras: las mismas secciones que la barra, numeradas. */
  readonly seccionesRiel: SeccionRiel[] = PUBLIC_ANCHORS.map((a, i) => ({ id: a.id, num: `0${i + 1}`, nombre: a.label }));

  /** Escena real de la vista previa, servida en WebP y con sus dimensiones nativas en el marcado. */
  readonly simulatorSceneSrc = '/assets/images/institution/escena-portada.webp';

  /** Partículas del héroe en pausa (H-22, VD-25). */
  readonly particlesPaused = signal(false);

  readonly caseInfo = [
    { icon: 'person', label: 'Rol', text: 'Psicólogo social en formación' },
    {
      icon: 'track_changes',
      label: 'Objetivo',
      text: 'Identificar riesgo, ruta de atención y decisión ética.'
    },
    { icon: 'description', label: 'Contexto', text: 'Entorno familiar con posible situación de riesgo.' }
  ];

  readonly heroDecisions = [
    { icon: 'shield', label: 'Activar ruta institucional' },
    { icon: 'forum', label: 'Solicitar más contexto' },
    { icon: 'edit_note', label: 'Registrar observación ética' }
  ];

  readonly trustItems = ['Entorno seguro', 'Aprendizaje ético', 'Evaluación formativa'];

  readonly trainingCases: TrainingCase[] = [
    {
      icon: 'home_work',
      title: 'Violencia basada en género',
      text: 'Evalúa señales de riesgo, activa rutas de protección y documenta decisiones con criterio ético y legal.',
      tag: 'Disponible · caso sensible',
      available: true
    },
    {
      icon: 'groups',
      title: 'Desplazamiento forzado',
      text: 'Analiza contexto comunitario, necesidades de apoyo y articulación con redes institucionales del territorio.',
      tag: 'Próximamente',
      available: false
    },
    {
      icon: 'diversity_3',
      title: 'Conflicto comunitario',
      text: 'Practica mediación psicosocial, lectura del conflicto y decisiones que respeten derechos y convivencia.',
      tag: 'Próximamente',
      available: false
    }
  ];

  readonly workflow: WorkflowStep[] = [
    {
      step: '1', icon: 'directions_walk', title: 'Entra al caso', video: 'caminar',
      text: 'Abres el caso asignado y recorres el lugar donde ocurre: las salas, las personas y lo que hay en ellas.'
    },
    {
      step: '2', icon: 'forum', title: 'Escucha a las personas', video: 'dialogo',
      text: 'Conversas con quienes viven la situación. Cada conversación aporta contexto y señales antes de intervenir.'
    },
    {
      step: '3', icon: 'account_tree', title: 'Decide con criterio', video: 'decision',
      text: 'Eliges entre opciones posibles, como en la práctica. Cada elección queda registrada en la trazabilidad.'
    },
    {
      step: '4', icon: 'bar_chart', title: 'Revisa el sentido de tus decisiones', video: 'retroalimentacion',
      text: 'Recibes retroalimentación formativa sobre lo que hiciste y por qué importa, con evaluación por rúbricas.'
    }
  ];

  // ── Tema ──────────────────────────────────────────────────────────────────────────────────────────
  protected readonly tema = inject(TemaService);

  // ── Relato con scroll ─────────────────────────────────────────────────────────────────────────────
  /** Paso visible del relato (0–3): lo fija el texto que cruza el centro de la vista. */
  readonly paso = signal(0);
  /** Los clips se piden solo cuando el relato está cerca (la portada no paga su peso al abrir). */
  readonly cargarVideos = signal(false);
  /** Movimiento reducido: los clips no arrancan solos; se ven con el botón. */
  readonly videosPausados = signal(
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /** El relato está en pantalla: solo entonces se pinta el modo ambiente. */
  private readonly relatoVisible = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);

    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    afterNextRender(() => {
      // Las secciones se buscan en el DOM ya pintado; si el relato aún no está, se reintenta en el siguiente cuadro.
      let intentos = 0;
      const intentar = () => {
        if (host.querySelector('.landing-relato') || intentos++ > 120 || typeof requestAnimationFrame !== 'function') iniciar();
        else requestAnimationFrame(intentar);
      };
      intentar();
    });

    const iniciar = () => {
      const relato = [...host.querySelectorAll<HTMLElement>('.landing-relato')];
      const pasos = [...host.querySelectorAll<HTMLElement>('.landing-relato__paso')];
      if (typeof IntersectionObserver !== 'function') {
        this.cargarVideos.set(true);
        this.relatoVisible.set(true);
        return;
      }
      const cerca = new IntersectionObserver(entradas => {
        if (entradas.some(e => e.isIntersecting)) {
          this.cargarVideos.set(true);
          cerca.disconnect();
        }
      }, { rootMargin: '600px 0px' });
      relato.forEach(r => cerca.observe(r));

      // El paso activo es el que cruza la franja central de la vista.
      const centro = new IntersectionObserver(entradas => {
        for (const e of entradas) {
          if (e.isIntersecting) this.paso.set(Number((e.target as HTMLElement).dataset['paso'] ?? 0));
        }
      }, { rootMargin: '-45% 0px -45% 0px' });
      pasos.forEach(p => centro.observe(p));

      const visible = new IntersectionObserver(entradas => {
        this.relatoVisible.set(entradas.some(e => e.isIntersecting));
      });
      relato.forEach(r => visible.observe(r));

      const lienzo = host.querySelector<HTMLCanvasElement>('.landing-relato__ambiente');
      const ctx = typeof requestAnimationFrame === 'function' ? lienzo?.getContext?.('2d') : null;
      if (lienzo && ctx) {
        this.ambiente = this.crearAmbiente(host, lienzo, ctx);
        this.ambiente.correr();
      }

      destroyRef.onDestroy(() => {
        cerca.disconnect();
        centro.disconnect();
        visible.disconnect();
        this.ambiente?.parar();
        this.ambiente = undefined;
      });
    };

    // Solo corre el clip del paso activo, y solo con el relato en pantalla; los demás quedan quietos. Va después del
    // render: los <video> nacen cuando cargarVideos pasa a true, y se buscan en el DOM ya pintado. Al final, el modo
    // ambiente se ajusta al nuevo estado (otro clip, pausa o fuera de la vista).
    afterRenderEffect(() => {
      const activo = this.paso();
      const pausados = this.videosPausados();
      const enVista = this.relatoVisible();
      if (!this.cargarVideos()) return;
      host.querySelectorAll<HTMLVideoElement>('.landing-relato__capa video').forEach((video, i) => {
        // Silenciado por propiedad: Angular crea el <video> desde código y el atributo `muted` no activa la propiedad, así
        // que Chrome y Brave bloqueaban el play() automático (en el navegador sin interfaz de las pruebas no se veía).
        video.muted = true;
        video.defaultMuted = true;
        if (i === activo && !pausados && enVista) {
          video.play?.()?.catch(() => undefined);
        } else {
          video.pause?.();
        }
      });
      this.ambiente?.correr();
    });
  }

  /** Pintor del modo ambiente (solo en un navegador con lienzo; en jsdom no existe). */
  private ambiente?: { correr: () => void; parar: () => void };

  /**
   * Modo ambiente: copia el cuadro del clip activo a un lienzo de dos tercios del ancho de la vista (entre 640 y 1280 px,
   * el tamaño del clip, en 16:9) para que el fondo se reconozca y solo se suavice: a un tercio, el navegador lo estiraba
   * más del triple y la interpolación lo deshacía en manchas aunque el filtro solo desenfocara unos pocos píxeles. Pinta a la cadencia del video (requestVideoFrameCallback,
   * que además calla cuando el clip no avanza; si no existe, requestAnimationFrame a ~30 fps). Con los clips en pausa o
   * movimiento reducido pinta un solo cuadro por cambio de paso: el del video si ya lo tiene, si no su póster. Fuera de
   * la vista no hace nada. Solo escribe en el lienzo (sin leer el diseño), así que no provoca reflujos por cuadro.
   */
  private crearAmbiente(host: HTMLElement, lienzo: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    const posters = new Map<string, HTMLImageElement>();
    let raf = 0;
    let rvfc = 0;
    let conRvfc: HTMLVideoElement | null = null;
    let ultimo = 0;

    const clipActivo = () => host.querySelectorAll<HTMLVideoElement>('.landing-relato__capa video')[this.paso()];
    const activo = () => this.relatoVisible() && this.cargarVideos();

    const poster = (video: HTMLVideoElement) => {
      const src = video.poster;
      if (!src) return null;
      let img = posters.get(src);
      if (!img) {
        img = new Image();
        img.decoding = 'async';
        // El póster llega después del primer intento: se pinta en cuanto está, si su clip sigue siendo el del fondo.
        img.onload = () => { if (activo() && clipActivo()?.poster === src) pintar(); };
        img.src = src;
        posters.set(src, img);
      }
      return img.complete && img.naturalWidth ? img : null;
    };

    const pintar = () => {
      const video = clipActivo();
      if (!video) return;
      // Un clip que nunca ha corrido (pausa o movimiento reducido) no siempre entrega su primer cuadro al lienzo: Chrome
      // lo deja en blanco hasta reproducirlo. Ahí va el póster, que es ese mismo cuadro.
      const sinCorrer = video.paused && video.played.length === 0;
      const fuente = (sinCorrer && poster(video)) || (video.readyState >= 2 ? video : null);
      if (!fuente) return;
      try {
        ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
      } catch {
        // Un cuadro que aún no se puede leer: se intenta en el siguiente.
      }
    };

    const medir = () => {
      const ancho = Math.round(Math.min(1280, Math.max(640, innerWidth * 2 / 3)));
      if (lienzo.width === ancho) return;
      // Cambiar el tamaño borra el lienzo: se repinta en seguida.
      lienzo.width = ancho;
      lienzo.height = Math.round(ancho * 9 / 16);
      ctx.imageSmoothingQuality = 'high';
      if (activo()) pintar();
    };
    // Reducir el pixel art de 1280 px a otra escala deja muaré si se toma el vecino más cercano: el suavizado alto lo evita.
    ctx.imageSmoothingQuality = 'high';

    const parar = () => {
      if (raf) cancelAnimationFrame(raf);
      if (rvfc && conRvfc) conRvfc.cancelVideoFrameCallback(rvfc);
      raf = rvfc = 0;
      conRvfc = null;
    };

    const correr = () => {
      parar();
      if (!activo()) return;
      pintar();
      const video = clipActivo();
      if (this.videosPausados() || !video) return;
      if (typeof video.requestVideoFrameCallback === 'function') {
        const alCuadro = () => { pintar(); rvfc = video.requestVideoFrameCallback(alCuadro); };
        conRvfc = video;
        rvfc = video.requestVideoFrameCallback(alCuadro);
      } else {
        const alCuadro = (t: number) => {
          if (t - ultimo >= 32) { ultimo = t; pintar(); }
          raf = requestAnimationFrame(alCuadro);
        };
        raf = requestAnimationFrame(alCuadro);
      }
    };

    medir();
    addEventListener('resize', medir, { passive: true });
    return {
      correr,
      parar: () => { parar(); removeEventListener('resize', medir); },
    };
  }

  alternarVideos(): void {
    this.videosPausados.update(v => !v);
  }

  /**
   * Un formato que el navegador eligió pero no logra decodificar deja el clip quieto en su primer cuadro sin pasar a la
   * fuente siguiente (eso solo lo hace con formatos que ni intenta). Aquí se pasa a mano, una vez por fuente.
   */
  alFallarClip(ev: Event, i: number): void {
    const video = ev.target as HTMLVideoElement;
    const fuentes = [...video.querySelectorAll('source')].map(s => s.src);
    const siguiente = fuentes[fuentes.indexOf(video.currentSrc) + 1];
    if (!siguiente) return;
    video.src = siguiente;
    video.load();
    if (i === this.paso() && !this.videosPausados()) video.play?.()?.catch(() => undefined);
  }

  readonly roles: RoleCard[] = [
    {
      icon: 'school',
      title: 'Estudiante',
      text: 'Practica intervención psicosocial en escenarios simulados y recibe retroalimentación formativa.',
      features: ['Simulaciones', 'Bitácora', 'Retroalimentación'],
      avatares: [RETRATO('camila/bata'), RETRATO('david/bata')]
    },
    {
      icon: 'supervisor_account',
      title: 'Profesor',
      text: 'Asigna casos, supervisa trazabilidad y evalúa el desempeño con rúbricas académicas.',
      features: ['Rúbricas', 'Evaluación', 'Seguimiento'],
      avatares: [RETRATO('docente-universidad')]
    },
    {
      icon: 'admin_panel_settings',
      title: 'Administrador',
      text: 'Gestiona usuarios, publica casos y configura el entorno académico del simulador.',
      features: ['Gestión', 'Trazabilidad', 'Reportes'],
      avatares: [RETRATO('funcionaria-recepcion')]
    }
  ];

  readonly ethicsItems: EthicsItem[] = [
    { icon: 'exit_to_app', title: 'Salida segura', text: 'Recursos institucionales en contenidos sensibles.' },
    { icon: 'record_voice_over', title: 'Lenguaje no estigmatizante', text: 'Comunicación centrada en derechos.' },
    { icon: 'lock', title: 'Confidencialidad', text: 'Bitácoras protegidas con fines formativos.' },
    { icon: 'route', title: 'Rutas institucionales', text: 'Orientación cuando el escenario lo requiera.' },
    { icon: 'grading', title: 'Evaluación formativa', text: 'Sin diagnósticos ni decisiones automáticas.' }
  ];
}
