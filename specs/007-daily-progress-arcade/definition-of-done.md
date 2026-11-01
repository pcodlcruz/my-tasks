# Definition of Done — Feature 007 (progreso diario, tareas programadas y gamificación arcade)

**Fecha del repaso**: 2026-11-01 · **Constitución**: v1.3.2 · **Tarea**: T120

Repaso del checklist *Definition of Done* de la constitución para la feature completa. Solo quedan
pendientes los puntos que dependen de la Fase 9 (release y validación en staging y producción) o de
la PR de esta fase. Se cierran en T126.

## Checklist

- [x] **Complejidad añadida justificada en el plan o ausente (I).**
  `plan.md` § *Constitution Check* (Principio I: ✅ con complejidad justificada) y § *Complexity
  Tracking*. Se evitaron Cloud Scheduler, jobs e identidades nuevas, los índices compuestos y una
  colección de catálogo.

- [x] **Tests del nivel correspondiente en la PR (II)**, en verde en local.
  - Verificado el 2026-11-01, con los emuladores: backend **920** (más `test_performance.py` con
    `-m perf`, que pasa), frontend **588** unitarios y **96** e2e, todo en verde.
  - Cada escenario de `quickstart.md` tiene su test (tabla de T118).
  - Salvedades ya declaradas en las PRs: en la Fase 2 los tests del backend se escribieron después
    del código, y en la Fase 7 los unitarios y e2e del frontend se escribieron junto a él.
  - **CI**: no he vuelto a comprobar el CI de las PRs #98 a #105 (las fusionó el propietario). El de
    la PR de la Fase 8 se comprueba al abrirla → ver «Pendiente».

- [x] **Sin secretos en el repositorio; revisión de seguridad hecha (III).**
  Revisiones por fase (`security-review-fase-2.md`, `-fase-6.md`, `-fase-7.md`) y la final
  (`security-review-final.md`): sin críticos, altos ni medios abiertos. Cuatro bajos al backlog
  (LOW-001 a LOW-004) y un punto por confirmar del propietario. Búsqueda de credenciales en el código,
  los documentos y el script de exportación: sin coincidencias.

- [ ] **Si hay despliegue: staging validado antes de producción, siempre vía pipeline (IV, VI).**
  *Pendiente de la Fase 9.* La feature no cambia infraestructura ni pipeline. T122 (staging) y T125
  (producción) los hace el propietario; el despliegue, solo el pipeline.

- [x] **Ninguna operación en Google Cloud fuera del MCP oficial ni con credenciales personales (V).**
  La feature no ha requerido operar sobre Google Cloud: sin cambios en `infra/`, `.github/`, IAM ni
  variables de entorno. La exportación de las pantallas de Stitch la ejecutó el propietario con su
  propio token (el agente no usa credenciales personales).
  *Por confirmar por el propietario*: deshabilitar `stitch.googleapis.com` en `pdlco-mytasks` y
  retirar los permisos usados (ver `security-review-final.md`).

- [ ] **PR fusionada explícitamente por el propietario tras revisar el diff; ningún agente ha
  ejecutado `merge` (VII).**
  Cumplido para las PRs #98 a #105 (diseño y Fases 1 a 7), fusionadas por el propietario.
  *Pendiente*: la PR de la Fase 8, la de release a `main` (T123/T124) y la documental de cierre
  (T126).

- [x] **Tarea realizada con el agente/skill correspondiente o excepción justificada (VIII).**
  Backend, frontend y revisiones de seguridad con `mytasks-backend-developer`,
  `mytasks-frontend-developer` y `mytasks-security-auditor`; el ciclo git, con los skills
  `speckit-git-*`. **Excepción** (a repetir en la PR de la Fase 8): la integración del contrato
  (T115), el README, el runbook y las notas de ampliación (T116, T117) y el quickstart (T118) son
  documentación y no los cubre ningún skill de rol; se hicieron a mano, y los datos que citan
  (zona por defecto, eventos de registro, comportamiento de `X-Test-Now`) se contrastaron con el
  código.

- [x] **Código y commits en inglés con Conventional Commits; PR, Issues y docs en español (IX).**
  Todos los commits de la feature desde el de diseño siguen `type(scope): subject` en inglés;
  las PRs y la documentación están en español.

## Pendiente (solo Fase 9 y PR de esta fase)

| Punto | Qué falta | Tarea |
|---|---|---|
| II (CI) | CI en verde de la PR de la Fase 8 | al abrirla |
| IV, VI | Staging validado y producción por el pipeline | T122–T125 |
| VII | Fusión por el propietario de la PR de la Fase 8, la release y la documental de cierre | T123, T124, T126 |
| V | Confirmar la baja de `stitch.googleapis.com` | propietario |
