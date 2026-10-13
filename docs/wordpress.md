# WordPress para preparar la migración

Destino: **https://web.copahuehotel.com.ar**. Panel: **https://web.copahuehotel.com.ar/wp-admin/**.

El 9 de octubre de 2026 se preparó una instalación nueva de WordPress 7.1.3 en español de Argentina, PHP 8.3 y MariaDB 10.11. La copia del sitio anterior todavía no se importó. La web principal y el correo siguen en su alojamiento actual; Administración y Pruebas mantienen sus bases y servicios.

## Primer acceso

Los datos del primer acceso se entregan mediante la consola privada. La cuenta de WordPress es independiente de la app del hotel.

La contraseña aleatoria vigente está únicamente en `/root/hotel-web-primer-acceso.txt`, con permisos 600. Desde la consola privada de InterServer, como root:

```bash
cat /root/hotel-web-primer-acceso.txt
```

Guardar la contraseña en un gestor y eliminar ese archivo después de entregarla. No copiarla a conversaciones, Git ni esta documentación. La contraseña inicial mostrada por la herramienta durante la instalación fue reemplazada antes de habilitar el acceso público.

El SMTP de la app no configura el correo de WordPress. Antes de depender de recuperación por email o formularios de contacto, configurar y probar el correo de WordPress por separado.

## Aislamiento y configuración

- Archivos: `/var/www/hotel-web`, propietario de servicio `hotel-web`, lectura estática para Nginx.
- Base: `hotel_web`; usuario de MariaDB exclusivo para esa base. MariaDB escucha en `127.0.0.1:3306`; no se abrió un puerto público de base de datos.
- PHP-FPM: pool `hotel-web`, socket `/run/php/hotel-web.sock`, hasta tres procesos bajo demanda. Su acceso a archivos está limitado al sitio y sus temporales.
- Nginx: `/etc/nginx/sites-available/hotel-web`. Certificado independiente `hotel-web`, con renovación automática mediante Certbot y recarga de Nginx.
- `wp-config.php` privado, editor de archivos deshabilitado y administración forzada a HTTPS. Se bloquean acceso directo a configuración, archivos ocultos y ejecución de PHP dentro de uploads. XML-RPC está deshabilitado inicialmente; revisar si algún servicio de la web migrada lo necesita.
- Registro público deshabilitado; zona horaria Buenos Aires; entorno WordPress `staging`, `blog_public=0` y encabezado `X-Robots-Tag: noindex, nofollow, noarchive`. Estos avisos a buscadores no restringen el acceso público al contenido: no copiar datos sensibles sin proteger antes el entorno.
- Importaciones por navegador: límite inicial de 256 MiB, memoria PHP 256 MiB y tiempo de ejecución 300 segundos. Para una copia mayor, preparar un traslado por servidor o ajustar límites después de revisar su tamaño.

Credenciales, archivos del sitio y exportaciones SQL permanecen fuera del repositorio de la app. WP-CLI está instalado en el servidor para mantenimiento como `hotel-web`.

## Respaldos y migración pendiente

Se conservaron configuración anterior de Nginx y un respaldo inicial de archivos y SQL de WordPress en carpetas privadas bajo `/var/backups/hotel-web/`. Todavía no hay un respaldo automático externo de WordPress.

Para migrar, obtener un respaldo completo de **archivos, uploads, temas, plugins y base SQL** de la web actual. Revisar versiones de PHP, plugins y tamaño antes de importarlo. La instalación nueva no reemplaza una copia del sitio anterior. Durante el ensayo, cambiar referencias de URL de forma compatible con datos serializados y revisar enlaces, imágenes, formularios, reservas e integraciones de la web; evitar activar envíos o procesos comerciales de una copia sin revisarlos.

La importación puede reemplazar cuentas y contraseñas del WordPress nuevo por las del sitio original. Conservar acceso administrativo durante ese cambio. Antes de mover el dominio principal, verificar la copia y respaldar ambos sitios. El corte de DNS del dominio raíz y www será un paso separado; no tocar los registros MX del correo como parte de la migración web.

Referencias: [requisitos de WordPress](https://wordpress.org/about/requirements/) y [WP-CLI](https://wordpress.org/cli/).
