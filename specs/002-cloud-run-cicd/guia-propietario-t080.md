# Guía del propietario: *rulesets* con checks requeridos (T080) y LOW-001

**Qué resuelve**: T080 de [tasks.md](./tasks.md) (los nueve *required status checks* de
[contracts/pipeline.md](./contracts/pipeline.md)) y LOW-001 de
[security-review-fase-5.md](./security-review-fase-5.md) (los administradores pueden saltarse la
aprobación del *environment* `production`). El agente no puede cambiar la configuración de GitHub,
así que esto lo haces tú en la web. Ambos ajustes van antes de T081.

**Estado de partida** (leído de la API pública el 2026-10-15): `develop` y `main` tienen un
*ruleset* con borrado prohibido, sin *force-push* y PR obligatoria (0 aprobaciones). **Ninguno
exige todavía ningún check**: una PR con el CI en rojo se puede fusionar.

## Parte 1: checks requeridos (T080)

Los nueve nombres, tal como los ve GitHub (son los nombres de los *jobs*, estables por contrato):

```
backend-lint-types
backend-tests
frontend-lint-types
frontend-tests
e2e
images-build
secrets-scan
api-contract-compat
terraform-validate
```

Para cada *ruleset* que cubra `main`, `develop`, `release/*` y `hotfix/*`:

1. **Settings → Rules → Rulesets** y abre el *ruleset* (si `release/*` y `hotfix/*` no están en
   ninguno, crea uno nuevo con *Target branches* → *Add target* → *Include by pattern* y esos dos
   patrones, con *Enforcement status* en *Active*).
2. Marca **Require status checks to pass**.
3. **Add checks** y añade los nueve, uno a uno, escribiendo el nombre. Deja la fuente en *any
   source* o *GitHub Actions*.
   - GitHub solo sugiere los checks que han corrido en el repositorio en los últimos 7 días. Si
     alguno no sale, abre una PR cualquiera (la #39 ya los ejecutó todos) o escribe el nombre a
     mano.
4. **Require branches to be up to date before merging**: déjalo **desactivado**. Con una sola
   persona fusionando obligaría a actualizar cada PR tras cada fusión sin añadir seguridad real.
5. **Save changes**.

Notas:
- `terraform-validate` se **omite** cuando la PR no toca `infra/**`; un *job* omitido cuenta como
  superado, no bloquea (ver «Los checks requeridos se ejecutan siempre» en el contrato).
- Los *jobs* de `ci.yml` también corren dentro de `deploy.yml` con el prefijo
  `deploy-staging / ci / …`; esos nombres **no** son los requeridos. Requiere los nombres cortos.
- Una vez activo, la fusión de la PR de un cambio de `infra.yml` o de un workflow necesitará que
  el *job* correspondiente haya corrido en esa PR. Si una PR se queda «esperando» un check,
  revisa que no haya un filtro `paths` a nivel de workflow (está prohibido por el contrato).

### Comprobación (la hago yo, sin credenciales)

Cuando termines, dime «hecho» y leo la API pública:

```
curl -s https://api.github.com/repos/pcodlcruz/my-tasks/rules/branches/develop
```

Debe aparecer una regla `required_status_checks` con los nueve contextos; igual con `main`. Para
`release/*` y `hotfix/*` la API solo responde si existe una rama con ese nombre.

## Parte 2: LOW-001, el *environment* `production`

1. **Settings → Environments → `production`**.
2. Desmarca **Allow administrators to bypass configured protection rules**.
3. Deja intactos *Required reviewers* (tú) y *Deployment branches* (`main`).
4. **Save protection rules**.

Es el mismo ajuste que ya tiene `infra-production`. Con una sola persona, que es además la revisora,
el efecto práctico es que un token de administrador comprometido ya no puede desplegar a
producción saltándose la aprobación.

### Comprobación (la hago yo)

```
curl -s https://api.github.com/repos/pcodlcruz/my-tasks/environments/production
```

`can_admins_bypass` debe ser `false`.

## Qué queda después

Con esto y la PR de MED-001 ya fusionada, lo recomendado antes de T081 está cerrado. T081 sigue
siendo tuyo: fusionar la release en `main`, aprobar el `apply` de `infra-production` leyendo el
plan, y relanzar `deploy-production` si falla por servicios inexistentes. Después, el agente
comprueba el escenario 6 y su variante negativa (T082 incluido).
