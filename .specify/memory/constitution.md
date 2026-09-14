<!--
Informe de Impacto de Sincronización (Sync Impact Report)
Cambio de versión: 1.0.0 → 1.1.0
Justificación: cambio material en "Restricciones Técnicas" (MINOR): la persistencia pasa de
  PostgreSQL (supuesto no confirmado en 1.0.0) a Firestore por decisión del propietario, por
  coste. Se ajustan el stack backend (sin SQLAlchemy/Alembic) y el entorno local (emulador de
  Firestore, Principio IV). Ningún principio se redefine.
Historial: 1.0.0 (2026-09-14) fue la ratificación definitiva tras la revisión estructural; las
  versiones 1.0.0–2.0.0 previas a esa ratificación fueron borradores del mismo día.
Principios modificados en 1.0.0 (respecto al borrador 2.0.0):
  - "II. Buenas Prácticas de Ingeniería de Software" → "I. Simplicidad y Complejidad
    Justificada" (reglas concretas y verificables en lugar de "mejores prácticas").
  - "I. Calidad Mediante Tests" → "II. Tests por Niveles" (define qué tests debe tener una
    feature, no solo que deben pasar).
  - "III. Paridad de Entornos" → "IV. Paridad de Entornos" (mapea ramas GitFlow a entornos).
  - "IV. Identidad de Agente…" → "V." (sin cambio de fondo; bullets redundantes retirados de
    la sección de infraestructura).
  - "V. Despliegue Automatizado…" → "VI." (sin cambio de fondo).
  - "VI. Desarrollo Dirigido por Agentes y Skills" → "VIII." (recortado).
  - "VII. Idioma y Convenciones" → "IX." (añade identificadores de código; recortado).
Principios añadidos:
  - III. Seguridad de Aplicación.
  - VII. Revisión Humana Obligatoria (PR obligatoria; los agentes no aprueban ni fusionan
    sus propias PRs).
Secciones añadidas:
  - Convenciones Normativas (glosario DEBE / DEBERÍA / PROHIBIDO).
  - Restricciones Técnicas (stack fijado: React + TypeScript / FastAPI / Firestore).
  - Mecanismos de Cumplimiento (tabla regla → mecanismo → estado).
Secciones eliminadas: ninguna. Redundancia eliminada: cada regla vive en un único sitio;
  "Definition of Done" y las secciones operativas referencian por número de principio.
Idioma: todo el documento pasa a español (encabezados e informe incluidos), conforme al
  Principio IX.
Pendientes / TODOs:
  - TODO(SERVICE_ACCOUNT_ID): identificador de la cuenta de servicio del agente para Google
    Cloud, pendiente de que lo facilite el propietario del proyecto.
  - Los mecanismos de cumplimiento figuran como "pendiente" hasta que existan el repositorio
    remoto y la configuración del harness (ver tabla).
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
commits directos a `main`, `develop`, `release/*` y `hotfix/*`. Cada PR DEBE contar con la
aprobación del propietario del proyecto (humano) y con los checks de CI en verde antes de
fusionarse. Un agente NUNCA aprueba ni fusiona una PR que él mismo haya abierto o modificado.

**Rationale**: en un proyecto donde los agentes producen la mayor parte del código, la
aprobación humana es el control real de calidad y de intención.

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
- **Identidad en la nube**: cuenta de servicio dedicada al agente.
  TODO(SERVICE_ACCOUNT_ID): identificador pendiente de que lo facilite el propietario; hasta
  entonces está PROHIBIDA cualquier operación real sobre Google Cloud.

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
| PR obligatoria, sin commits directos, aprobación humana, CI en verde (VII) | Branch protection en GitHub para `main`, `develop`, `release/*`, `hotfix/*`: PR requerida, 1 aprobación del propietario, required status checks, sin auto-aprobación | pendiente |
| Prohibición de `gcloud`/`gsutil`/`bq` directos (V) | Regla `deny` en `.claude/settings.json` para `Bash(gcloud:*)`, `Bash(gsutil:*)`, `Bash(bq:*)` | pendiente |
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
- [ ] PR aprobada por el propietario; el agente no ha aprobado ni fusionado su propia PR (VII).
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

**Versión**: 1.1.0 | **Ratificada**: 2026-09-14 | **Última enmienda**: 2026-09-14
