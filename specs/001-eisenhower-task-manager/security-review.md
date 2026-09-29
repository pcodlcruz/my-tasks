# Informe de Auditoría de Seguridad — MyTasks (feature 001-eisenhower-task-manager)

**Fecha**: 2026-09-29 | **Rama auditada**: `feature/001-eisenhower-task-manager-fase-9` (sobre `develop` con las Fases 1–8 fusionadas) | **Tarea**: T108

**Tipología detectada**: aplicación web (SPA React) + API REST (FastAPI) + cloud-native/GCP (Firestore, Firebase Auth). La feature solo se ejecuta en local contra emuladores; no hay infraestructura desplegada.

**Marcos aplicados**: OWASP Top 10, OWASP API Security Top 10 y, donde procede, CIS Google Cloud Foundation Benchmark (ver "Categorías sin información suficiente").

**Nivel de riesgo global**: **Medio**. No hay hallazgos críticos. Hay **un hallazgo alto (HIGH-001) que bloquea cualquier despliegue** hasta que se corrija, porque permite suplantar a cualquier usuario si el backend arranca con la variable del emulador de Auth.

---

## Resumen ejecutivo

Se auditaron la verificación del ID token, el aislamiento por `uid`, las reglas de Firestore, la validación de entradas, el CORS, la gestión de secretos, los *scopes* de Google, las dependencias y el manejo de errores, con lectura del código y con pruebas empíricas contra los emuladores.

**Lo que está bien (verificado, sin hallazgo)**

- Todos los endpoints `/api/v1/*` exigen un ID token; solo `/healthz` es anónimo y no expone datos.
- Aislamiento por construcción: toda consulta pasa por `users/{uid}/tasks` con el `uid` del token verificado; el `uid` nunca viene del cliente. Las tareas ajenas y las inexistentes responden un `404` idéntico (`test_isolation.py`). Los cursores de paginación solo posicionan dentro de la colección del propio usuario.
- Asignación masiva imposible: `extra="forbid"` en `TaskCreate` y `TaskUpdate`; longitudes y recorte de espacios validados en el servidor.
- `firestore.rules` deniega todo acceso desde clientes (`allow read, write: if false`).
- Sin secretos en el repositorio: solo `.env.example` con valores ficticios; `.env` en `.gitignore`; búsqueda de claves, tokens y claves privadas sin resultados.
- Dependencias fijadas por `uv.lock` y `package-lock.json`; `uv audit` y `npm audit --omit=dev` sin vulnerabilidades conocidas.
- El frontend usa `GoogleAuthProvider` sin `addScope`: solo se piden los *scopes* básicos (perfil y correo). No hay `dangerouslySetInnerHTML`, `innerHTML`, `eval` ni uso de `localStorage`/`sessionStorage` propio.
- El CORS rechaza orígenes no autorizados (prueba: preflight desde `https://evil.example` → 400 sin `Access-Control-Allow-Origin`).
- Las escrituras y transiciones usan transacciones de Firestore que releen el estado (sin condiciones de carrera entre pestañas).

**Acción inmediata recomendada**: corregir HIGH-001 antes de cualquier despliegue; el resto es corregible en esta misma fase o pasa a la feature de infraestructura (ver enrutamiento).

---

## Hallazgos

### [HIGH-001] El backend acepta tokens sin firmar si existe `FIREBASE_AUTH_EMULATOR_HOST` y nada lo impide fuera de local

| Campo | Valor |
|---|---|
| **Severidad** | Alta |
| **Categoría** | OWASP A07: Identification and Authentication Failures · API2: Broken Authentication · A05: Security Misconfiguration |
| **Componente afectado** | `backend/src/mytasks_api/auth.py`, `backend/src/mytasks_api/config.py` |

**Descripción**
`firebase_admin` cambia de modo al ver la variable de entorno `FIREBASE_AUTH_EMULATOR_HOST`: en ese modo `verify_id_token` acepta tokens con `alg: none`, sin firma. Si esa variable llegara a un entorno real (staging o producción) por un `.env` copiado, una plantilla de despliegue mal configurada o una variable heredada, cualquier persona podría fabricar un token con el `uid` de otra y leer, modificar o borrar sus tareas. El código no tiene ninguna defensa: ni comprueba el entorno de ejecución ni rechaza el arranque. Además `google_cloud_project` tiene por defecto `demo-mytasks`, un valor pensado para local que, si se omite en un despliegue real, falla cerrado pero de forma confusa.

**Evidencia**
Prueba ejecutada (2026-09-29) contra la app con la variable definida: un token fabricado a mano (`alg: none`, `sub: victim-uid-audit`) sobre `GET /api/v1/tasks?view=board` devolvió `200` con la tarea privada sembrada para ese `uid`. `config.py` define `google_cloud_project: str = "demo-mytasks"` como valor por defecto y `backend/.env.example` incluye `FIREBASE_AUTH_EMULATOR_HOST` y `FIRESTORE_EMULATOR_HOST`.

