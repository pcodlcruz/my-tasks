# Quickstart: validar la infraestructura y el pipeline

**Feature**: `002-cloud-run-cicd` | **Plan**: [plan.md](./plan.md)

Guía de validación de extremo a extremo. Cada escenario enlaza con los requisitos de la
[spec](./spec.md) que demuestra. Las comprobaciones sobre Google Cloud las hace el agente **solo
por el MCP y en modo lectura** (Principio V); los cambios los aplica siempre el pipeline. Los
detalles de contrato están en [contracts/](./contracts/) y no se repiten aquí.

## Requisitos previos

- Fase 0 hecha por el propietario: proyecto de staging creado y con facturación (producción usa `pdlco-mytasks`), clave de
  `mytasks-ai-agent` creada y guardada fuera del repo, comprobación de que la organización
  permite claves (riesgo R-1).
- Fases 1 a 5 implementadas y fusionadas en `develop` (para el escenario 6, también en `main`).
- Configuración manual única del proveedor de Google en cada entorno hecha según
  `infra/RUNBOOK.md` (riesgo R-2).
- Notificaciones de GitHub Actions activadas en la cuenta del propietario (correo y/o móvil).
- Rulesets de `main`, `develop`, `release/*` y `hotfix/*` con los *checks* requeridos de
  [contracts/pipeline.md](./contracts/pipeline.md).

Las URL de los servicios son deterministas:
`https://mytasks-web-<número de proyecto>.europe-southwest1.run.app` y
`https://mytasks-api-<número de proyecto>.europe-southwest1.run.app`. Se obtienen del
despliegue de GitHub o de la salida de Terraform.

## Escenario 1 — Identidad del agente (FR-022 a FR-025, SC-010)

Ejecutar la lista de 9 comprobaciones de
[contracts/agent-identity.md § Verificación repetible](./contracts/agent-identity.md).

- **Resultado esperado**: todas pasan; solo `mytasks-ai-agent` tiene credenciales en el entorno
  del MCP; leer las credenciales personales o la clave está denegado; los intentos de cambiar de
  identidad quedan rechazados y registrados; el registro de auditoría muestra solo la cuenta del
  agente.
- **Repetir**: tras reiniciar la sesión y tras cada rotación de clave.

## Escenario 2 — Los PR comprueban pero no despliegan (FR-004, FR-005)

1. Abrir una PR trivial contra `develop`.
2. Observar los *checks*: `backend-lint-types`, `backend-tests`, `frontend-lint-types`,
   `frontend-tests`, `e2e`, `images-build`, `secrets-scan`, `api-contract-compat` y
   `terraform-validate` (este último queda omitido, y cuenta como superado, si la PR no toca
   `infra/**`).

- **Resultado esperado**: todos verdes; en *Environments* no aparece ningún despliegue nuevo.
- **Negativo**: romper a propósito un test de la PR → el check falla y la fusión queda bloqueada
  por el ruleset. Retirar un campo del contrato de la API → `api-contract-compat` falla.

## Escenario 3 — Staging desde `develop` (US1, FR-001/002/016/017, SC-001)

1. Fusionar (el propietario) la PR en `develop`.
2. Esperar a `deploy-staging` y medir el tiempo hasta el estado *success*.
3. Consultar la versión y la salud:

   ```bash
   curl -fsS https://mytasks-api-<n>.europe-southwest1.run.app/healthz
   curl -fsS https://mytasks-api-<n>.europe-southwest1.run.app/readyz
   curl -fsS https://mytasks-web-<n>.europe-southwest1.run.app/config.js
   ```

4. Abrir el frontend de staging, iniciar sesión con Google y crear una tarea.

- **Resultado esperado**: pipeline en verde en < 15 min (95 % de las ejecuciones); `/healthz`
  devuelve la versión del commit; `/readyz` `200`; `/config.js` apunta a la API de **staging**;
  el flujo de tareas funciona; el despliegue figura en GitHub con commit y resultado.

## Escenario 4 — Un fallo no sustituye la versión activa (FR-007/008, SC-004/005, US2.4)

