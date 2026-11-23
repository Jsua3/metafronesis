import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked,
} from '@angular/core';

import type { CanLeave } from '../../../../core/navigation/can-leave.guard';
import { UiDialog } from '../../../../shared/ui/dialog/ui-dialog';
import { UiPortadaCaso } from '../../../../shared/ui/portada-caso/ui-portada-caso';
import { AutoAltoDirective } from '../../marco/auto-alto.directive';
import { type Comando, EstudioRanuraDirective, EstudioSeccionComponent, injectComandos } from '../../marco/estudio';
import { CasoStore } from '../../estado/caso.store';
import {
  MAX_CONTEXTO, MAX_LARGO_OBJETIVO, MAX_NOMBRE, MAX_OBJETIVOS, problemaDeNombre, revisarFicha,
} from '../../modelo/ficha';
import { MAX_LARGO_TEMA, MAX_TEMAS, normalizarTemas, problemaDeTema } from '../../modelo/temas-sensibles';

/** Cómo va el guardado de esta pantalla, por la forma del aviso (el color nunca es lo único que lo dice). */
type Situacion = { forma: 'guardando' | 'guardado' | 'error' | 'corregir' | ''; texto: string };

/**
 * Datos del caso: lo que el estudiante lee antes de empezar (el contexto, los objetivos y los temas sensibles) y el nombre.
 * Aquí no hay botón de guardar: el editor es un solo formulario con un solo modelo de guardado, el automático (EDITOR.md
 * §3.3). Cada campo se guarda al salir de él, por la misma cola que todo lo demás, y el estado se dice junto al título y en
 * la barra. Si un valor rompe una regla del sistema (texto plano, topes) no se guarda: el campo lo dice y conserva lo escrito,
 * y los demás campos se guardan igual (un nombre vacío no retiene un contexto bueno). Lo que queda solo en pantalla (un
 * campo por corregir o un tema escrito sin agregar) se pregunta antes de cambiar de pantalla (`canLeave`).
 * En el Inspector, «Así aparece para el estudiante» se redibuja con cada letra. Un caso que ya no es un borrador se lee, pero
 * no se cambia.
 *
 * Disposición del estudio (EDITOR-PRO.md): el formulario es una hoja de secciones plegables (`app-estudio-seccion`) con su
 * resumen a la vista; la vista previa va en la ranura `inspector` y las cuentas en la barra de estado. Patrón: State (la
 * situación del guardado es un estado derivado) y Observer (señales); el guardado pasa por la Facade del store.
 */
