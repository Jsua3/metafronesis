import {
  DURACION_MAXIMA_MS, DURACION_MINIMA_MS, VistosDelIntento, duracionConNombre, esRecetaValida, leerCinematica, leerTutor, lineaDeLosPasos, marcaDeCinematica,
  marcaDeTutor, programarBurbujas, tiempoDeLectura,
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

    it('da seis segundos por quince palabras y al menos tres y medio a un texto corto', () => {
      expect(tiempoDeLectura('una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince')).toBe(6000);
      expect(tiempoDeLectura('Una frase.')).toBe(3500);
      expect(tiempoDeLectura('  ')).toBe(0);
    });

    it('reserva el margen de entrada además de la lectura del subtítulo', () => {
      const largo = 'una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte';
      const c = leerCinematica({ cinematica: { planos: [{ escena: 'barrio', subtitulo: largo, duracionMs: 2000 }] } });
      expect(c?.planos[0].duracionMs).toBe(9800);
    });

    it('lee hasta cuatro intervenciones válidas y conserva el orden y la plantilla', () => {
      const c = leerCinematica({ cinematica: { planos: [{
        escena: 'casa-ventana', siluetas: ['mujer-telefono', 'nina'], burbujas: [
          { quien: 'hombre', texto: 'Fuera del plano.' },
          { quien: 'nina', texto: '  ' },
          { quien: 'mujer-telefono', texto: ' Hola, {nombre}. ' },
          { quien: 'telefono', texto: 'Aquí te espero.' },
          { quien: 'nina', texto: 'A'.repeat(61), grito: true },
          { quien: 'mujer-telefono', texto: 'Hasta mañana.' },
          { quien: 'nina', texto: 'Quinta.' },
        ],
      }] } });
      expect(c?.planos[0]).toMatchObject({
        siluetas: ['mujer-telefono', 'nina'],
        burbujas: [
          { quien: 'mujer-telefono', texto: 'Hola, {nombre}.' },
          { quien: 'telefono', texto: 'Aquí te espero.' },
          { quien: 'nina', texto: 'A'.repeat(60), grito: true },
          { quien: 'mujer-telefono', texto: 'Hasta mañana.' },
        ],
      });
      expect(c!.planos[0].duracionMs).toBeGreaterThanOrEqual(14_000);
    });

    it('solo admite el teléfono con quien lo sostiene y las recetas presentes en el plano', () => {
      const c = leerCinematica({ cinematica: { planos: [{
        escena: 'calle-emergencia', personas: ['vecina'], burbujas: [
          { quien: 'telefono', texto: '¿Aló?' },
          { quien: 'abuela-familia', texto: '¿Dónde?' },
          { quien: 'vecina', texto: '¡Manden a alguien!' },
        ],
      }, {
        escena: 'calle-emergencia', personas: ['telefono'],
        burbujas: [{ quien: 'telefono', texto: '¿Aló?' }],
      }] } });
      expect(c?.planos[0]).toMatchObject({ burbujas: [{ quien: 'vecina', texto: '¡Manden a alguien!' }] });
      expect(c?.planos[1]).toMatchObject({ burbujas: [] });
    });

    it('reparte el tiempo libre y da a cada intervención un tramo completo de lectura', () => {
      const c = leerCinematica({ cinematica: { planos: [{
        escena: 'casa-ventana', duracionMs: 10_850, siluetas: ['hombre', 'mujer'],
        burbujas: [{ quien: 'hombre', texto: 'Hola, {nombre}.' }, { quien: 'mujer', texto: 'Buenos días.' }],
      }] } })!;
      expect(programarBurbujas(c.planos[0], 'Ana María')).toEqual([
        { quien: 'hombre', texto: 'Hola, Ana.', desde: 1850, hasta: 5350 },
        { quien: 'mujer', texto: 'Buenos días.', desde: 6350, hasta: 9850 },
      ]);
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
    expect(c?.planos[0].duracionMs).toBe(49_800);
  });

  it('mide el texto que queda después de aplicar la plantilla del nombre', () => {
    const c = leerCinematica({ cinematica: { planos: [{ escena: 'titulo', subtitulo: 'Hola, {nombre}.' }] } })!;
    expect(duracionConNombre(c.planos[0], '')).toBe(5300);
    expect(duracionConNombre(c.planos[0], 'Ana María')).toBe(5300);
    const conBurbuja = leerCinematica({ cinematica: { planos: [{
      escena: 'casa-ventana', siluetas: ['nina'], burbujas: [
        { quien: 'nina', texto: '¿{nombre}?' }, { quien: 'nina', texto: 'Hola.' },
      ],
    }] } })!.planos[0];
    expect(duracionConNombre(conBurbuja, '')).toBeLessThan(duracionConNombre(conBurbuja, 'Ana María'));
  });
});
