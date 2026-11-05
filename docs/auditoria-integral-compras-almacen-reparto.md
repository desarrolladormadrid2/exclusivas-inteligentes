# Plan maestro de pruebas operativas

## Propósito y alcance

Este plan simula una jornada real de Exclusivas Inteligentes: revisar existencias, pedir reposición a uno o más proveedores, recibir y verificar mercancía, preparar pedidos de clientes, asignar rutas y vehículos, repartir, registrar cobros y comprobar albaranes y facturas. La auditoría busca fallos funcionales y visuales, diferencias de datos, acciones ambiguas, estados incorrectos, duplicados, pérdidas de información y problemas de uso con ratón, teclado y pantalla táctil.

La ejecución debe producir una matriz de resultados por caso (`Correcto`, `Fallido`, `Bloqueado` o `No aplica`), evidencia y responsable. Una pantalla que carga no equivale a un caso aprobado: se debe completar la acción, reabrir el registro y comprobar la persistencia en la interfaz y en la API/base aislada.

## Seguridad y preparación de la prueba

1. Registrar versión, commit, hora local, navegador, rol de la sesión, URL y tamaño de ventana.
2. Confirmar que la interfaz apunta al entorno local de prueba y que el endpoint de versión declara `development` o el entorno de prueba esperado y `SQLite local`.
3. Crear una copia aislada de la base operativa y trabajar solo sobre ella. Anotar el archivo usado y verificar que no es la SQLite operativa ni una conexión de Turso.
4. Capturar saldos iniciales de los productos, ubicaciones, proveedores, vehículos y documentos que vaya a tocar el recorrido. Elegir datos reales ya existentes de la copia; las nuevas filas llevarán un identificador único `PW-AUDIT-<fecha>-<ejecución>`.
5. No borrar ni sobrescribir datos existentes. Al terminar, hacer inventario de las filas creadas, revisar el resultado de la limpieza lógica y conservar el registro de auditoría. No ejecutar la limpieza contra producción.
6. No enviar correo real, no hacer pagos externos y no emitir documentos fiscales fuera del entorno aislado. Para correo se verificará el PDF, los datos del destinatario y el mensaje preparado usando el transporte de prueba o el fallback de correo sin confirmar el envío.
7. Si aparece una fila sin identificar, no continuar con una acción destructiva o irreversiblemente económica. Guardar el estado y registrar el caso como bloqueado hasta entender el origen.

## Datos y roles del escenario

Preparar en la copia, usando entidades reales de la base siempre que existan:

- Un almacén de recepción y sus ubicaciones.
- Dos proveedores activos con productos compartidos y productos exclusivos; uno con coste y referencia registrados y otro con datos parciales.
- Tres productos comprables: uno con proveedor principal y alternativo, uno con varios alias, y uno sin alias inicial. Añadir un artículo con nombre largo, SKU y formato de compra distinto.
- Dos clientes activos, cada uno con dirección fiscal y al menos una dirección de entrega; uno con horario de recepción y otro con datos geográficos incompletos.
- Productos de venta disponibles, uno por debajo de mínimo y otro con stock suficiente. Registrar saldo, reservado, disponible, mínimo, coste, lote y ubicación inicial.
- Dos vehículos disponibles y usuarios con roles administrador/almacén, comercial, reparto y consulta, según los permisos configurados realmente.

Separar el registro/recepción física de la revisión/validación de mercancía. Antes de la ejecución, verificar qué acción aplica stock en la pantalla Entradas (interruptor “Sumar al stock al registrar”) y cuáles validaciones son de producto, lote, ubicación o aprobación; no asumir que “validar” significa la misma operación. El resultado esperado de stock se calculará según el movimiento realmente confirmado y el comportamiento especificado por la interfaz.

## Casos de prueba

### A. Sesión, acceso y contexto

| ID | Pasos | Resultado esperado |
|---|---|---|
| A01 | Abrir CRM con sesión iniciada y comprobar el usuario actual. | Se conserva la sesión sin quedarse en “Comprobando sesión”; el usuario y rol visibles coinciden con la sesión. |
| A02 | Abrir Compras, Entradas, Stock, Preparación, Carga, Reparto, Cobros, Albaranes y Facturas desde los accesos disponibles. | Cada acceso llega al módulo correcto; no cambia a otro módulo silenciosamente ni pierde el contexto del registro. |
| A03 | Intentar abrir una ruta/API restringida con un rol de consulta o reparto. | Las acciones de escritura aparecen desactivadas o se rechazan con mensaje claro; no hay mutación por llamada directa sin permiso. |
| A04 | Cerrar sesión, recargar y volver a entrar. | No queda información de la sesión anterior accesible; la autenticación y el retorno a la pantalla son comprensibles. |

