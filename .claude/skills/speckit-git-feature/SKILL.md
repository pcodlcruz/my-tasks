---
name: "speckit-git-feature"
description: "Crea o verifica la rama GitFlow de la feature Spec Kit activa: la rama de diseño feature/<NNN-nombre> (hook after_tasks) o la rama de una fase de tasks.md, feature/<NNN-nombre>-fase-<N> (hook before_implement). También invocable a mano."
argument-hint: "[fase N | auto]"
compatibility: "Requiere estructura de proyecto Spec Kit con .specify/ y la extensión gitflow"
metadata:
  author: "project"
  source: ".specify/extensions/gitflow/scripts/git_feature.py"
user-invocable: true
disable-model-invocation: false
---

## Qué hace

Crea automáticamente la rama GitFlow de la feature activa, tal como registra
`.specify/extensions.yml` (hooks `after_tasks` y `before_implement`). Spec Kit
1.0.4 no ejecuta ningún comando git por su cuenta; este skill es lo que lo
suple.

Cada feature se entrega en **una PR de diseño y una PR por fase de
`tasks.md`**, para que cada PR sea manejable:

| Rama | Contenido | Se crea en |
|---|---|---|
| `feature/NNN-nombre` | spec, plan, tasks y demás documentos de diseño | hook `after_tasks` |
| `feature/NNN-nombre-fase-N` | el código de la fase N de `tasks.md` (`## Phase N: ...`) | hook `before_implement` |

Cada rama de fase sale de `origin/develop` **cuando la PR de diseño ya está
fusionada** (el script lee la lista de fases del `tasks.md` de
`origin/develop`). Lo normal es esperar también a que se fusione la fase de la
que depende; las fases que el propio `tasks.md` declara paralelas (por ejemplo,
diseño en Stitch y Foundational) pueden abrirse a la vez.

No decide nada por criterio del agente: toda la lógica (qué rama, qué
ficheros bloquean el cambio, desde qué base, qué fase toca) vive en
`.specify/extensions/gitflow/scripts/git_feature.py`, para que el
comportamiento sea el mismo cada vez.

## Ejecución

Desde la raíz del repo, según el contexto:

- **Hook `after_tasks`** (o invocación manual sin fase) — rama de diseño:

  ```bash
  python3 .specify/extensions/gitflow/scripts/git_feature.py
  ```

- **Hook `before_implement`** (o invocación manual con fase) — rama de fase:

  ```bash
  python3 .specify/extensions/gitflow/scripts/git_feature.py --phase <N|auto>
  ```

  Usa el número de fase que el usuario pidió al lanzar `/speckit-implement`
  (p. ej. `/speckit-implement fase 3` → `--phase 3`). Si no indicó ninguna,
  usa `--phase auto`: la primera fase con tareas pendientes en
  `origin/develop`.

El script imprime una línea JSON. Interprétala:

- `{"status": "already-on-branch", ...}` → ya estás en la rama correcta. En
  `before_implement` es la comprobación silenciosa de siempre; no hace falta
  reportar nada.
- `{"status": "created", "branch": "...", ...}` → rama creada desde
  `origin/develop`. Informa brevemente del nombre de la rama y, en modo fase,
  de `phase`/`phase_title`.
- En modo fase, si `pending_earlier_phases` no está vacío, avisa al usuario de
  que esas fases anteriores siguen pendientes en `develop` (no bloquea: puede
  ser una fase paralela a propósito).
- `{"status": "error", "message": "..."}` → **detente** y muestra el mensaje
  tal cual (ya está en español y explica la causa: no hay feature activa, la
  PR de diseño no está fusionada, la fase no existe o ya está completa, la
  rama ya existe en otro sitio, o el árbol de trabajo tiene cambios que lo
  impiden). No lo "arregles" editando el árbol de trabajo por tu cuenta; eso
  lo decide el usuario.

## Alcance de `/speckit-implement` en modo fase

Cuando este skill se ejecuta como `before_implement` y termina en
`created` o `already-on-branch` con un `phase`, **`/speckit-implement` debe
ejecutar solo las tareas de esa fase** (la sección `## Phase <N>: ...` de
`tasks.md`): no ejecuta ni marca `[X]` tareas de otras fases. Al terminar la
fase, el hook `after_implement` abre su PR.

## Cuándo se invoca

- **Automático**: como hook `after_tasks` (rama de diseño, justo tras generar
  `tasks.md`) y `before_implement` (rama de la fase que se va a implementar),
  según `.specify/extensions.yml`.
- **Manual**: `/speckit-git-feature` o `/speckit-git-feature fase N`, por
  ejemplo tras resolver a mano un conflicto que detuvo la creación
  automática.

## Done When

- [ ] El script se ha ejecutado en el modo correcto y su resultado se ha
      interpretado
- [ ] Si el resultado es `error`, se ha reportado el mensaje al usuario sin
      intentar solucionarlo automáticamente
- [ ] Si el resultado es `created`, se ha informado brevemente de la rama
      (y de la fase, si aplica)
- [ ] En modo fase, se ha avisado de `pending_earlier_phases` si no estaba
      vacío
