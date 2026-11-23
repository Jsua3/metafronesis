import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { urlDePieza, type ImagenDeCatalogo } from '../../../simulator/sala/catalogo';
import { CasoStore } from '../../estado/caso.store';
import { CatalogoDePiezas, type CategoriaDePaleta } from '../../estado/catalogo-de-piezas';
import { primerHueco, proyectarAlSuelo } from '../../modelo/arrastre-en-muro';
import type { SalaCaso } from '../../modelo/caso';
import { largoMuro, zonaCaminable, type Muro } from '../../modelo/geometria';
import { anclaDeElemento, type FaltaDeSala } from '../../modelo/salas-a-documento';

/** Palabras de los identificadores de la biblioteca que se escriben con tilde o en mayúsculas. */
const PALABRAS: Readonly<Record<string, string>> = {
  adoquin: 'adoquín', zocalo: 'zócalo', comisaria: 'comisaría', habitacion: 'habitación', ninos: 'niños', nna: 'NNA',
  juridica: 'jurídica', orientacion: 'orientación', cafeteria: 'cafetería', enfermeria: 'enfermería', recepcion: 'recepción',
};
/** `casa-habitacion-ninos` → «Casa habitación niños»; una sola letra (`a`) → «A». */
export function legible(id: string): string {
  const texto = id.split('-').map(p => PALABRAS[p] ?? p).join(' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Qué parte del panel se pinta: la sala lo reparte en sus pestañas «Agregar», «Detalles» (la puerta) y «Apariencia». */
export type ParteDelPanel = 'todo' | 'agregar' | 'puerta' | 'apariencia';

/** Una muestra de acabado: su valor, su nombre en palabras y el recorte de arte real que la dibuja. */
interface Muestra { valor: string; nombre: string; arte: string | null }
/** La miniatura de una pieza del catálogo: el primer cuadro de su hoja, reducido a la caja de 40 px. */
interface Miniatura { url: string; ancho: number; alto: number; hoja: number }

/** Lado de la caja de las miniaturas de pieza (px de pantalla). */
const CAJA_MINIATURA = 40;
let siguientePanel = 0;

/**
 * Panel de la sala por piezas (EDITOR.md §4.4). Patrón Composite: la sala monta una instancia por pestaña con `parte`
 * («agregar», «puerta» o «apariencia»); sin `parte`, el panel entero, como antes. La apariencia se elige con MUESTRAS
 * (botones de opción con un recorte real del piso o del muro de la biblioteca), no con listas de texto: la docente ve el
 * acabado antes de elegirlo. Las reglas (solo variantes y paletas que existen, todo se deshace) no cambian.
 */
@Component({
  selector: 'app-panel-de-estructura',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-parte]': 'parte()' },
  template: `
    @if (muestra('agregar')) {
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <div role="tablist" aria-label="Piezas de la sala" class="categorias" (keydown)="tecla($event)">
        @for (categoria of catalogo.paleta(); track categoria.clave; let i = $index) {
          <button type="button" role="tab" class="categoria" [attr.aria-selected]="indice() === i" [attr.tabindex]="indice() === i ? 0 : -1"
            [attr.aria-controls]="uid + '-modelos'" (click)="indice.set(i)">{{ categoria.nombre }}</button>
        }
      </div>
      @if (catalogo.paleta()[indice()]; as categoria) {
        <div role="tabpanel" class="modelos" [id]="uid + '-modelos'" [attr.aria-label]="categoria.nombre">
          @for (modelo of categoria.modelos; track modelo.tipo + modelo.modelo) {
            <button type="button" class="modelo" [attr.data-modelo]="modelo.modelo" (click)="agregar(modelo)">
              <span class="modelo__caja" aria-hidden="true">
                @if (miniatura(modelo); as m) {
                  <span class="modelo__cuadro" [style.width.px]="m.ancho" [style.height.px]="m.alto">
                    <img [src]="m.url" alt="" [style.width.px]="m.hoja" [style.height.px]="m.alto" loading="lazy" draggable="false" />
                  </span>
                } @else {
                  <span class="modelo__mas">+</span>
                }
              </span>
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <span class="modelo__nombre"><span class="solo-lector">Agregar </span>{{ modelo.nombre }}</span>
            </button>
          }
          @if (categoria.clave === 'objetos') { <div class="proyectado"><ng-content /></div> }
        </div>
      }
    }
    @if (muestra('puerta')) {
      @if (puerta(); as puerta) {
        <div class="puerta">
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <label class="campo-con-rotulo">Destino <select class="campo" (change)="destino(puerta.id, $any($event.target).value)">
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <option value="" [selected]="!puerta.hacia">Elige una sala</option>
            @for (destino of store.caso()?.salas ?? []; track destino.id) {
              <option [value]="destino.id" [selected]="destino.id === puerta.hacia">{{ destino.nombre }}</option>
            }
          </select></label>
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <label class="campo-con-rotulo">Modelo <select class="campo" (change)="modeloPuerta(puerta.id, $any($event.target).value)">
            @for (modelo of modelosPuerta(); track modelo.modelo) { <option [value]="modelo.modelo" [selected]="modelo.modelo === puerta.modelo">{{ modelo.nombre }}</option> }
          </select></label>
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <label class="casilla"><input type="checkbox" [checked]="puerta.sentidoUnico ?? false"
            (change)="sentido(puerta.id, $any($event.target).checked)" /> Una sola dirección</label>
          @if (faltaRegreso(puerta.id)) {
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <button type="button" class="boton" (click)="regreso(puerta.id)">Crear la puerta de regreso</button>
          }
        </div>
      }
    }
    @if (muestra('apariencia')) {
      @if (sala().estructura; as estructura) {
        <div class="apariencia">
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <ng-container *ngTemplateOutlet="grupo; context: { id: 'piso', rotulo: 'Piso', muestras: muestrasPiso(),
            actual: estructura.acabados.piso }" />
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <ng-container *ngTemplateOutlet="grupo; context: { id: 'variante', rotulo: 'Variante del piso', muestras: muestrasVariante(),
            actual: estructura.acabados.variante }" />
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <ng-container *ngTemplateOutlet="grupo; context: { id: 'muro', rotulo: 'Acabado de muro', muestras: muestrasMuro(),
            actual: estructura.acabados.muro }" />
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <ng-container *ngTemplateOutlet="grupo; context: { id: 'paleta', rotulo: 'Paleta', muestras: muestrasPaleta(),
            actual: estructura.acabados.paleta }" />
          <div class="grupo">
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <span class="grupo__rotulo" [id]="uid + '-momento'">Momento del día</span>
            <div role="radiogroup" class="momentos" [attr.aria-labelledby]="uid + '-momento'" (keydown)="flechas($event)">
              @for (m of momentos; track m.valor) {
                <button type="button" role="radio" class="momento" [class.momento--noche]="m.valor === 'noche'"
                  [attr.data-momento]="m.valor" [attr.aria-checked]="(estructura.momento ?? 'dia') === m.valor"
                  [attr.tabindex]="(estructura.momento ?? 'dia') === m.valor ? 0 : -1" (click)="fijarMomento(m.valor)">
                  <span class="momento__vista" aria-hidden="true">
                    @if (arteDelPiso(); as arte) { <img [src]="arte" alt="" loading="lazy" draggable="false" /> }
                  </span>
                  <span class="momento__nombre">{{ m.nombre }}</span>
                </button>
              }
            </div>
          </div>
        </div>
      }
    }

    <!-- Un grupo de muestras: botones de opción con el recorte del arte, roving tabindex y flechas (patrón radio de ARIA). -->
    <ng-template #grupo let-id="id" let-rotulo="rotulo" let-muestras="muestras" let-actual="actual">
      <div class="grupo">
        <span class="grupo__rotulo" [id]="uid + '-' + id">{{ rotulo }}
          <span class="grupo__actual">{{ nombreDe(muestras, actual) }}</span></span>
        <div role="radiogroup" class="muestras" [attr.data-grupo]="id" [attr.aria-labelledby]="uid + '-' + id" (keydown)="flechas($event)">
          @for (m of muestras; track m.valor) {
            <button type="button" role="radio" class="muestra" [attr.data-valor]="m.valor" [attr.aria-checked]="m.valor === actual"
              [attr.tabindex]="m.valor === actual || (!contiene(muestras, actual) && $first) ? 0 : -1"
              [attr.aria-label]="m.nombre" [attr.title]="m.nombre" (click)="elegirAcabado(id, m.valor)">
              @if (m.arte) { <img [src]="m.arte" alt="" loading="lazy" draggable="false" /> }
              @else { <span class="muestra__letra" aria-hidden="true">{{ m.nombre.charAt(0) }}</span> }
            </button>
          }
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: var(--ds-space-4); min-inline-size: 0; }

    /* Categorías: una fila de cápsulas que se parte en renglones, nunca se sale del panel. */
    .categorias { display: flex; flex-wrap: wrap; gap: var(--ds-space-1); padding-block-end: var(--ds-space-3); border-block-end: 1px solid var(--l-filo); }
    .categoria {
      min-block-size: var(--ds-target-min); padding-inline: var(--ds-space-3); border: 1px solid var(--l-filo-fuerte);
      border-radius: 999px; background: transparent; color: var(--ds-text-2); font: inherit; font-size: var(--autoria-texto-14);
      font-weight: 700; cursor: pointer; transition: background-color var(--ds-dur-fast) var(--ds-ease-out), scale var(--ds-dur-press) var(--ds-ease-out);
    }
    .categoria:active { scale: 0.97; }
    .categoria[aria-selected='true'] { background: var(--ds-primary-subtle); border-color: var(--ds-primary); color: var(--ds-text-1); }

    /* Modelos: filas con la miniatura real de la pieza (primer cuadro de su hoja) y su nombre. */
    .modelos { display: grid; gap: var(--ds-space-1); }
    .modelo {
      display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--ds-space-3);
      min-block-size: 3.25rem; padding: var(--ds-space-1) var(--ds-space-2); border: 1px solid transparent; border-radius: var(--l-radio-control);
      background: transparent; color: var(--ds-text-1); font: inherit; font-size: var(--autoria-texto-16); font-weight: 600;
      text-align: start; cursor: pointer; transition: background-color var(--ds-dur-fast) var(--ds-ease-out), scale var(--ds-dur-press) var(--ds-ease-out);
    }
    .modelo:active { scale: 0.98; }
    @media (hover: hover) and (pointer: fine) { .modelo:hover, .categoria:hover { background: var(--l-superficie-hundida); } }
    .modelo__caja {
      display: grid; place-items: center; inline-size: 2.75rem; block-size: 2.75rem; border-radius: var(--l-radio-chico);
      background: var(--juego-escenario); overflow: hidden;
    }
    .modelo__cuadro { display: block; overflow: hidden; }
    .modelo__cuadro img { display: block; max-inline-size: none; image-rendering: pixelated; }
    .modelo__mas { color: var(--juego-texto); font-weight: 700; }
    .modelo__nombre { min-inline-size: 0; overflow-wrap: anywhere; }
    .proyectado { margin-block-start: var(--ds-space-3); }

    .puerta { display: flex; flex-direction: column; gap: var(--ds-space-3); }
    .campo-con-rotulo { display: flex; flex-direction: column; gap: var(--ds-space-1); font-weight: 700; font-size: var(--autoria-texto-16); }
    .casilla { display: flex; align-items: center; gap: var(--ds-space-2); min-block-size: var(--ds-target-min); font-size: var(--autoria-texto-16); }
    .casilla input { inline-size: 1.5rem; block-size: 1.5rem; accent-color: var(--ds-primary); }

    /* Apariencia: grupos de muestras tipo «pozo de color»; el nombre de lo elegido va en el rótulo. */
    .apariencia { display: flex; flex-direction: column; gap: var(--ds-space-4); }
    /* Un filo de 1 px entre grupos: se escanea Piso · Variante · Muro · Paleta · Momento sin leer cada rótulo. */
    .apariencia > .grupo + .grupo { padding-block-start: var(--ds-space-4); border-block-start: 1px solid var(--l-filo); }
    .grupo { display: flex; flex-direction: column; gap: var(--ds-space-2); min-inline-size: 0; }
    .grupo__rotulo { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--ds-space-2); font-weight: 700; font-size: var(--autoria-texto-16); }
    .grupo__actual { color: var(--ds-text-2); font-weight: 500; font-size: var(--autoria-texto-14); overflow-wrap: anywhere; }
    .muestras { display: grid; grid-template-columns: repeat(auto-fill, minmax(3.25rem, 1fr)); gap: var(--ds-space-2); }
    .muestra {
      position: relative; display: grid; place-items: center; block-size: var(--ds-target-min); padding: 0; overflow: hidden;
      border: 1px solid var(--l-filo-fuerte); border-radius: var(--l-radio-chico); background: var(--juego-escenario); cursor: pointer;
      transition: scale var(--ds-dur-press) var(--ds-ease-out), box-shadow var(--ds-dur-fast) var(--ds-ease-out);
    }
    .muestra:active { scale: 0.95; }
    /* El arte real de la biblioteca, reducido para que se lea el dibujo (varias baldosas, el zócalo), no un solo color. */
    .muestra img { inline-size: 100%; block-size: 100%; object-fit: cover; object-position: 50% 50%; }
    .muestras[data-grupo='muro'] img, .muestras[data-grupo='paleta'] img { object-position: 50% 100%; }
    .muestra__letra { color: var(--juego-texto); font-weight: 700; }
    /* Lo elegido: anillo del color de acción por fuera y un filo claro por dentro, para que se lea sobre cualquier arte. */
    .muestra[aria-checked='true'] { border-color: var(--ds-primary); box-shadow: 0 0 0 2px var(--ds-primary), inset 0 0 0 2px var(--l-superficie); }
    .momentos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ds-space-2); }
    .momento {
      display: grid; gap: var(--ds-space-1); padding: var(--ds-space-1); border: 1px solid var(--l-filo-fuerte); border-radius: var(--l-radio-control);
      background: transparent; color: var(--ds-text-1); font: inherit; font-weight: 700; font-size: var(--autoria-texto-14); cursor: pointer;
      transition: scale var(--ds-dur-press) var(--ds-ease-out);
    }
    .momento:active { scale: 0.97; }
    .momento[aria-checked='true'] { border-color: var(--ds-primary); box-shadow: 0 0 0 1px var(--ds-primary); background: var(--ds-primary-subtle); }
    .momento__vista { position: relative; display: block; block-size: 2.5rem; overflow: hidden; border-radius: var(--l-radio-chico); background: var(--juego-escenario); }
    .momento__vista img { inline-size: 100%; block-size: 100%; object-fit: cover; }
    /* La noche: el mismo piso bajo un velo azul profundo, como la luz de noche del juego. */
    .momento--noche .momento__vista::after { content: ''; position: absolute; inset: 0; background: color-mix(in srgb, var(--juego-escenario) 62%, transparent); }
    .momento__nombre { min-block-size: 1.5rem; display: grid; place-items: center; }

    .categoria:focus-visible, .modelo:focus-visible, .muestra:focus-visible, .momento:focus-visible {
      outline: 3px solid var(--ds-focus); outline-offset: 2px;
    }
    .solo-lector { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) { .categoria, .modelo, .muestra, .momento { transition: none; } }
    @media (forced-colors: active) {
      .muestra[aria-checked='true'], .momento[aria-checked='true'], .categoria[aria-selected='true'] { outline: 3px solid Highlight; outline-offset: 1px; }
    }
  `],
  imports: [NgTemplateOutlet],
})
export class PanelDeEstructuraComponent {
  readonly sala = input.required<SalaCaso>();
  readonly agregada = output<string>();
  readonly puertaElegida = input<string | null>(null);
  readonly faltas = input<FaltaDeSala[]>([]);
  /** Qué parte se pinta; por omisión, todas (así lo usan las pruebas del panel y las pantallas viejas). */
  readonly parte = input<ParteDelPanel>('todo');
  protected readonly catalogo = inject(CatalogoDePiezas);
  protected readonly store = inject(CasoStore);
  protected readonly indice = signal(0);
  /** Prefijo de los id de esta instancia: la sala monta hasta tres paneles a la vez. */
  protected readonly uid = `pe-${++siguientePanel}`;
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  protected readonly momentos: { valor: 'dia' | 'noche'; nombre: string }[] = [{ valor: 'dia', nombre: 'Día' }, { valor: 'noche', nombre: 'Noche' }];

