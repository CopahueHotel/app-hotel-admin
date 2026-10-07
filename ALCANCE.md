# Alcance de la primera versión

## Implementado
- HOT-15 a HOT-18: cuentas individuales activas/inactivas, alta y restablecimiento por superadministradores, ocho roles sumables, matriz configurable por módulo/acción y permisos específicos. Autorización y filtrado de campos en servidor, identidad desde sesión, revisión de acceso dentro del batch, revocación vigente y protección del último superadministrador activo. Históricos sin atribuciones inventadas; primer administrador mediante consola local.
- HOT-19: pantallas, formularios y operaciones agrupados en `modules/`, rutas delgadas y coordinación transaccional compartida. Reservas, habitaciones, tarifas, alimentación, bebidas, stock, compras, proveedores, menú, caja, personal, informes y acceso conservan sus conexiones y exportaciones compatibles.
- HOT-12: fichas de proveedores y frecuencia habitual separada de entregas concretas, generación sin duplicados, calendario/listado, reprogramación individual con historial, fechas A confirmar y vínculo a compras/recepción sin stock ni pagos automáticos.
- HOT-13: menú mensual y por servicio, borrador/confirmado, alternativas y condiciones declaradas, copia de día/semana con confirmación de reemplazos y control de versiones, menú servido separado con copia del previsto. Conecta la previsión y restricciones de Restaurante, sin recetas ni movimientos de stock.
- HOT-14: fichas activas/inactivas de empleados, calendario individual/equipo, turnos nocturnos y ausencias, advertencias de superposición con excepción explícita, asistencia real separada, novedades y seguimiento con autor original/historial, filtros y CSV. Datos y auditoría internos de Personal separados de la consulta operativa; todavía sin permisos individuales.
- HOT-08: despacho de bebidas con fecha/hora del hotel, destino físico, condición de cobro independiente, precio aplicado, motivo/responsable y observación. Cuentas identificables de mesa, cobro o transferencia a estadía, sin descontar stock nuevamente.
- HOT-09: cortesías e internos sin caja ficticia; devoluciones físicas parciales acotadas al despacho; correcciones económicas mediante consumos compensatorios vinculados, sin borrar el original ni devolver stock automáticamente. Cobros, transferencias y días cerrados bloquean correcciones directas.
- HOT-10: comprobante único con varias líneas de productos y rubros Bebidas/Alimentos/Limpieza/Amenities/Reutilizables; servicios y administrativos sin stock. Recepción parcial independiente del pago, opción explícita de recibido completo, actividad y Fijo/Variable conservados. Históricos sin reinterpretar.
- HOT-11: saldos y estados de proveedor derivados de pagos, referencias y cuentas; vencimientos ordenados, vencido/próximo según fecha de consulta, vencimiento sin definir, filtros y CSV para Excel. Sin pagos automáticos.
- HOT-04: condiciones de alimentación por persona, separando restricciones, preferencias y observaciones; MP con elección por día sin cambiar precio ni régimen.
- HOT-05: suspensiones por persona, fecha/intervalo y servicio; reactivación con historial, previsión separada del servicio realizado y unicidad por persona/fecha/servicio. Sin ajustes económicos automáticos.
- HOT-06: listado diario por servicio, huéspedes individuales y previsiones explícitas de clientes externos, totales separados y exportación CSV para cocina. Servicios de salida visibles sin confirmar según la regla vigente [llegada, salida).
- HOT-07: noches restantes y próximas salidas según fecha de consulta en la zona del hotel, sin cierres ni mensajes automáticos.
- Panel del día, saldos por cuenta y pendientes.
- Calendario de 17 habitaciones y fichas de estadía.
- Alta de reservas; prevención de noches superpuestas; regímenes Desayuno/MP/PC.
- HOT-01: tarifas por tipo Single/Doble y régimen, en ARS por habitación y noche; períodos sin superposición, consulta por fecha y cotización nocturna guardada. Precio acordado con motivo y responsable declarado cuando corresponda.
- HOT-02: edición de reservas activas con control de versiones y disponibilidad transaccional en SQLite. Bloqueos de mantenimiento por noches, liberación con historial y protección de cancelaciones con movimientos. Confirmadas y alojadas bloquean; no hay reservas provisionales.
- HOT-03: condición de pago independiente de movimientos, descuentos por importe/porcentaje, etiquetas de amigo/canje/cortesía, detalle de base/descuento/alojamiento/consumos/cobros/saldo. Canje con acuerdo y cumplimiento explícito, trazado en historial sin caja ficticia.
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
- Login individual por email y contraseña hasheada, sesiones persistentes de ocho horas, cierre de sesión, roles y protección de pantallas/API; límite global de 20 intentos de acceso cada 15 minutos.

