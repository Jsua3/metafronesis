# Despliegue en Azure (SIEP-237)

Esta guía deja Metafronesis en línea en **Azure Container Apps** con **PostgreSQL Flexible Server**, pensada para una
suscripción **Azure for Students** (US$100 de crédito por 12 meses, sin tarjeta). Cualquier integrante con acceso de
propietario a la suscripción puede seguirla de principio a fin.

## 1. Arquitectura y costos

```
Navegador ──HTTPS──▶ Container Apps (ingreso administrado, TLS)
                         │
                         ▼
                 Contenedor «metafronesis» (gunicorn + Django)
                   ├─ /api/**  → API (DRF)
                   └─ resto    → SPA de Angular (WhiteNoise + index.html con nonce de la CSP)
                         │  TLS (sslmode=require)
                         ▼
                 PostgreSQL Flexible Server 17 (B1ms)
```

| Pieza | Recurso | Costo aproximado (precio de lista, USD/mes) |
|---|---|---|
| Backend + frontend | Container Apps, plan de consumo, 0,5 vCPU / 1 GiB, 1 réplica | ~8–10 con la réplica siempre encendida; ~0 si escala a cero |
| Imagen | GitHub Container Registry (`ghcr.io/jsua3/metafronesis`) | 0 (repositorio público) |
| Base de datos | PostgreSQL Flexible Server, Burstable B1ms, 32 GB | ~16; en muchas suscripciones de estudiante es gratis 12 meses (revisa «Servicios gratuitos» en el portal) |
| Secretos | Secretos de la Container App | 0 |
| Dominio y HTTPS | `<app>.<entorno>.<región>.azurecontainerapps.io` con certificado administrado | 0 |
| Logs | Log Analytics (lo crea el entorno) | 0 hasta 5 GB/mes |

Decisiones y por qué:

- **Una sola imagen.** Django ya sirve el frontend: la vista `shared.spa.spa_index` escribe el nonce de la política de
  contenido en cada `index.html`. Un frontend aparte (Static Web Apps) rompería ese nonce y obligaría a CORS.
- **Migraciones al arrancar.** El `CMD` del `Dockerfile` corre `migrate --noinput` y luego `exec gunicorn`. Por eso la app
  va con **una réplica como máximo**: dos réplicas arrancando a la vez migrarían a la vez.
- **No hay `collectstatic`.** El proyecto no instala `django.contrib.staticfiles`; WhiteNoise sirve el build de Angular
  copiado en `frontend_dist/`.
- **Logs.** Django escribe una línea JSON por petición (con `request_id`) en la consola del contenedor; Container Apps la
  envía a Log Analytics.

## 2. Qué necesitas

