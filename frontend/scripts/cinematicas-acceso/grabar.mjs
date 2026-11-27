// Graba las tomas de la ventana del acceso jugando el caso insignia SIM-VBG-002 contra una API local.
// Uso y variables de entorno: README.md de esta carpeta. Deja los cuadros en <SALIDA>/<toma>/NNNN.png; después: codificar.mjs.
//
// La grabación es por cuadros y no en tiempo real: el reloj de la página queda detenido (page.clock) y se avanza 1/30 s por
// cuadro, con las animaciones CSS llevadas al mismo paso. Así cada cuadro es una captura sin pérdida y la toma no depende
// de la velocidad del equipo.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../../..');
export const SALIDA = process.env.SALIDA ?? join(tmpdir(), 'metafronesis-tomas');
const BASE = process.env.SIEP_URL ?? 'http://127.0.0.1:4200';
const CORREO = process.env.SIEP_CORREO ?? 'valentina.rios@demo.metafronesis.test';
const CLAVE = process.env.SIEP_CLAVE ?? claveDeArchivo(process.env.SIEP_CLAVE_ARCHIVO);
const FPS = 30;
// 960 × 600 en CSS a 4/3 = 1280 × 800 físicos: el juego elige zoom entero sobre los píxeles físicos (cada píxel del arte
// mide un número entero de píxeles del video) y los rótulos de la interfaz quedan legibles al verse a la mitad.
const VISTA = { width: 960, height: 600 };
const DPR = 4 / 3;

/** La mejor respuesta de cada escena (clave del caso), en el orden de la historia: ver test_caso_insignia_lineal.py. */
const MEJOR = [
  'n1-mirar-y-presentarse', 'h1-pap-contencion', 'n3-una-sola-voz', 'n2-sala-escucha', 'n4-percepcion', 'n5-silencio-validar',
  'n6-conectar', 'll-reservar', 'o2-459-1257', 'o3-integral', 'n7-verdad-cuidada', 'ru-ruta-activada', 'in-completo',
  'o4-proteccion', 'v-desde-informe', 'o5-2126-1098-1257', 'n9-acompanar', 'n10-valorar-red', 'o6-integral', 'bi-reflexion',
];

// La interfaz periférica (barra, objetivo, plano, herramientas) no entra en las tomas: queda el mundo, quien habla y las
// opciones. Todo lo demás es el juego tal cual.
const SIN_PERIFERIA = `
  .top-bar, .bottom-zone, .main-zone > :not(.canvas-zone), .canvas-zone > :not(:has(canvas)):not(app-reaction-director),
  .panel-head, .instant-setting, .keyboard-hint, .choices-notice, app-scene-hint { visibility: hidden !important; }
  app-reaction-director app-safe-exit-button, app-aviso-de-puerta { visibility: hidden !important; }`;

function claveDeArchivo(ruta) {
  if (!ruta) return '';
  const linea = readFileSync(ruta, 'utf8').split(/\r?\n/).find(l => l.startsWith('GRABAR_CLAVE='));
  return linea ? linea.slice('GRABAR_CLAVE='.length).trim() : '';
}

async function cargarPlaywright() {
  const ruta = process.env.PLAYWRIGHT_DIR;
  if (ruta) return createRequire(pathToFileURL(join(ruta, 'package.json')))('playwright');
  return await import('playwright');
}

/** Textos de las opciones del documento del caso, por clave: la API ofrece las opciones por texto e id, no por clave. */
function textosPorClave() {
  const caso = JSON.parse(readFileSync(join(RAIZ, 'apps/simulation/data/casos/SIM-VBG-002.dsl.json'), 'utf8'));
  const porId = new Map(caso.escenas.flatMap(e => (e.decision?.opciones ?? []).map(o => [o.id, o.texto.trim()])));
  const textos = new Map(caso['x-siep'].escenas.flatMap(e => (e.opciones ?? []).map(o => [o.clave, porId.get(o.id)])));
  return { titulo: caso.caso.titulo, textos };
}

