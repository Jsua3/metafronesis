import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
  ChangeDetectionStrategy
} from '@angular/core';
import { Particle, frameScale, stepParticles } from './particle-field.util';

type ParticleDensity = 'low' | 'medium' | 'high';

@Component({
  selector: 'app-siep-particle-layer',
  standalone: true,
  template: `<canvas #canvas class="siep-particle-layer__canvas" aria-hidden="true"></canvas>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: block;
      overflow: hidden;
      pointer-events: none;
      z-index: 0;
    }

    .siep-particle-layer__canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
  `,
})
export class SiepParticleLayerComponent implements AfterViewInit, OnDestroy {
  @Input() density: ParticleDensity = 'medium';
  @Input() interactive = false;
  @Input() mode: 'background' | 'foreground' = 'background';

  /**
   * Pausa pedida por la página (plan visual F4-4, H-22, VD-25; WCAG 2.2.2: lo que se mueve más de 5 s se puede
   * pausar): detiene el bucle y deja el último cuadro quieto.
   */
  @Input() set paused(value: boolean) {
    this.isPaused = value;
    this.applyMotion();
  }

  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private frameId = 0;
  private lastFrameAt: number | null = null;
  /** Tamaño del host en px CSS; se lee solo al redimensionar, nunca por cuadro. */
  private width = 0;
  private height = 0;
  private visible = true;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private mouseX = -1000;
  private mouseY = -1000;
  private reducedMotion = false;
  private isPaused = false;
  private motionQuery: MediaQueryList | null = null;
  private boundPointerMove = (event: PointerEvent) => this.onPointerMove(event);
  /** La preferencia de movimiento reducido se sigue en vivo (sin recargar): con `reduce`, quieta. */
  private readonly onMotionChange = (event: { matches: boolean }) => {
    this.reducedMotion = event.matches;
    this.applyMotion();
  };

  ngAfterViewInit(): void {
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.motionQuery.matches;
    this.motionQuery.addEventListener('change', this.onMotionChange);
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) {
      return;
    }

    // Observadores y puntero fuera de la zona: ninguno cambia estado de Angular.
    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host.nativeElement);

      if (typeof IntersectionObserver !== 'undefined') {
        this.intersectionObserver = new IntersectionObserver(([entry]) => {
          this.visible = entry?.isIntersecting ?? true;
          if (this.visible) {
            this.start();
          } else {
            this.stop();
          }
        });
        this.intersectionObserver.observe(this.host.nativeElement);
      }

      if (this.interactive && !this.reducedMotion) {
        this.host.nativeElement.closest('.landing-hero')?.addEventListener('pointermove', this.boundPointerMove);
      }
    });
    this.resize();
    this.applyMotion();
  }

  ngOnDestroy(): void {
    this.stop();
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.host.nativeElement.closest('.landing-hero')?.removeEventListener('pointermove', this.boundPointerMove);
  }

  private particleCount(): number {
    const area = this.width * this.height;
    const densityFactor = this.density === 'low' ? 0.00004 : this.density === 'high' ? 0.0001 : 0.00007;
    return Math.max(18, Math.min(90, Math.round(area * densityFactor)));
  }

  private resize(): void {
    const canvas = this.canvasRef.nativeElement;
    const { clientWidth, clientHeight } = this.host.nativeElement;
    this.width = clientWidth;
    this.height = clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
    canvas.style.width = `${clientWidth}px`;
    canvas.style.height = `${clientHeight}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seedParticles();
    if (this.reducedMotion || this.isPaused) {
      this.drawStatic();
    }
  }

  /** Anima salvo con movimiento reducido o en pausa; entonces, último cuadro quieto. */
  private applyMotion(): void {
    if (!this.ctx) {
      return;
    }
    if (this.reducedMotion || this.isPaused) {
      this.stop();
      this.drawStatic();
    } else {
      this.start();
    }
  }

  private seedParticles(): void {
    const count = this.particleCount();
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      radius: 1 + Math.random() * 2.2,
      alpha: 0.18 + Math.random() * 0.42,
    }));
  }

  private onPointerMove(event: PointerEvent): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.mouseX = event.clientX - rect.left;
    this.mouseY = event.clientY - rect.top;
  }

  private start(): void {
    if (this.frameId || this.reducedMotion || this.isPaused || !this.visible || !this.ctx) {
      return;
    }
    // Sin delta previo: el primer cuadro tras reanudar avanza uno de referencia, sin salto.
    this.lastFrameAt = null;
    this.zone.runOutsideAngular(() => {
      this.frameId = requestAnimationFrame(now => this.frame(now));
    });
  }

  private stop(): void {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  private frame(now: number): void {
    const scale = this.lastFrameAt === null ? 1 : frameScale(now - this.lastFrameAt);
    this.lastFrameAt = now;
    const pointer = this.interactive ? { x: this.mouseX, y: this.mouseY } : null;
    stepParticles(this.particles, scale, { width: this.width, height: this.height }, pointer);
    this.draw();
    this.frameId = requestAnimationFrame(next => this.frame(next));
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, this.width, this.height);

    for (const particle of this.particles) {
      ctx.beginPath();
      ctx.fillStyle = this.mode === 'foreground'
        ? `rgba(196, 181, 253, ${particle.alpha})`
        : `rgba(167, 139, 250, ${particle.alpha})`;
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawStatic(): void {
    this.draw();
  }
}
