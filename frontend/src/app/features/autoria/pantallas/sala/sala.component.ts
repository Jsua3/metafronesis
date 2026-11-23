import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input,
  signal, untracked, viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { UiDialog } from '../../../../shared/ui/dialog/ui-dialog';
import { UiMenu, type UiMenuItem } from '../../../../shared/ui/menu/ui-menu';
import { CasoStore, type TipoElemento } from '../../estado/caso.store';
import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { claveDeNuevo } from '../../modelo/hacia-api';
import { faltasPorSala, anclaDeElemento } from '../../modelo/salas-a-documento';
import type { FaltaDeSala } from '../../modelo/salas-a-documento';
import type { PlanDeSala } from '../../../simulator/sala/composicion';
import { LienzoDeSalaComponent } from './lienzo-de-sala.component';
import { actoresDeSala, escalaDeSala, salaParaLienzo } from './lienzo-de-sala';
import { piezaDelObjeto } from '../../../simulator/sala/mueble-vivo';
import { PiezasDelMuroComponent } from './piezas-del-muro.component';
import { ManijaDeAnchoComponent } from './manija-de-ancho.component';
import { PanelDeEstructuraComponent } from './panel-de-estructura.component';
import { BarraDelLienzoComponent } from './barra-del-lienzo.component';
import { CatalogoDelLugarComponent } from './catalogo-del-lugar.component';
import { TrayectoDePersonaComponent } from './trayecto-de-persona.component';
import { rutaArte, rutaRetrato, rutaSpriteKit } from '../../modelo/biblioteca.service';
import type { MovimientoPersonaje, SalaCaso } from '../../modelo/caso';
import { EXPRESIONES, type Expresion, type Mirando, type Punto } from '../../modelo/escenario';
import { ALTO_SALA, ANCHO_SALA, limitarAZona, zonaCaminable } from '../../modelo/geometria';
import { NOMBRE_MOVIMIENTO, TEXTO_PERSONA_A_ATENDER, revisarPuntoDeIda, tipoDeMovimiento } from '../../modelo/movimiento';
import { respuestasSinForma } from '../../modelo/revision';
import { ENCUADRE_LEGIBLE, NOMBRE_EXPRESION } from '../../modelo/textos';
import { RutasAutoria } from '../../rutas';
import { EstudioRanuraDirective, EstudioHerramientaComponent } from '../../marco/estudio';

interface Pieza {
  clave: string; // «mueble-2»
  tipo: TipoElemento;
  indice: number;
  nombre: string;
  x: number;
  y: number;
  arte: string;
  espejo: boolean;
  /** Para personajes: la fila de idle.png según hacia dónde mira. */
  sprite?: { url: string; fila: number };
  /**
   * Sala por piezas: el cuadro de la pieza de la biblioteca que la dibuja en el lienzo. El botón mide eso y no la imagen
   * entera: una hoja animada de O1 (seis cuadros de 125 px) hacía un botón de 750 px que tapaba media sala.
   */
  cuadro?: { ancho: number; alto: number };
  /** Para personajes: cómo se mueve y si es la persona a atender de la sala. */
  movimiento?: MovimientoPersonaje;
  personaClave?: boolean;
  /** La puso o la movió el asistente y el docente aún no la acepta. */
  marcaIa?: boolean;
}

/** Un punto elegido a mano con las flechas o con un clic. */
const PASO_GRANDE = 8;
const PASO_CHICO = 1;
/** Lo que se aleja de la persona el punto que se propone al empezar a elegirlo (px de sala), por orden de preferencia. */
const DISTANCIAS_INICIALES = [96, -96, 160, -160, 48, -48];

/** Las pestañas del panel de la derecha. */
type PestanaPanel = 'agregar' | 'detalles' | 'apariencia';
/** Por debajo de esto la sala es de solo mirar (EDITOR.md §4.5): arrastrar muebles con el dedo no está resuelto. */
const CONSULTA_ESTRECHA = '(max-width: 63.999rem)';

/**
 * Editor de una sala (tablero 26): mover, quitar y agregar muebles, objetos y personajes,
 * con deshacer siempre a mano y «Volver a la sala original». Todo lo que se arrastra se hace
 * también con teclado (flechas, Supr) y con botones.
 *
 * Disposición (E4, EDITOR.md §4.4): el lienzo manda. Tres zonas a la altura de la ventana: «En esta sala» a la izquierda,
 * el lienzo en el centro (la sala encaja en el ancho Y en el alto que quedan) y un panel con pestañas a la derecha
 * («Agregar», «Detalles», «Apariencia»; patrón State: elegir algo pasa solo a «Detalles»). La conducta (arrastre,
 * teclado, deshacer, estructura) no cambia.
 */
