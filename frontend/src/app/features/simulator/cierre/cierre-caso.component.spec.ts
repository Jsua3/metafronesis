import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, switchMap, throwError, timer } from 'rxjs';

import { SimulationService } from '../../../core/api/simulation.service';
import { AttemptCompletionReport, CaseBrief, OwnerEvaluation, StudentAttemptSummary } from '../../../core/models/simulation.model';
import { ValoracionDocenteComponent } from '../valoracion-docente.component';
import { CierreCasoComponent } from './cierre-caso.component';

const falla = (status: number) => throwError(() => ({ status }));

function reporte(parcial: Partial<AttemptCompletionReport> = {}): AttemptCompletionReport {
  return {
    attemptId: 'a-1', caseTitle: 'Primer contacto', status: 'COMPLETED', totalDurationSeconds: 188, phaseDurations: [],
    toolsUsed: 3, reflectionsCount: 1, safeExitUsed: false, visitedNodeTitles: [], recommendations: ['Repasa el protocolo de primeros auxilios.'],
    summaryMessage: 'Terminaste', retries: 2,
    ending: { key: 'protectora', title: 'Intervención protectora', message: 'Lograste una intervención ética.', tone: 'positive', reason: ['Cumpliste: Informar sobre derechos'] },
    persona: { bond: 'OPEN', activation: 'CALM', label: 'se muestra abierta y serena' } as AttemptCompletionReport['persona'],
    milestones: { done: [{ key: 'h1', label: 'Contener a la familia', decisive: true }], missing: [{ key: 'h2', label: 'Derivar a salud mental', decisive: false }] },
    decisionReview: [
      { order: 1, nodeId: 10, nodeTitle: 'Urgencias', chosen: { optionId: 1, text: 'Brindar contención' }, consequence: 'La familia se calma.', feedback: { explanation: 'Contener primero.', theoryBasis: 'PAP' }, class: 'RECOMMENDED', prohibited: false },
      { order: 2, nodeId: 11, nodeTitle: 'Sala de escucha', chosen: { optionId: 2, text: 'Preguntar sin juzgar' }, consequence: '', feedback: { explanation: '' }, class: 'ACCEPTABLE', prohibited: false },
    ],
    competencyLevels: [{ code: 'C1', name: 'Contención', level: 'LOGRADO', basis: 'Dos decisiones recomendadas', evidence: [] }],
    ...parcial,
  } as AttemptCompletionReport;
}

const ficha = { caseVersionId: 1, title: 'x', learningObjectives: ['Reconocer señales de riesgo'] } as CaseBrief;
const valoracion: OwnerEvaluation = {
  attemptId: 'a-1',
  evaluations: [{ rubricName: 'R', origin: 'DOCENTE', evaluatedAt: null, comment: 'Buen trabajo', overallLevel: 'LOGRADO', criteria: [] }],
};
const historial = [{ attemptId: 'a-1', caseVersionId: 1, endedAt: '2026-10-28T10:35:13Z' } as StudentAttemptSummary];

interface Api {
  studentReport: () => Observable<AttemptCompletionReport>;
  getCaseBrief: () => Observable<CaseBrief>;
  getOwnerEvaluation: () => Observable<OwnerEvaluation>;
  attemptHistory: () => Observable<StudentAttemptSummary[]>;
}

/**
 * Cierre del caso (DISENO §4.5, DP-27): apoyo, objetivos, recorrido, retroalimentación docente y qué sigue, sin tiempos
 * ni cifras; cada fuente falla por separado; un intento ajeno es un error de permiso y no pinta datos.
 */
