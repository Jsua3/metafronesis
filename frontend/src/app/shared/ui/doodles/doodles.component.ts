import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewEncapsulation, afterNextRender, booleanAttribute, inject,
  input,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

/** Lado del mosaico en px: el SVG mide 520 × 520 y la máscara lo repite a ese tamaño desde la esquina de la vista. */
export const TESELA = 520;

/** Una figura del mosaico (un dibujo o un punto suelto), con su centro y su radio aproximado en px de la tesela. */
export interface Figura {
  /** Qué dibujo es (el símbolo, o la etiqueta si es un trazo suelto): con el centro, distingue los duplicados. */
  tipo: string;
  x: number;
  y: number;
  radio: number;
}

/** Una figura encendida: cuál, en qué tesela (i, j) y cuánta luz recibe (0–1). */
export interface Cercana {
  indice: number;
  i: number;
  j: number;
  clave: string;
  distancia: number;
  intensidad: number;
}

const suave = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * Elige las figuras que la luz del cursor enciende en el punto (px, py) de la vista. El mosaico se repite cada
 * `tesela` px, así que se miran las teselas vecinas; la distancia se mide al borde aproximado de la figura (centro
 * menos medio radio) para que un edificio grande se encienda cuando el cursor lo roza, no solo cuando llega a su
 * centro. Plena luz en el primer cuarto del alcance y caída suave hasta el borde. Las figuras que el SVG dibuja dos
 * veces para cerrar la costura (la mochila en x 458 y en x −62) caen en el mismo sitio de la vista: se deduplican por
 * tipo y posición, porque dos copias semitransparentes encima se verían el doble de brillantes.
 */
export function figurasCercanas(figuras: readonly Figura[], px: number, py: number, alcance: number, tesela = TESELA): Cercana[] {
  let radioMax = 0;
  for (const f of figuras) radioMax = Math.max(radioMax, f.radio);
  const margen = alcance + radioMax;
  const vistas = new Set<string>();
  const fuera: Cercana[] = [];
  for (let i = Math.floor((px - margen) / tesela); i <= Math.floor((px + margen) / tesela); i++) {
    for (let j = Math.floor((py - margen) / tesela); j <= Math.floor((py + margen) / tesela); j++) {
      figuras.forEach((f, indice) => {
        const x = f.x + i * tesela;
        const y = f.y + j * tesela;
        const distancia = Math.max(0, Math.hypot(x - px, y - py) - f.radio * 0.5);
        if (distancia >= alcance) return;
        const clave = `${f.tipo}@${Math.round(x)},${Math.round(y)}`;
        if (vistas.has(clave)) return;
        vistas.add(clave);
        fuera.push({ indice, i, j, clave, distancia, intensidad: 1 - suave(alcance * 0.25, alcance, distancia) });
      });
    }
  }
  return fuera;
}

const numero = (el: Element, nombre: string): number => Number(el.getAttribute(nombre) ?? 0);

/** Modo «márgenes»: el mosaico cubre toda la pantalla (sin recuadros vacíos entre zonas), con la tinta entera en los
 *  márgenes y debajo del contenido, y más tenue en la franja del contenido para no molestar a la lectura. La tinta
 *  plena empieza a `DISTANCIA_AL_CONTENIDO` px del contenido; debajo, solo si quedan `LIBRE_MINIMO` px libres. */
export const DISTANCIA_AL_CONTENIDO = 64;
export const LIBRE_MINIMO = 240;

/** Lo que ocupa el contenido que se ve: x en px de la vista, y en px del documento (el inicio, bajo la cabecera). */
export interface ExtensionContenido {
  izq: number;
  der: number;
  inicio: number;
  fin: number;
}

/**
 * Las variables de la máscara del modo «márgenes» para una extensión dada, la vista y el desplazamiento: dónde empieza
 * la tinta plena a cada lado (a 64 px del contenido; con poco margen queda fuera de la vista y ese lado se ve tenue) y
 * debajo (solo si quedan `LIBRE_MINIMO` px libres en pantalla). Sin contenido medido, todo tenue.
 */
