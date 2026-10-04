"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DeliverySignaturePanel, DriverDailyClosingPanel } from "../page";
import BarcodeScanner from "../components/BarcodeScanner";

declare global {
  interface Window {
    L?: any;
  }
}

function todayInput() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function offsetDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  const match = String(value || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Sin fecha";
}

function mapsUrl(item: any) {
  const lat = Number(item.latitude), lon = Number(item.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  const query = [item.client_name, item.address, item.city].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function haversineKm(aLat: any, aLon: any, bLat: any, bLon: any) {
  const rad = (value: any) => Number(value) * Math.PI / 180;
  const dLat = rad(Number(bLat) - Number(aLat)), dLon = rad(Number(bLon) - Number(aLon));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function suggestedStopsWithDistances(items: any[], origin: any = null) {
  let previous: any = origin && Number.isFinite(Number(origin.latitude)) && Number.isFinite(Number(origin.longitude))
    ? { latitude: Number(origin.latitude), longitude: Number(origin.longitude) }
    : null;
  return items.map((item, index) => {
    const latitude = Number(item.latitude), longitude = Number(item.longitude);
    const located = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0;
    const distance = located && previous ? Number(haversineKm(previous.latitude, previous.longitude, latitude, longitude).toFixed(2)) : 0;
    if (located) previous = { latitude, longitude };
    return { ...item, id: `suggested-${item.id}`, shipment_id: item.id, position: index + 1, distance_km: distance, status: item.status === "Entregado" ? "Completada" : "Pendiente" };
  });
}

function warehouseOriginFromRows(rows: any[]) {
  const warehouseRows = Array.isArray(rows) ? rows : [];
  const warehouse = warehouseRows.find((item: any) => /palencia|inglaterra|34004/i.test(`${item.name || ""} ${item.address || ""}`))
    || warehouseRows.find((item: any) => /principal/i.test(String(item.name || "")))
    || warehouseRows.find((item: any) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
    || warehouseRows[0];
  const latitude = Number(warehouse?.latitude);
  const longitude = Number(warehouse?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === 0 || longitude === 0) return null;
  return { latitude, longitude, label: [warehouse?.name || "Almacén", warehouse?.address || warehouse?.city || ""].filter(Boolean).join(" · ") };
}

function routeMapsUrl(route: any, stops: any[], origin: any = null) {
  if (route?.maps_url) return String(route.maps_url);
  const located = (Array.isArray(stops) ? stops : []).filter((stop) => Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude)) || [stop.address, stop.city].some(Boolean));
  if (!located.length) return "";
  const value = (stop: any) => Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude)) && Number(stop.latitude) !== 0 && Number(stop.longitude) !== 0
    ? `${Number(stop.latitude)},${Number(stop.longitude)}`
    : [stop.address, stop.city].filter(Boolean).join(", ");
  const values = located.map(value);
  const originValue = origin && Number.isFinite(Number(origin.latitude)) && Number.isFinite(Number(origin.longitude))
    ? `${Number(origin.latitude)},${Number(origin.longitude)}`
    : values[0];
  const originQuery = encodeURIComponent(originValue);
  const destination = encodeURIComponent(values.at(-1) || values[0]);
  const waypoints = values.slice(originValue === values[0] ? 1 : 0, -1).map((item) => encodeURIComponent(item)).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${originQuery}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ""}`;
}

function loadRepartoLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("El mapa solo se carga en el navegador"));
  if (window.L) return Promise.resolve(window.L);
  if (!document.getElementById("reparto-leaflet-css")) {
    const link = document.createElement("link");
    link.id = "reparto-leaflet-css";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }
  const existing = document.querySelector<HTMLScriptElement>('script[data-reparto-leaflet="true"]');
  if (existing) return new Promise((resolve, reject) => { existing.addEventListener("load", () => resolve(window.L)); existing.addEventListener("error", reject); });
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.dataset.repartoLeaflet = "true";
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function RepartoRouteMap({ stops, route, origin, currentPosition }: { stops: any[]; route: any; origin: any; currentPosition: any }) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapKey = `${Number(route?.id || 0)}|${stops.map((stop) => `${stop.id}:${stop.latitude}:${stop.longitude}:${stop.position}`).join("|")}|${currentPosition?.latitude || ""}:${currentPosition?.longitude || ""}`;
  useEffect(() => {
    let disposed = false;
    const setup = async () => {
      try {
        const L = await loadRepartoLeaflet();
        if (disposed || !mapElementRef.current) return;
        const map = L.map(mapElementRef.current, { zoomControl: true, scrollWheelZoom: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© Colaboradores de OpenStreetMap" }).addTo(map);
        const validStops = stops.filter((stop) => Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude)) && Number(stop.latitude) !== 0 && Number(stop.longitude) !== 0);
        const routeOrigin = Number.isFinite(Number(route?.origin_latitude)) && Number.isFinite(Number(route?.origin_longitude)) && Number(route.origin_latitude) !== 0 && Number(route.origin_longitude) !== 0
          ? [[Number(route.origin_latitude), Number(route.origin_longitude)] as [number, number]]
          : origin && Number.isFinite(Number(origin.latitude)) && Number.isFinite(Number(origin.longitude))
            ? [[Number(origin.latitude), Number(origin.longitude)] as [number, number]]
            : [];
        const routeCoordinates: [number, number][] = [...routeOrigin, ...validStops.map((stop) => [Number(stop.latitude), Number(stop.longitude)] as [number, number])];
        if (!routeCoordinates.length) return;
        if (routeCoordinates.length > 1) L.polyline(routeCoordinates, { color: "#bd2027", weight: 4, opacity: 0.82 }).addTo(map);
        const icon = (label: string, kind: "stop" | "origin" | "truck", delivered = false) => L.divIcon({ className: "reparto-leaflet-icon", html: `<span class="reparto-leaflet-marker ${kind}${delivered ? " delivered" : ""}">${label}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
        if (routeOrigin.length) L.marker(routeOrigin[0], { icon: icon("N", "origin"), interactive: false }).addTo(map).bindTooltip(origin?.label || route?.origin_address || "Almacén");
        validStops.forEach((stop, index) => L.marker([Number(stop.latitude), Number(stop.longitude)], { icon: icon(String(stop.position || index + 1), "stop", ["Entregado", "Completada"].includes(String(stop.status || ""))) }).addTo(map).bindTooltip(`${stop.position || index + 1}. ${stop.client_name || "Cliente"}`));
        const truckLatitude = Number(currentPosition?.latitude), truckLongitude = Number(currentPosition?.longitude);
        if (Number.isFinite(truckLatitude) && Number.isFinite(truckLongitude) && truckLatitude !== 0 && truckLongitude !== 0) L.marker([truckLatitude, truckLongitude], { icon: icon("●", "truck"), zIndexOffset: 1000 }).addTo(map).bindTooltip("Posición actual del camión");
        map.fitBounds(L.latLngBounds(routeCoordinates), { padding: [28, 28], maxZoom: 14 });
      } catch {
        if (!disposed && mapElementRef.current) mapElementRef.current.innerHTML = "<span class=\"reparto-route-map-error\">No se ha podido cargar el mapa. Puedes abrir la ruta en Google Maps.</span>";
      }
    };
    void setup();
    return () => { disposed = true; if (mapElementRef.current) mapElementRef.current.innerHTML = ""; };
  }, [mapKey, origin?.latitude, origin?.longitude]);
  return <div ref={mapElementRef} className="reparto-route-map-canvas" aria-label="Mapa de la ruta de reparto" />;
}

