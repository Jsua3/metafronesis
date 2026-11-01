Borrador generado a partir del código; verificar antes de publicar

# `users`

**Responsable/corte:** Emerson, S1 (el manifiesto del corte). Algunas pruebas están en S2; respetar sprint del archivo.

## Propósito y modelos

CustomUser (apps/users/models.py:44) contiene campos id, password, email, nombre, apellido, role, activo, created_at, must_change_password, session_epoch y temp_password_set_at; no tiene FK. AccessRequest (apps/users/models.py:150) contiene nombre, apellido, email, status, created_at y reviewed_at; no tiene FK. Roles ADMIN, PROFESOR y ESTUDIANTE (apps/users/models.py:19).

## Servicios y funciones públicas

- `services/account_service.py`: `approve_pending`, `change_password`, `revoke_sessions`, expiración/rotación de claves, validación de último admin y alta/reset administrativo (`apps/users/services/account_service.py:112, :194, :209`).
- `services/access_request_service.py`: crear, listar, resolver y reconciliar solicitudes pendientes por correo (`apps/users/services/access_request_service.py:69`).
- `services/audit_events.py`: emite eventos de autenticación y cambios de cuentas (`apps/users/services/audit_events.py:1`).
- `authentication.py` valida tokens/estado de cuenta (`apps/users/authentication.py:1`); `google_verification.py` verifica credenciales externas (`apps/users/google_verification.py:1`).

## Endpoints

El include `api/auth/` resuelve a `apps/users/urls.py:13`: login, Google login/config, solicitud de acceso, perfil propio y cambio de contraseña. Logout y administración se declaran en `psychosim/urls.py:72`, `:108`–`:114`. Métodos, serializers/permisos inferidos del código están en [API](../api.md). En corte: S1; las rutas admin siguen S1 si sus archivos quedan incluidos.

## Señales/hooks y configuración

`UsersConfig.ready()` registra checks y precalienta hash ficticio (`apps/users/apps.py:4`). Usa `AUTH_USER_MODEL` registrado como `users.CustomUser` (`psychosim/settings/base.py:92`), BCrypt, validadores de contraseña, JWT y settings Google/correo (`psychosim/settings/base.py:134`, `:230`, `:220`; `apps/users/password_validators.py:1`). No se observan señales Django declaradas por esta app en el corte.

## Pruebas y diseño

Hay tests de auth y modelos, solicitudes, Google, contraseñas y gestión de cuenta (el manifiesto del corte; apps/users/tests/test_auth.py:1). Resultados de ejecución sin verificar.

- Evidencia de Manager propio y usuario sin columnas de permisos heredadas: `CustomUserManager` en `apps/users/models.py:24`, `CustomUser` en `:44`. Esto verifica personalización de la interfaz de autenticación, no SOLID global.
- Servicio de cuenta separado de adaptadores HTTP: `apps/users/views.py:140`, `apps/users/services/account_service.py:112, :194, :209`. Separación de responsabilidades local verificable.

## Riesgos conocidos

El grafo muestra `users→privacy` y `privacy→users`, además de dependencia con security/shared (`grafo-imports.csv`, filtrado al corte). El caso de imports desde `account_service` hacia simulation/privacy se describe con líneas concretas en [romper-ciclo.md](../../romper-ciclo.md). La importación de auditoría en account service es dependencia directa a simulation según esa nota; extracción propuesta, no aplicada. En el nuevo S1 puede fallar carga si settings/serializers eager mantienen el ciclo.
