import { ORIENTATION_COPY, SAFE_EXIT_ALWAYS_REACHABLE } from './orientation.config';
import { stringsIn, textViolations } from './orientation-text.testing';

describe('orientation.config: constantes de producto', () => {
  it('la promesa de «Salida segura» sigue siendo cierta (T9.8, verificado estado por estado)', () => {
    expect(SAFE_EXIT_ALWAYS_REACHABLE).toBe(true);
  });

  it('la configuración ya no conoce salas, entidades ni herramientas de un caso', async () => {
    const config = await import('./orientation.config');
    for (const name of ['ROOM_LABELS', 'ENTITY_NAMES', 'TOOL_HINTS', 'ROUTE_ORDER', 'DECISION_TOTAL']) expect(config).not.toHaveProperty(name);
  });

  it('los textos que quedan son solo los genéricos', () => {
    expect(Object.keys(ORIENTATION_COPY).sort()).toEqual(['door', 'notices', 'now', 'ui']);
    expect(Object.keys(ORIENTATION_COPY.notices).sort())
      .toEqual(['decisionRegistered', 'errorDecision', 'errorNpc', 'errorTool', 'obtained', 'registering', 'supervision']);
    expect(Object.keys(ORIENTATION_COPY.door).sort())
      .toEqual(['awayFromDoor', 'awayFromDoorGeneric', 'before', 'fallback', 'laterGate', 'rearmed']);
  });
});

describe('orientation.config: textos', () => {
  const copy = ORIENTATION_COPY;
  const sample = [
    ...stringsIn(copy.now), ...stringsIn(copy.ui), copy.ui.dockTools(1, 5),
    copy.notices.obtained('material'), copy.notices.registering, copy.notices.supervision,
    copy.notices.errorNpc, copy.notices.errorTool, copy.notices.errorDecision,
    copy.door.before('habla con Ana'), copy.door.laterGate, copy.door.fallback,
    copy.notices.decisionRegistered, copy.door.awayFromDoor(3, 'hacia la izquierda'), copy.door.awayFromDoorGeneric, copy.door.rearmed,
  ];

  it('ningún texto contiene claves, técnicas, logro ni faltas de tilde', () => {
    const problems = sample.flatMap(text => textViolations(text, {}));
    expect(problems).toEqual([]);
  });

  it('los rótulos y avisos son los del diseño', () => {
    expect(copy.ui.safeExit).toBe('Salida segura');
    expect(copy.ui.backToMap).toBe('Volver al mapa');
    expect(copy.ui.dockTools(2, 5)).toBe('Herramientas 2 de 5');
    expect(copy.ui.dockLocked).toBe('Se consigue explorando las salas del caso.');
    // P8: dice qué hacer (acercarse) y la otra salida («Ir a…»), no solo que no hay nada.
    expect(copy.now.nothingNearby).toBe('No hay nada cerca: acércate a una persona o un objeto, o usa «Ir a…».');
    expect(copy.notices.obtained('Kit PAP')).toBe('Obtuviste: Kit PAP. Ya está en tu barra de herramientas.');
    expect(copy.notices.registering).toBe('Registrando tu decisión…');
    expect(copy.notices.decisionRegistered).toBe('Decisión registrada.');
    expect(copy.notices.supervision).toBe('Tu decisión quedó registrada en tu seguimiento formativo.');
    expect(copy.notices.errorNpc).toBe('No pudimos registrar la conversación. Acércate un poco más e inténtalo de nuevo.');
    expect(copy.notices.errorDecision).toBe('No pudimos registrar tu decisión. Inténtalo de nuevo.');
  });

  it('las puertas: la frase general y el respaldo no nombran listas que ya no existen', () => {
    expect(copy.door.before('habla con Ana')).toBe('Antes de pasar, habla con Ana.');
    expect(copy.door.laterGate).toBe('Esta salida se abre más adelante: sigue en esta sala.');
    expect(copy.door.fallback).not.toMatch(/Qué hacer/);
  });

  it('«Da unos pasos…» dice cuánto falta y hacia dónde, en singular y en plural', () => {
    expect(copy.door.awayFromDoor(3, 'hacia la izquierda'))
      .toBe('Aléjate de la puerta para poder volver a cruzarla: da 3 pasos más hacia la izquierda.');
    expect(copy.door.awayFromDoor(1, 'hacia arriba'))
      .toBe('Aléjate de la puerta para poder volver a cruzarla: da un paso más hacia arriba.');
    expect(copy.door.rearmed).toBe('Ya puedes cruzar la puerta.');
  });

  it('los rótulos nuevos de la cabecera (P8): «Controles», «Ir a…» y «Texto instantáneo»', () => {
    expect(copy.ui.controlsLabel).toBe('Controles');
    // WCAG 2.5.3: el nombre accesible contiene el texto visible.
    expect(copy.ui.controlsAriaLabel.toLowerCase()).toContain(copy.ui.controlsLabel.toLowerCase());
    expect(copy.ui.placesVisibleLabel).toBe('Ir a…');
    expect(copy.ui.instantTextLabel).toBe('Texto instantáneo');
  });
});

describe('contrato de texto: el detector sabe fallar', () => {
  it.each([
    ['Recoge el Kit PAP', 'nombra una herramienta'],
    ['Habla con enfermera-urgencias', 'clave interna'],
    ['Usa PAP@familia-crisis', 'clave interna'],
    ['Informacion insuficiente', 'falta una tilde'],
    ['Habla con la psicologa', 'falta una tilde'],
    ['¡Bien hecho!', 'lenguaje de logro'],
    ['Ganaste 12 puntos', 'lenguaje de logro'],
    ['Actividad completada', 'vocabulario clínico'],
    ['Aplica la mediación', 'vocabulario clínico'],
    ['Habla  con ella', 'espaciado raro'],
  ])('«%s» → %s', (text, expected) => {
    expect(textViolations(text).join(' | ')).toContain(expected);
  });

  it('un texto limpio no tiene infracciones', () => {
    expect(textViolations('Habla con la Enfermera de urgencias · en el centro, al fondo')).toEqual([]);
  });
});
