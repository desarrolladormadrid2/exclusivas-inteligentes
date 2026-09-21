import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@libsql/client";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Uso: node scripts/import-real-master-data.mjs <datos-normalizados.json>");

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const separator = line.indexOf("=");
  if (separator > 0) env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
}
if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error("Faltan las credenciales de Turso en .env.local");

const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const sourceSystem = String(source.source_system || "BC_NAV_REAL");
const sourceFiles = source.source_files || {};
const clientSourceRows = new Map();
const actor = "Importación datos reales · BC NAV";
const now = new Date().toISOString();
const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

async function execute(sql, args = []) {
  return client.execute({ sql, args });
}

async function batch(statements) {
  for (let index = 0; index < statements.length; index += 100) {
    await client.batch(statements.slice(index, index + 100), "write");
  }
}

function hash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function sqlStatement(sql, args) {
  if (sql.includes("INSERT INTO clients") && Array.isArray(args)) {
    const nextArgs = [...args];
    const sourceRow = clientSourceRows.get(String(nextArgs[10] || ""));
    if (sourceRow) {
      nextArgs[3] = sourceRow.address || "";
      nextArgs[6] = sourceRow.city || "";
      sql = sql.replace("name=excluded.name,phone=excluded.phone,", "name=excluded.name,phone=excluded.phone,address=excluded.address,city=excluded.city,");
    }
    return { sql, args: nextArgs };
  }
  return { sql, args };
}

function idFromRow(row) {
  return Number(row?.id ?? row?.[0] ?? 0);
}

async function existingMap(table) {
  const result = await execute(`SELECT id,external_code FROM ${table} WHERE source_system=? AND NULLIF(TRIM(COALESCE(external_code,'')),'') IS NOT NULL`, [sourceSystem]);
  return new Map(result.rows.map((row) => [String(row.external_code), idFromRow(row)]));
}

async function createBatch(entity, sourceFile, rowsRead, notes) {
  const runStamp = now.replace(/[^0-9]/g, "").slice(0, 17);
  const code = `IMP-${sourceSystem}-${entity.toUpperCase()}-${runStamp}`;
  const result = await execute(
    "INSERT INTO import_batches(code,source_system,source_file,entity,status,rows_read,started_at,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id,code",
    [code, sourceSystem, sourceFile, entity, "En curso", rowsRead, now, notes, actor, now],
  );
  return { id: idFromRow(result.rows[0]), code };
}

async function finishBatch(batchInfo, counts, notes) {
  await execute(
    "UPDATE import_batches SET status=?,rows_inserted=?,rows_updated=?,rows_skipped=?,completed_at=?,notes=? WHERE id=?",
    ["Completada", counts.inserted, counts.updated, counts.skipped, new Date().toISOString(), notes, batchInfo.id],
  );
  await execute(
    "INSERT INTO audit_logs(actor,method,resource,action,details,created_at) VALUES(?,?,?,?,?,?)",
    [actor, "IMPORT", `import_batches/${batchInfo.id}`, "Importación completada", JSON.stringify({ code: batchInfo.code, ...counts }), new Date().toISOString()],
  );
}

async function saveImportRecords(batchInfo, entity, sourceFile, records) {
  await batch(records.map((record) => sqlStatement(
    "INSERT INTO import_records(batch_id,entity,source_code,local_id,action,payload_hash,source_file,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [batchInfo.id, entity, record.source_code || null, record.local_id || null, record.action, record.payload_hash || null, sourceFile, record.notes || null, now],
  )));
}

async function supplierImport() {
  const rows = Array.isArray(source.suppliers) ? source.suppliers : [];
  const sourceFile = String(sourceFiles.suppliers || "Proveedores.xlsx");
  const info = await createBatch("suppliers", sourceFile, rows.length, "Altas y actualización por código externo; se conservan duplicados de CIF.");
  const before = await existingMap("suppliers");
  const statements = rows.map((row) => sqlStatement(
    `INSERT INTO suppliers(name,phone,email,address,tax_id,contact,payment_terms,active,external_code,source_system,source_warehouse_code,source_created_at,source_closed_at,source_balance,source_overdue_balance,source_payments,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(source_system,external_code) DO UPDATE SET name=excluded.name,phone=excluded.phone,tax_id=excluded.tax_id,contact=excluded.contact,payment_terms=excluded.payment_terms,active=excluded.active,source_warehouse_code=excluded.source_warehouse_code,source_created_at=excluded.source_created_at,source_closed_at=excluded.source_closed_at,source_balance=excluded.source_balance,source_overdue_balance=excluded.source_overdue_balance,source_payments=excluded.source_payments,updated_at=excluded.updated_at`,
    [row.name, row.phone, "", "", row.tax_id, row.contact, "Pendiente de confirmar", row.active, row.source_code, sourceSystem, row.warehouse_code, null, null, row.balance, row.overdue_balance, row.payments, now, now],
  ));
  await batch(statements);
  const after = await existingMap("suppliers");
  const records = rows.map((row) => ({ source_code: row.source_code, local_id: after.get(row.source_code), action: before.has(row.source_code) ? "UPDATE" : "INSERT", payload_hash: hash(row) }));
  await saveImportRecords(info, "suppliers", sourceFile, records);
  const counts = { inserted: rows.filter((row) => !before.has(row.source_code)).length, updated: rows.filter((row) => before.has(row.source_code)).length, skipped: 0 };
  await finishBatch(info, counts, "Proveedores cargados; los saldos originales quedan en campos source_* y no sustituyen la contabilidad.");
  return { ...counts, map: after, batch: info };
}