describe('CierreCasoComponent', () => {
  let llamadas: Record<keyof Api, number>;

  async function montar(api: Partial<Api> = {}): Promise<ComponentFixture<CierreCasoComponent>> {
    llamadas = { studentReport: 0, getCaseBrief: 0, getOwnerEvaluation: 0, attemptHistory: 0 };
    const base: Api = {
      studentReport: () => of(reporte()), getCaseBrief: () => of(ficha), getOwnerEvaluation: () => of(valoracion), attemptHistory: () => of(historial),
    };
    const servicio = Object.fromEntries((Object.keys(base) as (keyof Api)[]).map(k => [k, (...args: unknown[]) => {
      llamadas[k]++;
      return ((api[k] ?? base[k]) as (...a: unknown[]) => unknown)(...args);
    }]));
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: SimulationService, useValue: servicio }],
    });
    const fixture = TestBed.createComponent(CierreCasoComponent);
    fixture.componentRef.setInput('caseVersionId', '1');
    fixture.componentRef.setInput('attemptId', 'a-1');
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const texto = (f: ComponentFixture<unknown>) => (f.nativeElement as HTMLElement).textContent ?? '';

  it('pinta el apoyo primero, y luego objetivos, recorrido, retroalimentación y qué sigue, en ese orden', async () => {
    const f = await montar();
    const titulos = [...(f.nativeElement as HTMLElement).querySelectorAll('h2')].map(h => h.textContent?.trim());
    expect(titulos).toEqual(['Si algo te pesó', '¿Qué buscaba el caso?', '¿Cómo fue tu recorrido?', 'Tu retroalimentación docente', '¿Qué sigue?']);
    expect(texto(f)).toContain('Terminaste el 28 de octubre de 2026.');
    expect(texto(f)).toContain('Reconocer señales de riesgo');
    expect(texto(f)).toContain('Repasa el protocolo');
  });

  it('el recorrido cuenta el final, la persona, los hitos y las decisiones con su fundamento, en palabras', async () => {
    const f = await montar();
    const t = texto(f);
    expect(t).toContain('Intervención protectora');
    expect(t).toContain('se muestra abierta y serena');
    expect(t).toContain('Contener a la familia');
    expect(t).toContain('Derivar a salud mental');
    expect(t).toContain('Brindar contención');
    expect(t).toContain('Recomendada');
    expect(t).toContain('Contención');
    expect(t).toContain('Logrado');
    const escenas = (f.nativeElement as HTMLElement).querySelectorAll('details.cierre__escena');
    expect(escenas.length).toBe(2);
    expect((escenas[0] as HTMLDetailsElement).open).toBe(true);
    expect((escenas[1] as HTMLDetailsElement).open).toBe(false);
  });

  it('RF-14 ? explica un recorrido sin datos y no revela cifras', async () => {
    const f = await montar({ studentReport: () => of(reporte({ ending: null, persona: undefined, milestones: undefined, decisionReview: [], competencyLevels: [] })) });
    expect(texto(f)).toContain('Este recorrido no tiene información disponible para mostrar.');
    expect(texto(f)).not.toMatch(/puntaje|estrés|porcentaje|%/i);
  });

  it('no muestra tiempos ni recuentos: nada de duración, reintentos ni cifras sueltas', async () => {
    const f = await montar();
    const t = texto(f);
    expect(t).not.toMatch(/\b188\b|segundos|minutos|Reconsideradas: \d/i);
    expect(t).not.toMatch(/puntaje|porcentaje|%/i);
  });

  it('sin competencias declaradas, el bloque no aparece', async () => {
    const f = await montar({ studentReport: () => of(reporte({ competenciesDeclared: false })) });
    expect(texto(f)).not.toContain('Tus competencias, en palabras');
  });

  it('la retroalimentación la pinta app-valoracion-docente con la primera valoración del docente', async () => {
    const f = await montar();
    const pieza = (f.nativeElement as HTMLElement).querySelector('app-valoracion-docente');
    expect(pieza).not.toBeNull();
    expect(pieza!.textContent).toContain('Buen trabajo');
    const instancia = f.debugElement.query(d => d.componentInstance instanceof ValoracionDocenteComponent).componentInstance as ValoracionDocenteComponent;
    expect(instancia.valoracion()?.comment).toBe('Buen trabajo');
  });

  it('sin valoración todavía, dice cuándo aparecerá', async () => {
    const f = await montar({ getOwnerEvaluation: () => of({ attemptId: 'a-1', evaluations: [] }) });
    expect(texto(f)).toContain('Cuando tu docente revise tu recorrido, su retroalimentación aparecerá aquí.');
  });

  it('cada fuente falla por separado: si falla la valoración, solo esa sección dice «Reintentar» y el resto sigue', async () => {
    let intento = 0;
    const f = await montar({ getOwnerEvaluation: () => (intento++ === 0 ? falla(500) : of(valoracion)) });
    const t = texto(f);
    expect(t).toContain('No pudimos cargar la retroalimentación de tu docente.');
    expect(t).toContain('Intervención protectora');
    expect(t).toContain('Reconocer señales de riesgo');
    const boton = [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent?.includes('Reintentar'));
    expect(boton).toBeDefined();
    boton!.click();
    await f.whenStable();
    f.detectChanges();
    expect(texto(f)).toContain('Buen trabajo');
  });

  it('si la ficha da 403 o 404, los objetivos se omiten sin ruido; con otro fallo se dice', async () => {
    for (const status of [403, 404]) {
      TestBed.resetTestingModule();
      const f = await montar({ getCaseBrief: () => falla(status) });
      expect(texto(f)).not.toContain('¿Qué buscaba el caso?');
      expect(texto(f)).toContain('Intervención protectora');
    }
    TestBed.resetTestingModule();
    const g = await montar({ getCaseBrief: () => falla(500) });
    expect(texto(g)).toContain('No pudimos cargar lo que buscaba el caso.');
  });

  it('un intento ajeno (403) es un error de permiso: no pinta datos ni pide las demás fuentes', async () => {
    const f = await montar({ studentReport: () => falla(403) });
    const t = texto(f);
    expect(t).toContain('Este recorrido no es tuyo');
    expect(t).not.toContain('Intervención protectora');
    expect(t).not.toContain('Si algo te pesó');
    expect(llamadas.getCaseBrief).toBe(0);
    expect(llamadas.getOwnerEvaluation).toBe(0);
  });

  it('salir con Salida segura lo dice en el encabezado, con su fecha', async () => {
    const f = await montar({ studentReport: () => of(reporte({ status: 'SAFE_EXITED' })) });
    expect(texto(f)).toContain('Saliste con Salida segura el 28 de octubre de 2026. Tu avance está guardado.');
  });

  it('«Volver al inicio» es la primaria y «Intentar el caso de nuevo» lleva a la ficha', async () => {
    const f = await montar();
    const enlaces = [...(f.nativeElement as HTMLElement).querySelectorAll('a')];
    expect(enlaces.find(a => a.textContent?.includes('Volver al inicio'))?.getAttribute('href')).toBe('/portal/dashboard');
    expect(enlaces.find(a => a.textContent?.includes('Intentar el caso de nuevo'))?.getAttribute('href')).toBe('/portal/simulador/1/ficha');
  });

  it('URL con IDs cruzados: la ficha y «Intentar de nuevo» son del caso DEL INTENTO, no del número de la URL', async () => {
    let pedida: unknown = null;
    const f = await montar({
      attemptHistory: () => of([{ attemptId: 'a-1', caseVersionId: 7, endedAt: null } as StudentAttemptSummary]),
      getCaseBrief: ((id: unknown) => { pedida = id; return of(ficha); }) as never,
    });
    expect(pedida).toBe(7);
    const enlaces = [...(f.nativeElement as HTMLElement).querySelectorAll('a')];
    expect(enlaces.find(a => a.textContent?.includes('Intentar el caso de nuevo'))?.getAttribute('href')).toBe('/portal/simulador/7/ficha');
  });

  it('mientras el reporte no responde no se pide ni se pinta nada más; si llega un 403, nunca se pidió', async () => {
    // El 403 llega tarde (en otro turno): si las demás fuentes no esperaran al reporte, ya se habrían pedido.
    const f = await montar({ studentReport: () => timer(30).pipe(switchMap(() => throwError(() => new HttpErrorResponse({ status: 403 })))) });
    f.detectChanges();
    expect(texto(f)).toContain('Este recorrido no es tuyo');
    expect(llamadas.attemptHistory).toBe(0);
    expect(llamadas.getOwnerEvaluation).toBe(0);
    expect(llamadas.getCaseBrief).toBe(0);
  });
});
