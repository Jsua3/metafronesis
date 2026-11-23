import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../core/api/authoring.api';
import type { CasoBorrador } from '../modelo/caso';
import { casoCopiadoDeLugar } from '../testing/caso-api';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';
import { CasoStore, mensajeDeFallo } from './caso.store';

/**
 * Ronda de arreglos 1, tanda S: lo que el docente escribió no se pierde (S2), salir sin perderlo (S1), fallos a medias
 * con la verdad (S3), deshacer lo aplicado por el asistente (S9) y mensajes en palabras del docente (S10).
 */
const CASO = 41;

async function abrir() {
  TestBed.resetTestingModule();
  const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 }), universidad);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
  const store = TestBed.inject(CasoStore);
  await store.cargar(CASO);
  servidor.llamadas.length = 0;
  return { servidor, store };
}

const caso = (store: CasoStore): CasoBorrador => store.caso()!;
const sala = (store: CasoStore, id: string) => caso(store).salas.find((s) => s.id === id)!;
const escenaDe = (store: CasoStore, salaId: string) => caso(store).escenas.find((e) => e.salaId === salaId)!;

describe('S2 · no se pierde lo escrito', () => {
  it('un conflicto lista COMPLETO todo lo que se escribió, sin recortar, y lo estructural en palabras del docente', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const pasillo = escenaDe(store, 'pasillo');
    servidor.otraSesionEscribe();
    const largo = 'Escucho con calma y sin interrumpir, le doy tiempo y le pregunto cómo se siente hoy. '.repeat(4).trim();
    expect(largo.length).toBeGreaterThan(140);

    const r = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, r, { texto: largo, clase: 'CONTRAINDICATED', razon: 'La razón completa de por qué esta respuesta puede dañar.', retroalimentacion: 'Lo que lee después.' });
    store.moverElemento('consultorio', 'mueble', 0, 500, 350);
    store.borrarEscena(pasillo.id);
    store.agregarHito({ clave: 'abrir', nombre: 'Abrir la conversación', descripcion: 'Descripción del hito.', decisivo: false });
    store.fijarModoFinales('propio');
    const final = store.agregarFinal();
    store.editarFinal(final, { nombre: 'Final con nombre propio', texto: 'Texto del final.' });
    await store.sincronizado();

    const lista = store.conflicto()!.sinGuardar;
    expect(lista).toContain(`Una respuesta de «${origen.titulo}»: «${largo}»`);
    expect(lista).toContain(`Por qué es contraindicada una respuesta de «${origen.titulo}»: «La razón completa de por qué esta respuesta puede dañar.»`);
    expect(lista).toContain(`Lo que lee el estudiante después de una respuesta de «${origen.titulo}»: «Lo que lee después.»`);
    expect(lista).toContain(`Moviste un mueble en la sala «${sala(store, 'consultorio').nombre}»`);
    expect(lista).toContain(`Borraste la escena «${pasillo.titulo}»`);
    expect(lista).toContain('Agregaste el hito «Abrir la conversación»');
    expect(lista).toContain('Nombre de un final: «Final con nombre propio»');
    expect(lista).toContain('Texto de un final: «Texto del final.»');
    for (const texto of lista) expect(texto, texto).not.toMatch(/undefined|\[object|\bclave\b|\bnodo\b/i);

    // Al recargar, lo que se pierde queda a la vista completo
    await store.recargar();
    expect(store.recuperado()).toContain(`Una respuesta de «${origen.titulo}»: «${largo}»`);
  });

  it('un cambio que el sistema rechaza (no es conflicto) muestra el texto que se descartó', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    servidor.fallar('updateNode', 500);
    store.editarEscena(origen.id, { titulo: 'Un título que no se guardó' });
    await store.sincronizado();
    expect(store.error()).toMatch(/no se pudo guardar/i);
    expect(store.descartado()).toEqual(['Título de una escena: «Un título que no se guardó»']);
    store.descartarError();
    expect(store.descartado()).toEqual([]);
  });
});

