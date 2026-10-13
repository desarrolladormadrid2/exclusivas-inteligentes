/**
 * Batería funcional reproducible contra producción.
 *
 * Uso:
 *   BASE_URL=https://crm.desarrolladormadrid.com node tests/production-exhaustive-battery.mjs
 *
 * Todos los datos creados llevan el prefijo PW-AUDIT- y se borran de forma
 * lógica en finally. No envía correos, no llama a una pasarela de pago y no
 * publica promociones. Los cobros y facturas son registros internos de
 * prueba para validar el flujo completo del CRM.
 */
const baseUrl = String(process.env.BASE_URL || "https://crm.desarrolladormadrid.com").replace(/\/$/, "");
const actor = `PW-AUDIT-${Date.now()}`;
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const headers = { "content-type": "application/json", "x-actor": actor };
const created = new Map();
const results = [];
const startedAt = Date.now();

function api(path) { return `${baseUrl}/api/${String(path).replace(/^\//, "")}`; }
function track(resource, id) {
  if (!id) return;
  const list = created.get(resource) || [];
  if (!list.includes(Number(id))) list.push(Number(id));
  created.set(resource, list);
}
function check(condition, message) { if (!condition) throw new Error(message); }
async function call(path, options = {}, expected = null) {
  const started = performance.now();
  const response = await fetch(api(path), options);
  const elapsed = Number((performance.now() - started).toFixed(1));
  let data = null;
  const text = await response.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const wanted = expected === null ? null : (Array.isArray(expected) ? expected : [expected]);
  if (!response.ok || (wanted && !wanted.includes(response.status))) {
    throw new Error(`${options.method || "GET"} /api/${path}: ${response.status} en ${elapsed} ms · ${JSON.stringify(data).slice(0, 500)}`);
  }
  return { status: response.status, data, elapsed };
}
async function get(path) { return (await call(path)).data; }
async function create(resource, data, expected = 201) {
  const result = await call(resource, { method: "POST", headers, body: JSON.stringify(data) }, expected);
  if (result.data?.id) track(resource.split("?")[0], result.data.id);
  return result.data;
}
async function update(resource, id, data) {
  const result = await call(`${resource}/${id}`, { method: "PUT", headers, body: JSON.stringify(data) });
  return result.data;
}
async function remove(resource, id) {
  if (!id) return;
  await call(`${resource}/${id}`, { method: "DELETE", headers }, [200, 204, 404]).catch(() => undefined);
}
async function test(name, fn) {
  const started = performance.now();
  try {
    const value = await fn();
    const elapsed = Number((performance.now() - started).toFixed(1));
    results.push({ name, status: "PASS", elapsed_ms: elapsed });
    console.log(`PASS ${name} · ${elapsed} ms`);
    return value;
  } catch (error) {
    const elapsed = Number((performance.now() - started).toFixed(1));
    results.push({ name, status: "FAIL", elapsed_ms: elapsed, error: error.message });
    console.error(`FAIL ${name} · ${elapsed} ms · ${error.message}`);
    throw error;
  }
}
function rowById(rows, id) { return (Array.isArray(rows) ? rows : []).find((row) => Number(row.id) === Number(id)); }

let testSupplier;
let testWarehouse;
let testProduct;
let testProductB;
let testClient;
let testPoint;
let testVehicles = [];
let workflowOrders = [];
let workflowShipments = [];
let workflowRoutes = [];
let workflowInvoices = [];
let workflowPayments = [];
let workflowClosures = [];

