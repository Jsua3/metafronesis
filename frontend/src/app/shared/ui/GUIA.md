# Guía de `shared/ui`

Biblioteca de componentes del lenguaje visual de SIEP (plan visual, fase F2). Toda pantalla nueva o migrada usa
estas piezas en vez de inventar un botón, un campo, un vacío, un cargador o un diálogo. Cada pieza está en la
galería de desarrollo (`/dev/ui`, solo con `ng serve`), en sus estados y en las dos pieles (portal y juego), y
tiene pruebas de comportamiento junto a su código.

Se importa desde `src/app/shared/ui` (el `index.ts` exporta todo). Los estilos salen de los tokens `--ds-*` y de los
mixins de `src/styles/mixins` (`@use 'mixins' as m;`).

## Reglas que no se negocian

- **Controles nativos.** Botones y enlaces son atributos sobre `<button>` y `<a>` (`button[ui-button]`); los campos
  envuelven controles nativos marcados con `uiControl`. Nada clicable sobre un `div`.
- **Deshabilitado con motivo.** `disabledReason="…"` en vez de `disabled`: el control sigue enfocable, el motivo se
  lee por `aria-describedby` y aparece en un globo con el ratón. Nunca `pointer-events: none`.
- **Un estado a la vez.** Todo bloque que pide datos resuelve carga, error, vacío y listo con `uiDataState()`: el
  vacío y el error no pueden coexistir.
- **Tokens, no literales.** Ni colores, ni tamaños de letra, ni capas (`z-index`) escritos a mano; `npm run ui:lint`
  no puede subir.
- **Sin estilos en línea** (atributo `style=`): la política de contenido (CSP) futura los prohíbe. Las vinculaciones
  `[style.--variable]` sí valen.
- **Objetivos de 44 px** (nunca menos de 24 px) y texto de 12 px o más.
- **Textos en español con tildes y tuteo.** Las etiquetas de enums salen de `labels.ts`; los textos de los estados,
  de `state-copy.ts`. Lo que roce contenido clínico lo fija Psicología.
- **Anuncios a lectores de pantalla.** Un mensaje que no se ve como cambio en pantalla sale por
  `LiveRegionAnnouncer.announce(texto, 'polite' | 'assertive')` (`core/a11y`): dos regiones persistentes en `<body>`
  que ya existen antes de que cambie su texto, sin repetidos y con lo que llega a la vez en una sola lectura.
  `assertive` solo para errores y la salida segura. Nunca una región `role="status"` o `role="alert"` que nace con su
  texto dentro de un `@if`, ni `role="status"` con `aria-live="assertive"`.
- **Avisos accionables.** Lo que dice qué hacer (una puerta bloqueada, un error) es un aviso del sistema
  (`NotificationService.show(tipo, texto, 0)` → `ui-toast-host`): permanece hasta cerrarse, no mueve el foco y lo anuncia
  el anfitrión. No se pinta un aviso propio sobre la pantalla; lo breve (sala nueva, «Obtuviste…») se anuncia y se retira
  solo.

## Piezas