describe('S1 · salir sin perder nada', () => {
  it('hay algo sin guardar con cambios viajando, con un conflicto o con respuestas que solo están en pantalla', async () => {
    const { servidor, store } = await abrir();
    expect(store.haySinGuardar()).toBe(false);

    const origen = escenaDe(store, 'consultorio');
    store.editarEscena(origen.id, { titulo: 'Cambio en vuelo' });
    expect(store.haySinGuardar()).toBe(true); // viajando
    await store.sincronizado();
    expect(store.haySinGuardar()).toBe(false);

    const r = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, r, { texto: 'A medias' });
    await store.sincronizado();
    expect(store.haySinGuardar()).toBe(true); // sin clase: solo está en pantalla
    store.editarRespuesta(origen.id, r, { clase: 'ACCEPTABLE', destinoId: escenaDe(store, 'pasillo').id });
    await store.sincronizado();
    expect(store.haySinGuardar()).toBe(false);

    servidor.otraSesionEscribe();
    store.moverEscena(origen.id, 1, 1);
    await store.sincronizado();
    expect(store.haySinGuardar()).toBe(true); // conflicto
  });

  it('recargar incluye las respuestas que no se habían guardado', async () => {
    const { store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const r = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, r, { texto: 'Me quedé a medias' });
    await store.sincronizado();
    await store.recargar();
    expect(store.recuperado().join(' ')).toContain('Me quedé a medias');
    expect(store.recuperado().join(' ')).toContain('Elige cómo es esta respuesta');
  });
});

describe('S3 · fallos a medias', () => {
  it('si falla el guardado en el segundo mapa de la sala, reintenta una vez y la sala queda igual en todos', async () => {
    const { servidor, store } = await abrir();
    store.agregarEscena('consultorio');
    await store.sincronizado();
    servidor.llamadas.length = 0;
    servidor.fallar('saveWorld', 500, 'Falló.', { saltar: 1 }); // el primer mapa guarda, el segundo falla una vez

    store.moverElemento('consultorio', 'mueble', 0, 450, 350);
    await store.sincronizado();

    expect(store.error()).toBeNull();
    expect(servidor.metodos).toEqual(['saveWorld', 'saveWorld', 'saveWorld']);
    const claveMueble = sala(store, 'consultorio').muebles[0].clave;
    const posiciones = [...servidor.mundos.values()].filter((m) => m.map.ambient['salaId'] === 'consultorio')
      .map((m) => m.objects.find((o) => o.key === claveMueble)!.x);
    expect(posiciones).toEqual([450, 450]);
  });

  it('si el reintento también falla, lo dice con la verdad y el borrador muestra lo que quedó guardado', async () => {
    const { servidor, store } = await abrir();
    store.agregarEscena('consultorio');
    await store.sincronizado();
    const xAntes = sala(store, 'consultorio').muebles[0].x;
    servidor.fallar('saveWorld', 500, 'Falló.', { saltar: 1, veces: 2 });

    store.moverElemento('consultorio', 'mueble', 0, 450, 350);
    await store.sincronizado();

    expect(store.error()).toBe('Algunas escenas de esta sala pueden mostrarla distinta. Vuelve a guardarla.');
    expect(store.error()).not.toMatch(/como estaba/i);
    // El primer mapa sí cambió: el borrador lo refleja en vez de volver a la posición vieja
    expect(xAntes).not.toBe(450);
    expect(sala(store, 'consultorio').muebles[0].x).toBe(450);
    expect(store.conflicto()).toBeNull();
  });

  it('si borrar la escena falla después de quitar los caminos que llevaban a ella, lo dice y esos caminos quedan sin destino', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const destino = escenaDe(store, 'pasillo');
    const r = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, r, { texto: 'Vamos.', clase: 'ACCEPTABLE', destinoId: destino.id });
    await store.sincronizado();
    servidor.fallar('deleteNode', 500);

    store.borrarEscena(destino.id);
    await store.sincronizado();

    expect(store.error()).toContain('Se quitaron los caminos que llevaban a esa escena, pero la escena no se pudo borrar');
    expect(store.error()).not.toMatch(/como estaba/i);
    expect(caso(store).escenas.some((e) => e.id === destino.id)).toBe(true); // la escena sigue
    expect(caso(store).escenas.find((e) => e.id === origen.id)!.respuestas.find((x) => x.id === r)!.destinoId).toBeNull();
    expect(servidor.editor.decisions).toHaveLength(0);
  });
});