export function zonasDeMargen(ext: ExtensionContenido | null, ancho: number, alto: number, desplazamiento: number): Record<string, string> {
  if (!ext) return { '--g-izq': '-9999px', '--g-der': '99999px', '--fin': '99999px' };
  const fin = ext.fin - desplazamiento;
  return {
    '--g-izq': `${Math.round(ext.izq - DISTANCIA_AL_CONTENIDO)}px`,
    '--g-der': `${Math.round(Math.min(ext.der, ancho) + DISTANCIA_AL_CONTENIDO)}px`,
    '--fin': alto - fin >= LIBRE_MINIMO ? `${Math.round(fin + DISTANCIA_AL_CONTENIDO)}px` : '99999px',
  };
}

/**
 * Mide el contenido que de verdad se ve dentro de `raiz`: la unión de las cajas con fondo, borde, sombra, imagen,
 * control o texto propio, bajando por los envoltorios transparentes (que suelen ocupar todo el ancho sin pintar nada).
 * Lo oculto, lo que está fuera de la vista (los enlaces de salto) y los textos solo para lectores no cuentan. El inicio
 * es el pie de la cabecera ilustrada, que ya lleva sus propios doodles.
 */
export function extensionDelContenido(raiz: Element, ancho: number, desplazamiento: number): ExtensionContenido | null {
  let izq = Infinity;
  let der = -Infinity;
  let fin = -Infinity;
  const pinta = (el: Element, cs: CSSStyleDeclaration): boolean => {
    if (['IMG', 'SVG', 'CANVAS', 'VIDEO', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName.toUpperCase())) return true;
    if (cs.backgroundImage !== 'none' || cs.boxShadow !== 'none') return true;
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') return true;
    if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) return true;
    return Array.from(el.childNodes).some(n => n.nodeType === 3 && !!n.textContent?.trim());
  };
  const recorrer = (el: Element, profundidad: number): void => {
    if (el.localName === 'app-doodles') return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
    const r = el.getBoundingClientRect();
    const sinCaja = r.width <= 1 || r.height <= 1;
    if (!sinCaja && (r.right <= 0 || r.left >= ancho)) return;
    if (!sinCaja && (profundidad > 14 || pinta(el, cs))) {
      izq = Math.min(izq, r.left);
      der = Math.max(der, r.right);
      fin = Math.max(fin, r.bottom + desplazamiento);
      return;
    }
    for (const hijo of Array.from(el.children)) recorrer(hijo, profundidad + 1);
  };
  for (const hijo of Array.from(raiz.children)) recorrer(hijo, 0);
  if (!Number.isFinite(izq)) return null;
  const cabecera = raiz.querySelector('ui-cabecera-ilustrada');
  const inicio = (cabecera ?? raiz).getBoundingClientRect()[cabecera ? 'bottom' : 'top'] + desplazamiento;
  return { izq, der, inicio, fin };
}

/**
 * Centro y radio de cada hijo del grupo de trazos del mosaico, leídos de sus atributos (sin medir el DOM). Los <use>
 * giran sobre su propio centro (rotate(a cx cy)), así que el centro no depende del giro; los trazos sueltos (las
 * «x» y los puntos) se miden por la caja de sus coordenadas.
 */
