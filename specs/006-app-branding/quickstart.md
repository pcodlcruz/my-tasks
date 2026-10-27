# Quickstart — Feature 006: validar el logo y el nuevo nombre

Guía de validación. Los textos exactos y los lugares están en [`contracts/branding-ui.md`](./contracts/branding-ui.md); no se repiten aquí.

## Prerrequisitos

- El propietario ha entregado la imagen del logo y está en `frontend/src/assets/brand/`.
- Dependencias instaladas en `frontend/` (`npm ci`) y, para los e2e, los emuladores de Firebase y los navegadores de Playwright (como en las
  features anteriores).

## A. Local (pruebas del repositorio)

| Paso | Comando (desde la raíz) | Resultado esperado |
|---|---|---|
| Unitarios | `env VITE_FIREBASE_API_KEY= VITE_FIREBASE_AUTH_DOMAIN= VITE_FIREBASE_PROJECT_ID= VITE_USE_EMULATORS= npm --prefix frontend test` | En verde, incluidos `brand.test.ts` y los de `LoginPage`, `AppHeader`, `AccessDeniedPage` y la bienvenida del tablero |
| Tipos y lint | `npm --prefix frontend run build` y `npm --prefix frontend run lint` | Sin errores |
| e2e | `npm --prefix frontend run test:e2e` | En verde, con `branding.spec.ts` y la accesibilidad (`a11y.spec.ts`) sin fallos de contraste |
| Entrada de nginx (solo si el icono es PNG) | `npm --prefix frontend run test:entrypoint` | En verde, con la regla del icono |

## B. Aprobación visual del propietario (antes de abrir la PR de la fase)

El agente genera capturas locales y se las enseña al propietario:

1. Inicio de sesión: tema claro y oscuro, 360 px y escritorio. Se ve logo, nombre y mensaje; el botón de Google queda a la vista.
2. Tablero: tema claro y oscuro, 360 px y escritorio. La cabecera muestra logo y nombre sin solapar las pestañas ni el perfil.
3. Acceso denegado: logo, nombre y texto.
4. Pestaña del navegador: el icono es el logo y se reconoce a tamaño pequeño.

El propietario aprueba o pide ajustes de tamaño, posición o variante (SC-005).

## C. Staging (tras fusionar en `develop` y desplegar el pipeline)

| Escenario | Comprobación | Resultado esperado |
|---|---|---|
| 1 | Abrir `https://staging.inserttask.es` sin sesión | Logo, «InsertTasks» y el mensaje; sin «MyTasks» |
| 2 | Iniciar sesión | Cabecera con logo y nombre; con tablero vacío, «¡Bienvenido a InsertTasks!» |
| 3 | Recorrer historial, papelera, perfil y accesos | La cabecera mantiene logo y nombre; no aparece «MyTasks» en ningún texto |
| 4 | Iniciar sesión con una cuenta sin invitación | Acceso denegado con logo y «InsertTasks es una aplicación privada…» |
| 5 | Mirar la pestaña | Icono del logo y título «InsertTasks» (si el icono antiguo persiste, es la caché de un día) |
| 6 | Cambiar entre tema claro y oscuro desde el perfil | El logo se distingue en ambos |
| 7 | Bloquear la imagen del logo (herramientas del navegador) y recargar | El nombre sigue visible y la pantalla no se descoloca |
| 8 | Consola del navegador | Sin errores de CSP ni de carga del logo |
| 9 | Lector de pantalla | El nombre se anuncia una sola vez en la cabecera |

## D. Producción (tras la release y el despliegue)

Repetir los escenarios 1–5 en `https://inserttask.es`. Dónde se registra: `specs/006-app-branding/validacion-produccion.md`, con lo que comunique
el propietario, sin inventar detalle.

## Resultado esperado

Los escenarios de A a D pasan y el propietario ha aprobado el aspecto (SC-005).
