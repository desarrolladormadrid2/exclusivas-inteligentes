import { deflateSync } from "node:zlib";
import { PNG } from "pngjs";
import { calculateInvoiceTotals } from "./invoice-totals.mjs";

const PAGE = { width: 612, height: 792, margin: 38, footer: 36 };
const COLOR = {
  red: [0.725, 0.11, 0.11],
  ink: [0.12, 0.16, 0.19],
  muted: [0.38, 0.43, 0.46],
  rule: [0.78, 0.81, 0.83],
  pale: [0.94, 0.95, 0.96],
  white: [1, 1, 1],
  green: [0.1, 0.48, 0.34],
};
const SELLER = {
  legalName: "Exclusivas Inteligentes · Distribuidora de bebidas",
  taxId: "B34266783",
  address: "C/ Inglaterra, 5 · 34004 Palencia",
  phone: "618 715 822",
  registry: "Inscrita en el Registro Mercantil de Palencia · Tomo 465 · Folio 180 · Hoja P-7141 · Inscripción 4ª · N.R.S. 40.050896/P",
  iban: "ES58 2100 6267 1302 0001 ****",
};

const safeText = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/€/g, "EUR")
  .replace(/ª/g, "a")
  .replace(/º/g, "o")
  .replace(/[·•]/g, " | ")
  .replace(/[—–]/g, "-")
  .replace(/[^\x20-\x7E]/g, "?");
