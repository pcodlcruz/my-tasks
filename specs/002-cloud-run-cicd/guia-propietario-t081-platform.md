# Guía del propietario: aplicar `platform` en producción (T081)

`main` aplica `platform` y `envs/production` con `terraform-production`, igual que `develop`
aplica `envs/staging`. El `apply` del 2026-10-15 falló porque esa cuenta no podía **leer** todo
`platform` (el bucket de estado y las políticas del proyecto). Esta guía recoge lo que te toca.

## 1. Conceder dos roles de lectura (solo propietario)

En `pdlco-mytasks`, a `terraform-production@pdlco-mytasks.iam.gserviceaccount.com`:

| Rol | Para qué |
|---|---|
| `projects/pdlco-mytasks/roles/mytasksPlanReader` | Lecturas del proyecto, incluida `resourcemanager.projects.getIamPolicy` (auditorías) |
| `projects/pdlco-mytasks/roles/mytasksPlatformPlanReader` | Lecturas del bucket de estado, el pool de federación y el registro |

Son los mismos roles que ya tiene `terraform-plan-production`. Solo leen: no añaden ninguna
escritura. Conceder con la consola (*IAM → Conceder acceso*) o, si prefieres la línea de
comandos, con tu cuenta personal:

```
gcloud projects add-iam-policy-binding pdlco-mytasks \
  --member=serviceAccount:terraform-production@pdlco-mytasks.iam.gserviceaccount.com \
  --role=projects/pdlco-mytasks/roles/mytasksPlanReader --condition=None
gcloud projects add-iam-policy-binding pdlco-mytasks \
  --member=serviceAccount:terraform-production@pdlco-mytasks.iam.gserviceaccount.com \
  --role=projects/pdlco-mytasks/roles/mytasksPlatformPlanReader --condition=None
```

El agente no puede hacerlo (el clasificador bloquea las concesiones a nivel de proyecto, y es
decisión tuya). Avísame al terminar y lo verifico en solo lectura.

## 2. Fusionar la PR #42 y llevarla a `main`

1. Revisar y fusionar #42 en `develop`.
2. Crear la release (`release/*` → `main`) como la 1.0.0 y fusionarla.

## 3. Aprobar el `apply` de `infra-production`

1. En la ejecución de `infra` en `main`, leer el resumen de `plan-production`: debe mostrar
   `platform` (16 importaciones, 0 cambios, 0 destrucciones) y `envs/production` (1 importación,
   31 altas, 1 cambio, 0 destrucciones). **Mirar sobre todo los dominios autorizados de Identity
   Platform:** se quitan `localhost` y dos dominios antiguos.
2. Aprobar el entorno `infra-production`.
3. Si algo falla, ahora el final de la salida del plan aparece como **anotación** del check
   (arriba en la página de la ejecución), además del resumen.

## 4. Después

- `deploy-production` fallará de forma esperada si los servicios aún no existen: relanzarlo tras
  el `apply`.
- Avisarme: compruebo el escenario 6 y T082; con el estado de `platform` ya creado, cierro T058.

## Riesgo residual

`terraform-production` aplica `platform` con permisos de **lectura** sobre el bucket y las
políticas del proyecto. Las 16 importaciones no cambian nada. Si algún día el plan de `platform`
quisiera modificar una política, el `apply` fallaría (no puede escribirla): es el comportamiento
deseado. Esta ampliación debe pasar por `mytasks-security-auditor` antes de la release.
