Borrador generado a partir del código; verificar antes de publicar

# `security`

**Responsable/corte:** Leyton, S1 (junto con shared; el manifiesto del corte).

## Propósito y modelo

Controles HTTP para solicitudes abusivas, limitación de frecuencia y reporte CSP. `RateLimitBucket` tiene PK compuesta `(scope, key_hash, window_start)` y campo `count`; almacena hash y no email/IP en claro (`apps/security/models.py:10`).

## Servicios/funciones públicas

`limiter.py` expone `key_hash`, `hit`, `peek`, `retry_after` (`apps/security/limiter.py:1`). `CspReportView` recibe reportes con parsers acotados (`apps/security/csp_report.py:202`). `limits.py` define configuraciones/límites (`apps/security/limits.py:1`); `throttling.py` conecta clases DRF (`apps/security/throttling.py:1`).

## Endpoints

`POST /api/security/csp-report` se declara en `psychosim/urls.py:69`; view `CspReportView`, anónimo con rate limit por IP (`apps/security/csp_report.py:202`). Serializer: parser especializado (`CspReportParser`/`ReportsJsonParser`), no serializer DRF de modelo (`apps/security/csp_report.py:1`). Sprint S1. Ver tabla [API](../api.md).

## Hooks y configuración

`SecurityConfig` identifica la app (`apps/security/apps.py:4`). En base settings, security se instala y se conecta a throttling (`psychosim/settings/base.py:39`; `shared/client_ip.py:1`). No hay señales Django propias observadas. DB PostgreSQL es backend del bucket para compartir estado entre workers (`apps/security/models.py:1`).

## Pruebas existentes

Nueve módulos de prueba S1 cubren CSP (el manifiesto del corte) y throttling (el manifiesto del corte). Los nombres muestran intención, no ejecución; resultado sin verificar.

## Diseño y riesgos

La clave hash y persistencia multi-worker son decisiones documentadas en el modelo (`apps/security/models.py:1`). `psychosim/urls.py` importa la vista CSP en el módulo raíz (`psychosim/urls.py:22`); al crear URLConfs incrementales, conservar el endpoint solo cuando security está incluido. El grafo también muestra security↔users/simulation; revisar dependencias recíprocas en [romper-ciclo.md](../../romper-ciclo.md). No se afirma cumplimiento SOLID integral.
