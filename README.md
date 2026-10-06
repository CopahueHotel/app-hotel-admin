# Hotel · Administración — proyecto local

Código completo de la primera versión de prueba: hotel de 17 habitaciones y restaurante, regímenes Desayuno/MP/PC, caja compartida y stock.

## Requisitos

Node.js 22.13 o superior (esta entrega se recomienda con Node.js 22 LTS), VS Code y Git. Internet para instalar las dependencias por primera vez.

La interfaz usa **React y TypeScript**, con Vinext/Vite y CSS. Necesita un servidor local: no se abre haciendo doble clic en un HTML. La base SQLite funciona localmente mediante D1/Miniflare; no hace falta contratar una base externa ni configurar contraseñas de base de datos.

## Primera ejecución en Windows

1. Descomprimí el ZIP, por ejemplo en `C:\Proyectos\hotel-admin-local`.
2. Abrí esa carpeta en VS Code (la que contiene `package.json`).
3. Abrí Terminal → Nueva terminal y ejecutá:

```powershell
npm.cmd ci
npm.cmd run db:local
npm.cmd run auth:setup
npm.cmd run dev
```

4. Abrí **http://localhost:5173**. Si el puerto está ocupado, usá la dirección indicada por la terminal.
5. Dejá la terminal abierta. `Ctrl+C` detiene el servidor.

`auth:setup` genera una contraseña aleatoria, la muestra una vez y guarda solamente su hash en `.dev.vars`, fuera de Git. Guardá la contraseña en tu gestor de contraseñas e ingresala en la pantalla de acceso. Si el servidor cambia de puerto, editá `AUTH_ORIGIN` en `.dev.vars` para que coincida con la dirección que usás en el navegador, y reiniciá el servidor. El comando no sobrescribe un `.dev.vars` existente.

`npm.cmd` evita el bloqueo de `npm.ps1` por PowerShell sin cambiar la política de ejecución. En macOS/Linux usá `npm` en lugar de `npm.cmd`.

La primera consulta crea los datos ficticios de ejemplo. **La base local es independiente de la versión online**: no descarga ni sincroniza sus registros.

## Próximas ejecuciones y cambios

```powershell
npm.cmd run dev
```

No hace falta reinstalar dependencias cada vez. Si se agregaron migraciones, ejecutá antes `npm.cmd run db:local`: aplica únicamente las pendientes.

Para verificar tipos y compilar:

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd test
npm.cmd run test:http
```

Para probar la compilación se puede usar `npm.cmd start`; la terminal muestra la dirección. El desarrollo habitual se hace con `npm.cmd run dev`.

`npm.cmd start` escucha en `127.0.0.1:8787` y carga el `.dev.vars` de la raíz. Para probarlo localmente, cambiá temporalmente `AUTH_ORIGIN` a `http://localhost:8787` y abrí esa dirección; devolvelo a `http://localhost:5173` al retomar desarrollo.

Las pruebas usan bases temporales D1/Miniflare y no modifican los registros locales. Las llamadas directas a `/api/hotel` requieren una cookie de sesión válida. Los POST también requieren `Origin` igual a `AUTH_ORIGIN` e `Idempotency-Key` con un UUID: reutilizá la misma clave y los mismos datos si reintentás una operación. Una operación nueva necesita una clave nueva; reutilizarla con datos diferentes devuelve 409. La interfaz lo gestiona durante la sesión de la página.

`test:http` requiere ejecutar `build` antes: comprueba el login y las protecciones HTTP/RSC de la app compilada, incluyendo la redirección HTTPS detrás de un proxy.

## Codex en VS Code

Con la extensión de Codex habilitada, abrí este proyecto y pedile tareas concretas. `AGENTS.md` contiene las reglas y `ALCANCE.md` explica qué está implementado y qué falta.

Ejemplo:

> Leé AGENTS.md y ALCANCE.md. Agregá edición de reservas con validación de superposición, conservando consumos, pagos e historial. Trabajá localmente y no publiques todavía.

## Subir a tu Git

El ZIP no incluye historial Git ni credenciales del alojamiento original.

```powershell
git init
git add .
git commit -m "Primera version de administracion del hotel"
git branch -M main
```

Creá un repositorio vacío en GitHub, preferentemente privado, sin README ni .gitignore. Conectalo con los comandos que GitHub muestra:

