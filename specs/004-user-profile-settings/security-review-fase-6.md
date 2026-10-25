# Informe de Auditoría de Seguridad — Feature 004, Fase 6 (subir mi propia imagen de avatar)

**Fecha**: 2026-10-24 · **Rama**: `feature/004-user-profile-settings-fase-6`

**Tipología detectada**: API REST (FastAPI) con **entrada de archivos**, Cloud-native/GCP
(Firestore) y aplicación web (React) que muestra el resultado. Sin cambios de infraestructura,
IAM ni variables; sí un cambio de código en la CSP del contenedor web y **una dependencia nueva**
(`pillow`).

**Marcos aplicados**: OWASP API Security Top 10 (API4 consumo de recursos, API3 propiedades,
API1 autorización a nivel de objeto), OWASP ASVS V12 (subida de archivos) y V14, OWASP Top 10
(A04, A05, A06 componentes), CIS GCP Benchmark (sin cambios aplicables).

**Nivel de riesgo global**: Bajo tras las correcciones (dos hallazgos medios, **corregidos en esta
misma PR**; dos bajos al backlog).

---

## Resumen ejecutivo

Se auditó el código nuevo: `PUT/GET/DELETE /api/v1/me/avatar`, el procesado de imagen con Pillow
(`domain/avatar_image.py`), el límite de subidas, el almacenamiento en `users/{uid}/settings/avatar`,
las cabeceras de la respuesta, el recortador y la descarga con `blob:` URL en el frontend, el
cambio de `img-src` de la CSP y la dependencia nueva.

No hay hallazgos críticos ni altos. **La revisión encontró dos medios, ambos corregidos antes de
cerrar el informe** (MED-001 caché compartida entre cuentas, MED-002 memoria al decodificar), y dos
bajos para el backlog. **No bloquea la fusión.**

