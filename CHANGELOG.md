# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Las versiones `v0.x.0` marcan hitos de integración y tienen etiqueta anotada en Git. Los números `#N` son los PR de GitHub.

## [Sin publicar]

### Pendiente
- Romper el ciclo de dependencias entre `grupos`, `privacy`, `progression`, `security`, `sesiones`, `simulation` y `users`.
- Configurar ruff y ejecutarlo en el CI.
- Retirar las pruebas heredadas del repositorio anterior que buscan archivos que este repositorio no tiene (hoy fallan 80).
- Cubrir tres validaciones del caso detectadas en la revisión del #17: revisión aprobada antes de publicar con `REVIEW_WORKFLOW_STRICT`, rechazo de sugerencias de IA sin revisar y camino desde la escena inicial hasta un final.
- Documentación por app y `docs/api.md`.
- Job de CI para el frontend: hoy el workflow no corre `ng test` ni `npm run build` (por eso el #70 entró con una prueba en rojo, corregida en el #71).
- Agregar `apps/ia/tests` a la lista de pruebas del workflow.
- Pruebas e2e del juego y del editor.
- Probar en el navegador, con el servidor real, el ensayo, el asistente de autoría, la generación con IA y el caso insignia.
- El editor ofrece «Probar» en un caso publicado y el servidor responde 409: solo se ensayan borradores.
- Que mover una pieza en el editor se vea al instante: hoy la sala se rearma entera (ya sin parpadeo, desde el #75).

## [0.8.0] - 2026-11-27

Metafrónesis en el teléfono y la tableta, y un acabado de escritorio a la altura del resto. Sale de dos fuentes: las críticas de un docente que revisó el programa (cajas mucho más anchas que su contenido, botones de ayuda ajenos al lenguaje visual, desplegables sin estilo y módulos con scroll propio) y una cuarta medición con las mismas 61 personas simuladas sobre la 0.7.1, en la que el SUS subió de 45,9 a 48,3.

### Agregado
- **Juego en teléfono y tableta:** el simulador ocupa toda la pantalla y la interfaz fija cubre el 12 % del alto a 390 × 844 (#120). Los diálogos y paneles salen como hojas táctiles (#113).
- **Acceso con tomas reales del juego:** cinco escenas del caso insignia se turnan en la ventana del acceso, con pausa, póster cuando se prefiere menos movimiento y carga diferida. El guion que las graba está en el repo (#115).
- **Cambiar de cuenta** desde el menú de la cuenta, entre las cuentas que la persona eligió recordar en ese navegador. Solo se guardan id, nombre, correo y rol, nunca contraseñas ni tokens (#114).
- **Sugerencias al invitar** estudiantes a un grupo, por correo o por usuario (#123).
- `sembrar_participaciones`: sesiones jugadas con intentos, informes y retroalimentación para revisar reportes en desarrollo (#125).
- Barras de volumen animadas en el juego (#109) y Sebas como personaje docente (#111).

### Cambiado
- **Editor de casos sin scroll anidado:** en escritorio se desplaza la página y no cajas sueltas; se medían 61 de 66 combinaciones con scroll propio y quedan 0 (#117). La barra del editor y las etapas del caso, rediseñadas (#121).
- **Portal con anchos medidos y sin scroll anidado**, con diseño propio en teléfono y tableta (#126). Grupos y Reportes tienen campos al ancho de su contenido (#119).
- **Desplegables con el estilo del programa** en todo el portal, barras táctiles y carril en tableta (#127).
- **Ayuda «?»:** pasa a ser un bocadillo de pixel art con una explicación flotante que no empuja el texto (#112). Las descripciones del menú de la barra van en un bocadillo propio (#118).

### Corregido
- **Correos de los avisos:** un correo que no sale queda en el registro del servidor con su causa (antes solo se guardaba el nombre del error en el aviso); los avisos de una sesión salen al confirmar la operación y por una sola conexión SMTP; la invitación a un grupo también deja su aviso en SIEP. (#124)
- La barra pública dejaba una cápsula vacía y los iconos de los botones mostraban texto (#122).

## [0.7.1] - 2026-11-27

Respuesta inmediata en el juego y en el editor. Una tercera medición con las mismas personas simuladas sobre la 0.7.0 dio 76 % menos errores de acción (de 83 a 20), pero la sensación de uso no mejoró: la gente seguía sin saber si su acción había hecho algo. Esta versión hace que cada acción responda al instante y diga qué viene después.

### Cambiado
- **Juego:** «Hablar con X» desde lejos responde al instante con «Yendo hacia… Pulsa para cancelar» (Esc o una segunda pulsación cancelan) y, si la persona ya está al alcance, la conversación se abre sin caminar. El botón del diálogo dice lo que hará («Seguir leyendo (n de m)», «Ver las opciones», «Volver al mapa») y las consecuencias seguidas se numeran. Junto a las opciones dice «haz clic o pulsa su letra» (#107).
- **Juego:** cruzar una puerta es una sola acción, «Pasar a X», que camina y cruza (antes «Ir a la sala» solo caminaba); una puerta cerrada dice por qué en «Ir a…», la ficha y la barra, y el aviso de rearme dice qué hacer (#107).
- **Editor:** «Crear la escena que sigue» y, aparte, «Terminar el caso aquí: crear la escena final», con una frase que explica qué es una escena final. «Antes de decidir» tiene texto visible, y los controles de la respuesta miden 44 px y quedan separados en pantalla táctil (#105).

### Corregido
- El editor no tenía dónde escribir la pregunta de decisión de cada escena, que el servidor exige: el aviso «La escena necesita una pregunta» no se podía resolver. Ahora el guion la ofrece, separada del objetivo (#105).
- La barra de estado del editor mostraba avisos ya resueltos: la narración y el objetivo entran al estado al escribir, y «Enviar» dice que la comprobación está pendiente en vez de mostrar el resultado viejo (#105).
- En el juego, el objetivo se adelantaba a la pantalla mientras seguía visible la reacción de la persona; ahora cambia al volver al mapa (#107).
- «Estado» y «Ordenar por» de Usuarios tenían un nombre accesible con todas sus opciones; el botón para ver la contraseña no pasaba a «Ocultar contraseña» (#106).
- Con teclado o lector de pantalla: los enlaces de la barra del portal se leían como hijos del logo, «Volver a iniciar sesión» quedaba al final de «Recuperar contraseña», un error al entrar no recibía el foco y, al rechazar una invitación, el foco caía en la página; en Inicio, sin caso que jugar, la invitación es la acción principal (#106).

## [0.7.0] - 2026-11-26

Plan de choque de usabilidad: una prueba con 116 personas simuladas dio un SUS de 35,8 y ninguna logró enviar un caso a revisión. Esta versión quita lo que impedía terminar, hace que el editor diga la verdad, guía al estudiante y al docente, y pule el juego y la accesibilidad. Trae también las sesiones del docente con sus correos, la recuperación de contraseña, el nuevo acceso, la edición compartida de casos entre docentes, la IA coautora (fase 1), los avatares de Karen y Sara y el caso insignia lineal con cinemática.

### Añadido
- **Sesiones del docente:** un grupo, un caso de la biblioteca y un horario, con estados programada, en curso, pausada, finalizada y cancelada (#87).
- **Correos de las sesiones:** la convocatoria lleva el enlace a «Casos», llega un recordatorio 30 minutos antes (comando `recordar_sesiones`, cada 5 minutos) y la retroalimentación del docente avisa al estudiante con el enlace a su resultado (#98).
- **«¿Olvidaste tu contraseña?»** con enlace de un solo uso por correo (#85).
- **Acceso con recorrido guiado** de lo que hace el simulador, que se pausa al escribir y respeta movimiento reducido (#86).
- **Edición compartida de casos:** el autor de un caso es quien lo creó y no cambia; otro docente edita un caso publicado creando una versión nueva suya, y cada caso muestra «Autor: … · Editado por: …» (#97).
- **IA coautora, fase 1:** antes de construir, la IA aclara la idea con hasta 6 preguntas con opciones y acuerda con el docente una ficha del caso; en el editor, el panel de la IA tiene «Construir juntos» y «Pedir un cambio», se acopla o flota y se mueve también con teclado (#99).
- **Avatares elegibles de Karen y Sara**, con bata y sin ella, hechos con su permiso escrito y solo con su nombre de pila (#101).
- **`sembrar_demostracion --docentes`:** deja los grupos sembrados a cargo de docentes reales que ya existen (#84).
- **Caso insignia SIM-VBG-002 lineal (2.0.7):** tres capítulos del hospital a la comisaría con una sola línea del tiempo, tres finales según lo que se hizo y uno de «Recorrido incompleto», cinemática en pixel art que nunca muestra el ataque, tutor al inicio y entre capítulos, y herramientas que ya no se pueden perder (#100).
- **Portada por versión de caso:** cualquier docente la sube desde «Datos» (PNG, JPEG o WebP verificados por contenido, hasta 2 MB, sin metadatos y auditada); el caso insignia trae la suya (#100).
- **«Asignar a un grupo» desde el propio caso publicado**, en la lista de casos y en el editor (#89).
- **Permiso de autoría visible:** el docente sin permiso sabe qué le falta y a quién pedirlo; la administración lo da con un clic o al aprobar la cuenta (#89).
- **Avance por caso en el grupo:** cuántos estudiantes terminaron cada caso asignado y cuántos lo tienen en curso, con enlace a sus intentos; «Invitar estudiantes» y «Asignar un caso» en la cabecera del grupo (#89).
- **El grupo de un vistazo:** la lista de grupos y el inicio del docente muestran estudiantes aceptados, invitaciones pendientes y el avance de los casos; cada sección del menú del docente dice en una línea qué se hace ahí (#89).
- **«Lo siguiente»** en el inicio del estudiante y del docente: una frase con lo que toca hacer ahora (#92, #89).
- **Juego:** tarjeta de controles la primera vez, «Ir a…» a la vista, el siguiente paso marcado en el mundo, en el plano y en «Ir a…», flecha al borde cuando queda fuera de cuadro, cercanía visible para E e «Interactuar», clic o toque para caminar, y texto instantáneo opcional (#93).
- **Editor:** explicación corta junto a cada término de Psicología y glosario en «Ayuda» (sin renombrar los términos), «Crear mi primer caso» junto al tutorial, «Deshacer» tras aceptar una propuesta de la IA y estado de guardado siempre visible (#88).

### Cambiado
- **El editor dice la verdad:** lo que impide enviar lo decide la compuerta del servidor y la barra, la evaluación, el panel y «Enviar» muestran el mismo número; lo demás son sugerencias. Al abrir «Enviar» la revisión se pide sola. El texto de relleno no cuenta como contenido (#88).
- **«Llévame ahí»** abre la sección, desplaza y enfoca el campo exacto (#88).
- Terminar el caso se hace desde la propia respuesta: crear una escena final conectada, usar una existente o convertir una escena sin respuestas en final; «Crear una escena nueva ahora» crea y conecta en un paso, y un borrador dice en la lista que ya está guardado (#88).
- Una respuesta sin destino explica por qué lo necesita, ofrece crear la escena siguiente o un final, y lo escrito se respalda en la sesión del navegador (#88).
- La barra del editor cede en vez de encimarse: las etapas conservan su nombre desde 1280 px (#88).
- Estados vacíos del estudiante que dicen qué pasa, por qué y qué hacer; una sola acción principal por caso (#92).
- Con teclado, la acción principal del estudiante llega antes que las secundarias; al entrar a un caso el botón dice «Entrando…» y, si falla, explica qué pasó y ofrece reintentar (#92).
- Ningún botón apagado sin motivo en el portal del docente y de la administración; la cifra de pendientes cuadra en menú, resumen y pestañas (#89).
- Inicio de sesión: el ejemplo del correo va en la ayuda (ya no parece un valor), orden de foco corto y demostración de un clic solo en desarrollo; la marca dice Metafrónesis en todas las pantallas (#91).
- Las sesiones ya no piden espacio académico (#95).
- «Da unos pasos…» ya no es un aviso modal; los diálogos se adelantan o se saltan con clic, Espacio o Enter (#93).
- Juego: el texto se escribe más rápido, «Texto instantáneo» está en el propio diálogo, las páginas son cortas, «Tu decisión se guardó» aparece cuando el servidor lo confirma, una opción bloqueada dice qué herramienta falta y la tarjeta de controles empieza por el clic (#93).
- Juego: cada botón dice lo que pasa («Hablar con …» camina y abre la conversación; «Ir a …» solo camina), la acción del siguiente paso se marca como tal y las demás como opcionales, y al decidir se ve «Elegiste: …» (#93).
- Juego: «Ayuda» y «Ajustes» se distinguen sin depender del ícono (texto visible, o signo de interrogación frente a engranaje en pantalla pequeña) (#103).
- El portal se carga aparte del arranque: el paquete inicial baja de 487,8 kB a 474 kB (#103).

### Corregido
- La rúbrica del caso respondía 405 y no dejaba enviar a revisión; ahora `GET /api/rubrics/case-versions/{id}` la devuelve (#88).
- El envío exigía un tiempo estimado que ninguna pantalla pedía; ahora está en «Datos» (#88).
- Tras aceptar una invitación los casos tardaban hasta 60 s en aparecer (#92).
- Contraste de la etiqueta de cabecera (WCAG AA) y foco visible que no se pierde al cambiar de pantalla o cerrar un diálogo (#94).
- Tres botones cuyo nombre para lectores de pantalla no empezaba por el texto visible: «Interactuar» del juego, «Asignar a un grupo» y «Permiso de autoría» (#93, #89).
- «Reducir movimiento» se respeta en todo el portal con una sola regla, y el interruptor del juego dice lo mismo; el creador de avatar ofrece las cuatro vistas directas (#94, #92).
- El juego ya no deja atascado junto a una puerta, cabe con zoom al 200 % y muestra el progreso de carga (#93).
- Cinco contratos del juego fallaban en Windows por los saltos de línea (#93).
- El docente ve y cambia el orden en que su grupo hará los casos («Subir/Bajar»); un caso nuevo va al final, dos cambios a la vez ya no se pisan y docente y estudiante ven la misma secuencia (#89).
- La administración encuentra lo que debe aprobar: «Casos por aprobar (N)» arriba de «Revisión» (#89).
- Asociar una rúbrica la autoriza el dueño del caso, y «sin rúbrica» ya no oculta otros errores (#88).
- El estudiante puede leer su propio intento terminado aunque el caso ya no esté disponible; antes veía un 404 al consultarlo después de finalizar la sesión (#98).
- Los botones del juego respondían a veces solo al segundo clic porque se volvían a crear mientras se usaban; ahora conservan su identidad, y «Interactuar» con una persona lejana camina hasta ella y abre la conversación (#93).
- Crear una sesión propone el inicio (la próxima hora en punto) y el fin (una hora después), con un ejemplo de la fecha (#89).
- Administración: la lista de usuarios carga por bloques con su total, el permiso de crear casos está en el menú de cada docente y «Por aprobar» y «Solicitudes» vacíos explican qué entra en cada uno; Reportes separa la carga y el error de casos con «Reintentar» (#89).

### Seguridad
- Los borradores del editor se guardan por usuario en la sesión del navegador, caducan y se borran al cerrar sesión (#88).
- `GET /api/auth/demo/config` responde siempre `enabled: false` en producción sin consultar cuentas (#91).

### Migraciones
- `sesiones/0003_sesiones_con_grupo_y_estados`, `sesiones/0004_quitar_espacio_academico` y `sesiones/0005_recordatorio_enviado_en` (#87, #95, #98).
- `simulation/0017_acuerdo_de_coautoria` (#99).
- `simulation/0017_portada_de_version` y `simulation/0018_une_coautoria_y_portada`, que une las dos 0017 (#100).

### Operación
- Programar `python manage.py recordar_sesiones` cada 5 minutos, junto a `cerrar_sesiones_vencidas` (#98).
- Dependencia nueva: `Pillow==13.0.0` en `requirements.txt`; el despliegue tiene que instalarla (#100).

## [0.6.2] - 2026-11-23

Entorno de demostración con el caso insignia jugable, y el rol se elige al solicitar acceso.

### Añadido
- **`sembrar_demostracion`:** deja un entorno, producción incluida, listo para mostrar el simulador. Siembra 3 docentes y 12 estudiantes ficticios (`@demo.metafronesis.test`), 3 grupos con sus miembros, la rúbrica de primeros auxilios psicológicos para violencia basada en género y el caso insignia SIM-VBG-002 publicado con esa rúbrica y asignado a los grupos. La contraseña temporal común llega por `SIEP_SEMILLA_CLAVE`, nunca se imprime y se cambia al primer ingreso; es idempotente (#81).

### Cambiado
- **El rol se elige al solicitar acceso, no al iniciar sesión.** La solicitud guarda el rol pedido (migración `users/0006`) y el ADMIN lo ve al crear la cuenta; el rol definitivo lo decide el ADMIN (#78).

## [0.6.1] - 2026-11-23

Las salas por piezas del repositorio anterior, con su luz, el editor sin parpadeo y el proveedor de IA de NVIDIA.

### Añadido
- **Salas por piezas:** los casos nuevos, creados a mano o con la IA, copian cada sala de la biblioteca con su estructura completa (pisos, muros, puertas, ventanas, muebles, lámparas y el momento del día), y el juego y el editor la dibujan con las piezas y su luz: de día por las ventanas y de noche con la luna y las lámparas (#74).
- **Lugar hospital** en la biblioteca, que solo existe por piezas; el caso insignia ya lo encuentra (#74).
- La compuerta de publicación revisa dónde va cada pieza de una sala por piezas (#74).
- **Proveedor de IA de NVIDIA** (`AI_AUTHORING_PROVIDER=nvidia`): con `nvidia/nemotron-3-ultra-550b-a55b` el asistente de autoría propone en unos 17 s y guía en unos 3 s. La generación de casos todavía no pasa las reglas del documento con los modelos de NVIDIA (#79).

### Corregido
- Mover un personaje, un objeto, una ventana o una puerta en el editor ya no deja la sala en negro unos segundos (#75).

## [0.6.0] - 2026-11-23

Ola 3: el mundo por salas, el editor de casos completo, la IA de autoría y el frontend del estudiante y del docente. Con esta versión queda migrado todo lo del repositorio anterior.

### Añadido
- **Mundo de la simulación por salas** (SIEP-234):
  - modelos del mundo, leerlo, moverse y cruzar puertas (#47, #48);
  - pistas, interacciones, herramientas, reacciones y `expectedAttemptId`; bitácora, salida segura e informe del estudiante (#51, #53, integradas con #54).
- **Estado completo del intento** y consecuencia en las decisiones para el juego (#57).
- **Caso insignia SIM-VBG-002:** se carga y queda publicado con `python manage.py cargar_caso_insignia --minutos-estimados 45`, solo en desarrollo (#64).
- **Rúbricas, competencias y valoración docente** (#50).
- **Panel docente, reporte del grupo y reporte del estudiante** (#60).
- **Backend del editor de casos:** salas, mundo, diálogos, reglas y sugerencias de la IA (#55).
- **Ensayo del borrador:** la autora juega su caso en borrador en el mundo real del juego, con el panel del ensayo (opciones, comentarios, lo explorado y elegir escena) y por las rutas normales del juego (#58, #66).
- **IA de autoría**, apagada por defecto:
  - generación de casos por etapas (#62);
  - asistente que propone cambios validados contra el caso y guía por el editor, con cupo diario y mensual (#67).
- **Imagen única y despliegue en Google Cloud Run** (#52).
- **Frontend del estudiante:** inicio, casos, ficha, juego por salas, cierre del caso y personaje (#59).
- **Frontend del docente y de la administración:** inicios propios, rúbricas, revisión formativa, casos asignados y reportes (#56).
- **Frontend del editor de casos** (#61), conectado a la generación con IA (#65), al ensayo y al asistente (#68).
- **Tutorial guiado de creación de casos** sobre el editor, con la tarjeta «Aprende a crear un caso» en Casos; sus textos están en borrador, pendientes de Psicología (#70).
- **Sonidos y música ambiental propios del simulador** (#63).

### Corregido
- Clasificar una respuesta en el guion ya no deja el editor en negro, y la pestaña Evaluación se desplaza con la rueda (#69).
- El contrato «ninguna pantalla usa HttpClient directamente» vuelve a pasar (#71).

## [0.5.0] - 2026-11-22

Frontend de la primera ola y licencia.

### Añadido
- Frontend en `frontend/` (Angular 22): portada, acceso, cambio de contraseña, administración de usuarios y solicitudes de acceso, grupos con estudiantes, invitaciones e importación desde Excel, buzón de invitaciones del estudiante y páginas de error, conectado a la API de esta versión (#43).
- Licencia MIT, con los cuatro integrantes como titulares (#44).

## [0.4.0] - 2026-11-10

Entrega del backend: ola 2 de la migración.

### Añadido
- Revisión docente: consultar las participaciones de los grupos propios y registrar la retroalimentación general (#23).
- Eventos del dominio (patrón Observer) y notificaciones por correo y por la API (#24, #28).
- Asistentes de IA con el patrón Strategy, apagados por defecto y sin datos personales hacia el proveedor, y auditoría para el ADMIN (#31).
- Estado `INCOMPLETE`, nota parcial, cero para los ausentes y tiempo máximo del intento (#26).
- Volver a responder una escena, progreso y consultas del estudiante (#32).
- Permiso de autoría: un PROFESOR crea o edita casos solo si el ADMIN se lo otorga (#27).
- Exportar e importar casos en JSON (#30).
- Sesiones y convocatorias con código, con el patrón State, e ingreso tardío a la mitad de la duración, configurable con `SIEP_INGRESO_TARDIO_FRACCION` (#34).
- Repetición excepcional autorizada por el creador del caso y cierre automático de sesiones vencidas (#35).
- Ingreso del estudiante con el código de la convocatoria (#37).
- Reporte completo con ausentes, incompletos y por sesión (#36).
- Clasificación de datos personales de las columnas y tablas nuevas (#29).
- Semilla de demostración (#33) y lugares de registro de las apps de esta ola (#25).

### Cambiado
- La prueba del tamaño máximo reconoce la ruta de importación de casos (#38).
- Migración sobre una tabla existente: el estado `INCOMPLETE` del intento (#26).

## [0.3.0] - 2026-11-10

Ola 1 de la migración del backend.

### Añadido
- Puntos de extensión: cada app declara la auditoría de sus rutas en su `superficie.py` (#13).
- Tiempo estimado de la versión del caso, con migración `0004` (#15).
- Borrador del caso con su ficha, con el patrón Builder (#20).
- Escenas y decisiones con su justificación (#21).
- Validación del caso recorriéndolo como árbol (Composite); enviar a revisión, publicar, archivar y clonar versiones (#17).
- Reporte de participación del grupo en CSV o JSON, con el patrón Adapter (#18).
- Rúbrica y calificación del intento con estrategias intercambiables (#16).
- Resultado final del intento con la retroalimentación (#22).

### Cambiado
- **RN-10:** `POST /decisions` ya no devuelve `feedback` ni `response_class`; las justificaciones se ven en `GET /api/simulation/attempts/<id>/result` cuando el intento termina (#22).
- El proyecto arranca con su configuración principal: se retiraron las apps y rutas que no se migraron (#10) y el CI usa `psychosim.settings.test` (#15).
- Corrección de los antipatrones identificados en el análisis de ADSI (#12).
- Trazabilidad con Jira (#8).
- Pruebas de `users` y de `grupos` con datos propios, sin depender del repositorio anterior (#19, #14).

## [0.2.0] - 2026-11-03

Sprint 4.

### Añadido
- Auditoría, revisión de caso, rúbrica y contratos de la simulación (#6).

## [0.1.0] - 2026-11-03

Base del backend (sprints 1 a 3).

### Añadido
- Fichas de los cuatro sprints (#1).
- Base y autenticación: `psychosim` y `users` (#3).
- Privacidad y grupos (#2).
- Plataforma transversal: respuesta uniforme, permisos, límites y cabeceras (#5).
- API de casos e intentos con acceso por asignaciones y ciclo State, motor mínimo, evaluación y progresión por Observer (#4).
- Biblioteca por API con catálogo externo configurable y validación de rutas (#4).
- Pruebas de concurrencia PostgreSQL en CI (#4).

[Sin publicar]: https://github.com/Jsua3/metafronesis/compare/v0.5.0...develop
[0.5.0]: https://github.com/Jsua3/metafronesis/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Jsua3/metafronesis/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Jsua3/metafronesis/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Jsua3/metafronesis/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Jsua3/metafronesis/releases/tag/v0.1.0
