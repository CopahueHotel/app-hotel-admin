# Hotel · Administración — proyecto local

Aplicación de administración del hotel de 17 habitaciones y restaurante, regímenes Desayuno/MP/PC, caja compartida y stock.

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
npm.cmd run auth:bootstrap -- "Nombre completo" email@dominio.com
npm.cmd run dev
```

4. Abrí **http://localhost:5173**. Si el puerto está ocupado, usá la dirección indicada por la terminal.
5. Dejá la terminal abierta. `Ctrl+C` detiene el servidor.

`auth:setup` configura solamente `AUTH_ORIGIN` en `.dev.vars`, fuera de Git. `auth:bootstrap` crea el primer superadministrador en la base local y muestra una contraseña aleatoria una sola vez. Guardala en tu gestor de contraseñas e ingresá con email y contraseña. Si el servidor cambia de puerto, editá `AUTH_ORIGIN` para que coincida con la dirección que usás en el navegador y reiniciá el servidor. `auth:setup` no sobrescribe un `.dev.vars` existente.

`npm.cmd` evita el bloqueo de `npm.ps1` por PowerShell sin cambiar la política de ejecución. En macOS/Linux usá `npm` en lugar de `npm.cmd`.

La primera consulta prepara las habitaciones y la configuración básica, sin reservas, productos, stock ni dinero ficticios. Los ejemplos se generan únicamente con `APP_ENV=test`, para una base independiente de Pruebas. **La base local es independiente de la versión online**: no descarga ni sincroniza sus registros.

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

En **Tarifas**, cargá las seis combinaciones de Single/Doble y Desayuno/MP/PC que correspondan. La unidad es **ARS por habitación y noche**. Las fechas desde/hasta de una tarifa son inclusivas; no se permiten vigencias superpuestas para la misma combinación. Una tarifa de cero sólo debe cargarse si ése es el precio decidido: no se crean tarifas de ejemplo.

Desde **Reservas o Calendario → Consultar tarifas** podés consultar la fecha elegida. La carga de reservas también muestra ese cuadro y el detalle de cada noche, con llegada incluida y salida excluida. El servidor vuelve a validar la cotización; si los precios cambiaron, hay que actualizar los registros y revisar antes de guardar. Las tarifas guardadas dentro de una reserva no cambian al editar el tarifario.

Si falta una tarifa, elegí **Precio acordado**, ingresá el alojamiento antes del descuento y completá motivo y responsable declarado. La condición de pago es un texto independiente; registrar "pago al egreso" o "pago anticipado" no carga dinero. Los cobros reales se registran desde la ficha, con su fecha, importe y cuenta.

Los descuentos pueden ser por importe o porcentaje (hasta dos decimales), sin superar la base. **Amigo** no genera descuento automático. **Cortesía** deja el alojamiento en cero con motivo/responsable. **Canje** exige describir el acuerdo; si hay una parte monetaria, indicá su importe mediante el precio acordado y/o descuento explícito. El canje no cancela el saldo de dinero por sí solo y queda pendiente hasta registrar su cumplimiento desde la ficha. Finalizar la estadía no marca el canje como cumplido. Cada cambio de cumplimiento conserva responsable y observación en el historial.

En la ficha, **Editar reserva y condiciones** permite modificar reservas confirmadas o alojadas. **Conservar precio y detalle guardados** mantiene base, descuento y tarifas anteriores; para cambiar descuento, fechas, habitación o régimen, elegí tarifas o un nuevo precio acordado. Si el cambio falla, no se altera la reserva anterior. No se pueden dejar consumos fuera de las nuevas fechas ni reducir el alojamiento por debajo de lo ya cobrado. Los cambios de régimen/personas con comidas ya servidas requieren revisión; no se regularizan automáticamente.

En **Calendario → Bloquear noches por mantenimiento**, indicá habitación, desde incluido/hasta excluido, motivo y responsable. El bloqueo impide nuevas asignaciones; no desplaza reservas existentes. Liberarlo conserva su registro y el motivo en el historial. El estado global "Fuera de servicio" también impide reservar. Las confirmadas y alojadas bloquean noches; una salida permite otra llegada ese mismo día. La cancelación conserva la reserva y libera las noches sólo si no tiene pagos ni consumos. No se agregaron provisionales ni vencimientos automáticos.

Los responsables declarados antes de HOT-15 se conservan como históricos; los cambios nuevos usan la identidad autenticada. La revisión visual interactiva y las regularizaciones/devoluciones completas quedan pendientes. Esta etapa no agrega funciones de comidas, stock, personal ni integraciones.

## Alimentación, asistencia y salidas · etapa 2

Aplicá `npm.cmd run db:local` para la migración `0006_meal_stage_two`. Agrega personas dentro de cada reserva, sin asignarles nombres ni restricciones por suposición y sin modificar reservas, consumos ni pagos históricos.

En la **ficha → Alimentación**, completá el nombre, restricciones, preferencias y observaciones de cada persona. Son textos independientes; la app no decide qué alimentos son aptos. El régimen contratado se conserva. En MP, la elección inicial sigue siendo cena y **Cambiar MP del día** modifica sólo la fecha elegida, sin tocar régimen ni precio. No se permite cambiar una elección que contradiga comidas ya servidas o duplique una previsión adicional.

En **Restaurante**, elegí fecha y desayuno/almuerzo/cena. El listado muestra una fila por huésped, condiciones individuales, suspensiones y servicio pendiente/realizado; los totales separan huéspedes, externos y total general. Incluyen las personas previstas que ya fueron servidas. **Suspender comidas** permite seleccionar todas las personas o algunas, con intervalo desde/hasta inclusivo, motivo, observación y responsable. **Reactivar** conserva el historial. No altera importes ni devuelve dinero.

**Registrar servicio** confirma una comida incluida de una persona: guarda el consumo incluido sin importe y evita duplicaciones, incluso ante solicitudes simultáneas. No se sirve automáticamente por aparecer en la previsión. Los registros históricos sin atribución individual quedan visibles como tales y requieren revisión antes de registrar otro servicio de esa fecha; no se inventa quién comió.

**Agregar previsión** registra clientes externos explícitos o un servicio adicional de un huésped, con fecha, servicio, cantidad y observaciones. Los externos no se deducen de ventas. **Actualizar** registra asistencia servida o cancela una previsión pendiente; los cargos y cobros de adicionales se registran por separado con las funciones existentes. Una comida incluida no puede duplicarse como adicional. Los servicios adicionales suspendidos tampoco pueden marcarse servidos.

Se conserva la regla actual **[llegada, salida)** para las comidas incluidas. En la fecha de salida, los servicios se muestran **sin confirmar**, con cero personas previstas, hasta registrar una previsión adicional explícita. La definición comercial de comidas incluidas de llegada/salida sigue pendiente con el gerente. La elección diaria de MP y los servicios respetan también las fechas cerradas.

**Exportar listado CSV** descarga el servicio de la fecha con restricciones, preferencias, observaciones, suspensión y estado para cocina, cuando el rol permite exportar. La ficha conserva el historial con fecha y detalle; los cambios nuevos identifican al usuario autenticado.

El **Resumen diario → Próximas salidas** y las fichas muestran noches restantes, salida hoy/mañana o salida pendiente de registrar. Usan la fecha de consulta y la zona del hotel **America/Argentina/Buenos_Aires**, excluyen canceladas y no cierran estadías ni envían mensajes. Las finalizadas muestran su estado.

## Bebidas, compras y vencimientos · etapa 3

Aplicá `npm.cmd run db:local` para `0007_serious_peter_parker`. Agrega registros vinculados sin modificar reservas, consumos, stock ni pagos existentes. Las compras históricas mantienen su ingreso inmediato de stock; no se convierten a compras pendientes. Los consumos anteriores no reciben un destino ni una hora inventados.

En **Restaurante → Bebidas y cuentas de mesa**, abrí una cuenta por cada nueva ocupación de una mesa. Su identificador distingue cuentas aunque se reutilice el mismo número. **Despachar bebida** registra fecha/hora de Buenos Aires, producto/cantidad, destino físico, precio y responsable declarado. Una entrega a mesa puede quedar pendiente, cobrarse inmediatamente o cargarse a una estadía activa. **Cobrar / transferir** cierra la cuenta completa: cobra los consumos pendientes en la cuenta elegida o crea sus cargos vinculados a la estadía, sin otra salida de stock. Las cortesías e internos exigen motivo y no generan dinero.

**Devolución física** registra sólo las unidades que efectivamente vuelven en condiciones de venta, incluso en una fecha posterior al cierre del día original. Nunca anula dinero ni cargos. **Corregir** compensa íntegramente el importe de un despacho erróneo pendiente mediante un consumo negativo vinculado, conservando el original; no devuelve stock. Si también regresó el producto, registrá la devolución física por separado. No se permite corregir despachos cobrados, transferidos, de estadías con cobros o de días cerrados: la devolución monetaria y regularización de esos casos siguen pendientes. Una corrección parcial de precio requiere revisión; por ahora se corrige el despacho completo y se registra uno nuevo, verificando por separado el movimiento físico.

En **Compras y gastos → Nuevo comprobante**, indicá proveedor, número opcional, concepto, fecha, vencimiento acordado opcional, actividad y Fijo/Variable. **Productos** admite varias líneas con cantidades, costos por unidad y rubros; el total se calcula por línea en centavos y genera una sola deuda. Si ya llegó todo, marcá **Recibido en su totalidad**; si no, usá **Recibir** para las cantidades que efectivamente llegaron. **Servicio** y **Administrativo** registran un importe y nunca ingresan stock. Los productos históricos de “Limpieza y amenities” admiten elegir Limpieza o Amenities en la línea sin cambiar su categoría anterior.

**Pagar** permite pagos parciales con fecha, Efectivo/Banco/Billetera, referencia y responsable. No recibe productos. Total, pagos, saldo y pendiente/parcial/pagado se derivan de los movimientos; no hay casilla de deuda pagada. La lista se ordena por vencimiento, muestra los no definidos al final y distingue vencido, hoy y próximo en los siguientes siete días según la fecha de consulta. Los pagos y recepciones del listado se calculan hasta esa fecha; los formularios validan el saldo y lo pendiente actuales. Los filtros y **Exportar proveedores CSV** comparten el mismo detalle visible y usan el formato de Excel en español.

Cada operación conserva fecha, responsable y detalle en el historial, y guarda juntos sus movimientos con protección de reintentos. HOT-15 reemplaza el login compartido por cuentas individuales y permisos por módulo. Esta etapa no agrega pagos automáticos, reaperturas, devoluciones de dinero, adjuntos de comprobantes ni valoración/utilidad de stock.

## Proveedores, menú y personal · etapa 4

Aplicá `npm.cmd run db:local` para la migración `0008_brief_sumo`. Agrega las siete tablas de planificación sin modificar los registros de las etapas anteriores. No crea proveedores, platos ni empleados de ejemplo.

En **Agenda de proveedores**, cargá nombre, contacto, rubros y frecuencia habitual. Una frecuencia puede ser semanal, cada N días desde una fecha de referencia explícita o fechas puntuales. El límite para hacer pedidos se calcula sólo si indicás cuántos días antes se pide; también podés registrar un límite puntual conocido aunque la entrega todavía esté A confirmar. **Generar agenda** crea eventos **Prevista**, nunca confirmados automáticamente. Regenerar no duplica fechas ya registradas, ni repone las fechas originales de entregas reprogramadas. Cambiar la frecuencia no elimina ni modifica entregas anteriores: revisá y cancelá expresamente las que ya no correspondan.

**Entrega puntual** admite fecha desconocida, mostrada como **A confirmar**. **Modificar esta entrega** permite confirmar, reprogramar con explicación, marcar realizada o cancelar. Cambiar una fecha ya conocida requiere Reprogramada. Las realizadas y canceladas quedan conservadas para consulta. El calendario y los filtros muestran las fechas y estados; el CSV conserva contacto, fecha original, límite de pedido y observaciones. Si vinculás una compra, **Ver compra / recepción** abre el circuito existente de Compras y gastos. Marcar una visita realizada no recibe mercadería ni genera pagos.

En **Menú mensual**, la fecha superior selecciona el mes y cada día abre el detalle. Elegí desayuno, almuerzo o cena y cargá platos, alternativas expresas, condiciones, observaciones y estado Borrador/Confirmado. El detalle muestra los comensales y restricciones mediante la misma previsión de Restaurante, con cambios de MP y suspensiones. Restaurante muestra también el menú previsto y el servido. La app no determina si un plato es apto por su nombre.

**Copiar día / semana** admite períodos de origen y destino separados. Copia sólo los servicios cargados, sin inventar los faltantes; las copias quedan Borrador. Muestra cuántos destinos existen y exige marcar la confirmación para reemplazarlos. Si cambian los registros durante la copia, se revierte toda la operación y hay que actualizar. **Registrar menú servido** guarda platos y condiciones reales con el motivo, sin marcar asistentes ni descontar stock. Conserva una copia del menú previsto al registrar el servicio, incluso si después se edita el plan. El CSV mensual incluye previsión, restricciones y menú servido.

En **Personal**, cargá las fichas y usá **Programar turno / ausencia**. Los turnos tienen fechas y horas del hotel: para un nocturno, indicá el día siguiente como fecha de fin. Un turno admite hasta 24 horas. Francos/vacaciones/otras ausencias se cargan con último día incluido; el registro interno conserva el fin excluido. Hay vista del equipo o por empleado, calendario mensual y filtros por período. Se advierten superposiciones y asignaciones durante ausencias en la pantalla y el servidor; sólo se registran excepciones si se confirman y explican expresamente. Se permiten intervalos consecutivos.

**Registrar asistencia** requiere indicar asistencia o ausencia y, si asistió, inicio/fin reales en horario de Buenos Aires. No copia automáticamente el turno previsto. Una planificación con asistencia registrada conserva sus fechas; las correcciones de asistencia quedan trazadas. **Nueva novedad** permite tarea/novedad/incidencia/seguimiento, fecha, descripción y turno opcional del mismo empleado. Resolver exige seguimiento; el autor original se conserva y cada edición registra al responsable declarado. Desactivar un empleado conserva sus turnos y reportes, impide nuevas asignaciones y permite resolver reportes anteriores. Hay exportaciones separadas de turnos y novedades con los filtros visibles.

Las notas internas se consultan únicamente desde Personal y su endpoint autenticado `/api/hotel/personnel`; no se incluyen en la respuesta operativa general ni su historial visible en cocina/recepción. HOT-15 a HOT-18 agrega cuentas individuales y exige permisos separados para consultar Personal y sus novedades internas. La revisión interactiva con el gerente continúa pendiente. No se incorporaron recetas, costos, pedidos automáticos, liquidación de sueldos, horas extra automáticas ni evaluaciones.

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

## Usuarios, permisos y organización modular · HOT-15 a HOT-19

La recuperación local y el circuito preparado para correo se explican en [Recuperación de acceso](docs/recuperacion-acceso.md). Incluye un comando privado para recuperar una cuenta local sin correo; el envío público queda deshabilitado hasta configurar el proveedor.

La migración `0009_rapid_fallen_one` agrega cuentas individuales, roles, controles de acceso y referencias de usuario en sesiones, operaciones e historial. Conserva los registros anteriores: los responsables históricos no se reconstruyen. Las sesiones del acceso compartido anterior dejan de ser válidas; `AUTH_PASSWORD_HASH` ya no habilita ningún ingreso. Se mantiene el origen HTTPS y las cookies de sesión HttpOnly, SameSite y Secure cuando corresponde, con duración de ocho horas y revocación al salir. Las contraseñas individuales usan PBKDF2-HMAC-SHA256 con sal aleatoria y 600.000 iteraciones; nunca se devuelven hashes al navegador ni se guardan contraseñas en el historial. Se conserva el límite global de 20 intentos cada 15 minutos. Referencia técnica: [almacenamiento de contraseñas OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

**Primer superadministrador en una copia existente:** detené el servidor, respaldá `.wrangler/state/` y `.dev.vars`, conservá el `AUTH_ORIGIN` actual y ejecutá desde la raíz:

```powershell
npm.cmd run db:local
npm.cmd run auth:bootstrap -- "Nombre completo" email@dominio.com
npm.cmd run dev
```

En una instalación nueva ejecutá también `npm.cmd run auth:setup` antes de crear el usuario. En Linux usá `npm` en lugar de `npm.cmd`. El procedimiento trabaja exclusivamente sobre una única base local migrada; el servidor debe estar detenido para evitar escrituras concurrentes externas. Rechaza volver a crear el primer usuario si ya existen cuentas. No hay formulario ni endpoint público de registro o elevación de privilegios. Guardá la contraseña mostrada en un gestor; no la copies a Git, archivos de configuración ni conversaciones. La cuenta queda registrada como creada mediante consola por su titular. Esta etapa no crea ninguna cuenta automáticamente en tu base ni en el VPS.

**Alta y acceso:** ingresá con la primera cuenta y abrí **Usuarios y permisos → Crear usuario**. Indicá nombre, email, estado, uno o varios roles y una contraseña de al menos 12 caracteres. Cada persona tiene su propia cuenta; los roles no crean cuentas compartidas por sector. Entregá el acceso por un medio privado. **Modificar** cambia datos, estado y roles; desactivar conserva todo el historial y revoca el acceso. **Restablecer acceso** define una nueva contraseña y revoca las sesiones anteriores, incluyendo la propia si se restablece esa cuenta.

**Matriz:** en la misma pantalla, **Permisos por rol → Modificar matriz** permite habilitar consulta, creación, modificación, regularización existente, exportación y funciones específicas. Los permisos de varios roles se suman; no hay excepciones individuales. Consultar no permite modificar. Para usar una pantalla hay que habilitar su consulta y luego las acciones que correspondan. Cobros por estadía, pagos de compras, cargos de restaurante, precios, descuentos, acuerdos especiales, mermas, conteos, cierres y novedades de personal tienen permisos independientes. Una copia de menú que reemplaza destinos requiere además modificar; una excepción de superposición en Personal requiere autorización especial.

Roles iniciales:

| Rol | Permisos iniciales |
| --- | --- |
| Superadministrador | Todos, incluyendo usuarios, permisos y configuración. Su conjunto está protegido. |
| Administración | Caja, cobros, compras, pagos, proveedores, vencimientos e informes; consulta de reservas y consumos. Puede cobrar mesas existentes; no crea reservas ni despacha bebidas por ese rol. |
| Gerente | Funciones operativas de reservas, restaurante, stock, compras, proveedores y personal; consulta financiera y cierre diario. Incluye cobros por estadía, pagos de proveedores y autorizaciones operativas; no administra usuarios/permisos ni configuración global, transferencias o aportes/retiros. |
| Recepción | Reservas, huéspedes, entradas/salidas, alimentación, habitaciones, consulta de tarifas y saldos por estadía. Cobros, precios acordados, descuentos y acuerdos especiales requieren habilitación. |
| Restaurante | Comensales, condiciones alimentarias, cuentas de mesa, consumos pendientes y despacho al precio del catálogo. Cobros, cargos, cambios de precio y cortesías requieren habilitación. |
| Stock / Abastecimiento | Existencias, productos, entregas, mermas/conteos, recepción de compras y agenda de proveedores. No recibe importes de compras ni puede pagar a proveedores. |
| Cocina | Menú, previsión, restricciones, suspensiones, servicios realizados y consulta de insumos. No recibe importes, condiciones económicas, cuentas generales ni notas de personal. |
| Socio / Consulta | Consulta de paneles e informes autorizados y módulos operativos; no registra cambios ni exporta inicialmente. Personal y sus novedades se habilitan por separado. |

Los controles se aplican en el servidor para cada acción y lectura, incluyendo llamadas directas. Cocina recibe únicamente los datos operativos necesarios; recepción puede consultar pagos/saldos de estadías sin recibir aperturas de caja, saldos generales o pagos a proveedores. Restaurante puede cargar a una estadía con el permiso específico sin recibir caja ni acuerdos económicos de reservas. Stock recibe información de cantidades y recepciones sin precios, pagos o deudas. Personal requiere consulta propia y sus reportes internos un permiso adicional. Las tablas vacías en la respuesta operativa representan información no habilitada o inexistente; las dependencias entre módulos entregan solamente los campos necesarios, como huésped, habitación y régimen para cocina.

La sesión se verifica contra el usuario activo y los permisos vigentes en cada solicitud, sin confiar en encabezados o nombres enviados por formularios. Los cambios de roles/permisos quedan registrados con fecha, usuario y antes/después. También se valida una revisión de acceso dentro del batch transaccional: un cambio concurrente de acceso revierte la operación o impide entregar los datos. No se permite desactivar ni quitar el rol al último superadministrador activo. La interfaz actualiza su acceso al recuperar foco y cada 30 segundos; los controles del servidor son inmediatos. Los datos ya vistos o descargados no se pueden retirar del equipo del usuario.

**Código:** `modules/` agrupa pantallas, formularios, validaciones y operaciones de reservas, habitaciones, tarifas, comidas, restaurante/bebidas, stock, compras, proveedores, menú, caja, personal, informes y acceso. `app/page.tsx` conserva la coordinación del espacio de trabajo; las rutas delegan las reglas en funciones de módulo. Los archivos anteriores de `lib/hotel-*` y `components/hotel-*` conservan exportaciones compatibles. Autenticación, tipos, persistencia, formatos, componentes visuales, fechas y el contexto transaccional se comparten. Una operación de bebida/compra/reserva sigue reuniendo todos sus movimientos e historial en un solo batch; separar archivos no separa la transacción.

Pendientes dentro de la operación futura: revisión interactiva con el gerente de la matriz inicial y pantallas, configuración y prueba de entrega real del correo de recuperación, recuperación extraordinaria en producción por un administrador del servidor, MFA y expiración obligatoria de contraseñas temporales. No se agregan reaperturas de cierres, aprobaciones por etapas, roles de facturación ni circuitos financieros nuevos para completar la matriz. Si se agregan operaciones nuevas deben registrarse expresamente en el catálogo y validar sus datos de salida; la ausencia de permiso se deniega.

## Persistencia y respaldo local

Los registros se guardan en `.wrangler/state/`, fuera de Git. Cerrar VS Code no los elimina. Otra PC tendrá su propia base.

Para respaldarlos, detené el servidor y copiá esa carpeta fuera del repositorio. Para reiniciar con los ejemplos: detené el servidor, respaldá y eliminá `.wrangler/state/`, ejecutá `npm.cmd run db:local` y arrancá de nuevo. Eliminar esa carpeta borra todos los registros locales.

## Uso real y alojamiento futuro

La app incluye cuentas individuales con roles y permisos verificadas en el servidor, sesiones de ocho horas con tokens hasheados y revocación al salir. Tiene un límite global persistente de 20 intentos de ingreso cada 15 minutos. Sin configuración válida, usuario activo o migraciones, no permite acceder a los registros.

Antes del uso real hay que validar la matriz con el gerente y completar apertura real, respaldos, regularizaciones y revisión funcional. Los históricos del login compartido mantienen su atribución anterior; los cambios nuevos registran al usuario autenticado. La API del hotel no usa encabezados `oai-authenticated-user-*` como identidad ni autorización.

## Configurar acceso para testeo en un VPS

En el VPS, dentro de la copia del repositorio y con Node.js instalado:

```bash
npm ci
npm run db:local
npm run auth:setup -- https://test.TU-DOMINIO
npm run auth:bootstrap -- "Nombre completo" email@dominio.com
npm run build
npm start
```

Reemplazá la URL por el dominio real, sin ruta ni barra final. El origen queda en `.dev.vars`; los hashes individuales se guardan en la base. No subas esos archivos ni copies la base de esta PC. El VPS tendrá su propia base de prueba. `npm start` usa Miniflare local, no una base remota de Cloudflare. Para actualizar una instalación existente, conservá `.dev.vars`, aplicá la migración con el servidor detenido y creá el primer superadministrador antes de volver a habilitar el servicio; no regeneres el origen ni copies las cuentas de desarrollo.

El servidor escucha solamente en `127.0.0.1:8787`. Configurá un proxy inverso con HTTPS para el dominio, que envíe las solicitudes a `http://127.0.0.1:8787` y conserve `Host`. No expongas Vite de desarrollo a Internet. El despliegue debe mantener el proceso activo y la carpeta `.wrangler/state/` entre reinicios y actualizaciones.

La instalación en InterServer está documentada en [deploy/VPS.md](deploy/VPS.md). Administración se accede por HTTPS en `admin.copahuehotel.com.ar`; el acceso anterior por IP redirige allí. Los cambios de GitHub no se publican automáticamente.

La separación entre `admin.copahuehotel.com.ar` y `pruebas.copahuehotel.com.ar`, con bases y cuentas independientes, se documenta en [Entornos](docs/entornos.md). Ambos accesos están configurados con HTTPS; la web y el correo actuales conservan sus registros.

Para cambiar una contraseña individual, usá **Usuarios y permisos → Restablecer acceso** con un superadministrador; las sesiones anteriores de esa cuenta se invalidan automáticamente. Conservá `.dev.vars` y su origen. HTTP solo se admite para pruebas en localhost; en un dominio público el acceso exige configurar HTTPS.

Se incluyen fuentes, componentes, migraciones, configuración y lockfile. Se excluyen dependencias instaladas (`node_modules`), base local, compilados, secretos e historial `.git`.
