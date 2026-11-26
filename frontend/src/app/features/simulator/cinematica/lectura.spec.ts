import {
  DURACION_MAXIMA_MS, DURACION_MINIMA_MS, VistosDelIntento, duracionConNombre, esRecetaValida, leerCinematica, leerTutor, lineaDeLosPasos, marcaDeCinematica,
  marcaDeTutor, tiempoDeLectura,
} from './lectura';

describe('cinematica/lectura', () => {
  describe('leerCinematica', () => {
    it('lee los planos del contrato y completa lo que falta', () => {
      const c = leerCinematica({
        cinematica: {
          id: 'intro',
          planos: [
            { escena: 'barrio', momento: 'tarde', subtitulo: 'Viernes, 4 de la tarde.', duracionMs: 6500 },
            { escena: 'casa-ventana', siluetas: ['hombre', 'mujer', 'perro'], subtitulo: 'Texto.' },
            { escena: 'negro', duracionMs: 3000, subtitulo: '' },
            { escena: 'urgencias-llegada' },
          ],
        },
      });
      expect(c?.id).toBe('intro');
      expect(c?.planos.map(p => p.escena)).toEqual(['barrio', 'casa-ventana', 'negro', 'urgencias-llegada']);
      expect(c?.planos[0]).toMatchObject({ momento: 'tarde', duracionMs: 6500, luzVentana: null });
      // Lo desconocido se descarta; las escenas de urgencias son de noche si el caso no dice otra cosa.
      expect(c?.planos[1].siluetas).toEqual(['hombre', 'mujer']);
      expect(c?.planos[3].momento).toBe('noche');
      expect(c?.planos[2].subtitulo).toBe('');
    });

    it('un plano nunca dura menos que su tiempo de lectura (15 palabras cada 4 s)', () => {
      const largo = 'una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte';
      const c = leerCinematica({ cinematica: { planos: [{ escena: 'barrio', subtitulo: largo, duracionMs: 2000 }] } });
      expect(c?.planos[0].duracionMs).toBeGreaterThanOrEqual(Math.ceil(20 * 4000 / 15));
      expect(c?.planos[0].duracionMs).toBe(tiempoDeLectura(largo));
    });

    it('acota la duración pedida y da un respiro al plano sin texto ni duración', () => {
      const c = leerCinematica({ cinematica: { planos: [
        { escena: 'negro' }, { escena: 'negro', duracionMs: 10 }, { escena: 'titulo', duracionMs: 1e9 },
      ] } });
      expect(c?.planos[0].duracionMs).toBe(2500);
      expect(c?.planos[1].duracionMs).toBe(DURACION_MINIMA_MS);
      expect(c?.planos[2].duracionMs).toBe(DURACION_MAXIMA_MS);
    });

    it('sin planos válidos o con otra forma, no hay cinemática', () => {
      expect(leerCinematica(undefined)).toBeNull();
      expect(leerCinematica({})).toBeNull();
      expect(leerCinematica({ cinematica: { planos: [{ escena: 'explosion' }] } })).toBeNull();
      expect(leerCinematica({ cinematica: { planos: 'barrio' } })).toBeNull();
    });

    it('el id solo lleva caracteres seguros para una clave de almacenamiento', () => {
      expect(leerCinematica({ cinematica: { id: 'a b/c', planos: [{ escena: 'negro' }] } })?.id).toBe('a-b-c');
      expect(leerCinematica({ cinematica: { planos: [{ escena: 'negro' }] } })?.id).toBe('cinematica');
    });

    it('guarda el texto con {nombre} sin poner (la plantilla se aplica al pintar)', () => {
      const c = leerCinematica({ cinematica: { planos: [{ escena: 'titulo', subtitulo: 'Eres {nombre}.' }] } });
      expect(c?.planos[0].subtitulo).toBe('Eres {nombre}.');
    });
  });

  describe('leerTutor', () => {
    const tutor = {
      nombre: 'Profesor', rol: 'Tutor del caso', recipeId: 'supervisor-clinico',
      lineas: ['Hola, {nombre}.', '  ', 'Te dejo el paso a paso:', 'Entra.'],
      pasos: [{ numero: 1, titulo: 'Observa', detalle: 'antes de actuar.' }, { titulo: 'Contén' }, { numero: 3 }],
    };

    it('lee nombre, rol, retrato, líneas no vacías y pasos', () => {
      const t = leerTutor({ tutor });
      expect(t).toEqual({
        nombre: 'Profesor', rol: 'Tutor del caso', recipeId: 'supervisor-clinico',
        lineas: ['Hola, {nombre}.', 'Te dejo el paso a paso:', 'Entra.'],
        pasos: [{ numero: 1, titulo: 'Observa', detalle: 'antes de actuar.' }, { numero: 2, titulo: 'Contén' }],
      });
    });

    it('la lista de pasos va con la penúltima línea', () => {
      expect(lineaDeLosPasos(leerTutor({ tutor })!)).toBe(1);
      expect(lineaDeLosPasos({ lineas: ['Única.'] })).toBe(0);
    });

    it('una receta que no es una clave del kit no pinta retrato (también es una ruta de archivo)', () => {
      expect(leerTutor({ tutor: { ...tutor, recipeId: '../../secreto' } })?.recipeId).toBeNull();
      expect(esRecetaValida('supervisor-clinico')).toBe(true);
      expect(esRecetaValida('Supervisor')).toBe(false);
      expect(esRecetaValida('a/b')).toBe(false);
    });

    it('sin líneas no hay tutor', () => {
      expect(leerTutor({ tutor: { nombre: 'X', lineas: [] } })).toBeNull();
      expect(leerTutor({ tutor: { nombre: 'X' } })).toBeNull();
      expect(leerTutor(null)).toBeNull();
    });
  });

  describe('VistosDelIntento', () => {
    function almacen() {
      const datos = new Map<string, string>();
      return { datos, getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v); } };
    }

    it('recuerda lo visto por intento, sin mezclar intentos', () => {
      const a = almacen();
      const uno = new VistosDelIntento('i-1', a), otro = new VistosDelIntento('i-2', a);
      expect(uno.visto(marcaDeCinematica('intro'))).toBe(false);
      uno.marcar(marcaDeCinematica('intro'));
      uno.marcar(marcaDeTutor('sala-1'));
      expect(new VistosDelIntento('i-1', a).visto(marcaDeCinematica('intro'))).toBe(true);
      expect(uno.visto(marcaDeTutor('sala-1'))).toBe(true);
      expect(otro.visto(marcaDeCinematica('intro'))).toBe(false);
    });

    it('un almacenamiento que falla cuenta como «no visto» y no rompe nada', () => {
      const roto = { getItem: () => { throw new Error('privado'); }, setItem: () => { throw new Error('cuota'); } };
      const vistos = new VistosDelIntento('i-1', roto);
      expect(() => vistos.marcar('x')).not.toThrow();
      expect(vistos.visto('x')).toBe(false);
      const basura = { getItem: () => '{no es json', setItem: () => undefined };
      expect(new VistosDelIntento('i-1', basura).visto('x')).toBe(false);
    });
  });

  it('la familia exige exactamente tres posiciones y los datos inválidos conservan el papel genérico', () => {
    const c = leerCinematica({ cinematica: { planos: [
      { escena: 'urgencias-familia', personas: ['abuela-familia', 'hermano-mayor', 'hermano-adolescente', 'otra'] },
      { escena: 'urgencias-familia', personas: ['abuela-familia', false, 'hermano-adolescente'] },
      { escena: 'calle-emergencia', personas: [null, 'otra'] },
    ] } });
    expect(c?.planos[0].personas).toEqual([]);
    expect(c?.planos[1].personas).toEqual(['abuela-familia', null, 'hermano-adolescente']);
    expect(c?.planos[2].personas).toEqual([null]);
  });

  it('el ritmo de lectura prevalece sobre el máximo de la duración pedida', () => {
    const subtitulo = Array(120).fill('sí').join(' ');
    const c = leerCinematica({ cinematica: { planos: [{ escena: 'barrio', subtitulo, duracionMs: 60_000 }] } });
    expect(c?.planos[0].duracionMs).toBe(33_800);
  });

  it('mide el texto que queda después de aplicar la plantilla del nombre', () => {
    const c = leerCinematica({ cinematica: { planos: [{ escena: 'titulo', subtitulo: 'Hola, {nombre}.' }] } })!;
    expect(duracionConNombre(c.planos[0], '')).toBe(tiempoDeLectura('Hola.'));
    expect(duracionConNombre(c.planos[0], 'Ana María')).toBe(tiempoDeLectura('Hola, Ana.'));
  });
});
