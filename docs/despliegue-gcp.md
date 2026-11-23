# Despliegue en Google Cloud (SIEP-237)

Esta guía deja Metafronesis en línea en **Cloud Run** con **Cloud SQL para PostgreSQL**, pagado con la **prueba
gratuita de Google Cloud**. Cualquier integrante con acceso de propietario al proyecto puede seguirla de principio a fin.

> Azure for Students no está disponible para la universidad, por eso se usa Google Cloud. La prueba gratuita da un
> crédito (unos US$300 por 90 días al escribir esta guía) y pide una tarjeta para verificar la identidad. Según sus
> condiciones, no cobra mientras la cuenta no se pase a pago, y al terminar la prueba los recursos se detienen.
> **Revisa las condiciones vigentes al activarla**: la tarjeta y la decisión de pasar a pago son solo de quien la activa.

## 1. Arquitectura y costos

```
Navegador ──HTTPS──▶ Cloud Run (frente de Google, TLS, *.run.app)
                         │
                         ▼
                 Servicio «metafronesis» (gunicorn + Django, 1 instancia)
                   ├─ /api/**  → API (DRF)
                   └─ resto    → SPA de Angular (WhiteNoise + index.html con nonce de la CSP)
                         │  socket de Cloud SQL (/cloudsql/…, cifrado y autorizado por IAM)
                         ▼
                 Cloud SQL para PostgreSQL 17 (db-f1-micro, sin redes autorizadas)
```

| Pieza | Recurso | Costo aproximado (USD/mes, sale del crédito) |
|---|---|---|
| Backend + frontend | Cloud Run, 1 vCPU / 1 GiB, 1 instancia mínima y máxima | ~10–15 con la instancia siempre encendida; ~0 con `min-instances 0` |
| Imagen | Artifact Registry | 0 hasta 0,5 GB (la imagen pesa ~350 MB) |
| Base de datos | Cloud SQL PostgreSQL 17, edición Enterprise, `db-f1-micro`, 10 GB SSD | ~10 |
| Secretos | Secret Manager (6 secretos) | 0 dentro de la capa gratuita |
| Dominio y HTTPS | `https://metafronesis-<número>.<región>.run.app` | 0 |
| Logs | Cloud Logging | 0 hasta 50 GB/mes |

Decisiones y por qué:

- **Una sola imagen.** Django ya sirve el frontend: la vista `shared.spa.spa_index` escribe el nonce de la política de
  contenido en cada `index.html`. Un frontend aparte rompería ese nonce y obligaría a CORS.
- **Migraciones al arrancar.** El `CMD` del `Dockerfile` corre `migrate --noinput` y luego `exec gunicorn`. Por eso el
  servicio va con **una instancia como máximo**: dos instancias arrancando a la vez migrarían a la vez.
- **No hay `collectstatic`.** El proyecto no instala `django.contrib.staticfiles`; WhiteNoise sirve el build de Angular
  copiado en `frontend_dist/`.
- **La base no tiene redes autorizadas.** Solo se llega por el conector de Cloud SQL, que exige el permiso
  `cloudsql.client` de la cuenta de servicio de Cloud Run.
- **Logs.** Django escribe una línea JSON por petición (con `request_id`) en la consola; Cloud Run la envía a Cloud
  Logging.

## 2. Qué necesitas

- Una cuenta de Google con la [prueba gratuita](https://cloud.google.com/free) activada (consola de Google Cloud →
  *Activate* / *Comenzar gratis*). Ahí se crea la cuenta de facturación de la prueba.
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud version`).
- [GitHub CLI](https://cli.github.com/) con sesión iniciada (`gh auth status`) y permisos de administración del repositorio.
- Docker Desktop, para subir la primera imagen (paso 4).
- Python 3 en el PATH: los comandos de abajo lo usan para generar secretos.

Todos los comandos son de **PowerShell** y se corren **en la misma ventana**: las variables (`$PROYECTO`, `$REGION`…)
viven en esa sesión. Los secretos se generan dentro de variables y nunca se escriben ni se muestran; no los copies a
archivos, chats ni capturas.

## 3. Proyecto

```powershell
gcloud auth login
gcloud billing accounts list
```

Debe aparecer la cuenta de facturación de la prueba con `OPEN = True`. Variables de la sesión (`$SUF` hace único el id
del proyecto):

```powershell
$SUF      = -join ((97..122) + (48..57) | Get-Random -Count 5 | ForEach-Object { [char]$_ })
$PROYECTO = "metafronesis-$SUF"
$REGION   = "us-east1"
$SERVICIO = "metafronesis"
$SQL      = "metafronesis-db"
$REPO     = "$REGION-docker.pkg.dev/$PROYECTO/metafronesis/metafronesis"
```

Crea el proyecto, enlázalo a la facturación de la prueba y activa las APIs que se usan:

```powershell
gcloud projects create $PROYECTO --name "Metafronesis"
gcloud config set project $PROYECTO
$FACTURACION = gcloud billing accounts list --filter "open=true" --format "value(name)" --limit 1
gcloud billing projects link $PROYECTO --billing-account $FACTURACION
gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com `
  secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
$NUM = gcloud projects describe $PROYECTO --format "value(projectNumber)"
```