### B. Proveedores y relaciones con productos

| ID | Pasos | Resultado esperado |
|---|---|---|
| B01 | Buscar proveedores por nombre, código y fragmento; probar sin coincidencias y con inactivos. | Selector incremental, nombres legibles, contador coherente y estado vacío correcto; no aparecen proveedores QA como reales. |
| B02 | Abrir ficha de proveedor y revisar contacto, email, dirección, plazos, mínimo de compra y estado. | Campos y fechas legibles; se distingue dato vacío de dato cero; editar/cancelar conserva o revierte según corresponda. |
| B03 | Buscar productos y vincular un producto real a un segundo proveedor. | Se permite relación muchos-a-muchos; producto y proveedor se muestran por nombre, nunca por ID crudo. |
| B04 | Cambiar el proveedor principal entre dos proveedores vinculados. | Solo hay un principal por producto; el alternativo se conserva; recomendaciones y ficha reflejan la misma elección. |
| B05 | Editar referencia, coste, formato, mínimo y plazo de un vínculo; guardar y volver a abrir. | Cada dato persiste en la relación correcta sin sobrescribir el otro proveedor ni el coste general del producto. |
| B06 | Intentar duplicar la misma relación producto-proveedor y desvincular un alternativo. | No se crean duplicados inadvertidos; se advierte la consecuencia y el principal no queda en un estado inválido. |
| B07 | Usar búsquedas, filtros, paginación y recarga de la lista de relaciones. | El número, los nombres, los filtros y el estado de carga coinciden; fallo de API no se presenta como “sin relaciones”. |

### C. Alias y equivalencias de proveedor

| ID | Pasos | Resultado esperado |
|---|---|---|
| C01 | Crear dos alias y dos referencias distintas del mismo proveedor para un producto del catálogo. | Ambos apuntan al mismo producto; proveedor, producto, alias, referencia y formato son identificables al volver a abrir. |
| C02 | Añadir el mismo alias a otro producto/proveedor y probar coincidencia ambigua. | El sistema no selecciona silenciosamente el producto equivocado; muestra candidatos y exige resolver la ambigüedad. |
| C03 | Intentar alias vacío, espacios, referencia vacía y duplicado normalizado (mayúsculas, tildes, espacios). | Campos obligatorios se validan; duplicados se evitan o se advierten con una explicación. |
| C04 | Desactivar y reactivar una equivalencia existente. | La equivalencia inactiva deja de sugerirse, no se borra el histórico y reaparece al reactivarla. |
| C05 | Buscar equivalencia por proveedor, alias y referencia; comprobar formato. | Filtros correctos, resultados vinculados y nombres legibles también en pantalla estrecha. |
| C06 | En un pedido manual, elegir un alias y activar “guardar como equivalencia”. | La línea queda vinculada al producto maestro; el alias se guarda solo para el proveedor seleccionado y se ofrece en compras posteriores. |

### D. Compras recomendadas

| ID | Pasos | Resultado esperado |
|---|---|---|
| D01 | Abrir recomendaciones con productos bajo mínimo, suficiente y sin mínimo configurado. | Solo se recomiendan los que corresponde; disponibles, comprometidos, mínimo y cantidad sugerida tienen fórmulas y unidades claras. |
| D02 | Comparar el mismo producto en dos proveedores con costes, formatos y plazos distintos. | Se muestran proveedor recomendado y alternativas sin confundir costes/unidades; el precio desconocido no se presenta como cero real. |
| D03 | Elegir proveedor alternativo y añadir artículo al borrador. | Se conserva proveedor escogido, producto, cantidad, unidad y coste; no se envía ni modifica stock al añadir. |
| D04 | Cambiar una recomendación y volver a cargarla; incluir pedido cancelado en el histórico. | La recomendación refleja datos actuales y excluye cancelados/QA de la demanda operativa. |
| D05 | Probar estado de carga, error de endpoint y lista vacía. | Mensajes diferentes para cargando, error y “no hay reposición”; reintento no duplica artículos. |

