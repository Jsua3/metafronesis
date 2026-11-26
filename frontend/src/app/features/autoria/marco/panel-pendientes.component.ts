import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { UiButton } from '../../../shared/ui/button/ui-button';
import { UiDialogFrame } from '../../../shared/ui/dialog/ui-dialog';
import { ETAPAS, type Etapa, type Pendiente } from '../modelo/pendientes';
import { injectLlevar } from './llevar';
import { ProgresoDelCaso } from './progreso.service';
import { CasoStore } from '../estado/caso.store';

const NOMBRE_ETAPA: Record<Etapa, string> = {
  datos: 'Datos del caso', lugar: 'Lugar y salas', historia: 'Historia: escenas y guion', evaluacion: 'Evaluación', enviar: 'Enviar a revisión',
};

interface Grupo {
  etapa: Etapa;
  nombre: string;
  corregir: Pendiente[];
  escribir: Pendiente[];
}

/**
 * La hoja «Pendientes» (EDITOR.md §3.6, nivel 3): la ÚNICA lista de pendientes del editor, agrupada por etapa. Primero lo
 * que hay que corregir (con «Llévame ahí»); después, sin color de alerta, lo que falta escribir; al final, en gris, las
 * sugerencias que no impiden enviar. La compuerta es la de siempre: aquí solo cambia el tono.
 *
 * Se abre con `UiDialog.sheet` (lado final): la capa toma la piel de quien la abre (C13). Por eso sus estilos usan los
 * tokens `--ds-*` y `--l-*` y no los alias del editor, que se resuelven en el marco y no llegan a la capa con la piel buena.
 */
