# Prueba integral de Compras, Almacén y Reparto

## Propósito

Comprobar de forma repetible que una compra recibida y validada se refleja en stock y permite completar el ciclo de pedidos de clientes, preparación, carga, reparto, cobro y documentos.

## Entorno seguro

- Ejecutar la batería funcional únicamente contra una SQLite local desechable o una copia aislada.
- No usar esta prueba para crear datos en la base operativa de producción.
- La batería no envía correos ni realiza cobros externos. Los pedidos, facturas y pagos que crea son internos y llevan el prefijo `PW-AUDIT-`.
- Al finalizar, comprobar que no quedan registros activos de auditoría.
- Para las pruebas visuales, guardar capturas nuevas con fecha y no reemplazar otras capturas del repositorio.

## Recorrido y criterios de aceptación

1. **Estado inicial y stock**: guardar el stock disponible del producto de auditoría y confirmar su almacén y ubicación.
2. **Pedido al proveedor**: crear pedido con proveedor, título, fechas, observaciones y al menos una línea. Comprobar que código, cantidades, coste e importe permanecen al volver a abrirlo.
3. **Entrada y validación**: registrar la recepción vinculada al pedido; comprobar proveedor, almacén, producto, cantidad esperada/recibida, lote y validación. Verificar la validación de ubicación del producto.
4. **Stock trazable**: comprobar que el saldo aumenta exactamente por las unidades aptas recibidas, que existe un movimiento de entrada asociado a la recepción y que el pedido aparece vinculado a ella. No se deben duplicar movimientos al volver a consultar o guardar.
5. **Pedidos comerciales**: crear al menos tres pedidos para clientes/direcciones válidas y con más de un producto. Comprobar sumas, cliente, dirección y líneas.
6. **Preparación**: validar todas las cantidades, cerrar preparación y comprobar que los envíos pasan a disponibles para carga.
7. **Carga y rutas**: asignar los envíos a dos camiones, comprobar que no se mezclan pedidos, que las paradas conservan cliente/dirección y que el orden y las distancias se muestran correctamente.
8. **Entrega**: iniciar reparto, marcar cada parada entregada, registrar receptor/firma y revisar que el estado del envío, la ruta y el seguimiento público coinciden.
9. **Cobro**: registrar el cobro de cada envío. Comprobar pago vinculado a la factura, importe y método, ausencia de duplicados y estado de factura `Cobrada`/`Pagada`.
10. **Albarán y factura**: comprobar códigos, cliente, líneas, unidades, importes y PDF disponible. Si un PDF no se genera, registrarlo como fallo aunque el registro exista.
11. **Consistencia final**: comparar pedidos, envíos, rutas, cobros, albaranes, facturas y stock; revisar las observaciones y el historial de auditoría.
12. **Revisión visual**: comprobar Compras, detalle de pedido, Entrada, stock, preparación, tablero de carga, reparto, Cobros, Albaranes y Facturas en escritorio y tablet/móvil. Capturar las pantallas clave y cualquier fallo antes de corregirlo.

## Resultado

Registrar para cada ejecución: fecha, versión, base de datos/entorno, navegador y viewport, resultado por paso, diferencias de stock antes/después, documentos generados, errores, capturas y pendientes. La prueba solo se considera cerrada si la batería automatizada, el recorrido visual local, el despliegue (cuando haya cambios) y las comprobaciones de producción tienen resultados explícitos.

## Ejecución de la batería

La batería automatizada completa está en [`tests/production-exhaustive-battery.mjs`](../tests/production-exhaustive-battery.mjs). Para la auditoría de flujo, usar `AUDIT_LOCAL=1` y una URL localhost conectada a una SQLite aislada. El modo por defecto se conserva para auditorías de producción autorizadas; no cambiarlo a producción por omisión en una prueba local.
