# Cómo contribuir

## Información compartida del proyecto

- [SIEP Home](https://unihumboldt-team-p0nfba0h.atlassian.net/wiki/spaces/S/overview): entrada a los documentos y vistas del equipo.
- [Requisitos del PMV](https://unihumboldt-team-p0nfba0h.atlassian.net/wiki/pages/viewpage.action?pageId=7045123): RF, RN, casos de uso y Excel de referencia.
- [Cronograma y sprints](https://unihumboldt-team-p0nfba0h.atlassian.net/wiki/pages/viewpage.action?pageId=6651906).
- [Plus posteriores](https://unihumboldt-team-p0nfba0h.atlassian.net/wiki/pages/viewpage.action?pageId=7241729): los RNF son mejoras opcionales después del PMV.

## Trazabilidad con Jira y GitHub

Antes de empezar, identificar la tarjeta y sus criterios de aceptación. Incluir su clave `SIEP-N` en la rama, los commits y el título del PR. Por ejemplo: rama `feature/SIEP-19-permiso-docente`, commit `feat(users): comprobar permiso docente (SIEP-19)` y PR `SIEP-19: comprobar permiso de creación docente`.

Con la aplicación GitHub for Atlassian correctamente conectada, estas claves permiten asociar ramas, commits y PR al panel de desarrollo de Jira. La convención no instala ni verifica esa conexión. [Configuración oficial](https://support.atlassian.com/jira-cloud-administration/docs/integrate-with-github/).

El PR debe enlazar la tarjeta, los RF/RN/CU aplicables y los resultados de prueba. La revisión cruzada y la integración de código son evidencias; finalizar la historia requiere comprobar también sus criterios de aceptación. Evitar cerrar automáticamente una historia solo porque se fusionó un PR. Una historia puede necesitar varios cambios y pruebas integradas.

Las estimaciones y los responsables se acuerdan con el equipo; no deducirlos de los nombres de archivos ni inventar puntos. Registrar dependencias reales con enlaces de bloqueo en Jira, sin impedir preparación en paralelo cuando sea posible.

## Ramas (Git Flow)

- `main`: versiones demostrables, protegida. Solo recibe PR desde `develop`
- `develop`: integración. Todo trabajo entra por PR.
- `feature/<sprint>-<tema>`: una por responsabilidad, creada desde `develop`. Ejemplos: `feature/s1-base-autenticacion`, `feature/s2-privacidad-grupos`.
- `fix/<tema>` para correcciones y `docs/<tema>` para documentación.

## Pull Requests

1. Abre el PR contra `develop` usando la plantilla.
2. **Otra persona del equipo** lo revisa y lo aprueba; nadie aprueba su propio PR.
3. Se fusiona con *merge commit* o *squash* y se borra la rama.
4. Al cerrar el sprint se abre un PR `develop` → `main`, se actualiza `CHANGELOG.md` y se crea la etiqueta anotada (`v0.1.0`, `v0.2.0`, ...). Una etiqueta publicada no se mueve.

## Mensajes de commit (Conventional Commits)

`tipo(alcance): descripción en imperativo`

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`. Alcance: la app (`users`, `grupos`, `privacy`, `simulation`, `shared`, `security`, `psychosim`).
Ejemplos: `feat(users): agregar cambio de contraseña`, `test(grupos): cubrir invitaciones vencidas`.

## Calidad mínima antes de pedir revisión

- Las pruebas de tu bloque pasan.
- No hay secretos ni datos personales en el código ni en los datos de prueba.
- Cada clase o módulo nuevo tiene una responsabilidad clara (SOLID) y no importa código de un sprint posterior.
- Las migraciones se crean con `makemigrations` y se revisan; no se editan migraciones ya fusionadas.
