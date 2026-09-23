---
name: "speckit-git-commit"
description: "Comitea los artefactos de diseño (spec, plan, tasks) de la feature activa en un commit docs(spec) separado del código. Invocado como hook after_analyze; también invocable a mano."
argument-hint: "(sin argumentos)"
compatibility: "Requiere estructura de proyecto Spec Kit con .specify/ y la extensión gitflow"
metadata:
  author: "project"
  source: ".specify/extensions/gitflow/scripts/git_commit.py"
user-invocable: true
disable-model-invocation: false
---

## Qué hace

Comitea los artefactos de diseño de la feature activa (spec, plan, tasks) en
un commit separado del código, para que el diff de diseño y el de
implementación no se mezclen en la revisión de la PR. Registrado en
`.specify/extensions.yml` como hook `after_analyze`.

## Gate de CRITICAL (lo decide el agente, no el script)

Este skill **solo debe ejecutarse cuando el `/speckit-analyze` que se acaba de
ejecutar en esta misma conversación reportó cero hallazgos CRITICAL**. El
script no vuelve a analizar nada — no hay fichero de informe en disco que
pueda releer, `/speckit-analyze` solo imprime el informe en la conversación.

Antes de ejecutar el script:

1. Revisa el informe de `/speckit-analyze` que se acaba de generar en esta
   conversación.
2. Si hay uno o más CRITICAL: **no ejecutes el script**. Dile al usuario que
   corrija los hallazgos y vuelva a lanzar `/speckit-analyze` antes de poder
   comitear el diseño. Termina aquí.
3. Si no hay ningún CRITICAL: continúa.

## Ejecución

```bash
python3 .specify/extensions/gitflow/scripts/git_commit.py --json \
  --trailer "Co-Authored-By: <línea exacta de atribución activa en esta sesión>"
```

Usa exactamente la(s) línea(s) de atribución de commit que indique el
recordatorio de sistema activo en esta conversación (varía según el modelo);
no la inventes ni la omitas.

Interpreta el JSON de salida:
- `{"status": "nothing-to-commit", ...}` → no había cambios en el directorio
  de la feature desde el último commit. No hay nada que reportar.
- `{"status": "committed", "subject": "docs(spec): ...", ...}` → commit
  creado. Informa brevemente del asunto del commit.
- `{"status": "error", "message": "..."}` → detente y muestra el mensaje (por
  ejemplo, no estás en la rama `feature/<...>` — ejecuta
  `/speckit-git-feature` primero).

El script solo hace `git add` del directorio de la feature activa
(`specs/NNN-nombre/`); nunca añade otros cambios que pudiera haber en el
árbol de trabajo.

## Cuándo se invoca

- **Automático**: hook `after_analyze`, cada vez que `/speckit-analyze`
  termina sin CRITICAL (incluidas relanzadas tras corregir hallazgos: el
  script detecta si es el primer commit de la feature o una actualización).
- **Manual**: `/speckit-git-commit`, si el usuario quiere forzar el commit de
  diseño en otro momento.

## Done When

- [ ] Se ha comprobado el gate de CRITICAL contra el análisis de esta
      conversación antes de ejecutar el script
- [ ] El script se ha ejecutado (si procedía) y su resultado se ha
      interpretado
- [ ] Si el resultado es `error`, se ha reportado el mensaje sin intentar
      solucionarlo automáticamente