**Remediación requerida**
El backend debe negarse a arrancar (fallo explícito al iniciar) si detecta cualquiera de las dos variables de emulador sin haber declarado explícitamente que corre en modo local. El modo local debe ser una decisión explícita y única (una variable de entorno de entorno de ejecución), no un efecto colateral de variables sueltas. El project id no debe tener valor por defecto fuera del modo local. Añadir tests que comprueben ese rechazo al arrancar.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: De implementación y de configuración

---

### [MED-001] No hay logging de seguridad ni de auditoría en el backend

| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP A09: Security Logging and Monitoring Failures · API10 (visibilidad) |
| **Componente afectado** | `backend/src/mytasks_api/` (todo el backend) |

**Descripción**
No existe ningún registro de eventos. Un fallo de autenticación (token inválido, caducado o manipulado), un borrado definitivo o un intento de acceder a una tarea ajena no dejan rastro. Sin eso no se pueden detectar ni investigar abusos, y el `except Exception` de `get_current_user` convierte cualquier error (incluido un fallo de red al obtener los certificados de Google) en un `401` mudo, indistinguible de un ataque.

**Evidencia**
Búsqueda de `logging`, `logger` y `print(` en `backend/src`: sin resultados. `auth.py` líneas 38-41: `except Exception as exc: raise unauthenticated from exc`.

**Remediación requerida**
Registrar, en formato estructurado (JSON) y sin datos sensibles (nunca el token ni el contenido de las tareas): fallos de autenticación con su causa, y las acciones destructivas o de cambio de estado (borrado definitivo, papelera, restauración) con el `uid` y el `taskId`. Distinguir el fallo del verificador de tokens por causas de infraestructura (respuesta 5xx y aviso) del token no válido (401). Incluir un identificador de petición.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: De implementación

---

### [MED-002] Sin límites de consumo de recursos por usuario

| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption |
| **Componente afectado** | `POST /api/v1/tasks`, `GET /api/v1/tasks?view=board` |

**Descripción**
Un usuario autenticado puede crear tareas sin límite, y el tablero devuelve todas las activas sin paginar. El plan asume "≤ ~500 tareas activas por usuario", pero nada lo hace cumplir. Con miles de tareas, cada carga del tablero lee y serializa miles de documentos (coste de Firestore y latencia), y un usuario malintencionado puede generar coste y degradar el servicio. Tampoco hay limitación de tasa de peticiones.

**Evidencia**
`routers/tasks.py` no impone ningún tope al crear; `repositories/task_repository.py::list_board` lee todas las activas. Medición (`test_performance.py`): el tablero con 500 tareas tarda ≈ 175 ms (p95 185 ms) y crece de forma lineal (≈ 0,33 ms por documento en el emulador).

**Remediación requerida**
Dos capas: (1) en la aplicación, un tope por usuario de tareas activas coherente con el supuesto de diseño, con un `409` o `422` claro al superarlo y su mensaje en español; el valor del tope y su comportamiento son decisión de producto; (2) limitación de tasa y cuotas en el perímetro cuando se defina el despliegue.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (tope por usuario); `mytasks-google-cloud-architect` (limitación de tasa en el perímetro)
- Tipo de cambio: De implementación y arquitectónico

---

### [LOW-001] Un identificador de tarea reservado provoca `500`

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API8: Security Misconfiguration (validación de entrada) |
| **Componente afectado** | `backend/src/mytasks_api/routers/tasks.py` (parámetro `task_id`), repositorio |

**Descripción**
Firestore rechaza los identificadores de documento con forma `__algo__`. La API solo valida la longitud (1–128), así que esa petición llega a Firestore y su excepción sube sin capturar. El contrato promete `404` para una tarea inexistente.

**Evidencia**
`GET /api/v1/tasks/__x__` con un token válido devolvió `500 Internal Server Error`. El identificador `.` devolvió `422` y `..` un `404` distinto del de la API.

**Remediación requerida**
Validar el formato del identificador en el borde (solo los caracteres y formas que genera Firestore) y tratar un identificador no válido como tarea inexistente (`404` con el `ErrorOut` habitual), de forma uniforme en todas las rutas con `taskId` y en todos los métodos.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: De implementación

---

### [LOW-002] La documentación interactiva y el esquema OpenAPI son públicos

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API9: Improper Inventory Management · A05: Security Misconfiguration |
| **Componente afectado** | `backend/src/mytasks_api/main.py` |

