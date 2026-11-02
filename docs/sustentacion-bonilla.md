# Guía de sustentación: Bonilla

## Explicación breve

Mi bloque recibe un caso publicado que el estudiante tenga asignado. Abre un solo intento activo por versión y permite consultar, pausar, reanudar o reemplazar ese intento. Cada decisión comprueba la escena actual y aplica los efectos declarados. Al llegar al final guarda la evidencia, congela una evaluación formativa mínima y registra la finalización para habilitar el siguiente caso.

La biblioteca permite al profesor consultar lugares de un catálogo JSON externo. El paquete recibido no trae ese catálogo ni imágenes: la integración está implementada y se prueba con archivos temporales, pero el índice de entrega está vacío.

## Archivos que debo poder explicar

| Archivo | Qué demuestra |
|---|---|
| apps/simulation/services/attempt_lifecycle.py | State: tabla de capacidades y transiciones permitidas |
| apps/simulation/services/access.py | Asignación vigente, publicación y membresía aceptada |
| apps/simulation/services/attempt_api.py | Coordinación de la transacción, reintento e idempotencia |
| apps/simulation/services/response_effects.py | Efectos como función pura sobre una copia del estado |
| apps/simulation/assessment/evaluation.py | Evidencia explícita y evaluación congelada |
| apps/simulation/signals.py y apps/progression/apps.py | Observer: el motor anuncia el cierre y progresión se suscribe |
| apps/progression/access.py | Bloqueo del siguiente caso hasta completar los anteriores |
| apps/biblioteca/services/lugares.py | Lectura del catálogo y validación de rutas |
| apps/simulation/services/ai_providers.py | Strategy y Adapter; construcción centralizada por fábrica simple |

## Preguntas frecuentes

**¿Cómo evitas dos intentos por doble clic?** El inicio bloquea la fila del usuario durante la transacción, consulta el intento abierto y reutiliza ese registro. Una restricción única condicional protege además la base de datos.

**¿Cómo evitas aplicar dos veces una decisión?** Cada orden lleva request_id. Se bloquea la fila del intento antes de consultar el evento. Una clave repetida devuelve la respuesta guardada; si cambia la opción, se rechaza. La base también impone unicidad por intento y request_id.

**¿Qué pasa con una decisión riesgosa?** Si el caso declara secondChance, el primer riesgo de esa escena genera un evento de reintento sin avanzar ni aplicar efectos. Una segunda elección se registra normalmente. El reintento no cuenta como decisión aplicada en la evaluación.

**¿Dónde aparece SOLID?** En la separación de responsabilidades: acceso decide disponibilidad, reglas normaliza datos, efectos transforma estado, evaluación interpreta evidencia declarada y el servicio coordina la persistencia. No afirmo que todo el sistema legado cumpla SOLID.

**¿Qué antipatrón corregiste?** Imports que traían autoría, mundo y rúbricas fuera del sprint. El corte exporta solo los modelos necesarios y mantiene un vocabulario local. Todavía hay campos heredados de autoría que la API mínima no usa.

**¿La evaluación equivale a una calificación psicológica?** No. Está marcada BORRADOR. Solo conserva niveles explícitos declarados en efectos, con evidencia de los eventos y una regla técnica documentada. Requiere revisión docente/Psicología.

**¿Qué ocurre si falla la finalización?** Un fallo del suscriptor revierte la decisión, la evaluación y la progresión porque se ejecutan dentro de la misma transacción. Hay una prueba que provoca ese fallo y verifica el rollback.

**¿Por qué no copiaste la migración original?** Incluía muchos modelos fuera del corte. Se generó una inicial con caso, versión, nodo, opción, intento y evento, y una migración aditiva S4. La inicial de grupos para base vacía debe conciliarse con Juan si ya existe un historial aplicado.

**¿Qué falta para integrar?** Acordar los permisos y las reglas propuestas con Juan, conciliar las dependencias e historial S1/S2, conectar la configuración final de autenticación y aportar el catálogo real. No confundir el corte probado con el porcentaje global de la entrega.

## Demostración reproducible

```sh
.venv/bin/python manage_s3.py check
.venv/bin/python manage_s3.py makemigrations --check --dry-run
.venv/bin/python -m pytest apps/simulation/tests/test_s3_api.py apps/simulation/tests/test_s4_engine.py apps/biblioteca/tests -q
```

Abrir el PR #4, mostrar los commits por módulo y los diagramas Mermaid. La revisión corresponde a Juan; no autoaprobarse, fusionar ni crear etiquetas de cierre antes de su aceptación.
