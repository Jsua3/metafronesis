Borrador generado a partir del código; verificar antes de publicar

# privacy

**Responsable/corte:** Juan, S2 (el manifiesto del corte).

## Propósito y modelo

Gestiona consentimiento asociado a avisos de contenido y tratamiento de datos, exportación/supresión e inventario de datos (apps/privacy/models.py:1, apps/privacy/services.py:151, :361, :441).

ConsentRecord (apps/privacy/models.py:27) tiene FK person→AUTH_USER_MODEL protegida y case_version→simulation.CaseVersion opcional; campos adicionales consent_type, notice_version, accepted_at y withdrawn_at. La regla del modelo exige versión de caso para CONTENT_NOTICE; DATA_TREATMENT puede carecer de caso. Constraints impiden duplicar una aceptación vigente por persona/tipo/caso/versión. Se retira con timestamp, no se edita.

## Servicios y funciones públicas

- consent_service.py: consent_state, accept_content_notice, withdraw_content_notice, estado/aceptación de tratamiento y require_consent (apps/privacy/consent_service.py:164, :226, :254).
- services.py: export_person, erase_person, purge_expired, verificar_ejecutor (apps/privacy/services.py:151, :361, :441).
- data_subject.py: inventario declarativo, seudonimización y validar_cobertura (apps/privacy/data_subject.py:517).
- audit_events.py centraliza eventos de privacidad (apps/privacy/audit_events.py:1).

## Endpoint

apps/privacy/urls.py:7 define cases/<int:case_version_id>/consent; psychosim/urls.py:98 incluye esa URLConf bajo api/simulation/. GET, POST, DELETE resuelven /api/simulation/cases/<id>/consent; ConsentView ajusta permisos por método (apps/privacy/views.py:33). Usa autenticación DRF por defecto y serializer de apps/privacy/serializers.py:1. Sprint S2 según el corte; la nota de settings aconseja activación gradual con el acumulado S2/S3. La activación exacta para el nuevo repo debe revisarse. Ver tabla API.

## Señales, configuración y pruebas

PrivacyConfig declara label privacy (apps/privacy/apps.py:4). No se observan señales Django propias. Variables de retención/aviso aparecen en .env.example:69 y :83. Hay 11 módulos de prueba S2, por ejemplo inventario (el manifiesto del corte). Resultados: sin verificar.

## Diseño y riesgos conocidos

Registro de evidencia no destructivo y constraints DB: apps/privacy/models.py:27. No se declara SOLID global. La FK string a simulation crea dependencia de registry; users↔privacy aparece en el grafo de imports. privacy/inventory.py importa settings solo al ejecutarse como script según romper-ciclo.md. Propuestas pendientes. Ver también settings-urls-por-sprint.md; ninguna recomendación de esa nota se aplica mediante estos borradores.
