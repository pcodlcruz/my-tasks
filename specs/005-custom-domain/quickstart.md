# Quickstart de validación: dominio propio

**Feature**: [spec.md](./spec.md) · **Contratos**: [edge](./contracts/edge.md),
[pipeline-env](./contracts/pipeline-env.md)

Guía para demostrar de extremo a extremo que la feature funciona. Cada escenario indica **dónde** se
ejecuta. Todo el camino (Hosting, inicio de sesión, CORS y, con el subdominio `staging.inserttask.es`,
también la propiedad DNS y el certificado) se prueba antes en **staging**, que usa los mismos recursos
que producción (Principio IV). Solo `inserttask.es` y `www` existen únicamente en producción.

## Prerrequisitos

- Permisos concedidos a `terraform-<env>` y API activada (contrato `pipeline-env.md` §3), verificados en
  solo lectura.
- Variable `CUSTOM_WEB_ORIGINS` en cada entorno de GitHub: `https://staging.inserttask.es` en
  `staging` y `https://inserttask.es` en `production`.
- Acceso al registrador de `inserttask.es` (solo para delegar `NS`; el DNS vive en Cloud DNS, FR-021) y la
  confirmación de si el dominio tiene otros registros que conservar (FR-023).
- Una cuenta de Google invitada y otra no invitada en cada entorno.

## A. Staging (tras fusionar en `develop` y desplegar el pipeline)

1. **Hosting sirve la web**: abrir `https://pdlco-mytasks-stg.web.app/`. Carga la aplicación de staging
   con certificado válido.
2. **HTTP redirige** (contrato `edge.md` §1): pedir `http://pdlco-mytasks-stg.web.app/` y comprobar que
   acaba en `https://`.
3. **Cabeceras** (`edge.md` §2): `curl -sI https://pdlco-mytasks-stg.web.app/` y comparar con
   `https://mytasks-web-838389521553.europe-southwest1.run.app/`: mismas cabeceras de seguridad y misma
   política de contenidos; `Cache-Control: no-store` en `/` y en `/config.js`.
4. **Inicio de sesión desde Hosting**: con la cuenta invitada, «Iniciar sesión con Google» desde
   `web.app`; llega al tablero. Con la no invitada: «Necesitas una invitación». Cerrar sesión.
5. **API desde el origen nuevo (CORS)**: en el tablero, crear y completar una tarea, y abrir «Perfil»
   (avatar y preferencias). Sin errores de CORS ni de CSP en la consola del navegador.
6. **La dirección antigua sigue viva**: abrir la URL `run.app` de la web y comprobar que también carga y
   permite iniciar sesión (FR-011).
7. **Versión coherente**: `GET /health` de la API y `APP_VERSION` de `/config.js` (por `web.app` y por
   `run.app`) devuelven el mismo valor (FR-012).
8. **Pipeline intacto**: forzar un despliegue de staging (cambio trivial) y comprobar que la prueba de
   humo pasa y que la lista `CORS_ORIGINS` queda con los dos orígenes esperados.
9. **Rendimiento (SC-005)**: tres cargas en frío de `web.app` y de `run.app` desde la misma red y a la
   misma hora (evento `Load` de DevTools con la caché desactivada, alternando las dos URL); la mediana de
   `web.app` no debe superar en más de 150 ms la de `run.app`. Repetir con
   `staging.inserttask.es` en el ensayo (E4) y con `inserttask.es` en el escenario 14.

## A2. Ensayo del dominio en staging: `staging.inserttask.es` (antes de la release; FR-020, SC-009)

Mismo mecanismo que producción, con otro proyecto. Si algo falla aquí, se corrige antes de crear
ningún dominio de producción.

- **E1. Leer la zona de staging**: de las salidas de Terraform de staging, los servidores de nombres de la
  zona `staging.inserttask.es`, y comprobar con una consulta DNS directa a uno de ellos que el `TXT` y el
  `A` están publicados (y que no hay `AAAA`).
- **E2. Delegación (el propietario)**: en el registrador, añadir el registro `NS` de `staging` con esos
  servidores de nombres, retirando antes cualquier registro previo de `staging`. Seguir solo la guía de
  la RUNBOOK §14 y anotar el tiempo de trabajo efectivo y si hizo falta ayuda adicional (SC-008).
  Comprobar con una consulta DNS pública que `staging.inserttask.es` resuelve a Hosting.
