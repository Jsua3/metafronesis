import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, effect, inject, input, output, signal, untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import type { FichaAcordada } from '../../../../core/api/coautoria.api';

type Seccion = 'caso' | 'personajes' | 'lugar' | 'escenas' | 'hitos' | 'finales' | 'cuidado';

export const NOMBRE_INTENSIDAD: Record<FichaAcordada['intensidad'], string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta' };
export const NOMBRE_MOMENTO: Record<FichaAcordada['momento'], string> = { dia: 'De día', noche: 'De noche' };

/**
 * «Lo que acordamos» (diseño §4 ③): la ficha del caso por secciones. Cada sección se corrige en su lugar («Corregir»); abajo,
 * «Aceptar» y «Hacer un cambio», que se vuelve un cuadro de texto para decirle a la IA qué no convence y cómo se quiere.
 */
@Component({
  selector: 'app-resumen-acordado',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = ficha();
    <section class="resumen" aria-labelledby="resumen-titulo" [attr.aria-busy]="ocupado()">
      <header class="cabeza">
        <h3 id="resumen-titulo" #titulo tabindex="-1">Lo que acordamos</h3>
        <p class="nota">Revísalo antes de que la IA empiece a construir. Puedes corregir cada parte aquí mismo.</p>
      </header>

      <div class="secciones">
        <!-- El caso -->
        <article class="seccion">
          <div class="seccion-cabeza">
            <h4>El caso</h4>
            <button type="button" class="boton boton-texto" [attr.aria-expanded]="editando() === 'caso'" (click)="abrir('caso')">Corregir</button>
          </div>
          @if (editando() === 'caso' && borrador; as b) {
            <label class="campo-etiqueta">Título <input class="campo" [value]="b.titulo" (input)="b.titulo = valor($event)" maxlength="120" /></label>
            <label class="campo-etiqueta">Qué aprende quien lo juega <textarea class="campo" rows="3" maxlength="400" [value]="b.objetivo" (input)="b.objetivo = valor($event)"></textarea></label>
            <ng-container *ngTemplateOutlet="guardar" />
          } @else {
            <p class="destacado">{{ f.titulo }}</p>
            <p>{{ f.objetivo }}</p>
          }
        </article>

        <!-- Personajes -->
        <article class="seccion">
          <div class="seccion-cabeza">
            <h4>Personajes</h4>
            <button type="button" class="boton boton-texto" [attr.aria-expanded]="editando() === 'personajes'" (click)="abrir('personajes')">Corregir</button>
          </div>
          @if (editando() === 'personajes' && borrador; as b) {
            @for (p of b.personajes; track $index; let i = $index) {
              <div class="par">
                <label class="campo-etiqueta">Nombre <input class="campo" maxlength="60" [value]="p.nombre" (input)="p.nombre = valor($event)" /></label>
                <label class="campo-etiqueta">Cómo es <input class="campo" maxlength="300" [value]="p.descripcion" (input)="p.descripcion = valor($event)" /></label>
              </div>
            }
            <ng-container *ngTemplateOutlet="guardar" />
          } @else {
            <ul class="lista">
              @for (p of f.personajes; track $index) {
                <li><strong>{{ p.nombre }}</strong>: {{ p.descripcion }}</li>
              }
            </ul>
          }
        </article>

        <!-- Lugar y momento -->
        <article class="seccion">
          <div class="seccion-cabeza">
            <h4>Lugar</h4>
            <button type="button" class="boton boton-texto" [attr.aria-expanded]="editando() === 'lugar'" (click)="abrir('lugar')">Corregir</button>
          </div>
          @if (editando() === 'lugar' && borrador; as b) {
            <label class="campo-etiqueta">Dónde pasa <input class="campo" maxlength="240" [value]="b.lugar" (input)="b.lugar = valor($event)" /></label>
            <label class="campo-etiqueta">Momento del día
              <select class="campo" [value]="b.momento" (change)="b.momento = $any(valor($event))">
                <option value="dia">De día</option>
                <option value="noche">De noche</option>
              </select>
            </label>
            <ng-container *ngTemplateOutlet="guardar" />
          } @else {
            <p>{{ f.lugar }} <span class="pildora">{{ nombreMomento[f.momento] }}</span></p>
          }
        </article>

        <!-- Escenas -->
        <article class="seccion">
          <div class="seccion-cabeza">
            <h4>Escenas <span class="cuantas">({{ f.escenas.length }})</span></h4>
            <button type="button" class="boton boton-texto" [attr.aria-expanded]="editando() === 'escenas'" (click)="abrir('escenas')">Corregir</button>
          </div>
          @if (editando() === 'escenas' && borrador; as b) {
            @for (e of b.escenas; track $index; let i = $index) {
              <div class="par">
                <label class="campo-etiqueta">Escena {{ i + 1 }} <input class="campo" maxlength="120" [value]="e.titulo" (input)="e.titulo = valor($event)" /></label>
                <label class="campo-etiqueta">Para qué sirve <input class="campo" maxlength="300" [value]="e.proposito" (input)="e.proposito = valor($event)" /></label>
              </div>
            }
            <ng-container *ngTemplateOutlet="guardar" />
          } @else {
            <ol class="lista escenas">
              @for (e of f.escenas; track $index) {
                <li><strong>{{ e.titulo }}</strong>: {{ e.proposito }}</li>
              }
            </ol>
          }
        </article>

        <!-- Hitos -->
        @if (f.hitos.length || editando() === 'hitos') {
          <article class="seccion">
            <div class="seccion-cabeza">
              <h4>Hitos</h4>
              <button type="button" class="boton boton-texto" [attr.aria-expanded]="editando() === 'hitos'" (click)="abrir('hitos')">Corregir</button>
            </div>
            @if (editando() === 'hitos' && borrador; as b) {
              @for (h of b.hitos; track $index; let i = $index) {
                <label class="campo-etiqueta">Hito {{ i + 1 }} <input class="campo" maxlength="160" [value]="h" (input)="b.hitos[i] = valor($event)" /></label>
              }
              <ng-container *ngTemplateOutlet="guardar" />
            } @else {
              <ul class="lista">
                @for (h of f.hitos; track $index) { <li>{{ h }}</li> }
              </ul>
            }
          </article>
        }

        <!-- Finales -->
        <article class="seccion">
          <div class="seccion-cabeza">
            <h4>Finales</h4>
            <button type="button" class="boton boton-texto" [attr.aria-expanded]="editando() === 'finales'" (click)="abrir('finales')">Corregir</button>
          </div>
          @if (editando() === 'finales' && borrador; as b) {
            @for (fin of b.finales; track $index) {
              <div class="par">
                <label class="campo-etiqueta">Final <input class="campo" maxlength="120" [value]="fin.titulo" (input)="fin.titulo = valor($event)" /></label>
                <label class="campo-etiqueta">Qué pasa <input class="campo" maxlength="300" [value]="fin.descripcion" (input)="fin.descripcion = valor($event)" /></label>
              </div>
            }
            <ng-container *ngTemplateOutlet="guardar" />
          } @else {
            <ul class="lista">
              @for (fin of f.finales; track $index) {
                <li><strong>{{ fin.titulo }}</strong>: {{ fin.descripcion }}</li>
              }
            </ul>
          }
        </article>

        <!-- Cuidado: intensidad y temas sensibles -->
        <article class="seccion">
          <div class="seccion-cabeza">
            <h4>Intensidad y temas sensibles</h4>
            <button type="button" class="boton boton-texto" [attr.aria-expanded]="editando() === 'cuidado'" (click)="abrir('cuidado')">Corregir</button>
          </div>
          @if (editando() === 'cuidado' && borrador; as b) {
            <label class="campo-etiqueta">Intensidad máxima
              <select class="campo" [value]="b.intensidad" (change)="b.intensidad = $any(valor($event))">
                <option value="LOW">Baja</option>
                <option value="MEDIUM">Media</option>
                <option value="HIGH">Alta</option>
              </select>
            </label>
            @for (t of b.temasSensibles; track $index; let i = $index) {
              <label class="campo-etiqueta">Tema {{ i + 1 }} <input class="campo" maxlength="120" [value]="t" (input)="b.temasSensibles[i] = valor($event)" /></label>
            }
            <ng-container *ngTemplateOutlet="guardar" />
          } @else {
            <p>Intensidad {{ nombreIntensidad[f.intensidad].toLowerCase() }}.
              @if (f.temasSensibles.length) { Necesitan aviso: {{ f.temasSensibles.join(', ') }}. } @else { Sin temas que necesiten aviso. }
            </p>
          }
        </article>
      </div>

      <ng-template #guardar>
        <div class="acciones-seccion">
          <button type="button" class="boton boton-secundario" [attr.aria-disabled]="ocupado()" (click)="guardarSeccion()">Guardar la corrección</button>
          <button type="button" class="boton boton-texto" (click)="cerrarSeccion()">Cancelar</button>
        </div>
      </ng-template>

      <footer class="pie">
        <p class="estimacion">{{ f.escenas.length }} escenas · {{ f.personajes.length }} {{ f.personajes.length === 1 ? 'personaje' : 'personajes' }}</p>
        @if (pidiendoCambio()) {
          <form class="cambio" (submit)="$event.preventDefault(); enviarCambio()">
            <label for="cambio-texto" class="etiqueta">¿Qué no te convence y cómo lo quieres?</label>
            <textarea #campoCambio id="cambio-texto" class="campo" rows="3" maxlength="1000"
                      placeholder="Por ejemplo: «Que la madre no aparezca y que el caso ocurra de noche»"
                      [value]="cambio()" (input)="cambio.set(valor($event))" (keydown.control.enter)="enviarCambio()"></textarea>
            <div class="acciones">
              <button type="submit" class="boton boton-primario" [attr.aria-disabled]="ocupado() || !cambio().trim()">Enviar el cambio</button>
              <button type="button" class="boton" (click)="pidiendoCambio.set(false)">Cancelar</button>
            </div>
          </form>
        } @else {
          <div class="acciones">
            <button type="button" class="boton boton-primario aceptar" [attr.aria-disabled]="ocupado() || editando() !== null" (click)="pedirAceptar()">Aceptar</button>
            <button type="button" class="boton" [attr.aria-disabled]="ocupado()" (click)="abrirCambio()">Hacer un cambio</button>
          </div>
          @if (editando() !== null) {
            <p class="nota">Guarda o cancela la corrección antes de aceptar.</p>
          }
        }
      </footer>
    </section>
  `,
  styles: `
    :host { display: block; }
    .resumen { display: flex; flex-direction: column; gap: 12px; }
    .cabeza h3 { margin: 0; font-size: var(--autoria-texto-22); line-height: 1.3; }
    .cabeza h3:focus { outline: none; }
    .cabeza h3:focus-visible { outline: 2px solid var(--primario); outline-offset: 2px; }
    .nota { margin: 4px 0 0; font-size: var(--autoria-texto-16); line-height: 1.5; }
    .secciones { display: flex; flex-direction: column; gap: 8px; }
    .seccion {
      display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--linea);
      border-radius: var(--radio-control); background: var(--superficie);
    }
    .seccion p { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5; }
    .seccion-cabeza { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    h4 { margin: 0; font-size: var(--autoria-texto-16); font-weight: 700; letter-spacing: 0.01em; }
    .cuantas { font-weight: 400; }
    .destacado { font-weight: 700; }
    .lista { margin: 0; padding-inline-start: 20px; display: flex; flex-direction: column; gap: 4px; font-size: var(--autoria-texto-16); line-height: 1.5; }
    .par { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; padding-block: 4px; border-block-end: 1px dashed var(--linea); }
    .campo-etiqueta { display: flex; flex-direction: column; gap: 4px; font-size: var(--autoria-texto-16); font-weight: 700; }
    .campo {
      font: inherit; font-weight: 400; font-size: var(--autoria-texto-16); padding: 6px 10px;
      border: 2px solid var(--borde-control); border-radius: var(--radio-control); background: var(--superficie); resize: vertical;
    }
    .acciones-seccion, .acciones { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .pie { display: flex; flex-direction: column; gap: 8px; padding-block-start: 4px; }
    .estimacion { margin: 0; font-size: var(--autoria-texto-16); }
    .cambio { display: flex; flex-direction: column; gap: 6px; }
    .cambio .campo { min-block-size: 6rem; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .aceptar { min-inline-size: 8rem; }
  `,
})
export class ResumenAcordadoComponent {
  readonly ficha = input.required<FichaAcordada>();
  readonly ocupado = input(false);
  readonly aceptar = output<void>();
  readonly cambiar = output<string>();
  readonly corregir = output<FichaAcordada>();

  protected readonly nombreIntensidad = NOMBRE_INTENSIDAD;
  protected readonly nombreMomento = NOMBRE_MOMENTO;
  protected readonly editando = signal<Seccion | null>(null);
  protected readonly pidiendoCambio = signal(false);
  protected readonly cambio = signal('');
  /** Copia de la ficha que se edita en la sección abierta (se descarta al cancelar). */
  protected borrador: FichaAcordada | null = null;
  private readonly titulo = viewChild<ElementRef<HTMLElement>>('titulo');
  private readonly campoCambio = viewChild<ElementRef<HTMLTextAreaElement>>('campoCambio');
  private readonly injector = inject(Injector);

  constructor() {
    // Una ficha nueva (de la IA o corregida) cierra lo que estuviera abierto y lleva el foco al título.
    effect(() => {
      this.ficha();
      untracked(() => {
        this.editando.set(null);
        this.borrador = null;
        this.pidiendoCambio.set(false);
        this.cambio.set('');
        afterNextRender(() => this.titulo()?.nativeElement.focus(), { injector: this.injector });
      });
    });
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected abrir(seccion: Seccion): void {
    if (this.editando() === seccion) {
      this.cerrarSeccion();
      return;
    }
    this.borrador = structuredClone(this.ficha());
    this.editando.set(seccion);
  }

  protected cerrarSeccion(): void {
    this.borrador = null;
    this.editando.set(null);
  }

  protected guardarSeccion(): void {
    if (this.ocupado() || !this.borrador) return;
    this.corregir.emit(this.borrador);
  }

  protected pedirAceptar(): void {
    if (this.ocupado() || this.editando() !== null) return;
    this.aceptar.emit();
  }

  protected abrirCambio(): void {
    if (this.ocupado()) return;
    this.pidiendoCambio.set(true);
    afterNextRender(() => this.campoCambio()?.nativeElement.focus(), { injector: this.injector });
  }

  protected enviarCambio(): void {
    const texto = this.cambio().trim();
    if (this.ocupado() || !texto) return;
    this.cambiar.emit(texto);
  }
}
