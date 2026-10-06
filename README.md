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
npm.cmd run dev
```

4. Abrí **http://localhost:5173**. Si el puerto está ocupado, usá la dirección indicada por la terminal.
5. Dejá la terminal abierta. `Ctrl+C` detiene el servidor.

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
```

Para probar la compilación se puede usar `npm.cmd start`; la terminal muestra la dirección. El desarrollo habitual se hace con `npm.cmd run dev`.

Las pruebas usan bases temporales D1/Miniflare y no modifican los registros locales. Las llamadas directas a `POST /api/hotel` deben incluir `Idempotency-Key` con un UUID: reutilizá la misma clave y los mismos datos si reintentás una operación. Una operación nueva necesita una clave nueva; reutilizarla con datos diferentes devuelve 409. La interfaz lo gestiona durante la sesión de la página.

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

La entrega no incluye autenticación propia ni permisos por rol. La privacidad del enlace online original depende de su plataforma y no se traslada a un alojamiento independiente.

Antes del uso real hay que completar usuarios/permisos en el servidor, apertura real, respaldos, regularizaciones y revisión funcional. Los encabezados `oai-authenticated-user-*` solo son confiables detrás de la plataforma original; no son autenticación válida en otro alojamiento.

Se incluyen fuentes, componentes, migraciones, configuración y lockfile. Se excluyen dependencias instaladas (`node_modules`), base local, compilados, secretos e historial `.git`.
