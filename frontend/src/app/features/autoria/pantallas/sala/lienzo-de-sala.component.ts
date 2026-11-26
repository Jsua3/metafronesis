import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, InjectionToken, effect, inject, input, output, signal, viewChild,
} from '@angular/core';
import type Phaser from 'phaser';

import { actorDepth } from '../../../simulator/depth-sort.util';
import type { ManifiestoDePiezas, SalaPorPiezas } from '../../../simulator/sala/catalogo';
import type { PlanDeSala } from '../../../simulator/sala/composicion';
import type { EscenaDeSala } from '../../../simulator/sala/escena-de-sala';
import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { repartirActores, type ActorDelLienzo } from './lienzo-de-sala';

interface OpcionesDeJuego {
  contenedor: HTMLElement;
  sala: SalaPorPiezas;
  actores: ActorDelLienzo[];
  manifiesto: ManifiestoDePiezas;
  escala: 1 | 2;
  listo: (plan: PlanDeSala) => void;
  fallo: () => void;
}

interface JuegoDeSala { destruir(): void }
type FabricaDeJuego = (opciones: OpcionesDeJuego) => JuegoDeSala;

export const FABRICA_DE_JUEGO_DE_SALA = new InjectionToken<FabricaDeJuego>('Fábrica del juego de sala', {
  factory: () => crearJuegoDeSala,
});

function crearJuegoDeSala(op: OpcionesDeJuego): JuegoDeSala {
  let cancelado = false;
  let juego: Phaser.Game | undefined;
  let sala: EscenaDeSala | undefined;
  void Promise.all([import('phaser'), import('../../../simulator/sala/escena-de-sala')]).then(([modulo, motor]) => {
    if (cancelado) return;
    const Phaser = modulo.default;
    const plan = motor.EscenaDeSala.planear(op.sala, op.manifiesto);
    if (!plan) throw new Error('No se pudo planear la sala');
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    // Como en el juego: las piezas de la biblioteca las dibuja la escena (hoja, animación, brillo, luz propia, sombra).
    const { muebles, sprites } = repartirActores(op.actores, op.manifiesto);
    const escena: Phaser.Types.Scenes.SettingsConfig | Phaser.Types.Scenes.CreateSceneFromObjectConfig = {
      preload(this: Phaser.Scene) {
        motor.EscenaDeSala.pedirTexturas(this, plan);
        motor.EscenaDeSala.pedirMuebles(this, muebles);
        sprites.forEach((actor, i) => {
          const clave = `actor:${i}`;
          if (actor.cuadroAncho > 0 && actor.cuadroAlto > 0) {
            this.load.spritesheet(clave, actor.url, { frameWidth: actor.cuadroAncho, frameHeight: actor.cuadroAlto });
          } else this.load.image(clave, actor.url);
        });
      },
      create(this: Phaser.Scene) {
        try {
          if (motor.EscenaDeSala.estadoDeTexturas(plan, (clave) => this.textures.exists(clave), new Set()) !== 'listo'
              || sprites.some((_, i) => !this.textures.exists(`actor:${i}`))) throw new Error('Faltan texturas');
          const cuerpos = sprites.flatMap((actor, i) => {
            const sprite = this.add.sprite(actor.x, actor.y, `actor:${i}`, actor.fila * 4)
              .setOrigin(0.5, 1).setFlipX(actor.espejo).setDepth(actorDepth(actor.y));
            const cuerpo = motor.EscenaDeSala.cuerpoDeSprite(sprite, 0, 0);
            return cuerpo ? [cuerpo] : [];
          });
          sala = new motor.EscenaDeSala(this, op.sala, plan, op.manifiesto, { momento: plan.momento, reducido, cuerpos, muebles });
          op.listo(plan);
        } catch { op.fallo(); }
      },
      update(_tiempo: number, dt: number) { sala?.actualizar(dt, null); },
    };
    juego = new Phaser.Game({
      type: Phaser.WEBGL, parent: op.contenedor, width: plan.ancho, height: plan.alto,
      pixelArt: true, roundPixels: true, scene: escena,
      callbacks: { postBoot: (game) => {
        game.canvas.style.width = `${plan.ancho * op.escala}px`;
        game.canvas.style.height = `${plan.alto * op.escala}px`;
        // Encajada (`.escenario.encajada`) la hoja de estilos cambia `--render-pixeles` a `auto`: el lienzo la sigue sin `!important`.
        game.canvas.style.imageRendering = 'var(--render-pixeles, pixelated)';
      } },
    });
  }).catch(() => { if (!cancelado) op.fallo(); });
  return { destruir: () => { cancelado = true; sala?.destruir(); juego?.destroy(true); } };
}

