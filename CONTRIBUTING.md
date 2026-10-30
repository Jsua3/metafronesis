# Cómo contribuir

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