| Pieza | Uso | Notas |
|---|---|---|
| `UiButton` | `<button ui-button variant="primary" size="md" icon="save" [loading]="guardando()" [disabledReason]="motivo()">Guardar</button>` | variantes `primary`, `secondary`, `ghost`, `danger`; tamaños `sm`, `md`, `lg`; también `<a ui-button>`. El indicador de carga aparece a los 150 ms (`UI_BUTTON_SPINNER_DELAY_MS`) sin cambiar el ancho. |
| `UiIconButton` | `<button ui-icon-button icon="close" label="Cerrar"></button>` | `label` obligatorio (nombre accesible y globo). Es `type="button"` por defecto. |
| `UiLink` | `<a ui-link href="…">Ayuda</a>`, `<a ui-link external href="…">` | el externo abre otra pestaña con `rel` seguro y lo anuncia. |
| `UiSpinner` | `<ui-spinner label="Cargando casos" />` | decorativo sin `label`. |
| `UiField` + `UiControl` | `<ui-field label="Correo" hint="…" [error]="error()" required><input uiControl type="email" /></ui-field>` | etiqueta asociada, ayuda→error en el mismo renglón, `aria-invalid`, `aria-required`; `revealable` para contraseñas. |
| `UiCheck`, `UiSwitch` | `<label ui-check><input type="checkbox" /> Recordarme</label>`, `<input type="checkbox" uiSwitch />` | toda la fila es el objetivo; el interruptor es `role="switch"`. |
| `UiCard` | `<ui-card>`, `<a ui-card href>`, `<button ui-card>`, `<ui-card superficie="tinte">` | clicable solo como enlace o botón. Superficie `opaca` (por defecto: contenido, P3), `hundida` (un bloque dentro de otro) o `tinte` (lo que sigue, «Siguiente paso»). Toma los materiales del portal (`--l-*`); fuera de él cae a los `--ds-*`. |
| `UiStat` | `<ui-stat label="Intentos" [value]="12" hint="Últimos 30 días" />` | números con formato es-CO. |
| `UiBadge` | `<ui-badge tone="success">Publicado</ui-badge>` | siempre con texto; tonos `neutral`, `info`, `success`, `warning`, `danger`. |
| `UiPageHeader`, `UiPageActions` | `<ui-page-header eyebrow="Docencia" title="Grupos" description="…"><button ui-button uiPageActions>Nuevo</button></ui-page-header>`, `volverA="/portal/grupos" volverEtiqueta="Tus grupos"` | el ÚNICO `h1` de la pantalla. El antetítulo es la píldora con la firma de tres píxeles. `volverA` pinta un enlace de regreso que dice adónde vuelve (pantallas que cuelgan de otra). Por debajo de 40rem de su contenedor, las acciones bajan a ancho completo. |
| `UiSection` | `<ui-section title="Intentos recientes">…</ui-section>` (`[level]="3"` si va anidada) | región nombrada por su título. |
| `UiSkeleton`, `loadingPhase` | `fase = loadingPhase(this.cargando)`; `@if (fase() === 'skeleton') { <ui-skeleton shape="card" /> }` | formas `line`, `text`, `card`, `stat`, `row`, `chart`, `avatar`; < 150 ms nada, visible ≥ 300 ms. |
| `UiProgress` | `<ui-progress label="Escenas completadas" [value]="3" [max]="5" />` | sin `value` es indeterminada. |
| `UiRouteProgress` | `<ui-route-progress />` bajo la barra (F3) | aparece si la navegación tarda más de 120 ms (`UI_ROUTE_PROGRESS_DELAY_MS`). |
| `uiDataState`, `errorKindFromStatus` | `estado = uiDataState({ loading, error, isEmpty })` (en un contexto de inyección) | `pending` (< 150 ms: se sigue viendo lo que había) → `loading` (esqueleto, ≥ 300 ms) → `error` → `empty` → `ready`; la regla de tiempos ya va dentro: no hace falta `loadingPhase` aparte. |
| `UiEmptyState` | `<ui-empty-state kind="first-use" title="Aún no tienes grupos" actionLabel="Crear grupo" (action)="crear()" />`, `<ui-empty-state kind="no-results" withAction (action)="limpiar()" />`, `[figura]="figuras.docente"` | clases `first-use`, `no-results`, `restricted`; pixel art del juego (VD-8); la acción solo aparece si se pide. Con `figura` (una de `FIGURAS_VACIO`: estudiante, docente, admin, revisión) va el personaje del kit a ×3 y la firma bajo el título. **Pasa siempre `description` (o `title`) cuando la clase no encaja:** sin él cae al texto de la clase (`no-results` habla de filtros de búsqueda), y eso llegó a una pantalla de resultado (F10-4, «Tus decisiones»). |
| `UiErrorState`, `UiRetryTracker` | `<ui-error-state [kind]="errorKindFromStatus(err.status)" [status]="err.status" (retry)="cargar()" />` | `blocking` para errores de página; foco al título tras un reintento fallido; `autofocus` lo lleva al título al montarse (un error bloqueante que aparece por sí solo, como el del juego). |
| `UiTooltip`, `UiTooltipController`, `injectUiTooltip` | `<button ui-button uiTooltip="Descarga el reporte en PDF">Exportar</button>` | 400 ms con ratón, al instante con teclado, nunca con un toque; complementa, no nombra. |
| `UiMenu` | `<ui-menu label="Cuenta" icon="account_circle" [items]="items" (itemSelected)="elegir($event)" />` | `iconOnly` para «Más acciones»; el panel vive dentro del componente (D9). |
| `UiTabs`, `UiTab` | `<ui-tabs label="Secciones" [(selected)]="tab"><ng-template uiTab="resumen" label="Resumen">…</ng-template></ui-tabs>` | una sola parada de tabulación; paneles inertes. |
| `UiDialog`, `UiDialogFrame`, `UiDialogActions`, `UiConfirmDialog` | `inject(UiDialog).open(MiDialogo, { data })`, `.confirm({ title, message, confirmLabel, tone: 'danger' })`, `.sheet(MiHoja, { side: 'end' })` | el contenido usa `<ui-dialog-frame title="…">` y `uiDialogActions` en los botones del pie. **Piel (C13):** la capa toma la de quien la abre: `piel: 'game' \| 'portal'` la fija (el juego pasa `'game'`, sobre todo si abre tras una respuesta del servidor), `piel: 'tema'` sigue al tema, `origen: boton` la toma del contenedor de ese elemento; sin nada, del foco (si no está en `body`) y si no, del tema. Lo heredado se sigue con la capa abierta. |
| `UiDialog.consequence`, `UiConsequenceDialog` | `inject(UiDialog).consequence({ title, consequence, continueLabel, proceedLabel })` → `'continue' | 'proceed'` | nombra lo que se pierde; «Continuar» es primaria, tiene el foco y es lo que devuelve Esc (RN-07). **Nunca** para la Salida segura (REGLA-004). |
| `UiScopeNotice`, `SCOPE_NOTICE_DRAFT_TEXT` | `<ui-scope-notice />` en acceso, aviso previo y resultado (F4-2, F6-2, F6-6) | frase de RN-01 en **borrador** visible hasta que Psicología fije el texto (decisión 17); fuera de los textos validados. |
| `UiToastHost` | `<ui-toast-host [placement]="inGame() ? 'game' : 'portal'" />` una vez en la app (`app.component`, F6-1) | pinta `NotificationService` y anuncia cada aviso por `LiveRegionAnnouncer` (assertive solo el error); nunca roba el foco. `portal`: abajo a la derecha; `game`: arriba a la izquierda bajo la cabecera (28 rem), porque abajo a la derecha están «Interactuar», la cruceta táctil y el pie del diálogo. La ruta se decide con `readRouteChrome()` (`shared/layout/route-chrome.ts`, la misma fuente que el shell). |
| `UiTable`, `UiTableTable`, `UiTableRow`, `UiTableEmpty`, `UiTableError` | `<ui-table label="Intentos" [state]="estado()"><table ui-table>…<tr uiRow [selected]="…">…</table><ui-empty-state uiTableEmpty … /><ui-error-state uiTableError … /></ui-table>` | densidad `compact`; desborde señalizado y desplazable con teclado. |
| `ui-table apilar`, `UiCelda`, `UiCeldaPrincipal`, `UiCeldaAcciones` | `<ui-table label="…" apilar>` y en las celdas `<td uiCeldaPrincipal>`, `<td uiCelda="Estado">`, `<td uiCeldaAcciones>` | **toda tabla del portal rediseñado lo lleva.** Bajo 40rem de SU contenedor cada fila es una tarjeta: la principal es el título, cada valor lleva el rótulo de su columna (propio o el del encabezado) y las acciones son el pie a 44 px. Pone roles explícitos de tabla (la semántica no se pierde con `display: block`). |
| `UiGlassBar`, `GlassBarMachine` | `<header ui-glass-bar label="Navegación principal">` con tres módulos proyectados: `<a class="modulo modulo-logo">`, `<div class="modulo modulo-principal">` (enlaces `a.nav-enlace`; los secundarios con `control-plegable`) y `<div class="modulo modulo-cuenta">`; lo fijo como hijo directo: por debajo de 64rem, `<nav app-bottom-tabs [tabs]="…" [more]="…">` (`shared/layout`), que es entonces la navegación principal (como mucho cinco pestañas; lo que no cabe, a la hoja «Más») | la barra de vidrio modular (réplica Recomendada de `/barra-de-vidrio-modular`); estilos globales en `src/styles/components/_glass-bar.scss` y tokens `--asb-*` en `.cromo` (los altos móviles, `--asb-alto-modulo-*`, en `:root` para reservar el sitio del contenido). Pinta `data-estado`, `data-modalidad`, `data-ancho` («escritorio» o «movil») y `data-teclado`; en móvil la píldora se llama `compactLabel` («Marca y cuenta»). Todo elemento con transición lleva `ds-motion`. Banco y arnés: `/dev/barra` + `medir-barra.cjs` con `scripts/ui/barra.config.json`; el móvil lo prueba `e2e/shell.e2e.ts`. |
| `UiSegmentado` | `<ui-segmentado etiqueta="Estado del caso" [opciones]="[{ valor: 'todos', etiqueta: 'Todos', cuenta: 6 }, …]" [(valor)]="estado" />` | elegir UNA vista o UN filtro entre pocos. `radiogroup` con una sola parada de Tab; flechas, Inicio y Fin. La cuenta va en texto («Sin empezar · 2»). Si no caben, la pista se desplaza dentro de sí (nunca la página). |
| `UiFiltros` | `<ui-filtros etiquetaBusqueda="Buscar casos" [(busqueda)]="q" [total]="n" [visibles]="m" [hayFiltros]="filtro() !== 'todos'" (limpiar)="filtro.set('todos')"><ui-segmentado …/></ui-filtros>` | búsqueda, filtros proyectados, «Mostrando 4 de 12» y «Limpiar filtros». Anuncia el recuento en cortesía tras 400 ms. Con cero resultados los controles siguen y aparece el vacío `no-results`. `[conBusqueda]="false"` cuando hay pocas filas. |
| `UiBarraAcciones` | `<ui-barra-acciones nota="Al comenzar aceptas el aviso de contenido"><button ui-button variant="secondary">Volver</button><button ui-button>Comenzar</button></ui-barra-acciones>` | acciones pegadas al pie de la página (`posicion="pie"`, vidrio casi opaco; la página agrega `.p-con-barra-acciones`) o al pie de una columna u hoja (`posicion="columna"`, opaca). La principal, la última. En móvil se apoya sobre las pestañas y los botones toman el ancho. |
| `UiFiguraPixel` | `<ui-figura-pixel personaje="camila/bata" [escala]="3" />` | personaje del kit (`assets/characters/kit/…/idle.png`) a escala ENTERA y `pixelated`, sobre su sombra escalonada. Decorativo salvo que lleve `etiqueta`. `respira` da tres respiraciones al aparecer (nunca un bucle). |
| `UiPortadaCaso` | `<ui-portada-caso [portada]="caso.portada" [titulo]="caso.titulo" tamano="tarjeta" />` | la imagen de la primera sala (`mini`, `tarjeta`, `heroe`: divisiones enteras de 960 × 528) o, sin ella o si falla, la puerta del consultorio sobre el mosaico. Siempre decorativa. `umbral` le da el nombre de la transición al juego: solo a la tarjeta pulsada. |
| `UiBarras` | `<ui-barras descripcion="De 9 estudiantes, 3 terminaron…" [datos]="datos" [total]="9" />` | reemplaza las «gráficas formativas». La lectura en palabras va en la página (obligatoria). Con `total`, cada cantidad lleva su denominador («3 de 9»), nunca un porcentaje suelto. Cada tono con su patrón; los datos, en una tabla para lectores. `modo="apilada"` para una barra partida con leyenda. |
| `UiArchivo` | `<ui-archivo etiqueta="Lista de estudiantes" acepta=".xlsx" ayuda="…" [error]="error()" (archivo)="elegir($event)" />` | `input type="file"` nativo dentro de una zona: se puede soltar encima, pero elegir siempre funciona (WCAG 2.5.7). Muestra nombre, tamaño y «Quitar»; un archivo soltado de otro formato se rechaza con el motivo. |
| `DoodlesComponent` (`app-doodles`) | `<app-doodles desde="#inicio-cabecera" hasta="#inicio-cabecera" intensidad="suave" [interactivo]="false" />` | el mosaico de la portada. En el portal, SOLO detrás de la banda de cabecera de Inicio y de las páginas de estado, en `suave` y sin luz del cursor; nunca detrás de tablas, formularios ni texto del caso (DP-23). |
| `describeHostWith` | `describeHostWith(() => this.motivo() ? this.motivoId : null)` | suma un id a `aria-describedby` sin borrar los ajenos (para componentes nuevos). |

