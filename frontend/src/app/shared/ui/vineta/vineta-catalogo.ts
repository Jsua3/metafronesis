/**
 * Catálogo de la viñeta (personalidad visual del portal, ronda 3): un subconjunto curado de la biblioteca del simulador
 * (`assets/biblioteca/manifiesto.json`) y las escenas compuestas con él. Es DATO estático, no un servicio: la viñeta no
 * descarga el manifiesto (son cientos de kB que el portal no necesita); las medidas se copiaron de él con un script y
 * la prueba de este archivo comprueba que siguen cuadrando.
 *
 * Cada hoja de la biblioteca es una tira horizontal de `cuadros` fotogramas de `ancho × alto` px; la viñeta pinta uno.
 */

/** Una pieza de la biblioteca: ruta bajo `assets/biblioteca/` y medidas de UN fotograma en px del arte. */
export interface PiezaBiblioteca {
  readonly ruta: string;
  readonly ancho: number;
  readonly alto: number;
  readonly cuadros: number;
}

export const PIEZAS = {
  'universidad/escritorio': { ruta: 'piezas/muebles/universidad/escritorio.png', ancho: 125, alto: 68, cuadros: 6 },
  'universidad/archivador': { ruta: 'piezas/muebles/universidad/archivador.png', ancho: 42, alto: 57, cuadros: 5 },
  'universidad/planta': { ruta: 'piezas/muebles/universidad/planta.png', ancho: 40, alto: 54, cuadros: 4 },
  'universidad/estante-libros': { ruta: 'piezas/muebles/universidad/estante-libros.png', ancho: 64, alto: 77, cuadros: 1 },
  'universidad/pupitre': { ruta: 'piezas/muebles/universidad/pupitre.png', ancho: 45, alto: 38, cuadros: 1 },
  'universidad/sillon': { ruta: 'piezas/muebles/universidad/sillon.png', ancho: 48, alto: 44, cuadros: 1 },
  'universidad/sillas-espera': { ruta: 'piezas/muebles/universidad/sillas-espera.png', ancho: 122, alto: 40, cuadros: 1 },
  'comisaria/estante-expedientes': { ruta: 'piezas/muebles/comisaria/estante-expedientes.png', ancho: 97, alto: 97, cuadros: 1 },
  'comisaria/caja-archivo': { ruta: 'piezas/muebles/comisaria/caja-archivo.png', ancho: 40, alto: 40, cuadros: 1 },
  'casa/armario': { ruta: 'piezas/muebles/casa/armario.png', ancho: 72, alto: 94, cuadros: 1 },
  'universidad/mochila': { ruta: 'piezas/objetos/universidad/mochila.png', ancho: 26, alto: 31, cuadros: 1 },
  'universidad/libro-abierto': { ruta: 'piezas/objetos/universidad/libro-abierto.png', ancho: 32, alto: 17, cuadros: 3 },
  'universidad/computador-oficina': { ruta: 'piezas/objetos/universidad/computador-oficina.png', ancho: 32, alto: 29, cuadros: 2 },
  'universidad/taza-cafe': { ruta: 'piezas/objetos/universidad/taza-cafe.png', ancho: 15, alto: 19, cuadros: 4 },
  'universidad/lampara-escritorio': { ruta: 'piezas/objetos/universidad/lampara-escritorio.png', ancho: 21, alto: 28, cuadros: 1 },
  'universidad/cartelera-horarios': { ruta: 'piezas/objetos/universidad/cartelera-horarios.png', ancho: 68, alto: 66, cuadros: 1 },
  'universidad/tablero-avisos': { ruta: 'piezas/objetos/universidad/tablero-avisos.png', ancho: 82, alto: 76, cuadros: 1 },
  'universidad/buzon-bienestar': { ruta: 'piezas/objetos/universidad/buzon-bienestar.png', ancho: 20, alto: 41, cuadros: 2 },
  'universidad/carne-estudiantil': { ruta: 'piezas/objetos/universidad/carne-estudiantil.png', ancho: 24, alto: 17, cuadros: 1 },
  'universidad/celular': { ruta: 'piezas/objetos/universidad/celular.png', ancho: 20, alto: 14, cuadros: 4 },
  'universidad/folleto-rutas': { ruta: 'piezas/objetos/universidad/folleto-rutas.png', ancho: 26, alto: 27, cuadros: 1 },
  'universidad/afiche-bienestar': { ruta: 'piezas/objetos/universidad/afiche-bienestar.png', ancho: 32, alto: 47, cuadros: 1 },
  'universidad/planta-maceta': { ruta: 'piezas/objetos/universidad/planta-maceta.png', ancho: 24, alto: 34, cuadros: 2 },
  'universidad/caja-panuelos': { ruta: 'piezas/objetos/universidad/caja-panuelos.png', ancho: 24, alto: 22, cuadros: 6 },
  'hospital/expediente': { ruta: 'piezas/objetos/hospital/expediente.png', ancho: 34, alto: 33, cuadros: 3 },
  'hospital/registro': { ruta: 'piezas/objetos/hospital/registro.png', ancho: 39, alto: 39, cuadros: 3 },
  'hospital/hoja-ingreso': { ruta: 'piezas/objetos/hospital/hoja-ingreso.png', ancho: 26, alto: 39, cuadros: 4 },
  'hospital/cierre-resumen': { ruta: 'piezas/objetos/hospital/cierre-resumen.png', ancho: 34, alto: 23, cuadros: 3 },
  'hospital/zona-restringida': { ruta: 'piezas/objetos/hospital/zona-restringida.png', ancho: 48, alto: 36, cuadros: 1 },
  'hospital/puerta-cerrada': { ruta: 'piezas/objetos/hospital/puerta-cerrada.png', ancho: 28, alto: 36, cuadros: 3 },
  'hospital/sillas-escucha': { ruta: 'piezas/objetos/hospital/sillas-escucha.png', ancho: 58, alto: 35, cuadros: 1 },
  'casa/cerrojo-puerta': { ruta: 'piezas/objetos/casa/cerrojo-puerta.png', ancho: 20, alto: 40, cuadros: 3 },
  'comisaria/sello-tinta': { ruta: 'piezas/objetos/comisaria/sello-tinta.png', ancho: 32, alto: 23, cuadros: 4 },
  'comisaria/dispensador-turnos': { ruta: 'piezas/objetos/comisaria/dispensador-turnos.png', ancho: 20, alto: 44, cuadros: 4 },
  'herramienta/pap': { ruta: 'piezas/herramientas/pap.png', ancho: 36, alto: 27, cuadros: 12 },
  'herramienta/risk-meter': { ruta: 'piezas/herramientas/risk-meter.png', ancho: 36, alto: 27, cuadros: 12 },
  'herramienta/safety-route': { ruta: 'piezas/herramientas/safety-route.png', ancho: 36, alto: 27, cuadros: 12 },
  'herramienta/reflection-journal': { ruta: 'piezas/herramientas/reflection-journal.png', ancho: 36, alto: 27, cuadros: 12 },
  'herramienta/spikes': { ruta: 'piezas/herramientas/spikes.png', ancho: 36, alto: 27, cuadros: 12 },
  'herramienta/directorio-rutas': { ruta: 'piezas/herramientas/directorio-rutas.png', ancho: 36, alto: 27, cuadros: 12 },
  'herramienta/ficha-riesgo': { ruta: 'piezas/herramientas/ficha-riesgo.png', ancho: 36, alto: 27, cuadros: 12 },
  'herramienta/acta-registro': { ruta: 'piezas/herramientas/acta-registro.png', ancho: 36, alto: 27, cuadros: 12 },
} as const satisfies Record<string, PiezaBiblioteca>;

