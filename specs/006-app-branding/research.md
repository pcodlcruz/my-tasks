# Research — Feature 006: logo y nuevo nombre visible

Fecha: 2026-10-27. No quedan `NEEDS CLARIFICATION`; esto recoge las decisiones técnicas que la spec deja abiertas, comprobadas en el código.

## Estado de partida (leído del repositorio)

- «MyTasks» aparece en **cinco** sitios visibles: `frontend/index.html` (título de la pestaña), `src/app/AppHeader.tsx` (cabecera),
  `src/features/auth/LoginPage.tsx` (título), `src/features/board/BoardPage.tsx` («¡Bienvenido a MyTasks!») y
  `src/features/auth/AccessDeniedPage.tsx` (texto). Son exactamente los de FR-003; no hay más en `src/`.
- **Ningún test actual depende del nombre**: `grep` sin distinguir mayúsculas no encuentra «mytasks» en `frontend/tests`. El de acceso denegado
  busca el encabezado «Necesitas una invitación», que no cambia.
- Hoy no hay logo: `public/favicon.svg` es el icono genérico de Vite (con degradados y filtros) y la cabecera solo tiene texto.
- El tema se aplica con el atributo `data-theme` (`light` | `dark`) del `<html>` (`lib/appearance.ts`, `theme-init.js`); no hay variantes `dark:` de Tailwind.
- nginx (`frontend/nginx/default.conf`): `/assets/*` se sirve con `immutable` un año (Vite nombra los ficheros por hash), `/favicon.svg` con
  `max-age=86400`, y **todo lo demás que no sea `/config.js`, `/index.html` ni lo anterior se sirve con `no-store`**.
- CSP (generada en `docker-entrypoint.d/40-runtime-config.sh`): `img-src 'self' data: blob:` ya permite una imagen del mismo origen. No hace
  falta tocarla.

## R1 — Dónde vive el fichero del logo en la aplicación

- **Decisión**: `frontend/src/assets/brand/logo.<ext>`, importado desde el código (Vite lo emite en `/assets/` con hash).
- **Razón**: queda con caché de un año e `immutable`, sin parpadeo en visitas repetidas (SC-004), y el hash cambia solo si cambia el logo. Es el
  mismo mecanismo que los avatares de `src/assets/avatars`.
- **Alternativas**: ponerlo en `public/` (`/logo.png`): rechazado, porque ahí lo sirve `location /` con `no-store` y se descargaría en cada visita.

## R2 — Un componente y una constante, no más

- **Decisión**: `src/lib/brand.ts` con `APP_NAME = 'InsertTasks'` y `APP_TAGLINE = 'Inserta tus tareas y prioriza lo que importa'`, y un
  componente `BrandLogo` en `src/features/shared/` que pinta el logo con tamaño fijo. Lo usan la cabecera, el inicio de sesión y el acceso denegado.
- **Razón**: tres usos justifican un componente (Principio I); sin él habría tres `<img>` con las mismas reglas de tamaño y accesibilidad. La
  constante evita que el nombre se escriba cinco veces y permite un test que lo compare con `index.html`.
- **Alternativas**: un contexto o fichero de configuración de marca: rechazado (YAGNI; el nombre no cambia por entorno). Escribir el nombre a
  mano en cada sitio: rechazado, es lo que hoy produce el «MyTasks» repetido.

## R3 — Accesibilidad del logo

- **Decisión**: donde el logo va junto al texto del nombre es **decorativo** (`alt=""`); el nombre lo anuncia el texto. El título de la página
  es «InsertTasks».
- **Razón**: FR-006 pide anunciar el nombre una sola vez. La cabecera ya hace lo mismo con el avatar (decorativo porque el nombre va en el enlace).
- **Alternativas**: `alt="InsertTasks"` en todos los sitios: rechazado, el nombre se leería dos veces.

## R4 — Evitar saltos de maquetación (SC-004, FR-012)

