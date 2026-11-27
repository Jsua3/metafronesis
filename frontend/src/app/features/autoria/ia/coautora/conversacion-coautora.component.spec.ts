import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { type Acuerdo, CoautoriaApi, type FichaAcordada, type PreguntaCoautora } from '../../../../core/api/coautoria.api';
import { ConversacionCoautoraComponent } from './conversacion-coautora.component';

const IDEA = 'Una estudiante llega desconfiada a bienestar universitario.';

const PREGUNTA_1: PreguntaCoautora = {
  numero: 1, ambito: 'historia', texto: '¿Qué debe aprender quien juega?', porque: 'Define las respuestas recomendadas.',
  opciones: ['Escuchar sin juzgar', 'Activar la ruta', 'Contener una crisis'], recomendada: 0,
};
const PREGUNTA_2: PreguntaCoautora = {
  numero: 2, ambito: 'personajes', texto: '¿Cómo llega la persona?', porque: 'Marca el tono.',
  opciones: ['Desconfiada', 'Angustiada', 'Evasiva'], recomendada: 1,
};
const FICHA: FichaAcordada = {
  titulo: 'Primera consulta', objetivo: 'Escuchar sin juzgar.', personajes: [{ nombre: 'Laura', descripcion: 'Desconfiada.' }],
  lugar: 'Bienestar universitario.', momento: 'noche',
  escenas: [{ titulo: 'Llegada', proposito: 'Recibirla.' }, { titulo: 'Cierre', proposito: 'Acordar otra cita.' }],
  hitos: ['Laura acepta hablar'], finales: [{ titulo: 'Vuelve', descripcion: 'Acuerdan otra cita.' }], intensidad: 'MEDIUM',
  temasSensibles: [],
};

function acuerdo(cambios: Partial<Acuerdo> = {}): Acuerdo {
  return {
    id: 'a-1', status: 'clarifying', lugarId: 'universidad', caseVersionId: null, idea: IDEA, respuestas: [], pregunta: PREGUNTA_1,
    topePreguntas: 6, ficha: null, llamadasUsadas: 1, llamadasTope: 14, generationId: null, ocupado: false, ...cambios,
  };
}

const RESPONDIDA_1 = {
  numero: 1, ambito: 'historia' as const, pregunta: PREGUNTA_1.texto, porque: PREGUNTA_1.porque, opciones: PREGUNTA_1.opciones,
  recomendada: 0, eleccion: { tipo: 'opcion' as const, indice: 0 }, respuesta: 'Escuchar sin juzgar',
};

function error(status: number, cuerpo: Record<string, unknown>) {
  return throwError(() => new HttpErrorResponse({ status, error: cuerpo }));
}

