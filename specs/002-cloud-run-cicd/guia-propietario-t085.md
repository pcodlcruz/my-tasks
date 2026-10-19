# Guía del propietario: presupuestos y alertas de facturación (T085)

**Qué resuelve**: T085 de [tasks.md](./tasks.md) y FR-026 de [spec.md](./spec.md) (aviso al
alcanzar el 50, 90 y 100 % del gasto de cada proyecto). **Decisión del propietario
(2026-10-19): los presupuestos no se declaran en Terraform.** Así las cuentas `terraform-*` no
necesitan ningún rol sobre la cuenta de facturación (que alcanzaría a todos sus proyectos). Los
creas tú a mano, una sola vez, y quedan documentados en `infra/RUNBOOK.md` §11.

El agente no tiene acceso a la facturación y no lo necesita.

## Importes propuestos (a ratificar)

Márgenes de aviso sobre el coste esperado ([research.md](./research.md) R11). Un presupuesto de
Google Cloud **avisa, no detiene el gasto**.

| Proyecto | Presupuesto mensual | Umbrales |
|---|---|---|
| `pdlco-mytasks-stg` (staging) | 10 USD | 50 %, 90 %, 100 % |
| `pdlco-mytasks` (producción, incluye la plataforma y el PITR) | 15 USD | 50 %, 90 %, 100 % |

Si quieres otros importes, cámbialos aquí y en R11 al ratificar.

## Pasos (consola de Google Cloud, con tu cuenta)

Repítelos una vez por proyecto.

1. Abre **Facturación → Presupuestos y alertas** de la cuenta de facturación que paga ambos
   proyectos y pulsa **Crear presupuesto**.
2. **Ámbito**: en *Proyectos* selecciona **solo** el proyecto (`pdlco-mytasks-stg` o
   `pdlco-mytasks`); deja el resto de filtros en *Todos*.
3. **Importe**: *Tipo de presupuesto* = **Importe especificado**, el de la tabla; periodo
   **mensual**.
4. **Acciones**: añade los umbrales **50 %**, **90 %** y **100 %** sobre el *gasto real*.
5. **Notificaciones**: deja marcado *Enviar alertas por correo a los administradores y usuarios
   de la facturación*. No hace falta canal de Monitoring ni Pub/Sub.
6. Guarda y repite con el otro proyecto.

## Qué anotar al terminar

Dime (sin pegar datos de la cuenta de facturación):
- los importes finales ratificados, o «los propuestos»;
- que los dos presupuestos existen con los tres umbrales y el aviso por correo.

Con eso marco T085, actualizo R11 y el RUNBOOK §11.

## Comprobación

No hay prueba de fallo razonable (habría que gastar). Basta con ver los dos presupuestos listados
en *Presupuestos y alertas* con su ámbito y sus tres umbrales.
