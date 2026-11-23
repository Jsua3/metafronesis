import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../../core/api/authoring.api';
import type { ValidationIssue } from '../../../../core/models/simulation.model';
import { CasoStore } from '../../estado/caso.store';
import { casoCopiadoDeLugar, listaDelServidor } from '../../testing/caso-api';
import { ServidorFalso } from '../../testing/servidor-falso';
import { universidad } from '../../testing/universidad';
import { RevisionComponent } from './revision.component';

const CASO = 41;

/** Un caso sin nada que resolver en el editor: dos escenas, una respuesta recomendada que cumple todos los hitos y un final. */
function casoLimpio() {
  const datos = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 });
  const [a, b] = datos.editor.nodes;
  b.terminal = true;
  datos.editor.decisions.push({
    id: 900, optionKey: 'opcion-1', sourceNodeId: a.id, sourceKey: a.key, targetNodeId: b.id, targetKey: b.key, text: 'Te escucho.',
    responseClass: 'RECOMMENDED', prohibitedConduct: false, prohibitionReason: null, immediateFeedback: '', feedbackText: 'Escuchar da seguridad.',
    consequenceText: '', theoryBasis: '', aiSuggested: false, requires: {}, reaction: {}, effects: { milestones: datos.editor.rules.milestones.map((m) => m.key) },
  });
  return datos;
}

