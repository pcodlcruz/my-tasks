# Contrato de configuración: CORS, variables del entorno y permisos

**Feature**: [../spec.md](../spec.md) · Lo que cambia en el pipeline (`deploy.yml`) y en la
infraestructura respecto al contrato de la feature 002.

## 1. `CORS_ORIGINS` de `mytasks-api`

El backend ya acepta una lista separada por comas (`cors_origin_list`). La **fuente de verdad** de la
lista pasa a ser el pipeline, no un valor fijo.

Composición (en este orden, sin duplicados, sin barra final):

1. `https://mytasks-web-${PROJECT_NUMBER}.${REGION}.run.app`
2. `https://${PROJECT_ID}.web.app`
3. Cada origen de la variable `CUSTOM_WEB_ORIGINS` del entorno de GitHub, si existe.

| Entorno | `CUSTOM_WEB_ORIGINS` | Resultado |
|---|---|---|
| `staging` | `https://staging.inserttask.es` | `run.app`, `<proyecto>.web.app`, `https://staging.inserttask.es` |
| `production` | `https://inserttask.es` | `run.app`, `<proyecto>.web.app`, `https://inserttask.es` |

### Reglas de la variable `CUSTOM_WEB_ORIGINS`

- **No secreta**, de *Settings → Environments → staging / production → Variables* (como
  `BOOTSTRAP_ADMIN_EMAIL`). Cada entorno define la suya; nunca el origen del otro.
- Opcional. Admite varios orígenes separados por **espacio** (para no chocar con la coma de la lista).
- Cada valor debe ser `https://` + nombre de dominio en minúsculas, sin ruta ni puerto. Un valor mal
  formado, con `*`, con `http://` o con espacios dentro de un origen **falla el despliegue antes de tocar
  nada** y nombra el valor.
- Nunca se imprimen valores de otras variables; estos orígenes no son secretos.

### Cómo se aplica

- Se escribe con `--update-env-vars` en el paso «Deploy the revisions without traffic», junto a
  `APP_VERSION` y `BOOTSTRAP_ADMIN_EMAIL`. Como el valor contiene comas, ese argumento debe usar el
  delimitador alternativo de `gcloud` (p. ej. `^@^`) para esta variable.
- **Comprobación previa** («Check the service variables»): `CORS_ORIGINS` debe **contener** la URL
  `run.app` de la web de este entorno. Evita que un servicio herede la configuración de otro entorno, sin
  exigir el valor definitivo que aún no se ha escrito.
- **Comprobación posterior** (sobre la revisión recién creada, antes de mover el tráfico): `CORS_ORIGINS`
  debe ser **exactamente** la lista compuesta. Si no, el despliegue se detiene sin mover tráfico.
- La prueba de humo y los despliegues que no cambian nada siguen funcionando: la lista es determinista.

### Pruebas obligatorias (scripts del repositorio)

Ampliar `.github/scripts/tests/test_deploy_variable_check.py` (o una prueba hermana) para cubrir:

| Caso | Resultado |
|---|---|
| Variable no definida (cualquier entorno): lista de dos orígenes | Pasa |
| Staging con `https://staging.inserttask.es` | Pasa; lista de tres |
| Producción con `https://inserttask.es` | Pasa; lista de tres |
| Staging con un origen que no empiece por `https://staging.`, o producción con uno que sí | Falla nombrando el valor (evita que un entorno herede el dominio del otro) |
| Valor con `http://`, `*`, ruta, mayúsculas o espacio interno | Falla nombrando el valor |
| Servicio de otro entorno (no contiene su `run.app`) | Falla (previa) |
| Lista escrita distinta a la compuesta | Falla (posterior) |
| Valor duplicado | Se descarta el duplicado |

## 2. Infraestructura (Terraform)

| Elemento | Staging | Producción |
|---|---|---|
| API `firebasehosting.googleapis.com` en `apis` | Sí | Sí |
| Sitio de Hosting, versión y *release* (proveedor `google-beta` fijado) | Sí | Sí |
| Dominios personalizados (variable del módulo) | `staging.inserttask.es` (ensayo, sin redirección) | `inserttask.es` + `www.inserttask.es` (redirige) |
| `authorized_domains` | + `staging.inserttask.es` (`.web.app` ya incluido) | + `inserttask.es` |
| `allowed_referrers` de la clave de API | + `https://<proyecto>.web.app/*` y `https://staging.inserttask.es/*` | + `https://<proyecto>.web.app/*` y `https://inserttask.es/*` |
| Protección contra borrado | `prevent_destroy` en sitio y dominios | Igual |
| Zona de Cloud DNS y registros (`TXT`, `A`; sin `AAAA`) | Zona `staging.inserttask.es` | Zona `inserttask.es` + `NS` de `staging` (variable) |
| *Outputs* | Estado de cada dominio (`host_state`, `ownership_state`, `cert.state`, `issues`) y servidores de nombres de la zona | Igual |

`test_env_roots_parity.py` debe seguir pasando: solo pueden diferir el dimensionado, los identificadores
y la lista de dominios personalizados.

## 3. Permisos (los concede el propietario; el agente no)

| Identidad | Cambio | Cómo |
|---|---|---|
| `terraform-staging`, `terraform-production` | `roles/firebasehosting.admin` en su proyecto | Consola, siguiendo la guía de `infra/RUNBOOK.md`; verificación en solo lectura con el MCP |
| `terraform-plan-staging`, `terraform-plan-production` | Permisos de lectura de Hosting añadidos al rol personalizado `mytasksPlanReader` (lista fijada por el primer `plan` real) | Actualizar `infra/iam/roles/plan-reader.yaml` y que el propietario lo aplique |
| `terraform-staging`, `terraform-production` | API `dns.googleapis.com` en su proyecto y permisos para gestionar zonas y registros (`dns.managedZones.*`, `dns.resourceRecordSets.*`, `dns.changes.create` y `get`) | Consola, siguiendo la guía de `infra/RUNBOOK.md`; rol personalizado mínimo `mytasksDnsAdmin` (`infra/iam/roles/dns-admin.yaml`), creado por el propietario en cada proyecto; no se usa `roles/dns.admin` |
| `terraform-plan-staging`, `terraform-plan-production` | Lecturas de DNS en `mytasksPlanReader`: `dns.managedZones.get`, `dns.managedZones.list`, `dns.resourceRecordSets.list`, `dns.changes.get` | Actualizar `infra/iam/roles/plan-reader.yaml` y que el propietario lo aplique en los dos proyectos |
| `deployer-*` | **Sin cambios**: el pipeline de imágenes no toca Hosting | — |
| `mytasks-ai-agent` | Sin cambios | — |

Todo cambio de permisos pasa por `mytasks-security-auditor` antes de fusionarse.