export function figurasDelMosaico(grupo: Element): Figura[] {
  return Array.from(grupo.children).map(el => {
    const etiqueta = el.localName;
    if (etiqueta === 'use') {
      const w = numero(el, 'width');
      const h = numero(el, 'height');
      return { tipo: el.getAttribute('href') ?? 'use', x: numero(el, 'x') + w / 2, y: numero(el, 'y') + h / 2, radio: Math.max(w, h) / 2 };
    }
    if (etiqueta === 'circle' || etiqueta === 'ellipse') {
      const r = Math.max(numero(el, 'r'), numero(el, 'rx'), numero(el, 'ry'));
      return { tipo: etiqueta, x: numero(el, 'cx'), y: numero(el, 'cy'), radio: r };
    }
    const cifras = (el.getAttribute('d') ?? el.getAttribute('points') ?? '').match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
    const xs = cifras.filter((_, k) => k % 2 === 0);
    const ys = cifras.filter((_, k) => k % 2 === 1);
    if (!xs.length || !ys.length) return { tipo: etiqueta, x: 0, y: 0, radio: 0 };
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return { tipo: etiqueta, x: (x0 + x1) / 2, y: (y0 + y1) / 2, radio: Math.max(x1 - x0, y1 - y0) / 2 };
  });
}

/** Alcance de la luz en px (borde de la figura al cursor) y el paso con que se redondea la intensidad. */
const ALCANCE = 210;
const PASO = 0.04;
/** Escalonado de entrada: la figura más lejana se enciende hasta 80 ms después que la del cursor. */
const ESCALON_MS = 80;
/** Lo que tarda en apagarse una figura antes de quitarla del DOM (la salida dura 200 ms; con margen corto, para que un barrido rápido no deje cientos de grupos vivos). */
const RETIRO_MS = 300;

/**
 * Fondo de objetos del simulador al estilo de los «doodles» de WhatsApp: un mosaico de dibujos de línea (cuadernos,
 * fichas, cartelera, camilla, timbre, Ψ…) que se repite sin costuras, quieto detrás del contenido mientras este se
 * desplaza. El mosaico es una MÁSCARA sobre un color sólido: el tono lo pone la piel (claro u oscuro), sin colores en
 * el SVG. Solo aparece entre el inicio de `desde` y el final de `hasta`, con bordes difuminados; por debajo de las
 * tarjetas y del video de «Cómo funciona» (asoma por sus bordes). Decorativo (aria-hidden).
 *
 * La luz del cursor pertenece a las FIGURAS, no al fondo: las que están cerca se encienden enteras, cada una como una
 * unidad, con el violeta de marca y más fuerte cuanto más cerca. Es un SVG en línea que redibuja solo esas figuras con
 * la geometría exacta del mosaico (los mismos <symbol> y <use>, trasladados a su tesela), justo encima de sus trazos
 * base: el hueco entre figuras no cambia ni un píxel (sin disco, halo ni resplandor). Se enciende con un fundido y un
 * leve escalonado por distancia, y se apaga con otro más corto. Solo con ratón; sin obra en jsdom ni con la zona fuera
 * de la pantalla.
 *
 * Vive en `shared/ui` (DISENO §2.8, DP-23) porque también lo usa el portal: detrás de la banda de cabecera de Inicio
 * (`intensidad="suave"`, sin luz: `[interactivo]="false"`) y de las páginas de estado. Nunca detrás de tablas,
 * formularios ni texto del caso. El selector sigue siendo `app-doodles` para no tocar las pruebas de la portada.
 */
