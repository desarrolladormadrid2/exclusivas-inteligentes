import fs from "node:fs";
import { createClient } from "@libsql/client";

const env = {};
const envPath = ".env.local";
if (!fs.existsSync(envPath)) throw new Error("No se encuentra .env.local. Ejecuta este script únicamente en el servidor que contiene las credenciales persistentes.");
for (const line of fs.readFileSync(envPath, "utf8").split(String.fromCharCode(10))) {
  const separator = line.indexOf("=");
  if (separator > 0) env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
}
if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error("Faltan las credenciales de la base de datos en el entorno del servidor.");

const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
const marker = "DEMO-CARGA-20260911";
const preparationDate = "2026-09-11";
const now = new Date().toISOString();
const columnCache = new Map();
const columnsFor = async (table) => {
  if (!columnCache.has(table)) columnCache.set(table, new Set((await db.execute(`PRAGMA table_info(${table})`)).rows.map((row) => String(row.name))));
  return columnCache.get(table);
};
const insert = async (table, values) => {
  const columns = await columnsFor(table);
  const entries = Object.entries(values).filter(([key, value]) => columns.has(key) && value !== undefined);
  const result = await db.execute({ sql: `INSERT INTO ${table}(${entries.map(([key]) => key).join(",")}) VALUES(${entries.map(() => "?").join(",")})`, args: entries.map(([, value]) => value) });
  return Number(result.lastInsertRowid || 0);
};
const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;

try {
  const existing = await rows("SELECT id FROM orders WHERE code LIKE ? LIMIT 1", [`${marker}-%`]);
  if (existing.length) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "La carga colectiva de demostración ya estaba creada", marker }));
    process.exit(0);
  }
  const clients = await rows("SELECT id,name,address,city FROM clients WHERE COALESCE(deleted,0)=0 AND (name LIKE ? OR external_code LIKE ?) ORDER BY id LIMIT 8", ["Demo Semana%", "DEMO-%"]);
  const products = await rows("SELECT id,name,sku,unit_price,units_per_case,unit,warehouse_location FROM products WHERE COALESCE(deleted,0)=0 AND (name LIKE ? OR external_code LIKE ?) ORDER BY warehouse_location,id LIMIT 8", ["Demo Semana%", "DEMO-%"]);
  if (clients.length < 3 || products.length < 3) throw new Error("No hay suficientes clientes y productos DEMO para crear la muestra sin usar datos reales.");
  const points = await rows("SELECT id,client_id,address,city FROM collection_points WHERE COALESCE(deleted,0)=0 AND client_id IN (" + clients.map(() => "?").join(",") + ") ORDER BY id", clients.map((client) => client.id));
  const pointByClient = new Map(points.map((point) => [Number(point.client_id), point]));
  const created = [];
  await db.execute("BEGIN");
  try {
    for (let orderIndex = 0; orderIndex < 8; orderIndex += 1) {
      const client = clients[orderIndex % clients.length];
      const point = pointByClient.get(Number(client.id));
      const selectedProducts = [products[orderIndex % products.length], products[(orderIndex + 2) % products.length], products[(orderIndex + 4) % products.length]].filter((product, index, list) => product && list.findIndex((item) => Number(item.id) === Number(product.id)) === index);
      const lineData = selectedProducts.map((product, lineIndex) => {
        const quantity = 4 + ((orderIndex + lineIndex) % 5) * 2;
        const unitPrice = Number(product.unit_price || 0);
        return { product, quantity, unitPrice, amount: Number((quantity * unitPrice).toFixed(2)) };
      });
      const amount = Number(lineData.reduce((total, line) => total + line.amount, 0).toFixed(2));
      const orderId = await insert("orders", { code: `${marker}-${String(orderIndex + 1).padStart(2, "0")}`, client_id: client.id, collection_point_id: point?.id || null, amount, status: orderIndex % 3 === 0 ? "Nuevo" : orderIndex % 3 === 1 ? "Pendiente" : "Confirmado", created_at: `${preparationDate}T${String(8 + (orderIndex % 4)).padStart(2, "0")}:00:00.000Z`, updated_at: now, product_id: lineData[0]?.product.id, quantity: lineData[0]?.quantity || 0, unit_price: lineData[0]?.unitPrice || 0, discount: 0, vat: 21, delivery_date: preparationDate, preparation_date: preparationDate, shipping_date: preparationDate, address: point?.address || client.address || "", delivery_city: point?.city || client.city || "", urgent: orderIndex % 5 === 0 ? 1 : 0, created_by: "Codex demo", notes: "DEMO visual · pedido para probar la orden de carga colectiva." });
      for (const line of lineData) await insert("order_lines", { order_id: orderId, product_id: line.product.id, quantity: line.quantity, quantity_requested: line.quantity, quantity_unit: line.product.unit || "unidad", units_factor: line.product.units_per_case || 1, unit_price: line.unitPrice, discount: 0, vat: 21, amount: line.amount, prepared: 0, prepared_quantity: 0, preparation_status: "Pendiente", lot_code: `DEMO-L-${String(orderIndex + 1).padStart(2, "0")}`, expiry_date: "2027-09-01", created_at: now, updated_at: now });
      created.push({ code: `${marker}-${String(orderIndex + 1).padStart(2, "0")}`, lines: lineData.length });
    }
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK").catch(() => undefined);
    throw error;
  }
  console.log(JSON.stringify({ ok: true, marker, preparationDate, orders: created.length, lines: created.reduce((total, order) => total + order.lines, 0) }));
} finally {
  await db.close();
}
