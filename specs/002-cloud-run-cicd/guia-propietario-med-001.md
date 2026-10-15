# Guía del propietario: roles personalizados de Terraform (MED-001)

**Qué resuelve**: MED-001 de [security-review-t046.md](./security-review-t046.md) y el rol de lectura
de `terraform-plan-*` que dejó abierto T047. El agente no puede crear roles ni conceder roles de
proyecto, así que esto lo haces tú, con tu cuenta, en tu terminal.

**Cuándo**: antes de que `infra.yml` aplique `staging` (T075). Para producción, en la Fase 5 (T077).

## Decisión

| Cuenta | Rol | Por qué |
|---|---|---|
| `terraform-staging` | `mytasksEnvironmentAdmin` (nuevo) | Crea la base de Firestore, sus índices y el TTL, la configuración de Identity Platform y la clave de API web. Sin acceso a documentos, usuarios, secretos ni borrado |
| `terraform-plan-staging` | `mytasksPlanReader` (nuevo) | Lee lo que gestiona el módulo para poder hacer `plan`. Sin escritura, sin documentos, sin usuarios |
| `terraform-plan-production` (Fase 5) | `mytasksPlanReader` + `mytasksPlatformPlanReader` | Lo mismo, más la lectura de la federación, el registro y el bucket de estado |

**`roles/viewer` descartado**: incluye `datastore.entities.get` (lee documentos de Firestore) y
`firebaseauth.users.get` (lee cuentas de usuario), ambos comprobados en la documentación de IAM. El
`plan` corre en PR de un repositorio público y su resultado se publica en el resumen del job.

Las definiciones están en [`infra/iam/roles/`](../../infra/iam/roles/) con lo que dejan fuera y por qué.
Salen de los permisos de `roles/datastore.owner`, `roles/datastore.indexAdmin` y
`roles/identitytoolkit.admin`, leídos por el MCP, quedándome solo con los que el módulo necesita.

## Pasos en `pdlco-mytasks-stg`

Desde la raíz del repositorio, con tu cuenta personal. Cada comando es independiente.

1. Crear los dos roles:

   ```
   gcloud iam roles create mytasksEnvironmentAdmin --project=pdlco-mytasks-stg --file=infra/iam/roles/environment-admin.yaml
   gcloud iam roles create mytasksPlanReader --project=pdlco-mytasks-stg --file=infra/iam/roles/plan-reader.yaml
   ```

   Si `gcloud` dice que un permiso «no es compatible con roles personalizados», **no lo quites a
   mano**: dime cuál es y lo resuelvo en la definición.

2. Conceder cada rol a su cuenta. `--condition=None` es obligatorio porque la política ya tiene
   concesiones con condición:

   ```
   gcloud projects add-iam-policy-binding pdlco-mytasks-stg --member=serviceAccount:terraform-staging@pdlco-mytasks-stg.iam.gserviceaccount.com --role=projects/pdlco-mytasks-stg/roles/mytasksEnvironmentAdmin --condition=None
   gcloud projects add-iam-policy-binding pdlco-mytasks-stg --member=serviceAccount:terraform-plan-staging@pdlco-mytasks-stg.iam.gserviceaccount.com --role=projects/pdlco-mytasks-stg/roles/mytasksPlanReader --condition=None
   ```

3. Avísame. Compruebo en solo lectura por el MCP que las dos concesiones existen, que no hay otros
   roles nuevos y que `terraform-plan-staging` sigue sin ningún rol de escritura.

## Riesgos que conviene que conozcas

- **No he podido ejecutar un `plan` real**: el sandbox no permite arrancar el proveedor ni tiene
  credenciales para staging. La lista sale de los recursos del módulo y de los permisos de los roles
  predefinidos, no de un `plan` ejecutado. El primer `plan` del CI puede revelar un permiso que
  falte; se añade a la definición y se actualiza el rol (`gcloud iam roles update`), sin tocar nada más.
