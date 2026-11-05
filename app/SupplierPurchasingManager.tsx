"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type DragEvent as ReactDragEvent } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

type AnyRow = Record<string, any>;
type DraftLine = { product_id: number; product_name: string; quantity: number; quantity_unit: string; unit_cost: number; supplier_product_name: string; supplier_ref: string; supplier_alias_id?: number | null; source_text?: string; recurrent?: boolean };
type UnmatchedOcrLine = { id: string; text: string; product_id: string; quantity: string; supplier_name: string; supplier_ref: string };
const today = () => new Date().toISOString().slice(0, 10);
const normalize = (value: any) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const currency = (value: any) => Number(value || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const dateLabel = (value: any) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("es-ES") : "—";

export default function SupplierPurchasingManager({ user, onNavigate }: { user?: AnyRow; onNavigate?: (module: string) => void }) {
  const actor = String(user?.username || "Usuario local");
  const [suppliers, setSuppliers] = useState<AnyRow[]>([]);
  const [products, setProducts] = useState<AnyRow[]>([]);
  const [orders, setOrders] = useState<AnyRow[]>([]);
  const [aliases, setAliases] = useState<AnyRow[]>([]);
  const [recurrences, setRecurrences] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [section, setSection] = useState<"orders" | "create" | "aliases" | "recommended">("orders");
  const [createMode, setCreateMode] = useState<"manual" | "recurrent" | "ocr">("manual");
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<AnyRow | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [quantityUnit, setQuantityUnit] = useState("unidad");
  const [unitCost, setUnitCost] = useState("0");
  const [supplierProductName, setSupplierProductName] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [saveRecurring, setSaveRecurring] = useState(false);
  const [rememberAliases, setRememberAliases] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<AnyRow | null>(null);
  const [orderModalEditing, setOrderModalEditing] = useState(false);
  const [orderStatus, setOrderStatus] = useState("Borrador");
  const [cancellationNote, setCancellationNote] = useState("");
  const [sendCancellationEmail, setSendCancellationEmail] = useState(false);
  const [observation, setObservation] = useState("");
  const [filterText, setFilterText] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [ocrFileName, setOcrFileName] = useState("");
  const [ocrFileCount, setOcrFileCount] = useState(0);
  const [ocrText, setOcrText] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrDropActive, setOcrDropActive] = useState(false);
  const ocrQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [unmatchedOcrLines, setUnmatchedOcrLines] = useState<UnmatchedOcrLine[]>([]);
  const [aliasProductId, setAliasProductId] = useState("");
  const [aliasName, setAliasName] = useState("");
  const [aliasRef, setAliasRef] = useState("");
  const [aliasUnit, setAliasUnit] = useState("unidad");
  const [aliasSupplier, setAliasSupplier] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [supplierRows, productRows, orderRows, aliasRows, recurrentRows] = await Promise.all([
        fetch("/api/suppliers?view=lookup&limit=5000").then((r) => r.ok ? r.json() : []),
        fetch("/api/products?view=lookup&limit=5000").then((r) => r.ok ? r.json() : []),
        fetch(`/api/purchase_orders?refresh=${Date.now()}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : []),
        fetch("/api/supplier_product_aliases?refresh=1").then((r) => r.ok ? r.json() : []),
        fetch("/api/supplier_recurrent_items?refresh=1").then((r) => r.ok ? r.json() : []),
      ]);
      setSuppliers(Array.isArray(supplierRows) ? supplierRows : []);
      setProducts(Array.isArray(productRows) ? productRows : []);
      setOrders(Array.isArray(orderRows) ? orderRows : []);
      setAliases(Array.isArray(aliasRows) ? aliasRows : []);
      setRecurrences(Array.isArray(recurrentRows) ? recurrentRows : []);
    } catch { setError("No se pudieron cargar compras, proveedores y productos."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const chosenSupplier = suppliers.find((supplier) => String(supplier.id) === supplierId);
  const currentAliases = aliases.filter((item) => Number(item.supplier_id) === Number(supplierId) && Number(item.active ?? 1) === 1);
  const selectableProducts = useMemo(() => products.filter((item) => {
    const name = String(item.name || "").trim(), sku = String(item.sku || "").trim();
    const testRecord = /^__?test(?:_|\b)|^qa(?:[-_ ]|\b)|^(?:pw|test)[-_ ]/i.test(name) || /^(?:qa|pw|test)[-_ ]/i.test(sku);
    return Number(item.deleted || 0) !== 1 && Number(item.active ?? 1) === 1 && !["Inactivo", "Descatalogado", "Baja"].includes(String(item.product_status || "")) && !testRecord;
  }), [products]);
  const selectableProductIds = useMemo(() => new Set(selectableProducts.map((item) => Number(item.id))), [selectableProducts]);
  const currentRecurrences = recurrences.filter((item) => Number(item.supplier_id) === Number(supplierId) && Number(item.active ?? 1) === 1 && selectableProductIds.has(Number(item.product_id)));
  const productMatches = useMemo(() => productSearch.trim() ? selectableProducts.filter((item) => normalize(`${item.name} ${item.sku} ${item.brand} ${item.supplier_ref} ${currentAliases.filter((alias) => Number(alias.product_id) === Number(item.id)).map((alias) => alias.alias_name).join(" ")}`).includes(normalize(productSearch))).slice(0, 8) : [], [productSearch, selectableProducts, currentAliases]);
  const filteredOrders = orders.filter((item) => (!filterSupplier || String(item.supplier_id) === filterSupplier) && (!filterStatus || item.status === filterStatus) && normalize(`${item.code} ${item.supplier_name} ${item.notes}`).includes(normalize(filterText)));
  const recommendedProducts = selectableProducts
    .map((product) => {
      const available = Number(product.available_stock ?? (Number(product.stock || 0) - Number(product.stock_reserved || 0)));
      const minimum = Number(product.min_stock ?? product.stock_min ?? 0);
      return { product, available, minimum, suggested: Math.max(1, minimum - available) };
    })
    .filter((item) => item.available < item.minimum)
    .sort((a, b) => a.available - b.available || String(a.product.name || "").localeCompare(String(b.product.name || ""), "es"));
  const total = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0), 0);
  const orderStatusOptions = ["Borrador", "Enviado", "En tránsito", "Parcialmente recibido", "Recibido con incidencia", "Recibido", "Cancelado"];
  const receiptLockedStatuses = ["Parcialmente recibido", "Recibido", "Recibido con incidencia"];
  const orderLineLockedStatuses = [...receiptLockedStatuses, "Cancelado"];
  const orderLinesEditable = !selectedOrder || (!orderLineLockedStatuses.includes(String(selectedOrder.status || "")) && orderStatus !== "Cancelado");

  function resetDraft() {
    setSupplierId(""); setOrderDate(today()); setExpectedDate(""); setNotes(""); setLines([]); setProductSearch(""); setSelectedProduct(null); setOcrFileName(""); setOcrFileCount(0); setOcrText(""); setUnmatchedOcrLines([]); setOrderStatus("Borrador"); setCancellationNote(""); setSendCancellationEmail(false); setOrderModalEditing(false);
  }
  function pickProduct(product: AnyRow) {
    const alias = currentAliases.find((item) => Number(item.product_id) === Number(product.id) && normalize(item.alias_name) === normalize(productSearch)) || currentAliases.find((item) => Number(item.product_id) === Number(product.id));
    setSelectedProduct(product); setProductSearch(product.name || "");
    setSupplierProductName(alias?.alias_name || product.name || ""); setSupplierRef(alias?.supplier_ref || "");
    setQuantityUnit(alias?.quantity_unit || product.purchase_format || product.unit || "unidad"); setUnitCost(String(Number(alias?.unit_cost || product.cost_price || 0)));
  }
  function addLine(overrides: Partial<DraftLine> = {}) {
    if (!selectedProduct && !overrides.product_id) { setError("Selecciona un producto del catálogo antes de añadirlo."); return; }
    const product = selectedProduct || products.find((item) => Number(item.id) === Number(overrides.product_id));
    if (!product) return;
    const qty = Number(overrides.quantity ?? quantity);
    if (!(qty > 0)) { setError("La cantidad debe ser mayor que cero."); return; }
    const alias = currentAliases.find((item) => Number(item.product_id) === Number(product.id) && (normalize(item.alias_name) === normalize(supplierProductName) || (supplierRef && normalize(item.supplier_ref) === normalize(supplierRef))));
    setLines((current) => [...current, {
      product_id: Number(product.id), product_name: product.name, quantity: qty,
      quantity_unit: String(overrides.quantity_unit || quantityUnit || product.unit || "unidad"),
      unit_cost: Number(overrides.unit_cost ?? unitCost ?? product.cost_price ?? 0),
      supplier_product_name: String(overrides.supplier_product_name || supplierProductName || alias?.alias_name || product.name),
      supplier_ref: String(overrides.supplier_ref ?? supplierRef ?? alias?.supplier_ref ?? ""),
      supplier_alias_id: Number(overrides.supplier_alias_id || alias?.id || 0) || null,
      source_text: overrides.source_text || "",
      recurrent: saveRecurring || Boolean(overrides.recurrent),
    }]);
    setError(""); setSelectedProduct(null); setProductSearch(""); setQuantity("1"); setUnitCost("0"); setSupplierProductName(""); setSupplierRef(""); setSaveRecurring(false);
  }
  function updateLine(index: number, field: keyof DraftLine, value: any) { setLines((current) => current.map((line, itemIndex) => itemIndex === index ? { ...line, [field]: field === "quantity" || field === "unit_cost" ? Number(value) : value } : line)); }
  function addRecurring(item: AnyRow) {
    const product = selectableProducts.find((productRow) => Number(productRow.id) === Number(item.product_id));
    const alias = aliases.find((row) => Number(row.id) === Number(item.supplier_alias_id));
    if (!product) return;
    setLines((current) => [...current, { product_id: Number(product.id), product_name: product.name, quantity: Number(item.quantity || 1), quantity_unit: item.quantity_unit || product.unit || "unidad", unit_cost: Number(item.unit_cost || product.cost_price || 0), supplier_product_name: alias?.alias_name || product.name, supplier_ref: alias?.supplier_ref || "", supplier_alias_id: alias?.id || null, recurrent: false }]);
  }
  async function saveOrder(event?: any) {
    event?.preventDefault?.(); setError(""); setMessage("");
    if (!supplierId) { setError("Selecciona un proveedor."); return; }
    if (!lines.length) { setError("Añade al menos un producto al pedido."); return; }
    setSaving(true);
    try {
      let cancellationNoteFailed = false;
      let cancellationEmailMessage = "";
      const mayEditLines = !selectedOrder || (!orderLineLockedStatuses.includes(String(selectedOrder.status || "")) && orderStatus !== "Cancelado");
      const payload: AnyRow = { code: selectedOrder?.code || `COM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`, supplier_id: Number(supplierId), status: selectedOrder ? orderStatus : "Borrador", order_date: orderDate, expected_date: expectedDate || null, amount: mayEditLines ? total : Number(selectedOrder.amount || 0), notes, ocr_file_name: ocrFileName || null, ocr_extracted_text: ocrText || null };
      if (mayEditLines) payload.lines = lines;
      const response = await fetch(selectedOrder ? `/api/purchase_orders/${selectedOrder.id}` : "/api/purchase_orders", { method: selectedOrder ? "PUT" : "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify(payload) });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(saved.error || "No se pudo guardar el pedido.");
      if (selectedOrder && orderStatus === "Cancelado" && cancellationNote.trim()) {
        const noteResponse = await fetch(`/api/purchase_orders/${selectedOrder.id}/observations`, { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ observation: `Pedido cancelado: ${cancellationNote.trim()}` }) });
        cancellationNoteFailed = !noteResponse.ok;
      }
      if (selectedOrder && orderStatus === "Cancelado" && sendCancellationEmail) {
        const emailResponse = await fetch(`/api/purchase_orders/${selectedOrder.id}/email`, { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ purpose: "cancellation", cancellation_reason: cancellationNote.trim() }) });
        const emailResult = await emailResponse.json().catch(() => ({}));
        if (!emailResponse.ok) cancellationEmailMessage = ` No se pudo enviar el correo de anulación: ${emailResult.error || "revisa el email del proveedor"}.`;
        else if (emailResult.mode === "mailto") {
          const mailto = `mailto:${encodeURIComponent(emailResult.to)}?subject=${encodeURIComponent(emailResult.subject)}&body=${encodeURIComponent(emailResult.body)}`;
          window.location.href = mailto;
          cancellationEmailMessage = " Se abrió tu aplicación de correo para completar el envío de la anulación.";
        } else cancellationEmailMessage = ` Se envió el correo de anulación a ${emailResult.to}.`;
      }
      const aliasLines = mayEditLines && rememberAliases ? [...new Map(lines.map((line) => [`${line.product_id}:${normalize(line.supplier_product_name)}`, line])).values()] : [];
      const postSaveResults = await Promise.allSettled([
        ...aliasLines.map((line) => saveAliasForLine(line)),
        ...(mayEditLines ? lines.filter((item) => item.recurrent).map((line) => saveRecurrence(line)) : []),
      ]);
      const failedFollowUps = postSaveResults.filter((result) => result.status === "rejected").length;
      setMessage(`${selectedOrder ? orderStatus === "Cancelado" ? `Pedido ${saved.code || selectedOrder.code} cancelado.` : `Pedido ${saved.code || selectedOrder.code} actualizado.` : `Borrador ${saved.code || payload.code} creado.`}${cancellationNoteFailed ? " No se pudo guardar el motivo de cancelación en observaciones." : ""}${cancellationEmailMessage}${failedFollowUps ? ` El pedido se guardó, pero no se pudieron guardar ${failedFollowUps} equivalencias o artículos recurrentes.` : ""}`);
      setSelectedOrder(null); resetDraft(); setSection("orders"); await load();
    } catch (caught: any) { setError(caught?.message || "No se pudo guardar el pedido."); }
    finally { setSaving(false); }
  }
  async function saveRecurrence(line: DraftLine) {
    const existing = recurrences.find((item) => Number(item.supplier_id) === Number(supplierId) && Number(item.product_id) === Number(line.product_id));
    const payload = { supplier_id: Number(supplierId), product_id: Number(line.product_id), quantity: Number(line.quantity), quantity_unit: line.quantity_unit, unit_cost: Number(line.unit_cost), supplier_alias_id: line.supplier_alias_id || null, active: 1, created_by: actor, created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
    const response = await fetch(existing ? `/api/supplier_recurrent_items/${existing.id}` : "/api/supplier_recurrent_items", { method: existing ? "PUT" : "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("No se pudo guardar el producto recurrente.");
  }
  async function saveAliasForLine(line: DraftLine) {
    const aliasName = String(line.supplier_product_name || "").trim();
    if (!supplierId || !aliasName || normalize(aliasName) === normalize(line.product_name)) return;
    if (aliases.some((item) => Number(item.supplier_id) === Number(supplierId) && Number(item.product_id) === Number(line.product_id) && normalize(item.alias_name) === normalize(aliasName))) return;
    const response = await fetch("/api/supplier_product_aliases", { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ supplier_id: Number(supplierId), product_id: Number(line.product_id), alias_name: aliasName, supplier_ref: line.supplier_ref, quantity_unit: line.quantity_unit, source: "Pedido manual" }) });
    const saved = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(saved.error || `No se pudo guardar el alias ${aliasName}.`);
    setAliases((current) => [saved, ...current]);
  }
  function hydrateOrderEditor(detail: AnyRow) {
    setSupplierId(String(detail.supplier_id)); setOrderDate(String(detail.order_date || today()).slice(0, 10)); setExpectedDate(String(detail.expected_date || "").slice(0, 10)); setNotes(detail.notes || "");
    setOrderStatus(detail.status || "Borrador");
    setLines((detail.lines || []).map((line: AnyRow) => ({ product_id: Number(line.product_id), product_name: line.product_name || "Producto", quantity: Number(line.quantity || 0), quantity_unit: line.quantity_unit || "unidad", unit_cost: Number(line.unit_cost || 0), supplier_product_name: line.supplier_product_name || line.product_name || "", supplier_ref: line.supplier_ref || "", supplier_alias_id: line.supplier_alias_id || null })));
    setProductSearch(""); setSelectedProduct(null); setCancellationNote(""); setSendCancellationEmail(false);
  }
  async function editOrder(order: AnyRow) {
    setError(""); setMessage(""); setCancellationNote("");
    try {
      const response = await fetch(`/api/purchase_orders/${order.id}/detail`);
      const detail = await response.json(); if (!response.ok) throw new Error(detail.error || "No se pudo abrir el pedido.");
      setSelectedOrder(detail); hydrateOrderEditor(detail); setOrderModalEditing(true); setSection("orders");
    } catch (caught: any) { setError(caught?.message || "No se pudo abrir el pedido."); }
  }
  async function openOrder(order: AnyRow) {
    try { const response = await fetch(`/api/purchase_orders/${order.id}/detail`); const detail = await response.json(); if (!response.ok) throw new Error(detail.error); setSelectedOrder(detail); setOrderModalEditing(false); }
    catch (caught: any) { setError(caught?.message || "No se pudo cargar el detalle del pedido."); }
  }
  async function addObservation() {
    if (!selectedOrder || !observation.trim()) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/purchase_orders/${selectedOrder.id}/observations`, { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ observation }) });
      const saved = await response.json(); if (!response.ok) throw new Error(saved.error || "No se pudo guardar la observación.");
      setSelectedOrder((current: AnyRow) => ({ ...current, observations: [saved, ...(current.observations || [])] })); setObservation("");
    } catch (caught: any) { setError(caught?.message || "No se pudo guardar la observación."); }
    finally { setSaving(false); }
  }
  async function sendEmail(order: AnyRow) {
    setError(""); setMessage("");
    try {
      const response = await fetch(`/api/purchase_orders/${order.id}/email`, { method: "POST", headers: { "X-Actor": actor } });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "No se pudo preparar el correo.");
      if (result.mode === "mailto") {
        window.open(`/api/purchase_orders/${order.id}/pdf`, "_blank", "noopener,noreferrer");
        const mailto = `mailto:${encodeURIComponent(result.to)}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(`${result.body}\nAdjunta el PDF descargado del pedido ${order.code}.`)}`;
        window.location.href = mailto;
        setMessage("Se abrió tu aplicación de correo. Adjunta el PDF y confirma el envío; el estado del pedido seguirá en borrador hasta que el envío quede registrado.");
      } else { setMessage(`Pedido enviado a ${result.to}.`); }
      await load();
    } catch (caught: any) { setError(caught?.message || "No se pudo enviar el pedido."); }
  }
  async function saveAlias(event: any) {
    event.preventDefault(); setError("");
    if (!aliasSupplier || !aliasProductId || !aliasName.trim()) { setError("Completa proveedor, producto y alias."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/supplier_product_aliases", { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ supplier_id: Number(aliasSupplier), product_id: Number(aliasProductId), alias_name: aliasName, supplier_ref: aliasRef, quantity_unit: aliasUnit, source: "Manual" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "No se pudo guardar la equivalencia.");
      setAliases((current) => [result, ...current]); setAliasName(""); setAliasRef(""); setMessage("Equivalencia guardada para este proveedor.");
    } catch (caught: any) { setError(caught?.message || "No se pudo guardar la equivalencia."); }
    finally { setSaving(false); }
  }
  async function toggleAlias(alias: AnyRow) {
    const response = await fetch(`/api/supplier_product_aliases/${alias.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ active: Number(alias.active) === 1 ? 0 : 1 }) });
    if (response.ok) setAliases((current) => current.map((row) => row.id === alias.id ? { ...row, active: Number(alias.active) === 1 ? 0 : 1 } : row));
  }
  async function handleOcrFile(file?: File) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setError("El archivo no puede superar 25 MB."); return; }
    setOcrBusy(true); setError(""); setOcrFileName(file.name); setOcrFileCount((current) => current + 1);
    try {
      let extracted = "";
      if (file.type.startsWith("image/") || file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const tesseract = await import("tesseract.js");
        let pages: Blob[] = [];
        if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
          const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
          pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
          const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
          if (pdfDocument.numPages > 10) throw new Error("El pedido PDF supera el límite de 10 páginas para OCR. Divide el documento y sube las páginas del pedido.");
          for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
            const page = await pdfDocument.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1.6 });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext("2d");
            if (!context) throw new Error("No se pudo preparar una página del PDF para OCR.");
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo convertir la página del PDF.")), "image/png"));
            pages.push(blob);
          }
        } else pages = [file];
        const worker = await tesseract.createWorker("spa");
        try {
          const results = [];
          for (const page of pages) results.push(String((await worker.recognize(page)).data.text || ""));
          extracted = results.join("\n");
        }
        finally { await worker.terminate(); }
      } else if (/text\/|csv|xml|json/i.test(file.type) || /\.(txt|csv|xml|json)$/i.test(file.name)) extracted = await file.text();
      else throw new Error("Formato no compatible. Sube una imagen, PDF de texto, CSV o documento TXT/XML/JSON.");
      const textBlock = extracted.slice(0, 50000);
      setOcrText((current) => current ? `${current}\n\n--- ${file.name} ---\n${textBlock}`.slice(-150000) : textBlock);
      const detectedSupplier = suppliers.find((item) => normalize(extracted).includes(normalize(item.name)));
      if (detectedSupplier) setSupplierId(String(detectedSupplier.id));
      const recognizedLines: DraftLine[] = [];
      const unresolvedLines: UnmatchedOcrLine[] = [];
      const supplierForOcr = Number(detectedSupplier?.id || supplierId || 0);
      const ocrAliases = aliases.filter((candidate) => Number(candidate.supplier_id) === supplierForOcr && Number(candidate.active ?? 1) === 1);
      for (const raw of extracted.split(/\r?\n/).map((row) => row.trim()).filter(Boolean)) {
        const item = normalize(raw);
        const alias = ocrAliases.find((candidate) => item.includes(normalize(candidate.alias_name)) || (candidate.supplier_ref && item.includes(normalize(candidate.supplier_ref))));
        const qtyMatch = raw.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:x|ud(?:s)?\.?|unidades?|cajas?|cjs?\.?|pack)?\b/i);
        const quantity = Math.max(0.0001, Number(String(qtyMatch?.[1] || "1").replace(",", ".")));
        const product = alias ? selectableProducts.find((candidate) => Number(candidate.id) === Number(alias.product_id)) : selectableProducts.find((candidate) => (candidate.sku && item.includes(normalize(candidate.sku))) || item.includes(normalize(candidate.name)));
        if (!product) {
          if (!/\b(total|subtotal|iva|impuesto|pedido|fecha|pagina|cliente|proveedor|direccion|telefono|email)\b/i.test(item) && (qtyMatch || raw.length > 4)) unresolvedLines.push({ id: `${Date.now()}-${unresolvedLines.length}`, text: raw, product_id: "", quantity: String(quantity), supplier_name: raw.replace(qtyMatch?.[0] || "", "").trim(), supplier_ref: "" });
          continue;
        }
        recognizedLines.push({ product_id: Number(product.id), product_name: product.name, quantity, quantity_unit: alias?.quantity_unit || product.purchase_format || product.unit || "unidad", unit_cost: Number(product.cost_price || 0), supplier_product_name: alias?.alias_name || product.name, supplier_ref: alias?.supplier_ref || "", supplier_alias_id: alias?.id || null, source_text: raw });
      }
      if (recognizedLines.length) setLines((current) => [...current, ...recognizedLines]);
      setUnmatchedOcrLines(unresolvedLines);
      setMessage(`${recognizedLines.length} líneas relacionadas${unresolvedLines.length ? ` y ${unresolvedLines.length} pendientes de identificar` : ""}. Revisa cada producto y cantidad antes de guardar.`);
    } catch (caught: any) { setError(caught?.message || "No se pudo leer el documento."); }
    finally { setOcrBusy(false); }
  }

  function queueOcrFiles(files: FileList | File[]) {
    const batch = Array.from(files).filter(Boolean);
    if (!batch.length) return;
    ocrQueueRef.current = ocrQueueRef.current.then(async () => {
      for (const file of batch) await handleOcrFile(file);
    }).catch((caught: any) => setError(caught?.message || "No se pudieron procesar los archivos."));
  }

  function handleOcrDragOver(event: ReactDragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setOcrDropActive(true);
  }

  function handleOcrDrop(event: ReactDragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOcrDropActive(false);
    if (event.dataTransfer.files?.length) queueOcrFiles(event.dataTransfer.files);
  }

  function handleOcrPaste(event: ReactClipboardEvent<HTMLLabelElement>) {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item, index) => {
        const image = item.getAsFile();
        return image ? new File([image], `captura-pedido-${Date.now()}-${index + 1}.png`, { type: image.type || "image/png" }) : null;
      })
      .filter((file): file is File => Boolean(file));
    if (imageFiles.length) {
      event.preventDefault();
      queueOcrFiles(imageFiles);
      return;
    }
    const pastedText = event.clipboardData.getData("text/plain").trim();
    if (pastedText) {
      event.preventDefault();
      queueOcrFiles([new File([pastedText], `texto-pegado-${Date.now()}.txt`, { type: "text/plain" })]);
    }
  }

  function resolveOcrLine(item: UnmatchedOcrLine) {
    const product = selectableProducts.find((candidate) => Number(candidate.id) === Number(item.product_id));
    const quantityValue = Number(String(item.quantity).replace(",", "."));
    if (!product || !(quantityValue > 0)) { setError("Selecciona un producto del catálogo y confirma una cantidad válida para la línea OCR."); return; }
    const alias = aliases.find((candidate) => Number(candidate.supplier_id) === Number(supplierId) && Number(candidate.product_id) === Number(product.id) && Number(candidate.active ?? 1) === 1 && normalize(candidate.alias_name) === normalize(item.supplier_name));
    setLines((current) => [...current, { product_id: Number(product.id), product_name: product.name, quantity: quantityValue, quantity_unit: alias?.quantity_unit || product.purchase_format || product.unit || "unidad", unit_cost: Number(product.cost_price || 0), supplier_product_name: item.supplier_name || product.name, supplier_ref: item.supplier_ref || "", supplier_alias_id: alias?.id || null, source_text: item.text }]);
    setUnmatchedOcrLines((current) => current.filter((row) => row.id !== item.id));
    setError("");
  }

  return <section className="supplier-purchasing-page">
    <div className="manager-head"><div><p className="eyebrow">COMPRAS · PROVEEDORES</p><h2>Pedidos a proveedores</h2><p className="muted">Prepara pedidos, conserva equivalencias y registra la recepción validada en Entradas.</p></div><div><button type="button" className="button secondary" onClick={() => void load()} disabled={loading}>Actualizar</button><button type="button" className="button primary" onClick={() => { setSelectedOrder(null); resetDraft(); setSection("create"); setCreateMode("manual"); }}>Crear pedido</button></div></div>
    {message && <p className="success-message" role="status">{message}</p>}{error && <p className="error-message" role="alert">{error}</p>}
    <nav className="supplier-purchase-tabs" aria-label="Secciones de compras">{([["orders", "Pedidos"], ["recommended", "Compras recomendadas"], ["create", "Crear pedido"], ["aliases", "Equivalencias"]] as const).map(([key, label]) => <button key={key} type="button" className={section === key ? "is-active" : ""} aria-pressed={section === key} onClick={() => { setSection(key); setError(""); }}>{label}</button>)}</nav>
    {section === "orders" && <section className="supplier-orders-panel"><div className="supplier-orders-tools"><input aria-label="Buscar pedidos a proveedores" placeholder="Buscar por código, proveedor u observación…" value={filterText} onChange={(event) => setFilterText(event.target.value)} /><select aria-label="Filtrar por proveedor" value={filterSupplier} onChange={(event) => setFilterSupplier(event.target.value)}><option value="">Todos los proveedores</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><select aria-label="Filtrar por estado" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="">Todos los estados</option>{["Borrador", "Enviado", "En tránsito", "Parcialmente recibido", "Recibido con incidencia", "Recibido", "Cancelado"].map((status) => <option key={status}>{status}</option>)}</select><span>{loading ? "Cargando pedidos…" : `${filteredOrders.length} pedidos`}</span></div>
      {loading ? <div className="data-loading" role="status">Cargando pedidos a proveedores…</div> : filteredOrders.length ? <div className="supplier-orders-list">{filteredOrders.map((order) => <article className="supplier-order-row" key={order.id}><button type="button" className="supplier-order-summary" onClick={() => void openOrder(order)}><span><b>{order.code}</b><small>{order.supplier_name || "Proveedor no indicado"} · Pedido {dateLabel(order.order_date)}{order.expected_date ? ` · Previsto ${dateLabel(order.expected_date)}` : ""}</small></span><strong>{currency(order.amount)}</strong><em className={`supplier-order-status status-${normalize(order.status).replaceAll(" ", "-")}`}>{order.status}</em></button><div className="supplier-order-actions"><a className="row-action workflow" href={`/api/purchase_orders/${order.id}/pdf`}>Descargar PDF</a><button type="button" className="row-action workflow" onClick={() => void sendEmail(order)} disabled={order.status === "Cancelado"}>Enviar email</button><button type="button" className="row-action" onClick={() => { setSelectedOrder(order); onNavigate?.("Entradas"); }}>Registrar en Entradas</button></div></article>)}</div> : <p className="empty-state">No hay pedidos con estos filtros. Crea uno en Manual, Recurrentes o OCR.</p>}</section>}
      {section === "create" && <section className="supplier-order-builder"><div className="supplier-order-builder-head"><div><b>{selectedOrder ? `Editar pedido ${selectedOrder.code}` : "Preparar pedido"}</b><small>{selectedOrder?.status === "Enviado" ? "Puedes actualizar los datos generales; las líneas conservan lo enviado al proveedor." : selectedOrder ? "Edita el borrador o cambia su estado. El stock solo cambia al validar la entrada en almacén." : "El pedido se guarda como borrador. El stock cambia al validar la entrada en almacén."}</small></div><strong>{currency(total)}</strong></div>
      {selectedOrder?.status === "Enviado" ? <p className="supplier-order-locked">El pedido ya se envió. Puedes actualizar fechas y observaciones; las líneas conservan el contenido enviado al proveedor.</p> : <div className="supplier-create-modes" role="tablist" aria-label="Método para preparar el pedido">{([["manual", "Manual"], ["recurrent", "Recurrentes"], ["ocr", "Subida por OCR"]] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={createMode === key} className={createMode === key ? "is-active" : ""} onClick={() => { setCreateMode(key); setError(""); }}>{label}</button>)}</div>}
      <div className="supplier-order-fields"><label>Proveedor *<select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Selecciona un proveedor…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Fecha del pedido *<input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} /></label><label>Entrega prevista<input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></label><label className="supplier-order-notes">Observaciones<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Indicaciones para el proveedor…" /></label>{selectedOrder && <label>Estado del pedido<select value={orderStatus} onChange={(event) => { setOrderStatus(event.target.value); if (event.target.value !== "Cancelado") { setCancellationNote(""); setSendCancellationEmail(false); } }}><option value={selectedOrder.status}>{selectedOrder.status}</option>{selectedOrder.status === "Borrador" && <option value="Enviado">Enviado</option>}<option value="Cancelado">Cancelado</option></select></label>}{orderStatus === "Cancelado" && selectedOrder && <><label className="supplier-order-notes">Motivo de cancelación<textarea value={cancellationNote} onChange={(event) => setCancellationNote(event.target.value)} placeholder="Motivo (opcional), se guardará en el historial" /></label><label className="supplier-cancellation-email"><input type="checkbox" checked={sendCancellationEmail} onChange={(event) => setSendCancellationEmail(event.target.checked)} /> Preguntar al proveedor y enviar email de anulación</label><small className="supplier-cancellation-email-help">Si el proveedor no tiene email configurado, se abrirá tu aplicación de correo para que completes el envío.</small></>}</div>
      {createMode === "manual" && (!selectedOrder || orderStatus === "Borrador") && <><div className="supplier-line-adder"><label className="supplier-product-search">Producto del catálogo<input aria-label="Buscar producto del catálogo" autoComplete="off" placeholder="Busca por nombre, SKU o alias del proveedor…" value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setSelectedProduct(null); }} />{productMatches.length > 0 && <div className="supplier-product-suggestions">{productMatches.map((product) => <button key={product.id} type="button" onClick={() => pickProduct(product)}><b>{product.name}</b><small>{product.sku || "Sin SKU"}{currentAliases.filter((item) => Number(item.product_id) === Number(product.id)).map((alias) => ` · ${alias.alias_name}`).join("")}</small></button>)}</div>}</label><label>Nombre / alias del proveedor<input value={supplierProductName} onChange={(event) => setSupplierProductName(event.target.value)} placeholder="Nombre del artículo del proveedor" /></label><label>Referencia proveedor<input value={supplierRef} onChange={(event) => setSupplierRef(event.target.value)} /></label><label>Unidades / formato<select value={quantityUnit} onChange={(event) => setQuantityUnit(event.target.value)}>{["unidad", "caja", "caja de 4", "caja de 6", "caja de 12", "pack", "palet", "kg", "litro"].map((unit) => <option key={unit}>{unit}</option>)}</select></label><label>Cantidad<input aria-label="Cantidad a pedir" type="number" min="0.0001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>Coste unitario (€)<input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label><label className="supplier-recurring-check"><input type="checkbox" checked={saveRecurring} onChange={(event) => setSaveRecurring(event.target.checked)} /> Guardar en recurrentes</label><button type="button" className="button secondary" onClick={() => addLine()}>Añadir producto</button></div><label className="supplier-alias-remember"><input type="checkbox" checked={rememberAliases} onChange={(event) => setRememberAliases(event.target.checked)} /> Guardar el nombre y la referencia del proveedor como equivalencia para futuras compras</label></>}
      {createMode === "recurrent" && (!selectedOrder || orderStatus === "Borrador") && <section className="supplier-recurrent-panel"><div><b>Selección habitual · {chosenSupplier?.name || "elige proveedor"}</b><small>Artículos guardados con sus cantidades habituales. Puedes cambiar cantidad y formato en el pedido.</small></div>{!supplierId ? <p className="empty-state">Selecciona un proveedor para ver su lista.</p> : currentRecurrences.length ? currentRecurrences.map((item) => { const product = selectableProducts.find((row) => Number(row.id) === Number(item.product_id)); const alias = aliases.find((row) => Number(row.id) === Number(item.supplier_alias_id)); return <article className="supplier-recurrent-row" key={item.id}><span><b>{product?.name || `Producto #${item.product_id}`}</b><small>{alias?.alias_name || product?.sku || "Sin equivalencia"} · Habitual: {item.quantity} {item.quantity_unit}</small></span><strong>{currency(item.unit_cost || product?.cost_price)}</strong><button type="button" className="button secondary" onClick={() => addRecurring(item)}>Añadir</button></article>; }) : <p className="empty-state">Todavía no hay artículos frecuentes para este proveedor. Añade productos en Manual o guarda nuevos desde esta pestaña.</p>}<div className="supplier-recurrent-new"><b>Añadir un nuevo producto habitual</b><label>Producto de nuestro catálogo<input aria-label="Buscar nuevo producto recurrente" autoComplete="off" value={productSearch} placeholder="Nombre o SKU…" onChange={(event) => { setProductSearch(event.target.value); setSelectedProduct(null); }} />{productMatches.length > 0 && <div className="supplier-product-suggestions">{productMatches.map((product) => <button key={product.id} type="button" onClick={() => pickProduct(product)}><b>{product.name}</b><small>{product.sku || "Sin SKU"}</small></button>)}</div>}</label><label>Cantidad habitual<input type="number" min="0.0001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>Formato<select value={quantityUnit} onChange={(event) => setQuantityUnit(event.target.value)}>{["unidad", "caja", "caja de 4", "caja de 6", "caja de 12", "pack", "palet", "kg", "litro"].map((unit) => <option key={unit}>{unit}</option>)}</select></label><label>Coste unitario<input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label><label>Nombre del proveedor<input value={supplierProductName} onChange={(event) => setSupplierProductName(event.target.value)} placeholder="Alias opcional" /></label><label>Referencia proveedor<input value={supplierRef} onChange={(event) => setSupplierRef(event.target.value)} /></label><button type="button" className="button primary" disabled={!selectedProduct || !supplierId || saving} onClick={() => { if (!selectedProduct) return; const line: DraftLine = { product_id: Number(selectedProduct.id), product_name: selectedProduct.name, quantity: Number(quantity || 1), quantity_unit: quantityUnit || selectedProduct.unit || "unidad", unit_cost: Number(unitCost || 0), supplier_product_name: supplierProductName || selectedProduct.name, supplier_ref: supplierRef, recurrent: true }; setLines((current) => [...current, line]); void saveRecurrence(line).then(() => { setRecurrences((current) => { const existing = current.find((item) => Number(item.supplier_id) === Number(supplierId) && Number(item.product_id) === Number(line.product_id)); const next = { ...existing, ...line, id: existing?.id || `new-${line.product_id}`, supplier_id: Number(supplierId), created_at: existing?.created_at || new Date().toISOString() }; return [next, ...current.filter((item) => !(Number(item.supplier_id) === Number(supplierId) && Number(item.product_id) === Number(line.product_id)))]; }); setMessage(`${line.product_name} se añadió al pedido y a la lista recurrente.`); }); setSelectedProduct(null); setProductSearch(""); setSupplierProductName(""); setSupplierRef(""); }}>Guardar y añadir al pedido</button></div></section>}
      {createMode === "ocr" && (!selectedOrder || orderStatus === "Borrador") && <div className="supplier-ocr-panel"><label className={`supplier-ocr-drop${ocrDropActive ? " is-dragging" : ""}`} tabIndex={0} onDragEnter={handleOcrDragOver} onDragOver={handleOcrDragOver} onDragLeave={() => setOcrDropActive(false)} onDrop={handleOcrDrop} onPaste={handleOcrPaste}><input type="file" multiple accept="image/*,.pdf,.txt,.csv,.xml,.json,text/*,application/pdf" onChange={(event) => { if (event.target.files?.length) queueOcrFiles(event.target.files); event.currentTarget.value = ""; }} /><b>{ocrBusy ? "Leyendo documentos…" : "Selecciona, arrastra o pega una captura"}</b><small>{ocrFileCount ? `${ocrFileCount} archivo(s) procesado(s). Último: ${ocrFileName}` : "JPG, PNG, PDF, CSV, TXT, XML o JSON · máximo 25 MB. Puedes seleccionar varias imágenes, arrastrarlas o usar Ctrl+V."}</small></label>{ocrBusy && <p role="status">Reconociendo texto… Las imágenes se añadirán una a una.</p>}{ocrText && <label><b>Transcripción acumulada</b><small>Se conserva el texto de todos los archivos procesados; puedes revisarlo y corregirlo antes de guardar.</small><textarea className="supplier-ocr-text" value={ocrText} onChange={(event) => setOcrText(event.target.value)} /></label>}{unmatchedOcrLines.length > 0 && <section className="supplier-ocr-unmatched"><b>Productos que necesitan revisión ({unmatchedOcrLines.length})</b><small>El texto original se conserva. Relaciona cada línea con nuestro catálogo; al guardar el pedido se recordará el nombre del proveedor como equivalencia.</small>{unmatchedOcrLines.map((item) => <article key={item.id}><span>{item.text}</span><label>Producto<select aria-label={`Producto para línea OCR ${item.text}`} value={item.product_id} onChange={(event) => setUnmatchedOcrLines((current) => current.map((row) => row.id === item.id ? { ...row, product_id: event.target.value } : row))}><option value="">Selecciona del catálogo…</option>{selectableProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label><label>Cantidad<input type="number" min="0.0001" step="any" value={item.quantity} onChange={(event) => setUnmatchedOcrLines((current) => current.map((row) => row.id === item.id ? { ...row, quantity: event.target.value } : row))} /></label><label>Nombre del proveedor<input value={item.supplier_name} onChange={(event) => setUnmatchedOcrLines((current) => current.map((row) => row.id === item.id ? { ...row, supplier_name: event.target.value } : row))} /></label><label>Referencia<input value={item.supplier_ref} onChange={(event) => setUnmatchedOcrLines((current) => current.map((row) => row.id === item.id ? { ...row, supplier_ref: event.target.value } : row))} /></label><button type="button" className="button secondary" onClick={() => resolveOcrLine(item)}>Relacionar y añadir</button></article>)}</section>}<p className="supplier-ocr-note">Las coincidencias se buscan por SKU, nombre y equivalencias del proveedor. Confirma manualmente cualquier línea no reconocida antes de guardar.</p></div>}
      {lines.length > 0 && <div className="supplier-order-lines"><div className="supplier-order-lines-head"><b>Productos del pedido</b><span>{lines.length} líneas</span></div>{lines.map((line, index) => <article className="supplier-order-line" key={`${line.product_id}-${index}`}><div><b>{line.product_name}</b><small>{line.supplier_product_name}{line.supplier_ref ? ` · Ref. ${line.supplier_ref}` : ""}</small></div><label>Cantidad<input aria-label={`Cantidad de ${line.product_name}`} type="number" min="0.0001" step="any" disabled={Boolean(selectedOrder && orderStatus !== "Borrador")} value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} /></label><label>Formato<select aria-label={`Formato de ${line.product_name}`} value={line.quantity_unit} disabled={Boolean(selectedOrder && orderStatus !== "Borrador")} onChange={(event) => updateLine(index, "quantity_unit", event.target.value)}>{["unidad", "caja", "caja de 4", "caja de 6", "caja de 12", "pack", "palet", "kg", "litro"].map((unit) => <option key={unit}>{unit}</option>)}</select></label><label>Coste<input aria-label={`Coste unitario de ${line.product_name}`} type="number" min="0" step="0.01" disabled={Boolean(selectedOrder && orderStatus !== "Borrador")} value={line.unit_cost} onChange={(event) => updateLine(index, "unit_cost", event.target.value)} /></label><strong>{currency(line.quantity * line.unit_cost)}</strong>{(!selectedOrder || orderStatus === "Borrador") && <button type="button" aria-label={`Quitar ${line.product_name}`} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</article>)}</div>}
      <footer className="supplier-order-builder-footer"><span>Total del pedido <b>{currency(total)}</b></span><button type="button" className="button secondary" onClick={() => { resetDraft(); setSelectedOrder(null); }}>Vaciar</button><button type="button" className="button primary" disabled={saving || !supplierId || !lines.length || unmatchedOcrLines.length > 0} onClick={() => void saveOrder()}>{saving ? "Guardando…" : unmatchedOcrLines.length ? "Resuelve las líneas OCR" : selectedOrder ? orderStatus === "Cancelado" ? "Confirmar cancelación" : "Guardar cambios" : "Guardar como borrador"}</button></footer>
    </section>}
    {section === "aliases" && <section className="supplier-alias-manager"><div><b>Equivalencias por proveedor</b><small>Relaciona varios nombres o referencias del proveedor con un único producto del catálogo.</small></div><form onSubmit={saveAlias}><label>Proveedor *<select required value={aliasSupplier} onChange={(event) => setAliasSupplier(event.target.value)}><option value="">Selecciona…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Producto del catálogo *<select required value={aliasProductId} onChange={(event) => setAliasProductId(event.target.value)}><option value="">Selecciona…</option>{selectableProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label><label>Alias del proveedor *<input required value={aliasName} onChange={(event) => setAliasName(event.target.value)} placeholder="Nombre que usa el proveedor" /></label><label>Referencia proveedor<input value={aliasRef} onChange={(event) => setAliasRef(event.target.value)} /></label><label>Formato<select value={aliasUnit} onChange={(event) => setAliasUnit(event.target.value)}>{["unidad", "caja", "caja de 4", "caja de 6", "caja de 12", "pack", "palet", "kg", "litro"].map((unit) => <option key={unit}>{unit}</option>)}</select></label><button className="button primary" disabled={saving}>{saving ? "Guardando…" : "Guardar equivalencia"}</button></form><div className="supplier-alias-list">{aliases.filter((alias) => selectableProductIds.has(Number(alias.product_id))).map((alias) => <article key={alias.id}><span><b>{suppliers.find((item) => Number(item.id) === Number(alias.supplier_id))?.name || "Proveedor"}</b><small>{selectableProducts.find((item) => Number(item.id) === Number(alias.product_id))?.name || "Producto"} ← <strong>{alias.alias_name}</strong>{alias.supplier_ref ? ` · ${alias.supplier_ref}` : ""} · {alias.quantity_unit || "unidad"}</small></span><em>{Number(alias.active) === 1 ? "Activa" : "Inactiva"}</em><button type="button" className="row-action" onClick={() => void toggleAlias(alias)}>{Number(alias.active) === 1 ? "Desactivar" : "Activar"}</button></article>)}</div></section>}
    {selectedOrder && section === "orders" && <div className="preview-overlay" role="dialog" aria-modal="true" aria-label={"Pedido " + selectedOrder.code} onMouseDown={(event) => event.target === event.currentTarget && setSelectedOrder(null)}>
      <article className={orderModalEditing ? "supplier-order-detail is-editing" : "supplier-order-detail"}>
        <header className="preview-header"><div><b>{selectedOrder.code}</b><small>{selectedOrder.supplier_name} · {orderModalEditing ? "Editando pedido" : selectedOrder.status}</small></div><button type="button" className="preview-close" aria-label="Cerrar detalle" onClick={() => { setSelectedOrder(null); setOrderModalEditing(false); }}>×</button></header>
        {orderModalEditing ? <form className="supplier-order-edit-form" onSubmit={(event) => void saveOrder(event)}>
          <div className="supplier-order-edit-grid">
            <label>Proveedor *<select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Selecciona un proveedor…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            <label>Fecha del pedido *<input required type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} /></label>
            <label>Entrega prevista<input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></label>
            <label>Estado del pedido<select value={orderStatus} onChange={(event) => { setOrderStatus(event.target.value); if (event.target.value !== "Cancelado") { setCancellationNote(""); setSendCancellationEmail(false); } }}>{orderStatusOptions.map((status) => <option key={status} value={status} disabled={receiptLockedStatuses.includes(status) && status !== selectedOrder.status}>{status}</option>)}</select></label>
            <label className="supplier-order-edit-notes">Observaciones<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Indicaciones para el proveedor…" /></label>
          </div>
          {orderStatus === "Cancelado" && <div className="supplier-order-cancellation"><label>Motivo de cancelación<textarea value={cancellationNote} onChange={(event) => setCancellationNote(event.target.value)} placeholder="Motivo (opcional), se guardará en el historial" /></label><label className="supplier-cancellation-email"><input type="checkbox" checked={sendCancellationEmail} onChange={(event) => setSendCancellationEmail(event.target.checked)} /> Preguntar al proveedor y enviar email de anulación</label><small className="supplier-cancellation-email-help">Si el proveedor no tiene email configurado, se abrirá tu aplicación de correo para completar el envío.</small></div>}
          <section className="supplier-order-edit-lines"><div className="supplier-order-edit-lines-head"><b>Productos del pedido</b><span>{lines.length} líneas · {currency(orderLinesEditable ? total : selectedOrder.amount)}</span></div>
            {lines.map((line, index) => <article className="supplier-order-edit-line" key={line.product_id + "-" + index}><label>Producto<span className="supplier-order-edit-product-name">{line.product_name}</span></label><label>Nombre del proveedor<input title={line.supplier_product_name} value={line.supplier_product_name} disabled={!orderLinesEditable} onChange={(event) => updateLine(index, "supplier_product_name", event.target.value)} /></label><label>Referencia<input value={line.supplier_ref} disabled={!orderLinesEditable} onChange={(event) => updateLine(index, "supplier_ref", event.target.value)} /></label><label>Cantidad<input type="number" min="0.0001" step="any" required value={line.quantity} disabled={!orderLinesEditable} onChange={(event) => updateLine(index, "quantity", event.target.value)} /></label><label>Formato<select value={line.quantity_unit} disabled={!orderLinesEditable} onChange={(event) => updateLine(index, "quantity_unit", event.target.value)}>{["unidad", "caja", "caja de 4", "caja de 6", "caja de 12", "pack", "palet", "kg", "litro"].map((unit) => <option key={unit}>{unit}</option>)}</select></label><label>Coste unitario<input type="number" min="0" step="0.01" required value={line.unit_cost} disabled={!orderLinesEditable} onChange={(event) => updateLine(index, "unit_cost", event.target.value)} /></label><strong>{currency(line.quantity * line.unit_cost)}</strong>{orderLinesEditable && <button type="button" aria-label={"Quitar " + line.product_name} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</article>)}
            {orderLinesEditable && <div className="supplier-order-edit-add-line"><label className="supplier-product-search">Añadir producto<input aria-label="Buscar producto para añadir a la compra" autoComplete="off" placeholder="Busca por nombre, SKU o alias…" value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setSelectedProduct(null); }} />{productMatches.length > 0 && <div className="supplier-product-suggestions">{productMatches.map((product) => <button key={product.id} type="button" onClick={() => pickProduct(product)}><b>{product.name}</b><small>{product.sku || "Sin SKU"}{currentAliases.filter((alias) => Number(alias.product_id) === Number(product.id)).map((alias) => " · " + alias.alias_name).join("")}</small></button>)}</div>}</label><label>Nombre proveedor<input value={supplierProductName} onChange={(event) => setSupplierProductName(event.target.value)} /></label><label>Referencia<input value={supplierRef} onChange={(event) => setSupplierRef(event.target.value)} /></label><label>Formato<select value={quantityUnit} onChange={(event) => setQuantityUnit(event.target.value)}>{["unidad", "caja", "caja de 4", "caja de 6", "caja de 12", "pack", "palet", "kg", "litro"].map((unit) => <option key={unit}>{unit}</option>)}</select></label><label>Cantidad<input type="number" min="0.0001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>Coste unitario<input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label><button type="button" className="button secondary" onClick={() => addLine()}>Añadir línea</button></div>}
            {!orderLinesEditable && <p className="supplier-order-edit-note">Las líneas están protegidas porque el pedido ya tiene una recepción validada o está cancelado. Corrige cantidades desde Entradas para mantener el stock y la trazabilidad.</p>}
          </section>
          <footer className="preview-actions supplier-order-edit-footer"><span className="supplier-order-edit-total">Total del pedido <b>{currency(orderLinesEditable ? total : selectedOrder.amount)}</b></span><button type="button" className="button secondary" onClick={() => { hydrateOrderEditor(selectedOrder); setOrderModalEditing(false); }}>Cancelar edición</button><button type="submit" className="button primary" disabled={saving || !supplierId || !lines.length}>{saving ? "Guardando…" : orderStatus === "Cancelado" ? "Confirmar cancelación" : "Guardar cambios"}</button></footer>
        </form> : <>
          <div className="supplier-order-detail-meta"><span><b>Fecha pedido</b>{dateLabel(selectedOrder.order_date)}</span><span><b>Entrega prevista</b>{dateLabel(selectedOrder.expected_date)}</span><span><b>Total</b>{currency(selectedOrder.amount)}</span><span><b>Estado</b>{selectedOrder.status}</span></div>{selectedOrder.notes && <p className="supplier-order-detail-notes"><b>Observaciones del pedido</b>{selectedOrder.notes}</p>}<div className="supplier-order-detail-lines">{(selectedOrder.lines || []).map((line: AnyRow) => <div key={line.id}><span><b>{line.product_name}</b><small>{line.supplier_product_name || line.product_name}{line.supplier_ref ? " · " + line.supplier_ref : ""}</small></span><span>{line.quantity} {line.quantity_unit || "unidad"}</span><strong>{currency(line.amount)}</strong></div>)}</div>
          <section className="supplier-observations"><b>Observaciones y seguimiento</b><div className="supplier-observation-add"><textarea aria-label="Nueva observación" value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Añade una nota de seguimiento…" /><button type="button" className="button secondary" disabled={saving || !observation.trim()} onClick={() => void addObservation()}>{saving ? "Guardando…" : "Añadir observación"}</button></div>{(selectedOrder.observations || []).map((item: AnyRow) => <p key={item.id}><span>{item.observation}</span><small>{item.created_by || "Usuario local"} · {item.created_at ? new Date(item.created_at).toLocaleString("es-ES") : "—"}</small></p>)}</section>
          <p className="supplier-order-edit-note">Desde aquí puedes editar los datos generales, las líneas y el estado. Los estados de recepción se validan en Entradas para no alterar el stock.</p><footer className="preview-actions"><a className="button secondary" href={"/api/purchase_orders/" + selectedOrder.id + "/pdf"}>Descargar PDF</a><button type="button" className="button secondary" onClick={() => void sendEmail(selectedOrder)}>Enviar email</button><button type="button" className="button workflow" onClick={() => { const current = selectedOrder; setSelectedOrder(null); onNavigate?.("Entradas"); setMessage("En Entradas, selecciona " + current.code + " en “Pedido de compra relacionado”; sus líneas y cantidades se cargarán automáticamente."); }}>Registrar en Entradas</button><button type="button" className="button primary" onClick={() => { hydrateOrderEditor(selectedOrder); setOrderModalEditing(true); }}>Editar pedido</button></footer>
        </>}
      </article>
    </div>}
    {section === "recommended" && <section className="supplier-recommended-panel" aria-label="Compras recomendadas"><div className="supplier-recommended-head"><div><b>Productos bajo mínimo</b><small>Recomendaciones calculadas con el stock disponible, descontando las reservas de pedidos.</small></div><strong>{loading ? "—" : `${recommendedProducts.length} productos`}</strong></div>{loading ? <div className="data-loading" role="status">Calculando recomendaciones…</div> : recommendedProducts.length ? <div className="supplier-recommended-list">{recommendedProducts.map(({ product, available, minimum, suggested }) => <article className="supplier-recommended-row" key={product.id}><div><b>{product.name}</b><small>{product.sku || "Sin referencia"}{product.supplier_name ? ` · ${product.supplier_name}` : ""}</small></div><span><b>{available}</b><small>disponibles</small></span><span><b>{minimum}</b><small>mínimo</small></span><strong><b>{suggested}</b><small>unidades sugeridas</small></strong></article>)}</div> : <p className="empty-state">No hay productos por debajo del stock mínimo.</p>}</section>}
  </section>;
}