**Descripción**
FastAPI publica `/docs`, `/redoc` y `/openapi.json` sin autenticación. El contrato ya es público en el repositorio, pero exponer un catálogo navegable de la API en producción amplía la superficie sin beneficio.

**Evidencia**
`GET /docs` y `GET /openapi.json` sin token → `200`.

**Remediación requerida**
Deshabilitar esos endpoints fuera del modo local.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: De configuración

---

### [LOW-003] CORS con métodos y cabeceras comodín; la API no envía cabeceras de seguridad

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A05: Security Misconfiguration |
| **Componente afectado** | `backend/src/mytasks_api/main.py` |

**Descripción**
El CORS restringe bien los orígenes, pero permite cualquier método y cualquier cabecera. La API solo usa `GET`, `POST`, `PATCH` y `DELETE`, y las cabeceras `Authorization` y `Content-Type`. Las respuestas tampoco incluyen `X-Content-Type-Options` ni otras cabeceras defensivas.

**Evidencia**
`main.py`: `allow_methods=["*"]`, `allow_headers=["*"]`. Cabeceras de `/healthz`: solo `content-length`, `content-type` y `vary`.

**Remediación requerida**
Limitar métodos y cabeceras permitidos a los que la aplicación usa, y añadir cabeceras de seguridad básicas a todas las respuestas de la API.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: De configuración

---

### [LOW-004] No se comprueba la revocación del ID token

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A07 (gestión de sesiones) |
| **Componente afectado** | `backend/src/mytasks_api/auth.py` |

**Descripción**
`verify_id_token` se llama sin comprobar la revocación. Un token robado, o de una cuenta deshabilitada o con sesiones revocadas, sigue siendo válido hasta que caduca (≈ 1 hora). Comprobar la revocación en cada petición cuesta una llamada extra a Firebase por petición, y el impacto (aplicación personal, tokens de vida corta) es reducido.

**Evidencia**
`auth.py` línea 39: `auth.verify_id_token(credentials.credentials)` sin `check_revoked`.

**Remediación requerida**
Decisión de riesgo documentada: aceptar el riesgo residual (recomendado para el alcance actual) o comprobar la revocación solo en operaciones destructivas.

**Destinatario**
- Skill/agente: `mytasks-backend-developer`
- Tipo de cambio: De implementación (si no se acepta el riesgo)

---

### [LOW-005] La SPA no define política de seguridad de contenido ni cabeceras de seguridad

| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP A05: Security Misconfiguration |
| **Componente afectado** | `frontend/index.html` y el futuro alojamiento de la SPA |

