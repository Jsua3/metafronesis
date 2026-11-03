# Diagramas del corte realmente implementado

```mermaid
classDiagram
  SimulationCase "1" --> "*" CaseVersion
  CaseVersion "1" --> "*" SimulationNode
  CaseVersion "1" --> "*" DecisionOption
  CaseVersion "1" --> "*" SimulationAttempt
  CustomUser "1" --> "*" SimulationAttempt : propietario
  SimulationAttempt "1" --> "*" AttemptEvent
  SimulationAttempt --> SimulationNode : current_node
  CaseAssignment --> CaseVersion
  CaseAssignment --> Grupo
  GrupoEstudiante --> Grupo
  GrupoEstudiante --> CustomUser
```

```mermaid
sequenceDiagram
  actor Estudiante
  participant API
  participant Access
  participant DB
  Estudiante->>API: POST /api/attempts {case_version_id}
  API->>DB: Iniciar transacción y bloquear usuario
  API->>Access: Publicación, sello y asignación vigente
  Access->>DB: Consultar membresía y ventana
  alt Sin acceso
    API-->>Estudiante: 404
  else Con acceso
    API->>DB: Buscar intento abierto
    alt Ya existe
      API-->>Estudiante: 200 intento existente
    else Nuevo
      API->>DB: Crear intento y evento; confirmar
      API-->>Estudiante: 201 intento nuevo
    end
  end
```

```mermaid
stateDiagram-v2
  [*] --> IN_PROGRESS
  IN_PROGRESS --> PAUSED: pause
  PAUSED --> IN_PROGRESS: resume
  IN_PROGRESS --> REPLACED: replace
  PAUSED --> REPLACED: replace
  IN_PROGRESS --> COMPLETED: decisión a nodo terminal
  COMPLETED --> [*]
  REPLACED --> [*]
```

SAFE_EXITED solo se conserva como estado histórico; ninguna orden nueva lo genera.

## Decisión, evaluación y progresión S4

```mermaid
sequenceDiagram
  actor Estudiante
  participant API
  participant Motor
  participant DB
  participant Progresion
  Estudiante->>API: decisión + request_id
  API->>DB: Iniciar transacción y bloquear intento
  alt request_id ya registrado
    API-->>Estudiante: Respuesta guardada
  else Orden nueva
    API->>Motor: Validar escena y segunda oportunidad
    alt Primer riesgo con segunda oportunidad
      Motor->>DB: Guardar evento de reintento sin efectos
    else Decisión registrada
      Motor->>DB: Aplicar efectos, avanzar y guardar evento
      opt Nodo terminal
        Motor->>DB: Congelar evaluación con evidencia
        Motor->>Progresion: attempt_completed
        Progresion->>DB: Registrar finalización única
      end
    end
    API->>DB: Confirmar transacción
    API-->>Estudiante: Resultado
  end
```

Si falla un suscriptor, toda la transacción se revierte. Biblioteca solo lee el catálogo JSON externo; no participa en la transacción de decisiones.
