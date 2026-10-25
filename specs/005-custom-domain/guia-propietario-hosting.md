# Guía del propietario: T003 (permisos de Hosting y variable `CUSTOM_WEB_ORIGINS`)

**Para**: el propietario, con sus credenciales en la consola de Google Cloud, en la de Firebase y en GitHub.
**Diseño**: [plan.md](./plan.md), [contracts/pipeline-env.md](./contracts/pipeline-env.md) §3 y [research.md](./research.md) R11.
**Duración estimada**: 15 minutos para los dos entornos.

Todo se hace en las consolas web; el agente no interviene y **no recibe ningún permiso nuevo**
(`mytasks-ai-agent` queda como está). Se repite cada paso en los dos entornos:
`pdlco-mytasks` (producción) y `pdlco-mytasks-stg` (staging). Los comandos, si se usan, son tuyos; el
agente no los ejecuta.

Valores que se usan en toda la guía:

| Dato | Staging | Producción |
|---|---|---|
| Proyecto | `pdlco-mytasks-stg` | `pdlco-mytasks` |
| Cuenta de Terraform | `terraform-staging@pdlco-mytasks-stg.iam.gserviceaccount.com` | `terraform-production@pdlco-mytasks.iam.gserviceaccount.com` |
| Rol a conceder | `roles/firebasehosting.admin` (*Firebase Hosting Admin*) | `roles/firebasehosting.admin` (*Firebase Hosting Admin*) |
| Entorno de GitHub | `staging` | `production` |
| Valor de `CUSTOM_WEB_ORIGINS` | `https://staging.inserttask.com` | `https://inserttask.com` |
| Dirección de Hosting por defecto | `pdlco-mytasks-stg.web.app` | `pdlco-mytasks.web.app` |

**Estado de partida** (leído por el agente en solo lectura el 2026-10-25): la API
`firebasehosting.googleapis.com` ya está activa en los dos proyectos, y `terraform-staging` y
`terraform-production` **no** tienen todavía `roles/firebasehosting.admin`.

---

## Paso 1 · Conceder `roles/firebasehosting.admin` a la cuenta de Terraform de cada proyecto (5 min por proyecto)

Es un rol predefinido y acotado al producto Hosting (sitios, versiones, *releases* y dominios
personalizados). Sin él, el primer `apply` de la Phase 3 fallará con un error de permisos.

*Consola de Google Cloud → IAM y administración → IAM* → selector de proyecto → **Conceder acceso**.

| Campo | Valor |
|---|---|
| Principales nuevos | la cuenta de Terraform de ese proyecto (tabla de arriba) |
| Rol | **Firebase Hosting Admin** (`roles/firebasehosting.admin`) |
| Condición | ninguna |

- [ ] Guarda y comprueba que la fila de la cuenta muestra ahora el rol nuevo **además** de los que ya tenía.
- [ ] Repite en el otro proyecto.

Qué **no** hay que hacer:

- No concedas `Owner`, `Editor`, `Firebase Admin` ni ningún otro rol más amplio.
- No toques `terraform-plan-*`: sus permisos de lectura de Hosting se fijarán con el primer `plan`
  (tarea T027) y los aplicarás entonces en el rol personalizado `mytasksPlanReader`.
- No toques las cuentas `deployer-*`: el pipeline de imágenes no usa Hosting.

---

## Paso 2 · Crear la variable `CUSTOM_WEB_ORIGINS` en cada entorno de GitHub (3 min por entorno)

Es **no secreta** (igual que `BOOTSTRAP_ADMIN_EMAIL`). La lee `deploy.yml` para componer la lista de
orígenes CORS de la API.

*Repositorio en GitHub → Settings → Environments → (staging | production) → Environment variables → Add variable*.

| Campo | `staging` | `production` |
|---|---|---|
| Name | `CUSTOM_WEB_ORIGINS` | `CUSTOM_WEB_ORIGINS` |
| Value | `https://staging.inserttask.com` | `https://inserttask.com` |

Reglas del valor (el pipeline las comprueba y falla antes de tocar nada si no se cumplen):

- Empieza por `https://`, en minúsculas, **sin barra final**, sin ruta, sin puerto y sin comodines.
- Cada entorno lleva el suyo: en `staging` siempre empieza por `https://staging.`, y en `production`
  nunca.
- Si algún día hay más de un origen, se separan con **espacios**, no con comas.

- [ ] Créala en `staging`.
- [ ] Créala en `production`.
- [ ] Comprueba que en cada entorno aparece en *Environment variables* (y **no** en *Secrets*).

Aún no hace efecto: el pipeline empieza a leerla cuando se fusione la Phase 2.

---

## Paso 3 · Mirar si ya existe el sitio de Hosting por defecto (2 min por proyecto)

El agente no puede leerlo (`gcloud` no tiene lectura de sitios de Hosting). Lo necesita para decidir si
el código usa `import` o crea el sitio.

*Consola de Firebase → selector de proyecto → Compilación → **Hosting*** (o *Hosting y Serverless → Hosting*).

- [ ] **Staging** (`pdlco-mytasks-stg`): ¿aparece el sitio `pdlco-mytasks-stg` con la dirección
      `pdlco-mytasks-stg.web.app`? Anota **sí** o **no**. **NO Aparece**
- [ ] **Producción** (`pdlco-mytasks`): ¿aparece el sitio `pdlco-mytasks` con la dirección
      `pdlco-mytasks.web.app`? Anota **sí** o **no**. **NO Aparece**

Si la consola te propone «Empezar» o «Configurar Hosting» y no hay ningún sitio, **no lo configures**:
solo anota «no». Lo creará Terraform.

---

## Qué me tienes que decir al terminar

Un mensaje con estas tres líneas (basta con esto):

1. «Roles concedidos en los dos proyectos.»
2. «Variable creada en `staging` y en `production`.»
3. «Sitio de Hosting por defecto: staging sí/no; producción sí/no.»

Con eso el agente verifica los roles en solo lectura (T004), anota la existencia de los sitios en
`research.md` (R5) y deja listo el esqueleto de la sección 14 del RUNBOOK. Si algo no coincide con lo
anterior (otro rol ya presente, una variable que ya existía con otro valor), para y dímelo.

---

## Si hay que deshacerlo

- **Rol**: *IAM → editar principal → quitar el rol* de `terraform-<entorno>` en ese proyecto.
- **Variable**: *Settings → Environments → (entorno) → Environment variables → eliminar* `CUSTOM_WEB_ORIGINS`. El
  pipeline vuelve a componer la lista solo con `run.app` y `<proyecto>.web.app`.