@Component({
  selector: 'app-sala',
  imports: [EstudioRanuraDirective, EstudioHerramientaComponent, RouterLink, UiMenu, CatalogoDelLugarComponent, LienzoDeSalaComponent, PiezasDelMuroComponent, ManijaDeAnchoComponent,
    PanelDeEstructuraComponent, TrayectoDePersonaComponent, BarraDelLienzoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'atencion.set(null)' },
  template: `
    @if (sala(); as s) {
      <div class="sala" [class.sala--estrecha]="estrecha()">
        <header class="sala__cabeza">
          <div class="sala__titulos">
            <div class="sala__titulo">
              <a class="sala__miga" [routerLink]="s.estructura ? rutas.a('/editor/plano') : rutas.a('/editor')">
                <span aria-hidden="true">‹</span> {{ s.estructura ? 'Plano del caso' : 'Escenas y caminos' }}
              </a>
              <h1>{{ s.nombre }}</h1>
            </div>
            <!-- El aviso sube a la cabecera como nota permanente (EDITOR.md §4.4): no se pierde bajo el lienzo. -->
            <p class="sala__nota"><span class="sala__encuadre">{{ encuadre(s) }}</span>
              <span class="sala__aviso">Los cambios valen para todas las escenas que pasan en esta sala.</span></p>
          </div>
          <ng-template estudioRanura="herramientas">
          @if (!estrecha()) {
            <!-- Dos botones y un menú, como mucho (EDITOR.md §4.2, regla 4). -->
            <div class="sala__acciones">
              <button type="button" estudioHerramienta="Deshacer" data-accion="deshacer" [attr.aria-disabled]="!store.puedeDeshacer()" (click)="store.deshacer()"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5 3 9l4 4M3 9h8a5 5 0 0 1 5 5" /></svg></button>
              <button type="button" estudioHerramienta="Rehacer" [attr.aria-disabled]="!store.puedeRehacer()" (click)="store.rehacer()"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13 5 4 4-4 4m4-4H9a5 5 0 0 0-5 5" /></svg></button>
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <ui-menu class="sala__mas" data-accion="volver-sala-original" label="Más" variant="secondary" [items]="masAcciones"
                (itemSelected)="alElegirMas($event)" />
            </div>
          }
          </ng-template>
        </header>
        @if (estrecha()) {
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <!-- En el teléfono el lienzo es solo una vista (inert): reducido, sus piezas se tapan unas a otras y ninguna llegaba
               a 24 px tocables. Cada cosa se elige en «En esta sala» (el equivalente de WCAG 2.5.8), que muestra sus detalles. -->
          <p class="sala__solo-mirar" role="note">Aquí solo se mira: elige algo en «En esta sala» para ver sus detalles. Para mover, agregar o quitar, abre el caso en una pantalla más ancha.</p>
        }
        <p role="status" class="solo-lector">{{ anuncio() }}</p>

        <div class="sala__cuerpo">
          <ng-template estudioRanura="explorador">
          <section aria-labelledby="en-sala" class="tarjeta columna-lista">
            <h2 id="en-sala">En esta sala</h2>
            <!-- Lista con foco itinerante (patrón listbox de ARIA): Tab entra y sale de una vez; las flechas, Inicio y Fin recorren y eligen. -->
            <ul role="listbox" aria-label="Cosas en la sala" class="lista" (keydown)="recorrerLista($event)">
              @for (g of grupos(); track g.titulo) {
                <li role="group" [attr.aria-label]="g.titulo" [attr.data-accion]="g.titulo === 'Personajes' ? 'cambiar-expresion como-se-mueve persona-a-atender' : null">
                  <span class="grupo" aria-hidden="true">{{ g.titulo }}</span>
                  <ul role="none">
                    @for (p of g.piezas; track p.clave) {
                      <li role="option" [attr.tabindex]="itinerante() === p.clave ? 0 : -1" [attr.aria-selected]="elegida() === p.clave" [attr.data-clave]="p.clave"
                          (mouseenter)="atencion.set(p.clave)" (mouseleave)="soltarAtencion(p.clave)"
                          (focus)="atencion.set(p.clave)" (blur)="soltarAtencion(p.clave)" (click)="elegir(p.clave)" (keydown.enter)="elegir(p.clave)" (keydown.space)="elegir(p.clave); $event.preventDefault()">
                        <span class="opcion__nombre">{{ p.nombre }}</span>
                        @if (p.personaClave) { <span class="opcion__marca">{{ textoPersonaAAtender }}</span> }
                        @if (p.marcaIa) { <span class="opcion__marca opcion__marca--ia"> · sugerido por la IA</span> }
                      </li>
                    } @empty {
                      <li role="none" class="texto-secundario vacio">Ninguno</li>
                    }
                  </ul>
                </li>
              }
              <li role="group" aria-label="Puertas">
                <span class="grupo" aria-hidden="true">Puertas</span>
                <ul role="none">
                  @for (pu of s.puertas; track pu.id) {
                    <li role="none" class="puerta">{{ pu.etiqueta }}{{ pu.hacia ? '' : ' (no lleva a ninguna sala del caso)' }}</li>
                  }
                </ul>
              </li>
            </ul>
          </section>

          </ng-template>

          <!-- El lienzo manda (EDITOR.md §4.4): una tarjeta con su barra fina y la sala encajada en todo el alto y el ancho que quedan. -->
          <section aria-labelledby="la-sala" class="columna-sala">
            <h2 id="la-sala" class="solo-lector">La sala</h2>
            <app-barra-del-lienzo [salaId]="s.id" [ancho]="s.estructura ? s.estructura.ancho : null" [escala]="escalaPiezas()"
              [faltas]="s.estructura ? faltasSala() : []" [puertas]="s.estructura ? puertasPendientes() : []" [estrecha]="estrecha()"
              (escalaCambio)="escalaPiezas.set($event)" (irAFalta)="irAFalta($event)" (irAPuerta)="seleccionarPieza(anclaPuerta($event))" />

            <div class="lienzo-marco" [class.desplazamiento]="s.estructura">
            @if (s.estructura && catalogoPiezas.error()) {
              <div class="lienzo-estado">
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <p role="alert">No se pudo cargar el catálogo de piezas.</p>
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <button type="button" class="boton" (click)="catalogoPiezas.reintentar()">Reintentar</button>
              </div>
            }
            @if (s.estructura && !catalogoPiezas.error() && !catalogoPiezas.manifiesto()) {
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <p role="status" class="lienzo-estado">Cargando la sala…</p>
            }
            <div class="escenario" #escenario [id]="'sala-' + s.id" [class.por-piezas]="s.estructura"
                 [class.encajada]="s.estructura && escalaLienzo() < 1" [class.solo-mirar]="estrecha()"
                 [attr.inert]="estrecha() ? '' : null"
                 [style.width.px]="s.estructura ? s.estructura.ancho * escalaLienzo() : null"
                 [style.height.px]="s.estructura ? alto * escalaLienzo() : null" tabindex="-1"
                 data-accion="mover-mueble" (keydown)="teclaGeneral($event)" (click)="clicEnSala($event)"
                 [style.--escala]="s.estructura ? escalaLienzo() : escala()" (pointermove)="arrastrar($event)"
                 (pointerup)="soltar()" (pointercancel)="soltar()">
              @if (s.estructura && !estrecha()) {
                <app-manija-de-ancho [ancho]="s.estructura.ancho" [escala]="escalaLienzo()"
                  (cambio)="cambiarAncho($event)" />
              }
              <div class="lienzo" [style.width.px]="s.estructura?.ancho ?? ancho">
                @if (s.estructura) {
                  @if (!catalogoPiezas.error() && catalogoPiezas.manifiesto() && salaLienzo(); as salaLienzoActual) {
                    <app-lienzo-de-sala [sala]="salaLienzoActual" [actores]="actoresLienzo()"
                      [escala]="1" (listo)="plan.set($event.plan)" />
                    <app-piezas-del-muro #capaDePiezas [sala]="s" [plan]="plan()" [faltas]="faltasSala()"
                      [escala]="escalaLienzo()" [soloMirar]="estrecha()" (elegida)="alElegirEnMuro($event)" />
                  }
                } @else {
                  <img class="pixel fondo" [src]="arte(s.fondo)" alt="" [width]="ancho" [height]="alto" draggable="false" />
                }
                <!-- Hasta dónde va y viene cada persona: una línea discreta y una marca en forma de rombo (solo adorno; el dato está en los detalles). -->
                <svg class="trazos" [style.width.px]="s.estructura?.ancho ?? ancho"
                     [attr.viewBox]="'0 0 ' + (s.estructura?.ancho ?? ancho) + ' ' + alto" aria-hidden="true">
                  @for (t of trazos(); track t.clave) {
                    <line class="ida" [attr.data-ida]="t.clave" [attr.x1]="t.desde.x" [attr.y1]="t.desde.y" [attr.x2]="t.hasta.x" [attr.y2]="t.hasta.y"></line>
                    <path class="hasta" [attr.data-hasta]="t.clave" [attr.d]="rombo(t.hasta)"></path>
                  }
                  @for (t of trayectos(); track t.clave) {
                    <polyline class="ida" fill="none" [attr.points]="t.linea"></polyline>
                    <circle class="hasta" [attr.cx]="t.inicio.x" [attr.cy]="t.inicio.y" r="7"></circle>
                    @for (p of t.puntos; track $index) {
                      <circle class="hasta" [attr.cx]="p.x" [attr.cy]="p.y" r="12"></circle>
                      <text [attr.x]="p.x" [attr.y]="p.y + 5" text-anchor="middle">{{ $index + 1 }}</text>
                    }
                  }
                  @if (lineaDelBorrador(); as l) {
                    <line class="ida borrador" data-borrador [attr.x1]="l.desde.x" [attr.y1]="l.desde.y" [attr.x2]="l.hasta.x" [attr.y2]="l.hasta.y"></line>
                  }
                </svg>
                @for (p of piezasOrdenadas(); track p.clave) {
                  <button type="button" class="pieza" [id]="idObjeto(p)" data-equivalente="lista-de-la-sala"
                          [attr.data-elemento]="p.clave" [class.elegida]="elegida() === p.clave"
                          [class.atendida]="atencion() === p.clave" [class.marca-ia]="p.marcaIa"
                          [class.dibujo-en-lienzo]="s.estructura"
                          [attr.aria-label]="p.nombre + (p.personaClave ? ', ' + textoPersonaAAtender : '') + (p.marcaIa ? ', sugerido por la IA' : '') + (elegida() === p.clave ? ', elegido' : '')"
                          [style.left.px]="posicion(p).x" [style.top.px]="posicion(p).y" [style.z-index]="p.y"
                          (pointerdown)="empezarArrastre($event, p)" (click)="elegir(p.clave)" (keydown)="teclaPieza($event, p)">
                    @if (p.personaClave) {
                      <span class="marca-atender" aria-hidden="true">
                        <svg class="chevron" viewBox="0 0 14 9" width="14" height="9"><path d="M0 0H14L7 9Z"></path></svg>
                        <span class="texto-marca">A atender</span>
                      </span>
                    }
                    @if (p.sprite) {
                      <span class="personaje" [style.background-image]="'url(' + p.sprite.url + ')'"
                            [style.background-position]="'0 ' + (-72 * p.sprite.fila) + 'px'"></span>
                    } @else {
                      <img class="pixel" [src]="p.arte" alt="" draggable="false" [class.espejo]="p.espejo" [class.cuadro]="!!p.cuadro"
                           [style.width.px]="p.cuadro?.ancho" [style.height.px]="p.cuadro?.alto" />
                    }
                  </button>
                }
                @if (punto(); as d) {
                  <button type="button" class="punto-ida" data-equivalente="botones-del-punto" [attr.data-x]="d.x" [attr.data-y]="d.y"
                          [style.left.px]="d.x" [style.top.px]="d.y" [style.z-index]="d.y + 1000" [attr.aria-label]="nombreDelPunto()"
                          (keydown)="teclaPunto($event)" (click)="$event.stopPropagation()"></button>
                }
              </div>
            </div>
            </div>
          </section>

          <!-- El panel de la derecha (EDITOR.md §4.4): «Agregar», «Detalles» y, en la sala por piezas, «Apariencia». -->
          <ng-template estudioRanura="inspector">
          <aside class="tarjeta panel" aria-label="Panel de la sala">
            @if (pestanasPanel().length > 1) {
              <div role="tablist" aria-label="Qué hacer en la sala" class="panel__pestanas" (keydown)="teclaPestanas($event)">
                @for (t of pestanasPanel(); track t.id) {
                  <button type="button" role="tab" class="panel__pestana" [id]="'pestana-' + t.id" [attr.aria-controls]="'panel-' + t.id"
                    [attr.aria-selected]="panelActivo() === t.id" [attr.tabindex]="panelActivo() === t.id ? 0 : -1"
                    [attr.data-accion]="t.accion" [class.panel__pestana--aviso]="t.id === 'detalles' && algoElegido() && panelActivo() !== 'detalles'"
                    (click)="panel.set(t.id)">{{ t.nombre }}</button>
                }
              </div>
            }

            <div [attr.role]="pestanasPanel().length > 1 ? 'tabpanel' : null" id="panel-agregar" [attr.aria-labelledby]="pestanasPanel().length > 1 ? 'pestana-agregar' : null" class="panel__hoja" [hidden]="panelActivo() !== 'agregar'">
              @if (!estrecha()) {
                @if (s.estructura && catalogoPiezas.manifiesto()) {
                  <app-panel-de-estructura parte="agregar" [sala]="s" [faltas]="faltasSala()" (agregada)="piezaAgregada($event)">
                    <app-catalogo-del-lugar [items]="catalogo()" [pestanas]="pestanas" [pestana]="pestana()" [cantidades]="cantidades()"
                      [busqueda]="busqueda()" [sinCatalogo]="sinCatalogo()" (pestanaCambio)="pestana.set($event)"
                      (busquedaCambio)="busqueda.set($event)" (agregar)="agregar($event.ref, $event.nombre)" />
                  </app-panel-de-estructura>
                } @else if (!s.estructura) {
                  <app-catalogo-del-lugar [items]="catalogo()" [pestanas]="pestanas" [pestana]="pestana()" [cantidades]="cantidades()"
                      [busqueda]="busqueda()" [sinCatalogo]="sinCatalogo()" (pestanaCambio)="pestana.set($event)"
                      (busquedaCambio)="busqueda.set($event)" (agregar)="agregar($event.ref, $event.nombre)" />
                }
              }
            </div>

            <div [attr.role]="pestanasPanel().length > 1 ? 'tabpanel' : null" id="panel-detalles" [attr.aria-labelledby]="pestanasPanel().length > 1 ? 'pestana-detalles' : null" class="panel__hoja" [hidden]="panelActivo() !== 'detalles'">
              <section aria-labelledby="detalles" class="columna-detalles">
                @if (piezaElegida(); as p) {
                  <h2 id="detalles">{{ p.nombre }}</h2>
                  <fieldset class="detalles__campos" [disabled]="estrecha()">
                  @if (p.marcaIa) {
                    <p class="marca-ia-aviso"><span class="pildora">Sugerido por la IA</span> Lo puso o lo movió el asistente; revísalo y acéptalo.</p>
                    <button type="button" class="boton" data-accion="aceptar-ia" [attr.aria-label]="'Aceptar lo sugerido: ' + p.nombre" (click)="aceptarIa(p)">Aceptar</button>
                  }
                  @if (p.tipo === 'personaje') {
                    @let pj = s.personajes[p.indice];
                    <span id="pmira" class="etiqueta">Hacia dónde mira</span>
                    <div role="radiogroup" aria-labelledby="pmira" class="segmento">
                      @for (m of miradas; track m.valor) {
                        <button type="button" role="radio" class="boton" [attr.aria-checked]="pj.mirando === m.valor"
                                (click)="mirar(p.indice, m.valor)">{{ m.nombre }}</button>
                      }
                    </div>
                    <label for="expresion" class="etiqueta">Expresión</label>
                    <div class="expresion">
                      <img class="pixel retrato" [src]="retrato(p, pj.expresion)" alt="" width="96" height="96" />
                      <select id="expresion" class="campo" [value]="pj.expresion" (change)="expresar(p.indice, $any($event.target).value)">
                        @for (e of expresiones; track e) { <option [value]="e" [selected]="e === pj.expresion">{{ nombreExpresion[e] }}</option> }
                      </select>
                    </div>
                    <p class="texto-secundario nota">Las {{ expresiones.length }} caras que tiene este personaje. El retrato cambia al elegir.</p>

                    <div class="bloque" data-accion="como-se-mueve">
                      <span id="pmueve" class="etiqueta">Cómo se mueve</span>
                      <div role="radiogroup" aria-labelledby="pmueve" class="opciones">
                        @for (m of movimientos; track m.valor) {
                          <button type="button" role="radio" class="boton" [attr.aria-checked]="tipoMostrado(p) === m.valor"
                                  (click)="elegirMovimiento(p, m.valor)">{{ m.nombre }}</button>
                        }
                      </div>
                      @if (tipoMostrado(p) === 'va-y-viene') {
                        <div role="group" aria-labelledby="phasta" class="hasta-donde">
                          <span id="phasta" class="etiqueta">Hasta dónde va</span>
                          @if (punto()) {
                            <p class="texto-secundario nota">Mueve el punto con las flechas del teclado o con estos botones, o haz clic en la sala. «Listo» lo fija.</p>
                            <div role="group" aria-label="Mover el punto" class="flechas">
                              <button type="button" class="boton" aria-label="Mover el punto a la izquierda" (click)="moverPunto(-8, 0)">←</button>
                              <button type="button" class="boton" aria-label="Mover el punto hacia arriba" (click)="moverPunto(0, -8)">↑</button>
                              <button type="button" class="boton" aria-label="Mover el punto hacia abajo" (click)="moverPunto(0, 8)">↓</button>
                              <button type="button" class="boton" aria-label="Mover el punto a la derecha" (click)="moverPunto(8, 0)">→</button>
                            </div>
                            <p role="status" class="nota aviso-punto" data-aviso-punto>{{ avisoPunto() }}</p>
                            <div class="acciones">
                              <button type="button" class="boton boton-primario" [attr.aria-disabled]="avisoPunto() !== ''" (click)="fijarPunto()">Listo</button>
                              <button type="button" class="boton" (click)="cancelarPunto(true)">Cancelar</button>
                            </div>
                          } @else {
                            <p class="texto-secundario nota">{{ textoDelPunto(p) }}</p>
                            <p role="status" class="nota aviso-punto" data-aviso-ida>{{ avisoDeIda() }}</p>
                            <button type="button" class="boton" data-ir-punto (click)="empezarPunto(p)">Elegir el punto</button>
                          }
                        </div>
                      }
                      @if (p.movimiento && typeof p.movimiento === 'object' && p.movimiento.tipo === 'ruta') {
                        <app-trayecto-de-persona [ruta]="p.movimiento" [seleccionado]="puntoDeRuta()"
                          (elegir)="puntoDeRuta.set($event)" (cambio)="cambiarRuta(p, $event)" (keydown)="teclaTrayecto($event)" />
                      }
                    </div>

                    <div class="bloque" data-accion="persona-a-atender">
                      <label class="casilla" for="patender">
                        <input id="patender" type="checkbox" data-persona-a-atender aria-describedby="patender-nota" [checked]="p.personaClave === true"
                               (change)="marcarPersonaAAtender(p, $any($event.target).checked)" />
                        Persona a atender
                      </label>
                      <p id="patender-nota" class="texto-secundario nota">El estudiante la ve señalada con una marca sobre la cabeza. Solo puede haber una por sala.</p>
                      <p role="status" class="nota" data-aviso-persona>{{ avisoPersona() }}</p>
                    </div>
                  }
                  @if (p.tipo === 'mueble') {
                    <button type="button" class="boton" (click)="store.voltearMueble(s.id, p.indice)">Voltear</button>
                  }
                  @if (p.tipo === 'objeto' && (store.caso()?.herramientas?.length ?? 0) > 0) {
                    <!-- El estudiante consigue la herramienta al revisar el objeto (el servidor la entrega por su toolCode). -->
                    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                    <label class="etiqueta" for="pentrega">Al revisarlo, entrega la herramienta</label>
                    <select id="pentrega" class="campo" data-accion="entrega-herramienta"
                            (change)="store.herramientaDeObjeto(s.id, p.indice, $any($event.target).value || null)">
                      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                      <option value="" [selected]="!s.objetos[p.indice]?.toolCode">Ninguna</option>
                      @for (h of store.caso()?.herramientas ?? []; track h.codigo) {
                        <option [value]="h.codigo" [selected]="s.objetos[p.indice]?.toolCode === h.codigo">{{ h.nombre }}</option>
                      }
                    </select>
                  }
                  </fieldset>
                  @if (!estrecha()) {
                    <span id="pmov" class="etiqueta">Mover</span>
                    <div role="group" aria-labelledby="pmov" class="flechas">
                      <button type="button" class="boton" aria-label="Mover a la izquierda" (click)="desplazar(p, -8, 0)">←</button>
                      <button type="button" class="boton" aria-label="Mover hacia arriba" (click)="desplazar(p, 0, -8)">↑</button>
                      <button type="button" class="boton" aria-label="Mover hacia abajo" (click)="desplazar(p, 0, 8)">↓</button>
                      <button type="button" class="boton" aria-label="Mover a la derecha" (click)="desplazar(p, 8, 0)">→</button>
                    </div>
                    <button type="button" class="boton boton-texto quitar" (click)="quitar(p)">Quitar de la sala</button>
                  }
                } @else if (puertaElegida(); as idPuerta) {
                  <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                  <h2 id="detalles">{{ nombreDePuerta(idPuerta) }}</h2>
                  <fieldset class="detalles__campos" [disabled]="estrecha()">
                    <app-panel-de-estructura parte="puerta" [sala]="s" [puertaElegida]="idPuerta" [faltas]="faltasSala()" />
                  </fieldset>
                  @if (!estrecha()) {
                    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                    <p class="texto-secundario nota">Muévela arrastrando o con las flechas del teclado. <kbd>Supr</kbd> la quita.</p>
                  }
                } @else if (piezaDeMuro(); as nombre) {
                  <h2 id="detalles">{{ nombre }}</h2>
                  @if (!estrecha()) {
                    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                    <p class="texto-secundario nota">Muévela arrastrando o con las flechas del teclado; en la esquina pasa al otro muro. <kbd>Supr</kbd> la quita.</p>
                  }
                } @else {
                  <h2 id="detalles">Nada elegido</h2>
                  <p class="texto-secundario">Elige algo en la sala o en la lista «En esta sala».</p>
                }
              </section>
            </div>

            @if (s.estructura && catalogoPiezas.manifiesto() && !estrecha()) {
              <div [attr.role]="pestanasPanel().length > 1 ? 'tabpanel' : null" id="panel-apariencia" [attr.aria-labelledby]="pestanasPanel().length > 1 ? 'pestana-apariencia' : null" class="panel__hoja" [hidden]="panelActivo() !== 'apariencia'">
                <app-panel-de-estructura parte="apariencia" [sala]="s" />
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <p class="texto-secundario nota">El ancho de la sala se cambia con la manija del borde derecho del lienzo.</p>
              </div>
            }
          </aside>
          </ng-template>
        </div>
      </div>

    } @else {
      <div class="pagina">
        <h1>Esta sala no está en el caso</h1>
        <a [routerLink]="rutas.a('/editor')" class="boton">Volver al caso</a>
      </div>
    }
  `,
  styleUrl: './sala.component.scss',
})
export class SalaComponent {
  protected readonly rutas = inject(RutasAutoria);
  private readonly dialogo = inject(UiDialog);
  private readonly injector = inject(Injector);
  readonly salaId = input.required<string>();

