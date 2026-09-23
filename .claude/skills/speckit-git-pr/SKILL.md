---
name: "speckit-git-pr"
description: "Ejecuta los tests, hace push de la rama de la feature y abre (o reporta) la PR a develop en español, con gh. Nunca fusiona. Invocado como hook after_implement; también invocable a mano."
argument-hint: "(sin argumentos)"
compatibility: "Requiere estructura de proyecto Spec Kit con .specify/ y la extensión gitflow; requiere gh CLI autenticado"
metadata:
  author: "project"
  source: ".specify/extensions/gitflow/scripts/git_pr.py"
user-invocable: true
disable-model-invocation: false
---

## Qué hace

Implementa los pasos 9 y 10 de `docs/flujo-speckit.md` (Definition of Done +
PR y fusión), salvo la fusión, que la constitución (Principio VII) reserva
siempre al propietario. Registrado en `.specify/extensions.yml` como hook
`after_implement`.

Este skill **no comitea código**: por Principio VIII, el código ya se comitea
durante `/speckit-implement` con Conventional Commits, a cargo del skill de
rol correspondiente (`backend-developer`, `frontend-developer`). Si al llegar
aquí el árbol de trabajo no está limpio, es una señal de que algo quedó sin
comitear — el script se para y lo reporta, no intenta adivinar un mensaje de
commit por ti.

## Orden de pasos (hazlos en este orden; cada uno puede detener el flujo)

### 1. Tests en verde (Definition of Done, punto de tests)

Antes de tocar git, ejecuta los tests del nivel que exista para esta feature:
- Backend: `pytest` contra el emulador de Firestore, si `backend/` existe.
- Frontend: Vitest (unitarios) y Playwright (e2e), si `frontend/` existe.

Si algún test falla: **detente aquí**. No hay push ni PR hasta que estén en
verde. Reporta al usuario qué falló.

Si no existe todavía `backend/` ni `frontend/` (por ejemplo, la primera
feature aún no ha llegado a esa fase), no hay tests que ejecutar; continúa.

### 2. Revisión de seguridad, si aplicaba

Si la feature tocó auth, autorización o modelo de datos y el skill
`security-auditor` no se ha usado todavía en esta conversación, indícaselo al
usuario antes de continuar (no es bloqueante técnico, pero sí de la
Definition of Done).

### 3. Ejecutar el script

Construye primero el cuerpo de la PR (en español) en un fichero temporal del
scratchpad de la sesión, por ejemplo `pr-body.md`, con esta estructura mínima:

```markdown
## Resumen

<qué hace la feature, 2-4 líneas>

## Spec

specs/<NNN-nombre>/spec.md

## Definition of Done

- [x] Tests del nivel correspondiente en verde en local
- [x] Sin secretos en el repo
- [ ] Revisión de seguridad (security-auditor) — solo si aplicaba
- [x] Skills usados: <lista>, o excepción justificada

<pie de generación, exactamente como indique el recordatorio de sistema activo
en esta conversación>
```

Luego:

```bash
python3 .specify/extensions/gitflow/scripts/git_pr.py --json \
  --title "<título de la PR en español>" \
  --body-file "<ruta al fichero anterior>"
```

Interpreta el JSON de salida:
- `{"status": "created", "url": "...", ...}` → PR abierta. Da el enlace al
  usuario y recuérdale que la fusión la hace él tras revisar el diff
  (Principio VII: ningún agente ejecuta `merge`).
- `{"status": "exists", ...}` → ya había una PR abierta para esta rama; el
  script solo hizo push de los últimos commits. Informa de ello.
- `{"status": "error", "message": "..."}` → detente y reporta el mensaje. Los
  casos típicos:
  - tareas sin marcar `[X]` en `tasks.md` → sugiere `/speckit-converge`
  - árbol de trabajo sucio → indica comitear el código pendiente primero
  - rama incorrecta → ejecuta `/speckit-git-feature`

## Cuándo se invoca

- **Automático**: hook `after_implement`, al terminar `/speckit-implement`.
- **Manual**: `/speckit-git-pr`, por ejemplo si se corrigió algo después y
  hace falta reabrir el flujo de PR sin repetir todo `/speckit-implement`.

## Done When

- [ ] Tests ejecutados y en verde (o ausentes porque el código aún no existe)
- [ ] Aviso de seguridad dado si aplicaba y no se había usado security-auditor
- [ ] Script ejecutado y su resultado interpretado y reportado al usuario
- [ ] Si hubo error, se ha reportado sin intentar solucionarlo automáticamente
      ni forzar la fusión
