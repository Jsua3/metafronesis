import { Injectable, Injector, inject } from '@angular/core';

import { planDeSala, rutasDelPlan } from '../../../simulator/sala/composicion';
import type { ManifiestoDePiezas, SalaPorPiezas } from '../../../simulator/sala/catalogo';
import { urlDePieza } from '../../../simulator/sala/catalogo';
import { componerSala, type Imagen } from '../../../simulator/sala/pintor';
import { AutoriaApiService } from '../../api/autoria-api.service';
import { rutaArte } from '../../modelo/biblioteca.service';
import type { Sala } from '../../modelo/escenario';

/** Proporción de las miniaturas y portadas (16:9): la vista sale ya encuadrada y `object-fit: cover` no recorta nada. */
const PROPORCION = 16 / 9;

/** Una sala tal como la trae la biblioteca: con `fondo` dibujado o, si es por piezas, con su `estructura` y sus puertas. */
export type SalaDeBiblioteca = Sala & { estructura?: SalaPorPiezas['estructura'] };

/**
 * Patrón Adapter (con caché): da a las pantallas de crear un caso UNA imagen por sala, venga como venga. Una sala con fondo
 * dibujado devuelve su archivo; una sala por piezas (el Hospital) se pinta aquí con el mismo plan y el mismo pintor del juego
 * (`planDeSala` + `componerSala`), más sus muebles de atrás hacia adelante, y se guarda como imagen en memoria. Así la
 * portada del Hospital y sus miniaturas son el cuarto real y no un hueco, sin dibujar arte nuevo ni duplicar la geometría.
 *
 * Si algo falla (sin lienzo, como en las pruebas; una pieza que no carga), devuelve `null` y la pantalla pinta su patrón.
 */
@Injectable({ providedIn: 'root' })
export class PintorDeVistas {
  /** La API se pide solo al componer: las salas con fondo dibujado (casi todas) no la necesitan. */
  private readonly injector = inject(Injector);
  private readonly vistas = new Map<string, { contenido: string; promesa: Promise<string | null> }>();
  private readonly imagenes = new Map<string, Promise<HTMLImageElement>>();

  /** La imagen de una sala: su fondo, o el cuarto compuesto por piezas. Una por sala y por sesión. */
  vista(lugarId: string, sala: SalaDeBiblioteca, completa = false): Promise<string | null> {
    const identidad = JSON.stringify([lugarId, sala.id, completa]);
    const contenido = JSON.stringify(sala);
    const anterior = this.vistas.get(identidad);
    if (anterior?.contenido === contenido) return anterior.promesa;
    if (sala.fondo || !sala.estructura) {
      this.vistas.delete(identidad);
      return Promise.resolve(sala.fondo ? rutaArte(lugarId, sala.fondo) || null : null);
    }
    const entrada = { contenido, promesa: Promise.resolve(null as string | null) };
    entrada.promesa = this.componer(lugarId, sala, completa).catch(() => null).then((resultado) => {
      if (!resultado && this.vistas.get(identidad) === entrada) this.vistas.delete(identidad);
      return resultado;
    });
    this.vistas.set(identidad, entrada);
    return entrada.promesa;
  }