- **Decisión**: el logo se pinta con `width` y `height` fijos (atributos y clases), de modo que el hueco existe antes de que cargue. Si no carga
  (FR-007), el texto del nombre sigue ahí y no se mueve.
- **Razón**: es lo que evita el desplazamiento del contenido con una imagen que llega tarde, sin librerías.
- **Presupuesto de peso**: se pide al propietario una imagen optimizada; si pasa de ~50 KB se optimiza antes de usarla (sin rediseñarla, FR-009).

## R5 — Tema claro y oscuro (FR-005, SC-003)

- **Decisión**: primero se prueba **una sola imagen** sobre los dos fondos. Si no se distingue en uno, se pide la variante al propietario y se
  muestran dos `<img>` alternadas con una regla en `index.css` según `:root[data-theme='dark']`, como el resto de los tokens.
- **Razón**: la spec ya asume una imagen válida para los dos temas; la variante solo se añade si hace falta (Principio I).
- **Alternativas**: filtros CSS para invertir el logo: rechazado, altera la marca (FR-009).

## R6 — Icono de la pestaña (FR-011)

- **Decisión**: si el logo es **SVG**, se sustituye `public/favicon.svg` (mantiene el `<link>`, la regla de nginx y su caché de un día). Si
  es **PNG**, se añade `public/favicon.png`, se cambia el `<link rel="icon">` (`type="image/png"`) y se añade su `location` en `default.conf`
  (si no, caería en `no-store`) con su comprobación en `nginx/tests`.
- **Razón**: el formato del logo lo decide el propietario; las dos rutas están acotadas y no tocan la CSP.
- **Limitación conocida**: con caché de un día, quien ya tenía abierta la aplicación puede ver el icono antiguo hasta ese plazo. Aceptable: no
  es un fallo, y FR-011 no exige inmediatez.
- **Alternativas**: generar un juego de iconos (apple-touch, manifiesto, 192/512 px): rechazado, queda fuera de la spec (solo la pestaña).

## R7 — El nombre del título de la pestaña

- **Decisión**: `<title>InsertTasks</title>` en `index.html` (no puede importar la constante) y un test unitario que lea el fichero y compruebe
  que coincide con `APP_NAME`, igual que `theme-init.test.ts` ya lee `public/`.
- **Razón**: una sola comprobación mantiene sincronizados título y constante.

## R8 — Qué NO se toca

- Nada de backend, contratos de API, Firestore, Terraform, CI ni despliegue: el cambio es solo del frontend y se entrega por el pipeline
  existente (FR-010). Los nombres técnicos `mytasks-web`, `mytasks-api`, los proyectos `pdlco-mytasks*` y el repositorio no cambian.
- No hay revisión de seguridad: no cambia autenticación, autorización ni modelo de datos (Principio III). Único punto a vigilar: el logo se
  muestra con `<img>`, **nunca** insertado como HTML, así que aunque sea un SVG no puede ejecutar código.

## R9 — Validación visual con el propietario (SC-005, supuesto de la spec)

- **Decisión**: cuando llegue la imagen, el agente genera capturas locales con Playwright del inicio de sesión, el tablero y el acceso
  denegado, en claro y oscuro y en móvil (360 px) y escritorio, y se las enseña al propietario **antes** de abrir la PR de la fase.
- **Razón**: la colocación (tamaño, posición, espaciado) es una decisión visual del propietario; Stitch no interviene porque no hay pantallas
  nuevas y las aprobadas de la feature 001 no se modifican.
- **Alternativas**: pasar por Stitch otra ronda de diseño: rechazado, sería más pesado que una captura real y no añade información.

## Riesgo

- **Dependencia externa**: sin el fichero del logo no se puede implementar la parte visual (US1, US2, US4). Lo que no depende de él (nombre,
  mensaje, título, texto de acceso denegado: US3 y parte de US1/US2) puede ir primero.
