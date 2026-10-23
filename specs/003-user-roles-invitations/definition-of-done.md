# Definition of Done — Feature 003 (T058)

Repaso del checklist de [`constitución`](../../.specify/memory/constitution.md) § *Definition of Done*
para la feature completa. Fecha: 2026-10-23.

**Resultado: lista.** El propietario validó staging (T057) y fusionó la PR de la Fase 4 el
2026-10-23. Quedan los puntos de «Antes del release a producción», más abajo.

| Punto de la constitución | Estado | Evidencia |
|---|---|---|
| Complejidad añadida justificada en el plan o ausente (I) | ✅ | `plan.md` § Constitution Check: sin dependencias nuevas; dos colecciones nuevas (`users/{uid}` como documento, `invitations/{correo}`) justificadas en `data-model.md`. |
| Tests del nivel correspondiente en la PR, en verde en local y en CI (II) | ✅ | Unitarios y de integración por endpoint (backend), Vitest (frontend) y e2e de Playwright por flujo (invitar, revocar y reinvitar, acceso denegado). Última ejecución completa de la Fase 3: 387 de backend, 113 unitarias de frontend y 36 e2e en verde. La Fase 4 solo cambia documentación. Las PR #49, #50 y #51 se fusionaron con los checks requeridos en verde. |
| Sin secretos en el repositorio; revisión `mytasks-security-auditor` (III) | ✅ | `BOOTSTRAP_ADMIN_EMAIL` es una dirección, no un secreto. Revisiones: `security-review-fase-1.md`, `-fase-2.md`, `-fase-3.md` y `security-review-final.md`. Riesgo global bajo; sin hallazgos críticos, altos ni medios. |
| Si hay despliegue: staging validado antes de producción, siempre vía pipeline (IV, VI) | ✅ | Staging se despliega solo desde `develop` por el pipeline. El propietario validó los escenarios 1–6 de `quickstart.md` (T057), anotado en `validacion-staging.md`. Producción solo promueve lo que staging validó. |
| Ninguna operación en Google Cloud fuera del MCP ni con credenciales personales (V) | ✅ | La feature no ha requerido ninguna operación sobre Google Cloud del agente; los despliegues los hace el pipeline. Los procedimientos manuales de `RUNBOOK.md` §12 son del propietario, con sus credenciales, y están marcados como no probados. |
| PR fusionada por el propietario; ningún agente ha ejecutado `merge` (VII) | ✅ | #49, #50, #51 y #52 fusionadas por el propietario. |
| Tarea hecha con el agente/skill correspondiente o excepción justificada (VIII) | ✅ | `mytasks-backend-developer`, `mytasks-frontend-developer`, `mytasks-security-auditor`, `speckit-git-feature` y `speckit-git-pr`. Excepción justificada: el script `git_pr.py` no puede hacer `git push` dentro del sandbox, así que el push se hizo con `git push origin <rama>` y la PR por el MCP de GitHub. |
| Código y commits en inglés con Conventional Commits; PR, Issues y docs en español (IX) | ✅ | Verificable en el historial de las cuatro ramas. |

## Antes del release a producción

Resumen de lo que `security-review-final.md` recomienda cerrar antes de promover a `main`:

1. ~~**T057**~~ Hecho: validado en staging por el propietario.
2. ~~Corregir **LOW-001 de la Fase 3**~~ Hecho: `SessionCacheReset` vacía la caché del cliente al
   cambiar de usuario o cerrar sesión.
3. ~~Comprobar en ambos entornos que Firebase Authentication (Identity Platform) tiene **solo el
   proveedor Google** y la opción de **una cuenta por correo**~~ Hecho: comprobado por el
   propietario el 2026-10-23.
4. ~~Probar en staging la recuperación del administrador descrita en `RUNBOOK.md` §12~~ Omitida
   por decisión del propietario (2026-10-23): por ahora es el único administrador. **Riesgo
   aceptado**: si pierde el acceso a su cuenta, la recuperación del runbook no está probada.
   Conviene probarla antes de añadir más administradores o personas con acceso.
5. Decidir sobre el bootstrap (Fase 1, LOW-001), la caducidad de invitaciones y el correo guardado
   (LOW-002 y LOW-003 de la revisión final); pueden ir al backlog técnico si se aceptan.