- Ser propietario (Owner) de la suscripción Azure for Students.
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) 2.60 o más reciente (`az version`).
- [GitHub CLI](https://cli.github.com/) con sesión iniciada (`gh auth status`) y permisos de administración del repositorio.
- Docker Desktop, solo si publicas la primera imagen desde tu equipo (paso 4, opción B).
- Python 3 en el PATH: los comandos de abajo lo usan para generar secretos.

Todos los comandos son de **PowerShell** y se corren **en la misma ventana**: las variables (`$RG`, `$APP`…) viven en
esa sesión. Los secretos se generan dentro de variables y nunca se escriben ni se muestran; no los copies a archivos,
chats ni capturas.

## 3. Iniciar sesión y preparar la suscripción

```powershell
az login
az account show --query "{suscripcion:name, tipo:subscriptionPolicies.quotaId, estado:state}" -o table
```

`tipo` debe empezar por `AzureForStudents`. Si tienes varias suscripciones, elige la de estudiante con
`az account set --subscription "<nombre o id>"`.

Azure for Students solo deja crear recursos en algunas regiones. Para ver cuáles:

```powershell
az policy assignment list --query "[].{politica:displayName, regiones:parameters.listOfAllowedLocations.value}" -o json
```

Variables de la sesión (cambia `$LOC` si `eastus2` no está permitida; `$SUF` hace único el nombre del servidor):

```powershell
$RG  = "rg-metafronesis"
$LOC = "eastus2"
$SUF = -join ((97..122) + (48..57) | Get-Random -Count 5 | ForEach-Object { [char]$_ })
$PG  = "pg-metafronesis-$SUF"
$CAE = "cae-metafronesis"
$APP = "metafronesis"
$IMG = "ghcr.io/jsua3/metafronesis:latest"
```

Registra los proveedores que se usan (una sola vez por suscripción) y crea el grupo de recursos:

```powershell
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait
az provider register --namespace Microsoft.DBforPostgreSQL --wait
az group create --name $RG --location $LOC
```

## 4. Primera imagen en GHCR

La Container App necesita una imagen publicada antes de crearse. Elige una opción.

**A. Con GitHub Actions (cuando el workflow ya está en `main`).** Al fusionar en `main`, el workflow
[`despliegue-azure.yml`](../.github/workflows/despliegue-azure.yml) construye, prueba y publica
`ghcr.io/jsua3/metafronesis:latest` y `:sha-<commit>`. También se lanza a mano desde *Actions → Imagen y despliegue en
Azure → Run workflow*.

**B. Desde tu equipo (antes de que el workflow llegue a `main`).**

```powershell
gh auth refresh -h github.com -s write:packages
gh auth token | docker login ghcr.io -u Jsua3 --password-stdin
docker build -t $IMG .
docker push $IMG
```

**En las dos opciones, la primera vez:** en GitHub, *perfil → Packages → metafronesis → Package settings → Change
visibility → Public*. Con el paquete privado, Azure no puede descargar la imagen sin una credencial.

## 5. Base de datos

```powershell
$PG_PASS = "Mf-" + (python -c "import secrets; print(secrets.token_urlsafe(32))")
az postgres flexible-server create `
  --resource-group $RG --name $PG --location $LOC `
  --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 17 `
  --admin-user mfadmin --admin-password $PG_PASS `
  --public-access 0.0.0.0 --yes
az postgres flexible-server db create --resource-group $RG --server-name $PG --database-name metafronesis
```

- `--public-access 0.0.0.0` abre el firewall **solo a servicios de Azure** (incluida la Container App). La conexión va
  cifrada (`sslmode=require`) y con la contraseña generada. Aislarla en una red virtual es más seguro, pero cuesta más
  y añade pasos; queda como mejora.
- La contraseña solo tiene letras, números, `-` y `_`: entra en la URL de conexión sin escaparla.

## 6. Entorno y aplicación

```powershell
az containerapp env create --name $CAE --resource-group $RG --location $LOC
```

Ese comando crea también el área de trabajo de Log Analytics. Ahora los secretos (se generan aquí y van directo a Azure):

```powershell
function New-Secreto { python -c "import secrets; print(secrets.token_urlsafe(48))" }
$DJANGO_KEY = New-Secreto
$JWT_KEY    = New-Secreto
$REF_KEY    = New-Secreto
$REF_K1     = New-Secreto
$DB_URL     = "postgres://mfadmin:$PG_PASS@$PG.postgres.database.azure.com:5432/metafronesis?sslmode=require"
```

Crea la app. El correo de este primer arranque es el de **consola** (ver el paso 8 para el correo real):

```powershell
az containerapp create `
  --name $APP --resource-group $RG --environment $CAE `
  --image $IMG --target-port 8000 --ingress external `
  --cpu 0.5 --memory 1.0Gi --min-replicas 1 --max-replicas 1 `
  --secrets "django-secret-key=$DJANGO_KEY" "jwt-signing-key=$JWT_KEY" `
            "reflection-encryption-key=$REF_KEY" "reflection-keys=k1=$REF_K1" "database-url=$DB_URL" `
  --env-vars "DJANGO_SECRET_KEY=secretref:django-secret-key" `
             "JWT_SIGNING_KEY=secretref:jwt-signing-key" `
             "REFLECTION_ENCRYPTION_KEY=secretref:reflection-encryption-key" `
             "REFLECTION_KEYS=secretref:reflection-keys" `
             "REFLECTION_ACTIVE_KEY=k1" `
             "DATABASE_URL=secretref:database-url" `
             "SIEP_TRUSTED_PROXIES=1" `
             "SIEP_ALLOW_CONSOLE_EMAIL=true" "ACCESS_REQUEST_NOTIFY_DISABLED=true"
```

Comprueba que responde y fija la URL pública (la usan los enlaces de las notificaciones):

```powershell
$FQDN = az containerapp show --name $APP --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv
curl.exe -s "https://$FQDN/api/health"
az containerapp update --name $APP --resource-group $RG --set-env-vars "SIEP_PUBLIC_URL=https://$FQDN"
```

`/api/health` debe devolver `{"success": true, "data": {"status": "ok", "db": "ok"}}`. Abre `https://$FQDN` en el
navegador.

Notas sobre las variables:

- `DJANGO_ALLOWED_HOSTS` **no hace falta**: `production.py` arma el dominio público con `CONTAINER_APP_NAME` y
  `CONTAINER_APP_ENV_DNS_SUFFIX`, que Container Apps inyecta. Con un dominio propio, agrégalo en
  `DJANGO_ALLOWED_HOSTS`.
- `SIEP_TRUSTED_PROXIES` **no puede ser 0** en Container Apps (el arranque lo rechaza): el ingreso siempre va delante.
  Mídelo en el paso 7.
- Las demás variables opcionales (Google, banderas, retención…) están documentadas en [`.env.example`](../.env.example).
  Con Google, agrega `https://<FQDN>` a los orígenes autorizados de JavaScript del cliente OAuth.

## 7. Primer administrador y medición del proxy

Abre una consola dentro del contenedor:

```powershell
az containerapp exec --name $APP --resource-group $RG --command sh
```

Dentro de esa consola:

```sh
python manage.py create_admin --email tu-correo@unihumboldt.edu.co --nombre Nombre --apellido Apellido
```

El comando pide dos veces una contraseña **temporal** (no se ve al escribirla); la cuenta la cambia en su primer acceso.

**Medir `SIEP_TRUSTED_PROXIES`.** Desde tu equipo, en PowerShell, provoca un inicio de sesión fallido con una cabecera
`X-Forwarded-For` falsa:

```powershell
try {
  Invoke-RestMethod -Method Post -Uri "https://$FQDN/api/auth/login" -ContentType "application/json" `
    -Headers @{ "X-Forwarded-For" = "6.6.6.6" } -Body '{"email":"nadie@example.com","password":"x"}'
} catch { $_.Exception.Response.StatusCode }
Invoke-RestMethod https://api.ipify.org
```

Y en la consola del contenedor:

```sh
python manage.py shell -c "from apps.simulation.models import AuditLog; print(AuditLog.objects.filter(action='LOGIN_FAILED').order_by('-id').values_list('ip_address', flat=True).first())"
exit
```

- Sale **tu IP pública** (la que mostró `api.ipify.org`): `SIEP_TRUSTED_PROXIES=1` es correcto.
- Sale `6.6.6.6`: el valor es demasiado alto; la cabecera del cliente está contando.
- Sale una IP interna (`10.x`, `100.x`, `172.x`): hay un salto más; prueba con `2`
  (`az containerapp update ... --set-env-vars "SIEP_TRUSTED_PROXIES=2"`) y repite.

## 8. Correo

Producción exige definir el correo; elige uno:

**A. Consola (solo para la demo).** Es lo que deja el paso 6. No sale ningún correo: las contraseñas temporales de las
cuentas aprobadas quedan escritas en los logs del contenedor, y el aviso de solicitudes de acceso está apagado.

**B. SMTP de Gmail.** Crea una [contraseña de aplicación](https://myaccount.google.com/apppasswords) en la cuenta que
enviará los correos (requiere verificación en dos pasos). Guárdala como secreto sin escribirla en la línea de comandos:

```powershell
$SMTP = Read-Host "Contraseña de aplicación de Gmail" -AsSecureString
$SMTP_TXT = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SMTP))
az containerapp secret set --name $APP --resource-group $RG --secrets "email-host-password=$SMTP_TXT"
Remove-Variable SMTP, SMTP_TXT
az containerapp update --name $APP --resource-group $RG `
  --remove-env-vars SIEP_ALLOW_CONSOLE_EMAIL ACCESS_REQUEST_NOTIFY_DISABLED `
  --set-env-vars "EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend" "EMAIL_HOST=smtp.gmail.com" `
                 "EMAIL_PORT=587" "EMAIL_USE_TLS=true" "EMAIL_HOST_USER=cuenta@gmail.com" `
                 "EMAIL_HOST_PASSWORD=secretref:email-host-password" "DEFAULT_FROM_EMAIL=cuenta@gmail.com" `
                 "ACCESS_REQUEST_NOTIFY_EMAILS=admin@unihumboldt.edu.co"
```