| Control | Resultado | Evidencia |
|---|---|---|
| Autenticación y cuenta activa | ✅ | Los tres métodos usan `Depends(get_active_user)`; 401 sin token y 403 sin cuenta o revocada (`test_avatar.py::TestAccess`) |
| Cuerpo leído tras autenticar | ✅ | `upload_avatar` resuelve la dependencia antes de leer `request.stream()`: una persona sin permiso no consume lectura |
| Aislamiento por `uid` (API1) | ✅ | El `uid` sale solo del token; no hay ruta, consulta ni cabecera que acepte otro (`test_profile_isolation.py`: ruta, `?uid=`, `X-User-Id`, PUT/DELETE con `uid` en la ruta → 404/405); cada cuenta obtiene solo su imagen |
| Tipo identificado por contenido | ✅ | `Image.open(..., formats=["JPEG","PNG","WEBP"])`: el `Content-Type` y la extensión se ignoran; texto, HTML, SVG, PDF, GIF, TIFF, BMP e ICO se rechazan con 415 (`test_avatar_image.py`, `test_avatar.py`) |
| Tamaño de entrada | ✅ | 2 MB: por `Content-Length` declarado y cortando la lectura al pasar el límite aunque no haya `Content-Length` (413; el test comprueba que se deja de leer) |
| Bomba de descompresión | ✅ | Se comprueba el tamaño de la cabecera **antes** de decodificar; el test fabrica un PNG de 40 000×40 000 de <200 bytes y comprueba que `load()` nunca se llama y que se responde en <2 s |
| Metadatos (EXIF, ICC, XMP) | ✅ | La salida se reconstruye con `Image.frombytes` (solo píxeles) y se guarda con `exif=b""`; los tests comprueban que ni el modelo de cámara, ni el comentario, ni el perfil ICC, ni los *chunks* `EXIF`/`ICCP`/`XMP ` aparecen; la orientación se aplica antes de descartarlos |
| *Polyglots* y cargas incrustadas | ✅ | Lo guardado es una imagen nueva codificada por el servidor; la original no se almacena nunca (R3) |
| Salida acotada | ✅ | WebP de 256×256 con tope de 200 KB (con reintentos de calidad); un documento de Firestore admite 1 MiB |
| Límite de subidas (FR-025) | ✅ | 10 por hora y persona, contado dentro de la misma transacción que la escritura; la 11.ª da 429 con `Retry-After`; quitar el avatar no cuenta ni reinicia; un restablecimiento del perfil no borra el contador |
| Atomicidad e integridad | ✅ | Perfil, contador e imagen cambian en una transacción (`set` sin `merge` del documento `avatar`: una sola imagen); una subida rechazada no escribe nada; reintentos ante `Aborted` y envoltorio transaccional por llamada |
| Registro sin datos sensibles | ✅ | `avatar_uploaded` lleva `uid` y el **tamaño final**; `avatar_removed` solo `uid`; `size` entra en la lista cerrada de campos; los tests comprueban que no aparecen contenido, nombre de archivo, correo ni token |
| Cabeceras de la imagen | ✅ | `Content-Type: image/webp` fijo, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=31536000, immutable` y ahora `Vary: Authorization` (MED-001); el resto de respuestas conservan `no-store` |
| CSP | ✅ | Solo cambia `img-src` (`'self' data: blob:`); `script-src`, `style-src`, `connect-src`, `frame-src` y las demás directivas quedan idénticas, lo comprueba el test de la entrada nginx con la política completa |
| `blob:` URL en el navegador | ✅ | Se revocan al salir de la caché (versión nueva, nadie la muestra, o cierre de sesión / cambio de persona con `queryClient.clear()`); `SessionCacheReset` instala el revocador y está probado |
| Validación en el cliente | ✅ | Tipo y tamaño se comprueban antes de enviar y el recortador exporta un PNG de ≤512 px; **solo es comodidad**: el servidor lo valida todo otra vez |
| Mensajes de error | ✅ | Escritos en el cliente por código (`avatar_too_large`, `avatar_unsupported`, `avatar_rate_limited`); nunca se muestra el texto del servidor |
| Dependencia nueva (A06) | ✅ | `pillow>=13.0.0`, resuelta a la 13.0.0 y fijada con *hashes* en `uv.lock`; única dependencia nueva de la feature (justificada en el plan) |

---

## Hallazgos

### [MED-001] Una imagen en caché podía servirse a otra persona en un navegador compartido — CORREGIDO
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP API1/A01 (exposición de datos entre cuentas) y API8 (caché) |
| **Componente afectado** | `GET /api/v1/me/avatar` (`routers/profile.py`) |

**Descripción**
La respuesta llevaba `Cache-Control: private, max-age=31536000, immutable` y la URL con la que se
pide es `/api/v1/me/avatar?v=<versión>`. La versión empieza en 1 para **todas** las personas, así que
la misma URL identifica imágenes de cuentas distintas. La caché HTTP de un navegador compartido
(un ordenador de uso común) podía servir sin consultar al servidor, durante un año, la imagen de
la persona A a la persona B cuando B pidiera su `?v=1`. Es una fuga de una imagen personal entre
cuentas, aunque la API en sí aísle bien por `uid`.

**Evidencia**
La respuesta no variaba por credenciales y `apiFetchBlob` pide siempre la misma URL por versión.

**Remediación aplicada**
La respuesta incluye ahora `Vary: Authorization`: el navegador solo reutiliza una imagen cacheada
para una petición con las mismas credenciales (distintas personas llevan distintos tokens). Se
añadió `test_the_cached_image_is_only_reused_for_the_same_credentials`.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (ya aplicado)
- Tipo de cambio: De implementación

---

### [MED-002] Decodificar imágenes grandes podía agotar la memoria de la instancia — CORREGIDO
| Campo | Valor |
|---|---|
| **Severidad** | Media |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption |
| **Componente afectado** | `domain/avatar_image.py`, `services/profile_service.py` |

**Descripción**
El tope de píxeles inicial era de 25 megapíxeles. Un PNG o WebP puede declarar esa resolución con
menos de 2 MB y obliga a decodificarlo entero (decenas de MB) y a hacer varias copias (orientación,
conversión de modo): del orden de cientos de MB por petición en el peor caso (estimación, no medida). Varias subidas simultáneas de
cuentas invitadas podían agotar una instancia pequeña de Cloud Run (denegación de servicio). Las
subidas rechazadas no cuentan para el límite de 10 por hora, así que ese límite no lo frenaba.

**Evidencia**
`MAX_PIXELS = 25_000_000` y ningún límite de concurrencia en el procesado.

**Remediación aplicada**
El tope baja a **12 megapíxeles** (una foto completa de móvil; el cliente envía como mucho
512×512, así que ninguna persona lo nota) y el procesado se limita a **2 imágenes a la vez** por
instancia con un semáforo: una ráfaga hace cola en vez de consumir memoria. Tests:
`test_pictures_are_processed_at_most_two_at_a_time` y
`test_a_rejected_picture_frees_its_processing_slot`.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (ya aplicado)
- Tipo de cambio: De implementación

---

### [LOW-001] Los archivos rechazados no cuentan para el límite de subidas
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption |
| **Componente afectado** | `services/profile_service.py` |

**Descripción**
Solo las subidas correctas consumen el límite de 10 por hora. Una cuenta activa puede enviar
muchos archivos inválidos; casi todos se descartan por la cabecera sin decodificar (tamaño,
formato, píxeles) y el procesado simultáneo está acotado (MED-002), pero un archivo truncado o
corrupto sí cuesta un decodificado parcial. El impacto está acotado por: solo cuentas invitadas,
tope de 2 MB por petición y 2 procesados a la vez.

**Evidencia**
`test_rejected_files_do_not_count_as_uploads` fija este comportamiento a propósito (FR-025 habla
de subidas, y un fallo no debe agotar el cupo de quien se equivoca de archivo).

**Remediación requerida**
Aceptar el riesgo o, si se quiere cubrir, contar los intentos fallidos en una ventana aparte más
amplia. No se corrige en esta fase.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (si el propietario decide abordarlo)
- Tipo de cambio: De implementación

---

### [LOW-002] Sin límite global de peticiones al endpoint de lectura
| Campo | Valor |
|---|---|
| **Severidad** | Baja |
| **Categoría** | OWASP API4: Unrestricted Resource Consumption |
| **Componente afectado** | `GET /api/v1/me/avatar` |

**Descripción**
Cada lectura es una lectura de un documento de hasta 200 KB. La imagen es inmutable y el cliente
la guarda en memoria durante la sesión, pero nada impide a una cuenta activa pedirla en bucle. Es
la misma situación que el resto de la API de lectura (sin limitador global); el coste y el impacto
son pequeños.

**Evidencia**
No hay limitador en `factory.py` ni en el router; el plan (R6) reserva el límite de frecuencia al
único endpoint que escribe bytes.

**Remediación requerida**
Si se decide acotar, hacerlo para toda la API y no solo para el avatar.

**Destinatario**
- Skill/agente: `mytasks-backend-developer` (si el propietario decide abordarlo)
- Tipo de cambio: De implementación

---

## Categorías sin hallazgos o fuera de alcance

- **Autenticación y autorización del resto de la API, red, IAM, secretos**: sin cambios en esta
  fase; no hay recursos de Google Cloud nuevos (la imagen vive en Firestore, sin *bucket* ni
  URLs firmadas).
- **Nota de verificación**: la imagen del backend con la dependencia nueva **no se pudo construir
  en local** (el *daemon* de Docker no estaba en marcha); la comprobación recae en el job
  `images-build` del CI. Pillow publica *wheels* para Linux, así que el riesgo es bajo.
- **Nota operativa (no de seguridad)**: se corrigió una carrera de la feature 003 que dejaba
  desfasada la lista de accesos si se invitaba antes de terminar su primera carga (la respuesta en
  vuelo absorbía el refresco); lleva su test.

## Resumen de enrutamiento

| ID | Severidad | Estado | Destinatario | Skill/Agente |
|---|---|---|---|---|
| MED-001 | Media | **Corregido en esta PR** | Desarrollador backend | `mytasks-backend-developer` |
| MED-002 | Media | **Corregido en esta PR** | Desarrollador backend | `mytasks-backend-developer` |
| LOW-001 | Baja | Backlog (decisión del propietario) | Desarrollador backend | `mytasks-backend-developer` |
| LOW-002 | Baja | Backlog (decisión del propietario) | Desarrollador backend | `mytasks-backend-developer` |
