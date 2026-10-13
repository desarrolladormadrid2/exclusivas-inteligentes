import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "https://exclusivas-inteligentes.vercel.app";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const request = page.request;
const headers = { "content-type": "application/json", "x-actor": "Playwright" };
const created = { suppliers: [], products: [], clients: [], collection_points: [], orders: [], purchase_orders: [], purchase_order_lines: [], notes: [], quotes: [], quote_lines: [], invoices: [], payments: [] };
const api = (resource, id = "") => `${baseUrl}/api/${resource}${id ? `/${id}` : ""}`;
async function call(resource, options = {}, id = "") {
  const response = await request.fetch(api(resource, id), options);
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok()) throw new Error(`${options.method || "GET"} ${resource}${id ? `/${id}` : ""}: ${response.status()} ${JSON.stringify(data)}`);
  return data;
}
async function create(resource, data) {
  const row = await call(resource, { method: "POST", headers, data });
  created[resource]?.push(Number(row.id));
  return row;
}
function assert(condition, message) { if (!condition) throw new Error(message); }
try {
  const suffix = Date.now();
  const supplier = await create("suppliers", { name: `PW-FLUJO-PROVEEDOR-${suffix}`, tax_id: `B${String(suffix).slice(-8)}`, contact: "Prueba funcional", active: 1 });
  const productA = await create("products", { name: `PW-FLUJO-PRODUCTO-A-${suffix}`, sku: `PW-FLUJO-A-${suffix}`, supplier_id: supplier.id, primary_supplier_id: supplier.id, unit_price: 8.5, cost_price: 4, stock: 30, stock_reserved: 0, min_stock: 5, category: "Pruebas funcionales" });
  const productB = await create("products", { name: `PW-FLUJO-PRODUCTO-B-${suffix}`, sku: `PW-FLUJO-B-${suffix}`, supplier_id: supplier.id, primary_supplier_id: supplier.id, unit_price: 3.25, cost_price: 1.5, stock: 40, stock_reserved: 0, min_stock: 5, category: "Pruebas funcionales" });
  const client = await create("clients", { name: `PW-FLUJO-CLIENTE-${suffix}`, phone: "600000000", email: `pw-${suffix}@example.test`, address: "Calle de Prueba 1, Madrid" });
  const point = await create("collection_points", { code: `PW-FLUJO-CP-${suffix}`, name: "Ubicación de prueba", client_id: client.id, address: "Calle de Prueba 2, Madrid", city: "Madrid" });
  const order = await create("orders", { code: `PW-FLUJO-PEDIDO-${suffix}`, client_id: client.id, collection_point_id: point.id, status: "Nuevo", lines: [
    { product_id: productA.id, quantity: 2, quantity_requested: 2, quantity_unit: "unidad", unit_price: 8.5, discount: 0, vat: 21, amount: 17 },
    { product_id: productB.id, quantity: 3, quantity_requested: 3, quantity_unit: "unidad", unit_price: 3.25, discount: 0, vat: 21, amount: 9.75 },
  ] });
  created.orders.push(Number(order.id));
  const orderLines = await call("order_lines?refresh=1");
  const lines = orderLines.filter((line) => Number(line.order_id) === Number(order.id));
  assert(lines.length === 2, `El pedido no conservó sus dos líneas: ${lines.length}`);
  const productsAfterOrder = await call("products?refresh=1");
  const rowA = productsAfterOrder.find((row) => Number(row.id) === Number(productA.id));
  const rowB = productsAfterOrder.find((row) => Number(row.id) === Number(productB.id));
  assert(Number(rowA.stock_reserved) === 2 && Number(rowB.stock_reserved) === 3, "Las reservas de las dos líneas no coinciden");
  await call("products", { method: "PUT", headers, data: { ...productA, warehouse_location: "PW-FLUJO-Z-999", description: "Producto editado durante la prueba funcional" } }, productA.id);
  const editedProduct = await call("products", {}, productA.id);
  assert(editedProduct.warehouse_location === "PW-FLUJO-Z-999", "La edición del producto no persistió");
  await call("clients", { method: "PUT", headers, data: { ...client, phone: "611111111" } }, client.id);
  const editedClient = await call("clients", {}, client.id);
  assert(editedClient.phone === "611111111", "La edición del cliente no persistió");
  const shipments = await call("shipments?refresh=1");
  const shipment = shipments.find((row) => Number(row.order_id) === Number(order.id));
  assert(shipment, "No se generó el envío del pedido");
  const preparedLine = await call("order_lines", { method: "PUT", headers, data: { ...lines[0], prepared: 1, prepared_quantity: 2, preparation_status: "Preparado" } }, lines[0].id);
  assert(Number(preparedLine.prepared) === 1, "No se pudo marcar la línea como preparada");
  const purchase = await create("purchase_orders", { code: `PW-FLUJO-COMPRA-${suffix}`, supplier_id: supplier.id, status: "Pedido", order_date: new Date().toISOString().slice(0, 10), lines: [{ product_id: productA.id, quantity: 5, unit_cost: 4, amount: 20 }] });
  const beforePurchase = Number((await call("products?refresh=1")).find((row) => Number(row.id) === Number(productA.id)).stock);
  await call("purchase_orders", { method: "PUT", headers, data: { code: purchase.code, supplier_id: purchase.supplier_id, status: "Recibida", order_date: purchase.order_date, expected_date: purchase.expected_date || "", amount: purchase.amount, notes: purchase.notes || "" } }, purchase.id);
  const afterPurchase = Number((await call("products?refresh=1")).find((row) => Number(row.id) === Number(productA.id)).stock);
  assert(afterPurchase === beforePurchase + 5, `La recepción no aumentó el stock: ${beforePurchase} -> ${afterPurchase}`);
  const quote = await create("quotes", { code: `PW-FLUJO-PRESUPUESTO-${suffix}`, client_id: client.id, amount: 17, status: "Borrador" });
  const quoteLine = await create("quote_lines", { quote_id: quote.id, product_id: productA.id, quantity: 2, unit_price: 8.5, amount: 17 });
  const quoteLines = await call("quote_lines?refresh=1");
  assert(quoteLines.some((line) => Number(line.id) === Number(quoteLine.id) && Number(line.quote_id) === Number(quote.id)), "No se guardó la línea del presupuesto");
  const invoice = await create("invoices", { code: `PW-FLUJO-FACTURA-${suffix}`, client_id: client.id, amount: 100, status: "Pendiente" });
  const paymentA = await create("payments", { invoice_id: invoice.id, amount: 40, method: "Transferencia" });
  const partialInvoice = (await call("invoices?refresh=1")).find((row) => Number(row.id) === Number(invoice.id));
  assert(partialInvoice?.status === "Parcial", `El cobro parcial no actualizó la factura: ${partialInvoice?.status}`);
  const paymentB = await create("payments", { invoice_id: invoice.id, amount: 60, method: "Transferencia" });
  const paidInvoice = (await call("invoices?refresh=1")).find((row) => Number(row.id) === Number(invoice.id));
  assert(paidInvoice?.status === "Cobrada", `El cobro final no actualizó la factura: ${paidInvoice?.status}`);
  const note = await create("notes", { title: `PW-FLUJO-NOTA-${suffix}`, content: "Incidencia funcional de prueba", module: "Preparación de pedidos", record_id: order.id, important: 1, priority: "Alta" });
  const completed = await call("notes", { method: "PUT", headers, data: { ...note, completed: 1 } }, note.id);
  assert(Number(completed.completed) === 1, "No se pudo completar la nota");
  await call("notes", { method: "DELETE", headers }, note.id);
  await call("trash", { method: "POST", headers, data: { table: "notes", id: note.id } }, "restore");
  const restoredNote = await call("notes", {}, note.id);
  assert(Number(restoredNote.deleted || 0) === 0, "No se pudo recuperar la nota desde papelera");
  const audit = await call("audit_logs?refresh=1");
  assert(audit.some((row) => String(row.resource || "").includes(`orders/${order.id}`)), "No se registró la auditoría del pedido");
  console.log(`PASS production functional flow: pedido ${order.id} · 2 líneas · preparación · compra recibida · nota · auditoría`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const id of created.payments) await call("payments", { method: "DELETE", headers }, id).catch(() => undefined);
  for (const id of created.invoices) await call("invoices", { method: "DELETE", headers }, id).catch(() => undefined);
  for (const id of created.quote_lines) await call("quote_lines", { method: "DELETE", headers }, id).catch(() => undefined);
  for (const id of created.quotes) await call("quotes", { method: "DELETE", headers }, id).catch(() => undefined);
  for (const id of created.notes) await call("notes", { method: "DELETE", headers }, id).catch(() => undefined);
  for (const id of created.purchase_orders) await call("purchase_orders", { method: "DELETE", headers }, id).catch(() => undefined);
  for (const id of created.purchase_order_lines) await call("purchase_order_lines", { method: "DELETE", headers }, id).catch(() => undefined);
  for (const id of created.orders) await call("orders", { method: "DELETE", headers }, id).catch(() => undefined);
  for (const id of created.collection_points) await call("collection_points", { method: "DELETE", headers }, id).catch(() => undefined);
  for (const id of created.clients) await call("clients", { method: "DELETE", headers }, id).catch(() => undefined);
  for (const id of created.products) await call("products", { method: "DELETE", headers }, id).catch(() => undefined);
  for (const id of created.suppliers) await call("suppliers", { method: "DELETE", headers }, id).catch(() => undefined);
  await browser.close();
}