### E. Crear pedido manual

| ID | Pasos | Resultado esperado |
|---|---|---|
| E01 | Guardar sin proveedor, título o líneas. | Se indican los campos pendientes y no se crea pedido parcial. |
| E02 | Buscar proveedor por fragmento; buscar producto por nombre, SKU, alias y marca; limpiar y cambiar selección. | Autocompletado limitado y navegable; no se conserva un ID anterior al cambiar el texto ni se selecciona una prueba como real. |
| E03 | Añadir producto, alias/referencia de proveedor, formato, cantidad entera/decimal y coste; observar total. | La línea y el total se calculan con precisión y formato español; precio cero solo es válido si se confirma que es intencionado. |
| E04 | Añadir dos líneas, repetir producto, quitar una y cambiar cantidad/unidad/coste antes de guardar. | Repeticiones y borrados tienen resultado explícito; totales se recalculan y no queda una línea fantasma. |
| E05 | Añadir notas para el proveedor con texto corto y largo y una fecha prevista anterior/posterior. | Validación de fechas coherente; las notas se leen completas y no alteran los campos de seguimiento internos. |
| E06 | Guardar como borrador; actualizar el listado, buscarlo y reabrirlo. | Código autogenerado, título, proveedor, fechas, observaciones, líneas e importe persisten; estado se identifica como “Borrador · sin enviar”. |
| E07 | Pulsar guardar dos veces, recargar durante una operación o repetir la llamada con doble clic. | Se genera un solo pedido y un solo conjunto de líneas; se muestra estado “Guardando…” y resultado/error. |
| E08 | Descargar PDF del borrador. | PDF legible, no vacío y con código, título, proveedor, fecha, líneas, cantidades, formatos, costes e importe correctos. |
| E09 | Preparar envío por email con email válido, email ausente e email inválido. | Dirección y adjunto corresponden al proveedor/pedido; no se manda un correo real en la auditoría; fallback permite corregir destinatario y no marca como enviado si no se envió. |

### F. Pedidos recurrentes

| ID | Pasos | Resultado esperado |
|---|---|---|
| F01 | Abrir Recurrentes sin proveedor y luego elegir uno sin artículos frecuentes. | Guía para seleccionar/crear lista; estado vacío distingue “sin proveedor” de “sin recurrencias”. |
| F02 | Guardar un producto desde Manual como recurrente y consultarlo para ese proveedor. | Cantidad, formato, coste y alias habituales se guardan con el proveedor/producto correctos. |
| F03 | Crear nuevo recurrente desde esa pestaña, cambiar cantidad y formato y guardar. | La nueva recurrencia aparece una sola vez y no modifica el catálogo maestro por accidente. |
| F04 | Añadir uno, varios y todos los habituales al borrador; editar cantidades individuales. | Solo entran los seleccionados, cada línea conserva su unidad/coste y el total se actualiza. |
| F05 | Cambiar de proveedor después de cargar recurrentes y volver al primero. | Nunca aparecen artículos de otro proveedor; el cambio no deja selecciones invisibles o líneas huérfanas. |
| F06 | Desactivar o eliminar lógicamente un recurrente usado antes. | Se conserva el histórico del pedido existente y la entrada nueva se comporta según el estado inactivo. |

### G. Pedido desde OCR

| ID | Pasos | Resultado esperado |
|---|---|---|
| G01 | Subir una imagen nítida y un PDF de pedido de prueba con productos conocidos, alias y cantidades variadas. | Se muestra progreso; texto extraído y líneas reconocidas se pueden revisar antes de guardar; no hay creación automática definitiva. |
| G02 | Probar imagen inclinada, baja resolución, página múltiple, orientación incorrecta y texto manuscrito. | Se informa de la confianza/limitación; se puede corregir sin perder el documento original ni duplicar líneas. |
| G03 | Incluir alias exacto, coincidencia parcial, nombre similar y dos productos candidatos. | Alias exacto resuelve; parciales y ambiguos requieren confirmación y enseñan producto, proveedor y referencia candidatos. |
| G04 | Incluir una línea desconocida y asignarla a un producto real; guardar el alias para futuro. | La línea queda vinculada, unidad y cantidad permanecen fieles y el alias se crea con el proveedor correcto. |
| G05 | Corregir cantidad, decimal, formato, coste, proveedor y eliminar una línea errónea. | El pedido y sus sumas reflejan la revisión; OCR original queda auditable y no se altera el documento subido. |
| G06 | Subir varios ficheros, arrastrar, pegar desde portapapeles y quitar uno antes de procesarlo. | Cola y orden de documentos claros; quitar un fichero no borra otros; el progreso y errores se asocian al fichero correcto. |
| G07 | Probar archivo vacío, corrupto, tipo no permitido, tamaño límite y fallo de OCR/configuración. | Error entendible y recuperable; no hay pedido incompleto ni pantalla bloqueada; se conserva lo ya interpretado. |
| G08 | Reabrir el pedido generado desde OCR y revisar archivo, texto reconocido, líneas y alias. | El resultado es editable como borrador y su origen OCR se reconoce sin confundirlo con un pedido enviado. |