@Component({
  selector: 'app-doodles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Sin encapsular: las figuras encendidas se crean por DOM (no llevan el atributo del componente) y sus reglas tienen
  // que alcanzarlas. Por eso todos los selectores van bajo `app-doodles`.
  encapsulation: ViewEncapsulation.None,
  host: {
    'aria-hidden': 'true',
    '[class.doodles--suave]': "intensidad() === 'suave'",
    '[class.doodles--borde-corto]': "borde() === 'corto'",
    '[class.doodles--hacia-fin]': "hacia() === 'fin'",
    '[class.doodles--margenes]': "modo() === 'margenes'",
  },
  template: `<div class="capa"></div><div class="capa acento"></div><svg class="luz" focusable="false"><defs></defs><g class="figuras"></g></svg>`,
  styles: `
    /* Dos máscaras complementarias del mismo dibujo (las genera .superpowers/landing/generar-doodles-acento.py desde
       mosaico.svg): la base, gris, y el acento, unas pocas figuras al azar (≈ 1 de cada 10) en morado apagado. Miden
       2 × 2 teselas (1040 px) para que el reparto de los morados no se repita cada 520 px; la geometría sí se repite
       cada 520, así que la luz del cursor (que lee mosaico.svg) sigue cayendo exactamente sobre los trazos. */
    app-doodles {
      --mosaico: url('/assets/landing/doodles/mosaico-base.svg');
      --mosaico-acento: url('/assets/landing/doodles/mosaico-acento.svg');
      --lado: 1040px;
      --a: -9999px;
      --b: -9999px;
      --borde: 180px;
      --zona: linear-gradient(to bottom, transparent var(--a), #000 calc(var(--a) + var(--borde)), #000 calc(var(--b) - var(--borde)), transparent var(--b));
      /* Fundido horizontal de la zona: opaco de lado a lado por defecto (currentColor es opaco; la máscara solo lee el alfa). */
      --zona-h: linear-gradient(currentColor, currentColor);

      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
    }

    app-doodles .capa {
      position: absolute;
      inset: 0;
      -webkit-mask-image: var(--mosaico), var(--zona), var(--zona-h);
      mask-image: var(--mosaico), var(--zona), var(--zona-h);
      -webkit-mask-size: var(--lado) var(--lado), 100% 100%, 100% 100%;
      mask-size: var(--lado) var(--lado), 100% 100%, 100% 100%;
      -webkit-mask-repeat: repeat, no-repeat, no-repeat;
      mask-repeat: repeat, no-repeat, no-repeat;
      -webkit-mask-composite: source-in, source-in;
      mask-composite: intersect, intersect;
      /* El tono de WhatsApp: apenas más claro (u oscuro) que el fondo. */
      background-color: color-mix(in oklab, var(--ds-text-1) 9%, transparent);
    }

    [data-skin='portal'] app-doodles .capa {
      background-color: color-mix(in oklab, var(--ds-text-1) 8%, transparent);
    }

    /* El acento: morado de marca apagado, apenas más presente que el gris de la base; no brilla (eso es la luz). */
    app-doodles .capa.acento {
      -webkit-mask-image: var(--mosaico-acento), var(--zona), var(--zona-h);
      mask-image: var(--mosaico-acento), var(--zona), var(--zona-h);
      background-color: color-mix(in oklab, var(--l-acento, var(--ds-accent-sim)) 28%, transparent);
    }

    [data-skin='portal'] app-doodles .capa.acento {
      background-color: color-mix(in oklab, var(--l-acento, var(--ds-accent-sim)) 22%, transparent);
    }

    /* La luz: mismo origen, misma escala (1 unidad = 1 px) y la misma zona que la capa base, para que cada figura
       encendida caiga exactamente sobre sus trazos. */
    app-doodles .luz {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      -webkit-mask-image: var(--zona), var(--zona-h);
      mask-image: var(--zona), var(--zona-h);
      -webkit-mask-composite: source-in;
      mask-composite: intersect;
      color: var(--l-acento, var(--ds-accent-sim));
      opacity: 0.92;
    }

    /* En claro el violeta de marca es oscuro y pesa más sobre el papel: algo menos de tinta. */
    [data-skin='portal'] app-doodles .luz {
      opacity: 0.72;
    }

    /* Suave (portal): el mismo mosaico a menos de la mitad de tinta; acompaña una cabecera sin competir con ella. */
    app-doodles.doodles--suave .capa {
      opacity: 0.45;
    }

    /* Borde corto: en una cabecera baja (≈ 200 px) el difuminado de 180 px por lado se comería toda la zona. */
    app-doodles.doodles--borde-corto {
      --borde: 48px;
    }
    /* Hacia el fin: la tinta crece hacia el lado de la viñeta y casi desaparece detrás del título (el texto manda). */
    app-doodles.doodles--hacia-fin {
      --zona-h: linear-gradient(to right, transparent 28%, currentColor 72%);
    }
    app-doodles .luz defs {
      display: none;
    }

    /* Entrada más lenta que la salida (convención de movimiento). Con «movimiento reducido» las duraciones caen al
       fundido corto, que sigue: es un cambio de opacidad en el sitio, sin desplazamiento. */
    app-doodles .figura {
      opacity: 0;
      transition: opacity max(var(--ds-dur-slow, 300ms), var(--ds-dur-fade, 160ms)) var(--ds-ease-out, ease-out);
    }

    @starting-style {
      app-doodles .figura { opacity: 0; }
    }

    app-doodles .figura.sale {
      transition-duration: max(var(--ds-dur-base, 200ms), var(--ds-dur-fade, 160ms));
    }

    /* Márgenes (el portal): el mosaico cubre TODA la pantalla, sin recuadros vacíos entre zonas. Con la tinta entera en
       los márgenes y debajo del contenido (cuando sobra alto), y al 35 % en la franja del contenido, donde se lee; el
       paso de una a otra es un difuminado de 120 px que termina a 64 px del contenido. Va un nivel por debajo de la base,
       como la luz ambiental: detrás de todo lo que pinta la página (las tarjetas lo tapan). Tres capas:
       mosaico ∩ (debajo ∪ lados). Las posiciones las pone el JS; sin ellas, todo tenue. */
    app-doodles.doodles--margenes {
      z-index: calc(var(--ds-z-base, 1) - 1);
      --g-izq: -9999px;
      --g-der: 99999px;
      --fin: 99999px;
      --tenue: color-mix(in srgb, currentColor 35%, transparent);
      --lados: linear-gradient(to right, #000 calc(var(--g-izq) - 120px), var(--tenue) var(--g-izq), var(--tenue) var(--g-der), #000 calc(var(--g-der) + 120px));
      --debajo: linear-gradient(to bottom, transparent var(--fin), #000 calc(var(--fin) + 120px));
    }

    app-doodles.doodles--margenes[data-apagado] {
      display: none;
    }

    app-doodles.doodles--margenes .capa {
      -webkit-mask-image: var(--mosaico), var(--debajo), var(--lados);
      mask-image: var(--mosaico), var(--debajo), var(--lados);
      -webkit-mask-size: var(--lado) var(--lado), 100% 100%, 100% 100%;
      mask-size: var(--lado) var(--lado), 100% 100%, 100% 100%;
      -webkit-mask-repeat: repeat, no-repeat, no-repeat;
      mask-repeat: repeat, no-repeat, no-repeat;
      -webkit-mask-composite: source-in, source-over;
      mask-composite: intersect, add;
    }

    app-doodles.doodles--margenes .capa.acento {
      -webkit-mask-image: var(--mosaico-acento), var(--debajo), var(--lados);
      mask-image: var(--mosaico-acento), var(--debajo), var(--lados);
    }

    app-doodles.doodles--margenes .luz {
      display: none;
    }

    /* Con la capa de toda la pantalla, la cabecera ilustrada no pinta los suyos: serían doble tinta en su banda. */
    @media (min-width: 64rem) {
      .portal:has(> app-doodles.doodles--margenes:not([data-apagado])) ui-cabecera-ilustrada app-doodles {
        display: none;
      }
    }

    /* En el teléfono y la tableta no hay márgenes que llenar: quedan los doodles de la cabecera. */
    @media (max-width: 63.999rem) {
      app-doodles.doodles--margenes { display: none; }
    }

    @media (forced-colors: active), print {
      app-doodles { display: none; }
    }
  `,
})
export class DoodlesComponent {
  readonly desde = input('#casos');
  readonly hasta = input('#como-funciona');
  /** `portada`: la tinta de la portada; `suave`: 0,45 de esa tinta, para las bandas de cabecera del portal. */
  readonly intensidad = input<'portada' | 'suave'>('portada');
  /** Sin luz del cursor ni escucha del ratón: donde hay una tarea, la luz distraería. */
  readonly interactivo = input(true, { transform: booleanAttribute });
  /** `amplio`: 180 px de difuminado arriba y abajo (la portada); `corto`: 48 px, para cabeceras bajas del portal. */
  readonly borde = input<'amplio' | 'corto'>('amplio');
  /** `todo`: la misma tinta de lado a lado; `fin`: se desvanece hacia el inicio, donde suele ir el título. */
  readonly hacia = input<'todo' | 'fin'>('todo');
  /** `zona`: entre `desde` y `hasta` (la portada, las cabeceras); `margenes`: solo en el blanco alrededor del contenido
   *  de `columna`, sin luz. Se apaga solo si la página ya trae sus propios doodles (las páginas de estado). */
  readonly modo = input<'zona' | 'margenes'>('zona');
  readonly columna = input('main');

