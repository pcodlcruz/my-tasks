# Convenciones Pulumi (Python / TypeScript) — IaC Developer

## Estructura de proyecto

```
infrastructure/
├── Pulumi.yaml               # Metadatos del proyecto Pulumi
├── Pulumi.dev.yaml           # Config del stack dev
├── Pulumi.staging.yaml       # Config del stack staging
├── Pulumi.prod.yaml          # Config del stack prod
├── __main__.py               # Entrypoint (Python) o index.ts (TypeScript)
├── components/               # ComponentResources reutilizables
│   ├── __init__.py
│   ├── cloud_run.py
│   └── gcs_bucket.py
└── requirements.txt          # (Python) o package.json (TypeScript)
```

## Pulumi.yaml mínimo

```yaml
name: my-infra
runtime: python        # o nodejs para TypeScript
description: GCP infrastructure for my-service
```

## Gestión de stacks

- Un stack por entorno: `dev`, `staging`, `prod`.
- Seleccionar el stack antes de operar: `pulumi stack select prod`.
- Nunca operar sobre `prod` sin confirmar el stack activo.

```bash
# Ver stacks disponibles
pulumi stack ls

# Ver stack activo
pulumi stack

# Cambiar de stack
pulumi stack select dev
```

## Config y secrets (Python)

```python
import pulumi

config = pulumi.Config()

# Valores no sensibles
region = config.require("region")
project_id = config.require("project_id")

# Valores sensibles (cifrados en Pulumi.*.yaml)
db_password = config.require_secret("db_password")
api_key = config.require_secret("api_key")
```

```bash
# Establecer config
pulumi config set region europe-west1
pulumi config set project_id my-project-id

# Establecer secrets (cifrado automáticamente)
pulumi config set --secret db_password "my-secret-value"
```

**Nunca usar `config.require()` para valores sensibles** — usar siempre `require_secret()`.

## ComponentResource: módulos reutilizables (Python)

```python
from typing import Optional
import pulumi
import pulumi_gcp as gcp

class CloudRunService(pulumi.ComponentResource):
    url: pulumi.Output[str]
    service_account_email: pulumi.Output[str]

    def __init__(
        self,
        name: str,
        image: str,
        project_id: str,
        region: str = "europe-west1",
        min_instances: int = 0,
        opts: Optional[pulumi.ResourceOptions] = None,
    ) -> None:
        super().__init__("myinfra:index:CloudRunService", name, {}, opts)

        child_opts = pulumi.ResourceOptions(parent=self)

        sa = gcp.serviceaccount.Account(
            f"{name}-sa",
            account_id=f"{name}-runner",
            project=project_id,
            opts=child_opts,
        )

        service = gcp.cloudrunv2.Service(
            name,
            location=region,
            project=project_id,
            template=gcp.cloudrunv2.ServiceTemplateArgs(
                service_account=sa.email,
                scaling=gcp.cloudrunv2.ServiceTemplateScalingArgs(
                    min_instance_count=min_instances,
                ),
                containers=[gcp.cloudrunv2.ServiceTemplateContainerArgs(
                    image=image,
                )],
            ),
            opts=child_opts,
        )

        self.url = service.uri
        self.service_account_email = sa.email
        self.register_outputs({
            "url": self.url,
            "service_account_email": self.service_account_email,
        })
```

## Entrypoint: exports obligatorios (Python)

```python
# __main__.py
import pulumi
from components.cloud_run import CloudRunService

config = pulumi.Config()
project_id = config.require("project_id")
region = config.require("region")
image = config.require("image")

api = CloudRunService(
    "api",
    image=image,
    project_id=project_id,
    region=region,
)

# Exports explícitos — visibles con `pulumi stack output`
pulumi.export("api_url", api.url)
pulumi.export("api_sa_email", api.service_account_email)
```

## Nombrado de recursos GCP desde Pulumi

```python
# Patrón: <tipo>-<env>-<región>-<nombre>
# El stack name se usa para derivar el entorno
stack = pulumi.get_stack()  # "dev" | "staging" | "prod"

bucket = gcp.storage.Bucket(
    "assets",
    name=f"gcs-{stack}-{region}-assets",
    project=project_id,
    location=region,
    labels={
        "environment": stack,
        "managed_by": "pulumi",
    },
)
```

## Manejo de Output[T] (Python)

```python
# ✅ Correcto: encadenar Outputs con apply()
full_url = service.uri.apply(lambda uri: f"{uri}/health")

# ✅ Correcto: combinar múltiples Outputs con Output.all()
connection_string = pulumi.Output.all(
    host=db.public_ip_address,
    name=db_name.name,
).apply(lambda args: f"postgresql://user:password@{args['host']}/{args['name']}")

# ❌ Incorrecto: intentar leer el valor de un Output directamente
# uri = service.uri  # Esto es un Output[str], no un str
# print(uri)  # Esto no funciona como se espera
```

## Protección de recursos en prod

```python
# Marcar recursos críticos en producción como protegidos
# (evita borrado accidental con pulumi destroy)
db = gcp.sql.DatabaseInstance(
    "main-db",
    # ...
    opts=pulumi.ResourceOptions(
        protect=stack == "prod",  # Solo proteger en prod
    ),
)
```

## Formato y validación

```bash
# Python: lint y formato
black .
mypy . --ignore-missing-imports

# TypeScript: lint y formato
npm run lint
npm run build  # Verifica que el código compila

# Siempre antes de proponer cambios
pulumi preview --diff
```

## Aliases: renombrado de recursos sin recrearlos

```python
# Si renombras un recurso lógico, usa aliases para evitar destroy+create
bucket = gcp.storage.Bucket(
    "assets-v2",  # Nuevo nombre lógico
    name="gcs-prod-eu-west1-assets",
    opts=pulumi.ResourceOptions(
        aliases=[pulumi.Alias(name="assets")],  # Nombre anterior
    ),
)
```

## Transformaciones de estado

Para `pulumi state delete` o `pulumi import`, siempre:
1. Ejecutar `pulumi stack export > backup-state.json` antes de modificar estado.
2. Mostrar al usuario qué recurso se va a afectar.
3. Pedir confirmación explícita.
4. Ejecutar la operación.
5. Ejecutar `pulumi preview` para verificar que el estado resultante es el esperado.
