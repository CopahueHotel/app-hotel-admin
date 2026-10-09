# Administración y pruebas

Accesos configurados y verificados con HTTPS:

| Entorno | URL | Servicio / puerto interno | Directorio y base |
| --- | --- | --- | --- |
| Administración | https://admin.copahuehotel.com.ar | hotel-admin / 127.0.0.1:8787 | /opt/hotel-admin y su .wrangler/state |
| Pruebas | https://pruebas.copahuehotel.com.ar | hotel-pruebas / 127.0.0.1:8788 | /opt/hotel-pruebas y su .wrangler/state |

La web principal y el correo conservan su alojamiento y sus registros actuales. Los DNS autoritativos consultados corresponden a AccuWebHosting. En el administrador de zona, agregar solamente dos registros A (`admin` y `pruebas`) a `162.35.114.196`, inicialmente sin proxy. No cambiar los NS, el dominio raíz, www ni los MX. Si el panel agrega el dominio automáticamente, ingresar solamente el nombre corto.

## Separación de datos y acceso

Pruebas utiliza un usuario de sistema propio, `hotel-pruebas`, una base nueva y una cuenta inicial independiente. No copiar reservas, saldos, usuarios, contraseñas ni la base de Administración. Los ejemplos del prototipo se generan al acceder a la API autenticada de una instalación vacía. El aviso **PRUEBAS · No cargar datos reales del hotel** aparece también en el login y las impresiones, con `APP_ENV=test`.

La entrega privada del primer acceso de pruebas queda en `/root/hotel-pruebas-primer-acceso.txt`, con permisos 600. Leerlo desde la consola de InterServer como root, guardar la contraseña y eliminar ese archivo tras entregarla. Nunca subirlo a Git ni copiarlo a esta documentación. Los superadministradores administran usuarios de su propio entorno; cambiar una cuenta no cambia la del otro.

Las cookies actuales son HttpOnly y Secure en HTTPS, sin atributo Domain: quedan limitadas al host de cada subdominio. No se comparte la sesión. Después de mover Administración de la IP al subdominio hay que volver a ingresar con la misma cuenta. La IP puede conservarse como redirección a Administración después de activar HTTPS.

## Configuración

En `/opt/hotel-admin/.dev.vars`: `AUTH_ORIGIN=https://admin.copahuehotel.com.ar`. El acceso anterior por IP redirige al subdominio.

En `/opt/hotel-pruebas/.dev.vars`:

```text
AUTH_ORIGIN=https://pruebas.copahuehotel.com.ar
APP_ENV=test
```

Ambos archivos son privados y distintos. No habilitar correo de pruebas con credenciales de producción automáticamente. `HOTEL_PORT=8788` se configura en el servicio systemd de pruebas, no como dato enviado desde el navegador. Ambos puertos escuchan sólo en localhost; el firewall público sigue usando 80 y 443.

Templates: `deploy/hotel-pruebas.service`, `deploy/nginx-subdomains.conf` y `deploy/nginx-ip-redirect.conf`. El template completo de Nginx requiere primero el certificado `hotel-admin-dominios`. Mientras no exista, habilitar sólo su bloque HTTP para la validación ACME; no cargar rutas a certificados inexistentes.

Certbot puede emitir el certificado cuando ambos subdominios resuelvan públicamente al VPS:

```bash
/snap/bin/certbot certonly --webroot -w /var/www/letsencrypt --cert-name hotel-admin-dominios -d admin.copahuehotel.com.ar -d pruebas.copahuehotel.com.ar --non-interactive --agree-tos --email info@copahuehotel.com.ar
```

Respaldar configuración y base antes de cambiar el origen de Administración. Validar Nginx con `nginx -t`, reiniciar `hotel-admin` por el cambio de origen y recargar Nginx. Verificar certificados, login, orígenes rechazados y APIs privadas en ambos entornos. No abrir Administración por el dominio hasta completar estas verificaciones.

## Desarrollo y publicación

Desarrollar en una rama con datos ficticios, verificar localmente y publicar la versión candidata en Pruebas. Tras la aprobación, actualizar el código de Administración con un respaldo y aplicar las migraciones pendientes sobre su propia base. Nunca sincronizar o reemplazar esa base con la de Pruebas. Identificar siempre la revisión publicada en cada entorno; no hay despliegue automático desde GitHub.

Esta separación no limpia los ejemplos de Administración ni carga saldos/stock reales. La preparación de datos y los respaldos automáticos fuera del VPS son tareas pendientes antes del uso operativo con información real.

Verificaciones realizadas: registros A de ambos subdominios en DNS autoritativo y en un resolvedor público; certificados HTTPS válidos; login 200 y APIs privadas 401 en ambos; origen cruzado rechazado con 403; redirección de IP a Administración; aviso de Pruebas; servicios activos y separación de bases, usuarios, contraseñas y permisos de archivos. Tipos, compilación y pruebas HTTP se verificaron localmente y en la instalación de pruebas. El certificado compartido de los subdominios tiene renovación automática mediante Certbot y recarga de Nginx. Una caché DNS antigua puede tardar en actualizarse en algunas conexiones.