### H. Listado, detalle y ciclo de vida del pedido a proveedor

| ID | Pasos | Resultado esperado |
|---|---|---|
| H01 | Buscar pedidos por código, título, proveedor, producto y observación; usar filtros de proveedor y grupo de estado. | Resultados y contador concuerdan con la consulta; limpiar filtros restaura la lista. |
| H02 | Filtrar borradores, enviados/en curso, recibidos y cancelados. | Los estados agrupados incluyen/excluyen los estados correctos; borradores se distinguen visualmente de compras enviadas. |
| H03 | Abrir detalle desde cada parte de la fila, botón, notificación o búsqueda. | Abre el pedido correcto en modal y conserva listado/filtros de fondo. |
| H04 | Editar título, fechas, notas y líneas de un borrador; cancelar la edición y reabrir. | Cancelar descarta los cambios no guardados; guardar persiste exactamente lo editado, recalcula importe y mantiene código e histórico. |
| H05 | Cambiar borrador a enviado y volver a editar. | Estado refleja una compra comunicada; las líneas enviadas quedan protegidas conforme a la regla del sistema, con explicación clara. |
| H06 | Añadir observación breve, larga y consecutiva; recargar, filtrar y revisar historial. | Se guardan como eventos separados, con usuario/fecha; observaciones antiguas no se sobrescriben ni se duplican. |
| H07 | Cancelar un borrador con y sin motivo; intentar cancelar un pedido ya recibido. | Confirmación y motivo claros; estado cancelado aparece en búsquedas; no se puede cancelar recepción ya contabilizada sin proceso de reversión explícito. |
| H08 | Solicitar email de anulación con proveedor con/sin email. | Se registra la intención y motivo; no afirma que se envió si se abrió solo un correo preparado; permite volver sin perder el detalle. |
| H09 | Probar estados/transiciones inválidas, guardar simultáneamente desde dos pestañas y reintentar tras timeout. | Transiciones no permitidas se bloquean; conflictos informan del estado actual; ninguna operación duplica líneas, notas o correos. |
| H10 | Revisar datos faltantes, nombres largos, varios proveedores, importes altos y cero líneas en el listado/modal. | No se muestran IDs, `NaN`, `[object Object]`, fechas confusas ni resúmenes engañosos; texto salta de línea y acciones no se ocultan. |

### I. Recepción física en Entradas