describe('S9 · deshacer lo aplicado por el asistente', () => {
  it('deshace de un paso lo creado y lo cambiado por la última propuesta, también en el servidor', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const nodoOrigen = Number(origen.id);
    const psicologa = servidor.editor.characters[0];
    expect(store.puedeDeshacerPropuesta()).toBe(false);

    store.aplicarPropuesta([
      { op: 'add-scene', id: 'nueva-1', title: 'Escena del asistente', narrative: 'Una narración.', intensity: 'MEDIUM', warningMessage: '', afterNodeId: nodoOrigen },
      { op: 'add-line', nodeId: 'nueva-1', characterId: psicologa.id, text: 'Hola.', expression: 'neutral' },
      { op: 'add-response', nodeId: nodoOrigen, text: 'Respuesta del asistente.', responseClass: 'RECOMMENDED', feedbackText: 'Bien.', prohibitionReason: '', targetNodeId: 'nueva-1' },
      { op: 'set-intensity', nodeId: nodoOrigen, intensity: 'HIGH', warningMessage: 'Aviso.' },
    ] as never, [true, true, true, true]);
    await store.sincronizado();
    expect(store.puedeDeshacerPropuesta()).toBe(true);
    expect(servidor.editor.nodes).toHaveLength(3);
    expect(servidor.editor.decisions).toHaveLength(1);

    store.deshacerPropuesta();
    expect(caso(store).escenas).toHaveLength(2); // se ve al instante
    await store.sincronizado();

    expect(store.error()).toBeNull();
    expect(store.puedeDeshacerPropuesta()).toBe(false);
    expect(servidor.editor.nodes).toHaveLength(2);
    expect(servidor.editor.decisions).toHaveLength(0);
    expect(servidor.editor.nodes.find((n) => n.id === nodoOrigen)).toMatchObject({ intensity: 'MEDIUM', warningMessage: null });
    expect(caso(store).escenas.find((e) => e.id === origen.id)).toMatchObject({ intensidad: 'MEDIUM', advertencia: null, respuestas: [] });
  });

  it('si el docente cambia algo después de aplicar, ya no se ofrece deshacerla', async () => {
    const { store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    store.aplicarPropuesta([
      { op: 'set-intensity', nodeId: Number(origen.id), intensity: 'HIGH', warningMessage: 'Aviso.' },
    ] as never, [true]);
    expect(store.puedeDeshacerPropuesta()).toBe(true);
    store.moverEscena(origen.id, 9, 9);
    expect(store.puedeDeshacerPropuesta()).toBe(false);
    await store.sincronizado();
  });
});

describe('S10 · mensajes en palabras del docente', () => {
  const http = (status: number, field?: string) => new HttpErrorResponse({ status, error: { message: 'Texto del backend con detalles técnicos', field } });

  it('cada caso tiene un texto propio y ninguno cita al backend ni dice «servidor»', () => {
    const textos = [0, 403, 404, 500, 502].map((s) => mensajeDeFallo(http(s), 'la escena'));
    expect(textos[0]).toContain('No hay conexión. Revisa tu internet y vuelve a intentarlo.');
    expect(textos[1]).toContain('No tienes permiso para cambiar este caso.');
    for (const t of textos) {
      expect(t).toMatch(/^No se pudo guardar la escena\. Lo dejamos como estaba\./);
      expect(t).not.toMatch(/servidor|backend|detalles técnicos/i);
    }
  });

  it('un 400 dice qué falta según el campo conocido y, si no lo conoce, algo genérico (nunca el texto del backend)', () => {
    expect(mensajeDeFallo(http(400, 'responseClass'), 'la respuesta')).toContain('Falta elegir cómo es la respuesta.');
    expect(mensajeDeFallo(http(400, 'prohibitionReason'), 'la respuesta')).toContain('Falta escribir por qué es contraindicada.');
    const generico = mensajeDeFallo(http(400, 'campoRaro'), 'la respuesta');
    expect(generico).toContain('Revisa lo que escribiste');
    expect(generico).not.toContain('backend');
    expect(mensajeDeFallo(new Error('La sala «x» no está en el caso.'), 'la sala')).toBe('No se pudo guardar la sala. Lo dejamos como estaba.');
  });
});
