import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { HttpErrorResponse } from '@angular/common/http';

import { mensajeDeCarga, mensajeDeFallo } from './estado/caso.store';
import { motivoSinGuardar } from './estado/persistir';
import { ACCIONES } from './guia/acciones';
import { MENSAJE_APAGADO, MENSAJE_SIN_CUPO } from './ia/ia.service';
import { MENSAJE_PROPUESTA_INVALIDA } from './ia/propuestas';
import { NOMBRE_AVISO } from './modelo/caminos';
import { FINALES_AUTOMATICOS, reglasDePlantilla } from './modelo/finales';
import { describirParte } from './modelo/partes-de-condicion';
import { ACTIVACION_EN_PALABRAS, VINCULO_EN_PALABRAS, fraseDePaso } from './modelo/persona';
import { ENCUADRE_LEGIBLE, NOMBRE_CLASE, NOMBRE_EXPRESION, NOMBRE_INTENSIDAD, TEMAS } from './modelo/textos';

/**
 * La regla del diseño: el docente nunca lee jerga técnica («nodo», «DAG», «ID», «clave», «hex», «prompt»…).
 * Esta prueba mira el texto fijo de todas las plantillas del editor y de las tablas de nombres que llegan a pantalla
 * (los finales de plantilla incluidos). Es la versión estática de la comprobación que el sandbox hacía en el navegador,
 * pantalla por pantalla, con el texto ya dibujado.
 */
// req: RNF-010
const PROHIBIDAS = /\b(nodo|nodos|arista|aristas|DAG|grafo|spawn|ID|IDs|clave|claves|hex|prompt|metadata|token|JSON|endpoint|servidor|API|409)\b/i;

const RAIZ = __dirname;

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const completo = join(dir, nombre);
    if (statSync(completo).isDirectory()) return fuentes(completo);
    return completo.endsWith('.ts') && !completo.endsWith('.spec.ts') ? [completo] : [];
  });
}

/** Lo que se lee de una plantilla: el texto entre etiquetas y los atributos de texto fijo. Sin código ni control de flujo. */
export function textoVisible(plantilla: string): string[] {
  const sinCodigo = plantilla
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/@(?:if|else if|for|switch|case|default|empty)\b[^{]*\{/g, ' ')
    .replace(/@else\s*\{/g, ' ')
    .replace(/[{}]/g, ' ');
  const atributos = [...sinCodigo.matchAll(/\s(?:aria-label|title|placeholder|alt|aria-description|aria-roledescription)="([^"]*)"/g)].map((m) => m[1]);
  const texto = sinCodigo.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ').split(/\s{2,}|\n/).map((s) => s.trim()).filter(Boolean);
  return [...texto, ...atributos].filter((s) => /[A-Za-zÁÉÍÓÚáéíóúñ]/.test(s));
}

function plantillas(archivo: string): string[] {
  const fuente = readFileSync(archivo, 'utf-8');
  return [...fuente.matchAll(/\btemplate:\s*`([\s\S]*?)`,?\s*(?:styles|styleUrl|\}\))/g)].map((m) => m[1]);
}

