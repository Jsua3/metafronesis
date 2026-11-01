Borrador generado a partir del código; verificar antes de publicar

# `shared`

**Responsable/corte:** Leyton, S1 (junto con security; el manifiesto del corte). No es una Django app registrada; son módulos compartidos importados por las apps (psychosim/settings/base.py:22).

## Propósito

Funciones transversales de red, identidad, logging, parser, permisos/policies, respuestas, límites de cuerpo, cabeceras, health y soporte de pruebas. No declara modelos propios en el corte.

## Servicios y funciones públicas

- `health(request)` informa disponibilidad (`shared/health.py:18`).
- `policy_permission(resource, action)` genera la permission DRF según políticas (`shared/permissions.py:23`); `shared/policies.py:1` define reglas.
- `IdentityPresenter` normaliza/proyecta datos de identidad (`shared/identity.py:1`).
- Infraestructura observada: `shared/middleware.py:1`, `shared/body_limit.py:1`, `shared/exceptions.py:1`, `shared/parsers.py:1`, `shared/security_headers.py:1`, `shared/client_ip.py:1`, `shared/idempotency.py:1`.

## Endpoints

`GET /api/health` usa `shared.health.health` y está declarado en `psychosim/urls.py:67` (público). No es un endpoint independiente por cada módulo shared. El inventario de API está en [API](../api.md). Sprint S1.

## Señales/hooks y configuración

No se encontraron modelos ni señales Django propias. Se activa desde middleware y configuración DRF: `shared.middleware.RequestContextMiddleware`, parsers, exception handler y default permission (`psychosim/settings/base.py:46`, `:138`). Requiere settings Django cargados; `shared` no se registra como app.

## Pruebas existentes

El corte contiene 36 archivos de prueba shared; ejemplos: health/logging y políticas (el manifiesto del corte, :276). Resultado no ejecutado, sin verificar.

## Diseño, SOLID y riesgos

Las funciones transversales se separan por módulo/tema (por ejemplo health y permiso), observable en los paths citados. No se adjudica una clase SOLID general. `grafo-imports.csv` muestra `shared↔psychosim` y `shared↔simulation/users`; son imports concretos del corte, no solo dependencias conceptuales. La nota de ruptura recomienda mover usos de settings a límites de composición y extraer contratos neutrales (`../romper-ciclo.md`); propuestas pendientes. `psychosim/settings/base.py` importa shared en la construcción del stack, así que al cortar apps hay que revisar imports eager.
