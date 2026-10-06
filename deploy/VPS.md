# VPS de prueba · InterServer

Instalación del 6 de octubre de 2026. Dirección: **https://162.35.114.196**.

Ubuntu 24.04, Node.js 22, Nginx y Certbot. La app corre con el usuario de sistema `hotel-admin`, sin permisos de root, en `/opt/hotel-admin`. El servicio `hotel-admin` arranca al iniciar el VPS. Nginx publica HTTPS y reenvía al servidor interno `127.0.0.1:8787`. El firewall permite los puertos TCP 22, 80 y 443.

El certificado de Let's Encrypt corresponde a la IP y usa el perfil `shortlived`. Certbot lo renueva automáticamente y el hook `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx` recarga Nginx. El puerto 80 mantiene disponible la validación ACME y redirige las visitas a HTTPS.

## Acceso y datos

El acceso web usa la contraseña compartida configurada para las pruebas locales al desplegar. Sólo se transfirió su hash, guardado en `/opt/hotel-admin/.dev.vars` con permisos 600. Las modificaciones posteriores de la contraseña local no cambian la del VPS.

La base está en `/opt/hotel-admin/.wrangler/state/`. Se aplicaron las migraciones del proyecto sin copiar registros de la PC. Al ingresar se generan los ejemplos ficticios del prototipo.

El código se transfirió como archivo de fuentes desde Git, sin `.git`, credenciales de GitHub, secretos ni base local. GitHub conserva el código; no hay sincronización automática de código ni de datos con el VPS.

## Administración desde PowerShell

La clave privada permanece en esta PC. No compartirla ni subirla al repositorio.

```powershell
ssh -i "$env:USERPROFILE\.ssh\copahue-hotel-vps" -o StrictHostKeyChecking=yes root@162.35.114.196
```

Dentro de la sesión SSH:

```bash
systemctl status hotel-admin nginx --no-pager
journalctl -u hotel-admin -n 50 --no-pager
systemctl restart hotel-admin
systemctl list-timers --all | grep certbot
/snap/bin/certbot renew --dry-run --no-random-sleep-on-renew --run-deploy-hooks
```

## Actualizaciones y respaldos

Antes de actualizar, detener `hotel-admin` y respaldar `.wrangler/state/` fuera de `/opt/hotel-admin`, con acceso restringido. Conservar también `.dev.vars`. Reemplazar sólo fuentes, instalar con `npm ci`, aplicar migraciones pendientes con `npm run db:local`, verificar `npm run check` y `npm run build`, y arrancar el servicio. Ejecutar los comandos de npm como `hotel-admin`, desde `/opt/hotel-admin`:

```bash
runuser -u hotel-admin -- npm ci
runuser -u hotel-admin -- npm run db:local
runuser -u hotel-admin -- npm run check
runuser -u hotel-admin -- npm run build
runuser -u hotel-admin -- npm test
runuser -u hotel-admin -- npm run test:http
```

No reemplazar `.wrangler/state/` con la copia de desarrollo. Los respaldos automáticos siguen pendientes; esta instalación es para testeo.

## Verificación realizada

Tipos y compilación, 14 pruebas de integridad/autenticación y pruebas HTTP de la app compilada aprobadas en el VPS. El comando real de inicio se comprobó como servicio. Desde la PC se validó el certificado HTTPS, `/login` respondió 200, `/` redirigió al login, `/api/hotel` respondió 401 sin sesión, una contraseña incorrecta respondió 401 y un origen ajeno respondió 403.