  protected readonly store = inject(CasoStore);
  protected get catalogoPiezas(): CatalogoDePiezas { return this.injector.get(CatalogoDePiezas); }
  protected readonly salaLienzo = computed(() => {
    const sala = this.sala();
    return sala ? salaParaLienzo(sala) : null;
  });
  protected readonly actoresLienzo = computed(() => {
    const sala = this.sala();
    return sala ? actoresDeSala(sala, this.store.caso() ?? undefined) : [];
  });
  protected readonly piezaDeMuroElegida = signal<string | null>(null);
  protected readonly puertaElegida = computed(() => this.sala()?.puertas.find(p =>
    anclaDeElemento(this.salaId(), { tipo: 'puerta', id: p.id }) === this.piezaDeMuroElegida())?.id ?? null);
  /** Una pieza de muro elegida que no es puerta: su nombre, para «Detalles». */
  protected readonly piezaDeMuro = computed(() => {
    const id = this.piezaDeMuroElegida(), sala = this.sala();
    if (!id || !sala?.estructura || this.puertaElegida()) return null;
    const pieza = (sala.estructura.piezas ?? []).find(p => p.id && anclaDeElemento(sala.id, { tipo: 'pieza', id: p.id }) === id);
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    return pieza ? this.catalogoPiezas.manifiesto()?.piezas[`${pieza.tipo}/${pieza.modelo}`]?.nombre ?? 'Pieza del muro' : null;
  });
  protected readonly algoElegido = computed(() => this.elegida() !== null || this.piezaDeMuroElegida() !== null);
  /** Las pestañas de esta sala en este ancho: en una pantalla angosta solo se mira («Detalles»). */
  protected readonly pestanasPanel = computed(() => {
    const s = this.sala();
    if (this.estrecha()) return [{ id: 'detalles' as const, nombre: 'Detalles', accion: 'quitar-elemento' }];
    return [
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      { id: 'agregar' as const, nombre: 'Agregar', accion: 'agregar-mueble' },
      { id: 'detalles' as const, nombre: 'Detalles', accion: 'quitar-elemento' },
      ...(s?.estructura && this.catalogoPiezas.manifiesto() ? [{ id: 'apariencia' as const, nombre: 'Aspecto', accion: null }] : []),
    ];
  });
  protected readonly panelActivo = computed<PestanaPanel>(() => {
    const ids = this.pestanasPanel().map(t => t.id) as PestanaPanel[];
    return ids.includes(this.panel()) ? this.panel() : ids[0];
  });
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  protected readonly masAcciones: UiMenuItem[] = [{ value: 'original', label: 'Volver a la sala original', icon: 'restart_alt' }];
  protected readonly plan = signal<PlanDeSala | null>(null);
  protected readonly escalaPiezas = signal<1 | 2>(1);
  /** Ancho de la columna de la sala en pantalla (lo mide un ResizeObserver; 0 hasta medirlo). */
  private readonly disponible = signal(0);
  /** Alto del marco del lienzo (0 hasta medirlo o cuando la página se desplaza, en pantallas angostas). */
  private readonly disponibleAlto = signal(0);
  /** Pantalla de menos de 1024 px: la sala se mira y se eligen cosas, pero no se mueve ni se agrega nada. */
  protected readonly estrecha = signal(false);
  /** La pestaña que pidió la docente; `panelActivo` la corrige si no existe en esta sala o en este ancho. */
  protected readonly panel = signal<PestanaPanel>('agregar');
  /** Tras agregar una pieza de muro se queda en «Agregar»: así se ponen varias seguidas. */
  private quedarseEnAgregar = false;
  /**
   * La escala a la que se ve una sala por piezas: entera en la columna (una sala de 1200 o 1920 px se ve completa a 1366 y a
   * 1920, sin desplazarse), nunca más grande que 1:1; con «×2» (salas de hasta 960) se ve al doble y la columna se desplaza.
   */
  protected readonly escalaLienzo = computed(() => {
    const ancho = this.sala()?.estructura?.ancho;
    if (!ancho) return 1;
    // Solo mirar (menos de 1024 px): la sala entera a la vista. Nada se arrastra, y elegir tiene su equivalente de 44 px en
    // la lista «En esta sala» (WCAG 2.5.8, excepción por equivalente), así que no hace falta el piso de ×0,8 de edición.
    if (this.estrecha() && this.escalaPiezas() === 1 && this.disponible() > 0) return Math.min(1, this.disponible() / ancho);
    // En escritorio la sala encaja también en el alto del marco: se pasa el ancho que deja ese alto si es el menor.
    // En una columna de teléfono, no menos de ×0,8: la sala se desplaza en su columna y las piezas no se pisan (WCAG 2.5.8).
    const alto = this.estrecha() ? 0 : this.disponibleAlto();
    const disponible = alto > 0 && this.disponible() > 0 ? Math.min(this.disponible(), (alto * ancho) / ALTO_SALA) : this.disponible();
    return escalaDeSala(ancho, disponible, this.escalaPiezas() === 2);
  });
  protected readonly faltas = signal(new Map<string, FaltaDeSala[]>());
  protected readonly faltasSala = computed(() => this.faltas().get(this.salaId()) ?? []);
  protected readonly puertasPendientes = computed(() => {
    const ids = this.store.puertasSinGuardar().get(this.salaId()) ?? [];
    return (this.sala()?.puertas ?? []).filter(p => ids.includes(p.id));
  });
  protected anclaPuerta(id: string): string { return anclaDeElemento(this.salaId(), { tipo: 'puerta', id }); }

