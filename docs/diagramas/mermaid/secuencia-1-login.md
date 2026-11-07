# Inicio de sesión

Las flechas de despacho HTTP resumen la configuración de rutas y el código de las vistas; el framework es externo al corte.

```mermaid
sequenceDiagram
    actor U as Persona
    participant R as URLs
    participant V as LoginView
    participant S as LoginSerializer
    participant M as CustomUser
    participant A as account_service
    participant E as audit_events
    U->>R: POST login [1]
    R->>V: LoginView [1]
    V->>S: validar datos [2]
    V->>M: buscar por email [3]
    V->>V: bloqueo por fallos [3]
    V->>A: temporary_password_expired [4]
    alt contraseña utilizable
    V->>M: check_password [5]
    else cuenta o clave no utilizable
    V->>V: burn_password_check [5]
    end
    opt clave temporal caducada
    V->>A: return_expired_to_pending [6]
    end
    alt credenciales inválidas
    V->>V: registrar fallo [7]
    V->>E: login_failed [7]
    opt bloqueo activado
    V->>E: login_locked [7]
    end
    V-->>U: AuthenticationFailed [7]
    else acceso válido
    V->>E: login_succeeded [8]
    V-->>U: token y usuario [8]
    end
```

<details>
<summary>Ver como imagen (respaldo si GitHub no dibuja el diagrama)</summary>

![secuencia-1-login](../img/secuencia-1-login.png)

</details>

## Evidencia

1. `psychosim/urls.py:70`, `apps/users/urls.py:13` — ruta y vista.
2. `apps/users/views.py:140`, `apps/users/serializers.py:179` — validación.
3. `apps/users/views.py:145`, `apps/users/views.py:148`, `apps/users/views.py:149` — búsqueda y bloqueo.
4. `apps/users/views.py:153` — expiración.
5. `apps/users/views.py:156`, `apps/users/views.py:159`, `apps/users/models.py:102` — comprobación.
6. `apps/users/views.py:161` — clave caducada.
7. `apps/users/views.py:164`, `apps/users/views.py:165`, `apps/users/views.py:167`, `apps/users/views.py:169`, `apps/users/views.py:171` — fallo.
8. `apps/users/views.py:173`, `apps/users/views.py:174` — éxito.

## Sin verificar

- Revisión del orden y ejecución real del flujo por el responsable.
- Resultado de pruebas y composición incremental del corte.