export type ClavePieza = keyof typeof PIEZAS;

/** Medidas de un fotograma del kit de personajes (la hoja `idle.png` mide 192 × 576). */
export const FIGURA_KIT = { ancho: 48, alto: 72 } as const;

/**
 * Una capa de la escena, en px del arte con el origen abajo a la izquierda (y = 0 es el suelo). Una pieza de la
 * biblioteca o un personaje del kit (`kit`). `flota` la deja suspendida como una carta del inventario del simulador
 * (así se ven las herramientas en el juego) y entra un poco después que el resto.
 */
export type CapaVineta =
  | { readonly pieza: ClavePieza; readonly x: number; readonly y?: number; readonly cuadro?: number; readonly flota?: boolean }
  | { readonly kit: string; readonly x: number; readonly y?: number; readonly protagonista?: boolean };

export interface EscenaVineta {
  /** Ancho y alto del escenario en px del arte (el personaje mide 48 × 72). */
  readonly ancho: number;
  readonly alto: number;
  /** De atrás hacia adelante: la última capa se pinta encima. */
  readonly capas: readonly CapaVineta[];
}

/**
 * Escenas por rol y por pantalla. Cada una cuenta en una línea quién está y con qué trabaja, con piezas que existen en
 * el simulador: lo que la persona ve en el portal es lo que después encuentra en el mundo.
 */
