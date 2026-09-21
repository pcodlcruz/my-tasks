<!--
Informe de Impacto de Sincronización (Sync Impact Report)
Cambio de versión: 1.1.1 → 1.2.0 (MINOR: redefine el mecanismo de cumplimiento del Principio
  VII para un mantenedor único; la intención del principio — nada de push directo, ratificación
  humana antes de integrar — no cambia, pero sí su forma de verificarse).
Cambios:
  - Principio VII (Revisión Humana Obligatoria): se sustituye la exigencia de "aprobación del
    propietario" como review formal de GitHub por "fusión (`merge`) explícita del propietario
    tras revisar el diff". Motivo: en un proyecto de un único mantenedor, las PR se abren bajo
    la identidad de GitHub del propio propietario (no hay cuenta de agente separada) y GitHub
    impide aprobar la propia PR — exigir esa aprobación formal habría dejado el repositorio
    permanentemente bloqueado. Se añade la prohibición explícita de que un agente ejecute
    `merge`, y que las reglas de rama no tengan actores exentos ("bypass"), ni siquiera el
    propietario.
  - Mecanismos de Cumplimiento: la fila de branch protection del Principio VII se divide en dos
    y pasa de "pendiente" a "activo" en su parte de bloqueo de push directo (rulesets de GitHub
    sin bypass_actors en `main`, `develop`, `release/*`, `hotfix/*`, verificado con
    `GET /repos/.../rules/branches/{rama}`); los checks de CI siguen "pendiente" hasta que
    exista el pipeline.
  - Definition of Done: el punto del Principio VII se reformula acorde ("PR fusionada
    explícitamente por el propietario", en vez de "PR aprobada").
Pendientes / TODOs:
  - El resto de mecanismos de la tabla (permisos del pipeline de CI/CD, checks de tests y
    commitlint, plantillas de PR/Issue) siguen "pendiente" hasta que exista el pipeline de
    CI/CD.
Plantillas que requieren seguimiento: ninguna; las plantillas de plan/spec/tasks leen este
  documento en tiempo de ejecución y no se modifican aquí.
-->

# Constitución del Gestor Personal de Tareas

## Convenciones Normativas

- **DEBE** / **SIEMPRE** ≡ MUST: obligatorio; su incumplimiento bloquea la fusión o el
  despliegue.
- **PROHIBIDO** / **NUNCA** ≡ MUST NOT: prohibición absoluta, sin excepciones por urgencia.
- **DEBERÍA** ≡ SHOULD: recomendado; desviarse exige justificación escrita en el plan o la PR.
- **NON-NEGOTIABLE**: el principio no admite excepción ni justificación en el *Complexity
  Tracking* de un plan; solo puede cambiarse enmendando esta constitución.

## Principios Fundamentales

### I. Simplicidad y Complejidad Justificada
Toda feature DEBE implementarse con la solución más simple que cumpla la especificación. Cada
abstracción, capa, dependencia o servicio adicional DEBE justificarse en el *Complexity
Tracking* del plan frente a la alternativa más simple rechazada. Está PROHIBIDO implementar
funcionalidad especulativa no cubierta por la especificación vigente (YAGNI).

**Rationale**: en un proyecto personal la complejidad no justificada es el principal
generador de deuda técnica y de coste operativo en la nube.

### II. Tests por Niveles (NON-NEGOTIABLE)
Toda feature DEBE incluir, en la misma PR que el código, los tests que correspondan a lo que
toca:
- Lógica de dominio o de negocio → tests unitarios (`pytest` en backend, `Vitest` en frontend).
- Cada endpoint de API nuevo o modificado → test de integración contra la aplicación FastAPI.
- Cada flujo de usuario principal de la feature → test end-to-end con `Playwright`.

Los tests DEBEN pasar en local antes de abrir la PR y en CI antes de fusionar. Un cambio sin
los tests de su nivel no se considera completo aunque funcione.

**Rationale**: definir el nivel de test exigible por tipo de cambio hace que `/speckit-tasks`
genere tareas de test consistentes y que la cobertura no dependa del criterio de cada agente.

### III. Seguridad de Aplicación
- Todo endpoint que lea o escriba datos de tareas DEBE exigir autenticación; no existen
  endpoints de datos anónimos.
- Toda entrada externa DEBE validarse en el límite del sistema (modelos Pydantic en backend,
  tipado estricto y validación de esquemas en frontend).
- Está PROHIBIDO almacenar secretos en el repositorio; se inyectan por entorno desde Google
  Secret Manager (nube) o `.env` ignorado por git (local).
- Las dependencias DEBEN estar fijadas por versión (lockfiles) y actualizarse de forma
  planificada.
- Todo cambio que afecte a autenticación, autorización o modelo de datos DEBE pasar una
  revisión con el skill `security-auditor` antes de fusionarse.

**Rationale**: el sistema gestiona datos personales; la seguridad de la aplicación merece el
mismo rigor que ya se exige a la identidad en la nube.

### IV. Paridad de Entornos
Existen tres entornos con la misma topología y configuración (el dimensionado puede diferir):
- **Local**: desarrollo y ejecución de tests (con el emulador de Firestore); único entorno
  donde se prueba manualmente.
- **Staging** (Google Cloud): validación previa a producción; se despliega desde `develop`.
- **Producción** (Google Cloud): producto real; se despliega desde `main` (releases y hotfixes).

Un cambio DEBE superar staging antes de promoverse a producción. Está PROHIBIDO usar staging o
producción como entorno de desarrollo o de pruebas manuales ad-hoc.

**Rationale**: mapear cada entorno a una rama de GitFlow elimina la ambigüedad sobre qué se
despliega dónde y protege a los usuarios reales durante la iteración.

### V. Identidad de Agente y Acceso Exclusivo por MCP Oficial (NON-NEGOTIABLE)
Toda interacción con Google Cloud DEBE realizarse a través del MCP oficial de Google Cloud con
la cuenta de servicio dedicada al agente. Está PROHIBIDO ejecutar directamente `gcloud`,
`gsutil`, `bq` o sus equivalentes de API/SDK fuera del MCP, y está PROHIBIDO usar credenciales
personales del usuario para cualquier operación, de lectura o escritura, en cualquier entorno.
Los cambios de infraestructura DEBEN confirmarse explícitamente por el propietario antes de
aplicarse.

**Rationale**: una única vía de acceso con identidad de servicio auditable elimina operaciones
no trazadas y el riesgo de exponer credenciales personales.

### VI. Despliegue Automatizado por Pipeline CI/CD (NON-NEGOTIABLE)
Todo despliegue a staging o producción se realiza exclusivamente a través del pipeline de
CI/CD. Está PROHIBIDO cualquier despliegue manual o vía que evite el pipeline, incluso en caso
de urgencia; los hotfixes siguen el flujo `hotfix/*` → `main` → pipeline.

**Rationale**: el pipeline es el único punto donde se garantizan tests en verde, aprobación
humana y trazabilidad del despliegue.

### VII. Revisión Humana Obligatoria (NON-NEGOTIABLE)
Todo cambio de código se integra exclusivamente mediante Pull Request. Están PROHIBIDOS los
commits directos a `main`, `develop`, `release/*` y `hotfix/*`; esta prohibición se hace
cumplir con reglas de rama (rulesets de GitHub) sin actores exentos ("bypass"), incluido el
propio propietario. Como las PR se abren bajo la identidad de GitHub del propietario (no existe
una cuenta de GitHub separada para el agente), no se exige un review formal con aprobación de
un tercero: GitHub lo impide en cualquier caso al ser un proyecto de un único mantenedor
("no puedes aprobar tu propia PR"). La ratificación humana se ejerce mediante la fusión
("merge") explícita del propietario tras revisar el diff: un agente NUNCA ejecuta `merge` (ni
equivalentes) sobre una PR, la haya abierto él mismo o no. Los checks de CI, cuando existan,
DEBEN estar en verde antes de fusionar.

**Rationale**: en un proyecto de un único mantenedor, exigir una aprobación formal de GitHub
distinta del autor es técnicamente irrealizable. El control real de calidad e intención se
obtiene con dos garantías separables y verificables: ninguna rama protegida acepta push
directo (ni siquiera del propietario), y solo el propietario ejecuta la fusión.

### VIII. Desarrollo Dirigido por Agentes y Skills
Toda tarea que entre en el alcance de un agente o skill definido en `.claude/` DEBE realizarse
a través de él, respetando su rol. La ejecución manual ad-hoc solo es aceptable cuando ningún
agente o skill cubre la tarea, y la excepción DEBE justificarse en la PR.

**Rationale**: los agentes especializados mantienen criterios técnicos consistentes y evitan
decisiones de seguridad o infraestructura fuera del proceso previsto.

### IX. Idioma y Convenciones de Comunicación (NON-NEGOTIABLE)
- **Inglés**: código (identificadores y comentarios) y mensajes de commit.
- **Español**: documentación del proyecto (README, docs internos, ADRs, esta constitución),
  interacción entre el usuario y los agentes, y título y cuerpo de Pull Requests e Issues.
- Los mensajes de commit DEBEN seguir [Conventional Commits](https://www.conventionalcommits.org/)
  (`type(scope): subject`; tipos estándar como `feat`, `fix`, `docs`, `refactor`, `test`,
  `chore`, `ci`).

**Rationale**: el código y los commits en inglés siguen el estándar del ecosistema y las
herramientas; el resto en español evita fricción de traducción para el equipo.

## Restricciones Técnicas

Stack fijado por esta constitución; cambiarlo requiere enmienda, no una decisión de plan.

- **Frontend**: React 18+, TypeScript en modo estricto, TanStack Query (estado servidor),
  Zustand (estado cliente), Vitest (unitarios) y Playwright (end-to-end). Ver skill
  `frontend-developer`.
- **Backend**: Python 3.12+, FastAPI, pytest. Ver skill `backend-developer` (su preferencia
  por SQLAlchemy/Alembic no aplica: la persistencia es Firestore, ver siguiente punto).
- **Base de datos**: Firestore (modo nativo) mediante la librería oficial
  `google-cloud-firestore`. En local se usa el emulador de Firestore; los tests de integración
  (Principio II) se ejecutan contra el emulador, nunca contra un proyecto real.
- **Nube**: Google Cloud exclusivamente. El servicio concreto de ejecución (p. ej. Cloud Run)
  y la topología los define el skill `google-cloud-architect` en el plan de arquitectura.
- **Identidad en la nube**: La cuenta de servicio dedicada al agente es
  `mytasks-ai-agent@pdlco-mytasks.iam.gserviceaccount.com`. Está PROHIBIDO el uso de cualquier otra.

## Control de Versiones y Gestión de Proyecto

- **Modelo de ramas**: GitFlow. `feature/*` → `develop` (staging) → `release/*` → `main`
  (producción); `hotfix/*` → `main` y retro-merge a `develop`.
- **Repositorio remoto**: GitHub.
- **Tareas e incidencias**: GitHub Issues; seguimiento en GitHub Projects con tablero Kanban.
- **Integración de cambios**: solo mediante Pull Request (Principio VII).
- **Commits y textos**: Conventional Commits en inglés; PRs e Issues en español (Principio IX).

## Mecanismos de Cumplimiento

Cada regla NON-NEGOTIABLE se respalda con un mecanismo técnico. Mientras un mecanismo figure
como *pendiente*, la regla sigue siendo vinculante y su cumplimiento se verifica en la revisión
de la PR.

| Regla | Mecanismo | Estado |
|---|---|---|
| PR obligatoria, sin commits directos, fusión manual del propietario (VII) | Rulesets de GitHub en `main`, `develop`, `release/*`, `hotfix/*`: PR requerida, sin `bypass_actors`, borrado y push no-fast-forward bloqueados | activo |
| Checks de CI en verde antes de fusionar (VII) | Required status checks en los rulesets anteriores | pendiente (sin pipeline de CI aún) |
| Prohibición de `gcloud`/`gsutil`/`bq` directos (V) | Regla `deny` en `.claude/settings.json` para `Bash(gcloud:*)`, `Bash(gsutil:*)`, `Bash(bq:*)` | activo |
| Sin credenciales personales (V) | El MCP de Google Cloud se configura únicamente con la cuenta de servicio del agente; sin *Application Default Credentials* personales en el entorno del agente | pendiente |
| Despliegue solo vía pipeline (VI) | Solo la identidad del pipeline de CI/CD tiene permisos de despliegue; la cuenta de servicio del agente no los tiene | pendiente |
| Tests por niveles (II) | Jobs de `pytest`, `Vitest` y `Playwright` como required status checks | pendiente |
| Conventional Commits (IX) | `commitlint` en CI como required status check | pendiente |
| Idioma de PRs e Issues (IX) | Plantillas de PR e Issue en español; verificación en revisión | pendiente |

## Definition of Done

Una tarea, PR o despliegue solo se considera completo cuando se cumplen todos estos puntos:

- [ ] Complejidad añadida justificada en el plan o ausente (I).
- [ ] Tests del nivel correspondiente incluidos en la PR, en verde en local y en CI (II).
- [ ] Sin secretos en el repositorio; revisión `security-auditor` hecha si tocó auth,
      autorización o modelo de datos (III).
- [ ] Si hay despliegue: staging validado antes de producción, siempre vía pipeline (IV, VI).
- [ ] Ninguna operación en Google Cloud fuera del MCP oficial ni con credenciales personales (V).
- [ ] PR fusionada explícitamente por el propietario tras revisar el diff; ningún agente ha
      ejecutado `merge` sobre ella (VII).
- [ ] Tarea realizada con el agente/skill correspondiente o excepción justificada (VIII).
- [ ] Código y commits en inglés con Conventional Commits; PR, Issues y docs en español (IX).

## Gobernanza

Esta constitución prevalece sobre cualquier otra práctica, convención, plantilla o preferencia
individual del proyecto; en caso de conflicto, prevalece este documento.

**Enmiendas**: cualquier agente o persona puede proponer una enmienda mediante PR sobre este
fichero, con la justificación del cambio y el Informe de Impacto actualizado. Solo el
propietario del proyecto ratifica una enmienda; un agente NUNCA ratifica un cambio a la
constitución por sí mismo. La versión sigue semver: MAJOR para eliminaciones o redefiniciones
incompatibles de principios; MINOR para principios o secciones nuevas o ampliación material;
PATCH para aclaraciones y correcciones no semánticas.

**Cumplimiento**: `/speckit-plan` DEBE derivar el *Constitution Check* de cada feature de los
principios I–IX; `/speckit-analyze` trata toda violación de un DEBE/PROHIBIDO como CRITICAL.
Toda PR se verifica contra la *Definition of Done* antes de aprobarse.

**Revisión**: esta constitución se revisa, como mínimo, al inicio de cada feature (vía
`/speckit-plan`) y antes de cualquier decisión de arquitectura relevante. Las reglas siempre
activas (V, VI, VII, VIII, IX) se reflejan además en `CLAUDE.md` para que apliquen fuera de
los comandos de Spec Kit; toda enmienda a esas reglas DEBE actualizar ambos ficheros en la
misma PR.

**Versión**: 1.2.0 | **Ratificada**: 2026-09-14 | **Última enmienda**: 2026-09-21
