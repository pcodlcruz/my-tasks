# Investigación: Perfil de usuario y preferencias

**Feature**: `004-user-profile-settings` | **Fecha**: 2026-10-23 | **Plan**: [plan.md](plan.md)

Cada decisión indica qué se eligió, por qué y qué alternativas se descartaron. No quedan
`NEEDS CLARIFICATION`.

## R1. Dónde se guardan las preferencias

- **Decisión**: un documento por persona, `users/{uid}/settings/profile`, en Firestore. Lo lee y
  lo escribe solo el backend (el cliente nunca accede a Firestore directamente).
- **Razón**: el padre `users/{uid}` ya existe (feature 003: cuenta con rol y estado) y las tareas
  cuelgan de él. Un documento aparte evita mezclar las preferencias con el documento de cuenta,
  cuyas escrituras son transaccionales y de seguridad (rol, estado). Cambiar un tema nunca debe
  poder competir con una revocación.
- **Alternativas**: campos nuevos en `users/{uid}` (descartado: acopla preferencias y autorización,
  y obliga a revisar las transacciones de la 003); `localStorage` solo (descartado: no cruza
  dispositivos, FR-002); claims en Identity Platform (descartado: no son datos de usuario).

## R2. Dónde se guarda la imagen de avatar subida

- **Decisión**: en Firestore, en `users/{uid}/settings/avatar`, como bytes ya reprocesados
  (WebP cuadrado de 256×256, unos 5–30 KB; tope defensivo de 200 KB). **Sin almacenamiento nuevo
  ni cambios en `infra/`.**
- **Razón**: Principio I. Un avatar reducido cabe de sobra en un documento (límite de 1 MiB),
  hereda sin esfuerzo el aislamiento por `uid`, se borra con el documento, se prueba con el
  emulador de Firestore y no exige un *bucket*, ni IAM nuevo para `mytasks-api-run-<env>`, ni
  URLs firmadas, ni confirmación de infraestructura (Principio V). La spec suponía que haría falta
  almacenamiento; el diseño lo evita.
- **Alternativas**: Cloud Storage con URL firmada (descartado: *bucket* por entorno, rol IAM,
  permiso para firmar, ciclo de vida y limpieza de objetos huérfanos, y un cambio de
  infraestructura por una imagen de decenas de KB); servir públicamente desde un *bucket*
  (descartado: viola FR-021); guardar la imagen original (descartado: más tamaño, metadatos EXIF
  con ubicación, más superficie de ataque).

## R3. Validación y reprocesado de la imagen

- **Decisión**: el backend nunca guarda lo que recibe. Con **Pillow** decodifica la imagen, y
  solo acepta JPEG, PNG y WebP identificados **por su contenido** (no por la extensión ni por el
  `Content-Type`). Aplica la orientación EXIF, descarta todos los metadatos, recorta al cuadrado
  centrado, reduce a 256×256 y reescribe como WebP. Rechaza más de 2 MB de entrada y más de un
  tope de píxeles antes de decodificar (protección frente a bombas de descompresión).
- **Razón**: FR-018 a FR-020 y la privacidad (el EXIF de una foto suele llevar coordenadas). El
  reprocesado también neutraliza archivos *polyglot* y cargas incrustadas.
- **Dependencia nueva**: `pillow`, fijada por versión en el lockfile (Principio III). Es la única
  dependencia nueva de la feature; justificada en el *Complexity Tracking* del plan.
- **Alternativas**: confiar en el recorte del navegador (descartado: el servidor no puede fiarse
  del cliente, FR-023); validar solo la cabecera mágica (descartado: no detecta archivos
  corruptos ni bombas); `imghdr`/`filetype` (descartado: no decodifican ni reprocesan).

## R4. Cómo recibe el backend la imagen

- **Decisión**: `PUT /api/v1/me/avatar` con el **cuerpo binario** de la imagen
  (`Content-Type: image/jpeg|png|webp`), sin *multipart*. Se lee con un tope duro de 2 MB: se
  rechaza por `Content-Length` y se corta la lectura si se supera.
- **Razón**: *multipart* exige `python-multipart` (otra dependencia). El cuerpo binario basta y
  el frontend ya genera un `Blob`.
- **Alternativas**: `multipart/form-data` (descartado: dependencia extra sin beneficio); imagen
  en JSON como base64 (descartado: +33 % de tamaño y validación de JSON más pesada).

## R5. Cómo ve el navegador el avatar (aislamiento, FR-021)

- **Decisión**: `GET /api/v1/me/avatar` devuelve los bytes con `Content-Type: image/webp`,
  `X-Content-Type-Options: nosniff` y `Cache-Control: private, max-age=31536000, immutable`; la
  petición va autenticada. El frontend la descarga con `fetch` y el token, y muestra un
  `blob:` URL. La URL incluye `?v=<versión>` para invalidar la caché al cambiar la imagen.
  No existe ninguna ruta que sirva el avatar de otra persona: el `uid` sale siempre del token.