  constructor() {
    const destroyRef = inject(DestroyRef);
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const router = inject(Router, { optional: true });
    afterNextRender(() => {
      if (typeof matchMedia !== 'function' || typeof requestAnimationFrame !== 'function') return;
      if (this.modo() === 'margenes') {
        this.vigilarMargenes(host, destroyRef, router);
        return;
      }
      const defs = host.querySelector('defs');
      const capaLuz = host.querySelector<SVGGElement>('g.figuras');
      if (!defs || !capaLuz) return;

      const fino = matchMedia('(hover: hover) and (pointer: fine)');
      const quieto = matchMedia('(prefers-reduced-motion: reduce)');
      // Con colores forzados el CSS oculta los doodles: sin esta guarda el JS seguiría escuchando el ratón, cargando el
      // mosaico y creando figuras que nadie ve.
      const forzado = matchMedia('(forced-colors: active)');
      let pedidoZona = 0;
      let pedidoLuz = 0;
      let zonaA = -Infinity;
      let zonaB = -Infinity;
      let escuchando = false;
      let destruido = false;
      // El cursor (en px de la vista) o null si salió de la ventana.
      let cursor: { x: number; y: number } | null = null;
      // El mosaico leído: el centro de cada figura y su nodo para clonar. Se carga la primera vez que hace falta.
      let figuras: Figura[] | null = null;
      let moldes: Element[] = [];
      let cargando = false;
      // Las figuras encendidas en el DOM, por clave (tipo + posición en la vista).
      const encendidas = new Map<string, { g: SVGGElement; nivel: number; retiro: number }>();

      const cargar = async () => {
        if (cargando || figuras) return;
        cargando = true;
        try {
          // El mismo archivo que usa la máscara: mismo origen y ya en la caché del navegador.
          const texto = await (await fetch('/assets/landing/doodles/mosaico.svg')).text();
          if (destruido) return;
          const doc = new DOMParser().parseFromString(texto, 'image/svg+xml');
          const grupo = doc.querySelector('svg > g[stroke]');
          if (!grupo) return;
          // Los ids del mosaico («casa», «psi»…) podrían chocar con los de la página: se prefijan, y el negro de los
          // puntos rellenos pasa a currentColor para que tomen el tono de la luz. Todo por DOM, sin innerHTML.
          const adoptar = (nodo: Element) => {
            const copia = document.importNode(nodo, true);
            for (const el of [copia, ...Array.from(copia.querySelectorAll('*'))]) {
              if (el.id) el.id = `doodle-${el.id}`;
              const href = el.getAttribute('href');
              if (href?.startsWith('#')) el.setAttribute('href', `#doodle-${href.slice(1)}`);
              for (const atributo of ['fill', 'stroke']) {
                if (el.getAttribute(atributo) === '#000') el.setAttribute(atributo, 'currentColor');
              }
            }
            return copia;
          };
          for (const simbolo of Array.from(doc.querySelectorAll('svg > defs > symbol'))) defs.appendChild(adoptar(simbolo));
          // El grupo de trazos lleva el grosor, las puntas redondas y el «sin relleno» de todo el mosaico.
          for (const atributo of Array.from(grupo.attributes)) {
            capaLuz.setAttribute(atributo.name, atributo.value === '#000' ? 'currentColor' : atributo.value);
          }
          moldes = Array.from(grupo.children).map(adoptar);
          figuras = figurasDelMosaico(grupo);
          pintar();
        } catch {
          // Sin el mosaico no hay luz; el fondo sigue igual.
        } finally {
          cargando = false;
        }
      };

      const apagar = (clave: string) => {
        const figura = encendidas.get(clave);
        if (!figura || figura.retiro) return;
        figura.nivel = 0;
        figura.g.classList.add('sale');
        figura.g.style.transitionDelay = '0s';
        figura.g.style.opacity = '0';
        figura.retiro = window.setTimeout(() => {
          figura.g.remove();
          encendidas.delete(clave);
        }, RETIRO_MS);
      };

      const apagarTodo = () => {
        for (const clave of encendidas.keys()) apagar(clave);
      };

      // Un cuadro de luz: decide qué figuras se encienden y con cuánta intensidad. Sin lecturas de layout: el cursor
      // viene del evento y la zona, del último cálculo de desplazamiento.
      const pintar = () => {
        pedidoLuz = 0;
        if (!figuras || !cursor) return;
        const cercanas = figurasCercanas(figuras, cursor.x, cursor.y, ALCANCE).filter(c => {
          const f = figuras![c.indice];
          const y = f.y + c.j * TESELA;
          return y + f.radio > zonaA && y - f.radio < zonaB;
        });
        const siguen = new Set<string>();
        for (const c of cercanas) {
          const nivel = Math.round(c.intensidad / PASO) * PASO;
          if (nivel <= 0) continue;
          siguen.add(c.clave);
          let figura = encendidas.get(c.clave);
          if (figura?.retiro) {
            clearTimeout(figura.retiro);
            figura.retiro = 0;
            figura.g.classList.remove('sale');
          }
          if (!figura) {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'figura ds-motion');
            g.setAttribute('transform', `translate(${c.i * TESELA} ${c.j * TESELA})`);
            g.appendChild(moldes[c.indice].cloneNode(true));
            capaLuz.appendChild(g);
            figura = { g, nivel: 0, retiro: 0 };
            encendidas.set(c.clave, figura);
            // La onda de entrada: las más lejanas tardan un poco más. Parte de opacidad 0 por @starting-style, sin
            // forzar un cálculo de layout para «fijar» el estado inicial.
            g.style.transitionDelay = quieto.matches ? '0s' : `${Math.round((c.distancia / ALCANCE) * ESCALON_MS)}ms`;
          } else {
            figura.g.style.transitionDelay = '0s';
          }
          if (figura.nivel !== nivel) {
            figura.nivel = nivel;
            figura.g.style.opacity = nivel.toFixed(2);
          }
        }
        for (const clave of encendidas.keys()) if (!siguen.has(clave)) apagar(clave);
      };

      const pedirLuz = () => { if (!pedidoLuz) pedidoLuz = requestAnimationFrame(pintar); };

      const alMover = (ev: PointerEvent) => {
        if (ev.pointerType !== 'mouse') return;
        cursor = { x: ev.clientX, y: ev.clientY };
        pedirLuz();
      };
      const alSalir = () => {
        cursor = null;
        apagarTodo();
      };

      // Solo se escucha el ratón mientras la zona está en pantalla, hay un puntero fino y los doodles se ven (no en
      // colores forzados).
      const escuchar = (si: boolean) => {
        if (si === escuchando) return;
        escuchando = si;
        if (si) {
          addEventListener('pointermove', alMover, { passive: true });
          document.documentElement.addEventListener('pointerleave', alSalir);
          void cargar();
        } else {
          removeEventListener('pointermove', alMover);
          document.documentElement.removeEventListener('pointerleave', alSalir);
          cursor = null;
          apagarTodo();
        }
      };

      // La zona visible (en px de la vista) se pasa a la máscara como --a y --b, una vez por cuadro.
      const zona = () => {
        pedidoZona = 0;
        const a = document.querySelector(this.desde());
        const b = document.querySelector(this.hasta());
        if (!a || !b) return;
        zonaA = Math.round(a.getBoundingClientRect().top);
        zonaB = Math.round(b.getBoundingClientRect().bottom);
        host.style.setProperty('--a', `${zonaA}px`);
        host.style.setProperty('--b', `${zonaB}px`);
        escuchar(this.interactivo() && fino.matches && !forzado.matches && zonaA < innerHeight && zonaB > 0);
        // Con el cursor quieto, al desplazar la página la zona se mueve: las figuras que entran o salen se repasan.
        if (cursor) pedirLuz();
      };
      const pedir = () => { if (!pedidoZona) pedidoZona = requestAnimationFrame(zona); };

      addEventListener('scroll', pedir, { passive: true });
      addEventListener('resize', pedir);
      fino.addEventListener('change', pedir);
      forzado.addEventListener('change', pedir);
      pedir();
      destroyRef.onDestroy(() => {
        destruido = true;
        if (pedidoZona) cancelAnimationFrame(pedidoZona);
        if (pedidoLuz) cancelAnimationFrame(pedidoLuz);
        escuchar(false);
        for (const figura of encendidas.values()) clearTimeout(figura.retiro);
        encendidas.clear();
        removeEventListener('scroll', pedir);
        removeEventListener('resize', pedir);
        fino.removeEventListener('change', pedir);
        forzado.removeEventListener('change', pedir);
      });
    });
  }

  /**
   * Modo «márgenes»: mide el contenido (al cargar, al cambiar de tamaño la página o la ventana y al navegar) y, en cada
   * desplazamiento, solo traslada la zona: medir recorre el DOM; desplazar no.
   */
  private vigilarMargenes(host: HTMLElement, destroyRef: DestroyRef, router: Router | null): void {
    let extension: ExtensionContenido | null = null;
    let pedidoMedir = 0;
    let pedidoAplicar = 0;
    const aplicar = () => {
      pedidoAplicar = 0;
      const vars = zonasDeMargen(extension, document.documentElement.clientWidth, innerHeight, scrollY);
      for (const [nombre, valor] of Object.entries(vars)) host.style.setProperty(nombre, valor);
    };
    const medir = () => {
      pedidoMedir = 0;
      const raiz = document.querySelector(this.columna());
      // Las páginas de estado (sin permiso, 404) ya llevan doodles en su zona: no se duplican.
      const propios = Array.from(raiz?.querySelectorAll('app-doodles') ?? []).some(d => !d.closest('ui-cabecera-ilustrada'));
      host.toggleAttribute('data-apagado', propios);
      extension = raiz && !propios ? extensionDelContenido(raiz, document.documentElement.clientWidth, scrollY) : null;
      aplicar();
    };
    const pedirMedir = () => { if (!pedidoMedir) pedidoMedir = requestAnimationFrame(medir); };
    const pedirAplicar = () => { if (!pedidoAplicar) pedidoAplicar = requestAnimationFrame(aplicar); };

    const raiz = document.querySelector(this.columna());
    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(pedirMedir) : null;
    if (raiz) observador?.observe(raiz);
    const navegacion = router?.events.subscribe(evento => { if (evento instanceof NavigationEnd) pedirMedir(); });
    addEventListener('scroll', pedirAplicar, { passive: true });
    addEventListener('resize', pedirMedir);
    pedirMedir();
    destroyRef.onDestroy(() => {
      if (pedidoMedir) cancelAnimationFrame(pedidoMedir);
      if (pedidoAplicar) cancelAnimationFrame(pedidoAplicar);
      observador?.disconnect();
      navegacion?.unsubscribe();
      removeEventListener('scroll', pedirAplicar);
      removeEventListener('resize', pedirMedir);
    });
  }
}
