import { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

/**
 * Las transiciones de vistas del portal (DISENO §4.4, pieza 2; DP-10). El router las crea en CADA navegación; aquí se
 * decide cuáles se dejan correr. Solo cuatro parejas cuentan una historia de «cambio de lugar» y merecen movimiento:
 *
 * - `entrada`: de una pantalla del portal al juego (`/portal/simulador/:id`). La portada de la ficha viaja al umbral.
 * - `salida`: del juego al cierre del caso o al Inicio.
 * - `ensayo`: del editor de casos (`/portal/casos/:id/editor/**`) al ensayo (`/portal/casos/:id/ensayo`), `EDITOR.md` §3.8.
 * - `regreso`: del ensayo de vuelta al editor.
 *
 * Todo lo demás (la navegación frecuente: pestañas, listas, filtros) no se anima: Apple no anima lo muy frecuente y P10
 * reserva el movimiento para un cambio de lugar. Con una capa del CDK abierta se salta (un diálogo o un menú quedaría
 * congelado en la captura de la vista vieja).
 *
 * Con movimiento reducido NO se salta: el CSS (`styles/components/_transiciones.scss`) deja solo un fundido de la raíz
 * de 160 ms, sin grupos con nombre ni desplazamientos. Así el cambio de lugar se sigue notando, sin moverse.
 */
export type TipoDeTransicion = 'entrada' | 'salida' | 'ensayo' | 'regreso';

const JUEGO = /^\/portal\/simulador\/\d+$/;
const CIERRE = /^\/portal\/simulador\/\d+\/cierre\/[^/]+$/;
const INICIO = /^\/portal\/(dashboard|inicio)$/;
const EDITOR = /^\/portal\/casos\/(\d+)\/editor(\/.*)?$/;
const ENSAYO = /^\/portal\/casos\/(\d+)\/ensayo$/;

/** La ruta de una instantánea, sin consulta ni fragmento: `/portal/simulador/4`. */
export function rutaDe(snapshot: ActivatedRouteSnapshot | null | undefined): string {
  if (!snapshot) return '';
  let hoja = snapshot;
  while (hoja.firstChild) hoja = hoja.firstChild;
  const partes = hoja.pathFromRoot.flatMap(ruta => ruta.url.map(segmento => segmento.path)).filter(Boolean);
  return `/${partes.join('/')}`;
}

/** Qué historia cuenta ir de `desde` a `hacia`, o `null` si es una navegación que no se anima. */
export function tipoDeTransicion(desde: string, hacia: string): TipoDeTransicion | null {
  if (desde === hacia) return null;
  if (JUEGO.test(hacia) && desde.startsWith('/portal/') && !JUEGO.test(desde)) return 'entrada';
  if (JUEGO.test(desde) && (CIERRE.test(hacia) || INICIO.test(hacia))) return 'salida';
  const editor = EDITOR.exec(desde);
  const ensayo = ENSAYO.exec(hacia);
  if (editor && ensayo && editor[1] === ensayo[1]) return 'ensayo';
  const deEnsayo = ENSAYO.exec(desde);
  const aEditor = EDITOR.exec(hacia);
  if (deEnsayo && aEditor && deEnsayo[1] === aEditor[1]) return 'regreso';
  return null;
}

/** ¿Hay una capa del CDK abierta (diálogo, hoja, menú)? La captura de la vista vieja la congelaría a media salida. */
function hayCapaAbierta(documento: Document): boolean {
  return documento.querySelector('.cdk-overlay-container .cdk-overlay-pane') !== null;
}

/**
 * `onViewTransitionCreated` de `withViewTransitions`. Una navegación que no cuenta un cambio de lugar corre SIN animación
 * (el CSS solo anima con la raíz marcada) en vez de saltarse: Angular, en desarrollo, registra como error de consola el
 * rechazo de `ready` de cada transición saltada, y las pruebas e2e exigen una consola limpia. Solo se salta con una capa
 * del CDK abierta (rara). Mientras dura una que se anima, la raíz lleva `vt-activa` y `data-vt="<tipo>"` (clases de
 * estado, no una piel: REGLA-010) para que el CSS anime y le dé nombre a la barra; la marca se quita al terminar, también
 * si la transición se aborta.
 */
export function filtrarTransiciones(info: ViewTransitionInfo, documento: Document = document): void {
  const tipo = tipoDeTransicion(rutaDe(info.from), rutaDe(info.to));
  if (!tipo) return;
  if (hayCapaAbierta(documento)) {
    info.transition.skipTransition();
    return;
  }
  const raiz = documento.documentElement;
  raiz.classList.add('vt-activa');
  raiz.dataset['vt'] = tipo;
  const limpiar = () => {
    raiz.classList.remove('vt-activa');
    delete raiz.dataset['vt'];
  };
  // `finished` se cumple siempre (también si se aborta); el segundo argumento evita un rechazo sin atender.
  info.transition.finished.then(limpiar, limpiar);
}