- **Razón**: una etiqueta `<img src>` no puede enviar la cabecera `Authorization`; el `blob:`
  resuelve eso sin URLs firmadas ni cookies. El *service* nunca recibe un `uid` del cliente.
- **Efecto en la CSP**: `img-src` pasa de `'self' data:` a `'self' data: blob:` en
  `frontend/nginx/docker-entrypoint.d/40-runtime-config.sh` (y su test). Es un cambio de código,
  no de infraestructura; la revisión de seguridad lo valora.
- **Alternativas**: URL firmada de corta duración (descartado, ver R2); cookie de sesión
  (descartado: no existe en el diseño y abriría CSRF); incrustar el avatar en base64 dentro de
  `GET /me/profile` (descartado: engorda cada carga del perfil con una imagen que casi nunca
  cambia).

## R6. Límite de subidas (FR-025)

- **Decisión**: ventana fija de **10 subidas por hora y persona**, contada en el documento de
  perfil dentro de una transacción. Al superarla, 429 con código `avatar_rate_limited` y el
  tiempo restante. Quitar el avatar no cuenta.
- **Razón**: el proyecto no tiene *rate limiting* genérico y no se justifica uno (Principio I);
  basta con acotar el único endpoint que escribe bytes. Reutiliza el patrón transaccional de la 003.
- **Alternativas**: límite en memoria por instancia (descartado: Cloud Run escala y reinicia);
  Cloud Armor o API Gateway (descartado: infraestructura nueva); sin límite (descartado: FR-025).

## R7. Modo oscuro y densidad: cómo se aplican los tokens

- **Decisión**: los colores de `tailwind.config.ts` pasan de valores hexadecimales a **variables
  CSS** (`rgb(var(--color-… ) / <alpha-value>)`), definidas en `src/index.css` para `:root`
  (claro) y `:root[data-theme='dark']` (oscuro). El tema efectivo (`light`/`dark`) lo fija el
  atributo `data-theme` de `<html>`; la densidad, `data-density` (`comfortable`/`compact`), que
  cambia unas pocas variables de espaciado de las tarjetas. `color-scheme` sigue al tema para
  controles nativos.
- **Razón**: las clases actuales (`bg-surface`, `text-text-muted`, `border-border`,
  `text-quadrant-…`) siguen funcionando sin tocar cada componente; solo cambia su valor. Una
  clase `dark:` por elemento exigiría reescribir todos los componentes y duplicaría los estilos.
- **Alternativas**: variantes `dark:` de Tailwind en cada componente (descartado: tocar decenas de
  ficheros y propenso a olvidos); una hoja de estilos alternativa (descartado: duplica CSS).

## R8. Aplicar el tema antes del primer fotograma (FR-007, SC-002)

- **Decisión**: un script externo y mínimo, `frontend/public/theme-init.js`, cargado
  **síncrono en el `<head>`**, lee `localStorage['mytasks.appearance']` (`{theme, density}`),
  resuelve «sistema» con `matchMedia` y fija `data-theme`/`data-density` antes de pintar. La
  aplicación escribe esa caché cada vez que carga o cambia el perfil. Todo con `try/catch`: sin
  `localStorage` (modo privado), cae en «sistema» y densidad cómoda.
- **Razón**: la CSP actual (`script-src 'self'`, sin `'unsafe-inline'`) impide un script en línea;
  uno externo del mismo origen es compatible y no obliga a relajarla.
- **Límites aceptados**: la caché es del navegador, no de la persona. En un ordenador compartido,
  quien abre la pantalla de inicio de sesión ve el último tema usado (solo dos cadenas, sin datos
  personales). Al cargar el perfil real, el servidor manda y la caché se corrige. La primera visita
  en un dispositivo nuevo se pinta con el tema del sistema hasta que llega el perfil; es el
  comportamiento esperado, no un destello.
- **Alternativas**: script en línea con *hash* o *nonce* en la CSP (descartado: nginx sirve HTML
  estático, sin *nonce* por petición, y cada cambio del script cambiaría el *hash*); esperar al
  perfil antes de pintar (descartado: bloquea la primera pantalla y no sirve en el login).

## R9. Tablero por defecto, orden y periodo del historial

- **Ámbito por defecto**: el perfil se carga una vez por sesión y, al llegar, fija el filtro del
  tablero (`uiStore.scopeFilter`) **una sola vez**. Las recargas posteriores del perfil no lo
  tocan, y cambiar el filtro a mano nunca escribe en el perfil (FR-011). El tablero espera a que
  el perfil se resuelva (éxito o error) antes de pedir tareas, para no mostrar un tablero con el
  ámbito equivocado ni hacer una petición de más.
- **Orden**: `GET /api/v1/tasks?view=board` admite `order=oldest|newest` (por defecto `oldest`).
  Lo aplica `sort_board` del dominio, que ya ordena las fijadas primero. El tablero no se pagina
  (límite de 500 de la 001), así que ordenar en el servidor es barato y se prueba como dominio.