@Component({
  selector: 'app-datos',
  imports: [UiPortadaCaso, AutoAltoDirective, EstudioRanuraDirective, EstudioSeccionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './datos.component.html',
  styleUrl: './datos.component.scss',
})
export class DatosComponent implements CanLeave {
  protected readonly store = inject(CasoStore);
  private readonly dialogo = inject(UiDialog);
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly maxContexto = MAX_CONTEXTO;
  protected readonly maxObjetivos = MAX_OBJETIVOS;
  protected readonly maxLargoObjetivo = MAX_LARGO_OBJETIVO;
  protected readonly maxTemas = MAX_TEMAS;
  protected readonly maxLargoTema = MAX_LARGO_TEMA;

  /**
   * Lo que se escribe: parte de lo que tiene el caso y vuelve a partir de ahí solo cuando el caso se abre o se relee. Si el
   * sistema no acepta un cambio, el borrador del caso vuelve a lo de antes, pero el campo conserva lo escrito.
   */
  protected readonly nombre = signal('');
  protected readonly contexto = signal('');
  protected readonly objetivos = signal<string[]>([]);
  protected readonly temas = signal<string[]>([]);
  protected readonly temaNuevo = signal('');
  /** Qué secciones están abiertas (todas al entrar: la docente ve el formulario entero y pliega lo que ya revisó). */
  protected readonly abiertaIdentidad = signal(true);
  protected readonly abiertaContexto = signal(true);
  protected readonly abiertaObjetivos = signal(true);
  protected readonly errorTema = signal<string | null>(null);
  /** Lo último que esta pantalla dijo del guardado; la lectura de un caso nuevo lo borra. */
  private readonly aviso = signal<Situacion>({ forma: '', texto: '' });

  protected readonly soloLectura = computed(() => this.store.soloLectura());
  /** El bloque de temas sensibles solo se pinta si el servidor los guarda (RK-7): con uno anterior no llegan. */
  protected readonly conTemas = computed(() => this.store.caso()?.temasSensibles !== undefined);
  /** Lo que la sección «Antes de empezar» dice plegada: cuánto contexto hay escrito. */
  protected readonly resumenContexto = computed(() => {
    const escrito = this.contexto().trim() ? 'Contexto escrito' : 'Sin contexto';
    if (!this.conTemas()) return escrito;
    const n = this.temas().length;
    return `${escrito} · ${n} ${n === 1 ? 'tema' : 'temas'}`;
  });
  protected readonly objetivosVista = computed(() => this.objetivos().map((o) => o.trim()).filter(Boolean));
  protected readonly errores = computed(() => ({
    ...revisarFicha(this.contexto(), this.objetivos().join('\n')),
    // Un nombre que no se tocó no se juzga: solo se revisa lo que la persona cambió.
    nombre: this.nombre().trim() === (this.store.caso()?.titulo ?? '') ? null : problemaDeNombre(this.nombre()),
  }));

  /**
   * Lo que se dice del guardado. El conflicto y el error del almacén mandan sobre el aviso propio, porque dicen lo que de
   * verdad pasó (y el aviso de arriba trae sus salidas); «corrige lo marcado» manda sobre ellos porque es lo que la persona
   * tiene a la vista.
   */
  protected readonly situacion = computed<Situacion>(() => {
    const aviso = this.aviso();
    if (aviso.forma === 'corregir') return aviso;
    if (this.store.conflicto()) return { forma: 'error', texto: 'Otra persona cambió el caso. Lo que escribiste sigue aquí; el aviso de arriba te deja recargarlo.' };
    // Lo que dijo esta pantalla de SU último guardado manda sobre un error que dejó otra operación (sigue en el aviso de arriba).
    if (aviso.forma) return aviso;
    if (this.store.error()) return { forma: 'error', texto: 'No se pudo guardar. Lo escrito sigue en los campos; revisa el aviso.' };
    return aviso;
  });

  constructor() {
    // La paleta (Ctrl+K) lleva a cada campo: en un formulario largo es más rápido que desplazarse.
    injectComandos((): Comando[] => [
      { id: 'datos:nombre', grupo: 'Datos del caso', titulo: 'Ir al nombre del caso', ejecutar: () => this.enfocar('d-nombre', this.abiertaIdentidad) },
      { id: 'datos:contexto', grupo: 'Datos del caso', titulo: 'Ir al contexto', ejecutar: () => this.enfocar('d-contexto', this.abiertaContexto) },
      ...(this.soloLectura() ? [] : [
        { id: 'datos:objetivo', grupo: 'Datos del caso', titulo: 'Agregar un objetivo de aprendizaje', ejecutar: () => { this.abiertaObjetivos.set(true); this.agregarObjetivo(); } },
        ...(this.conTemas() ? [{ id: 'datos:tema', grupo: 'Datos del caso', titulo: 'Agregar un tema sensible', ejecutar: () => this.enfocar('d-tema', this.abiertaContexto) }] : []),
      ]),
    ]);
    effect(() => {
      this.store.lectura();
      untracked(() => {
        const caso = this.store.caso();
        this.nombre.set(caso?.titulo ?? '');
        this.contexto.set(caso?.contexto ?? '');
        this.objetivos.set([...(caso?.objetivos ?? [])]);
        this.temas.set([...(caso?.temasSensibles ?? [])]);
        this.aviso.set({ forma: '', texto: '' });
      });
    });
  }

  /** Abre la sección del campo y lo enfoca cuando ya se puede (el cuerpo plegado es `inert`). */
  private enfocar(id: string, seccion: { set(v: boolean): void }): void {
    seccion.set(true);
    afterNextRender(() => this.anfitrion.querySelector<HTMLElement>(`#${id}`)?.focus(), { injector: this.injector });
  }

  protected tope(n: number): string {
    return n.toLocaleString('es-CO');
  }

  protected escribirObjetivo(indice: number, valor: string): void {
    // Un pegado con saltos de línea se vuelve una sola frase.
    const limpio = valor.replace(/\s*[\r\n]+\s*/g, ' ');
    this.objetivos.update((lista) => lista.map((o, i) => (i === indice ? limpio : o)));
  }

  protected agregarObjetivo(): void {
    if (this.objetivos().length >= MAX_OBJETIVOS) return;
    this.objetivos.update((lista) => [...lista, '']);
    const indice = this.objetivos().length - 1;
    afterNextRender(() => this.anfitrion.querySelector<HTMLElement>(`#d-objetivo-${indice}`)?.focus(), { injector: this.injector });
  }

  protected quitarObjetivo(indice: number): void {
    this.objetivos.update((lista) => lista.filter((_, i) => i !== indice));
    this.guardarAlSalir();
  }

  /** Agrega el tema escrito; si rompe una regla se queda en el campo con su error. Guarda al momento: es una acción, no un texto. */
  protected agregarTema(evento?: Event): void {
    evento?.preventDefault();
    if (this.soloLectura()) return;
    const texto = this.temaNuevo().trim();
    if (!texto) return;
    const problema = problemaDeTema(texto, this.temas());
    this.errorTema.set(problema);
    if (problema) return;
    this.temas.set(normalizarTemas([...this.temas(), texto]));
    this.temaNuevo.set('');
    this.guardarAlSalir();
  }

  protected quitarTema(tema: string): void {
    this.temas.update((lista) => lista.filter((t) => t !== tema));
    this.guardarAlSalir();
  }

  /**
   * Lo que se mandaría al guardar: cada campo válido con lo escrito y cada campo con error con lo que ya tiene el caso. Así
   * un error en un campo no retiene a los demás.
   */
  private valoresAGuardar() {
    const caso = this.store.caso();
    const errores = this.errores();
    return {
      contexto: errores.contexto ? (caso?.contexto ?? '') : this.contexto().trim(),
      objetivos: errores.objetivos ? [...(caso?.objetivos ?? [])] : this.objetivosVista(),
      temas: this.temas(),
      titulo: errores.nombre ? (caso?.titulo ?? '') : this.nombre().trim(),
    };
  }

  /** ¿Lo que se guardaría es distinto de lo que tiene el caso? */
  private cambiado(): boolean {
    const caso = this.store.caso();
    const v = this.valoresAGuardar();
    return v.contexto !== (caso?.contexto ?? '')
      || JSON.stringify(v.objetivos) !== JSON.stringify(caso?.objetivos ?? [])
      || (this.conTemas() && JSON.stringify(v.temas) !== JSON.stringify(caso?.temasSensibles ?? []))
      || v.titulo !== (caso?.titulo ?? '');
  }

  private conErrores(): boolean {
    const errores = this.errores();
    return !!(errores.contexto || errores.objetivos || errores.nombre);
  }

  /**
   * Al salir de un campo, se guarda todo lo válido que cambió. Si algún campo tiene un error, ese se queda marcado con lo
   * escrito (sin mover el foco) y el aviso lo recuerda; lo demás se guarda igual.
   */
  protected guardarAlSalir(): void {
    if (this.soloLectura()) return;
    if (!this.errores().nombre) this.nombre.set(this.nombre().trim()); // lo que se ve en el campo es lo que se guarda
    if (this.cambiado()) void this.enviar();
    else if (this.conErrores()) this.aviso.set({ forma: 'corregir', texto: 'Corrige lo marcado para poder guardar.' });
    // Corrigió el error y lo escrito volvió a ser lo que ya estaba guardado: no hay nada que enviar, pero lo honesto es
    // decir que está guardado (antes quedaba el estado en blanco y la docente no sabía si se había perdido algo).
    else if (this.aviso().forma === 'corregir') this.aviso.set({ forma: 'guardado', texto: 'Guardado.' });
  }

  private async enviar(): Promise<void> {
    // El error de OTRA operación (y su resumen de lo descartado) no se borra aquí: es lo que la docente necesita para
    // rehacerla, y se va solo cuando ella lo descarta en el aviso de arriba.
    const v = this.valoresAGuardar();
    const descartadoAntes = this.store.descartado(); // cada rechazo deja una lista nueva: así se sabe si fue ESTE guardado
    this.aviso.set({ forma: 'guardando', texto: 'Guardando…' });
    this.store.editarFicha(v.contexto, v.objetivos, { ...(this.conTemas() ? { temas: v.temas } : {}), titulo: v.titulo });
    await this.store.sincronizado();
    if (this.store.descartado() !== descartadoAntes && this.store.error()) {
      this.aviso.set({ forma: 'error', texto: 'No se pudo guardar. Lo escrito sigue en los campos; revisa el aviso.' });
      return;
    }
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.aviso.set(this.conErrores()
      ? { forma: 'corregir', texto: 'Se guardó lo demás. Corrige lo marcado para guardarlo también.' }
      : { forma: 'guardado', texto: 'Guardado.' });
  }

  /**
   * Cambiar de pantalla (o salir) con algo que solo está aquí: un campo con error o un tema escrito sin agregar. Se pregunta
   * nombrándolo, con «Seguir editando» como acción segura. Lo demás ya viaja por la cola del store.
   */
  async canLeave(): Promise<boolean> {
    if (this.soloLectura()) return true;
    const errores = this.errores();
    const motivos: string[] = [];
    if (errores.nombre) motivos.push('el nombre del caso');
    if (errores.contexto) motivos.push('el contexto');
    if (errores.objetivos) motivos.push('los objetivos');
    if (this.conTemas() && this.temaNuevo().trim()) motivos.push(`el tema «${this.temaNuevo().trim()}», que no agregaste`);
    if (!motivos.length) return true;
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    const respuesta = await this.dialogo.consequence({
      title: 'Hay datos sin guardar',
      consequence: `Si cambias de pantalla se pierde lo que no se pudo guardar: ${motivos.join(', ')}.`,
      continueLabel: 'Seguir editando',
      proceedLabel: 'Salir sin guardarlo',
    });
    return respuesta === 'proceed';
  }
}
