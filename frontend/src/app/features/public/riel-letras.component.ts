import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewEncapsulation, afterNextRender, effect, inject, input,
  viewChild,
} from '@angular/core';

import { TemaService } from '../../core/tema/tema.service';

export interface SeccionRiel { id: string; num: string; nombre: string; }

interface Pose { x: number; y: number; giro: number; escala: number; color: number[]; }
interface Letra {
  el?: HTMLSpanElement; espacio?: boolean; w: number; c: number; linea: number; cl: number;
  destino?: Pose; actual?: Pose; capa: number; capaPuesta?: number;
}
interface Palabra {
  k: number; enlace: HTMLAnchorElement; seccion: HTMLElement; letras: Letra[]; visibles: Letra[]; encima: boolean;
  ancho: number; anchos: number[]; escala: number; escalaLista: number;
  yLeida: number; yProxima: number; yNum: number; yTitulo: number; altoTitulo: number;
}

// Medidas en px sobre letras dibujadas a BASE (riel.js del boletín de Proyección Social, adaptado a un riel de 240 px).
const BASE = 36;
const ANCHO_TITULO = 196;
const DERECHA = 24;
const EJE = 14;
const E_LISTA = 13 / BASE;
const E_VERTICAL = 19 / BASE;
const FILA = 28;
const ARRIBA = 30;
const ABAJO = 26;
const ALTO_LINEA = 38;
const ALTO_NUM = 30;
const HUECO = 12;
const TRAMO = 220;
const ESCALON = 1.5;
const TAU = 75;

const limitar = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const fuera = (t: number) => 1 - Math.pow(1 - t, 3);
const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function mezcla(a: Pose, b: Pose, tx: number, ty: number, t: number): Pose {
  return {
    x: a.x + (b.x - a.x) * tx,
    y: a.y + (b.y - a.y) * ty,
    giro: a.giro + (b.giro - a.giro) * t,
    escala: a.escala + (b.escala - a.escala) * t,
    color: a.color.map((v, i) => v + (b.color[i] - v) * t),
  };
}

/**
 * Riel de letras de la portada (desde 1100 px): a la derecha, el índice de secciones. El nombre de la sección que se
 * lee es el título grande; el de la siguiente cuelga en vertical del borde superior de su sección y, al bajar, sus
 * letras se sueltan una a una (la última primero) hasta formar el título. Cada letra es un elemento que nunca se
 * reemplaza: solo cambian transform y color, con amortiguación exponencial (τ = 75 ms) que no depende de los Hz.
 * Los enlaces reales del índice quedan encima como zona de clic y de foco; las letras son decorativas (aria-hidden).
 * Con «reducir movimiento» el título cambia de golpe. Por debajo de 1100 px el riel no existe (navega la barra).
 */
@Component({
  selector: 'app-riel-letras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Las letras se crean desde el código: sin encapsulación (clases con prefijo riel) para que les lleguen los estilos.
  encapsulation: ViewEncapsulation.None,
  template: `
    <nav class="riel" aria-label="Secciones de la portada" #riel>
      <ol class="riel__lista">
        @for (s of secciones(); track s.id) {
          <li><a [href]="'#' + s.id" [attr.data-num]="s.num">{{ s.nombre }}</a></li>
        }
      </ol>
      <span class="riel__muestra riel__muestra--lista" aria-hidden="true"></span>
      <span class="riel__muestra riel__muestra--vertical" aria-hidden="true"></span>
      <span class="riel__muestra riel__muestra--titulo" aria-hidden="true"></span>
    </nav>
  `,
  styleUrl: './riel-letras.component.scss',
})
export class RielLetrasComponent {
  readonly secciones = input.required<readonly SeccionRiel[]>();