  protected readonly clavesObjetos = computed(() => {
    const sala = this.sala(), caso = this.store.caso();
    const claves = new Map<string, string>(), usadas = new Set<string>();
    if (!sala || !caso) return claves;
    sala.muebles.forEach((m, i) => {
      if (caso.catalogo.muebles.some(f => f.id === m.ref)) claves.set(`mueble-${i}`, claveDeNuevo(m.clave, m.ref, usadas));
    });
    sala.objetos.forEach((o, i) => {
      if (caso.catalogo.objetos.some(f => f.id === o.ref)) claves.set(`objeto-${i}`, claveDeNuevo(o.clave, o.ref, usadas));
    });
    sala.personajes.forEach((p, i) => claves.set(`personaje-${i}`, claveDeNuevo(p.clave, p.ref, usadas)));
    return claves;
  });
  protected idObjeto(p: Pieza): string | null {
    const id = this.clavesObjetos().get(p.clave);
    return id ? anclaDeElemento(this.salaId(), { tipo: 'objeto', id }) : null;
  }
  protected irAFalta(falta: FaltaDeSala): void {
    document.getElementById(anclaDeElemento(this.salaId(), falta.elemento))?.focus();
  }
  protected readonly ancho = ANCHO_SALA;
  protected readonly alto = ALTO_SALA;
  protected readonly expresiones = EXPRESIONES;
  protected readonly nombreExpresion = NOMBRE_EXPRESION;
  protected readonly miradas: { valor: Mirando; nombre: string }[] = [
    { valor: 'izquierda', nombre: 'Izquierda' },
    { valor: 'derecha', nombre: 'Derecha' },
  ];
  protected readonly textoPersonaAAtender = TEXTO_PERSONA_A_ATENDER;
  protected readonly movimientos: { valor: 'quieto' | 'deambula' | 'va-y-viene' | 'ruta'; nombre: string }[] = [
    { valor: 'quieto', nombre: NOMBRE_MOVIMIENTO['quieto'] },
    { valor: 'deambula', nombre: NOMBRE_MOVIMIENTO['deambula'] },
    { valor: 'va-y-viene', nombre: NOMBRE_MOVIMIENTO['va-y-viene'] },
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    { valor: 'ruta', nombre: 'Recorre un trayecto' },
  ];
  protected readonly pestanas: { tipo: TipoElemento; nombre: string }[] = [
    { tipo: 'mueble', nombre: 'Muebles' },
    { tipo: 'objeto', nombre: 'Objetos' },
    { tipo: 'personaje', nombre: 'Personajes' },
  ];