async function clientImport() {
  const rows = Array.isArray(source.clients) ? source.clients : [];
  const sourceFile = String(sourceFiles.clients || "Clientes.xlsx");
  const info = await createBatch("clients", sourceFile, rows.length, "Altas y bajas conservadas por código externo; se mantienen establecimientos con CIF compartido.");
  const before = await existingMap("clients");
  clientSourceRows.clear();
  rows.forEach((row) => clientSourceRows.set(String(row.source_code || ""), row));
  const statements = rows.map((row) => sqlStatement(
    `INSERT INTO clients(name,phone,email,address,tax_id,contact,city,payment_terms,credit_limit,active,external_code,source_system,payment_method_code,payment_terms_code,source_warehouse_code,source_created_at,source_closed_at,source_balance,source_overdue_balance,source_sales,source_payments,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(source_system,external_code) DO UPDATE SET name=excluded.name,phone=excluded.phone,tax_id=excluded.tax_id,contact=excluded.contact,payment_terms=excluded.payment_terms,active=excluded.active,payment_method_code=excluded.payment_method_code,payment_terms_code=excluded.payment_terms_code,source_warehouse_code=excluded.source_warehouse_code,source_created_at=excluded.source_created_at,source_closed_at=excluded.source_closed_at,source_balance=excluded.source_balance,source_overdue_balance=excluded.source_overdue_balance,source_sales=excluded.source_sales,source_payments=excluded.source_payments,updated_at=excluded.updated_at`,
    [row.name, row.phone, "", "", row.tax_id, row.contact, "", row.payment_terms, 0, row.active, row.source_code, sourceSystem, row.payment_method_code, row.payment_terms_code, row.warehouse_code, row.source_created_at, row.source_closed_at, row.balance, row.overdue_balance, row.sales, row.payments, now, now],
  ));
  await batch(statements);
  const after = await existingMap("clients");
  const records = rows.map((row) => ({ source_code: row.source_code, local_id: after.get(row.source_code), action: before.has(row.source_code) ? "UPDATE" : "INSERT", payload_hash: hash(row) }));
  await saveImportRecords(info, "clients", sourceFile, records);
  const counts = { inserted: rows.filter((row) => !before.has(row.source_code)).length, updated: rows.filter((row) => before.has(row.source_code)).length, skipped: 0 };
  await finishBatch(info, counts, "Clientes cargados; los saldos y ventas originales quedan en campos source_*.");
  return { ...counts, map: after, batch: info };
}