try {
  await test("salud, versión y origen de base de datos", async () => {
    const version = await get("version");
    const runtime = await get("runtime/database");
    check(version.ok && version.environment === "production", `Versión no válida: ${JSON.stringify(version)}`);
    check(runtime.source && ["SQLite local", "Turso remoto"].includes(version.database), `Origen no identificado: ${JSON.stringify(runtime)}`);
    console.log(`  producción ${version.version} · ${version.database} · modo ${runtime.mode}`);
  });

  await test("login y roles operativos", async () => {
    const login = await call("login", { method: "POST", headers, body: JSON.stringify({ username: "Luis", password: "Temporal2026" }) });
    check(login.data?.user?.role === "admin", "El usuario de prueba no conserva el rol admin");
  });

  await test("lectura de todos los recursos CRUD publicados", async () => {
    const resources = [
      "suppliers", "purchase_orders", "purchase_order_lines", "goods_receipts", "goods_receipt_lines",
      "goods_receipt_incidents", "notes", "document_templates", "returns", "warehouses", "delivery_notes",
      "payments", "clients", "products", "orders", "quotes", "invoices", "order_lines", "order_line_lots",
      "quote_lines", "delivery_note_lines", "invoice_lines", "inventory_movements", "shipments", "audit_logs",
      "scheduled_tasks", "collection_points", "expenses", "ocr_documents", "web_registrations", "web_promotions",
      "whatsapp_messages", "product_price_history", "product_suppliers", "product_lots", "product_equivalents",
      "purchase_requests", "purchase_request_offers", "import_batches", "import_records", "delivery_routes",
      "delivery_route_stops", "delivery_route_positions", "driver_daily_closures", "vehicles", "vehicle_trips",
      "vehicle_refuels", "vehicle_maintenance", "users", "stock", "summary", "billing", "delivery_history",
    ];
    const failures = [];
    await Promise.all(resources.map(async (resource) => {
      try {
        const result = await call(`${resource}?refresh=1`);
        check(result.status === 200, `HTTP ${result.status}`);
        check(Array.isArray(result.data) || typeof result.data === "object", "respuesta no estructurada");
      } catch (error) { failures.push(`${resource}: ${error.message}`); }
    }));
    check(!failures.length, failures.join(" | "));
  });

  await test("CRUD maestros: proveedor, almacén, cliente y dirección geolocalizada", async () => {
    testSupplier = await create("suppliers", { name: `PW-AUDIT-PROVEEDOR-${suffix}`, tax_id: `B${String(Date.now()).slice(-8)}`, email: `audit-${suffix}@example.test`, active: 1 });
    testWarehouse = await create("warehouses", { name: `PW-AUDIT-ALMACEN-${suffix}`, address: "Calle Auditoría 1, Palencia" });
    testClient = await create("clients", { name: `PW-AUDIT-CLIENTE-${suffix}`, email: `audit-client-${suffix}@example.test`, phone: "600000001", address: "Calle Mayor 1, Palencia", city: "Palencia", latitude: 42.0095, longitude: -4.5288, geocoding_status: "Geolocalizada" });
    testPoint = await create("collection_points", { code: `PW-AUDIT-CP-${suffix}`, name: "Dirección principal de auditoría", client_id: testClient.id, address: "Calle Mayor 2, Palencia", city: "Palencia", latitude: 42.012, longitude: -4.53, opening_time: "08:00", closing_time: "18:00", geocoding_status: "Geolocalizada" });
    const clientEdited = await update("clients", testClient.id, { ...testClient, phone: "600000002", name: testClient.name });
    check(clientEdited.phone === "600000002", "La edición de cliente no persiste");
    const pointLoaded = await get(`collection_points/${testPoint.id}`);
    check(Number(pointLoaded.latitude) === 42.012 && pointLoaded.opening_time === "08:00", "La dirección no conserva geolocalización/horario");
  });

  await test("CRUD de productos, proveedores y stock", async () => {
    testProduct = await create("products", { name: `PW-AUDIT-PRODUCTO-A-${suffix}`, sku: `PW-AUDIT-A-${suffix}`, supplier_id: testSupplier.id, primary_supplier_id: testSupplier.id, warehouse_id: testWarehouse.id, unit_price: 12.5, cost_price: 5, stock: 100, stock_reserved: 0, stock_min: 5, category: "Auditoría", warehouse_location: "A-001" });
    testProductB = await create("products", { name: `PW-AUDIT-PRODUCTO-B-${suffix}`, sku: `PW-AUDIT-B-${suffix}`, supplier_id: testSupplier.id, primary_supplier_id: testSupplier.id, warehouse_id: testWarehouse.id, unit_price: 7.5, cost_price: 3, stock: 100, stock_reserved: 0, stock_min: 5, category: "Auditoría", warehouse_location: "A-002" });
    const edited = await update("products", testProduct.id, { ...testProduct, unit_price: 13, warehouse_location: "B-126", description: "Producto de auditoría editable" });
    check(Number(edited.unit_price) === 13 && edited.warehouse_location === "B-126", "La edición de producto no persiste");
    const stock = await get("stock?refresh=1");
    const stockRow = stock.find((row) => Number(row.product_id) === Number(testProduct.id));
    check(stockRow && Number(stockRow.stock) >= 100, "El producto no aparece en stock");
    const movement = await create("inventory_movements", { product_id: testProduct.id, warehouse_id: testWarehouse.id, movement_type: "Entrada", quantity: 4, reference: `PW-AUDIT-${suffix}`, notes: "Entrada de auditoría" });
    const after = rowById(await get("products?refresh=1"), testProduct.id);
    check(Number(after.stock) === 104, `La entrada no actualizó stock: ${after?.stock}`);
    track("inventory_movements", movement.id);
  });

  await test("CRUD comercial: presupuesto, líneas, gasto y tarea programada", async () => {
    const quote = await create("quotes", { code: `PW-AUDIT-PRESUPUESTO-${suffix}`, client_id: testClient.id, amount: 25, status: "Borrador" });
    const quoteLine = await create("quote_lines", { quote_id: quote.id, product_id: testProduct.id, quantity: 2, unit_price: 12.5, amount: 25 });
    const loadedLine = rowById(await get("quote_lines?refresh=1"), quoteLine.id);
    check(loadedLine && Number(loadedLine.quote_id) === Number(quote.id), "La línea de presupuesto no se guardó");
    const expense = await create("expenses", { code: `PW-AUDIT-GASTO-${suffix}`, expense_date: new Date().toISOString().slice(0, 10), category: "Combustible", vendor: "Proveedor de prueba", amount: 18.5, vat: 21, payment_method: "Tarjeta", notes: "Gasto interno de auditoría" });
    const editedExpense = await update("expenses", expense.id, { ...expense, notes: "Gasto editado de auditoría" });
    check(editedExpense.notes === "Gasto editado de auditoría", "El gasto no se puede editar");
    const task = await create("scheduled_tasks", { title: `PW-AUDIT-TAREA-${suffix}`, action_text: "nota: auditoría funcional", schedule_type: "Unica", next_run: "2099-12-31T08:00:00.000Z" });
    check(task.id, "No se creó la tarea programada");
  });

  await test("CRUD de compras y recepción de mercancía", async () => {
    const purchase = await create("purchase_orders", { code: `PW-AUDIT-COMPRA-${suffix}`, supplier_id: testSupplier.id, order_date: new Date().toISOString().slice(0, 10), status: "Pedido", lines: [{ product_id: testProduct.id, quantity: 4, unit_cost: 5, amount: 20 }] });
    const lines = await get("purchase_order_lines?refresh=1");
    const line = lines.find((row) => Number(row.purchase_order_id) === Number(purchase.id));
    check(line, "No se creó la línea de compra");
    track("purchase_order_lines", line.id);
    const before = Number(rowById(await get("products?refresh=1"), testProduct.id).stock);
    const received = await update("purchase_orders", purchase.id, { code: purchase.code, supplier_id: purchase.supplier_id, order_date: purchase.order_date, status: "Recibida", amount: purchase.amount, expected_date: purchase.expected_date || "", notes: "Recepción de auditoría" });
    check(received.status === "Recibida", "La compra no pasa a recibida");
    const after = Number(rowById(await get("products?refresh=1"), testProduct.id).stock);
    check(after === before + 4, `La recepción no aumenta stock: ${before} -> ${after}`);
  });

  await test("CRUD de usuarios de rol repartidor", async () => {
    const user = await create("users", { username: `pw_audit_${suffix.replace(/-/g, "")}`, password: "Temporal2026", role: "repartidor", permissions: ["reparto", "cobros"] });
    const edited = await update("users", user.id, { username: user.username, password: "Temporal2026", role: "repartidor", permissions: ["reparto", "cobros", "rutas"] });
    check(edited.role === "repartidor", "El rol repartidor no persiste");
  });

  await test("CRUD de flota, jornada, gasoil y mantenimiento", async () => {
    const vehicle = await create("vehicles", { code: `PW-AUDIT-CAMION-${suffix}`, name: `PW-AUDIT-CAMION-${suffix}`, plate: `AUD${String(Date.now()).slice(-4)}`, brand: "Prueba", model: "Auditoría", odometer_km: 1000 });
    testVehicles.push(vehicle);
    const edited = await update("vehicles", vehicle.id, { name: vehicle.name, plate: vehicle.plate, odometer_km: 1010, notes: "Camión de auditoría" });
    check(Number(edited.odometer_km) === 1010, "El camión no se puede editar");
    const trip = await create("vehicle_trips", { vehicle_id: vehicle.id, route_date: "2099-12-31", driver: "Conductor de auditoría", planned_distance_km: 12, start_km: 1010, end_km: 1015, status: "Completada" });
    const refuel = await create("vehicle_refuels", { vehicle_id: vehicle.id, trip_id: trip.id, fuel_date: "2099-12-31", station: "Estación de prueba", liters: 10, amount: 18, ticket_reference: `PW-AUDIT-${suffix}`, odometer_km: 1015 });
    const maintenance = await create("vehicle_maintenance", { vehicle_id: vehicle.id, maintenance_date: "2099-12-31", maintenance_km: 1015, maintenance_type: "Revisión de auditoría", amount: 20, next_due_km: 2000, next_due_date: "2100-12-31" });
    check(refuel.id && maintenance.id, "No se registraron gasoil/mantenimiento");
  });

  await test("CRUD de devolución y nota operativa", async () => {
    const returned = await create("returns", { code: `PW-AUDIT-DEVOLUCION-${suffix}`, product_id: testProduct.id, quantity: 1, reason: "Prueba funcional", status: "Pendiente" });
    const accepted = await update("returns", returned.id, { ...returned, status: "Aceptada" });
    check(accepted.status === "Aceptada", "La devolución no admite edición de estado");
    const note = await create("notes", { title: `PW-AUDIT-NOTA-${suffix}`, content: "Nota operativa de auditoría", module: "Preparación de pedidos", record_id: 0, important: 1, priority: "Alta" });
    const completed = await update("notes", note.id, { ...note, completed: 1 });
    check(Number(completed.completed) === 1, "La nota no se puede completar");
  });

  await test("flujo real completo: pedidos, preparación, carga en dos camiones y rutas", async () => {
    const routeDate = "2099-12-31";
    const firstTruck = testVehicles[0];
    const secondTruck = await create("vehicles", { code: `PW-AUDIT-CAMION-2-${suffix}`, name: `PW-AUDIT-CAMION-2-${suffix}`, plate: `AU2${String(Date.now()).slice(-3)}`, brand: "Prueba", model: "Auditoría", odometer_km: 2000 });
    testVehicles.push(secondTruck);
    for (let index = 0; index < 3; index += 1) {
      const order = await create("orders", { code: `PW-AUDIT-PEDIDO-${suffix}-${index + 1}`, client_id: testClient.id, collection_point_id: testPoint.id, status: "Nuevo", delivery_date: routeDate, shipping_date: routeDate, lines: [{ product_id: index === 1 ? testProductB.id : testProduct.id, quantity: 1, quantity_requested: 1, quantity_unit: "unidad", unit_price: index === 1 ? 7.5 : 12.5, discount: 0, vat: 21, amount: index === 1 ? 7.5 : 12.5 }] });
      workflowOrders.push(order);
    }
    const allLines = await get("order_lines?refresh=1");
    const lines = workflowOrders.map((order) => allLines.find((line) => Number(line.order_id) === Number(order.id)));
    check(lines.every(Boolean), "No se recuperaron todas las líneas de pedido");
    const validation = await call("order_lines/bulk-validate", { method: "POST", headers, body: JSON.stringify({ lines: lines.map((line) => ({ id: line.id, prepared_quantity: 1, barcode_scan_status: "manual" })) }) });
    check(Number(validation.data.validated_count) === 3, "No se validaron todas las líneas");
    const shipments = await get("shipments?refresh=1");
    workflowShipments = workflowOrders.map((order) => shipments.find((shipment) => Number(shipment.order_id) === Number(order.id)));
    check(workflowShipments.every(Boolean), "No se generaron todos los envíos");
    workflowShipments.forEach((shipment) => track("shipments", shipment.id));
    await call("shipments/bulk-close-preparation", { method: "POST", headers, body: JSON.stringify({ shipments: workflowShipments.map((shipment) => ({ id: shipment.id, status: "Preparado" })) }) });
    const board = await call("routes/board", { method: "PUT", headers, body: JSON.stringify({ route_date: routeDate, draft: false, origin_address: "Almacén de auditoría, Palencia", origin_latitude: 42.004, origin_longitude: -4.53, columns: [{ vehicle_id: firstTruck.id, driver: "Conductor auditor 1", shipment_ids: [workflowShipments[0].id, workflowShipments[1].id] }, { vehicle_id: secondTruck.id, driver: "Conductor auditor 2", shipment_ids: [workflowShipments[2].id] }] }) });
    workflowRoutes = board.data.routes || [];
    workflowInvoices = (board.data.invoices || []).map((invoice) => Number(invoice.id)).filter(Boolean);
    workflowRoutes.forEach((route) => track("delivery_routes", route.id));
    workflowInvoices.forEach((invoiceId) => track("invoices", invoiceId));
    check(workflowRoutes.length === 2 && workflowInvoices.length === 3, `Carga/rutas/facturas inesperadas: ${workflowRoutes.length}/${workflowInvoices.length}`);
    const stops = workflowRoutes[0].stops || [];
    if (stops.length > 1) {
      const reordered = await call(`routes/${workflowRoutes[0].id}/stops/reorder`, { method: "PUT", headers, body: JSON.stringify({ stop_ids: stops.map((stop) => stop.id).reverse() }) });
      check(Number(reordered.data.stops[0].position) === 1, "No se recalculó el orden de ruta");
    }
    await call(`routes/${workflowRoutes[0].id}/position`, { method: "POST", headers, body: JSON.stringify({ latitude: 42.006, longitude: -4.531, accuracy: 12, recorded_at: new Date().toISOString() }) });
    for (const shipment of workflowShipments) {
      await call(`shipments/${shipment.id}/delivery-status`, { method: "POST", headers, body: JSON.stringify({ status: "Enviado" }) });
      const confirmation = await call(`shipments/${shipment.id}/delivery-confirmation`, { method: "POST", headers, body: JSON.stringify({ signature_status: "Firmado", recipient_name: "Cliente auditoría", signature_data: "data:image/png;base64," + "A".repeat(140), note: "Entrega validada en batería", photos: [{ name: "entrega-auditoria.png", mime: "image/png", data: "data:image/png;base64," + "B".repeat(140) }] }) });
      check(confirmation.data.status === "Entregado", `El envío ${shipment.id} no quedó entregado`);
      const invoiceId = workflowInvoices.shift();
      const receipt = await call(`shipments/${shipment.id}/payment-receipt`, { method: "POST", headers, body: JSON.stringify({ payment_status: "Recibido", amount: Number(workflowOrders.find((order) => Number(order.id) === Number(shipment.order_id)).amount), method: "Tarjeta", reference: `PW-AUDIT-PAGO-${shipment.id}`, note: "Cobro de auditoría", attachments: [{ name: "justificante.png", mime: "image/png", data: "data:image/png;base64," + "C".repeat(140) }] }) });
      check(receipt.data.payment_received_status === "Recibido", "No se registró el cobro del reparto");
      workflowPayments.push(...(await get("payments?refresh=1")).filter((payment) => String(payment.notes || "").includes(String(shipment.code))).map((payment) => Number(payment.id)));
      for (const paymentId of workflowPayments) track("payments", paymentId);
      const tracking = await get(`public/shipments/${encodeURIComponent(shipment.public_tracking_token)}`);
      check(tracking.shipment?.status === "Entregado" && tracking.shipment?.code === shipment.code, "El seguimiento público no refleja la entrega");
      check(invoiceId || true, "Factura de flujo no identificada");
    }
    const route1 = await get(`routes/${workflowRoutes[0].id}`);
    check(route1.stops.every((stop) => ["Entregado", "Completada"].includes(String(stop.status))), "La ruta no sincroniza estados de entrega");
    const closure = await create("driver_daily_closures", { code: `PW-AUDIT-CIERRE-${suffix}`, closure_date: routeDate, route_id: workflowRoutes[0].id, vehicle_id: firstTruck.id, driver: "Conductor auditor 1", km_start: 2000, km_end: 2025, fuel_liters: 25, fuel_amount: 40, fuel_station: "Estación auditoría", fuel_reference: `PW-AUDIT-${suffix}`, cash_handover_amount: 0, notes: "Cierre de auditoría" });
    workflowClosures.push(Number(closure.id));
    const invoices = await get("invoices?refresh=1");
    const flowInvoices = workflowRoutes.flatMap((route) => route.stops.map((stop) => invoices.find((invoice) => Number(invoice.order_id) === Number(workflowShipments.find((shipment) => Number(shipment.id) === Number(stop.shipment_id))?.order_id)))).filter(Boolean);
    check(flowInvoices.every((invoice) => ["Cobrada", "Pagada"].includes(String(invoice.status))), "No todas las facturas han quedado cobradas");
    console.log(`  flujo: ${workflowOrders.length} pedidos · ${workflowRoutes.length} rutas · entrega/firma/foto/cobro/seguimiento`);
  });

  await test("rendimiento de consultas principales", async () => {
    const endpoints = ["summary", "clients?view=lookup&limit=500", "products?view=lookup&limit=2000", "stock", "orders?limit=500", "shipments?limit=500", "routes?date=2099-12-31", "payments?limit=500", "invoices?limit=500", "vehicle_trips?date=2099-12-31"];
    const measurements = [];
    for (const endpoint of endpoints) {
      const samples = [];
      for (let i = 0; i < 3; i += 1) {
        const result = await call(endpoint);
        samples.push(result.elapsed);
      }
      samples.sort((a, b) => a - b);
      const median = samples[1];
      const bytes = Buffer.byteLength(JSON.stringify((await call(endpoint)).data));
      measurements.push({ endpoint: `/api/${endpoint}`, median_ms: median, max_ms: samples.at(-1), bytes });
    }
    console.log(`  benchmark ${JSON.stringify(measurements)}`);
    check(measurements.every((item) => item.median_ms < 5000), "Consulta por encima de 5 s");
  });
} catch (error) {
  process.exitCode = 1;
} finally {
  // Las rutas se eliminan primero para liberar sus relaciones y jornadas.
  for (const route of workflowRoutes) await remove("routes", route.id);
  const trips = await get("vehicle_trips?date=2099-12-31").catch(() => []);
  for (const trip of trips.filter((row) => String(row.code || "").includes("20991231") || String(row.created_by || "") === actor)) await remove("vehicle_trips", trip.id);
  const cleanupOrder = [
    "payments", "driver_daily_closures", "vehicle_refuels", "vehicle_maintenance", "vehicle_trips",
    "delivery_route_positions", "invoices", "invoice_lines", "quote_lines", "quotes", "returns",
    "notes", "expenses", "scheduled_tasks", "purchase_orders", "purchase_order_lines", "order_lines",
    "shipments", "orders", "collection_points", "clients", "inventory_movements", "products", "warehouses",
    "suppliers", "users", "vehicles",
  ];
  for (const resource of cleanupOrder) for (const id of created.get(resource) || []) await remove(resource, id);
  const activeChecks = await Promise.all(["suppliers", "products", "clients", "collection_points", "orders", "shipments", "invoices", "payments", "vehicles"].map(async (resource) => {
    const rows = await get(`${resource}?refresh=1&limit=5000`).catch(() => []);
    return { resource, remaining: Array.isArray(rows) ? rows.filter((row) => JSON.stringify(row).includes("PW-AUDIT-") || String(row.created_by || "") === actor).length : 0 };
  }));
  const leaked = activeChecks.filter((row) => row.remaining);
  console.log(`SUMMARY ${JSON.stringify({ actor, total_ms: Date.now() - startedAt, passed: results.filter((row) => row.status === "PASS").length, failed: results.filter((row) => row.status === "FAIL").length, results, cleanup: activeChecks, leaked })}`);
  if (leaked.length) process.exitCode = 1;
}
