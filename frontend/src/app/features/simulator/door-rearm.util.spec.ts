import { DOOR_REARM_DISTANCE, PASO_PX, doorRearmMessage, doorRearmProgress } from './door-rearm.util';

/**
 * «Da unos pasos…» (P8): la cuenta de cuánto falta para volver a cruzar una puerta es la MISMA regla que rearma la puerta
 * (alejarse `DOOR_REARM_DISTANCE` de todas), dicha en pasos y con una dirección.
 */
describe('doorRearmProgress', () => {
  const door = { x: 400, y: 300 };

  it('sin puertas, o ya lejos de todas, no falta nada (la regla se cumple)', () => {
    expect(doorRearmProgress({ x: 0, y: 0 }, [])).toBeNull();
    expect(doorRearmProgress({ x: 400 + DOOR_REARM_DISTANCE, y: 300 }, [door])).toBeNull();
    expect(doorRearmProgress({ x: 900, y: 900 }, [door])).toBeNull();
  });

  it('justo junto a la puerta faltan tres pasos (72 px a 24 px por paso)', () => {
    expect(PASO_PX * 3).toBe(DOOR_REARM_DISTANCE);
    expect(doorRearmProgress({ x: 400, y: 300 }, [door])?.steps).toBe(3);
  });

  it('cuanto más se aleja, menos pasos faltan, y nunca menos de uno mientras la regla no se cumple', () => {
    const steps = [0, 10, 30, 50, 70, 71].map(d => doorRearmProgress({ x: 400 + d, y: 300 }, [door])?.steps);
    expect(steps).toEqual([3, 3, 2, 1, 1, 1]);
  });

  it('dice hacia dónde: lejos de la puerta, por el eje en que ya está más apartada', () => {
    expect(doorRearmProgress({ x: 380, y: 300 }, [door])?.toward).toBe('hacia la izquierda');
    expect(doorRearmProgress({ x: 420, y: 300 }, [door])?.toward).toBe('hacia la derecha');
    expect(doorRearmProgress({ x: 400, y: 280 }, [door])?.toward).toBe('hacia arriba');
    expect(doorRearmProgress({ x: 400, y: 320 }, [door])?.toward).toBe('hacia abajo');
  });

  it('con varias puertas manda la más cercana', () => {
    const lejana = { x: 100, y: 300 };
    expect(doorRearmProgress({ x: 410, y: 300 }, [lejana, door])?.toward).toBe('hacia la derecha');
  });

  it('no pide una dirección que podría estar bloqueada por una pared', () => {
    const message = doorRearmMessage({ x: 400, y: 250 }, [door])!;
    expect(message).toContain('Da unos pasos lejos de la puerta');
    expect(message).not.toContain('hacia arriba');
    expect(doorRearmMessage({ x: 460, y: 250 }, [door])).toBeNull();
  });

  it('el mensaje es el texto de orientación (una sola fuente) y es null cuando no falta nada', () => {
    expect(doorRearmMessage({ x: 390, y: 300 }, [door]))
      .toBe('Da unos pasos lejos de la puerta para poder volver a cruzarla.');
    expect(doorRearmMessage({ x: 900, y: 300 }, [door])).toBeNull();
  });
});
