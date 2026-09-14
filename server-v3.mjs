import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRemoteDatabaseSync } from "./remote-db-sync.mjs";
const dir = join(process.cwd(), "data");
if (!existsSync(dir)) mkdirSync(dir);
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}
const remoteMode = process.env.DATABASE_MODE === "remote";
const db = remoteMode
  ? createRemoteDatabaseSync({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : new DatabaseSync(join(dir, "excluvas.sqlite"));
// Ajustes de SQLite para el uso local habitual: lecturas ágiles, escrituras
// concurrentes sin bloquear la aplicación y menos trabajo de disco.
if (!remoteMode) db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-64000; PRAGMA foreign_keys=ON;");
db.exec(`CREATE TABLE IF NOT EXISTS purchase_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,supplier_id INTEGER,status TEXT DEFAULT 'Borrador',order_date TEXT DEFAULT CURRENT_DATE,expected_date TEXT,amount REAL DEFAULT 0,notes TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS purchase_order_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,purchase_order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL DEFAULT 0,unit_cost REAL DEFAULT 0,amount REAL DEFAULT 0);`);
db.exec(`CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,content TEXT NOT NULL,priority TEXT DEFAULT 'Normal',module TEXT DEFAULT 'General',record_id INTEGER,important INTEGER DEFAULT 0,completed INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
db.exec(`CREATE TABLE IF NOT EXISTS document_templates(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,title TEXT NOT NULL,type TEXT NOT NULL,format TEXT DEFAULT 'HTML',description TEXT,subject TEXT,content TEXT NOT NULL,status TEXT DEFAULT 'Activa',created_by TEXT DEFAULT 'Usuario local',created_at TEXT,updated_at TEXT);`);
try { db.exec("ALTER TABLE document_templates ADD COLUMN format TEXT DEFAULT 'HTML'"); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS returns(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,client_id INTEGER,invoice_id INTEGER,product_id INTEGER,quantity REAL DEFAULT 0,reason TEXT,status TEXT DEFAULT 'Pendiente',amount REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
db.exec(`CREATE TABLE IF NOT EXISTS collection_points(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE,name TEXT NOT NULL,client_id INTEGER,address TEXT,city TEXT,contact TEXT,phone TEXT,email TEXT,opening_hours TEXT,notes TEXT);`);
try { db.exec("ALTER TABLE collection_points ADD COLUMN client_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE collection_points ADD COLUMN latitude REAL"); } catch {}
try { db.exec("ALTER TABLE collection_points ADD COLUMN longitude REAL"); } catch {}
try { db.exec("ALTER TABLE collection_points ADD COLUMN geocoded_at TEXT"); } catch {}
try { db.exec("ALTER TABLE collection_points ADD COLUMN geocoding_status TEXT DEFAULT 'Pendiente'"); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT DEFAULT 'Usuario local',method TEXT NOT NULL,resource TEXT NOT NULL,action TEXT NOT NULL,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
db.exec(`CREATE TABLE IF NOT EXISTS scheduled_tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,action_text TEXT NOT NULL,schedule_type TEXT DEFAULT 'Unica',recurrence TEXT,next_run TEXT,status TEXT DEFAULT 'Activa',last_run TEXT,last_result TEXT,created_by TEXT DEFAULT 'Usuario local',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,client_id INTEGER,expense_date TEXT NOT NULL,category TEXT DEFAULT 'Otros',vendor TEXT,amount REAL DEFAULT 0,vat REAL DEFAULT 21,payment_method TEXT DEFAULT 'Tarjeta',notes TEXT,attachment_name TEXT,attachment_mime TEXT,attachment_data TEXT,created_at TEXT,updated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS ocr_documents(id INTEGER PRIMARY KEY AUTOINCREMENT,file_name TEXT NOT NULL,mime_type TEXT,file_size INTEGER DEFAULT 0,document_type TEXT DEFAULT 'Otro',detected_email TEXT,detected_total TEXT,extracted_text TEXT,status TEXT DEFAULT 'Pendiente',created_by TEXT DEFAULT 'Usuario local',created_at TEXT,updated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS web_registrations(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL DEFAULT 'cliente',company_name TEXT NOT NULL, tax_id TEXT,contact_name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT,address TEXT,city TEXT,message TEXT,status TEXT NOT NULL DEFAULT 'Pendiente de validar',created_at TEXT,updated_at TEXT,reviewed_by TEXT,reviewed_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,wa_id TEXT,client_id INTEGER,direction TEXT DEFAULT 'Entrante',message_type TEXT DEFAULT 'Texto',content TEXT,media_name TEXT,media_mime TEXT,media_data TEXT,status TEXT DEFAULT 'Pendiente',transcription TEXT,human_review INTEGER DEFAULT 0,suggested_action TEXT,created_at TEXT,updated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS product_price_history(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,supplier_id INTEGER,price_type TEXT DEFAULT 'Coste',amount REAL DEFAULT 0,currency TEXT DEFAULT 'EUR',valid_from TEXT,valid_to TEXT,source TEXT,notes TEXT,created_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS product_suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,supplier_id INTEGER NOT NULL,supplier_ref TEXT,unit_cost REAL DEFAULT 0,minimum_order REAL DEFAULT 0,order_unit TEXT DEFAULT 'caja',transport_cost REAL DEFAULT 0,lead_time_days INTEGER DEFAULT 0,promotion TEXT,rappel_percent REAL DEFAULT 0,reliability_percent REAL DEFAULT 0,is_primary INTEGER DEFAULT 0,is_fixed INTEGER DEFAULT 0,active INTEGER DEFAULT 1,created_at TEXT,updated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS product_lots(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,lot_code TEXT NOT NULL,quantity REAL DEFAULT 0,expiry_date TEXT,received_date TEXT,warehouse_id INTEGER,created_at TEXT,updated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS product_equivalents(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,equivalent_product_id INTEGER NOT NULL,priority INTEGER DEFAULT 1,notes TEXT,active INTEGER DEFAULT 1,created_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS purchase_suggestions(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,suggested_quantity REAL DEFAULT 0,reason TEXT,status TEXT DEFAULT 'Pendiente de validar',recommended_supplier_id INTEGER,comparison TEXT,created_at TEXT,updated_at TEXT,validated_by TEXT,validated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS purchase_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,request_type TEXT DEFAULT 'Solicitud de oferta',status TEXT DEFAULT 'Borrador',product_ids TEXT,supplier_ids TEXT,notes TEXT,created_by TEXT,validated_by TEXT,created_at TEXT,updated_at TEXT,public_token TEXT,channels TEXT,sent_at TEXT);`);
for (const column of ["public_token TEXT", "channels TEXT", "sent_at TEXT"]) { try { db.exec(`ALTER TABLE purchase_requests ADD COLUMN ${column}`); } catch {} }
db.exec(`CREATE TABLE IF NOT EXISTS purchase_request_offers(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id INTEGER NOT NULL,supplier_id INTEGER,supplier_ref TEXT,contact_name TEXT,email TEXT,valid_until TEXT,delivery_days INTEGER DEFAULT 0,notes TEXT,lines_json TEXT NOT NULL,status TEXT DEFAULT 'Recibida',created_at TEXT,updated_at TEXT);`);
for (const [table, columns] of [["orders", ["collection_point_id", "prepared_by", "shipped_by", "delivered_by", "address", "preparation_date", "shipping_date", "loading_notes", "driver_notes"]], ["shipments", ["collection_point_id", "prepared_by", "shipped_by", "delivered_by", "preparation_date", "driver_notes", "invoice_delivery_method"]]]) for (const column of columns) { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`); } catch {} }
try { db.exec("ALTER TABLE orders ADD COLUMN source_order_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE shipments ADD COLUMN urgent INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE orders ADD COLUMN urgent INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE orders ADD COLUMN created_by TEXT"); } catch {}
for (const column of ["order_id", "delivery_note_id"]) { try { db.exec(`ALTER TABLE invoices ADD COLUMN ${column} INTEGER`); } catch {} }
try { db.exec("ALTER TABLE orders ADD COLUMN stock_alert INTEGER DEFAULT 0"); } catch {}
db.exec(
  `CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT DEFAULT 'user',must_change INTEGER DEFAULT 1);CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT,email TEXT,address TEXT);CREATE TABLE IF NOT EXISTS warehouses(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,address TEXT);CREATE TABLE IF NOT EXISTS delivery_notes(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,order_id INTEGER,client_id INTEGER,status TEXT DEFAULT 'Pendiente');CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER,amount REAL DEFAULT 0,payment_date TEXT DEFAULT CURRENT_DATE,method TEXT DEFAULT 'Transferencia');CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT,email TEXT,address TEXT);CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,unit_price REAL DEFAULT 0,stock REAL DEFAULT 0);CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,client_id INTEGER,product_id INTEGER,quantity REAL DEFAULT 0,amount REAL DEFAULT 0,status TEXT DEFAULT 'Pendiente',source_order_id INTEGER);CREATE TABLE IF NOT EXISTS quotes(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,client_id INTEGER,amount REAL DEFAULT 0,status TEXT DEFAULT 'Borrador');CREATE TABLE IF NOT EXISTS invoices(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,client_id INTEGER,amount REAL DEFAULT 0,status TEXT DEFAULT 'Pendiente');`,
);
try { db.exec("ALTER TABLE clients ADD COLUMN invoice_delivery_method TEXT"); } catch {}
// La migración anterior se ejecuta antes de crear las tablas base. Repetimos
// esta columna después de la creación para que también se aplique a bases
// nuevas, además de conservar compatibilidad con instalaciones antiguas.
try { db.exec("ALTER TABLE orders ADD COLUMN source_order_id INTEGER"); } catch {}
db.exec(
  `CREATE TABLE IF NOT EXISTS inventory_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,warehouse_id INTEGER, movement_type TEXT NOT NULL, quantity REAL DEFAULT 0, reference TEXT, movement_date TEXT DEFAULT CURRENT_DATE, notes TEXT);`,
);
for (const [table, columns] of [
  ["products", ["photo_name TEXT", "photo_mime TEXT", "photo_data TEXT", "description TEXT", "category_code TEXT", "warehouse_id INTEGER", "preorder INTEGER DEFAULT 1", "product_tracking_code TEXT DEFAULT 'Sin seguimiento'", "inventory_valuation_method TEXT DEFAULT 'FIFO'", "last_direct_cost REAL DEFAULT 0", "accounting_product_group TEXT DEFAULT 'Mercaderías'", "accounting_vat_group TEXT DEFAULT '21%'", "inventory_register_group TEXT DEFAULT 'Mercaderías'", "created_at TEXT", "created_by TEXT", "family TEXT", "subfamily TEXT", "purchase_format TEXT", "sale_format TEXT", "box_price REAL DEFAULT 0", "pack4_price REAL DEFAULT 0", "pack6_price REAL DEFAULT 0", "pallet_price REAL DEFAULT 0", "cases_per_pallet REAL DEFAULT 0", "units_per_pallet REAL DEFAULT 0", "weight_kg REAL DEFAULT 0", "volume_m3 REAL DEFAULT 0", "warehouse_location TEXT", "picking_order INTEGER DEFAULT 0", "product_status TEXT DEFAULT 'Activo'", "primary_supplier_id INTEGER", "fixed_supplier INTEGER DEFAULT 0", "target_margin_percent REAL DEFAULT 0", "min_margin_percent REAL DEFAULT 0", "stock_min REAL DEFAULT 0", "stock_target REAL DEFAULT 0", "stock_safety REAL DEFAULT 0", "lot_tracking INTEGER DEFAULT 0", "expiry_tracking INTEGER DEFAULT 0", "returnable_packaging INTEGER DEFAULT 0", "tax_surcharge_percent REAL DEFAULT 0", "extra_tax_name TEXT", "extra_tax_percent REAL DEFAULT 0", "freight_cost REAL DEFAULT 0", "handling_cost REAL DEFAULT 0", "real_cost REAL DEFAULT 0"]],
  ["suppliers", ["tax_id TEXT", "contact TEXT", "payment_terms TEXT", "minimum_order REAL DEFAULT 0", "transport_cost REAL DEFAULT 0", "lead_time_days INTEGER DEFAULT 0", "reliability_percent REAL DEFAULT 0", "promotions TEXT", "rappel_percent REAL DEFAULT 0", "active INTEGER DEFAULT 1"]],
  ["purchase_orders", ["validation_status TEXT DEFAULT 'Pendiente de validar'", "request_id INTEGER", "supplier_ids TEXT", "comparison TEXT"]],
]) for (const column of columns) { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`); } catch {} }
// Conservamos los campos históricos de stock y rellenamos los nuevos umbrales
// para que las instalaciones antiguas entren directamente en el motor de compras.
try {
  db.exec("UPDATE products SET stock_min=COALESCE(NULLIF(stock_min,0),min_stock,0), stock_target=COALESCE(NULLIF(stock_target,0),COALESCE(min_stock,0)*2,0), stock_safety=COALESCE(stock_safety,0), real_cost=COALESCE(NULLIF(real_cost,0),cost_price,0)");
} catch {}
try {
  const defaultWarehouse = db.prepare("SELECT id FROM warehouses ORDER BY id LIMIT 1").get();
  const pendingSupplier = db.prepare("SELECT id FROM suppliers WHERE name=? LIMIT 1").get("Proveedor pendiente de completar");
  if (defaultWarehouse && pendingSupplier) db.exec(`UPDATE products SET sku=COALESCE(NULLIF(TRIM(sku),''),'AY-PENDIENTE-'||printf('%04d',id)), category=COALESCE(NULLIF(TRIM(category),''),'Sin clasificar'), description=COALESCE(NULLIF(TRIM(description),''),NULLIF(TRIM(name),''),'Sin descripción'), warehouse_id=COALESCE(warehouse_id,${Number(defaultWarehouse.id)}), supplier_id=COALESCE(supplier_id,${Number(pendingSupplier.id)}), primary_supplier_id=COALESCE(primary_supplier_id,${Number(pendingSupplier.id)}), preorder=COALESCE(preorder,1), product_tracking_code=CASE WHEN COALESCE(expiry_tracking,0)=1 THEN 'Lote y fecha de caducidad' WHEN COALESCE(lot_tracking,0)=1 THEN 'Seguimiento de lote' ELSE COALESCE(NULLIF(TRIM(product_tracking_code),''),'Sin seguimiento') END, inventory_valuation_method=COALESCE(NULLIF(TRIM(inventory_valuation_method),''),'FIFO'), last_direct_cost=CASE WHEN COALESCE(last_direct_cost,0)=0 THEN COALESCE(cost_price,0) ELSE last_direct_cost END, accounting_product_group=COALESCE(NULLIF(TRIM(accounting_product_group),''),'Mercaderías'), accounting_vat_group=COALESCE(NULLIF(TRIM(accounting_vat_group),''),CASE WHEN vat IS NOT NULL THEN printf('%g%%',vat) ELSE '21%' END), inventory_register_group=COALESCE(NULLIF(TRIM(inventory_register_group),''),'Mercaderías'), created_at=COALESCE(NULLIF(TRIM(created_at),''),CURRENT_TIMESTAMP)`);
} catch {}
try {
  // Completa registros antiguos con valores operativos razonables sin sustituir
  // nunca los datos que ya haya introducido la empresa.
  db.exec("UPDATE suppliers SET tax_id=COALESCE(NULLIF(tax_id,''),'B' || printf('%08d',id)), contact=COALESCE(NULLIF(contact,''),'Departamento comercial'), payment_terms=COALESCE(NULLIF(payment_terms,''),'30 días'), minimum_order=COALESCE(NULLIF(minimum_order,0),1), transport_cost=COALESCE(transport_cost,0), lead_time_days=COALESCE(NULLIF(lead_time_days,0),2), reliability_percent=COALESCE(NULLIF(reliability_percent,0),92), active=COALESCE(active,1)");
  db.exec("UPDATE products SET family=COALESCE(NULLIF(family,''),COALESCE(NULLIF(category,''),'Bebidas')), subfamily=COALESCE(NULLIF(subfamily,''),COALESCE(NULLIF(format,''),'Distribución')), purchase_format=COALESCE(NULLIF(purchase_format,''),COALESCE(NULLIF(format,''),'caja')), sale_format=COALESCE(NULLIF(sale_format,''),COALESCE(NULLIF(unit,''),'unidad')), units_per_case=COALESCE(NULLIF(units_per_case,0),1), cases_per_pallet=COALESCE(NULLIF(cases_per_pallet,0),40), units_per_pallet=COALESCE(NULLIF(units_per_pallet,0),COALESCE(NULLIF(units_per_case,0),1)*COALESCE(NULLIF(cases_per_pallet,0),40)), box_price=COALESCE(NULLIF(box_price,0),unit_price*COALESCE(NULLIF(units_per_case,0),1)), pack4_price=COALESCE(NULLIF(pack4_price,0),unit_price*4), pack6_price=COALESCE(NULLIF(pack6_price,0),unit_price*6), pallet_price=COALESCE(NULLIF(pallet_price,0),unit_price*COALESCE(NULLIF(units_per_pallet,0),1)), warehouse_location=COALESCE(NULLIF(warehouse_location,''),'Almacén central · Pasillo 01'), product_status=COALESCE(NULLIF(product_status,''),'Activo'), stock_min=COALESCE(NULLIF(stock_min,0),NULLIF(min_stock,0),10), stock_target=COALESCE(NULLIF(stock_target,0),MAX(COALESCE(NULLIF(min_stock,0),10)*2,COALESCE(stock,0)+10)), stock_safety=COALESCE(NULLIF(stock_safety,0),5), target_margin_percent=COALESCE(NULLIF(target_margin_percent,0),30), min_margin_percent=COALESCE(NULLIF(min_margin_percent,0),18), real_cost=COALESCE(NULLIF(real_cost,0),COALESCE(cost_price,0)+COALESCE(freight_cost,0)+COALESCE(handling_cost,0)), tax_surcharge_percent=COALESCE(tax_surcharge_percent,0), extra_tax_percent=COALESCE(extra_tax_percent,0)");
} catch {}
// Normaliza ubicaciones históricas al formato de picking: una zona (A-Z) y una
// posición de tres cifras. Las posiciones ya válidas se conservan.
try {
  const pickingRows = db.prepare("SELECT id, warehouse_location, picking_order FROM products ORDER BY id").all();
  const validLocation = /^([A-Z])-(?:0*)?([1-9]|[1-9]\d|[1-9]\d\d|200)$/;
  const used = new Set();
  for (const row of pickingRows) {
    const match = String(row.warehouse_location || "").trim().toUpperCase().match(validLocation);
    if (match) used.add((match[1].charCodeAt(0) - 65) * 200 + Number(match[2]));
  }
  const updates = [];
  let next = 1;
  for (const row of pickingRows) {
    const current = String(row.warehouse_location || "").trim().toUpperCase().match(validLocation);
    if (current) {
      const order = (current[1].charCodeAt(0) - 65) * 200 + Number(current[2]);
      const normalized = current[1] + "-" + String(Number(current[2])).padStart(3, "0");
      if (Number(row.picking_order || 0) !== order || String(row.warehouse_location || "") !== normalized) updates.push({ sql: "UPDATE products SET warehouse_location=?, picking_order=? WHERE id=?", args: [normalized, order, row.id] });
      continue;
    }
    while (used.has(next)) next += 1;
    if (next > 26 * 200) break;
    const zone = String.fromCharCode(65 + Math.floor((next - 1) / 200));
    const position = ((next - 1) % 200) + 1;
    updates.push({ sql: "UPDATE products SET warehouse_location=?, picking_order=? WHERE id=?", args: [zone + "-" + String(position).padStart(3, "0"), next, row.id] });
    used.add(next);
    next += 1;
  }
  if (updates.length) {
    const ids = updates.map((update) => Number(update.args[2])).join(",");
    const locations = updates.map((update) => "WHEN " + Number(update.args[2]) + " THEN '" + String(update.args[0]).replaceAll("'", "''") + "'").join(" ");
    const orders = updates.map((update) => "WHEN " + Number(update.args[2]) + " THEN " + Number(update.args[1])).join(" ");
    db.exec("UPDATE products SET warehouse_location=CASE id " + locations + " ELSE warehouse_location END, picking_order=CASE id " + orders + " ELSE picking_order END WHERE id IN (" + ids + ")");
  }
} catch {}
for (const column of ["order_id", "shipment_id", "client_id", "created_by"]) {
  try { db.exec(`ALTER TABLE inventory_movements ADD COLUMN ${column} TEXT`); } catch {}
}
for (const column of ["order_id", "delivery_note_id"]) { try { db.exec(`ALTER TABLE invoices ADD COLUMN ${column} INTEGER`); } catch {} }
// Metadatos para que el asistente pueda localizar de forma segura los registros que él mismo creó.
for (const statement of [
  "ALTER TABLE products ADD COLUMN created_at TEXT",
  "ALTER TABLE products ADD COLUMN created_by TEXT",
]) {
  try { db.exec(statement); } catch {}
}
db.exec(
  `CREATE TABLE IF NOT EXISTS shipments(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,order_id INTEGER,delivery_note_id INTEGER,client_id INTEGER,carrier TEXT,status TEXT DEFAULT 'Preparando',prepared_at TEXT,shipped_at TEXT,expected_delivery_at TEXT,delivered_at TEXT,address TEXT,tracking TEXT,packages INTEGER DEFAULT 1,incidents TEXT,invoice_delivery_method TEXT);`,
);
for (const column of ["origin_address", "departure_at", "delivery_window_start", "delivery_window_end", "notes", "driver_notes", "preparation_started_at", "preparation_started_by", "stock_released_at", "stock_released_by"]) {
  try { db.exec(`ALTER TABLE shipments ADD COLUMN ${column} TEXT`); } catch {}
}
db.exec(
  `CREATE TABLE IF NOT EXISTS order_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL DEFAULT 0,unit_price REAL DEFAULT 0,discount REAL DEFAULT 0,vat REAL DEFAULT 21,amount REAL DEFAULT 0);CREATE TABLE IF NOT EXISTS quote_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,quote_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL DEFAULT 0,unit_price REAL DEFAULT 0,discount REAL DEFAULT 0,vat REAL DEFAULT 21,amount REAL DEFAULT 0);CREATE TABLE IF NOT EXISTS delivery_note_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,delivery_note_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL DEFAULT 0);CREATE TABLE IF NOT EXISTS invoice_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL DEFAULT 0,unit_price REAL DEFAULT 0,discount REAL DEFAULT 0,vat REAL DEFAULT 21,amount REAL DEFAULT 0);`,
);
db.exec(`CREATE TABLE IF NOT EXISTS invoice_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,order_id INTEGER NOT NULL,UNIQUE(invoice_id,order_id),UNIQUE(order_id));`);
for (const column of ["quantity_requested", "quantity_unit", "units_factor"]) { try { db.exec(`ALTER TABLE order_lines ADD COLUMN ${column} TEXT`); } catch {} }
try { db.exec("ALTER TABLE order_lines ADD COLUMN prepared INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE order_lines ADD COLUMN prepared_quantity REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE order_lines ADD COLUMN preparation_status TEXT DEFAULT 'Pendiente'"); } catch {}
for (const column of ["incident_resolution", "incident_resolved_at", "incident_resolved_by"]) { try { db.exec(`ALTER TABLE order_lines ADD COLUMN ${column} TEXT`); } catch {} }
if (!db.prepare("SELECT COUNT(*) n FROM users").get().n) {
  db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
    "Luis",
    "Temporal2026",
    "admin",
  );
  db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
    "Jose",
    "Temporal2026",
    "user",
  );
}
try { db.exec("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]'"); } catch {}
db.prepare("UPDATE users SET role='admin', permissions='*' WHERE username IN ('Luis','Jose')").run();
const tables = new Set([
  "suppliers",
  "purchase_orders",
  "purchase_order_lines",
  "notes",
  "document_templates",
  "returns",
  "warehouses",
  "delivery_notes",
  "payments",
  "clients",
  "products",
  "orders",
  "quotes",
  "invoices",
  "order_lines",
  "quote_lines",
  "delivery_note_lines",
  "invoice_lines",
  "inventory_movements",
  "shipments",
  "audit_logs",
  "scheduled_tasks",
  "collection_points",
  "expenses",
  "ocr_documents",
  "web_registrations",
  "whatsapp_messages",
  "product_price_history",
  "product_suppliers",
  "product_lots",
  "product_equivalents",
  "purchase_suggestions",
  "purchase_requests",
  "purchase_request_offers",
  "users",
]);
// Auditoría común para todos los módulos: permite ordenar, filtrar y ejecutar
// acciones temporales desde el asistente sin depender de nombres o suposiciones.
if (!remoteMode) {
  for (const table of tables) {
    for (const column of ["created_at", "updated_at", "deleted", "deleted_at", "deleted_by"]) {
      try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`); } catch {}
    }
    const migrationNow = new Date().toISOString();
    db.prepare(`UPDATE ${table} SET created_at=COALESCE(created_at,?), updated_at=COALESCE(updated_at,created_at,?), deleted=COALESCE(deleted,0)`).run(migrationNow, migrationNow);
  }
}
// Índices de las búsquedas y listados más utilizados. Se crean de forma
// tolerante para que las instalaciones antiguas puedan migrar sin romperse.
const indexStatements = [];
for (const [name, table, columns] of [
  ["idx_clients_name", "clients", "name"],
  ["idx_clients_updated", "clients", "updated_at"],
  ["idx_products_name", "products", "name"],
  ["idx_products_stock", "products", "stock"],
  ["idx_products_updated", "products", "updated_at"],
  ["idx_orders_status_created", "orders", "status, created_at"],
  ["idx_orders_client", "orders", "client_id"],
  ["idx_orders_delivery_date", "orders", "delivery_date"],
  ["idx_order_lines_order", "order_lines", "order_id"],
  ["idx_order_lines_product", "order_lines", "product_id"],
  ["idx_quotes_status_created", "quotes", "status, created_at"],
  ["idx_quotes_client", "quotes", "client_id"],
  ["idx_invoices_status_date", "invoices", "status, created_at"],
  ["idx_invoices_client", "invoices", "client_id"],
  ["idx_invoice_lines_invoice", "invoice_lines", "invoice_id"],
  ["idx_delivery_notes_order", "delivery_notes", "order_id"],
  ["idx_delivery_note_lines_note", "delivery_note_lines", "delivery_note_id"],
  ["idx_shipments_status_date", "shipments", "status, expected_delivery_at"],
  ["idx_shipments_order", "shipments", "order_id"],
  ["idx_inventory_product_date", "inventory_movements", "product_id, movement_date"],
  ["idx_expenses_date_client", "expenses", "expense_date, client_id"],
  ["idx_notes_pending", "notes", "important, completed, created_at"],
  ["idx_audit_actor_date", "audit_logs", "actor, created_at"],
  ["idx_audit_resource_date", "audit_logs", "resource, created_at"],
  ["idx_tasks_status_next_run", "scheduled_tasks", "status, next_run"],
  ["idx_templates_type_status", "document_templates", "type, status"],
  ["idx_users_role", "users", "role"],
  ["idx_whatsapp_client_date", "whatsapp_messages", "client_id, created_at"],
  ["idx_whatsapp_review", "whatsapp_messages", "human_review, status"],
  ["idx_price_history_product_date", "product_price_history", "product_id, created_at"],
  ["idx_product_suppliers_product", "product_suppliers", "product_id, active"],
  ["idx_product_lots_expiry", "product_lots", "product_id, expiry_date"],
  ["idx_purchase_suggestions_status", "purchase_suggestions", "status, created_at"],
]) {
  indexStatements.push(`CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${columns})`);
}
try { db.exec(indexStatements.join(";")); } catch {}
try { db.exec("PRAGMA optimize;"); } catch {}
if (!remoteMode) db.prepare("UPDATE document_templates SET format=COALESCE(format,'HTML')").run();
if (!remoteMode && Number(db.prepare("SELECT COUNT(*) n FROM document_templates WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0").get().n) === 0) {
  const templates = [
    ["TPL-PRE-001", "Presupuesto comercial", "Presupuesto", "Plantilla para enviar una propuesta comercial al cliente.", "Presupuesto {{codigo}} · {{cliente}}", "Hola {{contacto}},\n\nTe enviamos el presupuesto {{codigo}} para el suministro de bebidas solicitado.\n\nBase imponible: {{base}}\nIVA: {{iva}}\nTotal: {{total}}\nValidez: {{validez}}\n\nQuedamos a tu disposición.\n\nUn saludo,\nExclusivas Inteligentes"],
    ["TPL-COR-001", "Correo de confirmación de pedido", "Correo", "Confirmación de pedido y fecha de entrega.", "Pedido {{pedido}} confirmado · {{cliente}}", "Hola {{contacto}},\n\nHemos registrado el pedido {{pedido}} por un importe de {{total}}.\nLa entrega está prevista para el {{fecha_entrega}} en {{direccion}}.\n\nGracias por confiar en Exclusivas Inteligentes."],
    ["TPL-ALB-001", "Albarán de entrega", "Albarán", "Documento de entrega asociado a un pedido.", "Albarán {{codigo}} · {{cliente}}", "ALBARÁN {{codigo}}\nCliente: {{cliente}}\nDirección: {{direccion}}\nPedido relacionado: {{pedido}}\nFecha de entrega: {{fecha_entrega}}\n\nDetalle de productos:\n{{lineas}}\n\nRecibido por: ____________________\nFirma: __________________________"],
    ["TPL-FAC-001", "Factura estándar", "Factura", "Plantilla fiscal para facturas de clientes.", "Factura {{codigo}} · {{cliente}}", "FACTURA {{codigo}}\nFecha: {{fecha}}\nCliente: {{cliente}}\nNIF/CIF: {{nif}}\nDirección: {{direccion}}\n\nConceptos:\n{{lineas}}\n\nBase imponible: {{base}}\nIVA: {{iva}}\nTOTAL: {{total}}\nForma de pago: {{forma_pago}}"],
    ["TPL-CAR-001", "Hoja de carga para almacén", "Hoja de carga", "Instrucciones internas para preparar y cargar el reparto.", "Hoja de carga {{codigo}} · {{fecha}}", "HOJA DE CARGA {{codigo}}\nFecha y hora de salida: {{salida}}\nResponsable de preparación: {{preparador}}\nTransportista: {{transportista}}\n\nCliente: {{cliente}}\nDirección de entrega: {{direccion}}\nFranja prevista: {{franja}}\n\nProductos a cargar:\n{{lineas}}\n\nIndicaciones: {{notas}}"],
    ["TPL-CON-001", "Contrato de colaboración con cliente", "Contrato", "Documento base para formalizar la relación comercial.", "Condiciones de colaboración · {{cliente}}", "CONTRATO DE COLABORACIÓN COMERCIAL\n\nREUNIDOS\nDe una parte, Exclusivas Inteligentes.\nDe otra parte, {{cliente}}, con NIF/CIF {{nif}}.\n\nCONDICIONES\n1. Objeto y alcance del suministro.\n2. Precios, descuentos y condiciones de pago.\n3. Plazos y condiciones de entrega.\n4. Duración y revisión del acuerdo.\n\nFirmado en {{ciudad}}, a {{fecha}}.\n\nExclusivas Inteligentes                 {{cliente}}"],
    ["TPL-INI-001", "Ficha de primera colaboración", "Alta de cliente", "Ficha inicial para recoger datos y condiciones del cliente.", "Primera colaboración · {{cliente}}", "FICHA DE PRIMERA COLABORACIÓN\n\nEmpresa: {{cliente}}\nNIF/CIF: {{nif}}\nContacto: {{contacto}}\nTeléfono: {{telefono}}\nCorreo: {{email}}\nDirección de entrega: {{direccion}}\n\nCondiciones acordadas:\n{{condiciones}}\n\nResponsable comercial: {{responsable}}\nFecha de alta: {{fecha}}"],
    ["TPL-CND-001", "Condiciones generales de suministro", "Condiciones", "Texto de condiciones comerciales y logísticas.", "Condiciones generales · Exclusivas Inteligentes", "CONDICIONES GENERALES DE SUMINISTRO\n\nLos pedidos quedan sujetos a disponibilidad y confirmación.\nLos precios incluyen las condiciones indicadas en cada presupuesto.\nLas entregas se realizarán en la dirección y franja acordadas.\nLas incidencias deberán comunicarse en un plazo razonable desde la entrega.\n\nEstas condiciones pueden complementarse con acuerdos particulares del cliente."],
  ];
  const insert = db.prepare("INSERT INTO document_templates(code,title,type,format,description,subject,content,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
  const now = new Date().toISOString();
  for (const template of templates) insert.run(template[0], template[1], template[2], template[2] === "Correo" ? "Correo electrónico" : "HTML", template[3], template[4], template[5], "Activa", "Sistema", now, now);
}
// Datos de apoyo para que el motor pueda comparar alternativas desde el primer
// arranque. Se crean una sola vez y después quedan totalmente editables.
try {
  const products = db.prepare("SELECT id,cost_price,primary_supplier_id,supplier_id FROM products WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 ORDER BY id").all();
  const suppliers = db.prepare("SELECT id,minimum_order,transport_cost,lead_time_days,reliability_percent,rappel_percent FROM suppliers WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 ORDER BY id").all();
  if (products.length && suppliers.length && Number(db.prepare("SELECT COUNT(*) n FROM product_suppliers").get().n) === 0) {
    const offer = db.prepare("INSERT INTO product_suppliers(product_id,supplier_id,supplier_ref,unit_cost,minimum_order,order_unit,transport_cost,lead_time_days,promotion,rappel_percent,reliability_percent,is_primary,is_fixed,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const now = new Date().toISOString();
    products.forEach((product, index) => {
      const primary = suppliers.find((s) => Number(s.id) === Number(product.primary_supplier_id || product.supplier_id)) || suppliers[index % suppliers.length];
      const alternative = suppliers.find((s) => Number(s.id) !== Number(primary.id)) || primary;
      const base = Number(product.cost_price || 1);
      offer.run(product.id, primary.id, `REF-${String(product.id).padStart(4, "0")}`, base, primary.minimum_order || 1, "caja", primary.transport_cost || 0, primary.lead_time_days || 2, "Rappel anual según volumen", primary.rappel_percent || 0, primary.reliability_percent || 95, 1, 1, 1, now, now);
      offer.run(product.id, alternative.id, `ALT-${String(product.id).padStart(4, "0")}`, base * 1.04, alternative.minimum_order || 1, "caja", alternative.transport_cost || 0, alternative.lead_time_days || 3, "Promoción puntual", alternative.rappel_percent || 0, alternative.reliability_percent || 90, 0, 0, 1, now, now);
    });
  }
  const lotCount = Number(db.prepare("SELECT COUNT(*) n FROM product_lots").get().n);
  if (products.length && lotCount === 0) {
    const insertLot = db.prepare("INSERT INTO product_lots(product_id,lot_code,quantity,expiry_date,received_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?)");
    const now = new Date().toISOString();
    products.slice(0, Math.min(products.length, 30)).forEach((product, index) => insertLot.run(product.id, `LOTE-${new Date().getFullYear()}-${String(index + 1).padStart(3, "0")}`, Math.max(0, Number(db.prepare("SELECT stock FROM products WHERE id=?").get(product.id)?.stock || 0)), new Date(Date.now() + (60 + index * 7) * 86400000).toISOString().slice(0, 10), new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10), now, now));
  }
  if (products.length > 1 && Number(db.prepare("SELECT COUNT(*) n FROM product_equivalents").get().n) === 0) {
    const equivalent = db.prepare("INSERT INTO product_equivalents(product_id,equivalent_product_id,priority,notes,active,created_at) VALUES(?,?,?,?,?,?)");
    const now = new Date().toISOString();
    products.slice(0, -1).forEach((product, index) => equivalent.run(product.id, products[index + 1].id, 1, "Sustituto recomendado si no hay disponibilidad del producto principal.", 1, now));
  }
} catch {}
const send = (r, s, d) => {
  r.writeHead(s, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  r.end(JSON.stringify(d));
};
const readCache = new Map();
const READ_CACHE_MS = 60000;
const listColumnsCache = new Map();
const schemaColumnsCache = new Map();
function hasColumn(resource, column) {
  const key = `${resource}:${column}`;
  if (!schemaColumnsCache.has(key)) {
    const columns = db.prepare(`PRAGMA table_info(${resource})`).all().map((item) => String(item.name || ""));
    schemaColumnsCache.set(key, columns.includes(column));
  }
  return schemaColumnsCache.get(key);
}
const lookupFields = {
  clients: ["id", "name", "city", "address", "phone", "email", "invoice_delivery_method", "active", "external_code"],
  suppliers: ["id", "name", "tax_id", "contact", "phone", "email", "active", "minimum_order", "transport_cost", "lead_time_days", "reliability_percent", "rappel_percent", "external_code"],
  warehouses: ["id", "name", "address"],
  collection_points: ["id", "code", "name", "client_id", "address", "city", "contact", "phone", "email", "geocoding_status", "latitude", "longitude"],
  products: ["id", "name", "sku", "unit", "unit_price", "box_price", "pack4_price", "pack6_price", "pallet_price", "vat", "stock", "stock_reserved", "min_stock", "stock_min", "category", "brand", "format", "active", "product_status", "warehouse_id", "supplier_id", "primary_supplier_id", "warehouse_location", "cost_price"],
  orders: ["id", "code", "client_id", "status", "amount", "created_at", "updated_at", "delivery_date", "preparation_date", "shipping_date", "address", "collection_point_id", "urgent", "stock_alert", "loading_notes", "driver_notes"],
  shipments: ["id", "code", "order_id", "client_id", "collection_point_id", "status", "expected_delivery_at", "preparation_date", "address", "carrier", "packages", "incidents", "notes", "invoice_delivery_method"],
  invoices: ["id", "code", "order_id", "client_id", "amount", "status", "created_at", "issue_date", "due_date"],
  purchase_orders: ["id", "code", "supplier_id", "status", "order_date", "expected_date", "amount", "validation_status"],
  payments: ["id", "invoice_id", "amount", "payment_date", "method"],
  inventory_movements: ["id", "product_id", "warehouse_id", "movement_type", "quantity", "reference", "movement_date", "notes"],
  expenses: ["id", "code", "client_id", "expense_date", "category", "vendor", "amount", "vat", "payment_method", "notes", "created_at"],
};
function listSelectFor(resource) {
  if (!["products", "expenses"].includes(resource)) return "*";
  if (!listColumnsCache.has(resource)) {
    const excluded = resource === "products" ? new Set(["photo_data"]) : new Set(["attachment_data"]);
    const columns = db.prepare(`PRAGMA table_info(${resource})`).all()
      .map((column) => String(column.name || ""))
      .filter((column) => column && !excluded.has(column))
      .map((column) => `\"${column.replaceAll('"', '""')}\"`);
    listColumnsCache.set(resource, columns.length ? columns.join(",") : "*");
  }
  return listColumnsCache.get(resource);
}
function lookupSelectFor(resource) {
  const requested = lookupFields[resource];
  if (!requested) return listSelectFor(resource);
  if (!listColumnsCache.has(`lookup:${resource}`)) {
    const available = new Set(db.prepare(`PRAGMA table_info(${resource})`).all().map((column) => String(column.name || "")));
    const columns = requested.filter((column) => available.has(column)).map((column) => `${resource === "orders" ? "orders." : ""}\"${column.replaceAll('"', '""')}\"`);
    if (resource === "orders") columns.push("order_client.name AS client_name", "order_client.city AS client_city");
    listColumnsCache.set(`lookup:${resource}`, columns.length ? columns.join(",") : "*");
  }
  return listColumnsCache.get(`lookup:${resource}`);
}
function invalidateReadCache(resource) {
  for (const key of readCache.keys()) {
    if (key.startsWith(`${resource}:`)) readCache.delete(key);
  }
}
function cachedRows(resource, includeDeleted) {
  // Turso es compartido por varias instancias serverless. Una caché local
  // podría devolver reservas de stock obsoletas después de una escritura
  // realizada por otra instancia.
  if (remoteMode) return null;
  const key = `${resource}:${includeDeleted ? 1 : 0}`;
  const cached = readCache.get(key);
  if (!cached || Date.now() - cached.createdAt > READ_CACHE_MS) {
    if (cached) readCache.delete(key);
    return null;
  }
  return cached.rows;
}
function storeRows(resource, includeDeleted, rows) {
  if (remoteMode) return rows;
  readCache.set(`${resource}:${includeDeleted ? 1 : 0}`, { createdAt: Date.now(), rows });
  return rows;
}
function queryBatch(statements) {
  return statements.map(({ sql, args = [] }) => db.prepare(sql).all(...args));
}
function recordAudit(actor, method, resource, action, details = "") {
  try { db.prepare("INSERT INTO audit_logs(actor,method,resource,action,details,created_at) VALUES(?,?,?,?,?,?)").run(actor || "Usuario local", method, resource, action, details, new Date().toISOString()); } catch {}
}
function executeScheduledTask(task) {
  const text = String(task.action_text || "").trim();
  let result = "Acción registrada";
  const note = text.match(/(?:nota|recordatorio)\s*[:\-]?\s*(.+?)(?:\s*\|\s*(.+))?$/i);
  if (note) {
    const title = note[1].trim(), content = (note[2] || "Tarea programada por el asistente").trim();
    db.prepare("INSERT INTO notes(title,content,priority,module,important,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(title, content, "Normal", "Tareas programadas", 1, new Date().toISOString(), new Date().toISOString());
    result = `Nota creada: ${title}`;
  }
  const now = new Date().toISOString();
  let next = null, status = task.status;
  if (task.schedule_type === "Recurrente") {
    const recurrence = String(task.recurrence || "diaria").toLowerCase();
    const days = recurrence.includes("semana") || recurrence.includes("lunes") || recurrence.includes("martes") || recurrence.includes("miércoles") || recurrence.includes("miercoles") || recurrence.includes("jueves") || recurrence.includes("viernes") ? 7 : 1;
    next = new Date(Date.now() + days * 86400000).toISOString();
  } else status = "Completada";
  db.prepare("UPDATE scheduled_tasks SET status=?,last_run=?,last_result=?,next_run=?,updated_at=? WHERE id=?").run(status, now, result, next, now, task.id);
  recordAudit(task.created_by || "Tareas programadas", "TASK", `scheduled_tasks/${task.id}`, "Ejecución", result);
}
function runScheduledTasks() {
  const now = new Date().toISOString();
  const due = db.prepare("SELECT * FROM scheduled_tasks WHERE status='Activa' AND next_run IS NOT NULL AND next_run<=?").all(now);
  for (const task of due) { try { executeScheduledTask(task); } catch (e) { db.prepare("UPDATE scheduled_tasks SET last_run=?,last_result=?,updated_at=? WHERE id=?").run(now, `Error: ${e.message}`, now, task.id); } }
}
const read = (req) =>
  new Promise((ok) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => ok(s ? JSON.parse(s) : {}));
  });
http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Actor, X-Audit-Query",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      });
      return res.end();
    }
    const p = new URL(req.url, "http://local").pathname
      .split("/")
      .filter(Boolean);
    try {
      const actor = req.headers["x-actor"] || "Usuario local";
      // Las consultas automáticas de carga no deben modificar SQLite: en desarrollo
      // provocarían un ciclo de HMR (consulta -> cambio de DB -> recarga -> consulta).
      // Las consultas explícitas pueden marcarse con X-Audit-Query.
      if (p[1] !== "audit_logs" && !(req.method === "POST" && p[1] === "orders") && (req.method !== "GET" || req.headers["x-audit-query"] === "true")) recordAudit(actor, req.method, p.slice(1).join("/") || "inicio", req.method === "GET" ? "Consulta" : req.method === "POST" ? "Alta" : req.method === "PUT" ? "Edición" : req.method === "DELETE" ? "Borrado" : req.method, req.url);
      if (p[1] === "backup" && req.method === "GET") {
        const file = readFileSync(join(dir, "excluvas.sqlite"));
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename=excluvas-${new Date().toISOString().slice(0, 10)}.sqlite`, "Access-Control-Allow-Origin": "*" });
        return res.end(file);
      }
      if (p[1] === "backup" && req.method === "POST") {
        const body = await read(req);
        if (!body?.data) return send(res, 400, { error: "Copia no recibida" });
        writeFileSync(join(dir, "excluvas-restore.sqlite"), Buffer.from(body.data, "base64"));
        return send(res, 200, { ok: true, message: "Copia preparada. Reinicia el CRM para aplicar la restauración." });
      }
      if (p[1] === "login" && req.method === "POST") {
        const d = await read(req),
          u = db
            .prepare(
              "SELECT id,username,role,must_change,permissions FROM users WHERE username=? AND password=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0",
            )
            .get(d.username, d.password);
        return u
          ? send(res, 200, { ok: true, user: u })
          : send(res, 401, { error: "Usuario o contraseña incorrectos" });
      }
      const t = p[1];
      if (p[0] !== "api")
        return send(res, 404, { error: "Recurso no encontrado" });
      if (t === "purchase_requests" && p[2] === "public") {
        const params = new URL(req.url, "http://local").searchParams;
        const token = String(params.get("token") || "").trim();
        const request = token ? db.prepare("SELECT * FROM purchase_requests WHERE public_token=? LIMIT 1").get(token) : null;
        if (!request) return send(res, 404, { error: "Solicitud no encontrada o enlace caducado" });
        let productIds = [];
        let supplierIds = [];
        try { productIds = JSON.parse(String(request.product_ids || "[]")); } catch {}
        try { supplierIds = JSON.parse(String(request.supplier_ids || "[]")); } catch {}
        const products = productIds.length ? db.prepare(`SELECT id,name,sku,unit,format FROM products WHERE id IN (${productIds.map(() => "?").join(",")}) ORDER BY name`).all(...productIds.map(Number)) : [];
        const supplierId = Number(params.get("supplier") || 0);
        const supplier = supplierId ? db.prepare("SELECT id,name,email,phone FROM suppliers WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(supplierId) : null;
        if (req.method === "GET") return send(res, 200, { code: request.code, request_type: request.request_type, notes: request.notes || "", status: request.status, valid_until: request.valid_until || null, supplier, products });
        if (req.method === "POST") {
          const d = await read(req);
          if (!supplierId || !supplierIds.map(Number).includes(supplierId)) return send(res, 400, { error: "Proveedor no autorizado para esta solicitud" });
          const lines = Array.isArray(d.lines) ? d.lines.filter((line) => productIds.map(Number).includes(Number(line.product_id))) : [];
          if (!lines.length) return send(res, 400, { error: "Indica al menos una respuesta de producto" });
          const now = new Date().toISOString();
          const existing = db.prepare("SELECT id FROM purchase_request_offers WHERE request_id=? AND supplier_id=? ORDER BY id DESC LIMIT 1").get(Number(request.id), supplierId);
          if (existing) db.prepare("UPDATE purchase_request_offers SET supplier_ref=?,contact_name=?,email=?,valid_until=?,delivery_days=?,notes=?,lines_json=?,status='Recibida',updated_at=? WHERE id=?").run(String(d.supplier_ref || "").trim(), String(d.contact_name || "").trim(), String(d.email || "").trim(), String(d.valid_until || "").trim(), Number(d.delivery_days || 0), String(d.notes || "").trim(), JSON.stringify(lines), now, Number(existing.id));
          else db.prepare("INSERT INTO purchase_request_offers(request_id,supplier_id,supplier_ref,contact_name,email,valid_until,delivery_days,notes,lines_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(Number(request.id), supplierId, String(d.supplier_ref || "").trim(), String(d.contact_name || "").trim(), String(d.email || "").trim(), String(d.valid_until || "").trim(), Number(d.delivery_days || 0), String(d.notes || "").trim(), JSON.stringify(lines), "Recibida", now, now);
          db.prepare("UPDATE purchase_requests SET status='Respuestas recibidas',updated_at=? WHERE id=? AND status NOT IN ('Cerrada','Cancelada')").run(now, Number(request.id));
          const supplierName = supplier?.name || `Proveedor #${supplierId}`;
          db.prepare("INSERT INTO notes(title,content,priority,module,record_id,important,completed,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(`Respuesta de precios · ${supplierName}`, `El proveedor ${supplierName} ha respondido a la solicitud ${request.code}. Se han recibido ${lines.length} referencias para comparar.`, "Alta", "Compras", Number(request.id), 1, 0, now, now);
          recordAudit("Portal proveedor", "POST", `purchase_requests/${Number(request.id)}`, "Respuesta solicitud precios", JSON.stringify({ request_id: Number(request.id), supplier_id: supplierId, supplier_name: supplierName, lines: lines.length }));
          return send(res, 201, { ok: true, status: "Recibida" });
        }
      }
      if (t === "purchase_requests" && req.method === "POST" && !p[2]) {
        const d = await read(req);
        let productIds = [], supplierIds = [], channels = [];
        try { productIds = JSON.parse(String(d.product_ids || "[]")); } catch { productIds = Array.isArray(d.product_ids) ? d.product_ids : []; }
        try { supplierIds = JSON.parse(String(d.supplier_ids || "[]")); } catch { supplierIds = Array.isArray(d.supplier_ids) ? d.supplier_ids : []; }
        channels = Array.isArray(d.channels) ? d.channels.filter((value) => ["email", "web", "whatsapp"].includes(String(value))) : [];
        productIds = Array.from(new Set(productIds.map(Number).filter(Number.isInteger)));
        supplierIds = Array.from(new Set(supplierIds.map(Number).filter(Number.isInteger)));
        if (!productIds.length || !supplierIds.length) return send(res, 400, { error: "Selecciona al menos un producto y un proveedor" });
        const now = new Date().toISOString();
        const code = String(d.code || `SOL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`);
        const token = randomBytes(18).toString("hex");
        const status = String(d.status || (channels.length ? "Preparada para enviar" : "Borrador"));
        const created = db.prepare("INSERT INTO purchase_requests(code,request_type,status,product_ids,supplier_ids,notes,created_by,created_at,updated_at,public_token,channels,sent_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(code, String(d.request_type || "Solicitud de oferta"), status, JSON.stringify(productIds), JSON.stringify(supplierIds), String(d.notes || ""), String(d.created_by || actor), now, now, token, JSON.stringify(channels), channels.length ? now : null);
        const id = Number(created.lastInsertRowid);
        db.prepare("INSERT INTO notes(title,content,priority,module,record_id,important,completed,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(`Solicitud de precios · ${code}`, `Solicitud preparada para ${supplierIds.length} proveedores y ${productIds.length} productos. Canales: ${channels.join(", ") || "pendiente de elegir"}.`, "Normal", "Compras", id, 0, 0, now, now);
        recordAudit(actor, "POST", `purchase_requests/${id}`, "Solicitud de precios", JSON.stringify({ id, code, product_ids: productIds, supplier_ids: supplierIds, channels }));
        return send(res, 201, { id, code, status, public_token: token, channels });
      }
      if (t === "web_registrations") {
        if (req.method === "GET") {
          const includeClosed = new URL(req.url, "http://local").searchParams.get("include_closed") === "1";
          const rows = db.prepare(`SELECT * FROM web_registrations ${includeClosed ? "" : "WHERE status NOT IN ('Validada','Rechazada')"} ORDER BY id DESC LIMIT 500`).all();
          return send(res, 200, rows);
        }
        const d = await read(req);
        if (req.method === "POST") {
          const kind = ["cliente", "proveedor"].includes(String(d.kind)) ? String(d.kind) : "cliente";
          const companyName = String(d.company_name || "").trim();
          const contactName = String(d.contact_name || "").trim();
          const email = String(d.email || "").trim();
          if (!companyName || !contactName || !email) return send(res, 400, { error: "Empresa, contacto y email son obligatorios" });
          const now = new Date().toISOString();
          const created = db.prepare("INSERT INTO web_registrations(kind,company_name,tax_id,contact_name,email,phone,address,city,message,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(kind, companyName, String(d.tax_id || "").trim(), contactName, email, String(d.phone || "").trim(), String(d.address || "").trim(), String(d.city || "").trim(), String(d.message || "").trim(), "Pendiente de validar", now, now);
          const id = Number(created.lastInsertRowid);
          const label = kind === "proveedor" ? "proveedor" : "cliente";
          db.prepare("INSERT INTO notes(title,content,priority,module,record_id,important,completed,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(`Validar alta web · ${companyName}`, `Solicitud de alta de ${label} recibida desde la web. Contacto: ${contactName}. Email: ${email}. Teléfono: ${String(d.phone || "").trim() || "No indicado"}. NIF/CIF: ${String(d.tax_id || "").trim() || "No indicado"}. Dirección: ${String(d.address || "").trim() || "No indicada"}. ${String(d.message || "").trim()}`, "Alta", "Web", id, 1, 0, now, now);
          recordAudit("Portal web", "POST", `web_registrations/${id}`, "Alta web", JSON.stringify({ id, kind, company_name: companyName, contact_name: contactName, email }));
          return send(res, 201, { id, status: "Pendiente de validar" });
        }
        if (req.method === "PUT" && p[2]) {
          const id = Number(p[2]);
          const status = ["Pendiente de validar", "Validada", "Rechazada"].includes(String(d.status)) ? String(d.status) : "Pendiente de validar";
          const now = new Date().toISOString();
          const result = db.prepare("UPDATE web_registrations SET status=?,updated_at=?,reviewed_by=?,reviewed_at=? WHERE id=?").run(status, now, actor, status === "Pendiente de validar" ? null : now, id);
          if (!result.changes) return send(res, 404, { error: "Solicitud no encontrada" });
          recordAudit(actor, "PUT", `web_registrations/${id}`, "Revisión alta web", JSON.stringify({ id, status }));
          return send(res, 200, { id, status });
        }
      }
      if (t === "summary" && req.method === "GET") {
        const query = new URL(req.url, "http://local").searchParams;
        const today = new Date().toISOString().slice(0, 10);
        const from = String(query.get("from") || today).slice(0, 10);
        const to = String(query.get("to") || from).slice(0, 10);
        const invoiceRange = "CAST(COALESCE(deleted,0) AS INTEGER)=0 AND DATE(COALESCE(issue_date,created_at)) BETWEEN ? AND ?";
        const orderRange = "CAST(COALESCE(deleted,0) AS INTEGER)=0 AND DATE(COALESCE(delivery_date,created_at)) BETWEEN ? AND ?";
        const activeProduct = "CAST(COALESCE(deleted,0) AS INTEGER)=0 AND CAST(COALESCE(active,1) AS INTEGER)=1 AND LOWER(COALESCE(product_status,'Activo')) NOT IN ('inactivo','baja','descatalogado')";
        const results = queryBatch([
          { sql: "SELECT orders.id,orders.code,orders.client_id,orders.status,orders.amount,orders.created_at,orders.updated_at,orders.delivery_date,orders.preparation_date,orders.shipping_date,orders.address,orders.collection_point_id,orders.urgent,orders.stock_alert,order_client.name AS client_name,order_client.city AS client_city FROM orders LEFT JOIN clients AS order_client ON order_client.id=orders.client_id WHERE CAST(COALESCE(orders.deleted,0) AS INTEGER)=0 ORDER BY orders.id DESC LIMIT 500" },
          { sql: "SELECT id,code,order_id,client_id,collection_point_id,status,expected_delivery_at,preparation_date,address,carrier,packages,incidents,notes FROM shipments WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 ORDER BY id DESC LIMIT 500" },
          { sql: "SELECT id,name,city,address,phone,email,active,external_code FROM clients WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 AND CAST(COALESCE(active,1) AS INTEGER)=1 ORDER BY id DESC" },
          { sql: "SELECT id,title,content,priority,module,record_id,important,completed,created_at,updated_at,created_by,resolution,resolved_at,resolved_by FROM notes WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 AND CAST(COALESCE(important,0) AS INTEGER)=1 AND CAST(COALESCE(completed,0) AS INTEGER)=0 ORDER BY id DESC LIMIT 6" },
          { sql: `SELECT COALESCE(SUM(amount),0) total FROM invoices WHERE ${invoiceRange} AND status NOT IN ('Anulada')`, args: [from, to] },
          { sql: `SELECT COUNT(*) total FROM orders WHERE ${orderRange} AND status NOT IN ('Entregado','Cancelado')`, args: [from, to] },
          { sql: `SELECT COALESCE(SUM(amount),0) total FROM invoices WHERE ${invoiceRange} AND status NOT IN ('Cobrada','Pagada','Anulada')`, args: [from, to] },
          { sql: `SELECT COUNT(*) total FROM products WHERE ${activeProduct} AND COALESCE(stock,0)<=COALESCE(NULLIF(stock_min,0),min_stock,0)` },
          { sql: `SELECT COUNT(*) total FROM products WHERE ${activeProduct}` },
          { sql: "SELECT COUNT(*) total FROM orders WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0" },
          { sql: "SELECT COUNT(*) total FROM invoices WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0" },
          { sql: "SELECT COUNT(*) total FROM delivery_notes WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0" },
          { sql: "SELECT COUNT(*) total FROM payments WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0" },
          { sql: "SELECT COUNT(*) total FROM suppliers WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 AND CAST(COALESCE(active,1) AS INTEGER)=1" },
        ]);
        const rowsAt = (index) => results[index] || [];
        const totalAt = (index) => Number(rowsAt(index)[0]?.total || 0);
        const orders = rowsAt(0), shipments = rowsAt(1), clients = rowsAt(2), importantNotes = rowsAt(3);
        return send(res, 200, {
          summary: { sales: totalAt(4), openOrders: totalAt(5), receivables: totalAt(6), criticalStock: totalAt(7), products: totalAt(8), clients: clients.length, orders: totalAt(9), invoices: totalAt(10), deliveryNotes: totalAt(11), payments: totalAt(12), suppliers: totalAt(13), reports: totalAt(9) + totalAt(10) },
          orders, shipments, clients, importantNotes,
        });
      }
      if (t === "assistant" && req.method === "POST" && p[2] === "adjust-order-line") {
        const d = await read(req);
        const orderIdentifier = String(d.order_identifier || "").trim();
        const productQuery = String(d.product_query || "").trim().toLowerCase();
        const delta = Number(d.delta_units);
        if (!Number.isFinite(delta) || delta === 0) return send(res, 400, { error: "El ajuste debe indicar una cantidad distinta de cero" });
        const activeStatuses = ["Nuevo", "Pendiente", "Confirmado", "Preparando", "Preparado", "Preparado con incidencia"];
        const orders = orderIdentifier
          ? db.prepare("SELECT * FROM orders WHERE (CAST(id AS TEXT)=? OR LOWER(code)=LOWER(?)) AND CAST(COALESCE(deleted,0) AS INTEGER)=0").all(orderIdentifier, orderIdentifier)
          : db.prepare(`SELECT * FROM orders WHERE status IN (${activeStatuses.map(() => "?").join(",")}) AND CAST(COALESCE(deleted,0) AS INTEGER)=0 ORDER BY id DESC LIMIT 1`).all(...activeStatuses);
        if (!orders.length) return send(res, 404, { error: "No encuentro el pedido activo indicado" });
        const order = orders[0];
        if (["Enviado", "En reparto", "Entregado", "Cancelado"].includes(String(order.status || ""))) return send(res, 409, { error: "Ese pedido ya no admite modificaciones" });
        const lines = db.prepare("SELECT ol.*,p.name product_name,p.sku FROM order_lines ol LEFT JOIN products p ON p.id=ol.product_id WHERE ol.order_id=? ORDER BY ol.id").all(Number(order.id));
        const matches = productQuery ? lines.filter((line) => `${line.product_name || ""} ${line.sku || ""}`.toLowerCase().includes(productQuery)) : lines;
        if (!matches.length) return send(res, 404, { error: "No encuentro ese producto dentro del pedido", order: { id: order.id, code: order.code } });
        if (matches.length > 1) return send(res, 409, { error: "Hay varias líneas que coinciden", choices: matches.map((line) => ({ id: line.id, product: line.product_name, quantity: line.quantity, unit: line.quantity_unit || "unidad" })) });
        const line = matches[0];
        const current = Number(line.quantity || 0), next = current + delta;
        if (next < 0) return send(res, 400, { error: "El ajuste dejaría una cantidad negativa", current_quantity: current });
        const preview = { order_id: Number(order.id), order_code: order.code, line_id: Number(line.id), product: line.product_name || `Producto #${line.product_id}`, current_quantity: current, requested_delta: delta, proposed_quantity: next, quantity_unit: line.quantity_unit || "unidad", reserved_delta: next - current };
        if (!d.confirm) return send(res, 200, { ok: false, requires_confirmation: true, preview });
        const now = new Date().toISOString();
        db.prepare("UPDATE order_lines SET quantity=?,quantity_requested=?,amount=?,updated_at=? WHERE id=?").run(next, next, next * Number(line.unit_price || 0) * (1 - Number(line.discount || 0) / 100), now, Number(line.id));
        db.prepare("UPDATE products SET stock_reserved=MAX(0,COALESCE(stock_reserved,0)+?) WHERE id=?").run(next - current, Number(line.product_id));
        const total = db.prepare("SELECT COALESCE(SUM(amount),0) amount FROM order_lines WHERE order_id=?").get(Number(order.id)).amount;
        db.prepare("UPDATE orders SET amount=?,updated_at=? WHERE id=?").run(Number(total || 0), now, Number(order.id));
        recordAudit(actor, "POST", `assistant/adjust-order-line/${line.id}`, "Ajuste de línea", JSON.stringify({ ...preview, confirmed: true }));
        return send(res, 200, { ok: true, preview: { ...preview, final_quantity: next, order_amount: Number(total || 0) } });
      }
      if (t === "audit_logs" && req.method === "GET") {
        const url = new URL(req.url, "http://local");
        const actorFilter = url.searchParams.get("actor") || "";
        const actionFilter = url.searchParams.get("action") || "";
        const resourceFilter = url.searchParams.get("resource") || "";
        const rows = db.prepare("SELECT * FROM audit_logs WHERE actor LIKE ? AND action LIKE ? AND resource LIKE ? ORDER BY id DESC LIMIT 500").all(`%${actorFilter}%`, `%${actionFilter}%`, `%${resourceFilter}%`);
        return send(res, 200, rows);
      }
      if (t === "trash") {
        if (req.method === "GET") {
          const url = new URL(req.url, "http://local");
          const tableFilter = url.searchParams.get("table") || "";
          const actorFilter = String(url.searchParams.get("actor") || "").toLowerCase();
          const searchFilter = String(url.searchParams.get("q") || "").toLowerCase();
          const labels = { products: "Productos", clients: "Clientes", orders: "Pedidos", invoices: "Facturas", delivery_notes: "Albaranes", shipments: "Envíos", users: "Usuarios", expenses: "Gastos y tickets", notes: "Notas", suppliers: "Proveedores", purchase_orders: "Compras", warehouses: "Almacenes", collection_points: "Lugares de recogida", inventory_movements: "Movimientos de stock", returns: "Devoluciones", payments: "Cobros", quotes: "Presupuestos", scheduled_tasks: "Tareas programadas", order_lines: "Líneas de pedidos", quote_lines: "Líneas de presupuestos", delivery_note_lines: "Líneas de albaranes", invoice_lines: "Líneas de facturas", purchase_order_lines: "Líneas de compras", audit_logs: "Historial" };
          const sources = Array.from(tables).filter((table) => hasColumn(table, "deleted") && (!tableFilter || table === tableFilter));
          const rows = sources.flatMap((table) => db.prepare(`SELECT * FROM ${table} WHERE CAST(COALESCE(deleted,0) AS INTEGER)=1`).all().map((row) => ({ id: Number(row.id), table, table_label: labels[table] || table, record_label: row.code || row.name || row.title || row.username || row.reference || `Registro #${row.id}`, deleted_at: row.deleted_at, deleted_by: row.deleted_by, created_at: row.created_at, details: row })));
          return send(res, 200, rows.filter((row) => (!actorFilter || String(row.deleted_by || "").toLowerCase().includes(actorFilter)) && (!searchFilter || `${row.record_label} ${row.table_label} ${row.deleted_by || ""}`.toLowerCase().includes(searchFilter))).sort((a, b) => String(b.deleted_at || "").localeCompare(String(a.deleted_at || ""))));
        }
        if (req.method === "POST" && p[2] === "restore") {
          const d = await read(req);
          if (!tables.has(String(d.table)) || !d.id) return send(res, 400, { error: "Registro de papelera no válido" });
          const now = new Date().toISOString();
          db.prepare(`UPDATE ${d.table} SET deleted=0,deleted_at=NULL,deleted_by=NULL,updated_at=? WHERE id=?`).run(now, Number(d.id));
          recordAudit(actor, "POST", `trash/${d.table}/${d.id}`, "Recuperación", "Registro recuperado desde la papelera");
          return send(res, 200, { ok: true, id: Number(d.id), table: d.table, deleted: 0 });
        }
        if (req.method === "DELETE") {
          const admin = db.prepare("SELECT role FROM users WHERE username=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(actor);
          if (admin?.role !== "admin") return send(res, 403, { error: "Solo un administrador puede eliminar definitivamente" });
          const table = String(p[2] || ""), id = Number(p[3]);
          if (!tables.has(table) || !id) return send(res, 400, { error: "Registro de papelera no válido" });
          db.prepare(`DELETE FROM ${table} WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=1`).run(id);
          recordAudit(actor, "DELETE", `trash/${table}/${id}`, "Borrado definitivo", "Registro eliminado de forma permanente");
          return send(res, 200, { ok: true });
        }
      }
      if (t === "users") {
        if (req.method === "GET") {
          const includeDeleted = new URL(req.url, "http://local").searchParams.get("include_deleted") === "1";
          return send(res, 200, db.prepare(`SELECT id,username,role,must_change,permissions,deleted,deleted_at,deleted_by FROM users ${includeDeleted ? "" : "WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0"} ORDER BY id DESC`).all());
        }
        const d = await read(req);
        if (req.method === "POST") {
          if (!String(d.username || "").trim() || !String(d.password || "").trim()) return send(res, 400, { error: "El usuario y la contraseña son obligatorios" });
          const role = ["admin", "user", "comercial", "almacen"].includes(d.role) ? d.role : "user";
          const permissions = role === "admin" ? "*" : JSON.stringify(Array.isArray(d.permissions) ? d.permissions : []);
          const result = db.prepare("INSERT INTO users(username,password,role,must_change,permissions) VALUES(?,?,?,?,?)").run(String(d.username).trim(), String(d.password), role, 0, permissions);
          return send(res, 201, { id: Number(result.lastInsertRowid), username: String(d.username).trim(), role, must_change: 0, permissions });
        }
        if (req.method === "PUT") {
          const id = Number(p[2]);
          const existing = db.prepare("SELECT * FROM users WHERE id=?").get(id);
          if (!existing) return send(res, 404, { error: "Usuario no encontrado" });
          const role = ["admin", "user", "comercial", "almacen"].includes(d.role) ? d.role : "user";
          const permissions = role === "admin" ? "*" : JSON.stringify(Array.isArray(d.permissions) ? d.permissions : []);
          const password = String(d.password || "").trim() ? String(d.password) : existing.password;
          const deleted = d.deleted === undefined ? Number(existing.deleted || 0) : Number(d.deleted) ? 1 : 0;
          const now = new Date().toISOString();
          db.prepare("UPDATE users SET username=?,password=?,role=?,permissions=?,deleted=?,deleted_at=?,deleted_by=?,updated_at=? WHERE id=?").run(String(d.username || existing.username).trim(), password, role, permissions, deleted, deleted ? (existing.deleted_at || now) : null, deleted ? (d.deleted_by || actor) : null, now, id);
          return send(res, 200, { id, username: String(d.username || existing.username).trim(), role, must_change: existing.must_change, permissions, deleted });
        }
        if (req.method === "DELETE") {
          const id = Number(p[2]);
          const target = db.prepare("SELECT role FROM users WHERE id=?").get(id);
          if (!target) return send(res, 404, { error: "Usuario no encontrado" });
          if (target.role === "admin" && Number(db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n) <= 1) return send(res, 409, { error: "Debe quedar al menos un administrador" });
          const now = new Date().toISOString();
          db.prepare("UPDATE users SET deleted=1,deleted_at=?,deleted_by=?,updated_at=? WHERE id=?").run(now, actor, now, id);
          return send(res, 200, { ok: true, deleted: 1 });
        }
      }
      if (t === "stock" && req.method === "GET") {
        const stock = db
          .prepare(
            "SELECT p.id product_id,p.name product_name,COALESCE(p.sku,'') sku,COALESCE(p.unit,'unidad') unit,COALESCE(w.name,'Almacén general') warehouse_name,COALESCE(p.stock,0) stock,COALESCE(p.stock_reserved,0) stock_reserved,COALESCE(p.stock,0)-COALESCE(p.stock_reserved,0) available_stock,COALESCE(p.min_stock,0) min_stock,CASE WHEN COALESCE(p.stock,0)-COALESCE(p.stock_reserved,0)<=COALESCE(p.min_stock,0) THEN 'Crítico' ELSE 'Disponible' END stock_status FROM products p LEFT JOIN warehouses w ON w.id=1 WHERE CAST(COALESCE(p.deleted,0) AS INTEGER)=0 ORDER BY p.name",
          )
          .all();
        return send(res, 200, stock);
      }
      if (t === "purchase_suggestions" && req.method === "GET") {
        const rows = db.prepare(`
          SELECT p.id product_id,p.name,COALESCE(p.sku,'') sku,
            COALESCE(p.stock,0) stock,COALESCE(p.stock_reserved,0) stock_reserved,
            COALESCE(NULLIF(p.stock_min,0),p.min_stock,0) stock_min,
            COALESCE(p.stock_target,COALESCE(p.min_stock,0)*2) stock_target,
            COALESCE(p.stock_safety,0) stock_safety,COALESCE(p.cost_price,0) cost_price,
            COALESCE(p.real_cost,COALESCE(p.cost_price,0)) real_cost,
            COALESCE(p.primary_supplier_id,0) primary_supplier_id,
            COALESCE(p.supplier_id,0) supplier_id
          FROM products p WHERE CAST(COALESCE(p.deleted,0) AS INTEGER)=0
            AND (COALESCE(p.stock,0)-COALESCE(p.stock_reserved,0)) <= COALESCE(NULLIF(p.stock_min,0),p.min_stock,0)
          ORDER BY (COALESCE(p.stock,0)-COALESCE(p.stock_reserved,0)-COALESCE(NULLIF(p.stock_min,0),p.min_stock,0)) ASC,p.name`).all();
        const suppliers = db.prepare("SELECT * FROM suppliers WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 AND COALESCE(active,1)=1 ORDER BY name").all();
        const offers = db.prepare("SELECT * FROM product_suppliers WHERE active=1").all();
        const result = rows.map((row) => {
          const available = Number(row.stock) - Number(row.stock_reserved);
          const target = Math.max(Number(row.stock_target || 0), Number(row.stock_safety || 0), Number(row.stock || 0));
          const quantity = Math.max(1, target - available);
          let suggestion = db.prepare("SELECT * FROM purchase_suggestions WHERE product_id=? AND status='Pendiente de validar' ORDER BY id DESC LIMIT 1").get(row.product_id);
          if (!suggestion) {
            const created = db.prepare("INSERT INTO purchase_suggestions(product_id,suggested_quantity,reason,status,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(row.product_id, quantity, `Stock disponible ${available} por debajo del mínimo ${row.stock_min || row.min_stock || 0}`, "Pendiente de validar", new Date().toISOString(), new Date().toISOString());
            suggestion = { id: Number(created.lastInsertRowid) };
          }
          const comparisons = offers.filter((offer) => Number(offer.product_id) === Number(row.product_id)).map((offer) => ({ ...offer, supplier_name: suppliers.find((supplier) => Number(supplier.id) === Number(offer.supplier_id))?.name || `Proveedor #${offer.supplier_id}`, real_cost: Number(offer.unit_cost || 0) + Number(offer.transport_cost || 0) / Math.max(1, Number(offer.minimum_order || 1)) - (Number(offer.unit_cost || 0) * Number(offer.rappel_percent || 0) / 100) })).sort((a,b) => Number(a.real_cost) - Number(b.real_cost));
          const defaultSupplier = suppliers.find((supplier) => Number(supplier.id) === Number(row.primary_supplier_id || row.supplier_id));
          return { ...row, suggestion_id: suggestion.id, available_stock: available, suggested_quantity: quantity, reason: `Stock disponible ${available} por debajo del mínimo ${row.stock_min || row.min_stock || 0}`, recommended_supplier: comparisons[0] || (defaultSupplier ? { supplier_id: defaultSupplier.id, supplier_name: defaultSupplier.name, real_cost: Number(row.real_cost || row.cost_price || 0), lead_time_days: defaultSupplier.lead_time_days || 0, reliability_percent: defaultSupplier.reliability_percent || 0 } : null), comparisons };
        });
        return send(res, 200, result);
      }
      if (t === "purchase_suggestions" && req.method === "PUT" && p[2]) {
        const d = await read(req);
        const now = new Date().toISOString();
        const status = d.status || "Pendiente de validar";
        db.prepare("UPDATE purchase_suggestions SET status=?,validated_by=?,validated_at=?,updated_at=? WHERE id=?").run(status, status === "Aprobada" ? actor : null, status === "Aprobada" ? now : null, now, Number(p[2]));
        return send(res, 200, { ok: true, id: Number(p[2]), status });
      }
      if (t === "billing" && req.method === "GET") {
        try { db.exec(`CREATE TABLE IF NOT EXISTS invoice_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,order_id INTEGER NOT NULL,UNIQUE(invoice_id,order_id),UNIQUE(order_id));`); } catch {}
        const params = new URL(req.url, "http://local").searchParams;
        const clauses = ["COALESCE(o.deleted,0)=0"], args = [];
        if (params.get("from")) { clauses.push("date(o.created_at) >= date(?)"); args.push(params.get("from")); }
        if (params.get("to")) { clauses.push("date(o.created_at) <= date(?)"); args.push(params.get("to")); }
        if (params.get("client_id")) { clauses.push("o.client_id=?"); args.push(Number(params.get("client_id"))); }
        return send(res, 200, db.prepare(`SELECT o.id,o.code,o.client_id,o.status,o.amount,o.created_at,c.name client_name,CASE WHEN o.status='Facturado' OR EXISTS(SELECT 1 FROM invoices i WHERE i.order_id=o.id) THEN 1 ELSE 0 END billed FROM orders o LEFT JOIN clients c ON c.id=o.client_id WHERE ${clauses.join(" AND ")} ORDER BY date(o.created_at) DESC,o.id DESC`).all(...args));
      }
      if (t === "billing" && req.method === "POST") {
        try { db.exec(`CREATE TABLE IF NOT EXISTS invoice_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,order_id INTEGER NOT NULL,UNIQUE(invoice_id,order_id));`); } catch {}
        const d = await read(req), ids = Array.from(new Set((Array.isArray(d.order_ids) ? d.order_ids : []).map(Number).filter(Number.isInteger)));
        if (!ids.length) return send(res, 400, { error: "Selecciona al menos un pedido" });
        const marks = ids.map(() => "?").join(","), orders = db.prepare(`SELECT o.*,c.name client_name FROM orders o LEFT JOIN clients c ON c.id=o.client_id WHERE o.id IN (${marks}) AND COALESCE(o.deleted,0)=0`).all(...ids);
        if (orders.length !== ids.length) return send(res, 400, { error: "Uno de los pedidos ya no está disponible" });
        if (new Set(orders.map((row) => Number(row.client_id || 0))).size !== 1) return send(res, 400, { error: "Solo se pueden agrupar pedidos del mismo cliente" });
        const billed = db.prepare(`SELECT o.id order_id,i.code FROM orders o JOIN invoices i ON i.order_id=o.id WHERE o.id IN (${marks}) UNION SELECT id order_id,'Factura existente' code FROM orders WHERE status='Facturado' AND id IN (${marks})`).all(...ids, ...ids);
        if (billed.length) return send(res, 409, { error: `Ya facturado: ${billed.map((row) => row.code).join(", ")}` });
        const total = orders.reduce((sum, row) => sum + Number(row.amount || 0), 0), code = `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
        if (!remoteMode) db.exec("BEGIN"); try { const created = db.prepare("INSERT INTO invoices(code,order_id,client_id,amount,status) VALUES(?,?,?,?,?)").run(code, ids[0], orders[0].client_id, total, "Pendiente"), invoiceId = Number(created.lastInsertRowid), line = db.prepare("INSERT INTO invoice_lines(invoice_id,product_id,quantity,unit_price,discount,vat,amount) SELECT ?,product_id,quantity,unit_price,discount,vat,amount FROM order_lines WHERE order_id=?"); for (const id of ids) { line.run(invoiceId,id); db.prepare("UPDATE orders SET status='Facturado',updated_at=? WHERE id=?").run(new Date().toISOString(),id); } if (!remoteMode) db.exec("COMMIT"); return send(res,201,{id:invoiceId,code,amount:total,client_id:orders[0].client_id,order_ids:ids,status:"Pendiente"}); } catch (error) { if (!remoteMode) { try { db.exec("ROLLBACK"); } catch {} } return send(res,500,{error:error?.message || "No se pudo crear la factura"}); }
      }
      if (
        t === "orders" &&
        req.method === "POST" &&
        (["convert-delivery", "convert-invoice"].includes(p[2]) || ["convert-delivery", "convert-invoice"].includes(p[3]))
      ) {
        const action = ["convert-delivery", "convert-invoice"].includes(p[2]) ? p[2] : p[3];
        const orderId = ["convert-delivery", "convert-invoice"].includes(p[2]) ? p[3] : p[2];
        const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
        if (!order) return send(res, 404, { error: "Pedido no encontrado" });
        const delivery = action === "convert-delivery";
        const table = delivery ? "delivery_notes" : "invoices";
        const code =
          (delivery ? "ALB" : "FAC") +
          "-" +
          new Date().getFullYear() +
          "-" +
          String(Date.now()).slice(-5);
        const fields = delivery
          ? "code,order_id,client_id,status"
          : "code,order_id,client_id,amount,status";
        const values = delivery
          ? [code, order.id, order.client_id, "Pendiente"]
          : [code, order.id, order.client_id, order.amount || 0, "Pendiente"];
        const created = db
          .prepare(`INSERT INTO ${table} (${fields}) VALUES (${values.map(() => "?").join(",")})`)
          .run(...values);
        const newId = Number(created.lastInsertRowid);
        if (delivery)
          db.prepare(
            "INSERT INTO delivery_note_lines(delivery_note_id,product_id,quantity) SELECT ?,product_id,quantity FROM order_lines WHERE order_id=?",
          ).run(newId, order.id);
        else
          db.prepare(
            "INSERT INTO invoice_lines(invoice_id,product_id,quantity,unit_price,discount,vat,amount) SELECT ?,product_id,quantity,unit_price,discount,vat,amount FROM order_lines WHERE order_id=?",
          ).run(newId, order.id);
        db.prepare("UPDATE orders SET status=? WHERE id=?").run(
          delivery ? "Preparado" : "Facturado",
          order.id,
        );
        return send(res, 201, {
          id: newId,
          code,
          order_id: order.id,
          client_id: order.client_id,
          amount: order.amount || 0,
          status: "Pendiente",
        });
      }
      if (t === "delivery_notes" && req.method === "POST" && p[2] === "convert-invoice") {
        const delivery = db.prepare("SELECT * FROM delivery_notes WHERE id=?").get(p[3]);
        if (!delivery) return send(res, 404, { error: "Albarán no encontrado" });
        const order = delivery.order_id
          ? db.prepare("SELECT * FROM orders WHERE id=?").get(delivery.order_id)
          : null;
        const existing = db.prepare(
          "SELECT id,code FROM invoices WHERE delivery_note_id=? OR (order_id IS NOT NULL AND order_id=?) LIMIT 1",
        ).get(delivery.id, delivery.order_id || 0);
        if (existing) return send(res, 409, { error: `La factura ${existing.code} ya existe`, ...existing });
        const code = `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
        const created = db.prepare(
          "INSERT INTO invoices(code,order_id,delivery_note_id,client_id,amount,status) VALUES(?,?,?,?,?,?)",
        ).run(code, delivery.order_id || null, delivery.id, delivery.client_id, order?.amount || 0, "Pendiente");
        const invoiceId = Number(created.lastInsertRowid);
        db.prepare(
          "INSERT INTO invoice_lines(invoice_id,product_id,quantity,unit_price,discount,vat,amount) SELECT ?,d.product_id,d.quantity,COALESCE(o.unit_price,0),COALESCE(o.discount,0),COALESCE(o.vat,21),COALESCE(o.amount,d.quantity*COALESCE(o.unit_price,0)) FROM delivery_note_lines d LEFT JOIN order_lines o ON o.order_id=? AND o.product_id=d.product_id WHERE d.delivery_note_id=?",
        ).run(invoiceId, delivery.order_id || 0, delivery.id);
        if (delivery.order_id) db.prepare("UPDATE orders SET status='Facturado',updated_at=? WHERE id=?").run(new Date().toISOString(), delivery.order_id);
        return send(res, 201, { id: invoiceId, code, order_id: delivery.order_id || null, delivery_note_id: delivery.id, client_id: delivery.client_id, amount: order?.amount || 0, status: "Pendiente" });
      }
      if (!tables.has(t))
        return send(res, 404, { error: "Recurso no encontrado" });
      if (req.method === "GET") {
        const query = new URL(req.url, "http://local").searchParams;
        const includeDeleted = query.get("include_deleted") === "1";
        const includeInactive = query.get("include_inactive") === "1";
        const isLookup = query.get("view") === "lookup";
        const parsePageValue = (value, fallback) => {
          const parsed = Number.parseInt(String(value || ""), 10);
          return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
        };
        const limitValue = query.has("limit") ? Math.min(parsePageValue(query.get("limit"), 0), 5000) : null;
        const offsetValue = query.has("offset") ? parsePageValue(query.get("offset"), 0) : 0;
        if (p[2] && Number.isInteger(Number(p[2]))) {
          const source = t === "orders"
            ? `orders LEFT JOIN clients AS order_client ON order_client.id=orders.client_id`
            : t;
          const selection = t === "orders" ? "orders.*,order_client.name AS client_name,order_client.city AS client_city" : p[2] ? "*" : listSelectFor(t);
          const tableReference = t === "orders" ? "orders" : t;
          const deletedClause = includeDeleted || !hasColumn(tableReference, "deleted") ? "" : ` AND CAST(COALESCE(${tableReference}.deleted,0) AS INTEGER)=0`;
          const row = db.prepare(`SELECT ${selection} FROM ${source} WHERE ${tableReference}.id=?${deletedClause}`).get(Number(p[2]));
          return row ? send(res, 200, row) : send(res, 404, { error: "Registro no encontrado" });
        }
        const cached = !isLookup && limitValue === null && offsetValue === 0 ? cachedRows(t, includeDeleted) : null;
        if (cached) return send(res, 200, cached);
        const source = t === "orders"
          ? `orders LEFT JOIN clients AS order_client ON order_client.id=orders.client_id`
          : t;
        const selection = isLookup ? lookupSelectFor(t) : t === "orders" ? "orders.*,order_client.name AS client_name,order_client.city AS client_city" : listSelectFor(t);
        const filters = [];
        if (!includeDeleted && hasColumn(t, "deleted")) filters.push(`CAST(COALESCE(${t === "orders" ? "orders" : t}.deleted,0) AS INTEGER)=0`);
        if (!includeInactive && ["suppliers", "clients", "products"].includes(t)) filters.push(t === "products" ? `CAST(COALESCE(products.active,1) AS INTEGER)=1 AND LOWER(COALESCE(products.product_status,'Activo')) NOT IN ('inactivo','baja','descatalogado')` : `CAST(COALESCE(${t}.active,1) AS INTEGER)=1`);
        const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
        const pagination = limitValue === null ? "" : ` LIMIT ${limitValue} OFFSET ${offsetValue}`;
        const rows = db.prepare(`SELECT ${selection} FROM ${source} ${where} ORDER BY ${t === "orders" ? "orders.id" : "id"} DESC${pagination}`).all();
        return send(
          res,
          200,
          !isLookup && limitValue === null && offsetValue === 0 ? storeRows(t, includeDeleted, rows) : rows,
        );
      }
      const d = await read(req);
      const reopenPreparation = Boolean(d.reopen_preparation);
      delete d.reopen_preparation;
      if (req.method === "POST") {
        if (["products", "clients", "suppliers", "warehouses"].includes(t) && !String(d.name || "").trim()) {
          return send(res, 400, { error: "El nombre es obligatorio" });
        }
        if (["orders", "quotes", "invoices", "returns"].includes(t) && !String(d.code || "").trim()) {
          return send(res, 400, { error: "El código es obligatorio" });
        }
        if (t === "products" && String(d.sku || "").trim()) {
          const duplicate = db.prepare("SELECT id FROM products WHERE LOWER(TRIM(COALESCE(sku,'')))=LOWER(TRIM(?)) AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(String(d.sku));
          if (duplicate) return send(res, 409, { error: "Ya existe un producto con ese SKU" });
        }
        invalidateReadCache(t);
        const now = new Date().toISOString();
        if (d.created_at === undefined) d.created_at = now;
        if (d.updated_at === undefined) d.updated_at = now;
        if (t === "orders" && !d.created_by) d.created_by = actor;
        let orderLines = null;
        let stockShortages = [];
        let stockAlerts = [];
        if (t === "orders" && Array.isArray(d.lines) && d.lines.length) {
          orderLines = d.lines.map((line) => ({
            product_id: Number(line.product_id),
            quantity: Number(line.quantity || 0),
            quantity_requested: Number(line.quantity_requested || line.quantity || 0),
            quantity_unit: String(line.quantity_unit || "unidad"),
            units_factor: Number(line.units_factor || 1),
            unit_price: Number(line.unit_price || 0),
            discount: Number(line.discount || 0),
            vat: Number(line.vat || 21),
            amount: Number(line.amount || (Number(line.quantity || 0) * Number(line.unit_price || 0))),
          })).filter((line) => line.product_id && line.quantity > 0);
          for (const line of orderLines) {
            const product = db.prepare("SELECT stock,COALESCE(stock_reserved,0) stock_reserved FROM products WHERE id=?").get(line.product_id);
            if (!product) return send(res, 400, { error: "Producto no encontrado" });
            const available = Number(product.stock) - Number(product.stock_reserved);
            const minimum = Number(product.stock_min ?? product.min_stock ?? 0);
            if (available < line.quantity) stockShortages.push({ product_id: line.product_id, requested: line.quantity, available });
            if (available - line.quantity < minimum) stockAlerts.push({ product_id: line.product_id, requested: line.quantity, available_after: available - line.quantity, minimum });
          }
          const firstLine = orderLines[0];
          d.product_id = firstLine.product_id;
          d.quantity = firstLine.quantity;
          d.unit_price = firstLine.unit_price;
          d.amount = orderLines.reduce((total, line) => total + line.amount, 0);
          delete d.lines;
        }
        if (t === "payments" && d.invoice_id && d.amount) {
          const invoice = db.prepare("SELECT amount FROM invoices WHERE id=?").get(d.invoice_id);
          if (!invoice) return send(res, 400, { error: "Factura no encontrada" });
          const paid = db.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE invoice_id=?").get(d.invoice_id).total;
          const nextPaid = Number(paid) + Number(d.amount);
        }
        if (t === "returns" && d.product_id && d.quantity) {
          const product = db.prepare("SELECT stock FROM products WHERE id=?").get(d.product_id);
          if (!product) return send(res, 400, { error: "Producto no encontrado" });
          db.prepare("UPDATE products SET stock=COALESCE(stock,0)+? WHERE id=?").run(Number(d.quantity), Number(d.product_id));
          invalidateReadCache("products");
          invalidateReadCache("stock");
          db.prepare("INSERT INTO inventory_movements(product_id,movement_type,quantity,reference,notes) VALUES(?,?,?,?,?)").run(d.product_id, "Devolución", d.quantity, d.code || "", d.reason || "Devolución de cliente");
          d.status = d.status || "Recibida";
        }
        if (t === "inventory_movements" && d.product_id && d.quantity) {
          const isExit = String(d.movement_type || "").toLowerCase() === "salida";
          if (isExit && !d.shipment_id) {
            const sourceOrder = d.order_id
              ? db.prepare("SELECT * FROM orders WHERE id=?").get(Number(d.order_id))
              : null;
            const clientId = Number(d.client_id || sourceOrder?.client_id || 0);
            const client = clientId
              ? db.prepare("SELECT * FROM clients WHERE id=?").get(clientId)
              : null;
            if (!client) return send(res, 400, { error: "Toda salida debe estar vinculada a un cliente y a una hoja de carga" });
            const product = db.prepare("SELECT name FROM products WHERE id=?").get(Number(d.product_id));
            const shipmentNow = new Date();
            const shipmentCode = `CAR-${shipmentNow.toISOString().slice(0, 10).replace(/-/g, "")}-${String(Date.now()).slice(-5)}`;
            const expected = sourceOrder?.delivery_date || null;
            const shipment = db.prepare(
              "INSERT INTO shipments(code,order_id,client_id,carrier,status,prepared_at,expected_delivery_at,address,origin_address,packages,notes,prepared_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ).run(
              shipmentCode,
              sourceOrder?.id || d.order_id || null,
              clientId,
              "Repartos Exclusivas",
              "Preparando",
              shipmentNow.toISOString(),
              expected,
              client.address || "",
              "Almacén Centro · Calle Logística 10, Madrid",
              Math.max(1, Math.ceil(Number(d.quantity) / 20)),
              `Hoja de carga creada automáticamente para la salida. Producto: ${product?.name || "Producto"}.`,
              actor,
              shipmentNow.toISOString(),
              shipmentNow.toISOString(),
            );
            d.shipment_id = Number(shipment.lastInsertRowid);
            d.client_id = clientId;
            d.notes = `${d.notes || ""}${d.notes ? " " : ""}Hoja de carga ${shipmentCode}.`;
          }
          const sign = ["salida", "ajuste negativo", "devolución"].includes(String(d.movement_type || "").toLowerCase()) ? -1 : 1;
          db.prepare("UPDATE products SET stock=COALESCE(stock,0)+? WHERE id=?").run(sign * Number(d.quantity), Number(d.product_id));
          invalidateReadCache("products");
          invalidateReadCache("stock");
        }
        if (
          t === "products" &&
          d.cost_price !== undefined &&
          d.markup_percent !== undefined
        ) {
          d.unit_price =
            Number(d.cost_price) * (1 + Number(d.markup_percent) / 100);
          d.margin_percent = d.unit_price
            ? ((d.unit_price - Number(d.cost_price)) / d.unit_price) * 100
            : 0;
        }
        if (t === "products") {
          if (!String(d.warehouse_location || "").trim()) {
            const nextPickingOrder = Number(db.prepare("SELECT COALESCE(MAX(picking_order),0)+1 next FROM products").get().next || 1);
            const aisle = String.fromCharCode(65 + (Math.floor((nextPickingOrder - 1) / 200) % 26));
            d.warehouse_location = `${aisle}-${String(((nextPickingOrder - 1) % 200) + 1).padStart(3, "0")}`;
            d.picking_order = nextPickingOrder;
          }
          d.stock_min = d.stock_min === undefined ? Number(d.min_stock || 0) : Number(d.stock_min || 0);
          d.real_cost = Number(d.cost_price || 0) + Number(d.freight_cost || 0) + Number(d.handling_cost || 0);
        }
        if (t === "orders" && d.product_id && d.quantity && !orderLines) {
          const product = db
            .prepare(
              "SELECT stock,COALESCE(stock_reserved,0) stock_reserved FROM products WHERE id=?",
            )
            .get(d.product_id);
          if (!product)
            return send(res, 400, { error: "Producto no encontrado" });
          const available = Number(product.stock) - Number(product.stock_reserved);
          const minimum = Number(product.stock_min ?? product.min_stock ?? 0);
          if (available < Number(d.quantity)) stockShortages.push({ product_id: Number(d.product_id), requested: Number(d.quantity), available });
          if (available - Number(d.quantity) < minimum) stockAlerts.push({ product_id: Number(d.product_id), requested: Number(d.quantity), available_after: available - Number(d.quantity), minimum });
        }
        if (t === "orders" && (stockShortages.length || stockAlerts.length)) d.stock_alert = 1;
        if (t === "orders" && d.collection_point_id) {
          const shippingLocation = db.prepare("SELECT * FROM collection_points WHERE id=? AND (client_id=? OR client_id IS NULL)").get(Number(d.collection_point_id), Number(d.client_id || 0));
          if (!shippingLocation) return send(res, 400, { error: "La ubicación de envío no pertenece al cliente seleccionado" });
          d.address = shippingLocation.address || d.address || "";
        }
        const keys = Object.keys(d),
          r = db
            .prepare(
              `INSERT INTO ${t} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
            )
            .run(...keys.map((k) => d[k]));
        if (t === "payments" && d.invoice_id) {
          const invoice = db.prepare("SELECT amount FROM invoices WHERE id=?").get(d.invoice_id);
          const paid = db.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE invoice_id=?").get(d.invoice_id).total;
          db.prepare("UPDATE invoices SET status=? WHERE id=?").run(Number(paid) + Number(d.amount || 0) >= Number(invoice?.amount || 0) ? "Cobrada" : "Parcial", d.invoice_id);
          invalidateReadCache("invoices");
        }
        if (t === "orders" && d.product_id && d.quantity)
          db.prepare(
            "UPDATE products SET stock_reserved=COALESCE(stock_reserved,0)+? WHERE id=?",
          ).run(Number(d.quantity), Number(d.product_id));
        if (t === "orders" && d.product_id && d.quantity) {
          invalidateReadCache("products");
          invalidateReadCache("stock");
        }
        if (t === "orders" && orderLines) {
          for (const line of orderLines) {
            db.prepare("INSERT INTO order_lines(order_id,product_id,quantity,quantity_requested,quantity_unit,units_factor,unit_price,discount,vat,amount,prepared,prepared_quantity,preparation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(Number(r.lastInsertRowid), line.product_id, line.quantity, line.quantity_requested, line.quantity_unit, line.units_factor, line.unit_price, line.discount, line.vat, line.amount, 0, 0, "Pendiente", now, now);
            if (line.product_id !== Number(d.product_id)) db.prepare("UPDATE products SET stock_reserved=COALESCE(stock_reserved,0)+? WHERE id=?").run(line.quantity, line.product_id);
          }
        }
        if (t === "orders") {
          const client = d.client_id ? db.prepare("SELECT address,invoice_delivery_method FROM clients WHERE id=?").get(Number(d.client_id)) : null;
          const shipmentCode = `ENV-${new Date().getFullYear()}-${String(Date.now()).slice(-7)}`;
          db.prepare("INSERT INTO shipments(code,order_id,client_id,status,preparation_date,urgent,expected_delivery_at,address,packages,incidents,notes,driver_notes,invoice_delivery_method,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(shipmentCode, Number(r.lastInsertRowid), d.client_id || null, "Preparando", d.preparation_date || null, Number(d.urgent || 0), d.shipping_date || d.delivery_date || null, d.address || client?.address || null, 1, "", d.loading_notes || d.notes || (d.urgent ? "PEDIDO URGENTE · Revisar todas las líneas antes de preparar." : "Preparación pendiente de revisión."), d.driver_notes || "", client?.invoice_delivery_method || "Pendiente de indicar", now, now);
        }
        if (t === "orders" && stockShortages.length) {
          recordAudit(actor, "POST", `orders/${Number(r.lastInsertRowid)}`, "Alerta stock", JSON.stringify(stockShortages));
        }
        if (t === "products" && (d.cost_price !== undefined || d.unit_price !== undefined)) {
          db.prepare("INSERT INTO product_price_history(product_id,supplier_id,price_type,amount,valid_from,source,notes,created_at) VALUES(?,?,?,?,?,?,?,?)").run(Number(r.lastInsertRowid), d.primary_supplier_id || d.supplier_id || null, "Coste", Number(d.real_cost || d.cost_price || 0), now, actor, "Registro de alta o actualización del producto", now);
          db.prepare("INSERT INTO product_price_history(product_id,price_type,amount,valid_from,source,notes,created_at) VALUES(?,?,?,?,?,?,?)").run(Number(r.lastInsertRowid), "Venta", Number(d.unit_price || 0), now, actor, "Tarifa principal", now);
        }
        if (t === "orders" && stockAlerts.length) {
          const names = stockAlerts.map((item) => db.prepare("SELECT name FROM products WHERE id=?").get(item.product_id)?.name || `Producto #${item.product_id}`);
          db.prepare("INSERT INTO notes(title,content,priority,module,record_id,important,completed,created_at) VALUES(?,?,?,?,?,?,?,?)").run(`Revisar stock · ${d.code || "Nuevo pedido"}`, `El pedido queda reservado, pero ${names.join(", ")} quedará por debajo del stock mínimo o sin unidades suficientes. Revisa reposición antes de preparar.`, stockShortages.length ? "Urgente" : "Alta", "Stock", Number(r.lastInsertRowid), 1, 0, now);
        }
        if (t === "orders") {
          // Las altas deben notificar el pedido concreto para abrir su modal.
          recordAudit(actor, "POST", `orders/${Number(r.lastInsertRowid)}`, "Alta", `${d.code || "Pedido nuevo"} · pedido registrado`);
        }
        const createdRecord = { id: Number(r.lastInsertRowid), ...d };
        if (t === "orders") createdRecord.stock_alerts = [...stockShortages, ...stockAlerts];
        return send(res, 201, createdRecord);
      }
      if (req.method === "DELETE") {
        invalidateReadCache(t);
        const now = new Date().toISOString();
        if (t === "orders") {
          const order = db.prepare("SELECT * FROM orders WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(Number(p[2]));
          if (!order) return send(res, 404, { error: "Registro no encontrado" });
          const terminal = ["Enviado", "En reparto", "Entregado", "Cancelado"].includes(String(order.status || ""));
          if (!terminal) {
            const lines = db.prepare("SELECT product_id,quantity FROM order_lines WHERE order_id=?").all(Number(p[2]));
            if (lines.length) {
              for (const line of lines) db.prepare("UPDATE products SET stock_reserved=MAX(0,COALESCE(stock_reserved,0)-?) WHERE id=?").run(Number(line.quantity || 0), Number(line.product_id));
            } else if (order.product_id && order.quantity) {
              db.prepare("UPDATE products SET stock_reserved=MAX(0,COALESCE(stock_reserved,0)-?) WHERE id=?").run(Number(order.quantity), Number(order.product_id));
            }
          }
          db.prepare("UPDATE shipments SET status='Cancelado',updated_at=? WHERE order_id=? AND status NOT IN ('Enviado','En reparto','Entregado','Cancelado')").run(now, Number(p[2]));
          db.prepare("UPDATE notes SET deleted=1,deleted_at=?,deleted_by=?,updated_at=? WHERE module='Stock' AND record_id=? AND title LIKE 'Revisar stock ·%' AND CAST(COALESCE(deleted,0) AS INTEGER)=0").run(now, actor, now, Number(p[2]));
        }
        db.prepare(`UPDATE ${t} SET deleted=1,deleted_at=?,deleted_by=?,updated_at=? WHERE id=?`).run(now, actor, now, p[2]);
        return send(res, 200, { ok: true, deleted: 1 });
      }
      if (req.method === "PUT") {
        if (t === "products" && String(d.sku || "").trim()) {
          const duplicate = db.prepare("SELECT id FROM products WHERE LOWER(TRIM(COALESCE(sku,'')))=LOWER(TRIM(?)) AND id<>? AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(String(d.sku), Number(p[2]));
          if (duplicate) return send(res, 409, { error: "Ya existe un producto con ese SKU" });
        }
        invalidateReadCache(t);
        d.updated_at = new Date().toISOString();
        if (t === "order_lines" && d.quantity !== undefined) {
          const oldLine = db.prepare("SELECT ol.*,o.status order_status FROM order_lines ol LEFT JOIN orders o ON o.id=ol.order_id WHERE ol.id=?").get(Number(p[2]));
          if (oldLine && !["Enviado", "En reparto", "Entregado", "Cancelado"].includes(String(oldLine.order_status || ""))) {
            const delta = Number(d.quantity || 0) - Number(oldLine.quantity || 0);
            if (delta) db.prepare("UPDATE products SET stock_reserved=MAX(0,COALESCE(stock_reserved,0)+?) WHERE id=?").run(delta, Number(oldLine.product_id));
          }
        }
        if (t === "shipments" && d.status) {
          const oldShipment = db.prepare("SELECT * FROM shipments WHERE id=?").get(Number(p[2]));
          const movingOut = ["Enviado", "En reparto", "Entregado"].includes(String(d.status)) && !["Enviado", "En reparto", "Entregado"].includes(String(oldShipment?.status || ""));
          const cancelling = String(d.status) === "Cancelado" && String(oldShipment?.status || "") !== "Cancelado";
          if (oldShipment?.order_id && (movingOut || cancelling) && !oldShipment.stock_released_at) {
            const lines = db.prepare("SELECT * FROM order_lines WHERE order_id=?").all(Number(oldShipment.order_id));
            for (const line of lines) {
              const reserved = Number(line.quantity || 0);
              const shipped = movingOut ? (Number(line.prepared_quantity || 0) > 0 ? Number(line.prepared_quantity) : reserved) : 0;
              db.prepare("UPDATE products SET stock_reserved=MAX(0,COALESCE(stock_reserved,0)-?),stock=COALESCE(stock,0)-? WHERE id=?").run(reserved, shipped, Number(line.product_id));
              if (movingOut && shipped > 0) db.prepare("INSERT INTO inventory_movements(product_id,movement_type,quantity,reference,notes,movement_date) VALUES(?,?,?,?,?,?)").run(Number(line.product_id), "Salida", shipped, oldShipment.code || `ENV-${oldShipment.id}`, `Salida del pedido ${oldShipment.order_id}`, new Date().toISOString());
            }
            d.stock_released_at = new Date().toISOString();
            d.stock_released_by = actor;
            db.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?").run(movingOut ? (d.status === "Entregado" ? "Entregado" : "Enviado") : "Cancelado", new Date().toISOString(), Number(oldShipment.order_id));
          }
        }
        if (t === "purchase_orders" && d.status === "Recibida") {
          const oldPurchase = db.prepare("SELECT * FROM purchase_orders WHERE id=?").get(p[2]);
          if (oldPurchase && oldPurchase.status !== "Recibida") {
            const lines = db.prepare("SELECT * FROM purchase_order_lines WHERE purchase_order_id=?").all(p[2]);
            for (const line of lines) {
            db.prepare("INSERT INTO inventory_movements(product_id,movement_type,quantity,reference,notes) VALUES(?,?,?,?,?)").run(line.product_id, "Entrada", line.quantity, oldPurchase.code, "Recepción de compra");
              db.prepare("UPDATE products SET stock=COALESCE(stock,0)+?,cost_price=? WHERE id=?").run(Number(line.quantity), Number(line.unit_cost || 0), line.product_id);
              invalidateReadCache("products");
              invalidateReadCache("stock");
            }
          }
        }
        if (t === "orders" && d.status) {
          const old = db.prepare("SELECT * FROM orders WHERE id=?").get(p[2]);
          if (
            old &&
            old.status !== d.status &&
            old.product_id &&
            old.quantity
          ) {
            if (d.status === "Enviado")
              db.prepare(
                "UPDATE products SET stock=stock-?,stock_reserved=MAX(0,COALESCE(stock_reserved,0)-?) WHERE id=?",
              ).run(
                Number(old.quantity),
                Number(old.quantity),
                Number(old.product_id),
              );
            if (d.status === "Enviado") {
              const existing = db
                .prepare("SELECT id FROM shipments WHERE order_id=?")
                .get(old.id);
              if (!existing)
                db.prepare(
                  "INSERT INTO shipments(code,order_id,client_id,status,prepared_at,shipped_at,expected_delivery_at,address) VALUES(?,?,?,?,?,?,?,?)",
                ).run(
                  `ENV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
                  old.id,
                  old.client_id,
                  "Enviado",
                  old.delivery_date
                    ? new Date(old.delivery_date).toISOString()
                    : new Date().toISOString(),
                  new Date().toISOString(),
                  old.delivery_date || null,
                  null,
                );
            } else if (d.status === "Preparado") {
              db.prepare(
                "UPDATE shipments SET status='Preparado',prepared_at=COALESCE(prepared_at,?) WHERE order_id=?",
              ).run(new Date().toISOString(), old.id);
            }
            if (d.status === "Cancelado")
              db.prepare(
                "UPDATE products SET stock_reserved=MAX(0,COALESCE(stock_reserved,0)-?) WHERE id=?",
              ).run(Number(old.quantity), Number(old.product_id));
            invalidateReadCache("products");
            invalidateReadCache("stock");
          }
        }
        if (t === "orders") {
          const linkedShipment = db.prepare("SELECT id FROM shipments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(p[2]);
          if (linkedShipment) {
            const currentOrder = db.prepare("SELECT client_id,delivery_date,preparation_date,shipping_date,urgent FROM orders WHERE id=?").get(p[2]);
            const clientId = d.client_id ?? currentOrder?.client_id ?? null;
            const client = clientId
              ? db.prepare("SELECT address FROM clients WHERE id=?").get(clientId)
              : null;
            db.prepare("UPDATE shipments SET client_id=?,preparation_date=?,urgent=?,expected_delivery_at=?,address=? WHERE id=?").run(
              clientId,
              d.preparation_date ?? currentOrder?.preparation_date ?? null,
              Number(d.urgent ?? currentOrder?.urgent ?? 0),
              d.shipping_date ?? currentOrder?.shipping_date ?? d.delivery_date ?? currentOrder?.delivery_date ?? null,
              client?.address || null,
              linkedShipment.id,
            );
          }
        }
        if (t === "orders" && (reopenPreparation || ["Bloqueado", "Pospuesto", "Cancelado"].includes(String(d.status || "")))) {
          const linked = db.prepare("SELECT id,status FROM shipments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(p[2]);
          if (linked && reopenPreparation) {
            db.prepare("UPDATE shipments SET status='Pendiente',prepared_at=NULL,prepared_by=NULL,incidents='',updated_at=? WHERE id=?").run(new Date().toISOString(), linked.id);
            db.prepare("UPDATE order_lines SET prepared=0,prepared_quantity=0,preparation_status='Pendiente',updated_at=? WHERE order_id=?").run(new Date().toISOString(), p[2]);
          } else if (linked && ["Bloqueado", "Pospuesto", "Cancelado"].includes(String(d.status || ""))) {
            db.prepare("UPDATE shipments SET status=?,updated_at=? WHERE id=?").run(d.status, new Date().toISOString(), linked.id);
          }
        }
        if (
          t === "products" &&
          d.cost_price !== undefined &&
          d.markup_percent !== undefined
        ) {
          d.unit_price =
            Number(d.cost_price) * (1 + Number(d.markup_percent) / 100);
          d.margin_percent = d.unit_price
            ? ((d.unit_price - Number(d.cost_price)) / d.unit_price) * 100
            : 0;
        }
        if (t === "products") {
          const previous = db.prepare("SELECT * FROM products WHERE id=?").get(Number(p[2]));
          d.stock_min = d.stock_min === undefined ? Number(d.min_stock ?? previous?.min_stock ?? 0) : Number(d.stock_min || 0);
          d.real_cost = Number(d.cost_price ?? previous?.cost_price ?? 0) + Number(d.freight_cost ?? previous?.freight_cost ?? 0) + Number(d.handling_cost ?? previous?.handling_cost ?? 0);
        }
        const writableColumns = new Set(
          db.prepare(`PRAGMA table_info(${t})`).all().map((column) => String(column.name || "")),
        );
        const keys = Object.keys(d).filter((k) => k !== "id" && writableColumns.has(k));
        if (!keys.length) return send(res, 400, { error: "No hay campos válidos para actualizar" });
        db.prepare(
          `UPDATE ${t} SET ${keys.map((k) => k + "=?").join(",")} WHERE id=?`,
        ).run(...keys.map((k) => d[k]), p[2]);
        if (t === "products" && (d.cost_price !== undefined || d.unit_price !== undefined)) {
          const now = new Date().toISOString();
          db.prepare("INSERT INTO product_price_history(product_id,supplier_id,price_type,amount,valid_from,source,notes,created_at) VALUES(?,?,?,?,?,?,?,?)").run(Number(p[2]), d.primary_supplier_id || d.supplier_id || null, "Coste", Number(d.real_cost || d.cost_price || 0), now, actor, "Cambio de precio del producto", now);
          db.prepare("INSERT INTO product_price_history(product_id,price_type,amount,valid_from,source,notes,created_at) VALUES(?,?,?,?,?,?,?)").run(Number(p[2]), "Venta", Number(d.unit_price || 0), now, actor, "Cambio de tarifa principal", now);
        }
        return send(res, 200, { id: Number(p[2]), ...d });
      }
      return send(res, 405, { error: "Método no permitido" });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  })
  .listen(3001, "127.0.0.1", () =>
    console.log(`Excluvas API v3 (${remoteMode ? "Turso remoto" : "SQLite local"}) en http://localhost:3001`),
  );
setInterval(runScheduledTasks, 30000);