async function montar(opciones: { hallazgos?: ValidationIssue[]; estado?: string; revision?: ServidorFalso['ultimaRevision']; bloqueos?: ServidorFalso['bloqueos']; marcados?: string[]; constancia?: boolean; respaldados?: string[]; estricto?: boolean } = {}) {
  localStorage.clear();
  TestBed.resetTestingModule();
  const datos = casoLimpio();
  if (opciones.estado) datos.editor.status = opciones.estado;
  if (opciones.marcados) datos.editor.checklist = listaDelServidor(opciones.marcados, { constancia: opciones.constancia, respaldados: opciones.respaldados, estricto: opciones.estricto });
  const servidor = new ServidorFalso(datos, universidad);
  servidor.hallazgos = opciones.hallazgos ?? [];
  servidor.bloqueos = opciones.bloqueos ?? [];
  servidor.ultimaRevision = opciones.revision;
  await TestBed.configureTestingModule({
    imports: [RevisionComponent],
    providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  await store.cargar(CASO);
  servidor.llamadas.length = 0;
  const fixture = TestBed.createComponent(RevisionComponent);
  document.body.appendChild(fixture.nativeElement);
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); await new Promise((r) => setTimeout(r, 0)); await fixture.whenStable(); fixture.detectChanges(); };
  await listo();
  const raiz = fixture.nativeElement as HTMLElement;
  const enviar = () => [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Enviar a Psicología')!;
  return { fixture, store, servidor, raiz, listo, enviar };
}

const issue = (code: string, mensaje: string, extra: Partial<ValidationIssue> = {}): ValidationIssue => ({ code, severity: 'error', message: mensaje, ...extra });

describe('RevisionComponent · la compuerta de publicación en lenguaje del docente', () => {
  afterEach(() => document.querySelectorAll('body > app-revision, body > [ng-version]').forEach((n) => n.remove()));

  it('un texto largo es una sugerencia con el texto y su escena, no una falta: el caso se puede enviar igual', async () => {
    const mensaje = 'Escena «Consultorio», diálogo «Laura», línea del diálogo 2: este parlamento tiene 336 caracteres y en la pantalla'
      + ' del juego se lee cómodo hasta 200; repártelo en varios turnos cortos del mismo personaje. Empieza así: «Anoche pasó algo…»';
    const { raiz, enviar } = await montar({
      hallazgos: [issue('DSL.READING_LENGTH', mensaje, { severity: 'warning', nodeId: 1, path: 'x-siep.escenas[0].mapa.dialogos[0].lineas[1].texto' })],
    });
    expect(raiz.textContent).toContain('Nada por resolver.');
    expect(enviar().getAttribute('aria-disabled')).not.toBe('true');
    const fila = [...raiz.querySelectorAll<HTMLElement>('li.falta')].find((li) => li.textContent?.includes('este parlamento tiene 336 caracteres'));
    expect(fila, 'el aviso sale entre las sugerencias').toBeDefined();
    expect(fila!.closest('details')!.querySelector('summary')!.textContent).toContain('no impiden enviar');
    expect(fila!.textContent).toContain('Empieza así: «Anoche pasó algo…»');
    expect(fila!.querySelector('a')!.textContent!.trim()).toBe('Ir a revisarlo');
    expect(fila!.querySelector('a')!.getAttribute('href')).toContain('/editor/escena/1');
    expect(raiz.textContent).not.toMatch(/DSL\.|READING_LENGTH/);
  });

  it('un caso sin nada que resolver puede enviarse', async () => {
    const { raiz, enviar, servidor } = await montar();
    expect(servidor.metodos).toEqual(['caseEditor', 'validateCase', 'lifecycle']); // la primera relee si el ensayo ya llegó a un final
    expect(raiz.textContent).toContain('Nada por resolver.');
    expect(enviar().getAttribute('aria-disabled')).not.toBe('true');
    expect(raiz.querySelector('.pildora.estado')!.textContent!.trim()).toBe('Borrador');
  });

  it('la revisión lista los seis códigos del validador en lenguaje del docente con «Llévame ahí»', async () => {
    const { raiz } = await montar({
      hallazgos: [
        issue('scene-without-recommended', 'La escena «Consultorio» no tiene ninguna respuesta recomendada: marca al menos una como «Recomendada».', { sceneKey: 'consultorio', nodeId: 1 }),
        issue('contraindicated-without-reason', 'La respuesta «Te escucho.» de la escena «Consultorio» es contraindicada y no explica por qué: escribe el motivo de la prohibición.', { sceneKey: 'consultorio', nodeId: 1, optionKey: 'opcion-1' }),
        issue('milestone-unreachable', 'El hito «Informar derechos» no se puede cumplir: ninguna respuesta de las escenas a las que se llega desde el inicio lo marca.', { milestoneKey: 'informar_derechos' }),
        issue('ending-unreachable', 'El final «Intervención protectora» no se puede alcanzar: ningún recorrido completo cumple su condición.', { endingKey: 'protectora' }),
        issue('competency-without-evidence', 'La competencia «Escucha activa» de la rúbrica no tiene evidencia: ninguna respuesta del caso la declara.', { competencyCode: 'ESCUCHA_ACTIVA' }),
        issue('high-intensity-without-warning', 'La escena «Pasillo» es de intensidad alta y no tiene mensaje de advertencia: escríbelo antes de publicar.', { sceneKey: 'pasillo', nodeId: 2 }),
      ],
    });
    const filas = [...raiz.querySelectorAll<HTMLElement>('section.por-resolver li.falta')];
    expect(filas).toHaveLength(6);
    expect(raiz.querySelector('section.por-resolver h2')!.textContent).toContain('Por resolver (6)');
    for (const fila of filas) {
      const boton = fila.querySelector('button')!;
      expect(boton.textContent!.trim()).toBe('Llévame ahí');
      expect(boton.getAttribute('aria-label')).toMatch(/^Llévame ahí: /);
    }
    expect(filas.map((f) => f.querySelector('p')!.textContent)).toEqual([
      expect.stringContaining('no tiene ninguna respuesta recomendada'),
      expect.stringContaining('es contraindicada y no explica por qué'),
      expect.stringContaining('no se puede cumplir'),
      expect.stringContaining('no se puede alcanzar'),
      expect.stringContaining('no tiene evidencia'),
      expect.stringContaining('intensidad alta'),
    ]);
    // ni códigos ni jerga en pantalla
    expect(raiz.textContent).not.toMatch(/scene-without|contraindicated-without|milestone-unreachable|WORLD\.|DSL\.|nodeId/);
  });

  it('«Llévame ahí» abre la escena, la respuesta, el hito o el final concretos y les da el foco', async () => {
    const { raiz, store, listo } = await montar({
      hallazgos: [issue('milestone-unreachable', 'El hito «Informar derechos» no se puede cumplir.', { milestoneKey: 'informar_derechos' })],
    });
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    // el elemento al que debe llegar el foco (la pantalla de destino lo dibujaría)
    const destino = document.createElement('li');
    destino.id = 'hito-informar_derechos';
    document.body.appendChild(destino);
    raiz.querySelector<HTMLButtonElement>('section.por-resolver li.falta button')!.click();
    await new Promise((r) => setTimeout(r, 120));
    await listo();
    expect(navegar).toHaveBeenCalledWith(`/portal/casos/${store.caso()!.id}/editor/evaluacion`); // los hitos viven en Evaluación (E5)
    expect(document.activeElement).toBe(destino);
    destino.remove();
  });

  it('una escena con respuestas en una sala sin personas bloquea el envío y «Llévame ahí» abre la sala', async () => {
    const { raiz, store, enviar, listo } = await montar();
    // El consultorio se queda sin su única persona (el caso ya trae una respuesta en esa escena).
    const caso = structuredClone(store.caso()!);
    caso.salas.find((x) => x.id === 'consultorio')!.personajes = [];
    store.fijar(caso);
    await listo();
    // Lo que el editor ve por su cuenta no se lista aquí (vive en la hoja «Pendientes»): se resume por etapa y bloquea el envío.
    expect(raiz.querySelectorAll('section.por-resolver li.falta')).toHaveLength(0);
    expect(raiz.querySelector('[data-etapa="lugar"] .etapa__estado')!.textContent!.trim()).toBe('1 por corregir');
    expect(raiz.querySelector('[data-etapa="datos"] .etapa__estado')!.textContent!.trim()).toBe('Listo');
    expect(raiz.querySelector('section.por-resolver h2')!.textContent).toContain('Por resolver (1)');
    expect(enviar().getAttribute('aria-disabled')).toBe('true');
    // Como en el panel de problemas de un IDE, el problema sale en su etapa, y la fila entera lleva a él (CU-04 · editar el caso).
    const fila = raiz.querySelector<HTMLButtonElement>('.etapa:has([data-etapa="lugar"]) li.problema button.fila-problema')!;
    expect(fila.textContent).toContain('tiene respuestas pero en su sala no hay nadie con quien hablar');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fila.click();
    await new Promise((r) => setTimeout(r, 60));
    expect(navegar.mock.calls.some(([url]) => String(url).includes(`/portal/casos/${store.caso()!.id}/editor/sala/`)), 'lleva a la sala').toBe(true);
    navegar.mockRestore();
    // «Ver pendientes» abre la hoja, que sí lleva a la sala (su prueba está en panel-pendientes.component.spec.ts).
    raiz.querySelector<HTMLButtonElement>('[data-etapa="lugar"] button')!.click();
    await listo();
    const hoja = document.querySelector('app-panel-pendientes')!;
    expect(hoja, 'se abre la hoja de pendientes').not.toBeNull();
    expect(hoja.textContent).toContain('tiene respuestas pero en su sala no hay nadie con quien hablar');
    expect(store.caso()).toBeTruthy();
  });

  it('un bloqueo de la compuerta que no es de un hallazgo (la lista de verificación) se muestra y no deja enviar', async () => {
    const mensaje = 'El checklist ético y académico debe estar al 100% antes de enviar el caso a revisión.';
    const { raiz, servidor, enviar, listo } = await montar({ bloqueos: [{ code: 'CHECKLIST_INCOMPLETE', message: mensaje }] });
    expect([...raiz.querySelectorAll('section.por-resolver li.falta p')].map((p) => p.textContent)).toEqual([mensaje]);
    expect(raiz.querySelector('section.por-resolver')!.textContent).toContain('De la lista de verificación');
    expect(enviar().getAttribute('aria-disabled')).toBe('true');
    enviar().click();
    await listo();
    expect(servidor.llamadasA('transitionCase')).toHaveLength(0);
  });

  it('enviar llama a lifecycle submit y muestra el estado «En revisión»', async () => {
    const { raiz, servidor, store, enviar, listo } = await montar();
    const mensaje = raiz.querySelector<HTMLTextAreaElement>('textarea#mp')!;
    mensaje.value = 'Mira con cuidado el final.';
    mensaje.dispatchEvent(new Event('input'));
    enviar().click();
    await store.sincronizado();
    await listo();
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    const envio = servidor.llamadasA('transitionCase')[0];
    expect(envio.args[0]).toEqual({ action: 'submit', note: 'Mira con cuidado el final.' });
    expect(envio.revision).toBe(3);
    expect(raiz.querySelector('.pildora.estado')!.textContent!.trim()).toBe('En revisión');
    expect(raiz.querySelector('[role="status"].listo')!.textContent).toContain('El caso está en revisión de Psicología');
    expect(raiz.textContent).toContain('Se puede ver, pero no editar.');
    expect([...raiz.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Enviar a Psicología')).toBe(false);
    expect(store.soloLectura()).toBe(true);
  });

  it('si la compuerta rechaza el envío, el caso sigue siendo un borrador y la lista muestra por qué', async () => {
    const { raiz, servidor, store, enviar, listo } = await montar();
    servidor.bloqueos = [{
      code: 'VALIDATION_ERRORS', message: 'El caso tiene 1 error.',
      issues: [issue('milestone-unreachable', 'El hito «Informar derechos» no se puede cumplir.', { milestoneKey: 'informar_derechos' })],
    }];
    enviar().click();
    await store.sincronizado().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(raiz.querySelector('.pildora.estado')!.textContent!.trim()).toBe('Borrador');
    expect(raiz.querySelector('section.por-resolver')!.textContent).toContain('El hito «Informar derechos» no se puede cumplir.');
    expect(store.soloLectura()).toBe(false);
  });

  it('A4 · si otra persona cambió el caso, enviar no dice «vuelve a intentarlo»: manda a recargar', async () => {
    const { raiz, servidor, store, enviar, listo } = await montar();
    servidor.otraSesionEscribe();
    enviar().click();
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(store.conflicto()).not.toBeNull();
    const aviso = raiz.querySelector('#eph')!.textContent!;
    expect(aviso).toContain('Otra persona cambió el caso');
    expect(aviso).toContain('Recarga');
    expect(aviso).not.toContain('vuelve a intentarlo en un momento');
    expect(store.soloLectura()).toBe(false);
  });

  it('A5 · el resumen nombra el lugar del caso, no uno fijo', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('section.resumen .resumen__texto p')!.textContent).toContain(`${universidad.nombre} · `);
    expect(raiz.querySelector('section.resumen ui-stat')!.textContent).toContain('2');
  });

  it('A5 · un caso sin lugar no nombra ninguno', async () => {
    const { raiz, store, listo, fixture } = await montar();
    const caso = structuredClone(store.caso()!);
    caso.lugarId = null;
    store.fijar(caso);
    fixture.detectChanges();
    await listo();
    const texto = raiz.querySelector('section.resumen .resumen__texto p')!.textContent!.trim();
    expect(texto).toMatch(/^finales /);
    expect(texto).not.toContain(universidad.nombre);
  });

  it('un caso que ya está en revisión se ve así y no ofrece enviar', async () => {
    const { raiz } = await montar({ estado: 'IN_REVIEW' });
    expect(raiz.querySelector('.pildora.estado')!.textContent!.trim()).toBe('En revisión');
    expect([...raiz.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Enviar a Psicología')).toBe(false);
    expect(raiz.textContent).toContain('Se puede ver, pero no editar.');
  });

  it('en ninguna parte aparece una cifra de estrés o de puntaje', async () => {
    const { raiz } = await montar();
    expect(raiz.textContent).not.toMatch(/estr[eé]s|puntaje|puntos/i);
  });
});

describe('RevisionComponent · lista de verificación ética y académica', () => {
  afterEach(() => document.querySelectorAll('body > app-revision, body > [ng-version]').forEach((n) => n.remove()));
  const OBLIGATORIOS = ['contentOriginal', 'ethicsReviewed', 'safetyProtocols', 'noStigmatizing', 'triggerWarnings', 'accessibilityOk'];
  const casilla = (raiz: HTMLElement, codigo: string) => raiz.querySelector<HTMLInputElement>(`#lista-verificacion input[data-codigo="${codigo}"]`)!;

  it('parte la lista en dos: casillas para lo que declara la docente y filas de estado para lo que comprueba el sistema', async () => {
    const { raiz } = await montar({ marcados: ['contentOriginal'] });
    const seccion = raiz.querySelector('section#lista-verificacion')!;
    expect(seccion.querySelector('h2')!.textContent).toContain('Lista de verificación');
    const filas = [...seccion.querySelectorAll<HTMLElement>('li.item-lista')];
    expect(filas, 'solo las declaraciones son casillas').toHaveLength(5);
    expect(casilla(raiz, 'contentOriginal').checked).toBe(true);
    expect(casilla(raiz, 'ethicsReviewed').checked).toBe(false);
    expect(filas[0].textContent).toContain('Contenido original');
    expect(filas[0].textContent).toContain('Obligatorio');
    expect(filas.at(-1)!.textContent).toContain('Opcional');
    expect(filas.at(-1)!.textContent).toContain('Texto pendiente de validar con Psicología');
    // lo que comprueba el sistema no tiene casilla: es una fila que dice si ya está hecho o qué falta
    expect(casilla(raiz, 'safetyProtocols')).toBeNull();
    expect(casilla(raiz, 'triggerWarnings')).toBeNull();
    const estados = [...seccion.querySelectorAll<HTMLElement>('li.item-estado')];
    expect(estados).toHaveLength(2);
    expect(estados[0].textContent).toContain('Protocolos de seguridad');
    expect(estados[0].textContent).toContain('Falta');
    expect(estados[0].textContent).toContain('Lo comprueba el sistema');
    expect(estados[1].textContent).toContain('Hecho');
    expect(seccion.textContent).not.toContain('Marcarla no basta');
    expect(seccion.textContent).toContain('Pendiente: la constancia la registra Psicología al aprobar el caso; no es una casilla tuya.');
    expect(seccion.textContent).not.toMatch(/estr[eé]s|puntaje|puntos/i);
  });

  it('lo que el sistema ya comprueba se cuenta solo: se marca en el servidor sin que la docente haga nada', async () => {
    const { servidor, store, listo } = await montar({ marcados: [] });
    await store.sincronizado();
    await listo();
    const guardados = servidor.llamadasA('updateChecklist');
    expect(guardados, 'una sola vez, solo por el ítem que el sistema respalda').toHaveLength(1);
    expect(guardados[0].args[0]).toMatchObject({ triggerWarnings: true, safetyProtocols: false, contentOriginal: false });
  });

  it('con la bandera estricta, lo que respalda la constancia sigue siendo casilla: la docente lo declara al enviar y Psicología lo confirma al aprobar', async () => {
    // Sin esto la docente nunca podría completar la lista: la constancia se registra DESPUÉS de enviar.
    const { raiz, store, enviar, listo } = await montar({
      marcados: ['contentOriginal', 'noStigmatizing', 'accessibilityOk'], respaldados: ['safetyProtocols', 'triggerWarnings'], estricto: true,
    });
    await store.sincronizado();
    await listo();
    const etica = casilla(raiz, 'ethicsReviewed');
    expect(etica, 'es una casilla').not.toBeNull();
    expect(etica.closest('li')!.textContent).toContain('Psicología lo confirma al aprobar');
    expect(raiz.querySelector('li.item-estado[data-codigo="ethicsReviewed"]')).toBeNull();
    etica.click();
    await store.sincronizado();
    await listo();
    expect(raiz.querySelector('section.por-resolver')!.textContent).not.toContain('Falta completar la lista de verificación');
    expect(enviar().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('con la constancia registrada lo dice', async () => {
    const { raiz } = await montar({ marcados: [], constancia: true });
    expect(raiz.querySelector('#lista-verificacion')!.textContent).toContain('Constancia de Psicología registrada');
  });

  it('un caso cuyo editor no trae lista no muestra la sección', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('#lista-verificacion')).toBeNull();
  });

  it('con ítems obligatorios sin marcar lo lista en «Por resolver», no deja enviar y «Llévame ahí» lleva a la lista', async () => {
    const { raiz, enviar, store, listo } = await montar({ marcados: [] });
    const falta = raiz.querySelector('section.por-resolver li.falta')!;
    expect(falta.querySelector('p')!.textContent).toBe('Falta completar la lista de verificación: marca todos los ítems obligatorios.');
    expect(enviar().getAttribute('aria-disabled')).toBe('true');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    falta.querySelector<HTMLButtonElement>('button')!.click();
    await new Promise((r) => setTimeout(r, 120));
    await listo();
    expect(navegar).toHaveBeenCalledWith('/portal/casos/41/editor/revision'); // la lista está en esta misma pantalla, no en el editor anterior
    expect(store.caso()!.lista!.items).toHaveLength(7);
    expect(document.activeElement).toBe(raiz.querySelector('#lista-verificacion'));
  });

  it('marcar las declaraciones obligatorias las guarda con la revisión vigente y habilita el envío', async () => {
    // El sistema ya respalda sus dos ítems; la docente solo marca lo que declara.
    const { raiz, servidor, store, enviar, listo } = await montar({ marcados: [], respaldados: ['safetyProtocols', 'triggerWarnings'] });
    await store.sincronizado();
    await listo();
    servidor.llamadas.length = 0;
    const declaradas = ['contentOriginal', 'ethicsReviewed', 'noStigmatizing', 'accessibilityOk'];
    for (const codigo of declaradas) {
      casilla(raiz, codigo).click();
      await listo();
    }
    await store.sincronizado();
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    const guardados = servidor.llamadasA('updateChecklist');
    expect(guardados).toHaveLength(declaradas.length);
    expect(guardados.at(-1)!.args[0]).toMatchObject({ contentOriginal: true, accessibilityOk: true, safetyProtocols: true, scopeEducational: false });
    expect(raiz.textContent).toContain('Nada por resolver.');
    expect(enviar().getAttribute('aria-disabled')).not.toBe('true');
    enviar().click();
    await store.sincronizado();
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(servidor.llamadasA('transitionCase')).toHaveLength(1);
    expect(raiz.querySelector('.pildora.estado')!.textContent!.trim()).toBe('En revisión');
    expect(raiz.querySelector('[data-linea-estado]')!.textContent).toContain('Enviado a Psicología');
  });

  it('desmarcar un obligatorio vuelve a pedir la lista', async () => {
    const respaldados = ['safetyProtocols', 'triggerWarnings'];
    const { raiz, store, listo } = await montar({ marcados: OBLIGATORIOS, respaldados });
    expect(raiz.textContent).toContain('Nada por resolver.');
    casilla(raiz, 'ethicsReviewed').click();
    await store.sincronizado();
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(raiz.querySelector('section.por-resolver')!.textContent).toContain('Falta completar la lista de verificación');
  });
});

describe('RevisionComponent · un caso que ya no es un borrador (decisión de Psicología y versión nueva)', () => {
  afterEach(() => document.querySelectorAll('body > app-revision, body > [ng-version]').forEach((n) => n.remove()));

  it('en revisión muestra el panel de la decisión (aprobar o devolver) y no ofrece crear una versión nueva', async () => {
    const { raiz, servidor } = await montar({ estado: 'IN_REVIEW' });
    const decision = raiz.querySelector<HTMLElement>('[data-accion="decision-caso"]')!;
    expect(decision.querySelector('h2')!.textContent).toContain('Estado y decisión del caso');
    expect(decision.querySelector('app-case-review-panel')).not.toBeNull();
    const botones = [...decision.querySelectorAll('button')].map((b) => b.textContent ?? '').join('|');
    expect(botones).toContain('Aprobar y publicar');
    expect(botones).toContain('Devolver a borrador');
    expect(botones).not.toContain('Crear una versión nueva');
    expect(servidor.metodos).toContain('lifecycle');
  });

  it('publicado dice que está publicado y deja crear una versión nueva, que abre en el editor', async () => {
    const { raiz, servidor, fixture, listo } = await montar({ estado: 'PUBLISHED' });
    expect(raiz.querySelector('[role="status"].listo')!.textContent).toContain('El caso está publicado');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const crear = [...raiz.querySelectorAll<HTMLButtonElement>('[data-accion="decision-caso"] button')].find((b) => b.textContent?.trim() === 'Crear una versión nueva')!;
    expect(crear).toBeDefined();
    crear.click();
    await listo();
    await fixture.whenStable();
    expect(servidor.llamadasA('cloneCaseVersion')).toHaveLength(1);
    expect(navegar).toHaveBeenCalledWith(`/portal/casos/${CASO + 1000}/editor`);
  });

  it('si no se puede crear la versión, lo dice y no se mueve de pantalla', async () => {
    const { raiz, servidor, fixture, listo } = await montar({ estado: 'PUBLISHED' });
    servidor.fallar('cloneCaseVersion', 500);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Crear una versión nueva')!.click();
    await listo();
    await fixture.whenStable();
    await listo();
    expect(raiz.querySelector('.version-nueva .error')!.textContent).toContain('No se pudo crear la versión nueva');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('cuando el panel cambia el estado del caso, la pantalla lo vuelve a leer', async () => {
    const { servidor, store, listo } = await montar({ estado: 'IN_REVIEW' });
    servidor.llamadas.length = 0;
    servidor.editor.status = 'PUBLISHED';
    servidor.editor.revision += 1;
    servidor.cambiosDelCaso.next(CASO);
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(servidor.llamadasA('caseEditor')).toHaveLength(1);
    expect(store.caso()!.estado).toBe('PUBLISHED');
  });

  it('el aviso de otro caso no la hace releer', async () => {
    const { servidor, listo } = await montar({ estado: 'IN_REVIEW' });
    servidor.llamadas.length = 0;
    servidor.cambiosDelCaso.next(CASO + 7);
    await new Promise((r) => setTimeout(r, 20));
    await listo();
    expect(servidor.llamadasA('caseEditor')).toHaveLength(0);
  });
});

describe('RevisionComponent · un caso que Psicología devolvió', () => {
  afterEach(() => document.querySelectorAll('body > app-revision, body > [ng-version]').forEach((n) => n.remove()));

  it('quien autora lee el motivo y la nota con los que se devolvió el caso a borrador', async () => {
    const { raiz } = await montar({
      revision: { requestedBy: 'Docente', requestedAt: '2026-10-20T10:00:00Z', decision: 'REJECTED', reason: 'FORMA', note: 'Falta contexto en la primera escena.' },
    });
    const tarjeta = raiz.querySelector<HTMLElement>('[data-accion="devuelto-por-psicologia"]')!;
    expect(tarjeta.querySelector('h2')!.textContent).toContain('Psicología devolvió el caso');
    expect(tarjeta.textContent).toContain('Motivo: Forma.');
    expect(tarjeta.textContent).toContain('Nota: Falta contexto en la primera escena.');
  });

  it('un caso que nunca se devolvió no muestra esa tarjeta', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('[data-accion="devuelto-por-psicologia"]')).toBeNull();
  });

  it('una aprobación anterior tampoco la muestra', async () => {
    const { raiz } = await montar({ revision: { requestedBy: 'Docente', requestedAt: '2026-10-20T10:00:00Z', decision: 'APPROVED' } });
    expect(raiz.querySelector('[data-accion="devuelto-por-psicologia"]')).toBeNull();
  });
});

describe('RevisionComponent · el ensayo en otra pestaña', () => {
  afterEach(() => { vi.restoreAllMocks(); document.querySelectorAll('body > app-revision, body > [ng-version]').forEach((n) => n.remove()); });
  const sugerencia = (raiz: HTMLElement) => [...raiz.querySelectorAll('li.falta')].find((li) => li.textContent?.includes('Todavía no probaste el caso completo en el juego.'));

  const probado = (raiz: HTMLElement) => raiz.querySelector<HTMLElement>('[data-probado]')!;

  it('al entrar relee si el ensayo llegó a un final: sin ensayo lo dice con su botón «Probar»; con ensayo, lo marca como hecho', async () => {
    const { raiz, servidor, store, listo } = await montar();
    expect(servidor.metodos).toContain('caseEditor');
    expect(probado(raiz).getAttribute('data-listo')).toBe('false');
    expect(probado(raiz).textContent).toContain('Aún no lo has probado hasta un final.');
    expect(probado(raiz).querySelector('a')!.textContent!.trim()).toBe('Probar');
    expect(probado(raiz).querySelector('a')!.getAttribute('href')).toBe('/portal/casos/41/ensayo');
    expect(sugerencia(raiz), 'no se repite como sugerencia').toBeUndefined();
    servidor.marcarEnsayado(true);
    await store.releerProbado();
    await listo();
    expect(probado(raiz).getAttribute('data-listo')).toBe('true');
    expect(probado(raiz).textContent).toContain('Lo probaste hasta un final.');
    expect(raiz.textContent).toContain('Ya lo probaste como estudiante.');
  });

  it('«Probar» con clic normal va al ensayo en esta pestaña; con Ctrl deja que el navegador abra otra', async () => {
    const { raiz, listo } = await montar();
    const navegar = vi.spyOn(TestBed.inject(CasoStore), 'navegar').mockResolvedValue(true);
    const enlace = probado(raiz).querySelector<HTMLAnchorElement>('a')!;
    enlace.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    await listo();
    expect(navegar).not.toHaveBeenCalled();
    enlace.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(navegar).toHaveBeenCalledWith('/portal/casos/41/ensayo', { umbral: { titulo: expect.any(String) } });
  });

  it('cuando la pestaña vuelve a estar visible, vuelve a preguntar', async () => {
    const { raiz, servidor, listo } = await montar();
    servidor.marcarEnsayado(true);
    servidor.llamadas.length = 0;
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await listo();
    expect(servidor.metodos).toContain('caseEditor');
    expect(sugerencia(raiz)).toBeUndefined();
  });
});
