import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, throwError } from 'rxjs';

import { AuthoringApi } from '../../../../core/api/authoring.api';
import { GeneracionService } from '../../generacion/generacion.service';
import { casoCopiadoDeLugar } from '../../testing/caso-api';
import { rutasDePrueba } from '../../testing/rutas';
import { ServidorFalso } from '../../testing/servidor-falso';
import { universidad } from '../../testing/universidad';

const DESCRIPCION = 'Una estudiante llega a Bienestar y dice que ya no puede más con lo que pasa en casa.';
const CLAVES = ['recepcion', 'consulta', 'orientacion', 'cierre'];

async function montar(opciones: { tope?: number } = {}) {
  TestBed.resetTestingModule();
  const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo']), universidad, opciones);
  await TestBed.configureTestingModule({
    providers: [provideRouter(rutasDePrueba), { provide: AuthoringApi, useValue: servidor.autoria }],
  }).compileComponents();
  const g = servidor.generaciones;
  const id = (await firstValueFrom(servidor.autoria.startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }))).id;
  const harness = await RouterTestingHarness.create();
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
  const raiz = () => harness.routeNativeElement as HTMLElement;
  /** Deja correr el servicio y repinta hasta que se cumpla lo que la prueba espera. */
  const hasta = async (condicion: () => boolean) => {
    for (let i = 0; i < 100 && !condicion(); i++) {
      await new Promise((r) => setTimeout(r, 0));
      harness.fixture.detectChanges();
    }
    expect(condicion()).toBe(true);
  };
  const ir = async () => {
    await harness.navigateByUrl(`/portal/casos/nuevo/generando/${id}`);
    harness.fixture.detectChanges();
    navegar.mockClear(); // no cuenta la navegación de la propia prueba
  };
  return { servidor, g, id, harness, raiz, hasta, ir, navegar };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(texto));
const parte = (raiz: HTMLElement, nombre: string) =>
  [...raiz.querySelectorAll<HTMLElement>('li.parte')].find((li) => li.querySelector('.nombre')!.textContent!.includes(nombre));
const anuncio = (raiz: HTMLElement) => raiz.querySelector('[role="status"]')?.textContent?.trim() ?? '';
const barra = (raiz: HTMLElement) => raiz.querySelector<HTMLElement>('[role="progressbar"]')!;
const alertas = (raiz: HTMLElement) => [...raiz.querySelectorAll<HTMLElement>('[role="alert"]')];