1. En una PR de prueba contra `develop` (o `hotfix/*`), introducir un fallo que rompa `/readyz`
   (por ejemplo, una variable obligatoria mal escrita).
2. Que el propietario la fusione (nunca un push directo: Principio VII) y observar
   `deploy-staging`.

- **Resultado esperado**: el humo falla, el tráfico **no cambia**, staging sigue sirviendo la
  versión anterior sin interrupción y el propietario recibe la notificación (escenario 8).
  Variante: variable obligatoria ausente → el job falla antes de desplegar y nombra la variable.

## Escenario 5 — Aislamiento entre entornos (US3, FR-009/010/014/015, SC-009)

1. Crear una tarea en staging con un título único.
2. Con la cuenta de Google de prueba, comprobar en producción que no existe.
3. Comparar las definiciones de los dos entornos (plan de Terraform de cada raíz).
4. Comprobar que la API de staging rechaza un token emitido por el proyecto de producción, y
   viceversa.

- **Resultado esperado**: 0 fugas de datos; las definiciones difieren solo en dimensionado e
  identificadores; ninguna referencia cruzada entre los dos proyectos, salvo el repositorio de imágenes (staging solo
  lo lee y publica en él; no puede tocar los servicios ni los datos de producción).

## Escenario 6 — Producción desde `main` con la misma imagen (US2, FR-003/006, SC-002)

1. Crear la PR de release (`develop` → `release/*` → `main`); staging ya validó ese contenido.
2. Fusionar en `main` (el propietario) y observar `deploy-production`.
3. Comparar el resumen (digest) de la imagen desplegada en producción con el de staging.

- **Resultado esperado**: producción se despliega en < 15 min sin reconstruir; **mismo digest**
  que staging; `/healthz` de producción devuelve la misma versión; `/config.js` apunta a la API de
  **producción**.
- **Negativo**: llegar a `main` con un cambio que nunca desplegó en staging → el job falla antes
  de desplegar con el mensaje "versión no validada en staging" y producción no cambia.

## Escenario 7 — Nadie más puede desplegar (FR-013, SC-003)

1. Solicitar al agente (por el MCP) crear una revisión de Cloud Run en staging o producción.
2. Repetir con una rama no permitida en GitHub (`feature/*`) intentando usar la identidad de
   despliegue.

- **Resultado esperado**: ambas denegadas (la cuenta del agente es de solo lectura; la
  federación rechaza ramas y entornos no permitidos).

## Escenario 8 — Fallos visibles y estado consultable (US4, FR-018, SC-006)

1. Forzar el fallo del escenario 4 y cronometrar hasta recibir la notificación.
2. Consultar la versión de cada entorno en *Environments* y en `/healthz`.

- **Resultado esperado**: notificación en < 5 min con el paso fallido y el enlace; versión de cada
  entorno conocida sin acceder a la infraestructura.

## Escenario 9 — Concurrencia (FR-019, edge case)

1. Fusionar dos cambios en `develop` con pocos segundos de diferencia.

- **Resultado esperado**: nunca dos despliegues a la vez; termina el que está en curso y después
  solo el más reciente; staging queda con la última versión.

## Escenario 10 — Sin secretos y reproducibilidad (FR-011/012, SC-007/008)

1. Ejecutar el análisis de secretos sobre todo el repositorio y su historial.
2. Recrear un entorno de pruebas desde `infra/` siguiendo solo `RUNBOOK.md` (en un proyecto
   desechable acordado con el propietario).

- **Resultado esperado**: 0 credenciales detectadas; el entorno se recrea sin pasos no
  documentados (el paso manual del proveedor de Google está documentado, R-2).

## Criterio de aceptación de la feature

Los diez escenarios pasan, la revisión de `mytasks-security-auditor` no tiene hallazgos
bloqueantes y la *Definition of Done* de la constitución se cumple. Al terminar, el propietario
decide (vía `/speckit-constitution`) si pasa a *activo* el estado de los mecanismos de
cumplimiento que esta feature implementa.