**Descripción**
`index.html` no declara ninguna `Content-Security-Policy` y no hay servidor definido que añada cabeceras (`CSP`, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`). Hoy no hay alojamiento, así que es una recomendación de diseño para la feature de infraestructura, no una vulnerabilidad explotable. El código actual no tiene sumideros de XSS (ver "Lo que está bien").

**Evidencia**
`frontend/index.html`: sin `<meta http-equiv="Content-Security-Policy">`; `firebase.json` no configura `hosting`.

**Remediación requerida**
Definir en la arquitectura de despliegue una política CSP compatible con Firebase Auth (dominios de Google para el inicio de sesión) y las cabeceras de seguridad en el servicio que sirva la SPA.

**Destinatario**
- Skill/agente: `mytasks-google-cloud-architect`
- Tipo de cambio: Arquitectónico

---

## Categorías sin información suficiente

Esta feature no despliega nada, así que estas categorías no se pueden auditar todavía; quedan como requisitos para la feature de infraestructura y CI/CD:

- **Seguridad de red y perímetro** (firewall, WAF, DDoS, segmentación): no hay red ni perímetro definidos. Solo se observa que los emuladores escuchan en `localhost`.
- **Configuración cloud e IAM (CIS GCP)**: no hay proyecto, cuentas de servicio ni bindings. Pendiente: cuenta de servicio del backend con mínimo privilegio sobre Firestore, política TTL de la papelera, Identity Platform, Secret Manager.
- **Cifrado**: en reposo lo da Firestore por defecto; el TLS en tránsito depende del servicio de ejecución elegido. Sin evidencia aún.
- **Gestión de incidentes y recuperación** (RTO/RPO, rotación de secretos, copias de seguridad): no aplica a una feature local.

---

## Resumen de enrutamiento

| ID | Severidad | Destinatario | Skill/Agente |
|---|---|---|---|
| HIGH-001 | Alta | Desarrollador backend | `mytasks-backend-developer` |
| MED-001 | Media | Desarrollador backend | `mytasks-backend-developer` |
| MED-002 | Media | Desarrollador backend y arquitecto | `mytasks-backend-developer` (tope por usuario) · `mytasks-google-cloud-architect` (perímetro) |
| LOW-001 | Baja | Desarrollador backend | `mytasks-backend-developer` |
| LOW-002 | Baja | Desarrollador backend | `mytasks-backend-developer` |
| LOW-003 | Baja | Desarrollador backend | `mytasks-backend-developer` |
| LOW-004 | Baja | Desarrollador backend | `mytasks-backend-developer` (decisión de riesgo) |
| LOW-005 | Baja | Arquitecto | `mytasks-google-cloud-architect` |

---

## Resolución (T109)

Corregido en esta misma fase con el skill `mytasks-backend-developer`, tests primero (se comprobó que los tests nuevos fallan sin el código: 33 fallos). Estado tras la corrección: backend 190 tests en verde, frontend 50 unitarios y 24 e2e en verde.

| ID | Estado | Qué se hizo |
|---|---|---|
| HIGH-001 | ✅ Corregido | Nueva variable `APP_ENV` (`local`, `staging`, `production`) con valor por defecto `production`. `Settings` se niega a validarse (y el backend a arrancar) si hay variables de emulador fuera de `APP_ENV=local`, si falta `GOOGLE_CLOUD_PROJECT` fuera de local, o si el project id empieza por `demo-` fuera de local; en local exige el prefijo `demo-`. Los hosts de emulador que vengan del `.env` ahora se publican en el entorno para los SDK (antes `FIREBASE_AUTH_EMULATOR_HOST` del `.env` no llegaba a `firebase_admin`). Tests: `tests/unit/test_config.py`. |
| MED-001 | ✅ Corregido | Logging JSON estructurado con campos en lista cerrada (`action`, `uid`, `task_id`, `reason`, más `request_id`); nunca token ni contenido de tareas. Se registran los fallos de autenticación (solo la causa, sin el texto de la excepción, que en algunos casos incluye el token), las transiciones de estado y el borrado definitivo, y el acceso a tareas inexistentes o ajenas. Un fallo del verificador de tokens ya no se disfraza de 401: responde `503 auth_unavailable` y registra un error. Cada respuesta lleva `X-Request-ID` generado por el servidor. Tests: `test_audit_logging.py`, `test_logging_config.py`, `test_app_factory.py`. |
| MED-002 | ◐ Parcial (decisión del propietario) | Tope de 500 tareas activas por usuario, con `409 task_limit_reached` y mensaje en español. Se aplica al crear, al reabrir y al restaurar una tarea activa; completadas y en papelera no cuentan. Es un tope «blando» (el recuento y la escritura no son atómicos), suficiente para acotar el abuso. El frontend muestra el mensaje del servidor y no cierra el formulario. **Pendiente para la feature de infraestructura**: limitación de tasa y cuotas en el perímetro (`mytasks-google-cloud-architect`). Tests: `test_task_limit.py` y unitarios de servicio. |
| LOW-001 | ✅ Corregido | El identificador de tarea se valida en el borde (solo `[A-Za-z0-9_-]`, sin la forma reservada `__algo__`); uno no válido responde el `404 not_found` habitual, en las 7 rutas con `taskId`. La comprobación depende de la autenticación, así que un 401 nunca queda tapado. Tests: `test_task_id_validation.py`. |
| LOW-002 | ✅ Corregido | `/docs`, `/redoc` y `/openapi.json` solo existen con `APP_ENV=local`. Tests: `test_app_factory.py`. |
| LOW-003 | ✅ Corregido | CORS limitado a `GET`, `POST`, `PATCH`, `DELETE` y a las cabeceras `Authorization` y `Content-Type`. Todas las respuestas llevan `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` y `Cache-Control: no-store`. Tests: `test_app_factory.py`. |
| LOW-004 | ✅ Riesgo aceptado (decisión del propietario) | Se mantiene `verify_id_token` sin comprobar la revocación. Queda documentado en el código (`auth.py`). Riesgo residual: un token robado o de una cuenta deshabilitada vale hasta ~1 h. |
| LOW-005 | ⏭ Pendiente (otra feature) | Sin alojamiento definido no hay dónde aplicar CSP ni cabeceras de la SPA. Queda como requisito para la feature de infraestructura y CI/CD (`mytasks-google-cloud-architect`). |

**Efecto en local**: el backend necesita `APP_ENV=local` (ya incluido en `backend/.env.example` y en la configuración de Playwright). Sin esa variable arranca como `production` y falla con un mensaje claro.

**Otros cambios de esta fase que salieron de la revisión**: el color del texto de la insignia «Personal» pasó a `#0F766E` (contraste 5,2:1; el anterior daba 3,59:1, detectado con axe), y el foco vuelve al botón que abrió un modal al cerrarlo.

**Nivel de riesgo tras la corrección**: **Bajo**, a falta de la revisión de perímetro, IAM y cabeceras de la SPA cuando exista infraestructura (categorías «sin información suficiente»).
