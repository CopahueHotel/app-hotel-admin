# Respaldos de Administración

Implementados el 13 de octubre de 2026. Protegen **Administración**, no todo el VPS: las bases de Pruebas y WordPress necesitan políticas propias. No sustituyen el respaldo previo a una migración o despliegue.

## Qué se copia

- Base SQLite de D1 y sus metadatos, mediante la API `backup` de SQLite mientras la app funciona. No se copian en crudo los archivos WAL activos.
- `.dev.vars`, incluida la configuración privada de autenticación y correo.
- Código, compilación, scripts, migraciones, `package.json`, lock de npm y revisión publicada. `node_modules` no se copia: al recuperar fuera del VPS se instala la versión exacta del lock.
- Configuración de Nginx, certificados y unidad de Administración.

Las copias están cifradas con Restic. El repositorio local es `/var/backups/hotel-admin-automatic/repository`; solo root puede acceder. La clave está en `/etc/hotel-backup/restic-password`. **Sin esa clave no se puede recuperar el respaldo.** Se descargó también a una carpeta privada de la PC, fuera de Git. Conviene conservarla además en un gestor de contraseñas independiente; no pegarla en conversaciones ni documentación.

## Horarios y retención

En el VPS: 03:00, 09:00, 15:00 y 21:00, zona Buenos Aires, con hasta cinco minutos de desfase. El timer recupera ejecuciones pendientes después de reiniciar. Conserva los últimos ocho puntos, puntos diarios de 14 días, ocho semanales y doce mensuales cuando existe ese historial; no implica que ya haya un año de copias. Solo depura el repositorio automático, nunca los respaldos manuales existentes.

En la PC: tarea **CopahueHotel-RespaldoExterno**, al iniciar sesión y diariamente a las 09:15, hora Argentina de esta PC. Requiere **PC encendida, sesión del usuario iniciada y conexión**. Si la PC permanece apagada, no hay copia externa nueva; el respaldo del VPS sigue funcionando. La pérdida máxima de datos depende del último punto disponible: hasta seis horas en el VPS y, para la copia externa, de cuándo se descargó realmente.

Destino en esta copia del proyecto: `backups/automatic/`, excluido de Git y con ACL restringida al usuario, Administradores y SYSTEM. Guarda siete paquetes completos cifrados; cada paquete contiene la historia retenida del repositorio. Contiene también `restic-recovery-key.txt`, `last-success.json` y, si hubo un fallo, `last-error.json`. **No compartir esa carpeta ni subirla al repositorio.** No borrar la clave para liberar espacio. Si se cambia la clave del repositorio, actualizar su copia privada externa antes de depender de los nuevos respaldos.

La descarga usa SSH con la clave existente y verificación estricta del servidor, prepara el paquete bajo el mismo bloqueo del respaldo y valida SHA-256 después de transferir. Una descarga parcial no reemplaza las completas. Si se mueve el proyecto o cambia la clave SSH, reinstalar la tarea con `deploy/backups/install-pc-task.ps1`.

## Comprobar que funciona

En el VPS, como root:

```bash
systemctl list-timers hotel-backup.timer hotel-backup-restore-test.timer
systemctl status hotel-backup.service --no-pager
cat /var/backups/hotel-admin-automatic/status.json
journalctl -u hotel-backup.service -n 30 --no-pager
```

`status.json` registra respaldo, revisión, restauración y último fallo. Los detalles de Restic quedan en `/var/backups/hotel-admin-automatic/restic-private.log`, privado. No publicar ese registro. No se configuraron alertas por correo: revisar estado y últimas fechas, especialmente si la PC estuvo desconectada.

En PowerShell:

```powershell
Get-ScheduledTaskInfo -TaskName CopahueHotel-RespaldoExterno
Get-Content backups/automatic/last-success.json
```

`LastTaskResult=0` indica éxito de la ejecución completada; comprobar además que la fecha de descarga sea reciente. El archivo de éxito conserva la última copia buena aunque una ejecución posterior falle.

## Restauración probada y verificación recurrente

Se ensayó la recuperación del repositorio cifrado en una carpeta temporal: se verifican todos los hashes de archivos, integridad y claves foráneas SQLite, número y hash de registros de cada tabla. Se arranca la compilación recuperada en `127.0.0.1:8791`, sin proxy público, con origen localhost y sin SMTP. Se comprueba login accesible y API anónima rechazada. No se alteran usuarios ni operaciones reales y no se reemplaza la base activa. El ensayo usa dependencias existentes solo si coincide su lock.

También se probó el paquete descargado a la PC, vuelto a transferir al VPS para un ensayo aislado. El timer **hotel-backup-restore-test** repite la restauración del repositorio local cada domingo a las 04:00, hora del hotel. La prueba semanal local no comprueba por sí sola que la PC haya descargado la copia: revisar su estado externo y repetir el ensayo desde un paquete externo después de cambios importantes.

## Recuperar ante una pérdida real

1. Conservar el último paquete de la PC y la clave privada de recuperación. Trabajar en una carpeta privada de otro equipo o servidor; nunca dentro de la base activa.
2. Extraer el paquete: contiene `repository/`, que sigue cifrado. Instalar Restic compatible y ejecutar `restic --repo RUTA/repository --password-file RUTA/clave snapshots`. Elegir un punto por fecha y ejecutar `restore ID --target RUTA/recuperada`.
3. Los archivos recuperados conservan la ruta `var/backups/hotel-admin-automatic/payload/`. Allí están `manifest.json`, `app/` y `system/`. Verificar integridad y la revisión; instalar dependencias con `npm ci` usando su lock. No reconstruir la base con datos de desarrollo ni aplicar migraciones de una versión diferente antes de comprobarla.
4. Antes de sustituir Administración, detener su servicio y respaldar lo que aún exista. Restaurar conjuntamente código y `.wrangler/state/v3/d1`, sin mezclar WAL o metadatos anteriores; recuperar `.dev.vars` con permisos 600 y propietario `hotel-admin`. Recuperar la configuración de servidor revisando rutas y dominios. El ensayo automatizado cambia únicamente su copia temporal de `.dev.vars`; el respaldo conserva el original.
5. Validar cuentas, reservas, consumos, cobros, pagos, existencias y saldos; comprobar HTTPS y API protegida antes de abrir el servicio. La sustitución de producción es una operación manual separada, nunca ejecutada por los timers.

Cuando haya otro almacenamiento disponible, migrar la copia externa a un destino siempre conectado. La PC resuelve la segunda ubicación actual, pero su disponibilidad no es la de un servicio remoto permanente.

Referencias: [repositorios y cifrado de Restic](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html), [retención](https://restic.readthedocs.io/en/stable/060_forget.html) y [restauración](https://restic.readthedocs.io/en/stable/050_restore.html).