**Recomendado:** en la consola, *Facturación → Presupuestos y alertas*, crea un presupuesto de US$30 con avisos al 50 %,
90 % y 100 %. Un presupuesto avisa, no detiene nada.

## 4. Primera imagen en Artifact Registry

```powershell
gcloud artifacts repositories create metafronesis --repository-format docker --location $REGION
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
docker build -t "${REPO}:v1" .
docker push "${REPO}:v1"
$IMG = "${REPO}:v1"
```

Después de configurar el paso 9, el workflow sube y despliega las imágenes siguientes.

## 5. Base de datos

```powershell
$DB_PASS = "Mf-" + (python -c "import secrets; print(secrets.token_urlsafe(32))")
gcloud sql instances create $SQL --database-version POSTGRES_17 --edition ENTERPRISE --tier db-f1-micro `
  --region $REGION --storage-type SSD --storage-size 10 --availability-type zonal --backup-start-time 08:00
gcloud sql databases create metafronesis --instance $SQL
gcloud sql users create mfapp --instance $SQL --password $DB_PASS
$CONN = gcloud sql instances describe $SQL --format "value(connectionName)"
```

- Crear la instancia tarda unos 10 minutos.
- `--edition ENTERPRISE` es necesaria: la edición por defecto de PostgreSQL 16+ no admite `db-f1-micro`.
- La instancia tiene IP pública, pero **ninguna red autorizada**: solo se entra por el conector de Cloud SQL.
- La contraseña solo tiene letras, números, `-` y `_`: entra en la URL de conexión sin escaparla.

## 6. Secretos y cuenta de servicio

Los secretos se escriben en un archivo temporal sin salto de línea (un salto al final rompería la URL de la base) y el
archivo se borra enseguida:

```powershell
function New-Secreto { python -c "import secrets; print(secrets.token_urlsafe(48))" }
function Set-Secreto([string]$Nombre, [string]$Valor) {
  $archivo = New-TemporaryFile
  [IO.File]::WriteAllText($archivo.FullName, $Valor)
  gcloud secrets create $Nombre --replication-policy automatic --data-file $archivo.FullName
  Remove-Item $archivo.FullName
}
Set-Secreto django-secret-key (New-Secreto)
Set-Secreto jwt-signing-key (New-Secreto)
Set-Secreto reflection-encryption-key (New-Secreto)
Set-Secreto reflection-keys ("k1=" + (New-Secreto))
Set-Secreto database-url "postgres://mfapp:$DB_PASS@%2Fcloudsql%2F$($CONN.Replace(':', '%3A'))/metafronesis"
Remove-Variable DB_PASS
```

La cuenta de servicio con la que corre la app solo puede leer los secretos y conectarse a Cloud SQL:

```powershell
gcloud iam service-accounts create metafronesis-run --display-name "Metafronesis (Cloud Run)"
$SA_RUN = "metafronesis-run@$PROYECTO.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding $PROYECTO --member "serviceAccount:$SA_RUN" --role roles/cloudsql.client
gcloud projects add-iam-policy-binding $PROYECTO --member "serviceAccount:$SA_RUN" --role roles/secretmanager.secretAccessor
```

## 7. Servicio de Cloud Run

Cloud Run no le pasa a Django su dominio: se declara en `DJANGO_ALLOWED_HOSTS`. El dominio tiene la forma
`<servicio>-<número del proyecto>.<región>.run.app`. El correo de este primer arranque es el de **consola** (paso 10).

```powershell
$HOST_APP = "$SERVICIO-$NUM.$REGION.run.app"
$SECRETOS = "DJANGO_SECRET_KEY=django-secret-key:latest,JWT_SIGNING_KEY=jwt-signing-key:latest," + `
            "REFLECTION_ENCRYPTION_KEY=reflection-encryption-key:latest,REFLECTION_KEYS=reflection-keys:latest," + `
            "DATABASE_URL=database-url:latest"