- **Auditoría de acceso a datos**: `terraform-staging` solo puede conceder `roles/datastore.user`
  a nivel de proyecto (condición de su `projectIamAdmin`). El módulo declara la auditoría de
  `datastore.googleapis.com` e `iam.googleapis.com`; si el `apply` falla ahí, no cambia nada más y la
  activas tú en la consola como hiciste en producción (RUNBOOK §5), y luego se importa.
- **Fuera de `terraform plan`**: `plan` lee también la política IAM del proyecto
  (`resourcemanager.projects.getIamPolicy`) para refrescar la auditoría. Revela quién tiene acceso al
  proyecto, no datos.

## Pasos en `pdlco-mytasks` (producción y plataforma), antes del primer `apply` de la Fase 5

Los roles personalizados son de proyecto, así que hay que crearlos otra vez en el de producción. Aquí hay uno más que en staging, `mytasksPlatformPlanReader`, para que `terraform-plan-production` pueda leer también la plataforma (federación, registro de imágenes y bucket de estado). Es lo que hace que la vista previa de `platform` deje de salir como aviso.

Desde la raíz del repositorio, con tu cuenta personal:

1. Crear los tres roles:

   ```
   gcloud iam roles create mytasksEnvironmentAdmin --project=pdlco-mytasks --file=infra/iam/roles/environment-admin.yaml
   gcloud iam roles create mytasksPlanReader --project=pdlco-mytasks --file=infra/iam/roles/plan-reader.yaml
   gcloud iam roles create mytasksPlatformPlanReader --project=pdlco-mytasks --file=infra/iam/roles/platform-plan-reader.yaml
   ```

2. Conceder cada rol a su cuenta (`--condition=None` por las concesiones con condición que ya hay):

   ```
   gcloud projects add-iam-policy-binding pdlco-mytasks --member=serviceAccount:terraform-production@pdlco-mytasks.iam.gserviceaccount.com --role=projects/pdlco-mytasks/roles/mytasksEnvironmentAdmin --condition=None
   gcloud projects add-iam-policy-binding pdlco-mytasks --member=serviceAccount:terraform-plan-production@pdlco-mytasks.iam.gserviceaccount.com --role=projects/pdlco-mytasks/roles/mytasksPlanReader --condition=None
   gcloud projects add-iam-policy-binding pdlco-mytasks --member=serviceAccount:terraform-plan-production@pdlco-mytasks.iam.gserviceaccount.com --role=projects/pdlco-mytasks/roles/mytasksPlatformPlanReader --condition=None
   ```

3. Avísame y lo verifico en solo lectura, como hice en staging.

### Corrección (2026-10-15): permiso que faltaba en `mytasksPlatformPlanReader`

La vista previa de `platform` en la PR #41 falló con `403 iam.workloadIdentityPools.getAttestationRules`: el proveedor de Terraform lee las reglas de atestación del *pool* y el rol no incluía ese permiso (el rol predefinido `roles/iam.workloadIdentityPoolViewer` sí lo tiene). Está añadido en `infra/iam/roles/platform-plan-reader.yaml`. Los roles personalizados no se actualizan solos al cambiar el fichero; ejecuta una vez, con tu cuenta (no hay que volver a conceder el rol):

```
gcloud iam roles update mytasksPlatformPlanReader --project=pdlco-mytasks --file=infra/iam/roles/platform-plan-reader.yaml
```

La identidad de `apply` no se ve afectada: `terraform-production` tiene `roles/iam.workloadIdentityPoolAdmin`.

**Identity Platform de producción no hace falta habilitarlo**: ya lo está desde el 2025-12-03, con el proveedor Google. La raíz de producción lo adopta con `import` (en staging hubo que habilitarlo a mano porque el proyecto aún no era Firebase). Lo que sí conviene que mires en el plan es la lista de **dominios autorizados**: Terraform la fija a los dominios por defecto del proyecto y a la web de producción, de modo que cualquier otro que hayas añadido a mano en estos meses (por ejemplo `localhost`) desaparece.