## Migración: clase heredada → componente nuevo

| Hoy | Mañana | Cuándo |
|---|---|---|
| `.psy-button`, `.psy-button--primary` | `button[ui-button]` (`variant="primary"`) | F4–F8, pantalla por pantalla |
| `.psy-button--ghost`, `.psy-button--glass` | `button[ui-button] variant="ghost"` (el vidrio solo en la barra, F3) | F3–F8 |
| `.siep-btn-primary`, `.siep-btn-secondary` | `button[ui-button]` primario o secundario | F4–F8 |
| `.psy-icon-button`, `mat-icon-button` | `button[ui-icon-button]` con `label` | F3–F8 |
| `.psy-eyebrow`, `.psy-title`, `.psy-subtitle` | `ui-page-header` (`eyebrow`, `title`, `description`) | F4–F8 |
| `.psy-section` | `ui-section` | F4–F8 |
| `.psy-card`, `.siep-card`, `mat-card` | `ui-card` (`a[ui-card]` si toda la tarjeta lleva a otro sitio) | F5, F7 |
| `dashboard-charts` («gráficas formativas») | `ui-barras` con `descripcion` y `total` | B5a (rediseño del portal) |
| `<input type="file">` suelto (importar estudiantes) | `ui-archivo` | B6 (rediseño del portal) |
| filtros a mano (`select` + texto «N resultados») | `ui-filtros` + `ui-segmentado` | rediseño del portal, pantalla por pantalla |
| `.psy-chip`, `mat-chip` (estado) | `ui-badge` con texto de `labels.ts` | F5, F7 |
| `.psy-skeleton` | `ui-skeleton` + `loadingPhase()` | F5–F8 |
| `mat-progress-bar` | `ui-progress` (o `ui-route-progress` para la navegación) | F3–F8 |
| `mat-form-field`, `mat-select` | `ui-field` + `uiControl` sobre `<input>`/`<select>` nativos | F4, F7, F8 |
| `mat-table` | `ui-table` sobre `<table>` nativa | F7 |
| `app-confirm-dialog` | `UiDialog.confirm()` | F5–F8 |
| `app-notification-host` (`.siep-notification`) | `ui-toast-host` | F6-1 (hecho: el anfitrión heredado y su CSS se retiraron) |
| `<p>` sueltos de «no hay datos» o «error» | `ui-empty-state` / `ui-error-state` con `uiDataState()` | F5, F7 |

