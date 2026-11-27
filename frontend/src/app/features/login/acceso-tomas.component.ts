import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, signal, viewChildren } from '@angular/core';
import { reducedMotionQuery } from '../../core/a11y/reduced-motion';
import { UiButton } from '../../shared/ui/button/ui-button';
import { LOGIN_TOMAS, LoginToma } from './login-tomas.config';

type Conexion = EventTarget & { saveData?: boolean; effectiveType?: string };

/** Lo que tarda, como máximo, en entrar una toma cuyo primer cuadro no llega: entra con su póster. */
const ESPERA_DEL_CUADRO_MS = 2500;
/** Cuánto sigue debajo la toma que sale, una vez que la nueva empezó a aparecer (más que el fundido). */
const FUNDIDO_MS = 800;

/**
 * La ventana del acceso: tomas reales del simulador que se turnan con un fundido. Se graban con
 * `scripts/cinematicas-acceso` y sus datos están en `login-tomas.config.ts`.
 *
 * - Nada frena el acceso: al pintar solo existe el póster de la primera toma; los videos nacen con el navegador libre y
 *   la ventana a la vista, y solo para la toma activa y la siguiente.
 * - El fundido espera el primer cuadro de la que entra, para que no se vea saltar del póster al comienzo del video.
 * - Reproduce solo si nadie la pausó, la pestaña y la ventana se ven y no se está escribiendo (`detenido`).
 * - Con movimiento reducido, ahorro de datos o una conexión lenta quedan los pósteres, que se eligen a mano.
 *
 * La cámara y el resalte de la rúbrica de la versión anterior se retiraron: eran adornos sobre una imagen y sobre el juego
 * en movimiento taparían la escena y fingirían una interfaz que el juego no tiene.
 */
