import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { AuthoringApi } from '../../../../core/api/authoring.api';
import { type RubricAdmin, RubricService } from '../../../../core/api/rubric.service';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { casoCopiadoDeLugar } from '../../testing/caso-api';
import { ServidorFalso } from '../../testing/servidor-falso';
import { universidad } from '../../testing/universidad';
import { RubricaDelCasoComponent } from './rubrica-del-caso.component';
import { pesoEnPalabras, tipoDeRubrica } from './rubrica-del-caso.modelo';

/**
 * E5 · «Rúbrica» del caso (EDITOR.md §5.3): el caso adopta una copia propia (RK-1) y, al releerse, sus competencias llegan a
 * la faceta «Criterios» de las respuestas sin dejar un conflicto de revisión.
 */

const CASO = 41;
const no404 = () => throwError(() => new HttpErrorResponse({ status: 404, error: { message: 'Rubrica no encontrada' } }));

function rubrica(parcial: Partial<RubricAdmin> = {}): RubricAdmin {
  return {
    id: 90, name: 'Competencias del programa', description: null, active: true, version: '1.0', isDefault: false, totalWeight: 100,
    criteriaCount: 2, caseVersion: { id: CASO, title: 'Caso', semanticVersion: '0.1.0', status: 'DRAFT' },
    criteria: [
      { id: 1, competency: 'ESCUCHA_ACTIVA', title: 'Escucha activa', description: 'Escucha sin juzgar.', weight: 50, displayOrder: 1, active: true },
      { id: 2, competency: 'VALORACION_DEL_RIESGO', title: 'Valoración del riesgo', description: null, weight: 50, displayOrder: 2, active: true },
    ],
    ...parcial,
  };
}

/** El caso contra un servidor en memoria; `rubricas` responde como `RubricService` (por defecto, el caso no tiene rúbrica). */
async function montar(opciones: { estado?: string; conRubrica?: boolean; rubricas?: Partial<Record<keyof RubricService, unknown>> } = {}) {
  localStorage.clear();
  TestBed.resetTestingModule();
  const datos = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 });
  if (opciones.estado) datos.editor.status = opciones.estado;
  if (opciones.conRubrica) {
    datos.editor.rubrics = [{
      rubricId: 90, rubricName: 'Competencias del programa', description: null, scores: [], comment: null,
      criteria: rubrica().criteria!.map((c) => ({ id: c.id!, competency: c.competency!, title: c.title, description: null, displayOrder: c.displayOrder })),
    }];
  }
  const servidor = new ServidorFalso(datos, universidad);
  const rubricas = {
    caseVersionRubric: vi.fn(() => (servidor.editor.rubrics.length ? of(rubrica()) : no404())),
    list: vi.fn(() => of([
      rubrica({ id: 7, name: 'Primera escucha', caseVersion: null, criteriaCount: 3 }),
      rubrica({ id: 8, name: 'A medio hacer', caseVersion: null, totalWeight: 80 }),
      rubrica({ id: 9, name: 'La de otro caso', caseVersion: { id: 3, title: 'Otro', semanticVersion: '1', status: 'DRAFT' } }),
    ])),
    competencies: vi.fn(() => of([{ id: 1, code: 'ESCUCHA_ACTIVA', name: 'Escucha activa', description: '', active: true, sortOrder: 1 }])),
    detail: vi.fn(() => of(rubrica({ id: 7, criteria: [{ id: 5, competency: 'ESCUCHA_ACTIVA', title: 'Escucha', weight: 100, displayOrder: 1, active: true }] }))),
    ...opciones.rubricas,
  };
  await TestBed.configureTestingModule({
    imports: [RubricaDelCasoComponent],
    providers: [
      provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }, { provide: RubricService, useValue: rubricas },
      { provide: BibliotecaService, useValue: { escenario: async () => universidad } },
    ],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  await store.cargar(CASO);
  servidor.llamadas.length = 0;
  const fixture = TestBed.createComponent(RubricaDelCasoComponent);
  document.body.appendChild(fixture.nativeElement);
  const listo = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };
  await listo();
  return { fixture, store, servidor, rubricas, raiz: fixture.nativeElement as HTMLElement, listo };
}

