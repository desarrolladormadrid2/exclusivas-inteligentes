import test from "node:test";
import assert from "node:assert/strict";
const api = "http://127.0.0.1:3001/api";
async function call(path, options) {
  const r = await fetch(api + path, options);
  return { status: r.status, data: await r.json() };
}
test("login de usuarios locales", async () => {
  const r = await call("/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "Luis", password: "Temporal2026" }),
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, "admin");
});
test("rechaza maestros sin nombre", async () => {
  const r = await call("/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "", sku: "__TEST_SIN_NOMBRE__" }) });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /nombre.*obligatorio/i);
});
test("todos los registros nuevos guardan fechas de auditoría", async () => {
  const created = await call("/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "__TEST_AUDITORIA__" }) });
  assert.equal(created.status, 201);
  assert.ok(created.data.created_at);
  assert.ok(created.data.updated_at);
  const before = created.data.updated_at;
  await new Promise((resolve) => setTimeout(resolve, 5));
  const updated = await call(`/clients/${created.data.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...created.data, phone: "600000000" }) });
  assert.equal(updated.status, 200);
  assert.ok(updated.data.updated_at >= before);
  assert.equal(updated.data.phone, "600000000");
  await call(`/clients/${created.data.id}`, { method: "DELETE" });
});
test("los clientes conservan geolocalización y dirección fiscal", async () => {
  const created = await call("/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "__TEST_CLIENTE_GEO__", address: "Calle Mayor 1", city: "Palencia", billing_address: "Calle Fiscal 2", billing_city: "Palencia", latitude: 42.0095, longitude: -4.5288, geocoding_status: "Geolocalizada" }) });
  assert.equal(created.status, 201);
  assert.equal(created.data.billing_address, "Calle Fiscal 2");
  assert.equal(Number(created.data.latitude), 42.0095);
  assert.equal(created.data.geocoding_status, "Geolocalizada");
  const loaded = await call(`/clients/${created.data.id}`);
  assert.equal(Number(loaded.data.longitude), -4.5288);
  await call(`/clients/${created.data.id}`, { method: "DELETE" });
});
test("corregir una dirección de reparto sincroniza pedido, ubicación y cliente si se confirma", async () => {
  const client = (await call("/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "__TEST_CLIENTE_DIRECCION__", address: "Calle Antigua 1", city: "Palencia" }) })).data;
  const point = (await call("/collection_points", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: `__TEST_UBI_${Date.now()}`, name: "Principal", client_id: client.id, address: "Calle Antigua 1", city: "Palencia" }) })).data;
  const order = (await call("/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: `__TEST_DIRECCION_${Date.now()}`, client_id: client.id, collection_point_id: point.id, address: "Calle Antigua 1", delivery_city: "Palencia", delivery_date: "2099-01-01" }) })).data;
  const shipment = (await call("/shipments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: `__TEST_HOJA_${Date.now()}`, order_id: order.id, client_id: client.id, collection_point_id: point.id, address: "Calle Antigua 1", delivery_city: "Palencia", status: "Preparando" }) })).data;
  assert.ok(shipment.id);
  const updated = await call(`/shipments/${shipment.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...shipment, address: "Calle Nueva 9", delivery_city: "Palencia", latitude: 42.01, longitude: -4.52, geocoded_at: new Date().toISOString(), geocoding_status: "Geolocalizada", update_client_address: 1 }) });
  assert.equal(updated.status, 200);
  assert.equal((await call(`/orders/${order.id}`)).data.address, "Calle Nueva 9");
  assert.equal((await call(`/collection_points/${point.id}`)).data.address, "Calle Nueva 9");
  assert.equal((await call(`/clients/${client.id}`)).data.address, "Calle Nueva 9");
  await call(`/shipments/${shipment.id}`, { method: "DELETE" });
  await call(`/orders/${order.id}`, { method: "DELETE" });
  await call(`/collection_points/${point.id}`, { method: "DELETE" });
  await call(`/clients/${client.id}`, { method: "DELETE" });
});
for (const resource of [
  "suppliers",
  "warehouses",
  "delivery_notes",
  "payments",
  "clients",
  "products",
  "orders",
  "quotes",
  "invoices",
  "shipments",
  "inventory_movements",
  "purchase_orders",
  "purchase_order_lines",
  "notes",
  "returns",
])
  test(`endpoint ${resource}`, async () => {
    const r = await call("/" + resource);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data));
  });
