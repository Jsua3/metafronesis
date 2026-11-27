import type { CasoBorrador } from '../modelo/caso';

export type ExpresionMentor = 'neutral' | 'alegre' | 'cautelosa' | 'preocupada';

export interface PasoTutorial {
  id: string;
  /** Ruta corta del editor (como en `guia/acciones.ts`); '' = se queda en la pantalla actual. */
  ruta: string;
  /** Selectores por prioridad; el primero que exista se señala. [] = burbuja centrada, sin anillo. */
  objetivos: string[];
  titulo: string;
  texto: string;
  expresion: ExpresionMentor;
  practico?: { consigna: string; cumplido: (antes: CasoBorrador, ahora: CasoBorrador) => boolean };
  /**
   * Lo que sigue dentro de un paso práctico: a medida que la docente avanza, el anillo pasa al control donde se termina la
   * acción (la cara del personaje, las cuatro clases, la lista de respuestas) y la consigna dice lo que falta. Vale la
   * fase más avanzada cuyo elemento esté en pantalla; si ninguna, los `objetivos` del paso.
   */
  fases?: FaseTutorial[];
}

export interface FaseTutorial {
  consigna: string;
  /** Selectores de lo que se señala en esta fase, según el caso al empezar el paso y ahora; [] = la fase aún no aplica. */
  objetivos: (antes: CasoBorrador, ahora: CasoBorrador) => string[];
}

export interface CapituloTutorial {
  id: string;
  nombre: string;
  /** El nombre de la insignia que gana al terminarlo. */
  logro: string;
  pasos: PasoTutorial[];
}

// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
/** El mentor del tutorial: su figura del kit, su nombre y la carpeta de su voz (blips sin palabras, ver `voz-mentor.ts`). */
export const MENTOR = { receta: 'sebas', nombre: 'Profe Sebas', apodo: 'El Compa', voz: 'assets/game/audio/voces/sebas' } as const;

const respuestas = (c: CasoBorrador) => c.escenas.flatMap((e) => e.respuestas);

/** El contexto pasó a tener texto distinto del que había (se guarda al salir del campo). */
export function contextoEscrito(antes: CasoBorrador, ahora: CasoBorrador): boolean {
  const texto = (ahora.contexto ?? '').trim();
  return texto !== '' && texto !== (antes.contexto ?? '').trim();
}

export function hayEscenaNueva(antes: CasoBorrador, ahora: CasoBorrador): boolean {
  return ahora.escenas.length > antes.escenas.length;
}

export function cambioUnaExpresion(antes: CasoBorrador, ahora: CasoBorrador): boolean {
  return ahora.salas.some((s) => {
    const previa = antes.salas.find((x) => x.id === s.id);
    return !!previa && s.personajes.some((p, i) => previa.personajes[i] !== undefined && previa.personajes[i].expresion !== p.expresion);
  });
}

export function respuestaNuevaClasificada(antes: CasoBorrador, ahora: CasoBorrador): boolean {
  const viejas = new Set(respuestas(antes).map((r) => r.id));
  return respuestas(ahora).some((r) => !viejas.has(r.id) && r.clase !== null);
}

/** La primera respuesta que no estaba al empezar el paso (la que la docente acaba de agregar). */
export function respuestaNueva(antes: CasoBorrador, ahora: CasoBorrador) {
  const viejas = new Set(respuestas(antes).map((r) => r.id));
  return respuestas(ahora).find((r) => !viejas.has(r.id)) ?? null;
}

/** La ficha de una respuesta en el guion: la que tiene sus radios de clase (`name="rc<id>"`). */
const fichaDe = (id: string) => `app-respuesta:has(input[name="rc${id.replace(/["\\]/g, '\\$&')}"])`;

export function respuestaGanoPaso(antes: CasoBorrador, ahora: CasoBorrador): boolean {
  const previas = new Map(respuestas(antes).map((r) => [r.id, r.efectos.hitos ?? []]));
  return respuestas(ahora).some((r) => (r.efectos.hitos ?? []).some((h) => !(previas.get(r.id) ?? []).includes(h)));
}

