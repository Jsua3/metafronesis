import {
  ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { uniqueUiId } from '../button/click-guard';
import { UiButton } from '../button/ui-button';

const kilo = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/** «12,4 kB», «1,2 MB»: el tamaño dicho como lo dice el sistema operativo, sin decimales de más. */
export function tamanoLegible(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${kilo.format(bytes / 1000)} kB`;
  return `${kilo.format(bytes / 1_000_000)} MB`;
}

/**
 * ¿El archivo es de un tipo que `acepta` admite? Lee la lista como la lee el navegador (`.xlsx,.csv`, `text/csv`,
 * `image/*`). Al elegir con el diálogo el sistema ya filtra; al SOLTAR un archivo no, por eso se comprueba aquí.
 */
export function archivoAceptado(archivo: Pick<File, 'name' | 'type'>, acepta: string): boolean {
  const reglas = acepta.split(',').map(regla => regla.trim().toLowerCase()).filter(Boolean);
  if (!reglas.length) return true;
  const nombre = archivo.name.toLowerCase();
  const tipo = (archivo.type || '').toLowerCase();
  return reglas.some(regla => {
    if (regla.startsWith('.')) return nombre.endsWith(regla);
    if (regla.endsWith('/*')) return tipo.startsWith(regla.slice(0, -1));
    return tipo === regla;
  });
}

/**
 * Zona de archivo (DISENO C11): un `input type="file"` NATIVO, visualmente oculto pero enfocable, dentro de una
 * etiqueta con forma de zona. Se puede soltar un archivo encima, pero arrastrar es opcional: elegir con el botón
 * siempre funciona (WCAG 2.5.7) y el teclado llega al control nativo. El elegido se muestra con su nombre, su tamaño y
 * «Quitar». Un archivo soltado de otro tipo no se acepta y se dice por qué, en texto junto al campo.
 *
 * Reemplaza el input nativo de importar estudiantes en Grupos (registro ×2 del kit como icono).
 */
@Component({
  selector: 'ui-archivo',
  imports: [MatIconModule, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-archivo',
    '[class.ui-archivo--encima]': 'encima()',
    '[class.ui-archivo--invalido]': '!!mensajeError()',
  },
  template: `
    <p class="ui-archivo__etiqueta" [id]="etiquetaId">{{ etiqueta() }}</p>
    <label class="ui-archivo__zona" (dragenter)="alEntrar($event)" (dragover)="alEntrar($event)"
      (dragleave)="alSalir($event)" (drop)="alSoltar($event)">
      <input #entrada class="ui-archivo__entrada" type="file" [accept]="acepta()" [attr.aria-labelledby]="etiquetaId"
        [attr.aria-describedby]="describe()" [attr.aria-invalid]="mensajeError() ? 'true' : null" (change)="alElegir($event)" />
      <img class="ui-archivo__icono" src="/assets/game/objects/object_registro.png" alt="" width="56" height="50" />
      <span class="ui-archivo__texto">Arrastra el archivo aquí o <span class="ui-archivo__elige">elige uno</span></span>
      <span class="ui-archivo__formato" [id]="formatoId">{{ textoFormato() }}</span>
    </label>
    @if (elegido(); as archivo) {
      <div class="ui-archivo__elegido" [id]="elegidoId">
        <mat-icon class="ui-archivo__doc" aria-hidden="true">description</mat-icon>
        <span class="ui-archivo__nombre">{{ archivo.name }}</span>
        <span class="ui-archivo__tamano">{{ tamano(archivo.size) }}</span>
        <button ui-button type="button" variant="ghost" size="sm" class="ui-archivo__quitar" (click)="quitar()">Quitar
          <span class="ds-sr-only">{{ archivo.name }}</span></button>
      </div>
    }
    @if (mensajeError(); as mensaje) {
      <p class="ui-archivo__mensaje ui-archivo__mensaje--error" [id]="mensajeId">{{ mensaje }}</p>
    } @else if (ayuda()) {
      <p class="ui-archivo__mensaje" [id]="mensajeId">{{ ayuda() }}</p>
    }
  `,
  styleUrl: './ui-archivo.scss',
})
export class UiArchivo {
  /** Qué se sube («Lista de estudiantes»): es el nombre del control. */
  readonly etiqueta = input.required<string>();
  /** Tipos admitidos, como el atributo `accept` del navegador. */
  readonly acepta = input('.xlsx');
  readonly ayuda = input<string | null | undefined>(null);
  /** Error de quien lo usa (el servidor rechazó el archivo). Tiene prioridad sobre el propio. */
  readonly error = input<string | null | undefined>(null);
  /** El archivo elegido o soltado, o `null` al quitarlo. */
  readonly archivo = output<File | null>();

  protected readonly etiquetaId = uniqueUiId('ui-archivo-etiqueta');
  protected readonly formatoId = uniqueUiId('ui-archivo-formato');
  protected readonly elegidoId = uniqueUiId('ui-archivo-elegido');
  protected readonly mensajeId = uniqueUiId('ui-archivo-mensaje');
  protected readonly elegido = signal<File | null>(null);
  protected readonly encima = signal(false);
  private readonly errorPropio = signal<string | null>(null);
  private readonly entrada = viewChild.required<ElementRef<HTMLInputElement>>('entrada');

  protected readonly mensajeError = computed(() => this.error() || this.errorPropio());
  protected readonly textoFormato = computed(() => {
    const tipos = this.acepta().split(',').map(tipo => tipo.trim()).filter(Boolean);
    return tipos.length ? `Formato ${tipos.join(' o ')}` : '';
  });
  /** El control lee el formato, el archivo elegido y el mensaje (ayuda o error), en ese orden. */
  protected readonly describe = computed(() => {
    const ids = [this.formatoId];
    if (this.elegido()) ids.push(this.elegidoId);
    if (this.mensajeError() || this.ayuda()) ids.push(this.mensajeId);
    return ids.join(' ');
  });

  protected tamano(bytes: number): string {
    return tamanoLegible(bytes);
  }

  protected alElegir(evento: Event): void {
    const archivo = (evento.target as HTMLInputElement).files?.[0] ?? null;
    this.tomar(archivo);
  }

  protected alEntrar(evento: DragEvent): void {
    // Sin `preventDefault` el navegador no deja soltar y abriría el archivo en la pestaña.
    if (!evento.dataTransfer?.types?.includes('Files')) return;
    evento.preventDefault();
    evento.dataTransfer.dropEffect = 'copy';
    this.encima.set(true);
  }

  protected alSalir(evento: DragEvent): void {
    // Pasar sobre un hijo de la zona también dispara `dragleave`: solo cuenta salir de la zona.
    const zona = evento.currentTarget as HTMLElement;
    if (evento.relatedTarget instanceof Node && zona.contains(evento.relatedTarget)) return;
    this.encima.set(false);
  }

  protected alSoltar(evento: DragEvent): void {
    evento.preventDefault();
    this.encima.set(false);
    const archivo = evento.dataTransfer?.files?.[0] ?? null;
    if (!archivo) return;
    // El control nativo se vacía en los dos casos: si guardara el archivo elegido antes con el diálogo, volver a elegir
    // ese mismo archivo no dispararía `change` y la zona se quedaría con el soltado.
    this.entrada().nativeElement.value = '';
    if (!archivoAceptado(archivo, this.acepta())) {
      // Rechazar un reemplazo también suelta el archivo anterior: quien usa la zona no debe poder importar en silencio
      // la lista de antes mientras el campo muestra un error sobre la nueva.
      this.tomar(null);
      this.errorPropio.set(`Ese archivo no es del formato pedido. ${this.textoFormato()}.`);
      return;
    }
    this.tomar(archivo);
  }

  protected quitar(): void {
    const entrada = this.entrada().nativeElement;
    entrada.value = '';
    this.tomar(null);
    // El botón desaparece: el foco vuelve al control, no se pierde en el documento.
    entrada.focus();
  }

  private tomar(archivo: File | null): void {
    this.errorPropio.set(null);
    this.elegido.set(archivo);
    this.archivo.emit(archivo);
  }
}
