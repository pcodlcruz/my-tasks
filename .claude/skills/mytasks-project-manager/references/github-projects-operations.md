# GitHub Projects CLI — Referencia de operaciones para el Project Manager

Este documento es la referencia rápida de los comandos `gh` que usa el agente Project Manager. Sirve para que el agente sepa qué parámetros son obligatorios y cuándo usar cada operación.

## Setup

Requiere la CLI `gh` instalada y autenticada:

```bash
gh auth status          # verificar autenticación
gh auth login           # autenticarse si es necesario
```

---

## Operaciones de Proyecto

### `gh project create`
Crea un nuevo proyecto en GitHub Projects (v2).

```bash
gh project create --owner <owner> --title "<nombre del proyecto>"
# Devuelve la URL y el número del proyecto
```

**Parámetros clave:**
- `--owner` (requerido): usuario u organización (`@me` para el usuario autenticado)
- `--title` (requerido): nombre del proyecto

**Cuándo usarla:** al inicio de cualquier proyecto nuevo o épica grande.

---

### `gh project list`
Lista los proyectos disponibles.

```bash
gh project list --owner <owner>
```

---

### `gh project view`
Muestra el detalle de un proyecto.

```bash
gh project view <project-number> --owner <owner>
```

---

## Operaciones de Issues

### `gh issue create`
Crea una nueva issue en el repositorio.

```bash
gh issue create \
  --title "<título>" \
  --body "<descripción en Markdown>" \
  --label "<etiqueta>" \
  --assignee "<usuario>"
```

**Parámetros clave:**
- `--title` (requerido): título claro y accionable (verbos en infinitivo, e.g., "Diseñar arquitectura de autenticación")
- `--body`: cuerpo en Markdown con el contexto completo
- `--label`: etiquetas (puede repetirse para múltiples)
- `--assignee`: usuario asignado
- `--milestone`: milestone asociado

### `gh issue edit`
Edita una issue existente.

```bash
gh issue edit <número> \
  --title "<nuevo título>" \
  --add-label "<etiqueta>" \
  --remove-label "<etiqueta>" \
  --assignee "<usuario>"
```

### `gh issue list`
Lista issues del repositorio con filtros.

```bash
gh issue list --state open --label "<etiqueta>"
gh issue list --search "<texto>"    # búsqueda por texto
gh issue list --assignee "<usuario>"
```

**Cuándo usarla:** standups, revisiones de sprint, búsqueda antes de crear issues.

### `gh issue comment`
Añade un comentario a una issue.

```bash
gh issue comment <número> --body "<cuerpo en Markdown>"
```

**Convenciones de comentarios del PM:**
- `[DELEGADO → nombre-agente]` al delegar
- `[COMPLETADO]` al marcar como done con resumen del resultado
- `[BLOCKER]` al registrar un impedimento
- `[DECISIÓN]` al registrar una decisión de diseño o priorización

### `gh issue view`
Muestra el detalle de una issue.

```bash
gh issue view <número>
```

---

## Operaciones de GitHub Projects (items y campos)

### `gh project item-add`
Añade una issue al proyecto.

```bash
gh project item-add <project-number> \
  --owner <owner> \
  --url <issue-url>
# Devuelve el item-id del elemento en el proyecto
```

### `gh project item-list`
Lista los items de un proyecto.

```bash
gh project item-list <project-number> --owner <owner>
gh project item-list <project-number> --owner <owner> --format json
```

**Cuándo usarla:** standups, revisiones de sprint.

### `gh project item-edit`
Actualiza un campo de un item del proyecto (e.g., Status, Sprint).

```bash
gh project item-edit \
  --id <item-id> \
  --field-id <field-id> \
  --project-id <project-id> \
  --single-select-option-id <option-id>   # para campos de tipo single select (Status)
```

Para obtener los IDs de campos y opciones:
```bash
gh project field-list <project-number> --owner <owner> --format json
```

### `gh project field-create`
Crea un campo personalizado en el proyecto.

```bash
# Campo de iteración (sprint)
gh project field-create <project-number> \
  --owner <owner> \
  --name "Sprint" \
  --data-type ITERATION

# Campo de selección simple (si Status no existe)
gh project field-create <project-number> \
  --owner <owner> \
  --name "Status" \
  --data-type SINGLE_SELECT \
  --single-select-options "Todo,In Progress,In Review,Done,Cancelled"
```

---