// BORRADOR: textos nuevos, pendientes de la aprobación de Psicología (todo CAPITULOS).
export const CAPITULOS: readonly CapituloTutorial[] = [
  {
    id: 'bienvenida', nombre: 'Bienvenida', logro: 'Primeros pasos',
    pasos: [
      { id: 'b-hola', ruta: '/editor', objetivos: [], expresion: 'alegre', titulo: '¡Hola! Soy tu guía',
        texto: 'Vamos a crear juntos un caso de práctica, parte por parte. Nada de lo que hagas aquí afecta tus casos reales.' },
      { id: 'b-hilo', ruta: '/editor', objetivos: ['nav[aria-label="Secciones del caso"]'], expresion: 'neutral', titulo: 'El hilo del caso',
        texto: 'Estas cinco etapas son el camino de todo caso: Datos, Lugar, Historia, Evaluación y Enviar. Puedes ir a cualquiera cuando quieras; ninguna es obligatoria en orden.' },
      { id: 'b-siguiente', ruta: '/editor', objetivos: ['[data-accion~="siguiente-paso"]'], expresion: 'neutral', titulo: 'Siguiente paso',
        texto: 'Si no sabes qué hacer, «Siguiente paso» te dice qué conviene ahora y te lleva ahí.' },
      { id: 'b-pendientes', ruta: '/editor', objetivos: ['[data-accion~="ver-pendientes"]'], expresion: 'cautelosa', titulo: 'Pendientes',
        texto: 'Aquí se junta todo lo que le falta al caso, por etapa. «Llévame ahí» te lleva directo a corregirlo.' },
      { id: 'b-buscar', ruta: '/editor', objetivos: ['[data-accion~="buscar"]'], expresion: 'neutral', titulo: 'Buscar (Ctrl+K)',
        texto: 'Escribe con tus palabras lo que quieres hacer («cambiar la cara», «agregar una escena») y te muestro dónde está.' },
    ],
  },
  {
    id: 'datos', nombre: 'Datos del caso', logro: 'Narradora',
    pasos: [
      { id: 'd-nombre', ruta: '/editor/datos', objetivos: ['#d-nombre'], expresion: 'neutral', titulo: 'El nombre del caso',
        texto: 'Es lo primero que ven tus estudiantes en su lista. Corto y claro.' },
      { id: 'd-contexto', ruta: '/editor/datos', objetivos: ['#d-contexto', '[data-accion~="datos-del-caso"]'], expresion: 'neutral', titulo: 'El contexto',
        texto: 'El contexto es lo que lee el estudiante antes de empezar: quién es la persona, dónde está y qué pasó.',
        practico: { consigna: 'Escribe dos o tres frases de contexto y pulsa Tab para salir del campo (así se guarda).', cumplido: contextoEscrito } },
      { id: 'd-objetivos', ruta: '/editor/datos', objetivos: ['#d-objetivos-ayuda'], expresion: 'neutral', titulo: 'Objetivos de aprendizaje',
        texto: 'Uno por renglón: lo que el estudiante debería poder hacer al terminar el caso.' },
      { id: 'd-vista', ruta: '/editor/datos', objetivos: ['#d-vista'], expresion: 'alegre', titulo: 'Así lo verá',
        texto: 'Esta vista previa muestra la ficha tal como la lee el estudiante.' },
    ],
  },
  {
    id: 'lugar', nombre: 'Lugar y salas', logro: 'Exploradora',
    pasos: [
      { id: 'l-lugar', ruta: '/editor', objetivos: [], expresion: 'neutral', titulo: 'El lugar',
        texto: 'Todo caso pasa en un lugar de la biblioteca (una universidad, una casa, una comisaría). Al crearlo recibiste una copia de sus salas y personajes: puedes cambiarlas sin tocar el original.' },
      { id: 'l-salas', ruta: '/editor', objetivos: ['[data-accion~="abrir-sala"]'], expresion: 'neutral', titulo: 'Cada escena tiene su sala',
        texto: 'Con una escena elegida, «Abrir sala» te lleva al escenario donde pasa. Lo veremos en un momento.' },
      { id: 'l-plano', ruta: '/editor', objetivos: ['[data-accion~="abrir-plano"]', '[data-accion~="abrir-sala"]'], expresion: 'alegre', titulo: 'El plano',
        texto: 'El plano muestra todas las salas del caso y cómo se conectan sus puertas.' },
    ],
  },
  {
    id: 'escenas', nombre: 'Escenas y caminos', logro: 'Arquitecta de historias',
    pasos: [
      { id: 'e-mapa', ruta: '/editor', objetivos: ['app-mapa-escenas', '[data-accion~="ordenar-mapa"]'], expresion: 'neutral', titulo: 'El mapa de escenas',
        texto: 'Cada caja es una escena; las flechas son las respuestas del estudiante que llevan de una a otra. La marcada «Inicio» es donde empieza.' },
      { id: 'e-agregar', ruta: '/editor', objetivos: ['[data-accion~="agregar-escena"]'], expresion: 'neutral', titulo: 'Agrega una escena',
        texto: 'Las escenas son los momentos del caso.',
        practico: { consigna: 'Agrega una escena nueva.', cumplido: hayEscenaNueva } },
      { id: 'e-conectar', ruta: '/editor', objetivos: ['[data-accion~="conectar-escenas"]'], expresion: 'neutral', titulo: 'Conectar y marcar finales',
        texto: 'En «Acciones» de la escena elegida puedes conectarla con otra o marcarla como final.' },
      { id: 'e-guion', ruta: '/editor', objetivos: ['[data-accion~="abrir-guion"]'], expresion: 'alegre', titulo: 'Abrir el guion',
        texto: '«Abrir guion» te lleva a escribir lo que pasa en la escena. Primero, veamos su sala.' },
    ],
  },
  {
    id: 'sala', nombre: 'La sala', logro: 'Escenógrafa',
    pasos: [
      { id: 's-escenario', ruta: '/editor/sala/:sala', objetivos: ['.escenario'], expresion: 'neutral', titulo: 'El escenario',
        texto: 'Así se ve la sala en el juego. Arrastra lo que quieras mover, o elígelo y usa las flechas del teclado.' },
      { id: 's-catalogo', ruta: '/editor/sala/:sala', objetivos: ['[data-accion~="agregar-mueble"]', '.catalogo'], expresion: 'neutral', titulo: 'El catálogo',
        texto: 'Desde aquí agregas muebles, objetos o personajes del lugar.' },
      { id: 's-expresion', ruta: '/editor/sala/:sala', objetivos: ['[data-accion~="cambiar-expresion"]'], expresion: 'neutral', titulo: 'La cara de un personaje',
        texto: 'Los personajes muestran cómo se sienten con su expresión.',
        practico: { consigna: 'Elige un personaje en «En esta sala» y cambia su «Expresión» en Detalles.', cumplido: cambioUnaExpresion },
        fases: [
          { consigna: 'Ahora, en «Expresión», elige otra cara: el retrato cambia al instante.', objetivos: () => ['.expresion:has(#expresion)'] },
        ] },
      { id: 's-atender', ruta: '/editor/sala/:sala', objetivos: ['[data-accion~="persona-a-atender"]', '.columna-detalles'], expresion: 'cautelosa', titulo: 'La persona a atender',
        texto: 'Marca a la persona que el estudiante debe atender: la verá señalada. Solo puede haber una por sala.' },
    ],
  },
  {
    id: 'guion', nombre: 'El guion', logro: 'Guionista',
    pasos: [
      { id: 'g-lineas', ruta: '/editor/escena/:escena', objetivos: ['#lh', '[data-accion~="agregar-linea"]'], expresion: 'neutral', titulo: 'Lo que dicen los personajes',
        texto: 'Cada línea es lo que dice un personaje, con la cara que pone al decirlo.' },
      { id: 'g-respuestas', ruta: '/editor/escena/:escena', objetivos: ['#rh'], expresion: 'neutral', titulo: 'Lo que puede responder el estudiante',
        texto: 'Hasta cuatro respuestas (A a D). Cada una tiene una clase: Recomendada, Aceptable, Con riesgo o Contraindicada. La clase decide cómo cuenta para el final.' },
      { id: 'g-agregar', ruta: '/editor/escena/:escena', objetivos: ['[data-accion~="agregar-respuesta"]'], expresion: 'neutral', titulo: 'Agrega una respuesta',
        texto: 'Escribe lo que diría el estudiante y elige su clase.',
        practico: { consigna: 'Pulsa «Agregar una respuesta», escribe el texto y elige su clase.', cumplido: respuestaNuevaClasificada },
        fases: [
          { consigna: 'Escribe lo que diría el estudiante y pulsa Tab.',
            objetivos: (a, b) => { const r = respuestaNueva(a, b); return r ? [`${fichaDe(r.id)} .ficha__texto`] : []; } },
          { consigna: 'Ahora elige su clase entre las cuatro: Recomendada, Aceptable, Con riesgo o Contraindicada.',
            objetivos: (a, b) => { const r = respuestaNueva(a, b); return r?.texto.trim() ? [`${fichaDe(r.id)} .clasificacion`] : []; } },
        ] },
      { id: 'g-lleva', ruta: '/editor/escena/:escena', objetivos: ['select[id^="rl"]', '[data-accion~="respuesta-a-escena-nueva"]'], expresion: 'neutral', titulo: '«Lleva a…»',
        texto: 'Elige a qué escena lleva la respuesta. Así se arman los caminos del mapa.' },
      { id: 'g-vista', ruta: '/editor/escena/:escena', objetivos: ['[data-accion~="vista-del-estudiante"]', 'app-vista-estudiante'], expresion: 'alegre', titulo: 'Como en el juego',
        texto: 'Esta vista previa muestra la escena tal como la ve el estudiante.' },
    ],
  },
  {
    id: 'evaluacion', nombre: 'Evaluación', logro: 'Evaluadora',
    pasos: [
      { id: 'v-pasos', ruta: '/editor/evaluacion', objetivos: ['app-fila-de-paso', '[data-accion~="hitos-del-caso"]'], expresion: 'neutral', titulo: 'Pasos profesionales',
        texto: 'Lo que el estudiante tiene que hacer en el caso. Los que «Deciden el final» cambian cómo termina.' },
      { id: 'v-marcar', ruta: '/editor/evaluacion', objetivos: ['.agregar', '[data-accion~="hitos-del-caso"]'], expresion: 'neutral', titulo: 'Qué respuesta cumple cada paso',
        texto: 'Marcar aquí es lo mismo que marcarlo en la ficha de la respuesta.',
        practico: { consigna: 'En un paso, pulsa «Agregar respuesta» y elige una de tus respuestas.', cumplido: respuestaGanoPaso },
        fases: [
          { consigna: 'Marca en la lista la respuesta que cumple este paso.', objetivos: () => ['app-selector-de-respuestas .selector'] },
        ] },
      { id: 'v-rubrica', ruta: '/editor/rubrica', objetivos: ['[data-accion~="rubrica-del-caso"]'], expresion: 'neutral', titulo: 'La rúbrica',
        texto: 'Con ella se valoran los intentos. Si el caso aún no tiene una, elige la de las competencias del programa o una tuya. Cada criterio se evidencia en las respuestas que lo marcan.' },
      { id: 'v-finales', ruta: '/editor/finales', objetivos: ['[data-accion~="definir-finales"]'], expresion: 'neutral', titulo: 'Los finales',
        texto: 'Se calculan solos según las respuestas y los pasos, o puedes escribir los tuyos.' },
    ],
  },
  {
    id: 'enviar', nombre: 'Probar y enviar', logro: 'Autora de casos',
    pasos: [
      { id: 'p-probar', ruta: '', objetivos: ['[data-accion~="probar"]'], expresion: 'alegre', titulo: 'Probar',
        texto: 'Abre tu borrador en el juego real para jugarlo como un estudiante.' },
      { id: 'p-enviar', ruta: '', objetivos: ['[data-accion~="enviar-revision"]'], expresion: 'cautelosa', titulo: 'Enviar a revisión',
        texto: 'Cuando el caso esté listo, aquí revisas qué falta y lo envías a Psicología. Este caso de práctica no hace falta enviarlo.' },
    ],
  },
];

export const TOTAL_PASOS = CAPITULOS.reduce((n, c) => n + c.pasos.length, 0);
