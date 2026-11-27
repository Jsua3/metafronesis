import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { EstudianteSugerido, GrupoService } from '../../core/api/grupo.service';
import { uniqueUiId } from '../../shared/ui/button/click-guard';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';

/** Caracteres mínimos para pedir sugerencias (el servidor aplica el mismo mínimo). */
export const SUGERENCIAS_MIN = 2;
/** Espera tras la última tecla antes de preguntar al servidor. */
export const SUGERENCIAS_DEBOUNCE_MS = 250;

const USUARIO = /^[\w.+-]+$/;

/** Un correo válido o un nombre de usuario (lo que va antes de la @) sin espacios. */
export function correoOUsuario(control: AbstractControl<string | null>): ValidationErrors | null {
  const valor = (control.value ?? '').trim();
  if (!valor) return null;
  if (valor.includes('@')) return Validators.email(control);
  return USUARIO.test(valor) ? null : { correoOUsuario: true };
}

/**
 * Campo «Correo o nombre de usuario» del formulario de invitar, con sugerencias de estudiantes registrados mientras
 * se escribe. Patrón ARIA combobox con lista (APG «combobox with listbox popup»): el foco se queda en el campo,
 * las flechas mueven la opción activa (`aria-activedescendant`), Enter la elige y Escape cierra la lista. Elegir una
 * sugerencia escribe su correo en el campo; el envío sigue siendo el del formulario.
 */
@Component({
  selector: 'gl-campo-invitar',
  imports: [ReactiveFormsModule, UiField, UiControl],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './campo-invitar-estudiante.component.scss',
  template: `
    <ui-field label="Correo o nombre de usuario" required [hint]="hint" [error]="error()">
      <div class="gl-combo">
        <input uiControl type="text" role="combobox" [formControl]="control()" autocomplete="off" spellcheck="false"
          autocapitalize="none" aria-autocomplete="list" [attr.aria-controls]="listaId" [attr.aria-expanded]="abierta()"
          [attr.aria-activedescendant]="opcionActivaId()"
          (input)="escribir($any($event.target).value)" (keydown)="tecla($event)" (focus)="enfocado = true" (blur)="salir()">
        <ul role="listbox" class="gl-combo__lista" [id]="listaId" aria-label="Estudiantes registrados" [hidden]="!abierta()">
          @for (s of sugerencias(); track s.email; let i = $index) {
            <li role="option" class="gl-combo__opcion" [id]="opcionId(i)" [attr.aria-selected]="i === activa()"
              (mousedown)="$event.preventDefault()" (mousemove)="activa.set(i)" (click)="elegir(s)">
              <span class="gl-combo__nombre">{{ s.nombre || s.usuario }}</span>
              <span class="gl-combo__detalle">{{ s.usuario }} · {{ s.email }}</span>
            </li>
          }
        </ul>
      </div>
    </ui-field>
    <p class="ds-sr-only" aria-live="polite">{{ anuncio() }}</p>
  `,
})
export class CampoInvitarEstudianteComponent {
  readonly control = input.required<FormControl<string | null>>();
  readonly grupoId = input.required<number>();
  readonly error = input<string | null>(null);

  protected readonly hint = 'Escribe al menos 2 letras para ver sugerencias. Recibe una invitación y entra al grupo cuando la acepta.';
  protected readonly listaId = uniqueUiId('gl-combo-lista');

  readonly sugerencias = signal<EstudianteSugerido[]>([]);
  readonly activa = signal(-1);
  readonly abierta = signal(false);
  protected readonly anuncio = signal('');
  protected readonly opcionActivaId = computed(() =>
    this.abierta() && this.activa() >= 0 ? this.opcionId(this.activa()) : null);

  protected enfocado = false;
  private readonly grupoService = inject(GrupoService);
  private readonly consultas = new Subject<string>();

  constructor() {
    this.consultas.pipe(
      debounceTime(SUGERENCIAS_DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap(q => q.length < SUGERENCIAS_MIN
        ? of(null)
        : this.grupoService.sugerirEstudiantes(this.grupoId(), q).pipe(catchError(() => of(null)))),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe(lista => this.mostrar(lista ?? []));
  }

  protected opcionId(i: number): string {
    return `${this.listaId}-${i}`;
  }

  escribir(valor: string): void {
    const q = valor.trim();
    if (q.length < SUGERENCIAS_MIN) this.cerrar(true);
    this.consultas.next(q);
  }

  tecla(event: KeyboardEvent): void {
    const total = this.sugerencias().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!total) return;
        event.preventDefault();
        const abajo = event.key === 'ArrowDown';
        if (!this.abierta()) {
          this.abierta.set(true);
          this.activa.set(abajo ? 0 : total - 1);
          return;
        }
        const actual = this.activa();
        this.activa.set(abajo ? (actual + 1) % total : (actual <= 0 ? total - 1 : actual - 1));
        return;
      }
      case 'Enter': {
        const elegida = this.abierta() ? this.sugerencias()[this.activa()] : undefined;
        if (!elegida) return; // sin opción activa, Enter envía el formulario
        event.preventDefault();
        this.elegir(elegida);
        return;
      }
      case 'Escape':
        if (!this.abierta()) return;
        event.preventDefault();
        event.stopPropagation();
        this.cerrar(false);
        return;
      case 'Tab':
        this.cerrar(false);
        return;
    }
  }

  elegir(sugerencia: EstudianteSugerido): void {
    this.control().setValue(sugerencia.email);
    this.control().markAsDirty();
    this.cerrar(true);
    this.anuncio.set(`Elegiste a ${sugerencia.nombre || sugerencia.usuario}.`);
  }

  salir(): void {
    this.enfocado = false;
    this.control().markAsTouched();
    this.cerrar(false);
  }

  private mostrar(lista: EstudianteSugerido[]): void {
    this.sugerencias.set(lista);
    this.activa.set(-1);
    this.abierta.set(lista.length > 0 && this.enfocado);
    if (!this.abierta()) return;
    this.anuncio.set(lista.length === 1
      ? '1 sugerencia. Usa las flechas para elegirla.'
      : `${lista.length} sugerencias. Usa las flechas para elegir una.`);
  }

  /** Cierra la lista; con `olvidar` descarta también las sugerencias (no reaparecen con las flechas). */
  private cerrar(olvidar: boolean): void {
    this.abierta.set(false);
    this.activa.set(-1);
    if (olvidar) {
      this.sugerencias.set([]);
      this.consultas.next('');
    }
  }
}