const literal = (value) => `(${safeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
const euro = (value) => `${Number(value || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
const date = (value) => {
  const raw = String(value || "").slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw || "No indicada";
};
const colorString = (color) => color.join(" ");
const charWidth = (text, size) => safeText(text).length * size * 0.51;

function wrapText(value, maxWidth, size) {
  const words = safeText(value).split(/\s+/).filter(Boolean);
  const rows = [];
  let row = "";
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (row && charWidth(next, size) > maxWidth) { rows.push(row); row = word; }
    else row = next;
  }
  if (row) rows.push(row);
  return rows.length ? rows : [""];
}

function makePage() {
  return { commands: [], pageNumber: 0, image: null };
}
function drawText(page, x, y, value, size = 9, font = "F1", color = COLOR.ink, align = "left", maxWidth = 0) {
  let text = safeText(value);
  if (maxWidth > 0 && charWidth(text, size) > maxWidth) {
    while (text.length > 4 && charWidth(`${text.slice(0, -4)}...`, size) > maxWidth) text = text.slice(0, -1);
    text = `${text.slice(0, -4)}...`;
  }
  const width = charWidth(text, size);
  const atX = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
  page.commands.push(`${colorString(color)} rg BT /${font} ${size} Tf 1 0 0 1 ${atX.toFixed(2)} ${y.toFixed(2)} Tm ${literal(text)} Tj ET`);
}
function drawWrapped(page, x, y, value, maxWidth, size = 8, lineHeight = 11, font = "F1", color = COLOR.ink, maxRows = 3) {
  const rows = wrapText(value, maxWidth, size).slice(0, maxRows);
  rows.forEach((row, index) => drawText(page, x, y - index * lineHeight, row, size, font, color, "left", maxWidth));
  return rows.length * lineHeight;
}
function drawLine(page, x1, y1, x2, y2, color = COLOR.rule, width = 0.6) {
  page.commands.push(`${colorString(color)} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
}
function drawRect(page, x, y, width, height, fill = null, stroke = null, lineWidth = 0.6) {
  const parts = ["q"];
  if (fill) parts.push(`${colorString(fill)} rg`);
  if (stroke) parts.push(`${colorString(stroke)} RG`, `${lineWidth} w`);
  parts.push(`${x} ${y} ${width} ${height} re`, fill && stroke ? "B" : fill ? "f" : "S", "Q");
  page.commands.push(parts.join(" "));
}

const CODE39 = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn", K: "wnnnnnnww", L: "nnwnnnnww",
  M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw",
  Y: "wwnnwnnnn", Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn",
  "$": "nwnwnwnnn", "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
};
function drawBarcode(page, value, x, y, maxWidth = 170, height = 30) {
  const clean = safeText(value).toUpperCase().replace(/[^A-Z0-9. $/+%-]/g, "-").slice(0, 28);
  const payload = `*${clean}*`;
  const units = [...payload].reduce((sum, char) => sum + [...(CODE39[char] || CODE39["-"])].reduce((n, unit) => n + (unit === "w" ? 3 : 1), 0) + 1, -1);
  const unit = Math.min(1.35, maxWidth / units);
  let left = x;
  [...payload].forEach((char) => {
    const pattern = CODE39[char] || CODE39["-"];
    [...pattern].forEach((size, index) => {
      const width = unit * (size === "w" ? 3 : 1);
      if (index % 2 === 0) drawRect(page, left, y, width, height, COLOR.ink);
      left += width;
    });
    left += unit;
  });
  drawText(page, x, y - 9, clean, 6.5, "F1", COLOR.muted);
}

function brandHeader(page, document, type, pageIndex, totalPages) {
  const m = PAGE.margin;
  const right = PAGE.width - m;
  drawRect(page, m, 718, 34, 34, COLOR.red);
  drawText(page, m + 17, 727, "E", 22, "F2", COLOR.white, "center");
  drawText(page, m + 45, 739, "EXCLUSIVAS", 15, "F2", COLOR.ink);
  drawText(page, m + 46, 725, "INTELIGENTES", 7.2, "F2", COLOR.red);
  drawText(page, m + 45, 710, "Distribucion profesional de bebidas | Palencia", 7, "F1", COLOR.muted, "left", 228);

  const labels = {
    invoice: "FACTURA DE VENTA",
    order: "PEDIDO DE CLIENTE",
    quote: "PRESUPUESTO",
    delivery: "ALBARAN DE ENTREGA",
    purchase: "PEDIDO A PROVEEDOR",
  };
  const code = document.code || document.document_number || "Documento";
  drawText(page, right, 744, labels[type], 10, "F2", COLOR.red, "right", 265);
  drawText(page, right, 725, code, 16, "F2", COLOR.ink, "right", 265);
  const rawDate = type === "invoice" ? document.issue_date || document.created_at : type === "purchase" ? document.order_date : type === "delivery" ? document.delivery_date || document.created_at : type === "quote" ? document.quote_date || document.created_at : document.order_date || document.created_at;
  const expected = type === "purchase" ? document.expected_date : type === "order" || type === "delivery" ? document.delivery_date || document.shipping_date : type === "invoice" ? document.due_date : "";
  drawText(page, right, 708, `Fecha ${date(rawDate)}${expected ? `  |  ${type === "invoice" ? "Vence" : type === "purchase" ? "Entrega prevista" : "Entrega"} ${date(expected)}` : ""}`, 7.5, "F1", COLOR.ink, "right", 278);
  drawText(page, right, 695, `Estado ${document.status || (type === "order" ? "Nuevo" : "Pendiente")}`, 7.5, "F1", COLOR.muted, "right", 278);
  if (type === "invoice" || type === "order" || type === "quote" || type === "delivery") {
    const reference = document.client_code || document.client_tax_id || "Cliente";
    drawText(page, right, 682, reference, 7.5, "F1", COLOR.muted, "right", 278);
  } else drawText(page, right, 682, document.supplier_code || document.supplier_tax_id || "Proveedor", 7.5, "F1", COLOR.muted, "right", 278);

  drawBarcode(page, code, m, 674, 165, 25);
  drawText(page, right, 659, `Pagina ${pageIndex + 1} de ${totalPages}`, 7.2, "F1", COLOR.muted, "right");
  drawLine(page, m, 650, right, 650, COLOR.rule, 0.75);
}

function partyBlock(page, document, type) {
  const left = PAGE.margin;
  const y = 568;
  const width = PAGE.width - 2 * PAGE.margin;
  const purchase = type === "purchase";
  const heading = purchase ? "PROVEEDOR" : "CLIENTE";
  const name = purchase ? document.supplier_name : (document.client_legal_name || document.client_name || "Cliente no identificado");
  const extraName = !purchase && document.client_legal_name && document.client_name && document.client_legal_name !== document.client_name ? document.client_name : "";
  const address = purchase ? document.supplier_address : document.client_address || document.client_delivery_address_snapshot || document.address;
  const city = purchase ? document.supplier_city : document.client_city || document.client_delivery_city_snapshot || document.delivery_city;
  const taxId = purchase ? document.supplier_tax_id : document.client_tax_id;
  const contact = purchase ? (document.supplier_contact || document.supplier_phone) : document.client_phone;
  const email = purchase ? document.supplier_email : document.client_email;
  drawRect(page, left, y, width, 17, COLOR.pale);
  drawText(page, left + 8, y + 5, heading, 7.2, "F2", COLOR.muted);
  const col = left + 8;
  drawText(page, col, y - 17, name || (purchase ? "Proveedor no indicado" : "Cliente no identificado"), 9.5, "F2", COLOR.ink, "left", 340);
  if (extraName) drawText(page, col, y - 30, extraName, 8, "F1", COLOR.muted, "left", 335);
  drawWrapped(page, col, y - (extraName ? 43 : 31), address || "Direccion no indicada", 315, 7.5, 10, "F1", COLOR.ink, 2);
  drawText(page, col, y - 53 - (extraName ? 10 : 0), `${city || ""}${taxId ? `  |  NIF ${taxId}` : ""}`, 7.2, "F1", COLOR.muted, "left", 325);
  drawText(page, col, y - 65 - (extraName ? 10 : 0), [contact, email].filter(Boolean).join("  |  ") || "", 7, "F1", COLOR.muted, "left", 325);

  const deliveryHeading = purchase ? "DESTINO DE ENTREGA" : "DATOS DEL DOCUMENTO";
  const deliveryName = purchase ? document.warehouse_name : type === "invoice" ? (document.payment_terms || document.invoice_payment_terms || document.payment_method || document.invoice_payment_method || "Condiciones de pago") : (document.collection_point_name || "Entrega asociada al pedido");
  const deliveryAddress = purchase ? document.delivery_address || document.warehouse_address : document.delivery_address || document.address || document.client_delivery_address_snapshot;
  const deliveryCity = purchase ? document.delivery_city || document.warehouse_city : document.delivery_city || document.client_delivery_city_snapshot;
  const infoX = left + 368;
  drawText(page, infoX, y + 5, deliveryHeading, 7.2, "F2", COLOR.muted);
  drawWrapped(page, infoX, y - 18, deliveryName || (type === "invoice" ? "Forma de pago no indicada" : "Punto de entrega no indicado"), 164, 8.2, 11, "F2", COLOR.ink, 2);
  drawWrapped(page, infoX, y - 43, [deliveryAddress, deliveryCity].filter(Boolean).join(" | ") || "Direccion de entrega no indicada", 164, 7.5, 10, "F1", COLOR.ink, 3);
  if (type === "delivery") {
    const route = document.carrier || document.route_code || "";
    if (route) drawText(page, infoX, y - 78, `Transporte / ruta: ${route}`, 7, "F1", COLOR.muted, "left", 164);
  }
  if (type === "invoice" && Array.isArray(document.route_assignments) && document.route_assignments.length) {
    const assignment = document.route_assignments[0];
    drawWrapped(page, infoX, y - 78, `Reparto: ${assignment.route_code || "Ruta pendiente"} | ${assignment.vehicle_label || "Sin vehículo"}${assignment.driver ? ` | ${assignment.driver}` : ""}`, 164, 6.6, 9, "F1", COLOR.muted, 2);
  }
  drawLine(page, left, y - 86, left + width, y - 86, COLOR.rule, 0.5);
}

function normalizeLines(document, type) {
  const rows = Array.isArray(document.lines) ? document.lines : [];
  return rows.map((line) => {
    const quantity = Number(line.quantity_requested ?? line.quantity ?? 0);
    const unit = String(line.quantity_unit || line.unit || "uds.").toUpperCase();
    const price = Number(line.unit_price ?? line.unit_cost ?? line.format_price ?? 0);
    const amount = Number(line.amount ?? quantity * price);
    const code = line.sku || line.supplier_ref || "";
    const description = line.description || line.product_name || line.supplier_product_name || "Producto sin nombre";
    const subline = [code, line.line_type === "GTR" ? "Cuenta 70500000" : "", line.lot_code ? `Lote ${line.lot_code}` : ""].filter(Boolean).join("  |  ");
    return { code, description, subline, quantity, unit, price, vat: Number(line.vat ?? document.vat ?? 21), amount, discount: Number(line.discount || 0), line_type: line.line_type || "" };
  });
}

function drawTableHeader(page, type, y) {
  const x = PAGE.margin;
  const right = PAGE.width - PAGE.margin;
  const title = type === "delivery" ? "ARTICULOS ENTREGADOS" : type === "purchase" ? "DETALLE DEL PEDIDO" : "DETALLE DE PRODUCTOS";
  drawText(page, x, y + 17, title, 8, "F2", COLOR.ink);
  drawRect(page, x, y - 5, right - x, 22, COLOR.ink);
  drawText(page, x + 7, y + 2, "REF.", 6.8, "F2", COLOR.white);
  drawText(page, x + 62, y + 2, "PRODUCTO / DESCRIPCION", 6.8, "F2", COLOR.white);
  drawText(page, x + 351, y + 2, "CANTIDAD", 6.8, "F2", COLOR.white, "right");
  drawText(page, x + 412, y + 2, "PRECIO", 6.8, "F2", COLOR.white, "right");
  if (type !== "purchase") drawText(page, x + 472, y + 2, "IVA", 6.8, "F2", COLOR.white, "right");
  drawText(page, right - 7, y + 2, type === "purchase" ? "IMPORTE" : "IMPORTE", 6.8, "F2", COLOR.white, "right");
  return y - 5;
}

function drawLineRow(page, row, index, y, type) {
  const x = PAGE.margin;
  const right = PAGE.width - PAGE.margin;
  const height = 37;
  if (index % 2 === 1) drawRect(page, x, y - height, right - x, height, [0.975, 0.978, 0.98]);
  drawText(page, x + 7, y - 15, row.code || "-", 7, "F1", COLOR.muted, "left", 49);
  drawText(page, x + 62, y - 14, row.description, 7.6, "F2", COLOR.ink, "left", 272);
  if (row.subline) drawText(page, x + 62, y - 27, row.subline, 6.3, "F1", COLOR.muted, "left", 272);
  drawText(page, x + 351, y - 15, `${row.quantity.toLocaleString("es-ES", { maximumFractionDigits: 3 })} ${row.unit}`, 7, "F1", COLOR.ink, "right", 65);
  drawText(page, x + 412, y - 15, euro(row.price), 7, "F1", COLOR.ink, "right", 60);
  if (type !== "purchase") drawText(page, x + 472, y - 15, `${row.vat.toLocaleString("es-ES", { maximumFractionDigits: 2 })}%`, 7, "F1", COLOR.ink, "right");
  drawText(page, right - 7, y - 15, euro(row.amount), 7.2, "F2", COLOR.ink, "right", 66);
  drawLine(page, x, y - height, right, y - height, COLOR.rule, 0.35);
  return y - height;
}

function totalsFor(document, rows, type) {
  if (type === "purchase") return { base: Number(document.amount || rows.reduce((sum, line) => sum + line.amount, 0)), vat: 0, surcharge: 0, total: Number(document.amount || rows.reduce((sum, line) => sum + line.amount, 0)), breakdown: [] };
  const calculated = calculateInvoiceTotals(rows.map((line) => ({ quantity: line.quantity, unit_price: line.price, amount: line.amount, vat: line.vat, discount: line.discount })), type === "invoice" && Boolean(Number(document.equivalence_surcharge_enabled || 0)));
  const base = rows.length ? calculated.base_amount : Number(document.base_amount ?? document.amount ?? 0);
  const vat = rows.length ? calculated.vat_amount : Number(document.vat_amount || 0);
  const surcharge = rows.length ? calculated.equivalence_surcharge_amount : Number(document.equivalence_surcharge_amount || 0);
  const fallbackTotal = type === "invoice" ? Number(document.amount || base + vat + surcharge) : Number(document.amount || base + vat + surcharge);
  const total = rows.length ? calculated.total_amount : fallbackTotal;
  const breakdown = rows.length ? calculated.equivalence_surcharge_breakdown : (() => { try { return JSON.parse(document.equivalence_surcharge_breakdown || "[]"); } catch { return []; } })();
  return { base, vat, surcharge, total, breakdown };
}

function ensurePage(pages) {
  const page = makePage();
  pages.push(page);
  return page;
}
function startDocumentPage(pages, document, type, pageIndex, totalPages, firstPage = false) {
  const page = ensurePage(pages);
  brandHeader(page, document, type, pageIndex, totalPages);
  if (firstPage) {
    partyBlock(page, document, type);
    return drawTableHeader(page, type, 452) - 19;
  }
  drawText(page, PAGE.margin, 625, "CONTINUACION DEL DOCUMENTO", 7.5, "F2", COLOR.muted);
  return drawTableHeader(page, type, 596) - 19;
}
function drawTotals(page, document, totals, type, y) {
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;
  const x = 348;
  const width = right - x;
  drawLine(page, x, y, right, y, COLOR.rule, 0.6);
  drawText(page, left, y - 14, type === "purchase" ? "Importe del pedido" : "Base imponible", 7.6, "F2", COLOR.ink);
  drawText(page, right, y - 14, type === "purchase" ? euro(totals.total) : euro(totals.base), 7.6, "F2", COLOR.ink, "right");
  y -= 23;
  if (type !== "purchase") {
    for (const row of totals.breakdown || []) {
      const vatRate = Number(row.vat_rate || 0);
      drawText(page, left, y, `IVA ${vatRate.toLocaleString("es-ES")} %`, 7.2, "F1", COLOR.muted);
      drawText(page, right, y, euro(Number(row.vat_amount || 0)), 7.2, "F1", COLOR.ink, "right");
      if (type === "invoice" && Number(document.equivalence_surcharge_enabled || 0) && Number(row.surcharge_amount || 0) > 0) {
        y -= 12;
        drawText(page, left, y, `Recargo de equivalencia ${Number(row.surcharge_rate || 0).toLocaleString("es-ES")} %`, 7, "F1", COLOR.muted);
        drawText(page, right, y, euro(Number(row.surcharge_amount || 0)), 7, "F1", COLOR.ink, "right");
      }
      y -= 12;
    }
    if (!(totals.breakdown || []).length) {
      drawText(page, left, y, `IVA ${Number(document.vat || 21).toLocaleString("es-ES")} %`, 7.2, "F1", COLOR.muted);
      drawText(page, right, y, euro(totals.vat), 7.2, "F1", COLOR.ink, "right");
      y -= 12;
    }
    if (type === "invoice" && Number(document.equivalence_surcharge_enabled || 0) && totals.surcharge > 0 && !(totals.breakdown || []).some((row) => Number(row.surcharge_amount || 0) > 0)) {
      drawText(page, left, y, "Recargo de equivalencia", 7.2, "F1", COLOR.muted);
      drawText(page, right, y, euro(totals.surcharge), 7.2, "F1", COLOR.ink, "right");
      y -= 12;
    }
  }
  y -= 2;
  drawRect(page, x, y - 28, width, 28, COLOR.red);
  const totalLabel = type === "purchase" || type === "order" ? "TOTAL DEL PEDIDO" : type === "quote" ? "TOTAL PRESUPUESTO" : type === "delivery" ? "TOTAL ALBARAN" : "TOTAL FACTURA";
  drawText(page, x + 10, y - 18, totalLabel, 8.2, "F2", COLOR.white);
  drawText(page, right - 9, y - 18, euro(totals.total), 10, "F2", COLOR.white, "right");
  return y - 39;
}

function drawInvoicePayment(page, document, y) {
  const left = PAGE.margin;
  const width = PAGE.width - 2 * PAGE.margin;
  drawRect(page, left, y - 43, width, 43, COLOR.pale);
  drawText(page, left + 8, y - 13, "COBRO Y VENCIMIENTO", 6.8, "F2", COLOR.muted);
  drawText(page, left + 8, y - 28, `Estado: ${document.status || "Pendiente"}`, 7.3, "F2", COLOR.ink);
  drawText(page, left + 8 + 190, y - 28, `Vencimiento: ${date(document.due_date)}`, 7.3, "F1", COLOR.ink);
  drawText(page, left + 8 + 372, y - 28, `IBAN: ${SELLER.iban}`, 6.5, "F1", COLOR.ink, "left", width - 385);
  return y - 52;
}

function drawDeliveryProof(page, document, y) {
  const x = PAGE.margin;
  const right = PAGE.width - PAGE.margin;
  const status = document.delivery_signature_status || "Pendiente";
  drawLine(page, x, y, right, y, COLOR.rule, 0.6);
  drawText(page, x, y - 14, "JUSTIFICANTE DE ENTREGA", 7.2, "F2", COLOR.ink);
  drawText(page, x, y - 30, `Recepcion: ${status}`, 7, "F1", COLOR.muted);
  drawText(page, x + 190, y - 30, `Recibe: ${document.delivery_recipient_name || "No indicado"}`, 7, "F1", COLOR.ink, "left", 150);
  drawText(page, x + 355, y - 30, `Fecha: ${document.delivery_signature_at ? date(document.delivery_signature_at) : "No indicada"}`, 7, "F1", COLOR.ink, "left", 165);
  if (document.delivery_signature_by) drawText(page, x, y - 45, `Registrado por: ${document.delivery_signature_by}`, 6.6, "F1", COLOR.muted, "left", 310);
  if (document.delivery_signature_note) drawWrapped(page, x, y - 55, `Observaciones: ${document.delivery_signature_note}`, 310, 6.6, 9, "F1", COLOR.muted, 2);
  drawRect(page, right - 178, y - 71, 178, 46, COLOR.white, COLOR.rule, 0.5);
  drawText(page, right - 170, y - 36, "FIRMA DE RECEPCION", 6.2, "F2", COLOR.muted);
  if (document.delivery_signature_status === "Firmado") {
    if (!String(document.delivery_signature_data || "").startsWith("data:image/png;base64,")) drawText(page, right - 170, y - 53, "Registrada digitalmente", 7, "F2", COLOR.green);
  } else drawText(page, right - 170, y - 53, "Pendiente de firma", 7, "F1", COLOR.muted);
  page.signaturePlacement = { x: right - 168, y: y - 68, width: 160, height: 27 };
  return y - 79;
}

function prepareSignature(document) {
  const value = String(document.delivery_signature_data || "");
  if (document.delivery_signature_status !== "Firmado" || !value.startsWith("data:image/png;base64,")) return null;
  try {
    const png = PNG.sync.read(Buffer.from(value.split(",", 2)[1], "base64"));
    const rgb = Buffer.alloc(png.width * png.height * 3);
    for (let source = 0, target = 0; source < png.data.length; source += 4, target += 3) {
      const alpha = png.data[source + 3] / 255;
      rgb[target] = Math.round(png.data[source] * alpha + 255 * (1 - alpha));
      rgb[target + 1] = Math.round(png.data[source + 1] * alpha + 255 * (1 - alpha));
      rgb[target + 2] = Math.round(png.data[source + 2] * alpha + 255 * (1 - alpha));
    }
    return { width: png.width, height: png.height, compressed: deflateSync(rgb) };
  } catch { return null; }
}

function makePdf(pages, signatureImage = null, signaturePageIndex = -1) {
  const objects = [];
  const addObject = (value) => { objects.push(value); return objects.length; };
  const catalogId = addObject("");
  const pagesId = addObject("");
  const regularFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const imageId = signatureImage
    ? addObject(`<< /Type /XObject /Subtype /Image /Width ${signatureImage.width} /Height ${signatureImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${signatureImage.compressed.length} >>\nstream\n${signatureImage.compressed.toString("binary")}\nendstream`)
    : null;
  const pageIds = [];
  pages.forEach((page, index) => {
    page.commands.push(...drawFooterCommands(index, pages.length));
    if (imageId && index === signaturePageIndex) {
      const placement = page.signaturePlacement || { x: 408, y: 70, width: 160, height: 30 };
      page.commands.push("q", `${placement.width} 0 0 ${placement.height} ${placement.x} ${placement.y} cm`, "/Im1 Do", "Q");
    }
    const commands = page.commands.join("\n");
    const contentId = addObject(`<< /Length ${Buffer.byteLength(commands, "binary")} >>\nstream\n${commands}\nendstream`);
    const pageId = addObject("");
    const imageResource = imageId && index === signaturePageIndex ? ` /XObject << /Im1 ${imageId} 0 R >>` : "";
    objects[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >>${imageResource} >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, "binary")); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}
function drawFooterCommands(pageIndex, pageCount) {
  const commands = [];
  const y = 34;
  commands.push(`${colorString(COLOR.rule)} RG 0.5 w ${PAGE.margin} ${y} m ${PAGE.width - PAGE.margin} ${y} l S`);
  const footer1 = `CIF ${SELLER.taxId} | ${SELLER.address} | Tel. ${SELLER.phone}`;
  commands.push(`${colorString(COLOR.muted)} rg BT /F1 6 Tf 1 0 0 1 ${PAGE.margin} 23 Tm ${literal(footer1)} Tj ET`);
  commands.push(`${colorString(COLOR.muted)} rg BT /F2 6.5 Tf 1 0 0 1 ${PAGE.width - PAGE.margin - 18} 23 Tm ${literal(`${pageIndex + 1} / ${pageCount}`)} Tj ET`);
  commands.push(`${colorString(COLOR.muted)} rg BT /F1 5.4 Tf 1 0 0 1 ${PAGE.margin} 13 Tm ${literal(SELLER.registry)} Tj ET`);
  return commands;
}

function buildDocumentPdf(document, type) {
  const rows = normalizeLines(document, type);
  const totals = totalsFor(document, rows, type);
  const chunks = [];
  const firstCapacity = 8;
  const nextCapacity = 11;
  if (!rows.length) chunks.push([]);
  else {
    chunks.push(rows.slice(0, firstCapacity));
    for (let offset = firstCapacity; offset < rows.length; offset += nextCapacity) chunks.push(rows.slice(offset, offset + nextCapacity));
  }
  const finalChunk = chunks.at(-1) || [];
  const finalY = (chunks.length === 1 ? 428 : 572) - Math.max(1, finalChunk.length) * 37;
  const surchargeRows = type === "invoice" && Number(document.equivalence_surcharge_enabled || 0)
    ? (totals.breakdown || []).filter((row) => Number(row.surcharge_amount || 0) > 0).length
    : 0;
  const vatRows = Math.max(1, (totals.breakdown || []).length + surchargeRows);
  const summaryHeight = type === "purchase"
    ? 64 + (document.notes ? 60 : 0)
    : 76 + (vatRows * 12) + (type === "invoice" ? 54 : type === "delivery" ? 81 : 0);
  const needsSummaryPage = finalY - 10 - summaryHeight < 55;
  const pageCount = chunks.length + (needsSummaryPage ? 1 : 0);
  let pages = [];
  chunks.forEach((chunk, pageIndex) => {
    const yStart = startDocumentPage(pages, document, type, pageIndex, pageCount, pageIndex === 0);
    let y = yStart;
    if (!chunk.length) {
      drawText(pages[pageIndex], PAGE.margin + 7, y - 12, "No hay lineas de producto asociadas.", 7.5, "F1", COLOR.muted);
      y -= 37;
    } else chunk.forEach((line, index) => { y = drawLineRow(pages[pageIndex], line, index, y, type); });
    pages[pageIndex].endY = y;
  });
  let page = pages.at(-1);
  let y = page.endY - 10;
  if (needsSummaryPage) {
    page = ensurePage(pages);
    brandHeader(page, document, type, pages.length - 1, pageCount);
    drawText(page, PAGE.margin, 625, "RESUMEN DEL DOCUMENTO", 8, "F2", COLOR.ink);
    y = 605;
  }
  y = drawTotals(page, document, totals, type, y);
  if (type === "invoice") y = drawInvoicePayment(page, document, y - 2);
  if (type === "delivery") y = drawDeliveryProof(page, document, y - 2);
  if (type === "purchase" && document.notes) {
    drawText(page, PAGE.margin, y - 4, "OBSERVACIONES", 6.8, "F2", COLOR.muted);
    drawWrapped(page, PAGE.margin, y - 18, document.notes, 310, 7, 10, "F1", COLOR.ink, 5);
  }
  drawText(page, PAGE.margin, 48, SELLER.legalName, 6.2, "F1", COLOR.muted, "left", 320);
  const signatureImage = type === "delivery" ? prepareSignature(document) : null;
  return makePdf(pages, signatureImage, signatureImage ? pages.length - 1 : -1);
}

export function createCommercialDocumentPdf(document, type) {
  const normalized = String(type || "").toLowerCase();
  if (!["invoice", "order", "quote", "delivery", "purchase"].includes(normalized)) throw new Error("Tipo de documento no valido");
  return buildDocumentPdf(document || {}, normalized);
}

export function createSupplierPurchasePdf(order, lines) {
  return buildDocumentPdf({ ...(order || {}), lines: Array.isArray(lines) ? lines : [] }, "purchase");
}
