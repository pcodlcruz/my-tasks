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
| `staging` | no definida | `run.app`, `<proyecto>.web.app` |
| `production` | `https://inserttask.com` | `run.app`, `<proyecto>.web.app`, `https://inserttask.com` |

### Reglas de la variable `CUSTOM_WEB_ORIGINS`

- **No secreta**, de *Settings → Environments → production → Variables* (como `BOOTSTRAP_ADMIN_EMAIL`).
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
| Staging sin variable: lista de dos orígenes | Pasa |
| Producción con `https://inserttask.com` | Pasa; lista de tres |
| Valor con `http://`, `*`, ruta, mayúsculas o espacio interno | Falla nombrando el valor |
| Servicio de otro entorno (no contiene su `run.app`) | Falla (previa) |
| Lista escrita distinta a la compuesta | Falla (posterior) |
| Valor duplicado | Se descarta el duplicado |

## 2. Infraestructura (Terraform)

| Elemento | Staging | Producción |
|---|---|---|
| API `firebasehosting.googleapis.com` en `apis` | Sí | Sí |
| Sitio de Hosting, versión y *release* (proveedor `google-beta` fijado) | Sí | Sí |
| Dominios personalizados (variable del módulo) | Lista vacía | `inserttask.com` + `www.inserttask.com` (redirige) |
| `authorized_domains` | + sin cambios (ya incluye `.web.app`) | + `inserttask.com` |
| `allowed_referrers` de la clave de API | + `https://<proyecto>.web.app/*` | + `https://<proyecto>.web.app/*` y `https://inserttask.com/*` |
| Protección contra borrado | `prevent_destroy` en sitio y dominios | Igual |
| *Outputs* | Estado del sitio | Estado de cada dominio (`host_state`, `ownership_state`, `cert.state`, `issues`) y `required_dns_updates` |

`test_env_roots_parity.py` debe seguir pasando: solo pueden diferir el dimensionado, los identificadores
y la lista de dominios personalizados.

## 3. Permisos (los concede el propietario; el agente no)

| Identidad | Cambio | Cómo |
|---|---|---|
| `terraform-staging`, `terraform-production` | `roles/firebasehosting.admin` en su proyecto | Consola, siguiendo la guía de `infra/RUNBOOK.md`; verificación en solo lectura con el MCP |
| `terraform-plan-staging`, `terraform-plan-production` | Permisos de lectura de Hosting añadidos al rol personalizado `mytasksPlanReader` (lista fijada por el primer `plan` real) | Actualizar `infra/iam/roles/plan-reader.yaml` y que el propietario lo aplique |
| `deployer-*` | **Sin cambios**: el pipeline de imágenes no toca Hosting | — |
| `mytasks-ai-agent` | Sin cambios | — |

Todo cambio de permisos pasa por `mytasks-security-auditor` antes de fusionarse.
