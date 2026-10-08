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

Se preparó un adaptador HTTP sin proveedor contratado. No es un cliente SMTP directo. Cuando se elija el servicio, configurar su endpoint compatible o adaptar `modules/access/recovery-mail.ts` a su API/SMTP y verificar entregas reales antes de habilitarlo.

Las siguientes variables se guardan en `.dev.vars` (local) o en las variables privadas del servidor, nunca en Git:

```text
MAIL_API_URL=https://endpoint-del-proveedor-o-pasarela
MAIL_API_KEY=credencial-privada
MAIL_FROM=remitente-verificado@dominio-del-hotel
```

Contrato preparado: POST HTTPS, autorización Bearer y JSON `{ "from": "...", "to": ["email-registrado"], "subject": "...", "text": "..." }`; respuesta HTTP 2xx indica aceptación. El proveedor debe aceptar ese contrato y verificar el remitente/dominio. No hay envíos hasta configurar las tres variables. Reiniciar la app después de configurarlas. El adaptador limita la llamada a 1,2 segundos y no sigue redirecciones; deberá ajustarse con pruebas del proveedor real si su latencia habitual lo exige. No pegar claves ni contraseñas en conversaciones.

Los enlaces se construyen exclusivamente con `AUTH_ORIGIN`; en producción requiere HTTPS. Un enlace a localhost solamente abre la copia local en la PC que tiene la app y su base, no la cuenta del VPS. Las bases continúan siendo independientes.

## Protecciones y límites iniciales

- Token aleatorio de 256 bits, almacenado únicamente como hash SHA-256; vencimiento de 15 minutos.
- Token en el fragmento del enlace, no en la URL que recibe el servidor. Pantalla con `Referrer-Policy: no-referrer`, sin caché y sin analítica externa.
- Verificación de origen, JSON limitado a 2 KiB y validación de contraseña en el servidor.
- Respuesta y demora mínima iguales para emails existentes/inexistentes/inactivos. Los fallos de envío no revelan la existencia de una cuenta; se registran con un código operativo sin email, cuerpo ni token. Un fallo elimina ese enlace. La respuesta genérica no garantiza entrega: si no llega, consultar al administrador.
- Límites persistentes y atómicos por circuito: 20 solicitudes en 15 minutos para toda la app y 3 por email (solicitud) o token (confirmación). No se confía en encabezados de IP enviados por el cliente. El límite global puede restringir solicitudes legítimas durante un abuso; revisar su dimensionamiento antes de producción.
- El cambio de cualquier dato del usuario invalida sus enlaces. Una solicitud nueva no invalida los anteriores; así terceros no pueden cancelar un enlace válido simplemente solicitando otro.
- Confirmación transaccional: exactamente un cambio incluso con solicitudes simultáneas. El cambio consume todos los enlaces de la cuenta y revoca las sesiones anteriores mediante los triggers existentes.
- Historial en **Usuarios y permisos**. La generación por consola se atribuye a “Consola local”, sin inventar un usuario autenticado. El cambio por enlace identifica la cuenta recuperada y su método; no demuestra quién era la persona física que controlaba el buzón.

Pendientes: configurar servicio/remitente, verificar entregabilidad y tiempos, proteger los buzones con doble factor y ensayar el flujo completo en HTTPS cuando se autorice el despliegue. No se implementan registro público, MFA ni recuperación si se pierde también el correo. El restablecimiento manual por otro superadministrador sigue disponible.