- **E3. Propiedad compartida entre proyectos**: `ownership_state` de staging llega a `OWNERSHIP_ACTIVE`
  sin `OWNERSHIP_CONFLICT`/`MISMATCH`, aunque el apex acabe perteneciendo al proyecto de producción
  (research R7). Si hay conflicto, parar y revisar el diseño con el propietario.
- **E4. Certificado**: `cert.state` pasa a `CERT_ACTIVE`; abrir `https://staging.inserttask.es/` en un
  navegador: candado y certificado emitido para el subdominio.
- **E5. Inicio de sesión y funciones**: cuenta invitada → tablero; no invitada → «Necesitas una
  invitación»; tarea, perfil y avatar sin errores de CORS ni de CSP; `http://` redirige a `https://`.
- **E6. Lista CORS de staging**: la API de staging tiene `CORS_ORIGINS` con los tres orígenes y el
  siguiente despliegue de staging mantiene la prueba de humo en verde.

## B. Producción (tras la release y el `apply` de `infra` aprobado)

10. **Antes del DNS**: la web ya responde en `https://pdlco-mytasks.web.app/` (mismas comprobaciones 1–5).
    Todavía no existe `inserttask.es` para el público.
11. **Leer la zona de producción**: de las salidas de Terraform, los servidores de nombres de la zona
    `inserttask.es`; con una consulta DNS directa a uno de ellos, comprobar `TXT`, `A` de apex y `www`, el
    `NS` de `staging` y que no hay `AAAA`.
12. **Cambio de servidores de nombres (el propietario)**: confirmar que no hay otros registros que
    conservar (FR-023) y cambiar en el registrador los servidores de nombres del dominio a los de la
    zona de producción; retirar entonces la delegación de `staging` que el registrador tenía durante el
    ensayo. Comprobar con una consulta DNS pública (`NS` y `A` de `inserttask.es`).
13. **Esperar y consultar el estado**: `ownership_state` pasa a `OWNERSHIP_ACTIVE` y `cert.state` a
    `CERT_ACTIVE` (hasta 24 h; normalmente horas). No debe pasarse de 30 días sin propiedad activa.
14. **Dominio en servicio (US1, SC-001)**: abrir `https://inserttask.es/` en Chrome, Safari, Firefox y
    Edge actuales: candado, certificado emitido para `inserttask.es`, sin avisos. Medir también el
    rendimiento (SC-005): mediana de tres cargas en frío frente a la URL `run.app`, máximo +150 ms.
15. **Redirecciones (US4, SC-007)**: `http://inserttask.es`, `http://www.inserttask.es` y
    `https://www.inserttask.es/<ruta>?<q>` acaban en `https://inserttask.es/<ruta>?<q>`.
16. **Inicio de sesión (US2, SC-004)**: cuenta invitada → tablero en menos de 1 minuto; recargar mantiene
    la sesión; cuenta no invitada → «Necesitas una invitación»; cerrar sesión.
17. **Funcionalidad completa (SC-006)**: tablero, tareas, perfil, tema, avatar subido y administración de
    accesos con la cuenta administradora; consola sin errores de CSP ni de CORS.
18. **Aislamiento de entornos**: `https://inserttask.es/config.js` apunta a la API y al proyecto de
    producción; staging no responde en ese dominio.
19. **Coste y certificado (US3, SC-002)**: tras unos días, confirmar en la factura que no hay concepto de
    certificado; anotar la fecha de caducidad del certificado para comprobar luego que se renovó solo.

## Comandos de prueba (repositorio)

```bash
# Scripts del pipeline (CORS, paridad de entornos)
python3 .github/scripts/tests/test_deploy_variable_check.py
python3 .github/scripts/tests/test_env_roots_parity.py

# Terraform (fmt local; validate y plan los ejecuta el CI con las identidades de solo lectura)
terraform -chdir=infra/envs/staging fmt -check
terraform -chdir=infra/envs/production fmt -check
```

`terraform validate` y `plan` no pueden arrancar el proveedor dentro del sandbox: el CI es el validador
(`infra.yml` publica el plan en el resumen de la ejecución).

## Resultado esperado

Los escenarios 1–9 y E1–E6 en verde en staging antes de la release, y los 10–19 en verde en producción
antes de dar la feature por lista. Los escenarios 4, 5, 14, 16 y 17 se registran en
`specs/005-custom-domain/validacion-produccion.md` por el propietario (como en las features 003 y 004).
