import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { MovimientoPersonaje } from '../../modelo/caso';

type Ruta = Extract<MovimientoPersonaje, { tipo: 'ruta' }>;

@Component({
  selector: 'app-trayecto-de-persona',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
    <p>Elige un punto y usa las flechas del teclado o haz clic en la sala. Mayús mueve un píxel.</p>
    <ol>
      @for (p of ruta().puntos; track $index; let i = $index) {
        <li>
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <button type="button" class="boton" [attr.aria-pressed]="seleccionado() === i" (click)="elegir.emit(i)"
            (keydown)="tecla($event, i)">Punto {{ i + 1 }}: {{ p.x }}, {{ p.y }}</button>
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <button type="button" class="boton" [attr.data-subir]="i" [disabled]="i === 0" (click)="ordenar(i, -1)">Subir</button>
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <button type="button" class="boton" [disabled]="i === ruta().puntos.length - 1" (click)="ordenar(i, 1)">Bajar</button>
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <button type="button" class="boton" [attr.data-quitar]="i" [disabled]="ruta().puntos.length <= 2" (click)="quitar(i)">Quitar</button>
        </li>
      }
    </ol>
    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
    <button type="button" class="boton" data-agregar [disabled]="ruta().puntos.length >= 8" (click)="agregar()">Agregar punto</button>
    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
    <label>Modo
      <select [value]="ruta().modo" (change)="modo($any($event.target).value)">
        <option value="circuito">En circuito</option><option value="ida-y-vuelta">Ida y vuelta</option>
      </select>
    </label>
    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
    <label>Pausa en segundos <input type="number" min="0" max="10" step="0.001" [value]="segundos()"
      (change)="pausa($any($event.target).value)" /></label>
    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
    <p>Sin número: pausa al azar de 1 a 3 s</p>
  `,
})
export class TrayectoDePersonaComponent {
  readonly ruta = input.required<Ruta>();
  readonly seleccionado = input<number | null>(null);
  readonly cambio = output<Ruta>();
  readonly elegir = output<number>();

  protected segundos(): number | string { return this.ruta().pausaMs === undefined ? '' : this.ruta().pausaMs! / 1000; }
  protected agregar(): void {
    const puntos = this.ruta().puntos;
    if (puntos.length < 8) this.cambio.emit({ ...this.ruta(), puntos: [...puntos, { ...puntos[puntos.length - 1] }] });
  }
  protected quitar(i: number): void {
    if (this.ruta().puntos.length > 2) this.cambio.emit({ ...this.ruta(), puntos: this.ruta().puntos.filter((_, j) => j !== i) });
  }
  protected ordenar(i: number, d: number): void {
    const puntos = [...this.ruta().puntos], j = i + d;
    if (j < 0 || j >= puntos.length) return;
    [puntos[i], puntos[j]] = [puntos[j], puntos[i]];
    this.cambio.emit({ ...this.ruta(), puntos });
  }
  protected modo(modo: Ruta['modo']): void { this.cambio.emit({ ...this.ruta(), modo }); }
  protected pausa(valor: string): void {
    const { pausaMs: _, ...ruta } = this.ruta();
    if (!valor.trim()) { this.cambio.emit(ruta); return; }
    const ms = Number(valor) * 1000;
    if (Number.isInteger(ms) && ms >= 0 && ms <= 10000) this.cambio.emit({ ...ruta, pausaMs: ms });
  }
  protected tecla(evento: KeyboardEvent, i: number): void {
    if (evento.ctrlKey || evento.metaKey) return;
    const paso = evento.shiftKey ? 1 : 8;
    const direcciones: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso],
    };
    const d = direcciones[evento.key];
    if (!d) return;
    evento.preventDefault(); evento.stopPropagation();
    const puntos = this.ruta().puntos.map((p, j) => j === i ? { x: p.x + d[0], y: p.y + d[1] } : p);
    this.elegir.emit(i); this.cambio.emit({ ...this.ruta(), puntos });
  }
}
