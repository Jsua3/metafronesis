/**
 * `layout` de ejemplo con la forma del contrato `x-siep` 2.2 (sección 5.2): el hospital del caso insignia con el pasillo
 * de 1680 px y sus 8 puertas (ejemplo 2 del contrato). Las posiciones `plan` salen de la regla 5.3 del contrato a mano.
 * Solo para pruebas y para mirar el componente mientras el servidor no lo manda.
 */
export const LAYOUT_HOSPITAL = {
  currentRoom: 'pasillo',
  rooms: [
    { key: 'entrada-urgencias', title: 'Entrada de urgencias', width: 1200, frame: 'tres-paredes', plan: { x: -1296, y: 0 }, visited: true },
    { key: 'sala-espera', title: 'Sala de espera', width: 1440, frame: 'tres-paredes', plan: { x: 1776, y: 0 }, visited: true },
    { key: 'triaje', title: 'Triaje', width: 960, frame: 'tres-paredes', plan: { x: -168, y: -624 }, visited: false },
    { key: 'pasillo', title: 'Pasillo', width: 1680, frame: 'tres-paredes', plan: { x: 0, y: 0 }, visited: true },
    { key: 'estacion-enfermeria', title: 'Estación de enfermería', width: 1200, frame: 'tres-paredes', plan: { x: 888, y: -624 }, visited: false },
    { key: 'sala-escucha', title: 'Sala de escucha', width: 960, frame: 'tres-paredes', plan: { x: -1224, y: -624 }, visited: false },
    { key: 'trabajo-social', title: 'Oficina de trabajo social', width: 960, frame: 'tres-paredes', plan: { x: 2184, y: -624 }, visited: false },
    { key: 'habitacion-recuperacion', title: 'Habitación de recuperación', width: 1200, frame: 'tres-paredes', plan: { x: -104, y: 624 }, visited: false },
  ],
  doors: [
    { key: 'a-triaje', from: 'pasillo', to: 'triaje', wall: 'fondo', pos: 160 },
    { key: 'a-enfermeria', from: 'pasillo', to: 'estacion-enfermeria', wall: 'fondo', pos: 480 },
    { key: 'a-escucha', from: 'pasillo', to: 'sala-escucha', wall: 'fondo', pos: 800 },
    { key: 'a-trabajo-social', from: 'pasillo', to: 'trabajo-social', wall: 'fondo', pos: 1120 },
    { key: 'a-entrada', from: 'pasillo', to: 'entrada-urgencias', wall: 'izquierda', pos: 160 },
    { key: 'a-sala-espera', from: 'pasillo', to: 'sala-espera', wall: 'derecha', pos: 160 },
    { key: 'a-recuperacion', from: 'pasillo', to: 'habitacion-recuperacion', wall: 'camara', pos: 344 },
    { key: 'a-servicio', from: 'pasillo', to: 'entrada-urgencias', wall: 'camara', pos: 1032 },
    { key: 'e-pasillo', from: 'entrada-urgencias', to: 'pasillo', wall: 'derecha', pos: 160 },
    { key: 'e-salida', from: 'entrada-urgencias', to: 'calle', wall: 'camara', pos: 488 },
    { key: 's-pasillo', from: 'sala-espera', to: 'pasillo', wall: 'izquierda', pos: 160 },
    { key: 't-pasillo', from: 'triaje', to: 'pasillo', wall: 'camara', pos: 384 },
    { key: 'n-pasillo', from: 'estacion-enfermeria', to: 'pasillo', wall: 'camara', pos: 488 },
    { key: 'c-pasillo', from: 'sala-escucha', to: 'pasillo', wall: 'camara', pos: 384 },
    { key: 'w-pasillo', from: 'trabajo-social', to: 'pasillo', wall: 'camara', pos: 384 },
    { key: 'r-pasillo', from: 'habitacion-recuperacion', to: 'pasillo', wall: 'fondo', pos: 488 },
  ],
};