async function montar(api: Partial<Record<keyof CoautoriaApi, ReturnType<typeof vi.fn>>> = {}, entradas: Record<string, unknown> = {}) {
  TestBed.resetTestingModule();
  const completa = {
    iniciar: vi.fn(() => of(acuerdo())),
    leer: vi.fn(() => of(acuerdo())),
    responder: vi.fn(() => of(acuerdo({ respuestas: [RESPONDIDA_1], pregunta: PREGUNTA_2, llamadasUsadas: 2 }))),
    pedirPregunta: vi.fn(() => of(acuerdo())),
    saltar: vi.fn(() => of(acuerdo({ status: 'ready', pregunta: null }))),
    resumir: vi.fn(() => of(acuerdo({ status: 'summarized', pregunta: null, ficha: FICHA }))),
    corregir: vi.fn(() => of(acuerdo({ status: 'summarized', pregunta: null, ficha: FICHA }))),
    aceptar: vi.fn(() => of(acuerdo({ status: 'accepted', pregunta: null, ficha: FICHA, generationId: 'gen-1' }))),
    cancelar: vi.fn(() => of(acuerdo({ status: 'cancelled', pregunta: null }))),
    ...api,
  };
  await TestBed.configureTestingModule({
    imports: [ConversacionCoautoraComponent],
    providers: [{ provide: CoautoriaApi, useValue: completa }],
  }).compileComponents();
  const fixture = TestBed.createComponent(ConversacionCoautoraComponent);
  fixture.componentRef.setInput('destino', { lugarId: 'universidad' });
  for (const [nombre, valor] of Object.entries(entradas)) fixture.componentRef.setInput(nombre, valor);
  const raiz = fixture.nativeElement as HTMLElement;
  const listo = async () => {
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  fixture.detectChanges();
  await listo();
  return { fixture, raiz, listo, api: completa };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto);

async function empezar(raiz: HTMLElement, listo: () => Promise<void>) {
  const campo = raiz.querySelector<HTMLTextAreaElement>('textarea')!;
  campo.value = IDEA;
  campo.dispatchEvent(new Event('input'));
  await listo();
  boton(raiz, 'Conversar con la IA')!.click();
  await listo();
}

describe('ConversacionCoautoraComponent', { timeout: 20000 }, () => {
  it('con la idea escrita, la IA hace la primera pregunta: tres opciones, una recomendada, la propia y el contador', async () => {
    const { raiz, listo, api } = await montar();
    await empezar(raiz, listo);

    expect(api.iniciar).toHaveBeenCalledWith(IDEA, { lugarId: 'universidad' });
    expect(raiz.textContent).toContain('Pregunta 1 de 6');
    expect(raiz.querySelector('legend')!.textContent).toContain('¿Qué debe aprender quien juega?');
    const opciones = [...raiz.querySelectorAll('.opcion')].map((o) => o.textContent!.trim());
    expect(opciones).toHaveLength(4);
    expect(opciones[0]).toContain('Recomendada');
    expect(opciones[3]).toContain('escribo la mía');
    expect(boton(raiz, 'Decide tú')).toBeTruthy();
    expect(boton(raiz, 'Saltar las preguntas')).toBeTruthy();
  });

  it('una idea corta no deja empezar', async () => {
    const { raiz, listo, api } = await montar();
    const campo = raiz.querySelector<HTMLTextAreaElement>('textarea')!;
    campo.value = 'corta';
    campo.dispatchEvent(new Event('input'));
    await listo();

    expect(boton(raiz, 'Conversar con la IA')!.getAttribute('aria-disabled')).toBe('true');
    boton(raiz, 'Conversar con la IA')!.click();
    expect(api.iniciar).not.toHaveBeenCalled();
    expect(raiz.textContent).toContain('Escribe al menos 10 caracteres.');
  });

  it('elegir una opción y responder manda la elección y trae la siguiente pregunta', async () => {
    const { raiz, listo, api } = await montar();
    await empezar(raiz, listo);
    raiz.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0].click();
    await listo();
    boton(raiz, 'Responder')!.click();
    await listo();

    expect(api.responder).toHaveBeenCalledWith('a-1', 1, { tipo: 'opcion', indice: 0 });
    expect(raiz.textContent).toContain('Pregunta 2 de 6');
    expect(raiz.textContent).toContain('Escuchar sin juzgar');
  });

  it('la respuesta propia viaja como texto y «Decide tú» deja elegir a la IA', async () => {
    const { raiz, listo, api } = await montar();
    await empezar(raiz, listo);
    raiz.querySelectorAll<HTMLInputElement>('input[type="radio"]')[3].click();
    await listo();
    const propia = raiz.querySelector<HTMLInputElement>('input[type="text"]')!;
    propia.value = 'Que no presione';
    propia.dispatchEvent(new Event('input'));
    await listo();
    boton(raiz, 'Responder')!.click();
    await listo();
    expect(api.responder).toHaveBeenLastCalledWith('a-1', 1, { tipo: 'propia', texto: 'Que no presione' });

    boton(raiz, 'Decide tú')!.click();
    await listo();
    expect(api.responder).toHaveBeenLastCalledWith('a-1', 2, { tipo: 'decide' });
  });

  it('sin más preguntas pide el resumen solo y muestra «Lo que acordamos» con Aceptar y Hacer un cambio', async () => {
    const { raiz, listo, api } = await montar();
    await empezar(raiz, listo);
    boton(raiz, 'Saltar las preguntas')!.click();
    await listo();

    expect(api.saltar).toHaveBeenCalledWith('a-1');
    expect(api.resumir).toHaveBeenCalledWith('a-1');
    expect(raiz.textContent).toContain('Lo que acordamos');
    expect(raiz.textContent).toContain('Primera consulta');
    expect(raiz.textContent).toContain('De noche');
    expect(boton(raiz, 'Aceptar')).toBeTruthy();
    expect(boton(raiz, 'Hacer un cambio')).toBeTruthy();
  });

  it('«Hacer un cambio» se vuelve un cuadro de texto que manda la inconformidad', async () => {
    const { raiz, listo, api } = await montar({ iniciar: vi.fn(() => of(acuerdo({ status: 'summarized', pregunta: null, ficha: FICHA }))) });
    await empezar(raiz, listo);
    boton(raiz, 'Hacer un cambio')!.click();
    await listo();
    const campo = raiz.querySelector<HTMLTextAreaElement>('#cambio-texto')!;
    campo.value = 'Que sea de día';
    campo.dispatchEvent(new Event('input'));
    await listo();
    boton(raiz, 'Enviar el cambio')!.click();
    await listo();

    expect(api.resumir).toHaveBeenCalledWith('a-1', 'Que sea de día');
  });

  it('corregir una sección en su lugar manda la ficha corregida', async () => {
    const { raiz, listo, api } = await montar({ iniciar: vi.fn(() => of(acuerdo({ status: 'summarized', pregunta: null, ficha: FICHA }))) });
    await empezar(raiz, listo);
    boton(raiz, 'Corregir')!.click();
    await listo();
    const titulo = raiz.querySelector<HTMLInputElement>('.seccion input')!;
    titulo.value = 'Otra consulta';
    titulo.dispatchEvent(new Event('input'));
    boton(raiz, 'Guardar la corrección')!.click();
    await listo();

    expect(api.corregir).toHaveBeenCalledWith('a-1', { ...FICHA, titulo: 'Otra consulta' });
  });

  it('aceptar avisa con el acuerdo (para ir a la generación)', async () => {
    const { fixture, raiz, listo, api } = await montar({ iniciar: vi.fn(() => of(acuerdo({ status: 'summarized', pregunta: null, ficha: FICHA }))) });
    const aceptado = vi.fn();
    fixture.componentInstance.aceptado.subscribe(aceptado);
    await empezar(raiz, listo);
    boton(raiz, 'Aceptar')!.click();
    await listo();

    expect(api.aceptar).toHaveBeenCalledWith('a-1');
    expect(aceptado).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted', generationId: 'gen-1' }));
    expect(raiz.textContent).toContain('¡Acordado!');
  });

  it('una respuesta anterior se puede cambiar: vuelve su pregunta con la elección de antes', async () => {
    const { raiz, listo, api } = await montar();
    await empezar(raiz, listo);
    raiz.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0].click();
    await listo();
    boton(raiz, 'Responder')!.click();
    await listo();
    raiz.querySelector<HTMLButtonElement>('[aria-label="Cambiar la respuesta a la pregunta 1"]')!.click();
    await listo();

    expect(raiz.querySelector('legend')!.textContent).toContain('¿Qué debe aprender quien juega?');
    expect(raiz.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0].checked).toBe(true);
    raiz.querySelectorAll<HTMLInputElement>('input[type="radio"]')[2].click();
    await listo();
    boton(raiz, 'Cambiar mi respuesta')!.click();
    await listo();
    expect(api.responder).toHaveBeenLastCalledWith('a-1', 1, { tipo: 'opcion', indice: 2 });
  });

  it('si la primera pregunta falló, lo dice y «Volver a intentarlo» la pide de nuevo', async () => {
    const fallo = acuerdo({ pregunta: null, error: { code: 'AI_PROVIDER_ERROR', message: 'La IA no respondió. Inténtalo de nuevo en un momento.' } });
    const { raiz, listo, api } = await montar({ iniciar: vi.fn(() => of(fallo)) });
    await empezar(raiz, listo);

    expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('La IA no respondió.');
    boton(raiz, 'Volver a intentarlo')!.click();
    await listo();
    expect(api.pedirPregunta).toHaveBeenCalledWith('a-1');
    expect(raiz.textContent).toContain('Pregunta 1 de 6');
  });

  it('si falla la pregunta siguiente, relee la conversación y el reintento pide la pregunta', async () => {
    const { raiz, listo, api } = await montar({
      responder: vi.fn(() => error(502, { code: 'AI_PROVIDER_ERROR', message: 'La IA no respondió.' })),
      leer: vi.fn(() => of(acuerdo({ respuestas: [RESPONDIDA_1], pregunta: null }))),
    });
    await empezar(raiz, listo);
    boton(raiz, 'Decide tú')!.click();
    await listo();

    expect(api.leer).toHaveBeenCalledWith('a-1');
    boton(raiz, 'Volver a intentarlo')!.click();
    await listo();
    expect(api.pedirPregunta).toHaveBeenCalledWith('a-1');
  });

  it('un 400 de la idea queda junto al campo', async () => {
    const { raiz, listo } = await montar({
      iniciar: vi.fn(() => error(400, { code: 'VALIDATION_ERROR', field: 'idea', message: 'No escribas correos ni números de contacto o de documento.' })),
    });
    await empezar(raiz, listo);

    expect(raiz.querySelector('.error-campo')!.textContent).toContain('No escribas correos');
    expect(raiz.querySelector('textarea')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('el cupo agotado lo dice sin ofrecer reintento', async () => {
    const { raiz, listo } = await montar({
      iniciar: vi.fn(() => error(429, { code: 'AI_LIMIT_EXCEEDED', message: 'Llegaste al límite de ayuda de la IA por hoy.' })),
    });
    await empezar(raiz, listo);

    expect(raiz.textContent).toContain('Llegaste al límite de ayuda de la IA por hoy.');
    expect(boton(raiz, 'Volver a intentarlo')).toBeUndefined();
  });

  it('con autoEmpezar arranca sola con la idea que trae', async () => {
    const { raiz, api } = await montar({}, { ideaInicial: IDEA, autoEmpezar: true });

    expect(api.iniciar).toHaveBeenCalledWith(IDEA, { lugarId: 'universidad' });
    expect(raiz.textContent).toContain('Pregunta 1 de 6');
  });
});
