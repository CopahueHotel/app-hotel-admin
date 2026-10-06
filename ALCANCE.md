# Alcance de la primera versión

## Implementado
- Panel del día, saldos por cuenta y pendientes.
- Calendario de 17 habitaciones y fichas de estadía.
- Alta de reservas; prevención de noches superpuestas; regímenes Desayuno/MP/PC.
- Estados de estadía y cancelación de reservas sin movimientos.
- Consumos a habitación o cobrados; bebidas con salida de stock.
- Comidas incluidas con servicio normalizado y cupos protegidos en SQLite; elección de MP por día bloqueada si ya se sirvió otra comida o la fecha está cerrada.
- Cobros, gastos, compras, pagos parciales a proveedores y vencimientos.
- Transferencias entre cuentas y aportes/retiros de socios.
- Cierre de efectivo con cálculo y ajuste transaccionales, diferencia explicada y bloqueo de cargas concurrentes en fechas cerradas.
- Productos, compras, salidas, mermas y conteos físicos.
- Estados de limpieza y observaciones de mantenimiento.
- Historial, informes de fondos y exportación CSV compatible con Excel.
- Precio configurable de comida externa y base persistente.
- Idempotencia de operaciones: la interfaz reutiliza la clave ante un reintento; la API registra la clave junto con los movimientos y el historial en un único batch.
- Consumos nuevos cobrados al momento vinculados a la estadía: aparecen en su ficha como pagados y no aumentan la deuda ni el límite de cobro. Los cargos a estadía conservan cuenta nula; el saldo se deriva de esos cargos y de los cobros registrados.
- Importes con dos decimales y CSV con coma decimal; exportación de Caja por fecha/actividad, Reservas por búsqueda, Stock por categoría e Informes por período.
- Login de prueba con contraseña compartida, sesiones persistentes de ocho horas, cierre de sesión y protección de pantallas y API en el servidor; límite global de 20 intentos de acceso cada 15 minutos.

## Pendiente para uso operativo
- Usuarios individuales y permisos de superadministrador, gerente y consulta en backend; el login compartido de prueba no tiene roles ni identifica a cada operador.
- Edición completa de reservas, habitaciones, productos y tarifas.
- Apertura real de saldos, stock, reservas y deudas.
- Devoluciones, anulaciones y correcciones posteriores a cierres.
- Gastos recurrentes automáticos (hoy solo clasificación fijo/variable).
- Comprobantes adjuntos y respaldos automáticos.
- Conversión de cajas/bultos y transferencias entre depósitos.
- Recetas, costos de consumo, valoración de inventario y resultados.
- Reglas de comidas de llegada/salida. La previsión actual usa noches [llegada, salida); comidas del día de salida requieren revisión.
- Mantenimiento con tareas y bloqueos por fechas.
- Facturación e integraciones Booking/CRM/POS/web.
- Revisión visual en navegador y validación con el gerente.
- Completar la revisión de concurrencia en los demás circuitos (por ejemplo, estados de reservas y conteos físicos) y la seguridad de acceso. Las claves pendientes de la interfaz se conservan durante la sesión de la página; no sobreviven a una recarga.

## Interpretación
Los informes muestran movimientos de fondos y pendientes, no utilidad contable. Las señas son cobros; los cargos a habitación son ventas pendientes. Transferencias no son ingresos ni gastos. Compras no equivalen a alimentos consumidos. Los cierres bloquean cargas en su fecha y fechas anteriores; no hay reapertura en la interfaz. El sistema ayuda a controlar registros y conteos, pero no detecta robos por sí solo.

## Validación del origen
Se verificaron tipos, compilación y 15 operaciones sobre SQLite: superposiciones, bebida y stock, cobro, sobrecobro rechazado, comidas incluidas, compra, pago parcial, salidas excesivas rechazadas, transferencias y cierre. La revisión visual en navegador quedó pendiente.

## Pruebas locales de integridad
`npm.cmd test` ejecuta la API contra bases temporales D1/Miniflare sin persistencia. Cubre cierres y comidas concurrentes, cambio de MP tras servir, reintentos y claves duplicadas, rollback, migración de comidas históricas, cargos, cobros, compras, pagos a proveedores, transferencias, stock y superposición de reservas. No usa los registros de `.wrangler/state/`.

También verifica consumos cobrados inmediatamente, su atribución al huésped, saldos sin doble cobro, sobrecobros concurrentes de un centavo, presentación de centavos y filtros/escape de CSV. La migración `0004_guest_paid_sales` actualiza el límite transaccional de cobros. No reconstruye vínculos de consumos anteriores que fueron guardados sin estadía. La verificación de lint pasa sin desactivar reglas del proyecto.

Las pruebas de acceso también cubren lectura y escritura anónimas, tokens falsos, contraseña incorrecta, origen cruzado, cookies HTTPS, vencimiento, revocación, cambio de contraseña, falta de configuración y límite concurrente de intentos. El despliegue de prueba en InterServer se verificó con HTTPS válido, redirección al login, API anónima bloqueada y rechazo de contraseña incorrecta y origen cruzado. La revisión visual en navegador sigue pendiente.
