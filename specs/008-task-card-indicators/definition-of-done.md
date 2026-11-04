# Definition of Done — Feature 008 (indicadores compactos en la tarjeta de tarea)

**Fecha del repaso**: 2026-11-04 · **Constitución**: v1.3.2 · **Tarea**: T025

Repaso del checklist *Definition of Done* de la constitución para la feature completa. Solo quedan
pendientes los puntos que dependen de la Fase 4 (validación en staging, release y producción) o de
la PR de esta fase.

## Checklist

- [x] **Complejidad añadida justificada en el plan o ausente (I).**
  `plan.md` § *Complexity Tracking*: sin violaciones que justificar. Solo se añadió un componente
  (`CardIndicator`), usado únicamente por la tarjeta; sin dependencias nuevas, sin cambios en el
  backend ni en `infra/`.

- [x] **Tests del nivel correspondiente en la PR (II)**, en verde en local y en CI.
  - Fase 2 (PR #110): **600** unitarios y **99** e2e en verde en local, con los emuladores.
    Incluyen los tests nuevos de `CardIndicator`, los de `TaskCard` reescritos y, en
    `a11y.spec.ts`, el de no solapamiento (320, 768, 1024 y 1280 px, densidad cómoda y compacta) y
    axe en claro y oscuro con el tooltip abierto.
  - CI de #110: los 15 checks en verde (e2e, frontend, backend, secrets-scan, etc.).
  - Las Fases 1 y 3 son de diseño y documentación: no llevan código con tests.

- [x] **Sin secretos en el repositorio; revisión de seguridad solo si tocó auth, autorización o
  modelo de datos (III).**
  **No aplica la revisión de seguridad**: la feature es solo frontend y no toca autenticación,
  autorización ni modelo de datos (`research.md` R9). `secrets-scan` del CI en verde en #110.

- [ ] **Si hay despliegue: staging validado antes de producción, siempre vía pipeline (IV, VI).**
  *Pendiente de la Fase 4.* La feature no cambia infraestructura ni pipeline. T026 (staging) y T028
  (producción) los hace el propietario; el despliegue, solo el pipeline.

- [x] **Ninguna operación en Google Cloud fuera del MCP oficial ni con credenciales personales (V).**
  La feature no ha requerido operar sobre Google Cloud: sin cambios en `infra/`, `.github/`, IAM ni
  variables de entorno. Las pantallas se generaron con el MCP de Stitch y la exportación la ejecutó
  el propietario con su propio token (el agente no usa credenciales personales).

- [ ] **PR fusionada explícitamente por el propietario tras revisar el diff; ningún agente ha
  ejecutado `merge` (VII).**
  Cumplido para las PRs #108 (diseño), #109 (Fase 1) y #110 (Fase 2), fusionadas por el
  propietario. *Pendiente*: la PR de esta fase (Fase 3) y la de release a `main` (T027, T028).

- [x] **Tarea realizada con el agente/skill correspondiente o excepción justificada (VIII).**
  Frontend con `mytasks-frontend-developer`; el ciclo git, con los skills `speckit-git-*`.
  **Excepción** (a repetir en la PR de esta fase): la documentación (T023–T025) no la cubre ningún
  skill de rol; se hizo a mano. Los datos que cita (fechas, números de PR, resultados de tests) se
  contrastaron con las PRs y el CI.

- [x] **Código y commits en inglés con Conventional Commits; PR, Issues y docs en español (IX).**
  Los commits de la feature siguen `type(scope): subject` en inglés; las PRs y la documentación
  están en español.

## Pendiente (solo Fase 4 y PR de esta fase)

| Punto | Qué falta | Tarea |
|---|---|---|
| II (CI) | CI en verde de la PR de esta fase | al abrirla |
| IV, VI | Staging validado y producción por el pipeline | T026–T028 |
| VII | Fusión por el propietario de la PR de esta fase y de la release | T027, T028 |