## 9. Despliegues automáticos con GitHub Actions (OIDC)

El workflow actualiza la Container App sin guardar contraseñas: GitHub pide un token de corta duración a Azure con una
**identidad administrada** que solo acepta tokens del entorno `azure` de este repositorio. No hace falta registrar una
aplicación en Entra ID (las cuentas de estudiante a veces no pueden).

```powershell
$IDN = "id-metafronesis-github"
az identity create --resource-group $RG --name $IDN
$CLIENT_ID    = az identity show --resource-group $RG --name $IDN --query clientId -o tsv
$PRINCIPAL_ID = az identity show --resource-group $RG --name $IDN --query principalId -o tsv
az identity federated-credential create --resource-group $RG --identity-name $IDN --name github-entorno-azure `
  --issuer https://token.actions.githubusercontent.com `
  --subject "repo:Jsua3/metafronesis:environment:azure" `
  --audiences api://AzureADTokenExchange
az role assignment create --assignee-object-id $PRINCIPAL_ID --assignee-principal-type ServicePrincipal `
  --role Contributor --scope (az group show --name $RG --query id -o tsv)
```

El rol va sobre el grupo de recursos porque actualizar la app también toca su entorno. Después, la configuración del
repositorio (los identificadores van como secretos para que no aparezcan en los logs públicos):

```powershell
gh api --method PUT repos/Jsua3/metafronesis/environments/azure | Out-Null
gh secret set AZURE_CLIENT_ID --repo Jsua3/metafronesis --body $CLIENT_ID
gh secret set AZURE_TENANT_ID --repo Jsua3/metafronesis --body (az account show --query tenantId -o tsv)
gh secret set AZURE_SUBSCRIPTION_ID --repo Jsua3/metafronesis --body (az account show --query id -o tsv)
gh variable set AZURE_RESOURCE_GROUP --repo Jsua3/metafronesis --body $RG
gh variable set AZURE_CONTAINER_APP --repo Jsua3/metafronesis --body $APP
```

Desde ese momento, cada push a `main` (y cada *Run workflow* con «desplegar» marcado):

1. construye la imagen y la prueba contra PostgreSQL con los settings de producción;
2. la publica como `:sha-<commit>` y `:latest`;
3. crea una revisión nueva de la Container App con `:sha-<commit>`, espera a que quede sana y comprueba
   `https://<FQDN>/api/health`.

