# Validación en staging — Feature 005 (T061)

**Fecha**: 2026-10-26
**Validado por**: el propietario, en staging (`pdlco-mytasks-stg`), desplegado por el pipeline desde `develop`.
**Alcance**: escenarios 1–9 de [`quickstart.md`](./quickstart.md) (Hosting por `web.app`, inicio de sesión, CORS, `run.app` vivo,
versión coherente, pipeline intacto y rendimiento). **No incluye** el ensayo de `staging.inserttask.es` (E1–E6): el registrador no
admite un `NS` de subdominio, así que ese ensayo se hace tras la release y el cambio de servidores de nombres
(T055–T060) y se registrará en `validacion-produccion.md`.

| Escenario | Resultado |
|---|---|
| 1–8 — Hosting sirve la web, redirección `http`, cabeceras, inicio de sesión desde `web.app`, CORS, `run.app` vivo, versión coherente y pipeline intacto | ✅ T029 (`curl` en staging): 8 de 9 escenarios en verde |
| 9 — Rendimiento (SC-005) | ✅ Con el umbral absoluto de +150 ms (PR #71). Tres cargas en frío medidas por el propietario: `web.app` 756, 455 y 598 ms (mediana 598 ms); `run.app` 590, 457 y 464 ms (mediana 464 ms). Diferencia de medianas: **+134 ms** |
| Consola del navegador | ✅ T030: el único error, `Uncaught (in promise) Error: Access to storage is not allowed from this context`, lo produce una extensión del navegador, no la aplicación |
| 1–9 completos | ✅ T043: el propietario confirmó el 2026-10-26 que los puntos 1 a 9 están correctos |

El propietario confirmó el resultado en conversación; no se conservó el detalle por escenario (cuentas usadas, capturas) más allá de
las mediciones de rendimiento. Si se necesita más trazabilidad, puede ampliar esta tabla.

## Infraestructura aplicada en staging por el pipeline

| Fase | Qué se aplicó | Cuándo |
|---|---|---|
| 3 | Versión y *release* de Hosting delante de `mytasks-web` | Antes del 2026-10-26 |
| 4 | Dominio `staging.inserttask.com` (equivocado; retirado en la Fase 5) | 2026-10-26 |
| 5 | Zona `staging.inserttask.es` con `TXT hosting-site=pdlco-mytasks-stg` y `A 199.36.158.100` (sin `AAAA`), dominio `staging.inserttask.es`, baja de `staging.inserttask.com` y dominios autorizados / *referrers* en `.es` | 2026-10-26, tras la aprobación del propietario |

Los servidores de nombres de la zona (`ns-cloud-d1`…`d4.googledomains.com.`) se leyeron en solo lectura con el MCP y ya están en la
delegación del root de producción (T074).

## Pendiente (no bloquea la release)

- El ensayo del dominio de staging (T055–T060) y la validación de producción (T047–T053), en la Phase 7.
- Resolver, durante el ensayo, si autorizar `inserttask.es` en Identity Platform autoriza sus subdominios
  (`security-review-final.md`).
