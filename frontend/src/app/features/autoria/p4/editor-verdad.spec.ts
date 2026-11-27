import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthoringApi } from '../../../core/api/authoring.api';
import { AvisosGuardadoComponent } from '../avisos-guardado.component';
import { CasoStore } from '../estado/caso.store';
import type { Cambio } from '../ia/propuestas';
import { ProgresoDelCaso } from '../marco/progreso.service';
import { esRelleno } from '../modelo/relleno';
import { casoCopiadoDeLugar } from '../testing/caso-api';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';

async function abrir() {
  TestBed.resetTestingModule();
  const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: 41, revision: 3 }), universidad);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
  const store = TestBed.inject(CasoStore);
  await store.cargar(41);
  return { servidor, store, escena: store.caso()!.escenas[0].id };
}

describe('P4 · el editor dice la verdad', () => {
  afterEach(() => vi.restoreAllMocks());

  it('un borrador sin revisión orienta hacia lo que falta sin contarlo como bloqueo confirmado', async () => {
    const { store } = await abrir();
    const caso = structuredClone(store.caso()!);
    caso.escenas[0].narracion = '';
    caso.escenas[0].lineas = [];
    caso.escenas[0].respuestas = [];
    store.fijar(caso);
    const progreso = TestBed.inject(ProgresoDelCaso);
    expect(store.revisionPendiente()).toBe(true);
    expect(store.totalPendientes()).toBe(0);
    expect(progreso.siguiente()).toMatchObject({ ruta: `/editor/escena/${caso.escenas[0].id}`, texto: expect.stringContaining('Escribe la escena') });
    expect(store.pendientes().some(p => p.tipo === 'sugerencia')).toBe(true);
  });

  it('una pregunta escrita invalida el aviso anterior, se guarda y se conserva al reabrir', async () => {
    const { store, servidor, escena } = await abrir();
    const nodo = servidor.editor.nodes[0];
    store.registrarRevision([{ code: 'NODE_NO_QUESTION', severity: 'error', message: 'La escena necesita una pregunta.', nodeId: nodo.id }]);
    expect(store.faltas().some(f => f.codigo === 'NODE_NO_QUESTION')).toBe(true);
    store.editarEscena(escena, { pregunta: '¿Qué harías ahora?' });
    expect(store.revisionPendiente()).toBe(true);
    expect(store.faltas().some(f => f.codigo === 'NODE_NO_QUESTION')).toBe(false);
    await store.sincronizado();
    expect(nodo.decisionPrompt).toBe('¿Qué harías ahora?');
    await store.cargar(41);
    expect(store.caso()!.escenas.find(e => e.id === escena)?.pregunta).toBe('¿Qué harías ahora?');
  });

  it.each([
    'Respuesta 1 de la persona profesional.', '  RESPUESTA  23 DE LA PERSONA PROFESIONAL… ',
    'Esta respuesta tiene consecuencias en el vínculo con la persona consultante.',
    'Escribe aquí tu respuesta.', '[retroalimentación]', 'Lorem ipsum dolor sit amet',
  ])('reconoce muestras normalizadas: %s', texto => expect(esRelleno(texto)).toBe(true));

  it.each(['¿Qué necesitas para sentirte segura aquí?', 'La respuesta de la persona profesional valida su preocupación.',
    'Escuchar sin interrumpir permite que explique lo sucedido.'])('no confunde contenido real con muestras: %s', texto => expect(esRelleno(texto)).toBe(false));

  it('suma escribir, corregir y servidor sin duplicar blockedReason; todos leen la misma lista reactiva', async () => {
    const { store } = await abrir();
    const progreso = TestBed.inject(ProgresoDelCaso);
    const locales = store.faltas().length;
    const h = { code: 'CASE_NO_TIME', severity: 'error' as const, message: 'Falta tiempo.' };
    store.registrarRevision([h, h], { blockedReason: h } as never);
    expect(store.totalPendientes()).toBe(locales + 1);
    expect(progreso.totalPendientes()).toBe(store.faltas().length);
    expect(progreso.pendientes()).toBe(store.pendientes());
    expect(progreso.pendientes().filter(p => p.tipo !== 'sugerencia')).toHaveLength(store.totalPendientes());
    expect(store.pendientes().find(p => p.codigo === 'CASE_NO_TIME')?.etapa).toBe('datos');
    store.registrarRevision([]);
    expect(progreso.totalPendientes()).toBe(locales);
  });

  it('la compuerta conserva cada bloqueo y su mensaje aunque comparta codigo', async () => {
    const { store } = await abrir();
    const hallazgos = [
      { code: 'NODE_FEW_OPTIONS', severity: 'error' as const, message: 'Primera escena.', nodeId: 1 },
      { code: 'NODE_FEW_OPTIONS', severity: 'error' as const, message: 'Segunda escena.', nodeId: 2 },
    ];
    store.registrarRevision(hallazgos);
    expect(store.faltas().map(f => f.mensaje)).toEqual(hallazgos.map(h => h.message));
    expect(store.totalPendientes()).toBe(2);
    expect(TestBed.inject(ProgresoDelCaso).pendientes().filter(p => p.tipo !== 'sugerencia')).toHaveLength(2);
  });

  it('el relleno aceptado sigue pendiente y lleva a la respuesta exacta; corregirlo elimina esas faltas', async () => {
    const { store, escena } = await abrir();
    const r = store.agregarRespuesta(escena);
    store.editarRespuesta(escena, r, { texto: 'Respuesta 2 de la persona profesional.', clase: 'RECOMMENDED',
      retroalimentacion: 'Esta respuesta tiene consecuencias en el vínculo con la persona consultante.', destinoId: store.caso()!.escenas[1].id });
    await store.sincronizado();
    store.aceptarIa({ escenaId: escena, respuestaId: r });
    await store.sincronizado();
    const relleno = store.pendientes().filter(p => p.codigo === 'CONTENT_PLACEHOLDER');
    expect(relleno).toHaveLength(2);
    expect(relleno.every(p => p.tipo === 'sugerencia' && p.ir.ruta === `/editor/escena/${escena}` && p.ir.ancla === `respuesta-${r}`)).toBe(true);
    store.editarRespuesta(escena, r, { texto: '¿Quieres que busquemos apoyo juntas?', retroalimentacion: 'Pide su consentimiento antes de contactar a alguien.' });
    expect(store.pendientes().filter(p => p.codigo === 'CONTENT_PLACEHOLDER')).toEqual([]);
    await store.sincronizado();
  });

  it.each([0, 503])('con fallo %s conserva texto y cola, anuncia espera y reintenta contra el servidor', async estado => {
    const { store, servidor, escena } = await abrir();
    const hora = store.ultimoGuardado();
    servidor.fallar('updateNode', estado);
    store.editarEscena(escena, { titulo: 'Texto que no se puede perder' });
    expect(store.textoGuardado()).toBe('Guardando…');
    await store.sincronizado();
    expect(store.ultimoGuardado()).toBe(hora);
    expect(store.caso()!.escenas[0].titulo).toBe('Texto que no se puede perder');
    expect(store.haySinGuardar()).toBe(true);
    const fixture = TestBed.createComponent(AvisosGuardadoComponent);
    fixture.componentRef.setInput('parte', 'estado');
    fixture.detectChanges();
    const raiz = fixture.nativeElement as HTMLElement;
    expect(raiz.querySelector('[aria-live="polite"]')!.textContent).toContain(estado === 0 ? 'Sin conexión: tus cambios esperan' : 'No se pudo guardar: reintentar');
    raiz.querySelector<HTMLButtonElement>('button')!.click();
    await store.sincronizado();
    expect(servidor.editor.nodes[0].title).toBe('Texto que no se puede perder');
    expect(store.haySinGuardar()).toBe(false);
    expect(store.textoGuardado()).toMatch(/^Todo guardado · \d{2}:\d{2}$/);
  });

  it('una validación que termina después de otra edición no publica un cero antiguo', async () => {
    const { store, servidor, escena } = await abrir();
    const respuesta = new Subject<never>();
    vi.spyOn(servidor.autoria, 'validateCase').mockReturnValue(respuesta as never);
    const pendiente = store.revisarConServidor();
    const rechazo = expect(pendiente).rejects.toThrow('cambió durante la revisión');
    await Promise.resolve();
    store.editarEscena(escena, { titulo: 'Cambió mientras se revisaba' });
    await store.sincronizado();
    respuesta.next({ issues: [], canPublish: true } as never);
    respuesta.complete();
    await rechazo;
    expect(store.revisionPendiente()).toBe(true);
  });

  it('deshacer una aceptación restaura contenido y marcas de escena, diálogo, respuesta y sala también en servidor', async () => {
    const { store, servidor, escena } = await abrir();
    const [origen, destino] = servidor.editor.nodes;
    store.aplicarPropuesta([
      { op: 'set-intensity', nodeId: origen.id, intensity: 'HIGH', warningMessage: 'Situación delicada.' },
      { op: 'add-line', nodeId: origen.id, characterId: servidor.editor.characters[0].id, text: 'Puedes contarme a tu ritmo.', expression: 'neutral' },
      { op: 'add-response', nodeId: origen.id, text: 'Te escucho.', responseClass: 'RECOMMENDED', feedbackText: 'Respeta su ritmo.', prohibitionReason: '', targetNodeId: destino.id },
    ] as Cambio[], [true, true, true]);
    await store.sincronizado();
    const antes = structuredClone(store.caso()!);
    store.aceptarEscenaIa(escena);
    await store.sincronizado();
    expect(store.partesIaDeEscena(escena)).toBe(0);
    expect(store.puedeDeshacerPropuesta()).toBe(true);
    store.deshacerPropuesta();
    await store.sincronizado();
    expect(store.error()).toBeNull();
    expect({ ...store.caso(), revision: antes.revision }).toEqual(antes);
    expect(servidor.editor.nodes[0].aiSuggested).toBe(true);
    expect(servidor.editor.decisions[0].aiSuggested).toBe(true);
    expect(servidor.mundos.get(origen.id)!.dialogues.flatMap(d => d.lines).some(l => l.aiSuggested)).toBe(true);
  });

  it('deshacer una sugerencia restaura la marca anterior false también en servidor', async () => {
    const { store, servidor } = await abrir();
    const antes = structuredClone(store.caso()!);
    store.aplicarPropuesta([{ op: 'set-intensity', nodeId: servidor.editor.nodes[0].id, intensity: 'HIGH', warningMessage: 'Aviso de muestra.' }] as Cambio[], [true]);
    await store.sincronizado();
    store.deshacerPropuesta();
    await store.sincronizado();
    expect({ ...store.caso(), revision: antes.revision }).toEqual(antes);
    expect(servidor.editor.nodes[0].aiSuggested).toBe(false);
  });
});
