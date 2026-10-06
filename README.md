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
npm.cmd run lint
npm.cmd run build
npm.cmd test
npm.cmd run test:http
```

Para probar la compilación se puede usar `npm.cmd start`; la terminal muestra la dirección. El desarrollo habitual se hace con `npm.cmd run dev`.

`npm.cmd start` escucha en `127.0.0.1:8787` y carga el `.dev.vars` de la raíz. Para probarlo localmente, cambiá temporalmente `AUTH_ORIGIN` a `http://localhost:8787` y abrí esa dirección; devolvelo a `http://localhost:5173` al retomar desarrollo.

Las pruebas usan bases temporales D1/Miniflare y no modifican los registros locales. Las llamadas directas a `/api/hotel` requieren una cookie de sesión válida. Los POST también requieren `Origin` igual a `AUTH_ORIGIN` e `Idempotency-Key` con un UUID: reutilizá la misma clave y los mismos datos si reintentás una operación. Una operación nueva necesita una clave nueva; reutilizarla con datos diferentes devuelve 409. La interfaz lo gestiona durante la sesión de la página.

Los consumos nuevos pagados al momento quedan en la ficha del huésped, identificados como pagados, sin sumarse al saldo pendiente. Antes de usar esta versión, ejecutá `npm.cmd run db:local` para aplicar la migración `0004_guest_paid_sales`, que mantiene ese criterio en el límite de cobros de SQLite. La migración no modifica saldos ni reconstruye atribuciones de consumos históricos.

Los importes muestran centavos. Las exportaciones respetan los filtros de Caja, Reservas y Stock y el período de Informes; el CSV usa separador `;` y coma decimal para Excel en español.

`test:http` requiere ejecutar `build` antes: comprueba el login y las protecciones HTTP/RSC de la app compilada, incluyendo la redirección HTTPS detrás de un proxy.

## Tarifas, disponibilidad y condiciones de reservas · etapa 1

Aplicá `npm.cmd run db:local` antes de abrir esta versión. Se agrega la migración `0005_reservation_stage_one`; conserva los importes acordados y los cobros existentes, identificando el precio anterior como histórico, sin inventar tarifas ni reconstruir precios nocturnos.

En **Configuración → Tarifas de alojamiento**, cargá las seis combinaciones de Single/Doble y Desayuno/MP/PC que correspondan. La unidad es **ARS por habitación y noche**. Las fechas desde/hasta de una tarifa son inclusivas; no se permiten vigencias superpuestas para la misma combinación. Una tarifa de cero sólo debe cargarse si ése es el precio decidido: no se crean tarifas de ejemplo.

Desde **Reservas o Calendario → Consultar tarifas** podés consultar la fecha elegida. La carga de reservas también muestra ese cuadro y el detalle de cada noche, con llegada incluida y salida excluida. El servidor vuelve a validar la cotización; si los precios cambiaron, hay que actualizar los registros y revisar antes de guardar. Las tarifas guardadas dentro de una reserva no cambian al editar el tarifario.

Si falta una tarifa, elegí **Precio acordado**, ingresá el alojamiento antes del descuento y completá motivo y responsable declarado. La condición de pago es un texto independiente; registrar "pago al egreso" o "pago anticipado" no carga dinero. Los cobros reales se registran desde la ficha, con su fecha, importe y cuenta.

Los descuentos pueden ser por importe o porcentaje (hasta dos decimales), sin superar la base. **Amigo** no genera descuento automático. **Cortesía** deja el alojamiento en cero con motivo/responsable. **Canje** exige describir el acuerdo; si hay una parte monetaria, indicá su importe mediante el precio acordado y/o descuento explícito. El canje no cancela el saldo de dinero por sí solo y queda pendiente hasta registrar su cumplimiento desde la ficha. Finalizar la estadía no marca el canje como cumplido. Cada cambio de cumplimiento conserva responsable y observación en el historial.

