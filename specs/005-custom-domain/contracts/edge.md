# Contrato de la entrada web (Hosting y dominio propio)

**Feature**: [../spec.md](../spec.md) · Es el comportamiento observable desde fuera que la
implementación debe cumplir y que la validación comprueba.

## 1. Encaminamiento

| Petición | Respuesta esperada |
|---|---|
| `GET https://inserttask.es/<cualquier ruta>` | La misma respuesta que daría `mytasks-web` de producción para esa ruta (SPA, activos, `/config.js`), por una conexión con certificado válido |
| `GET https://www.inserttask.es/<ruta>?<query>` | `301` a `https://inserttask.es/<ruta>?<query>` |
| `GET http://inserttask.es/<ruta>` y `http://www…` | Redirección a `https://` y, en el caso de `www`, al canónico. Se asume que Hosting redirige HTTP a HTTPS por sí solo (no figura en la documentación consultada): **a verificar en staging** (escenario 2) y, si no fuera así, declarar la redirección en la configuración de Hosting |
| `GET https://staging.inserttask.es/<ruta>` | La misma respuesta que `mytasks-web` de staging, con certificado válido. Es el **ensayo** del dominio de producción (FR-014, FR-020) |
| `GET https://<proyecto>.web.app/<ruta>` | Igual que el canónico de su entorno (sirve la misma versión). Sigue funcionando en ambos |
| `GET https://mytasks-web-<nº>.europe-southwest1.run.app/<ruta>` | Sigue respondiendo con la aplicación, sin redirección (FR-011) |

Una sola regla de reescritura en Hosting: `**` → servicio `mytasks-web`, región `europe-southwest1`.
No hay reglas para `/api/**`: la API se llama en su dirección `run.app` (research R3).

## 2. Cabeceras que deben llegar al navegador

El contenedor ya las emite; Hosting no debe perder ni alterar ninguna en las respuestas de la web:

| Cabecera | Comprobación |
|---|---|
| `Content-Security-Policy` | Igual que la actual; `img-src 'self' data: blob:`; `connect-src` con la API de producción |
| `Strict-Transport-Security` | Presente |
| `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` | Presentes |
| `Cache-Control` de `/config.js` y de las rutas de la SPA | `no-store`; no se sirven desde la caché de la CDN |
| `Cache-Control` de `/assets/*` | `public, max-age=31536000, immutable` |

Si una cabecera se perdiera a través de Hosting, se declara en la configuración de Hosting (misma
política, sin relajar nada) y se anota en la revisión de seguridad.

## 3. Registros DNS: zonas de Cloud DNS (R16)

El DNS vive en Cloud DNS, una zona pública por entorno, y los registros los escribe Terraform. La
documentación de Hosting fija los valores: `TXT hosting-site=<siteId>` y `A 199.36.158.100`, y **ningún
`AAAA`**. Lo que sigue es lo que debe resolverse; lo único que hace el propietario es cambiar los servidores de nombres (final
de esta sección). Forma de lo que se publica:

| Zona | Nombre | Tipo | Valor | Notas |
|---|---|---|---|---|
| `inserttask.es` (producción) | `inserttask.es` | `TXT` | `hosting-site=pdlco-mytasks` | Propiedad. **Permanente**: Hosting lo usa para renovar el certificado |
| `inserttask.es` (producción) | `inserttask.es` | `A` | `199.36.158.100` | Dirige el tráfico |
| `inserttask.es` (producción) | `www.inserttask.es` | `A` | `199.36.158.100` | La redirección al canónico la hace Hosting |
| `inserttask.es` (producción) | `staging.inserttask.es` | `NS` | Servidores de nombres de la zona de staging | Delegación; valores públicos pasados como variable del root de producción |
| `staging.inserttask.es` (staging) | `staging.inserttask.es` | `TXT` | `hosting-site=pdlco-mytasks-stg` | Propiedad del subdominio para el proyecto de staging. **Permanente** |
| `staging.inserttask.es` (staging) | `staging.inserttask.es` | `A` | `199.36.158.100` | Dirige el tráfico del ensayo |

Reglas: **ningún `AAAA`** en ninguna zona; ningún registro `CNAME` ni `A` ajeno en un nombre servido por
Hosting. Los `CAA`, si el dominio los tenía en el registrador, se trasladan a la zona (FR-023) y deben
permitir `pki.goog` y `letsencrypt.org`; si no había ninguno, no se declara ninguno.

**Lo que hace el propietario (FR-016)**, siempre con los valores de las salidas de Terraform:

1. **Release**: confirmar que no hay otros registros que conservar (FR-023) y cambiar los servidores de
   nombres del dominio a los de la zona de producción. La zona de producción ya delega `staging`, así que
   no se añade ningún `NS` en el registrador (no admite `NS` de subdominio).

Los registros de staging existen antes que los de producción, pero `staging.inserttask.es` solo resuelve
en público tras ese cambio; se valida primero y después `inserttask.es` (FR-020).

## 4. Inicio de sesión desde el dominio propio

- El *popup* de Google se abre contra el dominio de autenticación del proyecto
  (`pdlco-mytasks.firebaseapp.com`); `FIREBASE_AUTH_DOMAIN` no cambia.
- `inserttask.es` (producción) y `staging.inserttask.es` (staging) están en los dominios autorizados
  de Identity Platform y en los *referrers* de la clave de API web de su proyecto.
- Las reglas de invitación son las de la feature 003, sin cambios.

## 5. Garantías de no regresión

- No hay cambios en la aplicación web, en la API ni en el contrato OpenAPI.
- El pipeline sigue desplegando solo por `deploy-staging` / `deploy-production`; ninguna operación de
  Hosting se hace a mano.