  protected muestra(parte: Exclude<ParteDelPanel, 'todo'>): boolean {
    return this.parte() === 'todo' || this.parte() === parte;
  }

  /** El nombre que da la biblioteca a un piso o a un muro, y uno legible para variantes y paletas (nunca el valor técnico). */
  protected nombrePiso(piso: string, variantes: string[]): string {
    const pisos = this.catalogo.manifiesto()?.pisos ?? {};
    return pisos[`${piso}-a`]?.nombre ?? variantes.map(v => pisos[`${piso}-${v}`]?.nombre).find(Boolean) ?? legible(piso);
  }
  protected nombreMuro(muro: string, paletas: string[]): string {
    return paletas.map(p => this.catalogo.manifiesto()?.muros?.[`${muro}/${p}`]?.nombre).find(Boolean) ?? legible(muro);
  }
  protected readonly legible = legible;

  // ── Muestras de apariencia ─────────────────────────────────────────────────
  private arte(imagen: ImagenDeCatalogo | undefined): string | null {
    return imagen?.ruta ? urlDePieza(imagen.ruta) : null;
  }
  private imagenDePiso(piso: string, variante: string | undefined): ImagenDeCatalogo | undefined {
    const pisos = this.catalogo.manifiesto()?.pisos ?? {};
    return (variante ? pisos[`${piso}-${variante}`] : undefined) ?? pisos[`${piso}-a`];
  }
  protected readonly muestrasPiso = computed<Muestra[]>(() => this.catalogo.acabados().pisos.map(p => ({
    valor: p.piso, nombre: this.nombrePiso(p.piso, p.variantes), arte: this.arte(this.imagenDePiso(p.piso, p.variantes[0])),
  })));
  protected readonly muestrasVariante = computed<Muestra[]>(() => {
    const piso = this.sala().estructura?.acabados.piso ?? '';
    return this.variantes().map(v => ({ valor: v, nombre: legible(v), arte: this.arte(this.imagenDePiso(piso, v)) }));
  });
  protected readonly muestrasMuro = computed<Muestra[]>(() => this.catalogo.acabados().muros.map(m => ({
    valor: m.muro, nombre: this.nombreMuro(m.muro, m.paletas), arte: this.arte(this.catalogo.manifiesto()?.muros?.[`${m.muro}/${m.paletas[0]}`]?.fondo),
  })));
  protected readonly muestrasPaleta = computed<Muestra[]>(() => {
    const muro = this.sala().estructura?.acabados.muro ?? '';
    return this.paletas().map(p => ({ valor: p, nombre: legible(p), arte: this.arte(this.catalogo.manifiesto()?.muros?.[`${muro}/${p}`]?.fondo) }));
  });
  /** El piso de la sala tal como está: lo usan las muestras de día y de noche. */
  protected readonly arteDelPiso = computed(() => {
    const a = this.sala().estructura?.acabados;
    return a ? this.arte(this.imagenDePiso(a.piso, a.variante)) : null;
  });
  protected nombreDe(muestras: Muestra[], valor: string): string {
    return muestras.find(m => m.valor === valor)?.nombre ?? '';
  }
  protected contiene(muestras: Muestra[], valor: string): boolean { return muestras.some(m => m.valor === valor); }