async function main() {
  if (!CLAVE) throw new Error('Falta SIEP_CLAVE (o SIEP_CLAVE_ARCHIVO con una línea GRABAR_CLAVE=…).');
  const { chromium } = await cargarPlaywright();
  const navegador = await chromium.launch({
    channel: 'chromium',
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: (process.env.CHROMIUM_ARGS ?? '--ignore-gpu-blocklist --enable-gpu-rasterization --use-angle=d3d11').split(' ').filter(Boolean),
  });
  const contexto = await navegador.newContext({ viewport: VISTA, deviceScaleFactor: DPR, locale: 'es-CO', timezoneId: 'America/Bogota' });
  // Avatar genérico del elenco: ningún personaje basado en una persona real sale en las tomas.
  await contexto.addInitScript(() => {
    localStorage.setItem('psychosim_avatar', JSON.stringify({ schemaVersion: 2, mode: 'elenco', recipeId: 'valentina', bata: true }));
  });
  const page = await contexto.newPage();
  await page.clock.install();
  const cdp = await contexto.newCDPSession(page);
  const juego = crearJuego(page, cdp);

  try {
    await juego.entrarAlPortal();
    for (const [nombre, toma] of Object.entries(TOMAS)) {
      if (process.env.TOMAS && !process.env.TOMAS.split(',').includes(nombre)) continue;
      console.log(`toma ${nombre}…`);
      await toma(juego);
    }
  } catch (error) {
    mkdirSync(SALIDA, { recursive: true });
    await page.screenshot({ path: join(SALIDA, 'error.png') }).catch(() => undefined);
    throw error;
  } finally {
    await navegador.close();
  }
}