| ID | Pasos | Resultado esperado |
|---|---|---|
| I01 | Desde un pedido enviado, abrir “Registrar en Entradas”. | Navega a Entradas con el pedido/proveedor y líneas esperadas correctos; título y código permiten identificar origen. |
| I02 | Abrir entrada manual sin pedido vinculado y seleccionar proveedor, almacén y fecha. | Se puede registrar recepción independiente y queda identificada como tal; no se asigna un pedido incorrecto por defecto. |
| I03 | Registrar recepción completa en varias líneas con opción de sumar stock activada. | Unidades esperadas/recibidas, formatos, almacén y responsable aparecen antes de confirmar; movimiento de stock coincide con unidades aptas. |
| I04 | Registrar con opción de sumar stock desactivada y comparar antes/después. | No cambia stock; la entrada deja claro “stock no sumado” y existe una forma explícita y segura de contabilizarlo después si el diseño lo permite. |
| I05 | Registrar recepción parcial y volver a recibir lo pendiente en segunda entrada. | La primera entrada conserva lo recibido; el pedido queda parcial; la segunda calcula remanente sin duplicar lo ya registrado. |
| I06 | Recibir menos, más o cero unidades; incluir una línea no recibida con nota/incidencia. | Diferencias quedan visibles y con responsable; cantidades negativas o inválidas se bloquean; excedente no se confunde con lo pedido. |
| I07 | Marcar unidades dañadas y sustituidas, elegir producto sustituto e introducir falta de sustituto. | Stock solo refleja las cantidades aptas y productos efectivamente recibidos; incidencia incluye tipo, cantidades, diferencia y resolución pendiente. |
| I08 | Registrar lote, caducidad, formato de compra y ubicación de picking; probar lote existente y nuevo. | Lote/fecha/unidad permanecen ligados a producto y almacén; no se mezclan lotes diferentes ni se actualiza caducidad accidentalmente. |
| I09 | Validar, rechazar o corregir producto y validar ubicación individualmente. | Persona/fecha/motivo quedan auditados; estado, stock y ubicación siguen reglas explícitas; validar dos veces no suma dos veces. |
| I10 | Adjuntar foto de incidencia, probar carga inválida, lenta y sin Cloudinary. | Adjuntos tienen vista previa, nombre y recuperación; error de subida no pierde la incidencia; fallback y configuración ausente se explican. |
| I11 | Guardar, salir, reabrir y editar una entrada con varias líneas e incidencias. | Se recuperan detalle, documentos, notas, proveedor, pedido de origen y estados; las acciones incompatibles quedan bloqueadas. |
| I12 | Crear entrada repetida para el mismo pedido o pulsar dos veces. | Se advierte posible duplicado; la segunda operación no replica movimientos ni suma stock inadvertidamente. |

### J. Stock y trazabilidad de compra

| ID | Pasos | Resultado esperado |
|---|---|---|
| J01 | Capturar existencias y movimientos antes de entrada, sumar la recepción y volver a consultarlos. | Diferencia del saldo coincide exactamente con el movimiento aprobado y unidades aptas; producto, almacén, cantidad, referencia y fecha coinciden. |
| J02 | Reabrir o refrescar entrada/pedido/stock después de recibir. | Pedido, entrada, movimientos y stock muestran una misma fuente y el mismo valor sin caché obsoleta. |
| J03 | Repetir consulta, edición de observación y validación de ubicación. | Las acciones no vuelven a incrementar stock. |
| J04 | Comparar pedido completo, parcial, cancelado, con incidencia y sin sumación de stock. | El listado y recomendación de compra reflejan cada situación correctamente; cancelados no incrementan demanda ni stock. |
| J05 | Revisar negativo, bajo mínimo, disponible, reservado y unidad fraccionaria. | Colores/orden y cálculos coinciden con reglas de stock; el número y el estado no se confunden. |
| J06 | Inspeccionar historial/auditoría del movimiento desde la entrada. | Cada movimiento apunta a una entrada y usuario; no hay movimientos huérfanos, referencias opacas ni doble contabilización. |

### K. Crear y editar pedidos de clientes

| ID | Pasos | Resultado esperado |
|---|---|---|
| K01 | Crear pedido para cliente real con dirección de entrega secundaria, fecha y varias líneas. | Cliente, dirección, horario y solicitante correctos; no se sustituye dirección fiscal; código y estado inicial se generan correctamente. |
| K02 | Buscar cliente/producto con nombre, referencia y catálogo grande; cambiar selección y borrar. | Búsqueda rápida, accesible y sin IDs; borrar elimina el vínculo y bloquea guardar si es obligatorio. |
| K03 | Añadir cajas, unidades, kilos/litros y fracciones; cambiar precio y cantidades. | Conversión y totales son correctos; formato de compra no se convierte silenciosamente a venta; unidad queda visible. |
| K04 | Guardar y reabrir; editar cabecera, dirección, líneas y notas de almacén/reparto. | Cambios persisten solo en su campo; notas no se mezclan; el usuario ve qué ha cambiado. |
| K05 | Cancelar pedido antes y después de preparación; intentar incluirlo en rutas. | Cancelación queda auditada y el pedido no aparece en preparación, carga, reparto, mapas ni contadores. |
| K06 | Probar validaciones, doble clic, conexión interrumpida, nombre largo y coste/importe límite. | No hay pedidos duplicados ni guardados parciales; el error conserva datos; importe y feedback son legibles. |

