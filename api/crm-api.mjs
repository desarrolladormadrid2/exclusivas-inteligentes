import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRemoteDatabaseSync } from "../remote-db-sync.mjs";
const dir = join(process.cwd(), "data");
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}
function cloudinaryReady() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}
function slugifyProductName(value) {
  return String(value || "producto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "producto";
}
function parseImageDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) return null;
  return { mime: match[1].toLowerCase(), buffer };
}
function cloudinaryTransform(url, transformation) {
  return String(url || "").replace("/image/upload/", `/image/upload/${transformation}/`);
}
async function uploadProductImage(dataUrl, productId, productName) {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed || !cloudinaryReady()) return null;
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME).trim();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "exclusivas-inteligentes/productos";
  const publicId = `producto-${Number(productId)}-${slugifyProductName(productName)}`;
  const signed = { folder, overwrite: "true", public_id: publicId, timestamp };
  const signatureBase = Object.keys(signed).sort().map((key) => `${key}=${signed[key]}`).join("&");
  const signature = createHash("sha1").update(`${signatureBase}${process.env.CLOUDINARY_API_SECRET}`).digest("hex");
  const form = new FormData();
  form.append("file", new Blob([parsed.buffer], { type: parsed.mime }), `${publicId}.${parsed.mime.split("/")[1] || "jpg"}`);
  form.append("api_key", String(process.env.CLOUDINARY_API_KEY).trim());
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("signature", signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`, { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.secure_url) throw new Error(body?.error?.message || "No se pudo subir la imagen a Cloudinary");
  return {
    photo_url: body.secure_url,
    photo_public_id: body.public_id || publicId,
    photo_thumbnail_url: cloudinaryTransform(body.secure_url, "c_fill,w_320,h_320,f_auto,q_auto"),
    photo_web_url: cloudinaryTransform(body.secure_url, "c_limit,w_1600,f_auto,q_auto"),
    photo_bytes: Number(body.bytes || parsed.buffer.length),
    photo_width: Number(body.width || 0),
    photo_height: Number(body.height || 0),
    photo_format: String(body.format || ""),
  };
}
async function uploadReceiptAttachment(dataUrl, receiptCode, incidentKey, index) {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed || !cloudinaryReady()) return null;
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME).trim();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "exclusivas-inteligentes/incidencias-entradas";
  const publicId = `${slugifyProductName(receiptCode)}-${slugifyProductName(incidentKey)}-${index + 1}-${randomBytes(4).toString("hex")}`;
  const signed = { folder, public_id: publicId, timestamp };
  const signatureBase = Object.keys(signed).sort().map((key) => `${key}=${signed[key]}`).join("&");
  const signature = createHash("sha1").update(`${signatureBase}${process.env.CLOUDINARY_API_SECRET}`).digest("hex");
  const form = new FormData();
  form.append("file", new Blob([parsed.buffer], { type: parsed.mime }), `${publicId}.${parsed.mime.split("/")[1] || "jpg"}`);
  form.append("api_key", String(process.env.CLOUDINARY_API_KEY).trim());
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("signature", signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`, { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.secure_url) throw new Error(body?.error?.message || "No se pudo subir el adjunto a Cloudinary");
  return {
    name: `${receiptCode} · ${incidentKey} · ${index + 1}`,
    url: body.secure_url,
    thumbnail_url: cloudinaryTransform(body.secure_url, "c_fill,w_320,h_240,f_auto,q_auto"),
    public_id: body.public_id || publicId,
    bytes: Number(body.bytes || parsed.buffer.length),
    format: String(body.format || parsed.mime.split("/")[1] || ""),
  };
}
async function uploadDeliveryProofAttachment(dataUrl, shipmentCode, index) {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed || !cloudinaryReady()) return null;
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME).trim();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "exclusivas-inteligentes/entregas";
  const publicId = `${slugifyProductName(shipmentCode)}-${index + 1}-${randomBytes(4).toString("hex")}`;
  const signed = { folder, public_id: publicId, timestamp };
  const signatureBase = Object.keys(signed).sort().map((key) => `${key}=${signed[key]}`).join("&");
  const signature = createHash("sha1").update(`${signatureBase}${process.env.CLOUDINARY_API_SECRET}`).digest("hex");
  const form = new FormData();
  form.append("file", new Blob([parsed.buffer], { type: parsed.mime }), `${publicId}.${parsed.mime.split("/")[1] || "jpg"}`);
  form.append("api_key", String(process.env.CLOUDINARY_API_KEY).trim());
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("signature", signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`, { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.secure_url) throw new Error(body?.error?.message || "No se pudo subir la fotografía de entrega");
  return { name: `${shipmentCode}-${index + 1}`, mime: parsed.mime, url: body.secure_url, thumbnail_url: cloudinaryTransform(body.secure_url, "c_fill,w_360,h_240,f_auto,q_auto") };
}
function pdfSafeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}
function pdfLiteral(value) {
  return `(${pdfSafeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}
function createInvoicePdf(invoice) {
  const lineRows = Array.isArray(invoice.lines) ? invoice.lines : [];
  const lineTotal = lineRows.reduce((sum, line) => sum + Number(line.amount || Number(line.quantity || 0) * Number(line.unit_price || 0)), 0);
  const vatRate = Number(invoice.vat || 21);
  const base = lineTotal || (Number(invoice.amount || 0) / (1 + vatRate / 100));
  const total = lineTotal ? base * (1 + vatRate / 100) : Number(invoice.amount || 0);
  const vat = total - base;
  const lines = [
    "EXCLUSIVAS INTELIGENTES",
    "DISTRIBUIDORA DE BEBIDAS",
    "",
    `FACTURA ${invoice.code || `#${invoice.id}`}`,
    `Fecha: ${String(invoice.issue_date || invoice.created_at || new Date().toISOString()).slice(0, 10)}`,
    "",
    `Cliente: ${invoice.client_name || "Cliente no indicado"}`,
    `Direccion: ${invoice.client_address || "No indicada"}`,
    `Ciudad: ${invoice.client_city || "No indicada"}`,
    `Correo: ${invoice.client_email || "No indicado"}`,
    "",
    "CONCEPTOS",
    ...(lineRows.length ? lineRows.flatMap((line) => {
      const description = line.product_name || `Producto #${line.product_id || ""}`;
      const quantity = Number(line.quantity || 0);
      const amount = Number(line.amount || quantity * Number(line.unit_price || 0));
      return [`${description} · ${quantity} uds. · ${amount.toFixed(2)} EUR`];
    }) : ["Sin lineas de producto asociadas"]),
    "",
    `Base imponible: ${base.toFixed(2)} EUR`,
    `IVA (${vatRate.toFixed(0)}%): ${vat.toFixed(2)} EUR`,
    `TOTAL: ${total.toFixed(2)} EUR`,
    "",
    "Documento generado por Exclusivas Inteligentes.",
  ];
  const wrapped = [];
  for (const line of lines) {
    const text = pdfSafeText(line);
    if (!text) { wrapped.push(""); continue; }
    for (let offset = 0; offset < text.length; offset += 92) wrapped.push(text.slice(offset, offset + 92));
  }
  const pages = [];
  for (let offset = 0; offset < wrapped.length; offset += 38) pages.push(wrapped.slice(offset, offset + 38));
  if (!pages.length) pages.push(["Factura sin contenido"]);
  const objects = [];
  const addObject = (value) => { objects.push(value); return objects.length; };
  const catalogId = addObject("");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  for (const pageLines of pages) {
    const commands = ["BT", "/F1 10 Tf", "50 790 Td"];
    pageLines.forEach((line, index) => {
      if (index) commands.push("0 -18 Td");
      commands.push(`${pdfLiteral(line)} Tj`);
    });
    commands.push("ET");
    const contentId = addObject(`<< /Length ${Buffer.byteLength(commands.join("\n"), "ascii")} >>\nstream\n${commands.join("\n")}\nendstream`);
    const pageId = addObject("");
    objects[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, "binary")); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}
function invoicePdfData(invoiceId) {
  const invoice = db.prepare("SELECT i.*,c.name client_name,c.address client_address,c.city client_city,c.email client_email,c.phone client_phone FROM invoices i LEFT JOIN clients c ON c.id=i.client_id WHERE i.id=? AND CAST(COALESCE(i.deleted,0) AS INTEGER)=0").get(Number(invoiceId));
  if (!invoice) return null;
  const lines = db.prepare("SELECT il.*,p.name product_name,p.sku FROM invoice_lines il LEFT JOIN products p ON p.id=il.product_id WHERE il.invoice_id=? ORDER BY il.id").all(Number(invoiceId));
  return { ...invoice, lines };
}
async function uploadInvoicePdf(buffer, invoice) {
  if (!cloudinaryReady()) return null;
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME).trim();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "exclusivas-inteligentes/facturas";
  const publicId = `factura-${Number(invoice.id)}-${slugifyProductName(invoice.code || "documento")}.pdf`;
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/pdf" }), publicId);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("overwrite", "true");
  const credentials = Buffer.from(`${String(process.env.CLOUDINARY_API_KEY).trim()}:${String(process.env.CLOUDINARY_API_SECRET).trim()}`).toString("base64");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/raw/upload`, { method: "POST", headers: { Authorization: `Basic ${credentials}` }, body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.secure_url) throw new Error(body?.error?.message || "No se pudo subir la factura a Cloudinary");
  return { public_id: body.public_id || publicId, secure_url: body.secure_url, bytes: Number(body.bytes || buffer.length) };
}
async function ensureInvoicePdf(invoiceId, actor = "Sistema", force = false) {
  const current = invoicePdfData(invoiceId);
  if (!current) throw new Error("Factura no encontrada");
  if (!force && current.pdf_status === "Generado" && current.pdf_generated_at && current.share_token) return current;
  const pdf = createInvoicePdf(current);
  const uploaded = await uploadInvoicePdf(pdf, current);
  const now = new Date().toISOString();
  const shareToken = current.share_token || randomBytes(24).toString("hex");
  const status = uploaded ? "Generado" : "Generado local · Cloudinary no configurado";
  db.prepare("UPDATE invoices SET pdf_public_id=?,pdf_url=?,pdf_bytes=?,pdf_sha256=?,pdf_generated_at=?,pdf_status=?,share_token=?,updated_at=? WHERE id=?").run(uploaded?.public_id || current.pdf_public_id || null, uploaded?.secure_url || current.pdf_url || null, uploaded?.bytes || pdf.length, createHash("sha256").update(pdf).digest("hex"), now, status, shareToken, now, Number(invoiceId));
  recordAudit(actor, "POST", `invoices/${Number(invoiceId)}/pdf`, "Generar PDF de factura", JSON.stringify({ invoice_id: Number(invoiceId), code: current.code, storage: uploaded ? "Cloudinary" : "local" }));
  invalidateReadCache("invoices");
  return { ...current, pdf_public_id: uploaded?.public_id || current.pdf_public_id || null, pdf_url: uploaded?.secure_url || current.pdf_url || null, pdf_bytes: uploaded?.bytes || pdf.length, pdf_sha256: createHash("sha256").update(pdf).digest("hex"), pdf_generated_at: now, pdf_status: status, share_token: shareToken, _pdf: pdf };
}
function markInvoicePdfStale(invoiceId) {
  if (!invoiceId || !hasColumn("invoices", "pdf_status")) return;
  db.prepare("UPDATE invoices SET pdf_status='Pendiente de regenerar',updated_at=? WHERE id=?").run(new Date().toISOString(), Number(invoiceId));
  invalidateReadCache("invoices");
}
function invoiceShareUrl(req, token) {
  const host = String(req.headers.host || "exclusivas-inteligentes.vercel.app");
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${protocol}://${host}/api/invoices/share/${encodeURIComponent(token)}`;
}
const commercialPdfConfigs = {
  order: { table: "orders", lines: "order_lines", foreignKey: "order_id", label: "PEDIDO", folder: "pedidos", prefix: "pedido", dateFields: ["order_date", "delivery_date", "created_at"] },
  quote: { table: "quotes", lines: "quote_lines", foreignKey: "quote_id", label: "PRESUPUESTO", folder: "presupuestos", prefix: "presupuesto", dateFields: ["quote_date", "created_at"] },
};
function commercialPdfConfig(type) {
  const config = commercialPdfConfigs[String(type || "").toLowerCase()];
  if (!config) throw new Error("Tipo de documento no válido");
  return config;
}
function commercialDocumentPdfData(type, documentId) {
  const config = commercialPdfConfig(type);
  const document = db.prepare(`SELECT d.*,c.name client_name,c.address client_address,c.city client_city,c.email client_email,c.phone client_phone FROM ${config.table} d LEFT JOIN clients c ON c.id=d.client_id WHERE d.id=? AND CAST(COALESCE(d.deleted,0) AS INTEGER)=0`).get(Number(documentId));
  if (!document) return null;
  const lines = db.prepare(`SELECT l.*,p.name product_name,p.sku FROM ${config.lines} l LEFT JOIN products p ON p.id=l.product_id WHERE l.${config.foreignKey}=? ORDER BY l.id`).all(Number(documentId));
  return { ...document, lines };
}
function createCommercialDocumentPdf(document, type) {
  const config = commercialPdfConfig(type);
  const lineRows = Array.isArray(document.lines) ? document.lines : [];
  const lineTotal = lineRows.reduce((sum, line) => sum + Number(line.amount || Number(line.quantity || line.quantity_requested || 0) * Number(line.unit_price || 0)), 0);
  const vatRate = Number(document.vat || 21);
  const total = lineTotal || Number(document.amount || 0);
  const base = lineTotal ? total / (1 + vatRate / 100) : total / (1 + vatRate / 100);
  const vat = total - base;
  const date = config.dateFields.map((field) => document[field]).find(Boolean) || new Date().toISOString();
  const lines = [
    "EXCLUSIVAS INTELIGENTES",
    "DISTRIBUIDORA DE BEBIDAS",
    "",
    `${config.label} ${document.code || `#${document.id}`}`,
    `Fecha: ${String(date).slice(0, 10)}`,
    `Estado: ${document.status || "Pendiente"}`,
    "",
    `Cliente: ${document.client_name || "Cliente no indicado"}`,
    `Direccion: ${document.client_address || document.address || "No indicada"}`,
    `Ciudad: ${document.client_city || document.city || "No indicada"}`,
    `Correo: ${document.client_email || "No indicado"}`,
    "",
    "CONCEPTOS",
    ...(lineRows.length ? lineRows.flatMap((line) => {
      const description = line.product_name || `Producto #${line.product_id || ""}`;
      const quantity = Number(line.quantity || line.quantity_requested || 0);
      const amount = Number(line.amount || quantity * Number(line.unit_price || 0));
      return [`${description} · ${quantity} uds. · ${amount.toFixed(2)} EUR`];
    }) : ["Sin líneas de producto asociadas"]),
    "",
    `Base imponible: ${base.toFixed(2)} EUR`,
    `IVA (${vatRate.toFixed(0)}%): ${vat.toFixed(2)} EUR`,
    `TOTAL: ${total.toFixed(2)} EUR`,
    "",
    "Documento generado por Exclusivas Inteligentes.",
  ];
  const wrapped = [];
  for (const line of lines) {
    const text = pdfSafeText(line);
    if (!text) { wrapped.push(""); continue; }
    for (let offset = 0; offset < text.length; offset += 92) wrapped.push(text.slice(offset, offset + 92));
  }
  const pages = [];
  for (let offset = 0; offset < wrapped.length; offset += 38) pages.push(wrapped.slice(offset, offset + 38));
  if (!pages.length) pages.push([`${config.label} sin contenido`]);
  const objects = [];
  const addObject = (value) => { objects.push(value); return objects.length; };
  const catalogId = addObject("");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  for (const pageLines of pages) {
    const commands = ["BT", "/F1 10 Tf", "50 790 Td"];
    pageLines.forEach((line, index) => {
      if (index) commands.push("0 -18 Td");
      commands.push(`${pdfLiteral(line)} Tj`);
    });
    commands.push("ET");
    const contentId = addObject(`<< /Length ${Buffer.byteLength(commands.join("\n"), "ascii")} >>\nstream\n${commands.join("\n")}\nendstream`);
    const pageId = addObject("");
    objects[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, "binary")); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}
async function uploadCommercialDocumentPdf(buffer, document, type) {
  if (!cloudinaryReady()) return null;
  const config = commercialPdfConfig(type);
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME).trim();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `exclusivas-inteligentes/${config.folder}`;
  const publicId = `${config.prefix}-${Number(document.id)}-${slugifyProductName(document.code || "documento")}.pdf`;
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/pdf" }), publicId);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("overwrite", "true");
  const credentials = Buffer.from(`${String(process.env.CLOUDINARY_API_KEY).trim()}:${String(process.env.CLOUDINARY_API_SECRET).trim()}`).toString("base64");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/raw/upload`, { method: "POST", headers: { Authorization: `Basic ${credentials}` }, body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.secure_url) throw new Error(body?.error?.message || "No se pudo subir el documento a Cloudinary");
  return { public_id: body.public_id || publicId, secure_url: body.secure_url, bytes: Number(body.bytes || buffer.length) };
}
async function ensureCommercialDocumentPdf(type, documentId, actor = "Sistema", force = false) {
  const config = commercialPdfConfig(type);
  const current = commercialDocumentPdfData(type, documentId);
  if (!current) throw new Error(`${config.label[0] + config.label.slice(1).toLowerCase()} no encontrado`);
  if (!force && current.pdf_status === "Generado" && current.pdf_generated_at && current.share_token) return current;
  const pdf = createCommercialDocumentPdf(current, type);
  const uploaded = await uploadCommercialDocumentPdf(pdf, current, type);
  const now = new Date().toISOString();
  const shareToken = current.share_token || randomBytes(24).toString("hex");
  const status = uploaded ? "Generado" : "Generado local · Cloudinary no configurado";
  db.prepare(`UPDATE ${config.table} SET pdf_public_id=?,pdf_url=?,pdf_bytes=?,pdf_sha256=?,pdf_generated_at=?,pdf_status=?,share_token=?,updated_at=? WHERE id=?`).run(uploaded?.public_id || current.pdf_public_id || null, uploaded?.secure_url || current.pdf_url || null, uploaded?.bytes || pdf.length, createHash("sha256").update(pdf).digest("hex"), now, status, shareToken, now, Number(documentId));
  recordAudit(actor, "POST", `${config.table}/${Number(documentId)}/pdf`, `Generar PDF de ${config.label.toLowerCase()}`, JSON.stringify({ document_id: Number(documentId), code: current.code, storage: uploaded ? "Cloudinary" : "local" }));
  invalidateReadCache(config.table);
  return { ...current, pdf_public_id: uploaded?.public_id || current.pdf_public_id || null, pdf_url: uploaded?.secure_url || current.pdf_url || null, pdf_bytes: uploaded?.bytes || pdf.length, pdf_sha256: createHash("sha256").update(pdf).digest("hex"), pdf_generated_at: now, pdf_status: status, share_token: shareToken, _pdf: pdf };
}
function markCommercialDocumentPdfStale(type, documentId) {
  const config = commercialPdfConfig(type);
  if (!documentId || !hasColumn(config.table, "pdf_status")) return;
  db.prepare(`UPDATE ${config.table} SET pdf_status='Pendiente de regenerar',updated_at=? WHERE id=?`).run(new Date().toISOString(), Number(documentId));
  invalidateReadCache(config.table);
}
function documentShareUrl(req, type, token) {
  const host = String(req.headers.host || "exclusivas-inteligentes.vercel.app");
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${protocol}://${host}/api/documents/${encodeURIComponent(type)}/share/${encodeURIComponent(token)}`;
}
const remoteMode = process.env.DATABASE_MODE === "remote";
if (!remoteMode && !existsSync(dir)) mkdirSync(dir);
const db = remoteMode
  ? createRemoteDatabaseSync({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : new DatabaseSync(join(dir, "excluvas.sqlite"));
// Ajustes de SQLite para el uso local habitual: lecturas ágiles, escrituras
// concurrentes sin bloquear la aplicación y menos trabajo de disco.
if (!remoteMode) db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-64000; PRAGMA foreign_keys=ON;");
db.exec(`CREATE TABLE IF NOT EXISTS purchase_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,supplier_id INTEGER,status TEXT DEFAULT 'Borrador',order_date TEXT DEFAULT CURRENT_DATE,expected_date TEXT,amount REAL DEFAULT 0,notes TEXT);`);
for (const column of ["updated_at TEXT", "stock_applied_at TEXT", "stock_applied_by TEXT"]) {
  try { db.exec(`ALTER TABLE purchase_orders ADD COLUMN ${column}`); } catch {}
}
db.exec(`CREATE TABLE IF NOT EXISTS purchase_order_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,purchase_order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL DEFAULT 0,unit_cost REAL DEFAULT 0,amount REAL DEFAULT 0);`);
db.exec(`CREATE TABLE IF NOT EXISTS goods_receipts(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,supplier_id INTEGER NOT NULL,purchase_order_id INTEGER,purchase_invoice_id INTEGER,warehouse_id INTEGER,receipt_date TEXT NOT NULL,status TEXT DEFAULT 'Borrador',validation_status TEXT DEFAULT 'Pendiente',validated_by TEXT,validated_at TEXT,notes TEXT,created_by TEXT,received_by TEXT,created_at TEXT,updated_at TEXT,deleted TEXT DEFAULT '0',deleted_at TEXT,deleted_by TEXT);`);
for (const column of ["purchase_invoice_id INTEGER", "validation_status TEXT DEFAULT 'Pendiente'", "validated_by TEXT", "validated_at TEXT"]) {
  try { db.exec(`ALTER TABLE goods_receipts ADD COLUMN ${column}`); } catch {}
}
db.exec(`CREATE TABLE IF NOT EXISTS goods_receipt_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,receipt_id INTEGER NOT NULL,product_id INTEGER NOT NULL,product_name_snapshot TEXT,expected_quantity REAL DEFAULT 0,received_quantity REAL DEFAULT 0,damaged_quantity REAL DEFAULT 0,substituted_quantity REAL DEFAULT 0,substitute_product_id INTEGER,unit_cost REAL DEFAULT 0,expected_value REAL DEFAULT 0,received_value REAL DEFAULT 0,economic_difference REAL DEFAULT 0,status TEXT DEFAULT 'Correcta',lot_id INTEGER,lot_code TEXT,expiry_date TEXT,notes TEXT,location_verified_status TEXT DEFAULT 'Pendiente',location_verified_code TEXT,location_verified_reason TEXT,location_verified_by TEXT,location_verified_at TEXT,created_at TEXT,updated_at TEXT,deleted TEXT DEFAULT '0',deleted_at TEXT,deleted_by TEXT);`);
for (const column of ["damaged_quantity REAL DEFAULT 0", "substituted_quantity REAL DEFAULT 0", "substitute_product_id INTEGER", "expected_value REAL DEFAULT 0", "received_value REAL DEFAULT 0", "economic_difference REAL DEFAULT 0", "lot_id INTEGER", "lot_code TEXT", "expiry_date TEXT", "location_verified_status TEXT DEFAULT 'Pendiente'", "location_verified_code TEXT", "location_verified_reason TEXT", "location_verified_by TEXT", "location_verified_at TEXT"]) {
  try { db.exec(`ALTER TABLE goods_receipt_lines ADD COLUMN ${column}`); } catch {}
}
db.exec(`CREATE TABLE IF NOT EXISTS goods_receipt_incidents(id INTEGER PRIMARY KEY AUTOINCREMENT,receipt_id INTEGER NOT NULL,receipt_line_id INTEGER,supplier_id INTEGER,type TEXT DEFAULT 'Diferencia',description TEXT NOT NULL,expected_quantity REAL,received_quantity REAL,damaged_quantity REAL DEFAULT 0,substituted_quantity REAL DEFAULT 0,substitute_product_id INTEGER,economic_difference REAL DEFAULT 0,status TEXT DEFAULT 'Abierta',attachment_name TEXT,attachment_mime TEXT,attachment_data TEXT,attachments_json TEXT,claim_status TEXT DEFAULT 'No reclamada',claim_message TEXT,claim_created_by TEXT,claim_created_at TEXT,created_by TEXT,created_at TEXT,updated_at TEXT,deleted TEXT DEFAULT '0',deleted_at TEXT,deleted_by TEXT);`);
for (const column of ["damaged_quantity REAL DEFAULT 0", "substituted_quantity REAL DEFAULT 0", "substitute_product_id INTEGER", "economic_difference REAL DEFAULT 0", "attachments_json TEXT", "claim_status TEXT DEFAULT 'No reclamada'", "claim_message TEXT", "claim_created_by TEXT", "claim_created_at TEXT", "resolution TEXT", "resolved_by TEXT", "resolved_at TEXT"]) {
  try { db.exec(`ALTER TABLE goods_receipt_incidents ADD COLUMN ${column}`); } catch {}
}
db.exec(`CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,content TEXT NOT NULL,priority TEXT DEFAULT 'Normal',module TEXT DEFAULT 'General',record_id INTEGER,important INTEGER DEFAULT 0,completed INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
for (const column of ["status TEXT DEFAULT 'Pendiente'", "resolution TEXT", "resolved_at TEXT", "resolved_by TEXT", "created_by TEXT"]) {
  try { db.exec(`ALTER TABLE notes ADD COLUMN ${column}`); } catch {}
}
db.exec(`CREATE TABLE IF NOT EXISTS document_templates(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,title TEXT NOT NULL,type TEXT NOT NULL,format TEXT DEFAULT 'HTML',description TEXT,subject TEXT,content TEXT NOT NULL,status TEXT DEFAULT 'Activa',created_by TEXT DEFAULT 'Usuario local',created_at TEXT,updated_at TEXT);`);
try { db.exec("ALTER TABLE document_templates ADD COLUMN format TEXT DEFAULT 'HTML'"); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS returns(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,client_id INTEGER,invoice_id INTEGER,product_id INTEGER,quantity REAL DEFAULT 0,reason TEXT,status TEXT DEFAULT 'Pendiente',amount REAL DEFAULT 0,return_condition TEXT DEFAULT 'Apta para stock',stock_destination TEXT DEFAULT 'Stock disponible',stock_applied_quantity REAL DEFAULT 0,quarantine_reason TEXT,lot_id INTEGER,lot_code_snapshot TEXT,expiry_date_snapshot TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
for (const column of ["stock_applied_at TEXT", "stock_applied_by TEXT", "stock_applied_quantity REAL DEFAULT 0", "warehouse_id INTEGER", "order_id INTEGER", "shipment_id INTEGER", "order_line_id INTEGER", "return_date TEXT", "reviewed_by TEXT", "reviewed_at TEXT", "authorized_by TEXT", "authorized_at TEXT", "return_condition TEXT DEFAULT 'Apta para stock'", "stock_destination TEXT DEFAULT 'Stock disponible'", "quarantine_reason TEXT", "lot_id INTEGER", "lot_code_snapshot TEXT", "expiry_date_snapshot TEXT"]) {
  try { db.prepare(`ALTER TABLE returns ADD COLUMN ${column}`).run(); } catch {}
}
db.exec(`CREATE TABLE IF NOT EXISTS collection_points(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE,name TEXT NOT NULL,client_id INTEGER,address TEXT,city TEXT,contact TEXT,phone TEXT,email TEXT,opening_hours TEXT,opening_time TEXT,closing_time TEXT,notes TEXT);`);
try { db.exec("ALTER TABLE collection_points ADD COLUMN client_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE collection_points ADD COLUMN opening_time TEXT"); } catch {}
try { db.exec("ALTER TABLE collection_points ADD COLUMN closing_time TEXT"); } catch {}
try { db.exec("ALTER TABLE collection_points ADD COLUMN latitude REAL"); } catch {}
try { db.exec("ALTER TABLE collection_points ADD COLUMN longitude REAL"); } catch {}
try { db.exec("ALTER TABLE collection_points ADD COLUMN geocoded_at TEXT"); } catch {}
try { db.exec("ALTER TABLE collection_points ADD COLUMN geocoding_status TEXT DEFAULT 'Pendiente'"); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT DEFAULT 'Usuario local',method TEXT NOT NULL,resource TEXT NOT NULL,action TEXT NOT NULL,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS product_location_history(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,previous_location TEXT,current_location TEXT,changed_by TEXT DEFAULT 'Usuario local',changed_at TEXT DEFAULT CURRENT_TIMESTAMP,source TEXT DEFAULT 'CRM');`);
db.exec(`CREATE TABLE IF NOT EXISTS scheduled_tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,action_text TEXT NOT NULL,schedule_type TEXT DEFAULT 'Unica',recurrence TEXT,next_run TEXT,status TEXT DEFAULT 'Activa',last_run TEXT,last_result TEXT,created_by TEXT DEFAULT 'Usuario local',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS backup_snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,created_by TEXT,source TEXT DEFAULT 'Turso',tables_json TEXT NOT NULL,data_base64 TEXT NOT NULL,checksum TEXT NOT NULL,status TEXT DEFAULT 'Disponible',restored_at TEXT,restored_by TEXT,size_bytes INTEGER DEFAULT 0);`);
db.exec(`CREATE TABLE IF NOT EXISTS delivery_routes(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,route_date TEXT NOT NULL,driver TEXT,vehicle TEXT,status TEXT DEFAULT 'Planificada',radius_meters REAL DEFAULT 150,origin_address TEXT,origin_latitude REAL,origin_longitude REAL,notes TEXT,created_by TEXT,created_at TEXT,updated_at TEXT,deleted TEXT DEFAULT '0',deleted_at TEXT,deleted_by TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS delivery_route_stops(id INTEGER PRIMARY KEY AUTOINCREMENT,route_id INTEGER NOT NULL,position INTEGER NOT NULL,shipment_id INTEGER,client_id INTEGER,collection_point_id INTEGER,client_name TEXT,address TEXT,city TEXT,opening_time TEXT,closing_time TEXT,latitude REAL,longitude REAL,distance_km REAL DEFAULT 0,status TEXT DEFAULT 'Pendiente',notes TEXT,created_at TEXT,updated_at TEXT);`);
for (const column of ["opening_time TEXT", "closing_time TEXT"]) { try { db.exec(`ALTER TABLE delivery_route_stops ADD COLUMN ${column}`); } catch {} }
try {
  const duplicateTasks = db.prepare(`SELECT id FROM scheduled_tasks WHERE status='Activa' AND id NOT IN (SELECT MIN(id) FROM scheduled_tasks WHERE status='Activa' GROUP BY LOWER(TRIM(title)),LOWER(TRIM(action_text)),schedule_type,COALESCE(recurrence,''))`).all();
  for (const task of duplicateTasks) db.prepare("UPDATE scheduled_tasks SET status='Pausada',last_result='Pausada automáticamente: tarea duplicada',updated_at=? WHERE id=?").run(new Date().toISOString(), task.id);
} catch {}
db.exec(`CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,client_id INTEGER,expense_date TEXT NOT NULL,category TEXT DEFAULT 'Otros',vendor TEXT,amount REAL DEFAULT 0,vat REAL DEFAULT 21,payment_method TEXT DEFAULT 'Tarjeta',notes TEXT,attachment_name TEXT,attachment_mime TEXT,attachment_data TEXT,status TEXT DEFAULT 'Pendiente',created_by TEXT,created_at TEXT,updated_at TEXT);`);
for (const column of ["status TEXT DEFAULT 'Pendiente'", "created_by TEXT"]) { try { db.exec(`ALTER TABLE expenses ADD COLUMN ${column}`); } catch {} }
db.exec(`CREATE TABLE IF NOT EXISTS ocr_documents(id INTEGER PRIMARY KEY AUTOINCREMENT,file_name TEXT NOT NULL,mime_type TEXT,file_size INTEGER DEFAULT 0,document_type TEXT DEFAULT 'Otro',detected_email TEXT,detected_total TEXT,extracted_text TEXT,status TEXT DEFAULT 'Pendiente',created_by TEXT DEFAULT 'Usuario local',created_at TEXT,updated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS web_registrations(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL DEFAULT 'cliente',company_name TEXT NOT NULL,tax_id TEXT,contact_name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT,address TEXT,city TEXT,message TEXT,status TEXT NOT NULL DEFAULT 'Pendiente de validar',created_at TEXT,updated_at TEXT,reviewed_by TEXT,reviewed_at TEXT);`);
for (const column of ["crm_record_id INTEGER", "crm_record_type TEXT", "rejection_reason TEXT"]) {
  try { db.exec(`ALTER TABLE web_registrations ADD COLUMN ${column}`); } catch {}
}
db.exec(`CREATE TABLE IF NOT EXISTS web_promotions(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,title TEXT NOT NULL,promotion_type TEXT NOT NULL DEFAULT 'flash',description TEXT,kicker TEXT,discount_type TEXT NOT NULL DEFAULT 'percent',discount_value REAL DEFAULT 0,start_at TEXT NOT NULL,end_at TEXT NOT NULL,min_quantity REAL DEFAULT 0,stock_limit REAL,product_ids TEXT NOT NULL DEFAULT '[]',image_url TEXT,conditions TEXT,status TEXT NOT NULL DEFAULT 'Borrador',created_by TEXT,created_at TEXT,updated_at TEXT,published_at TEXT,published_by TEXT,paused_at TEXT,paused_by TEXT,deleted INTEGER DEFAULT 0,deleted_at TEXT,deleted_by TEXT);`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_web_promotions_status_dates ON web_promotions(status,start_at,end_at)"); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,wa_id TEXT,client_id INTEGER,direction TEXT DEFAULT 'Entrante',message_type TEXT DEFAULT 'Texto',content TEXT,media_name TEXT,media_mime TEXT,media_data TEXT,status TEXT DEFAULT 'Pendiente',transcription TEXT,human_review INTEGER DEFAULT 0,suggested_action TEXT,created_at TEXT,updated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS product_price_history(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,supplier_id INTEGER,price_type TEXT DEFAULT 'Coste',amount REAL DEFAULT 0,currency TEXT DEFAULT 'EUR',valid_from TEXT,valid_to TEXT,source TEXT,notes TEXT,created_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS product_suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,supplier_id INTEGER NOT NULL,supplier_ref TEXT,unit_cost REAL DEFAULT 0,minimum_order REAL DEFAULT 0,order_unit TEXT DEFAULT 'caja',transport_cost REAL DEFAULT 0,lead_time_days INTEGER DEFAULT 0,promotion TEXT,rappel_percent REAL DEFAULT 0,reliability_percent REAL DEFAULT 0,is_primary INTEGER DEFAULT 0,is_fixed INTEGER DEFAULT 0,active INTEGER DEFAULT 1,created_at TEXT,updated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS import_batches(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,source_system TEXT NOT NULL,source_file TEXT NOT NULL,entity TEXT NOT NULL,status TEXT DEFAULT 'Pendiente',rows_read INTEGER DEFAULT 0,rows_inserted INTEGER DEFAULT 0,rows_updated INTEGER DEFAULT 0,rows_skipped INTEGER DEFAULT 0,started_at TEXT,completed_at TEXT,notes TEXT,created_by TEXT DEFAULT 'Sistema',created_at TEXT,updated_at TEXT,deleted TEXT DEFAULT '0',deleted_at TEXT,deleted_by TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS import_records(id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id INTEGER NOT NULL,entity TEXT NOT NULL,source_code TEXT,local_id INTEGER,action TEXT NOT NULL,payload_hash TEXT,source_file TEXT,notes TEXT,created_at TEXT,updated_at TEXT,deleted TEXT DEFAULT '0',deleted_at TEXT,deleted_by TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS product_lots(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,lot_code TEXT NOT NULL,quantity REAL DEFAULT 0,quarantine_quantity REAL DEFAULT 0,waste_quantity REAL DEFAULT 0,expiry_date TEXT,received_date TEXT,warehouse_id INTEGER,created_at TEXT,updated_at TEXT);`);
for (const column of ["quarantine_quantity REAL DEFAULT 0", "waste_quantity REAL DEFAULT 0", "barcode TEXT"]) {
  try { db.prepare(`ALTER TABLE product_lots ADD COLUMN ${column}`).run(); } catch {}
}
if (remoteMode && process.env.RUN_REMOTE_MIGRATIONS === "1") {
  for (const [table, columns] of [
    ["returns", ["stock_applied_quantity REAL DEFAULT 0", "return_condition TEXT DEFAULT 'Apta para stock'", "stock_destination TEXT DEFAULT 'Stock disponible'", "quarantine_reason TEXT", "lot_id INTEGER", "lot_code_snapshot TEXT", "expiry_date_snapshot TEXT"]],
    ["product_lots", ["quarantine_quantity REAL DEFAULT 0", "waste_quantity REAL DEFAULT 0", "barcode TEXT"]],
    ["inventory_movements", ["stock_effect REAL"]],
  ]) {
    for (const column of columns) { try { db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column}`).run(); } catch {} }
  }
}
db.exec(`CREATE TABLE IF NOT EXISTS product_equivalents(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,equivalent_product_id INTEGER NOT NULL,priority INTEGER DEFAULT 1,notes TEXT,active INTEGER DEFAULT 1,created_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS purchase_suggestions(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,suggested_quantity REAL DEFAULT 0,reason TEXT,status TEXT DEFAULT 'Pendiente de validar',recommended_supplier_id INTEGER,comparison TEXT,created_at TEXT,updated_at TEXT,validated_by TEXT,validated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS purchase_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,request_type TEXT DEFAULT 'Solicitud de oferta',status TEXT DEFAULT 'Borrador',product_ids TEXT,supplier_ids TEXT,notes TEXT,created_by TEXT,validated_by TEXT,created_at TEXT,updated_at TEXT,public_token TEXT,channels TEXT,sent_at TEXT);`);
for (const column of ["public_token TEXT", "channels TEXT", "sent_at TEXT", "valid_until TEXT"]) { try { db.exec(`ALTER TABLE purchase_requests ADD COLUMN ${column}`); } catch {} }
db.exec(`CREATE TABLE IF NOT EXISTS purchase_request_offers(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id INTEGER NOT NULL,supplier_id INTEGER,supplier_ref TEXT,contact_name TEXT,email TEXT,valid_until TEXT,delivery_days INTEGER DEFAULT 0,notes TEXT,lines_json TEXT NOT NULL,status TEXT DEFAULT 'Recibida',created_at TEXT,updated_at TEXT);`);
for (const [table, columns] of [["orders", ["collection_point_id", "prepared_by", "shipped_by", "delivered_by", "address", "delivery_city", "preparation_date", "shipping_date"]], ["shipments", ["collection_point_id", "prepared_by", "shipped_by", "delivered_by", "preparation_date", "delivery_city"]]]) for (const column of columns) { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`); } catch {} }
try { db.exec("ALTER TABLE orders ADD COLUMN source_order_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE orders ADD COLUMN urgent INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE orders ADD COLUMN created_by TEXT"); } catch {}
for (const column of ["order_id", "delivery_note_id"]) { try { db.exec(`ALTER TABLE invoices ADD COLUMN ${column} INTEGER`); } catch {} }
try { db.exec("ALTER TABLE quotes ADD COLUMN converted_order_id INTEGER"); } catch {}
for (const column of ["return_date", "reviewed_by", "reviewed_at", "authorized_by", "authorized_at"]) {
  try { db.exec(`ALTER TABLE returns ADD COLUMN ${column} TEXT`); } catch {}
}
try { db.exec("ALTER TABLE orders ADD COLUMN stock_alert INTEGER DEFAULT 0"); } catch {}
db.exec(
  `CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT DEFAULT 'user',must_change INTEGER DEFAULT 1);CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT,email TEXT,address TEXT);CREATE TABLE IF NOT EXISTS warehouses(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,address TEXT);CREATE TABLE IF NOT EXISTS delivery_notes(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,order_id INTEGER,client_id INTEGER,status TEXT DEFAULT 'Pendiente');CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER,amount REAL DEFAULT 0,payment_date TEXT DEFAULT CURRENT_DATE,method TEXT DEFAULT 'Transferencia');CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT,email TEXT,address TEXT);CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,unit_price REAL DEFAULT 0,stock REAL DEFAULT 0);CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,client_id INTEGER,product_id INTEGER,quantity REAL DEFAULT 0,amount REAL DEFAULT 0,status TEXT DEFAULT 'Pendiente');CREATE TABLE IF NOT EXISTS quotes(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,client_id INTEGER,amount REAL DEFAULT 0,status TEXT DEFAULT 'Borrador');CREATE TABLE IF NOT EXISTS invoices(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,client_id INTEGER,amount REAL DEFAULT 0,status TEXT DEFAULT 'Pendiente');`,
);
// Las cuentas del portal deben disponer de estas columnas tanto en una base
// nueva como en instalaciones existentes. El bloque anterior a las tablas
// base solo cubre instalaciones antiguas.
for (const [table, columns] of [["web_registrations", ["portal_password_hash TEXT"]], ["clients", ["portal_password_hash TEXT", "portal_access_enabled INTEGER DEFAULT 0"]], ["suppliers", ["portal_password_hash TEXT", "portal_access_enabled INTEGER DEFAULT 0"]]]) {
  for (const column of columns) { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`); } catch {} }
}
if (remoteMode && process.env.RUN_REMOTE_MIGRATIONS === "1") {
  for (const [table, columns] of [["web_registrations", ["portal_password_hash TEXT"]], ["clients", ["portal_password_hash TEXT", "portal_access_enabled INTEGER DEFAULT 0"]], ["suppliers", ["portal_password_hash TEXT", "portal_access_enabled INTEGER DEFAULT 0"]]]) {
    for (const column of columns) { try { db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column}`).run(); } catch {} }
  }
}
for (const [table, columns] of [
  ["clients", ["city TEXT", "deleted INTEGER DEFAULT 0", "created_at TEXT", "updated_at TEXT"]],
  ["suppliers", ["active INTEGER DEFAULT 1", "deleted INTEGER DEFAULT 0", "created_at TEXT", "updated_at TEXT"]],
  ["orders", ["unit_price REAL DEFAULT 0", "discount REAL DEFAULT 0", "vat REAL DEFAULT 21", "notes TEXT", "delivery_date TEXT", "address TEXT", "collection_point_id INTEGER", "prepared_by TEXT", "shipped_by TEXT", "delivered_by TEXT", "preparation_date TEXT", "shipping_date TEXT", "delivery_city TEXT", "urgent INTEGER DEFAULT 0", "created_by TEXT", "stock_alert INTEGER DEFAULT 0", "deleted INTEGER DEFAULT 0", "created_at TEXT", "updated_at TEXT"]],
  ["products", ["sku TEXT", "cost_price REAL DEFAULT 0", "category TEXT", "format TEXT", "unit TEXT", "vat REAL DEFAULT 21", "stock_reserved REAL DEFAULT 0", "active INTEGER DEFAULT 1", "product_status TEXT DEFAULT 'Activo'", "min_stock REAL DEFAULT 0", "created_at TEXT", "updated_at TEXT"]],
  ["delivery_notes", ["created_at TEXT", "updated_at TEXT", "deleted INTEGER DEFAULT 0"]],
  ["invoices", ["issue_date TEXT", "due_date TEXT", "created_at TEXT", "updated_at TEXT", "deleted INTEGER DEFAULT 0"]],
  ["payments", ["deleted INTEGER DEFAULT 0", "created_at TEXT", "updated_at TEXT"]],
  ["notes", ["deleted INTEGER DEFAULT 0", "updated_at TEXT"]],
]) {
  for (const column of columns) { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`); } catch {} }
}
if (remoteMode && process.env.RUN_REMOTE_MIGRATIONS === "1") {
  for (const [table, columns] of [
    ["clients", ["city TEXT", "deleted INTEGER DEFAULT 0", "created_at TEXT", "updated_at TEXT"]],
    ["suppliers", ["active INTEGER DEFAULT 1", "deleted INTEGER DEFAULT 0", "created_at TEXT", "updated_at TEXT"]],
    ["orders", ["unit_price REAL DEFAULT 0", "discount REAL DEFAULT 0", "vat REAL DEFAULT 21", "notes TEXT", "delivery_date TEXT", "address TEXT", "collection_point_id INTEGER", "prepared_by TEXT", "shipped_by TEXT", "delivered_by TEXT", "preparation_date TEXT", "shipping_date TEXT", "delivery_city TEXT", "urgent INTEGER DEFAULT 0", "created_by TEXT", "stock_alert INTEGER DEFAULT 0", "deleted INTEGER DEFAULT 0", "created_at TEXT", "updated_at TEXT"]],
    ["products", ["sku TEXT", "cost_price REAL DEFAULT 0", "category TEXT", "format TEXT", "unit TEXT", "vat REAL DEFAULT 21", "stock_reserved REAL DEFAULT 0", "active INTEGER DEFAULT 1", "product_status TEXT DEFAULT 'Activo'", "min_stock REAL DEFAULT 0", "created_at TEXT", "updated_at TEXT"]],
    ["delivery_notes", ["created_at TEXT", "updated_at TEXT", "deleted INTEGER DEFAULT 0"]],
    ["invoices", ["issue_date TEXT", "due_date TEXT", "created_at TEXT", "updated_at TEXT", "deleted INTEGER DEFAULT 0"]],
    ["payments", ["deleted INTEGER DEFAULT 0", "created_at TEXT", "updated_at TEXT"]],
    ["notes", ["deleted INTEGER DEFAULT 0", "updated_at TEXT"]],
  ]) {
    for (const column of columns) { try { db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column}`).run(); } catch {} }
  }
}
// Estas migraciones se repiten después de crear las tablas base para que también
// se apliquen en instalaciones antiguas donde el primer bloque aún no existía.
for (const [table, columns] of [["orders", ["preparation_date", "shipping_date", "delivery_city"]], ["shipments", ["preparation_date", "delivery_city"]]]) for (const column of columns) { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`); } catch {} }
try { db.exec("ALTER TABLE orders ADD COLUMN urgent INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE shipments ADD COLUMN urgent INTEGER DEFAULT 0"); } catch {}
if (!remoteMode) {
  try { db.exec("UPDATE purchase_orders SET stock_applied_at=COALESCE(stock_applied_at,updated_at,order_date) WHERE status='Recibida' AND stock_applied_at IS NULL"); } catch {}
}
db.exec(
  `CREATE TABLE IF NOT EXISTS inventory_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,warehouse_id INTEGER, movement_type TEXT NOT NULL, quantity REAL DEFAULT 0, reference TEXT, movement_date TEXT DEFAULT CURRENT_DATE, notes TEXT);`,
);
try { db.exec("ALTER TABLE inventory_movements ADD COLUMN receipt_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE inventory_movements ADD COLUMN stock_effect REAL"); } catch {}
for (const [table, columns] of [
  ["products", ["photo_name TEXT", "photo_mime TEXT", "photo_data TEXT", "photo_url TEXT", "photo_public_id TEXT", "photo_thumbnail_url TEXT", "photo_web_url TEXT", "photo_bytes INTEGER DEFAULT 0", "photo_width INTEGER DEFAULT 0", "photo_height INTEGER DEFAULT 0", "photo_format TEXT", "description TEXT", "category_code TEXT", "warehouse_id INTEGER", "preorder INTEGER DEFAULT 1", "product_tracking_code TEXT DEFAULT 'Sin seguimiento'", "inventory_valuation_method TEXT DEFAULT 'FIFO'", "last_direct_cost REAL DEFAULT 0", "accounting_product_group TEXT DEFAULT 'Mercaderías'", "accounting_vat_group TEXT DEFAULT '21%'", "inventory_register_group TEXT DEFAULT 'Mercaderías'", "created_at TEXT", "created_by TEXT", "family TEXT", "subfamily TEXT", "purchase_format TEXT", "sale_format TEXT", "cases_per_pallet REAL DEFAULT 0", "units_per_pallet REAL DEFAULT 0", "weight_kg REAL DEFAULT 0", "volume_m3 REAL DEFAULT 0", "warehouse_location TEXT", "picking_order INTEGER DEFAULT 0", "product_status TEXT DEFAULT 'Activo'", "primary_supplier_id INTEGER", "fixed_supplier INTEGER DEFAULT 0", "target_margin_percent REAL DEFAULT 0", "min_margin_percent REAL DEFAULT 0", "stock_min REAL DEFAULT 0", "stock_target REAL DEFAULT 0", "stock_safety REAL DEFAULT 0", "lot_tracking INTEGER DEFAULT 0", "expiry_tracking INTEGER DEFAULT 0", "returnable_packaging INTEGER DEFAULT 0", "tax_surcharge_percent REAL DEFAULT 0", "extra_tax_name TEXT", "extra_tax_percent REAL DEFAULT 0", "freight_cost REAL DEFAULT 0", "handling_cost REAL DEFAULT 0", "real_cost REAL DEFAULT 0"]],
  ["suppliers", ["tax_id TEXT", "contact TEXT", "payment_terms TEXT", "city TEXT", "latitude REAL", "longitude REAL", "geocoding_status TEXT DEFAULT 'Pendiente'", "minimum_order REAL DEFAULT 0", "transport_cost REAL DEFAULT 0", "lead_time_days INTEGER DEFAULT 0", "reliability_percent REAL DEFAULT 0", "promotions TEXT", "rappel_percent REAL DEFAULT 0", "active INTEGER DEFAULT 1", "external_code TEXT", "source_system TEXT", "source_warehouse_code TEXT", "source_created_at TEXT", "source_closed_at TEXT", "source_balance REAL DEFAULT 0", "source_overdue_balance REAL DEFAULT 0", "source_payments REAL DEFAULT 0"]],
  ["clients", ["city TEXT", "external_code TEXT", "source_system TEXT", "active INTEGER DEFAULT 1", "billing_address TEXT", "billing_city TEXT", "opening_time TEXT", "closing_time TEXT", "latitude REAL", "longitude REAL", "geocoded_at TEXT", "geocoding_status TEXT DEFAULT 'Pendiente'", "payment_method_code TEXT", "payment_terms_code TEXT", "source_warehouse_code TEXT", "source_created_at TEXT", "source_closed_at TEXT", "source_balance REAL DEFAULT 0", "source_overdue_balance REAL DEFAULT 0", "source_sales REAL DEFAULT 0", "source_payments REAL DEFAULT 0"]],
  ["products", ["external_code TEXT", "source_system TEXT", "active INTEGER DEFAULT 1", "source_type TEXT", "source_substitute TEXT", "assembly_item INTEGER DEFAULT 0", "cost_adjusted INTEGER DEFAULT 0", "default_split_template TEXT", "source_supplier_code TEXT", "source_created_at TEXT", "source_closed_at TEXT"]],
  ["purchase_orders", ["validation_status TEXT DEFAULT 'Pendiente de validar'", "request_id INTEGER", "supplier_ids TEXT", "comparison TEXT"]],
]) for (const column of columns) { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`); } catch {} }
// Horarios independientes de la dirección para planificar futuras rutas.
for (const [table, columns] of [["clients", ["opening_time TEXT", "closing_time TEXT"]], ["collection_points", ["opening_time TEXT", "closing_time TEXT"]]]) {
  for (const column of columns) { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`); } catch {} }
}
// Conservamos los campos históricos de stock y rellenamos los nuevos umbrales
// para que las instalaciones antiguas entren directamente en el motor de compras.
// En Turso estas correcciones se ejecutan mediante la migración puntual; nunca
// durante el arranque de cada función serverless.
if (!remoteMode) {
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
  db.exec("UPDATE products SET family=COALESCE(NULLIF(family,''),COALESCE(NULLIF(category,''),'Bebidas')), subfamily=COALESCE(NULLIF(subfamily,''),COALESCE(NULLIF(format,''),'Distribución')), purchase_format=COALESCE(NULLIF(purchase_format,''),COALESCE(NULLIF(format,''),'caja')), sale_format=COALESCE(NULLIF(sale_format,''),COALESCE(NULLIF(unit,''),'unidad')), units_per_case=COALESCE(NULLIF(units_per_case,0),1), cases_per_pallet=COALESCE(NULLIF(cases_per_pallet,0),40), units_per_pallet=COALESCE(NULLIF(units_per_pallet,0),COALESCE(NULLIF(units_per_case,0),1)*COALESCE(NULLIF(cases_per_pallet,0),40)), warehouse_location=COALESCE(NULLIF(warehouse_location,''),'Almacén central · Pasillo 01'), product_status=COALESCE(NULLIF(product_status,''),'Activo'), stock_min=COALESCE(NULLIF(stock_min,0),NULLIF(min_stock,0),10), stock_target=COALESCE(NULLIF(stock_target,0),MAX(COALESCE(NULLIF(min_stock,0),10)*2,COALESCE(stock,0)+10)), stock_safety=COALESCE(NULLIF(stock_safety,0),5), target_margin_percent=COALESCE(NULLIF(target_margin_percent,0),30), min_margin_percent=COALESCE(NULLIF(min_margin_percent,0),18), real_cost=COALESCE(NULLIF(real_cost,0),COALESCE(cost_price,0)+COALESCE(freight_cost,0)+COALESCE(handling_cost,0)), tax_surcharge_percent=COALESCE(tax_surcharge_percent,0), extra_tax_percent=COALESCE(extra_tax_percent,0)");
} catch {}
}
if (!remoteMode) {
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
}
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
  `CREATE TABLE IF NOT EXISTS shipments(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,order_id INTEGER,delivery_note_id INTEGER,client_id INTEGER,carrier TEXT,status TEXT DEFAULT 'Preparando',prepared_at TEXT,shipped_at TEXT,expected_delivery_at TEXT,delivered_at TEXT,address TEXT,tracking TEXT,packages INTEGER DEFAULT 1,incidents TEXT);`,
);
for (const column of ["deleted INTEGER DEFAULT 0", "deleted_at TEXT", "deleted_by TEXT", "collection_point_id INTEGER", "prepared_by TEXT", "shipped_by TEXT", "delivered_by TEXT", "delivery_city TEXT", "preparation_date TEXT", "urgent INTEGER DEFAULT 0", "public_tracking_token TEXT"]) {
  try { db.exec(`ALTER TABLE shipments ADD COLUMN ${column}`); } catch {}
}
if (remoteMode && process.env.RUN_REMOTE_MIGRATIONS === "1") {
  for (const column of ["deleted INTEGER DEFAULT 0", "deleted_at TEXT", "deleted_by TEXT", "collection_point_id INTEGER", "prepared_by TEXT", "shipped_by TEXT", "delivered_by TEXT", "delivery_city TEXT", "preparation_date TEXT", "urgent INTEGER DEFAULT 0", "public_tracking_token TEXT"]) {
    try { db.prepare(`ALTER TABLE shipments ADD COLUMN ${column}`).run(); } catch {}
  }
  for (const column of ["origin_address TEXT", "departure_at TEXT", "delivery_window_start TEXT", "delivery_window_end TEXT", "notes TEXT", "preparation_started_at TEXT", "preparation_started_by TEXT", "stock_released_at TEXT", "stock_released_by TEXT", "delivery_signature_data TEXT", "delivery_recipient_name TEXT", "delivery_signature_status TEXT", "delivery_signature_at TEXT", "delivery_signature_by TEXT", "delivery_signature_note TEXT", "delivery_attachments_json TEXT", "payment_received_status TEXT", "payment_received_amount REAL DEFAULT 0", "payment_received_method TEXT", "payment_received_reference TEXT", "payment_received_note TEXT", "payment_received_at TEXT", "payment_received_by TEXT", "payment_received_attachments_json TEXT"]) {
    try { db.prepare(`ALTER TABLE shipments ADD COLUMN ${column}`).run(); } catch {}
  }
}
for (const column of ["origin_address", "departure_at", "delivery_window_start", "delivery_window_end", "notes", "preparation_started_at", "preparation_started_by", "stock_released_at", "stock_released_by", "delivery_signature_data", "delivery_recipient_name", "delivery_signature_status", "delivery_signature_at", "delivery_signature_by", "delivery_signature_note", "delivery_attachments_json", "payment_received_status", "payment_received_amount", "payment_received_method", "payment_received_reference", "payment_received_note", "payment_received_at", "payment_received_by", "payment_received_attachments_json"]) {
  try { db.exec(`ALTER TABLE shipments ADD COLUMN ${column} TEXT`); } catch {}
}
try { db.exec("ALTER TABLE shipments ADD COLUMN urgent INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE shipments ADD COLUMN public_tracking_token TEXT"); } catch {}
if (!remoteMode) {
  try {
    const missingTrackingTokens = db.prepare("SELECT id FROM shipments WHERE public_tracking_token IS NULL OR TRIM(public_tracking_token)=''").all();
    const assignTrackingToken = db.prepare("UPDATE shipments SET public_tracking_token=? WHERE id=?");
    for (const shipment of missingTrackingTokens) assignTrackingToken.run(randomBytes(24).toString("base64url"), Number(shipment.id));
  } catch {}
}
db.exec(
  `CREATE TABLE IF NOT EXISTS order_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL DEFAULT 0,unit_price REAL DEFAULT 0,discount REAL DEFAULT 0,vat REAL DEFAULT 21,amount REAL DEFAULT 0);CREATE TABLE IF NOT EXISTS quote_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,quote_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL DEFAULT 0,unit_price REAL DEFAULT 0,discount REAL DEFAULT 0,vat REAL DEFAULT 21,amount REAL DEFAULT 0);CREATE TABLE IF NOT EXISTS delivery_note_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,delivery_note_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL DEFAULT 0);CREATE TABLE IF NOT EXISTS invoice_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL DEFAULT 0,unit_price REAL DEFAULT 0,discount REAL DEFAULT 0,vat REAL DEFAULT 21,amount REAL DEFAULT 0);`,
);
db.exec(`CREATE TABLE IF NOT EXISTS invoice_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,order_id INTEGER NOT NULL,UNIQUE(invoice_id,order_id),UNIQUE(order_id));`);
if (!remoteMode) {
  try { db.exec("INSERT OR IGNORE INTO invoice_orders(invoice_id,order_id) SELECT id,order_id FROM invoices WHERE order_id IS NOT NULL"); } catch {}
}
for (const column of [
  "pdf_public_id TEXT",
  "pdf_url TEXT",
  "pdf_bytes INTEGER DEFAULT 0",
  "pdf_sha256 TEXT",
  "pdf_generated_at TEXT",
  "pdf_status TEXT DEFAULT 'Pendiente'",
  "share_token TEXT",
  "pdf_email_sent_at TEXT",
  "pdf_email_to TEXT",
  "pdf_email_status TEXT",
]) {
  try { db.exec(`ALTER TABLE invoices ADD COLUMN ${column}`); } catch {}
}
// El adaptador remoto omite las migraciones DDL generales durante el arranque
// para no ralentizar cada función serverless. Estas columnas son necesarias
// para que las facturas puedan conservar su PDF y su enlace seguro en Turso,
// así que las aplicamos explícitamente una sola vez por instancia fría.
if (remoteMode && process.env.RUN_REMOTE_MIGRATIONS === "1") {
  for (const column of [
    "pdf_public_id TEXT",
    "pdf_url TEXT",
    "pdf_bytes INTEGER DEFAULT 0",
    "pdf_sha256 TEXT",
    "pdf_generated_at TEXT",
    "pdf_status TEXT DEFAULT 'Pendiente'",
    "share_token TEXT",
    "pdf_email_sent_at TEXT",
    "pdf_email_to TEXT",
    "pdf_email_status TEXT",
  ]) {
    try { db.prepare(`ALTER TABLE invoices ADD COLUMN ${column}`).run(); } catch {}
  }
  try { db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_share_token ON invoices(share_token) WHERE share_token IS NOT NULL").run(); } catch {}
}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_share_token ON invoices(share_token) WHERE share_token IS NOT NULL"); } catch {}
for (const table of ["orders", "quotes"]) {
  for (const column of [
    "pdf_public_id TEXT",
    "pdf_url TEXT",
    "pdf_bytes INTEGER DEFAULT 0",
    "pdf_sha256 TEXT",
    "pdf_generated_at TEXT",
    "pdf_status TEXT DEFAULT 'Pendiente'",
    "share_token TEXT",
  ]) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`); } catch {}
  }
}
// Igual que en facturas, el adaptador Turso no ejecuta DDL genérico durante el
// arranque; estas columnas se aplican de forma explícita en la primera instancia.
if (remoteMode && process.env.RUN_REMOTE_MIGRATIONS === "1") {
  for (const table of ["orders", "quotes"]) {
    for (const column of [
      "pdf_public_id TEXT",
      "pdf_url TEXT",
      "pdf_bytes INTEGER DEFAULT 0",
      "pdf_sha256 TEXT",
      "pdf_generated_at TEXT",
      "pdf_status TEXT DEFAULT 'Pendiente'",
      "share_token TEXT",
    ]) {
      try { db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column}`).run(); } catch {}
    }
    try { db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_share_token ON ${table}(share_token) WHERE share_token IS NOT NULL`).run(); } catch {}
  }
}
for (const table of ["orders", "quotes"]) {
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_share_token ON ${table}(share_token) WHERE share_token IS NOT NULL`); } catch {}
}
// El adaptador remoto no ejecuta las migraciones DDL genéricas del arranque.
// Estas columnas se aplican explícitamente también en Turso.
if (remoteMode && process.env.RUN_REMOTE_MIGRATIONS === "1") {
  for (const [table, columns] of [["clients", ["opening_time TEXT", "closing_time TEXT"]], ["collection_points", ["opening_time TEXT", "closing_time TEXT"]], ["delivery_route_stops", ["opening_time TEXT", "closing_time TEXT"]]]) {
    for (const column of columns) { try { db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column}`).run(); } catch {} }
  }
}
for (const column of ["quantity_requested", "quantity_unit", "units_factor"]) { try { db.exec(`ALTER TABLE order_lines ADD COLUMN ${column} TEXT`); } catch {} }
for (const column of ["lot_id INTEGER", "lot_code TEXT", "expiry_date TEXT"]) { try { db.exec(`ALTER TABLE order_lines ADD COLUMN ${column}`); } catch {} }
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
if (!remoteMode) db.prepare("UPDATE users SET role='admin', permissions='*' WHERE username IN ('Luis','Jose')").run();
const tables = new Set([
  "suppliers",
  "purchase_orders",
  "purchase_order_lines",
  "goods_receipts",
  "goods_receipt_lines",
  "goods_receipt_incidents",
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
  "web_promotions",
  "whatsapp_messages",
  "product_price_history",
  "product_suppliers",
  "product_lots",
  "product_equivalents",
  "purchase_suggestions",
  "purchase_requests",
  "purchase_request_offers",
  "import_batches",
  "import_records",
  "delivery_routes",
  "delivery_route_stops",
  "users",
]);
const backupTables = [...tables];
const backupReplacer = (_key, value) => {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { __backup_type: "base64", value: Buffer.from(value).toString("base64") };
  return value;
};
const backupReviver = (_key, value) => value && value.__backup_type === "base64" ? Buffer.from(value.value, "base64") : value;
function buildBackupSnapshot(actor = "Sistema") {
  const tableData = {};
  const skippedTables = [];
  for (const table of backupTables) {
    try { tableData[table] = db.prepare(`SELECT * FROM ${table}`).all(); }
    catch { tableData[table] = []; skippedTables.push(table); }
  }
  return {
    format: "excluvas-turso-backup",
    version: 2,
    created_at: new Date().toISOString(),
    created_by: actor,
    source: remoteMode ? "Turso" : "SQLite local",
    tables: tableData,
    skipped_tables: skippedTables,
  };
}
function encodeBackupSnapshot(snapshot) {
  const json = JSON.stringify(snapshot, backupReplacer);
  const compressed = gzipSync(Buffer.from(json));
  return { json, data: compressed.toString("base64"), checksum: createHash("sha256").update(compressed).digest("hex"), size: compressed.length };
}
function decodeBackupSnapshot(data) {
  const compressed = Buffer.from(String(data || ""), "base64");
  return JSON.parse(gunzipSync(compressed).toString("utf8"), backupReviver);
}
function createBackupSnapshot(actor = "Sistema") {
  const snapshot = buildBackupSnapshot(actor);
  const encoded = encodeBackupSnapshot(snapshot);
  const now = new Date().toISOString();
  const code = `BKP-${now.replace(/[-:TZ.]/g, "").slice(0, 14)}-${String(Date.now()).slice(-5)}`;
  const counts = Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length]));
  const result = db.prepare("INSERT INTO backup_snapshots(code,created_at,created_by,source,tables_json,data_base64,checksum,status,size_bytes) VALUES(?,?,?,?,?,?,?,?,?)").run(code, now, actor, remoteMode ? "Turso" : "SQLite local", JSON.stringify(counts), encoded.data, encoded.checksum, "Disponible", encoded.size);
  return { id: Number(result.lastInsertRowid), code, created_at: now, checksum: encoded.checksum, size_bytes: encoded.size, tables: counts };
}
function haversineKm(aLat, aLon, bLat, bLon) {
  const rad = (value) => Number(value) * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function resolveShipmentStop(shipment) {
  const point = shipment.collection_point_id ? db.prepare("SELECT * FROM collection_points WHERE id=?").get(Number(shipment.collection_point_id)) : null;
  const client = shipment.client_id ? db.prepare("SELECT * FROM clients WHERE id=?").get(Number(shipment.client_id)) : null;
  const latitude = Number(shipment.latitude ?? point?.latitude ?? client?.latitude);
  const longitude = Number(shipment.longitude ?? point?.longitude ?? client?.longitude);
  return { shipment_id: Number(shipment.id), client_id: shipment.client_id || null, collection_point_id: shipment.collection_point_id || null, client_name: client?.name || "Cliente sin nombre", address: shipment.address || point?.address || client?.address || "", city: shipment.delivery_city || point?.city || client?.city || "", opening_time: shipment.delivery_window_start || point?.opening_time || client?.opening_time || "", closing_time: shipment.delivery_window_end || point?.closing_time || client?.closing_time || "", latitude: Number.isFinite(latitude) && latitude !== 0 ? latitude : null, longitude: Number.isFinite(longitude) && longitude !== 0 ? longitude : null, status: shipment.status || "Pendiente" };
}
function optimizeStops(stops, originLat, originLon) {
  const remaining = [...stops];
  const ordered = [];
  let currentLat = Number(originLat), currentLon = Number(originLon);
  while (remaining.length) {
    let nextIndex = 0;
    if (Number.isFinite(currentLat) && Number.isFinite(currentLon)) {
      const openingMinutes = (value) => {
        const match = String(value || "").match(/(?:T|^|\s)(\d{1,2}):(\d{2})/);
        return match ? Number(match[1]) * 60 + Number(match[2]) : Number.POSITIVE_INFINITY;
      };
      remaining.forEach((stop, index) => {
        const distance = haversineKm(currentLat, currentLon, stop.latitude, stop.longitude);
        const candidateOpening = openingMinutes(stop.opening_time);
        const selectedOpening = openingMinutes(remaining[nextIndex].opening_time);
        const selectedDistance = haversineKm(currentLat, currentLon, remaining[nextIndex].latitude, remaining[nextIndex].longitude);
        if (candidateOpening < selectedOpening || (candidateOpening === selectedOpening && distance < selectedDistance)) nextIndex = index;
      });
    }
    const next = remaining.splice(nextIndex, 1)[0];
    next.distance_km = Number.isFinite(currentLat) && Number.isFinite(currentLon) ? Number(haversineKm(currentLat, currentLon, next.latitude, next.longitude).toFixed(2)) : 0;
    ordered.push(next);
    currentLat = next.latitude; currentLon = next.longitude;
  }
  return ordered.map((stop, index) => ({ ...stop, position: index + 1 }));
}
if (!remoteMode) try {
  const automaticBackup = db.prepare("SELECT id FROM scheduled_tasks WHERE status='Activa' AND LOWER(title)=LOWER(?) LIMIT 1").get("Copia automática de Turso");
  if (!automaticBackup) {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO scheduled_tasks(title,action_text,schedule_type,recurrence,next_run,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run("Copia automática de Turso", "backup: crear copia de seguridad", "Recurrente", "diaria", new Date(Date.now() + 86400000).toISOString(), "Activa", "Sistema", now, now);
  }
} catch {}
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
  ["idx_goods_receipts_supplier_date", "goods_receipts", "supplier_id, receipt_date"],
  ["idx_goods_receipt_lines_receipt", "goods_receipt_lines", "receipt_id, product_id"],
  ["idx_goods_receipt_incidents_receipt", "goods_receipt_incidents", "receipt_id, status"],
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
  ["idx_product_location_history_product_date", "product_location_history", "product_id, changed_at"],
  ["idx_product_suppliers_product", "product_suppliers", "product_id, active"],
  ["idx_suppliers_external_code", "suppliers", "source_system, external_code"],
  ["idx_clients_external_code", "clients", "source_system, external_code"],
  ["idx_products_external_code", "products", "source_system, external_code"],
  ["idx_import_records_batch", "import_records", "batch_id, entity, source_code"],
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
if (!remoteMode) try {
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
const sendPdf = (r, buffer, filename, disposition = "inline") => {
  r.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Length": String(buffer.length),
    "Content-Disposition": `${disposition}; filename="${String(filename || "factura.pdf").replace(/["\\\\\\r\\\\n]/g, "_")}"`,
    "Cache-Control": "private, no-store",
    "Access-Control-Allow-Origin": "*",
  });
  r.end(buffer);
};
async function sendInvoiceEmail(invoice, pdf, shareUrl, recipient) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM_EMAIL || "").trim();
  const to = String(recipient || "").trim();
  const subject = `Factura ${invoice.code || `#${invoice.id}`} · Exclusivas Inteligentes`;
  const body = `Hola,\n\nTe enviamos la factura ${invoice.code || `#${invoice.id}`} de Exclusivas Inteligentes.\n\nPuedes consultar o descargarla desde este enlace seguro:\n${shareUrl}\n\nUn saludo.`;
  if (!apiKey || !from) return { mode: "mailto", to, subject, body, share_url: shareUrl };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html: `<p>Hola,</p><p>Te enviamos la factura <strong>${pdfSafeText(invoice.code || `#${invoice.id}`)}</strong> de Exclusivas Inteligentes.</p><p><a href="${shareUrl}">Consultar o descargar factura</a></p><p>Un saludo.</p>`,
      attachments: [{ filename: `${invoice.code || `factura-${invoice.id}`}.pdf`, content: pdf.toString("base64") }],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || result?.error || "El proveedor de correo rechazó el envío");
  return { mode: "resend", provider_id: result.id || null, to, subject, share_url: shareUrl };
}
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
function normalizeReturnDisposition(input = {}) {
  const destination = String(input.stock_destination || "Stock disponible").trim();
  const condition = String(input.return_condition || "Apta para stock").trim();
  const allowedDestinations = ["Stock disponible", "Cuarentena", "Merma", "Devolución a proveedor"];
  if (!allowedDestinations.includes(destination)) return { error: "El destino de la devolución no es válido" };
  if (destination !== "Stock disponible" && !String(input.quarantine_reason || input.reason || "").trim()) {
    return { error: "Indica el motivo para enviar la devolución a cuarentena, merma o proveedor" };
  }
  const productId = Number(input.product_id || 0);
  const lotId = Number(input.lot_id || 0) || null;
  let lot = null;
  if (lotId) {
    lot = db.prepare("SELECT * FROM product_lots WHERE id=? AND product_id=?").get(lotId, productId);
    if (!lot) return { error: "El lote seleccionado no existe para ese producto" };
  }
  return {
    values: {
      return_condition: condition,
      stock_destination: destination,
      quarantine_reason: String(input.quarantine_reason || input.reason || "").trim() || null,
      lot_id: lotId,
      lot_code_snapshot: String(input.lot_code_snapshot || lot?.lot_code || "").trim() || null,
      expiry_date_snapshot: String(input.expiry_date_snapshot || lot?.expiry_date || "").trim() || null,
    },
  };
}
const lookupFields = {
  clients: ["id", "name", "city", "address", "billing_address", "billing_city", "opening_time", "closing_time", "latitude", "longitude", "geocoding_status", "phone", "email", "active", "external_code"],
  suppliers: ["id", "name", "tax_id", "contact", "phone", "email", "address", "city", "latitude", "longitude", "geocoding_status", "active", "minimum_order", "transport_cost", "lead_time_days", "reliability_percent", "rappel_percent", "external_code"],
  warehouses: ["id", "name", "address"],
  collection_points: ["id", "code", "name", "client_id", "address", "city", "contact", "phone", "email", "opening_hours", "opening_time", "closing_time", "geocoding_status", "latitude", "longitude"],
  products: ["id", "name", "sku", "unit", "unit_price", "box_price", "pack4_price", "pack6_price", "pallet_price", "vat", "stock", "stock_reserved", "min_stock", "stock_min", "category", "brand", "format", "active", "product_status", "warehouse_id", "supplier_id", "primary_supplier_id", "warehouse_location", "cost_price", "photo_url", "photo_thumbnail_url", "photo_web_url"],
  orders: ["id", "code", "client_id", "status", "amount", "created_at", "updated_at", "delivery_date", "preparation_date", "shipping_date", "address", "delivery_city", "collection_point_id", "urgent", "stock_alert"],
  shipments: ["id", "code", "order_id", "client_id", "collection_point_id", "status", "expected_delivery_at", "preparation_date", "address", "delivery_city", "delivery_window_start", "delivery_window_end", "carrier", "packages", "incidents", "notes", "prepared_at", "prepared_by", "shipped_at", "shipped_by", "departure_at", "delivered_at", "delivered_by", "delivery_signature_status", "delivery_recipient_name", "delivery_signature_at", "delivery_signature_by", "delivery_signature_note", "payment_received_status", "payment_received_amount", "payment_received_method", "payment_received_reference", "payment_received_note", "payment_received_at", "payment_received_by", "public_tracking_token"],
  invoices: ["id", "code", "order_id", "client_id", "amount", "status", "created_at", "issue_date", "due_date"],
  purchase_orders: ["id", "code", "supplier_id", "status", "order_date", "expected_date", "amount", "validation_status"],
  goods_receipts: ["id", "code", "supplier_id", "purchase_order_id", "purchase_invoice_id", "warehouse_id", "receipt_date", "status", "validation_status", "validated_by", "validated_at", "line_count", "incident_count", "received_by", "notes"],
  goods_receipt_lines: ["id", "receipt_id", "product_id", "product_name_snapshot", "expected_quantity", "received_quantity", "damaged_quantity", "substituted_quantity", "substitute_product_id", "unit_cost", "expected_value", "received_value", "economic_difference", "status", "lot_id", "lot_code", "expiry_date", "notes", "location_verified_status", "location_verified_code", "location_verified_reason", "location_verified_by", "location_verified_at"],
  goods_receipt_incidents: ["id", "receipt_id", "receipt_line_id", "supplier_id", "type", "description", "expected_quantity", "received_quantity", "damaged_quantity", "substituted_quantity", "substitute_product_id", "economic_difference", "status", "claim_status", "attachment_name", "attachment_mime", "created_by", "created_at"],
  payments: ["id", "invoice_id", "amount", "payment_date", "method"],
  inventory_movements: ["id", "product_id", "warehouse_id", "movement_type", "quantity", "stock_effect", "reference", "movement_date", "notes"],
  product_lots: ["id", "product_id", "lot_code", "quantity", "quarantine_quantity", "waste_quantity", "expiry_date", "received_date", "warehouse_id", "barcode"],
  expenses: ["id", "code", "client_id", "expense_date", "category", "vendor", "amount", "vat", "payment_method", "notes", "attachment_name", "status", "created_by", "created_at"],
};
function listSelectFor(resource) {
  if (!["products", "expenses"].includes(resource)) return "*";
  if (!listColumnsCache.has(resource)) {
    const excluded = resource === "products"
      ? new Set(["photo_data"])
      : resource === "expenses"
        ? new Set(["attachment_data"])
        : resource === "goods_receipt_incidents"
          ? new Set(["attachment_data", "attachments_json"])
          : new Set();
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
    const tablePrefix = resource === "orders" ? "orders." : resource === "shipments" ? "shipments." : "";
    const columns = requested.filter((column) => available.has(column)).map((column) => `${tablePrefix}"${column.replaceAll('"', '""')}"`);
    if (resource === "orders") columns.push("order_client.name AS client_name", "order_client.city AS client_city");
    listColumnsCache.set(`lookup:${resource}`, columns.length ? columns.join(",") : "*");
  }
  return listColumnsCache.get(`lookup:${resource}`);
}
function queryBatch(statements) {
  if (remoteMode && typeof db.batch === "function") return db.batch(statements);
  return statements.map(({ sql, args = [] }) => db.prepare(sql).all(...args));
}
function invalidateReadCache(resource) {
  for (const key of readCache.keys()) {
    if (key.startsWith(`${resource}:`)) readCache.delete(key);
  }
}
function invalidateRelatedReadCaches(resource) {
  invalidateReadCache(resource);
  if (["orders", "order_lines", "inventory_movements", "purchase_orders", "purchase_order_lines", "returns", "shipments", "product_lots"].includes(resource)) {
    invalidateReadCache("products");
    invalidateReadCache("stock");
    invalidateReadCache("product_lots");
  }
  if (["payments", "billing", "invoices", "delivery_notes"].includes(resource)) {
    invalidateReadCache("invoices");
  }
}
function cachedRows(resource, includeDeleted, includeInactive) {
  // Turso es compartido por varias instancias serverless. Una caché local
  // podría devolver reservas de stock obsoletas después de una escritura
  // realizada por otra instancia.
  if (remoteMode) return null;
  const key = `${resource}:${includeDeleted ? 1 : 0}:${includeInactive ? 1 : 0}`;
  const cached = readCache.get(key);
  if (!cached || Date.now() - cached.createdAt > READ_CACHE_MS) {
    if (cached) readCache.delete(key);
    return null;
  }
  return cached.rows;
}
function storeRows(resource, includeDeleted, includeInactive, rows) {
  if (remoteMode) return rows;
  readCache.set(`${resource}:${includeDeleted ? 1 : 0}:${includeInactive ? 1 : 0}`, { createdAt: Date.now(), rows });
  return rows;
}
function recordAudit(actor, method, resource, action, details = "") {
  try { db.prepare("INSERT INTO audit_logs(actor,method,resource,action,details,created_at) VALUES(?,?,?,?,?,?)").run(actor || "Usuario local", method, resource, action, details, new Date().toISOString()); } catch {}
}
function executeScheduledTask(task) {
  const text = String(task.action_text || "").trim();
  let result = "Acción registrada";
  if (/\bbackup\b|copia\s+de\s+seguridad/i.test(text)) {
    const snapshot = createBackupSnapshot(task.created_by || "Sistema");
    result = `Copia creada: ${snapshot.code}`;
  }
  const note = text.match(/(?:nota|recordatorio)\s*[:\-]?\s*(.+?)(?:\s*\|\s*(.+))?$/i);
  if (note) {
    const title = note[1].trim(), content = (note[2] || "Tarea programada por el asistente").trim();
    const now = new Date().toISOString();
    const existing = db.prepare("SELECT id FROM notes WHERE module='Tareas programadas' AND title=? AND date(created_at)=date(?) AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(title, now);
    if (existing) result = `Nota ya existente: ${title}`;
    else {
      db.prepare("INSERT INTO notes(title,content,priority,module,important,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(title, content, "Normal", "Tareas programadas", 1, now, now);
      result = `Nota creada: ${title}`;
    }
  }
  const now = new Date().toISOString();
  const createAutomationNote = (title, content, priority, module, recordId) => {
    const existing = db.prepare("SELECT id FROM notes WHERE module=? AND record_id=? AND title=? AND date(created_at)=date(?) AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(module, Number(recordId || 0), title, now);
    if (existing) return false;
    db.prepare("INSERT INTO notes(title,content,priority,module,record_id,important,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)").run(title, content, priority, module, Number(recordId || 0) || null, 1, now, now, task.created_by || "Sistema");
    return true;
  };
  if (/factura(?:s)?\s+vencida|cobro\s+vencido/i.test(text)) {
    const overdue = db.prepare("SELECT i.id,i.code,i.amount,i.due_date,c.name client_name FROM invoices i LEFT JOIN clients c ON c.id=i.client_id WHERE CAST(COALESCE(i.deleted,0) AS INTEGER)=0 AND COALESCE(i.status,'Pendiente') NOT IN ('Cobrada','Pagada','Anulada') AND date(COALESCE(i.due_date,i.issue_date,i.created_at)) < date(?) ORDER BY date(COALESCE(i.due_date,i.issue_date,i.created_at)) ASC LIMIT 50").all(now.slice(0, 10));
    let created = 0;
    for (const invoice of overdue) if (createAutomationNote(`Factura vencida · ${invoice.code}`, `${invoice.client_name || "Cliente sin asignar"} tiene pendiente ${Number(invoice.amount || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}. Fecha de vencimiento: ${invoice.due_date || "no indicada"}.`, "Urgente", "Facturas", invoice.id)) created += 1;
    result = `${created} avisos de facturas vencidas creados${overdue.length ? ` · ${overdue.length} vencidas detectadas` : ""}`;
  }
  if (/cliente(?:s)?\s+(?:nuevo|web)|registro(?:s)?\s+web/i.test(text)) {
    const registrations = db.prepare("SELECT id,company_name,contact_name,email FROM web_registrations WHERE COALESCE(status,'Pendiente de validar')='Pendiente de validar' ORDER BY id DESC LIMIT 50").all();
    let created = 0;
    for (const registration of registrations) if (createAutomationNote(`Nuevo cliente web · ${registration.company_name}`, `Revisar el registro de ${registration.contact_name || registration.email}. Valida sus datos y decide si crear el acceso de cliente.`, "Alta", "Clientes web", registration.id)) created += 1;
    result = `${created} avisos de clientes web creados${registrations.length ? ` · ${registrations.length} pendientes` : ""}`;
  }
  if (/ubicaci(?:ó|o)n(?:es)?\s+(?:pendiente|no verificada)|verificar\s+ubicaci/i.test(text)) {
    const lines = db.prepare("SELECT grl.id,gr.code receipt_code,grl.product_name_snapshot FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.id=grl.receipt_id WHERE CAST(COALESCE(gr.deleted,0) AS INTEGER)=0 AND CAST(COALESCE(grl.deleted,0) AS INTEGER)=0 AND COALESCE(grl.location_verified_status,'Pendiente')='Pendiente' LIMIT 50").all();
    let created = 0;
    for (const line of lines) if (createAutomationNote(`Ubicación pendiente · ${line.product_name_snapshot || "Producto"}`, `Verifica la ubicación de ${line.product_name_snapshot || "este producto"} en la entrada ${line.receipt_code || "sin código"}.`, "Alta", "Entradas", line.id)) created += 1;
    result = `${created} avisos de ubicaciones pendientes creados${lines.length ? ` · ${lines.length} pendientes` : ""}`;
  }
  let next = null, status = task.status;
  if (task.schedule_type === "Recurrente") {
    const recurrence = String(task.recurrence || "diaria").toLowerCase();
    const intervalHours = recurrence.includes("12") || recurrence.includes("doce") ? 12 : null;
    const days = recurrence.includes("semana") || recurrence.includes("lunes") || recurrence.includes("martes") || recurrence.includes("miércoles") || recurrence.includes("miercoles") || recurrence.includes("jueves") || recurrence.includes("viernes") ? 7 : 1;
    next = new Date(Date.now() + (intervalHours ? intervalHours * 3600000 : days * 86400000)).toISOString();
  } else status = "Completada";
  db.prepare("UPDATE scheduled_tasks SET status=?,last_run=?,last_result=?,next_run=?,updated_at=? WHERE id=?").run(status, now, result, next, now, task.id);
  recordAudit(task.created_by || "Tareas programadas", "TASK", `scheduled_tasks/${task.id}`, "Ejecución", result);
}
function runScheduledTasks() {
  const now = new Date().toISOString();
  const due = db.prepare("SELECT * FROM scheduled_tasks WHERE status='Activa' AND next_run IS NOT NULL AND next_run<=?").all(now);
  for (const task of due) { try { executeScheduledTask(task); } catch (e) { db.prepare("UPDATE scheduled_tasks SET last_run=?,last_result=?,updated_at=? WHERE id=?").run(now, `Error: ${e.message}`, now, task.id); } }
}
function restoreSnapshotData(snapshot, actor) {
  if (!snapshot || snapshot.format !== "excluvas-turso-backup" || !snapshot.tables || typeof snapshot.tables !== "object") throw new Error("La copia no tiene un formato válido");
  const excluded = new Set(["users", "audit_logs"]);
  const statements = [{ sql: "PRAGMA foreign_keys=OFF" }, ...[...backupTables].reverse().filter((table) => !excluded.has(table) && snapshot.tables[table]).map((table) => ({ sql: `DELETE FROM ${table}` }))];
  let inserted = 0;
  for (const table of backupTables) {
    if (excluded.has(table) || !Array.isArray(snapshot.tables[table]) || !snapshot.tables[table].length) continue;
    const available = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((item) => String(item.name || "")));
    for (const row of snapshot.tables[table]) {
      const columns = Object.keys(row).filter((column) => available.has(column));
      if (!columns.length) continue;
      statements.push({ sql: `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`, args: columns.map((column) => row[column]) });
      inserted += 1;
    }
  }
  statements.push({ sql: "PRAGMA foreign_keys=ON" });
  if (remoteMode) db.batch([{ sql: "BEGIN" }, ...statements, { sql: "COMMIT" }]);
  else {
    db.exec("PRAGMA foreign_keys=OFF; BEGIN");
    try {
      for (const statement of statements) {
        if (/^PRAGMA/i.test(statement.sql)) continue;
        db.prepare(statement.sql).run(...(statement.args || []));
      }
      db.exec("COMMIT; PRAGMA foreign_keys=ON");
    } catch (error) { try { db.exec("ROLLBACK; PRAGMA foreign_keys=ON"); } catch {} throw error; }
  }
  db.prepare("INSERT INTO audit_logs(actor,method,resource,action,details,created_at) VALUES(?,?,?,?,?,?)").run(actor, "POST", "backups", "Restauración de copia", JSON.stringify({ source: snapshot.source, tables: Object.keys(snapshot.tables).length, inserted }), new Date().toISOString());
  return inserted;
}
function getRouteWithStops(id) {
  const route = db.prepare("SELECT * FROM delivery_routes WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(Number(id));
  if (!route) return null;
  const stops = db.prepare("SELECT * FROM delivery_route_stops WHERE route_id=? ORDER BY position").all(Number(id));
  const coordinates = stops.filter((stop) => stop.latitude != null && stop.longitude != null).map((stop) => `${stop.latitude},${stop.longitude}`);
  const mapsUrl = coordinates.length ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(route.origin_address || coordinates[0])}&destination=${encodeURIComponent(coordinates[coordinates.length - 1])}${coordinates.length > 2 ? `&waypoints=${encodeURIComponent(coordinates.slice(0, -1).join("|"))}` : ""}` : "";
  const parseTime = (value) => {
    const match = String(value || "").match(/(?:T|^|\s)(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const totalDistanceKm = stops.reduce((total, stop) => total + Number(stop.distance_km || 0), 0);
  const warnings = [];
  let elapsedMinutes = 0;
  const departureMinutes = 8 * 60;
  for (const stop of stops) {
    elapsedMinutes += Number(stop.distance_km || 0) * 2;
    const opening = parseTime(stop.opening_time);
    const closing = parseTime(stop.closing_time);
    const arrival = departureMinutes + elapsedMinutes;
    if (opening !== null && closing !== null && closing < opening) warnings.push({ stop_id: stop.id, position: stop.position, client_name: stop.client_name, message: "Horario inválido: el cierre es anterior a la apertura." });
    else if (closing !== null && arrival > closing) warnings.push({ stop_id: stop.id, position: stop.position, client_name: stop.client_name, message: `Llegada estimada fuera de horario (${Math.floor(arrival / 60).toString().padStart(2, "0")}:${String(Math.round(arrival % 60)).padStart(2, "0")}).` });
    else if (opening !== null && arrival < opening) elapsedMinutes += opening - arrival;
    elapsedMinutes += 15;
  }
  return { ...route, stops, maps_url: mapsUrl, total_distance_km: Number(totalDistanceKm.toFixed(1)), estimated_minutes: Math.max(0, Math.round(elapsedMinutes)), time_window_warnings: warnings };
}
function ensureShipmentTrackingToken(id) {
  const shipmentId = Number(id);
  if (!Number.isInteger(shipmentId) || shipmentId <= 0) return "";
  const current = db.prepare("SELECT public_tracking_token FROM shipments WHERE id=?").get(shipmentId);
  if (!current) return "";
  const existing = String(current.public_tracking_token || "").trim();
  if (existing) return existing;
  const token = randomBytes(24).toString("base64url");
  db.prepare("UPDATE shipments SET public_tracking_token=? WHERE id=?").run(token, shipmentId);
  invalidateReadCache("shipments");
  return token;
}
function attachShipmentTrackingToken(row) {
  const existing = String(row?.public_tracking_token || "").trim();
  return existing ? { ...row, public_tracking_token: existing } : { ...row, public_tracking_token: ensureShipmentTrackingToken(row?.id) };
}
function portalSessionSecret() {
  return String(process.env.PORTAL_SESSION_SECRET || process.env.TURSO_AUTH_TOKEN || "exclusivas-inteligentes-portal-session");
}
function createPortalSessionToken(kind, id) {
  const payload = Buffer.from(JSON.stringify({ kind, id: Number(id), exp: Date.now() + 30 * 86400000 })).toString("base64url");
  const signature = createHmac("sha256", portalSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function verifyPortalSessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  try {
    const expected = createHmac("sha256", portalSessionSecret()).update(payload).digest("base64url");
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed?.id || !["cliente", "proveedor"].includes(String(parsed.kind)) || Number(parsed.exp) < Date.now()) return null;
    return { kind: String(parsed.kind), id: Number(parsed.id) };
  } catch { return null; }
}
const read = (req) =>
  new Promise((ok) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => ok(s ? JSON.parse(s) : {}));
  });
export async function crmApiHandler(req, res) {
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
      if (p[1] === "public" && p[2] === "shipments" && p[3] && req.method === "GET") {
        const trackingToken = decodeURIComponent(String(p[3]));
        const shipment = db.prepare(`
          SELECT s.id,s.code,s.order_id,s.status,s.expected_delivery_at,s.preparation_date,
                 s.address,s.delivery_city,s.packages,s.incidents,
                 s.delivery_window_start,s.delivery_window_end,
                 s.delivery_signature_data,s.delivery_recipient_name,s.delivery_signature_status,
                 s.delivery_signature_at,s.delivery_signature_by,s.delivery_signature_note,s.delivery_attachments_json,
                 c.name AS client_name,cp.name AS location_name,o.code AS order_code
          FROM shipments s
          LEFT JOIN clients c ON c.id=s.client_id
          LEFT JOIN collection_points cp ON cp.id=s.collection_point_id
          LEFT JOIN orders o ON o.id=s.order_id
          WHERE s.public_tracking_token=? AND CAST(COALESCE(s.deleted,0) AS INTEGER)=0
          LIMIT 1`).get(trackingToken);
        if (!shipment) return send(res, 404, { error: "Enlace de seguimiento no válido o caducado" });
        const lines = db.prepare(`
          SELECT ol.product_id,ol.quantity,ol.quantity_requested,ol.quantity_unit,
                 ol.prepared_quantity,ol.preparation_status,p.name AS product_name
          FROM order_lines ol
          LEFT JOIN products p ON p.id=ol.product_id
          WHERE ol.order_id=? ORDER BY ol.id`).all(Number(shipment.order_id || 0));
        return send(res, 200, {
          shipment: {
            code: shipment.code,
            order_code: shipment.order_code || "",
            status: shipment.status || "Preparando",
            expected_delivery_at: shipment.expected_delivery_at || "",
            preparation_date: shipment.preparation_date || "",
            address: shipment.address || "",
            delivery_city: shipment.delivery_city || "",
            packages: Math.max(1, Number(shipment.packages || 1)),
            incidents: String(shipment.incidents || "").trim(),
            delivery_window_start: shipment.delivery_window_start || "",
            delivery_window_end: shipment.delivery_window_end || "",
            delivery_signature_data: shipment.delivery_signature_data || "",
            delivery_recipient_name: shipment.delivery_recipient_name || "",
            delivery_signature_status: shipment.delivery_signature_status || "Pendiente",
            delivery_signature_at: shipment.delivery_signature_at || "",
            delivery_signature_by: shipment.delivery_signature_by || "",
            delivery_signature_note: shipment.delivery_signature_note || "",
            delivery_attachments_json: shipment.delivery_attachments_json || "[]",
            client_name: shipment.client_name || "Cliente",
            location_name: shipment.location_name || "",
          },
          lines,
        });
      }
      if (p[1] === "documents" && p[2] && p[3] === "share" && p[4] && req.method === "GET") {
        const type = String(p[2]).toLowerCase();
        const config = commercialPdfConfig(type);
        const document = db.prepare(`SELECT id,code,share_token FROM ${config.table} WHERE share_token=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0`).get(String(p[4]));
        if (!document) return send(res, 404, { error: "Enlace de documento no válido o caducado" });
        const prepared = await ensureCommercialDocumentPdf(type, document.id, "Consulta mediante enlace");
        const current = commercialDocumentPdfData(type, document.id);
        const pdf = prepared._pdf || createCommercialDocumentPdf(current, type);
        return sendPdf(res, pdf, `${String(document.code || `${config.prefix}-${document.id}`).replace(/[^a-zA-Z0-9._-]+/g, "-")}.pdf`, "inline");
      }
      if (p[1] === "documents" && p[2] && p[3] && p[4] === "pdf" && req.method === "POST") {
        const type = String(p[2]).toLowerCase();
        const body = await read(req);
        const prepared = await ensureCommercialDocumentPdf(type, Number(p[3]), actor, body.force === true);
        return send(res, 200, { id: prepared.id, code: prepared.code, document_type: type, pdf_url: prepared.pdf_url, pdf_bytes: prepared.pdf_bytes, pdf_generated_at: prepared.pdf_generated_at, pdf_status: prepared.pdf_status, share_token: prepared.share_token, share_url: documentShareUrl(req, type, prepared.share_token) });
      }
      if (p[1] === "invoices" && p[2] === "share" && p[3] && req.method === "GET") {
        const invoice = db.prepare("SELECT id,code,share_token FROM invoices WHERE share_token=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(String(p[3]));
        if (!invoice) return send(res, 404, { error: "Enlace de factura no válido o caducado" });
        const prepared = await ensureInvoicePdf(invoice.id, "Consulta mediante enlace");
        const current = invoicePdfData(invoice.id);
        const pdf = prepared._pdf || createInvoicePdf(current);
        return sendPdf(res, pdf, `${String(invoice.code || `factura-${invoice.id}`).replace(/[^a-zA-Z0-9._-]+/g, "-")}.pdf`, "inline");
      }
      if (p[1] === "invoices" && p[2] && req.method === "POST" && p[3] === "pdf") {
        const body = await read(req);
        const prepared = await ensureInvoicePdf(Number(p[2]), actor, body.force === true);
        return send(res, 200, { id: prepared.id, code: prepared.code, pdf_url: prepared.pdf_url, pdf_bytes: prepared.pdf_bytes, pdf_generated_at: prepared.pdf_generated_at, pdf_status: prepared.pdf_status, share_token: prepared.share_token, share_url: invoiceShareUrl(req, prepared.share_token) });
      }
      if (p[1] === "invoices" && p[2] && req.method === "POST" && p[3] === "email") {
        const body = await read(req);
        const prepared = await ensureInvoicePdf(Number(p[2]), actor, false);
        const invoice = invoicePdfData(Number(p[2]));
        const recipient = String(body.email || invoice?.client_email || "").trim();
        if (!recipient || !recipient.includes("@")) return send(res, 400, { error: "La factura no tiene un email de cliente válido" });
        const shareUrl = invoiceShareUrl(req, prepared.share_token);
        const result = await sendInvoiceEmail(invoice, prepared._pdf || createInvoicePdf(invoice), shareUrl, recipient);
        const now = new Date().toISOString();
        db.prepare("UPDATE invoices SET pdf_email_sent_at=?,pdf_email_to=?,pdf_email_status=?,updated_at=? WHERE id=?").run(result.mode === "resend" ? now : null, recipient, result.mode === "resend" ? "Enviada" : "Preparada para enviar", now, Number(p[2]));
        recordAudit(actor, "POST", `invoices/${Number(p[2])}/email`, result.mode === "resend" ? "Enviar factura por email" : "Preparar email de factura", JSON.stringify({ invoice_id: Number(p[2]), to: recipient, mode: result.mode }));
        invalidateReadCache("invoices");
        return send(res, 200, { ok: true, ...result, pdf_status: prepared.pdf_status });
      }
      // Las consultas automáticas de carga no deben modificar SQLite: en desarrollo
      // provocarían un ciclo de HMR (consulta -> cambio de DB -> recarga -> consulta).
      // Las consultas explícitas pueden marcarse con X-Audit-Query.
      if (p[1] !== "audit_logs" && !(req.method === "POST" && p[1] === "orders") && (req.method !== "GET" || req.headers["x-audit-query"] === "true")) recordAudit(actor, req.method, p.slice(1).join("/") || "inicio", req.method === "GET" ? "Consulta" : req.method === "POST" ? "Alta" : req.method === "PUT" ? "Edición" : req.method === "DELETE" ? "Borrado" : req.method, req.url);
      if (p[1] === "backups" && req.method === "GET" && !p[2]) {
        const rows = db.prepare("SELECT id,code,created_at,created_by,source,tables_json,checksum,status,restored_at,restored_by,size_bytes FROM backup_snapshots ORDER BY id DESC LIMIT 50").all().map((row) => ({ ...row, tables: JSON.parse(row.tables_json || "{}") }));
        return send(res, 200, rows);
      }
      if (p[1] === "backups" && req.method === "POST" && !p[2]) {
        const snapshot = createBackupSnapshot(actor);
        return send(res, 201, { ok: true, snapshot });
      }
      if (p[1] === "backups" && req.method === "GET" && p[2]) {
        const row = db.prepare("SELECT * FROM backup_snapshots WHERE id=?").get(Number(p[2]));
        if (!row) return send(res, 404, { error: "Copia no encontrada" });
        const snapshot = decodeBackupSnapshot(row.data_base64);
        const payload = Buffer.from(JSON.stringify(snapshot, backupReplacer));
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename=${row.code}.backup.json`, "Access-Control-Allow-Origin": "*" });
        return res.end(payload);
      }
      if (p[1] === "backups" && p[3] === "restore" && req.method === "POST") {
        const row = db.prepare("SELECT * FROM backup_snapshots WHERE id=?").get(Number(p[2]));
        if (!row) return send(res, 404, { error: "Copia no encontrada" });
        const body = await read(req);
        if (body.confirm !== "RESTAURAR_TURSO") return send(res, 400, { error: "Confirma la restauración escribiendo RESTAURAR_TURSO" });
        const inserted = restoreSnapshotData(decodeBackupSnapshot(row.data_base64), actor);
        const now = new Date().toISOString();
        db.prepare("UPDATE backup_snapshots SET status='Restaurada',restored_at=?,restored_by=? WHERE id=?").run(now, actor, Number(p[2]));
        return send(res, 200, { ok: true, message: "Copia restaurada sobre los datos operativos. Usuarios e historial se han conservado.", inserted, restored_at: now });
      }
      if (p[1] === "backup" && req.method === "GET") {
        if (remoteMode) {
          const payload = Buffer.from(JSON.stringify(buildBackupSnapshot(actor), backupReplacer));
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename=excluvas-${new Date().toISOString().slice(0, 10)}.backup.json`, "Access-Control-Allow-Origin": "*" });
          return res.end(payload);
        }
        const file = readFileSync(join(dir, "excluvas.sqlite"));
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename=excluvas-${new Date().toISOString().slice(0, 10)}.sqlite`, "Access-Control-Allow-Origin": "*" });
        return res.end(file);
      }
      if (p[1] === "backup" && req.method === "POST") {
        const body = await read(req);
        if (!body?.data) return send(res, 400, { error: "Copia no recibida" });
        if (remoteMode) return send(res, 501, { error: "La restauración sobre Turso no está habilitada todavía: la copia se puede descargar, pero no se aplicará sin una restauración transaccional validada." });
        writeFileSync(join(dir, "excluvas-restore.sqlite"), Buffer.from(body.data, "base64"));
        return send(res, 200, { ok: true, message: "Copia preparada. Reinicia el CRM para aplicar la restauración." });
      }
      if (p[1] === "scheduler" && p[2] === "run" && req.method === "GET") {
        const configuredSecret = String(process.env.CRON_SECRET || "");
        const authorization = String(req.headers.authorization || "");
        if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) return send(res, 401, { error: "Ejecución programada no autorizada" });
        const now = new Date().toISOString();
        const due = db.prepare("SELECT * FROM scheduled_tasks WHERE status='Activa' AND next_run IS NOT NULL AND next_run<=?").all(now);
        runScheduledTasks();
        return send(res, 200, { ok: true, executed: due.length, executed_at: now });
      }
      if (p[1] === "scheduled_tasks" && p[2] && p[3] === "run" && req.method === "POST") {
        const task = db.prepare("SELECT * FROM scheduled_tasks WHERE id=?").get(Number(p[2]));
        if (!task) return send(res, 404, { error: "Tarea no encontrada" });
        if (task.status !== "Activa") return send(res, 409, { error: "Activa primero la tarea para ejecutarla" });
        try { executeScheduledTask(task); } catch (error) { return send(res, 500, { error: error?.message || "No se pudo ejecutar la tarea" }); }
        return send(res, 200, db.prepare("SELECT * FROM scheduled_tasks WHERE id=?").get(Number(p[2])));
      }
      if (p[1] === "routes" && req.method === "GET") {
        if (p[2]) return send(res, 200, getRouteWithStops(p[2]) || { error: "Ruta no encontrada" });
        const routeDate = new URL(req.url, "http://local").searchParams.get("date");
        const routes = db.prepare(`SELECT * FROM delivery_routes WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 ${routeDate ? "AND route_date=?" : ""} ORDER BY route_date DESC,id DESC LIMIT 100`).all(...(routeDate ? [routeDate] : []));
        return send(res, 200, routes.map((route) => getRouteWithStops(route.id)));
      }
      if (p[1] === "routes" && req.method === "POST" && !p[2]) {
        const body = await read(req);
        const shipmentIds = Array.isArray(body.shipment_ids) ? [...new Set(body.shipment_ids.map(Number).filter(Boolean))] : [];
        if (!String(body.route_date || "").trim()) return send(res, 400, { error: "Indica la fecha de la ruta" });
        if (!shipmentIds.length) return send(res, 400, { error: "Selecciona al menos un envío" });
        const stops = shipmentIds.map((id) => db.prepare("SELECT * FROM shipments WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(id)).filter(Boolean).map(resolveShipmentStop);
        const missing = stops.filter((stop) => stop.latitude == null || stop.longitude == null);
        if (missing.length) return send(res, 400, { error: "Hay envíos sin geolocalizar", missing: missing.map((stop) => ({ shipment_id: stop.shipment_id, client_name: stop.client_name, address: stop.address })) });
        const originLat = body.origin_latitude === undefined ? stops[0].latitude : Number(body.origin_latitude);
        const originLon = body.origin_longitude === undefined ? stops[0].longitude : Number(body.origin_longitude);
        const orderedStops = optimizeStops(stops, originLat, originLon);
        const now = new Date().toISOString();
        const routeCode = `RUT-${String(body.route_date).replace(/[^0-9]/g, "")}-${String(Date.now()).slice(-5)}`;
        const route = db.prepare("INSERT INTO delivery_routes(code,route_date,driver,vehicle,status,radius_meters,origin_address,origin_latitude,origin_longitude,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(routeCode, String(body.route_date), String(body.driver || ""), String(body.vehicle || ""), "Planificada", Number(body.radius_meters || 150), String(body.origin_address || ""), originLat, originLon, String(body.notes || ""), actor, now, now);
        for (const stop of orderedStops) db.prepare("INSERT INTO delivery_route_stops(route_id,position,shipment_id,client_id,collection_point_id,client_name,address,city,opening_time,closing_time,latitude,longitude,distance_km,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(Number(route.lastInsertRowid), stop.position, stop.shipment_id, stop.client_id, stop.collection_point_id, stop.client_name, stop.address, stop.city, stop.opening_time, stop.closing_time, stop.latitude, stop.longitude, stop.distance_km, "Pendiente", now, now);
        recordAudit(actor, "POST", `routes/${Number(route.lastInsertRowid)}`, "Planificar ruta", JSON.stringify({ shipment_ids: shipmentIds, radius_meters: Number(body.radius_meters || 150) }));
        return send(res, 201, getRouteWithStops(Number(route.lastInsertRowid)));
      }
      if (p[1] === "routes" && req.method === "PUT" && p[2] && p[3] === "stops" && p[4] === "reorder") {
        const body = await read(req);
        const stopIds = Array.isArray(body.stop_ids) ? body.stop_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
        const routeId = Number(p[2]);
        const route = db.prepare("SELECT id FROM delivery_routes WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(routeId);
        if (!route || !stopIds.length) return send(res, 400, { error: "La ruta o el orden de paradas no son válidos" });
        const allowedStops = db.prepare("SELECT id FROM delivery_route_stops WHERE route_id=?").all(routeId).map((stop) => Number(stop.id));
        if (allowedStops.length !== stopIds.length || allowedStops.some((id) => !stopIds.includes(id))) return send(res, 400, { error: "Las paradas no pertenecen a esta ruta" });
        const now = new Date().toISOString();
        stopIds.forEach((stopId, index) => db.prepare("UPDATE delivery_route_stops SET position=?,updated_at=? WHERE id=? AND route_id=?").run(index + 1, now, stopId, routeId));
        recordAudit(actor, "PUT", `routes/${routeId}/stops/reorder`, "Reordenar ruta", JSON.stringify({ stop_ids: stopIds }));
        return send(res, 200, getRouteWithStops(routeId));
      }
      if (p[1] === "routes" && req.method === "PUT" && p[2] && p[3] === "stops" && p[4]) {
        const body = await read(req);
        const routeId = Number(p[2]), stopId = Number(p[4]);
        const allowed = ["status", "notes"];
        const changes = allowed.filter((key) => body[key] !== undefined);
        if (!changes.length) return send(res, 400, { error: "No hay cambios para guardar" });
        const current = db.prepare("SELECT id FROM delivery_route_stops WHERE id=? AND route_id=?").get(stopId, routeId);
        if (!current) return send(res, 404, { error: "Parada no encontrada en esta ruta" });
        const now = new Date().toISOString();
        db.prepare(`UPDATE delivery_route_stops SET ${changes.map((key) => `${key}=?`).join(",")},updated_at=? WHERE id=? AND route_id=?`).run(...changes.map((key) => body[key]), now, stopId, routeId);
        recordAudit(actor, "PUT", `routes/${routeId}/stops/${stopId}`, "Actualizar parada de reparto", JSON.stringify({ status: body.status, notes: body.notes }));
        return send(res, 200, getRouteWithStops(routeId));
      }
      if (p[1] === "routes" && req.method === "PUT" && p[2]) {
        const body = await read(req);
        const allowed = ["driver", "vehicle", "status", "radius_meters", "notes", "origin_address", "origin_latitude", "origin_longitude"];
        const changes = allowed.filter((key) => body[key] !== undefined);
        if (!changes.length) return send(res, 400, { error: "No hay cambios para guardar" });
        db.prepare(`UPDATE delivery_routes SET ${changes.map((key) => `${key}=?`).join(",")},updated_at=? WHERE id=?`).run(...changes.map((key) => body[key]), new Date().toISOString(), Number(p[2]));
        return send(res, 200, getRouteWithStops(p[2]));
      }
      if (p[1] === "routes" && req.method === "DELETE" && p[2]) {
        const now = new Date().toISOString();
        db.prepare("UPDATE delivery_routes SET deleted='1',deleted_at=?,deleted_by=?,updated_at=? WHERE id=?").run(now, actor, now, Number(p[2]));
        return send(res, 200, { ok: true, id: Number(p[2]) });
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
      if (p[1] === "public_login" && req.method === "POST") {
        const d = await read(req);
        const kind = ["cliente", "proveedor"].includes(String(d.kind)) ? String(d.kind) : "cliente";
        const email = String(d.email || "").trim().toLowerCase();
        const password = String(d.password || "");
        if (!email || !password) return send(res, 400, { error: "El email y la contraseña son obligatorios" });
        const table = kind === "proveedor" ? "suppliers" : "clients";
        const account = db.prepare(`SELECT id,name,email,portal_password_hash,portal_access_enabled,active FROM ${table} WHERE LOWER(TRIM(COALESCE(email,'')))=? AND CAST(COALESCE(active,1) AS INTEGER)=1 AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1`).get(email);
        const passwordHash = createHash("sha256").update(password).digest("hex");
        if (!account?.id || !account.portal_password_hash || account.portal_password_hash !== passwordHash || Number(account.portal_access_enabled || 0) !== 1) {
          return send(res, 401, { error: "No encontramos una cuenta activa con esos datos. Si acabas de registrarte, espera a que validemos tu solicitud." });
        }
        return send(res, 200, { ok: true, portal: { kind, id: Number(account.id), name: account.name, email: account.email, token: createPortalSessionToken(kind, account.id) } });
      }
      if (p[1] === "public_portal" && req.method === "GET") {
        const authorization = String(req.headers.authorization || "");
        const session = verifyPortalSessionToken(authorization.replace(/^Bearer\s+/i, ""));
        if (!session || session.kind !== "cliente") return send(res, 401, { error: "La sesión del portal ha caducado. Inicia sesión de nuevo." });
        const client = db.prepare("SELECT id,name,email,phone,address,city,opening_time,closing_time FROM clients WHERE id=? AND CAST(COALESCE(active,1) AS INTEGER)=1 AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(session.id);
        if (!client) return send(res, 404, { error: "Cliente no encontrado o desactivado" });
        const orders = db.prepare("SELECT id,code,status,amount,created_at,updated_at,delivery_date,preparation_date,shipping_date,address,urgent FROM orders WHERE client_id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0 ORDER BY id DESC LIMIT 50").all(session.id);
        const shipments = db.prepare("SELECT id,code,order_id,status,expected_delivery_at,address,packages,delivered_at,delivery_signature_status,delivery_recipient_name,delivery_signature_at,public_tracking_token FROM shipments WHERE client_id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0 ORDER BY id DESC LIMIT 50").all(session.id).map(attachShipmentTrackingToken);
        const invoices = db.prepare("SELECT i.id,i.code,i.order_id,i.amount,i.status,i.issue_date,i.due_date,i.pdf_url,i.pdf_status,i.pdf_generated_at,i.share_token FROM invoices i WHERE i.client_id=? AND CAST(COALESCE(i.deleted,0) AS INTEGER)=0 ORDER BY i.id DESC LIMIT 50").all(session.id).map((row) => ({ ...row, share_url: row.share_token ? invoiceShareUrl(req, row.share_token) : null }));
        const deliveryNotes = db.prepare("SELECT id,code,order_id,status,created_at,updated_at FROM delivery_notes WHERE client_id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0 ORDER BY id DESC LIMIT 50").all(session.id);
        for (const order of orders) order.lines = db.prepare("SELECT ol.product_id,ol.quantity,ol.quantity_requested,ol.quantity_unit,ol.units_factor,ol.unit_price,ol.amount,p.name product_name,p.sku FROM order_lines ol LEFT JOIN products p ON p.id=ol.product_id WHERE ol.order_id=? ORDER BY ol.id").all(Number(order.id));
        return send(res, 200, {
          profile: client,
          orders,
          shipments,
          invoices,
          delivery_notes: deliveryNotes,
          summary: {
            orders: orders.length,
            in_progress: orders.filter((row) => !["Entregado", "Cancelado", "Facturado"].includes(String(row.status || ""))).length,
            shipments: shipments.filter((row) => !["Entregado", "Cancelado"].includes(String(row.status || ""))).length,
            pending_invoices: invoices.filter((row) => !["Cobrada", "Pagada", "Anulada"].includes(String(row.status || ""))).length,
          },
        });
      }
      const t = p[1];
      if (p[0] !== "api")
        return send(res, 404, { error: "Recurso no encontrado" });
      if (t === "public_promotions" && req.method === "GET") {
        const now = new Date().toISOString();
        const promotions = db.prepare("SELECT * FROM web_promotions WHERE status='Publicada' AND CAST(COALESCE(deleted,0) AS INTEGER)=0 AND start_at<=? AND end_at>=? ORDER BY CASE promotion_type WHEN 'flash' THEN 1 WHEN 'week' THEN 2 WHEN 'month' THEN 3 ELSE 4 END,id DESC").all(now, now);
        const result = promotions.map((promotion) => {
          let productIds = [];
          try { productIds = JSON.parse(String(promotion.product_ids || "[]")); } catch {}
          productIds = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map(Number).filter(Number.isInteger)));
          const products = productIds.length
            ? db.prepare(`SELECT id,name,family,category,subfamily,brand,format,sku,description,photo_url,photo_thumbnail_url,photo_web_url FROM products WHERE id IN (${productIds.map(() => "?").join(",")}) AND CAST(COALESCE(active,1) AS INTEGER)=1 AND LOWER(COALESCE(product_status,'Activo')) NOT IN ('inactivo','baja','descatalogado')`).all(...productIds)
            : [];
          return { ...promotion, product_ids: productIds, products };
        });
        return send(res, 200, result);
      }
      if (t === "web_promotions" && p[2] && p[3] === "publish" && req.method === "POST") {
        const id = Number(p[2]);
        const promotion = db.prepare("SELECT * FROM web_promotions WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(id);
        if (!promotion) return send(res, 404, { error: "Promoción no encontrada" });
        let productIds = [];
        try { productIds = JSON.parse(String(promotion.product_ids || "[]")); } catch {}
        productIds = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map(Number).filter(Number.isInteger)));
        if (!productIds.length) return send(res, 400, { error: "Selecciona al menos un producto antes de publicar" });
        if (!promotion.start_at || !promotion.end_at || promotion.end_at < promotion.start_at) return send(res, 400, { error: "Revisa las fechas de inicio y fin" });
        const now = new Date().toISOString();
        db.prepare("UPDATE web_promotions SET status='Pausada',paused_at=?,paused_by=?,updated_at=? WHERE promotion_type=? AND id<>? AND status='Publicada' AND CAST(COALESCE(deleted,0) AS INTEGER)=0").run(now, actor, now, promotion.promotion_type, id);
        db.prepare("UPDATE web_promotions SET status='Publicada',published_at=?,published_by=?,paused_at=NULL,paused_by=NULL,updated_at=? WHERE id=?").run(now, actor, now, id);
        db.prepare("INSERT INTO notes(title,content,priority,module,record_id,important,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(`Promoción publicada · ${promotion.title}`, `La promoción ${promotion.code} ya está visible en la web con ${productIds.length} referencias.`, "Normal", "Web", id, 0, actor, now, now);
        recordAudit(actor, "POST", `web_promotions/${id}/publish`, "Publicar promoción web", JSON.stringify({ id, code: promotion.code, product_ids: productIds }));
        invalidateRelatedReadCaches("web_promotions");
        return send(res, 200, { ok: true, id, status: "Publicada", published_at: now });
      }
      if (t === "web_promotions" && p[2] && p[3] === "pause" && req.method === "POST") {
        const id = Number(p[2]);
        const promotion = db.prepare("SELECT id,code,title FROM web_promotions WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(id);
        if (!promotion) return send(res, 404, { error: "Promoción no encontrada" });
        const now = new Date().toISOString();
        db.prepare("UPDATE web_promotions SET status='Pausada',paused_at=?,paused_by=?,updated_at=? WHERE id=?").run(now, actor, now, id);
        recordAudit(actor, "POST", `web_promotions/${id}/pause`, "Pausar promoción web", JSON.stringify({ id, code: promotion.code }));
        invalidateRelatedReadCaches("web_promotions");
        return send(res, 200, { ok: true, id, status: "Pausada", paused_at: now });
      }
      if (t === "quotes" && req.method === "POST" && (p.includes("convert-order") || String(req.url || "").includes("/convert-order"))) {
        const actionIndex = p.indexOf("convert-order");
        const pathId = actionIndex >= 0 ? (p[actionIndex + 1] || p[actionIndex - 1]) : String(req.url || "").match(/convert-order\/?(\d+)/)?.[1];
        const quoteId = Number(pathId);
        const quote = db.prepare("SELECT * FROM quotes WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(quoteId);
        if (!quote) return send(res, 404, { error: "Presupuesto no encontrado" });
        if (quote.converted_order_id) {
          const existing = db.prepare("SELECT id,code FROM orders WHERE id=?").get(Number(quote.converted_order_id));
          return send(res, 409, { error: `El presupuesto ya se convirtió en ${existing?.code || `pedido #${quote.converted_order_id}`}`, order: existing || null });
        }
        if (["Cancelado", "Rechazado"].includes(String(quote.status || ""))) return send(res, 400, { error: "No se puede convertir un presupuesto cancelado o rechazado" });
        const client = quote.client_id ? db.prepare("SELECT * FROM clients WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(Number(quote.client_id)) : null;
        if (!client) return send(res, 400, { error: "El presupuesto debe tener un cliente válido antes de convertirse en pedido" });
        const quoteLines = db.prepare("SELECT * FROM quote_lines WHERE quote_id=? ORDER BY id").all(quoteId);
        const lines = quoteLines.length ? quoteLines : (quote.product_id && Number(quote.quantity || 0) > 0 ? [quote] : []);
        if (!lines.length) return send(res, 400, { error: "El presupuesto debe tener al menos una línea de producto" });
        const now = new Date().toISOString();
        const normalizedLines = [];
        for (const line of lines) {
          const productId = Number(line.product_id);
          const quantity = Number(line.quantity || 0);
          if (!productId || !Number.isFinite(quantity) || quantity <= 0) return send(res, 400, { error: "Una de las líneas del presupuesto no tiene producto o cantidad válida" });
          const product = db.prepare("SELECT id,name,stock,COALESCE(stock_reserved,0) stock_reserved FROM products WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(productId);
          if (!product) return send(res, 400, { error: "Uno de los productos del presupuesto ya no está disponible" });
          normalizedLines.push({ productId, quantity, quantityRequested: Number(line.quantity_requested || line.quantity || 0), quantityUnit: String(line.quantity_unit || "unidad"), unitsFactor: Number(line.units_factor || 1), unitPrice: Number(line.unit_price || 0), discount: Number(line.discount || 0), vat: Number(line.vat || 21), amount: Number(line.amount || quantity * Number(line.unit_price || 0)) });
        }
        const amount = Number(quote.amount || normalizedLines.reduce((sum, line) => sum + line.amount, 0));
        const firstLine = normalizedLines[0];
        const stockShortages = normalizedLines.filter((line) => {
          const product = db.prepare("SELECT stock,COALESCE(stock_reserved,0) stock_reserved FROM products WHERE id=?").get(line.productId);
          return Number(product?.stock || 0) - Number(product?.stock_reserved || 0) < line.quantity;
        }).map((line) => line.productId);
        const code = `PED-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;
        if (!remoteMode) db.exec("BEGIN");
        try {
          const created = db.prepare("INSERT INTO orders(code,client_id,product_id,quantity,amount,status,address,delivery_city,created_by,created_at,updated_at,stock_alert,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(code, Number(client.id), firstLine.productId, firstLine.quantity, amount, "Pendiente", client.address || "", client.city || "", actor, now, now, stockShortages.length ? 1 : 0, `Pedido creado desde el presupuesto ${quote.code}.`);
          const orderId = Number(created.lastInsertRowid);
          const insertLine = db.prepare("INSERT INTO order_lines(order_id,product_id,quantity,quantity_requested,quantity_unit,units_factor,unit_price,discount,vat,amount,prepared,prepared_quantity,preparation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
          for (const line of normalizedLines) {
            insertLine.run(orderId, line.productId, line.quantity, line.quantityRequested, line.quantityUnit, line.unitsFactor, line.unitPrice, line.discount, line.vat, line.amount, 0, 0, "Pendiente", now, now);
            db.prepare("UPDATE products SET stock_reserved=COALESCE(stock_reserved,0)+? WHERE id=?").run(line.quantity, line.productId);
          }
          const shipmentCode = `ENV-${new Date().getFullYear()}-${String(Date.now()).slice(-7)}`;
          db.prepare("INSERT INTO shipments(code,order_id,client_id,status,preparation_date,expected_delivery_at,address,packages,incidents,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(shipmentCode, orderId, Number(client.id), "Preparando", null, null, client.address || "", 1, "", `Preparación creada desde el presupuesto ${quote.code}.`, now, now);
          db.prepare("UPDATE quotes SET status='Convertido',converted_order_id=?,updated_at=? WHERE id=?").run(orderId, now, quoteId);
          recordAudit(actor, "POST", `quotes/${quoteId}/convert-order`, "Conversión a pedido", JSON.stringify({ quote_id: quoteId, quote_code: quote.code, order_id: orderId, order_code: code, lines: normalizedLines.length }));
          if (!remoteMode) db.exec("COMMIT");
          invalidateRelatedReadCaches("quotes");
          invalidateRelatedReadCaches("orders");
          invalidateReadCache("order_lines");
          invalidateReadCache("shipments");
          invalidateReadCache("products");
          markCommercialDocumentPdfStale("quote", quoteId);
          let orderPdf = null;
          try { orderPdf = await ensureCommercialDocumentPdf("order", orderId, actor); } catch (error) { orderPdf = { pdf_status: "Pendiente · PDF no generado", pdf_error: error?.message || "No se pudo generar el PDF" }; }
          return send(res, 201, { id: orderId, code, client_id: Number(client.id), amount, status: "Pendiente", source_quote_id: quoteId, source_quote_code: quote.code, stock_alerts: stockShortages, pdf_status: orderPdf.pdf_status, pdf_generated_at: orderPdf.pdf_generated_at || null, share_url: orderPdf.share_token ? documentShareUrl(req, "order", orderPdf.share_token) : null, pdf_error: orderPdf.pdf_error || null });
        } catch (error) {
          if (!remoteMode) { try { db.exec("ROLLBACK"); } catch {} }
          return send(res, 500, { error: error?.message || "No se pudo convertir el presupuesto en pedido" });
        }
      }
      if (t === "purchase_requests" && p[2] === "public") {
        const params = new URL(req.url, "http://local").searchParams;
        const token = String(params.get("token") || "").trim();
        const request = token ? db.prepare("SELECT * FROM purchase_requests WHERE public_token=? LIMIT 1").get(token) : null;
        if (!request) return send(res, 404, { error: "Solicitud no encontrada o enlace caducado" });
        if (request.valid_until && String(request.valid_until).slice(0, 10) < new Date().toISOString().slice(0, 10)) return send(res, 410, { error: "La fecha límite de esta solicitud ya ha pasado" });
        let productIds = [];
        let supplierIds = [];
        try { productIds = JSON.parse(String(request.product_ids || "[]")); } catch {}
        try { supplierIds = JSON.parse(String(request.supplier_ids || "[]")); } catch {}
        const products = productIds.length ? db.prepare(`SELECT id,name,sku,unit,format FROM products WHERE id IN (${productIds.map(() => "?").join(",")}) ORDER BY name`).all(...productIds.map(Number)) : [];
        const supplierId = Number(params.get("supplier") || 0);
        if (!supplierId || !supplierIds.map(Number).includes(supplierId)) return send(res, 403, { error: "Proveedor no autorizado para esta solicitud" });
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
        const validUntil = String(d.valid_until || "").trim() || null;
        const created = db.prepare("INSERT INTO purchase_requests(code,request_type,status,product_ids,supplier_ids,notes,created_by,created_at,updated_at,public_token,channels,sent_at,valid_until) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(code, String(d.request_type || "Solicitud de oferta"), status, JSON.stringify(productIds), JSON.stringify(supplierIds), String(d.notes || ""), String(d.created_by || actor), now, now, token, JSON.stringify(channels), channels.length ? now : null, validUntil);
        const id = Number(created.lastInsertRowid);
        db.prepare("INSERT INTO notes(title,content,priority,module,record_id,important,completed,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(`Solicitud de precios · ${code}`, `Solicitud preparada para ${supplierIds.length} proveedores y ${productIds.length} productos. Canales: ${channels.join(", ") || "pendiente de elegir"}.`, "Normal", "Compras", id, 0, 0, now, now);
        recordAudit(actor, "POST", `purchase_requests/${id}`, "Solicitud de precios", JSON.stringify({ id, code, product_ids: productIds, supplier_ids: supplierIds, channels }));
        return send(res, 201, { id, code, status, public_token: token, channels });
      }
      if (t === "purchase_requests" && req.method === "POST" && p[2] && p[3] === "apply-offer") {
        const requestId = Number(p[2]);
        const body = await read(req);
        const request = db.prepare("SELECT * FROM purchase_requests WHERE id=?").get(requestId);
        const offer = db.prepare("SELECT * FROM purchase_request_offers WHERE id=? AND request_id=?").get(Number(body.offer_id), requestId);
        if (!request || !offer) return send(res, 404, { error: "Solicitud u oferta no encontrada" });
        let lines = [];
        try { lines = JSON.parse(String(offer.lines_json || "[]")); } catch {}
        if (!Array.isArray(lines) || !lines.length) return send(res, 400, { error: "La oferta no contiene líneas aplicables" });
        const now = new Date().toISOString();
        let applied = 0;
        for (const line of lines) {
          const productId = Number(line.product_id || 0);
          const supplierId = Number(offer.supplier_id || 0);
          if (!productId || !supplierId) continue;
          const values = { product_id: productId, supplier_id: supplierId, supplier_ref: String(line.supplier_ref || offer.supplier_ref || "").trim(), unit_cost: Number(line.unit_cost || 0), minimum_order: Number(line.minimum_order || 0), order_unit: String(line.order_unit || "caja"), lead_time_days: Number(line.lead_time_days || offer.delivery_days || 0), promotion: String(line.promotion || offer.notes || "").trim(), active: 1, updated_at: now, created_at: now };
          const existing = db.prepare("SELECT id FROM product_suppliers WHERE product_id=? AND supplier_id=? AND CAST(COALESCE(active,1) AS INTEGER)=1 ORDER BY id DESC LIMIT 1").get(productId, supplierId);
          if (existing) {
            const keys = Object.keys(values).filter((key) => hasColumn("product_suppliers", key));
            db.prepare(`UPDATE product_suppliers SET ${keys.filter((key) => key !== "created_at").map((key) => `${key}=?`).join(",")} WHERE id=?`).run(...keys.filter((key) => key !== "created_at").map((key) => values[key]), Number(existing.id));
          } else {
            const keys = Object.keys(values).filter((key) => hasColumn("product_suppliers", key));
            db.prepare(`INSERT INTO product_suppliers (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map((key) => values[key]));
          }
          const productChanges = {};
          if (hasColumn("products", "primary_supplier_id")) productChanges.primary_supplier_id = supplierId;
          if (hasColumn("products", "supplier_id")) productChanges.supplier_id = supplierId;
          if (hasColumn("products", "cost_price") && Number.isFinite(Number(line.unit_cost))) productChanges.cost_price = Number(line.unit_cost || 0);
          if (Object.keys(productChanges).length) { productChanges.updated_at = now; const keys = Object.keys(productChanges).filter((key) => hasColumn("products", key)); db.prepare(`UPDATE products SET ${keys.map((key) => `${key}=?`).join(",")} WHERE id=?`).run(...keys.map((key) => productChanges[key]), productId); }
          if (hasColumn("product_price_history", "product_id")) db.prepare("INSERT INTO product_price_history(product_id,supplier_id,price_type,amount,valid_from,source,notes,created_at) VALUES(?,?,?,?,?,?,?,?)").run(productId, supplierId, "Coste", Number(line.unit_cost || 0), now, actor, `Oferta ${offer.id} · ${request.code}`, now);
          applied += 1;
        }
        db.prepare("UPDATE purchase_requests SET status='Oferta seleccionada',updated_at=?,validated_by=? WHERE id=?").run(now, actor, requestId);
        db.prepare("INSERT INTO notes(title,content,priority,module,record_id,important,completed,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(`Oferta seleccionada · ${request.code}`, `Se ha aplicado la oferta del proveedor #${offer.supplier_id} a ${applied} líneas.`, "Normal", "Compras", requestId, 0, 0, actor, now, now);
        recordAudit(actor, "POST", `purchase_requests/${requestId}/apply-offer`, "Aplicar oferta", JSON.stringify({ request_id: requestId, offer_id: Number(offer.id), supplier_id: Number(offer.supplier_id), lines: applied }));
        invalidateRelatedReadCaches("purchase_requests"); invalidateReadCache("products");
        return send(res, 200, { ok: true, request_id: requestId, offer_id: Number(offer.id), applied_lines: applied, status: "Oferta seleccionada" });
      }
      if (t === "purchase_requests" && req.method === "POST" && p[2] && p[3] === "create-order") {
        const requestId = Number(p[2]);
        const body = await read(req);
        const request = db.prepare("SELECT * FROM purchase_requests WHERE id=?").get(requestId);
        const offer = db.prepare("SELECT * FROM purchase_request_offers WHERE id=? AND request_id=?").get(Number(body.offer_id), requestId);
        if (!request || !offer) return send(res, 404, { error: "Solicitud u oferta no encontrada" });
        let lines = [];
        try { lines = JSON.parse(String(offer.lines_json || "[]")); } catch {}
        const productIds = (() => { try { const parsed = JSON.parse(String(request.product_ids || "[]")); return Array.isArray(parsed) ? parsed.map(Number) : []; } catch { return []; } })();
        const today = new Date().toISOString().slice(0, 10); const expectedDate = new Date(Date.now() + Number(offer.delivery_days || 0) * 86400000).toISOString().slice(0, 10); const code = `OC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`; const now = new Date().toISOString();
        const orderLines = productIds.map((productId) => { const line = lines.find((item) => Number(item.product_id) === productId) || {}; const suggestion = db.prepare("SELECT suggested_quantity FROM purchase_suggestions WHERE product_id=? ORDER BY id DESC LIMIT 1").get(productId); const quantity = Number(line.quantity || suggestion?.suggested_quantity || 1); const unitCost = Number(line.unit_cost || 0); return { productId, quantity: Math.max(1, quantity), unitCost, amount: Math.max(1, quantity) * unitCost }; }).filter((line) => line.productId);
        if (!orderLines.length) return send(res, 400, { error: "No hay productos válidos para crear el pedido de compra" });
        const total = orderLines.reduce((sum, line) => sum + line.amount, 0);
        const order = db.prepare("INSERT INTO purchase_orders(code,supplier_id,status,order_date,expected_date,amount,notes,updated_at,request_id,validation_status) VALUES(?,?,?,?,?,?,?,?,?,?)").run(code, Number(offer.supplier_id), "Borrador", today, expectedDate, total, `Creado desde la oferta ${offer.id}. Requiere validación antes de enviarse.`, now, requestId, "Pendiente de validar");
        const orderId = Number(order.lastInsertRowid); for (const line of orderLines) db.prepare("INSERT INTO purchase_order_lines(purchase_order_id,product_id,quantity,unit_cost,amount) VALUES(?,?,?,?,?)").run(orderId, line.productId, line.quantity, line.unitCost, line.amount);
        db.prepare("UPDATE purchase_requests SET status='Pedido de compra creado',updated_at=?,validated_by=? WHERE id=?").run(now, actor, requestId); recordAudit(actor, "POST", `purchase_requests/${requestId}/create-order`, "Crear pedido de compra", JSON.stringify({ request_id: requestId, offer_id: Number(offer.id), purchase_order_id: orderId, lines: orderLines.length })); invalidateRelatedReadCaches("purchase_requests");
        return send(res, 201, { ok: true, id: orderId, code, amount: total, status: "Borrador" });
      }
      if (t === "web_registrations") {
        if (req.method === "GET") {
          const includeClosed = new URL(req.url, "http://local").searchParams.get("include_closed") === "1";
          return send(res, 200, db.prepare(`SELECT id,kind,company_name,tax_id,contact_name,email,phone,address,city,message,status,created_at,updated_at,reviewed_by,reviewed_at,crm_record_id,crm_record_type,rejection_reason FROM web_registrations ${includeClosed ? "" : "WHERE status NOT IN ('Validada','Rechazada')"} ORDER BY id DESC LIMIT 500`).all());
        }
        const d = await read(req);
        if (req.method === "POST") {
          const kind = ["cliente", "proveedor"].includes(String(d.kind)) ? String(d.kind) : "cliente";
          const companyName = String(d.company_name || "").trim();
          const contactName = String(d.contact_name || "").trim();
          const email = String(d.email || "").trim();
          if (!companyName || !contactName || !email) return send(res, 400, { error: "Empresa, contacto y email son obligatorios" });
          const password = String(d.password || "");
          if (password.length < 8) return send(res, 400, { error: "La contraseña debe tener al menos 8 caracteres" });
          const portalPasswordHash = createHash("sha256").update(password).digest("hex");
          const now = new Date().toISOString();
          const created = db.prepare("INSERT INTO web_registrations(kind,company_name,tax_id,contact_name,email,phone,address,city,message,status,created_at,updated_at,portal_password_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(kind, companyName, String(d.tax_id || "").trim(), contactName, email, String(d.phone || "").trim(), String(d.address || "").trim(), String(d.city || "").trim(), String(d.message || "").trim(), "Pendiente de validar", now, now, portalPasswordHash);
          const id = Number(created.lastInsertRowid);
          const label = kind === "proveedor" ? "proveedor" : "cliente";
          db.prepare("INSERT INTO notes(title,content,priority,module,record_id,important,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(`Validar alta web · ${companyName}`, `Solicitud de alta de ${label} recibida desde la web. Contacto: ${contactName}. Email: ${email}. Teléfono: ${String(d.phone || "").trim() || "No indicado"}. NIF/CIF: ${String(d.tax_id || "").trim() || "No indicado"}. Dirección: ${String(d.address || "").trim() || "No indicada"}. ${String(d.message || "").trim()}`, "Alta", "Web", id, 1, now, now);
          recordAudit("Portal web", "POST", `web_registrations/${id}`, "Alta web", JSON.stringify({ id, kind, company_name: companyName, contact_name: contactName, email }));
          return send(res, 201, { id, status: "Pendiente de validar" });
        }
        if (req.method === "PUT" && p[2]) {
          const id = Number(p[2]);
          const status = ["Pendiente de validar", "Validada", "Rechazada"].includes(String(d.status)) ? String(d.status) : "Pendiente de validar";
          const now = new Date().toISOString();
          const registration = db.prepare("SELECT * FROM web_registrations WHERE id=?").get(id);
          if (!registration) return send(res, 404, { error: "Solicitud no encontrada" });
          let crmRecordId = registration.crm_record_id || null;
          let crmRecordType = registration.crm_record_type || null;
          let createdInCrm = false;
          if (status === "Validada" && !crmRecordId) {
            const table = String(registration.kind) === "proveedor" ? "suppliers" : "clients";
            crmRecordType = table === "suppliers" ? "proveedor" : "cliente";
            const taxId = String(registration.tax_id || "").trim();
            const email = String(registration.email || "").trim().toLowerCase();
            const companyName = String(registration.company_name || "").trim();
            const existing = table === "suppliers"
              ? (taxId && hasColumn(table, "tax_id") ? db.prepare("SELECT id FROM suppliers WHERE LOWER(TRIM(COALESCE(tax_id,'')))=LOWER(TRIM(?)) AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(taxId) : null)
                || (email ? db.prepare("SELECT id FROM suppliers WHERE LOWER(TRIM(COALESCE(email,'')))=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(email) : null)
                || db.prepare("SELECT id FROM suppliers WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(companyName)
              : (taxId && hasColumn(table, "tax_id") ? db.prepare("SELECT id FROM clients WHERE LOWER(TRIM(COALESCE(tax_id,'')))=LOWER(TRIM(?)) AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(taxId) : null)
                || (email ? db.prepare("SELECT id FROM clients WHERE LOWER(TRIM(COALESCE(email,'')))=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(email) : null)
                || db.prepare("SELECT id FROM clients WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(companyName);
            if (existing?.id) {
              crmRecordId = Number(existing.id);
              if (registration.portal_password_hash && hasColumn(table, "portal_password_hash")) {
                db.prepare(`UPDATE ${table} SET portal_password_hash=?,portal_access_enabled=1 WHERE id=?`).run(registration.portal_password_hash, crmRecordId);
              }
            } else {
              const values = { name: companyName, tax_id: taxId, contact: String(registration.contact_name || "").trim(), phone: String(registration.phone || "").trim(), email: String(registration.email || "").trim(), address: String(registration.address || "").trim(), city: String(registration.city || "").trim(), active: 1, portal_password_hash: registration.portal_password_hash || null, portal_access_enabled: registration.portal_password_hash ? 1 : 0, created_at: now, updated_at: now, source_system: "Portal web" };
              const keys = Object.keys(values).filter((key) => hasColumn(table, key));
              const inserted = db.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map((key) => values[key]));
              crmRecordId = Number(inserted.lastInsertRowid);
              createdInCrm = true;
            }
            db.prepare("UPDATE notes SET completed=1,status='Resuelta',resolution=?,resolved_by=?,resolved_at=?,updated_at=? WHERE module='Web' AND record_id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").run(`Alta validada y vinculada a ${crmRecordType} #${crmRecordId}`, actor, now, now, id);
          }
          const result = db.prepare("UPDATE web_registrations SET status=?,updated_at=?,reviewed_by=?,reviewed_at=?,crm_record_id=?,crm_record_type=?,rejection_reason=? WHERE id=?").run(status, now, actor, status === "Pendiente de validar" ? null : now, crmRecordId, crmRecordType, status === "Rechazada" ? String(d.rejection_reason || "").trim() || null : null, id);
          if (!result.changes) return send(res, 404, { error: "Solicitud no encontrada" });
          recordAudit(actor, "PUT", `web_registrations/${id}`, "Revisión alta web", JSON.stringify({ id, status, crm_record_id: crmRecordId, crm_record_type: crmRecordType, created_in_crm: createdInCrm }));
          invalidateRelatedReadCaches("web_registrations");
          return send(res, 200, { id, status, crm_record_id: crmRecordId, crm_record_type: crmRecordType, created_in_crm: createdInCrm, reviewed_by: actor, reviewed_at: now });
        }
      }
      if (t === "assistant" && req.method === "POST" && p[2] === "adjust-order-line") {
        const d = await read(req);
        const orderIdentifier = String(d.order_identifier || "").trim();
        const productQuery = String(d.product_query || "").trim().toLowerCase();
        const delta = Number(d.delta_units);
        if (!Number.isFinite(delta) || delta === 0) return send(res, 400, { error: "El ajuste debe indicar una cantidad distinta de cero" });
        const activeStatuses = ["Nuevo", "Pendiente", "Confirmado", "Preparando", "Preparado", "Preparado con incidencia"];
        let orders = orderIdentifier
          ? db.prepare("SELECT * FROM orders WHERE (CAST(id AS TEXT)=? OR LOWER(code)=LOWER(?)) AND CAST(COALESCE(deleted,0) AS INTEGER)=0").all(orderIdentifier, orderIdentifier)
          : db.prepare(`SELECT * FROM orders WHERE status IN (${activeStatuses.map(() => "?").join(",")}) AND CAST(COALESCE(deleted,0) AS INTEGER)=0 ORDER BY id DESC LIMIT 1`).all(...activeStatuses);
        if (!orders.length) return send(res, 404, { error: "No encuentro el pedido activo indicado" });
        if (orders.length > 1) return send(res, 409, { error: "Hay varios pedidos que coinciden", choices: orders.slice(0, 8).map((row) => ({ id: row.id, code: row.code, status: row.status })) });
        const order = orders[0];
        if (["Enviado", "En reparto", "Entregado", "Cancelado"].includes(String(order.status || ""))) return send(res, 409, { error: "Ese pedido ya no admite modificaciones" });
        const lines = db.prepare("SELECT ol.*,p.name product_name,p.sku FROM order_lines ol LEFT JOIN products p ON p.id=ol.product_id WHERE ol.order_id=? ORDER BY ol.id").all(Number(order.id));
        const matches = productQuery
          ? lines.filter((line) => `${line.product_name || ""} ${line.sku || ""}`.toLowerCase().includes(productQuery))
          : lines;
        if (!matches.length) return send(res, 404, { error: "No encuentro ese producto dentro del pedido", order: { id: order.id, code: order.code } });
        if (matches.length > 1) return send(res, 409, { error: "Hay varias líneas que coinciden", choices: matches.map((line) => ({ id: line.id, product: line.product_name, quantity: line.quantity, unit: line.quantity_unit || "unidad" })) });
        const line = matches[0];
        const current = Number(line.quantity || 0);
        const next = current + delta;
        if (next < 0) return send(res, 400, { error: "El ajuste dejaría una cantidad negativa", current_quantity: current });
        const preview = { order_id: Number(order.id), order_code: order.code, line_id: Number(line.id), product: line.product_name || `Producto #${line.product_id}`, current_quantity: current, requested_delta: delta, proposed_quantity: next, quantity_unit: line.quantity_unit || "unidad", reserved_delta: next - current };
        if (!d.confirm) return send(res, 200, { ok: false, requires_confirmation: true, preview });
        db.prepare("UPDATE order_lines SET quantity=?,quantity_requested=?,amount=?,updated_at=? WHERE id=?").run(next, next, next * Number(line.unit_price || 0) * (1 - Number(line.discount || 0) / 100), new Date().toISOString(), Number(line.id));
        db.prepare("UPDATE products SET stock_reserved=MAX(0,COALESCE(stock_reserved,0)+?) WHERE id=?").run(next - current, Number(line.product_id));
        const total = db.prepare("SELECT COALESCE(SUM(amount),0) amount FROM order_lines WHERE order_id=?").get(Number(order.id)).amount;
        db.prepare("UPDATE orders SET amount=?,updated_at=? WHERE id=?").run(Number(total || 0), new Date().toISOString(), Number(order.id));
        recordAudit(actor, "POST", `assistant/adjust-order-line/${line.id}`, "Ajuste de línea", JSON.stringify({ ...preview, confirmed: true }));
        return send(res, 200, { ok: true, preview: { ...preview, final_quantity: next, order_amount: Number(total || 0) } });
      }
      if (t === "shipments" && req.method === "GET" && p[2] && p[3] === "delivery-proof") {
        const shipment = db.prepare("SELECT id,code,order_id,status,delivery_signature_data,delivery_recipient_name,delivery_signature_status,delivery_signature_at,delivery_signature_by,delivery_signature_note,delivery_attachments_json FROM shipments WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(Number(p[2]));
        if (!shipment) return send(res, 404, { error: "Envío no encontrado" });
        return send(res, 200, shipment);
      }
      if (t === "shipments" && req.method === "POST" && p[2] && p[3] === "delivery-confirmation") {
        const shipmentId = Number(p[2]);
        const body = await read(req);
        const shipment = db.prepare("SELECT * FROM shipments WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(shipmentId);
        if (!shipment) return send(res, 404, { error: "Envío no encontrado" });
        const signatureStatus = String(body.signature_status || "").trim();
        const allowedStatuses = ["Firmado", "Sin firma", "Rechazó firmar"];
        if (!allowedStatuses.includes(signatureStatus)) return send(res, 400, { error: "Indica si la entrega queda firmada, sin firma o con rechazo de firma" });
        const signatureData = String(body.signature_data || "").trim();
        const recipientName = String(body.recipient_name || "").trim();
        const note = String(body.note || "").trim();
        const rawPhotos = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];
        if (signatureStatus === "Firmado" && (!signatureData.startsWith("data:image/") || signatureData.length < 120)) return send(res, 400, { error: "Dibuja la firma antes de confirmar la entrega" });
        if (signatureStatus === "Firmado" && !recipientName) return send(res, 400, { error: "Indica quién recibe la mercancía" });
        if (signatureStatus !== "Firmado" && !note) return send(res, 400, { error: "Deja una observación explicando por qué no hay firma" });
        if (signatureData.length > 2200000) return send(res, 400, { error: "La firma ocupa demasiado. Borra y vuelve a firmar con un trazo más sencillo" });
        const deliveryPhotos = [];
        for (let index = 0; index < rawPhotos.length; index += 1) {
          const photo = rawPhotos[index] || {};
          const data = String(photo.data || "").trim();
          if (!data.startsWith("data:image/")) return send(res, 400, { error: "Una de las fotografías no tiene un formato válido" });
          if (data.length > 6000000) return send(res, 400, { error: "Cada fotografía de entrega debe ocupar menos de 4 MB" });
          let uploaded = null;
          try { uploaded = await uploadDeliveryProofAttachment(data, String(shipment.code || `ENV-${shipmentId}`), index); } catch {}
          deliveryPhotos.push(uploaded || { name: String(photo.name || `entrega-${index + 1}.jpg`), mime: String(photo.mime || "image/jpeg"), data });
        }
        const now = new Date().toISOString();
        const result = db.prepare(`UPDATE shipments SET status='Entregado',delivered_at=?,delivered_by=?,delivery_signature_data=?,delivery_recipient_name=?,delivery_signature_status=?,delivery_signature_at=?,delivery_signature_by=?,delivery_signature_note=?,delivery_attachments_json=?,updated_at=? WHERE id=?`).run(
          now,
          actor,
          signatureStatus === "Firmado" ? signatureData : null,
          recipientName || null,
          signatureStatus,
          signatureStatus === "Firmado" ? now : null,
          signatureStatus === "Firmado" ? actor : null,
          note || null,
          JSON.stringify(deliveryPhotos),
          now,
          shipmentId,
        );
        if (!result.changes) return send(res, 404, { error: "No se pudo confirmar la entrega" });
        if (shipment.order_id) db.prepare("UPDATE orders SET status='Entregado',updated_at=? WHERE id=?").run(now, Number(shipment.order_id));
        recordAudit(actor, "POST", `shipments/${shipmentId}/delivery-confirmation`, "Confirmar entrega", JSON.stringify({ shipment_id: shipmentId, order_id: shipment.order_id || null, signature_status: signatureStatus, recipient_name: recipientName || null, note: note || null }));
        invalidateRelatedReadCaches("shipments");
        invalidateRelatedReadCaches("orders");
        const updated = db.prepare("SELECT * FROM shipments WHERE id=?").get(shipmentId);
        return send(res, 200, updated);
      }
      if (t === "shipments" && req.method === "POST" && p[2] && p[3] === "payment-receipt") {
        const shipmentId = Number(p[2]);
        const body = await read(req);
        const shipment = db.prepare("SELECT * FROM shipments WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(shipmentId);
        if (!shipment) return send(res, 404, { error: "Envío no encontrado" });
        const paymentStatus = String(body.payment_status || "Pendiente").trim();
        if (!["Pendiente", "Recibido", "No recibido"].includes(paymentStatus)) return send(res, 400, { error: "El estado del cobro no es válido" });
        const amount = body.amount === "" || body.amount === null || body.amount === undefined ? 0 : Number(body.amount);
        if (!Number.isFinite(amount) || amount < 0) return send(res, 400, { error: "El importe recibido no es válido" });
        const rawAttachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 4) : [];
        let existingAttachments = [];
        try { existingAttachments = JSON.parse(String(shipment.payment_received_attachments_json || "[]")); } catch {}
        if (!Array.isArray(existingAttachments)) existingAttachments = [];
        const attachments = existingAttachments.slice(0, 4);
        for (let index = 0; index < rawAttachments.length; index += 1) {
          const item = rawAttachments[index] || {};
          const data = String(item.data || "").trim();
          if (!(data.startsWith("data:image/") || data.startsWith("data:application/pdf"))) return send(res, 400, { error: "El talón o justificante debe ser una imagen o un PDF" });
          if (data.length > 8000000) return send(res, 400, { error: "Cada justificante debe ocupar menos de 6 MB" });
          let uploaded = null;
          if (data.startsWith("data:image/")) {
            try { uploaded = await uploadDeliveryProofAttachment(data, `${shipment.code}-cobro`, index); } catch {}
          }
          if (attachments.length < 4) attachments.push(uploaded || { name: String(item.name || `justificante-cobro-${index + 1}`), mime: String(item.mime || (data.startsWith("data:application/pdf") ? "application/pdf" : "image/jpeg")), data });
        }
        const now = new Date().toISOString();
        db.prepare(`UPDATE shipments SET payment_received_status=?,payment_received_amount=?,payment_received_method=?,payment_received_reference=?,payment_received_note=?,payment_received_at=?,payment_received_by=?,payment_received_attachments_json=?,updated_at=? WHERE id=?`).run(
          paymentStatus,
          amount,
          String(body.method || "").trim() || null,
          String(body.reference || "").trim() || null,
          String(body.note || "").trim() || null,
          paymentStatus === "Pendiente" ? null : now,
          paymentStatus === "Pendiente" ? null : actor,
          JSON.stringify(attachments),
          now,
          shipmentId,
        );
        let linkedInvoiceId = null;
        if (paymentStatus === "Recibido" && amount > 0 && shipment.order_id) {
          const invoice = db.prepare(`SELECT i.id FROM invoices i WHERE CAST(COALESCE(i.deleted,0) AS INTEGER)=0 AND (i.order_id=? OR EXISTS(SELECT 1 FROM invoice_orders io WHERE io.invoice_id=i.id AND io.order_id=?)) ORDER BY i.id DESC LIMIT 1`).get(Number(shipment.order_id), Number(shipment.order_id));
          if (invoice?.id) {
            linkedInvoiceId = Number(invoice.id);
            const sourceNote = `Cobro recibido en reparto · ${shipment.code}`;
            const existingPayment = db.prepare("SELECT id FROM payments WHERE invoice_id=? AND notes LIKE ? AND CAST(COALESCE(deleted,0) AS INTEGER)=0 ORDER BY id DESC LIMIT 1").get(linkedInvoiceId, `%${shipment.code}%`);
            const paymentDate = now.slice(0, 10);
            if (existingPayment?.id) {
              const updateFields = ["amount=?", "payment_date=?", "method=?", "notes=?", "updated_at=?"];
              const updateValues = [amount, paymentDate, String(body.method || "").trim() || "Otro", sourceNote, now];
              if (hasColumn("payments", "reference")) { updateFields.splice(3, 0, "reference=?"); updateValues.splice(3, 0, String(body.reference || "").trim() || null); }
              db.prepare(`UPDATE payments SET ${updateFields.join(",")} WHERE id=?`).run(...updateValues, Number(existingPayment.id));
            } else {
              const columns = ["invoice_id", "amount", "payment_date", "method", "notes", "created_at", "updated_at"];
              const values = [linkedInvoiceId, amount, paymentDate, String(body.method || "").trim() || "Otro", sourceNote, now, now];
              if (hasColumn("payments", "reference")) { columns.splice(4, 0, "reference"); values.splice(4, 0, String(body.reference || "").trim() || null); }
              db.prepare(`INSERT INTO payments(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`).run(...values);
            }
            const paid = db.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE invoice_id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(linkedInvoiceId).total;
            const invoiceAmount = db.prepare("SELECT amount FROM invoices WHERE id=?").get(linkedInvoiceId)?.amount || 0;
            db.prepare("UPDATE invoices SET status=? WHERE id=?").run(Number(paid) >= Number(invoiceAmount) ? "Cobrada" : "Parcial", linkedInvoiceId);
          }
        }
        recordAudit(actor, "POST", `shipments/${shipmentId}/payment-receipt`, "Registrar talón o cobro recibido", JSON.stringify({ shipment_id: shipmentId, order_id: shipment.order_id || null, invoice_id: linkedInvoiceId, payment_status: paymentStatus, amount, method: body.method || null, reference: body.reference || null, attachments: attachments.length }));
        invalidateRelatedReadCaches("shipments");
        return send(res, 200, db.prepare("SELECT * FROM shipments WHERE id=?").get(shipmentId));
      }
      if (t === "goods_receipt_incidents" && req.method === "POST" && p[2] && p[3] === "claim") {
        const incidentId = Number(p[2]);
        const incident = db.prepare("SELECT gi.*,gr.code receipt_code,s.name supplier_name,s.email supplier_email FROM goods_receipt_incidents gi JOIN goods_receipts gr ON gr.id=gi.receipt_id LEFT JOIN suppliers s ON s.id=gi.supplier_id WHERE gi.id=? AND CAST(COALESCE(gi.deleted,0) AS INTEGER)=0").get(incidentId);
        if (!incident) return send(res, 404, { error: "Incidencia no encontrada" });
        const d = await read(req);
        const now = new Date().toISOString();
        const message = String(d.message || `Reclamación por ${incident.type || "incidencia"} en la entrada ${incident.receipt_code}. ${incident.description || "Revisar mercancía recibida y aplicar la solución acordada."}`).trim();
        db.prepare("UPDATE goods_receipt_incidents SET claim_status='Preparada',claim_message=?,claim_created_by=?,claim_created_at=?,updated_at=? WHERE id=?").run(message, actor, now, now, incidentId);
        db.prepare("INSERT INTO notes(title,content,priority,module,record_id,important,completed,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(`Reclamación a proveedor · ${incident.supplier_name || `Proveedor #${incident.supplier_id}`}`, `${message}\n\nProveedor: ${incident.supplier_name || "Sin nombre"}${incident.supplier_email ? ` · ${incident.supplier_email}` : ""}\nEntrada: ${incident.receipt_code}\nIncidencia: ${incident.type || "Incidencia"}`, "Alta", "Entradas", Number(incident.receipt_id), 1, 0, actor, now, now);
        recordAudit(actor, "POST", `goods_receipt_incidents/${incidentId}/claim`, "Reclamación a proveedor", JSON.stringify({ incident_id: incidentId, receipt_id: Number(incident.receipt_id), supplier_id: Number(incident.supplier_id), supplier_email: incident.supplier_email || null }));
        invalidateRelatedReadCaches("goods_receipt_incidents");
        return send(res, 200, { id: incidentId, claim_status: "Preparada", claim_message: message, claim_created_by: actor, claim_created_at: now, supplier_email: incident.supplier_email || null });
      }
      if (t === "goods_receipt_lines" && req.method === "PUT" && p[2] && p[3] === "location") {
        const lineId = Number(p[2]);
        const body = await read(req);
        const line = db.prepare("SELECT gl.id,gl.receipt_id,p.warehouse_location FROM goods_receipt_lines gl LEFT JOIN products p ON p.id=gl.product_id WHERE gl.id=? AND CAST(COALESCE(gl.deleted,0) AS INTEGER)=0").get(lineId);
        if (!line) return send(res, 404, { error: "Línea de entrada no encontrada" });
        const mode = String(body.mode || "scan").trim().toLowerCase() === "manual" ? "manual" : "scan";
        const scannedCode = String(body.scanned_code || "").trim();
        const expectedCode = String(line.warehouse_location || "").trim();
        const normalizeLocation = (value) => String(value || "").trim().toLocaleUpperCase("es-ES").replace(/\s+/g, "");
        let status = "Pendiente";
        if (mode === "manual") status = "Validada manualmente";
        else if (scannedCode && expectedCode && normalizeLocation(scannedCode) === normalizeLocation(expectedCode)) status = "Validada por lectura";
        else if (scannedCode) status = "No coincide";
        const now = new Date().toISOString();
        const updated = db.prepare("UPDATE goods_receipt_lines SET location_verified_status=?,location_verified_code=?,location_verified_reason=?,location_verified_by=?,location_verified_at=?,updated_at=? WHERE id=?").run(status, scannedCode || null, String(body.reason || "").trim() || null, mode === "manual" || status === "Validada por lectura" ? actor : null, status === "Pendiente" ? null : now, now, lineId);
        if (!updated.changes) return send(res, 404, { error: "No se pudo actualizar la validación de ubicación" });
        const current = db.prepare("SELECT gl.*,p.name product_name,p.sku,p.warehouse_location,sp.name substitute_product_name FROM goods_receipt_lines gl LEFT JOIN products p ON p.id=gl.product_id LEFT JOIN products sp ON sp.id=gl.substitute_product_id WHERE gl.id=?").get(lineId);
        recordAudit(actor, "PUT", `goods_receipt_lines/${lineId}/location`, "Validar ubicación de entrada", JSON.stringify({ receipt_id: Number(line.receipt_id), status, scanned_code: scannedCode || null, expected_code: expectedCode || null, mode }));
        invalidateRelatedReadCaches("goods_receipt_lines");
        return send(res, 200, current);
      }
      if (t === "goods_receipts" && req.method === "GET" && !p[2]) {
        const rows = db.prepare("SELECT gr.*,s.name supplier_name,w.name warehouse_name,po.code purchase_order_code,pi.code purchase_invoice_code,pi.status purchase_invoice_status,(SELECT COUNT(*) FROM goods_receipt_lines gl WHERE gl.receipt_id=gr.id AND CAST(COALESCE(gl.deleted,0) AS INTEGER)=0) line_count,(SELECT COUNT(*) FROM goods_receipt_incidents gi WHERE gi.receipt_id=gr.id AND CAST(COALESCE(gi.deleted,0) AS INTEGER)=0) incident_count,(SELECT COALESCE(SUM(gl.economic_difference),0) FROM goods_receipt_lines gl WHERE gl.receipt_id=gr.id AND CAST(COALESCE(gl.deleted,0) AS INTEGER)=0) economic_difference FROM goods_receipts gr LEFT JOIN suppliers s ON s.id=gr.supplier_id LEFT JOIN warehouses w ON w.id=gr.warehouse_id LEFT JOIN purchase_orders po ON po.id=gr.purchase_order_id LEFT JOIN invoices pi ON pi.id=gr.purchase_invoice_id WHERE CAST(COALESCE(gr.deleted,0) AS INTEGER)=0 ORDER BY gr.receipt_date DESC,gr.id DESC LIMIT 500").all();
        return send(res, 200, rows);
      }
      if (t === "goods_receipts" && req.method === "GET" && p[2] === "detail") {
        const receiptId = Number(p[3]);
        const receipt = db.prepare("SELECT gr.*,s.name supplier_name,w.name warehouse_name,po.code purchase_order_code,pi.code purchase_invoice_code,pi.status purchase_invoice_status FROM goods_receipts gr LEFT JOIN suppliers s ON s.id=gr.supplier_id LEFT JOIN warehouses w ON w.id=gr.warehouse_id LEFT JOIN purchase_orders po ON po.id=gr.purchase_order_id LEFT JOIN invoices pi ON pi.id=gr.purchase_invoice_id WHERE gr.id=? AND CAST(COALESCE(gr.deleted,0) AS INTEGER)=0").get(receiptId);
        if (!receipt) return send(res, 404, { error: "Entrada no encontrada" });
        const lines = db.prepare("SELECT gl.*,p.name product_name,p.sku,p.warehouse_location,p.warehouse_id AS product_warehouse_id,w2.name AS product_warehouse_name,sp.name substitute_product_name FROM goods_receipt_lines gl LEFT JOIN products p ON p.id=gl.product_id LEFT JOIN warehouses w2 ON w2.id=p.warehouse_id LEFT JOIN products sp ON sp.id=gl.substitute_product_id WHERE gl.receipt_id=? AND CAST(COALESCE(gl.deleted,0) AS INTEGER)=0 ORDER BY gl.id").all(receiptId);
        const incidentRows = db.prepare("SELECT gi.*,p.name product_name,sp.name substitute_product_name FROM goods_receipt_incidents gi LEFT JOIN goods_receipt_lines gl ON gl.id=gi.receipt_line_id LEFT JOIN products p ON p.id=gl.product_id LEFT JOIN products sp ON sp.id=gi.substitute_product_id WHERE gi.receipt_id=? AND CAST(COALESCE(gi.deleted,0) AS INTEGER)=0 ORDER BY gi.id").all(receiptId);
        const incidents = incidentRows.map((incident) => { let attachments = []; try { attachments = JSON.parse(String(incident.attachments_json || "[]")); } catch {} return { ...incident, attachments: Array.isArray(attachments) ? attachments : [] }; });
        return send(res, 200, { ...receipt, lines, incidents });
      }
      if (t === "goods_receipts" && req.method === "POST" && p[2] === "receive") {
        const d = await read(req);
        const supplierId = Number(d.supplier_id || 0);
        const warehouseId = Number(d.warehouse_id || 0);
        const purchaseOrderId = Number(d.purchase_order_id || 0) || null;
        const purchaseInvoiceId = Number(d.purchase_invoice_id || 0) || null;
        const receiptDate = String(d.receipt_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
        const inputLines = Array.isArray(d.lines) ? d.lines : [];
        const supplier = supplierId ? db.prepare("SELECT id,name FROM suppliers WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(supplierId) : null;
        const warehouse = warehouseId ? db.prepare("SELECT id,name FROM warehouses WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(warehouseId) : null;
        if (!supplier) return send(res, 400, { error: "Selecciona un proveedor para la entrada" });
        if (!warehouse) return send(res, 400, { error: "Selecciona el almacén de destino" });
        if (purchaseOrderId && !db.prepare("SELECT id FROM purchase_orders WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(purchaseOrderId)) return send(res, 400, { error: "El pedido de compra no existe" });
        if (purchaseInvoiceId && !db.prepare("SELECT id FROM invoices WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(purchaseInvoiceId)) return send(res, 400, { error: "La factura de compra no existe" });
        if (!inputLines.length) return send(res, 400, { error: "Añade al menos un producto a la entrada" });
        const now = new Date().toISOString();
        const lines = [];
        for (const input of inputLines) {
          const productId = Number(input.product_id || 0);
          const product = productId ? db.prepare("SELECT id,name,sku,stock FROM products WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(productId) : null;
          const expected = Number(input.expected_quantity || 0);
          const received = Number(input.received_quantity || 0);
          const damaged = Math.min(received, Math.max(0, Number(input.damaged_quantity || 0)));
          const substituted = Math.min(received, Math.max(0, Number(input.substituted_quantity || 0)));
          const substituteProductId = Number(input.substitute_product_id || 0) || null;
          const lotCode = String(input.lot_code || "").trim().slice(0, 120);
          const expiryDate = String(input.expiry_date || "").trim().slice(0, 10) || null;
          if (!product) return send(res, 400, { error: "Uno de los productos no existe" });
          if (!Number.isFinite(expected) || expected < 0 || !Number.isFinite(received) || received < 0) return send(res, 400, { error: `Cantidad no válida para ${product.name}` });
          if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return send(res, 400, { error: `Fecha de caducidad no válida para ${product.name}` });
          if (substituted > 0 && !substituteProductId) return send(res, 400, { error: `Selecciona el producto sustituto para ${product.name}` });
          if (substituteProductId && !db.prepare("SELECT id FROM products WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(substituteProductId)) return send(res, 400, { error: `El producto sustituto de ${product.name} no existe` });
          const rawAttachments = Array.isArray(input.attachments) ? input.attachments : [];
          if (input.attachment_data) rawAttachments.unshift({ name: input.attachment_name, mime: input.attachment_mime, data: input.attachment_data });
          if (expected === 0 && received === 0 && !String(input.notes || input.incident_description || "").trim() && !rawAttachments.length && damaged === 0 && substituted === 0) continue;
          const requestedStatus = ["Correcta", "Diferencia", "Producto equivocado", "Dañado", "Sustituido"].includes(String(input.status)) ? String(input.status) : "Correcta";
          const status = requestedStatus === "Correcta" && expected !== received ? "Diferencia" : requestedStatus;
          const attachments = [];
          for (let index = 0; index < rawAttachments.length; index += 1) {
            const attachment = rawAttachments[index] || {};
            const data = String(attachment.data || "");
            if (!data.startsWith("data:image/")) continue;
            let uploaded = null;
            try { uploaded = await uploadReceiptAttachment(data, String(d.code || "entrada"), product.name, index); } catch {}
            attachments.push(uploaded || { name: String(attachment.name || `incidencia-${index + 1}.jpg`), mime: String(attachment.mime || "image/jpeg"), data });
          }
          const expectedValue = expected * Math.max(0, Number(input.unit_cost || 0));
          const receivedValue = received * Math.max(0, Number(input.unit_cost || 0));
          lines.push({ productId, product, expected, received, damaged, substituted, substituteProductId, lotCode, expiryDate, unitCost: Math.max(0, Number(input.unit_cost || 0)), expectedValue, receivedValue, economicDifference: receivedValue - expectedValue, status, notes: String(input.notes || "").trim(), incidentDescription: String(input.incident_description || "").trim(), attachments });
        }
        if (!lines.length) return send(res, 400, { error: "Las líneas deben tener alguna cantidad recibida o una incidencia" });
        const hasIncident = lines.some((line) => line.status !== "Correcta" || line.incidentDescription || line.attachments.length || line.damaged > 0 || line.substituted > 0 || (line.expected !== line.received));
        const code = String(d.code || `ENT-${new Date().getFullYear()}-${String(Date.now()).slice(-7)}`);
        const status = hasIncident ? "Con incidencia" : "Recepcionada";
        const validationStatus = ["Pendiente", "Validada", "Rechazada"].includes(String(d.validation_status)) ? String(d.validation_status) : "Pendiente";
        const validatedBy = validationStatus === "Validada" ? String(d.validated_by || actor) : null;
        const validatedAt = validationStatus === "Validada" ? now : null;
        if (!remoteMode) db.exec("BEGIN");
        try {
          const created = db.prepare("INSERT INTO goods_receipts(code,supplier_id,purchase_order_id,purchase_invoice_id,warehouse_id,receipt_date,status,validation_status,validated_by,validated_at,notes,created_by,received_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(code, supplierId, purchaseOrderId, purchaseInvoiceId, warehouseId, receiptDate, status, validationStatus, validatedBy, validatedAt, String(d.notes || "").trim(), actor, String(d.received_by || actor), now, now);
          const receiptId = Number(created.lastInsertRowid);
          const insertLine = db.prepare("INSERT INTO goods_receipt_lines(receipt_id,product_id,product_name_snapshot,expected_quantity,received_quantity,damaged_quantity,substituted_quantity,substitute_product_id,unit_cost,expected_value,received_value,economic_difference,status,lot_code,expiry_date,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
          const insertMovement = db.prepare("INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity,reference,movement_date,notes,receipt_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)");
          const findLot = db.prepare("SELECT id FROM product_lots WHERE product_id=? AND lot_code=? AND (warehouse_id=? OR warehouse_id IS NULL) ORDER BY id LIMIT 1");
          const insertLot = db.prepare("INSERT INTO product_lots(product_id,lot_code,quantity,waste_quantity,expiry_date,received_date,warehouse_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)");
          const updateLot = db.prepare("UPDATE product_lots SET quantity=COALESCE(quantity,0)+?,waste_quantity=COALESCE(waste_quantity,0)+?,expiry_date=COALESCE(?,expiry_date),received_date=COALESCE(?,received_date),warehouse_id=COALESCE(warehouse_id,?),updated_at=? WHERE id=?");
          const updateLineLot = db.prepare("UPDATE goods_receipt_lines SET lot_id=? WHERE id=?");
          const insertIncident = db.prepare("INSERT INTO goods_receipt_incidents(receipt_id,receipt_line_id,supplier_id,type,description,expected_quantity,received_quantity,damaged_quantity,substituted_quantity,substitute_product_id,economic_difference,status,attachment_name,attachment_mime,attachment_data,attachments_json,claim_status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
          const incidents = [];
          for (const line of lines) {
            const lineResult = insertLine.run(receiptId, line.productId, line.product.name, line.expected, line.received, line.damaged, line.substituted, line.substituteProductId, line.unitCost, line.expectedValue, line.receivedValue, line.economicDifference, line.status, line.lotCode || null, line.expiryDate, line.notes, now, now);
            const lineId = Number(lineResult.lastInsertRowid);
            const usableOriginal = Math.max(0, line.received - line.damaged - line.substituted);
            if (usableOriginal > 0) {
              insertMovement.run(line.productId, warehouseId, "Entrada", usableOriginal, code, receiptDate, `Recepción ${code} · ${line.product.name}`, receiptId, actor);
              db.prepare("UPDATE products SET stock=COALESCE(stock,0)+?,cost_price=CASE WHEN ? > 0 THEN ? ELSE cost_price END,real_cost=CASE WHEN ? > 0 THEN ? ELSE real_cost END,updated_at=? WHERE id=?").run(usableOriginal, line.unitCost, line.unitCost, line.unitCost, line.unitCost, now, line.productId);
            }
            if (line.lotCode && (usableOriginal > 0 || line.damaged > 0)) {
              const existingLot = findLot.get(line.productId, line.lotCode, warehouseId);
              const lotId = existingLot
                ? Number(existingLot.id)
                : Number(insertLot.run(line.productId, line.lotCode, usableOriginal, line.damaged, line.expiryDate, receiptDate, warehouseId, now, now).lastInsertRowid);
              if (existingLot) updateLot.run(usableOriginal, line.damaged, line.expiryDate, receiptDate, warehouseId, now, lotId);
              updateLineLot.run(lotId, lineId);
            }
            if (line.substituteProductId && line.substituted > 0) {
              insertMovement.run(line.substituteProductId, warehouseId, "Entrada", line.substituted, code, receiptDate, `Sustitución en recepción ${code} · ${line.product.name}`, receiptId, actor);
              db.prepare("UPDATE products SET stock=COALESCE(stock,0)+?,updated_at=? WHERE id=?").run(line.substituted, now, line.substituteProductId);
            }
            const incident = line.status !== "Correcta" || line.incidentDescription || line.attachments.length || line.damaged > 0 || line.substituted > 0 || line.expected !== line.received;
            if (incident) {
              const type = line.damaged > 0 ? "Dañado" : line.substituted > 0 ? "Sustituido" : line.status;
              const description = line.incidentDescription || (type === "Dañado" ? `Producto recibido dañado: ${line.damaged} unidades.` : type === "Sustituido" ? `Producto sustituido: ${line.substituted} unidades${line.substituteProductId ? "." : ". Falta indicar la referencia alternativa."}` : type === "Producto equivocado" ? "Producto recibido no corresponde con la referencia esperada." : `Diferencia de unidades: esperadas ${line.expected}, recibidas ${line.received}.`);
              const firstAttachment = line.attachments[0] || {};
              const incidentResult = insertIncident.run(receiptId, lineId, supplierId, type, description, line.expected, line.received, line.damaged, line.substituted, line.substituteProductId, line.economicDifference, "Abierta", firstAttachment.name || null, firstAttachment.mime || null, firstAttachment.data || null, JSON.stringify(line.attachments.map(({ data, ...attachment }) => data ? { ...attachment, data } : attachment)), "No reclamada", actor, now, now);
              incidents.push({ id: Number(incidentResult.lastInsertRowid), product_name: line.product.name, description });
            }
          }
          if (purchaseOrderId) db.prepare("UPDATE purchase_orders SET status=?,updated_at=? WHERE id=?").run(hasIncident ? "Recibida con incidencia" : "Recibida", now, purchaseOrderId);
          if (incidents.length) db.prepare("INSERT INTO notes(title,content,priority,module,record_id,important,completed,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(`Incidencia en entrada · ${code}`, `La entrada ${code} del proveedor ${supplier.name} tiene ${incidents.length} incidencia${incidents.length === 1 ? "" : "s"}. Revisa las diferencias, productos equivocados o daños y sus fotografías desde Entradas.`, "Alta", "Entradas", receiptId, 1, 0, actor, now, now);
          recordAudit(actor, "POST", `goods_receipts/${receiptId}`, "Recepción de mercancía", JSON.stringify({ receipt_id: receiptId, code, supplier_id: supplierId, warehouse_id: warehouseId, purchase_order_id: purchaseOrderId, purchase_invoice_id: purchaseInvoiceId, validation_status: validationStatus, lines: lines.length, incidents: incidents.length, economic_difference: lines.reduce((sum, line) => sum + Number(line.economicDifference || 0), 0) }));
          if (!remoteMode) db.exec("COMMIT");
          invalidateRelatedReadCaches("goods_receipts");
          invalidateRelatedReadCaches("inventory_movements");
          invalidateReadCache("products");
          return send(res, 201, { id: receiptId, code, supplier_id: supplierId, supplier_name: supplier.name, warehouse_id: warehouseId, status, validation_status: validationStatus, validated_by: validatedBy, validated_at: validatedAt, purchase_invoice_id: purchaseInvoiceId, line_count: lines.length, incident_count: incidents.length, economic_difference: lines.reduce((sum, line) => sum + Number(line.economicDifference || 0), 0), received_by: String(d.received_by || actor), receipt_date: receiptDate, notes: String(d.notes || "").trim() });
        } catch (error) {
          if (!remoteMode) { try { db.exec("ROLLBACK"); } catch {} }
          return send(res, 500, { error: error?.message || "No se pudo registrar la entrada" });
        }
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
          const trashLabelColumns = { products: "name", clients: "name", orders: "code", invoices: "code", delivery_notes: "code", shipments: "code", users: "username", expenses: "code", notes: "title", suppliers: "name", purchase_orders: "code", warehouses: "name", collection_points: "name", inventory_movements: "reference", returns: "code", quotes: "code", scheduled_tasks: "title" };
          const trashQuery = sources.map((table) => {
            const labelColumn = trashLabelColumns[table];
            const labelExpression = labelColumn ? `COALESCE(${labelColumn},'')` : "''";
            const tableLabel = String(labels[table] || table).replaceAll("'", "''");
            return `SELECT id,'${table}' table_name,'${tableLabel}' table_label,${labelExpression} record_label,deleted_at,deleted_by,created_at FROM ${table} WHERE CAST(COALESCE(deleted,0) AS INTEGER)=1`;
          }).join(" UNION ALL ");
          const rows = db.prepare(trashQuery).all().map((row) => ({ id: Number(row.id), table: row.table_name, table_label: row.table_label, record_label: row.record_label || `Registro #${row.id}`, deleted_at: row.deleted_at, deleted_by: row.deleted_by, created_at: row.created_at, details: row }));
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
          const role = ["admin", "user", "comercial", "almacen", "repartidor"].includes(d.role) ? d.role : "user";
          const permissions = role === "admin" ? "*" : JSON.stringify(Array.isArray(d.permissions) ? d.permissions : []);
          const result = db.prepare("INSERT INTO users(username,password,role,must_change,permissions) VALUES(?,?,?,?,?)").run(String(d.username).trim(), String(d.password), role, 0, permissions);
          return send(res, 201, { id: Number(result.lastInsertRowid), username: String(d.username).trim(), role, must_change: 0, permissions });
        }
        if (req.method === "PUT") {
          const id = Number(p[2]);
          const existing = db.prepare("SELECT * FROM users WHERE id=?").get(id);
          if (!existing) return send(res, 404, { error: "Usuario no encontrado" });
          const role = ["admin", "user", "comercial", "almacen", "repartidor"].includes(d.role) ? d.role : "user";
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
            "SELECT p.id product_id,p.name product_name,COALESCE(p.sku,'') sku,COALESCE(p.unit,'unidad') unit,COALESCE(w.name,'Almacén general') warehouse_name,COALESCE(p.stock,0) stock,COALESCE(p.stock_reserved,0) stock_reserved,COALESCE(p.stock,0)-COALESCE(p.stock_reserved,0) available_stock,COALESCE(NULLIF(p.stock_min,0),p.min_stock,0) min_stock,CASE WHEN COALESCE(p.stock,0)-COALESCE(p.stock_reserved,0)<=0 THEN 'Sin stock' WHEN COALESCE(p.stock,0)-COALESCE(p.stock_reserved,0)<=COALESCE(NULLIF(p.stock_min,0),p.min_stock,0) THEN 'Crítico' ELSE 'Disponible' END stock_status FROM products p LEFT JOIN warehouses w ON w.id=1 WHERE CAST(COALESCE(p.deleted,0) AS INTEGER)=0 ORDER BY p.name",
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
        const relatedQueries = [
          { sql: "SELECT id,name,lead_time_days,reliability_percent FROM suppliers WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 AND COALESCE(active,1)=1 ORDER BY name", args: [] },
          { sql: "SELECT product_id,supplier_id,unit_cost,transport_cost,minimum_order,rappel_percent FROM product_suppliers WHERE active=1", args: [] },
          { sql: "SELECT id,product_id FROM purchase_suggestions WHERE status='Pendiente de validar' ORDER BY id DESC", args: [] },
        ];
        const [suppliers, offers, pendingRows] = typeof db.batch === "function" ? db.batch(relatedQueries) : relatedQueries.map(({ sql }) => db.prepare(sql).all());
        const suppliersById = new Map(suppliers.map((supplier) => [Number(supplier.id), supplier]));
        const offersByProduct = new Map();
        offers.forEach((offer) => {
          const productOffers = offersByProduct.get(Number(offer.product_id)) || [];
          productOffers.push(offer);
          offersByProduct.set(Number(offer.product_id), productOffers);
        });
        const pendingSuggestions = new Map();
        pendingRows.forEach((suggestion) => {
          if (!pendingSuggestions.has(Number(suggestion.product_id))) pendingSuggestions.set(Number(suggestion.product_id), suggestion);
        });
        const createSuggestion = db.prepare("INSERT INTO purchase_suggestions(product_id,suggested_quantity,reason,status,created_at,updated_at) VALUES(?,?,?,?,?,?)");
        const result = rows.map((row) => {
          const available = Number(row.stock) - Number(row.stock_reserved);
          const target = Math.max(Number(row.stock_target || 0), Number(row.stock_safety || 0), Number(row.stock || 0));
          const quantity = Math.max(1, target - available);
          let suggestion = pendingSuggestions.get(Number(row.product_id));
          if (!suggestion) {
            const created = createSuggestion.run(row.product_id, quantity, `Stock disponible ${available} por debajo del mínimo ${row.stock_min || row.min_stock || 0}`, "Pendiente de validar", new Date().toISOString(), new Date().toISOString());
            suggestion = { id: Number(created.lastInsertRowid) };
            pendingSuggestions.set(Number(row.product_id), suggestion);
          }
          const comparisons = (offersByProduct.get(Number(row.product_id)) || []).map((offer) => ({ ...offer, supplier_name: suppliersById.get(Number(offer.supplier_id))?.name || `Proveedor #${offer.supplier_id}`, real_cost: Number(offer.unit_cost || 0) + Number(offer.transport_cost || 0) / Math.max(1, Number(offer.minimum_order || 1)) - (Number(offer.unit_cost || 0) * Number(offer.rappel_percent || 0) / 100) })).sort((a,b) => Number(a.real_cost) - Number(b.real_cost));
          const defaultSupplier = suppliersById.get(Number(row.primary_supplier_id || row.supplier_id));
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
        const clauses = ["COALESCE(o.deleted,0)=0"];
        const args = [];
        if (params.get("from")) { clauses.push("date(COALESCE(o.delivery_date,o.created_at)) >= date(?)"); args.push(params.get("from")); }
        if (params.get("to")) { clauses.push("date(COALESCE(o.delivery_date,o.created_at)) <= date(?)"); args.push(params.get("to")); }
        if (params.get("client_id")) { clauses.push("o.client_id=?"); args.push(Number(params.get("client_id"))); }
        const rows = db.prepare(`SELECT o.id,o.code,o.client_id,o.status,o.amount,o.created_at,o.delivery_date,o.shipping_date,c.name client_name,CASE WHEN o.status='Facturado' OR EXISTS(SELECT 1 FROM invoice_orders io JOIN invoices i ON i.id=io.invoice_id WHERE io.order_id=o.id AND COALESCE(i.status,'')<>'Anulada' AND COALESCE(i.deleted,0)=0) OR EXISTS(SELECT 1 FROM invoices i WHERE i.order_id=o.id AND COALESCE(i.status,'')<>'Anulada' AND COALESCE(i.deleted,0)=0) THEN 1 ELSE 0 END billed,CASE WHEN o.status='Facturado' OR EXISTS(SELECT 1 FROM invoice_orders io JOIN invoices i ON i.id=io.invoice_id WHERE io.order_id=o.id AND COALESCE(i.status,'')<>'Anulada' AND COALESCE(i.deleted,0)=0) OR EXISTS(SELECT 1 FROM invoices i WHERE i.order_id=o.id AND COALESCE(i.status,'')<>'Anulada' AND COALESCE(i.deleted,0)=0) THEN 'Facturado' ELSE 'Sin facturar' END billing_status FROM orders o LEFT JOIN clients c ON c.id=o.client_id WHERE ${clauses.join(" AND ")} ORDER BY date(COALESCE(o.delivery_date,o.created_at)) DESC,o.id DESC`).all(...args);
        return send(res, 200, rows);
      }
      if (t === "billing" && req.method === "POST") {
        try { db.exec(`CREATE TABLE IF NOT EXISTS invoice_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,order_id INTEGER NOT NULL,UNIQUE(invoice_id,order_id),UNIQUE(order_id));`); } catch {}
        const d = await read(req);
        const ids = Array.from(new Set((Array.isArray(d.order_ids) ? d.order_ids : []).map(Number).filter(Number.isInteger)));
        if (!ids.length) return send(res, 400, { error: "Selecciona al menos un pedido" });
        const marks = ids.map(() => "?").join(",");
        const orders = db.prepare(`SELECT o.*,c.name client_name FROM orders o LEFT JOIN clients c ON c.id=o.client_id WHERE o.id IN (${marks}) AND COALESCE(o.deleted,0)=0`).all(...ids);
        if (orders.length !== ids.length) return send(res, 400, { error: "Uno de los pedidos ya no está disponible" });
        const clients = new Set(orders.map((row) => Number(row.client_id || 0)));
        if (clients.size !== 1) return send(res, 400, { error: "Solo se pueden agrupar pedidos del mismo cliente" });
        const billed = db.prepare(`SELECT o.id order_id,COALESCE(i.code,'Factura existente') code FROM orders o LEFT JOIN invoice_orders io ON io.order_id=o.id LEFT JOIN invoices i ON i.id=io.invoice_id AND COALESCE(i.status,'')<>'Anulada' AND COALESCE(i.deleted,0)=0 WHERE o.id IN (${marks}) AND (o.status='Facturado' OR i.id IS NOT NULL OR EXISTS(SELECT 1 FROM invoices bi WHERE bi.order_id=o.id AND COALESCE(bi.status,'')<>'Anulada' AND COALESCE(bi.deleted,0)=0))`).all(...ids);
        if (billed.length) return send(res, 409, { error: `Ya facturado: ${billed.map((row) => row.code).join(", ")}` });
        const total = orders.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const code = `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
        if (!remoteMode) db.exec("BEGIN");
        try {
          const created = db.prepare("INSERT INTO invoices(code,order_id,client_id,amount,status) VALUES(?,?,?,?,?)").run(code, ids[0], orders[0].client_id, total, "Pendiente");
          const invoiceId = Number(created.lastInsertRowid);
          const line = db.prepare("INSERT INTO invoice_lines(invoice_id,product_id,quantity,unit_price,discount,vat,amount) SELECT ?,product_id,quantity,unit_price,discount,vat,amount FROM order_lines WHERE order_id=?");
          const relation = db.prepare("INSERT INTO invoice_orders(invoice_id,order_id) VALUES(?,?)");
          for (const id of ids) {
            relation.run(invoiceId, id);
            line.run(invoiceId, id);
            const hasLines = db.prepare("SELECT 1 FROM order_lines WHERE order_id=? LIMIT 1").get(id);
            if (!hasLines) {
              const legacy = orders.find((row) => Number(row.id) === Number(id));
              if (legacy?.product_id && Number(legacy.quantity || 0) > 0) db.prepare("INSERT INTO invoice_lines(invoice_id,product_id,quantity,unit_price,discount,vat,amount) VALUES(?,?,?,?,?,?,?)").run(invoiceId, legacy.product_id, Number(legacy.quantity), Number(legacy.unit_price || 0), Number(legacy.discount || 0), Number(legacy.vat || 21), Number(legacy.amount || 0));
            }
            db.prepare("UPDATE orders SET status='Facturado',updated_at=? WHERE id=?").run(new Date().toISOString(), id);
          }
          if (!remoteMode) db.exec("COMMIT");
          invalidateReadCache("invoice_lines");
          invalidateReadCache("orders");
          let pdf = null;
          try { pdf = await ensureInvoicePdf(invoiceId, actor); } catch (error) { pdf = { pdf_status: "Pendiente · PDF no generado", pdf_error: error?.message || "No se pudo generar el PDF" }; }
          return send(res, 201, { id: invoiceId, code, amount: total, client_id: orders[0].client_id, order_ids: ids, status: "Pendiente", pdf_status: pdf.pdf_status, pdf_generated_at: pdf.pdf_generated_at || null, share_url: pdf.share_token ? invoiceShareUrl(req, pdf.share_token) : null, pdf_error: pdf.pdf_error || null });
        } catch (error) { if (!remoteMode) { try { db.exec("ROLLBACK"); } catch {} } return send(res, 500, { error: error?.message || "No se pudo crear la factura" }); }
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
        if (!delivery) {
          const existingInvoice = db.prepare("SELECT i.code FROM invoices i LEFT JOIN invoice_orders io ON io.invoice_id=i.id AND io.order_id=? WHERE (i.order_id=? OR io.order_id=?) AND COALESCE(i.status,'')<>'Anulada' AND COALESCE(i.deleted,0)=0 LIMIT 1").get(order.id, order.id, order.id);
          if (order.status === "Facturado" || existingInvoice) return send(res, 409, { error: `El pedido ${order.code} ya está facturado${existingInvoice?.code ? ` en ${existingInvoice.code}` : ""}` });
        }
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
        if (!delivery) db.prepare("INSERT INTO invoice_orders(invoice_id,order_id) VALUES(?,?)").run(newId, order.id);
        db.prepare("UPDATE orders SET status=? WHERE id=?").run(
          delivery ? "Preparado" : "Facturado",
          order.id,
        );
        invalidateReadCache(delivery ? "delivery_note_lines" : "invoice_lines");
        invalidateReadCache("orders");
        let pdf = null;
        if (!delivery) {
          try { pdf = await ensureInvoicePdf(newId, actor); } catch (error) { pdf = { pdf_status: "Pendiente · PDF no generado", pdf_error: error?.message || "No se pudo generar el PDF" }; }
        }
        return send(res, 201, {
          id: newId,
          code,
          order_id: order.id,
          client_id: order.client_id,
          amount: order.amount || 0,
          status: "Pendiente",
          pdf_status: pdf?.pdf_status || null,
          pdf_generated_at: pdf?.pdf_generated_at || null,
          share_url: pdf?.share_token ? invoiceShareUrl(req, pdf.share_token) : null,
          pdf_error: pdf?.pdf_error || null,
        });
      }
      if (t === "delivery_notes" && req.method === "POST" && p[2] === "convert-invoice") {
        const delivery = db.prepare("SELECT * FROM delivery_notes WHERE id=?").get(p[3]);
        if (!delivery) return send(res, 404, { error: "Albarán no encontrado" });
        const order = delivery.order_id
          ? db.prepare("SELECT * FROM orders WHERE id=?").get(delivery.order_id)
          : null;
        const existing = db.prepare(
          "SELECT id,code FROM invoices WHERE COALESCE(deleted,0)=0 AND COALESCE(status,'')<>'Anulada' AND (delivery_note_id=? OR (order_id IS NOT NULL AND order_id=?) OR EXISTS(SELECT 1 FROM invoice_orders io WHERE io.invoice_id=invoices.id AND io.order_id=?)) LIMIT 1",
        ).get(delivery.id, delivery.order_id || 0, delivery.order_id || 0);
        if (existing) return send(res, 409, { error: `La factura ${existing.code} ya existe`, ...existing });
        const code = `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
        const created = db.prepare(
          "INSERT INTO invoices(code,order_id,delivery_note_id,client_id,amount,status) VALUES(?,?,?,?,?,?)",
        ).run(code, delivery.order_id || null, delivery.id, delivery.client_id, order?.amount || 0, "Pendiente");
        const invoiceId = Number(created.lastInsertRowid);
        db.prepare(
          "INSERT INTO invoice_lines(invoice_id,product_id,quantity,unit_price,discount,vat,amount) SELECT ?,d.product_id,d.quantity,COALESCE(o.unit_price,0),COALESCE(o.discount,0),COALESCE(o.vat,21),COALESCE(o.amount,d.quantity*COALESCE(o.unit_price,0)) FROM delivery_note_lines d LEFT JOIN order_lines o ON o.order_id=? AND o.product_id=d.product_id WHERE d.delivery_note_id=?",
        ).run(invoiceId, delivery.order_id || 0, delivery.id);
        if (delivery.order_id) db.prepare("INSERT INTO invoice_orders(invoice_id,order_id) VALUES(?,?)").run(invoiceId, delivery.order_id);
        if (delivery.order_id) db.prepare("UPDATE orders SET status='Facturado',updated_at=? WHERE id=?").run(new Date().toISOString(), delivery.order_id);
        invalidateReadCache("invoice_lines");
        invalidateReadCache("orders");
        let pdf = null;
        try { pdf = await ensureInvoicePdf(invoiceId, actor); } catch (error) { pdf = { pdf_status: "Pendiente · PDF no generado", pdf_error: error?.message || "No se pudo generar el PDF" }; }
        return send(res, 201, { id: invoiceId, code, order_id: delivery.order_id || null, delivery_note_id: delivery.id, client_id: delivery.client_id, amount: order?.amount || 0, status: "Pendiente", pdf_status: pdf.pdf_status, pdf_generated_at: pdf.pdf_generated_at || null, share_url: pdf.share_token ? invoiceShareUrl(req, pdf.share_token) : null, pdf_error: pdf.pdf_error || null });
      }
      if (t === "summary" && req.method === "GET") {
        const query = new URL(req.url, "http://local").searchParams;
        const today = new Date().toISOString().slice(0, 10);
        const from = String(query.get("from") || today).slice(0, 10);
        const to = String(query.get("to") || from).slice(0, 10);
        const invoiceRange = "CAST(COALESCE(deleted,0) AS INTEGER)=0 AND DATE(COALESCE(issue_date,created_at)) BETWEEN ? AND ?";
        const orderRange = "CAST(COALESCE(deleted,0) AS INTEGER)=0 AND DATE(COALESCE(delivery_date,created_at)) BETWEEN ? AND ?";
        const activeProduct = "CAST(COALESCE(deleted,0) AS INTEGER)=0 AND CAST(COALESCE(active,1) AS INTEGER)=1 AND LOWER(COALESCE(product_status,'Activo')) NOT IN ('inactivo','baja','descatalogado')";
        const statements = [
          { sql: `SELECT orders.id,orders.code,orders.client_id,orders.status,orders.amount,orders.created_at,orders.updated_at,orders.delivery_date,orders.preparation_date,orders.shipping_date,orders.address,orders.collection_point_id,orders.urgent,orders.stock_alert,order_client.name AS client_name,order_client.city AS client_city FROM orders LEFT JOIN clients AS order_client ON order_client.id=orders.client_id WHERE CAST(COALESCE(orders.deleted,0) AS INTEGER)=0 ORDER BY orders.id DESC LIMIT 500` },
          { sql: `SELECT id,code,order_id,client_id,collection_point_id,status,expected_delivery_at,preparation_date,address,carrier,packages,incidents,notes FROM shipments WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 ORDER BY id DESC LIMIT 500` },
          { sql: `SELECT id,name,city,address,phone,email,active,external_code FROM clients WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 AND CAST(COALESCE(active,1) AS INTEGER)=1 ORDER BY id DESC` },
          { sql: `SELECT id,title,content,priority,module,record_id,important,completed,created_at,updated_at,created_by,resolution,resolved_at,resolved_by FROM notes WHERE CAST(COALESCE(deleted,0) AS INTEGER)=0 AND CAST(COALESCE(important,0) AS INTEGER)=1 AND CAST(COALESCE(completed,0) AS INTEGER)=0 ORDER BY id DESC LIMIT 6` },
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
          { sql: `SELECT o.id order_id,o.code order_code,o.client_id,c.name client_name,o.delivery_date,o.status,o.urgent FROM orders o LEFT JOIN clients c ON c.id=o.client_id LEFT JOIN shipments s ON s.order_id=o.id AND CAST(COALESCE(s.deleted,0) AS INTEGER)=0 WHERE CAST(COALESCE(o.deleted,0) AS INTEGER)=0 AND LOWER(COALESCE(o.code,'')) NOT GLOB '__test*' AND o.status NOT IN ('Entregado','Cancelado') AND (s.id IS NULL OR s.status IN ('Preparando','Preparado con incidencia')) ORDER BY CASE WHEN o.urgent=1 THEN 0 ELSE 1 END,o.delivery_date,o.id LIMIT 8` },
          { sql: `SELECT grl.id line_id,gr.code receipt_code,gr.supplier_id,s.name supplier_name,gr.receipt_date,grl.product_name_snapshot FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.id=grl.receipt_id LEFT JOIN suppliers s ON s.id=gr.supplier_id WHERE CAST(COALESCE(gr.deleted,0) AS INTEGER)=0 AND CAST(COALESCE(grl.deleted,0) AS INTEGER)=0 AND COALESCE(grl.location_verified_status,'Pendiente')='Pendiente' AND COALESCE(gr.status,'') NOT IN ('Cancelada','Anulada') ORDER BY gr.receipt_date DESC,grl.id DESC LIMIT 8` },
          { sql: `SELECT i.id invoice_id,i.code invoice_code,i.client_id,c.name client_name,i.amount,i.due_date,i.status FROM invoices i LEFT JOIN clients c ON c.id=i.client_id WHERE CAST(COALESCE(i.deleted,0) AS INTEGER)=0 AND COALESCE(i.status,'Pendiente') NOT IN ('Cobrada','Pagada','Anulada') AND date(COALESCE(i.due_date,i.issue_date,i.created_at)) < date(?) ORDER BY date(COALESCE(i.due_date,i.issue_date,i.created_at)) ASC,i.id ASC LIMIT 8`, args: [today] },
          { sql: `SELECT id,company_name,contact_name,email,created_at,status FROM web_registrations WHERE COALESCE(status,'Pendiente de validar')='Pendiente de validar' ORDER BY id DESC LIMIT 8` },
        ];
        const results = queryBatch(statements);
        const rowsAt = (index) => results[index] || [];
        const totalAt = (index) => Number(rowsAt(index)[0]?.total || 0);
        const orders = rowsAt(0);
        const shipments = rowsAt(1);
        const clients = rowsAt(2);
        const importantNotes = rowsAt(3);
        const alerts = [
          ...rowsAt(14).map((row) => ({ type: "preparation", severity: Number(row.urgent || 0) === 1 ? "critical" : "warning", title: Number(row.urgent || 0) === 1 ? "Pedido urgente sin cerrar" : "Preparación pendiente", detail: `${row.order_code || "Pedido"} · ${row.client_name || "Cliente sin asignar"}${row.delivery_date ? ` · entrega ${row.delivery_date}` : ""}`, module: "Pedidos", record_id: row.order_id, order_id: row.order_id, order_code: row.order_code })),
          ...rowsAt(15).map((row) => ({ type: "location", severity: "warning", title: "Entrada sin ubicación verificada", detail: `${row.receipt_code || "Entrada"} · ${row.product_name_snapshot || "Producto pendiente"}${row.supplier_name ? ` · ${row.supplier_name}` : ""}`, module: "Entradas", record_id: row.line_id })),
          ...rowsAt(16).map((row) => ({ type: "invoice", severity: "critical", title: "Factura vencida", detail: `${row.invoice_code || "Factura"} · ${row.client_name || "Cliente sin asignar"} · ${Number(row.amount || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`, module: "Facturas", record_id: row.invoice_id })),
          ...rowsAt(17).map((row) => ({ type: "web-client", severity: "info", title: "Nuevo cliente web por revisar", detail: `${row.company_name} · ${row.contact_name || row.email}`, module: "Clientes", record_id: row.id })),
        ];
        return send(res, 200, {
          summary: {
            sales: totalAt(4),
            openOrders: totalAt(5),
            receivables: totalAt(6),
            criticalStock: totalAt(7),
            products: totalAt(8),
            clients: clients.length,
            orders: totalAt(9),
            invoices: totalAt(10),
            deliveryNotes: totalAt(11),
            payments: totalAt(12),
            suppliers: totalAt(13),
            reports: totalAt(9) + totalAt(10),
          },
          orders,
          shipments,
          clients,
          importantNotes,
          alerts,
        });
      }
      if (!tables.has(t))
        return send(res, 404, { error: "Recurso no encontrado" });
      if (["PUT", "DELETE"].includes(req.method) && (!p[2] || !Number.isInteger(Number(p[2]))))
        return send(res, 400, { error: "Falta un identificador válido" });
      if (req.method === "GET") {
        const query = new URL(req.url, "http://local").searchParams;
        const includeDeleted = query.get("include_deleted") === "1";
        const includeInactive = query.get("include_inactive") === "1";
        const isLookup = query.get("view") === "lookup";
        const isPublicCatalog = t === "products" && query.get("view") === "public";
        const parsePageValue = (value, fallback) => {
          const parsed = Number.parseInt(String(value || ""), 10);
          return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
        };
        const limitValue = query.has("limit") ? Math.min(parsePageValue(query.get("limit"), 0), 5000) : null;
        const offsetValue = query.has("offset") ? parsePageValue(query.get("offset"), 0) : 0;
        if (p[2] && Number.isInteger(Number(p[2]))) {
          const source = t === "orders"
            ? `orders LEFT JOIN clients AS order_client ON order_client.id=orders.client_id`
            : t === "shipments"
              ? `shipments LEFT JOIN orders AS shipment_order ON shipment_order.id=shipments.order_id`
              : t;
          const selection = t === "orders"
            ? "orders.*,order_client.name AS client_name,order_client.city AS client_city,CASE WHEN orders.status='Facturado' OR EXISTS(SELECT 1 FROM invoice_orders io JOIN invoices bi ON bi.id=io.invoice_id WHERE io.order_id=orders.id AND COALESCE(bi.status,'')<>'Anulada' AND COALESCE(bi.deleted,0)=0) OR EXISTS(SELECT 1 FROM invoices bi WHERE bi.order_id=orders.id AND COALESCE(bi.status,'')<>'Anulada' AND COALESCE(bi.deleted,0)=0) THEN 'Facturado' ELSE 'Sin facturar' END AS billing_status"
            : t === "shipments"
              ? "shipments.*,(SELECT shipping_date FROM orders WHERE orders.id=shipments.order_id) AS shipping_date"
            : p[2] ? "*" : listSelectFor(t);
          const tableReference = t === "orders" ? "orders" : t;
          const deletedClause = includeDeleted || !hasColumn(tableReference, "deleted") ? "" : ` AND CAST(COALESCE(${tableReference}.deleted,0) AS INTEGER)=0`;
          const row = db.prepare(`SELECT ${selection} FROM ${source} WHERE ${tableReference}.id=?${deletedClause}`).get(Number(p[2]));
          if (!row) return send(res, 404, { error: "Registro no encontrado" });
          return send(res, 200, t === "shipments" ? attachShipmentTrackingToken(row) : row);
        }
        const cached = !isLookup && limitValue === null && offsetValue === 0
          ? cachedRows(t, includeDeleted, includeInactive)
          : null;
        if (cached) return send(res, 200, t === "shipments" ? cached.map(attachShipmentTrackingToken) : cached);
        const source = t === "orders"
          ? `orders LEFT JOIN clients AS order_client ON order_client.id=orders.client_id`
          : t === "shipments"
            ? `shipments LEFT JOIN orders AS shipment_order ON shipment_order.id=shipments.order_id`
            : t;
        const selection = isPublicCatalog
          ? "products.id,products.name,products.family,products.category,products.subfamily,products.brand,products.format,products.sku,products.description,products.photo_url,products.photo_thumbnail_url,products.photo_web_url"
          : isLookup
          ? lookupSelectFor(t)
          : t === "orders"
            ? "orders.*,order_client.name AS client_name,order_client.city AS client_city,CASE WHEN orders.status='Facturado' OR EXISTS(SELECT 1 FROM invoice_orders io JOIN invoices bi ON bi.id=io.invoice_id WHERE io.order_id=orders.id AND COALESCE(bi.status,'')<>'Anulada' AND COALESCE(bi.deleted,0)=0) OR EXISTS(SELECT 1 FROM invoices bi WHERE bi.order_id=orders.id AND COALESCE(bi.status,'')<>'Anulada' AND COALESCE(bi.deleted,0)=0) THEN 'Facturado' ELSE 'Sin facturar' END AS billing_status"
            : t === "shipments"
              ? "shipments.*,(SELECT shipping_date FROM orders WHERE orders.id=shipments.order_id) AS shipping_date"
            : listSelectFor(t);
        const filters = [];
        if (!includeDeleted && hasColumn(t, "deleted")) filters.push(`CAST(COALESCE(${t === "orders" ? "orders" : t}.deleted,0) AS INTEGER)=0`);
        if (isPublicCatalog) {
          filters.push("CAST(COALESCE(products.active,1) AS INTEGER)=1", "LOWER(COALESCE(products.product_status,'Activo')) NOT IN ('inactivo','baja','descatalogado')", "TRIM(COALESCE(products.name,''))<>''", "LOWER(products.name) NOT GLOB '__test*'", "LOWER(products.name) NOT GLOB '__dbg*'", "LOWER(products.name) NOT GLOB '__debug*'", "LOWER(products.name) NOT GLOB 'demo*'");
        } else if (!includeInactive && ["suppliers", "clients", "products"].includes(t)) {
          filters.push(t === "products"
            ? `CAST(COALESCE(products.active,1) AS INTEGER)=1 AND LOWER(COALESCE(products.product_status,'Activo')) NOT IN ('inactivo','baja','descatalogado')`
            : `CAST(COALESCE(${t}.active,1) AS INTEGER)=1`);
        }
        const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
        const pagination = limitValue === null ? "" : ` LIMIT ${limitValue} OFFSET ${offsetValue}`;
        const orderBy = isPublicCatalog
          ? "CASE WHEN TRIM(COALESCE(products.photo_web_url,''))<>'' THEN 0 ELSE 1 END, products.id DESC"
          : `${t === "orders" ? "orders.id" : t === "shipments" ? "shipments.id" : "id"} DESC`;
        const rows = db.prepare(`SELECT ${selection} FROM ${source} ${where} ORDER BY ${orderBy}${pagination}`).all();
        const responseRows = t === "shipments"
          ? rows.map(attachShipmentTrackingToken)
          : rows;
        return send(
          res,
          200,
          !isLookup && limitValue === null && offsetValue === 0
            ? storeRows(t, includeDeleted, includeInactive, responseRows)
            : responseRows,
        );
      }
      const d = await read(req);
      let pendingProductPhoto = null;
      if (t === "products" && cloudinaryReady() && String(d.photo_data || "").startsWith("data:image/")) {
        pendingProductPhoto = String(d.photo_data);
        delete d.photo_data;
      }
      const reopenPreparation = Boolean(d.reopen_preparation);
      const updateClientAddress = Boolean(d.update_client_address);
      delete d.reopen_preparation;
      delete d.update_client_address;
      if (req.method === "POST") {
        if (t === "order_lines" && d.order_id) {
          const parentOrder = db.prepare("SELECT status FROM orders WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(Number(d.order_id));
          if (!parentOrder) return send(res, 404, { error: "Pedido no encontrado" });
          if (["Enviado", "En reparto", "Entregado", "Cancelado"].includes(String(parentOrder.status || ""))) return send(res, 409, { error: "No se pueden añadir líneas a un pedido enviado o cerrado" });
        }
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
        invalidateRelatedReadCaches(t);
        const now = new Date().toISOString();
        if (t === "scheduled_tasks") {
          const title = String(d.title || "").trim();
          const actionText = String(d.action_text || "").trim();
          const scheduleType = String(d.schedule_type || "Unica");
          const recurrence = String(d.recurrence || "").trim();
          if (!title || !actionText) return send(res, 400, { error: "Indica el título y la acción de la tarea" });
          const duplicate = db.prepare("SELECT id FROM scheduled_tasks WHERE LOWER(TRIM(title))=LOWER(TRIM(?)) AND LOWER(TRIM(action_text))=LOWER(TRIM(?)) AND schedule_type=? AND COALESCE(recurrence,'')=COALESCE(?, '') AND status='Activa' LIMIT 1").get(title, actionText, scheduleType, recurrence);
          if (duplicate) return send(res, 409, { error: "Ya existe una tarea activa con la misma acción y programación", duplicate_id: duplicate.id });
          d.title = title;
          d.action_text = actionText;
          d.schedule_type = scheduleType;
          d.recurrence = recurrence;
          d.status = d.status || "Activa";
        }
        if (d.created_at === undefined) d.created_at = now;
        if (d.updated_at === undefined) d.updated_at = now;
        if (t === "orders" && !d.created_by) d.created_by = actor;
        if (t === "notes" && !d.created_by) d.created_by = actor;
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
        if (t === "payments") {
          const amount = Number(d.amount);
          if (!Number.isFinite(amount) || amount <= 0) return send(res, 400, { error: "El importe del cobro debe ser mayor que cero" });
          if (!d.invoice_id) return send(res, 400, { error: "Selecciona una factura para registrar el cobro" });
          const invoice = db.prepare("SELECT amount,status FROM invoices WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(d.invoice_id);
          if (!invoice) return send(res, 400, { error: "Factura no encontrada" });
          if (String(invoice.status || "") === "Anulada") return send(res, 400, { error: "No se puede cobrar una factura anulada" });
          const paid = db.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE invoice_id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(d.invoice_id).total;
          const nextPaid = Number(paid) + amount;
          if (nextPaid > Number(invoice.amount || 0) + 0.01) return send(res, 400, { error: `El cobro supera el importe pendiente (${Math.max(0, Number(invoice.amount || 0) - Number(paid)).toFixed(2)} €)` });
        }
        if (t === "expenses") {
          const amount = Number(d.amount);
          if (!String(d.expense_date || "").trim()) return send(res, 400, { error: "Indica la fecha del gasto" });
          if (!Number.isFinite(amount) || amount < 0) return send(res, 400, { error: "Indica un importe válido" });
          const attachmentData = String(d.attachment_data || "");
          if (attachmentData && !attachmentData.startsWith("data:")) return send(res, 400, { error: "El justificante no tiene un formato válido" });
          if (attachmentData.length > 11500000) return send(res, 400, { error: "El justificante ocupa demasiado. Sube una imagen de hasta 8 MB" });
          d.status = "Pendiente";
          d.created_by = String(d.created_by || actor).trim() || actor;
        }
        if (t === "returns") {
          const quantity = Number(d.quantity);
          const productId = Number(d.product_id);
          if (!productId || !Number.isFinite(quantity) || quantity <= 0) return send(res, 400, { error: "La devolución debe indicar un producto y una cantidad mayor que cero" });
          const product = db.prepare("SELECT id FROM products WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(productId);
          if (!product) return send(res, 400, { error: "Producto no encontrado" });
          const disposition = normalizeReturnDisposition(d);
          if (disposition.error) return send(res, 400, { error: disposition.error });
          Object.assign(d, disposition.values);
          const orderId = Number(d.order_id || 0);
          const shipmentId = Number(d.shipment_id || 0);
          const orderLineId = Number(d.order_line_id || 0);
          const order = orderId ? db.prepare("SELECT id,client_id FROM orders WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(orderId) : null;
          if (orderId && !order) return send(res, 400, { error: "El pedido relacionado no existe" });
          const shipment = shipmentId ? db.prepare("SELECT id,order_id,client_id FROM shipments WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(shipmentId) : null;
          if (shipmentId && !shipment) return send(res, 400, { error: "El envío relacionado no existe" });
          if (shipment && orderId && Number(shipment.order_id) !== orderId) return send(res, 400, { error: "El envío no pertenece al pedido indicado" });
          const line = orderLineId ? db.prepare("SELECT id,order_id,product_id,quantity FROM order_lines WHERE id=?").get(orderLineId) : null;
          if (orderLineId && !line) return send(res, 400, { error: "La línea del pedido no existe" });
          if (line && orderId && Number(line.order_id) !== orderId) return send(res, 400, { error: "La línea no pertenece al pedido indicado" });
          if (line && Number(line.product_id) !== productId) return send(res, 400, { error: "La línea no corresponde al producto devuelto" });
          if (line && Number(line.quantity || 0) > 0 && quantity > Number(line.quantity)) return send(res, 400, { error: "La devolución supera la cantidad de la línea del pedido" });
          d.order_id = orderId || line?.order_id || shipment?.order_id || null;
          d.shipment_id = shipmentId || null;
          d.order_line_id = orderLineId || null;
          d.client_id = d.client_id || order?.client_id || shipment?.client_id || null;
          d.status = d.status || "Pendiente";
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
        if (t === "orders" && d.code) {
          const existingOrder = db.prepare("SELECT * FROM orders WHERE code=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(String(d.code));
          if (existingOrder) return send(res, 200, { ...existingOrder, idempotent: true });
        }
        const keys = Object.keys(d),
          r = db
            .prepare(
              `INSERT INTO ${t} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
            )
            .run(...keys.map((k) => d[k]));
        if (t === "products" && pendingProductPhoto) {
          try {
            const uploaded = await uploadProductImage(pendingProductPhoto, Number(r.lastInsertRowid), d.name);
            if (uploaded) db.prepare("UPDATE products SET photo_url=?,photo_public_id=?,photo_thumbnail_url=?,photo_web_url=?,photo_bytes=?,photo_width=?,photo_height=?,photo_format=? WHERE id=?").run(uploaded.photo_url, uploaded.photo_public_id, uploaded.photo_thumbnail_url, uploaded.photo_web_url, uploaded.photo_bytes, uploaded.photo_width, uploaded.photo_height, uploaded.photo_format, Number(r.lastInsertRowid));
          } catch {
            db.prepare("UPDATE products SET photo_data=? WHERE id=?").run(pendingProductPhoto, Number(r.lastInsertRowid));
          }
        }
        if (t === "orders") {
          // La notificación de alta debe apuntar al pedido concreto para
          // que el clic abra directamente su modal, no el listado general.
          recordAudit(actor, "POST", `orders/${Number(r.lastInsertRowid)}`, "Alta", `${d.code || "Pedido nuevo"} · pedido registrado`);
        }
        if (t === "expenses") {
          recordAudit(actor, "POST", `expenses/${Number(r.lastInsertRowid)}`, "Registrar gasto", `${d.code || "Gasto nuevo"} · ${Number(d.amount || 0).toFixed(2)} € · ${d.category || "Otros"}`);
        }
        if (t === "notes" && String(d.module || "") === "Preparación de pedidos" && Number(d.important || 0) === 1) {
          recordAudit(actor, "POST", `preparation-incidents/${Number(r.lastInsertRowid)}`, "Incidencia preparación", JSON.stringify({ note_id: Number(r.lastInsertRowid), order_id: Number(d.record_id || 0) || null, content: String(d.content || d.title || "Incidencia de preparación") }));
        }
        if (t === "payments" && d.invoice_id) {
          const invoice = db.prepare("SELECT amount FROM invoices WHERE id=?").get(d.invoice_id);
          const paid = db.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE invoice_id=?").get(d.invoice_id).total;
          db.prepare("UPDATE invoices SET status=? WHERE id=?").run(Number(paid) >= Number(invoice?.amount || 0) ? "Cobrada" : "Parcial", d.invoice_id);
        }
        if (t === "orders" && d.product_id && d.quantity)
          db.prepare(
            "UPDATE products SET stock_reserved=COALESCE(stock_reserved,0)+? WHERE id=?",
          ).run(Number(d.quantity), Number(d.product_id));
        if (t === "orders" && orderLines) {
          for (const line of orderLines) {
            db.prepare("INSERT INTO order_lines(order_id,product_id,quantity,quantity_requested,quantity_unit,units_factor,unit_price,discount,vat,amount,prepared,prepared_quantity,preparation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(Number(r.lastInsertRowid), line.product_id, line.quantity, line.quantity_requested, line.quantity_unit, line.units_factor, line.unit_price, line.discount, line.vat, line.amount, 0, 0, "Pendiente", now, now);
            if (line.product_id !== Number(d.product_id)) db.prepare("UPDATE products SET stock_reserved=COALESCE(stock_reserved,0)+? WHERE id=?").run(line.quantity, line.product_id);
          }
        }
        if (t === "orders") {
          const client = d.client_id ? db.prepare("SELECT address,opening_time,closing_time FROM clients WHERE id=?").get(Number(d.client_id)) : null;
          const shippingLocation = d.collection_point_id
            ? db.prepare("SELECT address,opening_time,closing_time FROM collection_points WHERE id=? AND (client_id=? OR client_id IS NULL)").get(Number(d.collection_point_id), Number(d.client_id || 0))
            : null;
          const shipmentCode = `ENV-${new Date().getFullYear()}-${String(Date.now()).slice(-7)}`;
          const createdShipment = db.prepare("INSERT INTO shipments(code,order_id,client_id,collection_point_id,status,preparation_date,urgent,expected_delivery_at,address,packages,incidents,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(shipmentCode, Number(r.lastInsertRowid), d.client_id || null, d.collection_point_id || null, "Preparando", d.preparation_date || null, Number(d.urgent || 0), d.shipping_date || d.delivery_date || null, shippingLocation?.address || d.address || client?.address || null, 1, "", d.urgent ? "PEDIDO URGENTE · Revisar todas las líneas antes de preparar." : "Preparación pendiente de revisión.", now, now);
          db.prepare("UPDATE shipments SET delivery_window_start=?,delivery_window_end=? WHERE id=?").run(d.delivery_window_start || shippingLocation?.opening_time || client?.opening_time || null, d.delivery_window_end || shippingLocation?.closing_time || client?.closing_time || null, Number(createdShipment.lastInsertRowid));
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
        if (t === "invoice_lines" && d.invoice_id) markInvoicePdfStale(d.invoice_id);
        if (t === "order_lines" && d.order_id) markCommercialDocumentPdfStale("order", d.order_id);
        if (t === "quote_lines" && d.quote_id) markCommercialDocumentPdfStale("quote", d.quote_id);
        const createdRecord = { id: Number(r.lastInsertRowid), ...d };
        if (t === "shipments") createdRecord.public_tracking_token = ensureShipmentTrackingToken(Number(r.lastInsertRowid));
        if (t === "products") Object.assign(createdRecord, db.prepare("SELECT photo_url,photo_public_id,photo_thumbnail_url,photo_web_url,photo_bytes,photo_width,photo_height,photo_format FROM products WHERE id=?").get(Number(r.lastInsertRowid)) || {});
        if (t === "orders") createdRecord.stock_alerts = [...stockShortages, ...stockAlerts];
        if (t === "orders" || t === "quotes") {
          try {
            const pdf = await ensureCommercialDocumentPdf(t === "orders" ? "order" : "quote", Number(r.lastInsertRowid), actor);
            Object.assign(createdRecord, { pdf_public_id: pdf.pdf_public_id, pdf_url: pdf.pdf_url, pdf_bytes: pdf.pdf_bytes, pdf_generated_at: pdf.pdf_generated_at, pdf_status: pdf.pdf_status, share_token: pdf.share_token, share_url: documentShareUrl(req, t === "orders" ? "order" : "quote", pdf.share_token) });
          } catch (error) {
            createdRecord.pdf_status = "Pendiente · PDF no generado";
            createdRecord.pdf_error = error?.message || "No se pudo generar el PDF";
          }
        }
        return send(res, 201, createdRecord);
      }
      if (req.method === "DELETE") {
        invalidateRelatedReadCaches(t);
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
        const result = db.prepare(`UPDATE ${t} SET deleted=1,deleted_at=?,deleted_by=?,updated_at=? WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0`).run(now, actor, now, p[2]);
        if (!result.changes) return send(res, 404, { error: "Registro no encontrado" });
        if (t === "invoice_lines") {
          const line = db.prepare("SELECT invoice_id FROM invoice_lines WHERE id=?").get(Number(p[2]));
          if (line?.invoice_id) markInvoicePdfStale(line.invoice_id);
        }
        if (t === "order_lines") {
          const line = db.prepare("SELECT order_id FROM order_lines WHERE id=?").get(Number(p[2]));
          if (line?.order_id) markCommercialDocumentPdfStale("order", line.order_id);
        }
        if (t === "quote_lines") {
          const line = db.prepare("SELECT quote_id FROM quote_lines WHERE id=?").get(Number(p[2]));
          if (line?.quote_id) markCommercialDocumentPdfStale("quote", line.quote_id);
        }
        if (t === "invoices") invalidateReadCache("invoices");
        return send(res, 200, { ok: true, deleted: 1 });
      }
      if (req.method === "PUT") {
        if (t === "products" && String(d.sku || "").trim()) {
          const duplicate = db.prepare("SELECT id FROM products WHERE LOWER(TRIM(COALESCE(sku,'')))=LOWER(TRIM(?)) AND id<>? AND CAST(COALESCE(deleted,0) AS INTEGER)=0 LIMIT 1").get(String(d.sku), Number(p[2]));
          if (duplicate) return send(res, 409, { error: "Ya existe un producto con ese SKU" });
        }
        invalidateRelatedReadCaches(t);
        const currentRecord = db.prepare(`SELECT id FROM ${t} WHERE id=?`).get(Number(p[2]));
        if (!currentRecord) return send(res, 404, { error: "Registro no encontrado" });
        if (t === "orders") {
          const currentOrder = db.prepare("SELECT status FROM orders WHERE id=?").get(Number(p[2]));
          const terminal = ["Enviado", "En reparto", "Entregado", "Cancelado"].includes(String(currentOrder?.status || ""));
          const allowedAfterClose = new Set(["billing_status", "billed", "updated_at"]);
          if (terminal && Object.keys(d).some((key) => !allowedAfterClose.has(key))) return send(res, 409, { error: "Los pedidos enviados o cerrados no se pueden editar" });
        }
        if (t === "goods_receipts") {
          const supplierId = Number(d.supplier_id || 0);
          const warehouseId = Number(d.warehouse_id || 0);
          if (d.supplier_id !== undefined && !db.prepare("SELECT id FROM suppliers WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(supplierId)) return send(res, 400, { error: "El proveedor de la entrada no existe" });
          if (d.warehouse_id !== undefined && !db.prepare("SELECT id FROM warehouses WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(warehouseId)) return send(res, 400, { error: "El almacén de la entrada no existe" });
          if (d.purchase_order_id && !db.prepare("SELECT id FROM purchase_orders WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(Number(d.purchase_order_id))) return send(res, 400, { error: "El pedido de compra relacionado no existe" });
          if (d.purchase_invoice_id && !db.prepare("SELECT id FROM invoices WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(Number(d.purchase_invoice_id))) return send(res, 400, { error: "La factura de compra relacionada no existe" });
        }
        if (t === "products" && pendingProductPhoto) {
          try {
            const uploaded = await uploadProductImage(pendingProductPhoto, Number(p[2]), d.name || db.prepare("SELECT name FROM products WHERE id=?").get(Number(p[2]))?.name);
            if (uploaded) Object.assign(d, uploaded);
            else Object.assign(d, { photo_data: pendingProductPhoto, photo_url: null, photo_public_id: null, photo_thumbnail_url: null, photo_web_url: null, photo_bytes: 0, photo_width: 0, photo_height: 0, photo_format: null });
          } catch {
            Object.assign(d, { photo_data: pendingProductPhoto, photo_url: null, photo_public_id: null, photo_thumbnail_url: null, photo_web_url: null, photo_bytes: 0, photo_width: 0, photo_height: 0, photo_format: null });
          }
        }
        d.updated_at = new Date().toISOString();
        for (const key of ["stock_alerts", "client_name", "client_city", "billed", "billing_status", "available_stock", "stock_status", "product_name", "warehouse_name"]) delete d[key];
        if (t === "returns") {
          const currentReturn = db.prepare("SELECT * FROM returns WHERE id=?").get(Number(p[2]));
          if (!currentReturn) return send(res, 404, { error: "Devolución no encontrada" });
          if (currentReturn.stock_applied_at && ["quantity", "product_id", "lot_id", "lot_code_snapshot", "expiry_date_snapshot", "stock_destination"].some((field) => d[field] !== undefined)) {
            return send(res, 409, { error: "Una devolución ya aplicada no puede cambiar de cantidad, producto ni destino" });
          }
          const disposition = normalizeReturnDisposition({ ...currentReturn, ...d });
          if (disposition.error) return send(res, 400, { error: disposition.error });
          Object.assign(d, disposition.values);
          const nextStatus = String(d.status || currentReturn?.status || "Pendiente");
          const acceptedStatuses = ["Recibida", "Aprobada", "Aceptada"];
          if (acceptedStatuses.includes(nextStatus) && !currentReturn?.stock_applied_at) {
            const quantity = Number(d.quantity ?? currentReturn?.quantity ?? 0);
            const productId = Number(d.product_id ?? currentReturn?.product_id ?? 0);
            if (!Number.isFinite(quantity) || quantity <= 0 || !productId) return send(res, 400, { error: "La devolución debe tener un producto y una cantidad válida" });
            const product = db.prepare("SELECT id FROM products WHERE id=? AND CAST(COALESCE(deleted,0) AS INTEGER)=0").get(productId);
            if (!product) return send(res, 400, { error: "Producto no encontrado" });
            const appliedAt = new Date().toISOString();
            const stockDestination = String(d.stock_destination || currentReturn?.stock_destination || "Stock disponible").trim();
            const stockEffect = stockDestination === "Stock disponible" ? quantity : 0;
            const quarantineQuantity = stockDestination === "Cuarentena" ? quantity : 0;
            const wasteQuantity = stockDestination === "Merma" ? quantity : 0;
            const lotId = Number(d.lot_id ?? currentReturn?.lot_id ?? 0) || null;
            const lot = lotId ? db.prepare("SELECT * FROM product_lots WHERE id=? AND product_id=?").get(lotId, productId) : null;
            if (lot) {
              db.prepare("UPDATE product_lots SET quantity=COALESCE(quantity,0)+?,quarantine_quantity=COALESCE(quarantine_quantity,0)+?,waste_quantity=COALESCE(waste_quantity,0)+?,updated_at=? WHERE id=?").run(stockEffect, quarantineQuantity, wasteQuantity, appliedAt, lot.id);
              d.lot_id = Number(lot.id);
            } else if (stockEffect || quarantineQuantity || wasteQuantity) {
              const lotCode = String(d.lot_code_snapshot || currentReturn?.lot_code_snapshot || `DEV-${d.code || currentReturn?.code || p[2]}`).trim();
              const createdLot = db.prepare("INSERT INTO product_lots(product_id,lot_code,quantity,quarantine_quantity,waste_quantity,expiry_date,received_date,warehouse_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(productId, lotCode, stockEffect, quarantineQuantity, wasteQuantity, d.expiry_date_snapshot ?? currentReturn?.expiry_date_snapshot ?? null, appliedAt.slice(0, 10), d.warehouse_id ?? currentReturn?.warehouse_id ?? null, appliedAt, appliedAt);
              d.lot_id = Number(createdLot.lastInsertRowid);
              d.lot_code_snapshot = lotCode;
            }
            db.prepare("UPDATE products SET stock=COALESCE(stock,0)+? WHERE id=?").run(stockEffect, productId);
            const movementNotes = `${d.reason || currentReturn?.reason || "Devolución de cliente aceptada"} · Destino: ${stockDestination}${d.quarantine_reason ? ` · Motivo: ${d.quarantine_reason}` : ""}`;
            db.prepare("INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity,stock_effect,reference,notes,movement_date,created_by) VALUES(?,?,?,?,?,?,?,?,?)").run(productId, d.warehouse_id ?? currentReturn?.warehouse_id ?? null, stockDestination === "Stock disponible" ? "Devolución" : stockDestination, quantity, stockEffect, d.code || currentReturn?.code || `DEV-${p[2]}`, movementNotes, appliedAt, actor);
            d.stock_applied_at = appliedAt;
            d.stock_applied_by = actor;
            d.stock_applied_quantity = stockEffect;
            d.authorized_by = d.authorized_by || actor;
            d.authorized_at = d.authorized_at || appliedAt;
            recordAudit(actor, "PUT", `returns/${Number(p[2])}`, "Aplicar devolución", JSON.stringify({ product_id: productId, quantity, stock_destination: stockDestination, stock_effect: stockEffect, status: nextStatus }));
          }
        }
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
          if (oldPurchase && oldPurchase.status !== "Recibida" && !oldPurchase.stock_applied_at) {
            const lines = db.prepare("SELECT * FROM purchase_order_lines WHERE purchase_order_id=?").all(p[2]);
            for (const line of lines) {
              db.prepare("INSERT INTO inventory_movements(product_id,movement_type,quantity,reference,notes) VALUES(?,?,?,?,?)").run(line.product_id, "Entrada", line.quantity, oldPurchase.code, "Recepción de compra");
              db.prepare("UPDATE products SET stock=COALESCE(stock,0)+?,cost_price=? WHERE id=?").run(Number(line.quantity), Number(line.unit_cost || 0), line.product_id);
            }
            d.stock_applied_at = new Date().toISOString();
            d.stock_applied_by = actor;
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
          }
        }
        if (t === "orders") {
          const linkedShipment = db.prepare("SELECT id,delivery_window_start,delivery_window_end FROM shipments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(p[2]);
          if (linkedShipment) {
            const currentOrder = db.prepare("SELECT client_id,collection_point_id,address,delivery_date,preparation_date,shipping_date,urgent FROM orders WHERE id=?").get(p[2]);
            const clientId = d.client_id ?? currentOrder?.client_id ?? null;
            const collectionPointId = d.collection_point_id ?? currentOrder?.collection_point_id ?? null;
            const client = clientId
              ? db.prepare("SELECT address,opening_time,closing_time FROM clients WHERE id=?").get(clientId)
              : null;
            const shippingLocation = collectionPointId
              ? db.prepare("SELECT address,opening_time,closing_time FROM collection_points WHERE id=? AND (client_id=? OR client_id IS NULL)").get(Number(collectionPointId), Number(clientId || 0))
              : null;
            const shipmentAddress = shippingLocation?.address || d.address || client?.address || currentOrder?.address || null;
            db.prepare("UPDATE shipments SET client_id=?,collection_point_id=?,preparation_date=?,urgent=?,expected_delivery_at=?,address=?,delivery_window_start=?,delivery_window_end=? WHERE id=?").run(
              clientId,
              collectionPointId,
              d.preparation_date ?? currentOrder?.preparation_date ?? null,
              Number(d.urgent ?? currentOrder?.urgent ?? 0),
              d.shipping_date ?? currentOrder?.shipping_date ?? d.delivery_date ?? currentOrder?.delivery_date ?? null,
              shipmentAddress,
              d.delivery_window_start ?? shippingLocation?.opening_time ?? client?.opening_time ?? linkedShipment.delivery_window_start ?? null,
              d.delivery_window_end ?? shippingLocation?.closing_time ?? client?.closing_time ?? linkedShipment.delivery_window_end ?? null,
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
          if (d.warehouse_location !== undefined && String(d.warehouse_location || "").trim() !== String(previous?.warehouse_location || "").trim()) {
            const changedAt = new Date().toISOString();
            db.prepare("INSERT INTO product_location_history(product_id,previous_location,current_location,changed_by,changed_at,source) VALUES(?,?,?,?,?,?)").run(Number(p[2]), String(previous?.warehouse_location || ""), String(d.warehouse_location || "").trim().toUpperCase(), actor, changedAt, "Nota de carga");
            d.warehouse_location = String(d.warehouse_location || "").trim().toUpperCase();
            d.picking_order = d.picking_order === undefined ? Number(previous?.picking_order || 0) : d.picking_order;
          }
        }
        if (t === "shipments" && d.address !== undefined) {
          const existingShipment = db.prepare("SELECT order_id,client_id,collection_point_id,delivery_city FROM shipments WHERE id=?").get(Number(p[2]));
          const deliveryAddress = String(d.address || "").trim();
          const deliveryCity = d.delivery_city === undefined ? String(existingShipment?.delivery_city || "").trim() : String(d.delivery_city || "").trim();
          const deliveryLatitude = d.latitude === undefined || d.latitude === null || d.latitude === "" ? null : Number(d.latitude);
          const deliveryLongitude = d.longitude === undefined || d.longitude === null || d.longitude === "" ? null : Number(d.longitude);
          const deliveryGeocodedAt = String(d.geocoded_at || "").trim() || null;
          const deliveryGeocodingStatus = String(d.geocoding_status || "Pendiente").trim();
          const changedAt = new Date().toISOString();
          if (existingShipment?.collection_point_id) {
            db.prepare("UPDATE collection_points SET address=?,city=?,latitude=?,longitude=?,geocoded_at=?,geocoding_status=? WHERE id=?").run(deliveryAddress, deliveryCity, deliveryLatitude, deliveryLongitude, deliveryGeocodedAt, deliveryGeocodingStatus, Number(existingShipment.collection_point_id));
          }
          if (existingShipment?.order_id) {
            db.prepare("UPDATE orders SET address=?,delivery_city=?,updated_at=? WHERE id=?").run(deliveryAddress, deliveryCity, changedAt, Number(existingShipment.order_id));
          }
          if (updateClientAddress && existingShipment?.client_id) {
            if (hasColumn("clients", "updated_at")) {
              db.prepare("UPDATE clients SET address=?,city=?,latitude=?,longitude=?,geocoded_at=?,geocoding_status=?,updated_at=? WHERE id=?").run(deliveryAddress, deliveryCity, deliveryLatitude, deliveryLongitude, deliveryGeocodedAt, deliveryGeocodingStatus, changedAt, Number(existingShipment.client_id));
            } else {
              db.prepare("UPDATE clients SET address=?,city=?,latitude=?,longitude=?,geocoded_at=?,geocoding_status=? WHERE id=?").run(deliveryAddress, deliveryCity, deliveryLatitude, deliveryLongitude, deliveryGeocodedAt, deliveryGeocodingStatus, Number(existingShipment.client_id));
            }
          }
          recordAudit(actor, "PUT", `shipments/${Number(p[2])}`, "Cambio dirección de entrega", JSON.stringify({ order_id: existingShipment?.order_id || null, client_id: existingShipment?.client_id || null, collection_point_id: existingShipment?.collection_point_id || null, address: deliveryAddress, city: deliveryCity, update_client_address: updateClientAddress }));
          delete d.latitude;
          delete d.longitude;
          delete d.geocoded_at;
          delete d.geocoding_status;
        }
        const keys = Object.keys(d).filter((k) => k !== "id");
        db.prepare(
          `UPDATE ${t} SET ${keys.map((k) => k + "=?").join(",")} WHERE id=?`,
        ).run(...keys.map((k) => d[k]), p[2]);
        if (t === "shipments" && String(d.prepared_by || "").trim()) {
          const shipment = db.prepare("SELECT order_id FROM shipments WHERE id=?").get(Number(p[2]));
          if (shipment?.order_id) db.prepare("UPDATE orders SET prepared_by=?,updated_at=? WHERE id=?").run(String(d.prepared_by).trim(), d.updated_at, Number(shipment.order_id));
        }
        if (t === "products" && (d.cost_price !== undefined || d.unit_price !== undefined)) {
          const now = new Date().toISOString();
          db.prepare("INSERT INTO product_price_history(product_id,supplier_id,price_type,amount,valid_from,source,notes,created_at) VALUES(?,?,?,?,?,?,?,?)").run(Number(p[2]), d.primary_supplier_id || d.supplier_id || null, "Coste", Number(d.real_cost || d.cost_price || 0), now, actor, "Cambio de precio del producto", now);
          db.prepare("INSERT INTO product_price_history(product_id,price_type,amount,valid_from,source,notes,created_at) VALUES(?,?,?,?,?,?,?)").run(Number(p[2]), "Venta", Number(d.unit_price || 0), now, actor, "Cambio de tarifa principal", now);
        }
        if (t === "invoice_lines") {
          const line = db.prepare("SELECT invoice_id FROM invoice_lines WHERE id=?").get(Number(p[2]));
          if (line?.invoice_id) markInvoicePdfStale(line.invoice_id);
        }
        if (t === "invoices") markInvoicePdfStale(Number(p[2]));
        if (t === "order_lines") {
          const line = db.prepare("SELECT order_id FROM order_lines WHERE id=?").get(Number(p[2]));
          if (line?.order_id) markCommercialDocumentPdfStale("order", line.order_id);
        }
        if (t === "quote_lines") {
          const line = db.prepare("SELECT quote_id FROM quote_lines WHERE id=?").get(Number(p[2]));
          if (line?.quote_id) markCommercialDocumentPdfStale("quote", line.quote_id);
        }
        if (t === "orders") markCommercialDocumentPdfStale("order", Number(p[2]));
        if (t === "quotes") markCommercialDocumentPdfStale("quote", Number(p[2]));
        return send(res, 200, { id: Number(p[2]), ...d });
      }
      return send(res, 405, { error: "Método no permitido" });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }
// En producción las tareas se disparan mediante el cron del proveedor. Mantener
// un temporizador por instancia serverless duplica ejecuciones y consume CPU.
// Se conserva únicamente para el servidor local, donde no existe cron externo.
const hostedRuntime = process.env.VERCEL === "1" || process.env.NETLIFY === "true" || process.env.NETLIFY === "1";
if (!hostedRuntime && process.env.ENABLE_BACKGROUND_SCHEDULER !== "0") {
  const schedulerTimer = setInterval(runScheduledTasks, 30000);
  schedulerTimer.unref?.();
}