En la ficha, **Editar reserva y condiciones** permite modificar reservas confirmadas o alojadas. **Conservar precio y detalle guardados** mantiene base, descuento y tarifas anteriores; para cambiar descuento, fechas, habitación o régimen, elegí tarifas o un nuevo precio acordado. Si el cambio falla, no se altera la reserva anterior. No se pueden dejar consumos fuera de las nuevas fechas ni reducir el alojamiento por debajo de lo ya cobrado. Los cambios de régimen/personas con comidas ya servidas requieren revisión; no se regularizan automáticamente.

En **Calendario → Bloquear noches por mantenimiento**, indicá habitación, desde incluido/hasta excluido, motivo y responsable. El bloqueo impide nuevas asignaciones; no desplaza reservas existentes. Liberarlo conserva su registro y el motivo en el historial. El estado global "Fuera de servicio" también impide reservar. Las confirmadas y alojadas bloquean noches; una salida permite otra llegada ese mismo día. La cancelación conserva la reserva y libera las noches sólo si no tiene pagos ni consumos. No se agregaron provisionales ni vencimientos automáticos.

El responsable se declara porque el login actual es compartido; no es una identidad individual verificada. La revisión visual interactiva y las regularizaciones/devoluciones completas quedan pendientes. Esta etapa no agrega funciones de comidas, stock, personal ni integraciones.

## Alimentación, asistencia y salidas · etapa 2

Aplicá `npm.cmd run db:local` para la migración `0006_meal_stage_two`. Agrega personas dentro de cada reserva, sin asignarles nombres ni restricciones por suposición y sin modificar reservas, consumos ni pagos históricos.

En la **ficha → Alimentación**, completá el nombre, restricciones, preferencias y observaciones de cada persona. Son textos independientes; la app no decide qué alimentos son aptos. El régimen contratado se conserva. En MP, la elección inicial sigue siendo cena y **Cambiar MP del día** modifica sólo la fecha elegida, sin tocar régimen ni precio. No se permite cambiar una elección que contradiga comidas ya servidas o duplique una previsión adicional.

En **Restaurante**, elegí fecha y desayuno/almuerzo/cena. El listado muestra una fila por huésped, condiciones individuales, suspensiones y servicio pendiente/realizado; los totales separan huéspedes, externos y total general. Incluyen las personas previstas que ya fueron servidas. **Suspender comidas** permite seleccionar todas las personas o algunas, con intervalo desde/hasta inclusivo, motivo, observación y responsable. **Reactivar** conserva el historial. No altera importes ni devuelve dinero.

**Registrar servicio** confirma una comida incluida de una persona: guarda el consumo incluido sin importe y evita duplicaciones, incluso ante solicitudes simultáneas. No se sirve automáticamente por aparecer en la previsión. Los registros históricos sin atribución individual quedan visibles como tales y requieren revisión antes de registrar otro servicio de esa fecha; no se inventa quién comió.

**Agregar previsión** registra clientes externos explícitos o un servicio adicional de un huésped, con fecha, servicio, cantidad y observaciones. Los externos no se deducen de ventas. **Actualizar** registra asistencia servida o cancela una previsión pendiente; los cargos y cobros de adicionales se registran por separado con las funciones existentes. Una comida incluida no puede duplicarse como adicional. Los servicios adicionales suspendidos tampoco pueden marcarse servidos.

Se conserva la regla actual **[llegada, salida)** para las comidas incluidas. En la fecha de salida, los servicios se muestran **sin confirmar**, con cero personas previstas, hasta registrar una previsión adicional explícita. La definición comercial de comidas incluidas de llegada/salida sigue pendiente con el gerente. La elección diaria de MP y los servicios respetan también las fechas cerradas.

**Exportar listado CSV** descarga el servicio de la fecha con restricciones, preferencias, observaciones, suspensión y estado para cocina. La ficha conserva el historial con fecha, responsable declarado y detalle; el acceso sigue siendo compartido, sin roles individuales.

El **Resumen diario → Próximas salidas** y las fichas muestran noches restantes, salida hoy/mañana o salida pendiente de registrar. Usan la fecha de consulta y la zona del hotel **America/Argentina/Buenos_Aires**, excluyen canceladas y no cierran estadías ni envían mensajes. Las finalizadas muestran su estado.

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