@Component({
  selector: 'app-panel-pendientes',
  imports: [UiDialogFrame, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame title="Pendientes del caso" [description]="resumen()">
      @if (!store.soloLectura()) {
      @if (grupos().length === 0 && rellenos().length === 0) {
        <p class="pp__vacio">@if (store.revisionPendiente()) { Falta completar la revisión. } @else { Nada pendiente. Cuando quieras, prueba el caso y envíalo a Psicología. }</p>
      }
      @if (!store.revisionPendiente() && progreso.totalPendientes() === 0) {
        <button ui-button type="button" (click)="irEnviar()">Ir a Enviar</button>
      }
      @for (g of grupos(); track g.etapa) {
        <section class="pp__grupo" [attr.aria-labelledby]="'pp-' + g.etapa">
          <h3 class="pp__etapa" [id]="'pp-' + g.etapa">{{ g.nombre }}</h3>
          @if (g.corregir.length) {
            <ul class="pp__lista" [attr.aria-label]="'Por corregir en ' + g.nombre">
              @for (p of g.corregir; track $index) {
                <li class="pp__item pp__item--corregir">
                  <span class="marca-estado" data-estado="con-pendientes" aria-hidden="true"></span>
                  <p class="pp__texto">{{ p.mensaje }}</p>
                  <button ui-button type="button" variant="secondary" size="sm" [attr.aria-label]="'Llévame ahí: ' + p.mensaje"
                          (click)="ir(p)">Llévame ahí</button>
                </li>
              }
            </ul>
          }
          @if (g.escribir.length) {
            <p class="pp__subtitulo">Por escribir</p>
            <ul class="pp__lista" [attr.aria-label]="'Por escribir en ' + g.nombre">
              @for (p of g.escribir; track $index) {
                <li class="pp__item">
                  <span class="marca-estado" data-estado="sin-empezar" aria-hidden="true"></span>
                  <p class="pp__texto">{{ p.mensaje }}</p>
                  <button ui-button type="button" variant="ghost" size="sm" [attr.aria-label]="'Llévame ahí: ' + p.mensaje" (click)="ir(p)">Ir</button>
                </li>
              }
            </ul>
          }
        </section>
      }
      @for (grupo of rellenos(); track grupo.id) {
        <section class="pp__grupo">
          <h3 class="pp__etapa">Escena {{ grupo.numero }} · {{ grupo.titulo }}: {{ grupo.items.length }} {{ grupo.items.length === 1 ? 'texto de muestra por escribir' : 'textos de muestra por escribir' }}</h3>
          <ul>@for (item of grupo.items; track $index) { <li>{{ item.detalle }} <button ui-button type="button" variant="ghost" size="sm" (click)="ir(item.pendiente)">Ir</button></li> }</ul>
        </section>
      }
      @if (sugerencias().length || rellenosSugeridos().length) {
        <details class="pp__sugerencias">
          <summary><span class="pp__chevron" aria-hidden="true"></span>Sugerencias ({{ sugerencias().length + cantidadRellenosSugeridos() }}): no impiden enviar</summary>
          @for (grupo of rellenosSugeridos(); track grupo.id) {
            <section class="pp__grupo"><h3 class="pp__etapa">Escena {{ grupo.numero }} · {{ grupo.titulo }}: {{ grupo.items.length }} {{ grupo.items.length === 1 ? 'texto de muestra' : 'textos de muestra' }}</h3>
              <ul>@for (item of grupo.items; track $index) { <li>{{ item.detalle }} <button ui-button type="button" variant="ghost" size="sm" (click)="ir(item.pendiente)">Ir</button></li> }</ul>
            </section>
          }
          <ul class="pp__lista">
            @for (p of sugerencias(); track $index) {
              <li class="pp__item pp__item--sugerencia">
                <p class="pp__texto">{{ p.mensaje }}</p>
                <button ui-button type="button" variant="ghost" size="sm" [attr.aria-label]="'Llévame ahí: ' + p.mensaje" (click)="ir(p)">Ir</button>
              </li>
            }
          </ul>
        </details>
      }
      }
    </ui-dialog-frame>
  `,
  styles: `
    :host { display: block; }
    .pp__vacio { margin: 0; color: var(--ds-text-2); }
    .pp__grupo { display: flex; flex-direction: column; gap: var(--ds-space-2); padding-block: var(--ds-space-3); border-block-start: 1px solid var(--l-filo); }
    .pp__grupo:first-of-type { border-block-start: 0; padding-block-start: 0; }
    .pp__etapa { margin: 0; color: var(--ds-text-1); font-size: var(--ds-type-body-size, 1rem); font-weight: 700; }
    .pp__subtitulo { margin: var(--ds-space-2) 0 0; color: var(--ds-text-2); font-size: var(--ds-type-caption-size); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .pp__lista { display: flex; flex-direction: column; gap: var(--ds-space-2); margin: 0; padding: 0; list-style: none; }
    /* La marca y el texto en una fila; la acción debajo, al final: en una hoja de 400 px el texto no se estrecha. */
    .pp__item {
      display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; column-gap: var(--ds-space-3); row-gap: var(--ds-space-2);
      padding: var(--ds-space-3); border: 1px solid var(--l-filo); border-radius: var(--l-radio-control); background: var(--l-superficie);
    }
    .pp__item--corregir { border-color: color-mix(in oklab, var(--ds-warning-text) 45%, transparent); }
    .pp__item > button { grid-column: 2; justify-self: end; }
    .pp__item--sugerencia { grid-template-columns: minmax(0, 1fr); background: transparent; }
    .pp__item--sugerencia > button { grid-column: 1; }
    .pp__texto { margin: 0; color: var(--ds-text-1); overflow-wrap: anywhere; }
    .pp__item--sugerencia .pp__texto { color: var(--ds-text-2); }
    .pp__item .marca-estado { margin-block-start: 0.1875rem; }
    .pp__sugerencias { padding-block-start: var(--ds-space-3); border-block-start: 1px solid var(--l-filo); }
    /* \`display: flex\` quita el triángulo nativo del resumen: la marca propia dice que se despliega y gira al abrirse. */
    .pp__sugerencias summary { min-block-size: 2.75rem; display: flex; align-items: center; gap: var(--ds-space-2); color: var(--ds-text-2); font-weight: 700; cursor: pointer; list-style: none; }
    .pp__sugerencias summary::-webkit-details-marker { display: none; }
    .pp__chevron {
      inline-size: 0.5rem; block-size: 0.5rem; flex: none; margin-inline: 0.125rem;
      border-inline-end: 2px solid currentColor; border-block-end: 2px solid currentColor;
      rotate: -45deg; transition: rotate 160ms ease;
    }
    .pp__sugerencias[open] .pp__chevron { rotate: 45deg; }
    @media (prefers-reduced-motion: reduce) { .pp__chevron { transition: none; } }
    .pp__sugerencias[open] summary { margin-block-end: var(--ds-space-2); }
  `,
})
export class PanelPendientesComponent {
  protected readonly progreso = inject(ProgresoDelCaso);
  protected readonly store = inject(CasoStore);
  private readonly ref = inject(DialogRef, { optional: true });
  private readonly llevar = injectLlevar();

  protected readonly grupos = computed<Grupo[]>(() => {
    const todos = this.progreso.pendientes();
    return ETAPAS.map((etapa) => ({
      etapa,
      nombre: NOMBRE_ETAPA[etapa],
      corregir: todos.filter((p) => p.etapa === etapa && p.tipo === 'por-corregir'),
      escribir: todos.filter((p) => p.etapa === etapa && p.tipo === 'por-escribir' && p.codigo !== 'CONTENT_PLACEHOLDER'),
    })).filter((g) => g.corregir.length || g.escribir.length);
  });

  protected readonly sugerencias = computed(() => this.progreso.pendientes().filter((p) => p.tipo === 'sugerencia' && p.codigo !== 'CONTENT_PLACEHOLDER'));

  protected readonly rellenos = computed(() => this.agruparRellenos(false));
  protected readonly rellenosSugeridos = computed(() => this.agruparRellenos(true));
  protected readonly cantidadRellenosSugeridos = computed(() => this.rellenosSugeridos().reduce((total, grupo) => total + grupo.items.length, 0));

  private agruparRellenos(sugeridos: boolean) {
    const escenas = this.progreso.escenas();
    const pendientes = this.progreso.pendientes().filter(p => p.codigo === 'CONTENT_PLACEHOLDER' && (p.tipo === 'sugerencia') === sugeridos);
    const ids = [...new Set(pendientes.map(p => p.escenaId))];
    return ids.map(id => {
      const indice = escenas.findIndex(e => e.id === id);
      const escena = escenas[indice];
      const items = pendientes.filter(p => p.escenaId === id).map(p => {
        const respuesta = escena?.respuestas.findIndex(r => p.ir.ancla === `respuesta-${r.id}`) ?? -1;
        const campo = /retroalimentaci[oó]n|justificaci[oó]n/i.test(p.mensaje) ? 'retroalimentación' : 'texto';
        return { pendiente: p, detalle: respuesta >= 0 ? `Respuesta ${respuesta + 1} · ${campo}` : p.mensaje };
      });
      return { id: id ?? 'sin-escena', numero: indice + 1 || '?', titulo: escena?.titulo ?? 'Escena sin identificar', items };
    });
  }

  protected async irEnviar(): Promise<void> {
    this.ref?.close();
    await this.llevar({ ruta: '/revision' });
  }

  protected readonly resumen = computed(() => {
    // Un caso que ya no es borrador no tiene nada que corregir ni que enviar: se dice por qué, sin invitar a enviarlo.
    if (this.store.soloLectura()) {
      switch (this.store.caso()?.estado) {
        case 'PUBLISHED': return 'El caso está publicado: ya no se corrige ni se envía. Se puede ver, pero no editar.';
        case 'ARCHIVED': return 'El caso está archivado: ya no se corrige ni se envía. Se puede ver, pero no editar.';
        default: return 'El caso está en revisión de Psicología: mientras tanto no se edita. Si lo devuelven, aquí verás qué cambiar.';
      }
    }
    if (this.store.revisionPendiente()) return 'Falta completar la revisión con el servidor.';
    const corregir = this.progreso.porCorregir().length;
    const escribir = this.progreso.pendientes().filter((p) => p.tipo === 'por-escribir').length;
    const partes = [corregir === 1 ? '1 por corregir' : `${corregir} por corregir`];
    if (escribir) partes.push(escribir === 1 ? '1 por escribir' : `${escribir} por escribir`);
    return `${partes.join(' · ')}. Tanto lo que falta escribir como lo que falta corregir impiden enviar el caso.`;
  });

  /** Cierra la hoja y lleva al sitio: con la hoja abierta el foco no podría llegar al campo. */
  protected async ir(p: Pendiente): Promise<void> {
    this.ref?.close();
    await this.llevar(p.ir);
  }
}