## Pendiente para uso operativo
- Crear el primer superadministrador en cada instalación con el procedimiento de README y validar con el gerente los permisos iniciales y las pantallas. Usuarios/permisos y organización modular ya están implementados localmente; los datos de cada instalación siguen siendo independientes.
- Recuperación extraordinaria de todas las credenciales mediante mantenimiento por un administrador del servidor, recuperación por email y MFA. No se implementan circuitos nuevos de aprobación ni reapertura para completar la matriz.
- Edición completa de habitaciones y productos; regularizaciones de reservas cerradas o con devoluciones. Esta etapa permite editar reservas confirmadas/alojadas sin invalidar consumos ni bajar el total por debajo de los cobros existentes.
- Apertura real de saldos, stock, reservas y deudas.
- Devoluciones, anulaciones y correcciones posteriores a cierres.
- Gastos recurrentes automáticos (hoy solo clasificación fijo/variable).
- Comprobantes adjuntos y respaldos automáticos.
- Conversión de cajas/bultos y transferencias entre depósitos.
- Recetas, costos de consumo, valoración de inventario y resultados.
- Definición comercial de comidas de llegada/salida: se conserva [llegada, salida) para incluidos; la salida queda visible sin confirmar y se puede prever expresamente como adicional. No se inventa una inclusión contractual ni su precio.
- Regularización de comidas históricas sin atribución individual y cambios de servicios ya realizados. No se asignan personas por suposición al migrar.
- Gestión de tareas de mantenimiento; los bloqueos de disponibilidad por fechas ya están implementados.
- Facturación e integraciones Booking/CRM/POS/web.
- Revisión visual en navegador y validación con el gerente.
- Completar la revisión de concurrencia en los demás circuitos (por ejemplo, estados de reservas y conteos físicos) y la seguridad de acceso. Las claves pendientes de la interfaz se conservan durante la sesión de la página; no sobreviven a una recarga.

## Interpretación
Los informes muestran movimientos de fondos y pendientes, no utilidad contable. Las señas son cobros; los cargos a habitación son ventas pendientes. Transferencias no son ingresos ni gastos. Compras no equivalen a alimentos consumidos. Los cierres bloquean cargas en su fecha y fechas anteriores; no hay reapertura en la interfaz. El sistema ayuda a controlar registros y conteos, pero no detecta robos por sí solo.

## Validación del origen
Se verificaron tipos, compilación y 15 operaciones sobre SQLite: superposiciones, bebida y stock, cobro, sobrecobro rechazado, comidas incluidas, compra, pago parcial, salidas excesivas rechazadas, transferencias y cierre. La revisión visual en navegador quedó pendiente.

## Pruebas locales de integridad
HOT-15 a HOT-19 agregan `0009_rapid_fallen_one`, conservando datos y responsables históricos. Las comprobaciones cubren permisos iniciales y combinación de roles, rechazos a llamadas directas, cocina sin finanzas, recepción con saldos por estadía sin cuentas generales, recepción de mercadería sin pagos, restaurante con cargos/cobros/precios separados, socio sin modificaciones, privacidad de personal, cambios de acceso durante lecturas/escrituras y sesiones vigentes, desactivación/restablecimiento, secretos fuera de respuestas e historial, protección concurrente del último superadministrador y bootstrap exclusivamente mediante consola. Se verifican pantallas de consulta y recepción sin botones/importes ajenos, además de los circuitos transaccionales anteriores después de separar módulos.

