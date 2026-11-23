import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BibliotecaService } from '../../modelo/biblioteca.service';
import type { Escena, Respuesta } from '../../modelo/caso';
import { universidad } from '../../testing/universidad';
import { RespuestaComponent } from './respuesta.component';

/** La ficha de una respuesta con sus cinco facetas (EDITOR.md §3.4.1). */
const escena: Escena = {
  id: 'e1', titulo: 'Recepción', narracion: '', salaId: null, esFinal: false, posicion: { x: 0, y: 0 }, intensidad: 'MEDIUM',
  advertencia: null, lineas: [], respuestas: [],
};
const base: Respuesta = {
  id: 'r1', texto: 'Validar su miedo', clase: 'RECOMMENDED', razon: '', retroalimentacion: 'Respira.', destinoId: 'e2', marcaIa: false,
  efectos: { hitos: ['valorar', 'informar'], competencias: ['ETICA'] }, requiere: { talked: 'laura' }, reaccion: { linea: 'Gracias.' },
};

async function montar(cambios: Partial<Respuesta> = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [RespuestaComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const fixture = TestBed.createComponent(RespuestaComponent);
  const r = fixture.componentRef;
  r.setInput('respuesta', { ...base, ...cambios });
  r.setInput('indice', 1);
  r.setInput('escena', escena);
  r.setInput('destinos', [{ id: 'e2', etiqueta: '2 · Consultorio' }]);
  r.setInput('hitos', [{ clave: 'valorar', nombre: 'Valorar el riesgo', descripcion: '', decisivo: true }]);
  r.setInput('competencias', [{ codigo: 'ETICA', nombre: 'Ética profesional' }]);
  await fixture.whenStable();
  return { fixture, raiz: fixture.nativeElement as HTMLElement };
}

const valores = (raiz: HTMLElement) => Object.fromEntries([...raiz.querySelectorAll('button.faceta')].map((b) =>
  [b.querySelector('.faceta__nombre')!.textContent, b.querySelector('.faceta__valor')!.textContent]));

describe('RespuestaComponent', () => {
  it('las cinco facetas dicen su valor sin abrirse', async () => {
    const { raiz } = await montar();
    expect(valores(raiz)).toEqual({ Pasos: '2', Criterios: '1', Persona: 'se abre y se calma', Reacción: 'sí', Aparece: 'con requisito' });
    expect(raiz.querySelectorAll('button.faceta[aria-expanded="true"]')).toHaveLength(0);
  });

  it('lleva la letra con que el estudiante ve la opción y conserva los nombres de las pruebas de extremo a extremo', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('.ficha__letra')!.textContent).toBe('B');
    expect(raiz.querySelector<HTMLTextAreaElement>('#rt1')!.labels?.[0].textContent).toBe('Respuesta 2');
    expect(raiz.querySelector<HTMLSelectElement>('#rl1')!.labels?.[0].textContent).toBe('Lleva a…');
    expect(raiz.querySelector<HTMLTextAreaElement>('#rf1')!.labels?.[0].textContent).toBe('Lo que lee el estudiante después de elegir');
    expect([...raiz.querySelectorAll<HTMLSelectElement>('#rl1 option')].map((o) => o.textContent)).toContain('2 · Consultorio');
  });

  it('completa, no muestra el aviso de «Solo en esta pantalla»; sin destino, lo muestra con su motivo', async () => {
    expect((await montar()).raiz.querySelector('.sin-guardar')).toBeNull();
    const { raiz } = await montar({ destinoId: null });
    expect(raiz.querySelector('.sin-guardar')!.textContent).toContain('Elige a qué escena lleva para guardarla.');
  });

  it('al enfocar una clase, una línea explica su consecuencia', async () => {
    const { fixture, raiz } = await montar();
    raiz.querySelector<HTMLInputElement>('input[value="RISKY"]')!.dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    expect(raiz.querySelector('.consecuencia')!.textContent).toBe('Con riesgo: tres o más dejan el riesgo abierto al final.');
  });
});