  /** Flechas dentro de un grupo de opciones: eligen la vecina y le pasan el foco (patrón radio de ARIA). */
  protected flechas(evento: KeyboardEvent): void {
    const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[evento.key] ?? 0;
    const especial = evento.key === 'Home' || evento.key === 'End';
    if (!paso && !especial) return;
    const radios = [...(evento.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role=radio]')];
    if (!radios.length) return;
    evento.preventDefault();
    const actual = Math.max(0, radios.indexOf(evento.target as HTMLButtonElement));
    const destino = evento.key === 'Home' ? 0 : evento.key === 'End' ? radios.length - 1 : (actual + paso + radios.length) % radios.length;
    radios[destino].click();
    radios[destino].focus();
  }

  // ── Miniaturas del catálogo ────────────────────────────────────────────────
  protected miniatura(modelo: CategoriaDePaleta['modelos'][number]): Miniatura | null {
    const ficha = this.catalogo.manifiesto()?.piezas?.[`${modelo.tipo}/${modelo.modelo}`];
    const vista = ficha?.vistas?.frente ?? ficha?.vistas?.suelo ?? ficha?.vistas?.camara;
    if (!ficha || !vista?.ruta || !vista.ancho || !vista.alto) return null;
    // Reducir solo si no cabe; un dibujo chico se ve a ×1 o ×2 enteros, que es como se lee el pixel art.
    const escala = Math.min(2, CAJA_MINIATURA / Math.max(vista.ancho, vista.alto));
    const k = escala >= 1 ? Math.floor(escala) : escala;
    return { url: urlDePieza(vista.ruta), ancho: Math.round(vista.ancho * k), alto: Math.round(vista.alto * k),
      hoja: Math.round(vista.ancho * Math.max(1, ficha.cuadros || 1) * k) };
  }

  protected puerta() { return this.sala().puertas.find(p => p.id === this.puertaElegida()); }
  protected modelosPuerta() { return this.catalogo.paleta().find(c => c.clave === 'puertas')?.modelos ?? []; }
  protected faltaRegreso(id: string): boolean {
    const p = this.sala().puertas.find(puerta => puerta.id === id);
    return !!p?.hacia && !p.sentidoUnico && this.faltas().some(f => f.regla === 'OCL-15'
      && f.elemento.tipo === 'puerta' && f.elemento.id === id && f.mensaje.toLowerCase().includes('regreso'));
  }
  protected destino(id: string, hacia: string): void { if (hacia) this.store.fijarDestinoDePuerta(this.sala().id, id, hacia); }
  protected modeloPuerta(id: string, modelo: string): void {
    if (this.modelosPuerta().some(m => m.modelo === modelo)) this.store.editarPuerta(this.sala().id, id, { modelo });
  }
  protected sentido(id: string, sentidoUnico: boolean): void { this.store.editarPuerta(this.sala().id, id, { sentidoUnico }); }
  protected regreso(id: string): void {
    this.store.crearPuertaDeRegreso(this.sala().id, id, clave => this.catalogo.manifiesto()?.piezas[clave] ?? null);
  }

  protected tecla(evento: KeyboardEvent): void {
    const paso = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0;
    if (!paso) return;
    evento.preventDefault();
    const botones = [...(evento.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role=tab]')];
    this.indice.set((this.indice() + paso + botones.length) % botones.length);
    botones[this.indice()]?.focus();
  }

  protected agregar(modelo: CategoriaDePaleta['modelos'][number]): void {
    const sala = this.sala(), estructura = sala.estructura;
    const fichas = this.catalogo.manifiesto()?.piezas;
    const ficha = fichas?.[`${modelo.tipo}/${modelo.modelo}`];
    if (!estructura || !ficha) return;
    if (modelo.muros.includes('suelo') && !modelo.muros.some(m => m !== 'suelo')) {
      const zona = zonaCaminable(sala.encuadre, estructura.ancho);
      const centro = proyectarAlSuelo({ x: zona.x + zona.ancho / 2, y: zona.y + zona.alto / 2 }, zona);
      const ocupada = (x: number) => (estructura.piezas ?? []).some(p => p.x === x && p.y === centro.y);
      let punto = centro;
      if (ocupada(centro.x)) {
        const candidatos: number[] = [];
        for (let x = centro.x + 48; x <= zona.x + zona.ancho; x += 48) candidatos.push(x);
        for (let x = centro.x - 48; x >= zona.x; x -= 48) candidatos.push(x);
        const libre = candidatos.find(x => !ocupada(x));
        if (libre !== undefined) punto = { ...centro, x: libre };
      }
      const id = this.store.agregarPiezaDeMuro(sala.id, modelo.tipo, modelo.modelo, punto);
      if (id) this.agregada.emit(anclaDeElemento(sala.id, { tipo: 'pieza', id }));
      return;
    }
    const muros: Muro[] = ['fondo', 'izquierda', 'derecha'];
    let lugar: { muro: Muro; pos: number } | null = null;
    for (const muro of muros) {
      if (!modelo.muros.includes(muro)) continue;
      const largo = largoMuro(muro, sala.encuadre, estructura.ancho);
      if (!largo) continue;
      const ocupadas = [
        ...(estructura.piezas ?? []).filter(p => p.muro === muro && p.pos !== undefined).map(p => {
          const f = fichas?.[`${p.tipo}/${p.modelo}`];
          return { ocupa: f?.ocupa ?? 0, franja: f?.franja ?? [0, 0] as [number, number], pos: p.pos!, esPuerta: false };
        }),
        ...sala.puertas.filter(p => p.muro === muro && p.pos !== undefined).map(p => {
          const f = fichas?.[`puerta/${p.modelo ?? ''}`];
          return { ocupa: f?.ocupa ?? 0, franja: f?.franja ?? [0, 0] as [number, number], pos: p.pos!, esPuerta: true };
        }),
      ];
      const pos = primerHueco(muro, { ...ficha, esPuerta: modelo.tipo === 'puerta' }, ocupadas, largo);
      if (pos !== null) { lugar = { muro, pos }; break; }
    }
    lugar ??= { muro: 'fondo', pos: Math.round(largoMuro('fondo', sala.encuadre, estructura.ancho) / 16) * 8 };
    const puerta = modelo.tipo === 'puerta';
    const id = puerta ? this.store.agregarPuerta(sala.id, modelo.modelo, lugar.muro, lugar.pos)
      : this.store.agregarPiezaDeMuro(sala.id, modelo.tipo, modelo.modelo, lugar);
    if (id) this.agregada.emit(anclaDeElemento(sala.id, { tipo: puerta ? 'puerta' : 'pieza', id }));
  }

  protected variantes(): string[] {
    return this.catalogo.acabados().pisos.find(p => p.piso === this.sala().estructura?.acabados.piso)?.variantes ?? [];
  }
  protected paletas(): string[] {
    return this.catalogo.acabados().muros.find(m => m.muro === this.sala().estructura?.acabados.muro)?.paletas ?? [];
  }
  /** Una muestra elegida en el grupo `grupo` de la plantilla. */
  protected elegirAcabado(grupo: string, valor: string): void {
    if (grupo === 'piso') this.piso(valor);
    else if (grupo === 'variante') this.variante(valor);
    else if (grupo === 'muro') this.muro(valor);
    else if (grupo === 'paleta') this.paleta(valor);
  }
  protected piso(valor: string): void {
    if (valor === this.sala().estructura?.acabados.piso) return;
    const grupo = this.catalogo.acabados().pisos.find(p => p.piso === valor);
    if (grupo) this.cambiar(e => { e.piso = valor; e.variante = grupo.variantes[0]; });
  }
  protected variante(valor: string): void {
    if (valor !== this.sala().estructura?.acabados.variante && this.variantes().includes(valor)) this.cambiar(e => { e.variante = valor; });
  }
  protected muro(valor: string): void {
    if (valor === this.sala().estructura?.acabados.muro) return;
    const grupo = this.catalogo.acabados().muros.find(m => m.muro === valor);
    if (grupo) this.cambiar(e => { e.muro = valor; e.paleta = grupo.paletas[0]; });
  }
  protected paleta(valor: string): void {
    if (valor !== this.sala().estructura?.acabados.paleta && this.paletas().includes(valor)) this.cambiar(e => { e.paleta = valor; });
  }
  private cambiar(cambio: (acabados: NonNullable<SalaCaso['estructura']>['acabados']) => void): void {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.store.cambiarEstructura(this.sala().id, 'Cambiaste los acabados', e => cambio(e.acabados));
  }
  /** Día o noche: elegir el que ya está no cambia nada (no ensucia el historial de deshacer). */
  protected fijarMomento(valor: 'dia' | 'noche'): void {
    if ((this.sala().estructura?.momento ?? 'dia') === valor) return;
    this.momento();
  }
  protected momento(): void {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.store.cambiarEstructura(this.sala().id, 'Cambiaste el momento del día', e => {
      e.momento = e.momento === 'noche' ? 'dia' : 'noche';
    });
  }
}