```powershell
git remote add origin URL_DE_TU_REPOSITORIO
git push -u origin main
```

Reemplazá `URL_DE_TU_REPOSITORIO` por la URL real. Si Git pide nombre/email en el primer commit, configurá tu identidad con `git config user.name` y `git config user.email`.

Los siguientes cambios se suben con `git add .`, `git commit -m "Descripcion del cambio"` y `git push`.

**Subir el código a GitHub no publica la app ni crea una base central.** Ese alojamiento se define después.

## Archivos principales

| Archivo/carpeta | Contenido |
|---|---|
| `app/page.tsx` | Pantallas y formularios |
| `app/globals.css` | Diseño visual |
| `app/api/hotel/route.ts` | API y validación del servidor |
| `lib/hotel-db.ts` | Acceso a la base |
| `db/schema.ts` | Tablas y relaciones |
| `drizzle/` | Migraciones y metadatos |
| `components/ui/` | Componentes de interfaz |
| `scripts/local-db.mjs` | Preparación de base local |
| `wrangler.local.json` | Configuración local |
| `.openai/hosting.json` | Bindings lógicos, sin identidad del Site original |
| `AGENTS.md` | Instrucciones para Codex |
| `ALCANCE.md` | Funciones y pendientes |

## Persistencia y respaldo local

Los registros se guardan en `.wrangler/state/`, fuera de Git. Cerrar VS Code no los elimina. Otra PC tendrá su propia base.

Para respaldarlos, detené el servidor y copiá esa carpeta fuera del repositorio. Para reiniciar con los ejemplos: detené el servidor, respaldá y eliminá `.wrangler/state/`, ejecutá `npm.cmd run db:local` y arrancá de nuevo. Eliminar esa carpeta borra todos los registros locales.

## Uso real y alojamiento futuro

La app incluye acceso de prueba con una contraseña compartida y sesión de ocho horas. Protege pantallas y API en el servidor, almacena sesiones con tokens hasheados y revoca la sesión al salir. Tiene un límite global persistente de 20 intentos de ingreso cada 15 minutos. Sin configuración válida o sin migraciones, no permite acceder a los registros. Todavía no tiene usuarios individuales ni permisos por rol.

Antes del uso real hay que completar usuarios/permisos en el servidor, apertura real, respaldos, regularizaciones y revisión funcional. El login compartido no identifica a cada operador: los cambios se atribuyen a “Acceso compartido de prueba”. La API del hotel no usa encabezados `oai-authenticated-user-*` como identidad ni autorización.

## Configurar acceso para testeo en un VPS

En el VPS, dentro de la copia del repositorio y con Node.js instalado:

```bash
npm ci
npm run db:local
npm run auth:setup -- https://test.TU-DOMINIO
npm run build
npm start
```

Reemplazá la URL por el dominio real, sin ruta ni barra final. El hash y el origen quedan en `.dev.vars`; no subas ese archivo ni copies la base de esta PC. El VPS tendrá su propia base de prueba. `npm start` usa Miniflare local, no una base remota de Cloudflare.

El servidor escucha solamente en `127.0.0.1:8787`. Configurá un proxy inverso con HTTPS para el dominio, que envíe las solicitudes a `http://127.0.0.1:8787` y conserve `Host`. No expongas Vite de desarrollo a Internet. El despliegue debe mantener el proceso activo y la carpeta `.wrangler/state/` entre reinicios y actualizaciones.

La instalación de prueba en InterServer está documentada en [deploy/VPS.md](deploy/VPS.md). Se accede por HTTPS a la IP, con login y una base independiente. Los cambios de GitHub no se publican automáticamente.

Para cambiar la contraseña, detené el servidor, respaldá y renombrá `.dev.vars` fuera del repositorio y ejecutá nuevamente `auth:setup` con el mismo origen. Conservá las otras variables si ya agregaste alguna. Reiniciá el servidor: las sesiones anteriores se invalidan automáticamente. HTTP solo se admite para pruebas en localhost; en un dominio público el acceso exige configurar HTTPS.

Se incluyen fuentes, componentes, migraciones, configuración y lockfile. Se excluyen dependencias instaladas (`node_modules`), base local, compilados, secretos e historial `.git`.
