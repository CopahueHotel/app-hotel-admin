# Clientes, consultas y reservas

La etapa agrega **Clientes** como registro central de titulares y contactos potenciales. No sincroniza correos ni Zoho CRM y no envía campañas. Zoho Mail continúa siendo el proveedor de correo cuando se configure su SMTP privado.

## Uso

- En **Clientes → Nuevo cliente**, registrar nombre y apellido, contacto, ubicación y origen inicial. Email y teléfono son opcionales, incluso ambos. El origen del cliente es distinto del canal de cada consulta y del origen de una reserva.
- Al seleccionar un nombre del listado se abre la ficha en el panel lateral derecho, con el mismo estilo de Reservas. Las pestañas Datos, Consultas, Reservas e Historial agrupan la información; el alta y la edición también se realizan en el panel. El historial identifica al usuario verificado y las fechas se muestran en horario del hotel.
- En **Nueva reserva**, buscar por nombre, email o teléfono y seleccionar una ficha. También se puede crear el cliente en el mismo formulario; la ficha y la reserva se guardan en una sola transacción. Si falla disponibilidad, precio o cualquier validación, no queda una ficha accidental ni una consulta convertida.
- Los datos de contacto de un cliente existente se modifican desde su ficha. Las reservas muestran su contacto actual, pero conservan los valores históricos que tenían guardados y sus importes acordados. Cambiar un teléfono no modifica precios ni condiciones de estadías anteriores.
- El titular/contacto no equivale a todos los huéspedes. Los nombres de acompañantes, restricciones, preferencias y condiciones de alimentación siguen perteneciendo a las personas de cada estadía; no se copian a todas las reservas futuras.

## Coincidencias

Email normalizado sin espacios exteriores y en minúsculas. El teléfono se compara por sus dígitos, unificando los prefijos internacionales escritos expresamente con `00` o `+`; se conserva el texto original. No se infiere código de país ni se convierten números locales automáticamente.

Las coincidencias por email o teléfono se muestran para seleccionar la ficha existente. Para personas distintas que comparten contacto, confirmar expresamente que se creará otra ficha. No hay índices únicos por contacto ni fusiones automáticas. Los nombres parecidos no demuestran identidad.

## Consultas y seguimiento

Desde una ficha: **Nueva consulta**, fecha, canal, llegada/salida solicitadas si se conocen, personas, estado, notas internas, próxima acción y fecha de seguimiento. Una consulta no ocupa habitación ni genera cobros o pagos.

**Convertir en reserva** abre el formulario con el mismo cliente y los datos solicitados. Elegir habitación y completar las condiciones económicas. Al guardarlo, se conserva el vínculo consulta–reserva y se registra la conversión. Dos solicitudes simultáneas no convierten una consulta en dos reservas; la perdedora revierte todos sus cambios. Una consulta convertida mantiene ese estado histórico, aunque la reserva se cancele después.

El formulario individual de reserva admite una habitación y hasta tres personas si se solicita expresamente una cama extra en una habitación doble. Para un grupo mayor está disponible **Reservas → Grupos → Nuevo grupo**, seleccionando el mismo cliente. La conversión vinculada directamente desde una consulta a varias habitaciones sigue pendiente: crear el grupo por separado no marca esa consulta como convertida automáticamente.

## Exportación y consentimiento

El listado busca nombre/email/teléfono y filtra origen, estadías realizadas, consultas pendientes y consentimiento. **Exportar contactos CSV** aplica los mismos filtros, incluye el estado y evidencia del consentimiento y omite notas internas y datos económicos. Requiere permiso de exportación validado en el servidor. Los campos se escapan para evitar interpretar contactos como fórmulas de planilla.

Consentimiento independiente: **Sin información**, **Autorizado**, **Rechazado** o **Revocado**. Un cambio requiere fecha y origen de la decisión; el responsable se obtiene de la sesión. Crear una reserva nunca concede autorización promocional. No se implementa envío masivo ni campañas en esta etapa.

## Permisos

`customers.view`, `customers.lookup`, `customers.create`, `customers.edit`, `customers.notes`, `customers.consent` y `customers.export` aparecen en la matriz. La búsqueda limitada para Reservas puede habilitarse sin abrir todo Clientes: entrega como máximo 20 contactos y únicamente id, nombre, email y teléfono. No entrega notas, consultas, consentimiento, finanzas ni exportación. El detalle de reservas dentro de una ficha requiere además `reservations.view`.

Gerente y Recepción reciben permisos iniciales del módulo cuando sus roles aún tienen la configuración inicial; Recepción no recibe exportación de contactos automáticamente. Los roles previamente personalizados mantienen su configuración y deben habilitarse expresamente por un superadministrador. Superadministrador tiene el catálogo completo. Cocina, Restaurante, Stock y Socio no reciben acceso comercial automáticamente. La revocación se valida sobre sesiones existentes, incluyendo dentro de los batches.

## Migración y preservación

`0012_magenta_runaways` crea clientes, consultas y vínculos. Cada reserva anterior obtiene una ficha histórica independiente, con nombre y teléfono conservados. No se fusionan reservas aunque sus contactos coincidan. Se marca su procedencia histórica y no se inventa quién registró al cliente originalmente ni su consentimiento. La fecha de creación de esa ficha es la de la migración, no una supuesta fecha histórica del contacto.

Las reservas, huéspedes, consumos, cobros, pagos, tarifas y sus condiciones guardadas no se recalculan ni se borran. Los clientes creados desde ahora identifican al usuario autenticado. No hay eliminación pública de fichas ni consultas; los estados y cambios conservan historial.

Pendientes: revisión operativa/visual con el gerente, conciliación manual de posibles fichas históricas duplicadas, conversión de consultas a grupos y eventual integración con el historial de correos. Esta etapa no incorpora fusión, campañas ni Zoho CRM.
