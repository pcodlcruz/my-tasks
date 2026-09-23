---
name: "speckit-git-feature"
description: "Crea o verifica la rama GitFlow feature/<NNN-nombre> de la feature Spec Kit activa. Invocado como hook after_tasks / before_implement; también invocable a mano."
argument-hint: "(sin argumentos)"
compatibility: "Requiere estructura de proyecto Spec Kit con .specify/ y la extensión gitflow"
metadata:
  author: "project"
  source: ".specify/extensions/gitflow/scripts/git_feature.py"
user-invocable: true
disable-model-invocation: false
---

## Qué hace

Implementa el "Paso 1 — Rama" de `docs/flujo-speckit.md` de forma automática, tal
como registra `.specify/extensions.yml` (hooks `after_tasks` y
`before_implement`). Spec Kit 1.0.4 no ejecuta ningún comando git por su
cuenta; este skill es lo que lo suple.

No decide nada por criterio del agente: toda la lógica (qué rama, qué
ficheros bloquean el cambio, desde qué base) vive en
`.specify/extensions/gitflow/scripts/git_feature.py`, para que el
comportamiento sea el mismo cada vez.

## Ejecución

1. Ejecuta desde la raíz del repo:

   ```bash
   python3 .specify/extensions/gitflow/scripts/git_feature.py --json
   ```

2. Interpreta el JSON de salida (una línea):
   - `{"status": "already-on-branch", "branch": "...", ...}` → ya estás en la
     rama correcta. No hay nada más que hacer.
   - `{"status": "created", "branch": "...", "base": "origin/develop", ...}` →
     rama creada desde `develop`. Informa brevemente al usuario del nombre de
     rama.
   - `{"status": "error", "message": "..."}` → **detente** y muestra el
     mensaje al usuario tal cual (ya está en español y explica la causa:
     no hay feature activa, la rama ya existe en otro sitio, o hay cambios en
     el árbol de trabajo que no pertenecen a la feature). No reintentes con
     `--force` ni edites el árbol de trabajo por tu cuenta para "arreglarlo";
     eso lo decide el usuario.

3. Si esto se ejecuta como hook `before_implement` y el resultado es
   `already-on-branch`, no hace falta reportar nada especial: es la
   comprobación de seguridad silenciosa de la que habla
   `docs/flujo-speckit.md`.

## Cuándo se invoca

- **Automático**: como hook `after_tasks` (justo tras generar `tasks.md`) y
  `before_implement` (red de seguridad), según `.specify/extensions.yml`.
- **Manual**: si el usuario pide `/speckit-git-feature` directamente, por
  ejemplo tras resolver a mano un conflicto que detuvo la creación automática.

## Done When

- [ ] El script se ha ejecutado y su resultado se ha interpretado
- [ ] Si el resultado es `error`, se ha reportado el mensaje al usuario sin
      intentar solucionarlo automáticamente
- [ ] Si el resultado es `created`, se ha informado brevemente de la rama
      resultante
