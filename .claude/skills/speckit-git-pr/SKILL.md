---
name: "speckit-git-pr"
description: "Ejecuta los tests, hace push de la rama de la feature y abre (o reporta) la PR a develop en español, vía el MCP de GitHub. Nunca fusiona. Invocado como hook after_implement; también invocable a mano."
argument-hint: "(sin argumentos)"
compatibility: "Requiere estructura de proyecto Spec Kit con .specify/ y la extensión gitflow; requiere el MCP de GitHub"
metadata:
  author: "project"
  source: ".specify/extensions/gitflow/scripts/git_pr.py"
user-invocable: true
disable-model-invocation: false
---

## Qué hace

Cubre la parte de tests y PR de la Definition of Done al terminar
`/speckit-implement`: comprueba que el código está listo, hace push de la
rama y abre la PR a `develop`. Registrado en `.specify/extensions.yml` como
hook `after_implement`.

**Nunca fusiona**: la fusión la reserva siempre el propietario, tras revisar
el diff (Principio VII de la constitución). Ni este skill ni ningún otro
ejecuta `merge` ni equivalentes.

**Toda operación contra GitHub usa el MCP de GitHub, nunca el CLI `gh`
directamente.** El script `.specify/extensions/gitflow/scripts/git_pr.py`
solo hace `git push` (git puro, no API de GitHub); comprobar si ya existe PR
y crearla, si hace falta, lo hace este skill llamando a las herramientas MCP
(`pull_request_read` / `list_pull_requests`, `create_pull_request`).

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

### 3. Push (script)

```bash
python3 .specify/extensions/gitflow/scripts/git_pr.py --json
```

Interpreta el JSON de salida:
- `{"status": "pushed", "branch": "...", "owner": "...", "repo": "...", ...}`
  → rama empujada a `origin`. Continúa al paso 4 con `owner`/`repo`.
  Si el script no pudo derivar `owner`/`repo` del remoto `origin` (campos
  ausentes), pregunta al usuario el owner/repo de GitHub antes de continuar.
- `{"status": "error", "message": "..."}` → detente y reporta el mensaje. Los
  casos típicos:
  - tareas sin marcar `[X]` en `tasks.md` → sugiere `/speckit-converge`
  - árbol de trabajo sucio → indica comitear el código pendiente primero
  - rama incorrecta → ejecuta `/speckit-git-feature`

### 4. Comprobar si ya existe PR (MCP)

Llama a `mcp__github__list_pull_requests` con `owner`, `repo`, `head`
(`"<owner>:<branch>"`), `state: "open"`. Si hay una PR abierta para esa rama,
es el caso `exists`: informa al usuario de su URL y termina aquí (no hace
falta crear nada; el push del paso 3 ya la actualizó).

### 5. Crear la PR (MCP), si no existía

Redacta el título y el cuerpo en español:

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

Llama a `mcp__github__create_pull_request` con `owner`, `repo`, `title`,
`body`, `head: "<branch>"`, `base: "develop"`. Da el enlace resultante al
usuario y recuérdale que la fusión la hace él tras revisar el diff.

## Cuándo se invoca

- **Automático**: hook `after_implement`, al terminar `/speckit-implement`.
- **Manual**: `/speckit-git-pr`, por ejemplo si se corrigió algo después y
  hace falta reabrir el flujo de PR sin repetir todo `/speckit-implement`.

## Done When

- [ ] Tests ejecutados y en verde (o ausentes porque el código aún no existe)
- [ ] Aviso de seguridad dado si aplicaba y no se había usado security-auditor
- [ ] Script de push ejecutado y su resultado interpretado
- [ ] Existencia de PR comprobada vía MCP; PR creada vía MCP si no existía
- [ ] Si hubo error, se ha reportado sin intentar solucionarlo automáticamente
      ni forzar la fusión