const elegirOpcion = (raiz: HTMLElement, nombre: string) =>
  [...raiz.querySelectorAll<HTMLLabelElement>('app-elector-de-rubrica label.opcion')].find((l) => l.textContent?.includes(nombre))!
    .querySelector('input')!.click();

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === texto)!;

describe('RubricaDelCasoComponent (E5)', () => {
  afterEach(() => document.querySelectorAll('body > app-rubrica-del-caso, body > [ng-version]').forEach((n) => n.remove()));

  it('CU-rúbrica · un caso sin rúbrica muestra el vacío con sus dos acciones', async () => {
    const { raiz } = await montar();
    const vacio = raiz.querySelector('section.vacio')!;
    expect(vacio.textContent).toContain('Este caso todavía no tiene rúbrica');
    expect(vacio.textContent).toContain('Sin ella, los intentos no se pueden valorar.');
    expect(boton(raiz, 'Usar las competencias del programa')).toBeTruthy();
    expect(boton(raiz, 'Copiar una de mis rúbricas')).toBeTruthy();
    expect(raiz.querySelector('[data-accion~="rubrica-del-caso"]')).not.toBeNull();
    expect(raiz.querySelector('[data-accion~="evidencia-por-respuesta"]')).not.toBeNull();
  });

  it('CU-rúbrica · adoptar las competencias del programa manda la revisión vigente, relee el caso y no deja conflicto', async () => {
    const { raiz, store, servidor, listo } = await montar();
    expect(store.caso()!.competencias).toEqual([]);
    boton(raiz, 'Usar las competencias del programa').click();
    await listo();
    expect(servidor.llamadasA('adoptRubric')).toEqual([{ metodo: 'adoptRubric', revision: 3, args: [{ fromCompetencies: true }] }]);
    expect(store.conflicto()).toBeNull();
    expect(store.caso()!.revision).toBe(4);
    // Lo que lista la faceta «Criterios» de cada respuesta: las cuatro competencias, con su nombre y no su código.
    expect(store.caso()!.competencias!.map((c) => c.nombre)).toEqual(['Escucha activa', 'Valoración del riesgo', 'Ética profesional', 'Derivación y red de apoyo']);
    expect(raiz.querySelector('.resumen')!.textContent).toContain('Rúbrica propia del caso');
    expect(raiz.querySelector('[role="status"].solo-lector')!.textContent).toContain('El caso ya tiene su rúbrica propia');
  });

  it('tras adoptar, se puede seguir editando: la revisión siguiente sale de la que devolvió la adopción', async () => {
    const { raiz, store, servidor, listo } = await montar();
    boton(raiz, 'Usar las competencias del programa').click();
    await listo();
    store.editarFicha('Contexto nuevo', ['Un objetivo']);
    await store.sincronizado();
    expect(servidor.llamadasA('updateBrief').map((l) => l.revision)).toEqual([4]);
    expect(store.conflicto()).toBeNull();
  });

  it('con la revisión vencida no adopta: avisa el conflicto del marco y no muestra otro error', async () => {
    const { raiz, store, servidor, listo } = await montar();
    servidor.otraSesionEscribe();
    boton(raiz, 'Usar las competencias del programa').click();
    await listo();
    expect(store.conflicto()).not.toBeNull();
    expect(raiz.querySelector('.rubrica > [role="alert"]')).toBeNull();
  });

  it('la rúbrica propia lista sus criterios con su peso y las respuestas que los evidencian', async () => {
    const { raiz, store, listo } = await montar({ conRubrica: true });
    const escena = store.caso()!.escenas[0];
    store.editarRespuesta(escena.id, store.agregarRespuesta(escena.id), { texto: 'Te escucho.', efectos: { competencias: ['ESCUCHA_ACTIVA'] } });
    await listo();
    const criterios = [...raiz.querySelectorAll<HTMLElement>('li.criterio')];
    expect(criterios.map((c) => c.querySelector('h3')!.textContent)).toEqual(['Escucha activa', 'Valoración del riesgo']);
    expect(criterios[0].querySelector('.criterio__peso')!.textContent).toBe('Peso 50 %');
    expect(criterios[0].querySelector('app-fichas-de-respuestas')!.textContent).toContain('«Te escucho.»');
    expect(raiz.querySelector('.criterios__cobertura')!.textContent).toContain('1 de 2 criterios');
    expect([...raiz.querySelectorAll('.resumen a')].map((a) => a.textContent?.trim())).toEqual(['Editar criterios y descriptores']);
  });

  it('«Copiar una de mis rúbricas» ofrece las de la biblioteca: no las de otro caso, y la que no suma 100 dice por qué', async () => {
    const { raiz, listo } = await montar();
    boton(raiz, 'Copiar una de mis rúbricas').click();
    await listo();
    const opciones = [...raiz.querySelectorAll<HTMLLabelElement>('app-elector-de-rubrica label.opcion')];
    expect(opciones.map((o) => o.querySelector('.opcion__nombre')!.textContent!.replace('Recomendada', '').trim()))
      .toEqual(['Las competencias del programa', 'Primera escucha', 'A medio hacer']);
    expect(opciones[2].querySelector('input')!.disabled).toBe(true);
    expect(opciones[2].textContent).toContain('no suman 100');
    expect(document.activeElement?.id).toBe('elector-titulo');
  });

  it('copiar una rúbrica de la biblioteca la adopta por su id', async () => {
    const { raiz, servidor, listo } = await montar();
    boton(raiz, 'Copiar una de mis rúbricas').click();
    await listo();
    elegirOpcion(raiz, 'Primera escucha');
    await listo();
    boton(raiz, 'Usar en el caso').click();
    await listo();
    expect(servidor.llamadasA('adoptRubric')[0].args).toEqual([{ rubricId: 7 }]);
    expect(raiz.querySelector('app-elector-de-rubrica')).toBeNull();
  });

  it('cambiar por otra avisa antes qué criterios marcados dejarían de contar', async () => {
    const { raiz, store, listo } = await montar();
    boton(raiz, 'Usar las competencias del programa').click();
    await listo();
    const escena = store.caso()!.escenas[0];
    store.editarRespuesta(escena.id, store.agregarRespuesta(escena.id), { texto: 'Hablemos del riesgo.', efectos: { competencias: ['VALORACION_DEL_RIESGO'] } });
    await listo();
    boton(raiz, 'Cambiar por otra').click();
    await listo();
    elegirOpcion(raiz, 'Primera escucha');
    await listo();
    expect(raiz.querySelector('.elector__aviso')!.textContent).toContain('1 respuesta marca criterios que la rúbrica elegida no tiene («Valoración del riesgo»)');
  });

  it('una edición hecha mientras la adopción viaja espera su turno y sale con la revisión nueva, sin perderse', async () => {
    const { store, servidor } = await montar();
    const adopcion = store.adoptarRubrica({ fromCompetencies: true });
    store.editarFicha('Contexto escrito durante la adopción', ['Un objetivo']);
    await adopcion;
    await store.sincronizado();
    expect(servidor.metodos.filter((m) => m === 'adoptRubric' || m === 'updateBrief')).toEqual(['adoptRubric', 'updateBrief']);
    expect(servidor.llamadasA('updateBrief').map((l) => l.revision)).toEqual([4]);
    expect(store.conflicto()).toBeNull();
    expect(store.caso()!.contexto).toBe('Contexto escrito durante la adopción');
    expect(store.caso()!.competencias).toHaveLength(4);
  });

  it('si se abre otro caso mientras la adopción viaja, no se aplica al caso nuevo y se dice', async () => {
    const { store } = await montar();
    const adopcion = store.adoptarRubrica({ fromCompetencies: true });
    store.cerrar();
    await expect(adopcion).rejects.toThrow('Se abrió otro caso');
    expect(store.caso()).toBeNull();
  });

  it('no se confirma el cambio mientras se comprueba qué criterios se pierden, y si la consulta falla se dice y se reintenta', async () => {
    const pendiente = new Subject<RubricAdmin>();
    const { raiz, store, servidor, rubricas, listo } = await montar({ rubricas: { detail: vi.fn(() => pendiente) } });
    boton(raiz, 'Usar las competencias del programa').click();
    await listo();
    const escena = store.caso()!.escenas[0];
    store.editarRespuesta(escena.id, store.agregarRespuesta(escena.id), { texto: 'Hablemos del riesgo.', efectos: { competencias: ['VALORACION_DEL_RIESGO'] } });
    await listo();
    boton(raiz, 'Cambiar por otra').click();
    await listo();
    servidor.llamadas.length = 0;
    elegirOpcion(raiz, 'Primera escucha');
    await listo();
    expect(raiz.querySelector('app-elector-de-rubrica [role="status"]')!.textContent).toContain('Comprobando');
    const usar = boton(raiz, 'Usar en el caso');
    expect(usar.getAttribute('aria-disabled')).toBe('true');
    usar.click();
    await listo();
    expect(servidor.llamadasA('adoptRubric')).toHaveLength(0);
    pendiente.error(new HttpErrorResponse({ status: 500 }));
    await listo();
    expect(raiz.querySelector('app-elector-de-rubrica [role="alert"]')!.textContent).toContain('No pudimos comprobar');
    expect(boton(raiz, 'Usar en el caso').getAttribute('aria-disabled')).toBe('true');
    (rubricas.detail as ReturnType<typeof vi.fn>).mockReturnValue(of(rubrica({ id: 7, criteria: [{ id: 5, competency: 'ESCUCHA_ACTIVA', title: 'Escucha', weight: 100, displayOrder: 1, active: true }] })));
    boton(raiz, 'Volver a comprobar').click();
    await listo();
    expect(raiz.querySelector('.elector__aviso')!.textContent).toContain('«Valoración del riesgo»');
    expect(boton(raiz, 'Usar en el caso').getAttribute('aria-disabled')).toBe('false');
  });

  it('en solo lectura se ve el estado pero no hay acciones', async () => {
    const { raiz } = await montar({ estado: 'IN_REVIEW' });
    expect(raiz.querySelector('section.vacio')).not.toBeNull();
    expect(raiz.querySelectorAll('section.vacio button')).toHaveLength(0);
  });

  it('un error al leer la rúbrica se dice y se puede reintentar', async () => {
    const { raiz, rubricas, listo } = await montar({
      rubricas: { caseVersionRubric: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Algo falló.' } }))) },
    });
    expect(raiz.querySelector('.falla')!.textContent).toContain('Algo falló.');
    (rubricas.caseVersionRubric as ReturnType<typeof vi.fn>).mockReturnValue(no404());
    boton(raiz, 'Volver a intentarlo').click();
    await listo();
    expect(raiz.querySelector('section.vacio')).not.toBeNull();
  });
});

describe('RubricaDelCasoComponent · sin servidor', () => {
  it('sin servidor se muestra lo que trae el caso: sin competencias, el vacío', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [RubricaDelCasoComponent],
      providers: [provideRouter([]), { provide: RubricService, useValue: {} }, { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
    }).compileComponents();
    TestBed.inject(CasoStore).fijar(copiarEscenarioAlCaso(universidad, ['consultorio'], 'Caso'));
    const fixture = TestBed.createComponent(RubricaDelCasoComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section.vacio')).not.toBeNull();
  });
});

describe('Rúbrica del caso · funciones puras', () => {
  it('distingue la propia, la compartida y la predeterminada por lo que dice el servidor', () => {
    expect(tipoDeRubrica(rubrica(), CASO).tipo).toBe('propia');
    expect(tipoDeRubrica(rubrica({ caseVersion: null }), CASO).tipo).toBe('compartida');
    expect(tipoDeRubrica(rubrica({ caseVersion: null, isDefault: true }), CASO).tipo).toBe('predeterminada');
  });

  it('cada criterio activo, en su orden, con el código de su competencia', () => {
    const v = tipoDeRubrica(rubrica({
      criteria: [
        { id: 2, competency: 'Ética profesional', title: 'Ética', weight: 40, displayOrder: 2, active: true },
        { id: 1, competency: 'ESCUCHA_ACTIVA', title: 'Escucha', weight: 60, displayOrder: 1, active: true },
        { id: 3, competency: 'OTRA', title: 'Inactiva', weight: 0, displayOrder: 3, active: false },
      ],
    }), CASO);
    expect(v.tipo === 'propia' && v.rubrica.criterios.map((c) => c.codigo)).toEqual(['ESCUCHA_ACTIVA', 'ETICA_PROFESIONAL']);
  });

  it('el peso se dice como en la biblioteca', () => {
    expect(pesoEnPalabras(25)).toBe('25 %');
    expect(pesoEnPalabras(33.33)).toBe('33,33 %');
    expect(pesoEnPalabras(null)).toBe('');
  });
});