La etapa 4 agrega `0008_brief_sumo` sin alterar datos anteriores. Se comprueban frecuencias semanales/intervalos/fechas puntuales, fechas desconocidas y límites de pedidos explícitos, regeneración sin duplicar ni deshacer reprogramaciones, compra vinculada recibida una sola vez y ausencia de pagos automáticos. Se comprueban menú de un día, copia semanal con confirmación/rollback y carreras de versiones, conservación del menú previsto y ausencia de asistencia/stock automáticos. Personal cubre superposiciones/ausencias, turnos consecutivos y nocturnos, asistencia real, carreras de asignación/desactivación, seguimiento con autor original e historial conservado, endpoint autenticado y exclusión de notas internas de la respuesta operativa. Se verifica la representación de las pantallas y la conexión del menú con cocina. La revisión interactiva queda pendiente; los permisos individuales se incorporan en HOT-15 a HOT-18.

La etapa 3 agrega `0007_serious_peter_parker` sin modificar registros anteriores. Las pruebas cubren despacho/cobro con una sola salida de stock, cuentas reutilizadas independientes, transferencia a estadía sin caja ficticia, motivos de cortesía/interno, devoluciones físicas y correcciones separadas, compras con varias líneas, recepción parcial, pago parcial, redondeo en centavos, vencimientos y conservación de los circuitos históricos. También cubren límites concurrentes de stock/recepción/pagos/devoluciones, cierre de mesa frente a un despacho concurrente, rollback y días cerrados. Se verifican tipos, lint, compilación, acceso HTTP compilado y representación de las nuevas pantallas. La revisión interactiva con el gerente continúa pendiente.

La etapa 2 usa la migración `0006_meal_stage_two`. Sus pruebas cubren restricciones para una sola persona, cambios diarios de MP, suspensiones y reactivaciones sin dinero, intervalos, servicio explícito y duplicaciones concurrentes, carreras suspensión/servicio, previsiones adicionales y externas, conservación histórica, fechas cerradas, salida visible pendiente, totales y representación de las pantallas. También verifican fecha del hotel y noches restantes al cambiar de mes. La revisión visual interactiva con el gerente continúa pendiente.

`npm.cmd test` ejecuta la API contra bases temporales D1/Miniflare sin persistencia. Cubre cierres y comidas concurrentes, cambio de MP tras servir, reintentos y claves duplicadas, rollback, migración de comidas históricas, cargos, cobros, compras, pagos a proveedores, transferencias, stock y superposición de reservas. No usa los registros de `.wrangler/state/`.

También verifica consumos cobrados inmediatamente, su atribución al huésped, saldos sin doble cobro, sobrecobros concurrentes de un centavo, presentación de centavos y filtros/escape de CSV. La migración `0004_guest_paid_sales` actualiza el límite transaccional de cobros. No reconstruye vínculos de consumos anteriores que fueron guardados sin estadía. La verificación de lint pasa sin desactivar reglas del proyecto.

La migración `0005_reservation_stage_one` agrega tarifas, condiciones económicas y bloqueos de mantenimiento, sin cambiar importes ni pagos históricos. Las pruebas de esta etapa cubren cambios de período, precios congelados, tarifas incompletas, cotizaciones obsoletas, reservas/modificaciones/mantenimiento simultáneos, rollback íntegro, cancelación concurrente con pagos, descuentos, amigo sin descuento automático, cortesía/canje sin caja ficticia y representación de la ficha/formulario. La revisión visual interactiva con el gerente sigue pendiente.

Las pruebas de acceso también cubren lectura y escritura anónimas, tokens falsos, contraseña incorrecta, origen cruzado, cookies HTTPS, vencimiento, revocación, cambio de contraseña, falta de configuración y límite concurrente de intentos. El despliegue de prueba en InterServer se verificó con HTTPS válido, redirección al login, API anónima bloqueada y rechazo de contraseña incorrecta y origen cruzado. La revisión visual en navegador sigue pendiente.