export const ESCENAS = {
  // Estudiante: su repisa, la mochila y el pupitre. El protagonista se puede cambiar por el avatar de la persona.
  estudio: {
    ancho: 196, alto: 80,
    capas: [
      { pieza: 'universidad/estante-libros', x: 0 },
      { kit: 'estudiante-consultante', x: 70, protagonista: true },
      { pieza: 'universidad/mochila', x: 116 },
      { pieza: 'universidad/pupitre', x: 148 },
    ],
  },
  // Docente: el escritorio de la orientadora y tres herramientas del simulador suspendidas, como en el inventario.
  orientadora: {
    ancho: 210, alto: 100,
    capas: [
      { pieza: 'universidad/planta', x: 0 },
      { pieza: 'universidad/escritorio', x: 34 },
      { kit: 'orientadora-juridica', x: 160, protagonista: true },
      { pieza: 'herramienta/pap', x: 44, y: 68, flota: true },
      { pieza: 'herramienta/risk-meter', x: 86, y: 73, flota: true },
      { pieza: 'herramienta/safety-route', x: 128, y: 68, flota: true },
    ],
  },
  // Administración: el estante, el archivador y la caja de archivo; quien lleva las cuentas del lugar. A la altura de
  // una persona (80 px del arte), para que la cabecera no crezca más que el saludo.
  archivo: {
    ancho: 206, alto: 80,
    capas: [
      { pieza: 'universidad/estante-libros', x: 0 },
      { pieza: 'universidad/archivador', x: 68 },
      { kit: 'funcionaria-recepcion', x: 114, protagonista: true },
      { pieza: 'comisaria/caja-archivo', x: 164 },
    ],
  },
  // Catálogo de casos: la cartelera de avisos del campus, donde se anuncia lo que hay para practicar.
  casos: {
    ancho: 170, alto: 80,
    capas: [
      { pieza: 'universidad/tablero-avisos', x: 0 },
      { kit: 'estudiante-consultante', x: 88, protagonista: true },
      { pieza: 'universidad/folleto-rutas', x: 140 },
    ],
  },
  // Ficha de un caso: el lugar de la escucha (sillón y pañuelos), sin nombrar el caso ni a la persona consultante.
  escucha: {
    ancho: 150, alto: 80,
    capas: [
      { pieza: 'universidad/sillon', x: 0 },
      { pieza: 'universidad/caja-panuelos', x: 52 },
      { kit: 'estudiante-consultante', x: 80, protagonista: true },
      { pieza: 'universidad/planta-maceta', x: 126 },
    ],
  },
  // Cierre de un intento: el diario de reflexión suspendido sobre el registro y el resumen del cierre.
  cierre: {
    ancho: 150, alto: 96,
    capas: [
      { kit: 'estudiante-consultante', x: 0, protagonista: true },
      { pieza: 'hospital/registro', x: 54 },
      { pieza: 'herramienta/reflection-journal', x: 56, y: 60, flota: true },
      { pieza: 'universidad/planta-maceta', x: 100 },
      { pieza: 'hospital/cierre-resumen', x: 116 },
    ],
  },
  // Invitaciones: el buzón de bienestar, el carné que da acceso y un folleto.
  invitacion: {
    ancho: 108, alto: 84,
    capas: [
      { pieza: 'universidad/buzon-bienestar', x: 0 },
      { kit: 'estudiante-consultante', x: 24, protagonista: true },
      { pieza: 'universidad/carne-estudiantil', x: 78, y: 50, flota: true },
      { pieza: 'universidad/folleto-rutas', x: 76 },
    ],
  },
  // Mi personaje: el armario, para cambiarse de ropa.
  vestidor: {
    ancho: 126, alto: 94,
    capas: [
      { pieza: 'casa/armario', x: 0 },
      { kit: 'estudiante-consultante', x: 76, protagonista: true },
    ],
  },
  // 404: alguien frente a la cartelera, buscando por dónde seguir; el directorio de rutas suspendido.
  perdido: {
    ancho: 160, alto: 92,
    capas: [
      { pieza: 'universidad/cartelera-horarios', x: 0 },
      { kit: 'estudiante-consultante', x: 74, protagonista: true },
      { pieza: 'herramienta/directorio-rutas', x: 122, y: 52, flota: true },
      { pieza: 'universidad/folleto-rutas', x: 126 },
    ],
  },
  // Sin permiso: la cinta de zona restringida y la puerta cerrada, con el vigilante al lado (informa, no amenaza).
  restringido: {
    ancho: 134, alto: 76,
    capas: [
      { pieza: 'hospital/zona-restringida', x: 0 },
      { kit: 'seguridad', x: 52, protagonista: true },
      { pieza: 'hospital/puerta-cerrada', x: 104 },
    ],
  },
  // Cambiar contraseña: el cerrojo, el carné y el celular.
  llave: {
    ancho: 108, alto: 84,
    capas: [
      { pieza: 'casa/cerrojo-puerta', x: 0 },
      { kit: 'estudiante-consultante', x: 24, protagonista: true },
      { pieza: 'universidad/carne-estudiantil', x: 80, y: 50, flota: true },
      { pieza: 'universidad/celular', x: 80 },
    ],
  },
  // —— Para las pantallas de herramienta del docente y del administrador (las aplica otra área). ——
  // Revisión y trazabilidad: la lámpara, el registro y la hoja de ingreso; quien supervisa.
  revision: {
    ancho: 150, alto: 80,
    capas: [
      { pieza: 'universidad/lampara-escritorio', x: 0 },
      { pieza: 'hospital/registro', x: 22 },
      { kit: 'supervisor-clinico', x: 64, protagonista: true },
      { pieza: 'hospital/hoja-ingreso', x: 116 },
    ],
  },
  // Casos del docente: la cartelera donde publica, con una herramienta suspendida.
  'casos-docente': {
    ancho: 160, alto: 96,
    capas: [
      { pieza: 'universidad/tablero-avisos', x: 0 },
      { kit: 'docente-universidad', x: 90, protagonista: true },
      { pieza: 'herramienta/ficha-riesgo', x: 120, y: 64, flota: true },
    ],
  },
  // Grupos: la fila de sillas de espera con dos estudiantes.
  grupos: {
    ancho: 180, alto: 80,
    capas: [
      { pieza: 'universidad/sillas-espera', x: 0 },
      { kit: 'estudiante-consultante', x: 96 },
      { kit: 'companera-clase', x: 132, protagonista: true },
    ],
  },
  // Reportes: el expediente con el computador encima; la profesional que lee los resultados.
  reportes: {
    ancho: 150, alto: 96,
    capas: [
      { pieza: 'hospital/expediente', x: 0 },
      { pieza: 'universidad/computador-oficina', x: 2, y: 33 },
      { kit: 'profesional-psicosocial', x: 44, protagonista: true },
      { pieza: 'herramienta/acta-registro', x: 100, y: 56, flota: true },
      { pieza: 'universidad/taza-cafe', x: 104 },
    ],
  },
  // Rúbricas: la hoja, el sello y el criterio.
  rubricas: {
    ancho: 140, alto: 92,
    capas: [
      { pieza: 'hospital/hoja-ingreso', x: 0 },
      { kit: 'docente-universidad', x: 30, protagonista: true },
      { pieza: 'comisaria/sello-tinta', x: 84, y: 50, flota: true },
      { pieza: 'universidad/libro-abierto', x: 84 },
    ],
  },
  // Usuarios: el dispensador de turnos, el carné y la persona de recepción.
  usuarios: {
    ancho: 130, alto: 84,
    capas: [
      { pieza: 'comisaria/dispensador-turnos', x: 0 },
      { kit: 'funcionaria-recepcion', x: 26, protagonista: true },
      { pieza: 'universidad/carne-estudiantil', x: 82, y: 50, flota: true },
      { pieza: 'universidad/caja-panuelos', x: 84 },
    ],
  },
} as const satisfies Record<string, EscenaVineta>;

