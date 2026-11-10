Borrador generado a partir del código; verificar antes de publicar

# `psychosim`

**Responsable/corte:** Emerson, S1 (junto con users; el manifiesto del corte).

## Propósito

Paquete de proyecto Django: configuración común y por entorno, aplicación WSGI y URLConf raíz. `base.py` registra todas las apps del backend completo (`psychosim/settings/base.py:22`); el nuevo repo debe reducir esa lista y los imports eager conforme al acumulado por sprint ([nota de settings/URLs](../../settings-urls-por-sprint.md)).

## Modelos, servicios y hooks

No declara modelos ni servicios de dominio propios en el corte. `AUTH_USER_MODEL` apunta a `users.CustomUser` (`psychosim/settings/base.py:92`). `psychosim/urls.py` instala middleware/funciones de dispatch; no hay señales propias observadas.

## Endpoints

URLConf raíz en `psychosim/urls.py:67`; despacha health, CSP report, auth, grupos y biblioteca, además de incluir rutas de privacidad. La tabla consolidada y los límites de inclusión está en [API](../api.md). En el corte incremental se deben montar por etapa: auth/health/security en S1; grupos/privacy en S2; rutas de simulation únicamente desde S3/S4.

## Configuración necesaria

| psychosim.settings.base | Configuración compartida: apps, middleware, DB, autenticación/DRF. | psychosim/settings/base.py:22, :44, :79, :92, :101, :133 |

## Pruebas

El corte no enumera pruebas propias de `psychosim`. Settings test exige una base aislada (`psychosim/settings/test.py:40`); el comportamiento de configuración se cubre también desde tests de `shared` (por ejemplo `shared/tests/test_production_settings.py`, en corte S1). Cobertura exacta del futuro repo: sin verificar.

## Diseño demostrado y riesgos

- Separación de perfiles de configuración por módulo verificable en los tres settings anteriores; no implica que el URLConf raíz esté aislado por sprint.
- Riesgo: `psychosim/urls.py` importa en el nivel de módulo vistas de grupos/simulation fuera de S1 (`psychosim/urls.py:10`, `:26`); retirar solamente includes no elimina esos imports.
- Riesgo de integración: lista actual `INSTALLED_APPS` carga apps futuras (`psychosim/settings/base.py:22`); no copiarla completa en cada sprint. El plan de extracción y riesgos no aplicados están en [romper-ciclo.md](../../romper-ciclo.md).
