import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../../core/api/authoring.api';
import { CasoStore } from '../../estado/caso.store';
import { casoCopiadoDeLugar } from '../../testing/caso-api';
import { ServidorFalso } from '../../testing/servidor-falso';
import { universidad } from '../../testing/universidad';
import { DatosComponent } from './datos.component';

const CASO = 41;

type Campo = HTMLInputElement | HTMLTextAreaElement;

async function montar(opciones: { estado?: string; contexto?: string; objetivos?: string[]; temas?: string[] | null } = {}) {
  localStorage.clear();
  TestBed.resetTestingModule();
  const datos = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 });
  datos.editor.context = opciones.contexto ?? 'Una estudiante llega a Bienestar.';
  datos.editor.learningObjectives = opciones.objetivos ?? ['Valorar el riesgo.', 'Validar sin juzgar.'];
  // Un servidor con RK-7 devuelve la lista (aunque vacía); uno anterior no trae el campo y el bloque no se pinta.
  if (opciones.temas !== null) datos.editor.contentWarnings = opciones.temas ?? ['Violencia de pareja'];
  if (opciones.estado) datos.editor.status = opciones.estado;
  const servidor = new ServidorFalso(datos, universidad);
  await TestBed.configureTestingModule({
    imports: [DatosComponent],
    providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  await store.cargar(CASO);
  servidor.llamadas.length = 0;
  const fixture = TestBed.createComponent(DatosComponent);
  document.body.appendChild(fixture.nativeElement);
  const listo = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await listo();
  const raiz = fixture.nativeElement as HTMLElement;
  const nombre = () => raiz.querySelector<HTMLInputElement>('#d-nombre')!;
  const contexto = () => raiz.querySelector<HTMLTextAreaElement>('#d-contexto')!;
  const objetivo = (i: number) => raiz.querySelector<HTMLTextAreaElement>(`#d-objetivo-${i}`);
  const estado = () => raiz.querySelector('[data-estado-datos]')!.textContent!.trim();
  const botonDe = (texto: string) => [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto || b.getAttribute('aria-label') === texto);
  const escribir = async (campo: Campo, valor: string, soltar = false) => {
    campo.value = valor;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    if (soltar) campo.dispatchEvent(new Event('change', { bubbles: true }));
    await listo();
  };
  const hacerClic = async (boton: HTMLElement | undefined) => {
    boton!.click();
    await store.sincronizado();
    await listo();
  };
  return { fixture, store, servidor, raiz, listo, nombre, contexto, objetivo, estado, botonDe, escribir, hacerClic };
}

describe('DatosComponent · los datos del caso se guardan solos', () => {
  afterEach(() => document.querySelectorAll('body > app-datos, body > [ng-version]').forEach((n) => n.remove()));

  it('muestra el nombre, el contexto, los objetivos (uno por campo) y los temas, cada uno con su etiqueta', async () => {
    const { raiz, nombre, contexto, objetivo } = await montar();
    expect(raiz.querySelector('h1')!.textContent).toContain('Datos del caso');
    expect(nombre().value).toBe('Primera escucha en Bienestar');
    expect(nombre().readOnly).toBe(false);
    expect(contexto().value).toBe('Una estudiante llega a Bienestar.');
    expect(objetivo(0)!.value).toBe('Valorar el riesgo.');
    expect(objetivo(1)!.value).toBe('Validar sin juzgar.');
    expect(objetivo(2)).toBeNull();
    expect(objetivo(0)!.getAttribute('aria-label')).toBe('Objetivo 1');
    for (const [id, texto] of [['d-nombre', 'Nombre del caso'], ['d-contexto', 'Contexto que lee el estudiante'], ['d-tema', 'Nuevo tema sensible']]) {
      expect(raiz.querySelector(`label[for="${id}"]`)!.textContent).toContain(texto);
    }
    expect([...raiz.querySelectorAll('legend')].map((l) => l.textContent?.trim())).toContain('Objetivos de aprendizaje');
    expect(raiz.textContent).toContain('Los revisa Psicología');
    expect(raiz.textContent).not.toContain('Los redacta Psicología');
  });

  it('ya no tiene botón «Guardar»: un solo modelo de guardado, el automático', async () => {
    const { raiz } = await montar();
    expect([...raiz.querySelectorAll('button')].some((b) => /Guardar/.test(b.textContent ?? ''))).toBe(false);
    expect(raiz.querySelector('button[type="submit"]')).toBeNull();
  });

  it('cuenta los caracteres del contexto y dice el tope', async () => {
    const { raiz, contexto, escribir } = await montar();
    await escribir(contexto(), 'Hola');
    expect(raiz.querySelector('#d-contexto-cuenta')!.textContent).toContain('4 de 4.000 caracteres');
  });

  it('al salir del contexto con algo cambiado se guarda solo y dice «Guardando…» y después «Guardado.»', async () => {
    const { fixture, servidor, store, contexto, estado, escribir, listo } = await montar();
    await escribir(contexto(), '  Un contexto nuevo.  ');
    expect(servidor.metodos, 'mientras se escribe no se guarda').toEqual([]);
    contexto().dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(estado(), 'al soltar el campo, antes de que responda el servidor').toBe('Guardando…');
    await listo();
    await store.sincronizado();
    await listo();
    expect(servidor.metodos).toEqual(['updateBrief']);
    expect(servidor.llamadas[0].args[0]).toEqual({ context: 'Un contexto nuevo.', learningObjectives: ['Valorar el riesgo.', 'Validar sin juzgar.'] });
    expect(store.caso()!.contexto).toBe('Un contexto nuevo.');
    expect(estado()).toBe('Guardado.');
    expect(store.error()).toBeNull();
  });

  it('si no cambió nada, salir del campo no guarda', async () => {
    const { servidor, contexto, escribir } = await montar();
    await escribir(contexto(), contexto().value, true);
    expect(servidor.metodos).toEqual([]);
  });

  it('los objetivos son una lista: agregar abre un campo con el foco, y se guarda al salir de él', async () => {
    const { servidor, store, objetivo, botonDe, escribir, hacerClic, listo } = await montar();
    await hacerClic(botonDe('Agregar objetivo'));
    expect(objetivo(2), 'aparece un campo nuevo').not.toBeNull();
    expect(document.activeElement).toBe(objetivo(2));
    expect(servidor.metodos, 'un campo vacío no es un cambio').toEqual([]);
    await escribir(objetivo(2)!, '  Acompañar sin diagnosticar.  ', true);
    await store.sincronizado();
    await listo();
    expect((servidor.llamadasA('updateBrief')[0].args[0] as { learningObjectives: string[] }).learningObjectives)
      .toEqual(['Valorar el riesgo.', 'Validar sin juzgar.', 'Acompañar sin diagnosticar.']);
  });

  it('un objetivo es una sola frase: Enter no abre otro renglón y un pegado con saltos se junta', async () => {
    const { objetivo, escribir } = await montar();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    objetivo(0)!.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    await escribir(objetivo(0)!, 'Primera parte.\r\n  Segunda parte.');
    expect(objetivo(0)!.value).toBe('Primera parte. Segunda parte.');
  });

  it('quitar un objetivo lo guarda al momento', async () => {
    const { servidor, store, objetivo, botonDe, hacerClic } = await montar();
    await hacerClic(botonDe('Quitar el objetivo 1'));
    expect(objetivo(1), 'queda uno').toBeNull();
    expect((servidor.llamadasA('updateBrief')[0].args[0] as { learningObjectives: string[] }).learningObjectives).toEqual(['Validar sin juzgar.']);
    expect(store.caso()!.objetivos).toEqual(['Validar sin juzgar.']);
  });

  it('un contexto de más de 4.000 caracteres no se guarda: lo dice en el campo y lo marca', async () => {
    const { raiz, servidor, contexto, estado, escribir } = await montar();
    await escribir(contexto(), 'a'.repeat(4001), true);
    expect(servidor.metodos).toEqual([]);
    expect(contexto().getAttribute('aria-invalid')).toBe('true');
    expect(raiz.querySelector('#d-contexto-error')!.textContent).toContain('El contexto admite hasta 4.000 caracteres (ahora tiene 4.001).');
    expect(contexto().getAttribute('aria-describedby')).toContain('d-contexto-error');
    expect(estado()).toBe('Corrige lo marcado para poder guardar.');
  });

  it('un objetivo de más de 280 caracteres no se guarda', async () => {
    const { raiz, servidor, objetivo, escribir } = await montar();
    await escribir(objetivo(1)!, 'a'.repeat(281), true);
    expect(raiz.querySelector('#d-objetivos-error')!.textContent).toContain('El objetivo 2 admite hasta 280 caracteres.');
    expect(objetivo(1)!.getAttribute('aria-invalid')).toBe('true');
    expect(servidor.metodos).toEqual([]);
  });

  it('el texto con etiquetas o enlaces no se guarda', async () => {
    const { raiz, servidor, contexto, escribir } = await montar();
    await escribir(contexto(), 'Entra a <b>Bienestar</b>', true);
    expect(raiz.querySelector('#d-contexto-error')!.textContent).toContain('Escribe texto plano, sin etiquetas ni formato.');
    await escribir(contexto(), 'Mira https://ejemplo.org', true);
    expect(raiz.querySelector('#d-contexto-error')!.textContent).toContain('Escribe texto plano, sin enlaces.');
    expect(servidor.metodos).toEqual([]);
  });

  it('al corregir el error el aviso se va y el campo se guarda', async () => {
    const { servidor, store, contexto, estado, escribir, listo } = await montar();
    await escribir(contexto(), 'a'.repeat(4001), true);
    expect(estado()).toBe('Corrige lo marcado para poder guardar.');
    await escribir(contexto(), 'Ahora sí.', true);
    await store.sincronizado();
    await listo();
    expect(servidor.llamadasA('updateBrief')).toHaveLength(1);
    expect(estado()).toBe('Guardado.');
  });

  it('el nombre del caso se puede cambiar y viaja como «title»; vacío no se guarda', async () => {
    const { raiz, servidor, store, nombre, escribir, listo } = await montar();
    await escribir(nombre(), '', true);
    expect(raiz.querySelector('#d-nombre-error')!.textContent).toContain('El caso necesita un nombre.');
    expect(servidor.metodos).toEqual([]);
    await escribir(nombre(), '  Primera atención  ', true);
    await store.sincronizado();
    await listo();
    expect(servidor.llamadasA('updateBrief')[0].args[0]).toEqual({ title: 'Primera atención' });
    expect(store.caso()!.titulo).toBe('Primera atención');
    expect(raiz.querySelector('.vista__nombre')!.textContent).toBe('Primera atención');
  });

  it('si el sistema no acepta el texto, el campo conserva lo escrito y avisa que no se guardó', async () => {
    const { servidor, store, contexto, estado, escribir, listo } = await montar();
    servidor.fallar('updateBrief', 400, 'No.', { campo: 'context' });
    await escribir(contexto(), 'Texto que el sistema rechaza.', true);
    await store.sincronizado();
    await listo();
    expect(store.error()).toContain('No se pudo guardar los datos del caso');
    expect(estado()).toContain('No se pudo guardar');
    expect(contexto().value).toBe('Texto que el sistema rechaza.');
  });

  it('un campo con error no retiene a los demás: el contexto bueno se guarda aunque el nombre esté vacío', async () => {
    const { servidor, store, nombre, contexto, estado, escribir, listo } = await montar();
    await escribir(nombre(), '');
    await escribir(contexto(), 'Un contexto nuevo y válido.', true);
    await store.sincronizado();
    await listo();
    const envios = servidor.llamadasA('updateBrief');
    expect(envios).toHaveLength(1);
    expect(envios[0].args[0]).toMatchObject({ context: 'Un contexto nuevo y válido.' });
    expect(envios[0].args[0]).not.toHaveProperty('title', '');
    expect(store.caso()!.titulo).toBe('Primera escucha en Bienestar');
    expect(nombre().value).toBe(''); // el campo con error conserva lo escrito
    expect(estado()).toBe('Se guardó lo demás. Corrige lo marcado para guardarlo también.');
  });

  it('cambiar de pantalla con un campo por corregir o un tema sin agregar pregunta antes; sin nada pendiente, no', async () => {
    const { fixture, nombre, escribir, raiz } = await montar();
    const componente = fixture.componentInstance as unknown as { canLeave(): Promise<boolean> };
    await expect(componente.canLeave()).resolves.toBe(true);
    await escribir(nombre(), '');
    const salida = componente.canLeave();
    await new Promise((r) => setTimeout(r, 0));
    const dialogo = document.querySelector('ui-consequence-dialog')!;
    expect(dialogo.textContent).toContain('el nombre del caso');
    [...dialogo.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Seguir editando'))!.click();
    await expect(salida).resolves.toBe(false);
    await escribir(nombre(), 'Primera escucha en Bienestar');
    await escribir(raiz.querySelector<HTMLInputElement>('#d-tema')!, 'Autolesiones');
    const otra = componente.canLeave();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('ui-consequence-dialog')!.textContent).toContain('el tema «Autolesiones», que no agregaste');
    [...document.querySelectorAll<HTMLButtonElement>('ui-consequence-dialog button')].find((b) => b.textContent?.includes('Salir sin guardarlo'))!.click();
    await expect(otra).resolves.toBe(true);
  });

  it('guardar Datos no borra el error que dejó otra operación (ni lo que se descartó)', async () => {
    const { servidor, store, contexto, escribir, listo } = await montar();
    servidor.fallar('updateBrief', 400, 'No.', { campo: 'context' });
    await escribir(contexto(), 'Este se rechaza.', true);
    await store.sincronizado();
    await listo();
    const error = store.error();
    const descartado = store.descartado();
    expect(error).not.toBeNull();
    await escribir(contexto(), 'Este sí entra.', true);
    await store.sincronizado();
    await listo();
    expect(store.error()).toBe(error);
    expect(store.descartado()).toBe(descartado);
  });

  it('si otra persona cambió el caso, lo dice sin perder lo escrito', async () => {
    const { servidor, store, contexto, estado, escribir, listo } = await montar();
    servidor.otraSesionEscribe();
    await escribir(contexto(), 'Mi versión del contexto.', true);
    await store.sincronizado();
    await listo();
    expect(store.conflicto()).not.toBeNull();
    expect(estado()).toContain('Otra persona cambió el caso');
    expect(contexto().value).toBe('Mi versión del contexto.');
  });

  it('un caso en revisión se lee pero no se cambia: campos de solo lectura, sin botones de cambio y una nota que lo explica', async () => {
    const { raiz, servidor, nombre, contexto, objetivo, escribir } = await montar({ estado: 'IN_REVIEW' });
    expect(nombre().readOnly).toBe(true);
    expect(contexto().readOnly).toBe(true);
    expect(objetivo(0)!.readOnly).toBe(true);
    expect(contexto().value).toBe('Una estudiante llega a Bienestar.');
    expect(raiz.textContent).toContain('El caso ya no es un borrador: se puede leer, pero no cambiar.');
    for (const texto of ['Agregar objetivo', 'Quitar el objetivo 1', 'Agregar tema', 'Quitar el tema Violencia de pareja']) {
      expect([...raiz.querySelectorAll('button')].some((b) => b.textContent?.trim() === texto || b.getAttribute('aria-label') === texto), texto).toBe(false);
    }
    await escribir(contexto(), 'Intento.', true);
    expect(servidor.metodos).toEqual([]);
  });

  it('al recargar el caso, los campos vuelven a lo que tiene guardado', async () => {
    const { store, servidor, contexto, escribir, listo } = await montar();
    servidor.otraSesionEscribe();
    await escribir(contexto(), 'Lo que escribí y no se guardó.');
    await store.cargar(CASO, true);
    await listo();
    expect(contexto().value).toBe('Una estudiante llega a Bienestar.');
  });

  it('un caso sin contexto ni objetivos muestra los campos vacíos y el botón para agregar', async () => {
    const { raiz, contexto, objetivo, botonDe } = await montar({ contexto: '', objetivos: [] });
    expect(contexto().value).toBe('');
    expect(objetivo(0)).toBeNull();
    expect(botonDe('Agregar objetivo')).toBeDefined();
    expect(raiz.querySelector('.vista__contexto')!.textContent).toContain('Aquí se verá el contexto');
  });
});

describe('DatosComponent · temas sensibles (RK-7)', () => {
  afterEach(() => document.querySelectorAll('body > app-datos, body > [ng-version]').forEach((n) => n.remove()));
  const campoTema = (raiz: HTMLElement) => raiz.querySelector<HTMLInputElement>('#d-tema')!;

  it('con un servidor que no los guarda, el bloque no se pinta', async () => {
    const { raiz } = await montar({ temas: null });
    expect(raiz.querySelector('[data-accion="temas-sensibles"]')).toBeNull();
    expect(raiz.querySelector('#d-tema')).toBeNull();
  });

  it('muestra los temas como fichas y agregar uno lo guarda en el mismo «brief» (Enter también agrega)', async () => {
    const { raiz, servidor, store, escribir, listo } = await montar({ temas: ['Violencia de pareja'] });
    expect([...raiz.querySelectorAll('[data-accion="temas-sensibles"] .ficha__texto')].map((f) => f.textContent)).toEqual(['Violencia de pareja']);
    await escribir(campoTema(raiz), '  Riesgo de feminicidio ');
    campoTema(raiz).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await store.sincronizado();
    await listo();
    expect(servidor.llamadasA('updateBrief')[0].args[0]).toEqual({ contentWarnings: ['Violencia de pareja', 'Riesgo de feminicidio'] });
    expect(store.caso()!.temasSensibles).toEqual(['Violencia de pareja', 'Riesgo de feminicidio']);
    expect(campoTema(raiz).value).toBe('');
  });

  it('quitar una ficha la guarda al momento', async () => {
    const { servidor, botonDe, hacerClic, store } = await montar({ temas: ['Violencia de pareja', 'Duelo'] });
    await hacerClic(botonDe('Quitar el tema Duelo'));
    expect(servidor.llamadasA('updateBrief')[0].args[0]).toEqual({ contentWarnings: ['Violencia de pareja'] });
    expect(store.caso()!.temasSensibles).toEqual(['Violencia de pareja']);
  });

  it('un tema repetido, muy largo o con formato se queda en el campo con su error y no se guarda', async () => {
    const { raiz, servidor, escribir } = await montar({ temas: ['Violencia de pareja'] });
    const intentar = async (texto: string) => {
      await escribir(campoTema(raiz), texto);
      [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Agregar tema')!.click();
      await escribir(campoTema(raiz), texto);
      return raiz.querySelector('#d-tema-error')?.textContent ?? '';
    };
    expect(await intentar('violencia DE pareja')).toContain('Ese tema ya está en la lista.');
    expect(await intentar('a'.repeat(61))).toContain('hasta 60 caracteres');
    expect(await intentar('<b>x</b>')).toContain('sin etiquetas');
    expect(campoTema(raiz).getAttribute('aria-invalid')).toBe('true');
    expect(servidor.metodos).toEqual([]);
  });

  it('«Así aparece para el estudiante» se redibuja con lo escrito: título, contexto, objetivos y temas', async () => {
    const { raiz, contexto, escribir } = await montar({ temas: ['Violencia de pareja'] });
    await escribir(contexto(), 'Un contexto que se ve en la ficha.');
    const vista = raiz.querySelector('.vista')!;
    expect(raiz.querySelector('#d-vista')!.textContent).toBe('Así aparece para el estudiante');
    expect(vista.querySelector('.vista__nombre')!.textContent).toBe('Primera escucha en Bienestar');
    expect(vista.querySelector('.vista__contexto')!.textContent).toBe('Un contexto que se ve en la ficha.');
    expect([...vista.querySelectorAll('.vista__lista li')].map((li) => li.textContent)).toEqual(['Valorar el riesgo.', 'Validar sin juzgar.']);
    expect(vista.textContent).toContain('En este caso aparecen');
    expect(vista.textContent).toContain('Violencia de pareja');
  });
});