## Operaciones GraphQL (workarounds para scopes limitados)

Los comandos `gh project item-add`, `gh project list` y `gh project item-edit` requieren el scope `read:org`. Si el PAT no lo tiene, usar la API GraphQL directamente.

### Obtener IDs del proyecto y sus campos

```bash
gh api graphql -f query='
{
  viewer {
    projectsV2(first: 10) {
      nodes { id number title url }
    }
  }
}'

gh api graphql -f query='
{
  node(id: "<PROJECT_ID>") {
    ... on ProjectV2 {
      items(first: 50) {
        nodes {
          id
          content { ... on Issue { number } }
        }
      }
      fields(first: 20) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id name
            options { id name }
          }
        }
      }
    }
  }
}'
```

### Añadir una issue al proyecto

```bash
gh api graphql -f query='
mutation {
  addProjectV2ItemById(input: {
    projectId: "<PROJECT_ID>"
    contentId: "<ISSUE_NODE_ID>"
  }) { item { id } }
}'
```

Para obtener el `ISSUE_NODE_ID`:
```bash
gh api graphql -f query='
{
  repository(owner: "<owner>", name: "<repo>") {
    issues(first: 20, states: OPEN) {
      nodes { number id }
    }
  }
}'
```

### Crear campo Agent (single-select) en el proyecto

Crear siempre en el kickoff de cualquier proyecto con agentes:

```bash
gh api graphql -f query='
mutation {
  createProjectV2Field(input: {
    projectId: "<PROJECT_ID>"
    dataType: SINGLE_SELECT
    name: "Agent"
    singleSelectOptions: [
      { name: "guybrush", color: BLUE, description: "python-backend-expert" }
      { name: "stan", color: PURPLE, description: "frontend-developer" }
      { name: "carla", color: RED, description: "security-auditor" }
      { name: "elaine", color: GREEN, description: "project-manager" }
    ]
  }) {
    projectV2Field {
      ... on ProjectV2SingleSelectField {
        id name
        options { id name }
      }
    }
  }
}'
```

Adaptar las opciones al equipo de agentes del proyecto concreto.

### Actualizar campo de un item (Status, Agent, etc.)

```bash
gh api graphql -f query='
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "<PROJECT_ID>"
    itemId: "<ITEM_ID>"
    fieldId: "<FIELD_ID>"
    value: { singleSelectOptionId: "<OPTION_ID>" }
  }) { projectV2Item { id } }
}'
```

---

## Prioridades y etiquetas recomendadas

### Prioridades (etiquetas de issue)
| Etiqueta | Significado | Cuándo usar |
|---|---|---|
| `priority:urgent` | Bloquea el proyecto | Blocker crítico, dependencia de otros equipos |
| `priority:high` | Sprint actual | Tarea comprometida para el sprint en curso |
| `priority:medium` | Próximo sprint | Backlog refinado y listo para planificar |
| `priority:low` | Backlog | Ideas o tareas futuras sin fecha |

### Etiquetas por tipo de agente
- `agent:architect` — tareas para google-cloud-architect
- `agent:backend` — tareas para python-backend-expert
- `agent:frontend` — tareas para frontend-developer
- `agent:security` — tareas para security-auditor
- `agent:content` — tareas para tech-content-writer
- `blocker` — issue que bloquea otras
- `decision-needed` — requiere decisión del usuario antes de avanzar

---

## Flujo típico de una tarea delegada

```bash
# 1. Verificar que no existe ya
gh issue list --search "<nombre aproximado>"

# 2. Crear la issue
gh issue create --title "<título>" --body "<Ficha de Delegación>" --label "agent:backend,priority:high"

# 3. Añadir al proyecto
gh project item-add <project-number> --owner <owner> --url <issue-url>

# 4. Emitir Ficha de Delegación al agente en el chat

# 5. Registrar delegación en la issue
gh issue comment <número> --body "[DELEGADO → nombre-agente] Ficha enviada."

# [agente trabaja...]

# 6. Actualizar estado a In Review
gh project item-edit --id <item-id> --field-id <status-field-id> --project-id <project-id> --single-select-option-id <in-review-id>

# 7. Registrar resultado
gh issue comment <número> --body "[COMPLETADO] Resumen del resultado."

# 8. Actualizar estado a Done
gh project item-edit --id <item-id> --field-id <status-field-id> --project-id <project-id> --single-select-option-id <done-id>
```