describe('las palabras prohibidas no aparecen en ninguna plantilla', () => {
  const archivos = fuentes(RAIZ).filter((f) => !f.includes(`${join('autoria', 'testing')}`));
  const conPlantilla = archivos.filter((f) => plantillas(f).length > 0);

  it('encuentra las plantillas del editor (si no, esta prueba no vigila nada)', () => {
    expect(conPlantilla.length).toBeGreaterThanOrEqual(12);
  });

  it.each(conPlantilla.map((f) => [relative(RAIZ, f).replace(/\\/g, '/'), f] as const))('%s', (_nombre, archivo) => {
    const jerga = plantillas(archivo).flatMap(textoVisible).filter((t) => PROHIBIDAS.test(t));
    expect(jerga).toEqual([]);
  });

  it('el detector detecta: una plantilla con jerga se descubre', () => {
    expect(textoVisible('<p>Cada nodo tiene un ID</p>').filter((t) => PROHIBIDAS.test(t))).toEqual(['Cada nodo tiene un ID']);
    expect(textoVisible('<button aria-label="Copiar la clave"></button>').filter((t) => PROHIBIDAS.test(t))).toEqual(['Copiar la clave']);
    expect(textoVisible('@if (a) { <p>Todo bien</p> }').filter((t) => PROHIBIDAS.test(t))).toEqual([]);
  });

  it('los nombres que llegan a pantalla desde tablas tampoco la traen', () => {
    const tablas = [
      ...Object.values(FINALES_AUTOMATICOS).flatMap((f) => [f.nombre, f.texto]),
      ...Object.values(ENCUADRE_LEGIBLE), ...Object.values(NOMBRE_CLASE), ...Object.values(NOMBRE_EXPRESION),
      ...Object.values(NOMBRE_AVISO), ...TEMAS.map((t) => t.nombre),
      ...ACCIONES.flatMap((a) => [a.nombre, a.ayuda]),
      // el modelo de métricas: intensidad, estado de la persona, reglas de los finales de plantilla y frases de las condiciones
      ...Object.values(NOMBRE_INTENSIDAD), ...Object.values(VINCULO_EN_PALABRAS), ...Object.values(ACTIVACION_EN_PALABRAS),
      fraseDePaso(1, -1), fraseDePaso(-1, 1), fraseDePaso(0, 0),
      ...Object.values(reglasDePlantilla([{ nombre: 'Valorar el riesgo' }, { nombre: 'Informar derechos' }])), ...Object.values(reglasDePlantilla([])),
      ...[
        { tipo: 'hito', clave: 'a' }, { tipo: 'sin-hito', clave: 'a' }, { tipo: 'contraindicadas', n: 2 }, { tipo: 'ninguna-contraindicada' },
        { tipo: 'riesgo', n: 3 }, { tipo: 'persona', bond: 'OPEN', activation: 'CALM' },
      ].map((p) => describirParte(p as Parameters<typeof describirParte>[0], [{ clave: 'a', nombre: 'Valorar el riesgo' }])),
    ];
    expect(tablas.filter((t) => PROHIBIDAS.test(t))).toEqual([]);
  });

  /**
   * Los textos que llegan a pantalla desde el código (no desde una plantilla): mensajes del store, de la persistencia, del
   * asistente y de crear un caso. Se leen los literales con espacios, sin comentarios, de los archivos que los arman.
   */
  const ARCHIVOS_CON_MENSAJES = [
    'estado/caso.store.ts', 'estado/persistir.ts', 'ia/ia.service.ts', 'ia/propuestas.ts',
    'pantallas/salas/salas.component.ts', 'pantallas/lugar/lugar.component.ts', 'avisos-guardado.component.ts', 'autoria-shell.component.ts',
    // el modelo de métricas: lo que dice la revisión, el estado de la persona, las frases de las condiciones y los avisos de las pantallas
    'modelo/revision.ts', 'modelo/persona.ts', 'modelo/finales.ts', 'pantallas/revision/revision.component.ts',
    'pantallas/editor/editor.component.ts',
    // cómo se mueve una persona, a quién atender y los datos del caso
    'modelo/movimiento.ts', 'modelo/ficha.ts', 'pantallas/datos/datos.component.ts',
  ];

  function literales(archivo: string): string[] {
    const sinComentarios = readFileSync(join(RAIZ, archivo), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    return [...sinComentarios.matchAll(/'([^'\n]{8,})'|`([^`]{8,})`/g)]
      .map((m) => (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, '')) // lo que va entre ${…} es código, no texto
      .filter((s) => /\s/.test(s) && /[A-Za-zÁÉÍÓÚáéíóúñ]/.test(s) && !s.includes('<') && !s.includes('=>'));
  }

  it.each(ARCHIVOS_CON_MENSAJES)('los mensajes de %s no traen jerga ni dicen «servidor»', (archivo) => {
    const todos = literales(archivo);
    expect(todos.length).toBeGreaterThan(0);
    expect(todos.filter((s) => PROHIBIDAS.test(s))).toEqual([]);
  });

  it('el detector de literales detecta una palabra prohibida en un mensaje', () => {
    expect(PROHIBIDAS.test('No hay conexión con el servidor.')).toBe(true);
    expect(PROHIBIDAS.test('Error 409 al guardar')).toBe(true);
    expect(PROHIBIDAS.test('Revisa tu internet y vuelve a intentarlo.')).toBe(false);
  });

  it('los avisos de guardado, de carga y del asistente tampoco', () => {
    const fallos = [0, 400, 403, 404, 409, 500].map((estado) => new HttpErrorResponse({ status: estado }));
    const tablas = [
      ...fallos.flatMap((f) => [mensajeDeFallo(f, 'la escena'), mensajeDeCarga(f)]),
      mensajeDeFallo(new Error('Ya hay un hito con ese nombre.'), 'los hitos'),
      MENSAJE_APAGADO, MENSAJE_SIN_CUPO, MENSAJE_PROPUESTA_INVALIDA,
      ...[{ clase: null, razon: '', destinoId: 'x' }, { clase: 'CONTRAINDICATED', razon: '', destinoId: 'x' }, { clase: 'RISKY', razon: '', destinoId: null }]
        .map((r) => motivoSinGuardar({ id: 'r', texto: 't', retroalimentacion: '', efectos: {}, marcaIa: false, ...r } as never) ?? ''),
    ];
    expect(tablas.filter((t) => PROHIBIDAS.test(t))).toEqual([]);
  });
});
