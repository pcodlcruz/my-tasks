# Definition of Done — Feature 006 (T037)

Repaso del checklist de [`constitución`](../../.specify/memory/constitution.md) § *Definition of Done*
para la feature completa. Fecha: 2026-10-28.

**Resultado: lista para la release.** Lo que depende del código y de la documentación está cumplido. Quedan **pendientes solo los puntos
de la Phase 5** (validación en staging con la aprobación del aspecto del logo, release, despliegue a producción y validación del
propietario). Esos pasos son del propietario y del pipeline; el agente no los ejecuta.

**Alcance entregado** (decisiones del propietario del 2026-10-28, recogidas en [`spec.md`](./spec.md)): nombre «InsertTasks» en todos los
textos visibles; logo (insignia completa) en el inicio de sesión y en el acceso denegado; cabecera solo con el texto; el icono de la
pestaña no cambia (se mantiene `favicon.svg`). Quedan sin hacer, por esa decisión, T021, T028 y T031–T034.

| Punto de la constitución | Estado | Evidencia |
|---|---|---|
| Complejidad añadida justificada en el plan o ausente (I) | ✅ | Una constante (`lib/brand.ts`) y un componente de tres líneas (`BrandLogo`), usados en dos pantallas. Sin dependencias nuevas, sin backend, datos ni infraestructura. Se descartaron una variante por tema y un tamaño pequeño del logo (`research.md` R2 y R5; la decisión del 2026-10-28 retiró además el logo de la cabecera). |
| Tests del nivel correspondiente en la PR, en verde en local y en CI (II) | ✅ | Unitarios nuevos escritos primero (`brand.test.ts`, `BrandLogo.test.tsx` y ampliaciones de `LoginPage`, `AccessDeniedPage`, `BoardPage` y `AppHeader`) y e2e (`branding.spec.ts`, `access-denied.spec.ts`). Local: **371 unitarios y 74 e2e en verde**; el CI (`ci` e `infra`) terminó en `success` en las ramas de las fases 2 y 3 (`23fbfc2` y `4dc1ab5`), con `vite build` incluido, que en local el sandbox impide. Nota: en la primera pasada completa de la Fase 3 fallaron dos e2e de invitaciones (`profile-identity.spec.ts:174` y `revoke-access.spec.ts:10`) que no se reprodujeron al repetirlos aislados; no se ha investigado la causa. |
| Sin secretos en el repositorio; revisión `mytasks-security-auditor` (III) | ✅ | Sin secretos: solo texto e imagen públicos. **Revisión de seguridad no aplicable**: no cambia autenticación, autorización ni modelo de datos. El logo se muestra con `<img>`, nunca como HTML, así que no puede ejecutar código. |
| Si hay despliegue: staging validado antes de producción, siempre vía pipeline (IV, VI) | ⏳ | **Pendiente en la Phase 5**: el propietario valida los escenarios 1–10 de la sección C de [`quickstart.md`](./quickstart.md) en `https://staging.inserttask.es`, incluida la aprobación del aspecto del logo (SC-005), y después la release (T039–T042). Ningún despliegue manual. La aprobación visual previa con capturas locales la dio el propietario el 2026-10-28 (T024). |
| Ninguna operación en Google Cloud fuera del MCP ni con credenciales personales (V) | ✅ | La feature no hizo ninguna operación en Google Cloud (solo frontend). |
| PR fusionada por el propietario; ningún agente ha ejecutado `merge` (VII) | ✅ | Fusionadas por el propietario: #90 (diseño), #91 (Fase 1), #92 (ajustes de diseño), #93 (Fase 2) y #94 (Fase 3). La de esta fase (Fase 4) la fusiona él. Ningún agente ejecutó `merge`. |
| Tarea hecha con el agente/skill correspondiente o excepción justificada (VIII) | ✅ | `speckit-analyze` (informe de la PR #90), `speckit-implement`, `speckit-git-feature` y `speckit-git-pr`. **Excepciones justificadas**: (1) no se invocó `mytasks-frontend-developer` como skill, aunque el código sigue su stack y sus convenciones (React, TypeScript estricto, Vitest y Playwright); el cambio es pequeño y localizado. (2) `git_feature.py` y `git_pr.py` fallan en el sandbox al escribir `.git/config` y al hacer `push -u`; la rama se cambió con `git switch` y el push se hizo con `git push origin <rama>`, y las PR por el MCP de GitHub. (3) La PR #92 (`docs/006-…`) no sigue el patrón `feature/NNN-nombre`, así que los hooks no aplican y se hizo a mano. |
| Código y commits en inglés con Conventional Commits; PR, Issues y docs en español (IX) | ✅ | Verificable en el historial de `feature/006-app-branding*` y `docs/006-*`. Los textos visibles, la documentación y las PR están en español. |

## Pendiente de la Phase 5 (propietario y pipeline)

- T039: validar en staging los escenarios 1–10 de `quickstart.md` (incluida la aprobación del aspecto, SC-005).
- T040: crear `release/<versión>` desde `origin/develop` sin commits propios y abrir la PR a `main`.
- T041 y T042: fusionar la release, aprobar el despliegue a producción y repetir los escenarios 1–5 en `https://inserttask.es`.
- T043 y T044: registrar el resultado en `validacion-produccion.md`, marcar este documento como cerrado y decidir el retro-merge de `main`
  a `develop`.

## Sin medir ni resolver

- La causa de los dos e2e de invitaciones que fallaron una vez (arriba): pertenecen a la feature 003.
- El rótulo del logo dice «INSERTTASK» y el nombre es «InsertTasks»: aceptado por el propietario, no es un defecto.
