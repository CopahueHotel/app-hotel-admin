# Recuperación de acceso

Aplicar `npm.cmd run db:local` antes de usar esta versión. La migración `0010_perfect_mandarin` agrega únicamente enlaces y límites de recuperación; conserva los usuarios y todos los registros del hotel.

## Recuperar la cuenta local sin servicio de correo

Detener la app con Ctrl+C y ejecutar desde la raíz:

```powershell
npm.cmd run auth:recovery-link -- info@copahuehotel.com.ar http://localhost:5173
npm.cmd run dev
```

Abrir el enlace privado mostrado por el primer comando y elegir la contraseña nueva. Si se utiliza otro puerto, indicar el origen real: debe coincidir con `AUTH_ORIGIN` y el navegador. El enlace vence a los 15 minutos. El comando solamente funciona para localhost y una cuenta activa existente; no crea usuarios ni cambia roles. Generar el enlace no cambia la contraseña. Quien tiene acceso a la consola y a la base local ya tiene acceso administrativo a esos datos: no compartir la terminal ni el enlace.

## Uso con correo configurado

Desde el login, seleccionar **Olvidé mi contraseña**, indicar el email registrado y abrir el enlace recibido. Elegir y repetir una contraseña de 12 a 256 caracteres. El cambio cierra todas las sesiones de esa cuenta; volver a ingresar normalmente. La recuperación no activa usuarios desactivados, no modifica permisos y no genera una sesión automáticamente.

Mientras no haya correo configurado, el formulario informa que el envío no está disponible. No muestra enlaces ni tokens en la respuesta de la API.

## Configuración futura del envío

La app admite SMTP autenticado con TLS implícito en puerto 465 y conserva el adaptador HTTP. No instalar un servidor de correo completo en el VPS. El envío corre en segundo plano; la respuesta del formulario no depende del tiempo que tarda el servidor de correo. El 9 de octubre de 2026 el usuario confirmó que la prueba funcionó en Pruebas, después de cargar la contraseña por consola privada. La copia local no recibe esa credencial.

### SMTP de AccuWebHosting

Datos confirmados: servidor `mail.copahuehotel.com.ar`, puerto `465`, usuario y remitente `sistema@copahuehotel.com.ar`. Desde el VPS se verificó la conexión TLS y el certificado del dominio. Tras la prueba confirmada por el usuario, se instaló esta versión y se copió la configuración privada a Administración, conservando su origen HTTPS y con respaldo previo. Ambos entornos siguen activos. El usuario confirmó que la recuperación desde Administración funcionó con el email registrado `info@copahuehotel.com.ar`; el buzón `sistema@copahuehotel.com.ar` es el remitente, no una cuenta de acceso a la app. El despliegue no modificó usuarios ni datos del hotel.

En la consola del VPS, como root, cuando esté instalada esta versión:

```bash
cd /opt/hotel-pruebas
runuser -u hotel-pruebas -- npm run auth:smtp -- mail.copahuehotel.com.ar 465 sistema@copahuehotel.com.ar info@copahuehotel.com.ar
systemctl restart hotel-pruebas
```

El comando pide dos veces la contraseña del buzón, sin mostrarla. No escribirla en la línea del comando ni en conversaciones. Guarda las variables en `.dev.vars`, con permisos 600, conservando `AUTH_ORIGIN`. No cambia usuarios ni contraseñas de la app. Pruebas sólo puede enviar a los emails del cuarto argumento, separados por comas; sin esa lista, su envío permanece deshabilitado.

Después de verificar en Pruebas la recepción, apertura y uso único del enlace, instalar esta versión también en Administración y configurar el correo allí. El comando requiere que `scripts/setup-smtp.mjs` esté instalado en ese entorno:

```bash
cd /opt/hotel-admin
runuser -u hotel-admin -- npm run auth:smtp -- mail.copahuehotel.com.ar 465 sistema@copahuehotel.com.ar
systemctl restart hotel-admin
```

Variables privadas utilizadas: `MAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` y, en Pruebas, `MAIL_TEST_RECIPIENTS`. Nunca se envían al navegador. El protocolo autentica con PLAIN o LOGIN únicamente dentro de TLS y cierra la conexión con un plazo máximo de 15 segundos. No permite puerto 25 ni conexiones sin cifrar. Si el futuro proveedor ofrece 465, cambiar esos datos con el mismo comando; si ofrece únicamente STARTTLS/587, hay que incorporar ese modo expresamente.