- **Periodo del historial**: `GET /api/v1/tasks?view=history` admite `within_days=30|90`. El
  servidor lo traduce a `completed_at >= ahora − N días` sobre el mismo campo por el que ya
  ordena y pagina, lo que no necesita índice nuevo. Sin parámetro, se muestra todo.
- **Aviso de periodo (FR-013)**: mientras haya un periodo activo, el historial muestra siempre
  «Mostrando solo los últimos N días · Ver todo». No se hace una consulta extra para saber si
  hay tareas más antiguas: el texto dice «solo» y ofrece verlas, que es suficiente y no cuesta
  una lectura más. «Ver todo» vale solo para esa visita (como el filtro de ámbito).
- **Alternativas**: filtrar el historial en el cliente (descartado: con paginación por cursor
  haría falta cargar páginas ocultas para llenar la pantalla); guardar el ámbito como filtro
  persistente (descartado: contradice FR-011).

## R10. Avatares predefinidos y nombre para mostrar

- **Catálogo**: 12 identificadores estables (`avatar-01` … `avatar-12`), con su SVG versionado en
  `frontend/src/assets/avatars/` y su texto alternativo en español. El backend valida el
  identificador contra la misma lista (constante en `domain/profile.py`); el contrato la
  documenta. El diseño final de los 12 se aprueba en Stitch (Fase 1).
- **Avatar efectivo**: `uploaded` si existe imagen y se eligió; si no, `preset`; si no,
  iniciales sobre un color determinista derivado del `uid`. Las iniciales salen del nombre
  efectivo (hasta dos letras, ignorando emojis y signos).
- **Nombre para mostrar**: texto plano de 1 a 50 caracteres tras `strip`, sin caracteres de
  control; permite acentos y emojis. Vacío o `null` significa «usar el de Google, o el correo».
  Solo es visual: nunca altera `users/{uid}`, el correo ni el rol (FR-017). React lo escapa; no se
  usa `dangerouslySetInnerHTML` (FR-024).
- **Alternativas**: iconos de una librería (descartado: dependencia); *emoji* como avatar
  (descartado: renderizado desigual entre sistemas).

## R11. Qué restablece «Restablecer valores por defecto»

- **Decisión**: restablece las cinco preferencias de visualización (tema, densidad, ámbito por
  defecto, orden y periodo del historial). El **nombre** y el **avatar** tienen su propia acción
  («Usar el de Google», «Quitar avatar»). Se precisa así FR-005 de la spec.
- **Razón**: mezclar el borrado de una imagen subida en un botón de «valores por defecto» sería
  destructivo e inesperado, y la spec ya pedía no tocar la imagen. Separarlo evita el estado
  ambiguo de un avatar «subido pero no elegido».

## R12. Diseño en Stitch

- **Decisión**: como en la 001 (R7), el diseño se hace con el MCP de Stitch (`mcp__stitch__*`) en
  el proyecto «MyTasks» (`projects/13869439670490335529`) y su *design system*. Ningún skill del
  proyecto cubre el diseño, así que se hace manualmente y se justifica en la PR (Principio VIII).
  Stitch no es Google Cloud: no aplica el Principio V.
- **Versiones nuevas (clarificación)**: las pantallas aprobadas no se modifican. Cada pantalla
  afectada se genera como versión nueva con `edit_screens` o `generate_variants` a partir de la
  aprobada, y el propietario aprueba las nuevas. Al aprobarlas, `docs/design/screens/README.md`
  anota cuál es la vigente.
- **Tokens oscuros**: la paleta oscura se añade a `docs/design/DESIGN.md` (versionado) y al
  *design system* de Stitch con `update_design_system`, **sin tocar los valores claros**. Los
  pares de contraste se comprueban con un script antes de pedir aprobación (AA: 4,5:1 para
  texto, 3:1 para texto grande y controles).
- **Volumen**: unas 24 generaciones (ver [`contracts/ui-screens.md`](contracts/ui-screens.md)).
  El MCP dio timeouts de 6 s a 21 min en la 001: se generan por prioridad (S3 y S7 primero) y
  se reintenta como se documentó en `docs/design/screens/README.md`. Si una pantalla falla tras
  los reintentos, se avisa al propietario en el punto de control en lugar de bloquear la fase.
- **Pantallas de la feature 003**: no se diseñan (clarificación); se verifican por contraste con
  axe en ambos temas.

## R13. Seguridad: lo que revisa `mytasks-security-auditor`

La feature toca el modelo de datos (documentos nuevos) y recibe archivos de personas (entrada no
confiable), así que la revisión es obligatoria (Principio III). Puntos que debe cubrir:
autorización (`get_active_user` en todos los endpoints de perfil, nunca `uid` del cliente),
bombas de descompresión y archivos *polyglot*, EXIF, tamaño máximo, límite de subidas, caché y
`nosniff` del avatar, el cambio de `img-src` a `blob:`, aislamiento entre cuentas y trato del
nombre como texto plano. Informes por fase como en la 003.