@Component({
  selector: 'app-lienzo-de-sala',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-lienzo]': 'estado()', '[attr.data-version]': 'version()' },
  template: `
    <div #contenedor class="lienzo-contenedor"></div>
    @if (estado() === 'fallo') {
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <p role="status">No se pudo dibujar la sala. Puedes seguir moviendo las piezas.</p>
    }
  `,
  styles: [`.lienzo-contenedor { position: relative; }`],
})
export class LienzoDeSalaComponent {
  readonly sala = input.required<SalaPorPiezas>();
  readonly actores = input.required<ActorDelLienzo[]>();
  readonly escala = input<1 | 2>(1);
  readonly listo = output<{ plan: PlanDeSala }>();
  protected readonly estado = signal<'listo' | 'cargando' | 'fallo'>('cargando');
  protected readonly version = signal(0);
  private readonly contenedor = viewChild<ElementRef<HTMLElement>>('contenedor');
  private readonly catalogo = inject(CatalogoDePiezas);
  private readonly crear = inject(FABRICA_DE_JUEGO_DE_SALA);
  /**
   * Doble búfer: `juego` es la sala que se ve y `pendiente` la que se arma detrás (invisible) tras un cambio. Armar una sala
   * (WebGL, texturas, luz) tarda; si se destruyera la vieja antes, el lienzo quedaría en negro ese rato. La vieja se quita
   * solo cuando la nueva avisa `listo`. Cada una vive en su propia capa dentro de `contenedor`.
   */
  private juego?: { juego: JuegoDeSala; capa: HTMLElement };
  private pendiente?: { juego: JuegoDeSala; capa: HTMLElement };
  private temporizador?: ReturnType<typeof setTimeout>;
  private ultimoArmado = -Infinity;
  private generacion = 0;

  constructor() {
    effect(() => {
      const sala = this.sala(), actores = this.actores(), escala = this.escala();
      const manifiesto = this.catalogo.manifiesto(), error = this.catalogo.error();
      const contenedor = this.contenedor()?.nativeElement;
      if (!contenedor) return;
      clearTimeout(this.temporizador);
      const generacion = ++this.generacion;
      if (error || !manifiesto) {
        this.quitarTodo();
        this.estado.set(error ? 'fallo' : 'cargando');
        return;
      }
      this.estado.set('cargando');
      this.temporizador = setTimeout(() => {
        // Una carga que aún no terminó ya no sirve: la reemplaza esta. La sala que se ve se queda hasta que esta esté lista.
        this.quitar(this.pendiente);
        this.pendiente = undefined;
        this.ultimoArmado = Date.now();
        this.version.update((n) => n + 1);
        const capa = document.createElement('div');
        // Con una sala a la vista, la nueva se arma encima pero invisible y sin recibir el puntero.
        if (this.juego) Object.assign(capa.style, { position: 'absolute', inset: '0', opacity: '0', pointerEvents: 'none' });
        contenedor.appendChild(capa);
        // `crear` puede avisar `listo` o `fallo` antes de devolver el juego: `entrada` se completa al volver de `crear`.
        const entrada: { juego?: JuegoDeSala; capa: HTMLElement } = { capa };
        let temprano: { plan: PlanDeSala } | 'fallo' | null = null;
        const alListo = (plan: PlanDeSala) => {
          if (generacion !== this.generacion) return;
          if (!entrada.juego) { temprano = { plan }; return; }
          this.mostrar(entrada as { juego: JuegoDeSala; capa: HTMLElement });
          this.estado.set('listo');
          this.listo.emit({ plan });
        };
        const alFallo = () => {
          if (generacion !== this.generacion) return;
          if (!entrada.juego) { temprano = 'fallo'; return; }
          this.quitarTodo();
          this.estado.set('fallo');
        };
        try {
          entrada.juego = this.crear({ contenedor: capa, sala, actores, escala, manifiesto, listo: alListo, fallo: alFallo });
        } catch {
          capa.remove();
          this.quitarTodo();
          this.estado.set('fallo');
          return;
        }
        this.pendiente = entrada as { juego: JuegoDeSala; capa: HTMLElement };
        const aviso = temprano as { plan: PlanDeSala } | 'fallo' | null;
        if (aviso === 'fallo') alFallo();
        else if (aviso) alListo(aviso.plan);
      }, Math.max(0, 200 - (Date.now() - this.ultimoArmado)));
    });
    inject(DestroyRef).onDestroy(() => {
      ++this.generacion;
      clearTimeout(this.temporizador);
      this.quitarTodo();
    });
  }

  /** La sala pendiente ya está dibujada: pasa a verse y la que se veía se quita. */
  private mostrar(nueva: { juego: JuegoDeSala; capa: HTMLElement }): void {
    if (this.pendiente !== nueva) return;
    this.quitar(this.juego);
    this.juego = nueva;
    this.pendiente = undefined;
    nueva.capa.removeAttribute('style');
  }

  private quitar(cual?: { juego: JuegoDeSala; capa: HTMLElement }): void {
    if (!cual) return;
    cual.juego.destruir();
    cual.capa.remove();
  }

  private quitarTodo(): void {
    this.quitar(this.pendiente);
    this.quitar(this.juego);
    this.pendiente = undefined;
    this.juego = undefined;
  }
}