### L. Preparación de almacén

| ID | Pasos | Resultado esperado |
|---|---|---|
| L01 | Comparar pedidos del inicio con Preparación para hoy y otra fecha. | Conteos, fechas y estados usan la misma fuente; cancelados y pedidos de otro día quedan fuera. |
| L02 | Abrir comanda con varias líneas, ubicaciones y unidades distintas; iniciar preparación. | Producto, ubicación, cantidad pedida, preparada y estado se leen de un vistazo; el inicio de preparación se atribuye al usuario. |
| L03 | Preparar cantidades exactas, parciales, cero y superiores a lo pedido. | Estado completo/incompleto/incidencia correcto; sobrantes y faltantes se controlan con motivo, no se aceptan silenciosamente. |
| L04 | Resolver incidencia de falta/sustitución y añadir nota/adjunto. | Cliente, dirección, producto, faltante, fecha y registrador aparecen; incidencia genera trazabilidad y notificación pertinente. |
| L05 | Corregir ubicación con formato letra-número, guardar en lote y cancelar cambios. | Solo cambia el producto elegido; historial registra valor anterior/nuevo, actor y origen; cancelar no escribe cambios. |
| L06 | Cerrar preparación y reabrir desde inicio, pedido, almacén y carga. | Estado y disponibilidad de carga coinciden; no se prepara ni descuenta dos veces al reintentar. |
| L07 | Usar filtros, búsqueda, columnas, tarjetas y respuesta lenta/API caída. | Hay loading real, error recuperable y vacío correcto; no parpadean “sin pedidos” ni se mezclan resultados antiguos. |

### M. Carga de vehículos y logística

| ID | Pasos | Resultado esperado |
|---|---|---|
| M01 | Abrir pedidos preparados, pendientes y cancelados en tablero de carga. | Solo están disponibles los pedidos que cumplen el estado de preparación; los cancelados quedan excluidos. |
| M02 | Cargar pedidos en dos vehículos y dejar uno sin asignar; usar varias direcciones. | Se distingue asignado/no asignado; no se duplican pedidos ni se mezclan direcciones entre clientes. |
| M03 | Cambiar vehículo, conductor, nombre de ruta y orden de paradas; guardar/reabrir. | Asociación y orden persisten; vehículo no recibe dos rutas incompatibles; conductor y ruta son legibles. |
| M04 | Probar ubicación geolocalizada, coordenadas ausentes y dirección larga. | Mapa y enlace contienen las coordenadas o dirección completa; no se abre búsqueda genérica; se señala qué falta geolocalizar. |
| M05 | Probar vehículo inactivo, sin capacidad/datos, dos operadores editando y ruta vacía. | Se bloquea la asignación inválida con mensaje y no se marca como salida confirmada. |
| M06 | Revisar kilometraje, gasoil y mantenimiento vinculados a ruta/vehículo. | Valores y unidades correctos, fecha y vehículo asociados; las consultas no duplican gastos. |

### N. Reparto, entrega, firma e incidencias

| ID | Pasos | Resultado esperado |
|---|---|---|
| N01 | Iniciar ruta y comparar lista/mapa con tablero de carga. | Mismo conductor, vehículo, pedidos y orden; cada parada muestra cliente, dirección, horario y datos de contacto permitidos. |
| N02 | Reordenar paradas, recalcular distancia y abrir navegación en móvil. | Orden y distancias se actualizan; Google Maps recibe paradas y destino correctos. |
| N03 | Entregar parada con nombre de receptor y firma táctil; probar falta de firma/nombre. | Firma queda ligada al envío con hora y usuario; los campos requeridos se validan y pueden repetirse sin duplicar entrega. |
| N04 | Tomar fotografía, cambiar orientación y probar fallo de cámara/subida. | Vista previa, rotación/lectura y vínculo de imagen correctos; error no marca entrega incompleta como correcta. |
| N05 | Registrar entrega parcial, cliente cerrado, rechazo, dirección errónea o ausencia. | Incidencia se sincroniza con pedido/ruta/envío y conserva motivo; ruta no puede cerrarse con paradas obligatorias sin resolver. |
| N06 | Registrar cobro al entregar con importe exacto, parcial, cero, método y referencia. | Importe/método/fecha se muestran y guardan; parcial deja saldo pendiente; no duplica cobro en reintento. |
| N07 | Recargar, abrir seguimiento público y consultar entregas en historial diario. | Token público solo muestra el envío correspondiente; estados de parada y ruta coinciden y se actualizan. |