$VARS = "DJANGO_ALLOWED_HOSTS=$HOST_APP,SIEP_PUBLIC_URL=https://$HOST_APP,REFLECTION_ACTIVE_KEY=k1," + `
        "SIEP_TRUSTED_PROXIES=1,SIEP_ALLOW_CONSOLE_EMAIL=true,ACCESS_REQUEST_NOTIFY_DISABLED=true"
gcloud run deploy $SERVICIO --image $IMG --region $REGION --service-account $SA_RUN `
  --set-cloudsql-instances $CONN --set-secrets $SECRETOS --set-env-vars $VARS `
  --cpu 1 --memory 1Gi --min-instances 1 --max-instances 1 --timeout 120 --cpu-boost --allow-unauthenticated
```

Comprueba:

```powershell
curl.exe -s "https://$HOST_APP/api/health"
gcloud run services describe $SERVICIO --region $REGION --format "value(status.url)"
```

`/api/health` debe devolver `{"success": true, "data": {"status": "ok", "db": "ok"}}`. Si la segunda línea muestra otra
URL (la forma antigua, `…-uc.a.run.app`), agrégala también a los hosts o comparte solo `https://$HOST_APP`:

```powershell
gcloud run services update $SERVICIO --region $REGION --update-env-vars "^@^DJANGO_ALLOWED_HOSTS=$HOST_APP,<otra-url-sin-https>"
```

Notas sobre las variables:

- `SIEP_TRUSTED_PROXIES` **no puede ser 0** en Cloud Run (el arranque lo rechaza): el frente de Google siempre va
  delante. Mídelo en el paso 8.
- Las demás variables opcionales (Google, banderas, retención…) están documentadas en [`.env.example`](../.env.example).
  Con inicio de sesión de Google, agrega `https://$HOST_APP` a los orígenes autorizados de JavaScript del cliente OAuth.

## 8. Primer administrador y medición del proxy

Cloud Run no abre una consola dentro del contenedor: los comandos de `manage.py` corren como **trabajos de Cloud Run**
con la misma imagen, los mismos secretos y la misma conexión a la base.

**Primer administrador.** La contraseña temporal se escribe sin que se vea, va a un secreto de un solo uso y se borra al
terminar:

```powershell
$CLAVE = Read-Host "Contraseña temporal del administrador" -AsSecureString
Set-Secreto admin-temp-password ([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($CLAVE)))
Remove-Variable CLAVE
gcloud run jobs create crear-admin --image $IMG --region $REGION --service-account $SA_RUN `
  --set-cloudsql-instances $CONN --set-secrets "$SECRETOS,SIEP_ADMIN_PASSWORD=admin-temp-password:latest" `
  --set-env-vars $VARS --command python `
  --args "manage.py,create_admin,--email,tu-correo@unihumboldt.edu.co,--nombre,Nombre,--apellido,Apellido"