test("un pedido reserva y descuenta stock al enviarse", async () => {
  const product = (
    await call("/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "__test_stock__", unit_price: 1, stock: 4 }),
    })
  ).data;
  const order = (
    await call("/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "__TEST_STOCK_" + Date.now(),
        product_id: product.id,
        quantity: 2,
        amount: 2,
        status: "Pendiente",
      }),
    })
  ).data;
  assert.equal(order.quantity, 2);
  let rows = (await call("/products")).data;
  assert.equal(rows.find((x) => x.id === product.id).stock, 4);
  let inventory = (await call("/stock")).data;
  assert.equal(
    inventory.find((x) => x.product_id === product.id).stock_reserved,
    2,
  );
  await call("/orders/" + order.id, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...order, status: "Enviado" }),
  });
  rows = (await call("/products")).data;
  assert.equal(rows.find((x) => x.id === product.id).stock, 2);
  inventory = (await call("/stock")).data;
  assert.equal(
    inventory.find((x) => x.product_id === product.id).stock_reserved,
    0,
  );
  await call("/orders/" + order.id, { method: "DELETE" });
  await call("/products/" + product.id, { method: "DELETE" });
});

test("borrar un pedido pendiente libera la reserva de stock", async () => {
  const product = (await call("/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "__TEST_BORRADO_RESERVA__", unit_price: 1, stock: 4 }) })).data;
  const order = (await call("/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "__TEST_BORRADO_RESERVA_" + Date.now(), product_id: product.id, quantity: 2, amount: 2, status: "Pendiente" }) })).data;
  let stock = (await call("/stock")).data.find((row) => row.product_id === product.id);
  assert.equal(stock.stock_reserved, 2);
  const deleted = await call(`/orders/${order.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  stock = (await call("/stock")).data.find((row) => row.product_id === product.id);
  assert.equal(stock.stock_reserved, 0);
  await call(`/products/${product.id}`, { method: "DELETE" });
});

test("un pedido conserva sus líneas al convertirlo en albarán y factura", async () => {
  const client = (await call("/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "__TEST_CLIENTE_DOCUMENTO__" }) })).data;
  const product = (await call("/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "__TEST_PRODUCTO_DOCUMENTO__", unit_price: 3, stock: 20 }) })).data;
  const order = (await call("/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "__TEST_DOCUMENTO_" + Date.now(), client_id: client.id, product_id: product.id, quantity: 2, unit_price: 3, amount: 6, status: "Pendiente" }) })).data;
  const line = await call("/order_lines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: order.id, product_id: product.id, quantity: 2, unit_price: 3, amount: 6 }) });
  assert.equal(line.status, 201);
  const converted = await call(`/orders/convert-invoice/${order.id}`, { method: "POST" });
  assert.equal(converted.status, 201);
  const invoiceLines = (await call("/invoice_lines")).data;
  assert.ok(invoiceLines.some((x) => x.invoice_id === converted.data.id && x.product_id === product.id && x.quantity === 2));
  await call(`/invoices/${converted.data.id}`, { method: "DELETE" });
  await call(`/orders/${order.id}`, { method: "DELETE" });
  await call(`/products/${product.id}`, { method: "DELETE" });
  await call(`/clients/${client.id}`, { method: "DELETE" });
});

test("una entrada de almacén actualiza el stock real", async () => {
  const product = (await call("/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "__TEST_ENTRADA__", stock: 1 }) })).data;
  const before = (await call("/products")).data.find((x) => x.id === product.id).stock;
  const movement = await call("/inventory_movements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product_id: product.id, movement_type: "Entrada", quantity: 7, notes: "Recepción proveedor", reference: "__TEST__" }) });
  assert.equal(movement.status, 201);
  const after = (await call("/products")).data.find((x) => x.id === product.id).stock;
  assert.equal(after, before + 7);
  await call(`/inventory_movements/${movement.data.id}`, { method: "DELETE" });
  await call(`/products/${product.id}`, { method: "DELETE" });
});

test("recibir una compra crea entradas y aumenta el stock", async () => {
  const supplier = (await call("/suppliers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "__TEST_PROVEEDOR_RECEPCION__" }) })).data;
  const product = (await call("/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "__TEST_COMPRA__", stock: 2 }) })).data;
  const purchase = (await call("/purchase_orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "__TEST_COMPRA_" + Date.now(), supplier_id: supplier.id, order_date: new Date().toISOString().slice(0, 10), status: "Borrador" }) })).data;
  assert.equal(purchase.stock_alerts, undefined);
  const line = await call("/purchase_order_lines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ purchase_order_id: purchase.id, product_id: product.id, quantity: 5, unit_cost: 2, amount: 10 }) });
  assert.equal(line.status, 201);
  const before = (await call("/products")).data.find((x) => x.id === product.id).stock;
  const sent = await call(`/purchase_orders/${purchase.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "Enviado" }) });
  assert.equal(sent.status, 200);
  const warehouse = (await call("/warehouses")).data[0];
  assert.ok(warehouse?.id);
  const receipt = await call("/goods_receipts/receive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "__TEST_ENTRADA_COMPRA_" + Date.now(), counterparty_type: "Proveedor", supplier_id: supplier.id, purchase_order_id: purchase.id, warehouse_id: warehouse.id, receipt_date: new Date().toISOString().slice(0, 10), validation_status: "Pendiente", stock_on_validation: 1, lines: [{ product_id: product.id, expected_quantity: 5, received_quantity: 5, quantity_unit: "unidad", unit_cost: 2, status: "Correcta" }] }) });
  assert.equal(receipt.status, 201);
  const stockBeforeValidation = (await call("/products")).data.find((x) => x.id === product.id).stock;
  assert.equal(stockBeforeValidation, before);
  const received = await call(`/goods_receipts/${receipt.data.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ validation_status: "Validada" }) });
  assert.equal(received.status, 200);
  const after = (await call("/products")).data.find((x) => x.id === product.id).stock;
  assert.equal(after, before + 5);
  assert.equal(received.data.validation_status, "Validada");
  await call(`/purchase_orders/${purchase.id}`, { method: "DELETE" });
  await call(`/purchase_order_lines/${line.data.id}`, { method: "DELETE" });
  await call(`/goods_receipts/${receipt.data.id}`, { method: "DELETE" });
  await call(`/products/${product.id}`, { method: "DELETE" });
  await call(`/suppliers/${supplier.id}`, { method: "DELETE" });
});

test("las notas rápidas se guardan y se pueden destacar", async () => {
  const created = await call("/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Preparar pedido urgente", content: "Comprobar cajas antes de cargar", priority: "Alta", module: "Envíos", important: 1 }) });
  assert.equal(created.status, 201);
  assert.equal(created.data.important, 1);
  const rows = (await call("/notes")).data;
  assert.ok(rows.some((x) => x.id === created.data.id && x.module === "Envíos"));
  const updated = await call(`/notes/${created.data.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...created.data, completed: 1 }) });
  assert.equal(updated.status, 200);
  await call(`/notes/${created.data.id}`, { method: "DELETE" });
});

test("una devolución queda pendiente y solo aumenta stock al aceptarse", async () => {
  const client = (await call("/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `__TEST_CLIENTE_DEVOLUCION_${Date.now()}__` }) })).data;
  const product = (await call("/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "__TEST_DEVOLUCION__", stock: 3 }) })).data;
  const before = (await call("/products")).data.find((x) => x.id === product.id).stock;
  const ret = await call("/returns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "__TEST_DEV_" + Date.now(), client_id: client.id, product_id: product.id, quantity: 2, reason: "Producto rechazado" }) });
  assert.equal(ret.status, 201);
  assert.equal(ret.data.status, "Pendiente");
  assert.equal(ret.data.client_name_snapshot, client.name);
  assert.equal(ret.data.product_name_snapshot, product.name);
  let after = (await call("/products")).data.find((x) => x.id === product.id).stock;
  assert.equal(after, before);
  const accepted = await call(`/returns/${ret.data.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ret.data, status: "Aceptada" }) });
  assert.equal(accepted.status, 200);
  after = (await call("/products")).data.find((x) => x.id === product.id).stock;
  assert.equal(after, before + 2);
  const acceptedAgain = await call(`/returns/${ret.data.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...accepted.data, status: "Aceptada" }) });
  assert.equal(acceptedAgain.status, 409);
  const afterAgain = (await call("/products")).data.find((x) => x.id === product.id).stock;
  assert.equal(afterAgain, before + 2);
  const orphanProduct = await call("/returns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "__TEST_DEV_PRODUCTO_HUERFANO_" + Date.now(), product_id: 999999999, quantity: 1 }) });
  assert.equal(orphanProduct.status, 400);
  const orphanClient = await call("/returns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "__TEST_DEV_CLIENTE_HUERFANO_" + Date.now(), client_id: 999999999, product_id: product.id, quantity: 1 }) });
  assert.equal(orphanClient.status, 400);
  await call(`/products/${product.id}`, { method: "DELETE" });
  await call(`/clients/${client.id}`, { method: "DELETE" });
  const historical = await call(`/returns/${ret.data.id}`);
  assert.equal(historical.data.client_name_snapshot, client.name);
  assert.equal(historical.data.product_name_snapshot, product.name);
  await call(`/returns/${ret.data.id}`, { method: "DELETE" });
  await call(`/clients/${client.id}`, { method: "DELETE" });
  await call(`/products/${product.id}`, { method: "DELETE" });
});

test("albaranes y envíos conservan sus nombres históricos de cliente y producto", async () => {
  const suffix = Date.now();
  const client = (await call("/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `__TEST_SNAPSHOT_CLIENTE_${suffix}__` }) })).data;
  const product = (await call("/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `__TEST_SNAPSHOT_PRODUCTO_${suffix}__`, stock: 20 }) })).data;
  let order, line, delivery, shipment;
  try {
    order = (await call("/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: `__TEST_SNAPSHOT_PEDIDO_${suffix}__`, client_id: client.id, status: "Pendiente" }) })).data;
    const lines = (await call("/shipments")).data;
    shipment = lines.find((row) => Number(row.order_id) === Number(order.id));
    assert.ok(shipment);
    assert.equal(shipment.client_name_snapshot, client.name);
    const lineResult = await call("/order_lines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: order.id, product_id: product.id, quantity: 2, unit_price: 3 }) });
    assert.equal(lineResult.status, 201);
    line = lineResult.data;
    assert.equal(line.product_name_snapshot, product.name);
    const created = await call(`/orders/convert-delivery/${order.id}`, { method: "POST" });
    assert.equal(created.status, 201);
    delivery = created.data;
    const storedDelivery = await call(`/delivery_notes/${delivery.id}`);
    assert.equal(storedDelivery.data.client_name_snapshot, client.name);
    const deliveryLines = (await call("/delivery_note_lines")).data;
    assert.ok(deliveryLines.some((row) => Number(row.delivery_note_id) === Number(delivery.id) && row.product_name_snapshot === product.name));
    await call(`/clients/${client.id}`, { method: "DELETE" });
    await call(`/products/${product.id}`, { method: "DELETE" });
    assert.equal((await call(`/shipments/${shipment.id}`)).data.client_name_snapshot, client.name);
    assert.equal((await call(`/delivery_notes/${delivery.id}`)).data.client_name_snapshot, client.name);
    assert.ok((await call("/delivery_note_lines")).data.some((row) => Number(row.delivery_note_id) === Number(delivery.id) && row.product_name_snapshot === product.name));
  } finally {
    if (delivery?.id) await call(`/delivery_notes/${delivery.id}`, { method: "DELETE" });
    if (shipment?.id) await call(`/shipments/${shipment.id}`, { method: "DELETE" });
    if (line?.id) await call(`/order_lines/${line.id}`, { method: "DELETE" });
    if (order?.id) await call(`/orders/${order.id}`, { method: "DELETE" });
    await call(`/products/${product.id}`, { method: "DELETE" });
    await call(`/clients/${client.id}`, { method: "DELETE" });
  }
});

test("un cobro inválido no altera la factura", async () => {
  const invoice = (await call("/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "__TEST_COBRO_INVALIDO_" + Date.now(), amount: 25, status: "Pendiente" }) })).data;
  const invalid = await call("/payments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoice_id: invoice.id, amount: 30, method: "Transferencia" }) });
  assert.equal(invalid.status, 400);
  const current = (await call("/invoices")).data.find((x) => x.id === invoice.id);
  assert.equal(current.status, "Pendiente");
  await call(`/invoices/${invoice.id}`, { method: "DELETE" });
});

test("impide duplicar una tarea programada activa", async () => {
  const title = `__TEST_TAREA_DUPLICADA_${Date.now()}__`;
  const task = await call("/scheduled_tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, action_text: "nota: comprobar pedidos", schedule_type: "Recurrente", recurrence: "diaria", next_run: "2099-01-01T08:00:00.000Z" }) });
  assert.equal(task.status, 201);
  const duplicate = await call("/scheduled_tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: ` ${title.toLowerCase()} `, action_text: "NOTA: COMPROBAR PEDIDOS", schedule_type: "Recurrente", recurrence: "diaria", next_run: "2099-01-01T08:00:00.000Z" }) });
  assert.equal(duplicate.status, 409);
  await call(`/scheduled_tasks/${task.data.id}`, { method: "DELETE" });
});
test("el ejecutor programado exige autorización", async () => {
  const r = await fetch("http://127.0.0.1:3001/api/scheduler/run");
  assert.equal(r.status, 401);
});

test("los cobros parciales actualizan el estado de la factura", async () => {
  const invoice = (await call("/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "__TEST_COBRO_" + Date.now(), amount: 100, status: "Pendiente" }) })).data;
  const partial = await call("/payments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoice_id: invoice.id, amount: 40, method: "Transferencia" }) });
  assert.equal(partial.status, 201);
  let current = (await call("/invoices")).data.find((x) => x.id === invoice.id);
  assert.equal(current.status, "Parcial");
  const final = await call("/payments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoice_id: invoice.id, amount: 60, method: "Transferencia" }) });
  assert.equal(final.status, 201);
  current = (await call("/invoices")).data.find((x) => x.id === invoice.id);
  assert.equal(current.status, "Cobrada");
  await call(`/payments/${partial.data.id}`, { method: "DELETE" });
  await call(`/payments/${final.data.id}`, { method: "DELETE" });
  await call(`/invoices/${invoice.id}`, { method: "DELETE" });
});

test("la base de datos permite descargar una copia", async () => {
  const r = await fetch("http://127.0.0.1:3001/api/backup");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-disposition") || "", /excluvas-.*\.sqlite/);
  const bytes = await r.arrayBuffer();
  assert.ok(bytes.byteLength > 1000);
});

test("planifica una ruta con varias entregas geolocalizadas", async () => {
  const suffix = Date.now();
  const clientA = (await call("/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `__TEST_RUTA_A_${suffix}`, address: "Calle A 1", city: "Palencia", latitude: 42.01, longitude: -4.52, geocoding_status: "Geolocalizada" }) })).data;
  const clientB = (await call("/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `__TEST_RUTA_B_${suffix}`, address: "Calle B 2", city: "Palencia", latitude: 42.02, longitude: -4.51, geocoding_status: "Geolocalizada" }) })).data;
  const shipmentA = (await call("/shipments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: `__TEST_RUTA_ENV_A_${suffix}`, client_id: clientA.id, address: clientA.address, delivery_city: clientA.city, expected_delivery_at: "2099-01-02", status: "Preparado" }) })).data;
  const shipmentB = (await call("/shipments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: `__TEST_RUTA_ENV_B_${suffix}`, client_id: clientB.id, address: clientB.address, delivery_city: clientB.city, expected_delivery_at: "2099-01-02", status: "Preparado" }) })).data;
  const route = await call("/routes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ route_date: "2099-01-02", shipment_ids: [shipmentA.id, shipmentB.id], radius_meters: 150, driver: "Luis" }) });
  assert.equal(route.status, 201);
  assert.equal(route.data.stops.length, 2);
  assert.equal(Number(route.data.radius_meters), 150);
  assert.match(route.data.maps_url, /google\.com\/maps\/dir/);
  const listed = await call(`/routes/${route.data.id}`);
  assert.equal(listed.status, 200);
  assert.equal(listed.data.stops[0].position, 1);
  await call(`/routes/${route.data.id}`, { method: "DELETE", headers: { "x-actor": "test" } });
  await call(`/shipments/${shipmentA.id}`, { method: "DELETE" });
  await call(`/shipments/${shipmentB.id}`, { method: "DELETE" });
  await call(`/clients/${clientA.id}`, { method: "DELETE" });
  await call(`/clients/${clientB.id}`, { method: "DELETE" });
});

test("crea y restaura una copia local con confirmación explícita", async () => {
  const created = await call("/backups", { method: "POST", headers: { "x-actor": "test" } });
  assert.equal(created.status, 201);
  assert.match(created.data.snapshot.code, /^BKP-/);
  const listed = await call("/backups");
  assert.ok(listed.data.some((row) => row.id === created.data.snapshot.id));
  const denied = await call(`/backups/${created.data.snapshot.id}/restore`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "NO" }) });
  assert.equal(denied.status, 400);
  const restored = await call(`/backups/${created.data.snapshot.id}/restore`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "RESTAURAR_TURSO" }) });
  assert.equal(restored.status, 200);
  assert.ok(restored.data.inserted > 0);
});
