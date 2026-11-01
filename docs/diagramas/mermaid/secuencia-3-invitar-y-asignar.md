# Invitar y asignar

Las flechas de despacho HTTP resumen la configuración de rutas y el código de las vistas; el framework es externo al corte.

```mermaid
sequenceDiagram
    actor P as Docente
    actor E as Estudiante
    participant R as URLs
    participant V as GrupoEstudiantesView
    participant S as AgregarEstudianteSerializer
    participant G as services grupos
    participant M as memberships
    participant IV as MeInvitationAcceptView
    participant GE as GrupoEstudiante
    participant N as notifications
    participant A as GrupoCasosView
    participant AS as AsignarCasoSerializer
    participant CA as CaseAssignment
    P->>R: POST estudiantes [1]
    R->>V: GrupoEstudiantesView [1]
    V->>S: is_valid [2]
    V->>G: agregar_estudiante [2]
    G->>G: _invitar_por_correo [3]
    opt estudiante encontrado
    G->>M: invite [3]
    M->>GE: get_or_create y posible actualización [4]
    end
    opt notificación aplicable
    G->>N: notify_invitation [5]
    end
    V-->>P: respuesta genérica [2]
    E->>R: POST aceptar invitación [6]
    R->>IV: MeInvitationAcceptView [6]
    IV->>M: accept [6]
    M->>GE: actualizar estado invitado [7]
    P->>R: POST casos [8]
    R->>A: GrupoCasosView [8]
    A->>AS: is_valid [9]
    A->>G: asignar_caso [9]
    G->>CA: get_or_create [10]
    opt asignación existente inactiva
    G->>CA: activar y guardar [10]
    end
    A-->>P: Caso asignado [9]
```

<details>
<summary>Ver como imagen (respaldo si GitHub no dibuja el diagrama)</summary>

![secuencia-3-invitar-y-asignar](../img/secuencia-3-invitar-y-asignar.png)

</details>

## Evidencia

1. `psychosim/urls.py:75`, `apps/grupos/views.py:84` — ruta y vista.
2. `apps/grupos/views.py:94`, `apps/grupos/views.py:95`, `apps/grupos/views.py:97`, `apps/grupos/views.py:100` — validación y respuesta.
3. `apps/grupos/services.py:783`, `apps/grupos/services.py:790`, `apps/grupos/services.py:795` — búsqueda e invitación.
4. `apps/grupos/memberships.py:61`, `apps/grupos/memberships.py:74`, `apps/grupos/memberships.py:80` — persistencia.
5. `apps/grupos/services.py:798`, `apps/grupos/services.py:800` — notificación condicional.
6. `psychosim/urls.py:80`, `apps/grupos/views.py:276`, `apps/grupos/views.py:281` — aceptación.
7. `apps/grupos/memberships.py:127`, `apps/grupos/memberships.py:102`, `apps/grupos/memberships.py:106` — respuesta.
8. `psychosim/urls.py:89`, `apps/grupos/views.py:152` — ruta de asignación heredada.
9. `apps/grupos/views.py:160`, `apps/grupos/views.py:161`, `apps/grupos/views.py:164` — validación y asignación.
10. `apps/grupos/services.py:812`, `apps/grupos/services.py:823`, `apps/grupos/services.py:826` — persistencia.

## Sin verificar

- Revisión del orden y ejecución real del flujo por el responsable.
- Resultado de pruebas y composición incremental del corte.