### O. Cobros, albaranes y facturas

| ID | Pasos | Resultado esperado |
|---|---|---|
| O01 | Comparar cobro de cada entrega con factura/albarán del pedido. | Cobro referencia factura y pedido correctos; la suma de cobros activos determina saldo/estado; anulados no cuentan. |
| O02 | Registrar pago total, parcial y segundo pago; revisar lista y detalle. | Total pagado, pendiente y estado son correctos; los pagos son inmutables y la anulación conserva auditoría. |
| O03 | Intentar eliminar/anular cobro, repetir acción y revisar factura huérfana. | Se anula, no se borra; recalcula factura y el cobro huérfano queda preservado e inactivo. |
| O04 | Generar albarán con una, varias y todas las líneas; descargar/abrir/imprimir. | Código, fecha, cliente, entrega, artículos, cantidades y unidades coinciden; PDF no está vacío y la pantalla imprimible muestra el documento activo. |
| O05 | Generar factura, revisar datos históricos del cliente, base, IVA, recargo, total y vencimiento. | Totales cuadran con líneas y regla fiscal; datos snapshot no cambian al editar/eliminar cliente después. |
| O06 | Repetir generación, agrupar documentos o abrir el documento desde pedido, cobro y cliente. | No se crean documentos duplicados; relación visible y descarga lleva al mismo documento. |
| O07 | Preparar email/enlace compartido sin enviarlo; probar email ausente y enlace inválido. | Destinatario, PDF y token son correctos; errores se explican y no se afirma envío exitoso sin confirmación. |
| O08 | Comparar listados de Facturas, Albaranes, Cobros y detalle del pedido. | Cliente/código/importe/fecha/estado y pagos coinciden en todas las vistas. |

### P. Observaciones, incidencias y trazabilidad transversal

| ID | Pasos | Resultado esperado |
|---|---|---|
| P01 | Añadir observación a pedido proveedor, entrada, pedido cliente, preparación, ruta y entrega. | Cada observación se guarda en el registro y módulo apropiados, con autor y fecha/hora; no sustituye el texto anterior. |
| P02 | Editar observación si se permite y comparar historial antes/después. | El cambio se atribuye y el histórico no se falsifica; si la política es inmutable, se añade rectificación en vez de reescribir. |
| P03 | Generar una incidencia en recepción, preparación y reparto; abrirla desde notificación/nota. | Se abre el registro exacto; notificación, nota, contador y estado de incidencia reflejan el mismo caso. |
| P04 | Resolver, reabrir y cerrar incidencia con motivo/responsable. | Estados permitidos y permisos se respetan; se conserva la secuencia de eventos y se actualizan contadores sin residuos. |
| P05 | Comprobar historial/auditoría de cambio de estado, anulación, stock, firma y pago. | Actor, fecha, entidad y acción están completos; no aparecen credenciales o datos sensibles en mensajes/capturas. |

### Q. Búsqueda, contadores, filtros y consistencia

| ID | Pasos | Resultado esperado |
|---|---|---|
| Q01 | Buscar por códigos, cliente/proveedor, producto, observación y dirección. | Coincidencias esperadas aparecen; texto normalizado (tildes/mayúsculas) funciona según diseño. |
| Q02 | Combinar filtros de fechas, estado, almacén, proveedor, cliente y responsable; limpiar uno y todos. | Los filtros se combinan de forma predecible; el contador cambia y los demás filtros permanecen. |
| Q03 | Comparar contadores de inicio, compras, entradas, stock, preparación, carga, reparto, cobros y documentos. | Mismo registro cuenta igual en todos los módulos; un cancelado, borrador, QA o anulado no entra donde no corresponde. |
| Q04 | Abrir listados vacíos, con un elemento, muchos elementos y relación rota. | Carga, vacío, error y resultado parcial tienen mensajes distintos; relaciones faltantes no muestran IDs como nombres. |
| Q05 | Forzar API lenta, timeout, respuesta 500 y conexión perdida al guardar. | No desaparece lo escrito; error permite reintento seguro; no se comunica “guardado” hasta confirmar persistencia. |

