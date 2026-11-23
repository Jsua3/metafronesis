import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../../core/api/authoring.api';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { casoCopiadoDeLugar } from '../../testing/caso-api';
import { ServidorFalso } from '../../testing/servidor-falso';
import { universidad } from '../../testing/universidad';
import { GuionComponent } from './guion.component';

/** El guion de la segunda escena de un caso en borrador (sin servidor). */
async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [GuionComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  const caso = copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
  caso.competencias = [{ codigo: 'ETICA_PROFESIONAL', nombre: 'Ética profesional' }, { codigo: 'ESCUCHA_ACTIVA', nombre: 'Escucha activa' }];
  store.fijar(caso);
  const id = store.caso()!.escenas[1].id;
  const fixture = TestBed.createComponent(GuionComponent);
  fixture.componentRef.setInput('escenaId', id);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  const raiz = fixture.nativeElement as HTMLElement;
  const respuesta = () => store.caso()!.escenas.find((e) => e.id === id)!.respuestas[0];
  const agregarRespuesta = async (clase?: string) => {
    [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Agregar una respuesta')!.click();
    await listo();
    if (clase) {
      raiz.querySelector<HTMLInputElement>(`fieldset.clasificacion input[value="${clase}"]`)!.click();
      await listo();
    }
  };
  /** Abre una faceta de la primera respuesta por el nombre de su ficha («Pasos», «Criterios», «Persona»…). */
  const abrirFaceta = async (nombre: string) => {
    [...raiz.querySelectorAll<HTMLButtonElement>('button.faceta')].find((b) => b.querySelector('.faceta__nombre')!.textContent === nombre)!.click();
    await listo();
  };
  return { fixture, store, id, raiz, listo, respuesta, agregarRespuesta, abrirFaceta };
}

describe('GuionComponent · persona, hitos y competencias de cada respuesta', () => {
  it('una respuesta sin clase empieza en modo automático y pide la clase para decir qué le pasa a la persona', async () => {
    const { raiz, agregarRespuesta, abrirFaceta } = await montar();
    await agregarRespuesta();
    // La ficha cerrada ya dice lo que falta; abierta, la faceta lo explica.
    expect(raiz.textContent).toContain('falta la clase');
    await abrirFaceta('Persona');
    expect(raiz.textContent).toContain('Elige la clase para ver qué le pasa a la persona.');
    const persona = raiz.querySelector('fieldset.persona')!;
    expect(persona.querySelector<HTMLInputElement>('input[value="automatica"]')!.checked).toBe(true);
  });

  it('con la clase elegida, la persona reacciona sola y la frase cambia con la clase', async () => {
    const { raiz, listo, agregarRespuesta, abrirFaceta } = await montar();
    await agregarRespuesta('RECOMMENDED');
    await abrirFaceta('Persona');
    expect(raiz.querySelector('.persona-auto')!.textContent).toContain('la persona se abre y se calma');
    raiz.querySelector<HTMLInputElement>('fieldset.clasificacion input[value="CONTRAINDICATED"]')!.click();
    await listo();
    expect(raiz.querySelector('.persona-auto')!.textContent).toContain('la persona se cierra y se tensa');
    // La ficha de la faceta dice lo mismo sin abrirse.
    expect(raiz.querySelector('button.faceta[aria-expanded="true"] .faceta__valor')!.textContent).toBe('se cierra y se tensa');
  });

  it('en modo propio la docente elige el vínculo y la activación; volver a automático no guarda nada', async () => {
    const { raiz, listo, respuesta, agregarRespuesta, abrirFaceta } = await montar();
    await agregarRespuesta('RECOMMENDED');
    await abrirFaceta('Persona');
    raiz.querySelector<HTMLInputElement>('fieldset.persona input[value="propia"]')!.click();
    await listo();
    // empieza donde la dejaba la clase
    expect(respuesta().efectos.persona).toEqual({ bond: 1, activation: -1 });
    const vinculo = raiz.querySelector<HTMLSelectElement>('select[id^="pv"]')!;
    const activacion = raiz.querySelector<HTMLSelectElement>('select[id^="pa"]')!;
    expect([...vinculo.options].map((o) => o.textContent!.trim())).toEqual(['Se cierra', 'Sin cambio', 'Se abre']);
    expect([...activacion.options].map((o) => o.textContent!.trim())).toEqual(['Se calma', 'Sin cambio', 'Se tensa']);
    vinculo.value = '-1';
    vinculo.dispatchEvent(new Event('change'));
    activacion.value = '1';
    activacion.dispatchEvent(new Event('change'));
    await listo();
    expect(respuesta().efectos.persona).toEqual({ bond: -1, activation: 1 });
    raiz.querySelector<HTMLInputElement>('fieldset.persona input[value="automatica"]')!.click();
    await listo();
    expect(respuesta().efectos.persona).toBeUndefined();
    expect(raiz.querySelector('select[id^="pv"]')).toBeNull();
  });

  it('cada respuesta marca los hitos que cumple con casillas del catálogo del caso', async () => {
    const { store, raiz, listo, respuesta, agregarRespuesta, abrirFaceta } = await montar();
    await agregarRespuesta('RECOMMENDED');
    await abrirFaceta('Pasos');
    const casillas = [...raiz.querySelectorAll<HTMLLabelElement>('fieldset.hitos label')];
    expect(casillas.map((l) => l.textContent!.trim())).toEqual(store.caso()!.hitos.map((h) => h.nombre));
    casillas[0].querySelector('input')!.click();
    casillas[3].querySelector('input')!.click();
    await listo();
    expect(respuesta().efectos.hitos).toEqual([store.caso()!.hitos[0].clave, store.caso()!.hitos[3].clave]);
    casillas[0].querySelector('input')!.click();
    await listo();
    expect(respuesta().efectos.hitos).toEqual([store.caso()!.hitos[3].clave]);
    expect(raiz.querySelector('button.faceta[aria-expanded="true"] .faceta__valor')!.textContent).toBe('1');
  });

  it('las competencias de la rúbrica del caso se marcan con casillas', async () => {
    const { raiz, listo, respuesta, agregarRespuesta, abrirFaceta } = await montar();
    await agregarRespuesta('ACCEPTABLE');
    await abrirFaceta('Criterios');
    const casillas = [...raiz.querySelectorAll<HTMLLabelElement>('fieldset.competencias label')];
    expect(casillas.map((l) => l.textContent!.trim())).toEqual(['Ética profesional', 'Escucha activa']);
    casillas[1].querySelector('input')!.click();
    await listo();
    expect(respuesta().efectos.competencias).toEqual(['ESCUCHA_ACTIVA']);
  });

  it('un caso sin competencias en su rúbrica lo dice y no ofrece casillas', async () => {
    const { store, raiz, listo, agregarRespuesta, abrirFaceta } = await montar();
    store.fijar({ ...store.caso()!, competencias: [] });
    await agregarRespuesta();
    await listo();
    expect(raiz.textContent).toContain('sin rúbrica');
    await abrirFaceta('Criterios');
    expect(raiz.querySelector('fieldset.competencias label')).toBeNull();
    expect(raiz.textContent).toContain('Este caso aún no tiene rúbrica propia. Elígela en Evaluación.');
  });

  it('en ningún lado aparece una cifra de estrés ni de puntaje', async () => {
    const { raiz, listo, agregarRespuesta, abrirFaceta } = await montar();
    await agregarRespuesta('CONTRAINDICATED');
    await abrirFaceta('Persona');
    raiz.querySelector<HTMLInputElement>('fieldset.persona input[value="propia"]')!.click();
    await listo();
    expect(raiz.textContent).not.toMatch(/estr[eé]s|puntaje|puntos|\d\s?%|[+-]\s?\d/i);
  });
});

describe('GuionComponent · intensidad de la escena', () => {
  it('se elige baja, media o alta y una escena alta pide su aviso para el estudiante', async () => {
    const { store, id, raiz, listo } = await montar();
    const escena = () => store.caso()!.escenas.find((e) => e.id === id)!;
    // Un control de tres segmentos con botones de opción reales (teclado y lector de pantalla como cualquier radio).
    const opciones = [...raiz.querySelectorAll<HTMLInputElement>('fieldset.intensidad input[type="radio"]')];
    expect(opciones.map((o) => o.closest('label')!.textContent!.trim())).toEqual(['Baja', 'Media', 'Alta']);
    expect(opciones.find((o) => o.checked)!.value).toBe('MEDIUM');
    expect(raiz.querySelector('#aviso-escena')).toBeNull();

    opciones[2].click();
    await listo();
    expect(escena().intensidad).toBe('HIGH');
    const aviso = raiz.querySelector<HTMLTextAreaElement>('textarea#aviso-escena')!;
    expect(raiz.textContent).toContain('Una escena de intensidad alta necesita un aviso para el estudiante.');
    aviso.value = 'Esta escena trata de violencia.';
    aviso.dispatchEvent(new Event('change'));
    await listo();
    expect(escena().advertencia).toBe('Esta escena trata de violencia.');
    expect(raiz.textContent).not.toContain('Una escena de intensidad alta necesita un aviso para el estudiante.');
  });
});

describe('GuionComponent · una contraindicada sin razón', () => {
  it('una Contraindicada sin razón bloquea: no se guarda, se avisa, y al escribir la razón queda en el caso', async () => {
    TestBed.resetTestingModule();
    const datos = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: 41, revision: 3 });
    const servidor = new ServidorFalso(datos, universidad);
    await TestBed.configureTestingModule({
      imports: [GuionComponent],
      providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }],
    }).compileComponents();
    const store = TestBed.inject(CasoStore);
    await store.cargar(41);
    const origen = store.caso()!.escenas[0];
    const destino = store.caso()!.escenas[1];
    const fixture = TestBed.createComponent(GuionComponent);
    fixture.componentRef.setInput('escenaId', origen.id);
    const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); };
    await listo();
    const raiz = fixture.nativeElement as HTMLElement;
    servidor.llamadas.length = 0;

    [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Agregar una respuesta')!.click();
    await listo();
    const idRespuesta = store.caso()!.escenas[0].respuestas[0].id;
    store.editarRespuesta(origen.id, idRespuesta, { texto: 'Apúrate.', destinoId: destino.id });
    raiz.querySelector<HTMLInputElement>('fieldset.clasificacion input[value="CONTRAINDICATED"]')!.click();
    await store.sincronizado();
    await listo();

    // Sin razón no se manda nada al servidor y la pantalla lo dice junto a la respuesta.
    expect(servidor.editor.decisions).toHaveLength(0);
    expect(servidor.metodos).toEqual([]);
    expect(store.sinGuardar()).toEqual([expect.objectContaining({ respuestaId: idRespuesta, mensaje: 'Escribe por qué es contraindicada para guardarla.' })]);
    const razon = raiz.querySelector<HTMLTextAreaElement>('textarea[id^="rz"]')!;
    expect(razon.getAttribute('aria-invalid')).toBe('true');
    // La ficha dice por qué no se guarda, con las palabras de `motivoSinGuardar` y la marca «Solo en esta pantalla».
    expect(raiz.querySelector('li.respuesta .sin-guardar')!.textContent).toContain('Solo en esta pantalla');
    expect(raiz.querySelector('li.respuesta .sin-guardar')!.textContent).toContain('Escribe por qué es contraindicada para guardarla.');
    expect(store.haySinGuardar()).toBe(true);

    razon.value = 'Apura a la persona.';
    razon.dispatchEvent(new Event('change'));
    await store.sincronizado();
    await listo();
    expect(servidor.metodos).toEqual(['createDecision']);
    expect(servidor.editor.decisions[0]).toMatchObject({ responseClass: 'CONTRAINDICATED', prohibitionReason: 'Apura a la persona.' });
    expect(razon.getAttribute('aria-invalid')).not.toBe('true');
    expect(raiz.querySelector('li.respuesta .sin-guardar')).toBeNull();
  });
});