export type NombreEscena = keyof typeof ESCENAS;

/** Escalas de la viñeta: siempre enteras, para que cada píxel del arte sea un cuadrado exacto. */
export type EscalaVineta = 1 | 2 | 3;

/**
 * La escala entera más grande que cabe en `disponible` px sin pasarse de `maxima`; nunca menos de 1. Sin medida (jsdom
 * o primer pintado) se usa la máxima.
 */
export function escalaQueCabe(anchoArte: number, disponible: number | null, maxima: EscalaVineta): EscalaVineta {
  if (disponible === null || !Number.isFinite(disponible) || disponible <= 0) return maxima;
  for (let e = maxima; e > 1; e--) if (anchoArte * e <= disponible) return e as EscalaVineta;
  return 1;
}

/** El personaje del kit: solo minúsculas, cifras, guiones y una barra, como `rutaFiguraKit`. */
const KIT_VALIDO = /^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/;

export type CapaLista = CapaVineta & { readonly orden: number };

/**
 * Las capas listas para pintar: cambia el protagonista por `personaje` (si es una ruta del kit válida) y deja cada
 * capa con su orden de entrada (`orden`) para el escalonado: primero lo que está en el suelo, después lo que flota.
 */
export function capasDeEscena(escena: EscenaVineta, personaje: string | null | undefined): readonly CapaLista[] {
  const propio = (personaje ?? '').trim();
  const cambiar = KIT_VALIDO.test(propio);
  let flotantes = 0;
  return escena.capas.map(capa => {
    const orden = 'pieza' in capa && capa.flota ? 1 + flotantes++ : 0;
    if ('kit' in capa && capa.protagonista && cambiar) return { ...capa, kit: propio, orden };
    return { ...capa, orden };
  });
}