## Auditoría visual, accesibilidad y responsive

Repetir los casos críticos con los siguientes tamaños: escritorio `1440×900`, portátil `1095×800`, tablet horizontal `1024×768`, tablet vertical `768×1024`, móvil horizontal `812×375` y móvil vertical `441×820`. Comprobar especialmente formularios, listado/detalle, editor, adjuntos y modales con varias líneas.

En cada pantalla afectada revisar y registrar:

- No hay scroll horizontal accidental (`scrollWidth` no supera el ancho visible salvo un área interna justificada); ningún campo, precio, botón o estado queda cortado.
- Cabecera, título, filtros, contador y acciones ocupan el espacio necesario; no hay textos duplicados, columnas huérfanas ni paneles vacíos.
- Una fila con datos reales, una intermedia y la última conservan producto, proveedor/cliente, importe, estado y acciones legibles; probar nombres, alias, códigos y notas largos.
- La modal realmente abierta cabe en viewport, mantiene cabecera y acciones accesibles, desplaza su contenido internamente y no deja scroll al fondo.
- Los estados de carga, vacío, guardado, error, éxito, desactivado y confirmación se distinguen; feedback aparece junto a la acción.
- Contraste y uso consistente de rojo/naranja/verde/gris; fuente legible; objetivos táctiles cómodos; botones no quedan debajo del asistente flotante.
- Navegación solo con teclado: tabulado lógico, foco visible, `Enter`/`Espacio`, escape para cerrar cuando proceda, selector/buscador operable y sin trampas de foco.
- Etiquetas accesibles y nombres de botones describen la acción; errores se asocian al campo y no dependen solo del color.
- Zoom al 200 % no pierde acciones esenciales ni deja contenido superpuesto.

Guardar y mostrar capturas independientes de: errores encontrados, recorrido local correcto y verificación de producción. Nombrarlas con versión, módulo, resolución y estado; no reemplazar capturas previas. Adjuntar consola/errores HTTP relevantes al resultado.

## Cierre de datos y aceptación

1. Reconsultar cada registro de auditoría y sus relaciones en API y UI antes de limpiar.
2. Comparar inventario final con el cálculo: stock inicial + entradas aplicadas − salidas/ventas + devoluciones aceptadas, desglosado por producto, almacén y lote.
3. Confirmar que pedidos cancelados no figuran en rutas, reparto, mapas ni contadores; pagos anulados no forman parte del cobro; entradas y movimientos no se duplicaron.
4. Verificar que los PDF de prueba se pueden volver a abrir y que el registro conserva notas, incidencias, adjuntos, firmas y referencias.
5. Limpiar lógicamente solo las filas creadas por esta ejecución en la copia aislada; conservar auditoría/evidencia y comprobar cero registros de prueba activos.
6. Registrar por caso: ID, precondición, datos usados (sin secretos), pasos ejecutados, esperado, observado, estado, severidad, versión, respuesta API y captura.
7. Clasificar fallos: bloqueante (stock/cobro/duplicado/permisos), alto (flujo detenido o dato perdido), medio (uso confuso o estado incoherente), bajo (detalle visual menor). Ningún bloqueante/alto queda como aceptado sin corrección o decisión explícita.
8. Cerrar solo cuando pruebas automatizadas, recorrido local, revisión visual, consistencia de datos, limpieza y (si hubo publicación) versión/endpoints/flujo visual de producción tengan resultado explícito.

## Ejecución automatizada actual

La batería de API está en [`tests/production-exhaustive-battery.mjs`](../tests/production-exhaustive-battery.mjs). La batería actual cubre recursos CRUD, compras/recepción, tres pedidos, dos rutas, entregas con firma/foto/cobro/seguimiento, PDFs y rendimiento. Ejecutarla en modo local solo contra un servidor conectado a SQLite desechable:

```powershell
$env:BASE_URL = 'http://127.0.0.1:3212'
$env:AUDIT_LOCAL = '1'
node tests/production-exhaustive-battery.mjs
```

El modo por defecto no debe apuntar a producción para crear datos. Antes de cada ejecución confirmar que `BASE_URL` es localhost y que `/api/version?refresh=1` confirma el entorno local esperado. El recorrido visual de este documento complementa la batería API; no se considera sustituido por ella.