function crearJuego(page, cdp) {
  const { titulo, textos } = textosPorClave();
  let version = 0;

  const boton = nombre => page.getByRole('button', { name: nombre }).first();
  const visible = async nombre => boton(nombre).isVisible().catch(() => false);

  /** Llama a la API con la sesión de la página. Con `tolerar`, un rechazo no corta la grabación: devuelve {ok, datos}. */
  async function api(metodo, ruta, cuerpo, tolerar = false) {
    const respuesta = await page.evaluate(async ([m, r, c]) => {
      const token = Object.entries(localStorage).find(([k, v]) => /token/i.test(k) && v.split('.').length === 3)?.[1];
      const res = await fetch(r, { method: m, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: c ? JSON.stringify(c) : undefined });
      let datos = null;
      try { datos = await res.json(); } catch { /* sin cuerpo */ }
      return { estado: res.status, datos };
    }, [metodo, ruta, cuerpo]);
    if (tolerar) return { ok: respuesta.estado < 400, datos: respuesta.datos?.data ?? respuesta.datos };
    if (respuesta.estado >= 400 && respuesta.estado !== 404) {
      throw new Error(`${metodo} ${ruta} → ${respuesta.estado} ${JSON.stringify(respuesta.datos).slice(0, 300)}`);
    }
    if (respuesta.estado === 404) return null;
    return respuesta.datos?.data ?? respuesta.datos;
  }

  const intentoActivo = async () => (await api('GET', `/api/simulation/cases/${version}/active-attempt`))?.attemptId;
  const mundo = async id => api('GET', `/api/simulation/attempts/${id}/world`);

  async function entrarAlPortal() {
    await page.goto(`${BASE}/login`);
    await page.fill('#login-email', CORREO);
    await page.fill('#login-password', CLAVE);
    await page.press('#login-password', 'Enter');
    await page.waitForURL(/\/portal/, { timeout: 30_000 });
    const catalogo = await api('GET', '/api/simulation/catalog');
    const caso = catalogo.find(c => c.title === titulo);
    if (!caso?.allowed) throw new Error(`El caso «${titulo}» no está disponible para esa cuenta (ver README: preparar la cuenta).`);
    version = caso.case_version_id;
  }

  /**
   * Recoge las herramientas de la sala como lo haría quien juega: yendo hasta ellas. El servidor no acepta saltos (revisa
   * la distancia por tiempo y los obstáculos), así que se avanza en pasos cortos y se prueba alrededor del objeto.
   * Después el personaje vuelve a donde estaba.
   */
  async function recogerHerramientas(id, estado) {
    const herramientas = estado.objects.filter(o => /TOOL/i.test(o.type) && !estado.inventory.some(i => (i.code ?? i) === o.toolCode));
    if (!herramientas.length) return;
    const origen = { x: estado.player.x, y: estado.player.y };
    let aqui = { ...origen };
    const intentarMover = async punto => {
      const r = await api('PATCH', `/api/simulation/attempts/${id}/world-state`, { playerX: Math.round(punto.x), playerY: Math.round(punto.y), currentMapKey: estado.map.key }, true);
      if (r.ok) aqui = punto;
      return r.ok;
    };
    const irHasta = async destino => {
      while (Math.hypot(destino.x - aqui.x, destino.y - aqui.y) > 200) {
        const f = 200 / Math.hypot(destino.x - aqui.x, destino.y - aqui.y);
        const paso = { x: aqui.x + (destino.x - aqui.x) * f, y: aqui.y + (destino.y - aqui.y) * f };
        await page.waitForTimeout(300);
        if (!(await intentarMover(paso)) && !(await intentarMover({ x: paso.x, y: origen.y }))) break;
      }
      await page.waitForTimeout(300);
      return intentarMover(destino);
    };
    for (const objeto of herramientas) {
      for (const [dx, dy] of [[0, 40], [-48, 12], [48, 12], [0, 64], [0, -24], [-64, 40], [64, 40]]) {
        if (!(await irHasta({ x: objeto.x + dx, y: objeto.y + dy }))) continue;
        if ((await api('POST', `/api/simulation/attempts/${id}/interactions/${objeto.key}`, undefined, true)).ok) break;
      }
    }
    await irHasta(origen);
  }

  /** Un intento nuevo, jugado por la API con la mejor respuesta y todas las herramientas hasta antes de `hastaClave`. */
  async function intentoHasta(hastaClave) {
    const anterior = await intentoActivo();
    if (anterior) await api('POST', `/api/simulation/attempts/${anterior}/replace`);
    if (!(await intentoActivo())) await api('POST', '/api/simulation/attempts', { case_version_id: version });
    const id = await intentoActivo();
    for (const clave of MEJOR) {
      let estado = await mundo(id);
      await recogerHerramientas(id, estado);
      if (clave === hastaClave) return id;
      estado = await mundo(id);
      const opcion = estado.decisionOptions.find(o => o.text.trim() === textos.get(clave));
      if (!opcion) throw new Error(`La escena actual no ofrece «${clave}» (sala ${estado.map.key}).`);
      for (let vez = 0; vez < 2; vez += 1) {
        const r = await api('POST', `/api/simulation/attempts/${id}/decisions`, { decision_option_id: opcion.id, request_id: `t${vez}-${clave}-${id.slice(0, 8)}` });
        if (!(r?.retry_required ?? r?.retryRequired)) break;
      }
    }
    return id;
  }

  /** Abre el juego y pasa cinemática, tutor, notas y ayuda hasta quedar en la sala. */
  async function abrirJuego() {
    await page.goto(`${BASE}/portal/simulador/${version}`);
    const continuar = boton(/Continuar intento en progreso/i);
    await continuar.or(boton(/Abrir los controles/i)).first().waitFor({ timeout: 30_000 });
    if (await continuar.isVisible()) await continuar.click();
    await pasarAvisos();
    await page.addStyleTag({ content: SIN_PERIFERIA });
    await page.waitForTimeout(800);
  }

  async function pasarAvisos() {
    // La sala está lista cuando se ve la cabecera del juego y durante cuatro segundos no aparece ningún aviso más.
    for (let quietos = 0, vueltas = 0; quietos < 8; vueltas += 1) {
      if (vueltas > 120) throw new Error('El juego no llegó a la sala.');
      await page.waitForTimeout(500);
      const aviso = boton(/^(Saltar|Seguir|Continuar|Entendido|Ahora no)$/);
      if (await aviso.isVisible().catch(() => false)) {
        await aviso.click();
        quietos = 0;
      } else quietos = (await visible(/Abrir los controles/)) ? quietos + 1 : 0;
    }
  }

  /** Cambia el tamaño de la vista sin cambiar el del video: 1280 × 800 físicos siempre. */
  const encuadrar = (ancho, alto) => cdp.send('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1280 / ancho, mobile: false });

  /** «Ir a…»: elige una persona, puerta u objeto de la sala; el personaje camina solo. */
  async function irA(nombre) {
    await page.keyboard.press('i');
    const destino = page.getByRole('dialog', { name: /^Ir a/ }).getByRole('button', { name: nombre });
    await destino.waitFor({ timeout: 10_000 });
    await destino.click();
    // El menú sigue abierto mientras camina: no entra en la toma.
    await page.addStyleTag({ content: 'app-world-places-list, .overlay-backdrop { visibility: hidden !important; }' });
  }

  async function hastaLasOpciones() {
    const primera = boton(/^A\. /);
    for (let i = 0; i < 30; i += 1) {
      if (await primera.isVisible().catch(() => false)) return;
      const seguir = boton(/Seguir leyendo|Mostrar texto completo|Ver las opciones/);
      if (await seguir.isVisible().catch(() => false)) await seguir.click();
      await page.waitForTimeout(700);
    }
    throw new Error('No aparecieron las opciones.');
  }

  /**
   * Graba `segundos` de la pantalla a 30 cuadros por segundo con el reloj detenido. `guion` son pasos {en, hacer}: en el
   * segundo `en` (de la toma) se ejecuta `hacer` una vez. Los pasos no pueden esperar al reloj (clics con evaluate).
   */
  async function grabar(nombre, segundos, { guion = [], poster = segundos / 2, antesDeCadaCuadro } = {}) {
    const carpeta = join(SALIDA, nombre);
    rmSync(carpeta, { recursive: true, force: true });
    mkdirSync(carpeta, { recursive: true });
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    await page.evaluate(() => { window.__vistas = new WeakSet(); for (const a of document.getAnimations()) { a.pause(); window.__vistas.add(a); } });
    const pasos = [...guion].sort((a, b) => a.en - b.en);
    const cuadros = Math.round(segundos * FPS);
    for (let i = 0; i < cuadros; i += 1) {
      while (pasos.length && pasos[0].en <= i / FPS) await pasos.shift().hacer();
      if (antesDeCadaCuadro) await antesDeCadaCuadro(i / FPS);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
      writeFileSync(join(carpeta, `${String(i).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
      await page.clock.runFor(i % 3 === 2 ? 34 : 33);
      await page.evaluate(avanzarAnimaciones, 1000 / FPS);
    }
    writeFileSync(join(carpeta, 'toma.json'), JSON.stringify({ fps: FPS, cuadros, poster: Math.min(cuadros - 1, Math.round(poster * FPS)) }));
    await page.evaluate(() => { for (const a of document.getAnimations()) a.play(); });
    await page.clock.resume();
    console.log(`  ${cuadros} cuadros en ${carpeta}`);
  }

  return { page, boton, visible, entrarAlPortal, intentoHasta, abrirJuego, pasarAvisos, irA, hastaLasOpciones, encuadrar, grabar };
}

/** Lleva las animaciones y transiciones CSS al paso del reloj detenido. Corre en la página. */
function avanzarAnimaciones(ms) {
  for (const a of document.getAnimations()) {
    if (!window.__vistas.has(a)) {
      window.__vistas.add(a);
      a.pause();
      a.currentTime = 0;
      continue;
    }
    const fin = a.effect?.getComputedTiming().endTime;
    const siguiente = Number(a.currentTime ?? 0) + ms;
    if (Number.isFinite(fin) && siguiente >= fin) a.finish();
    else a.currentTime = siguiente;
  }
}

/**
 * Las cinco tomas, en orden. El porqué de cada una está en el README. Salen de la escena «Un lugar para hablar» (E04) y del
 * cierre: son momentos sin relato de la violencia, porque el acceso se ve antes del aviso de contenido.
 */
const TOMAS = {
  async llegada(juego) {
    await juego.intentoHasta('n2-sala-escucha');
    await juego.abrirJuego();
    const tecla = (accion, nombre) => () => juego.page.keyboard[accion](nombre);
    // Llega por un lado de la sala y camina hasta donde espera la familia; la cámara la va descubriendo.
    await juego.grabar('llegada', 7, {
      poster: 5.5,
      guion: [
        { en: 1.0, hacer: tecla('down', 'ArrowLeft') },
        { en: 3.9, hacer: tecla('up', 'ArrowLeft') },
      ],
    });
  },

  async escucha(juego) {
    await juego.intentoHasta('n2-sala-escucha');
    await juego.abrirJuego();
    await juego.irA(/^Hablar con Gloria/);
    await juego.grabar('escucha', 8, { poster: 6.5 });
  },

  async decision(juego) {
    await juego.intentoHasta('n2-sala-escucha');
    await juego.abrirJuego();
    await juego.irA(/^Hablar con Rocío/);
    await juego.hastaLasOpciones();
    await juego.page.waitForTimeout(600);
    const elegida = juego.boton(/^B\. La sala de escucha/);
    const caja = await elegida.boundingBox();
    await juego.page.mouse.move(VISTA.width * 0.5, VISTA.height * 0.4);
    await juego.grabar('decision', 9, {
      poster: 2.6,
      guion: [
        { en: 2.0, hacer: () => juego.page.mouse.move(caja.x + caja.width * 0.55, caja.y + caja.height * 0.6) },
        { en: 3.6, hacer: () => elegida.evaluate(e => e.click()) },
      ],
    });
  },

  async cruce(juego) {
    await juego.intentoHasta('n2-sala-escucha');
    await juego.abrirJuego();
    await juego.irA(/^Hablar con Rocío/);
    await juego.hastaLasOpciones();
    await juego.boton(/^B\. La sala de escucha/).click();
    await juego.boton(/^Continuar/).waitFor({ timeout: 30_000 });
    await juego.page.waitForTimeout(1500);
    await juego.boton(/^Continuar/).click();
    // La nota de lo que sigue se cierra antes de grabar; al cerrarla la familia camina a la puerta.
    const cerrar = juego.page.locator('button.panel-back').first();
    await cerrar.waitFor({ state: 'attached', timeout: 15_000 });
    await juego.page.waitForTimeout(1200);
    await juego.page.addStyleTag({ content: 'app-tutor-caso, app-nota-transicion { visibility: hidden !important; }' });
    await cerrar.evaluate(e => e.click());
    let cruzado = null;
    await juego.grabar('cruce', 8.5, {
      poster: 8.2,
      antesDeCadaCuadro: async t => {
        if (cruzado === null && t >= 2.6) {
          const pasar = juego.boton(/^Ir a Hospital — Sala de escucha/);
          if (await pasar.isVisible().catch(() => false)) {
            cruzado = t;
            await pasar.evaluate(e => e.click());
          }
        } else if (cruzado !== null && t - cruzado > 1.2) {
          // Al otro lado, el tutor (oculto en la toma) se despide para que la sala quede en juego.
          await juego.page.evaluate(() => {
            [...document.querySelectorAll('app-tutor-caso button')].find(b => /^(Seguir|Continuar|Empezar)$/.test(b.textContent.trim()))?.click();
          });
        }
      },
    });
    if (cruzado === null) throw new Error('La toma «cruce» no llegó a la puerta de la sala de escucha.');
  },

  async supervision(juego) {
    await juego.intentoHasta('bi-reflexion');
    await juego.abrirJuego();
    await juego.irA(/^Ir a Tu libreta/);
    await juego.page.waitForTimeout(3500);
    if (!(await juego.visible(/Ver las opciones|Mostrar texto completo/))) await juego.page.keyboard.press('e');
    await juego.hastaLasOpciones();
    await juego.boton(/Registrar lo que hiciste/).click();
    const resultado = juego.boton(/Ver resultado/);
    for (let i = 0; i < 40 && !(await resultado.isVisible().catch(() => false)); i += 1) {
      const seguir = juego.boton(/^Continuar|Seguir leyendo|Mostrar texto completo/);
      if (await seguir.isVisible().catch(() => false)) await seguir.click();
      await juego.page.waitForTimeout(700);
    }
    await resultado.click();
    const revision = juego.page.getByText('La revisión del profesor').first();
    await revision.waitFor({ timeout: 20_000 });
    // La revisión es texto: se graba en una vista más angosta (mismo tamaño de video) para que se lea al verse pequeña.
    await juego.encuadrar(720, 450);
    await juego.page.waitForTimeout(1500);
    // La revisión sube sola, despacio, como quien la va leyendo.
    await revision.evaluate(e => {
      let caja = e.parentElement;
      while (caja && !(caja.scrollHeight > caja.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(caja).overflowY))) caja = caja.parentElement;
      window.__caja = caja ?? document.scrollingElement;
      window.__caja.scrollTop += e.getBoundingClientRect().top - 18;
      window.__desde = window.__caja.scrollTop;
    });
    await juego.grabar('supervision', 9, {
      poster: 0.2,
      antesDeCadaCuadro: t => juego.page.evaluate(s => {
        const p = Math.min(1, Math.max(0, (s - 1.4) / 7));
        window.__caja.scrollTop = window.__desde + Math.round(300 * (p * p * (3 - 2 * p)));
      }, t),
    });
  },
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message ?? error); process.exitCode = 1; });
}