gcloud run jobs execute crear-admin --region $REGION --wait
gcloud run jobs delete crear-admin --region $REGION --quiet
gcloud secrets delete admin-temp-password --quiet
```

La cuenta queda con esa contraseña **temporal**: la cambia en su primer acceso.

**Medir `SIEP_TRUSTED_PROXIES`.** Provoca un inicio de sesión fallido con una cabecera `X-Forwarded-For` falsa y mira qué
IP anotó la auditoría:

```powershell
try {
  Invoke-RestMethod -Method Post -Uri "https://$HOST_APP/api/auth/login" -ContentType "application/json" `
    -Headers @{ "X-Forwarded-For" = "6.6.6.6" } -Body '{"email":"nadie@example.com","password":"x"}'
} catch { $_.Exception.Response.StatusCode }
Invoke-RestMethod https://api.ipify.org
gcloud run jobs create consulta-ip --image $IMG --region $REGION --service-account $SA_RUN `
  --set-cloudsql-instances $CONN --set-secrets $SECRETOS --set-env-vars $VARS --command python `
  --args "^|^manage.py|shell|-c|from apps.simulation.models import AuditLog; print('IP_AUDITORIA', AuditLog.objects.filter(action='LOGIN_FAILED').order_by('-id').values_list('ip_address', flat=True).first())"
gcloud run jobs execute consulta-ip --region $REGION --wait
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=consulta-ip AND textPayload:IP_AUDITORIA" --limit 1 --format "value(textPayload)"
gcloud run jobs delete consulta-ip --region $REGION --quiet
```

- Sale **tu IP pública** (la que mostró `api.ipify.org`): `SIEP_TRUSTED_PROXIES=1` es correcto.
- Sale `6.6.6.6`: el valor es demasiado alto; la cabecera del cliente está contando.
- Sale una IP de Google o interna: hay un salto más; prueba con `2`
  (`gcloud run services update $SERVICIO --region $REGION --update-env-vars SIEP_TRUSTED_PROXIES=2`) y repite.

## 9. Despliegues automáticos con GitHub Actions (Workload Identity Federation)

El workflow [`despliegue-gcp.yml`](../.github/workflows/despliegue-gcp.yml) entra a Google Cloud sin llaves guardadas:
GitHub entrega un token de corta duración que Google acepta solo si viene de este repositorio y del entorno `gcp`.

```powershell
gcloud iam workload-identity-pools create github --location global --display-name "GitHub"
gcloud iam workload-identity-pools providers create-oidc metafronesis --location global --workload-identity-pool github `
  --display-name "metafronesis" --issuer-uri "https://token.actions.githubusercontent.com" `
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment" `
  --attribute-condition "assertion.repository=='Jsua3/metafronesis' && assertion.environment=='gcp'"

gcloud iam service-accounts create github-deploy --display-name "GitHub Actions (despliegue)"
$SA_DEPLOY = "github-deploy@$PROYECTO.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding $PROYECTO --member "serviceAccount:$SA_DEPLOY" --role roles/run.developer
gcloud artifacts repositories add-iam-policy-binding metafronesis --location $REGION `
  --member "serviceAccount:$SA_DEPLOY" --role roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding $SA_RUN --member "serviceAccount:$SA_DEPLOY" --role roles/iam.serviceAccountUser
gcloud iam service-accounts add-iam-policy-binding $SA_DEPLOY --role roles/iam.workloadIdentityUser `
  --member "principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/Jsua3/metafronesis"
```

La cuenta `github-deploy` solo puede subir imágenes al repositorio `metafronesis` y crear revisiones del servicio con la
cuenta `metafronesis-run`. Después, la configuración del repositorio (son identificadores, no secretos):

```powershell
gh api --method PUT repos/Jsua3/metafronesis/environments/gcp | Out-Null
gh variable set GCP_PROJECT_ID --repo Jsua3/metafronesis --body $PROYECTO
gh variable set GCP_REGION --repo Jsua3/metafronesis --body $REGION
gh variable set GCP_CLOUD_RUN_SERVICE --repo Jsua3/metafronesis --body $SERVICIO
gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --repo Jsua3/metafronesis --body $SA_DEPLOY
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --repo Jsua3/metafronesis `
  --body "projects/$NUM/locations/global/workloadIdentityPools/github/providers/metafronesis"
```

Desde ese momento, cada push a `main` (y cada *Run workflow* con «desplegar» marcado):

1. construye la imagen y la prueba contra PostgreSQL con los settings de producción, como la arranca Cloud Run;
2. la sube a Artifact Registry como `:sha-<commit>` y `:latest`;
3. despliega `:sha-<commit>` en Cloud Run (si la revisión nueva no arranca, el tráfico sigue en la anterior) y comprueba
   `/api/health`.

Sin `GCP_PROJECT_ID` definida, el trabajo de despliegue se salta: los PR solo construyen y prueban la imagen. Para que
solo `main` pueda desplegar, en GitHub: *Settings → Environments → gcp → Deployment branches → Selected: main*.

**Publicar a mano**, sin el workflow: repite el paso 4 con una etiqueta nueva (`:v2`, `:v3`…) y luego

```powershell
gcloud run deploy $SERVICIO --image "${REPO}:v2" --region $REGION
```

## 10. Correo

Producción exige definir el correo; elige uno:

**A. Consola (solo para la demo).** Es lo que deja el paso 7. No sale ningún correo: las contraseñas temporales de las
cuentas aprobadas quedan escritas en los logs, y el aviso de solicitudes de acceso está apagado.

**B. SMTP de Gmail.** Crea una [contraseña de aplicación](https://myaccount.google.com/apppasswords) en la cuenta que
enviará los correos (requiere verificación en dos pasos) y guárdala como secreto sin escribirla en la línea de comandos:

```powershell
$SMTP = Read-Host "Contraseña de aplicación de Gmail" -AsSecureString
Set-Secreto email-host-password ([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SMTP)))
Remove-Variable SMTP
gcloud run services update $SERVICIO --region $REGION `
  --remove-env-vars SIEP_ALLOW_CONSOLE_EMAIL,ACCESS_REQUEST_NOTIFY_DISABLED `
  --update-secrets EMAIL_HOST_PASSWORD=email-host-password:latest `
  --update-env-vars "EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend,EMAIL_HOST=smtp.gmail.com,EMAIL_PORT=587,EMAIL_USE_TLS=true,EMAIL_HOST_USER=cuenta@gmail.com,DEFAULT_FROM_EMAIL=cuenta@gmail.com,ACCESS_REQUEST_NOTIFY_EMAILS=admin@unihumboldt.edu.co"
```

## 11. Logs

```powershell
gcloud run services logs read $SERVICIO --region $REGION --limit 50     # la app (JSON por línea) y gunicorn
gcloud run revisions list --service $SERVICIO --region $REGION          # revisiones y su estado
```

En la consola: *Cloud Run → metafronesis → Registros*, o *Logs Explorer* con
`resource.type="cloud_run_revision" AND resource.labels.service_name="metafronesis"`.

## 12. Cuidar el crédito

| Cuándo | Qué hacer | Comando |
|---|---|---|
| Semana de la presentación | 1 instancia siempre encendida (sin arranque en frío) | ya queda así en el paso 7 |
| Después | Escalar a cero: el primer acceso tarda ~10–15 s | `gcloud run services update $SERVICIO --region $REGION --min-instances 0` |
| Sin uso por días | Detener la base (el disco se sigue cobrando) | `gcloud sql instances patch $SQL --activation-policy NEVER` |
| Volver a usarla | Encender la base | `gcloud sql instances patch $SQL --activation-policy ALWAYS` |
| Fin del proyecto | Borrar **todo** el proyecto (se puede recuperar durante 30 días) | `gcloud projects delete $PROYECTO` |

El crédito restante se ve en la consola, en *Facturación → Descripción general*. En una sesión nueva de PowerShell las
variables ya no existen: vuelve a definirlas como en el paso 3, con `$PROYECTO` igual al id real
(`gcloud projects list`), y recupera `$NUM`, `$CONN`, `$SA_RUN`, `$HOST_APP`, `$SECRETOS` y `$VARS` con sus mismos
comandos.

## 13. Problemas comunes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La revisión no arranca; en los logs, `ImproperlyConfigured` | Falta o es débil una variable obligatoria | El mensaje nombra la variable (nunca su valor) |
| 400 Bad Request en todas las páginas | El `Host` no está en `DJANGO_ALLOWED_HOSTS` | Agrega la URL que usas (paso 7) |
| `/api/health` → 503 `db: error` | Falta `--set-cloudsql-instances`, el permiso `cloudsql.client` o la URL de `database-url` | Revisa los pasos 5 a 7 |
| `permission denied for schema public` al migrar | El usuario no es dueño del esquema | En Cloud SQL Studio, como `postgres`: `ALTER DATABASE metafronesis OWNER TO mfapp;` |
| `Permission denied` al leer un secreto | La cuenta `metafronesis-run` no tiene `secretAccessor` | Paso 6 |
| El workflow falla en «Iniciar sesión en Google Cloud» | Falta el entorno `gcp`, una variable o el enlace `workloadIdentityUser` | Paso 9 |
| El inicio de sesión con Google no abre | Origen no autorizado | Agrega `https://$HOST_APP` en Google Cloud Console |
| La primera visita tarda | Escala a cero | `--min-instances 1` durante la demo |

Nunca subas secretos al repositorio ni subas `SIEP_HSTS_SECONDS` hasta tener el dominio definitivo.