  private async componer(lugarId: string, sala: SalaDeBiblioteca, completa: boolean): Promise<string | null> {
    const lienzo = typeof document === 'undefined' ? null : document.createElement('canvas');
    const ctx = lienzo?.getContext('2d', { willReadFrequently: true }) ?? null;
    if (!lienzo || !ctx || !sala.estructura) return null;
    const manifiesto = await this.injector.get(AutoriaApiService).manifiestoDePiezas();
    // Las puertas de la biblioteca traen su muro y su posición: el plan las coloca igual que el juego.
    const porPiezas = { encuadre: sala.encuadre, estructura: sala.estructura, puertas: sala.puertas } as unknown as SalaPorPiezas;
    const plan = planDeSala(porPiezas, manifiesto);
    const rutas = rutasDelPlan(plan);
    const cargadas = await Promise.all(rutas.map((r) => this.cargar(r)));
    const imagenes = new Map<string, Imagen>(rutas.map((r, i) => [r, aRgba(cargadas[i], ctx)]));
    const cuarto = componerSala(plan, imagenes, null);
    lienzo.width = plan.ancho;
    lienzo.height = plan.alto;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(cuarto.rgba), plan.ancho, plan.alto), 0, 0);
    await this.ponerMuebles(ctx, lugarId, sala, manifiesto);
    if (completa) return imagenAutocontenida(lienzo);
    // El techo vacío (la franja oscura sobre el muro) se leía como una banda negra en la tarjeta y en el panel: se busca
    // dónde empieza el cuarto de verdad y se encuadra desde ahí, ya en 16:9.
    const { x, y, ancho, alto } = encuadre(ctx, plan.ancho, plan.alto);
    const salida = document.createElement('canvas');
    salida.width = ancho;
    salida.height = alto;
    salida.getContext('2d')?.drawImage(lienzo, x, y, ancho, alto, 0, 0, ancho, alto);
    return imagenAutocontenida(salida);
  }

  /** Los muebles van encima del cuarto, de atrás hacia adelante; cada uno en su primer cuadro y apoyado en su punto. */
  private async ponerMuebles(ctx: CanvasRenderingContext2D, lugarId: string, sala: SalaDeBiblioteca, m: ManifiestoDePiezas): Promise<void> {
    const muebles = [...(sala.muebles ?? [])].sort((a, b) => a.y - b.y);
    for (const c of muebles) {
      const ficha = m.muebles[`${lugarId}/${c.ref}`];
      if (!ficha) continue;
      try {
        const img = await this.cargar(ficha.ruta);
        const [ax, ay] = (ficha as { apoyo?: [number, number] }).apoyo ?? [ficha.ancho / 2, ficha.alto];
        ctx.save();
        if (c.espejo) { ctx.translate(2 * c.x, 0); ctx.scale(-1, 1); }
        ctx.drawImage(img, 0, 0, ficha.ancho, ficha.alto, Math.round(c.x - ax), Math.round(c.y - ay), ficha.ancho, ficha.alto);
        ctx.restore();
      } catch {
        // Un mueble que no carga no tumba la vista: el cuarto se ve igual sin él.
      }
    }
  }

  private cargar(ruta: string): Promise<HTMLImageElement> {
    let img = this.imagenes.get(ruta);
    if (!img) {
      img = new Promise<HTMLImageElement>((listo, falla) => {
        const i = new Image();
        i.onload = () => listo(i);
        i.onerror = () => falla(new Error(`No cargó ${ruta}`));
        i.src = urlDePieza(ruta);
      });
      img = img.catch((error) => { this.imagenes.delete(ruta); throw error; });
      this.imagenes.set(ruta, img);
    }
    return img;
  }
}

/** Los consumidores conservan la imagen sin un contrato de liberación: una URL de datos evita invalidarlos y se libera con ellos. */
export function imagenAutocontenida(lienzo: HTMLCanvasElement): Promise<string | null> {
  return new Promise((listo) => lienzo.toBlob((blob) => {
    if (!blob) { listo(null); return; }
    const lector = new FileReader();
    lector.onload = () => listo(typeof lector.result === 'string' ? lector.result : null);
    lector.onerror = () => listo(null);
    lector.readAsDataURL(blob);
  }, 'image/png'));
}

/** De una imagen del navegador al búfer RGBA que espera el pintor del juego. */
function aRgba(img: HTMLImageElement, ctx: CanvasRenderingContext2D): Imagen {
  const { naturalWidth: ancho, naturalHeight: alto } = img;
  ctx.canvas.width = ancho;
  ctx.canvas.height = alto;
  ctx.clearRect(0, 0, ancho, alto);
  ctx.drawImage(img, 0, 0);
  return { ancho, alto, rgba: ctx.getImageData(0, 0, ancho, alto).data };
}

/**
 * El recorte en 16:9 de un cuarto sin su techo. El techo es la franja de arriba del mismo color (o transparente) que el
 * píxel del centro de la primera fila: la primera fila en la que más de la mitad de los píxeles se aparta de ese color es
 * el muro. Desde ahí, si sobra alto se recorta abajo; si falta, se recortan los lados por igual.
 */
export function encuadre(ctx: CanvasRenderingContext2D, ancho: number, alto: number): { x: number; y: number; ancho: number; alto: number } {
  const datos = ctx.getImageData(0, 0, ancho, alto).data;
  const base = (Math.floor(ancho / 2)) * 4;
  const [r0, g0, b0, a0] = [datos[base], datos[base + 1], datos[base + 2], datos[base + 3]];
  const distinto = (i: number) =>
    a0 < 16 ? datos[i + 3] > 16 : Math.abs(datos[i] - r0) + Math.abs(datos[i + 1] - g0) + Math.abs(datos[i + 2] - b0) > 36 || datos[i + 3] < 16;
  let techo = 0;
  // Nunca más de la mitad: un cuarto raro (todo de un color) no debe quedarse sin imagen.
  for (let y = 0; y < alto / 2; y++) {
    let cuenta = 0;
    for (let x = 0; x < ancho; x += 2) if (distinto((y * ancho + x) * 4)) cuenta++;
    if (cuenta > ancho / 8) { techo = y; break; }
  }
  const resto = alto - techo;
  if (resto * PROPORCION >= ancho) return { x: 0, y: techo, ancho, alto: Math.round(ancho / PROPORCION) };
  const angosto = Math.round(resto * PROPORCION);
  return { x: Math.round((ancho - angosto) / 2), y: techo, ancho: angosto, alto: resto };
}