function RepartoRouteMapPanel({ stops, route, origin, currentPosition, gpsActive, gpsError, onStartGps, onStopGps }: { stops: any[]; route: any; origin: any; currentPosition: any; gpsActive: boolean; gpsError: string; onStartGps: () => void; onStopGps: () => void }) {
  const located = stops.filter((stop) => Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude)) && Number(stop.latitude) !== 0 && Number(stop.longitude) !== 0);
  const routeLink = routeMapsUrl(route, stops, origin);
  const routeOrigin = route && Number.isFinite(Number(route.origin_latitude)) && Number.isFinite(Number(route.origin_longitude)) ? { latitude: Number(route.origin_latitude), longitude: Number(route.origin_longitude), label: route.origin_address || origin?.label || "Almacén" } : origin;
  const displayStops = stops.map((stop, index) => {
    const previous = index > 0 ? stops[index - 1] : routeOrigin;
    const fallbackDistance = previous && Number.isFinite(Number(previous.latitude)) && Number.isFinite(Number(previous.longitude)) && Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude))
      ? Number(haversineKm(previous.latitude, previous.longitude, stop.latitude, stop.longitude).toFixed(2))
      : null;
    const storedDistance = Number(stop.distance_km);
    const legDistance = Number.isFinite(storedDistance) && storedDistance > 0 ? storedDistance : fallbackDistance;
    return { ...stop, route_leg_km: legDistance };
  });
  return <section className="reparto-route-map panel" aria-label="Mapa y seguimiento de ruta"><header className="reparto-route-map-head"><div><p className="eyebrow">MAPA Y SEGUIMIENTO</p><h2>{route ? `Ruta ${route.code}` : "Ruta sugerida"}</h2><span>{located.length}/{stops.length} puntos geolocalizados · La línea respeta el orden de las paradas.</span></div><div className="reparto-route-map-actions">{routeLink && <a className="button secondary" href={routeLink} target="_blank" rel="noreferrer">↗ Ruta completa en Google Maps</a>}{route && <button type="button" className={`button ${gpsActive ? "secondary" : "primary"}`} onClick={gpsActive ? onStopGps : onStartGps}>{gpsActive ? "Detener seguimiento" : "Compartir mi ubicación"}</button>}</div></header>{gpsError && <p className="reparto-route-map-error-message" role="alert">{gpsError}</p>}{gpsActive && <p className="reparto-route-map-live" role="status">● GPS activo · la posición se actualiza mientras conduces{currentPosition?.recorded_at ? ` · ${new Date(currentPosition.recorded_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>}{located.length ? <RepartoRouteMap stops={stops} route={route} origin={origin} currentPosition={currentPosition} /> : <div className="reparto-route-map-empty">No hay puntos geolocalizados para dibujar la ruta. Revisa las direcciones desde el CRM.</div>}<ol className="reparto-route-map-stops">{displayStops.map((stop, index) => <li key={stop.id}><b>{stop.position || index + 1}</b><span><strong>{stop.client_name || "Cliente"}</strong><small>{[stop.address, stop.city].filter(Boolean).join(" · ") || "Dirección pendiente"}</small><small className="reparto-route-map-distance">{stop.route_leg_km === null ? "Distancia pendiente" : `${index === 0 ? "Desde almacén" : `Desde parada ${index}`} · ${Number(stop.route_leg_km).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km estimados`}</small></span></li>)}</ol></section>;
}

function cleanPhone(value: any) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 9 ? `34${digits}` : digits;
}

function phoneUrl(value: any) {
  const phone = cleanPhone(value);
  return phone ? `tel:+${phone}` : "";
}

function whatsappUrl(value: any, shipment: any) {
  const phone = cleanPhone(value);
  if (!phone) return "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Hola, somos Exclusivas Inteligentes. Estamos llegando con el pedido ${shipment?.code || ""}.`)}`;
}

function shipmentView(item: any, clients: any[], points: any[]) {
  const client = clients.find((row) => Number(row.id) === Number(item.client_id));
  const point = points.find((row) => Number(row.id) === Number(item.collection_point_id));
  return {
    ...item,
    client_name: client?.name || "Cliente sin nombre",
    address: item.address || point?.address || client?.address || "Dirección no indicada",
    city: item.delivery_city || point?.city || client?.city || "",
    opening_time: item.delivery_window_start || point?.opening_time || client?.opening_time || "",
    closing_time: item.delivery_window_end || point?.closing_time || client?.closing_time || "",
    latitude: item.latitude ?? point?.latitude ?? client?.latitude,
    longitude: item.longitude ?? point?.longitude ?? client?.longitude,
    shipping_date: item.shipping_date || String(item.expected_delivery_at || item.delivery_date || "").slice(0, 10),
  };
}

function parsePaymentAttachments(value: any): any[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function DeliveryPaymentPanel({ shipment, actor, onSaved }: { shipment: any; actor: string; onSaved: (shipment: any) => void }) {
  const [status, setStatus] = useState(String(shipment?.payment_received_status || "Pendiente"));
  const [amount, setAmount] = useState(String(shipment?.payment_received_amount ?? ""));
  const [method, setMethod] = useState(String(shipment?.payment_received_method || ""));
  const [reference, setReference] = useState(String(shipment?.payment_received_reference || ""));
  const [note, setNote] = useState(String(shipment?.payment_received_note || ""));
  const [attachments, setAttachments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const existingAttachments = parsePaymentAttachments(shipment?.payment_received_attachments_json);
  const trackingToken = String(shipment?.public_tracking_token || "").trim();
  const shareUrl = trackingToken && typeof window !== "undefined" ? `${window.location.origin}/seguimiento/${encodeURIComponent(trackingToken)}` : "";

  useEffect(() => {
    setStatus(String(shipment?.payment_received_status || "Pendiente"));
    setAmount(String(shipment?.payment_received_amount ?? ""));
    setMethod(String(shipment?.payment_received_method || ""));
    setReference(String(shipment?.payment_received_reference || ""));
    setNote(String(shipment?.payment_received_note || ""));
    setAttachments([]);
    setMessage("");
    setExpanded(false);
  }, [shipment?.id]);

  async function readAttachments(files: FileList | null) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    if (existingAttachments.length + attachments.length + selected.length > 4) return setMessage("Puedes guardar como máximo 4 justificantes.");
    if (selected.some((file) => file.size > 6 * 1024 * 1024)) return setMessage("Cada justificante no puede superar 6 MB.");
    try {
      const loaded = await Promise.all(selected.map((file) => new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, mime: file.type || "application/octet-stream", data: String(reader.result || "") });
        reader.onerror = () => reject(new Error("No se pudo leer uno de los justificantes."));
        reader.readAsDataURL(file);
      })));
      setAttachments((current) => [...current, ...loaded].slice(0, 4 - existingAttachments.length));
      setMessage("");
    } catch (error: any) { setMessage(error?.message || "No se pudieron añadir los justificantes."); }
  }

  async function savePayment() {
    const numericAmount = amount.trim() ? Number(amount) : 0;
    if (!Number.isFinite(numericAmount) || numericAmount < 0) return setMessage("Indica un importe válido.");
    if (status === "Recibido" && !method) return setMessage("Indica cómo se ha recibido el cobro.");
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/shipments/${shipment.id}/payment-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Actor": actor },
        body: JSON.stringify({ payment_status: status, amount: numericAmount, method, reference, note, attachments }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar el cobro.");
      onSaved(body);
      setAttachments([]);
      setMessage(status === "Recibido" ? "Cobro y justificantes guardados." : "Estado del cobro guardado.");
    } catch (error: any) { setMessage(error?.message || "No se pudo guardar el cobro."); }
    finally { setSaving(false); }
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setMessage("Enlace del albarán copiado."); }
    catch { setMessage("No se ha podido copiar. Mantén pulsado el enlace para copiarlo."); }
  }

  const allAttachments = [...existingAttachments, ...attachments];
  return <section className={`reparto-payment-panel${expanded ? " is-expanded" : ""}`} aria-label="Talón y cobro recibido">
    <div className="reparto-payment-head"><div><p className="eyebrow">TALÓN Y COBRO</p><h3>Justificante de recepción</h3><span>Registra el importe, la forma de cobro y una foto o PDF del talón recibido. Si hay factura, también quedará reflejado en Cobros.</span></div><strong className={`reparto-payment-badge ${status === "Recibido" ? "received" : status === "No recibido" ? "missing" : "pending"}`}>{status}</strong><button type="button" className="reparto-panel-toggle" onClick={() => setExpanded((current) => !current)}>{expanded ? "Ocultar" : "Abrir"}</button></div>
    <div className="reparto-payment-fields">
      <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)} disabled={saving}><option>Pendiente</option><option>Recibido</option><option>No recibido</option></select></label>
      <label>Importe recibido<input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" disabled={saving} /></label>
      <label>Forma de cobro<select value={method} onChange={(event) => setMethod(event.target.value)} disabled={saving}><option value="">Seleccionar…</option><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Talón</option><option>Otro</option></select></label>
      <label>Referencia / nº de talón<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Ej. TAL-00481" disabled={saving} /></label>
      <label className="reparto-payment-wide">Anotación<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Ej. talón entregado por el cliente, pendiente de ingresar…" disabled={saving} /></label>
    </div>
    <label className="reparto-payment-file">Añadir foto o PDF del talón / justificante<input type="file" accept="image/*,.pdf" capture="environment" multiple onChange={(event) => { void readAttachments(event.target.files); event.currentTarget.value = ""; }} disabled={saving || allAttachments.length >= 4} /><small>Hasta 4 archivos · máximo 6 MB cada uno</small></label>
    {allAttachments.length > 0 && <div className="reparto-payment-files"><b>Justificantes adjuntos</b><div>{allAttachments.map((file, index) => <article key={`${file.name || "justificante"}-${index}`}>{String(file.mime || "").includes("pdf") ? <a href={file.url || file.data} target="_blank" rel="noreferrer" className="reparto-payment-pdf">PDF</a> : <img src={file.thumbnail_url || file.url || file.data} alt={file.name || "Justificante del cobro"} />}<span>{file.name || `Justificante ${index + 1}`}</span>{index >= existingAttachments.length && <button type="button" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index - existingAttachments.length))}>Quitar</button>}</article>)}</div></div>}
    {message && <p className="reparto-payment-message" role="status">{message}</p>}
    <div className="reparto-payment-actions"><button type="button" className="button primary" onClick={() => void savePayment()} disabled={saving}>{saving ? "Guardando…" : "Guardar talón y cobro"}</button>{shareUrl && <div className="reparto-client-link"><div><b>Albarán para el cliente</b><small>Enlace seguro al seguimiento y albarán firmado</small></div><a href={shareUrl} target="_blank" rel="noreferrer">Abrir copia</a><button type="button" onClick={() => void copyShareUrl()}>Copiar enlace</button></div>}</div>
  </section>;
}

function DeliveryExpensePanel({ actor }: { actor: string }) {
  const [date, setDate] = useState(todayInput);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Combustible");
  const [vendor, setVendor] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Tarjeta");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/expenses?view=lookup&limit=100", { cache: "no-store" });
      const data = response.ok ? await response.json() : [];
      setRows((Array.isArray(data) ? data : []).filter((row) => String(row.created_by || "") === actor).slice(0, 5));
    } catch { setRows([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [actor]);

  function readFile(selected: File | undefined) {
    if (!selected) return;
    if (selected.size > 8 * 1024 * 1024) return setMessage("El justificante no puede superar 8 MB.");
    const reader = new FileReader();
    reader.onload = () => { setFile({ name: selected.name, mime: selected.type || "application/octet-stream", data: String(reader.result || "") }); setMessage(""); };
    reader.onerror = () => setMessage("No se ha podido leer el justificante.");
    reader.readAsDataURL(selected);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) return setMessage("Indica un importe válido.");
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({
        code: `GAS-${String(Date.now()).slice(-8)}`, expense_date: date, category, vendor, amount: numericAmount, vat: 21, payment_method: paymentMethod, notes, status: "Pendiente", created_by: actor,
        ...(file ? { attachment_name: file.name, attachment_mime: file.mime, attachment_data: file.data } : {}),
      }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se ha podido guardar el gasto.");
      setAmount(""); setVendor(""); setNotes(""); setFile(null); setMessage(`Gasto ${body.code || "registrado"} enviado a revisión.`); await load();
    } catch (error: any) { setMessage(error?.message || "No se ha podido guardar el gasto."); }
    finally { setSaving(false); }
  }

  return <section className={`reparto-expense-panel panel${expanded ? " is-expanded" : ""}`} aria-label="Gastos de ruta">
    <header className="reparto-expense-head"><div><p className="eyebrow">GASTOS DE RUTA</p><h2>Subir un gasto</h2><span>Envía combustible, aparcamiento, comidas u otros gastos con una foto del ticket.</span></div><strong>Revisión pendiente</strong><button type="button" className="reparto-panel-toggle" onClick={() => setExpanded((current) => !current)}>{expanded ? "Ocultar" : "Abrir"}</button></header>
    <form className="reparto-expense-form" onSubmit={(event) => void save(event)}>
      <div className="reparto-expense-fields"><label>Importe total *<input required type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00 €" disabled={saving} /></label><label>Fecha *<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={saving} /></label><label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)} disabled={saving}><option>Combustible</option><option>Aparcamiento</option><option>Comida</option><option>Peaje</option><option>Material</option><option>Otros</option></select></label><label>Forma de pago<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={saving}><option>Tarjeta</option><option>Efectivo</option><option>Transferencia</option><option>Otro</option></select></label><label>Comercio o proveedor<input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="Ej. Gasolinera, restaurante…" disabled={saving} /></label><label className="reparto-expense-wide">Explicación del gasto *<textarea required rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. Repostaje de la ruta Madrid · Toledo…" disabled={saving} /></label></div>
      <div className="reparto-expense-upload"><label>Ticket o factura<span className="reparto-expense-photo-button">📷 Hacer foto o subir ticket<input type="file" accept="image/*,.pdf" capture="environment" onChange={(event) => { readFile(event.target.files?.[0]); event.currentTarget.value = ""; }} disabled={saving} /></span><small>Haz una foto desde el móvil o sube un PDF · máximo 8 MB</small></label>{file && <div className="reparto-expense-file">{String(file.mime).includes("pdf") ? <b>PDF</b> : <img src={file.data} alt="Vista previa del justificante" />}<span>{file.name}</span><button type="button" onClick={() => setFile(null)} aria-label="Quitar justificante">×</button></div>}</div>
      {message && <p className="reparto-expense-message" role="status">{message}</p>}
      <footer><span>Se guardará a tu nombre: <b>{actor}</b></span><button type="submit" className="button primary" disabled={saving}>{saving ? "Enviando…" : "Enviar gasto a revisión"}</button></footer>
    </form>
    <div className="reparto-expense-history"><div><b>Últimos gastos enviados</b><small>{loading ? "Cargando…" : rows.length ? "Solo visibles para tu usuario" : "Todavía no has enviado gastos"}</small></div>{rows.map((row) => <article key={row.id}><span>{row.category || "Otros"}</span><b>{Number(row.amount || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</b><small>{dateLabel(row.expense_date)} · {row.vendor || "Sin comercio"}{row.attachment_name ? " · 📎 ticket" : ""}</small><em>{row.status || "Pendiente"}</em></article>)}</div>
  </section>;
}

export default function RepartoPage() {
  const [date, setDate] = useState(todayInput);
  const [shipments, setShipments] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [points, setPoints] = useState<any[]>([]);
  const [warehouseOrigin, setWarehouseOrigin] = useState<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<number | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<any>(null);
  const [selectedLines, setSelectedLines] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [returnLine, setReturnLine] = useState<any>(null);
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnReason, setReturnReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [actor, setActor] = useState("Reparto móvil");
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [gpsPosition, setGpsPosition] = useState<any>(null);
  const [suggestedOrderByDate, setSuggestedOrderByDate] = useState<Record<string, number[]>>({});
  const [orderStorageReady, setOrderStorageReady] = useState(false);
  const [draggingStopId, setDraggingStopId] = useState<string | number | null>(null);
  const [dragOverStopId, setDragOverStopId] = useState<string | number | null>(null);
  const gpsWatchRef = useRef<number | null>(null);
  const selectedShipmentRef = useRef<any>(null);
  const returnsOpenRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("excluvas.session") || sessionStorage.getItem("excluvas.session");
      const session = raw ? JSON.parse(raw) : null;
      if (session?.username) setActor(String(session.username));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("excluvas.reparto.suggested-order");
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object") setSuggestedOrderByDate(parsed);
    } catch {}
    setOrderStorageReady(true);
  }, []);

  useEffect(() => {
    if (!orderStorageReady) return;
    try { localStorage.setItem("excluvas.reparto.suggested-order", JSON.stringify(suggestedOrderByDate)); } catch {}
  }, [suggestedOrderByDate, orderStorageReady]);

  useEffect(() => {
    selectedShipmentRef.current = selectedShipment;
    returnsOpenRef.current = returnsOpen;
    document.body.classList.toggle("reparto-modal-open", Boolean(selectedShipment || returnsOpen));
    return () => { document.body.classList.remove("reparto-modal-open"); };
  }, [selectedShipment, returnsOpen]);

  useEffect(() => {
    const repartoHistoryState = { reparto: true };
    const closeCurrentOverlay = () => {
      if (returnsOpenRef.current) {
        setReturnsOpen(false);
        return true;
      }
      if (selectedShipmentRef.current) {
        setSelectedShipment(null);
        setSelectedLines([]);
        return true;
      }
      return false;
    };
    const handlePopState = () => {
      closeCurrentOverlay();
      window.history.pushState(repartoHistoryState, "", window.location.href);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeCurrentOverlay();
    };
    window.history.pushState(repartoHistoryState, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [shipmentResponse, routeResponse, warehouseResponse] = await Promise.all([
        fetch(`/api/shipments?date=${encodeURIComponent(date)}`),
        fetch(`/api/routes?date=${encodeURIComponent(date)}`),
        fetch("/api/warehouses?limit=50"),
      ]);
      const rawShipments = shipmentResponse.ok ? await shipmentResponse.json() : [];
      const shipmentRows = Array.isArray(rawShipments) ? rawShipments : [];
      const queryIds = (values: any[]) => [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].join(",") || "0";
      const [clientResponse, pointResponse] = await Promise.all([
        fetch(`/api/clients?view=lookup&ids=${queryIds(shipmentRows.map((item: any) => item.client_id))}`),
        fetch(`/api/collection_points?view=lookup&ids=${queryIds(shipmentRows.map((item: any) => item.collection_point_id))}`),
      ]);
      const nextClients = clientResponse.ok ? await clientResponse.json() : [];
      const nextPoints = pointResponse.ok ? await pointResponse.json() : [];
      setClients(Array.isArray(nextClients) ? nextClients : []);
      setPoints(Array.isArray(nextPoints) ? nextPoints : []);
      const nextShipments = shipmentRows.map((item) => shipmentView(item, nextClients, nextPoints));
      setShipments(nextShipments);
      const nextRoutes = routeResponse.ok ? await routeResponse.json() : [];
      const nextWarehouses = warehouseResponse.ok ? await warehouseResponse.json() : [];
      setWarehouseOrigin(warehouseOriginFromRows(nextWarehouses));
      setRoutes(Array.isArray(nextRoutes) ? nextRoutes : []);
      const firstRoute = Array.isArray(nextRoutes) && nextRoutes.length ? nextRoutes[0] : null;
      setActiveRouteId((current) => current && nextRoutes.some((route: any) => Number(route.id) === current) ? current : firstRoute?.id || null);
    } catch {
      setMessage("No se han podido cargar los datos del reparto.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [date]);

  useEffect(() => {
    if (!activeRouteId) {
      setGpsPosition(null);
      if (gpsWatchRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
      setGpsActive(false);
      return;
    }
    let cancelled = false;
    const loadPosition = async () => {
      try {
        const response = await fetch(`/api/routes/${activeRouteId}/position`, { cache: "no-store" });
        const body = response.ok ? await response.json() : null;
        if (!cancelled && body) setGpsPosition(body);
      } catch {}
    };
    void loadPosition();
    const timer = window.setInterval(() => void loadPosition(), 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeRouteId]);

  useEffect(() => () => {
    if (gpsWatchRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchRef.current);
  }, []);

  const dayShipments = useMemo(() => shipments
    .filter((item) => String(item.shipping_date || item.expected_delivery_at || "").slice(0, 10) === date)
    .sort((a, b) => String(a.opening_time || "99:99").localeCompare(String(b.opening_time || "99:99")) || String(a.client_name).localeCompare(String(b.client_name), "es")), [shipments, date]);
  const activeRoute = routes.find((route) => Number(route.id) === Number(activeRouteId)) || null;
  const orderedSuggestedShipments = useMemo(() => {
    const savedIds = suggestedOrderByDate[date] || [];
    if (!savedIds.length) return dayShipments;
    const byId = new Map(dayShipments.map((item) => [Number(item.id), item]));
    const ordered = savedIds.map((id) => byId.get(Number(id))).filter(Boolean);
    const included = new Set(ordered.map((item: any) => Number(item.id)));
    return [...ordered, ...dayShipments.filter((item) => !included.has(Number(item.id)))];
  }, [dayShipments, date, suggestedOrderByDate]);
  const routeStops = activeRoute?.stops?.length ? activeRoute.stops : suggestedStopsWithDistances(orderedSuggestedShipments, warehouseOrigin);
  const completed = routeStops.filter((stop: any) => ["Completada", "Entregado"].includes(String(stop.status || ""))).length;
  const pending = routeStops.filter((stop: any) => !["Completada", "Entregado"].includes(String(stop.status || ""))).length;
  const incidents = dayShipments.filter((item) => String(item.incidents || "").trim()).length;
  const nextStop = routeStops.find((stop: any) => !["Completada", "Entregado"].includes(String(stop.status || "")));
  const routeDistance = routeStops.reduce((total: number, stop: any) => total + Number(stop.distance_km || 0), 0);
  const routePackages = dayShipments.reduce((total: number, shipment: any) => total + Math.max(1, Number(shipment.packages || 1)), 0);
  const publishGpsPosition = async (routeId: number, position: GeolocationPosition) => {
    const payload = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_m: position.coords.accuracy, speed_mps: position.coords.speed, heading: position.coords.heading, recorded_at: new Date(position.timestamp || Date.now()).toISOString() };
    setGpsPosition(payload);
    try {
      const response = await fetch(`/api/routes/${routeId}/position`, { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error("No se pudo guardar la posición.");
      const body = await response.json().catch(() => payload);
      setGpsPosition(body || payload);
    } catch (error: any) {
      setGpsError(error?.message || "No se pudo actualizar la posición del camión.");
    }
  };
  const startGps = () => {
    if (!activeRoute?.id) return setGpsError("Selecciona una ruta asignada antes de iniciar el seguimiento.");
    if (!navigator.geolocation) return setGpsError("Este dispositivo no permite compartir la ubicación.");
    setGpsError("");
    const routeId = Number(activeRoute.id);
    const watchId = navigator.geolocation.watchPosition((position) => void publishGpsPosition(routeId, position), (error) => {
      setGpsActive(false);
      setGpsError(error.code === 1 ? "Permiso de ubicación denegado. Actívalo en el navegador para seguir el camión." : "No se ha podido obtener la ubicación del camión.");
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
    gpsWatchRef.current = watchId;
    setGpsActive(true);
  };
  const stopGps = () => {
    if (gpsWatchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchRef.current);
    gpsWatchRef.current = null;
    setGpsActive(false);
    setGpsError("");
  };
  const deliveryState = (stop: any, shipment: any) => {
    const stopStatus = String(stop?.status || "").trim().toLocaleLowerCase();
    const shipmentStatus = String(shipment?.status || "").trim().toLocaleLowerCase();
    if (["completada", "entregado"].includes(stopStatus) || ["entregado", "completada"].includes(shipmentStatus)) return { key: "delivered", label: "Entregado" };
    if (["en reparto", "en entrega", "en curso"].includes(stopStatus) || ["en reparto", "en entrega", "en curso"].includes(shipmentStatus)) return { key: "in-progress", label: "En reparto" };
    if (["enviado", "cargado", "en carga", "planificada"].includes(stopStatus) || ["enviado", "cargado", "en carga", "en reparto"].includes(shipmentStatus)) return { key: "sent", label: "Enviado" };
    return { key: "pending", label: "Pendiente" };
  };

  async function openShipment(item: any) {
    setDetailLoading(true);
    setSelectedShipment(item);
    setMessage("");
    try {
      const response = await fetch(`/api/shipments/${item.id}`);
      const detail = response.ok ? await response.json() : item;
      const lineResponse = detail.order_id ? await fetch(`/api/order_lines?order_ids=${encodeURIComponent(detail.order_id)}`) : null;
      const rawLines = lineResponse?.ok ? await lineResponse.json() : [];
      const lineRows = (Array.isArray(rawLines) ? rawLines : []).filter((line: any) => Number(line.order_id) === Number(detail.order_id));
      const productIds = [...new Set(lineRows.map((line: any) => Number(line.product_id)).filter((value) => Number.isInteger(value) && value > 0))].join(",") || "0";
      const productResponse = productIds !== "0" ? await fetch(`/api/products?view=lookup&ids=${productIds}`) : null;
      const loadedProducts = productResponse?.ok ? await productResponse.json() : [];
      const productRows = [...(Array.isArray(products) ? products : []), ...(Array.isArray(loadedProducts) ? loadedProducts : [])];
      setProducts((current) => [...new Map(productRows.map((product: any) => [Number(product.id), product])).values()]);
      const lines = lineRows.map((line: any) => ({ ...line, product_name: line.product_name || productRows.find((product: any) => Number(product.id) === Number(line.product_id))?.name || `Producto #${line.product_id}` }));
      setSelectedShipment(shipmentView({ ...item, ...detail }, clients, points));
      setSelectedLines(lines);
    } catch {
      setSelectedLines([]);
      setMessage("No se ha podido cargar el detalle del envío.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function openScannedShipment(value: string) {
    const raw = String(value || "").trim();
    if (!raw) return;
    let scanned = raw;
    try {
      const parsed = new URL(raw);
      const parts = parsed.pathname.split("/").filter(Boolean);
      scanned = decodeURIComponent(parts.at(-1) || raw);
    } catch {}
    const normalized = scanned.toLocaleLowerCase();
    const match = shipments.find((item) => [item.code, item.order_code, item.public_tracking_token].some((candidate) => String(candidate || "").trim().toLocaleLowerCase() === normalized))
      || shipments.find((item) => [item.code, item.order_code].some((candidate) => String(candidate || "").trim().toLocaleLowerCase().includes(normalized)));
    if (!match) return setMessage(`No se ha encontrado ningún pedido para el código ${raw}.`);
    setMessage(`Pedido ${match.order_code || match.code} localizado.`);
    await openShipment(match);
  }

  async function updateStop(stop: any, nextStatus: string) {
    const shipmentId = Number(stop.shipment_id || stop.id);
    if (!shipmentId) return setMessage("No se ha podido identificar el pedido de esta parada.");
    const delivered = nextStatus === "Completada";
    const response = await fetch(`/api/shipments/${shipmentId}/delivery-status`, { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ status: delivered ? "Entregado" : "Enviado" }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(body.error || "No se pudo actualizar la entrega.");
    setShipments((current) => current.map((item) => Number(item.id) === shipmentId ? { ...item, ...body, status: body.status || (delivered ? "Entregado" : "Enviado") } : item));
    setRoutes((current) => current.map((route) => ({ ...route, stops: Array.isArray(route.stops) ? route.stops.map((routeStop: any) => Number(routeStop.shipment_id) === shipmentId ? { ...routeStop, status: delivered ? "Entregado" : "Pendiente" } : routeStop) : route.stops })));
    setMessage(delivered ? "Entrega marcada como entregada." : "Entrega devuelta a estado enviado.");
  }

  function reorderSuggestedStops(next: any[]) {
    setSuggestedOrderByDate((current) => ({ ...current, [date]: next.map((stop) => Number(stop.shipment_id)).filter(Boolean) }));
    setMessage("Orden sugerido actualizado. Se han recalculado los kilómetros estimados y el mapa.");
  }

  async function reorderStops(next: any[]) {
    if (!next.length) return;
    if (!activeRoute) return reorderSuggestedStops(next);
    const response = await fetch(`/api/routes/${activeRoute.id}/stops/reorder`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ stop_ids: next.map((stop) => stop.id) }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(body.error || "No se pudo guardar el orden de la ruta.");
    setRoutes((current) => current.map((route) => Number(route.id) === Number(body.id) ? body : route));
    setMessage(`Ruta reordenada · ${Number(body.total_distance_km || 0).toFixed(1)} km estimados.`);
  }

  function reorderStopsAround(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= routeStops.length) return;
    const next = [...routeStops];
    [next[index], next[target]] = [next[target], next[index]];
    void reorderStops(next);
  }

  function startStopDrag(event: any, stop: any) {
    setDraggingStopId(stop.id);
    setDragOverStopId(null);
    event.dataTransfer?.setData("text/plain", String(stop.id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function dropStop(event: any, target: any) {
    event.preventDefault();
    const sourceId = event.dataTransfer?.getData("text/plain") || draggingStopId;
    const sourceIndex = routeStops.findIndex((stop: any) => String(stop.id) === String(sourceId));
    const targetIndex = routeStops.findIndex((stop: any) => String(stop.id) === String(target.id));
    setDraggingStopId(null);
    setDragOverStopId(null);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const next = [...routeStops];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    void reorderStops(next);
  }


  async function saveReturn(event: FormEvent) {
    event.preventDefault();
    if (!selectedShipment || !returnLine || !returnReason.trim()) return setMessage("Indica cantidad y motivo de la devolución.");
    setSaving(true);
    try {
      const quantity = Number(returnQuantity);
      const maximum = Number(returnLine.quantity_requested ?? returnLine.quantity ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0 || (maximum > 0 && quantity > maximum)) throw new Error(`La cantidad no puede superar las ${maximum} unidades entregadas.`);
      const product = products.find((item) => Number(item.id) === Number(returnLine.product_id));
const response = await fetch("/api/returns", { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ code: `DEV-${Date.now()}`, client_id: selectedShipment.client_id || null, order_id: selectedShipment.order_id || null, shipment_id: selectedShipment.id, order_line_id: returnLine.id, product_id: Number(returnLine.product_id), warehouse_id: product?.warehouse_id || null, quantity, return_date: new Date().toISOString(), reason: `${returnReason.trim()} · Envío ${selectedShipment.code}`, status: "Pendiente", amount: quantity * Number(product?.unit_price || returnLine.unit_price || 0) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo registrar la devolución.");
      setReturnsOpen(false);
      setReturnReason("");
      setMessage(`Devolución ${body.code || "registrada"} enviada a revisión.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo registrar la devolución."); }
    finally { setSaving(false); }
  }

  function logout() {
    localStorage.removeItem("excluvas.session");
    sessionStorage.removeItem("excluvas.session");
    window.location.href = "/reparto";
  }

  return <main className="reparto-page">
    <header className="reparto-topbar"><a className="reparto-brand" href="/crm" aria-label="Volver al CRM"><span>E</span><div><b>Exclusivas</b><small>INTELIGENTES</small></div></a><div className="reparto-topbar-actions"><span className="reparto-connection"><i /> Modo reparto</span><button type="button" className="reparto-menu-link" onClick={() => document.querySelector(".reparto-route-picker")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Rutas</button><a className="reparto-menu-link" href="/crm">CRM</a><button type="button" onClick={logout}>Salir</button></div></header>
    <div className="reparto-shell">
      <section className="reparto-head"><div><p className="eyebrow">OPERATIVA DE REPARTO</p><h1>Reparto de hoy</h1><p>Consulta tu ruta, abre cada entrega y registra la recepción desde el móvil.</p></div><div className="reparto-head-actions"><BarcodeScanner label="Escanear pedido" description="Apunta al QR o código de barras del pedido o de la etiqueta de envío." onDetected={(value) => void openScannedShipment(value)} disabled={loading} /><button type="button" className="reparto-refresh" onClick={() => void load()} disabled={loading}>↻ Actualizar</button></div></section>
      <section className="reparto-datebar"><button type="button" onClick={() => setDate(todayInput())} className={date === todayInput() ? "active" : ""}>Hoy <small>{dateLabel(todayInput())}</small></button><button type="button" onClick={() => setDate(offsetDate(1))} className={date === offsetDate(1) ? "active" : ""}>Mañana <small>{dateLabel(offsetDate(1))}</small></button><label>Otra fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></section>
      <section className="reparto-kpis"><article><strong>{dayShipments.length}</strong><span>entregas del día</span></article><article><strong>{pending}</strong><span>pendientes</span></article><article><strong>{completed}</strong><span>paradas completadas</span></article><article className={incidents ? "attention" : ""}><strong>{incidents}</strong><span>con incidencias</span></article></section>
      <section className={`reparto-driver-brief${activeRoute ? "" : " is-pending"}`} aria-label="Resumen de la jornada"><header><div><p className="eyebrow">MI JORNADA</p><h2>{activeRoute ? `Ruta ${activeRoute.code}` : "Jornada pendiente de asignación"}</h2><span>{activeRoute ? `${activeRoute.driver || actor} · ${activeRoute.vehicle || "Camión sin indicar"}` : "El almacén aún no ha guardado un camión para esta fecha."}</span></div><strong>{activeRoute ? "LISTO PARA REPARTIR" : "ESPERANDO CARGA"}</strong></header><div className="reparto-driver-brief-grid"><span><b>Pedidos</b>{dayShipments.length} · {routePackages} bultos</span><span><b>Ruta</b>{activeRoute ? `${routeStops.length} paradas` : "Orden sugerido"}</span><span><b>Distancia</b>{routeDistance > 0 ? `${routeDistance.toFixed(1)} km estimados` : "Se calcula al guardar la ruta"}</span><span><b>Seguimiento</b>{completed}/{routeStops.length || dayShipments.length} entregas</span></div>{activeRoute?.maps_url ? <a className="reparto-driver-brief-link" href={activeRoute.maps_url} target="_blank" rel="noreferrer">↗ Abrir navegación de toda la ruta</a> : <small className="reparto-driver-brief-note">Cuando almacén asigne y guarde el camión aparecerán aquí la ruta y sus kilómetros.</small>}</section>
      {routeStops.length > 0 && <RepartoRouteMapPanel stops={routeStops} route={activeRoute} origin={warehouseOrigin} currentPosition={gpsPosition} gpsActive={gpsActive} gpsError={gpsError} onStartGps={startGps} onStopGps={stopGps} />}
      <section className="reparto-next-stop" aria-label="Siguiente entrega">{nextStop ? <><div><span className="eyebrow">SIGUIENTE PARADA</span><b>{nextStop.client_name || "Cliente sin nombre"}</b><small>{[nextStop.address, nextStop.city].filter(Boolean).join(" · ") || "Dirección no indicada"}{nextStop.opening_time && nextStop.closing_time ? ` · ${nextStop.opening_time}–${nextStop.closing_time}` : ""}</small></div><button type="button" className="button primary" onClick={() => { const shipment = shipments.find((item) => Number(item.id) === Number(nextStop.shipment_id)) || nextStop; void openShipment(shipment); }}>Abrir próxima entrega</button></> : <div><span className="eyebrow">RUTA COMPLETADA</span><b>No quedan paradas pendientes</b><small>Revisa las incidencias y justificantes antes de cerrar la jornada.</small></div>}</section>
      {message && <p className="reparto-message" role="status">{message}</p>}
      <div className="reparto-layout"><section className="reparto-stops panel"><div className="reparto-panel-head"><div><p className="eyebrow">{activeRoute ? activeRoute.code : "ORDEN SUGERIDO"}</p><h2>{activeRoute ? `Ruta de ${activeRoute.driver || "reparto"}` : "Entregas para hoy"}</h2><span>{activeRoute ? `${activeRoute.stops?.length || 0} paradas · ${activeRoute.vehicle || "Vehículo sin indicar"} · Arrastra para reordenar` : "Ordenadas por horario de apertura · Arrastra para reordenar"}</span></div>{activeRoute?.maps_url && <a className="button primary" href={activeRoute.maps_url} target="_blank" rel="noreferrer">Navegar toda la ruta</a>}</div>{loading ? <div className="reparto-loading" role="status">Cargando entregas…</div> : !routeStops.length ? <div className="reparto-empty"><b>No hay entregas para esta fecha.</b><span>Prueba otra fecha o vuelve al CRM para planificar la ruta.</span></div> : <ol className="reparto-stop-list">{routeStops.map((stop: any, index: number) => { const shipment = shipments.find((item) => Number(item.id) === Number(stop.shipment_id)) || stop; const delivery = deliveryState(stop, shipment); const done = delivery.key === "delivered"; const signatureDone = String(shipment.delivery_signature_status || "").toLocaleLowerCase() === "firmado"; const paymentDone = String(shipment.payment_received_status || "").toLocaleLowerCase() === "recibido"; const destination = mapsUrl({ ...shipment, ...stop }); return <li draggable className={`reparto-stop ${delivery.key}${done ? " done" : ""}${String(draggingStopId) === String(stop.id) ? " dragging" : ""}${String(dragOverStopId) === String(stop.id) ? " drag-over" : ""}`} key={stop.id} onDragStart={(event) => startStopDrag(event, stop)} onDragOver={(event) => { event.preventDefault(); setDragOverStopId(stop.id); }} onDragLeave={() => setDragOverStopId((current) => String(current) === String(stop.id) ? null : current)} onDrop={(event) => dropStop(event, stop)} onDragEnd={() => { setDraggingStopId(null); setDragOverStopId(null); }}><div className="reparto-stop-number">{done ? "✓" : stop.position || index + 1}</div><div className="reparto-stop-main"><div className="reparto-stop-title"><div><b>{stop.client_name || shipment.client_name}</b><small>{shipment.code || stop.shipment_code || "Envío"}</small></div><span className={`reparto-stop-status ${delivery.key}`}>{delivery.label}</span></div><p>{[stop.address || shipment.address, stop.city || shipment.city].filter(Boolean).join(" · ") || "Dirección no indicada"}</p><small className="reparto-stop-window">{stop.opening_time && stop.closing_time ? `Horario ${stop.opening_time}–${stop.closing_time}` : "Horario pendiente de indicar"}{stop.distance_km ? ` · ${Number(stop.distance_km).toFixed(1)} km desde la anterior` : ""}</small><small className="reparto-stop-proof">{Math.max(1, Number(shipment.packages || 1))} bultos · {signatureDone ? "✓ Firmado" : "Firma pendiente"} · {paymentDone ? "✓ Cobrado" : "Cobro pendiente"}</small><div className="reparto-stop-actions">{destination ? <a className="reparto-map-button" href={destination} target="_blank" rel="noreferrer">↗ Cómo llegar</a> : <span className="reparto-no-map">Ubicación sin dirección</span>}<button type="button" className="reparto-open-button" onClick={() => void openShipment(shipment)}>Abrir entrega</button><button type="button" className={`reparto-check-button${done ? " checked" : ""}`} onClick={() => void updateStop(stop, done ? "Pendiente" : "Completada")}>{done ? "Deshacer entrega" : "Marcar entregado"}</button><span className="reparto-reorder"><button type="button" aria-label="Subir parada" onClick={() => reorderStopsAround(index, -1)} disabled={index === 0}>↑</button><button type="button" aria-label="Bajar parada" onClick={() => reorderStopsAround(index, 1)} disabled={index === routeStops.length - 1}>↓</button></span></div></div></li>; })}</ol>}</section>
        <aside className="reparto-side"><section className="reparto-route-picker panel"><div className="reparto-panel-head compact"><div><p className="eyebrow">PLANIFICACIÓN</p><h2>Mis rutas</h2><span>Selecciona la ruta asignada</span></div></div>{routes.length ? routes.map((route) => <button type="button" key={route.id} className={`reparto-route-option${Number(route.id) === Number(activeRouteId) ? " active" : ""}`} onClick={() => setActiveRouteId(Number(route.id))}><span><b>{route.code}</b><small>{dateLabel(route.route_date)} · {route.driver || "Sin repartidor"}</small></span><strong>{route.stops?.length || 0}</strong></button>) : <p className="reparto-empty small">No hay una ruta planificada para esta fecha.</p>}<p className="reparto-plan-link reparto-driver-note">La planificación y los cambios de ruta los gestiona el equipo desde el CRM.</p></section><section className="reparto-help panel"><p className="eyebrow">SECUENCIA RECOMENDADA</p><h2>Una entrega cada vez</h2><p>Abre Maps para llegar, entra en la entrega para enseñar el pedido al cliente y registra firma, fotos o incidencias antes de continuar.</p></section></aside></div>
      {activeRoute && <DriverDailyClosingPanel route={activeRoute} stops={routeStops} shipments={shipments} actor={actor} />}
      <DeliveryExpensePanel actor={actor} />
    </div>
    {selectedShipment && <div className="reparto-detail-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedShipment(null)}><section className="reparto-detail-modal" role="dialog" aria-modal="true" aria-label={`Detalle del envío ${selectedShipment.code || ""}`}><header className="reparto-detail-head"><div><p className="eyebrow">ENTREGA · {selectedShipment.shipping_date ? dateLabel(selectedShipment.shipping_date) : ""}</p><h2>{selectedShipment.client_name}</h2><span>{selectedShipment.code} · {[selectedShipment.address, selectedShipment.city].filter(Boolean).join(" · ")}</span><div className="reparto-contact-line"><span>{clients.find((client) => Number(client.id) === Number(selectedShipment.client_id))?.phone || "Teléfono no indicado"}</span>{phoneUrl(clients.find((client) => Number(client.id) === Number(selectedShipment.client_id))?.phone) && <a href={phoneUrl(clients.find((client) => Number(client.id) === Number(selectedShipment.client_id))?.phone)}>Llamar</a>}{whatsappUrl(clients.find((client) => Number(client.id) === Number(selectedShipment.client_id))?.phone, selectedShipment) && <a href={whatsappUrl(clients.find((client) => Number(client.id) === Number(selectedShipment.client_id))?.phone, selectedShipment)} target="_blank" rel="noreferrer">WhatsApp</a>}</div></div><button type="button" className="reparto-close" onClick={() => setSelectedShipment(null)} aria-label="Cerrar detalle">×</button></header>{detailLoading ? <div className="reparto-loading">Cargando contenido del pedido…</div> : <><div className="reparto-detail-facts"><span><b>HORARIO</b>{selectedShipment.opening_time && selectedShipment.closing_time ? `${selectedShipment.opening_time}–${selectedShipment.closing_time}` : "Pendiente"}</span><span><b>BULTOS</b>{selectedShipment.packages || "—"}</span><span><b>ESTADO</b>{selectedShipment.status || "Pendiente"}</span></div><div className="reparto-detail-actions">{mapsUrl(selectedShipment) ? <a className="button primary" href={mapsUrl(selectedShipment)} target="_blank" rel="noreferrer">Cómo llegar con Maps</a> : <span className="reparto-no-map">Ubicación sin dirección</span>}<button type="button" className="button secondary" onClick={async () => { const address = [selectedShipment.address, selectedShipment.city].filter(Boolean).join(", "); if (!address) return setMessage("Este pedido no tiene una dirección indicada."); try { await navigator.clipboard.writeText(address); setMessage("Dirección copiada para usarla en el navegador o Maps."); } catch { setMessage("No se ha podido copiar la dirección."); } }}>Copiar dirección</button><button type="button" className="button secondary" onClick={() => { setReturnLine(selectedLines[0] || null); setReturnsOpen(true); }}>Tramitar devolución</button></div>{selectedShipment.incidents && <div className="reparto-incident"><b>Incidencias / indicaciones</b><p>{selectedShipment.incidents}</p></div>}<div className="reparto-lines"><h3>Contenido del pedido</h3>{selectedLines.length ? selectedLines.map((line) => <div key={line.id} className="reparto-line"><span>{line.quantity_requested || line.quantity} {line.quantity_unit || "uds."}</span><b>{line.product_name}</b><button type="button" onClick={() => { setReturnLine(line); setReturnsOpen(true); }}>Devolver</button></div>) : <p>No hay líneas cargadas para este pedido.</p>}</div><DeliverySignaturePanel shipment={selectedShipment} actor={actor} client={clients.find((client) => Number(client.id) === Number(selectedShipment.client_id))} lines={selectedLines} products={products} onSaved={(updated) => { setSelectedShipment((current: any) => ({ ...current, ...updated, status: updated.status || "Entregado" })); setShipments((current) => current.map((item) => Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item)); const matchingStop = activeRoute && routeStops.find((stop: any) => Number(stop.shipment_id) === Number(updated.id)); if (matchingStop) void updateStop(matchingStop, "Completada"); }} /><DeliveryPaymentPanel shipment={selectedShipment} actor={actor} onSaved={(updated) => { setSelectedShipment((current: any) => ({ ...current, ...updated })); setShipments((current) => current.map((item) => Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item)); }} /></>}</section></div>}
    {returnsOpen && selectedShipment && <div className="reparto-return-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setReturnsOpen(false)}><form className="reparto-return-modal" onSubmit={(event) => void saveReturn(event)}><header><div><p className="eyebrow">DEVOLUCIÓN</p><h2>Registrar devolución</h2><span>{selectedShipment.client_name} · {selectedShipment.code}</span></div><button type="button" className="reparto-close" onClick={() => setReturnsOpen(false)} aria-label="Cerrar devolución">×</button></header><label>Producto<select value={returnLine?.id || ""} onChange={(event) => setReturnLine(selectedLines.find((line) => String(line.id) === event.target.value) || null)}>{selectedLines.map((line) => <option key={line.id} value={line.id}>{line.product_name}</option>)}</select></label><label>Cantidad<input type="number" min="1" step="1" value={returnQuantity} onChange={(event) => setReturnQuantity(event.target.value)} /></label><label>Motivo<textarea required rows={4} value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="Ej.: dos cajas dañadas al descargar…" /></label><p className="reparto-return-note">La devolución queda pendiente de revisión y se vincula al cliente y al envío.</p><footer><button type="button" className="button secondary" onClick={() => setReturnsOpen(false)}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Guardando…" : "Registrar devolución"}</button></footer></form></div>}
  </main>;
}