@Component({
  selector: 'app-acceso-tomas', standalone: true, imports: [UiButton],
  templateUrl: './acceso-tomas.component.html', styleUrl: './acceso-tomas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccesoTomasComponent {
  readonly detenido = input(false);
  readonly tomaActiva = output<LoginToma>();
  protected readonly tomas = LOGIN_TOMAS;
  protected readonly indice = signal(0);
  protected readonly pausado = signal(false);
  protected readonly bloqueado = signal(false);
  protected readonly soloPoster = signal(false);
  protected readonly listo = signal(false);
  protected readonly visible = signal(false);
  private readonly iniciado = signal(false);
  protected readonly saliente = signal<number | null>(null);
  /** Videos que ya tienen un cuadro que mostrar. */
  protected readonly conCuadro = signal<ReadonlySet<number>>(new Set());
  /** La toma que se esperó demasiado: entra aunque solo tenga póster. */
  private readonly sinEsperar = signal<number | null>(null);
  protected readonly avance = signal(0);
  private readonly videos = viewChildren<ElementRef<HTMLVideoElement>>('clip');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroy = inject(DestroyRef);
  private readonly motion = reducedMotionQuery();
  private readonly data = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-data: reduce)') : null;
  private readonly conexion = (navigator as Navigator & { connection?: Conexion }).connection;
  private fallido = false;
  private temporizador?: ReturnType<typeof setTimeout>;
  private idle?: number;
  private fundido?: ReturnType<typeof setTimeout>;
  private espera?: ReturnType<typeof setTimeout>;
  private readonly oculto = signal(document.hidden);

  constructor() {
    const actualizarPreferencias = () => {
      const c = this.conexion;
      const poster = this.fallido || !!this.motion?.matches || !!this.data?.matches || !!c?.saveData || ['slow-2g', '2g', '3g'].includes(c?.effectiveType ?? '');
      this.soloPoster.set(poster);
      if (poster) this.iniciado.set(false);
    };
    const visibilidad = () => this.oculto.set(document.hidden);
    actualizarPreferencias();
    this.motion?.addEventListener?.('change', actualizarPreferencias);
    this.data?.addEventListener?.('change', actualizarPreferencias);
    this.conexion?.addEventListener('change', actualizarPreferencias);
    document.addEventListener('visibilitychange', visibilidad);
    let observer: IntersectionObserver | undefined;
    afterNextRender(() => {
      if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver(entries => this.visible.set(entries.some(e => e.isIntersecting && e.intersectionRatio >= 0.25)), { threshold: 0.25 });
        observer.observe(this.host.nativeElement);
      } else {
        // Sin observador no se puede comprobar que la ventana esté en pantalla.
        this.fallido = true;
        this.soloPoster.set(true);
      }
      const iniciar = () => { if (!this.destroy.destroyed) this.listo.set(true); };
      if ('requestIdleCallback' in window) this.idle = window.requestIdleCallback(iniciar, { timeout: 2000 });
      else this.temporizador = setTimeout(iniciar, 0);
    });
    effect(() => {
      if (this.listo() && this.visible() && !this.soloPoster()) this.iniciado.set(true);
    });
    effect(() => {
      const videos = this.videos();
      const actual = this.indice();
      const reproducir = this.listo() && this.visible() && !this.oculto() && !this.detenido() && !this.pausado() && !this.bloqueado() && !this.soloPoster();
      for (const ref of videos) {
        const video = ref.nativeElement;
        video.muted = true;
        video.defaultMuted = true;
        if (Number(video.dataset['indice']) !== actual || !reproducir) {
          video.pause();
          continue;
        }
        this.reproducir(video, actual);
      }
    });
    this.destroy.onDestroy(() => {
      observer?.disconnect();
      this.motion?.removeEventListener?.('change', actualizarPreferencias);
      this.data?.removeEventListener?.('change', actualizarPreferencias);
      this.conexion?.removeEventListener('change', actualizarPreferencias);
      document.removeEventListener('visibilitychange', visibilidad);
      if (this.temporizador) clearTimeout(this.temporizador);
      if (this.fundido) clearTimeout(this.fundido);
      if (this.espera) clearTimeout(this.espera);
      if (this.idle !== undefined) window.cancelIdleCallback?.(this.idle);
    });
  }

  private reproducir(video: HTMLVideoElement, indice: number): void {
    video.play()?.catch((error: DOMException) => {
      if (this.destroy.destroyed || error.name === 'AbortError' || indice !== this.indice()) return;
      if (error.name === 'NotAllowedError') {
        this.bloqueado.set(true);
      }
    });
  }

  protected tieneVideo(i: number): boolean {
    return this.iniciado() && !this.soloPoster() && (i === this.indice() || i === this.siguiente() || i === this.saliente());
  }
  /** El póster se pide solo cuando se va a ver (con videos, también el de la siguiente). */
  protected tienePoster(i: number): boolean {
    return i === this.indice() || i === this.saliente() || (this.iniciado() && i === this.siguiente());
  }
  /** La capa activa entra cuando su video tiene un cuadro; mientras tanto sigue a la vista la que sale. */
  protected entra(i: number): boolean {
    if (i !== this.indice()) return false;
    return this.saliente() === null || !this.tieneVideo(i) || this.bloqueado() || this.conCuadro().has(i) || this.sinEsperar() === i;
  }
  private siguiente(): number {
    return (this.indice() + 1) % this.tomas.length;
  }
  protected elegir(i: number): void {
    const anterior = this.indice();
    const video = this.videos().find(ref => Number(ref.nativeElement.dataset['indice']) === i)?.nativeElement;
    if (video) video.currentTime = 0;
    this.avance.set(0);
    if (i !== anterior) {
      if (this.fundido) clearTimeout(this.fundido);
      if (this.espera) clearTimeout(this.espera);
      this.sinEsperar.set(null);
      this.saliente.set(anterior);
      this.indice.set(i);
      this.podar();
      this.tomaActiva.emit(this.tomas[i]);
      if (this.entra(i)) this.retirarSaliente();
      else this.espera = setTimeout(() => { this.sinEsperar.set(i); this.retirarSaliente(); }, ESPERA_DEL_CUADRO_MS);
    } else if (video && !this.pausado() && !this.bloqueado() && !this.soloPoster() && !this.detenido() && !this.oculto() && this.visible()) {
      this.reproducir(video, i);
    }
  }
  protected alternar(): void {
    if (!this.bloqueado()) {
      this.pausado.update(valor => !valor);
      return;
    }
    this.bloqueado.set(false);
    this.pausado.set(false);
    // Dentro del mismo clic: es el gesto que algunos navegadores piden para reproducir.
    const video = this.videos().find(ref => Number(ref.nativeElement.dataset['indice']) === this.indice())?.nativeElement;
    if (video) this.reproducir(video, this.indice());
  }
  protected terminado(i: number): void {
    if (i === this.indice() && !this.pausado() && !this.detenido() && !this.oculto() && this.visible() && !this.soloPoster()) this.elegir((i + 1) % this.tomas.length);
  }
  protected progreso(video: HTMLVideoElement, i: number): void {
    if (i === this.indice() && Number.isFinite(video.duration) && video.duration > 0) this.avance.set(Math.min(1, video.currentTime / video.duration));
  }
  protected listaParaVerse(i: number): void {
    if (this.conCuadro().has(i)) return;
    this.conCuadro.update(set => new Set(set).add(i));
    if (i === this.indice() && this.saliente() !== null) this.retirarSaliente();
  }
  private retirarSaliente(): void {
    if (this.espera) clearTimeout(this.espera);
    if (this.fundido) clearTimeout(this.fundido);
    this.fundido = setTimeout(() => {
      if (this.destroy.destroyed) return;
      this.saliente.set(null);
      this.podar();
    }, FUNDIDO_MS);
  }
  /** Olvida los cuadros de los videos que se desmontan: al volver, esperan otra vez el suyo. */
  private podar(): void {
    this.conCuadro.update(set => new Set([...set].filter(i => this.tieneVideo(i))));
  }
  protected fallo(video: HTMLVideoElement, i: number): void {
    if (video.dataset['mp4'] !== 'true') {
      video.dataset['mp4'] = 'true';
      video.src = `assets/login/tomas/${this.tomas[i].id}.mp4`;
      video.load();
      if (i === this.indice() && !this.pausado() && !this.bloqueado() && !this.detenido() && this.visible() && !this.oculto()) this.reproducir(video, i);
    } else {
      this.fallido = true;
      this.soloPoster.set(true);
    }
  }
}