Sin `AZURE_CONTAINER_APP` definida, el trabajo de despliegue se salta (los PR solo construyen y prueban la imagen).

**Publicar a mano**, sin el workflow: sube una imagen con una etiqueta nueva (paso 4, opción B, con `:v0.6.0` en lugar de
`:latest`) y luego

```powershell
az containerapp update --name $APP --resource-group $RG --image ghcr.io/jsua3/metafronesis:v0.6.0
```

Con la misma etiqueta Azure no crea revisión nueva: usa siempre una etiqueta distinta.

## 10. Logs

```powershell
az containerapp logs show --name $APP --resource-group $RG --follow --tail 50          # la app (JSON por línea)
az containerapp logs show --name $APP --resource-group $RG --type system --tail 50     # arranque, sondas, imagen
az containerapp revision list --name $APP --resource-group $RG -o table               # revisiones y su estado
```

En el portal, *Container App → Monitoring → Logs*, con Kusto:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "metafronesis"
| order by TimeGenerated desc
| take 100
```

## 11. Cuidar el crédito

| Cuándo | Qué hacer | Comando |
|---|---|---|
| Semana de la presentación | 1 réplica siempre encendida (sin arranque en frío) | ya queda así en el paso 6 |
| Después | Escalar a cero: el primer acceso tarda ~15 s | `az containerapp update --name $APP --resource-group $RG --min-replicas 0` |
| Sin uso por días | Detener la base (Azure la enciende sola a los 7 días) | `az postgres flexible-server stop --resource-group $RG --name $PG` |
| Volver a usarla | Encender la base | `az postgres flexible-server start --resource-group $RG --name $PG` |
| Fin del proyecto | Borrar **todo** el grupo (irreversible: base incluida) | `az group delete --name $RG` |

El crédito restante se ve en el portal de Azure, en *Education* o en *Cost Management + Billing*. Si el crédito se
acaba, Azure deshabilita los recursos; no cobra a ninguna tarjeta salvo que conviertas la suscripción a pago por uso.

En una sesión nueva de PowerShell las variables ya no existen. Vuelve a definir `$RG`, `$APP` y `$CAE` como en el paso 3,
y `$PG` con el nombre real del servidor: `az postgres flexible-server list --resource-group $RG --query "[].name" -o tsv`.

## 12. Problemas comunes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `RequestDisallowedByAzure` al crear | Región no permitida para estudiantes | Otra región de la lista del paso 3 |
| La revisión no arranca; en `--type system`, `ImproperlyConfigured` | Falta o es débil una variable obligatoria | El mensaje nombra la variable (nunca su valor) |
| `unauthorized` o `denied` al descargar la imagen | El paquete de GHCR es privado | Hazlo público (paso 4) |
| `/api/health` → 503 `db: error` | Firewall, `sslmode` o contraseña | Revisa la regla `0.0.0.0` del servidor y la URL de `database-url` |
| 400 Bad Request en todas las páginas | El `Host` no está permitido (dominio propio) | Agrégalo en `DJANGO_ALLOWED_HOSTS` |
| El inicio de sesión con Google no abre | Origen no autorizado | Agrega `https://<FQDN>` en Google Cloud Console |
| La primera visita tarda | Escala a cero | `--min-replicas 1` durante la demo |

Nunca subas secretos al repositorio ni subas `SIEP_HSTS_SECONDS` hasta tener el dominio definitivo.
