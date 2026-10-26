# Hotel · Administración

Aplicación para gestionar reservas, tarifas, restaurante, stock, compras, proveedores, caja, personal y usuarios del hotel. Los regímenes vigentes son **Sin desayuno, Desayuno, Media pensión y Pensión completa**.

React/TypeScript con Vinext/Vite y persistencia SQLite mediante D1/Miniflare. Incluye cuentas individuales y permisos por módulo. Los saldos se derivan de movimientos; no constituye un sistema completo de facturación o contabilidad.

Cobros de reservas y restaurante en ARS o efectivo USD: cada cobro en USD guarda el importe recibido y la cotización manual; tarifas y deudas permanecen en ARS. Caja cuenta ambas monedas por separado. Ver el procedimiento en el [manual](docs/manual-app.md).

## Desarrollo local

Requiere **Node.js 22.13 o superior** y npm. Desde la raíz del proyecto:

```powershell
npm.cmd ci
npm.cmd run db:local
npm.cmd run auth:setup
npm.cmd run auth:bootstrap -- "Nombre completo" email@dominio.com
npm.cmd run dev
```

Abrir **http://localhost:5173**. `auth:bootstrap` se ejecuta únicamente al crear el primer administrador de una base nueva y entrega una contraseña aleatoria una sola vez. Guardarla por un medio privado. En macOS/Linux usar `npm` en lugar de `npm.cmd`.

La base local es independiente de Administración y Pruebas. La carga de ejemplos requiere `APP_ENV=test`; una instalación normal no crea reservas ni dinero ficticios. Las siguientes ejecuciones requieren solamente `npm.cmd run dev`; aplicar migraciones si se agregaron nuevas.

## Verificación

```powershell
npm.cmd run check
npm.cmd run lint
npm.cmd run build
npm.cmd test
npm.cmd run test:http
```

Las pruebas utilizan bases temporales. `test:http` requiere la compilación previa. Para cambios en respaldos, las pruebas Python y el ensayo aislado se documentan en la guía correspondiente.

## Organización

| Carpeta | Contenido |
| --- | --- |
| `app/` | Rutas, coordinación de pantallas y estilos |
| `modules/` | Pantallas, formularios y reglas por módulo |
| `components/` y `lib/` | Componentes y funciones compartidas |
| `db/` y `drizzle/` | Esquema y migraciones |
| `scripts/` y `deploy/` | Herramientas locales, despliegue y respaldos |
| `tests/` | Verificaciones de comportamiento y seguridad |

## Documentación

- [Manual de uso y desarrollo](docs/manual-app.md).
- [Alcance y pendientes](ALCANCE.md).
- [Apertura con datos reales](docs/apertura-operativa.md).
- [Usuarios y recuperación de acceso](docs/recuperacion-acceso.md).
- [Clientes, consultas y vinculación con reservas](docs/clientes.md).
- [Administración y Pruebas](docs/entornos.md) y [despliegue en VPS](deploy/VPS.md).
- [Respaldos cifrados y restauración](docs/respaldos.md). La copia externa a la PC requiere que esté encendida, con sesión iniciada y conectada.
- [WordPress y migración de la web](docs/wordpress.md).

## Datos privados y publicación

No subir `.dev.vars`, `.env`, `.wrangler`, claves SSH, contraseñas, bases, respaldos ni datos reales. Los archivos de `backups/` están excluidos de Git. Mantener npm y `package-lock.json`; conservar las bases de cada instalación al actualizar.

GitHub guarda el código y la documentación. Un push no publica automáticamente la app ni sincroniza sus datos. Los cambios de producción requieren respaldo previo y verificación.