Una respuesta SMTP de aceptación no garantiza llegada a la bandeja principal. Revisar spam y autenticación SPF/DKIM/DMARC en el proveedor antes de uso operativo. No alterar MX ni SPF del dominio como parte de esta configuración inicial: envía el servidor de correo contratado. La configuración no dispara mensajes; se envían al solicitar recuperación desde la app.

### Adaptador HTTP alternativo

Las siguientes variables se guardan en `.dev.vars` (local) o en las variables privadas del servidor, nunca en Git:

```text
MAIL_API_URL=https://endpoint-del-proveedor-o-pasarela
MAIL_PROVIDER=api
MAIL_API_KEY=credencial-privada
MAIL_FROM=remitente-verificado@dominio-del-hotel
```

Contrato preparado: POST HTTPS, autorización Bearer y JSON `{ "from": "...", "to": ["email-registrado"], "subject": "...", "text": "..." }`; respuesta HTTP 2xx indica aceptación. El proveedor debe aceptar ese contrato y verificar el remitente/dominio. No hay envíos hasta configurar las tres variables. Reiniciar la app después de configurarlas. El adaptador limita la llamada a 1,2 segundos y no sigue redirecciones; deberá ajustarse con pruebas del proveedor real si su latencia habitual lo exige. No pegar claves ni contraseñas en conversaciones.

Los enlaces se construyen exclusivamente con `AUTH_ORIGIN`; en producción requiere HTTPS. Un enlace a localhost solamente abre la copia local en la PC que tiene la app y su base, no la cuenta del VPS. Las bases continúan siendo independientes.

## Protecciones y límites iniciales

- Token aleatorio de 256 bits, almacenado únicamente como hash SHA-256; vencimiento de 15 minutos.
- Token en el fragmento del enlace, no en la URL que recibe el servidor. Pantalla con `Referrer-Policy: no-referrer`, sin caché y sin analítica externa.
- Verificación de origen, JSON limitado a 2 KiB y validación de contraseña en el servidor.
- Respuesta y demora mínima iguales para emails existentes/inexistentes/inactivos. El envío corre en segundo plano mediante `waitUntil`; no determina la duración de esa respuesta. Los fallos se registran con un código, etapa y tipo de error, sin email, cuerpo, contraseña ni token. Un fallo elimina ese enlace. La respuesta genérica no garantiza entrega: si no llega, consultar al administrador. No hay reintentos automáticos ni cola persistente; una interrupción del proceso puede impedir la entrega y se deberá solicitar un nuevo enlace.
- Límites persistentes y atómicos por circuito: 20 solicitudes en 15 minutos para toda la app y 3 por email (solicitud) o token (confirmación). No se confía en encabezados de IP enviados por el cliente. El límite global puede restringir solicitudes legítimas durante un abuso; revisar su dimensionamiento antes de producción.
- El cambio de cualquier dato del usuario invalida sus enlaces. Una solicitud nueva no invalida los anteriores; así terceros no pueden cancelar un enlace válido simplemente solicitando otro.
- Confirmación transaccional: exactamente un cambio incluso con solicitudes simultáneas. El cambio consume todos los enlaces de la cuenta y revoca las sesiones anteriores mediante los triggers existentes.
- Historial en **Usuarios y permisos**. La generación por consola se atribuye a “Consola local”, sin inventar un usuario autenticado. El cambio por enlace identifica la cuenta recuperada y su método; no demuestra quién era la persona física que controlaba el buzón.

Pendientes: monitorear entregabilidad y tiempos, revisar SPF/DKIM/DMARC, proteger los buzones con doble factor y actualizar la configuración privada cuando se migre el proveedor de correo. No se implementan registro público, MFA ni recuperación si se pierde también el correo. El restablecimiento manual por otro superadministrador sigue disponible.

Referencias técnicas: [TCP y TLS en el runtime](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/) y [tareas en segundo plano con waitUntil](https://developers.cloudflare.com/changelog/post/2025-08-08-add-waituntil-cloudflare-workers/).