async function productImport(supplierIds) {
  const rows = Array.isArray(source.products) ? source.products : [];
  const validRows = rows.filter((row) => row.valid && row.name);
  const skippedRows = rows.filter((row) => !row.valid || !row.name);
  const sourceFile = String(sourceFiles.products || "Productos.xlsx");
  const info = await createBatch("products", sourceFile, rows.length, "Productos activos y dados de baja; el inventario se registra como carga inicial trazable.");
  const before = await existingMap("products");
  const warehouse = await execute("SELECT id FROM warehouses ORDER BY id LIMIT 1");
  const warehouseId = idFromRow(warehouse.rows[0]);
  if (!warehouseId) throw new Error("No hay almacén configurado para importar productos");
  const productStatements = validRows.map((row) => {
    const supplierId = supplierIds.get(row.source_supplier_code) || null;
    const status = row.active ? "Activo" : "Inactivo";
    const stock = Number(row.stock || 0);
    const cost = Number(row.cost_price || 0);
    return sqlStatement(
      `INSERT INTO products(name,description,sku,unit_price,stock,stock_reserved,cost_price,vat,unit,units_per_case,supplier_id,primary_supplier_id,supplier_ref,source_supplier_code,external_code,source_system,active,product_status,source_type,source_substitute,assembly_item,cost_adjusted,default_split_template,source_created_at,source_closed_at,category,format,warehouse_id,preorder,inventory_valuation_method,last_direct_cost,real_cost,accounting_product_group,accounting_vat_group,inventory_register_group,stock_min,stock_target,stock_safety,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(source_system,external_code) DO UPDATE SET name=excluded.name,description=excluded.description,sku=excluded.sku,unit_price=excluded.unit_price,cost_price=excluded.cost_price,vat=excluded.vat,unit=excluded.unit,units_per_case=excluded.units_per_case,supplier_id=excluded.supplier_id,primary_supplier_id=excluded.primary_supplier_id,supplier_ref=excluded.supplier_ref,source_supplier_code=excluded.source_supplier_code,active=excluded.active,product_status=excluded.product_status,source_type=excluded.source_type,source_substitute=excluded.source_substitute,assembly_item=excluded.assembly_item,cost_adjusted=excluded.cost_adjusted,default_split_template=excluded.default_split_template,source_created_at=excluded.source_created_at,source_closed_at=excluded.source_closed_at,category=excluded.category,format=excluded.format,warehouse_id=excluded.warehouse_id,last_direct_cost=excluded.last_direct_cost,real_cost=excluded.real_cost,updated_at=excluded.updated_at`,
      [row.name, row.description, row.source_code, Number(row.unit_price || 0), stock, 0, cost, 21, row.unit, Number(row.units_per_case || 1), supplierId, supplierId, row.source_supplier_code || "", row.source_supplier_code || "", row.source_code, sourceSystem, row.active, status, row.source_type || "Inventario", row.source_substitute || "", row.assembly_item, row.cost_adjusted, row.default_split_template || "", row.source_created_at, row.source_closed_at, row.source_type || "Inventario", row.unit, warehouseId, 1, "FIFO", cost, cost, "Mercaderías", "21%", "Mercaderías", 0, 0, 0, now, now],
    );
  });
  await batch(productStatements);
  const after = await existingMap("products");
  const initialRefsResult = await execute("SELECT reference FROM inventory_movements WHERE reference LIKE ?", [`${sourceSystem}:Producto:%`]);
  const initialRefs = new Set(initialRefsResult.rows.map((row) => String(row.reference)));
  const movementStatements = validRows.filter((row) => Number(row.stock || 0) !== 0 && !initialRefs.has(`${sourceSystem}:Producto:${row.source_code}`)).map((row) => sqlStatement(
    "INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity,reference,movement_date,notes,created_by) VALUES(?,?,?,?,?,?,?,?)",
    [after.get(row.source_code), warehouseId, "Entrada inicial", Number(row.stock || 0), `${sourceSystem}:Producto:${row.source_code}`, row.source_created_at || now.slice(0, 10), "Carga inicial desde Productos (3).xlsx", actor],
  ));
  await batch(movementStatements);
  const supplierLinkStatements = validRows.filter((row) => row.source_supplier_code && supplierIds.has(row.source_supplier_code)).map((row) => {
    const supplierId = supplierIds.get(row.source_supplier_code);
    return sqlStatement(
      `INSERT INTO product_suppliers(product_id,supplier_id,supplier_ref,unit_cost,minimum_order,order_unit,active,is_primary,created_at,updated_at)
       SELECT ?,?,?,?,?,?,?,?,?,?
       WHERE NOT EXISTS (SELECT 1 FROM product_suppliers WHERE product_id=? AND supplier_id=? AND supplier_ref=?)`,
      [after.get(row.source_code), supplierId, row.source_supplier_code, Number(row.cost_price || 0), 0, row.unit || "caja", row.active, 1, now, now, after.get(row.source_code), supplierId, row.source_supplier_code],
    );
  });
  await batch(supplierLinkStatements);
  const records = [
    ...validRows.map((row) => ({ source_code: row.source_code, local_id: after.get(row.source_code), action: before.has(row.source_code) ? "UPDATE" : "INSERT", payload_hash: hash(row) })),
    ...skippedRows.map((row) => ({ source_code: row.source_code, action: "SKIP", payload_hash: hash(row), notes: "Descripción vacía; no se puede crear un producto sin nombre." })),
  ];
  await saveImportRecords(info, "products", sourceFile, records);
  const counts = { inserted: validRows.filter((row) => !before.has(row.source_code)).length, updated: validRows.filter((row) => before.has(row.source_code)).length, skipped: skippedRows.length };
  await finishBatch(info, counts, `Productos válidos: ${validRows.length}; bajas conservadas: ${validRows.filter((row) => !row.active).length}; movimientos de carga inicial creados: ${movementStatements.length}; relaciones proveedor-producto comprobadas: ${supplierLinkStatements.length}.`);
  return { ...counts, initial_movements: movementStatements.length, supplier_links: supplierLinkStatements.length, batch: info };
}

try {
  const suppliers = await supplierImport();
  const clients = await clientImport();
  const products = await productImport(suppliers.map);
  console.log(JSON.stringify({ ok: true, source_system: sourceSystem, suppliers: { inserted: suppliers.inserted, updated: suppliers.updated }, clients: { inserted: clients.inserted, updated: clients.updated }, products: { inserted: products.inserted, updated: products.updated, skipped: products.skipped, initial_movements: products.initial_movements, supplier_links: products.supplier_links }, batches: [suppliers.batch, clients.batch, products.batch] }, null, 2));
} finally {
  await client.close();
}