Al migrar una pantalla: se borra la clase heredada en el mismo cambio (si nadie más la usa) y `npm run ui:lint` debe
bajar o quedarse igual.

## Lista de «se ve profesional» (plan visual §7)

Por pantalla, antes de darla por hecha:

- [ ] un solo `h1` (`ui-page-header`) y título de pestaña;
- [ ] los cuatro estados de datos resueltos con `uiDataState()` (carga, error, vacío, listo);
- [ ] hover, foco, pulsado y deshabilitado **con motivo** en todo lo interactivo;
- [ ] solo tokens (sin literales de color, tamaño de letra ni capas);
- [ ] sin claves ni enums crudos a la vista (`labels.ts`) y con tildes;
- [ ] responsivo en 320, 390, 1024 y 1440 px, sin texto recortado ni desborde (las tablas con `apilar`);
- [ ] teclado completo (Tab, Esc, flechas donde corresponda) y cursor correcto;
- [ ] sin errores en la consola;
- [ ] Axe WCAG 2.2 AA sin hallazgos serios ni críticos en su piel;
- [ ] en la galería, si se creó o cambió una pieza de `shared/ui`.

## Auditoría de movimiento (F9-1)

Criterio: nada anima sin función; cero `ease-in`, cero `transition: all`, cero `scale(0)` y ningún bucle infinito que no sea un **indicador de carga** (esqueleto, spinner, barra de progreso, pantalla de arranque). Se mide en dos sitios: `npm run ui:lint` (métricas `transitionAll`, `easeIn`, `scale0` e `infiniteAnimation`, con trinquete) y el e2e `@motion-audit` (`e2e/motion-audit.e2e.ts`: en cada pantalla del recorrido y en cada pestaña del editor de casos, ya asentada, busca bucles infinitos y `transition: all` en lo que el navegador realmente pinta; rojo visto contra el CSS anterior).

| Dónde | Antes | Ahora | Por qué |
|---|---|---|---|
| Paneles de vidrio del juego y de la Vista previa (`.psy-game-panel`; `.psy-dialogue-glass`, que tenía lo mismo, se retiró en F9-4) | un brillo cruzaba el panel cada 8 s, sin parar | un solo barrido de 2,4 s al aparecer | un bucle decorativo infinito distrae y gasta GPU sin informar nada |
| Cursor del diálogo del juego | parpadeo infinito | 30 ciclos (18 s) y se oculta al terminar de escribir (`.cursor--done`) | ningún bucle debe sobrevivir a su función |
| Botones de herramientas del editor de mundo | `transition: all` | solo `background-color` y `color` | `all` anima propiedades que no se querían (ancho, borde) y se contagia de cambios futuros |
| Ondulación `.psy-liquid-ripple` | nacía en `scale(0)` | nace en `scale(.2)` (con opacidad 0) | nada aparece de la nada (§2.7) |

No se hizo la revisión «en cámara lenta y fotograma a fotograma» del plan: es una pasada humana con el navegador; queda pendiente.
