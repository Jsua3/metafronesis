import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, model, signal, viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import type { GenerationStatus } from '../../../../core/models/generacion.model';
import { AutoriaApiService } from '../../api/autoria-api.service';
import { ErrorDeInicio, GeneracionService } from '../../generacion/generacion.service';
import { rutaDelEditor } from '../../rutas';

export const MINIMO_DESCRIPCION = 40;
export const MAXIMO_DESCRIPCION = 2000;

/**
 * «Describe tu caso» (paso 2 de crear un caso): un párrafo y la IA arma el borrador por etapas. Revisa si la generación
 * está disponible, si la docente ya tiene una a medio hacer (se retoma o se cancela) y, si no, pide la descripción y
 * navega a la pantalla de avance. Cada error de inicio (P10) tiene su rama: campo, ya en curso, límite del día, apagada.
 */
@Component({
  selector: 'app-describir',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="describir" aria-label="Describe tu caso" data-accion="describir-caso">
      @if (cargando()) {
        <p role="status" class="texto-secundario">Revisando si puedes generar un caso…</p>
      } @else if (retomable(); as r) {
        <div class="tarjeta retomar">
          <p>{{ textoRetomar() }}</p>
          <div class="acciones">
            <button type="button" class="boton boton-primario" (click)="retomar(r.id)">Retomar</button>
            <button type="button" class="boton" [attr.aria-disabled]="cancelando()" (click)="cancelarYEmpezarOtro(r.id)">
              Cancelar y empezar otro
            </button>
          </div>
          @if (errorAlCancelar()) {
            <p class="aviso-error tarjeta" role="alert">{{ errorAlCancelar() }}</p>
          }
        </div>
      } @else if (!estado()) {
        <div class="tarjeta retomar">
          <p role="alert">{{ errorDeEstado }}</p>
          <div class="acciones">
            <button type="button" class="boton" (click)="cargar()">Volver a intentarlo</button>
          </div>
        </div>
      } @else if (!habilitada()) {
        <p class="tarjeta" role="status">{{ textoApagada() }}</p>
      } @else {
        <form class="formulario" novalidate (submit)="$event.preventDefault(); generar()">
          @if (errorLugar()) {
            <p id="lugar-error" class="error-campo" role="alert"><span aria-hidden="true">! </span>{{ errorLugar() }}</p>
          }
          <div class="campo">
            <label for="descripcion">Describe la situación y lo que debe aprender el estudiante</label>
            <p id="descripcion-ayuda" class="texto-secundario">
              Por ejemplo: quién consulta, qué le pasó, dónde ocurre y qué esperas que el estudiante practique. Entre 40 y 2000 caracteres.
            </p>
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <p id="descripcion-datos" class="aviso-datos"><span aria-hidden="true">▲ </span>No escribas datos reales de personas: ni nombres, ni correos, ni teléfonos, ni números de documento.</p>
            <textarea #campoDescripcion id="descripcion" name="descripcion" rows="7" [attr.maxlength]="maximo" [value]="descripcion()"
                      [attr.aria-invalid]="errorCampo() ? 'true' : null" [attr.aria-describedby]="describedbyCampo()"
                      (input)="escribir($event)"></textarea>
            <p id="descripcion-cuenta" class="texto-secundario cuenta">{{ largo() }} de {{ maximo }}</p>
            @if (errorCampo()) {
              <p id="descripcion-error" class="error-campo" role="alert"><span aria-hidden="true">! </span>{{ errorCampo() }}</p>
            }
          </div>
          <p class="texto-secundario">{{ textoRestantes() }}</p>
          <p class="texto-secundario">La IA escribe un borrador. Nada se publica sin tu revisión y la de Psicología.</p>
          @if (errorGeneral()) {
            <p id="descripcion-general" class="aviso-error tarjeta" role="alert">{{ errorGeneral() }}</p>
          }
          <div class="acciones">
            <button type="submit" class="boton boton-primario" [attr.aria-disabled]="!puedeGenerar()"
                    [attr.aria-describedby]="botonDescribedby()">
              {{ enviando() ? 'Empezando…' : 'Generar el caso con IA' }}
            </button>
            @if (!largoSuficiente()) {
              <span id="descripcion-falta" class="texto-secundario">Escribe al menos 40 caracteres.</span>
            }
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .describir, .formulario { display: flex; flex-direction: column; gap: 0.75rem; min-inline-size: 0; }
    .formulario { max-inline-size: 48rem; }
    .campo { display: flex; flex-direction: column; gap: 0.25rem; }
    .campo label { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo p, .formulario > p, .retomar p { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    /* El cuadro crece con lo que se escribe (E0); el mínimo da cabida a un párrafo sin que la docente tenga que estirarlo. */
    textarea {
      min-block-size: 9rem; padding: 0.5rem 0.75rem; font: inherit; line-height: 1.5rem; color: var(--tinta); background: var(--superficie);
      border: 1px solid var(--borde-control); border-radius: var(--radio-control);
    }
    textarea[aria-invalid='true'] { border-color: var(--peligro); box-shadow: inset 0 0 0 1px var(--peligro); }
    .aviso-datos { padding: 0.5rem 0.75rem; border-inline-start: 4px solid var(--borde-control); border-radius: var(--radio-control); background: var(--fondo-hundido); font-weight: 700; }
    .cuenta { align-self: flex-end; }
    .error-campo { color: var(--peligro); font-weight: 700; }
    .retomar { display: flex; flex-direction: column; gap: 0.75rem; }
    .aviso-error { margin: 0; border-color: var(--peligro); background: var(--peligro-tinte); }
    .acciones { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; }
    @media (max-width: 40rem) { .acciones .boton { flex: 1 1 100%; } }
  `,
})
export class DescribirComponent {
  /** El lugar elegido en el paso 1. */
  readonly lugarId = input.required<string>();

  private readonly generacion = inject(GeneracionService);
  private readonly autoria = inject(AutoriaApiService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly campoDescripcion = viewChild<ElementRef<HTMLTextAreaElement>>('campoDescripcion');

  protected readonly maximo = MAXIMO_DESCRIPCION;
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  protected readonly motivoApagada = 'La generación con IA no está disponible por ahora. Puedes elegir las salas a mano.';
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  protected readonly errorDeEstado = 'No pudimos saber si puedes generar un caso. Vuelve a intentarlo.';

  protected readonly estado = signal<GenerationStatus | null>(null);
  protected readonly cargando = signal(true);
  /** La generación a medio hacer que se ofrece retomar: la del servidor o la que dijo un `GENERATION_IN_PROGRESS`. */
  protected readonly retomable = signal<{ id: string; lugarId: string | null } | null>(null);
  private readonly lugares = signal<Record<string, string>>({});
  /** Lo que escribe la docente. Lo guarda el paso 2 (`[(descripcion)]`) para que no se pierda si cambia a «Elegir salas a mano» y vuelve. */
  readonly descripcion = model('');
  protected readonly enviando = signal(false);
  protected readonly cancelando = signal(false);
  protected readonly errorCampo = signal<string | null>(null);
  /** El servidor rechazó el lugar (`field: "lugarId"`): se dice arriba del formulario, donde se ve qué lugar es. */
  protected readonly errorLugar = signal<string | null>(null);
  protected readonly errorGeneral = signal<string | null>(null);
  protected readonly errorAlCancelar = signal<string | null>(null);
  /** El servidor dijo que se agotó el cupo del día: no se vuelve a pedir. */
  private readonly limiteAlcanzado = signal(false);
  /** El servidor dijo (404) que la generación está apagada. */
  private readonly apagadaPorServidor = signal(false);
  /** Lo que dijo el servidor al responder 404, para mostrarlo tal cual. */
  private readonly mensajeApagada = signal<string | null>(null);

  protected readonly habilitada = computed(() => !!this.estado()?.enabled && !this.apagadaPorServidor());
  protected readonly textoApagada = computed(() => {
    const dicho = this.mensajeApagada();
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    return dicho ? `${dicho} Puedes elegir las salas a mano.` : this.motivoApagada;
  });
  protected readonly largo = computed(() => this.descripcion().length);
  protected readonly largoSuficiente = computed(() => this.descripcion().trim().length >= MINIMO_DESCRIPCION);
  protected readonly puedeGenerar = computed(() => this.largoSuficiente() && !this.enviando() && !this.limiteAlcanzado());
  protected readonly textoRestantes = computed(() => {
    const n = this.estado()?.remainingToday ?? 0;
    // BORRADOR: el singular es texto nuevo, pendiente de la aprobación de Psicología
    return n === 1 ? 'Te queda 1 caso generado hoy.' : `Te quedan ${n} casos generados hoy.`;
  });
  protected readonly textoRetomar = computed(() => {
    const r = this.retomable();
    const nombre = r?.lugarId ? this.lugares()[r.lugarId] ?? r.lugarId : null;
    // BORRADOR: la variante sin lugar es texto nuevo, pendiente de la aprobación de Psicología
    return nombre ? `Tienes un caso a medio generar en ${nombre}.` : 'Tienes un caso a medio generar.';
  });
  protected readonly describedbyCampo = computed(() => {
    const ids = ['descripcion-ayuda', 'descripcion-datos', 'descripcion-cuenta'];
    if (this.errorCampo()) ids.push('descripcion-error');
    return ids.join(' ');
  });
  protected readonly botonDescribedby = computed(() => {
    if (!this.largoSuficiente()) return 'descripcion-falta';
    return this.errorGeneral() && this.limiteAlcanzado() ? 'descripcion-general' : null;
  });

  constructor() {
    void this.cargar();
    void this.cargarLugares();
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const estado = await this.generacion.estado();
      this.estado.set(estado);
      this.retomable.set(estado.inProgress ? { id: estado.inProgress.id, lugarId: estado.inProgress.lugarId } : null);
    } catch {
      this.estado.set(null);
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarLugares(): Promise<void> {
    try {
      const lista = await firstValueFrom(this.autoria.lugares());
      this.lugares.set(Object.fromEntries(lista.map((l) => [l.id, l.nombre])));
    } catch {
      // sin los nombres, el aviso dice el id del lugar
    }
  }

  protected escribir(evento: Event): void {
    this.descripcion.set((evento.target as HTMLTextAreaElement).value);
    this.errorCampo.set(null);
  }

  protected async generar(): Promise<void> {
    if (!this.puedeGenerar()) return;
    this.enviando.set(true);
    this.errorCampo.set(null);
    this.errorLugar.set(null);
    this.errorGeneral.set(null);
    try {
      const id = await this.generacion.empezar(this.lugarId(), this.descripcion().trim());
      await this.router.navigateByUrl(rutaDelEditor(`/generando/${encodeURIComponent(id)}`, null));
    } catch (e) {
      await this.mostrarErrorDeInicio(e);
    } finally {
      this.enviando.set(false);
    }
  }

  private async mostrarErrorDeInicio(e: unknown): Promise<void> {
    if (!(e instanceof ErrorDeInicio)) {
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      this.errorGeneral.set('No pudimos empezar el caso. Vuelve a intentarlo en un momento.');
      return;
    }
    switch (e.tipo) {
      case 'campo':
        if (e.campo === 'descripcion') {
          this.errorCampo.set(e.mensaje);
          afterNextRender(() => this.campoDescripcion()?.nativeElement.focus(), { injector: this.injector });
        } else {
          this.errorLugar.set(e.mensaje);
        }
        break;
      case 'en-curso':
        await this.ofrecerRetomar(e);
        break;
      case 'limite':
        // Mensaje fijo y sin reintento: el cupo de hoy ya se gastó.
        this.limiteAlcanzado.set(true);
        this.errorGeneral.set(e.mensaje);
        break;
      case 'apagado':
        this.apagadaPorServidor.set(true);
        this.mensajeApagada.set(e.mensaje);
        break;
      default:
        this.errorGeneral.set(e.mensaje);
    }
  }

  /** `GENERATION_IN_PROGRESS`: ya había una en curso (por ejemplo en otra pestaña); se ofrece retomarla con su id. */
  private async ofrecerRetomar(e: ErrorDeInicio): Promise<void> {
    await this.cargar();
    const delServidor = this.estado()?.inProgress;
    const id = e.generationId ?? delServidor?.id;
    if (!id) {
      this.errorGeneral.set(e.mensaje);
      return;
    }
    this.retomable.set({ id, lugarId: delServidor?.id === id ? delServidor.lugarId : null });
  }

  protected retomar(id: string): void {
    void this.router.navigateByUrl(rutaDelEditor(`/generando/${encodeURIComponent(id)}`, null));
  }

  protected async cancelarYEmpezarOtro(id: string): Promise<void> {
    if (this.cancelando()) return;
    this.cancelando.set(true);
    this.errorAlCancelar.set(null);
    try {
      await this.generacion.cancelar(id);
      this.retomable.set(null);
      await this.cargar();
      // El botón pulsado desaparece con el aviso de retomar: el foco va al cuadro de la descripción.
      afterNextRender(() => this.campoDescripcion()?.nativeElement.focus(), { injector: this.injector });
    } catch {
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      this.errorAlCancelar.set('No pudimos cancelar el caso. Vuelve a intentarlo.');
    } finally {
      this.cancelando.set(false);
    }
  }
}