  protected readonly elegida = signal<string | null>(null);
  /** La cosa de la lista «En esta sala» en la que está el cursor o el foco: se señala en la sala. Esc la suelta. */
  protected readonly atencion = signal<string | null>(null);
  protected readonly anuncio = signal('');
  protected readonly pestana = signal<TipoElemento>('mueble');
  protected readonly busqueda = signal('');
  /** La persona que se eligió «Va y viene» y aún no tiene su punto (su movimiento guardado no cambia hasta fijarlo). */
  protected readonly pendiente = signal<string | null>(null);
  /** El punto que se está eligiendo (aún sin fijar); `null` si no se está eligiendo ninguno. */
  protected readonly punto = signal<Punto | null>(null);
  protected readonly puntoDeRuta = signal<number | null>(null);
  protected readonly avisoPersona = signal('');
  protected readonly escala = signal(1);
  private readonly arrastre = signal<{ clave: string; x: number; y: number; movio: boolean } | null>(null);
  private readonly escenario = viewChild<ElementRef<HTMLElement>>('escenario');

  protected readonly sala = computed(() => this.store.caso()?.salas.find((s) => s.id === this.salaId()) ?? null);

  protected readonly piezas = computed<Pieza[]>(() => {
    const caso = this.store.caso();
    const s = this.sala();
    if (!caso || !s) return [];
    const nombreMueble = (ref: string) => caso.catalogo.muebles.find((m) => m.id === ref);
    const nombreObjeto = (ref: string) => caso.catalogo.objetos.find((o) => o.id === ref);
    const contar = new Map<string, number>();
    const etiqueta = (nombre: string, total: number) => {
      const n = (contar.get(nombre) ?? 0) + 1;
      contar.set(nombre, n);
      return total > 1 ? `${nombre} ${n}` : nombre;
    };
    const veces = (lista: { ref: string }[], ref: string) => lista.filter((x) => x.ref === ref).length;
    // Solo en la sala por piezas: el lienzo dibuja la pieza de la biblioteca (como el juego) y el botón mide su cuadro.
    const manifiesto = s.estructura ? this.catalogoPiezas.manifiesto() : null;
    const cuadroDe = (arte: string) => {
      const pieza = manifiesto ? piezaDelObjeto(arte, manifiesto) : null;
      return pieza ? { ancho: pieza.ficha.ancho, alto: pieza.ficha.alto } : undefined;
    };
    return [
      ...s.muebles.map((m, i) => {
        const c = nombreMueble(m.ref);
        const arte = rutaArte(caso.lugarId, c?.arte ?? '');
        return { clave: `mueble-${i}`, tipo: 'mueble' as const, indice: i, nombre: etiqueta(c?.nombre ?? m.ref, veces(s.muebles, m.ref)),
          x: m.x, y: m.y, arte, cuadro: cuadroDe(arte), espejo: !!m.espejo, marcaIa: m.marcaIa === true };
      }),
      ...s.objetos.map((o, i) => {
        const c = nombreObjeto(o.ref);
        const arte = rutaArte(caso.lugarId, c?.arte ?? '');
        return { clave: `objeto-${i}`, tipo: 'objeto' as const, indice: i, nombre: etiqueta(c?.nombre ?? o.ref, veces(s.objetos, o.ref)),
          x: o.x, y: o.y, arte, cuadro: cuadroDe(arte), espejo: false, marcaIa: o.marcaIa === true };
      }),
      ...s.personajes.map((p, i) => {
        const c = caso.personajes.find((x) => x.id === p.ref);
        return { clave: `personaje-${i}`, tipo: 'personaje' as const, indice: i, nombre: etiqueta(c?.nombre ?? p.ref, veces(s.personajes, p.ref)),
          x: p.x, y: p.y, arte: '', espejo: false,
          sprite: { url: rutaSpriteKit(c?.recipeId ?? p.ref), fila: p.mirando === 'izquierda' ? 1 : 2 },
          movimiento: p.movimiento ?? 'quieto', personaClave: p.personaClave === true, marcaIa: p.marcaIa === true };
      }),
    ];
  });

  protected readonly piezasOrdenadas = computed(() => [...this.piezas()].sort((a, b) => a.y - b.y));
  protected readonly piezaElegida = computed(() => this.piezas().find((p) => p.clave === this.elegida()) ?? null);
  protected readonly grupos = computed(() => [
    { titulo: 'Muebles', piezas: this.piezas().filter((p) => p.tipo === 'mueble') },
    { titulo: 'Personajes', piezas: this.piezas().filter((p) => p.tipo === 'personaje') },
    { titulo: 'Objetos', piezas: this.piezas().filter((p) => p.tipo === 'objeto') },
  ]);

  /** Por qué no hay piezas que agregar: un caso sin lugar no tiene catálogo, pero sus salas se siguen editando. */
  protected readonly sinCatalogo = computed(() =>
    this.store.caso()?.lugarId
      ? 'El lugar no tiene piezas de este tipo.'
      : 'Este caso no viene de un lugar de la biblioteca, así que no hay piezas para agregar. Puedes mover, quitar y cambiar lo que ya está en la sala.');

