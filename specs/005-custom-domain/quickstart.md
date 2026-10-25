# Quickstart de validación: dominio propio

**Feature**: [spec.md](./spec.md) · **Contratos**: [edge](./contracts/edge.md),
[pipeline-env](./contracts/pipeline-env.md)

Guía para demostrar de extremo a extremo que la feature funciona. Cada escenario indica **dónde** se
ejecuta. Como el dominio solo existe en producción, la mitad del camino (Hosting, inicio de sesión, CORS)
se prueba antes en **staging**, por `<proyecto>.web.app`, que usa los mismos recursos (Principio IV).

## Prerrequisitos

- Permisos concedidos a `terraform-<env>` y API activada (contrato `pipeline-env.md` §3), verificados en
  solo lectura.
- Variable `CUSTOM_WEB_ORIGINS=https://inserttask.com` en el entorno de GitHub `production` (no en
  `staging`).
- Acceso al proveedor de DNS donde está registrado `inserttask.com`.
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
9. **Rendimiento (SC-005)**: tres cargas en frío de `web.app` y de `run.app` desde la misma red; la
   diferencia debe quedar dentro de la variabilidad normal.

## B. Producción (tras la release y el `apply` de `infra` aprobado)

10. **Antes del DNS**: la web ya responde en `https://pdlco-mytasks.web.app/` (mismas comprobaciones 1–5).
    Todavía no existe `inserttask.com` para el público.
11. **Leer lo que pide Hosting**: sacar de las salidas de Terraform (o de la consola de Firebase) los
    registros exactos de `required_dns_updates` (`edge.md` §3).
12. **Registros DNS (el propietario)**: retirar `A`/`AAAA`/`CNAME` previos del proveedor; añadir `TXT`
    de propiedad y `A`/`AAAA` del apex y de `www`; añadir `CAA` solo si ya había `CAA`. Comprobar con una
    herramienta de consulta DNS que los registros resuelven.
13. **Esperar y consultar el estado**: `ownership_state` pasa a `OWNERSHIP_ACTIVE` y `cert.state` a
    `CERT_ACTIVE` (hasta 24 h; normalmente horas). No debe pasarse de 30 días sin propiedad activa.
14. **Dominio en servicio (US1, SC-001)**: abrir `https://inserttask.com/` en Chrome, Safari, Firefox y
    Edge actuales: candado, certificado emitido para `inserttask.com`, sin avisos.
15. **Redirecciones (US4, SC-007)**: `http://inserttask.com`, `http://www.inserttask.com` y
    `https://www.inserttask.com/<ruta>?<q>` acaban en `https://inserttask.com/<ruta>?<q>`.
16. **Inicio de sesión (US2, SC-004)**: cuenta invitada → tablero en menos de 1 minuto; recargar mantiene
    la sesión; cuenta no invitada → «Necesitas una invitación»; cerrar sesión.
17. **Funcionalidad completa (SC-006)**: tablero, tareas, perfil, tema, avatar subido y administración de
    accesos con la cuenta administradora; consola sin errores de CSP ni de CORS.
18. **Aislamiento de entornos**: `https://inserttask.com/config.js` apunta a la API y al proyecto de
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

Los escenarios 1–9 en verde en staging antes de la release, y los 10–19 en verde en producción antes de
dar la feature por lista. Los escenarios 4, 5, 14, 16 y 17 se registran en
`specs/005-custom-domain/validacion-produccion.md` por el propietario (como en las features 003 y 004).
