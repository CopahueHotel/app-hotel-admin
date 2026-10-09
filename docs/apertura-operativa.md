# Apertura de Administración

Administración y Pruebas tienen bases independientes. Los ejemplos se generan únicamente en una base nueva con `APP_ENV=test`. Una base de Administración nueva prepara las 17 habitaciones y el precio de comida externa pendiente de definir, sin reservas, productos ni movimientos económicos de ejemplo.

La limpieza inicial autorizada conserva usuarios, contraseñas, roles, permisos, sesiones, configuración y auditoría de accesos. Conserva números y tipos de habitación, pero deja su estado **Pendiente de limpieza** y borra observaciones ficticias: verificar el estado real antes de reservar. Elimina reservas, huéspedes, comidas, productos, existencias, compras, caja, tarifas, proveedores, menú y personal ficticios. No representa una anulación contable ni debe utilizarse para borrar operaciones reales.

Antes de empezar:

1. En **Usuarios y permisos**, crear cuentas individuales y asignar los roles necesarios; revisar sus permisos. El email de acceso de Gabriel es `info@copahuehotel.com.ar`. El buzón `sistema@copahuehotel.com.ar` es únicamente el remitente de recuperación.
2. En **Configuración**, verificar habitaciones y definir el precio de comidas externas. En **Tarifas**, cargar los valores vigentes del alojamiento.
3. En **Stock**, crear el catálogo real y registrar existencias mediante los circuitos disponibles, con fecha y motivo. No se conservan precios ni mínimos inventados.
4. Revisar con el responsable los saldos iniciales, deudas y reservas reales antes de registrar cobros o pagos. Los saldos se derivan de movimientos; no son campos editables. La apertura de saldos debe resolverse con los circuitos disponibles, sin simular ventas o cobros para representar dinero anterior.

La documentación de alcance conserva las limitaciones funcionales. Quitar las etiquetas de prueba en Administración no agrega facturación, contabilidad ni regularizaciones todavía pendientes. El subdominio Pruebas conserva su aviso para evitar cargar datos reales allí.

## Mantenimiento excepcional

`scripts/reset-operational-data.mjs` es exclusivamente para la limpieza inicial expresamente autorizada de `/opt/hotel-admin`. No hay un botón ni una API para esta operación. Requiere detener el servicio y respaldar código, configuración privada y toda la base, incluyendo su estado WAL. Ensayar la limpieza sobre una copia antes de tocar la base activa.

```bash
# Con respaldo ya verificado y hotel-admin detenido:
cd /opt/hotel-admin
runuser -u hotel-admin -- node scripts/reset-operational-data.mjs --confirm-fictitious-data
```

El script valida el esquema y la existencia de un superadministrador activo. Dentro de una única transacción retira temporalmente los triggers de protección, elimina los datos operativos, restaura sus definiciones exactas y verifica integridad y conservación de accesos antes del commit. Si falla, revierte la transacción. Conserva el historial de alta/restablecimiento de usuarios, permisos y recuperación; registra la limpieza como **Consola del servidor**, sin atribuirla a una sesión inventada. Los historiales operativos ficticios quedan en el respaldo privado.

Nunca ejecutar esta limpieza después de empezar a cargar operaciones reales. Para restaurar un respaldo, detener el servicio y restaurar conjuntamente código, configuración y estado de la base; no mezclar archivos SQLite de momentos distintos.