  private readonly rielRef = viewChild.required<ElementRef<HTMLElement>>('riel');
  private readonly tema = inject(TemaService);
  private vivo: { actualizar: () => void; medir: () => void; colores: () => void; quitar: () => void } | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof matchMedia !== 'function' || typeof requestAnimationFrame !== 'function') return;
      const riel = this.rielRef().nativeElement;
      const enComputador = matchMedia('(min-width: 1100px)');
      const reducir = matchMedia('(prefers-reduced-motion: reduce)');
      const ajustar = () => {
        if (enComputador.matches && !this.vivo) this.vivo = this.crear(riel, reducir);
        else if (!enComputador.matches && this.vivo) { this.vivo.quitar(); this.vivo = null; }
        else this.vivo?.medir();
        this.vivo?.actualizar();
      };
      let pedido = false;
      const alDesplazar = () => {
        if (pedido) return;
        pedido = true;
        requestAnimationFrame(() => { pedido = false; this.vivo?.actualizar(); });
      };
      addEventListener('scroll', alDesplazar, { passive: true });
      addEventListener('resize', ajustar);
      document.fonts?.ready.then(ajustar);
      ajustar();
      destroyRef.onDestroy(() => {
        removeEventListener('scroll', alDesplazar);
        removeEventListener('resize', ajustar);
        this.vivo?.quitar();
      });
    });
    // Al cambiar de tema, las letras toman los colores de la piel nueva.
    effect(() => {
      this.tema.modo();
      queueMicrotask(() => { this.vivo?.colores(); this.vivo?.actualizar(); });
    });
  }

  private crear(riel: HTMLElement, reducir: MediaQueryList) {
    const enlaces = [...riel.querySelectorAll<HTMLAnchorElement>('.riel__lista a')];
    const secciones = enlaces.map(a => document.getElementById(a.getAttribute('href')!.slice(1)));
    if (!enlaces.length || secciones.some(s => !s)) return null;

    const nuevo = (etiqueta: string, clase: string) => {
      const el = document.createElement(etiqueta);
      el.className = clase;
      el.setAttribute('aria-hidden', 'true');
      return el;
    };
    const capa = nuevo('div', 'riel__capa');
    const numero = nuevo('span', 'riel__num');
    const linea = nuevo('i', 'riel__linea');

    // Colores de la piel, leídos de tres muestras y normalizados a RGB con un lienzo de 1 × 1.
    let GRIS = [169, 179, 204];
    let VERTICAL = [182, 156, 255];
    let TITULO = [201, 179, 255];
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = 1;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    const rgb = (selector: string, previo: number[]) => {
      const muestra = riel.querySelector<HTMLElement>(selector);
      if (!ctx || !muestra) return previo;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = getComputedStyle(muestra).color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    };
    const colores = () => {
      GRIS = rgb('.riel__muestra--lista', GRIS);
      VERTICAL = rgb('.riel__muestra--vertical', VERTICAL);
      TITULO = rgb('.riel__muestra--titulo', TITULO);
    };
    colores();

    const palabras: Palabra[] = this.secciones().map((s, k) => {
      const palabra = { k, enlace: enlaces[k], seccion: secciones[k]!, letras: [] as Letra[], visibles: [] as Letra[], encima: false } as Palabra;
      for (const caracter of Array.from(s.nombre)) {
        if (!caracter.trim()) { palabra.letras.push({ espacio: true, w: 0, c: 0, linea: 0, cl: 0, capa: 1 }); continue; }
        const el = document.createElement('span');
        el.className = 'riel__letra';
        el.setAttribute('aria-hidden', 'true');
        el.textContent = caracter;
        capa.appendChild(el);
        const letra: Letra = { el, w: 0, c: 0, linea: 0, cl: 0, capa: 1 };
        palabra.letras.push(letra);
        palabra.visibles.push(letra);
      }
      return palabra;
    });
    [capa, numero, linea].forEach(el => riel.appendChild(el));
    riel.classList.add('riel--vivo');

    let alto = 0, xDerecha = 0, xEje = 0, pintado = -1, pedido = 0, antes = 0;

    const medir = () => {
      const espacio = BASE * 0.26;
      alto = riel.clientHeight;
      xDerecha = riel.clientWidth - DERECHA;
      xEje = riel.clientWidth - EJE;
      pintado = -1;
      for (const p of palabras) {
        let x = 0;
        for (const l of p.letras) {
          l.w = l.espacio ? espacio : l.el!.offsetWidth;
          l.c = x + l.w / 2;
          x += l.w;
        }
        p.ancho = x;
        // El título se parte por palabras, llenando cada línea; si aun así no cabe, se achica.
        const anchos = [0];
        let fila = 0, usado = 0;
        let grupo: Letra[] = [];
        const colocar = () => {
          if (!grupo.length) return;
          const w = grupo.reduce((suma, l) => suma + l.w, 0);
          if (usado > 0 && usado + espacio + w > ANCHO_TITULO) { fila += 1; usado = 0; } else if (usado > 0) usado += espacio;
          for (const l of grupo) { l.linea = fila; l.cl = usado + l.w / 2; usado += l.w; }
          anchos[fila] = usado;
          grupo = [];
        };
        for (const l of p.letras) { if (l.espacio) colocar(); else grupo.push(l); }
        colocar();
        p.anchos = anchos;
        p.escala = Math.min(1, ANCHO_TITULO / Math.max(1, ...anchos));
        p.escalaLista = Math.min(E_LISTA, (xDerecha - 14) / Math.max(1, x));
        p.yLeida = ARRIBA + p.k * FILA;
        p.yProxima = alto - ABAJO - (palabras.length - 1 - p.k) * FILA;
        p.yNum = ARRIBA + p.k * FILA - FILA / 2 + HUECO;
        p.yTitulo = p.yNum + ALTO_NUM;
        p.altoTitulo = anchos.length * ALTO_LINEA * p.escala;
      }
    };

    const enLista = (p: Palabra, l: Letra, y: number): Pose =>
      ({ x: xDerecha - (p.ancho - l.c) * p.escalaLista, y, giro: 0, escala: p.escalaLista, color: p.encima ? TITULO : GRIS });
    const grande = (p: Palabra, l: Letra): Pose => ({
      x: xDerecha - (p.anchos[l.linea] - l.cl) * p.escala,
      y: p.yTitulo + (l.linea + 0.5) * ALTO_LINEA * p.escala,
      giro: 0, escala: p.escala, color: TITULO,
    });
    // Vertical: se lee de abajo arriba y cuelga del borde superior de su sección.
    const vertical = (p: Palabra, l: Letra, arriba: number): Pose =>
      ({ x: xEje, y: arriba + 14 + (p.ancho - l.c) * E_VERTICAL, giro: -90, escala: E_VERTICAL, color: p.encima ? TITULO : VERTICAL });
    // Títulos de varias líneas: las letras de arriba recorren un carril en escuadra para no cruzar la última línea.
    const porArriba = (a: Pose, b: Pose, t: number): Pose => {
      const alza = ALTO_LINEA * 0.8 * b.escala;
      const carril = b.y - alza;
      const tramoVertical = Math.abs(a.y - carril);
      const andado = limitar(t / 0.8) * (tramoVertical + Math.abs(a.x - b.x));
      const enOrilla = andado < tramoVertical;
      const letra = mezcla(a, b, 0, 0, suave(limitar((andado - tramoVertical + 24) / 48)));
      letra.x = enOrilla ? a.x : a.x + (b.x > a.x ? 1 : -1) * (andado - tramoVertical);
      letra.y = (enOrilla ? a.y + (carril > a.y ? 1 : -1) * andado : carril) + alza * suave(limitar((t - 0.8) / 0.2));
      return letra;
    };
    // El enlace real de cada parte queda sobre su palabra: es la zona de clic y de foco.
    const colocarEnlace = (p: Palabra, esActual: boolean, sube: boolean, arriba: number, leida: boolean) => {
      const e = p.enlace.style;
      if (esActual) {
        e.left = `${xDerecha - ANCHO_TITULO}px`; e.width = `${ANCHO_TITULO}px`; e.top = `${p.yTitulo}px`; e.height = `${p.altoTitulo}px`;
      } else if (sube) {
        e.left = `${xEje - 14}px`; e.width = '28px'; e.top = `${arriba + 8}px`; e.height = `${p.ancho * E_VERTICAL + 12}px`;
      } else {
        e.left = '14px'; e.width = `${xDerecha - 8}px`; e.top = `${(leida ? p.yLeida : p.yProxima) - 12}px`; e.height = '24px';
      }
      if (esActual) p.enlace.setAttribute('aria-current', 'true'); else p.enlace.removeAttribute('aria-current');
    };

    const cuadro = (ahora: number) => {
      pedido = 0;
      const dt = antes ? Math.min(64, ahora - antes) : 16;
      const paso = reducir.matches ? 1 : 1 - Math.exp(-dt / TAU);
      let sigue = false;
      antes = ahora;
      for (const p of palabras) {
        for (const l of p.visibles) {
          const d = l.destino!;
          let a = l.actual;
          if (!a) { a = { ...d, color: d.color.slice() }; l.actual = a; }
          for (const c of ['x', 'y', 'giro', 'escala'] as const) {
            const falta = d[c] - a[c];
            if (Math.abs(falta) > (c === 'escala' ? 0.002 : 0.15)) { a[c] += falta * paso; sigue = true; } else a[c] = d[c];
          }
          for (let i = 0; i < 3; i += 1) {
            const tono = d.color[i] - a.color[i];
            if (Math.abs(tono) > 1) { a.color[i] += tono * paso; sigue = true; } else a.color[i] = d.color[i];
          }
          if (l.capaPuesta !== l.capa) { l.el!.style.zIndex = String(l.capa); l.capaPuesta = l.capa; }
          l.el!.style.transform = `translate3d(${a.x.toFixed(2)}px,${a.y.toFixed(2)}px,0) translate(-50%,-50%) rotate(${a.giro.toFixed(2)}deg) scale(${a.escala.toFixed(3)})`;
          l.el!.style.color = `rgb(${Math.round(a.color[0])},${Math.round(a.color[1])},${Math.round(a.color[2])})`;
        }
      }
      if (sigue) pedido = requestAnimationFrame(cuadro); else antes = 0;
    };

    const actualizar = () => {
      const techo = riel.getBoundingClientRect().top;
      const arriba = palabras.map(p => p.seccion.getBoundingClientRect().top - techo);
      const quieto = reducir.matches;
      const avances = palabras.map((p, k) => {
        if (k === 0) return 1;
        const v = limitar((p.yTitulo + 20 + TRAMO - arriba[k]) / TRAMO);
        return quieto ? (v >= 0.5 ? 1 : 0) : v;
      });
      let enCurso = 0, enPaso = 1;
      avances.forEach((v, k) => { if (v >= 0.5) enCurso = k; if (v > 0 && v < 1) enPaso = v; });

      palabras.forEach((p, k) => {
        const sale = k + 1 < palabras.length ? avances[k + 1] : 0;
        const asoma = !quieto && arriba[k] < alto - 30;
        const sube = k > 0 && sale === 0 && avances[k] < 1 && (avances[k] > 0 || asoma);
        const ultima = p.visibles.length - 1;
        p.visibles.forEach((l, j) => {
          l.capa = 1;
          if (sale > 0) {
            const q = suave(limitar(sale * 2));
            l.destino = mezcla(grande(p, l), enLista(p, l, p.yLeida), q, q, q);
          } else if (k === 0 || avances[k] >= 1) {
            l.destino = grande(p, l);
            l.capa = 2;
          } else if (sube) {
            // La última letra del nombre sale primero; cada una se corre a la izquierda y luego sube a su puesto.
            const orden = ultima > 0 ? (ultima - j) / ultima : 0;
            const t = limitar(avances[k] * (1 + ESCALON) - ESCALON * orden);
            const desde = vertical(p, l, arriba[k]);
            l.destino = l.linea < p.anchos.length - 1 ? porArriba(desde, grande(p, l), t) : mezcla(desde, grande(p, l), fuera(t), suave(t), suave(t));
            if (t >= 1) l.capa = 2;
          } else {
            l.destino = enLista(p, l, p.yProxima);
          }
        });
        colocarEnlace(p, k === enCurso, sube, arriba[k], k < enCurso);
      });

      // El número y la línea se apagan durante el paso y vuelven en el sitio nuevo.
      let opacidad = 1;
      if (enPaso < 0.4) opacidad = 1 - enPaso / 0.4; else if (enPaso < 0.9) opacidad = 0; else if (enPaso < 1) opacidad = (enPaso - 0.9) / 0.1;
      numero.style.opacity = String(opacidad);
      linea.style.opacity = String(opacidad);
      if (enCurso !== pintado) {
        pintado = enCurso;
        numero.textContent = this.secciones()[enCurso].num;
        numero.style.top = `${palabras[enCurso].yNum}px`;
        linea.style.top = `${palabras[enCurso].yTitulo + palabras[enCurso].altoTitulo + 8}px`;
      }
      if (!pedido) pedido = requestAnimationFrame(cuadro);
    };

    // Un enlace bajo el cursor o con el foco pone su palabra en el color del título.
    const resaltar = (k: number, si: boolean) => () => { palabras[k].encima = si; actualizar(); };
    const oyentes: [HTMLElement, string, () => void][] = [];
    enlaces.forEach((enlace, k) => {
      for (const ev of ['mouseenter', 'focus']) oyentes.push([enlace, ev, resaltar(k, true)]);
      for (const ev of ['mouseleave', 'blur']) oyentes.push([enlace, ev, resaltar(k, false)]);
    });
    oyentes.forEach(([el, ev, fn]) => el.addEventListener(ev, fn));

    medir();
    return {
      actualizar, medir, colores,
      quitar: () => {
        if (pedido) cancelAnimationFrame(pedido);
        oyentes.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
        [capa, numero, linea].forEach(el => el.remove());
        riel.classList.remove('riel--vivo');
        enlaces.forEach(enlace => { enlace.removeAttribute('style'); enlace.removeAttribute('aria-current'); });
      },
    };
  }
}