  protected readonly catalogo = computed(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const q = this.busqueda().trim().toLowerCase();
    const tipo = this.pestana();
    const items =
      tipo === 'mueble' ? caso.catalogo.muebles.map((m) => ({ ref: m.id, nombre: m.nombre, arte: rutaArte(caso.lugarId, m.arte) }))
      : tipo === 'objeto' ? caso.catalogo.objetos.map((o) => ({ ref: o.id, nombre: o.nombre, arte: rutaArte(caso.lugarId, o.arte) }))
      : caso.personajes.map((p) => ({ ref: p.id, nombre: p.nombre, arte: rutaRetrato(p.recipeId, 'neutral') }));
    return items.filter((i) => !q || i.nombre.toLowerCase().includes(q));
  });

  /** Las líneas y marcas de «va y viene» de las personas de la sala, con la ida donde están hoy. */
  protected readonly trazos = computed(() =>
    this.piezas().flatMap((p) => {
      const m = p.movimiento;
      return p.tipo === 'personaje' && m !== undefined && typeof m !== 'string' && m.tipo === 'va-y-viene'
        ? [{ clave: p.clave, desde: { x: p.x, y: p.y }, hasta: m.hasta }] : [];
    }));

  protected readonly trayectos = computed(() => this.piezas().flatMap(p => {
    const m = p.movimiento;
    if (p.tipo !== 'personaje' || !m || typeof m === 'string' || m.tipo !== 'ruta') return [];
    const inicio = { x: p.x, y: p.y };
    const puntos = [inicio, ...m.puntos, ...(m.modo === 'circuito' ? [inicio] : [])];
    return [{ clave: p.clave, inicio, puntos: m.puntos, linea: puntos.map(q => `${q.x},${q.y}`).join(' ') }];
  }));

  /** La línea hasta el punto que se está eligiendo. */
  protected readonly lineaDelBorrador = computed(() => {
    const d = this.punto();
    const p = this.piezaElegida();
    return d && p ? { desde: { x: p.x, y: p.y }, hasta: d } : null;
  });

  /** Por qué el punto elegido no sirve, o vacío si sirve. */
  protected readonly avisoPunto = computed(() => {
    const d = this.punto();
    const p = this.piezaElegida();
    const caso = this.store.caso();
    const s = this.sala();
    if (!d || !p || !caso || !s) return '';
    const revisado = revisarPuntoDeIda(s, caso.catalogo, p, d);
    return revisado.ok ? '' : revisado.motivo;
  });

  /** Si el punto ya fijado dejó de servir porque algo se movió (un mueble encima, la persona muy cerca), lo dice; vacío si sirve. */
  protected readonly avisoDeIda = computed(() => {
    const p = this.piezaElegida();
    const caso = this.store.caso();
    const s = this.sala();
    if (!p || !caso || !s || (typeof p.movimiento !== 'object' || p.movimiento.tipo !== 'va-y-viene') || this.punto()) return '';
    const revisado = revisarPuntoDeIda(s, caso.catalogo, p, p.movimiento.hasta);
    return revisado.ok ? '' : `El punto ya no sirve: ${revisado.motivo}`;
  });

  protected readonly nombreDelPunto = computed(() => {
    const p = this.piezaElegida();
    return `Punto hasta donde va y viene ${p?.nombre ?? 'la persona'}. Muévelo con las flechas del teclado, Enter lo fija y Esc cancela.`;
  });

  protected rombo(c: Punto): string {
    return `M ${c.x} ${c.y - 10} L ${c.x + 10} ${c.y} L ${c.x} ${c.y + 10} L ${c.x - 10} ${c.y} Z`;
  }

  protected soltarAtencion(clave: string): void {
    if (this.atencion() === clave) this.atencion.set(null);
  }

  constructor() {
    effect(() => { if ((this.sala()?.estructura?.ancho ?? 0) > 960) this.escalaPiezas.set(1); });
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      if (!this.sala()?.estructura) {
        clearTimeout(temporizador); temporizador = undefined; this.faltas.set(new Map()); return;
      }
      const caso = this.store.caso(), reglas = this.catalogoPiezas.reglas(), error = this.catalogoPiezas.error();
      if (!caso || !reglas || error) {
        clearTimeout(temporizador); temporizador = undefined; this.faltas.set(new Map()); return;
      }
      if (temporizador) return;
      temporizador = setTimeout(() => {
        temporizador = undefined;
        const actual = this.store.caso(), catalogo = this.catalogoPiezas.reglas();
        if (this.sala()?.estructura && actual && catalogo && !this.catalogoPiezas.error()) this.faltas.set(faltasPorSala(actual, catalogo));
      }, 100);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(temporizador));
    // Por debajo de 1024 px la sala es de solo mirar; se sigue el ancho en vivo (girar la tableta, el zoom al 200 %).
    if (typeof matchMedia === 'function') {
      const consulta = matchMedia(CONSULTA_ESTRECHA);
      this.estrecha.set(consulta.matches);
      const cambio = (e: MediaQueryListEvent) => this.estrecha.set(e.matches);
      consulta.addEventListener?.('change', cambio);
      inject(DestroyRef).onDestroy(() => consulta.removeEventListener?.('change', cambio));
    }
    // Lo que se está decidiendo de una persona (el punto, el aviso) no pasa a la siguiente cosa que se elige.
    effect(() => {
      this.elegida();
      untracked(() => {
        this.pendiente.set(null);
        this.punto.set(null);
        this.avisoPersona.set('');
      });
    });
    // Se mide cuando aparece el lienzo (al recargar, el caso llega después del primer pintado). La sala por piezas tiene el
    // ancho de su escala: para encajarla se mide la columna que la contiene.
    effect((alLimpiar) => {
      const el = this.escenario()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const columna = el.parentElement;
      const medir = () => {
        this.escala.set(el.clientWidth / ANCHO_SALA || 1);
        if (!columna) return;
        // El marco del lienzo tiene relleno: lo que cabe es su caja de contenido.
        const estilo = getComputedStyle(columna);
        const horizontal = (parseFloat(estilo.paddingLeft) || 0) + (parseFloat(estilo.paddingRight) || 0);
        const vertical = (parseFloat(estilo.paddingTop) || 0) + (parseFloat(estilo.paddingBottom) || 0);
        this.disponible.set(columna.clientWidth > 0 ? Math.max(0, columna.clientWidth - horizontal) : 0);
        this.disponibleAlto.set(columna.clientHeight > 0 ? Math.max(0, columna.clientHeight - vertical) : 0);
      };
      medir();
      const observador = new ResizeObserver(medir);
      observador.observe(el);
      if (columna) observador.observe(columna);
      alLimpiar(() => observador.disconnect());
    });
  }

  protected encuadre(s: SalaCaso): string {
    return ENCUADRE_LEGIBLE[s.encuadre];
  }

  protected arte(relativa: string): string {
    return rutaArte(this.store.caso()!.lugarId, relativa);
  }

  protected retrato(p: Pieza, expresion: Expresion): string {
    return p.sprite!.url.replace('idle.png', `portrait-${expresion}.png`);
  }

  /** Cuántas piezas de cada tipo tiene el catálogo del caso (las cuentas de las pestañas del catálogo). */
  protected readonly cantidades = computed(() => ({
    mueble: this.cantidad('mueble'), objeto: this.cantidad('objeto'), personaje: this.cantidad('personaje'),
  }) as Record<TipoElemento, number>);

  protected cantidad(tipo: TipoElemento): number {
    const caso = this.store.caso();
    if (!caso) return 0;
    return tipo === 'mueble' ? caso.catalogo.muebles.length : tipo === 'objeto' ? caso.catalogo.objetos.length : caso.personajes.length;
  }

  /** Posición dibujada: la guardada, o la del arrastre en curso. */
  protected posicion(p: Pieza): { x: number; y: number } {
    const a = this.arrastre();
    return a && a.clave === p.clave ? { x: a.x, y: a.y } : { x: p.x, y: p.y };
  }

  /** La opción de la lista que recibe el Tab: la elegida si está en la lista, o la primera. */
  protected readonly itinerante = computed(() => {
    const claves = this.grupos().flatMap((g) => g.piezas.map((p) => p.clave));
    const elegida = this.elegida();
    return elegida !== null && claves.includes(elegida) ? elegida : (claves[0] ?? null);
  });

  /** Flechas, Inicio y Fin en la lista «En esta sala»: mueven el foco a otra opción y la eligen (la selección sigue al foco). */
  protected recorrerLista(evento: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(evento.key)) return;
    const lista = evento.currentTarget as HTMLElement;
    const opciones = [...lista.querySelectorAll<HTMLElement>('[role="option"]')];
    if (!opciones.length) return;
    evento.preventDefault();
    const actual = opciones.indexOf(document.activeElement as HTMLElement);
    const destino = evento.key === 'Home' ? 0
      : evento.key === 'End' ? opciones.length - 1
        : Math.min(opciones.length - 1, Math.max(0, actual + (evento.key === 'ArrowDown' ? 1 : -1)));
    const opcion = opciones[destino];
    const clave = opcion.dataset['clave'];
    if (clave) this.elegir(clave);
    opcion.focus();
  }

  protected elegir(clave: string): void {
    if (clave !== this.elegida()) this.puntoDeRuta.set(null);
    this.elegida.set(clave);
    this.soltarMuro();
    this.panel.set('detalles');
    const p = this.piezas().find((x) => x.clave === clave);
    if (p) this.anuncio.set(`Elegido: ${p.nombre}.`);
  }

  /** Da por revisado lo que el asistente puso o movió: la marca baja y el foco queda en la pieza. */
  protected aceptarIa(p: Pieza): void {
    this.store.aceptarIa({ salaId: this.salaId(), tipo: p.tipo, indice: p.indice });
    this.anuncio.set(`Aceptado: ${p.nombre}.`);
    setTimeout(() => this.escenario()?.nativeElement.querySelector<HTMLElement>(`[data-elemento="${p.clave}"]`)?.focus());
  }

  protected desplazar(p: Pieza, dx: number, dy: number): void {
    this.store.moverElemento(this.salaId(), p.tipo, p.indice, p.x + dx, p.y + dy);
  }

  /**
   * Quita la pieza de la sala. Si es la última persona y al quitarla alguna escena de la sala se queda con respuestas que nada
   * ofrece (ni otra persona ni un objeto del mapa), antes se pregunta: el estudiante no podría responder.
   */
  protected async quitar(p: Pieza): Promise<void> {
    const afectadas = p.tipo === 'personaje' && this.sala()!.personajes.length === 1 ? this.escenasConRespuestasSinForma() : [];
    if (afectadas.length > 0) {
      const titulos = afectadas.map((t) => `«${t}»`).join(', ');
      const respuesta = await this.dialogo.consequence({
        title: 'Esta sala se quedaría sin personas',
        consequence: `Si quitas a ${p.nombre}, ${afectadas.length === 1 ? `la escena ${titulos} se queda` : `las escenas ${titulos} se quedan`} `
          + 'sin nadie con quien hablar: el estudiante no podrá responder. Puedes agregar otra persona después.',
        continueLabel: 'Dejarla en la sala',
        proceedLabel: 'Quitarla de todos modos',
      });
      if (respuesta !== 'proceed') return;
    }
    this.store.quitarElemento(this.salaId(), p.tipo, p.indice);
    this.elegida.set(null);
    this.anuncio.set(`${p.nombre} se quitó de la sala. Ctrl+Z lo devuelve.`);
    this.escenario()?.nativeElement.focus();
  }

  /** Los títulos de las escenas de esta sala que, sin personas, se quedarían con respuestas que nada ofrece. */
  private escenasConRespuestasSinForma(): string[] {
    const sala = this.sala();
    if (!sala) return [];
    const sinPersonas = { ...sala, personajes: [] };
    return (this.store.caso()?.escenas ?? [])
      .filter((e) => e.salaId === sala.id && respuestasSinForma(e, sinPersonas).length > 0)
      .map((e) => e.titulo);
  }

  protected agregar(ref: string, nombre: string): void {
    const tipo = this.pestana();
    this.store.agregarElemento(this.salaId(), tipo, ref);
    const indice = (tipo === 'mueble' ? this.sala()!.muebles : tipo === 'objeto' ? this.sala()!.objetos : this.sala()!.personajes).length - 1;
    this.elegir(`${tipo}-${indice}`);
    // Lo agregado queda elegido (su pestaña lo señala), pero el catálogo sigue a la vista para agregar otra cosa.
    this.panel.set('agregar');
    this.anuncio.set(`${nombre} se agregó en el centro de la sala.`);
  }

  protected mirar(indice: number, mirando: Mirando): void {
    this.store.editarPersonajeEnSala(this.salaId(), indice, { mirando });
  }

  protected expresar(indice: number, expresion: Expresion): void {
    this.store.editarPersonajeEnSala(this.salaId(), indice, { expresion });
  }

  // ── Cómo se mueve ──────────────────────────────────────────────────────────

  /** El tipo que muestran las opciones: el guardado o, si se eligió «Va y viene» y falta el punto, ese. */
  protected tipoMostrado(p: Pieza): 'quieto' | 'deambula' | 'va-y-viene' | 'ruta' {
    return this.pendiente() === p.clave ? 'va-y-viene' : tipoDeMovimiento(p.movimiento ?? 'quieto');
  }

  protected textoDelPunto(p: Pieza): string {
    return typeof p.movimiento === 'object' ? 'Va y viene hasta la marca de la sala.' : 'Todavía no elegiste el punto.';
  }

  protected elegirMovimiento(p: Pieza, tipo: 'quieto' | 'deambula' | 'va-y-viene' | 'ruta'): void {
    this.cancelarPunto(false);
    this.puntoDeRuta.set(null);
    if (tipo === 'ruta') {
      if (tipoDeMovimiento(p.movimiento ?? 'quieto') !== 'ruta') {
        const punto = this.puntoInicial(p);
        this.store.fijarMovimiento(this.salaId(), p.indice, { tipo: 'ruta', puntos: [punto, { ...punto }], modo: 'ida-y-vuelta' });
      }
      return;
    }
    if (tipo === 'va-y-viene') {
      if (tipoDeMovimiento(p.movimiento ?? 'quieto') !== 'va-y-viene') {
        this.pendiente.set(p.clave);
        this.anuncio.set('Elige hasta dónde va y viene con «Elegir el punto».');
      }
      return;
    }
    this.pendiente.set(null);
    this.store.fijarMovimiento(this.salaId(), p.indice, tipo);
    this.anuncio.set(`${p.nombre}: ${NOMBRE_MOVIMIENTO[tipo].toLowerCase()}.`);
  }

  protected cambiarRuta(p: Pieza, ruta: Extract<MovimientoPersonaje, { tipo: 'ruta' }>): void {
    this.store.fijarMovimiento(this.salaId(), p.indice, ruta);
    if ((this.puntoDeRuta() ?? -1) >= ruta.puntos.length) this.puntoDeRuta.set(null);
  }

  /** Un punto para empezar: el que ya tenía o uno libre a un lado de la persona. */
  private puntoInicial(p: Pieza): Punto {
    if (typeof p.movimiento === 'object' && p.movimiento.tipo === 'va-y-viene') return { ...p.movimiento.hasta };
    const caso = this.store.caso();
    const s = this.sala();
    const zona = zonaCaminable(s!.encuadre);
    const candidatos = DISTANCIAS_INICIALES.map((dx) => limitarAZona(zona, p.x + dx, p.y));
    const libre = caso ? candidatos.find((c) => revisarPuntoDeIda(s!, caso.catalogo, p, c).ok) : undefined;
    return libre ?? candidatos[0];
  }

  protected empezarPunto(p: Pieza): void {
    this.punto.set(this.puntoInicial(p));
    this.anuncio.set('Mueve el punto con las flechas del teclado y pulsa Enter, o haz clic en la sala. «Listo» lo fija.');
    afterNextRender(() => this.escenario()?.nativeElement.querySelector<HTMLElement>('.punto-ida')?.focus(), { injector: this.injector });
  }

  protected moverPunto(dx: number, dy: number): void {
    const actual = this.punto();
    const s = this.sala();
    if (!actual || !s) return;
    this.punto.set(limitarAZona(zonaCaminable(s.encuadre), actual.x + dx, actual.y + dy));
  }

  protected teclaPunto(evento: KeyboardEvent): void {
    if (evento.ctrlKey || evento.metaKey) return;
    const paso = evento.shiftKey ? PASO_CHICO : PASO_GRANDE;
    const mover: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso],
    };
    if (mover[evento.key]) {
      evento.preventDefault();
      evento.stopPropagation();
      this.moverPunto(...mover[evento.key]);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      evento.stopPropagation();
      this.fijarPunto();
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      evento.stopPropagation();
      this.cancelarPunto(true);
    }
  }

  /** Un clic en la sala, mientras se elige el punto, lo pone ahí (dentro de la zona por donde se camina). */
  protected clicEnSala(evento: MouseEvent): void {
    const s = this.sala();
    const indice = this.puntoDeRuta(), p = this.piezaElegida();
    if (s && indice !== null && p && typeof p.movimiento === 'object' && p.movimiento.tipo === 'ruta') {
      if ((evento.target as HTMLElement | null)?.closest('.pieza, .punto-ida')) return;
      const donde = this.aSala(evento);
      const punto = limitarAZona(zonaCaminable(s.encuadre, s.estructura?.ancho), donde.x, donde.y);
      this.cambiarRuta(p, { ...p.movimiento, puntos: p.movimiento.puntos.map((v, i) => i === indice ? punto : v) });
      return;
    }
    if (!this.punto() || !s) return;
    if ((evento.target as HTMLElement | null)?.closest('.pieza, .punto-ida')) return;
    const donde = this.aSala(evento);
    this.punto.set(limitarAZona(zonaCaminable(s.encuadre), donde.x, donde.y));
  }

  /** «Listo»: fija el punto. Si cae en un mueble o fuera de la sala, no se fija y se sigue eligiendo. */
  protected fijarPunto(): void {
    const d = this.punto();
    const p = this.piezaElegida();
    if (!d || !p) return;
    const resultado = this.store.fijarMovimiento(this.salaId(), p.indice, { tipo: 'va-y-viene', hasta: d });
    if (!resultado.ok) {
      this.anuncio.set(resultado.motivo);
      return;
    }
    this.punto.set(null);
    this.pendiente.set(null);
    this.anuncio.set(`${p.nombre} va y viene hasta el punto elegido. Ctrl+Z lo deshace.`);
    afterNextRender(() => this.escenario()?.nativeElement.ownerDocument.querySelector<HTMLElement>('[data-ir-punto]')?.focus(), { injector: this.injector });
  }

  /** Deja de elegir el punto sin cambiar nada; con `devolverElFoco` el foco vuelve a «Elegir el punto». */
  protected cancelarPunto(devolverElFoco: boolean): void {
    if (this.punto() === null) return;
    this.punto.set(null);
    this.anuncio.set('No se cambió el punto.');
    if (devolverElFoco) {
      afterNextRender(() => this.escenario()?.nativeElement.ownerDocument.querySelector<HTMLElement>('[data-ir-punto]')?.focus(), { injector: this.injector });
    }
  }

  // ── Persona a atender ──────────────────────────────────────────────────────

  protected marcarPersonaAAtender(p: Pieza, marcada: boolean): void {
    const anterior = this.store.marcarPersonaAAtender(this.salaId(), p.indice, marcada);
    this.avisoPersona.set(marcada
      ? `Ahora la persona a atender es ${p.nombre}.${anterior ? ` ${anterior} dejó de serlo.` : ''}`
      : 'Esta sala ya no tiene persona a atender.');
  }

  private readonly capaDePiezas = viewChild<PiezasDelMuroComponent>('capaDePiezas');

  protected seleccionarPieza(id: string): void {
    afterNextRender(() => this.capaDePiezas()?.seleccionar(id), { injector: this.injector });
  }

  /** Una pieza de muro recién agregada desde el panel: queda elegida y el panel sigue en «Agregar». */
  protected piezaAgregada(id: string): void {
    this.quedarseEnAgregar = true;
    this.seleccionarPieza(id);
  }

  /** La capa de piezas del muro eligió (o soltó) una pieza: lo elegido en la lista se suelta y se muestran sus detalles. */
  protected alElegirEnMuro(id: string | null): void {
    this.piezaDeMuroElegida.set(id);
    if (id) {
      this.elegida.set(null);
      if (!this.quedarseEnAgregar) this.panel.set('detalles');
    }
    this.quedarseEnAgregar = false;
  }

  private soltarMuro(): void {
    if (this.piezaDeMuroElegida() === null) return;
    this.piezaDeMuroElegida.set(null);
    this.capaDePiezas()?.soltar();
  }

  protected nombreDePuerta(id: string): string {
    const puerta = this.sala()?.puertas.find(p => p.id === id);
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    return puerta?.etiqueta ? `Puerta: ${puerta.etiqueta}` : 'Puerta';
  }

  /** Flechas, Inicio y Fin entre las pestañas del panel (patrón de pestañas de ARIA: el foco y la pestaña van juntos). */
  protected teclaPestanas(evento: KeyboardEvent): void {
    const ids = this.pestanasPanel().map(t => t.id) as PestanaPanel[];
    const actual = ids.indexOf(this.panelActivo());
    const destino = evento.key === 'ArrowRight' ? (actual + 1) % ids.length : evento.key === 'ArrowLeft' ? (actual - 1 + ids.length) % ids.length
      : evento.key === 'Home' ? 0 : evento.key === 'End' ? ids.length - 1 : -1;
    if (destino < 0) return;
    evento.preventDefault();
    this.panel.set(ids[destino]);
    (evento.currentTarget as HTMLElement).querySelector<HTMLElement>(`#pestana-${ids[destino]}`)?.focus();
  }

  protected alElegirMas(valor: string | undefined): void {
    if (valor === 'original') void this.volverOriginal();
  }


  protected cambiarAncho(ancho: number): void {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.store.cambiarEstructura(this.salaId(), 'Cambiaste el ancho de la sala', e => { e.ancho = ancho; });
    if (ancho > 960) this.escalaPiezas.set(1);
  }

  protected async volverOriginal(): Promise<void> {
    await this.store.volverSalaOriginal(this.salaId());
    this.elegida.set(null);
    this.anuncio.set('La sala volvió a como viene en el lugar. Ctrl+Z lo deshace.');
  }

  protected teclaPieza(evento: KeyboardEvent, p: Pieza): void {
    if (this.estrecha()) return;
    const paso = evento.shiftKey ? 1 : 8;
    const mover: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso],
    };
    if (mover[evento.key]) {
      evento.preventDefault();
      evento.stopPropagation();
      if (this.elegida() !== p.clave) this.elegir(p.clave);
      const actual = this.piezas().find((x) => x.clave === p.clave) ?? p;
      this.desplazar(actual, ...mover[evento.key]);
    } else if (evento.key === 'Delete' || evento.key === 'Supr') {
      evento.preventDefault();
      evento.stopPropagation();
      void this.quitar(p);
    }
  }

  /** Ctrl+Z y Ctrl+Y también desde los puntos del trayecto (no desde su casilla de pausa: ahí deshacen lo escrito). */
  protected teclaTrayecto(evento: KeyboardEvent): void {
    if ((evento.target as HTMLElement | null)?.closest('input, select, textarea')) return;
    this.teclaGeneral(evento);
  }

  protected teclaGeneral(evento: KeyboardEvent): void {
    if (this.estrecha() || !(evento.ctrlKey || evento.metaKey)) return;
    const k = evento.key.toLowerCase();
    if (k === 'z' && !evento.shiftKey) {
      evento.preventDefault();
      this.store.deshacer();
    } else if (k === 'y' || (k === 'z' && evento.shiftKey)) {
      evento.preventDefault();
      this.store.rehacer();
    }
  }

  // ── Arrastre con puntero (el lienzo está escalado: se convierte a px de sala) ──

  private aSala(evento: MouseEvent): { x: number; y: number } {
    const r = this.escenario()!.nativeElement.getBoundingClientRect();
    const e = this.sala()?.estructura ? this.escalaLienzo() : this.escala();
    return { x: Math.round((evento.clientX - r.left) / e), y: Math.round((evento.clientY - r.top) / e) };
  }

  protected empezarArrastre(evento: PointerEvent, p: Pieza): void {
    // Solo mirar (pantalla angosta): el toque elige, nunca arrastra.
    if (evento.button !== 0 || this.estrecha()) return;
    if (this.elegida() !== p.clave) this.elegir(p.clave);
    (evento.target as HTMLElement).setPointerCapture?.(evento.pointerId);
    this.arrastre.set({ clave: p.clave, x: p.x, y: p.y, movio: false });
    this.desfase = (() => {
      const punto = this.aSala(evento);
      return { dx: p.x - punto.x, dy: p.y - punto.y };
    })();
  }

  private desfase = { dx: 0, dy: 0 };

  protected arrastrar(evento: PointerEvent): void {
    const a = this.arrastre();
    if (!a) return;
    const punto = this.aSala(evento);
    this.arrastre.set({ clave: a.clave, x: punto.x + this.desfase.dx, y: punto.y + this.desfase.dy, movio: true });
  }

  protected soltar(): void {
    const a = this.arrastre();
    this.arrastre.set(null);
    if (!a || !a.movio) return;
    const p = this.piezas().find((x) => x.clave === a.clave);
    if (p) this.store.moverElemento(this.salaId(), p.tipo, p.indice, a.x, a.y);
  }
}
