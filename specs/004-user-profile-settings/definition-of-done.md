# Definition of Done — Feature 004 (T106)

Repaso del checklist de [`constitución`](../../.specify/memory/constitution.md) § *Definition of Done*
para la feature completa. Fecha: 2026-10-25.

**Resultado: lista para staging, no para producción.** Todo lo que depende del código y de la
documentación está cumplido. Faltan dos puntos que no puede cerrar un agente: la validación en
staging (T107, propietario) y la fusión de la PR de la Fase 7 (T108). Hasta entonces la feature no
se promueve a producción.

| Punto de la constitución | Estado | Evidencia |
|---|---|---|
| Complejidad añadida justificada en el plan o ausente (I) | ✅ | `plan.md` § Complexity Tracking: una dependencia nueva (`pillow`), colores como variables CSS, `theme-init.js` externo y el límite de subidas en el documento de perfil, cada uno con su alternativa más simple descartada. Sin almacenamiento en la nube, sin librería de recorte y sin sistema genérico de límite de frecuencia. |
| Tests del nivel correspondiente en la PR, en verde en local y en CI (II) | ✅ | Unitarios y de integración por endpoint (backend), Vitest (frontend) y e2e de Playwright por flujo con axe en claro y oscuro. Última ejecución completa, en la Fase 6: 636 de backend más el umbral de rendimiento de la 001, 358 unitarios de frontend y 69 e2e, con `ruff`, `mypy`, `eslint`, `prettier` y `tsc` limpios. El CI de la PR #62 y el de `develop` tras fusionarla están en verde. La Fase 7 solo cambia documentación y contrato. Incidencia: `test_invite_the_same_address_twice_at_once_creates_it_once` falló una vez en el CI de `develop` por contención de transacciones en el emulador (misma familia que el flaky conocido de la 003); no depende de esta feature y pasó al relanzar. |
| Sin secretos en el repositorio; revisión `mytasks-security-auditor` (III) | ✅ | Sin variables ni secretos nuevos; `pillow` 13.0.0 fijado con *hashes* en `backend/uv.lock`; `secrets-scan` en verde en todas las PR. Revisiones: [`security-review-fase-2.md`](./security-review-fase-2.md), [`-fase-3.md`](./security-review-fase-3.md), [`-fase-6.md`](./security-review-fase-6.md) y [`security-review-final.md`](./security-review-final.md). Riesgo global bajo; los tres medios hallados se corrigieron en su PR y no queda ninguno abierto. |
| Si hay despliegue: staging validado antes de producción, siempre vía pipeline (IV, VI) | ⏳ | Sin cambios de infraestructura ni de variables (solo `img-src` con `blob:` en el script de la imagen web, que construye el pipeline). Staging se despliega solo desde `develop` por el pipeline. **Pendiente T107 (propietario)**: validar los escenarios 1, 4, 7, 9, 12 y 16 de `quickstart.md` con cuentas reales, comprobar que la consola no muestra errores de CSP y anotarlo en `validacion-staging.md`. Producción solo promueve lo que staging validó. |
| Ninguna operación en Google Cloud fuera del MCP ni con credenciales personales (V) | ✅ | La feature no ha requerido ninguna operación del agente sobre Google Cloud. El MCP de Stitch (diseño) no es Google Cloud. Los procedimientos manuales de `RUNBOOK.md` §13 son del propietario, con sus credenciales, y están marcados como no probados. |
| PR fusionada por el propietario; ningún agente ha ejecutado `merge` (VII) | ⏳ | Fusionadas por el propietario: #56 (diseño) y las de las Fases 1 a 6 (#57 a #62). Ningún agente ejecutó `merge`. Pendiente: la PR de la Fase 7. |
| Tarea hecha con el agente/skill correspondiente o excepción justificada (VIII) | ✅ | `mytasks-backend-developer`, `mytasks-frontend-developer`, `mytasks-security-auditor`, `speckit-git-feature` y `speckit-git-pr`. Excepciones justificadas: (1) ningún skill cubre el diseño en Stitch; se hizo manualmente con el MCP de Stitch, como en la 001 (R12); (2) `git_pr.py` no puede hacer `git push` dentro del sandbox, así que el push se hizo con `git push origin <rama>` y la PR por el MCP de GitHub. |
| Código y commits en inglés con Conventional Commits; PR, Issues y docs en español (IX) | ✅ | Verificable en el historial de las ramas `feature/004-user-profile-settings*`. |

## Antes del release a producción

1. **T107** (propietario): validación en staging, ya desplegado por el pipeline, de los escenarios 1,
   4, 7, 9, 12 y 16 de `quickstart.md`, con la consola del navegador sin errores de CSP (en
   particular al ver el avatar subido), y su registro en `validacion-staging.md`.
2. Comprobar los avisos de seguridad de Pillow 13.0.0: no se pudo ejecutar un escáner de CVE desde
   la sesión del agente (ver «Alcance» de `security-review-final.md`).
3. **T108**: marcar la feature como lista para release cuando T107 esté hecha y la PR de la Fase 7
   fusionada.
4. Decidir sobre el backlog de bajos (todos aceptables para el release): LOW-001 y LOW-003 de la
   Fase 2, LOW-001 de la Fase 3 (regla de nginx para `theme-init.js`) y LOW-001 y LOW-002 de la
   Fase 6. LOW-002 de la Fase 3 (caché de apariencia en `localStorage`) es un riesgo aceptado (R8).
5. Aparte de esta feature: endurecer los reintentos de `_retry_on_abort` (003), que son la causa de
   los tests de invitaciones que fallan de vez en cuando bajo carga.
