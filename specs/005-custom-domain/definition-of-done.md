# Definition of Done — Feature 005 (T041)

Repaso del checklist de [`constitución`](../../.specify/memory/constitution.md) § *Definition of Done*
para la feature completa. Fecha: 2026-10-26.

**Resultado: lista para la release, con las condiciones de abajo.** Lo que depende del código, de la
infraestructura en staging y de la documentación está cumplido. Quedan **pendientes solo los puntos de la Phase 7**
(puesta en servicio en producción, ensayo de `staging.inserttask.es` y validación del propietario) y tres
condiciones previas a crear la release: T043 (escenarios 1–9 en staging confirmados por el propietario), T073
(`prevent_destroy` del dominio restaurado) y T061 (PR de cierre de staging fusionada).

| Punto de la constitución | Estado | Evidencia |
|---|---|---|
| Complejidad añadida justificada en el plan o ausente (I) | ✅ | `plan.md` § Constitution Check y Complexity Tracking: Hosting impuesto por el propietario, proveedor `google-beta` fijado (R4: los recursos de Hosting no existen en el GA), zona de Cloud DNS por entorno (decisión del propietario) con delegación de `staging` desde producción, y subdominio de ensayo `staging.inserttask.es`, cada uno con su alternativa más simple descartada. No se añade ningún servicio de red nuevo ni se cambia la región. |
| Tests del nivel correspondiente en la PR, en verde en local y en CI (II) | ✅ | La feature no cambia código de aplicación: son scripts de pipeline e infraestructura. Pruebas de scripts (`test_cors_origins.py`, `test_deploy_custom_origins.py`, `test_deploy_variable_check.py`, `test_env_roots_parity.py`, `test-custom-domains-summary.sh`, `test-infra-plan.sh`) en verde en local y en el job `scripts-tests`; `terraform fmt -check` limpio. `terraform validate` y `plan` los ejecuta el CI (`terraform-validate`), en verde en las PR #74 y #75. Lo comprobable solo con la infraestructura real (Hosting, certificado, inicio de sesión desde el dominio) se valida en staging y en producción (quickstart). |
| Sin secretos en el repositorio; revisión `mytasks-security-auditor` (III) | ✅ | Sin secretos nuevos: zonas, registros, servidores de nombres y orígenes son públicos; `secrets-scan` en verde en todas las PR. Revisiones: [`security-review-fase-2.md`](./security-review-fase-2.md) y [`security-review-final.md`](./security-review-final.md). Riesgo global bajo; el único medio (MED-001, delegación `NS` huérfana) se corrigió en esta fase como procedimiento y quedan tres bajos en backlog. |
| Si hay despliegue: staging validado antes de producción, siempre vía pipeline (IV, VI) | ⏳ | Staging se aplicó solo por el pipeline (`infra.yml`, con la aprobación del propietario) para Hosting (Fase 3), el dominio (Fase 4) y Cloud DNS (Fase 5). Escenarios 1–9: T029 dio 8 de 9 en verde y el noveno (rendimiento, SC-005) se resolvió con un umbral absoluto de +150 ms (PR #71); el propietario confirmó T030. **Pendiente**: T043 (confirmación completa) y, ya en la Phase 7, el ensayo de `staging.inserttask.es` (T055–T060), que ocurre tras el cambio de servidores de nombres porque el registrador no admite un `NS` de subdominio. Producción solo se aplica con la release. |
| Ninguna operación en Google Cloud fuera del MCP ni con credenciales personales (V) | ✅ | Las operaciones del agente fueron lecturas con el MCP de Google Cloud (permisos y roles en T004 y T063, zona de staging tras su `apply`). Los permisos, el rol `mytasksDnsAdmin`, la actualización de `mytasksPlanReader` y el cambio de servidores de nombres los hace el propietario con sus credenciales. Ningún `apply` fuera del pipeline. |
| PR fusionada por el propietario; ningún agente ha ejecutado `merge` (VII) | ✅ | Fusionadas por el propietario: #70 (Fase 3), #71 (SC-005), #72 (Fase 4), #73 (enmienda de diseño), #74 (Fase 5), #75 (enmienda del ensayo), #76 (T074), además de las de las Fases 1 y 2. Ningún agente ejecutó `merge`. |
| Tarea hecha con el agente/skill correspondiente o excepción justificada (VIII) | ✅ | `mytasks-iac-developer`, `mytasks-google-cloud-architect`, `mytasks-security-auditor`, `speckit-git-feature` y `speckit-implement`. Excepciones justificadas: (1) `git_pr.py` se niega a empujar mientras quedan tareas de la fase sin marcar (por ejemplo la lectura del plan, que solo puede hacer el propietario), así que el push se hizo con `git push origin <rama>` y la PR por el MCP de GitHub; (2) las PR de enmienda de diseño (`docs/…`) y la de T074 (`fix/…`) no siguen el patrón `feature/NNN-nombre`, de modo que los hooks no aplican y se hicieron a mano. |
| Código y commits en inglés con Conventional Commits; PR, Issues y docs en español (IX) | ✅ | Verificable en el historial de las ramas `feature/005-custom-domain*`, `docs/005-*` y `fix/005-*`. |

## Antes de crear la release (condiciones)

1. **T043** (propietario): confirmar los escenarios 1–9 del quickstart en staging. T029 y T030 ya constan.
2. **T073**: restaurar `prevent_destroy` en el dominio de Hosting, en una PR propia con el plan de solo lectura sin
   cambios en recursos.
3. **T061**: fusionar la PR documental de cierre de staging (`validacion-staging.md`).

## Pendiente de la Phase 7 (no bloquea la fusión de las fases)

- T044–T054: release 1.3.0, `apply` de producción aprobado, cambio de servidores de nombres, ensayo de `staging.inserttask.es`
  (T055–T060), validación de `inserttask.es` y cierre en `validacion-produccion.md`.
- Dentro del ensayo, resolver la duda de `security-review-final.md` sobre si autorizar `inserttask.es` en Identity Platform
  autoriza sus subdominios.
- Backlog de bajos (aceptables para el release): LOW-001 (contraste de CORS y dominios, ya cubierto por T047 y T059),
  LOW-002 (DNSSEC) y LOW-003 (registros `CAA`).
