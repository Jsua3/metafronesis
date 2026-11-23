import { TestBed } from '@angular/core/testing';

import { MaquetaDelCasoComponent } from './maqueta-del-caso.component';

const SKELETON = {
  titulo: 'Urgencias de noche',
  escenas: [
    { clave: 'entrada', titulo: 'Llega a urgencias', final: false },
    { clave: 'espera', titulo: 'En la sala de espera', final: false },
    { clave: 'escucha', titulo: 'La escucha', final: true },
  ],
};
const ESCENARIO = {
  salas: [
    { id: 'entrada', nombre: 'Entrada de urgencias', personajes: [{ ref: 'ana' }] },
    { id: 'espera', nombre: 'Sala de espera', personajes: [{ ref: 'ana' }, { ref: 'luis' }] },
    { id: 'escucha', nombre: 'Sala de escucha', personajes: [{ ref: 'marta' }] },
  ],
};

async function montar(entradas: Record<string, unknown>) {
  await TestBed.configureTestingModule({ imports: [MaquetaDelCasoComponent] }).compileComponents();
  const fixture = TestBed.createComponent(MaquetaDelCasoComponent);
  for (const [k, v] of Object.entries(entradas)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MaquetaDelCasoComponent · RF-05 · CU-04 generar un caso con IA: el avance cuenta lo que pasa', () => {
  it('antes del esqueleto muestra fichas por decidir y explica qué viene', async () => {
    const raiz = await montar({ generacion: { skeleton: null } });
    expect(raiz.querySelectorAll('.cuadro').length).toBe(4);
    expect(raiz.textContent).toContain('La IA primero decide las escenas');
  });

  it('con el esqueleto: una ficha por escena con su sala y su estado, y las cifras de escenas, salas y personajes', async () => {
    const raiz = await montar({
      generacion: { skeleton: SKELETON },
      escenario: ESCENARIO,
      vistas: { entrada: '/e.png' },
      partes: [
        { clave: 'escena-entrada', estado: 'hecha' },
        { clave: 'escena-espera', estado: 'en-curso' },
      ],
    });
    const cuadros = [...raiz.querySelectorAll<HTMLElement>('.cuadro')];
    expect(cuadros.map((c) => c.dataset['estado'])).toEqual(['hecha', 'en-curso', 'pendiente']);
    expect(cuadros[0].textContent).toContain('Escrita · Entrada de urgencias');
    expect(cuadros[1].textContent).toContain('Escribiendo…');
    expect(cuadros[2].textContent).toContain('Final');
    expect(cuadros[0].querySelector('img')!.getAttribute('src')).toBe('/e.png');
    // Escenas escritas, salas distintas y personajes distintos de esas salas (Ana está en dos y cuenta una vez).
    const cifras = [...raiz.querySelectorAll('.cifras dd')].map((d) => d.textContent!.trim());
    expect(cifras).toEqual(['1 de 3', '3', '3']);
  });
});