describe('AvanceComponent', () => {
  afterEach(() => vi.useRealTimers());

  describe('en curso', () => {
    it('la parte en curso dice que se está escribiendo y cuánto lleva; la región viva no anuncia el contador', async () => {
      // Solo el reloj y el intervalo son de mentira: los `setTimeout` del servicio y de la prueba siguen siendo reales.
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      const { g, harness, raiz, hasta, ir } = await montar();
      g.retener('skeleton');
      await ir();
      await hasta(() => anuncio(raiz()) === 'Armando el esqueleto del caso');

      expect(raiz().querySelector('h1')!.textContent).toContain('Estamos armando tu caso');
      expect(raiz().textContent).toContain('La IA escribe tu borrador parte por parte. Cada parte puede tardar un par de minutos.');
      const esqueleto = () => parte(raiz(), 'El esqueleto del caso')!;
      expect(esqueleto().getAttribute('data-estado')).toBe('en-curso');
      expect(esqueleto().textContent).toMatch(/Escribiéndose/);
      expect(esqueleto().textContent).toContain('Acaba de empezar · puede tardar un par de minutos');
      // Sin esqueleto no se sabe cuántas partes habrá: la barra no inventa un total y lo dice en palabras.
      expect(barra(raiz()).hasAttribute('aria-valuenow')).toBe(false);
      expect(barra(raiz()).getAttribute('aria-valuetext')).toBe('Armando el esqueleto: todavía no sabemos cuántas partes tendrá el caso');
      expect(raiz().querySelector('.cuenta')!.textContent!.trim()).toBe('Aún no sabemos cuántas partes tendrá tu caso.');
      // La parte en curso lleva su propio indicador de actividad (el «…» del símbolo), sin otro igual al lado.
      expect(esqueleto().querySelectorAll('.simbolo .punto')).toHaveLength(3);
      expect(esqueleto().querySelector('.tiempo .punto')).toBeNull();
      expect(parte(raiz(), 'Las escenas')!.textContent).toMatch(/○.*Pendiente.*Aparecerán aquí en cuanto el esqueleto esté listo\./s);
      expect(parte(raiz(), 'Revisión de las reglas del caso')!.textContent).toMatch(/○.*Pendiente/s);

      vi.advanceTimersByTime(40_000);
      harness.fixture.detectChanges();
      expect(esqueleto().textContent).toContain('Lleva 40 s · puede tardar un par de minutos');
      // Arriba, junto a «Ahora», también se ve cuánto lleva; pero fuera de la región viva, que sigue diciendo lo mismo.
      expect(raiz().querySelector('.ahora')!.textContent).toContain('lleva 40 s');
      expect(raiz().querySelector('[role="status"]')!.textContent).not.toContain('lleva');
      expect(raiz().querySelector('[role="status"]')!.contains(esqueleto())).toBe(false);
      expect(anuncio(raiz())).toBe('Armando el esqueleto del caso');

      vi.advanceTimersByTime(85_000);
      harness.fixture.detectChanges();
      expect(esqueleto().textContent).toContain('Lleva 2 min 5 s · está tardando más de lo normal');
      expect(anuncio(raiz())).toBe('Armando el esqueleto del caso');
    });

    it('con el esqueleto hecho muestra el título del caso y sus escenas; las dos del lote se escriben a la vez', async () => {
      const { g, raiz, hasta, ir } = await montar();
      g.retener('scene', 'recepcion');
      g.retener('scene', 'consulta');
      await ir();
      // Con dos escenas a la vez, el anuncio no repite sus títulos (están en la lista).
      await hasta(() => anuncio(raiz()) === 'Escribiendo las escenas 1 y 2 de 4');

      const esqueleto = parte(raiz(), 'El esqueleto del caso')!;
      expect(esqueleto.textContent).toMatch(/✓.*Hecha/s);
      // El título ya está arriba, en grande: el esqueleto dice qué trajo sin repetirlo.
      expect(esqueleto.textContent).toContain('Trajo el título y 4 escenas, 1 final.');
      expect(esqueleto.textContent).not.toContain('«Caso de universidad»');
      expect(raiz().querySelector('.caso')!.textContent).toContain('«Caso de universidad»');
      expect(parte(raiz(), 'Escena 1 de 4: Recepción')!.textContent).toMatch(/Escribiéndose/);
      expect(parte(raiz(), 'Escena 2 de 4: Primera escucha')!.textContent).toMatch(/Escribiéndose/);
      expect(parte(raiz(), 'Escena 3 de 4: Orientación')!.textContent).toMatch(/○.*Pendiente/s);
      // La escena final lo dice en palabras, desde que el esqueleto la da.
      expect(parte(raiz(), 'Escena 4 de 4: Cierre')!.querySelector('.final')!.textContent).toContain('Final');
      expect(parte(raiz(), 'Escena 1 de 4: Recepción')!.querySelector('.final')).toBeNull();
      expect(parte(raiz(), 'Revisión de las reglas del caso')!.textContent).toMatch(/○.*Pendiente/s);
      expect(parte(raiz(), 'Las escenas')).toBeUndefined();

      expect(raiz().textContent).toContain('1 de 6 partes hechas');
      expect(barra(raiz()).getAttribute('aria-valuemin')).toBe('0');
      expect(barra(raiz()).getAttribute('aria-valuemax')).toBe('6');
      expect(barra(raiz()).getAttribute('aria-valuenow')).toBe('1');
      expect(barra(raiz()).getAttribute('aria-valuetext')).toBe('1 de 6 partes hechas');
      expect(raiz().textContent).toContain('Puedes cerrar esta página: el avance se guarda y podrás retomarlo.');
      expect(boton(raiz(), 'Cancelar y empezar de nuevo')).toBeTruthy();
      // Con muchos intentos por delante no se habla de intentos.
      expect(raiz().textContent).not.toContain('intentos con la IA');

      g.retener('scene', 'orientacion');
      g.retener('scene', 'cierre');
      g.liberar('scene', 'recepcion');
      g.liberar('scene', 'consulta');
      await hasta(() => anuncio(raiz()) === 'Escribiendo las escenas 3 y 4 de 4');
      expect(parte(raiz(), 'Escena 1 de 4: Recepción')!.textContent).toMatch(/✓.*Hecha/s);
      expect(parte(raiz(), 'Escena 2 de 4: Primera escucha')!.textContent).toMatch(/✓.*Hecha/s);
      expect(barra(raiz()).getAttribute('aria-valuetext')).toBe('3 de 6 partes hechas');

      g.liberar('scene', 'orientacion');
      g.liberar('scene', 'cierre');
      await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
    });

    it('los intentos con la IA se muestran solo desde el 75 % del tope', async () => {
      const { g, raiz, hasta, ir } = await montar({ tope: 4 });
      g.retener('scene', 'recepcion');
      g.retener('scene', 'consulta');
      await ir();
      await hasta(() => anuncio(raiz()).startsWith('Escribiendo las escenas 1 y 2'));
      expect(raiz().textContent).not.toContain('intentos con la IA'); // 1 de 4

      g.retener('scene', 'orientacion');
      g.liberar('scene', 'recepcion');
      g.liberar('scene', 'consulta');
      await hasta(() => anuncio(raiz()).startsWith('Escribiendo las escenas 3 y 4'));
      expect(raiz().textContent).toContain('Usaste 3 de 4 intentos con la IA.');
      g.liberar('scene', 'orientacion');
    });
  });

  describe('qué falló y qué puede hacer', () => {
    it('el mensaje va junto a la parte que falló con «Reintentar esta parte», que la retoma con el foco en ella', async () => {
      const { g, raiz, hasta, ir } = await montar();
      g.fallar('scene', 502, 'AI_PROVIDER_ERROR', 'malformed', 4);
      await ir();
      await hasta(() => alertas(raiz()).length > 0);

      const recepcion = parte(raiz(), 'Escena 1 de 4: Recepción')!;
      expect(recepcion.getAttribute('data-estado')).toBe('error');
      expect(recepcion.textContent).toMatch(/!.*Con error/s);
      expect(alertas(raiz())).toHaveLength(1);
      expect(recepcion.contains(alertas(raiz())[0])).toBe(true);
      expect(alertas(raiz())[0].textContent).toContain('La IA respondió algo que no pudimos usar. Vuelve a intentarlo.');
      expect(boton(recepcion, 'Reintentar esta parte')).toBeTruthy();
      // La otra escena del lote también falló: dice por qué y cómo se vuelve a pedir, sin repetir la alerta.
      expect(parte(raiz(), 'Escena 2 de 4: Primera escucha')!.textContent).toMatch(/!.*Con error.*La IA respondió algo que no pudimos usar/s);
      expect(parte(raiz(), 'Escena 2 de 4: Primera escucha')!.textContent).toContain('Se vuelve a pedir con «Reintentar esta parte».');
      expect(raiz().textContent).toContain('Se detuvo en «Escena 1 de 4: Recepción».');
      expect(anuncio(raiz())).toBe('');
      expect(boton(raiz(), 'Cancelar y empezar de nuevo')).toBeTruthy();

      g.retener('scene', 'recepcion');
      boton(recepcion, 'Reintentar esta parte')!.click();
      await hasta(() => document.activeElement === parte(raiz(), 'Escena 1 de 4: Recepción'));
      expect(parte(raiz(), 'Escena 1 de 4: Recepción')!.getAttribute('data-estado')).toBe('en-curso');
      expect(alertas(raiz())).toHaveLength(0);

      g.liberar('scene', 'recepcion');
      await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
    });

    it('una escena con error mientras se escriben otras dice cuándo podrá reintentarse', async () => {
      const { g, id, raiz, hasta, ir } = await montar();
      const api = TestBed.inject(AuthoringApi);
      await firstValueFrom(api.generationSkeleton(id));
      g.fallar('scene', 422, 'AI_REFUSED');
      await firstValueFrom(api.generationScene(id, 'recepcion')).catch(() => undefined);
      g.retener('scene', 'consulta');
      g.retener('scene', 'orientacion');
      await ir();
      await hasta(() => anuncio(raiz()) === 'Escribiendo las escenas 2 y 3 de 4');

      const recepcion = parte(raiz(), 'Escena 1 de 4: Recepción')!;
      expect(recepcion.textContent).toMatch(/!.*Con error/s);
      expect(recepcion.textContent).toContain(
        'La IA no quiso escribir esta parte. Prueba a describir el caso con otras palabras. Podrás reintentarla cuando terminen las demás.',
      );
      expect(alertas(raiz())).toHaveLength(0);
      TestBed.inject(GeneracionService).detener();
      g.liberar('scene', 'consulta');
      g.liberar('scene', 'orientacion');
    });

    it('si la IA se negó, sugiere describir el caso con otras palabras y cómo hacerlo', async () => {
      const { g, raiz, hasta, ir } = await montar();
      g.fallar('skeleton', 422, 'AI_REFUSED');
      await ir();
      await hasta(() => alertas(raiz()).length > 0);

      const esqueleto = parte(raiz(), 'El esqueleto del caso')!;
      expect(esqueleto.contains(alertas(raiz())[0])).toBe(true);
      expect(esqueleto.textContent).toContain('La IA no quiso escribir esta parte. Prueba a describir el caso con otras palabras.');
      expect(esqueleto.textContent).toContain(
        'Si vuelve a negarse, usa «Cancelar y empezar de nuevo»: vuelves a la descripción con el mismo lugar y puedes contarla con otras palabras.',
      );
      expect(boton(esqueleto, 'Reintentar esta parte')).toBeTruthy();
    });

    it('sin intentos: «Empezar un caso nuevo» junto a la parte, sin «Reintentar» ni un segundo botón que haga lo mismo', async () => {
      const { g, raiz, hasta, ir, navegar } = await montar({ tope: 4 });
      await ir();
      await hasta(() => alertas(raiz()).length > 0);

      const cierre = parte(raiz(), 'Escena 4 de 4: Cierre')!;
      expect(cierre.contains(alertas(raiz())[0])).toBe(true);
      expect(alertas(raiz())[0].textContent).toContain('Este caso ya usó todos sus intentos con la IA.');
      expect(boton(raiz(), 'Reintentar esta parte')).toBeUndefined();
      expect(boton(raiz(), 'Cancelar y empezar de nuevo')).toBeUndefined();
      expect(raiz().textContent).toContain('Usaste 4 de 4 intentos con la IA.');

      navegar.mockResolvedValue(true);
      boton(cierre, 'Empezar un caso nuevo')!.click();
      await hasta(() => navegar.mock.calls.length > 0);
      expect(navegar).toHaveBeenCalledWith('/portal/casos/nuevo/salas?lugar=universidad');
      expect(g.llamadas.some((l) => l.metodo === 'cancelGeneration')).toBe(true);
    });

    it('primera lectura fallida: el esqueleto queda con error (no «Escribiéndose») y «Reintentar esta parte» avanza', async () => {
      const { raiz, hasta, ir } = await montar();
      const api = TestBed.inject(AuthoringApi);
      const real = api.generation.bind(api);
      let lecturas = 0;
      vi.spyOn(api, 'generation').mockImplementation((i: string) =>
        ++lecturas <= 2 ? throwError(() => new HttpErrorResponse({ status: 500 })) : real(i));
      await ir();
      await hasta(() => !!boton(raiz(), 'Reintentar esta parte'));

      expect(parte(raiz(), 'El esqueleto del caso')!.textContent).toMatch(/!.*Con error/s);
      expect(parte(raiz(), 'El esqueleto del caso')!.textContent).not.toContain('Escribiéndose');

      boton(raiz(), 'Reintentar esta parte')!.click();
      await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
      expect(alertas(raiz())).toHaveLength(0);
    });

    it('«Cancelar y empezar de nuevo» cancela la generación y vuelve al paso 2 con el mismo lugar', async () => {
      const { g, raiz, hasta, ir, navegar } = await montar();
      g.fallar('skeleton', 422, 'AI_REFUSED');
      await ir();
      await hasta(() => !!boton(raiz(), 'Cancelar y empezar de nuevo'));
      navegar.mockResolvedValue(true);

      boton(raiz(), 'Cancelar y empezar de nuevo')!.click();
      await hasta(() => navegar.mock.calls.length > 0);
      expect(navegar).toHaveBeenCalledWith('/portal/casos/nuevo/salas?lugar=universidad');
      expect(g.llamadas.some((l) => l.metodo === 'cancelGeneration')).toBe(true);
    });

    it('si cancelar falla con un error a la vista, lo dice y no se queda en blanco', async () => {
      const { g, raiz, hasta, ir, navegar } = await montar();
      g.fallar('skeleton', 422, 'AI_REFUSED');
      await ir();
      await hasta(() => !!boton(raiz(), 'Cancelar y empezar de nuevo'));
      navegar.mockResolvedValue(true);
      vi.spyOn(TestBed.inject(AuthoringApi), 'cancelGeneration').mockImplementation(() => {
        throw new Error('sin red');
      });

      boton(raiz(), 'Cancelar y empezar de nuevo')!.click();
      await hasta(() => raiz().textContent!.includes('No pudimos cancelar el caso. Vuelve a intentarlo.'));
      expect(navegar).not.toHaveBeenCalled();
      expect(boton(raiz(), 'Cancelar y empezar de nuevo')).toBeTruthy();
      expect(boton(raiz(), 'Reintentar esta parte')).toBeTruthy();
    });

    it('si cancelar falla a mitad del avance, lo dice y la generación sigue (no se queda quieta)', async () => {
      const { g, raiz, hasta, ir, navegar } = await montar();
      g.retener('skeleton');
      await ir();
      await hasta(() => anuncio(raiz()) === 'Armando el esqueleto del caso');
      navegar.mockResolvedValue(true);
      vi.spyOn(TestBed.inject(AuthoringApi), 'cancelGeneration').mockImplementation(() => {
        throw new Error('sin red');
      });

      boton(raiz(), 'Cancelar y empezar de nuevo')!.click();
      await hasta(() => raiz().textContent!.includes('No pudimos cancelar el caso. Vuelve a intentarlo.'));
      expect(navegar).not.toHaveBeenCalled();
      await hasta(() => TestBed.inject(GeneracionService).trabajando());
      expect(parte(raiz(), 'El esqueleto del caso')!.getAttribute('data-estado')).toBe('en-curso');
      expect(anuncio(raiz())).toBe('Armando el esqueleto del caso');
      // La corrida retomada espera a la que sigue en curso (5 s reales): aquí basta con ver que siguió.
      TestBed.inject(GeneracionService).detener();
      g.liberar('skeleton');
    });
  });

  it('reintentar la revisión que pide corregir: solo la corrección queda en curso, con un solo reloj', async () => {
    const { g, raiz, hasta, ir } = await montar();
    g.fallar('assemble', 502, 'AI_PROVIDER_ERROR', 'http', 2); // falla y también su reintento automático
    await ir();
    await hasta(() => !!parte(raiz(), 'Revisión de las reglas del caso')?.querySelector('[role="alert"]'));

    g.resultadoDelEnsamblado('needs_repair');
    g.retener('scene', 'consulta');
    boton(raiz(), 'Reintentar esta parte')!.click();
    await hasta(() => anuncio(raiz()) === 'Corrigiendo 1 escena (ronda 1 de 2)');

    expect(parte(raiz(), 'Revisión de las reglas del caso')!.getAttribute('data-estado')).toBe('pendiente');
    expect(parte(raiz(), 'Corrección de 1 escena (ronda 1 de 2)')!.getAttribute('data-estado')).toBe('en-curso');
    expect(raiz().querySelectorAll('li.parte[data-estado="en-curso"]')).toHaveLength(1);
    expect(raiz().querySelectorAll('li.parte .tiempo')).toHaveLength(1);

    g.liberar('scene', 'consulta');
    await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
  });

  it('reparación: una parte propia con la ronda, las escenas y lo que encontró la revisión, en palabras', async () => {
    const { g, id, raiz, hasta, ir } = await montar();
    const api = TestBed.inject(AuthoringApi);
    await firstValueFrom(api.generationSkeleton(id));
    for (const c of CLAVES) await firstValueFrom(api.generationScene(id, c));
    g.resultadoDelEnsamblado('needs_repair');
    await firstValueFrom(api.generationAssemble(id));
    g.retener('scene', 'consulta');
    await ir();
    await hasta(() => anuncio(raiz()) === 'Corrigiendo 1 escena (ronda 1 de 2)');

    const reparacion = () => parte(raiz(), 'Corrección de 1 escena (ronda 1 de 2)')!;
    expect(reparacion().textContent).toMatch(/Corrigiéndose/);
    expect(reparacion().textContent).toContain('La revisión pidió corregir «Primera escucha».');
    expect(reparacion().textContent).toContain('Una respuesta no tiene reacción.');
    expect(raiz().textContent).not.toContain('DSL.');
    // Lo ya escrito sigue hecho; la revisión de las reglas se repite después de corregir.
    for (const nombre of ['El esqueleto del caso', 'Escena 1 de 4', 'Escena 2 de 4', 'Escena 3 de 4', 'Escena 4 de 4']) {
      expect(parte(raiz(), nombre)!.textContent).toMatch(/✓.*Hecha/s);
    }
    expect(parte(raiz(), 'Revisión de las reglas del caso')!.textContent).toMatch(/○.*Pendiente/s);
    expect(barra(raiz()).getAttribute('aria-valuetext')).toBe('5 de 7 partes hechas');

    g.liberar('scene', 'consulta');
    await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
    expect(reparacion().textContent).toMatch(/✓.*Hecha/s);
  });

  describe('listo y fallo', () => {
    it('listo enfoca el título, dice que no quedó nada por resolver, no navega solo y «Abrir mi caso» abre el editor', async () => {
      const { raiz, hasta, ir, navegar } = await montar();
      await ir();
      await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
      navegar.mockResolvedValue(true);

      const h1 = raiz().querySelector('h1')!;
      expect(h1.textContent).toContain('Tu caso está listo como borrador');
      expect(raiz().textContent).toContain('Lo marcado «Sugerido por la IA» espera tu revisión.');
      expect(raiz().textContent).toContain('Sin faltas: no quedó nada por resolver.');
      await hasta(() => document.activeElement === h1);
      for (const li of raiz().querySelectorAll('li.parte')) expect(li.textContent).toMatch(/✓.*Hecha/s);
      expect(parte(raiz(), 'Revisión de las reglas del caso')!.textContent).toContain('Sin faltas.');
      expect(raiz().querySelector('[role="progressbar"]')).toBeNull();
      expect(anuncio(raiz())).toBe('');
      expect(boton(raiz(), 'Cancelar y empezar de nuevo')).toBeUndefined();
      // Sin navegación automática (P4): pasados los 2 s sigue en la pantalla.
      await new Promise((r) => setTimeout(r, 2100));
      expect(navegar).not.toHaveBeenCalled();

      boton(raiz(), 'Abrir mi caso')!.click();
      // Lee el caso para abrirlo en el guion de su primera escena (si no pudiera leerlo, cae en la pantalla del caso).
      await hasta(() => navegar.mock.calls.length === 1);
      expect(navegar.mock.calls[0][0]).toMatch(/^\/portal\/casos\/\d+\/editor\/escena\/[^/]+$/);
    });

    it('listo con faltas: cuántas quedan por resolver en el editor y cuáles, en palabras y sin códigos', async () => {
      const { g, id, raiz, hasta, ir } = await montar();
      const api = TestBed.inject(AuthoringApi);
      await firstValueFrom(api.generationSkeleton(id));
      for (const c of CLAVES) await firstValueFrom(api.generationScene(id, c));
      // Dos rondas de corrección y, sin rondas, el servidor importa con la falta que quedó.
      g.resultadoDelEnsamblado('needs_repair', 'needs_repair', 'needs_repair');
      await firstValueFrom(api.generationAssemble(id));
      // Cada corrección se retiene un momento, como tarda de verdad: la pantalla ve cada ronda con sus escenas.
      g.retener('scene', 'consulta');
      await ir();
      await hasta(() => anuncio(raiz()) === 'Corrigiendo 1 escena (ronda 1 de 2)');
      g.retener('scene', 'consulta');
      g.liberar('scene', 'consulta');
      await hasta(() => anuncio(raiz()) === 'Corrigiendo 1 escena (ronda 2 de 2)');
      g.liberar('scene', 'consulta');
      await hasta(() => !!boton(raiz(), 'Abrir mi caso'));

      expect(raiz().textContent).toContain('Queda 1 cosa por resolver en el editor.');
      const reglas = parte(raiz(), 'Revisión de las reglas del caso')!;
      expect(reglas.textContent).toContain('1 cosa por resolver en el editor:');
      expect(reglas.textContent).toContain('Una respuesta no tiene reacción.');
      expect(raiz().textContent).not.toContain('DSL.');
      expect(parte(raiz(), 'Corrección de 1 escena (ronda 1 de 2)')!.textContent).toMatch(/✓.*Hecha/s);
      expect(parte(raiz(), 'Corrección de 1 escena (ronda 2 de 2)')!.textContent).toMatch(/✓.*Hecha/s);
    });

    it('fallo enfoca el título, explica qué impidió abrir el caso junto a la revisión y ofrece empezar de nuevo', async () => {
      const { g, raiz, hasta, ir, navegar } = await montar();
      g.resultadoDelEnsamblado('failed');
      await ir();
      await hasta(() => !!boton(raiz(), 'Empezar de nuevo'));
      navegar.mockResolvedValue(true);

      const h1 = raiz().querySelector('h1')!;
      expect(h1.textContent).toContain('No pudimos armar un caso que se pueda abrir');
      expect(raiz().textContent).toContain('La IA dejó partes que no cumplen las reglas del documento. Prueba a describir el caso de otra forma.');
      await hasta(() => document.activeElement === h1);
      const reglas = parte(raiz(), 'Revisión de las reglas del caso')!;
      expect(reglas.getAttribute('data-estado')).toBe('error');
      expect(reglas.textContent).toMatch(/!.*Con error/s);
      expect(reglas.textContent).toContain('Estas faltas impidieron abrir el caso:');
      expect(reglas.textContent).toContain('El documento no tiene la forma esperada.');
      expect(raiz().textContent).not.toContain('DSL.');
      expect(boton(raiz(), 'Abrir mi caso')).toBeUndefined();
      expect(boton(raiz(), 'Cancelar y empezar de nuevo')).toBeUndefined();

      boton(raiz(), 'Empezar de nuevo')!.click();
      await hasta(() => navegar.mock.calls.length > 0);
      expect(navegar).toHaveBeenCalledWith('/portal/casos/nuevo/salas?lugar=universidad');
    });
  });

  describe('el contrato final de C1', () => {
    it('un 404 a mitad del avance (apagada) muestra el mensaje del servidor y una salida, sin «Reintentar»', async () => {
      const { raiz, hasta, ir } = await montar();
      const api = TestBed.inject(AuthoringApi);
      vi.spyOn(api, 'generationScene').mockImplementation(() => throwError(() => new HttpErrorResponse({
        status: 404, error: { success: false, code: 'NOT_FOUND', message: 'La generación con IA no está disponible.' },
      })));
      await ir();
      await hasta(() => alertas(raiz()).length > 0);

      expect(alertas(raiz())[0].textContent).toContain('La generación con IA no está disponible.');
      expect(boton(raiz(), 'Reintentar esta parte')).toBeUndefined();
      const salida = [...raiz().querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent!.includes('Volver a crear un caso'))!;
      expect(salida.getAttribute('href')).toBe('/portal/casos/nuevo/salas?lugar=universidad');
      expect(TestBed.inject(Router).url).toContain('/generando/');
    });

    it('una generación que no existe: h1 enfocado, el mensaje, enlace «Volver a crear un caso» y nada de «Reintentar»', async () => {
      const { harness, raiz, hasta } = await montar();
      await harness.navigateByUrl('/portal/casos/nuevo/generando/no-existe');
      harness.fixture.detectChanges();
      await hasta(() => alertas(raiz()).length > 0);

      const h1 = raiz().querySelector('h1')!;
      expect(h1.textContent).toContain('No pudimos seguir armando tu caso');
      expect(alertas(raiz())[0].textContent).toContain('La generación no existe.');
      await hasta(() => document.activeElement === h1);
      expect(boton(raiz(), 'Reintentar esta parte')).toBeUndefined();
      expect(boton(raiz(), 'Cancelar y empezar de nuevo')).toBeUndefined();
      const salida = [...raiz().querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent!.includes('Volver a crear un caso'))!;
      expect(salida.getAttribute('href')).toBe('/portal/casos/nuevo/salas');
      expect(raiz().querySelector('li.parte')).toBeNull();
    });

    it('una escena vencida al retomar se ofrece con el mensaje que trae y «Reintentar esta parte» la pide', async () => {
      const { g, id, raiz, hasta, ir } = await montar();
      const api = TestBed.inject(AuthoringApi);
      await firstValueFrom(api.generationSkeleton(id));
      g.retener('scene', 'recepcion');
      void firstValueFrom(api.generationScene(id, 'recepcion'));
      g.avanzarReloj(150);
      await ir();
      await hasta(() => !!boton(raiz(), 'Reintentar esta parte'));

      const recepcion = parte(raiz(), 'Escena 1 de 4: Recepción')!;
      expect(recepcion.querySelector('[role="alert"]')!.textContent).toContain('La IA tardó demasiado en responder. Vuelve a intentarlo.');
      expect(recepcion.textContent).toMatch(/!.*Con error/s);
      boton(raiz(), 'Reintentar esta parte')!.click();
      await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
      g.liberar('scene', 'recepcion');
    });

    it('una generación cancelada (en otra pestaña): lo dice con el foco en el título y ofrece volver, sin un giro eterno', async () => {
      const { id, raiz, hasta, ir } = await montar();
      await firstValueFrom(TestBed.inject(AuthoringApi).cancelGeneration(id));
      await ir();
      await hasta(() => raiz().querySelector('h1')!.textContent!.includes('Este caso se canceló'));

      const h1 = raiz().querySelector('h1')!;
      await hasta(() => document.activeElement === h1);
      expect(raiz().textContent).toContain('Se canceló en otra pestaña o en una visita anterior. Puedes empezar uno nuevo.');
      const salida = [...raiz().querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent!.includes('Volver a crear un caso'))!;
      expect(salida.getAttribute('href')).toBe('/portal/casos/nuevo/salas');
      expect(raiz().querySelector('li.parte')).toBeNull();
      expect(raiz().querySelector('[role="progressbar"]')).toBeNull();
    });
  });

  it('al salir de la pantalla deja de pedir etapas', async () => {
    const { g, harness, raiz, hasta, ir } = await montar();
    g.retener('skeleton');
    await ir();
    await hasta(() => anuncio(raiz()) === 'Armando el esqueleto del caso');
    await harness.navigateByUrl('/portal/casos/nuevo');
    g.liberar('skeleton');
    await new Promise((r) => setTimeout(r, 20));
    expect(g.llamadas.filter((l) => l.metodo === 'generationScene')).toHaveLength(0);
  });
});
