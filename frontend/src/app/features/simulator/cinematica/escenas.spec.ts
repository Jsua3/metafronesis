import { CALLE, RECETA_DE_SILUETA, cuadroDelPlano, decoradoDelPlano, fundidoHacia, recetasDelPlano } from './escenas';
import type { PlanoLeido } from './lectura';

const plano = (p: Partial<PlanoLeido> & Pick<PlanoLeido, 'escena'>): PlanoLeido => ({
  momento: 'tarde', subtitulo: '', duracionMs: 6000, siluetas: [], luzVentana: null, personas: [], ...p,
});
const vista = { ancho: 640, alto: 268 };

describe('cinematica/escenas', () => {
  it('cada escena usa su decorado y su momento', () => {
    expect(decoradoDelPlano(plano({ escena: 'barrio' }))).toBe('calle:tarde');
    expect(decoradoDelPlano(plano({ escena: 'casa-ventana', momento: 'noche' }))).toBe('calle:noche');
    expect(decoradoDelPlano(plano({ escena: 'calle-emergencia', momento: 'tarde' }))).toBe('calle:noche');
    expect(decoradoDelPlano(plano({ escena: 'urgencias-llegada' }))).toBe('urgencias:noche');
    expect(decoradoDelPlano(plano({ escena: 'urgencias-familia' }))).toBe('urgencias:noche');
    expect(decoradoDelPlano(plano({ escena: 'negro' }))).toBe('negro:tarde');
    expect(decoradoDelPlano(plano({ escena: 'titulo' }))).toBe('titulo:tarde');
  });

  it('con movimiento reducido cada plano es una placa fija: el cuadro no cambia con el tiempo', () => {
    for (const escena of ['barrio', 'casa-ventana', 'calle-emergencia', 'urgencias-llegada', 'urgencias-familia'] as const) {
      for (const momento of ['tarde', 'noche'] as const) {
        const p = plano({ escena, momento, siluetas: escena === 'casa-ventana' ? ['hombre', 'mujer', 'nina'] : [], luzVentana: true });
        const a = cuadroDelPlano(p, 0, vista, true), b = cuadroDelPlano(p, 2500, vista, true), c = cuadroDelPlano(p, 5900, vista, true);
        expect(b, `${escena} ${momento}`).toEqual(a);
        expect(c, `${escena} ${momento}`).toEqual(a);
      }
    }
  });

  it('la ventana con siluetas: primer plano ×2, encendida y con quien pide el plano', () => {
    const c = cuadroDelPlano(plano({ escena: 'casa-ventana', siluetas: ['hombre', 'mujer'] }), 1000, vista, false);
    expect(c.camara.zoom).toBe(2);
    expect(Math.abs(c.camara.x - CALLE.ventana.x)).toBeLessThanOrEqual(6);
    expect(c.ventana?.luz).toBe(1);
    expect(c.ventana?.siluetas.map(s => s.receta)).toEqual([RECETA_DE_SILUETA.hombre, RECETA_DE_SILUETA.mujer]);
    // Uno frente al otro.
    expect(c.ventana?.siluetas.map(s => s.vista)).toEqual(['right', 'left']);
  });

  it('de noche, la luz pedida se ENCIENDE dentro del plano (salvo con movimiento reducido)', () => {
    const p = plano({ escena: 'casa-ventana', momento: 'noche', luzVentana: true });
    expect(cuadroDelPlano(p, 200, vista, false).ventana?.luz).toBe(0);
    expect(cuadroDelPlano(p, 3000, vista, false).ventana?.luz).toBe(1);
    expect(cuadroDelPlano(p, 200, vista, true).ventana?.luz).toBe(1);
    expect(cuadroDelPlano(plano({ escena: 'barrio', momento: 'noche' }), 3000, vista, false).ventana?.luz).toBe(0);
  });

  it('las luces de emergencia se turnan suave y lento (muy por debajo de 3 destellos por segundo)', () => {
    const p = plano({ escena: 'calle-emergencia', momento: 'noche', duracionMs: 8000 });
    const rojo = (ms: number) => cuadroDelPlano(p, ms, vista, false).luces.rojo;
    // Máximos del rojo: contar cruces por arriba de 0,5 en 4 s.
    let picos = 0, arriba = false;
    for (let ms = 1000; ms < 5000; ms += 10) {
      const ahora = rojo(ms) > 0.6;
      if (ahora && !arriba) picos++;
      arriba = ahora;
    }
    expect(picos).toBeLessThanOrEqual(3);   // ≈ 0,7 Hz
    // Entre dos cuadros seguidos (60 fps) el cambio es pequeño: sin destellos bruscos.
    for (let ms = 1000; ms < 3000; ms += 16) expect(Math.abs(rojo(ms + 16) - rojo(ms))).toBeLessThan(0.08);
    // Con movimiento reducido no alternan.
    expect(cuadroDelPlano(p, 0, vista, true).luces).toEqual(cuadroDelPlano(p, 700, vista, true).luces);
  });

  it('la camilla cruza el cuadro de lado a lado y entra y sale de la vista', () => {
    const p = plano({ escena: 'urgencias-llegada', momento: 'noche', duracionMs: 8000 });
    expect(cuadroDelPlano(p, 300, vista, false).muebles).toEqual([]);
    const antes = cuadroDelPlano(p, 900, vista, false).muebles[0];
    const despues = cuadroDelPlano(p, 3500, vista, false).muebles[0];
    expect(despues.x).toBeGreaterThan(antes.x);
    expect(cuadroDelPlano(p, 4400, vista, false).muebles).toHaveLength(0);
    expect(cuadroDelPlano(p, 900, vista, false).actores.map(a => a.receta)).toEqual(recetasDelPlano(p));
  });

  it('la familia entra caminando y se queda: son tres personas del kit', () => {
    const p = plano({ escena: 'urgencias-familia', momento: 'noche', duracionMs: 8000 });
    expect(recetasDelPlano(p)).toEqual(['abuela-familia', 'estudiante-consultante', 'adolescente']);
    const temprano = cuadroDelPlano(p, 600, vista, false), tarde = cuadroDelPlano(p, 7900, vista, false);
    expect(temprano.actores.some(a => a.hoja === 'walk')).toBe(true);
    expect(tarde.actores.every(a => a.hoja === 'idle')).toBe(true);
    expect(tarde.actores).toHaveLength(3);
  });

  it('al negro se corta; lo demás funde', () => {
    expect(fundidoHacia(plano({ escena: 'negro' }))).toBe(0);
    expect(fundidoHacia(plano({ escena: 'barrio' }))).toBeGreaterThan(0);
    expect(fundidoHacia(plano({ escena: 'titulo' }))).toBeGreaterThan(fundidoHacia(plano({ escena: 'barrio' })));
  });

  it('las personas del caso reemplazan a las genéricas (familia y vecina); con un número distinto, las genéricas', () => {
    const familia = plano({ escena: 'urgencias-familia', momento: 'noche', personas: ['abuela-familia', 'hermano-mayor', 'hermano-adolescente'] });
    expect(recetasDelPlano(familia)).toEqual(['abuela-familia', 'hermano-mayor', 'hermano-adolescente']);
    expect(cuadroDelPlano(familia, 7900, vista, false).actores.map(a => a.receta)).toEqual(['abuela-familia', 'hermano-mayor', 'hermano-adolescente']);
    expect(recetasDelPlano(plano({ escena: 'urgencias-familia', personas: ['solo-una'] }))).toHaveLength(3);
    expect(recetasDelPlano(plano({ escena: 'calle-emergencia', momento: 'noche', personas: ['madre-acompanante'] }))).toEqual(['madre-acompanante']);
  });

  it('en la ventana, él es una cabeza más alto que ella y la distancia entre los dos se cierra', () => {
    const p = plano({ escena: 'casa-ventana', momento: 'tarde', siluetas: ['hombre', 'mujer'], duracionMs: 8000 });
    const [el0, ella0] = cuadroDelPlano(p, 0, vista, false).ventana!.siluetas;
    const [el1, ella1] = cuadroDelPlano(p, 7900, vista, false).ventana!.siluetas;
    expect(ella0.y - el0.y).toBeGreaterThanOrEqual(10);
    expect(el1.x).toBeGreaterThan(el0.x);
    expect(ella1.x).toBeGreaterThan(ella0.x);
  });

  it('de noche, con una sola persona, la luz se enciende y después entra caminando al cuarto', () => {
    const p = plano({ escena: 'casa-ventana', momento: 'noche', siluetas: ['hombre'], luzVentana: true, duracionMs: 6000 });
    expect(cuadroDelPlano(p, 1000, vista, false).ventana).toMatchObject({ luz: 0, siluetas: [] });
    const entrando = cuadroDelPlano(p, 2400, vista, false).ventana!;
    expect(entrando.luz).toBe(1);
    expect(entrando.siluetas[0].hoja).toBe('walk');
    const quieto = cuadroDelPlano(p, 5800, vista, false).ventana!.siluetas[0];
    expect(quieto.hoja).toBe('idle');
    expect(quieto.x).toBeGreaterThan(entrando.siluetas[0].x);
    // Con movimiento reducido ya está adentro, quieto.
    expect(cuadroDelPlano(p, 0, vista, true).ventana!.siluetas[0].hoja).toBe('idle');
  });

  it('las balizas giran (barrido de 0 a 1) y, con movimiento reducido, quedan quietas', () => {
    const p = plano({ escena: 'calle-emergencia', momento: 'noche', duracionMs: 7500 });
    const a = cuadroDelPlano(p, 2000, vista, false).luces, b = cuadroDelPlano(p, 2800, vista, false).luces;
    expect(a.barrido).toBeGreaterThanOrEqual(0);
    expect(a.barrido).toBeLessThan(1);
    expect(b.barrido).not.toBe(a.barrido);
    expect(cuadroDelPlano(p, 2000, vista, true).luces.barrido).toBeUndefined();
  });
});
