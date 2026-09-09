"use client";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
// @ts-ignore Librerías de generación local de códigos para etiquetas.
import QRCode from "qrcode";
// @ts-ignore Tipos incluidos por la librería.
import JsBarcode from "jsbarcode";
import BarcodeScanner from "./components/BarcodeScanner";

const APP_VERSION = "2.0.67";
const APP_ENVIRONMENT = process.env.NODE_ENV === "production" ? "Producción" : "Local";

const initialModules = [
  "Inicio",
  "Promociones web",
  "Productos",
  "Stock",
  "Envíos",
  "Clientes",
  "Contactos",
  "Proveedores",
  "Compras",
  "Compras inteligentes",
  "Almacenes",
  "Preparación de pedidos",
  "Lugares de recogida",
  "Rutas",
  "Entradas",
  "Salidas",
  "Pedidos",
  "Presupuestos",
  "Albaranes",
  "Facturas",
  "Cobros",
  "Gastos y tickets",
  "Balance",
  "Informes",
  "Historial",
  "Tareas programadas",
  "Notas",
  "Devoluciones",
  "Usuarios y permisos",
  "Papelera",
  "Documentos",
  "Copias de seguridad",
  "OCR inteligente",
  "Altas web",
];
const permissionModules = initialModules.filter((module) => module !== "Inicio" && module !== "Usuarios y permisos" && module !== "Papelera");
function normalizeSearchText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}
function matchesSearch(value: unknown, query: string) {
  const text = normalizeSearchText(value);
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  return !tokens.length || tokens.every((token) => text.includes(token));
}
function LoadingIndicator({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, []);
  return <><span>{label}</span><b className="loading-seconds">{seconds} s</b></>;
}
function TopHorizontalScroll({ className, children }: { className: string; children: ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const top = topRef.current;
    const content = contentRef.current;
    const spacer = spacerRef.current;
    if (!top || !content || !spacer) return;
    const syncWidth = () => { spacer.style.width = `${content.scrollWidth}px`; };
    const fromTop = () => { content.scrollLeft = top.scrollLeft; };
    const fromContent = () => { top.scrollLeft = content.scrollLeft; };
    syncWidth();
    top.addEventListener("scroll", fromTop, { passive: true });
    content.addEventListener("scroll", fromContent, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncWidth) : null;
    observer?.observe(content);
    return () => {
      top.removeEventListener("scroll", fromTop);
      content.removeEventListener("scroll", fromContent);
      observer?.disconnect();
    };
  }, [children]);
  return <>
    <div ref={topRef} className="table-scroll-top" aria-label="Desplazamiento horizontal del listado">
      <div ref={spacerRef} />
    </div>
    <div ref={contentRef} className={className}>{children}</div>
  </>;
}
async function fetchWithRetry(url: string, init?: RequestInit, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      if (response.status >= 400 && response.status < 500) return response;
      throw new Error(`Respuesta temporal del servidor (${response.status})`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No se pudo conectar con el CRM");
}
const lookupMemoryCache = new Map<string, { expiresAt: number; rows: any[]; pending?: Promise<any[]> }>();
async function fetchCompactLookup(resource: string, actor: string) {
  const cached = lookupMemoryCache.get(resource);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  if (cached?.pending) return cached.pending;
  const pending = fetch(`/api/${resource}?view=lookup&limit=2000`, { headers: { "X-Actor": actor } })
    .then((response) => response.ok ? response.json() : [])
    .then((value) => {
      const rows = Array.isArray(value) ? value : [];
      lookupMemoryCache.set(resource, { rows, expiresAt: Date.now() + 30000 });
      return rows;
    })
    .catch(() => [])
    .finally(() => {
      const current = lookupMemoryCache.get(resource);
      if (current?.pending) lookupMemoryCache.set(resource, { ...current, pending: undefined });
    });
  lookupMemoryCache.set(resource, { rows: cached?.rows || [], expiresAt: cached?.expiresAt || 0, pending });
  return pending;
}
function allowedModulesFor(user: any) {
  if (user?.role === "admin") return initialModules;
  if (user?.role === "repartidor") return [];
  try {
    const permissions = user?.permissions === "*" ? permissionModules : JSON.parse(user?.permissions || "[]");
    return Array.isArray(permissions) ? permissions : [];
  } catch { return []; }
}
function preferredModuleFor(user: any) {
  if (user?.role === "admin") return "Inicio";
  const allowed = allowedModulesFor(user);
  const priorities = user?.role === "almacen"
    ? ["Preparación de pedidos", "Stock", "Envíos", "Salidas", "Pedidos"]
    : user?.role === "comercial"
      ? ["Clientes", "Contactos", "Pedidos", "Presupuestos", "Facturas"]
      : ["Pedidos", "Clientes", "Productos"];
  return priorities.find((module) => allowed.includes(module)) || allowed[0] || "Productos";
}
const cfg: any = {
  Productos: {
    api: "products",
    title: "Productos y stock",
    fields: [
      "name",
      "sku",
      "description",
      "barcode",
      "supplier_ref",
      "category",
      "category_code",
      "brand",
      "format",
      "unit",
      "units_per_case",
      "unit_price",
      "box_price",
      "pack4_price",
      "pack6_price",
      "pallet_price",
      "cost_price",
      "markup_percent",
      "margin_percent",
      "vat",
      "accounting_product_group",
      "accounting_vat_group",
      "inventory_register_group",
      "stock",
      "stock_reserved",
      "min_stock",
      "stock_min",
      "stock_target",
      "stock_safety",
      "family",
      "subfamily",
      "purchase_format",
      "sale_format",
      "cases_per_pallet",
      "units_per_pallet",
      "weight_kg",
      "volume_m3",
      "warehouse_location",
      "warehouse_id",
      "picking_order",
      "product_status",
      "active",
      "created_at",
      "preorder",
      "product_tracking_code",
      "inventory_valuation_method",
      "primary_supplier_id",
      "fixed_supplier",
      "target_margin_percent",
      "min_margin_percent",
      "freight_cost",
      "handling_cost",
      "real_cost",
      "last_direct_cost",
      "tax_surcharge_percent",
      "extra_tax_name",
      "extra_tax_percent",
      "lot_tracking",
      "expiry_tracking",
      "returnable_packaging",
      "supplier_id",
    ],
    labels: [
      "Producto",
      "Número proveedor (Ay…)",
      "Descripción y unidades por caja",
      "Código de barras",
      "Referencia proveedor",
      "Categoría",
      "Código categoría",
      "Marca",
      "Formato",
      "Unidad de venta",
      "Unidades por caja",
      "Precio venta",
      "Precio por caja",
      "Precio pack de 4",
      "Precio pack de 6",
      "Precio por palé",
      "Coste",
      "Incremento %",
      "Margen %",
      "IVA %",
      "Grupo contable prod. gen.",
      "Grupo contable IVA",
      "Grupo registro inventario",
      "Stock",
      "Stock reservado",
      "Stock mínimo",
      "Stock mínimo operativo",
      "Stock objetivo",
      "Stock de seguridad",
      "Familia",
      "Subfamilia",
      "Formato de compra",
      "Formato de venta",
      "Cajas por palé",
      "Unidades por palé",
      "Peso (kg)",
      "Volumen (m³)",
      "Ubicación en almacén",
      "Código de almacén",
      "Orden de recogida",
      "Estado del producto",
      "Estado activo",
      "Fecha de alta",
      "Preventa",
      "Código seguimiento producto",
      "Valoración de existencias",
      "Proveedor principal",
      "Proveedor fijo",
      "Margen objetivo %",
      "Margen mínimo %",
      "Coste transporte",
      "Coste manipulación",
      "Coste real",
      "Coste último directo",
      "Recargo equivalencia %",
      "Impuesto adicional",
      "Impuesto adicional %",
      "Control de lotes",
      "Control de caducidad",
      "Envase retornable",
      "Proveedor",
    ],
  },
  Clientes: {
    api: "clients",
    title: "Clientes",
    fields: [
      "name",
      "external_code",
      "tax_id",
      "contact",
      "phone",
      "email",
      "address",
      "city",
      "opening_time",
      "closing_time",
      "billing_address",
      "billing_city",
      "latitude",
      "longitude",
      "geocoding_status",
      "payment_terms",
      "credit_limit",
      "active",
    ],
    labels: [
      "Nombre",
      "Código externo",
      "NIF/CIF",
      "Contacto",
      "Teléfono",
      "Email",
      "Dirección de entrega",
      "Ciudad de entrega",
      "Hora de apertura",
      "Hora de cierre",
      "Dirección fiscal",
      "Ciudad fiscal",
      "Latitud",
      "Longitud",
      "Estado geolocalización",
      "Condiciones de pago",
      "Límite crédito",
      "Estado activo",
    ],
  },
  Stock: {
    api: "stock",
    title: "Stock y movimientos",
    fields: [
      "product_id",
      "unit",
      "warehouse_name",
      "stock",
      "stock_reserved",
      "available_stock",
      "min_stock",
      "stock_status",
    ],
    labels: [
      "Producto",
      "Unidad",
      "Almacén",
      "Stock físico",
      "Necesario para pedidos",
      "Saldo para cubrir pedidos",
      "Stock mínimo",
      "Estado",
    ],
  },
  Envíos: {
    api: "shipments",
    title: "Envíos y entregas",
    fields: [
      "code",
      "order_id",
      "client_id",
      "carrier",
      "status",
      "collection_point_id",
      "origin_address",
      "address",
      "departure_at",
      "prepared_at",
      "shipped_at",
      "delivery_window_start",
      "delivery_window_end",
      "expected_delivery_at",
      "delivered_at",
      "tracking",
      "packages",
      "incidents",
      "notes",
      "prepared_by",
      "shipped_by",
      "delivered_by",
      "delivery_signature_status",
      "delivery_recipient_name",
      "delivery_signature_at",
      "delivery_signature_by",
      "delivery_signature_note",
    ],
    labels: [
      "Código",
      "Pedido",
      "Cliente",
      "Transportista",
      "Estado",
      "Lugar de envío",
      "Lugar de salida",
      "Dirección de destino",
      "Hora de salida",
      "Preparado",
      "Enviado",
      "Inicio de franja",
      "Fin de franja",
      "Entrega prevista",
      "Entregado",
      "Seguimiento",
      "Bultos",
      "Incidencias",
      "Notas",
      "Preparado por",
      "Enviado por",
      "Entregado por",
      "Estado de firma",
      "Quién recibe",
      "Fecha de firma",
      "Firmado por",
      "Observación de entrega",
    ],
  },
  Proveedores: {
    api: "suppliers",
    title: "Proveedores",
    fields: [
      "name",
      "external_code",
      "tax_id",
      "contact",
      "phone",
      "email",
      "address",
      "city",
      "latitude",
      "longitude",
      "geocoding_status",
      "payment_terms",
      "active",
    ],
    labels: [
      "Nombre",
      "Código externo",
      "NIF/CIF",
      "Contacto",
      "Teléfono",
      "Email",
      "Dirección",
      "Ciudad",
      "Latitud",
      "Longitud",
      "Estado geolocalización",
      "Condiciones de pago",
      "Estado activo",
    ],
  },
  Compras: {
    api: "purchase_orders",
    title: "Compras a proveedores",
    fields: [
      "code",
      "supplier_id",
      "status",
      "order_date",
      "expected_date",
      "amount",
      "notes",
    ],
    labels: [
      "Código",
      "Proveedor",
      "Estado",
      "Fecha pedido",
      "Fecha prevista",
      "Importe",
      "Notas",
    ],
  },
  Notas: {
    api: "notes",
    title: "Notas y tareas rápidas",
    fields: [
      "title",
      "content",
      "priority",
      "module",
      "important",
      "completed",
    ],
    labels: [
      "Título",
      "Nota",
      "Prioridad",
      "Sección",
      "Destacada",
      "Completada",
    ],
  },
  Devoluciones: {
    api: "returns",
    title: "Devoluciones y abonos",
    fields: [
      "code",
      "client_id",
      "invoice_id",
      "product_id",
      "order_id",
      "shipment_id",
      "order_line_id",
      "quantity",
      "return_date",
      "reason",
      "status",
      "reviewed_by",
      "reviewed_at",
      "authorized_by",
      "authorized_at",
      "stock_applied_at",
      "amount",
    ],
    labels: [
      "Código",
      "Cliente",
      "Factura",
      "Producto",
      "Pedido",
      "Envío",
      "Línea de pedido",
      "Cantidad",
      "Fecha y hora",
      "Motivo",
      "Estado",
      "Revisado por",
      "Fecha de revisión",
      "Autorizado por",
      "Fecha de autorización",
      "Stock actualizado en",
      "Importe",
    ],
  },
  Almacenes: {
    api: "warehouses",
    title: "Almacenes",
    fields: ["code", "name", "address", "manager"],
    labels: ["Código", "Nombre", "Dirección", "Responsable"],
  },
  "Preparación de pedidos": {
    api: "shipments",
    title: "Preparación de pedidos",
    statusFilter: ["Preparando", "Preparado", "Preparado con incidencia"],
    fields: [
      "code",
      "order_id",
      "client_id",
      "status",
      "preparation_date",
      "shipping_date",
      "urgent",
      "address",
      "delivery_window_start",
      "delivery_window_end",
      "expected_delivery_at",
      "packages",
      "notes",
      "prepared_by",
    ],
    labels: [
      "Nota de carga",
      "Pedido",
      "Cliente",
      "Estado",
      "Día de preparación",
      "Día de envío",
      "Urgente",
      "Dirección de entrega",
      "Apertura del cliente",
      "Cierre del cliente",
      "Entrega prevista",
      "Bultos",
      "Observaciones",
      "Responsable",
    ],
  },
  "Lugares de recogida": {
    api: "collection_points",
    title: "Lugares de recogida",
    fields: [
      "code",
      "name",
      "address",
      "city",
      "contact",
      "phone",
      "email",
      "opening_hours",
      "opening_time",
      "closing_time",
      "latitude",
      "longitude",
      "geocoding_status",
      "notes",
    ],
    labels: [
      "Código",
      "Nombre",
      "Dirección",
      "Ciudad",
      "Contacto",
      "Teléfono",
      "Email",
      "Horario",
      "Hora de apertura",
      "Hora de cierre",
      "Latitud",
      "Longitud",
      "Estado geolocalización",
      "Notas",
    ],
  },
  Entradas: {
    api: "goods_receipts",
    title: "Entradas de mercancía",
    fields: [
      "code",
      "supplier_id",
      "purchase_order_id",
      "purchase_invoice_id",
      "warehouse_id",
      "receipt_date",
      "status",
      "validation_status",
      "validated_by",
      "economic_difference",
      "line_count",
      "incident_count",
      "received_by",
      "notes",
    ],
    labels: [
      "Código",
      "Proveedor",
      "Pedido de compra",
      "Factura de compra",
      "Almacén",
      "Fecha de recepción",
      "Estado",
      "Validación",
      "Validado por",
      "Diferencia económica",
      "Líneas",
      "Incidencias",
      "Recepcionado por",
      "Notas",
    ],
  },
  Salidas: {
    api: "inventory_movements",
    title: "Salidas de almacén",
    movementFilter: "Salida",
    fields: [
      "order_id",
      "shipment_id",
      "product_id",
      "warehouse_id",
      "movement_type",
      "quantity",
      "movement_date",
      "client_id",
      "created_by",
      "notes",
      "reference",
    ],
    labels: [
      "Pedido relacionado",
      "Hoja de carga",
      "Producto",
      "Almacén",
      "Tipo de movimiento",
      "Cantidad",
      "Fecha",
      "Cliente",
      "Realizada por",
      "Motivo",
      "Referencia",
    ],
  },
  Pedidos: {
    api: "orders",
    title: "Pedidos",
    fields: [
      "code",
      "client_id",
      "created_by",
      "collection_point_id",
      "product_id",
      "quantity",
      "unit_price",
      "discount",
      "amount",
      "status",
      "billing_status",
      "payment_status",
      "shipping_status",
      "delivery_date",
      "preparation_date",
      "shipping_date",
      "urgent",
      "notes",
      "prepared_by",
      "shipped_by",
      "delivered_by",
    ],
    labels: [
      "Código",
      "Cliente",
      "Solicitado por",
      "Lugar de envío",
      "Producto",
      "Cantidad",
      "Precio",
      "Descuento %",
      "Importe",
      "Estado",
      "Facturación",
      "Cobro",
      "Envío",
      "Fecha de entrega",
      "Día de preparación",
      "Día de envío",
      "Urgente",
      "Notas",
      "Preparado por",
      "Enviado por",
      "Entregado por",
    ],
  },
  Presupuestos: {
    api: "quotes",
    title: "Presupuestos",
    fields: ["code", "client_id", "amount", "status", "valid_until", "notes"],
    labels: [
      "Código",
      "Cliente",
      "Importe",
      "Estado",
      "Válido hasta",
      "Notas",
    ],
  },
  Albaranes: {
    api: "delivery_notes",
    title: "Albaranes",
    fields: [
      "code",
      "order_id",
      "client_id",
      "delivery_date",
      "carrier",
      "status",
      "notes",
    ],
    labels: [
      "Código",
      "Pedido",
      "Cliente",
      "Fecha entrega",
      "Transportista",
      "Estado",
      "Notas",
    ],
  },
  Facturas: {
    api: "invoices",
    title: "Facturas",
    fields: [
      "code",
      "client_id",
      "issue_date",
      "due_date",
      "amount",
      "vat",
      "status",
      "notes",
    ],
    labels: [
      "Código",
      "Cliente",
      "Emisión",
      "Vencimiento",
      "Importe",
      "IVA %",
      "Estado",
      "Notas",
    ],
  },
  Cobros: {
    api: "payments",
    title: "Cobros",
    fields: [
      "invoice_id",
      "amount",
      "payment_date",
      "method",
      "reference",
      "notes",
    ],
    labels: ["Factura", "Importe", "Fecha", "Método", "Referencia", "Notas"],
  },
  "Gastos y tickets": {
    api: "expenses",
    title: "Gastos y tickets",
    fields: [
      "code",
      "client_id",
      "expense_date",
      "category",
      "vendor",
      "amount",
      "vat",
      "payment_method",
      "notes",
      "attachment_name",
      "status",
      "created_by",
    ],
    labels: [
      "Código",
      "Cliente",
      "Fecha",
      "Categoría",
      "Proveedor",
      "Importe",
      "IVA %",
      "Forma de pago",
      "Notas",
      "Justificante",
      "Estado",
      "Registrado por",
    ],
  },
  Documentos: {
    api: "document_templates",
    title: "Documentos y plantillas",
    fields: ["code", "title", "type", "format", "description", "subject", "content", "status", "created_by"],
    labels: ["Código", "Nombre", "Tipo", "Formato", "Descripción", "Asunto", "Contenido", "Estado", "Creado por"],
  },
};
const icon = (m: string) =>
  ({
    Inicio: "⌂",
    Productos: "◒",
    Stock: "⇄",
    Envíos: "➜",
    Clientes: "♙",
    Contactos: "◎",
    Proveedores: "▣",
    Compras: "↙",
    "Compras inteligentes": "✦",
    Almacenes: "▤",
    "Preparación de pedidos": "☷",
    "Lugares de recogida": "⌖",
    Entradas: "↥",
    Salidas: "↧",
    Pedidos: "◫",
    Presupuestos: "▱",
    Albaranes: "▥",
    Facturas: "▥",
    Cobros: "€",
    "Gastos y tickets": "▤",
    Informes: "◒",
    Historial: "◷",
    "Tareas programadas": "◴",
    Notas: "✎",
    Devoluciones: "↶",
    "Usuarios y permisos": "⚙",
    "Altas web": "✦",
    Papelera: "♲",
    Documentos: "▤",
  })[m] || "•";

type ToolbarIconName = "download" | "upload" | "template" | "preparation" | "stock" | "order" | "expense" | "backup" | "map" | "commercial" | "warehouse" | "web";
function ToolbarIcon({ name }: { name: ToolbarIconName }) {
  const paths: Record<ToolbarIconName, ReactNode> = {
    download: <><path d="M12 3v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4 20h16" /></>,
    upload: <><path d="M12 21V10" /><path d="m7.5 13.5 4.5-4.5 4.5 4.5" /><path d="M4 4h16" /></>,
    template: <><path d="M6 3.5h8l4 4V20.5H6z" /><path d="M14 3.5v4h4" /><path d="M9 12h6" /><path d="M9 15.5h6" /></>,
    preparation: <><rect x="5" y="4" width="14" height="16" rx="1" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    stock: <><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="m4 12 8 4 8-4" /><path d="m4 16 8 4 8-4" /></>,
    order: <><path d="M12 5v14M5 12h14" /></>,
    expense: <><path d="M6 4h9l3 3v13H6z" /><path d="M15 4v4h3M9 12h6M9 15.5h4" /></>,
    backup: <><path d="M5 5.5h14v4H5z" /><path d="M5 10.5h14v4H5z" /><path d="M5 15.5h14v3H5z" /><path d="M8 7.5h.01M8 12.5h.01M8 17h.01" /></>,
    map: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    commercial: <><path d="M5 8h14v12H5z" /><path d="M8 8V5h8v3M8 12h8M12 12v8" /></>,
    warehouse: <><path d="m3 10 9-6 9 6v10H3z" /><path d="M7 20v-6h10v6M7 10h.01M12 10h.01M17 10h.01" /></>,
    web: <><circle cx="12" cy="12" r="8.5" /><path d="M3.8 9h16.4M3.8 15h16.4M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5C9.9 18.2 8.8 15.4 8.8 12S9.9 5.8 12 3.5Z" /></>,
  };
  return <svg className="toolbar-action-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
const sidebarGroups = [
  {
    name: "Ventas y clientes",
    items: [
      "Promociones web",
      "Clientes",
      "Contactos",
      "Pedidos",
      "Presupuestos",
      "Albaranes",
      "Facturas",
      "Cobros",
      "Envíos",
    ],
  },
  {
    name: "Logística y almacén",
    items: [
      "Preparación de pedidos",
      "Productos",
      "Stock",
      "Almacenes",
      "Lugares de recogida",
      "Rutas",
      "Entradas",
      "Salidas",
      "Devoluciones",
    ],
  },
  {
    name: "Compras y proveedores",
    items: ["Proveedores", "Compras", "Compras inteligentes", "Gastos y tickets"],
  },
  { name: "Análisis y control", items: ["Balance", "Informes"] },
  { name: "Automatización", items: ["Tareas programadas", "Notas", "OCR inteligente"] },
  { name: "Administración", items: ["Usuarios y permisos", "Altas web", "Documentos", "Copias de seguridad", "Historial", "Papelera"] },
];

const routeModuleScopes: Record<string, string[]> = {
  crm: initialModules,
  comercial: ["Pedidos", "Clientes", "Contactos", "Presupuestos", "Albaranes", "Facturas", "Cobros", "Envíos"],
  almacen: ["Preparación de pedidos", "Stock", "Productos", "Almacenes", "Rutas", "Entradas", "Salidas", "Devoluciones", "Envíos", "Pedidos", "Notas"],
  web: ["Inicio", "Pedidos", "Clientes", "Productos"],
  ocr: ["OCR inteligente"],
};

const routeDefaultSections: Record<string, string> = {
  "/comercial": "Pedidos",
  "/almacen": "Preparación de pedidos",
  "/web": "Inicio",
  "/crm": "Inicio",
  "/ocr": "OCR inteligente",
};

export function Sidebar({
  active,
  setActive,
  user,
  moduleScope,
  onLogout,
}: {
  active: string;
  setActive: (x: string) => void;
  user: any;
  moduleScope?: string[];
  onLogout: () => void;
}) {
  const [items, setItems] = useState(initialModules);
  const [drag, setDrag] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "Ventas y clientes": true,
    "Logística y almacén": true,
    "Compras y proveedores": true,
    "Análisis y control": false,
    Automatización: false,
    Administración: false,
  });
  useEffect(() => {
    try {
      const saved = localStorage.getItem("excluvas.sidebar");
      if (saved) {
        const savedItems = JSON.parse(saved);
        setItems([
          ...savedItems,
          ...initialModules.filter((module) => !savedItems.includes(module)),
        ]);
      }
      setSidebarCollapsed(localStorage.getItem("excluvas.sidebar.collapsed") === "1");
    } catch {}
  }, []);
  useEffect(() => {
    for (const group of sidebarGroups)
      if (group.items.includes(active))
        setOpenGroups((current) =>
          current[group.name] ? current : { ...current, [group.name]: true },
        );
  }, [active]);
  const canOpenCommercialView = user?.role === "admin" || allowedModulesFor(user).includes("Pedidos");
  const canOpenWarehouseView = user?.role === "admin" || allowedModulesFor(user).includes("Preparación de pedidos");
  const canOpenWebView = user?.role === "admin" || allowedModulesFor(user).includes("Clientes");
  function drop(target: string) {
    if (!drag || drag === target) return;
    const next = [...items],
      from = next.indexOf(drag),
      to = next.indexOf(target);
    next.splice(from, 1);
    next.splice(to, 0, drag);
    setItems(next);
    localStorage.setItem("excluvas.sidebar", JSON.stringify(next));
  }
  return (
    <aside className={`sidebar${mobileOpen ? " mobile-open" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <button
        type="button"
        className="sidebar-collapse-toggle"
        onClick={() => {
          const next = !sidebarCollapsed;
          setSidebarCollapsed(next);
          localStorage.setItem("excluvas.sidebar.collapsed", next ? "1" : "0");
        }}
        aria-label={sidebarCollapsed ? "Abrir menú lateral" : "Plegar menú lateral"}
        title={sidebarCollapsed ? "Abrir menú lateral" : "Plegar menú lateral"}
      >
        {sidebarCollapsed ? "›" : "‹"}
      </button>
      <button type="button" className="mobile-sidebar-toggle" onClick={() => { const next = !mobileOpen; if (next) { const activeGroup = sidebarGroups.find((group) => group.items.includes(active))?.name; setOpenGroups((current) => Object.fromEntries(Object.keys(current).map((name) => [name, name === activeGroup]))); } setMobileOpen(next); }} aria-expanded={mobileOpen} aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"} title={mobileOpen ? "Cerrar menú" : "Abrir menú"}>
        <span className="mobile-sidebar-menu-label"><span className="mobile-sidebar-hamburger" aria-hidden="true"><i /><i /><i /></span><b className="mobile-sidebar-toggle-text">{mobileOpen ? "Cerrar menú" : "Menú"}</b><em>{active}</em></span>
        <span className="mobile-sidebar-user"><b>{user?.username || "Usuario"}</b><small>{user?.role === "admin" ? "Administrador" : "Usuario"}</small></span>
      </button>
      <div className="side-label">GESTIÓN</div>
      {allowedModulesFor(user).includes("Inicio") && (!moduleScope || moduleScope.includes("Inicio")) && (
        <button
          className={active === "Inicio" ? "nav-item active" : "nav-item"}
          onClick={() => { setActive("Inicio"); setMobileOpen(false); }}
        >
          Inicio
        </button>
      )}
      {sidebarGroups.map((group) => {
        const allowed = allowedModulesFor(user);
        const visible = items.filter((m) => group.items.includes(m) && allowed.includes(m) && (!moduleScope || moduleScope.includes(m)) && (m !== "Papelera" || user?.role === "admin"));
        if (!visible.length) return null;
        return (
          <div className="sidebar-group" key={group.name}>
            <button
              className="sidebar-group-title"
              onClick={() => {
                const next = {
                  ...openGroups,
                  [group.name]: !openGroups[group.name],
                };
                setOpenGroups(next);
              }}
            >
              <span aria-hidden="true">{openGroups[group.name] ? "⌄" : "›"}</span>
              {group.name}
            </button>
            {openGroups[group.name] &&
              visible.map((m) => (
                <button
                  draggable
                  key={m}
                  onDragStart={() => setDrag(m)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(m)}
                  className={active === m ? "nav-item active" : "nav-item"}
                  onClick={() => { setActive(m); setMobileOpen(false); }}
                >
                  {m}
                </button>
              ))}
          </div>
        );
      })}
      {mobileOpen && (canOpenCommercialView || canOpenWarehouseView || canOpenWebView) && (
        <div className="sidebar-route-shortcuts" aria-label="Vistas operativas">
          <div className="side-label">VISTAS OPERATIVAS</div>
          {canOpenCommercialView && <a href="/comercial" onClick={() => setMobileOpen(false)}><ToolbarIcon name="commercial" /><span>Vista comercial</span></a>}
          {canOpenWarehouseView && <a href="/almacen" onClick={() => setMobileOpen(false)}><ToolbarIcon name="warehouse" /><span>Vista almacén</span></a>}
          {canOpenWebView && <a href="/web" onClick={() => setMobileOpen(false)}><ToolbarIcon name="web" /><span>Web pública</span></a>}
        </div>
      )}
      {mobileOpen && <div className="mobile-sidebar-account"><span><b>{user?.username || "Usuario"}</b><small>{user?.role === "admin" ? "Administrador" : "Usuario"}</small></span><button type="button" onClick={() => { setMobileOpen(false); onLogout(); }}>Cerrar sesión</button></div>}
      <div className="sidebar-footer" title={`Versión ${APP_VERSION} · Entorno ${APP_ENVIRONMENT}`}>
        v{APP_VERSION} · {APP_ENVIRONMENT}
      </div>
    </aside>
  );
}

function IntegratedMap({ locations, radiusMeters = 150 }: { locations: any[]; radiusMeters?: number }) {
  const valid = locations.filter((location) => Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude)));
  if (!valid.length) return <div className="integrated-map-empty">Geolocaliza una dirección para mostrarla en el mapa.</div>;
  const center = valid[0];
  const lat = Number(center.latitude), lon = Number(center.longitude);
  const delta = Math.max(0.0025, Number(radiusMeters || 150) / 111000 * 2.8);
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - delta}%2C${lat - delta}%2C${lon + delta}%2C${lat + delta}&layer=mapnik&marker=${lat}%2C${lon}`;
  return <div className="integrated-map" aria-label={`Mapa de ubicaciones, radio ${radiusMeters} metros`}>
    <iframe title="Mapa de ubicaciones de entrega" src={src} loading="lazy" />
    <div className="integrated-map-radius" style={{ width: `${Math.min(180, Math.max(76, Number(radiusMeters) / 2))}px`, height: `${Math.min(180, Math.max(76, Number(radiusMeters) / 2))}px` }} aria-hidden="true"><span /></div>
    <div className="integrated-map-legend"><span className="integrated-map-dot" />Radio operativo {radiusMeters} m · {valid.length} ubicación{valid.length === 1 ? "" : "es"}</div>
  </div>;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(bLat - aLat);
  const longitudeDelta = toRadians(bLon - aLon);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function RoutesManager({ user }: { user: any }) {
  const [shipments, setShipments] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [routeDate, setRouteDate] = useState(() => tabletTodayInput());
  const [selected, setSelected] = useState<number[]>([]);
  const [driver, setDriver] = useState(user?.username || "");
  const [vehicle, setVehicle] = useState("");
  const [radius, setRadius] = useState(150);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeRoute, setActiveRoute] = useState<any>(null);
  const [routeDraft, setRouteDraft] = useState<any>(null);
  async function load() {
    setLoading(true);
    try {
      const [shipmentResponse, clientsResponse, pointsResponse, routesResponse] = await Promise.all([fetch("/api/shipments"), fetch("/api/clients?view=lookup&limit=500"), fetch("/api/collection_points?view=lookup&limit=500"), fetch("/api/routes")]);
      const shipmentRows = shipmentResponse.ok ? await shipmentResponse.json() : [];
      const clients = clientsResponse.ok ? await clientsResponse.json() : [];
      const points = pointsResponse.ok ? await pointsResponse.json() : [];
      const enriched = (Array.isArray(shipmentRows) ? shipmentRows : []).filter((item) => !["Cancelado", "Entregado"].includes(String(item.status || ""))).map((item) => {
        const point = points.find((row: any) => Number(row.id) === Number(item.collection_point_id));
        const client = clients.find((row: any) => Number(row.id) === Number(item.client_id));
        return { ...item, client_name: client?.name || "Cliente sin nombre", address: item.address || point?.address || client?.address || "", city: item.delivery_city || point?.city || client?.city || "", opening_time: item.delivery_window_start || point?.opening_time || client?.opening_time || "", closing_time: item.delivery_window_end || point?.closing_time || client?.closing_time || "", latitude: item.latitude ?? point?.latitude ?? client?.latitude, longitude: item.longitude ?? point?.longitude ?? client?.longitude };
      });
      setShipments(enriched);
      setRoutes(routesResponse.ok ? await routesResponse.json() : []);
    } catch { setMessage("No se han podido cargar los envíos y rutas."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const dayShipments = shipments.filter((item) => String(item.expected_delivery_at || item.delivery_date || "").slice(0, 10) === routeDate).sort((a, b) => String(a.opening_time || "99:99").localeCompare(String(b.opening_time || "99:99")) || String(a.client_name || "").localeCompare(String(b.client_name || ""), "es"));
  const selectedLocations = dayShipments.filter((item) => selected.includes(Number(item.id)));
  async function createRoute() {
    if (!selected.length) { setMessage("Selecciona al menos un envío."); return; }
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/routes", { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": user?.username || "Usuario local" }, body: JSON.stringify({ route_date: routeDate, shipment_ids: selected, driver, vehicle, radius_meters: radius }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se ha podido crear la ruta.");
      setActiveRoute(body); setRoutes((current) => [body, ...current]); setSelected([]); setMessage(`Ruta ${body.code} planificada con ${body.stops.length} paradas.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se ha podido crear la ruta."); }
    finally { setSaving(false); }
  }
  async function saveRouteEdit() {
    if (!activeRoute || !routeDraft) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/routes/${activeRoute.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Actor": user?.username || "Usuario local" }, body: JSON.stringify({ driver: routeDraft.driver, vehicle: routeDraft.vehicle, status: routeDraft.status, radius_meters: Math.max(50, Number(routeDraft.radius_meters) || 150), notes: routeDraft.notes }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se ha podido guardar la ruta.");
      setActiveRoute(body); setRoutes((current) => current.map((route) => Number(route.id) === Number(body.id) ? body : route)); setRouteDraft(null); setMessage("Ruta actualizada. Los cambios ya están disponibles para el reparto.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se ha podido guardar la ruta."); }
    finally { setSaving(false); }
  }
 return <section className="routes-manager"><div className="manager-head"><div><p className="eyebrow">LOGÍSTICA · PLANIFICACIÓN</p><h2>Rutas de reparto</h2><p className="muted">Agrupa entregas geolocalizadas y prioriza las franjas de apertura para preparar la ruta.</p></div><button type="button" className="button secondary" onClick={() => void load()}>Actualizar</button></div><div className="routes-toolbar"><label>Fecha de entrega<input type="date" value={routeDate} onChange={(event) => { setRouteDate(event.target.value); setSelected([]); setActiveRoute(null); setRouteDraft(null); }} /></label><label>Radio operativo (m)<input type="number" min="50" max="5000" step="50" value={radius} onChange={(event) => setRadius(Math.max(50, Number(event.target.value) || 150))} /></label><label>Repartidor<input value={driver} onChange={(event) => setDriver(event.target.value)} placeholder="Nombre" /></label><label>Vehículo<input value={vehicle} onChange={(event) => setVehicle(event.target.value)} placeholder="Matrícula o referencia" /></label></div>{message && <p className="routes-message" role="status">{message}</p>}<div className="routes-layout"><div className="routes-shipments panel"><div className="panel-head"><div><h3>Entregas disponibles</h3><p className="muted">{dayShipments.length} envíos para el {routeDate}</p></div><button type="button" className="button primary" disabled={saving || !selected.length} onClick={() => void createRoute()}>{saving ? "Planificando…" : `Crear ruta (${selected.length})`}</button></div>{loading ? <div className="data-loading" role="status">Cargando entregas…</div> : <div className="route-shipment-list">{dayShipments.length ? dayShipments.map((item) => { const located = Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)); return <label className={`route-shipment${selected.includes(Number(item.id)) ? " selected" : ""}`} key={item.id}><input type="checkbox" checked={selected.includes(Number(item.id))} onChange={(event) => setSelected((current) => event.target.checked ? [...current, Number(item.id)] : current.filter((id) => id !== Number(item.id)))} /><span><b>{item.code}</b><strong>{item.client_name}</strong><small>{[item.address, item.city].filter(Boolean).join(" · ") || "Sin dirección"}</small><small>{item.opening_time && item.closing_time ? `Horario del cliente: ${item.opening_time}–${item.closing_time}` : "Horario pendiente de indicar"}</small></span><em className={located ? "located" : "not-located"}>{located ? "Geolocalizado" : "Sin coordenadas"}</em></label>; }) : <p className="empty-state">No hay envíos para esta fecha.</p>}</div>}</div><div className="routes-existing panel"><div className="panel-head"><div><h3>Rutas planificadas</h3><p className="muted">Histórico y seguimiento de paradas.</p></div></div>{routes.length ? routes.map((route) => <button type="button" className={`route-card${activeRoute?.id === route.id ? " active" : ""}`} key={route.id} onClick={() => { setActiveRoute(route); setRouteDraft(null); }}><span><b>{route.code}</b><small>{route.route_date} · {route.driver || "Sin repartidor"} · {route.status || "Planificada"}</small></span><strong>{route.stops?.length || 0}</strong></button>) : <p className="empty-state">Todavía no hay rutas.</p>}</div></div>{activeRoute && <div className="route-detail panel"><div className="panel-head"><div><p className="eyebrow">{activeRoute.code}</p><h3>Orden de ruta · {activeRoute.route_date}</h3><p className="muted">{activeRoute.driver || "Sin repartidor"} · {activeRoute.vehicle || "Sin vehículo"} · Radio {activeRoute.radius_meters || 150} m</p></div><div className="route-detail-actions">{activeRoute.maps_url && <a className="button primary" href={activeRoute.maps_url} target="_blank" rel="noreferrer">Navegar con Google Maps</a>}<button type="button" className="button secondary" onClick={() => setRouteDraft({ driver: activeRoute.driver || "", vehicle: activeRoute.vehicle || "", status: activeRoute.status || "Planificada", radius_meters: activeRoute.radius_meters || 150, notes: activeRoute.notes || "" })}>Editar ruta</button></div></div>{routeDraft && <div className="route-edit-panel"><div><b>Editar planificación</b><small>Los cambios se guardan también para la vista del repartidor.</small></div><div className="route-edit-fields"><label>Repartidor<input value={routeDraft.driver} onChange={(event) => setRouteDraft((current: any) => ({ ...current, driver: event.target.value }))} /></label><label>Vehículo<input value={routeDraft.vehicle} onChange={(event) => setRouteDraft((current: any) => ({ ...current, vehicle: event.target.value }))} /></label><label>Estado<select value={routeDraft.status} onChange={(event) => setRouteDraft((current: any) => ({ ...current, status: event.target.value }))}><option>Planificada</option><option>En curso</option><option>Completada</option><option>Cancelada</option></select></label><label>Radio operativo (m)<input type="number" min="50" max="5000" value={routeDraft.radius_meters} onChange={(event) => setRouteDraft((current: any) => ({ ...current, radius_meters: event.target.value }))} /></label><label className="route-edit-wide">Notas<textarea rows={2} value={routeDraft.notes} onChange={(event) => setRouteDraft((current: any) => ({ ...current, notes: event.target.value }))} placeholder="Ej. cargar primero las entregas con apertura a las 09:00…" /></label></div><div className="route-edit-actions"><button type="button" className="button secondary" onClick={() => setRouteDraft(null)}>Cancelar</button><button type="button" className="button primary" disabled={saving} onClick={() => void saveRouteEdit()}>{saving ? "Guardando…" : "Guardar cambios"}</button></div></div>}<div className="route-metrics"><div><b>{Number(activeRoute.total_distance_km || 0).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km</b><span>distancia estimada</span></div><div><b>{Math.floor(Number(activeRoute.estimated_minutes || 0) / 60)} h {Number(activeRoute.estimated_minutes || 0) % 60} min</b><span>tiempo con paradas</span></div><div><b>{activeRoute.stops?.length || 0}</b><span>entregas</span></div></div>{(activeRoute.time_window_warnings || []).length > 0 && <div className="route-time-warnings" role="alert"><b>Revisar horarios</b>{activeRoute.time_window_warnings.map((warning: any) => <span key={`${warning.stop_id}-${warning.message}`}>Parada {warning.position} · {warning.client_name}: {warning.message}</span>)}</div>}<IntegratedMap locations={activeRoute.stops || selectedLocations} radiusMeters={Number(activeRoute.radius_meters || 150)} /><ol className="route-stop-list">{(activeRoute.stops || []).map((stop: any) => <li key={stop.id}><b>{stop.position}. {stop.client_name}</b><span>{[stop.address, stop.city].filter(Boolean).join(" · ")}</span><small>{stop.opening_time && stop.closing_time ? `Horario ${stop.opening_time}–${stop.closing_time} · ` : "Horario pendiente · "}{stop.distance_km ? `${stop.distance_km} km desde la parada anterior` : "Salida"}</small></li>)}</ol></div>}</section>;
}

function BackupsManager({ user }: { user: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function load() { setLoading(true); try { const response = await fetch("/api/backups"); setRows(response.ok ? await response.json() : []); } catch { setMessage("No se ha podido cargar el histórico de copias."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  async function create() { setSaving(true); setMessage(""); try { const response = await fetch("/api/backups", { method: "POST", headers: { "X-Actor": user?.username || "Usuario local" } }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo crear la copia."); setMessage(`Copia ${body.snapshot.code} creada correctamente.`); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo crear la copia."); } finally { setSaving(false); } }
  async function restore(row: any) { if (!window.confirm(`Vas a restaurar ${row.code}. Se conservarán usuarios e historial, pero se reemplazarán los datos operativos. ¿Continuar?`)) return; setSaving(true); setMessage(""); try { const response = await fetch(`/api/backups/${row.id}/restore`, { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": user?.username || "Usuario local" }, body: JSON.stringify({ confirm: "RESTAURAR_TURSO" }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo restaurar la copia."); setMessage(`${row.code} restaurada. Registros recuperados: ${body.inserted}.`); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo restaurar la copia."); } finally { setSaving(false); } }
  return <section className="backups-manager"><div className="manager-head"><div><p className="eyebrow">ADMINISTRACIÓN · TURSO</p><h2>Copias de seguridad</h2><p className="muted">Histórico de snapshots de la base de datos y restauración controlada.</p></div><div className="backup-manager-actions"><a className="button secondary" href="/api/backup">Descargar copia actual</a><button type="button" className="button primary" disabled={saving} onClick={() => void create()}>{saving ? "Creando…" : "Crear copia ahora"}</button></div></div>{message && <p className="success-message" role="status">{message}</p>}{loading ? <div className="data-loading" role="status">Cargando copias…</div> : <div className="backup-list panel">{rows.length ? rows.map((row) => <article className="backup-row" key={row.id}><div><b>{row.code}</b><small>{row.created_at ? formatSpanishDateValue(row.created_at, true) : "—"} · {row.created_by || "Sistema"} · {row.size_bytes ? `${Math.round(Number(row.size_bytes) / 1024)} KB comprimidos` : "—"}</small><span>{Object.entries(row.tables || {}).slice(0, 4).map(([table, count]) => `${table}: ${count}`).join(" · ")}</span></div><div><b className="backup-status">{row.status}</b><a className="button secondary" href={`/api/backups/${row.id}`}>Descargar</a><button type="button" className="button danger" disabled={saving} onClick={() => void restore(row)}>Restaurar</button></div></article>) : <p className="empty-state">Todavía no hay copias automáticas guardadas.</p>}</div>}</section>;
}

function Contacts({ onNavigate }: { onNavigate: (section: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingDraft, setEditingDraft] = useState<any>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  useEffect(() => {
    setLoading(true);
    const loadContacts = async () => {
      try {
        const [clientsResponse, suppliersResponse] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/suppliers"),
        ]);
        const clients = clientsResponse.ok ? await clientsResponse.json() : [];
        const suppliers = suppliersResponse.ok ? await suppliersResponse.json() : [];
        const clientRows = (Array.isArray(clients) ? clients : []).map((client: any) => ({ ...client, id: "cliente-" + client.id, name: client.name, email: client.email || "", phone: client.phone || "", contact: client.contact || "", address: client.address || "", city: client.city || "", type: "Cliente", invoices: [], payments: [] }));
        const supplierRows = (Array.isArray(suppliers) ? suppliers : []).map((supplier: any) => ({ ...supplier, id: "proveedor-" + supplier.id, name: supplier.name, email: supplier.email || "", phone: supplier.phone || "", contact: supplier.contact || "", address: supplier.address || "", city: supplier.city || "", type: "Proveedor", purchases: [] }));
        setRows([...clientRows, ...supplierRows]);
        setLoading(false);
        const [invoicesResult, paymentsResult, purchasesResult] = await Promise.allSettled([
          fetch("/api/invoices").then((response) => response.ok ? response.json() : []),
          fetch("/api/payments").then((response) => response.ok ? response.json() : []),
          fetch("/api/purchase_orders").then((response) => response.ok ? response.json() : []),
        ]);
        const invoices = invoicesResult.status === "fulfilled" ? invoicesResult.value : [];
        const payments = paymentsResult.status === "fulfilled" ? paymentsResult.value : [];
        const purchases = purchasesResult.status === "fulfilled" ? purchasesResult.value : [];
        setRows((current) => current.map((row) => row.type === "Cliente"
          ? { ...row, invoices: (Array.isArray(invoices) ? invoices : []).filter((invoice: any) => Number(invoice.client_id) === Number(row.id.split("-")[1])), payments: (Array.isArray(payments) ? payments : []).filter((payment: any) => (Array.isArray(invoices) ? invoices : []).some((invoice: any) => Number(invoice.id) === Number(payment.invoice_id) && Number(invoice.client_id) === Number(row.id.split("-")[1]))) }
          : { ...row, purchases: (Array.isArray(purchases) ? purchases : []).filter((purchase: any) => Number(purchase.supplier_id) === Number(row.id.split("-")[1])) }));
      } catch {
        setRows([]);
        setLoading(false);
      }
    };
    void loadContacts();
  }, []);
  const inRange = (value: any) => {
    const date = String(value || "").slice(0, 10);
    if (!date) return false;
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  };
  const periodRows = rows.map((row) => {
    if (row.type === "Cliente") {
      const invoices = (row.invoices || []).filter((invoice: any) =>
        inRange(invoice.issue_date || invoice.invoice_date || invoice.created_at),
      );
      const invoiceIds = new Set(invoices.map((invoice: any) => Number(invoice.id)));
      const payments = (row.payments || []).filter(
        (payment: any) =>
          invoiceIds.has(Number(payment.invoice_id)) &&
          inRange(payment.payment_date || payment.created_at),
      );
      return {
        ...row,
        balance:
          invoices.reduce(
            (sum: number, invoice: any) => sum + Number(invoice.amount || 0),
            0,
          ) - payments.reduce(
            (sum: number, payment: any) => sum + Number(payment.amount || 0),
            0,
          ),
        activity: invoices.length + payments.length,
      };
    }
    const purchases = (row.purchases || []).filter((purchase: any) =>
      inRange(purchase.order_date || purchase.created_at),
    );
    return {
      ...row,
      balance: -purchases.reduce(
        (sum: number, purchase: any) => sum + Number(purchase.amount || 0),
        0,
      ),
      activity: purchases.length,
    };
  });
  const filtered = periodRows.filter((row) =>
    (row.name + " " + row.email + " " + row.phone + " " + row.type)
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  function beginEdit(row: any) {
    setEditingId(row.id);
    setEditingDraft({
      name: row.name || "",
      type: row.type || "Contacto",
      external_code: row.external_code || "",
      tax_id: row.tax_id || "",
      email: row.email || "",
      phone: row.phone || "",
      contact: row.contact || "",
      address: row.address || "",
      city: row.city || "",
      payment_terms: row.payment_terms || "",
      active: Number(row.active ?? 1),
      source_balance: row.balance || 0,
      source_activity: row.activity || 0,
      source_created_at: row.created_at || "",
    });
  }
  async function saveEdit(row: any) {
    const resource = row.type === "Cliente" ? "clients" : "suppliers";
    const id = row.id.split("-").slice(1).join("-");
    const { name, external_code, tax_id, email, phone, contact, address, city, payment_terms, active } = editingDraft;
    const response = await fetch(`/api/${resource}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Actor": "Contactos" },
      body: JSON.stringify({ name, external_code, tax_id, email, phone, contact, address, city, payment_terms, active }),
    });
    if (response.ok) {
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, ...editingDraft } : item,
        ),
      );
      setEditingId("");
    } else {
      window.alert("No se han podido guardar los cambios.");
    }
  }
  async function deleteContact(row: any) {
    if (!window.confirm(`¿Eliminar ${row.name}?`)) return;
    const resource = row.type === "Cliente" ? "clients" : "suppliers";
    const id = row.id.split("-").slice(1).join("-");
    const response = await fetch(`/api/${resource}/${id}`, {
      method: "DELETE",
      headers: { "X-Actor": "Contactos" },
    });
    if (response.ok) {
      setRows((current) => current.filter((item) => item.id !== row.id));
      setEditingId("");
    } else {
      window.alert("No se ha podido eliminar el contacto.");
    }
  }
  return (
    <div className="contacts-page">
      <div className="manager-head contacts-toolbar">
        <div>
          <p className="eyebrow">RELACIONES COMERCIALES</p>
          <h2>Contactos</h2>
          <p className="muted">
            {loading ? "Cargando contactos…" : `${rows.length} contactos de clientes y proveedores.`}
          </p>
        </div>
        <div>
          <label className="contacts-date-filter">
            Desde
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="contacts-date-filter">
            Hasta
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <input
            type="search"
            placeholder="⌕ Buscar..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="button primary"
            onClick={() => {
              onNavigate("Clientes");
              window.setTimeout(() => window.dispatchEvent(new Event("crm:nuevo-cliente")), 0);
            }}
          >
            ＋ Crear contacto
          </button>
        </div>
      </div>
      <div className="contacts-layout">
        <div className="contacts-table-wrap contacts-table-wide">
          <div className="list-count" role="status">{loading ? "Cargando…" : `${filtered.length} registros`}</div>
          <table className="contacts-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th>Tipo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}><div className="data-loading" role="status"><span className="loading-spinner" aria-hidden="true" /> Cargando contactos…</div></td></tr>
              ) : filtered.map((row) => (
                <tr
                  key={row.id}
                  className={editingId === row.id ? "selected" : ""}
                  onClick={() => beginEdit(row)}
                >
                  <td>
                    <span className="contact-avatar">{row.name?.slice(0, 1).toUpperCase()}</span>
                    <b>{row.name}</b>
                  </td>
                  <td>{row.email || "—"}</td>
                  <td>{row.phone || "—"}</td>
                  <td>
                    <span
                      className={
                        row.type === "Proveedor"
                          ? "contact-type supplier"
                          : "contact-type"
                      }
                    >
                      {row.type}
                    </span>
                  </td>
                  <td className="contacts-actions">
                    <button className="contact-action" onClick={(event) => { event.stopPropagation(); beginEdit(row); }}>Editar</button>
                    <button
                      className="contact-action delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteContact(row);
                      }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !filtered.length && (
            <p className="muted contacts-empty">
              No hay contactos que coincidan.
            </p>
          )}
        </div>
      </div>
      {editingId && (
        <div className="contact-edit-overlay" role="dialog" aria-modal="true" aria-label={`Editar ${editingDraft.name || "contacto"}`}>
          <form className="contact-edit-modal" onSubmit={(event) => { event.preventDefault(); void saveEdit(rows.find((row) => row.id === editingId)); }}>
            <header className="contact-edit-head">
              <div><p className="eyebrow">{editingDraft.type || rows.find((row) => row.id === editingId)?.type || "CONTACTO"}</p><h2>Editar contacto</h2><span>{editingDraft.name || "Completa los datos del contacto"}</span></div>
              <button type="button" className="preview-close" aria-label="Cerrar" onClick={() => setEditingId("")}>×</button>
            </header>
            <div className="contact-edit-grid">
              <label>Empresa / nombre *<input required value={editingDraft.name || ""} onChange={(event) => setEditingDraft({ ...editingDraft, name: event.target.value })} /></label>
              <label>Código externo<input value={editingDraft.external_code || ""} onChange={(event) => setEditingDraft({ ...editingDraft, external_code: event.target.value })} /></label>
              <label>NIF / CIF<input value={editingDraft.tax_id || ""} onChange={(event) => setEditingDraft({ ...editingDraft, tax_id: event.target.value })} /></label>
              <label>Persona de contacto<input value={editingDraft.contact || ""} onChange={(event) => setEditingDraft({ ...editingDraft, contact: event.target.value })} /></label>
              <label>Email<input type="email" value={editingDraft.email || ""} onChange={(event) => setEditingDraft({ ...editingDraft, email: event.target.value })} /></label>
              <label>Teléfono<input value={editingDraft.phone || ""} onChange={(event) => setEditingDraft({ ...editingDraft, phone: event.target.value })} /></label>
              <label>Ciudad<input value={editingDraft.city || ""} onChange={(event) => setEditingDraft({ ...editingDraft, city: event.target.value })} /></label>
              <label>Condiciones de pago<input value={editingDraft.payment_terms || ""} onChange={(event) => setEditingDraft({ ...editingDraft, payment_terms: event.target.value })} /></label>
              <label className="contact-edit-wide">Dirección<textarea rows={3} value={editingDraft.address || ""} onChange={(event) => setEditingDraft({ ...editingDraft, address: event.target.value })} /></label>
              <label>Estado<select value={String(editingDraft.active ?? 1)} onChange={(event) => setEditingDraft({ ...editingDraft, active: Number(event.target.value) })}><option value="1">Activo</option><option value="0">Baja</option></select></label>
            </div>
            <div className="contact-source-summary"><span>Saldo origen <b>{Number(editingDraft.source_balance || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</b></span><span>Actividad origen <b>{Number(editingDraft.source_activity || 0)} movimiento{Number(editingDraft.source_activity || 0) === 1 ? "" : "s"}</b></span><span>Alta origen <b>{editingDraft.source_created_at || "—"}</b></span></div>
            <footer className="preview-actions"><button type="button" className="button secondary" onClick={() => setEditingId("")}>Cancelar</button><button type="submit" className="button primary">Guardar cambios</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}

function ExpenseScanner({
  clients,
  actor,
  onCreated,
}: {
  clients: any[];
  actor: string;
  onCreated: (row: any) => void;
}) {
  const [file, setFile] = useState<any>(null);
  const [clientId, setClientId] = useState("");
  const [vendor, setVendor] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => tabletTodayInput());
  const [amount, setAmount] = useState("");
  const [vat, setVat] = useState("21");
  const [category, setCategory] = useState("Gastos de representación");
  const [paymentMethod, setPaymentMethod] = useState("Tarjeta");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  function selectFile(selected: File) {
    if (selected.size > 8 * 1024 * 1024) {
      setStatus("El archivo no puede superar 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFile({
        name: selected.name,
        mime: selected.type,
        data: String(reader.result || ""),
      });
      setStatus("Documento cargado. Revisa los datos antes de crear el gasto.");
    };
    reader.readAsDataURL(selected);
  }
  function reset() {
    setFile(null);
    setVendor("");
    setAmount("");
    setVat("21");
    setCategory("Gastos de representación");
    setPaymentMethod("Tarjeta");
    setStatus("");
  }
  async function createExpense() {
    if (!file || !amount || !clientId) {
      setStatus(
        "Adjunta un ticket, selecciona un cliente e indica el importe.",
      );
      return;
    }
    setSaving(true);
    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Actor": actor },
      body: JSON.stringify({
        code: "GAS-" + String(Date.now()).slice(-8),
        client_id: Number(clientId),
        expense_date: expenseDate,
        category,
        vendor,
        amount: Number(amount),
        vat: Number(vat || 0),
        payment_method: paymentMethod,
        attachment_name: file.name,
        attachment_mime: file.mime || "application/octet-stream",
        attachment_data: file.data,
      }),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      setStatus(body.error || "No se ha podido crear el gasto.");
      return;
    }
    onCreated(body);
    reset();
    setStatus("Gasto creado correctamente y asociado al cliente.");
  }
  return (
    <section className="expense-scanner">
      <div className="expense-scanner-heading">
        <div>
          <p className="eyebrow">ESCÁNER DE TICKETS</p>
          <h3>Digitalización de justificantes</h3>
          <p>
            Sube una imagen o PDF, revisa los datos y crea el gasto en SQLite.
          </p>
        </div>
        <span className={file ? "scanner-state ready" : "scanner-state"}>
          {file ? "● Documento cargado" : "○ Esperando documento"}
        </span>
      </div>
      <div className="expense-scanner-grid">
        <div className="expense-document-preview">
          {file?.mime?.startsWith("image/") ? (
            <img src={file.data} alt="Previsualización del ticket" />
          ) : file?.mime === "application/pdf" ? (
            <iframe src={file.data} title="Previsualización del justificante" />
          ) : (
            <div className="expense-document-placeholder">
              <span>▤</span>
              <b>{file?.name || "Aquí aparecerá el ticket"}</b>
              <small>
                {file
                  ? "Documento listo para revisar"
                  : "Imagen, PDF o fotografía desde la tablet"}
              </small>
            </div>
          )}
          {file && <span className="expense-document-check">✓</span>}
          <label className="expense-scan-button">
            ⌁ Escanear o subir documento
            <input
              type="file"
              accept="image/*,.pdf,application/pdf"
              capture="environment"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) selectFile(selected);
              }}
            />
          </label>
        </div>
        <div className="expense-extracted-panel">
          <div className="expense-extracted-head">
            <div>
              <span className="expense-ai-icon">✦</span>
              <strong>Datos del justificante</strong>
              <small>Revisión asistida</small>
            </div>
            <span className={file ? "scanner-state ready" : "scanner-state"}>
              {file ? "Revisar antes de guardar" : "Sin documento"}
            </span>
          </div>
          <div className="expense-fields-grid">
            <label>
              Cliente
              <select
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              >
                <option value="">Seleccionar cliente…</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Establecimiento
              <input
                value={vendor}
                onChange={(event) => setVendor(event.target.value)}
                placeholder="Pendiente de revisar"
              />
            </label>
            <label>
              Fecha
              <input
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
              />
            </label>
            <label>
              Importe total
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0,00 €"
              />
            </label>
            <label>
              IVA %
              <input
                type="number"
                step="0.01"
                value={vat}
                onChange={(event) => setVat(event.target.value)}
              />
            </label>
            <label>
              Categoría
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option>Gastos de representación</option>
                <option>Combustible</option>
                <option>Comida</option>
                <option>Aparcamiento</option>
                <option>Material</option>
                <option>Otros</option>
              </select>
            </label>
            <label>
              Forma de pago
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option>Tarjeta</option>
                <option>Efectivo</option>
                <option>Transferencia</option>
              </select>
            </label>
          </div>
          <div className="expense-confidence">
            <span>Control del documento</span>
            <strong>{file ? "Datos editables" : "Pendiente"}</strong>
            <div>
              <i style={{ width: file ? "72%" : "0%" }} />
            </div>
          </div>
          <div className="expense-scanner-actions">
            <button
              className="button primary"
              onClick={createExpense}
              disabled={saving || !file}
            >
              {saving ? "Guardando…" : "✓ Crear gasto automáticamente"}
            </button>
            <button className="button secondary" onClick={reset}>
              ↻ Escanear otro documento
            </button>
          </div>
          {status && <p className="expense-scanner-status">{status}</p>}
        </div>
      </div>
    </section>
  );
}

function ProductCodePreview({ code, name, price }: { code: string; name?: string; price?: number }) {
  const [qrImage, setQrImage] = useState("");
  const [barcodeDownloadUrl, setBarcodeDownloadUrl] = useState("");
  const barcodeRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    QRCode.toDataURL(code || "EXC-PRODUCTO", { width: 180, margin: 1 }).then((value: string) => setQrImage(value)).catch(() => setQrImage(""));
    if (barcodeRef.current) { try { JsBarcode(barcodeRef.current, code || "EXC-PRODUCTO", { format: "CODE128", displayValue: true, fontSize: 12, height: 48, margin: 2 }); setBarcodeDownloadUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(barcodeRef.current.outerHTML)}`); } catch { setBarcodeDownloadUrl(""); } }
  }, [code]);
  return <div className="product-code-preview"><div className="print-label"><b>EXCLUSIVAS</b><strong>{name || "Producto"}</strong><small>{code || "EXC-PRODUCTO"}</small><svg ref={barcodeRef} aria-label={`Código de barras ${code}`} />{price != null && <span>{Number(price || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</span>}<a className="button secondary product-code-download" href={barcodeDownloadUrl || "#"} download={`${code || "codigo-producto"}-barras.svg`} onClick={(event) => !barcodeDownloadUrl && event.preventDefault()}>Descargar barras SVG</a></div><div className="product-qr-card"><b>Código QR</b>{qrImage ? <img src={qrImage} alt={`Código QR de ${name || "producto"}`} /> : <span>Generando…</span>}<small>{code || "EXC-PRODUCTO"}</small>{qrImage && <a className="button secondary product-code-download" href={qrImage} download={`${code || "codigo-producto"}-qr.png`}>Descargar QR PNG</a>}</div></div>;
}

function ProductLabelModal({ product, actor, onClose, onSaved }: { product: any; actor: string; onClose: () => void; onSaved: (row: any) => void }) {
  const [code, setCode] = useState(String(product.barcode || product.sku || `EXC-${String(product.id).padStart(5, "0")}`));
  const [qrImage, setQrImage] = useState("");
  const [barcodeDownloadUrl, setBarcodeDownloadUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [printMode, setPrintMode] = useState<"all" | "barcode" | "qr" | "both">("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const barcodeRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    QRCode.toDataURL(code || "EXC-PRODUCTO", { width: 180, margin: 1 })
      .then((value: string) => setQrImage(value))
      .catch(() => setQrImage(""));
    if (barcodeRef.current) {
      try { JsBarcode(barcodeRef.current, code || "EXC-PRODUCTO", { format: "CODE128", displayValue: true, fontSize: 12, height: 48, margin: 2 }); setBarcodeDownloadUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(barcodeRef.current.outerHTML)}`); } catch { setBarcodeDownloadUrl(""); }
    }
  }, [code]);
  async function saveCode() {
    if (!code.trim()) return setError("Indica un código para el producto.");
    setSaving(true);
    const response = await fetch(`/api/products/${product.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ ...product, barcode: code.trim() }) });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error || "No se pudo guardar el código.");
    onSaved(body);
  }
  return (
    <div className="preview-overlay product-label-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="product-label-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-label-head"><div><p className="eyebrow">ETIQUETA DE PRODUCTO</p><h2>{product.name}</h2><small>Genera, guarda e imprime los códigos del catálogo.</small></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></div>
        <div className="product-label-code"><label>Código de barras / referencia<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} /></label><button className="button primary" type="button" onClick={saveCode} disabled={saving}>{saving ? "Guardando…" : "Guardar código"}</button></div>
        {error && <p className="users-manager-error">{error}</p>}
        <div className={`product-label-preview product-label-print-${printMode}`}>
          <div className="print-label"><b>EXCLUSIVAS</b><strong>{product.name}</strong><small>{product.sku || code}</small><svg ref={barcodeRef} aria-label={`Código de barras ${code}`} /><span>{Number(product.unit_price || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</span><a className="button secondary product-code-download" href={barcodeDownloadUrl || "#"} download={`${code || "codigo-producto"}-barras.svg`} onClick={(event) => !barcodeDownloadUrl && event.preventDefault()}>Descargar barras SVG</a></div>
          <div className="product-qr-card"><b>Código QR</b>{qrImage ? <img src={qrImage} alt={`Código QR de ${product.name}`} /> : <span>Generando…</span>}<small>{code}</small>{qrImage && <a className="button secondary product-code-download" href={qrImage} download={`${code || "codigo-producto"}-qr.png`}>Descargar QR PNG</a>}</div>
        </div>
        <div className="product-label-print-controls"><label>Qué imprimir<select value={printMode} onChange={(event) => setPrintMode(event.target.value as typeof printMode)}><option value="all">Etiqueta completa</option><option value="barcode">Solo código de barras</option><option value="qr">Solo código QR</option><option value="both">QR + código de barras</option></select></label><small>El modo se aplica al imprimir o guardar como PDF.</small></div>
        <div className="product-label-actions"><button className="button secondary" type="button" onClick={onClose}>Cerrar</button><button className="button primary" type="button" onClick={() => window.print()}>Imprimir etiqueta</button></div>
      </div>
    </div>
  );
}

const crmReferenceImages = {
  cerveza: { thumbnail: "https://res.cloudinary.com/a3msu7ba/image/upload/c_fill,w_320,h_320,f_auto,q_auto/v1788259225/exclusivas-inteligentes/referencias-catalogo/generico-cerveza.png", web: "https://res.cloudinary.com/a3msu7ba/image/upload/c_limit,w_1600,f_auto,q_auto/v1788259225/exclusivas-inteligentes/referencias-catalogo/generico-cerveza.png" },
  vino: { thumbnail: "https://res.cloudinary.com/a3msu7ba/image/upload/c_fill,w_320,h_320,f_auto,q_auto/v1788259068/exclusivas-inteligentes/referencias-catalogo/generico-vino.png", web: "https://res.cloudinary.com/a3msu7ba/image/upload/c_limit,w_1600,f_auto,q_auto/v1788259068/exclusivas-inteligentes/referencias-catalogo/generico-vino.png" },
  agua: { thumbnail: "https://res.cloudinary.com/a3msu7ba/image/upload/c_fill,w_320,h_320,f_auto,q_auto/v1788259069/exclusivas-inteligentes/referencias-catalogo/generico-agua.png", web: "https://res.cloudinary.com/a3msu7ba/image/upload/c_limit,w_1600,f_auto,q_auto/v1788259069/exclusivas-inteligentes/referencias-catalogo/generico-agua.png" },
  refrescos: { thumbnail: "https://res.cloudinary.com/a3msu7ba/image/upload/c_fill,w_320,h_320,f_auto,q_auto/v1788259069/exclusivas-inteligentes/referencias-catalogo/generico-refrescos.png", web: "https://res.cloudinary.com/a3msu7ba/image/upload/c_limit,w_1600,f_auto,q_auto/v1788259069/exclusivas-inteligentes/referencias-catalogo/generico-refrescos.png" },
  zumos: { thumbnail: "https://res.cloudinary.com/a3msu7ba/image/upload/c_fill,w_320,h_320,f_auto,q_auto/v1788259070/exclusivas-inteligentes/referencias-catalogo/generico-zumos.png", web: "https://res.cloudinary.com/a3msu7ba/image/upload/c_limit,w_1600,f_auto,q_auto/v1788259070/exclusivas-inteligentes/referencias-catalogo/generico-zumos.png" },
  alimentacion: { thumbnail: "https://res.cloudinary.com/a3msu7ba/image/upload/c_fill,w_320,h_320,f_auto,q_auto/v1788259071/exclusivas-inteligentes/referencias-catalogo/generico-alimentacion.png", web: "https://res.cloudinary.com/a3msu7ba/image/upload/c_limit,w_1600,f_auto,q_auto/v1788259071/exclusivas-inteligentes/referencias-catalogo/generico-alimentacion.png" },
  bebidas: { thumbnail: "https://res.cloudinary.com/a3msu7ba/image/upload/c_fill,w_320,h_320,f_auto,q_auto/v1788259072/exclusivas-inteligentes/referencias-catalogo/generico-bebidas.png", web: "https://res.cloudinary.com/a3msu7ba/image/upload/c_limit,w_1600,f_auto,q_auto/v1788259072/exclusivas-inteligentes/referencias-catalogo/generico-bebidas.png" },
} as const;
function productReferenceImageSource(product: any, large = false) {
  if (!String(product?.name || "").trim()) return "";
  const text = `${product?.name || ""} ${product?.family || ""} ${product?.category || ""} ${product?.subfamily || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const category = /cerveza|lager|ipa|sidra/.test(text) ? "cerveza" : /vino|cava|vermut|jerez|licor|whisky|ginebra|ron|vodka/.test(text) ? "vino" : /agua|mineral|fuente/.test(text) ? "agua" : /zumo|nectar|jugo/.test(text) ? "zumos" : /refresco|cola|tonica|ginger|limonada|naranja|isotonica|energy/.test(text) ? "refrescos" : /leche|cafe|galleta|azucar|chocolate|sobao|rosquilla|speculoos|snack|patata|aceituna|conserva|salsa|mayonesa|tomate|pan|aperitivo/.test(text) ? "alimentacion" : "bebidas";
  return crmReferenceImages[category][large ? "web" : "thumbnail"];
}
function productImageSource(product: any, large = false) {
  // Una foto recién seleccionada debe prevalecer sobre la URL antigua hasta
  // que el usuario guarde la ficha.
  return product?.photo_data || (large ? product?.photo_web_url : product?.photo_thumbnail_url) || product?.photo_url || "";
}
function productDisplayImageSource(product: any, large = false) {
  return productImageSource(product, large) || productReferenceImageSource(product, large);
}

function ProductDetailDrawer({ product, onClose, onEdit, onLabel, onDuplicate }: { product: any; onClose: () => void; onEdit: () => void; onLabel: () => void; onDuplicate: () => void }) {
  const available = Number(product.stock || 0) - Number(product.stock_reserved || 0);
  const critical = available <= Number(product.min_stock || 0);
  return (
    <div className="product-drawer-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="product-drawer" aria-label={`Ficha de ${product.name}`}>
        <div className="product-drawer-head"><div><p className="eyebrow">FICHA DEL PRODUCTO</p><h2>{product.name}</h2><small>{product.sku || "Sin SKU"}</small></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></div>
        <div className={`product-drawer-image${productImageSource(product, true) ? "" : " product-reference-image"}`}><img src={productDisplayImageSource(product, true)} alt={productImageSource(product, true) ? `Imagen de ${product.name}` : `Imagen de referencia para ${product.name}`} />{!productImageSource(product, true) && <small>Imagen de referencia</small>}</div>
        <div className={`product-drawer-stock ${critical ? "critical" : "available"}`}><strong>{available}</strong><span>unidades disponibles</span><small>{Number(product.stock || 0)} físicas · {Number(product.stock_reserved || 0)} reservadas</small></div>
        <div className="product-drawer-grid">
          <div><span>Familia</span><b>{product.category || "—"}</b></div><div><span>Marca</span><b>{product.brand || "—"}</b></div>
          <div><span>Formato</span><b>{product.format || "—"}</b></div><div><span>Proveedor</span><b>{product.supplier_ref || "—"}</b></div>
          <div><span>Precio venta</span><b>{Number(product.unit_price || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</b></div><div><span>Coste</span><b>{Number(product.cost_price || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</b></div>
          <div><span>Margen</span><b>{product.margin_percent ? `${product.margin_percent}%` : "—"}</b></div><div><span>Código</span><b>{product.barcode || "Pendiente"}</b></div>
        </div>
        {critical && <p className="product-warning">Stock crítico: el disponible está igual o por debajo del mínimo configurado.</p>}
        {!product.barcode && <p className="product-warning">Este producto todavía no tiene código de barras.</p>}
        <div className="product-drawer-actions"><button type="button" className="button primary" onClick={onEdit}>Editar producto</button><button type="button" className="button secondary" onClick={onLabel}>Etiqueta y códigos</button><button type="button" className="button secondary" onClick={onDuplicate}>Duplicar</button></div>
      </aside>
    </div>
  );
}

function ProductBatchLabelModal({ products, onClose }: { products: any[]; onClose: () => void }) {
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [printMode, setPrintMode] = useState<"all" | "barcode" | "qr" | "both">("all");
  const barcodeRefs = useRef<Record<string, SVGSVGElement | null>>({});
  useEffect(() => {
    Promise.all(products.map(async (product) => {
      const code = String(product.barcode || product.sku || `EXC-${String(product.id).padStart(5, "0")}`);
      try { return [String(product.id), await QRCode.toDataURL(code, { width: 110, margin: 1 })] as const; } catch { return [String(product.id), ""] as const; }
    })).then((entries) => setQrImages(Object.fromEntries(entries)));
  }, [products]);
  useEffect(() => {
    products.forEach((product) => {
      const code = String(product.barcode || product.sku || `EXC-${String(product.id).padStart(5, "0")}`);
      const target = barcodeRefs.current[String(product.id)];
      if (target) { try { JsBarcode(target, code, { format: "CODE128", displayValue: true, fontSize: 9, height: 34, margin: 1 }); } catch { /* El QR sigue disponible aunque el formato no sea válido. */ } }
    });
  }, [products]);
  return (
    <div className="preview-overlay product-label-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="product-batch-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-label-head"><div><p className="eyebrow">ETIQUETAS SELECCIONADAS</p><h2>{products.length} productos</h2><small>Previsualiza e imprime todas las etiquetas del listado.</small></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></div>
        <div className={`product-batch-grid product-batch-print-${printMode}`}>{products.map((product) => { const code = String(product.barcode || product.sku || `EXC-${String(product.id).padStart(5, "0")}`); return <div className="product-batch-label" key={product.id}><b>EXCLUSIVAS</b><strong>{product.name}</strong><svg ref={(node) => { barcodeRefs.current[String(product.id)] = node; }} /><small>{code}</small>{qrImages[String(product.id)] && <img src={qrImages[String(product.id)]} alt={`Código QR de ${product.name}`} />}</div>; })}</div>
        <div className="product-label-print-controls"><label>Qué imprimir<select value={printMode} onChange={(event) => setPrintMode(event.target.value as typeof printMode)}><option value="all">Etiqueta completa</option><option value="barcode">Solo código de barras</option><option value="qr">Solo código QR</option><option value="both">QR + código de barras</option></select></label><small>El modo se aplica a todas las etiquetas seleccionadas.</small></div>
        <div className="product-label-actions"><button className="button secondary" type="button" onClick={onClose}>Cerrar</button><button className="button primary" type="button" onClick={() => window.print()}>Imprimir etiquetas</button></div>
      </div>
    </div>
  );
}

function ShipmentLabelModal({ shipment, client, lines, products, address, city, onClose }: { shipment: any; client: any; lines: any[]; products: any[]; address: string; city: string; onClose: () => void }) {
  const code = String(shipment?.code || `ENV-${shipment?.id || "SIN-CODIGO"}`);
  const trackingToken = String(shipment?.public_tracking_token || "").trim();
  const trackingUrl = trackingToken && typeof window !== "undefined"
    ? `${window.location.origin}/seguimiento/${encodeURIComponent(trackingToken)}`
    : "";
  const packages = Math.max(1, Number(shipment?.packages || 1));
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [qrImage, setQrImage] = useState("");
  const [printMode, setPrintMode] = useState<"all" | "barcode" | "qr" | "both">("all");
  const lineRows = lines.map((line: any) => {
    const product = products.find((item: any) => Number(item.id) === Number(line.product_id));
    const requested = Number(line.quantity_requested || line.quantity || 0);
    const prepared = Number(line.prepared_quantity);
    const quantity = Number.isFinite(prepared) && prepared > 0 && prepared < requested ? `${prepared}/${requested}` : String(requested);
    return { name: product?.name || `Producto #${line.product_id}`, quantity, unit: quantityUnitLabel(line.quantity_unit) };
  });
  const qrPayload = trackingUrl || [
    "EXCLUSIVAS INTELIGENTES",
    `ENVÍO: ${code}`,
    `PEDIDO: ${shipment?.order_code || shipment?.order_id || "—"}`,
    `CLIENTE: ${client?.name || shipment?.client_name || "—"}`,
    `BULTOS: ${packages}`,
    "CONTENIDO:",
    ...lineRows.map((line) => `- ${line.quantity} ${line.unit}: ${line.name}`),
  ].join("\n");
  useEffect(() => {
    if (barcodeRef.current) {
      try { JsBarcode(barcodeRef.current, code, { format: "CODE128", displayValue: true, fontSize: 13, height: 58, margin: 3, textMargin: 4 }); } catch { /* El QR y la referencia siguen disponibles. */ }
    }
    QRCode.toDataURL(qrPayload, { width: 190, margin: 1, errorCorrectionLevel: "M" }).then((value: string) => setQrImage(value)).catch(() => setQrImage(""));
  }, [code, qrPayload]);
  return (
    <div className="preview-overlay shipment-label-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="shipment-label-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-label-head shipment-label-toolbar"><div><p className="eyebrow">ETIQUETA DE ENVÍO</p><h2>{code}</h2><small>Identifica el pedido, los bultos y su contenido en el almacén y durante el reparto.</small></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></div>
        <article className={`shipment-label-sheet shipment-label-print-${printMode}`} aria-label={`Etiqueta de envío ${code}`}>
          <header className="shipment-label-brand"><div><b>EXCLUSIVAS</b><strong>INTELIGENTES</strong></div><div className="shipment-label-code-meta"><span>NOTA DE CARGA</span><b>{code}</b><small className="shipment-label-sticker-note">IDENTIFICACIÓN DE ENVÍO · CONSERVAR HASTA LA ENTREGA</small></div></header>
          <div className="shipment-label-rule" />
          <section className="shipment-label-recipient"><div><span>ENTREGA A</span><strong>{client?.name || shipment?.client_name || "Cliente sin asignar"}</strong><p>{address || "Dirección no indicada"}{city ? ` · ${city}` : ""}</p>{shipment?.delivery_window_start && shipment?.delivery_window_end && <small>Horario: {String(shipment.delivery_window_start).slice(0, 5)}–{String(shipment.delivery_window_end).slice(0, 5)}</small>}</div><div className="shipment-label-packages"><span>BULTOS</span><strong>{packages}</strong></div></section>
          <section className="shipment-label-content"><div className="shipment-label-section-title"><span>CONTENIDO DEL ENVÍO</span><small>{lineRows.length} referencias</small></div>{lineRows.length ? <ul>{lineRows.map((line, index) => <li key={`${line.name}-${index}`}><b>{line.quantity} {line.unit}</b><span>{line.name}</span></li>)}</ul> : <p>Contenido pendiente de cargar.</p>}</section>
          <section className="shipment-label-codes"><div className="shipment-label-barcode"><svg ref={barcodeRef} aria-label={`Código de barras ${code}`} /><small>{code}</small></div><div className="shipment-label-qr">{qrImage ? <img src={qrImage} alt={`Código QR del envío ${code}`} /> : <span>Generando QR…</span>}<small>{trackingUrl ? "Escanea para abrir el seguimiento" : "Escanea para consultar el contenido"}</small>{trackingUrl && <a href={trackingUrl} target="_blank" rel="noreferrer">Abrir seguimiento</a>}</div></section>
        </article>
        <div className="product-label-print-controls shipment-label-print-controls"><label>Qué imprimir<select value={printMode} onChange={(event) => setPrintMode(event.target.value as typeof printMode)}><option value="all">Etiqueta completa</option><option value="barcode">Solo código de barras</option><option value="qr">Solo código QR</option><option value="both">QR + código de barras</option></select></label><small>El modo se aplica al imprimir o guardar como PDF.</small></div>
        <div className="product-label-actions shipment-label-actions"><button className="button secondary" type="button" onClick={onClose}>Cerrar</button><button className="button primary" type="button" onClick={() => window.print()}>Imprimir / guardar PDF</button></div>
      </div>
    </div>
  );
}

function DocumentTemplatePreview({ template, onClose, onSaved, actor }: { template: any; onClose: () => void; onSaved: (template: any) => void; actor: string }) {
  const sampleValues: Record<string, string> = { codigo: template.code || "DOC-2026-001", cliente: "Mercado San Isidro", contacto: "Beatriz Romero", pedido: "PED-2026-0054", fecha: "21/08/2026", fecha_entrega: "25/08/2026", direccion: "Calle San Isidro 5, Madrid", base: "1.250,00 €", iva: "262,50 €", total: "1.512,50 €", nif: "B12345678", lineas: "Agua Tónica Mediterránea · 24 cajas\nCerveza Artesana Lager · 12 cajas", forma_pago: "Transferencia", validez: "30 días", salida: "25/08/2026 · 07:30", preparador: "José Martín", transportista: "Repartos Exclusivas", franja: "09:00–11:00", notas: "Entregar en la entrada principal.", condiciones: "Precios y entregas según acuerdo comercial vigente.", telefono: "914 012 665", email: "compras@mercadosanisidro.es", responsable: "Luis" };
  const [editMode, setEditMode] = useState(false);
  const normalizeTemplateText = (value: unknown) => String(value || "").replaceAll("\\n", "\n");
  const [draft, setDraft] = useState({ ...template, content: normalizeTemplateText(template.content) });
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft({ ...template, content: normalizeTemplateText(template.content) }), [template]);
  const rendered = normalizeTemplateText(editMode ? draft.content : template.content).replace(/\{\{\s*([\wáéíóúñ]+)\s*\}\}/gi, (_match, key) => sampleValues[String(key).toLowerCase()] || `{{${key}}}`);
  function download() { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([rendered], { type: "text/plain;charset=utf-8" })); link.download = `${template.code || "documento"}.txt`; link.click(); window.setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
  async function saveTemplate() {
    setSaving(true);
    const response = await fetch(`/api/document_templates/${template.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify(draft) });
    const saved = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return alert(saved.error || "No se pudo guardar la plantilla");
    onSaved(saved);
    setEditMode(false);
  }
  return <div className="preview-overlay document-template-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}><div className="document-template-modal" onClick={(event) => event.stopPropagation()}><div className="document-template-toolbar"><div><p className="eyebrow">{editMode ? "EDICIÓN · " : "PREVISUALIZACIÓN · "}{template.type}</p><h2>{editMode ? draft.title : template.title}</h2><small>{editMode ? "Modifica la plantilla aquí y guarda los cambios sin salir de esta ventana." : "Ejemplo rellenado con datos de muestra. Las variables se completarán al usar la plantilla."}</small></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></div>{editMode ? <div className="document-template-editor"><label>Nombre de la plantilla<input value={draft.title || ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><div className="document-template-editor-grid"><label>Tipo<select value={draft.type || "General"} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>{["Presupuesto", "Correo", "Albarán", "Factura", "Hoja de carga", "Contrato", "Alta de cliente", "Condiciones", "General"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Formato<select value={draft.format || "HTML"} onChange={(event) => setDraft({ ...draft, format: event.target.value })}>{["HTML", "Texto plano", "PDF", "Word", "Correo electrónico"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label>Descripción<input value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label>Asunto o encabezado<input value={draft.subject || ""} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></label><label>Contenido<textarea className="document-template-content-editor" value={draft.content || ""} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label><small className="document-template-variable-help">Variables disponibles: {"{{cliente}}"}, {"{{fecha}}"}, {"{{total}}"}, {"{{lineas}}"}, {"{{direccion}}"} y otras variables de la plantilla.</small></div> : <article className="document-sheet"><header><div className="document-sheet-brand"><span>E</span><div><b>Exclusivas</b><small>INTELIGENTES</small></div></div><div className="document-sheet-meta">{template.code}<br />{template.format || "HTML"}</div></header><div className="document-sheet-rule" /><p className="document-sheet-subject">{String(template.subject || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => sampleValues[String(key).toLowerCase()] || `{{${key}}}`)}</p><pre>{rendered}</pre></article>}<div className="document-template-actions">{editMode ? <><button type="button" className="button secondary" onClick={() => { setDraft({ ...template, content: normalizeTemplateText(template.content) }); setEditMode(false); }}>Cancelar</button><button type="button" className="button primary" disabled={saving} onClick={saveTemplate}>{saving ? "Guardando…" : "Guardar cambios"}</button></> : <><button type="button" className="button primary" onClick={() => setEditMode(true)}>Editar plantilla</button><button type="button" className="button secondary" onClick={onClose}>Cerrar</button><button type="button" className="button secondary" onClick={download}>Descargar texto</button><button type="button" className="button primary" onClick={() => window.print()}>Imprimir documento</button></>}</div></div></div>;
}

function ProductIntelligencePanel({ products, suppliers, actor }: { products: any[]; suppliers: any[]; actor: string }) {
  const [productId, setProductId] = useState("");
  const [offers, setOffers] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [equivalents, setEquivalents] = useState<any[]>([]);
  const [offer, setOffer] = useState<any>({ supplier_id: "", unit_cost: "", minimum_order: "1", order_unit: "caja", transport_cost: "0", lead_time_days: "2", promotion: "", rappel_percent: "0", reliability_percent: "95" });
  const [lot, setLot] = useState<any>({ lot_code: "", quantity: "", expiry_date: "", received_date: tabletTodayInput() });
  const [equivalent, setEquivalent] = useState<any>({ equivalent_product_id: "", priority: "1", notes: "" });
  const headers = { "Content-Type": "application/json", "X-Actor": actor };
  async function load(product = productId) {
    if (!product) return;
    const [o, l, h, e] = await Promise.all(["product_suppliers", "product_lots", "product_price_history", "product_equivalents"].map((table) => fetch(`/api/${table}`).then((r) => r.ok ? r.json() : [])));
    setOffers((Array.isArray(o) ? o : []).filter((row: any) => Number(row.product_id) === Number(product)));
    setLots((Array.isArray(l) ? l : []).filter((row: any) => Number(row.product_id) === Number(product)));
    setHistory((Array.isArray(h) ? h : []).filter((row: any) => Number(row.product_id) === Number(product)));
    setEquivalents((Array.isArray(e) ? e : []).filter((row: any) => Number(row.product_id) === Number(product)));
  }
  useEffect(() => { if (productId) load(); }, [productId]);
  async function create(table: string, data: any, reset: () => void) {
    if (!productId) return alert("Selecciona primero un producto.");
    const response = await fetch(`/api/${table}`, { method: "POST", headers, body: JSON.stringify({ ...data, product_id: Number(productId) }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return alert(result.error || "No se pudo guardar el dato");
    reset();
    load();
  }
  const productName = products.find((p) => Number(p.id) === Number(productId))?.name || "Selecciona un producto";
  return <section className="product-intelligence-panel">
    <div className="product-intelligence-head"><div><p className="eyebrow">FICHA AVANZADA</p><h3>Proveedores, lotes y trazabilidad</h3><small>Completa la información operativa sin salir del listado de productos.</small></div><select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Producto para ampliar"><option value="">Seleccionar producto…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ""}</option>)}</select></div>
    {productId && <>
      <p className="muted">Producto seleccionado: <b>{productName}</b></p>
      <div className="product-intelligence-grid">
        <details open><summary>Proveedores y ofertas comparables <span>{offers.length}</span></summary><div className="intelligence-form"><select value={offer.supplier_id} onChange={(e) => setOffer({ ...offer, supplier_id: e.target.value })}><option value="">Proveedor…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><input type="number" step="0.01" placeholder="Coste unitario" value={offer.unit_cost} onChange={(e) => setOffer({ ...offer, unit_cost: e.target.value })} /><input type="number" placeholder="Plazo (días)" value={offer.lead_time_days} onChange={(e) => setOffer({ ...offer, lead_time_days: e.target.value })} /><input placeholder="Promoción o rappel" value={offer.promotion} onChange={(e) => setOffer({ ...offer, promotion: e.target.value })} /><button className="button primary" type="button" onClick={() => create("product_suppliers", offer, () => setOffer({ ...offer, supplier_id: "", unit_cost: "", promotion: "" }))}>Añadir oferta</button></div><div className="intelligence-list">{offers.map((row) => <div key={row.id}><b>{suppliers.find((s) => Number(s.id) === Number(row.supplier_id))?.name || `Proveedor #${row.supplier_id}`}</b><span>{Number(row.unit_cost || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })} · {row.lead_time_days || 0} días · {row.promotion || "Sin promoción"}</span></div>)}</div></details>
        <details><summary>Lotes y caducidades <span>{lots.length}</span></summary><div className="intelligence-form"><input placeholder="Código de lote" value={lot.lot_code} onChange={(e) => setLot({ ...lot, lot_code: e.target.value })} /><input type="number" placeholder="Cantidad" value={lot.quantity} onChange={(e) => setLot({ ...lot, quantity: e.target.value })} /><input type="date" value={lot.expiry_date} onChange={(e) => setLot({ ...lot, expiry_date: e.target.value })} /><button className="button primary" type="button" onClick={() => create("product_lots", lot, () => setLot({ lot_code: "", quantity: "", expiry_date: "", received_date: tabletTodayInput() }))}>Añadir lote</button></div><div className="intelligence-list">{lots.map((row) => <div key={row.id}><b>{row.lot_code}</b><span>{row.quantity} unidades · caduca {row.expiry_date || "sin fecha"}</span></div>)}</div></details>
        <details><summary>Equivalentes y sustitutos <span>{equivalents.length}</span></summary><div className="intelligence-form"><select value={equivalent.equivalent_product_id} onChange={(e) => setEquivalent({ ...equivalent, equivalent_product_id: e.target.value })}><option value="">Producto sustituto…</option>{products.filter((p) => Number(p.id) !== Number(productId)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input placeholder="Criterio o nota" value={equivalent.notes} onChange={(e) => setEquivalent({ ...equivalent, notes: e.target.value })} /><button className="button primary" type="button" onClick={() => create("product_equivalents", equivalent, () => setEquivalent({ equivalent_product_id: "", priority: "1", notes: "" }))}>Añadir sustituto</button></div><div className="intelligence-list">{equivalents.map((row) => <div key={row.id}><b>{products.find((p) => Number(p.id) === Number(row.equivalent_product_id))?.name || `Producto #${row.equivalent_product_id}`}</b><span>{row.notes || "Sustituto recomendado"}</span></div>)}</div></details>
        <details><summary>Histórico de precios <span>{history.length}</span></summary><div className="intelligence-list">{history.slice(0, 12).map((row) => <div key={row.id}><b>{row.price_type}</b><span>{Number(row.amount || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })} · {row.valid_from || row.created_at?.slice(0, 10) || ""}</span></div>)}{!history.length && <p className="muted">Aún no hay cambios de precio registrados.</p>}</div></details>
      </div>
    </>}
  </section>;
}

function SmartPurchasing({ user }: { user?: any }) {
  const actor = user?.username || "Usuario local";
  const [suggestions, setSuggestions] = useState<any[]>([]), [products, setProducts] = useState<any[]>([]), [suppliers, setSuppliers] = useState<any[]>([]), [requests, setRequests] = useState<any[]>([]), [offers, setOffers] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]), [selectedSuppliers, setSelectedSuppliers] = useState<number[]>([]);
  const [requestOpen, setRequestOpen] = useState(false), [detailRequest, setDetailRequest] = useState<any>(null), [message, setMessage] = useState(""), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<any>({ channels: ["web"], notes: "Agradecemos precio, referencia, formato, transporte, plazo, promociones y condiciones de compra.", valid_until: tabletDateOffset(7) });
  const parseList = (value: any) => { try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed.map(Number) : []; } catch { return []; } };
  async function load() {
    setLoading(true); setLoadError("");
    try {
      const [s, p, su, r, o] = await Promise.all(["purchase_suggestions", "products?view=lookup&limit=2000", "suppliers?view=lookup&limit=2000", "purchase_requests", "purchase_request_offers"].map((path) => fetchWithRetry(`/api/${path}`, { headers: { "X-Actor": actor } }).then((response) => response.ok ? response.json() : [])));
      setSuggestions(Array.isArray(s) ? s : []); setProducts(Array.isArray(p) ? p : []); setSuppliers(Array.isArray(su) ? su : []); setRequests(Array.isArray(r) ? r : []); setOffers(Array.isArray(o) ? o : []);
      if (!selectedSuppliers.length) setSelectedSuppliers((Array.isArray(su) ? su : []).slice(0, 3).map((row: any) => Number(row.id)));
    } catch { setLoadError("No se ha podido actualizar el análisis. Conservamos los datos anteriores."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  function toggleValue(key: "products" | "suppliers", id: number) { const setter = key === "products" ? setSelectedProducts : setSelectedSuppliers; setter((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  function toggleChannel(channel: string) { setDraft((current: any) => ({ ...current, channels: current.channels.includes(channel) ? current.channels.filter((value: string) => value !== channel) : [...current.channels, channel] })); }
  async function approve(row: any) {
    const provider = row.recommended_supplier;
    if (!provider?.supplier_id) return alert("No hay proveedor comparable para esta propuesta.");
    const today = tabletTodayInput(), expected = new Date(Date.now() + Number(provider.lead_time_days || 2) * 86400000).toISOString().slice(0, 10), headers = { "Content-Type": "application/json", "X-Actor": actor };
    const orderResponse = await fetch("/api/purchase_orders", { method: "POST", headers, body: JSON.stringify({ code: `PRE-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`, supplier_id: provider.supplier_id, status: "Borrador", validation_status: "Pendiente de validar", order_date: today, expected_date: expected, amount: Number(row.suggested_quantity) * Number(provider.real_cost || 0), notes: `Propuesta automática para ${row.name}. Requiere validación antes de enviar.` }) });
    const order = await orderResponse.json().catch(() => ({}));
    if (!orderResponse.ok) return alert(order.error || "No se pudo crear el prepedido");
    await fetch(`/api/purchase_suggestions/${row.suggestion_id}`, { method: "PUT", headers, body: JSON.stringify({ status: "Aprobada" }) });
    setMessage(`Prepedido ${order.code} creado como borrador. No se ha enviado al proveedor.`); void load();
  }
  async function createRequest(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedProducts.length || !selectedSuppliers.length) return alert("Selecciona al menos un producto y un proveedor.");
    const headers = { "Content-Type": "application/json", "X-Actor": actor };
    const response = await fetch("/api/purchase_requests", { method: "POST", headers, body: JSON.stringify({ code: `SOL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`, request_type: "Solicitud de oferta", product_ids: JSON.stringify(selectedProducts), supplier_ids: JSON.stringify(selectedSuppliers), channels: draft.channels, notes: `${draft.notes || ""}${draft.valid_until ? ` Validez solicitada hasta ${draft.valid_until}.` : ""}`, created_by: actor }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return alert(result.error || "No se pudo crear la solicitud");
    setMessage(`Solicitud ${result.code} preparada para ${selectedSuppliers.length} proveedores.`); setRequestOpen(false); setSelectedProducts([]); setDraft((current: any) => ({ ...current, channels: ["web"] })); void load();
  }
  function publicLink(request: any, supplierId: number) { return `${window.location.origin}/portal-ofertas?token=${encodeURIComponent(request.public_token || "")}&supplier=${supplierId}`; }
  function mailLink(request: any, supplier: any) { const link = publicLink(request, Number(supplier.id)); return `mailto:${supplier.email || ""}?subject=${encodeURIComponent(`Solicitud de precios ${request.code}`)}&body=${encodeURIComponent(`Buenos días, necesitamos completar esta solicitud de precios: ${link}`)}`; }
  function whatsappLink(request: any, supplier: any) { const link = publicLink(request, Number(supplier.id)); const phone = String(supplier.phone || "").replace(/\D/g, ""); return `https://wa.me/${phone}?text=${encodeURIComponent(`Solicitud de precios ${request.code}: ${link}`)}`; }
  async function applyOffer(offer: any) {
    if (!detailRequest || !offer?.id) return;
    if (!window.confirm("¿Aplicar esta oferta a las fichas de productos y dejarla como oferta seleccionada?")) return;
    const response = await fetch(`/api/purchase_requests/${detailRequest.id}/apply-offer`, { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ offer_id: offer.id }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return alert(result.error || "No se pudo aplicar la oferta.");
    setMessage(`Oferta aplicada: ${result.applied_lines} líneas actualizadas.`); setDetailRequest(null); void load();
  }
  async function createOrderFromOffer(offer: any) {
    if (!detailRequest || !offer?.id) return;
    if (!window.confirm("¿Crear un pedido de compra en borrador con esta oferta?")) return;
    const response = await fetch(`/api/purchase_requests/${detailRequest.id}/create-order`, { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ offer_id: offer.id }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return alert(result.error || "No se pudo crear el pedido de compra.");
    setMessage(`Pedido de compra ${result.code} creado como borrador.`); setDetailRequest(null); void load();
  }
  const statusOptions = ["Todos", "Borrador", "Preparada para enviar", "Enviada", "Respuestas recibidas", "Cerrada", "Cancelada"];
  const [statusFilter, setStatusFilter] = useState("Todos");
  const visibleRequests = requests.filter((request) => statusFilter === "Todos" || request.status === statusFilter);
  const detailOffers = detailRequest ? offers.filter((offer) => Number(offer.request_id) === Number(detailRequest.id)) : [];
  return <div className="smart-purchasing"><div className="manager-head"><div><p className="eyebrow">ABASTECIMIENTO CONTROLADO</p><h2>Compras inteligentes</h2><p className="muted">Solicita precios a varios proveedores y compara referencias, costes, plazos y condiciones en un único lugar.</p></div><div><button type="button" className="button secondary" onClick={() => void load()}>Actualizar</button><button type="button" className="button primary" onClick={() => setRequestOpen(true)}>Nueva solicitud de precios</button></div></div>{loading && <div className="data-loading" role="status"><span className="loading-spinner" aria-hidden="true" /><LoadingIndicator label="Cargando compras inteligentes…" /></div>}{loadError && <div className="error-message">{loadError}</div>}{message && <div className="success-message">{message}</div>}<section className="smart-purchasing-panel"><div className="smart-panel-head"><div><b>Artículos que necesitan compra</b><small>Selecciona productos para preparar una solicitud con sus referencias y precios.</small></div><span>{loading ? "—" : `${suggestions.length} propuestas`}</span></div>{!loading && !suggestions.length ? <p className="empty-state">No hay productos bajo mínimos ahora mismo. Puedes crear una solicitud desde el botón superior.</p> : <div className="smart-suggestion-list">{suggestions.map((row) => <article key={row.suggestion_id} className={selectedProducts.includes(Number(row.product_id)) ? "smart-suggestion selected" : "smart-suggestion"}><input type="checkbox" checked={selectedProducts.includes(Number(row.product_id))} onChange={() => toggleValue("products", Number(row.product_id))} aria-label={`Seleccionar ${row.name}`} /><div className="smart-suggestion-main"><b>{row.name}</b><small>{row.sku || "Sin referencia"} · Disponible {row.available_stock} · Mínimo {row.stock_min || row.min_stock || 0} · Proponer {row.suggested_quantity}</small><p>{row.reason}</p></div><div className="smart-supplier-compare">{row.comparisons?.slice(0, 3).map((offer: any) => <span key={offer.id} className={row.recommended_supplier?.supplier_id === offer.supplier_id ? "recommended" : ""}>{offer.supplier_name} · {Number(offer.real_cost || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })} · {offer.lead_time_days || 0} días · {offer.promotion || "Sin promoción"}</span>)}{!row.comparisons?.length && <span>Sin ofertas alternativas registradas</span>}</div><button type="button" className="button secondary" onClick={() => void approve(row)}>Aprobar propuesta</button></article>)}</div>}</section><section className="smart-suppliers-panel"><div><b>Proveedores destinatarios</b><small>Selecciona uno o varios proveedores para la misma solicitud.</small></div><div className="smart-supplier-checks">{suppliers.map((supplier) => <label key={supplier.id}><input type="checkbox" checked={selectedSuppliers.includes(Number(supplier.id))} onChange={() => toggleValue("suppliers", Number(supplier.id))} />{supplier.name}<small>{supplier.email || "Sin email"}</small></label>)}</div></section><section className="smart-requests-panel"><div className="smart-panel-head"><div><b>Solicitudes y respuestas</b><small>Control de estados y comparativa de ofertas recibidas.</small></div><label className="smart-status-filter">Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label></div>{visibleRequests.length ? <div className="smart-request-list">{visibleRequests.map((request) => { const requestSuppliers = parseList(request.supplier_ids).map((id) => suppliers.find((supplier) => Number(supplier.id) === id)).filter(Boolean); const responseCount = offers.filter((offer) => Number(offer.request_id) === Number(request.id)).length; return <article className="smart-request-card" key={request.id}><div><b>{request.code}</b><span>{request.status}</span><small>{parseList(request.product_ids).length} productos · {requestSuppliers.length} proveedores · {responseCount} respuestas · {request.created_at?.slice(0, 10) || ""}</small></div><div className="smart-request-actions"><button type="button" className="button secondary" onClick={() => setDetailRequest(request)}>Comparar respuestas</button>{requestSuppliers.map((supplier: any) => <span className="smart-share-links" key={supplier.id}>{request.channels?.includes("email") && <a href={mailLink(request, supplier)} title={`Enviar por email a ${supplier.name}`}>✉ {supplier.name}</a>}{request.channels?.includes("web") && <a href={publicLink(request, Number(supplier.id))} target="_blank" rel="noreferrer">↗ Web</a>}{request.channels?.includes("whatsapp") && <a href={whatsappLink(request, supplier)} target="_blank" rel="noreferrer">☏ WhatsApp</a>}</span>)}</div></article>; })}</div> : <p className="empty-state">No hay solicitudes con ese estado.</p>}</section>{requestOpen && <div className="preview-overlay smart-request-overlay" onClick={(event) => event.target === event.currentTarget && setRequestOpen(false)}><form className="smart-request-modal" onSubmit={(event) => void createRequest(event)}><header><div><p className="eyebrow">NUEVA SOLICITUD</p><h2>Solicitar precios y referencias</h2><small>Se generará un formulario por proveedor con los campos de compra comparables.</small></div><button type="button" onClick={() => setRequestOpen(false)} aria-label="Cerrar">×</button></header><div className="smart-request-modal-grid"><fieldset><legend>Productos</legend><div className="smart-request-check-list">{products.map((product) => <label key={product.id}><input type="checkbox" checked={selectedProducts.includes(Number(product.id))} onChange={() => toggleValue("products", Number(product.id))} /><span><b>{product.name}</b><small>{product.sku || product.external_code || "Sin referencia"} · {product.unit || product.format || "unidad"}</small></span></label>)}</div></fieldset><fieldset><legend>Proveedores</legend><div className="smart-request-check-list">{suppliers.map((supplier) => <label key={supplier.id}><input type="checkbox" checked={selectedSuppliers.includes(Number(supplier.id))} onChange={() => toggleValue("suppliers", Number(supplier.id))} /><span><b>{supplier.name}</b><small>{supplier.email || "Sin email"} · {supplier.phone || "Sin teléfono"}</small></span></label>)}</div></fieldset></div><div className="smart-request-channel-fields"><fieldset><legend>Canales</legend><label><input type="checkbox" checked={draft.channels.includes("email")} onChange={() => toggleChannel("email")} /> Email (abrir mensaje preparado)</label><label><input type="checkbox" checked={draft.channels.includes("web")} onChange={() => toggleChannel("web")} /> Formulario web</label><label><input type="checkbox" checked={draft.channels.includes("whatsapp")} onChange={() => toggleChannel("whatsapp")} /> Enlace WhatsApp</label></fieldset><label>Fecha límite para responder<input type="date" value={draft.valid_until || ""} onChange={(event) => setDraft({ ...draft, valid_until: event.target.value })} /></label></div><label>Mensaje para el proveedor<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label><footer><button type="button" className="button secondary" onClick={() => setRequestOpen(false)}>Cancelar</button><button type="submit" className="button primary">Generar solicitud</button></footer></form></div>}{detailRequest && <div className="preview-overlay smart-request-overlay" onClick={(event) => event.target === event.currentTarget && setDetailRequest(null)}><section className="smart-request-modal smart-comparison-modal"><header><div><p className="eyebrow">COMPARATIVA DE PROVEEDORES</p><h2>{detailRequest.code}</h2><small>Compara las respuestas recibidas por producto, referencia y coste.</small></div><button type="button" onClick={() => setDetailRequest(null)} aria-label="Cerrar">×</button></header><div className="smart-comparison-table"><div className="smart-comparison-row smart-comparison-head"><b>Producto</b><b>Proveedor</b><b>Referencia</b><b>Coste</b><b>Plazo</b></div>{detailOffers.flatMap((offer) => { let lines: any[] = []; try { lines = JSON.parse(String(offer.lines_json || "[]")); } catch {} const supplier = suppliers.find((item) => Number(item.id) === Number(offer.supplier_id)); return lines.map((line) => <div className="smart-comparison-row" key={`${offer.id}-${line.product_id}`}><span>{products.find((product) => Number(product.id) === Number(line.product_id))?.name || `Producto #${line.product_id}`}</span><span>{supplier?.name || `Proveedor #${offer.supplier_id}`}</span><span>{line.supplier_ref || "—"}</span><strong>{line.unit_cost ? Number(line.unit_cost).toLocaleString("es-ES", { style: "currency", currency: "EUR" }) : "—"}</strong><span>{line.lead_time_days || offer.delivery_days || 0} días</span></div>); })}</div>{!detailOffers.length && <p className="empty-state">Aún no hay respuestas recibidas. Comparte los enlaces con los proveedores.</p>}{detailOffers.length > 0 && <section className="smart-offer-actions"><b>Acciones sobre una oferta completa</b>{detailOffers.map((offer) => <div key={offer.id}><span>{suppliers.find((item) => Number(item.id) === Number(offer.supplier_id))?.name || `Proveedor #${offer.supplier_id}`} · {offer.valid_until || "Sin validez indicada"}</span><button type="button" className="button secondary" onClick={() => void applyOffer(offer)}>Aplicar oferta</button><button type="button" className="button primary" onClick={() => void createOrderFromOffer(offer)}>Crear pedido de compra</button></div>)}</section>}<footer><button type="button" className="button secondary" onClick={() => setDetailRequest(null)}>Cerrar</button></footer></section></div>}</div>;
}

export function SupplierOfferPortal() {
  const [data, setData] = useState<any>(null), [lines, setLines] = useState<Record<string, any>>({}), [form, setForm] = useState<any>({ contact_name: "", email: "", supplier_ref: "", valid_until: "", delivery_days: "", notes: "" }), [loading, setLoading] = useState(true), [sending, setSending] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const token = query.get("token") || "", supplierId = query.get("supplier") || "";
  useEffect(() => { if (!token || !supplierId) { setError("El enlace de la solicitud no es válido."); setLoading(false); return; } fetch(`/api/purchase_requests/public?token=${encodeURIComponent(token)}&supplier=${encodeURIComponent(supplierId)}`).then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error || "Solicitud no encontrada")))).then((body) => { setData(body); setForm((current: any) => ({ ...current, valid_until: body.valid_until || "" })); setLines(Object.fromEntries((body.products || []).map((product: any) => [String(product.id), { product_id: Number(product.id), supplier_ref: "", unit_cost: "", minimum_order: "", order_unit: product.unit || product.format || "unidad", lead_time_days: "", promotion: "" }]))); }).catch((reason) => setError(reason.message || "No se ha podido cargar la solicitud.")).finally(() => setLoading(false)); }, [token, supplierId]);
  function updateLine(id: number, key: string, value: string) { setLines((current) => ({ ...current, [String(id)]: { ...current[String(id)], [key]: value } })); }
  async function submit(event: FormEvent) { event.preventDefault(); setSending(true); setError(""); const response = await fetch(`/api/purchase_requests/public?token=${encodeURIComponent(token)}&supplier=${encodeURIComponent(supplierId)}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": "Portal proveedor" }, body: JSON.stringify({ ...form, lines: Object.values(lines) }) }); const body = await response.json().catch(() => ({})); setSending(false); if (!response.ok) return setError(body.error || "No se ha podido enviar la respuesta."); setMessage("Respuesta enviada correctamente. Gracias por completar la solicitud."); }
  if (loading) return <main className="supplier-portal"><div className="supplier-portal-card"><span className="loading-spinner" /><p>Cargando solicitud…</p></div></main>;
  if (error && !data) return <main className="supplier-portal"><div className="supplier-portal-card"><p className="eyebrow">EXCLUSIVAS INTELIGENTES</p><h1>Solicitud no disponible</h1><p>{error}</p></div></main>;
  if (message) return <main className="supplier-portal"><div className="supplier-portal-card supplier-portal-success"><span className="success-icon">✓</span><p className="eyebrow">RESPUESTA RECIBIDA</p><h1>Gracias por tu respuesta</h1><p>Hemos recibido los precios y referencias de {data?.code}. El equipo de Exclusivas Inteligentes revisará la información.</p></div></main>;
  return <main className="supplier-portal"><form className="supplier-portal-card" onSubmit={(event) => void submit(event)}><header><div><p className="eyebrow">EXCLUSIVAS INTELIGENTES · SOLICITUD DE PRECIOS</p><h1>{data?.code}</h1><p>Completa los datos que puedas para ayudarnos a comparar la oferta.</p></div><span className="supplier-portal-badge">Respuesta pendiente</span></header><section className="supplier-portal-company"><b>{data?.supplier?.name || "Proveedor"}</b><span>{data?.notes || ""}</span></section><div className="supplier-portal-contact"><label>Persona de contacto<input required value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} /></label><label>Email<input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Referencia o código de proveedor<input value={form.supplier_ref} onChange={(event) => setForm({ ...form, supplier_ref: event.target.value })} /></label><label>Validez de la oferta<input type="date" value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} /></label><label>Plazo general de entrega (días)<input type="number" min="0" value={form.delivery_days} onChange={(event) => setForm({ ...form, delivery_days: event.target.value })} /></label></div><section className="supplier-portal-products"><div className="supplier-portal-section-head"><b>Productos solicitados</b><span>Indica precio y referencia de cada artículo</span></div>{(data?.products || []).map((product: any) => { const line = lines[String(product.id)] || {}; return <article className="supplier-offer-line" key={product.id}><div><b>{product.name}</b><small>{product.sku || "Sin referencia interna"} · {product.unit || product.format || "unidad"}</small></div><label>Referencia<input value={line.supplier_ref || ""} onChange={(event) => updateLine(Number(product.id), "supplier_ref", event.target.value)} /></label><label>Precio unitario<input type="number" min="0" step="0.01" value={line.unit_cost || ""} onChange={(event) => updateLine(Number(product.id), "unit_cost", event.target.value)} /></label><label>Mínimo<input type="number" min="0" step="0.01" value={line.minimum_order || ""} onChange={(event) => updateLine(Number(product.id), "minimum_order", event.target.value)} /></label><label>Plazo<input type="number" min="0" value={line.lead_time_days || ""} onChange={(event) => updateLine(Number(product.id), "lead_time_days", event.target.value)} /></label><label>Promoción<input value={line.promotion || ""} onChange={(event) => updateLine(Number(product.id), "promotion", event.target.value)} /></label></article>; })}</section><label>Observaciones<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Transporte, rappels, condiciones o cualquier aclaración…" /></label>{error && <p className="web-order-error">{error}</p>}<footer><small>Los datos se enviarán al equipo de compras para su revisión y comparativa.</small><button type="submit" className="button primary" disabled={sending}>{sending ? "Enviando…" : "Enviar respuesta"}</button></footer></form></main>;
}

function PreparationDayCards({ rows, lookups, onOpen, dateFilter, onDateFilterChange }: { rows: any[]; lookups: any; onOpen: (row: any) => void; dateFilter: string; onDateFilterChange: (value: string) => void }) {
  const today = tabletTodayInput();
  const tomorrow = tabletDateOffset(1);
  const getClient = (id: any) => (lookups.clients || []).find((item: any) => Number(item.id) === Number(id));
  const items = rows.filter((row) => !dateFilter || String(row.preparation_date || "").slice(0, 10) === dateFilter).sort((a, b) => Number(b.urgent || 0) - Number(a.urgent || 0) || String(a.address || "").localeCompare(String(b.address || ""), "es", { numeric: true }));
  const groups = [
    { key: "pending", title: "Pendientes", hint: "Aún no empezados", match: (row: any) => !["Preparando", "Preparado", "Preparado con incidencia", "Bloqueado", "Pospuesto", "Cancelado", "Enviado", "En reparto", "Entregado"].includes(row.status || "") },
    { key: "preparing", title: "En preparación", hint: "En proceso", match: (row: any) => row.status === "Preparando" },
    { key: "done", title: "Completados", hint: "Listos para enviar", match: (row: any) => row.status === "Preparado" },
    { key: "incident", title: "Con incidencia", hint: "Requieren revisión", match: (row: any) => row.status === "Preparado con incidencia" },
    { key: "paused", title: "Bloqueados / pospuestos", hint: "Fuera del circuito", match: (row: any) => ["Bloqueado", "Pospuesto"].includes(row.status || "") },
  ];
  const renderCard = (row: any) => { const client = getClient(row.client_id); const clientLabel = lookups.clients ? (client?.name || "Cliente no identificado") : "Cargando cliente…"; const address = typeof row.address === "string" ? row.address : row.address?.address || row.address?.name || "Dirección no indicada"; return <button type="button" key={row.id} className={`prep-order-card${Number(row.urgent) === 1 ? " is-urgent" : ""}${row.status === "Preparado" ? " is-completed" : ""}${row.status === "Preparado con incidencia" ? " has-incident" : ""}`} onClick={() => onOpen(row)}><span className="prep-card-top"><b>{row.code}</b><em>{Number(row.urgent) === 1 ? "URGENTE" : row.status || "Pendiente"}</em></span><strong>{clientLabel}</strong><span>{address}</span><span className="prep-card-meta">Entrega: {formatSpanishDateValue(row.delivery_date || row.expected_delivery_at, false)}{row.packages ? ` · ${row.packages} bultos` : ""}</span><small>{row.notes || "Sin observaciones"}</small><i>▶ Abrir comanda</i></button>; };
  return <section className="prep-command-board" aria-label="Comandas de preparación"><div className="prep-command-toolbar"><div className="prep-command-toolbar-title"><b>Pedidos para preparar</b><span>{dateFilter ? `Preparación del ${formatSpanishDateValue(dateFilter, false)}` : "Todas las preparaciones"}</span></div><div className="prep-command-filters"><label>Preparar el día<input type="date" value={dateFilter} onChange={(event) => onDateFilterChange(event.target.value)} /></label><button type="button" className={`button ${dateFilter === today ? "primary" : "secondary"}`} aria-pressed={dateFilter === today} onClick={() => onDateFilterChange(today)}>Hoy</button><button type="button" className={`button ${dateFilter === tomorrow ? "primary" : "secondary"}`} aria-pressed={dateFilter === tomorrow} onClick={() => onDateFilterChange(tomorrow)}>Mañana</button><button type="button" className={`button ${dateFilter === "" ? "primary" : "secondary"}`} aria-pressed={dateFilter === ""} onClick={() => onDateFilterChange("")}>Todos</button></div></div><div className="prep-command-summary"><span><b>{items.length}</b> pedidos</span><span><b>{items.filter((row) => Number(row.urgent) === 1).length}</b> urgentes</span><span><b>{items.filter((row) => row.status === "Preparado con incidencia").length}</b> con incidencia</span><span className="prep-command-summary-hint">Pulsa una comanda para revisar sus líneas</span></div>{!items.length ? <div className="prep-command-empty"><b>{dateFilter ? "No hay pedidos para esta fecha" : "No hay pedidos pendientes"}</b><span>{dateFilter ? "Prueba otra fecha o pulsa “Todos”." : "Cuando se creen preparaciones aparecerán aquí."}</span></div> : <div className="prep-command-columns">{groups.map((group) => { const groupItems = items.filter(group.match); return <section className={`prep-command-column prep-command-${group.key}`} key={group.key}><header><div><b>{group.title}</b><small>{group.hint}</small></div><strong>{groupItems.length}</strong></header><div>{groupItems.map(renderCard)}{!groupItems.length && <p className="prep-command-none">Sin pedidos</p>}</div></section>; })}</div>}</section>;
}

function formatSpanishDateValue(value: any, includeTime = true) {
  const raw = String(value ?? "").replace("T", " ");
  const match = raw.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw || "—";
  const date = `${match[3]}/${match[2]}/${match[1]}`;
  return includeTime && raw.length >= 16 ? `${date} ${raw.slice(11, 16)}` : date;
}

function quantityUnitLabel(value: any) {
  return ({ unidad: "unidad", caja: "caja", pack_4: "pack de 4", pack_6: "pack de 6", palet: "palé" } as Record<string, string>)[String(value || "unidad")] || String(value || "unidad");
}

function warehouseLocationLabel(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return "Sin ubicación";
  if (/^[A-Z]-\d{3}$/.test(raw)) return raw;
  const numericOnly = raw.match(/(?:^|-)(\d{1,3})$/)?.[1];
  return numericOnly ? `A-${numericOnly.padStart(3, "0")}` : raw;
}

function BusinessRelatedPanels({ active, rows, lookups, onNavigate }: { active: string; rows: any[]; lookups: any; onNavigate?: (module: string) => void }) {
  const money = (value: number) => value.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  const invoiceRows = lookups.invoices || [];
  const purchaseRows = lookups.purchase_orders || [];
  const paymentRows = lookups.payments || [];
  const movementRows = lookups.inventory_movements || [];
  const productRows = active === "Productos" ? rows : (lookups.products || []);
  const stockRows = active === "Stock" ? rows : (lookups.stock || []);
  const lowStockCount = stockRows.filter((item: any) => Number(item.available_stock ?? Number(item.stock || 0) - Number(item.stock_reserved || 0)) <= Number(item.min_stock || 0)).length;
  const uncoveredStockCount = stockRows.filter((item: any) => Number(item.available_stock ?? Number(item.stock || 0) - Number(item.stock_reserved || 0)) < 0).length;
  const stockValue = productRows.reduce((total: number, product: any) => total + Number(product.stock || 0) * Number(product.cost_price || 0), 0);
  const sections: Record<string, any[]> = {
    Pedidos: [
      { title: "Pedidos a importar", text: "Carga pedidos recibidos desde una plantilla CSV y revísalos antes de incorporarlos.", value: "Importación controlada", action: "Importar pedidos", target: "Pedidos" },
      { title: "Histórico de facturas de venta", text: "Consulta las facturas emitidas y su estado de cobro desde el listado fiscal.", value: `${invoiceRows.length} facturas`, action: "Ver facturas", target: "Facturas" },
      { title: "Notas de abono de venta", text: "Gestiona devoluciones y abonos vinculados a clientes, facturas y productos.", value: "Devoluciones y abonos", action: "Ver abonos", target: "Devoluciones" },
    ],
    Facturas: [
      { title: "Facturas de venta", text: "Listado actual de facturas, vencimientos, importes y estado de cobro.", value: `${rows.length} documentos`, action: "Ver ventas", target: "Facturas" },
      { title: "Histórico de facturas de venta", text: "Conserva el histórico completo y permite filtrar o exportar los documentos.", value: `${invoiceRows.length || rows.length} registros`, action: "Exportar histórico", target: "Facturas" },
      { title: "Notas de abono", text: "Abonos y devoluciones relacionados con las facturas de venta.", value: "Gestión relacionada", action: "Ver abonos", target: "Devoluciones" },
    ],
    Compras: [
      { title: "Pedidos de compra", text: "Solicitudes y compras a proveedores pendientes de validar o recibir.", value: `${rows.length} pedidos`, action: "Ver compras", target: "Compras" },
      { title: "Facturas de compra", text: "Registra el gasto asociado a proveedores y contrástalo con los pedidos recibidos.", value: `${purchaseRows.length} compras`, action: "Ver gastos", target: "Gastos y tickets" },
      { title: "Histórico de facturas de compra", text: "Consulta el histórico de compras y sus importes para el balance.", value: money(purchaseRows.reduce((total: number, item: any) => total + Number(item.amount || 0), 0)), action: "Abrir balance", target: "Balance" },
    ],
    "Gastos y tickets": [
      { title: "Facturas de compra", text: "Los gastos y tickets alimentan el bloque de costes del balance.", value: `${rows.length} gastos`, action: "Abrir balance", target: "Balance" },
      { title: "Cuentas bancarias y cajas", text: "Consulta los movimientos de cobro y los pagos registrados para conciliar la tesorería.", value: `${paymentRows.length} movimientos`, action: "Ver cobros", target: "Cobros" },
    ],
    Stock: [
      { title: "Productos bajo mínimo", text: "Productos cuyo saldo para cubrir pedidos está en el mínimo operativo o por debajo.", value: `${lowStockCount} productos`, action: "Revisar alertas", target: "Stock" },
      { title: "Productos sin cobertura", text: "Productos cuyo stock físico no alcanza para cubrir los pedidos abiertos.", value: `${uncoveredStockCount} productos`, action: "Revisar faltantes", target: "Stock" },
      { title: "Movimientos recientes", text: "Entradas, salidas, ajustes y devoluciones que modifican las existencias.", value: `${movementRows.length} movimientos`, action: "Ver movimientos", target: "Entradas" },
    ],
    Entradas: [
      { title: "Diario de productos", text: "Entradas y ajustes de inventario ordenados por fecha, referencia y responsable.", value: `${rows.length} movimientos`, action: "Abrir historial", target: "Historial" },
      { title: "Valoración de stock", text: "Consulta el impacto de las entradas en el valor real del almacén.", value: money(stockValue), action: "Ver stock", target: "Stock" },
    ],
    "Preparación de pedidos": [
      { title: "Lista de órdenes de carga de ventas", text: "Notas de carga con cliente, dirección, fecha, responsable, bultos e indicaciones de almacén.", value: `${rows.length} hojas`, action: "Ver salidas", target: "Salidas" },
      { title: "Estado de preparación", text: "Separa las hojas preparando y preparadas para que el almacén sepa qué queda pendiente.", value: "Preparación operativa", action: "Actualizar listado", target: "Preparación de pedidos" },
    ],
    Salidas: [
      { title: "Lista de órdenes de carga de ventas", text: "Cada salida debe estar relacionada con una hoja de carga y un pedido.", value: `${rows.length} salidas`, action: "Ver preparación", target: "Preparación de pedidos" },
    ],
    Cobros: [
      { title: "Movimientos de cobro", text: "Cobros recibidos, método, fecha, factura y referencia para conciliar la tesorería.", value: `${rows.length} cobros`, action: "Ver cobros", target: "Cobros" },
      { title: "Cuentas bancarias", text: "Resumen de entradas registradas por transferencia, tarjeta, efectivo o domiciliación.", value: `${paymentRows.length || rows.length} movimientos`, action: "Abrir balance", target: "Balance" },
      { title: "Lista de cajas", text: "Control rápido de cobros en efectivo y movimientos pendientes de revisar.", value: "Tesorería", action: "Abrir balance", target: "Balance" },
    ],
    Balance: [
      { title: "Cuentas bancarias", text: "Entradas y salidas agrupadas para revisar la tesorería del periodo.", value: `${paymentRows.length} cobros`, action: "Ver cobros", target: "Cobros" },
      { title: "Plan de cuentas", text: "Clasificación operativa de ventas, compras, gastos, cobros y ajustes del balance.", value: "Clasificación financiera", action: "Ver informes", target: "Informes" },
      { title: "Lista de cajas", text: "Seguimiento de efectivo y otros cobros registrados por el equipo.", value: "Control de caja", action: "Ver cobros", target: "Cobros" },
    ],
    Informes: [
      { title: "Declaración 347 · resumen", text: "Resumen anual de operaciones con clientes y proveedores que puedes revisar antes de exportar.", value: `${invoiceRows.length} ventas · ${purchaseRows.length} compras`, action: "Abrir balance", target: "Balance" },
      { title: "Diarios de productos", text: "Indicadores de entradas, salidas, stock crítico y valoración de inventario.", value: `${movementRows.length} movimientos`, action: "Ver stock", target: "Stock" },
    ],
  };
  const cards = sections[active];
  if (!cards?.length) return null;
  return <section className="business-related-panels" aria-label="Funciones relacionadas">
    <div className="business-related-head"><div><b>Funciones relacionadas</b><small>Accesos agrupados del área de trabajo</small></div><span>{cards.length} opciones</span></div>
    <div className="business-related-grid">
      {cards.map((card) => <details className="business-related-card" key={card.title}>
        <summary><span><b>{card.title}</b><small>{card.text}</small></span><strong>{card.value}</strong></summary>
        <div className="business-related-actions"><span>Disponible con los datos actuales del CRM.</span><button type="button" className="row-action workflow" onClick={() => onNavigate?.(card.target)}>{card.action} →</button></div>
      </details>)}
    </div>
  </section>;
}

function OrderWorkflowPanel({ order, shipment, billingStatus, paymentStatus, invoice, onOpenPayment, onNavigate }: { order: any; shipment: any; billingStatus: string; paymentStatus: string; invoice: any; onOpenPayment: () => void; onNavigate?: (module: string) => void }) {
  const shippingStatus = String(shipment?.status || order?.status || "Pendiente");
  const deliverySignatureStatus = String(shipment?.delivery_signature_status || "Pendiente");
  const phase = shippingStatus === "Entregado" ? 5 : shippingStatus === "En reparto" ? 4 : shippingStatus === "Enviado" ? 3 : ["Preparado", "Preparado con incidencia"].includes(shippingStatus) ? 2 : ["Preparando", "Pendiente", "Nuevo"].includes(shippingStatus) ? 1 : 0;
  const steps = [
    { label: "Pedido", done: true, value: order?.created_at, person: order?.created_by },
    { label: "Confirmado", done: phase >= 1 && !["Nuevo", "Borrador"].includes(String(order?.status || "")), value: order?.confirmed_at, person: order?.confirmed_by },
    { label: "Preparado", done: phase >= 2, value: shipment?.prepared_at || order?.preparation_date, person: shipment?.prepared_by || order?.prepared_by },
    { label: "Enviado", done: phase >= 3, value: shipment?.shipped_at || order?.shipping_date, person: shipment?.shipped_by || order?.shipped_by },
    { label: "En reparto", done: phase >= 4, value: shipment?.departure_at, person: shipment?.carrier },
    { label: "Entregado", done: phase >= 5, value: shipment?.delivered_at, person: shipment?.delivered_by },
  ];
  const formatDate = (value: any) => value ? String(value).slice(0, 16).replace("T", " ") : "Pendiente";
  const paymentAction = paymentStatus === "Pendiente de cobro" || paymentStatus === "Cobro parcial" ? onOpenPayment : undefined;
  return <section className="order-workflow" aria-label="Seguimiento del pedido">
    <div className="order-workflow-head"><div><b>Seguimiento del pedido</b><small>Logística, facturación y cobro en bloques independientes.</small></div><span className={`order-workflow-state${shippingStatus === "Entregado" ? " complete" : ""}`}>{shippingStatus}</span></div>
    <div className="order-workflow-track">{steps.map((step, index) => <div className={`order-workflow-step${step.done ? " done" : ""}${index > 0 && steps[index - 1].done && !step.done ? " next" : ""}`} key={step.label}><span className="order-workflow-check" aria-hidden="true">{step.done ? "✓" : index + 1}</span><b>{step.label}</b><small>{step.done ? formatDate(step.value) : "Pendiente"}</small>{step.person && <em>{step.person}</em>}</div>)}</div>
    {shippingStatus === "Entregado" && <div className={`delivery-proof-summary ${deliverySignatureStatus === "Firmado" ? "signed" : deliverySignatureStatus === "Rechazó firmar" ? "rejected" : "unsigned"}`}><b>Recepción: {deliverySignatureStatus === "Firmado" ? "Firmada" : deliverySignatureStatus === "Rechazó firmar" ? "Cliente rechazó firmar" : deliverySignatureStatus === "Sin firma" ? "Entregada sin firma" : "Pendiente de registrar"}</b>{shipment?.delivery_recipient_name && <span>Recibe: {shipment.delivery_recipient_name}</span>}{shipment?.delivery_signature_at && <span>{formatDate(shipment.delivery_signature_at)}</span>}{shipment?.delivery_signature_note && <span>{shipment.delivery_signature_note}</span>}</div>}
    <div className="order-accounting-track">
      <article className={`order-accounting-card${billingStatus === "Facturado" ? " done" : " pending"}`}><div><span className="order-accounting-icon">€</span><div><b>Facturación</b><strong>{billingStatus}</strong></div></div>{invoice ? <small>{invoice.code} · {Number(invoice.amount || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</small> : <small>Sin factura vinculada</small>}{invoice && <button type="button" className="link-button" onClick={() => onNavigate?.("Facturas")}>Ir a facturas</button>}</article>
      <article className={`order-accounting-card${paymentStatus === "Cobrado" ? " done" : paymentStatus === "No facturado" ? " pending" : " attention"}`}><div><span className="order-accounting-icon">✓</span><div><b>Cobro</b><strong>{paymentStatus}</strong></div></div><small>{paymentStatus === "Cobrado" ? "No queda importe pendiente" : invoice ? "Revisa el importe pendiente y registra el cobro." : "Se habilitará cuando exista una factura."}</small>{paymentAction && <button type="button" className="button primary" onClick={paymentAction}>Registrar cobro</button>}</article>
    </div>
  </section>;
}

function parseDeliveryPhotos(value: any): any[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function DeliverySignaturePanel({ shipment, actor, client, lines = [], products = [], onSaved }: { shipment: any; actor: string; client?: any; lines?: any[]; products?: any[]; onSaved: (shipment: any) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [proof, setProof] = useState<any>(shipment);
  const [hasInk, setHasInk] = useState(false);
  const [recipientName, setRecipientName] = useState(String(shipment?.delivery_recipient_name || ""));
  const [note, setNote] = useState(String(shipment?.delivery_signature_note || ""));
  const [photos, setPhotos] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [clientMode, setClientMode] = useState(false);
  const [signedCopyOpen, setSignedCopyOpen] = useState(false);
  const signatureStatus = String(proof?.delivery_signature_status || "Pendiente");
  const existingPhotos = parseDeliveryPhotos(proof?.delivery_attachments_json);

  useEffect(() => {
    let cancelled = false;
    setProof(shipment);
    setRecipientName(String(shipment?.delivery_recipient_name || ""));
    setNote(String(shipment?.delivery_signature_note || ""));
    setPhotos([]);
    if (!shipment?.id) return () => { cancelled = true; };
    fetch(`/api/shipments/${shipment.id}/delivery-proof`).then((response) => response.ok ? response.json() : null).then((data) => {
      if (!cancelled && data) setProof((current: any) => ({ ...current, ...data }));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [shipment?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.max(320, Math.floor(rect.width * ratio));
      canvas.height = Math.floor(190 * ratio);
      const context = canvas.getContext("2d");
      if (context) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 2.4 * ratio;
        context.strokeStyle = "#17232b";
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [shipment?.id]);

  function point(event: any) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function startDrawing(event: any) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const position = point(event);
    if (!canvas || !context || !position) return;
    event.preventDefault();
    drawingRef.current = true;
    canvas.setPointerCapture?.(event.pointerId);
    context.beginPath();
    context.moveTo(position.x, position.y);
    setHasInk(true);
  }
  function draw(event: any) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    const position = point(event);
    if (!context || !position) return;
    event.preventDefault();
    context.lineTo(position.x, position.y);
    context.stroke();
  }
  function stopDrawing() { drawingRef.current = false; }
  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    setMessage("");
  }
  async function attachPhotos(files: FileList | null) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    if (existingPhotos.length + photos.length + selected.length > 4) return setMessage("Puedes guardar como máximo 4 fotografías de la entrega.");
    if (selected.some((file) => file.size > 4 * 1024 * 1024)) return setMessage("Cada fotografía no puede superar 4 MB.");
    try {
      const loaded = await Promise.all(selected.map((file) => new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, mime: file.type || "image/jpeg", data: String(reader.result || "") });
        reader.onerror = () => reject(new Error("No se pudo leer una de las fotografías."));
        reader.readAsDataURL(file);
      })));
      setPhotos((current) => [...current, ...loaded]);
      setMessage("");
    } catch (error: any) { setMessage(error?.message || "No se pudieron añadir las fotografías."); }
  }
  async function confirmDelivery(nextStatus: "Firmado" | "Sin firma" | "Rechazó firmar") {
    const cleanName = recipientName.trim();
    const cleanNote = note.trim();
    if (nextStatus === "Firmado" && !hasInk) return setMessage("Dibuja la firma de quien recibe la mercancía.");
    if (nextStatus === "Firmado" && !cleanName) return setMessage("Indica el nombre de quien recibe la mercancía.");
    if (nextStatus !== "Firmado" && !cleanNote) return setMessage("Deja una observación para justificar la entrega sin firma.");
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/shipments/${shipment.id}/delivery-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Actor": actor },
        body: JSON.stringify({ signature_status: nextStatus, signature_data: nextStatus === "Firmado" ? canvasRef.current?.toDataURL("image/png") : "", recipient_name: cleanName, note: cleanNote, photos }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo confirmar la entrega.");
      setProof(data);
      setPhotos([]);
      onSaved(data);
      setMessage(nextStatus === "Firmado" ? "Entrega confirmada con firma." : "Entrega confirmada y motivo guardado.");
    } catch (error: any) {
      setMessage(error?.message || "No se pudo confirmar la entrega.");
    } finally {
      setSaving(false);
    }
  }
  return <section className={`delivery-signature-panel${clientMode ? " is-client-mode" : ""}`} aria-label="Firma de recepción">
    <div className="delivery-signature-head"><div><b>{clientMode ? "Firma de recepción del pedido" : "Firma de recepción"}</b><small>{clientMode ? "Comprueba los datos y firma dentro del recuadro para confirmar que has recibido la mercancía." : "El cliente puede firmar en el móvil o tableta del conductor. La firma es recomendable, pero no obligatoria."}</small></div><div className="delivery-signature-head-actions">{clientMode && <button type="button" className="button secondary" onClick={() => setClientMode(false)} disabled={saving}>Volver al detalle</button>}<span className={`delivery-signature-badge ${signatureStatus === "Firmado" ? "signed" : signatureStatus === "Rechazó firmar" ? "rejected" : signatureStatus === "Sin firma" ? "unsigned" : "pending"}`}>{signatureStatus === "Pendiente" ? "Pendiente" : signatureStatus}</span></div></div>
    {!clientMode && signatureStatus !== "Firmado" && <div className="delivery-signature-client-cta"><div><b>¿Va a firmar el cliente?</b><small>Abre una vista limpia y grande para que pueda leer los datos y firmar con el dedo.</small></div><button type="button" className="button primary" onClick={() => setClientMode(true)}>Mostrar al cliente para firmar</button></div>}
    {signatureStatus === "Firmado" && proof?.delivery_signature_data && <div className="delivery-signature-existing"><img src={proof.delivery_signature_data} alt="Firma de recepción guardada" /><div><b>Recepción firmada</b><small>{proof.delivery_recipient_name || "Receptor no indicado"}{proof.delivery_signature_at ? ` · ${String(proof.delivery_signature_at).slice(0, 16).replace("T", " ")}` : ""}</small></div></div>}
    <div className="delivery-signature-fields"><label>Nombre de quien recibe<input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Nombre y apellidos" disabled={saving} /></label><label>Observaciones {signatureStatus !== "Firmado" && <em>(obligatorio si no firma)</em>}<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej.: entrega recibida sin firma por indicación del cliente…" rows={2} disabled={saving} /></label></div>
    {(existingPhotos.length > 0 || photos.length > 0) && <div className="delivery-proof-photos"><div><b>Fotografías de la entrega</b><small>Quedan asociadas a este pedido y a su recepción.</small></div><div className="delivery-proof-photo-grid">{[...existingPhotos, ...photos].map((photo: any, index: number) => <div key={`${photo.name || "foto"}-${index}`}><img src={photo.thumbnail_url || photo.url || photo.data} alt={photo.name || "Fotografía de la entrega"} /><small>{photo.name || `Fotografía ${index + 1}`}</small>{index >= existingPhotos.length && <button type="button" className="link-button" onClick={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index - existingPhotos.length))}>Quitar</button>}</div>)}</div></div>}
    <label className="delivery-proof-photo-picker">Añadir fotografías<input type="file" accept="image/*" capture="environment" multiple onChange={(event) => { void attachPhotos(event.target.files); event.currentTarget.value = ""; }} disabled={saving} /><small>Opcional · hasta 4 fotos · máximo 4 MB cada una</small></label>
    <div className="delivery-signature-canvas-wrap"><div className="delivery-signature-canvas-head"><span>Firma aquí</span><button type="button" className="link-button" onClick={clearSignature} disabled={saving || !hasInk}>Borrar firma</button></div><canvas ref={canvasRef} className="delivery-signature-canvas" onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} onPointerLeave={stopDrawing} aria-label="Área para firmar la recepción" /></div>
    {message && <p className="delivery-signature-message" role="status">{message}</p>}
    <div className="delivery-signature-actions">{signatureStatus === "Firmado" ? <><button type="button" className="button primary" onClick={() => setSignedCopyOpen(true)}>Ver copia firmada</button><button type="button" className="button secondary" onClick={() => window.print()}>Imprimir copia</button></> : <><button type="button" className="button primary" disabled={saving} onClick={() => void confirmDelivery("Firmado")}>{saving ? "Guardando…" : "Confirmar entrega firmada"}</button><button type="button" className="button secondary" disabled={saving} onClick={() => void confirmDelivery("Sin firma")}>Entregar sin firma</button><button type="button" className="button ghost" disabled={saving} onClick={() => void confirmDelivery("Rechazó firmar")}>Cliente rechaza firmar</button></>}</div>
    {signedCopyOpen && <div className="delivery-signed-copy-overlay" role="dialog" aria-modal="true" aria-label="Copia firmada de la entrega" onMouseDown={(event) => event.target === event.currentTarget && setSignedCopyOpen(false)}><article className="delivery-signed-copy" onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow">JUSTIFICANTE DE ENTREGA</p><h3>{shipment.code || "Entrega"}</h3><small>{client?.name || "Cliente"}{client?.city ? ` · ${client.city}` : ""}</small></div><button type="button" className="preview-close" aria-label="Cerrar copia firmada" onClick={() => setSignedCopyOpen(false)}>×</button></header><div className="delivery-signed-copy-meta"><span><b>Estado</b>Entregado · {signatureStatus}</span><span><b>Recibe</b>{proof?.delivery_recipient_name || "No indicado"}</span><span><b>Fecha</b>{proof?.delivery_signature_at ? String(proof.delivery_signature_at).slice(0, 16).replace("T", " ") : "—"}</span><span><b>Registrado por</b>{proof?.delivery_signature_by || proof?.delivered_by || actor}</span><span><b>Dirección</b>{proof?.address || shipment.address || client?.address || "No indicada"}</span></div>{lines.length > 0 && <div className="delivery-signed-copy-lines"><b>Contenido de la entrega</b>{lines.map((line: any, index: number) => <div key={`${line.id || line.product_id}-${index}`}><span>{line.quantity || line.prepared_quantity || 0} {line.quantity_unit || "uds."}</span><strong>{line.product_name || products.find((product: any) => Number(product.id) === Number(line.product_id))?.name || `Producto #${line.product_id}`}</strong></div>)}</div>}{proof?.delivery_signature_note && <div className="delivery-signed-copy-note"><b>Observaciones</b><p>{proof.delivery_signature_note}</p></div>}<div className="delivery-signed-copy-signature"><b>Firma de quien recibe</b>{proof?.delivery_signature_data ? <img src={proof.delivery_signature_data} alt="Firma de recepción" /> : <span>Entrega registrada sin firma</span>}</div>{existingPhotos.length > 0 && <div className="delivery-signed-copy-photos"><b>Fotografías adjuntas</b><div>{existingPhotos.map((photo: any, index: number) => <img key={`${photo.name || "foto"}-${index}`} src={photo.thumbnail_url || photo.url || photo.data} alt={photo.name || `Fotografía ${index + 1}`} />)}</div></div>}<footer><button type="button" className="button secondary" onClick={() => setSignedCopyOpen(false)}>Cerrar</button><button type="button" className="button primary" onClick={() => window.print()}>Imprimir / guardar PDF</button></footer></article></div>}
  </section>;
}

function GoodsReceiptForm({ lookups, actor, onCreated }: { lookups: any; actor: string; onCreated: (receipt: any) => void }) {
  const [header, setHeader] = useState({ code: `ENT-${new Date().getFullYear()}-${String(Date.now()).slice(-7)}`, supplier_id: "", purchase_order_id: "", purchase_invoice_id: "", warehouse_id: "", receipt_date: tabletTodayInput(), validation_status: "Pendiente", validated_by: "", notes: "" });
  const [productSearch, setProductSearch] = useState("");
  const [lines, setLines] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", sku: "", unit: "unidad", cost_price: "0" });
  const [newProductSaving, setNewProductSaving] = useState(false);
  const products = lookups.products || [];
  const suppliers = lookups.suppliers || [];
  const warehouses = lookups.warehouses || [];
  const purchaseOrders = (lookups.purchase_orders || []).filter((item: any) => !header.supplier_id || Number(item.supplier_id) === Number(header.supplier_id));
  const matchingProducts = productSearch.trim()
    ? products.filter((item: any) => `${item.name || ""} ${item.sku || ""} ${item.brand || ""} ${item.category || ""}`.toLowerCase().includes(productSearch.trim().toLowerCase())).slice(0, 8)
    : [];
  function addProduct(product: any) {
    if (!product || lines.some((line) => Number(line.product_id) === Number(product.id))) return;
    setLines((current) => [...current, { product_id: String(product.id), product_name: product.name, sku: product.sku || "", expected_quantity: "0", received_quantity: "1", damaged_quantity: "0", substituted_quantity: "0", substitute_product_id: "", unit_cost: String(Number(product.cost_price || 0)), status: "Correcta", notes: "", incident_description: "", attachments: [] }]);
    setProductSearch("");
    setMessage("");
  }
  function updateLine(index: number, field: string, value: any) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  }
  async function attachLinePhotos(index: number, files: FileList | null) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    if (selected.some((file) => file.size > 4 * 1024 * 1024)) { setMessage("Cada foto de la incidencia no puede superar 4 MB."); return; }
    try {
      const attachments = await Promise.all(selected.map((file) => new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, mime: file.type || "image/jpeg", data: String(reader.result || "") });
        reader.onerror = () => reject(new Error("No se pudo leer una de las fotografías."));
        reader.readAsDataURL(file);
      })));
      setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, attachments: [...(line.attachments || []), ...attachments] } : line));
      setMessage("");
    } catch (error: any) { setMessage(error?.message || "No se pudieron adjuntar las fotografías."); }
  }
  async function createProduct() {
    if (!newProduct.name.trim()) return;
    setNewProductSaving(true);
    try {
      const response = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ ...newProduct, active: 1, product_status: "Activo", supplier_id: header.supplier_id || null, unit_price: 0 }) });
      const created = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(created.error || "No se pudo crear el producto");
      addProduct(created);
      setNewProduct({ name: "", sku: "", unit: "unidad", cost_price: "0" });
      setNewProductOpen(false);
    } catch (error: any) { setMessage(error.message || "No se pudo crear el producto"); }
    finally { setNewProductSaving(false); }
  }
  async function receive(event: any) {
    event.preventDefault();
    if (!header.supplier_id || !header.warehouse_id) { setMessage("Selecciona el proveedor y el almacén de destino."); return; }
    if (!lines.length) { setMessage("Busca y añade al menos un producto."); return; }
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/goods_receipts/receive", { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ ...header, supplier_id: Number(header.supplier_id), purchase_order_id: header.purchase_order_id ? Number(header.purchase_order_id) : null, purchase_invoice_id: header.purchase_invoice_id ? Number(header.purchase_invoice_id) : null, warehouse_id: Number(header.warehouse_id), validated_by: header.validated_by || (header.validation_status === "Validada" ? actor : null), lines: lines.map((line) => ({ ...line, product_id: Number(line.product_id), substitute_product_id: line.substitute_product_id ? Number(line.substitute_product_id) : null, expected_quantity: Number(line.expected_quantity || 0), received_quantity: Number(line.received_quantity || 0), damaged_quantity: Number(line.damaged_quantity || 0), substituted_quantity: Number(line.substituted_quantity || 0), unit_cost: Number(line.unit_cost || 0) })) }) });
      const created = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(created.error || "No se pudo registrar la entrada");
      onCreated(created);
      setHeader({ code: `ENT-${new Date().getFullYear()}-${String(Date.now()).slice(-7)}`, supplier_id: "", purchase_order_id: "", purchase_invoice_id: "", warehouse_id: "", receipt_date: tabletTodayInput(), validation_status: "Pendiente", validated_by: "", notes: "" });
      setLines([]); setProductSearch("");
    } catch (error: any) { setMessage(error.message || "No se pudo registrar la entrada"); }
    finally { setSaving(false); }
  }
  return <div className="goods-receipt-editor">
    <div className="goods-receipt-intro"><div><b>Recepción de mercancía</b><small>Registra varias referencias, compara lo esperado con lo recibido y deja constancia de cualquier problema.</small></div><span>{lines.length} líneas</span></div>
    <div className="goods-receipt-header-grid">
      <label>Código de entrada<input value={header.code} onChange={(event) => setHeader({ ...header, code: event.target.value })} /></label>
      <label>Proveedor *<select required value={header.supplier_id} onChange={(event) => setHeader({ ...header, supplier_id: event.target.value, purchase_order_id: "" })}><option value="">Seleccionar proveedor…</option>{suppliers.map((item: any) => <option key={item.id} value={item.id}>{item.name}{item.external_code ? ` · ${item.external_code}` : ""}</option>)}</select></label>
      <label>Pedido de compra relacionado<select value={header.purchase_order_id} onChange={(event) => setHeader({ ...header, purchase_order_id: event.target.value })}><option value="">Sin pedido de compra</option>{purchaseOrders.map((item: any) => <option key={item.id} value={item.id}>{item.code} · {item.status}</option>)}</select></label>
      <label>Factura de compra relacionada<select value={header.purchase_invoice_id} onChange={(event) => setHeader({ ...header, purchase_invoice_id: event.target.value })}><option value="">Sin factura vinculada</option>{(lookups.invoices || []).map((item: any) => <option key={item.id} value={item.id}>{item.code} · {item.status || "Pendiente"}</option>)}</select></label>
      <label>Almacén de destino *<select required value={header.warehouse_id} onChange={(event) => setHeader({ ...header, warehouse_id: event.target.value })}><option value="">Seleccionar almacén…</option>{warehouses.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Fecha de recepción *<input required type="date" value={header.receipt_date} onChange={(event) => setHeader({ ...header, receipt_date: event.target.value })} /></label>
      <label>Validación del responsable<select value={header.validation_status} onChange={(event) => setHeader({ ...header, validation_status: event.target.value, validated_by: event.target.value === "Validada" ? actor : header.validated_by })}><option>Pendiente</option><option>Validada</option><option>Rechazada</option></select></label>
      <label>Responsable<input value={header.validated_by} onChange={(event) => setHeader({ ...header, validated_by: event.target.value })} placeholder="Pendiente de validar" /></label>
      <label>Recepcionado por<input value={actor} readOnly /></label>
      <label className="goods-receipt-wide">Notas generales<textarea value={header.notes} onChange={(event) => setHeader({ ...header, notes: event.target.value })} placeholder="Observaciones de la recepción…" /></label>
    </div>
    <section className="goods-receipt-lines"><div className="goods-receipt-lines-head"><div><b>Productos recibidos</b><small>Busca por nombre, SKU, marca o categoría y añade las líneas que correspondan.</small></div><span>{lines.length} añadidas</span></div>
      <div className="goods-receipt-product-picker"><input aria-label="Buscar producto para la entrada" autoComplete="off" placeholder="Buscar producto por nombre o referencia…" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} />{productSearch.trim() && <div className="goods-receipt-suggestions">{matchingProducts.map((item: any) => <button type="button" key={item.id} onClick={() => addProduct(item)}><b>{item.name}</b><small>{[item.sku, item.unit, item.category].filter(Boolean).join(" · ") || "Sin referencia"}</small></button>)}{!matchingProducts.length && <span>No hay productos. <button type="button" className="link-button" onClick={() => setNewProductOpen(true)}>Dar de alta producto</button></span>}</div>}</div>
      {newProductOpen && <div className="goods-receipt-new-product"><b>Alta rápida de producto</b><input autoFocus placeholder="Nombre del producto *" value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} /><input placeholder="SKU o referencia" value={newProduct.sku} onChange={(event) => setNewProduct({ ...newProduct, sku: event.target.value })} /><select value={newProduct.unit} onChange={(event) => setNewProduct({ ...newProduct, unit: event.target.value })}><option value="unidad">Unidad</option><option value="caja">Caja</option><option value="botella">Botella</option><option value="kg">Kg</option></select><input type="number" min="0" step="any" placeholder="Coste unitario" value={newProduct.cost_price} onChange={(event) => setNewProduct({ ...newProduct, cost_price: event.target.value })} /><button type="button" className="button primary" disabled={newProductSaving} onClick={() => void createProduct()}>{newProductSaving ? "Guardando…" : "Crear y añadir"}</button><button type="button" className="button secondary" onClick={() => setNewProductOpen(false)}>Cancelar</button></div>}
      {lines.length ? <div className="goods-receipt-line-list">{lines.map((line, index) => <article key={`${line.product_id}-${index}`} className="goods-receipt-line"><div className="goods-receipt-line-product"><b>{line.product_name}</b><small>{line.sku || "Sin referencia"}</small><button type="button" className="link-button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Quitar</button></div><label>Esperadas<input type="number" min="0" step="any" value={line.expected_quantity} onChange={(event) => updateLine(index, "expected_quantity", event.target.value)} /></label><label>Recibidas<input type="number" min="0" step="any" value={line.received_quantity} onChange={(event) => updateLine(index, "received_quantity", event.target.value)} /></label><label>Coste unitario<input type="number" min="0" step="any" value={line.unit_cost} onChange={(event) => updateLine(index, "unit_cost", event.target.value)} /></label><label>Resultado<select value={line.status} onChange={(event) => updateLine(index, "status", event.target.value)}><option>Correcta</option><option>Diferencia</option><option>Producto equivocado</option><option>Dañado</option><option>Sustituido</option></select></label><label>Unidades dañadas<input type="number" min="0" step="any" value={line.damaged_quantity} onChange={(event) => updateLine(index, "damaged_quantity", event.target.value)} /></label><label>Unidades sustituidas<input type="number" min="0" step="any" value={line.substituted_quantity} onChange={(event) => updateLine(index, "substituted_quantity", event.target.value)} /></label><label>Producto sustituto<select value={line.substitute_product_id} onChange={(event) => updateLine(index, "substitute_product_id", event.target.value)}><option value="">No aplica</option>{products.filter((item: any) => Number(item.id) !== Number(line.product_id)).map((item: any) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ""}</option>)}</select></label><div className="goods-receipt-line-difference"><span>Diferencia económica</span><strong className={Number(line.received_quantity || 0) === Number(line.expected_quantity || 0) ? "" : "goods-receipt-incident-text"}>{((Number(line.received_quantity || 0) - Number(line.expected_quantity || 0)) * Number(line.unit_cost || 0)).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong><small>Recibido − esperado</small></div><label className="goods-receipt-line-wide">Observación o incidencia<textarea value={line.incident_description} onChange={(event) => updateLine(index, "incident_description", event.target.value)} placeholder="Ej. 2 cajas rotas o referencia incorrecta…" /></label><label className="goods-receipt-photo">Fotografías de la incidencia<input type="file" accept="image/*" capture="environment" multiple onChange={(event) => { void attachLinePhotos(index, event.target.files); event.currentTarget.value = ""; }} /><small>{(line.attachments || []).length ? `${line.attachments.length} fotografía${line.attachments.length === 1 ? "" : "s"} adjunta${line.attachments.length === 1 ? "" : "s"}` : "Puedes adjuntar varias fotografías · máximo 4 MB cada una"}</small></label>{(line.attachments || []).length > 0 && <div className="goods-receipt-attachment-preview">{line.attachments.map((attachment: any, attachmentIndex: number) => <div key={`${attachment.name}-${attachmentIndex}`}><img src={attachment.data} alt={attachment.name || "Fotografía de incidencia"} /><button type="button" className="link-button" aria-label={`Quitar ${attachment.name || "fotografía"}`} onClick={() => updateLine(index, "attachments", (line.attachments || []).filter((_: any, currentIndex: number) => currentIndex !== attachmentIndex))}>×</button></div>)}</div>}</article>)}</div> : <p className="goods-receipt-empty">Todavía no hay líneas. Busca un producto arriba para añadirlo.</p>}
    </section>
    {message && <div className="error-message" role="alert">{message}</div>}
    <div className="goods-receipt-submit"><button type="button" className="button primary" disabled={saving} onClick={(event) => void receive(event)}>{saving ? "Registrando entrada…" : "Registrar entrada y actualizar stock"}</button><small>Las incidencias quedarán como nota pendiente vinculada a esta entrada y al proveedor.</small></div>
  </div>;
}

function GoodsReceiptEditModal({ receipt, lookups, actor, onClose, onSaved }: { receipt: any; lookups: any; actor: string; onClose: () => void; onSaved: (receipt: any) => void }) {
  const [form, setForm] = useState({
    code: receipt.code || "",
    supplier_id: String(receipt.supplier_id || ""),
    purchase_order_id: String(receipt.purchase_order_id || ""),
    purchase_invoice_id: String(receipt.purchase_invoice_id || ""),
    warehouse_id: String(receipt.warehouse_id || ""),
    receipt_date: String(receipt.receipt_date || "").slice(0, 10),
    notes: receipt.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const suppliers = lookups.suppliers || [];
  const warehouses = lookups.warehouses || [];
  const purchaseOrders = (lookups.purchase_orders || []).filter((item: any) => !form.supplier_id || Number(item.supplier_id) === Number(form.supplier_id));
  async function save(event: any) {
    event.preventDefault();
    if (!form.code.trim() || !form.supplier_id || !form.warehouse_id || !form.receipt_date) { setError("Código, proveedor, almacén y fecha son obligatorios."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/goods_receipts/${receipt.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify({ ...form, supplier_id: Number(form.supplier_id), purchase_order_id: form.purchase_order_id ? Number(form.purchase_order_id) : null, purchase_invoice_id: form.purchase_invoice_id ? Number(form.purchase_invoice_id) : null, warehouse_id: Number(form.warehouse_id) }) });
      const updated = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(updated.error || "No se pudieron guardar los datos de la entrada.");
      const supplier = suppliers.find((item: any) => Number(item.id) === Number(form.supplier_id));
      const warehouse = warehouses.find((item: any) => Number(item.id) === Number(form.warehouse_id));
      onSaved({ ...receipt, ...updated, supplier_name: supplier?.name || receipt.supplier_name, warehouse_name: warehouse?.name || receipt.warehouse_name, purchase_order_code: purchaseOrders.find((item: any) => Number(item.id) === Number(form.purchase_order_id))?.code || null, purchase_invoice_code: (lookups.invoices || []).find((item: any) => Number(item.id) === Number(form.purchase_invoice_id))?.code || null });
      onClose();
    } catch (caught: any) { setError(caught?.message || "No se pudieron guardar los datos de la entrada."); }
    finally { setSaving(false); }
  }
  return <div className="preview-overlay" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}><form className="goods-receipt-edit-modal" onSubmit={save} onClick={(event) => event.stopPropagation()}><header className="preview-header"><div><b>Editar entrada · {receipt.code}</b><small>Actualiza los datos generales sin alterar las cantidades ya incorporadas al stock.</small></div><button type="button" className="preview-close" aria-label="Cerrar" onClick={() => !saving && onClose()}>×</button></header><div className="goods-receipt-edit-grid"><label>Código de entrada<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label><label>Proveedor<select value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value, purchase_order_id: "" })}><option value="">Seleccionar proveedor…</option>{suppliers.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Pedido de compra<select value={form.purchase_order_id} onChange={(event) => setForm({ ...form, purchase_order_id: event.target.value })}><option value="">Sin pedido vinculado</option>{purchaseOrders.map((item: any) => <option key={item.id} value={item.id}>{item.code} · {item.status}</option>)}</select></label><label>Factura de compra<select value={form.purchase_invoice_id} onChange={(event) => setForm({ ...form, purchase_invoice_id: event.target.value })}><option value="">Sin factura vinculada</option>{(lookups.invoices || []).map((item: any) => <option key={item.id} value={item.id}>{item.code} · {item.status || "Pendiente"}</option>)}</select></label><label>Almacén<select value={form.warehouse_id} onChange={(event) => setForm({ ...form, warehouse_id: event.target.value })}><option value="">Seleccionar almacén…</option>{warehouses.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Fecha de recepción<input type="date" value={form.receipt_date} onChange={(event) => setForm({ ...form, receipt_date: event.target.value })} /></label><label className="goods-receipt-wide">Notas generales<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Observaciones de la recepción…" /></label></div>{error && <p className="error-message" role="alert">{error}</p>}<footer className="preview-actions"><button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></footer></form></div>;
}

function Manager({ active, user, onNavigate, assistantFormIntent, onAssistantFormConsumed }: { active: string; user?: any; onNavigate?: (module: string) => void; assistantFormIntent?: any; onAssistantFormConsumed?: () => void }) {
  const c = cfg[active];
  const actorHeaders = {
    "Content-Type": "application/json",
    "X-Actor": user?.username || "Usuario local",
  };
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const formRef = useRef<any>(form);
  formRef.current = form;
  const [editing, setEditing] = useState<any>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newSupplierSaving, setNewSupplierSaving] = useState(false);
  const [newSupplier, setNewSupplier] = useState<any>({ name: "", tax_id: "", contact: "", phone: "", email: "", address: "", payment_terms: "" });
  const [productConfirmOpen, setProductConfirmOpen] = useState(false);
  const [productSaveMessage, setProductSaveMessage] = useState("");
  const formAccordionRef = useRef<HTMLDetailsElement>(null);
  const [inlineEditing, setInlineEditing] = useState<number | null>(null);
  const [inlineDraft, setInlineDraft] = useState<any>({});
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [entryDetail, setEntryDetail] = useState<any>(null);
  const [entryEdit, setEntryEdit] = useState<any>(null);
  const [entryIncidentSaving, setEntryIncidentSaving] = useState<number | null>(null);
  const [entryValidationSaving, setEntryValidationSaving] = useState(false);
  const [entryLocationSaving, setEntryLocationSaving] = useState<number | null>(null);
  const [entryLocationDrafts, setEntryLocationDrafts] = useState<Record<string, string>>({});
  const [entryLocationReasons, setEntryLocationReasons] = useState<Record<string, string>>({});
  const [labelProduct, setLabelProduct] = useState<any>(null);
  const [productDetail, setProductDetail] = useState<any>(null);
  const [batchLabelProducts, setBatchLabelProducts] = useState<any[]>([]);
  const [documentPreview, setDocumentPreview] = useState<any>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [productFilters, setProductFilters] = useState({ category: "", brand: "", stock: "todos", codes: "todos" });
  const [stockSort, setStockSort] = useState("status_asc");
  const [dateSort, setDateSort] = useState<{ field: string; direction: "asc" | "desc" } | null>(null);
  const [tableSort, setTableSort] = useState<{ field: string; direction: "asc" | "desc" } | null>(null);
  const [preparationDateFilter, setPreparationDateFilter] = useState(() => tabletTodayInput());
  const [previewClient, setPreviewClient] = useState<any>(null);
  const [previewInvoice, setPreviewInvoice] = useState<any>(null);
  const [previewSupplier, setPreviewSupplier] = useState<any>(null);
  const [shipmentLabelOpen, setShipmentLabelOpen] = useState(false);
  const [previewWarehouseCoordinates, setPreviewWarehouseCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [previewWarehouseDistanceKm, setPreviewWarehouseDistanceKm] = useState<number | null>(null);
  const [notePreview, setNotePreview] = useState<any>(null);
  const [noteIncidentOrder, setNoteIncidentOrder] = useState<any>(null);
  const [noteIncidentOrderLoading, setNoteIncidentOrderLoading] = useState(false);
  const [noteAction, setNoteAction] = useState("partial");
  const [noteActionSaving, setNoteActionSaving] = useState(false);
  const [noteActionError, setNoteActionError] = useState("");
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingRows, setBillingRows] = useState<any[]>([]);
  const [billingFrom, setBillingFrom] = useState("");
  const [billingTo, setBillingTo] = useState("");
  const [billingClient, setBillingClient] = useState("");
  const [billingSelected, setBillingSelected] = useState<number[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingFilter, setBillingFilter] = useState("todos");
  const [shippingFilter, setShippingFilter] = useState("todos");
  const [listDateFrom, setListDateFrom] = useState("");
  const [listDateTo, setListDateTo] = useState("");
  const [listClient, setListClient] = useState("");
  const [listStatus, setListStatus] = useState("Todos");
  const [previewLines, setPreviewLines] = useState<any[]>([]);
  const [incidentLineId, setIncidentLineId] = useState<number | null>(null);
  const [incidentText, setIncidentText] = useState("");
  const [incidentResolution, setIncidentResolution] = useState("partial");
  const [preparationAnnotation, setPreparationAnnotation] = useState("");
  const [preparationAnnotationSaving, setPreparationAnnotationSaving] = useState(false);
  const [preparationAnnotationMessage, setPreparationAnnotationMessage] = useState("");
  const [preparationAnnotationError, setPreparationAnnotationError] = useState("");
  const [preparationScanMessage, setPreparationScanMessage] = useState<{ text: string; kind: "success" | "warning" | "error" } | null>(null);
  const [preparationLineSavingId, setPreparationLineSavingId] = useState<number | null>(null);
  const [preparationValidationMessage, setPreparationValidationMessage] = useState("");
  const [preparationAddressDraft, setPreparationAddressDraft] = useState("");
  const [preparationCityDraft, setPreparationCityDraft] = useState("");
  const [preparationOpeningTimeDraft, setPreparationOpeningTimeDraft] = useState("");
  const [preparationClosingTimeDraft, setPreparationClosingTimeDraft] = useState("");
  const [preparationAddressSaving, setPreparationAddressSaving] = useState(false);
  const [preparationAddressMessage, setPreparationAddressMessage] = useState("");
  const [preparationAddressError, setPreparationAddressError] = useState("");
  const [preparationUpdateClient, setPreparationUpdateClient] = useState(false);
  const [bulkIncidentOpen, setBulkIncidentOpen] = useState(false);
  const [bulkIncidentText, setBulkIncidentText] = useState("");
  const [bulkIncidentSaving, setBulkIncidentSaving] = useState(false);
  const [bulkIncidentError, setBulkIncidentError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [productOptions, setProductOptions] = useState<any[]>([]);
  const [locationSavingId, setLocationSavingId] = useState<number | null>(null);
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({});
  const [newLine, setNewLine] = useState({
    product_id: "",
    quantity: "1",
    unit_price: "0",
  });
  const [quoteLines, setQuoteLines] = useState<any[]>([]);
  const [quoteLineDraft, setQuoteLineDraft] = useState({ product_id: "", quantity: "1", quantity_unit: "unidad", total_units: "", unit_price: "0", discount: "0", vat: "21" });
  const [quoteProductSearch, setQuoteProductSearch] = useState("");
  const [newShippingLocationOpen, setNewShippingLocationOpen] = useState(false);
  const [newShippingLocation, setNewShippingLocation] = useState({ name: "", address: "", city: "", opening_time: "", closing_time: "", notes: "" });
  const [clientSearch, setClientSearch] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const formInitialSnapshot = useRef("{}");
  const quoteLinesInitialSnapshot = useRef("[]");
  const [formDirty, setFormDirty] = useState(false);
  const [deletedUndo, setDeletedUndo] = useState<any>(null);
  const undoTimerRef = useRef<number | null>(null);
  const [quickView, setQuickView] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [listSupplier, setListSupplier] = useState("");
  const [visibleFields, setVisibleFields] = useState<string[]>(c.fields);
  const orderListFields = ["code", "client_id", "status", "billing_status", "payment_status", "shipping_status", "preparation_date", "delivery_date"];
  const stockListFields = ["product_id", "unit", "warehouse_name", "stock", "stock_reserved", "available_stock", "min_stock", "stock_status"];
  const warehouseListFields: Record<string, string[]> = {
    products: ["name", "sku", "barcode", "category", "format", "unit", "unit_price", "cost_price", "stock", "stock_reserved", "min_stock", "warehouse_location", "warehouse_id", "product_status"],
    warehouses: ["code", "name", "address", "manager"],
    collection_points: ["code", "name", "address", "city", "opening_time", "closing_time", "geocoding_status"],
    goods_receipts: ["code", "supplier_id", "purchase_order_id", "warehouse_id", "receipt_date", "status", "validation_status", "economic_difference", "line_count", "incident_count", "received_by"],
    inventory_movements: ["order_id", "shipment_id", "product_id", "warehouse_id", "movement_type", "quantity", "movement_date", "client_id", "created_by", "reference"],
    returns: ["code", "client_id", "invoice_id", "product_id", "quantity", "reason", "status", "amount"],
  };
  useEffect(() => {
    if (inlineEditing === null) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInlineEditing(null);
        setInlineDraft({});
      }
    };
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [inlineEditing]);
  useEffect(() => {
    setListDateFrom("");
    setListDateTo("");
    setListClient("");
    setListStatus("Todos");
    setListSupplier("");
    setQuickView("all");
    setPage(1);
  }, [active]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`excluvas.quick-view.${c.api}`);
      setQuickView(saved || "all");
    } catch { setQuickView("all"); }
  }, [active]);
  useEffect(() => {
    if (!formOpen) {
      setFormDirty(false);
      return;
    }
    setFormDirty(JSON.stringify(formRef.current || {}) !== formInitialSnapshot.current || JSON.stringify(quoteLines || []) !== quoteLinesInitialSnapshot.current);
  }, [form, formOpen, quoteLines]);
  useEffect(() => {
    if (!formOpen || !formDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [formOpen, formDirty]);
  function snapshotForm(value: any) {
    return JSON.stringify(value || {});
  }
  function beginForm(value: any, record: any = null, lines: any[] = []) {
    formInitialSnapshot.current = snapshotForm(value);
    quoteLinesInitialSnapshot.current = JSON.stringify(lines || []);
    setFormDirty(false);
    setForm(value);
    setEditing(record);
  }
  function closeForm(force = false) {
    if (!force && formDirty && !window.confirm("Hay cambios sin guardar. Si cierras ahora se perderán. ¿Quieres continuar?")) return false;
    setEditing(null);
    setForm({});
    setQuoteLines([]);
    quoteLinesInitialSnapshot.current = "[]";
    setFormDirty(false);
    setFormOpen(false);
    return true;
  }
  useEffect(() => {
    try {
      if (c.api === "orders") {
        setVisibleFields(orderListFields);
        localStorage.setItem(`excluvas.columns.${c.api}`, JSON.stringify(orderListFields));
        return;
      }
      if (c.api === "stock") {
        setVisibleFields(stockListFields);
        localStorage.setItem(`excluvas.columns.${c.api}`, JSON.stringify(stockListFields));
        return;
      }
      const compactFields = warehouseListFields[c.api];
      const compactVersionKey = `excluvas.columns.compact-v1.${c.api}`;
      const saved = localStorage.getItem(`excluvas.columns.${c.api}`);
      if (compactFields) {
        if (!saved || localStorage.getItem(compactVersionKey) !== "1") {
          setVisibleFields(compactFields);
          localStorage.setItem(`excluvas.columns.${c.api}`, JSON.stringify(compactFields));
          localStorage.setItem(compactVersionKey, "1");
          return;
        }
      }
      if (saved) {
        const storedFields = JSON.parse(saved);
        setVisibleFields(storedFields);
      }
      else setVisibleFields(c.fields);
    } catch {
      setVisibleFields(c.fields);
    }
  }, [active]);
  function toggleColumn(field: string) {
    const next = visibleFields.includes(field)
      ? visibleFields.filter((x) => x !== field)
      : [...visibleFields, field];
    if (!next.length) return;
    setVisibleFields(next);
    localStorage.setItem(`excluvas.columns.${c.api}`, JSON.stringify(next));
  }
  useEffect(() => {
    if (active !== "Productos") return;
    try {
      const saved = localStorage.getItem("excluvas.product-filters");
      if (saved) setProductFilters({ ...productFilters, ...JSON.parse(saved) });
    } catch { /* Preferimos los filtros por defecto si no hay preferencias guardadas. */ }
  }, [active]);
  function updateProductFilters(next: Partial<typeof productFilters>) {
    const value = { ...productFilters, ...next };
    setProductFilters(value);
    localStorage.setItem("excluvas.product-filters", JSON.stringify(value));
  }
  const [dbError, setDbError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lookups, setLookups] = useState<any>({
    clients: [],
    products: [],
    warehouses: [],
    suppliers: [],
    collection_points: [],
    orders: [],
    shipments: [],
    invoices: [],
    purchase_orders: [],
    payments: [],
    inventory_movements: [],
  });
  const getClient = (id: any) => (lookups.clients || []).find((item: any) => Number(item.id) === Number(id));
  useEffect(() => {
    if (active !== "Cobros" || formOpen) return;
    try {
      const raw = sessionStorage.getItem("excluvas.pending-payment");
      if (!raw) return;
      sessionStorage.removeItem("excluvas.pending-payment");
      const pending = JSON.parse(raw);
      const invoice = (lookups.invoices || []).find((item: any) => Number(item.id) === Number(pending.invoice_id));
      if (!invoice) return setError("No se ha encontrado la factura para preparar el cobro.");
      beginForm({ invoice_id: String(invoice.id), amount: String(pending.amount || invoice.amount || ""), payment_date: tabletTodayInput(), method: "Transferencia" });
      setFormOpen(true);
    } catch { /* La pantalla de cobros sigue disponible aunque no se pueda recuperar el contexto. */ }
  }, [active, formOpen, lookups.invoices]);
  useEffect(() => {
    if (!assistantFormIntent || assistantFormIntent.section !== active) return;
    const source = assistantFormIntent.data && typeof assistantFormIntent.data === "object" ? assistantFormIntent.data : {};
    const aliases: Record<string, string> = {
      invoice_number: "code", invoice_date: "issue_date", total: "amount", total_amount: "amount", tax_rate: "vat",
      supplier: "vendor", supplier_name: "vendor", product_name: "name", product_code: "sku", customer_name: "client_name",
      customer: "client_name", client: "client_name", date: active === "Gastos y tickets" ? "expense_date" : "issue_date",
    };
    const next: Record<string, any> = {};
    Object.entries(source).forEach(([key, value]) => {
      const target = aliases[key] || key;
      if (value !== null && value !== undefined && value !== "" && next[target] === undefined) next[target] = value;
    });
    const normalizeDate = (value: any) => {
      const text = String(value || "").trim();
      const match = text.match(/^(\d{1,2})[\\/.\-](\d{1,2})[\\/.\-](\d{4})$/);
      return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : value;
    };
    ["issue_date", "due_date", "expense_date", "delivery_date", "valid_until", "preparation_date", "shipping_date"].forEach((field) => {
      if (next[field]) next[field] = normalizeDate(next[field]);
    });
    const findLookup = (items: any[], query: any) => {
      const needle = String(query || "").trim().toLocaleLowerCase();
      if (!needle) return null;
      return (items || []).find((item: any) => String(item.name || item.code || "").trim().toLocaleLowerCase() === needle)
        || (items || []).find((item: any) => String(item.name || item.code || "").toLocaleLowerCase().includes(needle));
    };
    if (!next.client_id && next.client_name) {
      const client = findLookup(lookups.clients, next.client_name);
      if (client) next.client_id = String(client.id);
      setClientSearch(String(next.client_name));
    }
    if (!next.product_id && next.product_name) {
      const product = findLookup(lookups.products, next.product_name);
      if (product) next.product_id = String(product.id);
    }
    if (!next.supplier_id && next.supplier_name) {
      const supplier = findLookup(lookups.suppliers, next.supplier_name);
      if (supplier) next.supplier_id = String(supplier.id);
    }
    delete next.client_name;
    delete next.product_name;
    delete next.supplier_name;
    delete next.customer_name;
    delete next.customer;
    delete next.client;
    setInlineEditing(null);
    setError("");
    const assistantLines = Array.isArray(assistantFormIntent.lines) ? assistantFormIntent.lines : [];
    beginForm(next, null, assistantLines);
    setQuoteLines(assistantLines);
    setFormOpen(true);
    onAssistantFormConsumed?.();
  }, [assistantFormIntent, active, lookups]);
  useLayoutEffect(() => {
    // Las estructuras de los listados han cambiado varias veces (por ejemplo,
    // Entradas pasó de compartir datos con movimientos a usar goods_receipts).
    // Versionar la clave evita rehidratar filas antiguas con IDs incompatibles.
    const cacheKey = `excluvas.listado.v2.${c.api}.${showDeleted ? "deleted" : "active"}.${showInactive ? "all-statuses" : "active-only"}`;
    const applyList = (value: any[]) => {
      const enrichedRows = c.api === "orders"
        ? value.map((item: any) => ({ ...item, billing_status: item.billing_status || (item.status === "Facturado" ? "Facturado" : "Sin facturar") }))
        : value;
      const statusRows = !showInactive && ["suppliers", "clients", "products"].includes(c.api)
        ? enrichedRows.filter((item: any) => c.api === "products"
          ? Number(item.active ?? 1) === 1 && !["inactivo", "baja", "descatalogado"].includes(String(item.product_status || "Activo").toLowerCase())
          : Number(item.active ?? 1) === 1)
        : enrichedRows;
      return c.movementFilter
        ? statusRows.filter((item: any) => String(item.movement_type || "").toLowerCase() === String(c.movementFilter).toLowerCase())
        : c.statusFilter
          ? statusRows.filter((item: any) => c.statusFilter.includes(item.status || "Preparando"))
          : statusRows;
    };
    let hasCachedRows = false;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (Array.isArray(cached)) {
        setRows(applyList(cached));
        hasCachedRows = true;
      }
    } catch { /* Si la caché está dañada, se ignora y se consulta la API. */ }
    // La caché sirve de respaldo si la API falla, pero no debe mostrarse como
    // si fuera el listado definitivo mientras llega la respuesta actualizada.
    setLoading(true);
    setDbError("");
    const params = new URLSearchParams();
    if (showDeleted) params.set("include_deleted", "1");
    if (showInactive && ["suppliers", "clients", "products"].includes(c.api)) params.set("include_inactive", "1");
    fetchWithRetry("/api/" + c.api + (params.toString() ? `?${params.toString()}` : ""), {
      headers: { "X-Actor": user?.username || "Usuario local" },
    })
      .then((r) => {
        if (!r.ok) throw new Error("El servidor no ha podido cargar el listado");
        return r.json();
      })
      .then((x) => {
        const list = Array.isArray(x) ? x : [];
        setRows(applyList(list));
        try { localStorage.setItem(cacheKey, JSON.stringify(list)); } catch { /* La caché es opcional. */ }
      })
      .catch(() => {
        setDbError(
          "No se ha podido actualizar el listado. Se mantienen los datos anteriores; inténtalo de nuevo en unos segundos.",
        );
      })
      .finally(() => setLoading(false));
  }, [active, showDeleted, showInactive]);
  useEffect(() => {
    const lookupResourcesByActive: Record<string, string[]> = {
      Productos: ["suppliers", "warehouses"],
      Stock: ["products", "warehouses", "inventory_movements"],
      Envíos: ["clients", "orders", "collection_points", "shipments"],
      Clientes: ["clients", "collection_points", "invoices", "payments"],
      Contactos: ["clients", "suppliers"],
      Proveedores: ["suppliers", "purchase_orders", "payments"],
      Compras: ["suppliers", "products", "purchase_orders", "invoices"],
      "Compras inteligentes": ["suppliers", "products", "purchase_orders"],
      Almacenes: ["warehouses", "products"],
      "Preparación de pedidos": ["clients", "orders", "products", "collection_points", "shipments"],
      "Lugares de recogida": ["clients", "collection_points"],
      Entradas: ["products", "warehouses", "suppliers", "purchase_orders", "invoices"],
      Salidas: ["clients", "orders", "collection_points", "shipments"],
      Pedidos: ["clients", "products", "collection_points", "shipments", "orders", "invoices"],
      Presupuestos: ["clients", "products", "quotes"],
      Albaranes: ["clients", "orders", "products", "delivery_notes"],
      Facturas: ["clients", "orders", "products", "invoices"],
      Cobros: ["clients", "invoices", "payments"],
      "Gastos y tickets": ["clients", "suppliers", "payments"],
      Balance: ["invoices", "purchase_orders", "payments", "expenses"],
      Informes: ["orders", "clients", "products", "invoices", "payments", "inventory_movements", "shipments", "purchase_orders", "expenses"],
      Devoluciones: ["clients", "invoices", "products", "orders", "shipments"],
    };
    const lookupResources = lookupResourcesByActive[active] || [];
    if (!lookupResources.length) return;
    Promise.allSettled(
      lookupResources.map(async (resource) => [resource, await fetchCompactLookup(resource, user?.username || "Usuario local")] as const),
    ).then((results) => setLookups((current: any) => {
      const next = { ...current };
      results.forEach((result) => { if (result.status === "fulfilled") next[result.value[0]] = result.value[1]; });
      return next;
    }));
  }, [active, user?.username]);
  useEffect(() => {
    if (!formOpen || !["Pedidos", "Presupuestos"].includes(active) || (lookups.products || []).length) return;
    fetchCompactLookup("products", user?.username || "Usuario local").then((products) => {
      if (products.length) setLookups((current: any) => ({ ...current, products }));
    });
  }, [active, formOpen, user?.username, lookups.products]);
  useEffect(() => {
    if (!formOpen || !["Pedidos", "Presupuestos"].includes(active) || !quoteProductSearch.trim() || (lookups.products || []).length) return;
    fetch(`/api/products?view=lookup&limit=2000&query=${encodeURIComponent(quoteProductSearch.trim())}`, { cache: "no-store", headers: { "X-Actor": user?.username || "Usuario local" } })
      .then((response) => response.ok ? response.json() : [])
      .then((products) => {
        if (Array.isArray(products) && products.length) setLookups((current: any) => ({ ...current, products }));
      })
      .catch(() => undefined);
  }, [active, formOpen, quoteProductSearch, user?.username, lookups.products]);
  async function attachExpenseFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      alert("El justificante no puede superar 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setForm((current: any) => ({
        ...current,
        attachment_name: file.name,
        attachment_mime: file.type || "application/octet-stream",
        attachment_data: String(reader.result || ""),
      }));
    reader.readAsDataURL(file);
  }
  function attachProductPhoto(file: File) {
    if (file.size > 5 * 1024 * 1024) return alert("La foto no puede superar 5 MB.");
    const reader = new FileReader();
    reader.onload = () => setForm((current: any) => ({ ...current, photo_name: file.name, photo_mime: file.type || "image/jpeg", photo_data: String(reader.result || "") }));
    reader.readAsDataURL(file);
  }
  function handleFormChange(field: string, value: any) {
    if (active === "Productos") {
      setForm((current: any) => {
        const next = { ...current, [field]: value };
        if (field === "category") {
          const category = String(value || "").trim().toLowerCase();
          const existing = rows.find((row: any) => String(row.category || "").trim().toLowerCase() === category && String(row.category_code || "").trim());
          const usedCodes = rows.map((row: any) => Number(row.category_code)).filter((code: number) => Number.isFinite(code) && code > 0);
          const generatedCode = String(Math.max(0, ...usedCodes) + 1).padStart(3, "0");
          next.category_code = existing?.category_code || (category ? generatedCode : "");
        }
        if (field === "cost_price") {
          if (!String(current.last_direct_cost || "").trim()) next.last_direct_cost = value;
          const cost = Number(value || 0), markup = Number(current.markup_percent || 0);
          next.unit_price = (cost * (1 + markup / 100)).toFixed(2);
        }
        if (field === "markup_percent") {
          const cost = Number(current.cost_price || 0), markup = Number(value || 0);
          next.unit_price = (cost * (1 + markup / 100)).toFixed(2);
        }
        if (field === "product_tracking_code") {
          next.lot_tracking = value === "Seguimiento de lote" || value === "Lote y fecha de caducidad" ? "1" : "0";
          next.expiry_tracking = value === "Lote y fecha de caducidad" ? "1" : "0";
        }
        if (field === "vat") next.accounting_vat_group = `${Number(value || 21)}%`;
        return next;
      });
      return;
    }
    if (active === "Pedidos" && field === "client_id") {
      setForm((current: any) => ({ ...current, client_id: value, collection_point_id: "" }));
      const client = (lookups.clients || []).find((item: any) => Number(item.id) === Number(value));
      setClientSearch(client ? `${client.name}${client.city ? ` · ${client.city}` : ""}` : "");
      setNewShippingLocationOpen(false);
      return;
    }
    if (active !== "Salidas") {
      setForm((current: any) => ({ ...current, [field]: value }));
      return;
    }
    if (field === "order_id") {
      const order = lookups.orders.find((item: any) => Number(item.id) === Number(value));
      setForm({
        ...form,
        order_id: value,
        shipment_id: form.shipment_id || "",
        product_id: order?.product_id || form.product_id || "",
        client_id: order?.client_id || form.client_id || "",
        quantity: order?.quantity || form.quantity || "",
        reference: order?.code || form.reference || "",
        movement_type: "Salida",
        created_by: user?.username || "Usuario local",
      });
      return;
    }
    if (field === "shipment_id") {
      const shipment = lookups.shipments.find((item: any) => Number(item.id) === Number(value));
      setForm({
        ...form,
        shipment_id: value,
        order_id: shipment?.order_id || form.order_id || "",
        client_id: shipment?.client_id || form.client_id || "",
        reference: shipment?.code || form.reference || "",
        movement_type: "Salida",
        created_by: user?.username || "Usuario local",
      });
      return;
    }
    setForm({ ...form, [field]: value, ...(field === "created_by" ? { created_by: user?.username || "Usuario local" } : {}) });
  }
  async function geocodeAddress(address: string, city: string) {
    let timeout = 0;
    try {
      const query = encodeURIComponent([address, city, "España"].filter(Boolean).join(", "));
      const request = fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}`, { headers: { Accept: "application/json" } });
      const deadline = new Promise<Response>((_, reject) => { timeout = window.setTimeout(() => reject(new Error("Geocodificación agotada")), 6000); });
      const response = await Promise.race([request, deadline]);
      const result = await response.json();
      if (Array.isArray(result) && result[0]) return { latitude: Number(result[0].lat), longitude: Number(result[0].lon), geocoded_at: new Date().toISOString(), geocoding_status: "Geolocalizada" };
    } catch {}
    finally { if (timeout) window.clearTimeout(timeout); }
    return { latitude: null, longitude: null, geocoded_at: null, geocoding_status: "Pendiente" };
  }
  async function createShippingLocation() {
    if (!form.client_id) return alert("Selecciona primero un cliente.");
    if (!newShippingLocation.name.trim() || !newShippingLocation.address.trim()) return alert("Indica un nombre y una dirección para la ubicación.");
    const geo = await geocodeAddress(newShippingLocation.address.trim(), newShippingLocation.city.trim());
    const payload = {
      ...newShippingLocation,
      name: newShippingLocation.name.trim(),
      address: newShippingLocation.address.trim(),
      client_id: Number(form.client_id),
      code: `UBI-${Date.now().toString().slice(-8)}`,
      ...geo,
    };
    const response = await fetch("/api/collection_points", { method: "POST", headers: actorHeaders, body: JSON.stringify(payload) });
    const created = await response.json().catch(() => ({}));
    if (!response.ok) return alert(created.error || "No se pudo guardar la ubicación");
    setLookups((current: any) => ({ ...current, collection_points: [created, ...(current.collection_points || [])] }));
    setForm((current: any) => ({ ...current, collection_point_id: String(created.id) }));
    setNewShippingLocation({ name: "", address: "", city: "", opening_time: "", closing_time: "", notes: "" });
    setNewShippingLocationOpen(false);
  }
  function addQuoteLine() {
    const product = (lookups.products || []).find((item: any) => Number(item.id) === Number(quoteLineDraft.product_id));
    const requestedQuantity = Number(quoteLineDraft.quantity || 0);
    if (!product || requestedQuantity <= 0) return;
    const unitsFactor = quoteUnitsFactor(product, quoteLineDraft.quantity_unit);
    const totalUnits = Number(quoteLineDraft.total_units || 0);
    if (isOrderForm && totalUnits <= 0) {
      setError("Indica las unidades totales de la línea antes de añadirla.");
      return;
    }
    const quantity = isOrderForm ? totalUnits : requestedQuantity * unitsFactor;
    const formatPrice = Number(quoteLineDraft.unit_price || product.unit_price || 0);
    const unitPrice = unitsFactor > 0 ? formatPrice / unitsFactor : formatPrice;
    const discount = Number(quoteLineDraft.discount || 0);
    const base = requestedQuantity * formatPrice * (1 - discount / 100);
    setQuoteLines((current) => [...current, {
      product_id: Number(product.id),
      product_name: product.name,
      quantity,
      quantity_requested: requestedQuantity,
      quantity_unit: quoteLineDraft.quantity_unit,
      units_factor: unitsFactor,
      format_price: formatPrice,
      unit_price: unitPrice,
      discount,
      vat: Number(quoteLineDraft.vat || 21),
      amount: base,
    }]);
    setQuoteLineDraft({ product_id: "", quantity: "1", quantity_unit: "unidad", total_units: "", unit_price: "0", discount: "0", vat: "21" });
    setQuoteProductSearch("");
  }
  function quoteUnitsFactor(product: any, unit: string) {
    return unit === "caja" ? Number(product?.units_per_case || 1) : unit === "pack_4" ? 4 : unit === "pack_6" ? 6 : unit === "palet" ? Number(product?.units_per_pallet || 0) : 1;
  }
  const selectedQuoteProduct = (lookups.products || []).find((item: any) => Number(item.id) === Number(quoteLineDraft.product_id));
  const quoteTotalUnits = quoteLineDraft.total_units;
  const orderGeneralComplete = Boolean(String(form.code || "").trim() && form.client_id && form.collection_point_id);
  async function saveNewSupplier(event: any) {
    event.preventDefault();
    if (!String(newSupplier.name || "").trim()) return;
    setNewSupplierSaving(true);
    try {
      const response = await fetch("/api/suppliers", { method: "POST", headers: actorHeaders, body: JSON.stringify(newSupplier) });
      const created = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(created.error || "No se pudo guardar el proveedor");
      setLookups((current: any) => ({ ...current, suppliers: [created, ...(current.suppliers || [])] }));
      setForm((current: any) => ({ ...current, supplier_id: String(created.id), primary_supplier_id: String(created.id) }));
      setSupplierSearch(created.name || "");
      setNewSupplierOpen(false);
      setNewSupplier({ name: "", tax_id: "", contact: "", phone: "", email: "", address: "", payment_terms: "" });
    } catch (error: any) { setError(error.message || "No se pudo guardar el proveedor"); }
    finally { setNewSupplierSaving(false); }
  }
  async function saveRecord(e: any, formOverride?: any) {
    e.preventDefault();
    const currentForm = formOverride && Object.keys(formOverride).length ? formOverride : formRef.current;
    if (isOrderForm && editing && isOrderSent(editing)) {
      setError("Este pedido ya ha sido enviado y no se puede editar.");
      return;
    }
    if (isOrderForm && (!String(currentForm.code || "").trim() || !currentForm.client_id || !currentForm.collection_point_id)) {
      setError("Completa el código, el cliente y el lugar de envío antes de guardar el pedido.");
      return;
    }
    if (active === "Productos") {
      const requiredProductFields = ["name", "sku", "description", "category", "unit", "created_at", "warehouse_id", "warehouse_location", "inventory_valuation_method", "cost_price", "last_direct_cost", "markup_percent", "unit_price", "accounting_product_group", "accounting_vat_group", "inventory_register_group", "product_tracking_code", "supplier_id"];
      const productFieldLabels: Record<string, string> = { name: "Producto", sku: "Número proveedor", description: "Descripción", category: "Categoría", unit: "Unidad de medida base", created_at: "Fecha de alta", warehouse_id: "Código de almacén", warehouse_location: "Número de estante", inventory_valuation_method: "Valoración de existencias", cost_price: "Coste unitario", last_direct_cost: "Coste último directo", markup_percent: "Porcentaje de incremento de venta", unit_price: "Precio de venta", accounting_product_group: "Grupo contable prod. gen.", accounting_vat_group: "Grupo contable IVA", inventory_register_group: "Grupo registro inventario", product_tracking_code: "Código seguimiento producto", supplier_id: "Nombre proveedor" };
      const missing = requiredProductFields.filter((field) => !String(currentForm[field] ?? "").trim());
      if (missing.length) {
        setError(`Completa los campos obligatorios del producto: ${missing.map((field) => productFieldLabels[field] || field).join(", ")}.`);
        return;
      }
    }
    const method = editing ? "PUT" : "POST",
      url =
        "/api/" +
        c.api +
        (editing ? "/" + editing.id : "");
    let r: Response;
    const isProforma = c.api === "invoices" && currentForm.status === "Proforma";
    const quoteAmount = quoteLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
    const reopenPreparation = c.api === "orders" && editing && !isOrderSent(editing);
    let clientGeodata: Record<string, any> = {};
    if (c.api === "clients" && String(currentForm.address || "").trim() && (!editing || String(editing.address || "").trim() !== String(currentForm.address || "").trim() || String(editing.city || "").trim() !== String(currentForm.city || "").trim())) {
      clientGeodata = await geocodeAddress(String(currentForm.address).trim(), String(currentForm.city || "").trim());
    }
    const payload = {
      ...currentForm,
      ...clientGeodata,
      ...(reopenPreparation ? { status: "Pendiente", reopen_preparation: true } : {}),
      ...((c.api === "quotes" || isProforma || c.api === "orders") ? { amount: quoteAmount } : {}),
      ...(c.api === "orders" && !editing ? { lines: quoteLines } : {}),
      ...(c.api === "expenses" && !currentForm.code
        ? { code: "GAS-" + String(Date.now()).slice(-8) }
        : {}),
    };
    if (!editing && active === "Salidas" && currentForm.order_id) {
      const sourceLines = await fetch("/api/order_lines")
        .then((response) => (response.ok ? response.json() : []))
        .then((lines) => (Array.isArray(lines) ? lines.filter((line: any) => Number(line.order_id) === Number(currentForm.order_id)) : []))
        .catch(() => []);
      const lines = sourceLines.length ? sourceLines : [{ product_id: currentForm.product_id, quantity: currentForm.quantity }];
      const created: any[] = [];
      for (const line of lines) {
        if (!line.product_id || !Number(line.quantity)) continue;
        const response = await fetch("/api/inventory_movements", {
          method: "POST",
          headers: actorHeaders,
          body: JSON.stringify({
            ...payload,
            product_id: line.product_id,
            quantity: line.quantity,
            movement_type: "Salida",
          }),
        });
        const item = await response.json();
        if (!response.ok) return alert(item.error || "No se pudo registrar la salida");
        created.push(item);
      }
      if (!created.length) return alert("El pedido no tiene productos válidos para registrar la salida");
      setRows((current) => [...created, ...current]);
      closeForm(true);
      return;
    }
    try {
      r = await fetch(url, {
        method,
        headers: actorHeaders,
        body: JSON.stringify(payload),
      });
    } catch {
      setDbError(
        "No se puede guardar porque la base de datos local no está disponible.",
      );
      return;
    }
    const d = await r.json();
    if (d.error) {
      alert(d.error);
      return;
    }
    if (!editing && active === "Clientes" && d.address) {
      await fetch("/api/collection_points", {
        method: "POST",
        headers: actorHeaders,
        body: JSON.stringify({
          client_id: d.id,
          name: "Dirección principal",
          address: d.address,
          city: d.city || "",
          opening_time: d.opening_time || "",
          closing_time: d.closing_time || "",
          latitude: d.latitude ?? null,
          longitude: d.longitude ?? null,
          geocoded_at: d.geocoded_at ?? null,
          geocoding_status: d.geocoding_status || "Pendiente",
          notes: "Ubicación principal creada automáticamente con el cliente.",
        }),
      });
    }
    if ((c.api === "quotes" || isProforma) && !editing) {
      for (const line of quoteLines) {
        const lineResponse = await fetch(`/api/${isProforma ? "invoice_lines" : c.api === "orders" ? "order_lines" : "quote_lines"}`, {
          method: "POST",
          headers: actorHeaders,
          body: JSON.stringify({ ...line, ...(isProforma ? { invoice_id: d.id } : c.api === "orders" ? { order_id: d.id } : { quote_id: d.id }) }),
        });
        if (!lineResponse.ok) return alert(`${isProforma ? "La proforma" : "El presupuesto"} se creó, pero no se pudo guardar una de sus líneas.`);
      }
      if (isProforma) await prepareInvoicePdf(d);
    }
    setDbError("");
    setRows(editing ? rows.map((x) => (x.id === d.id ? d : x)) : [d, ...rows]);
    closeForm(true);
    if (active === "Productos") setProductSaveMessage(editing ? "Producto actualizado correctamente." : "Producto creado y guardado correctamente.");
  }
  async function save(e: any) {
    e.preventDefault();
    if (active === "Productos" && !editing) {
      setProductConfirmOpen(true);
      return;
    }
    await saveRecord(e);
  }
  async function remove(id: number) {
    if (user?.role !== "admin") return alert("Solo un administrador puede eliminar registros.");
    const current = rows.find((row) => Number(row.id) === Number(id));
    if (!current) return;
    const label = current.name || current.code || current.title || `registro #${id}`;
    if (!window.confirm(`Vas a enviar a la papelera “${label}”. Podrás recuperarlo durante esta sesión. ¿Continuar?`)) return;
    const response = await fetch("/api/" + c.api + "/" + id, {
      method: "DELETE",
      headers: actorHeaders,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return alert(body.error || "No se pudo eliminar el registro.");
    setRows((currentRows) => currentRows.filter((x) => x.id !== id));
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setDeletedUndo({ row: current, api: c.api, label });
    undoTimerRef.current = window.setTimeout(() => setDeletedUndo(null), 10000);
  }
  async function undoDelete() {
    if (!deletedUndo || deletedUndo.api !== c.api) return;
    const { row } = deletedUndo;
    const response = await fetch(`/api/${c.api}/${row.id}`, {
      method: "PUT",
      headers: actorHeaders,
      body: JSON.stringify({ ...row, deleted: 0, deleted_at: null, deleted_by: null }),
    });
    const restored = await response.json().catch(() => ({}));
    if (!response.ok) return alert(restored.error || "No se pudo deshacer la eliminación.");
    setRows((currentRows) => [restored, ...currentRows]);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setDeletedUndo(null);
  }
  async function restore(id: number) {
    const current = rows.find((row) => Number(row.id) === Number(id));
    if (!current) return;
    const response = await fetch(`/api/${c.api}/${id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ ...current, deleted: 0, deleted_at: null, deleted_by: null }) });
    const restored = await response.json().catch(() => ({}));
    if (!response.ok) return alert(restored.error || "No se pudo recuperar el registro");
    setRows((list) => showDeleted ? list.map((row) => row.id === restored.id ? restored : row) : list.filter((row) => row.id !== restored.id));
  }
  function toggleProductSelection(id: number) {
    setSelectedProductIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  async function duplicateProduct(row: any) {
    const copy = { ...row };
    delete copy.id;
    copy.name = `${row.name || "Producto"} · Copia`;
    copy.sku = row.sku ? `${row.sku}-C` : `EXC-COPIA-${Date.now().toString().slice(-5)}`;
    copy.barcode = "";
    copy.created_by = user?.username || "Usuario local";
    const response = await fetch("/api/products", { method: "POST", headers: actorHeaders, body: JSON.stringify(copy) });
    const created = await response.json().catch(() => ({}));
    if (!response.ok) return alert(created.error || "No se pudo duplicar el producto");
    setRows((current) => [created, ...current]);
    setProductDetail(created);
  }
  async function generateCodesForSelected() {
    if (!selectedProductIds.length) return alert("Selecciona al menos un producto.");
    const selected = rows.filter((row) => selectedProductIds.includes(Number(row.id)));
    const updated: any[] = [];
    for (const row of selected) {
      const code = row.barcode || row.sku || `EXC-${String(row.id).padStart(5, "0")}`;
      const response = await fetch(`/api/products/${row.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ ...row, barcode: code }) });
      if (response.ok) updated.push(await response.json());
    }
    if (updated.length) {
      setRows((current) => current.map((row) => updated.find((item) => item.id === row.id) || row));
      setSelectedProductIds([]);
      alert(`${updated.length} códigos preparados correctamente`);
    }
  }
  async function changeCategoryForSelected(category: string) {
    if (!category || !selectedProductIds.length) return;
    const selected = rows.filter((row) => selectedProductIds.includes(Number(row.id)));
    const updated: any[] = [];
    for (const row of selected) {
      const response = await fetch(`/api/products/${row.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ ...row, category }) });
      if (response.ok) updated.push(await response.json());
    }
    setRows((current) => current.map((row) => updated.find((item) => item.id === row.id) || row));
    setSelectedProductIds([]);
  }
  async function deleteSelectedProducts() {
    if (user?.role !== "admin") return alert("Solo un administrador puede eliminar productos.");
    if (!selectedProductIds.length) return alert("Selecciona al menos un producto.");
    const selected = rows.filter((row) => selectedProductIds.includes(Number(row.id)));
    const names = selected.slice(0, 3).map((row) => row.name || row.code || `#${row.id}`).join(", ");
    const suffix = selected.length > 3 ? ` y ${selected.length - 3} más` : "";
    if (!window.confirm(`Vas a enviar ${selected.length} productos a la papelera (${names}${suffix}). Podrás recuperarlos desde “Mostrar eliminados”. ¿Continuar?`)) return;
    for (const id of selectedProductIds) {
      const response = await fetch(`/api/products/${id}`, { method: "DELETE", headers: actorHeaders });
      if (!response.ok) return alert("Algunos productos no se pudieron eliminar. Revisa el listado.");
    }
    setRows((current) => current.filter((row) => !selectedProductIds.includes(Number(row.id))));
    setSelectedProductIds([]);
  }
  function beginInline(row: any) {
    setInlineEditing(row.id ?? row.product_id ?? row.code);
    setInlineDraft({ ...row });
  }
  function isOrderSent(row: any) {
    return ["Enviado", "En reparto", "Entregado", "Facturado", "Cancelado"].includes(String(row.status || ""));
  }
  async function manageOrder(row: any, status: string) {
    if (!row?.id || isOrderSent(row)) return;
    const labels: Record<string, string> = { Bloqueado: "bloquear", Pospuesto: "posponer", Pendiente: "reactivar" };
    if (status === "Cancelado" && !window.confirm(`¿Anular el pedido ${row.code}? Esta acción lo sacará del flujo de preparación.`)) return;
    const response = await fetch(`/api/orders/${row.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ ...row, status }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || "No se pudo actualizar el estado del pedido.");
    setRows((current) => current.map((item) => item.id === data.id ? data : item));
    setForm((current: any) => ({ ...current, ...data }));
    setEditing((current: any) => current ? { ...current, ...data } : current);
    setError("");
  }
  function getOrderShipment(row: any) {
    return (lookups.shipments || []).find((item: any) => Number(item.order_id) === Number(row.id));
  }
  function getOrderShippingStatus(row: any) {
    const shipment = getOrderShipment(row);
    if (!shipment) return "Sin nota de carga";
    const shipmentStatus = String(shipment.status || "").trim();
    if (["Enviado", "En reparto", "Entregado"].includes(shipmentStatus)) return shipmentStatus;
    if (shipmentStatus === "Preparado" || String(row.status || "") === "Preparado") return "Preparado";
    if (shipmentStatus === "Cancelado" || String(row.status || "") === "Cancelado") return "Cancelado";
    return "Pendiente de enviar";
  }
  function getOrderInvoice(row: any) {
    const invoices = lookups.invoices || [];
    if (row?.invoice_id) return invoices.find((item: any) => Number(item.id) === Number(row.invoice_id)) || null;
    return invoices.find((item: any) => Number(item.order_id) === Number(row?.id)) || null;
  }
  function getOrderBillingStatus(row: any) {
    return String(row?.billing_status || (row?.status === "Facturado" ? "Facturado" : "Sin facturar"));
  }
  function getOrderPaymentStatus(row: any) {
    if (row?.payment_status) return String(row.payment_status);
    if (getOrderBillingStatus(row) !== "Facturado") return "No facturado";
    const invoice = getOrderInvoice(row);
    if (!invoice) return "Pendiente de cobro";
    const paid = (lookups.payments || [])
      .filter((payment: any) => Number(payment.invoice_id) === Number(invoice.id))
      .reduce((total: number, payment: any) => total + Number(payment.amount || 0), 0);
    if (["Cobrada", "Pagada"].includes(String(invoice.status || "")) || paid >= Number(invoice.amount || 0) - 0.01) return "Cobrado";
    return paid > 0 ? "Cobro parcial" : "Pendiente de cobro";
  }
  function openPaymentFromOrder(row: any) {
    const invoice = getOrderInvoice(row);
    if (!invoice) {
      setError("Este pedido figura como facturado, pero no tiene una factura vinculada disponible para registrar el cobro.");
      return;
    }
    const paid = (lookups.payments || [])
      .filter((payment: any) => Number(payment.invoice_id) === Number(invoice.id))
      .reduce((total: number, payment: any) => total + Number(payment.amount || 0), 0);
    const remaining = Math.max(0, Number(invoice.amount || 0) - paid);
    try {
      sessionStorage.setItem("excluvas.pending-payment", JSON.stringify({ invoice_id: invoice.id, amount: remaining.toFixed(2) }));
    } catch { /* La navegación sigue siendo útil aunque el navegador bloquee sessionStorage. */ }
    onNavigate?.("Cobros");
  }
  async function createOrderLoadNote(row: any) {
    if (!row?.id) return;
    const existing = getOrderShipment(row);
    if (existing) return openOrderLoadNote(row);
    if (String(row.status || "") === "Cancelado") {
      setError("Un pedido cancelado no puede pasar a preparación.");
      return;
    }
    const client = (lookups.clients || []).find((item: any) => Number(item.id) === Number(row.client_id));
    const point = (lookups.collection_points || []).find((item: any) => Number(item.id) === Number(row.collection_point_id));
    const deliveryDate = String(row.delivery_date || "").slice(0, 10) || null;
    const response = await fetch("/api/shipments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...actorHeaders },
      body: JSON.stringify({
        code: `ENV-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`,
        order_id: Number(row.id),
        client_id: row.client_id ? Number(row.client_id) : null,
        collection_point_id: row.collection_point_id ? Number(row.collection_point_id) : null,
        status: "Preparando",
        expected_delivery_at: deliveryDate ? `${deliveryDate}T12:00:00.000Z` : null,
        preparation_date: row.preparation_date || deliveryDate,
        address: row.address || point?.address || client?.address || "",
        delivery_city: row.delivery_city || point?.city || client?.city || "",
        delivery_window_start: row.delivery_window_start || point?.opening_time || client?.opening_time || null,
        delivery_window_end: row.delivery_window_end || point?.closing_time || client?.closing_time || null,
        prepared_by: "",
        notes: row.notes || "Nota de carga creada desde el pedido.",
        urgent: Number(row.urgent || 0),
      }),
    });
    const created = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(created.error || "No se pudo crear la nota de carga.");
      return;
    }
    setLookups((current: any) => ({ ...current, shipments: [created, ...(current.shipments || [])] }));
    setRows((current) => current.map((item) => Number(item.id) === Number(row.id) ? { ...item, shipping_status: "Pendiente de enviar" } : item));
    onNavigate?.("Preparación de pedidos");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("crm:previsualizar-preparacion", { detail: created.id })), 120);
  }
  async function openOrderLoadNote(row: any) {
    const shipment = getOrderShipment(row);
    if (shipment) {
      onNavigate?.("Preparación de pedidos");
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("crm:previsualizar-preparacion", { detail: shipment.id })), 120);
      return;
    }
    alert("Este pedido todavía no tiene una nota de carga asociada.");
  }
  async function sendQuoteToClient(row: any) {
    const client = (lookups.clients || []).find((item: any) => Number(item.id) === Number(row?.client_id));
    if (!client?.email) {
      setError("El cliente no tiene un correo electrónico para enviarle el presupuesto.");
      return;
    }
    const allLines = await fetch("/api/quote_lines").then((response) => response.ok ? response.json() : []).catch(() => []);
    const productRows = lookups.products || [];
    const lines = (Array.isArray(allLines) ? allLines : []).filter((line: any) => Number(line.quote_id) === Number(row.id));
    const lineText = lines.map((line: any) => {
      const product = productRows.find((item: any) => Number(item.id) === Number(line.product_id));
      return `- ${product?.name || `Producto #${line.product_id}`}: ${line.quantity_requested || line.quantity} ${quantityUnitLabel(line.quantity_unit)} · ${Number(line.amount || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`;
    }).join("\n");
    const subject = `Presupuesto ${row.code || ""} · Exclusivas Inteligentes`;
    const body = `Hola ${client.contact || client.name || ""},\n\nTe enviamos el presupuesto ${row.code || ""}.\n\n${lineText || "Consulta el detalle del presupuesto adjunto."}\n\nTotal: ${Number(row.amount || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}\nVálido hasta: ${row.valid_until || "según condiciones indicadas"}\n\nUn saludo,\nExclusivas Inteligentes`;
    window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setError("");
  }
  async function convertQuoteToOrder(row: any) {
    if (!row?.id || row.status === "Convertido") return;
    if (!window.confirm(`¿Convertir el presupuesto ${row.code} en un pedido? Se conservará el presupuesto y se creará un pedido nuevo con sus líneas.`)) return;
    const response = await fetch(`/api/quotes/convert-order/${row.id}`, { method: "POST", headers: actorHeaders });
    const created = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(created.error || "No se pudo convertir el presupuesto en pedido.");
      return;
    }
    setRows((current) => current.map((item) => Number(item.id) === Number(row.id) ? { ...item, status: "Convertido", converted_order_id: created.id } : item));
    closeForm(true);
    alert(`Pedido ${created.code} creado correctamente a partir del presupuesto ${row.code}.`);
    onNavigate?.("Pedidos");
  }
  async function openRecordModal(row: any) {
    setInlineEditing(null);
    setInlineDraft({});
    beginForm({ ...row }, row);
    if (active === "Pedidos") {
      const selectedClient = (lookups.clients || []).find((item: any) => Number(item.id) === Number(row.client_id));
      setClientSearch(selectedClient ? `${selectedClient.name}${selectedClient.city ? ` · ${selectedClient.city}` : ""}` : "");
    }
    setFormOpen(true);
    if (!["Presupuestos", "Pedidos"].includes(active)) return;
    const lineApi = active === "Pedidos" ? "order_lines" : "quote_lines";
    const response = await fetch(`/api/${lineApi}`);
    const allLines = response.ok ? await response.json().catch(() => []) : [];
    const parentKey = active === "Pedidos" ? "order_id" : "quote_id";
    const lines = Array.isArray(allLines) ? allLines.filter((line: any) => Number(line[parentKey]) === Number(row.id)) : [];
    const productList = lookups.products || [];
    const mappedLines = (Array.isArray(lines) ? lines : []).map((line: any) => ({
      ...line,
      product_name: line.product_name || productList.find((product: any) => Number(product.id) === Number(line.product_id))?.name || `Producto #${line.product_id}`,
    }));
    quoteLinesInitialSnapshot.current = JSON.stringify(mappedLines);
    setQuoteLines(mappedLines);
    setFormDirty(false);
  }
  async function openEntryDetail(row: any) {
    const receiptId = Number(row?.id);
    if (!Number.isInteger(receiptId) || receiptId <= 0 || !String(row?.code || "").trim()) {
      return setError("Esta fila no contiene una entrada válida. Actualiza el listado e inténtalo de nuevo.");
    }
    const response = await fetch(`/api/goods_receipts/detail/${receiptId}`, { headers: actorHeaders });
    const detail = await response.json().catch(() => ({}));
    if (!response.ok) return setError(detail.error || "No se pudo cargar el detalle de la entrada");
    setError("");
    setEntryLocationDrafts(Object.fromEntries((detail.lines || []).map((line: any) => [String(line.id), line.location_verified_code || ""])));
    setEntryLocationReasons(Object.fromEntries((detail.lines || []).map((line: any) => [String(line.id), line.location_verified_reason || ""])));
    setEntryDetail(detail);
  }
  async function validateEntryLocation(line: any, mode: "scan" | "manual" = "scan") {
    if (!line?.id || entryLocationSaving) return;
    const lineId = Number(line.id);
    const scannedCode = String(entryLocationDrafts[String(lineId)] || "").trim();
    const reason = String(entryLocationReasons[String(lineId)] || "").trim();
    if (mode === "scan" && !scannedCode) return alert("Lee o escribe el código de la ubicación antes de validarlo.");
    if (mode === "manual" && !reason) return alert("Indica brevemente por qué se valida manualmente.");
    setEntryLocationSaving(lineId);
    try {
      const response = await fetch(`/api/goods_receipt_lines/${lineId}/location`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ mode, scanned_code: scannedCode, reason }) });
      const updated = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(updated.error || "No se pudo validar la ubicación.");
      setEntryDetail((current: any) => current ? { ...current, lines: (current.lines || []).map((item: any) => item.id === lineId ? { ...item, ...updated } : item) } : current);
    } catch (caught: any) {
      alert(caught?.message || "No se pudo validar la ubicación.");
    } finally {
      setEntryLocationSaving(null);
    }
  }
  async function resolveEntryIncident(incident: any, status: string) {
    if (!incident?.id || entryIncidentSaving) return;
    setEntryIncidentSaving(Number(incident.id));
    try {
      const now = new Date().toISOString();
      const response = await fetch(`/api/goods_receipt_incidents/${incident.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ status, resolution: status === "Resuelta" ? "Incidencia revisada y cerrada" : incident.resolution || "", resolved_by: status === "Resuelta" ? (user?.username || "Usuario local") : null, resolved_at: status === "Resuelta" ? now : null }) });
      const updated = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(updated.error || "No se pudo actualizar la incidencia.");
      setEntryDetail((current: any) => current ? { ...current, incidents: (current.incidents || []).map((item: any) => item.id === incident.id ? { ...item, ...updated } : item) } : current);
    } catch (caught: any) {
      alert(caught?.message || "No se pudo actualizar la incidencia.");
    } finally {
      setEntryIncidentSaving(null);
    }
  }
  async function validateEntry(status: string) {
    if (!entryDetail?.id || entryValidationSaving) return;
    setEntryValidationSaving(true);
    try {
      const now = new Date().toISOString();
      const response = await fetch(`/api/goods_receipts/${entryDetail.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ validation_status: status, validated_by: status === "Validada" ? (user?.username || "Usuario local") : null, validated_at: status === "Validada" ? now : null }) });
      const updated = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(updated.error || "No se pudo actualizar la validación.");
      setEntryDetail((current: any) => current ? { ...current, ...updated } : current);
      setRows((current) => current.map((row) => Number(row.id) === Number(entryDetail.id) ? { ...row, ...updated } : row));
    } catch (caught: any) {
      alert(caught?.message || "No se pudo actualizar la validación.");
    } finally {
      setEntryValidationSaving(false);
    }
  }
  async function claimEntryIncident(incident: any) {
    if (!incident?.id || incident.claim_status === "Preparada") return;
    if (!window.confirm("¿Crear una reclamación interna para este proveedor? Se añadirá una nota de alta prioridad vinculada a la entrada.")) return;
    setEntryIncidentSaving(Number(incident.id));
    try {
      const response = await fetch(`/api/goods_receipt_incidents/${incident.id}/claim`, { method: "POST", headers: actorHeaders, body: JSON.stringify({}) });
      const updated = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(updated.error || "No se pudo crear la reclamación.");
      setEntryDetail((current: any) => current ? { ...current, incidents: (current.incidents || []).map((item: any) => item.id === incident.id ? { ...item, ...updated } : item) } : current);
    } catch (caught: any) {
      alert(caught?.message || "No se pudo crear la reclamación.");
    } finally {
      setEntryIncidentSaving(null);
    }
  }
  function editorValue(field: string, value: any) {
    const raw = String(value ?? "");
    if (field.endsWith("_date") || ["date", "issue_date", "order_date"].includes(field)) {
      return raw.slice(0, 10);
    }
    if (field.endsWith("_at") || field.includes("time")) {
      return raw.replace(" ", "T").slice(0, 16);
    }
    return value ?? "";
  }
  function renderInlineEditor(field: string, row: any) {
    const value = inlineDraft[field] ?? row[field] ?? "";
    const update = (next: any) => setInlineDraft({ ...inlineDraft, [field]: next });
    const common = { className: "inline-cell-input", value: editorValue(field, value), onChange: (event: any) => update(event.target.value) };
    const statusOptions = active === "Facturas"
      ? ["Proforma", "Pendiente", "Parcial", "Cobrada", "Vencida", "Anulada"]
      : active === "Pedidos"
      ? ["Nuevo", "Pendiente", "Confirmado", "Bloqueado", "Pospuesto", "Preparando", "Preparado", "Enviado", "En reparto", "Entregado", "Cancelado", "Facturado"]
      : active === "Preparación de pedidos"
        ? ["Preparando", "Preparado"]
        : active === "Documentos"
          ? ["Activa", "Borrador", "Archivada"]
        : ["Pendiente", "Activo", "Borrador", "Confirmado", "Cobrada", "Anulada", "Recibida", "Cancelada"];
    if (field === "status") {
      return <select {...common}>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select>;
    }
    if (field === "movement_type") {
      return <select {...common}>{["Entrada", "Salida", "Ajuste positivo", "Ajuste negativo", "Devolución"].map((option) => <option key={option}>{option}</option>)}</select>;
    }
    if (field === "product_status") return <select {...common}>{["Activo", "Inactivo", "Descatalogado", "Estacional"].map((option) => <option key={option}>{option}</option>)}</select>;
    if (["fixed_supplier", "lot_tracking", "expiry_tracking", "returnable_packaging"].includes(field)) return <select {...common}><option value="0">No</option><option value="1">Sí</option></select>;
    const lookup = field === "client_id" ? lookups.clients : field === "product_id" ? lookups.products : field === "warehouse_id" ? lookups.warehouses : ["supplier_id", "primary_supplier_id"].includes(field) ? lookups.suppliers : field === "collection_point_id" ? lookups.collection_points : field === "order_id" ? lookups.orders : field === "shipment_id" ? lookups.shipments : null;
    if (lookup) {
      return <select {...common}><option value="">Seleccionar...</option>{lookup.map((item: any) => <option key={item.id} value={item.id}>{item.name || item.code || `Registro ${item.id}`}{item.city ? ` · ${item.city}` : ""}</option>)}</select>;
    }
    if (field === "payment_method") return <select {...common}>{["Tarjeta", "Transferencia", "Efectivo", "Domiciliación"].map((option) => <option key={option}>{option}</option>)}</select>;
    if (field === "quantity_unit" || field === "unit") return <select {...common}>{["unidad", "caja", "palé"].map((option) => <option key={option}>{option}</option>)}</select>;
    if (field === "category" && active === "Gastos y tickets") return <select {...common}>{["Combustible", "Gastos de representación", "Comida", "Aparcamiento", "Material", "Otros"].map((option) => <option key={option}>{option}</option>)}</select>;
    if (field === "type" && active === "Documentos") return <select {...common}>{["Presupuesto", "Correo", "Albarán", "Factura", "Hoja de carga", "Contrato", "Alta de cliente", "Condiciones", "General"].map((option) => <option key={option}>{option}</option>)}</select>;
    if (field === "format" && active === "Documentos") return <select {...common}>{["HTML", "Texto plano", "PDF", "Word", "Correo electrónico"].map((option) => <option key={option}>{option}</option>)}</select>;
    if (["content", "description", "notes"].includes(field)) return <textarea className="inline-cell-input inline-cell-textarea" value={value} onChange={(event) => update(event.target.value)} />;
    if (field.endsWith("_date") || ["date", "issue_date", "order_date"].includes(field)) return <input {...common} type="date" />;
    if (timeFields.has(field)) return <input {...common} type="time" />;
    if (field.endsWith("_at") || field.includes("time")) return <input {...common} type="datetime-local" />;
    if (["quantity", "amount", "unit_price", "box_price", "pack4_price", "pack6_price", "pallet_price", "stock", "stock_reserved", "min_stock", "stock_min", "stock_target", "stock_safety", "units_per_case", "cases_per_pallet", "units_per_pallet", "weight_kg", "volume_m3", "picking_order", "target_margin_percent", "min_margin_percent", "freight_cost", "handling_cost", "real_cost", "tax_surcharge_percent", "extra_tax_percent", "packages", "vat", "discount"].includes(field)) return <input {...common} type="number" step="any" />;
    return <input {...common} />;
  }
  useEffect(() => {
    if (active !== "Pedidos") return;
    function editRequested(event: Event) {
      const id = Number((event as CustomEvent<number>).detail);
      const row = rows.find((item) => Number(item.id) === id);
      if (row) {
        beginInline(row);
      } else if (id) {
        fetch(`/api/orders/${id}`)
          .then((response) => (response.ok ? response.json() : null))
          .then((body) => {
            const item = Array.isArray(body)
              ? body.find((entry: any) => Number(entry.id) === id)
              : body?.data || body;
            if (item) beginInline(item);
          })
          .catch(() => undefined);
      }
    }
    window.addEventListener("crm:editar-pedido", editRequested);
    return () => window.removeEventListener("crm:editar-pedido", editRequested);
  }, [active, rows]);
  useEffect(() => {
    if (active !== "Preparación de pedidos") return;
    function preparationPreviewRequested(event: Event) {
      const id = Number((event as CustomEvent<number>).detail);
      const row = rows.find((item) => Number(item.id) === id);
      if (row) void openPreview(row);
      else if (id) fetch(`/api/shipments/${id}`).then((response) => response.ok ? response.json() : null).then((item) => item && void openPreview(item)).catch(() => undefined);
    }
    window.addEventListener("crm:previsualizar-preparacion", preparationPreviewRequested);
    return () => window.removeEventListener("crm:previsualizar-preparacion", preparationPreviewRequested);
  }, [active, rows]);
  useEffect(() => {
    if (active !== "Notas") return;
    function noteEditRequested(event: Event) {
      const id = Number((event as CustomEvent<number>).detail);
      const open = (item: any) => { if (!item) return; setForm({ ...item }); setEditing(item); setFormOpen(true); };
      const row = rows.find((item) => Number(item.id) === id);
      if (row) open(row);
      else if (id) fetch(`/api/notes/${id}`).then((response) => response.ok ? response.json() : null).then((body) => open(Array.isArray(body) ? body.find((item: any) => Number(item.id) === id) : body?.data || body)).catch(() => undefined);
    }
    window.addEventListener("crm:editar-nota", noteEditRequested);
    return () => window.removeEventListener("crm:editar-nota", noteEditRequested);
  }, [active, rows]);
  useEffect(() => {
    function notePreviewRequested(event: Event) {
      const id = Number((event as CustomEvent<number>).detail);
      if (!id) return;
      const row = rows.find((item) => Number(item.id) === id);
      if (row) {
        setNotePreview(row);
        return;
      }
      fetch(`/api/notes/${id}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => { const item = Array.isArray(body) ? body.find((entry: any) => Number(entry.id) === id) : body?.data || body; if (item) setNotePreview(item); })
        .catch(() => undefined);
    }
    window.addEventListener("crm:previsualizar-nota", notePreviewRequested);
    return () => window.removeEventListener("crm:previsualizar-nota", notePreviewRequested);
  }, [rows]);
  useEffect(() => {
    setNoteIncidentOrder(null);
    const orderId = Number(notePreview?.record_id || 0);
    if (!orderId || String(notePreview?.module || "") !== "Preparación de pedidos") return;
    let cancelled = false;
    setNoteIncidentOrderLoading(true);
    Promise.all([
      fetch("/api/orders").then((response) => response.ok ? response.json() : []),
      fetch("/api/clients").then((response) => response.ok ? response.json() : []),
      fetch("/api/collection_points").then((response) => response.ok ? response.json() : []),
    ]).then(([orders, clients, points]) => {
      if (cancelled) return;
      const order = (Array.isArray(orders) ? orders : []).find((item: any) => Number(item.id) === orderId);
      if (!order) return;
      const client = (Array.isArray(clients) ? clients : []).find((item: any) => Number(item.id) === Number(order.client_id));
      const point = (Array.isArray(points) ? points : []).find((item: any) => Number(item.id) === Number(order.collection_point_id));
      setNoteIncidentOrder({
        order,
        client,
        address: point?.address || order.address || client?.address || "Dirección no indicada",
      });
    }).catch(() => undefined).finally(() => {
      if (!cancelled) setNoteIncidentOrderLoading(false);
    });
    return () => { cancelled = true; };
  }, [notePreview]);
  useEffect(() => {
    // Una tarjeta del inicio puede pedir la vista previa mientras la sección
    // de notas todavía está montándose. Conservamos el id hasta que el gestor
    // pueda resolverlo, evitando que el clic se pierda en ese cambio de vista.
    let pendingId = 0;
    try {
      pendingId = Number(sessionStorage.getItem("excluvas.pending-note-preview") || 0);
      if (pendingId) sessionStorage.removeItem("excluvas.pending-note-preview");
    } catch {}
    if (!pendingId) return;
    const row = rows.find((item) => Number(item.id) === pendingId);
    if (row) {
      setNotePreview(row);
      return;
    }
    fetch(`/api/notes/${pendingId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { const item = Array.isArray(body) ? body.find((entry: any) => Number(entry.id) === pendingId) : body?.data || body; if (item) setNotePreview(item); })
      .catch(() => undefined);
  }, [rows]);
  useEffect(() => {
    if (active !== "Pedidos") return;
    function previewRequested(event: Event) {
      const detail = (event as CustomEvent<any>).detail;
      const id = Number(typeof detail === "object" ? detail?.id : detail);
      const hint = typeof detail === "object" ? detail : {};
      const row = rows.find((item) => Number(item.id) === id);
      if (row) void openPreview(row);
      else if (id) {
        setPreview({ id, code: hint.code || `Pedido #${id}`, client_name: hint.clientName || "", status: "Cargando…" });
        setPreviewLoading(true);
        fetch(`/api/orders/${id}`)
          .then((response) => (response.ok ? response.json() : null))
          .then((body) => {
            const item = Array.isArray(body)
              ? body.find((entry: any) => Number(entry.id) === id)
              : body?.data || body;
            if (item) void openPreview(item);
            else setPreviewLoading(false);
          })
          .catch(() => setPreviewLoading(false));
      }
    }
    window.addEventListener("crm:previsualizar-pedido", previewRequested);
    let pendingDetail: any = null;
    try {
      const rawPending = sessionStorage.getItem("excluvas.pending-order-preview") || "";
      if (rawPending) {
        try { pendingDetail = JSON.parse(rawPending); } catch { pendingDetail = { id: Number(rawPending) }; }
        sessionStorage.removeItem("excluvas.pending-order-preview");
      }
    } catch {}
    if (pendingDetail?.id) {
      window.setTimeout(() => previewRequested(new CustomEvent("crm:previsualizar-pedido", { detail: pendingDetail })), 0);
    }
    return () => window.removeEventListener("crm:previsualizar-pedido", previewRequested);
  }, [active, rows]);
  useEffect(() => {
    if (active !== "Clientes") return;
    function newClientRequested() {
      beginForm({});
      setFormOpen(true);
    }
    window.addEventListener("crm:nuevo-cliente", newClientRequested);
    return () => window.removeEventListener("crm:nuevo-cliente", newClientRequested);
  }, [active]);
  useEffect(() => {
    if (active !== "Pedidos") return;
    function newOrderRequested() {
      setQuoteLines([]);
      setQuoteProductSearch("");
       beginForm({ code: nextOrderCode(), status: "Nuevo", created_by: user?.username || "Usuario local", quantity: 1 });
      setFormOpen(true);
    }
    window.addEventListener("crm:nuevo-pedido", newOrderRequested);
    return () => window.removeEventListener("crm:nuevo-pedido", newOrderRequested);
  }, [active]);
  useEffect(() => {
    if (!formOpen && !editing) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const modal = formAccordionRef.current;
      const target = event.target as Element | null;
      if (target?.closest('[aria-label="Confirmar producto"]')) return;
      if (modal && !modal.contains(event.target as Node)) {
        closeForm();
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [formOpen, editing]);
  useEffect(() => {
    const modalOpen = Boolean(formOpen || editing);
    document.body.classList.toggle("modal-open", modalOpen);
    return () => document.body.classList.remove("modal-open");
  }, [formOpen, editing]);
  async function saveInline(row: any) {
    const rowKey = row.id ?? row.product_id;
    const r = await fetch(`/api/${c.api}/${rowKey}`, {
      method: "PUT",
      headers: actorHeaders,
      body: JSON.stringify(inlineDraft),
    });
    const d = await r.json();
    if (!r.ok) return alert(d.error || "No se pudo guardar la línea");
    setRows((current) => current.map((x) => ((x.id ?? x.product_id) === rowKey ? { ...x, ...d } : x)));
    setInlineEditing(null);
    setInlineDraft({});
  }
  async function changeOrderStatus(row: any, status: string) {
    const r = await fetch(`/api/orders/${row.id}`, {
      method: "PUT",
      headers: actorHeaders,
      body: JSON.stringify({ ...row, status }),
    });
    const d = await r.json();
    if (!r.ok) return alert(d.error || "No se pudo actualizar el pedido");
    setRows((current) => current.map((x) => (x.id === d.id ? d : x)));
    if (active === "Pedidos" && status === "Preparado") {
      const createLoadNote = window.confirm(
        "El pedido está preparado. ¿Quieres crear ahora la nota de carga para el almacén?",
      );
      if (createLoadNote) {
        const notes = window.prompt(
          "Notas adicionales para el almacén y el reparto:",
          "",
        ) || "";
        const client = lookups.clients.find(
          (item: any) => Number(item.id) === Number(row.client_id),
        );
        const shipmentResponse = await fetch("/api/shipments", {
          method: "POST",
          headers: actorHeaders,
          body: JSON.stringify({
            code: `PREP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
            order_id: row.id,
            client_id: row.client_id,
            status: "Preparando",
            address: client?.address || "",
            expected_delivery_at: row.delivery_date || null,
            packages: 1,
            notes,
            prepared_by: user?.username || "Usuario local",
          }),
        });
        const shipment = await shipmentResponse.json();
        if (!shipmentResponse.ok) {
          alert(shipment.error || "El pedido se preparó, pero no se pudo crear la nota de carga");
        } else {
          alert(`Nota de carga ${shipment.code} creada para el almacén`);
        }
      }
    }
  }
  async function convertOrder(row: any, type: "invoice" | "delivery") {
    const r = await fetch(
      `/api/orders/convert-${type}/${row.id}`,
      { method: "POST" },
    );
    const d = await r.json();
    if (!r.ok) return alert(d.error || "No se pudo generar el documento");
    alert(
      `${type === "invoice" ? "Factura" : "Albarán"} ${d.code} creado correctamente`,
    );
    setRows((current) =>
      current.map((x) =>
        x.id === row.id
          ? { ...x, status: type === "invoice" ? "Facturado" : "Preparado" }
          : x,
      ),
    );
  }
  async function convertDeliveryToInvoice(row: any) {
    const r = await fetch(
      `/api/delivery_notes/convert-invoice/${row.id}`,
      { method: "POST", headers: actorHeaders },
    );
    const d = await r.json();
    if (!r.ok) return alert(d.error || "No se pudo generar la factura");
    alert(`Factura ${d.code} creada correctamente desde el albarán`);
  }
  async function convertProformaToInvoice(row: any) {
    const code = String(row.code || "").replace(/^PRO-/, "FAC-") || `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const response = await fetch(`/api/invoices/${row.id}`, {
      method: "PUT",
      headers: actorHeaders,
      body: JSON.stringify({ ...row, code, status: "Pendiente" }),
    });
    const updated = await response.json().catch(() => ({}));
    if (!response.ok) return alert(updated.error || "No se pudo convertir la proforma");
    setRows((current) => current.map((item) => item.id === row.id ? updated : item));
    alert(`Factura ${updated.code} creada a partir de la proforma`);
  }
  async function prepareInvoicePdf(row: any, force = false) {
    const response = await fetch(`/api/invoices/${row.id}/pdf`, { method: "POST", headers: actorHeaders, body: JSON.stringify({ force }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { alert(data.error || "No se pudo generar el PDF de la factura"); return null; }
    setRows((current) => current.map((item) => Number(item.id) === Number(data.id) ? { ...item, ...data } : item));
    setPreview((current: any) => current && Number(current.id) === Number(data.id) ? { ...current, ...data } : current);
    return data;
  }
  async function openInvoicePdf(row: any) {
    const data = await prepareInvoicePdf(row);
    if (!data) return;
    window.open(data.share_url || `/api/invoices/share/${encodeURIComponent(data.share_token)}`, "_blank", "noopener,noreferrer");
  }
  async function copyInvoiceLink(row: any) {
    const data = await prepareInvoicePdf(row);
    if (!data) return;
    const link = data.share_url || `${window.location.origin}/api/invoices/share/${encodeURIComponent(data.share_token)}`;
    try { await navigator.clipboard.writeText(link); alert("Enlace seguro de la factura copiado."); } catch { window.prompt("Copia este enlace seguro de factura:", link); }
  }
  async function prepareCommercialDocumentPdf(row: any, type: "order" | "quote", force = false) {
    const label = type === "order" ? "pedido" : "presupuesto";
    const response = await fetch(`/api/documents/${type}/${row.id}/pdf`, { method: "POST", headers: actorHeaders, body: JSON.stringify({ force }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { alert(data.error || `No se pudo generar el PDF del ${label}`); return null; }
    setRows((current) => current.map((item) => Number(item.id) === Number(data.id) ? { ...item, ...data } : item));
    setPreview((current: any) => current && Number(current.id) === Number(data.id) ? { ...current, ...data } : current);
    return data;
  }
  async function openCommercialDocumentPdf(row: any, type: "order" | "quote") {
    const data = await prepareCommercialDocumentPdf(row, type);
    if (!data) return;
    window.open(data.share_url || `/api/documents/${type}/share/${encodeURIComponent(data.share_token)}`, "_blank", "noopener,noreferrer");
  }
  async function copyCommercialDocumentLink(row: any, type: "order" | "quote") {
    const label = type === "order" ? "pedido" : "presupuesto";
    const data = await prepareCommercialDocumentPdf(row, type);
    if (!data) return;
    const link = data.share_url || `${window.location.origin}/api/documents/${type}/share/${encodeURIComponent(data.share_token)}`;
    try { await navigator.clipboard.writeText(link); alert(`Enlace seguro del ${label} copiado.`); } catch { window.prompt(`Copia este enlace seguro de ${label}:`, link); }
  }
  async function sendInvoiceEmail(row: any) {
    const response = await fetch(`/api/invoices/${row.id}/email`, { method: "POST", headers: actorHeaders, body: JSON.stringify({}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return alert(data.error || "No se pudo preparar el email de la factura");
    if (data.mode === "mailto") {
      window.location.href = `mailto:${encodeURIComponent(data.to)}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(data.body)}`;
      alert("Se ha preparado el correo con la factura y su enlace seguro. Revisa el destinatario y pulsa Enviar.");
    } else alert(`Factura enviada por email a ${data.to}.`);
  }
  function downloadAttachment(row: any) {
    if (!row.attachment_data) return;
    const link = document.createElement("a");
    link.href = row.attachment_data;
    link.download =
      row.attachment_name || "justificante-" + (row.code || row.id);
    link.target = "_blank";
    link.click();
  }
  function download() {
    const head = ["id", ...visibleFields];
    const esc = (v: any) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv =
      "\ufeff" +
      head.join(";") +
      "\n" +
      rows.map((r) => head.map((k) => esc(k === "shipping_status" ? getOrderShippingStatus(r) : r[k])).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    a.download = `${c.api}-excluvas.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function downloadTemplate() {
    const head = ["id", ...c.fields];
    const esc = (v: any) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv =
      "\ufeff" +
      head.join(";") +
      "\n" +
      esc("") +
      ";" +
      c.fields.map(() => esc("")).join(";") +
      "\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    a.download = `plantilla-${c.api}-exclusivas.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function importCsv(file: File) {
    const text = await file.text();
    const lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter(Boolean);
    if (lines.length < 2) return alert("El archivo no contiene registros");
    const headers = lines[0].split(";").map((x) => x.replace(/^"|"$/g, ""));
    let imported = 0;
    for (const line of lines.slice(1)) {
      const values = line
        .split(";")
        .map((x) => x.replace(/^"|"$/g, "").replaceAll('""', '"'));
      const payload: any = {};
      headers.forEach((h, i) => {
        if (h !== "id" && values[i] !== undefined) payload[h] = values[i];
      });
      if (!Object.keys(payload).length) continue;
      const method = payload.id ? "PUT" : "POST";
      const endpoint = payload.id
        ? `/api/${c.api}/${payload.id}`
        : "/api/" + c.api;
      delete payload.id;
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) imported++;
    }
    const refreshed = await fetch("/api/" + c.api).then(
      (r) => r.json(),
    );
    setRows(Array.isArray(refreshed) ? refreshed : []);
    alert(`${imported} registros importados correctamente`);
  }
  async function openPreview(row: any) {
    setShipmentLabelOpen(false);
    setPreview(row);
    if (active === "Preparación de pedidos") {
      setPreparationAnnotation("");
      setPreparationAnnotationMessage("");
      setPreparationAnnotationError("");
      setPreparationScanMessage(null);
      setPreparationValidationMessage("");
      const rowLocation = (lookups.collection_points || []).find((item: any) => Number(item.id) === Number(row.collection_point_id));
      const rowClient = (lookups.clients || []).find((item: any) => Number(item.id) === Number(row.client_id));
      setPreparationAddressDraft(String(row.address || rowLocation?.address || rowClient?.address || ""));
      setPreparationCityDraft(String(row.delivery_city || rowLocation?.city || rowClient?.city || ""));
      setPreparationOpeningTimeDraft(String(row.delivery_window_start || rowLocation?.opening_time || rowClient?.opening_time || "").slice(0, 5));
      setPreparationClosingTimeDraft(String(row.delivery_window_end || rowLocation?.closing_time || rowClient?.closing_time || "").slice(0, 5));
      setPreparationAddressMessage("");
      setPreparationAddressError("");
      setPreparationUpdateClient(false);
    }
    setPreviewLoading(true);
    setPreviewClient(null);
    setPreviewInvoice(null);
    setPreviewSupplier(null);
    setPreviewLines([]);
    if (active === "Pedidos") setPreviewInvoice(getOrderInvoice(row));
    if (active === "Cobros") {
      const [invoices, clients] = await Promise.all([
        fetch("/api/invoices").then((r) => r.json()),
        fetch("/api/clients").then((r) => r.json()),
      ]);
      const invoice = (Array.isArray(invoices) ? invoices : []).find(
        (item: any) => Number(item.id) === Number(row.invoice_id),
      ) || null;
      setPreviewInvoice(invoice);
      setPreviewClient(
        (Array.isArray(clients) ? clients : []).find(
          (item: any) => Number(item.id) === Number(invoice?.client_id || row.client_id),
        ) || null,
      );
      setPreviewLoading(false);
      return;
    }
    const lineTable =
      active === "Facturas"
        ? "invoice_lines"
        : active === "Albaranes"
          ? "delivery_note_lines"
          : active === "Compras"
            ? "purchase_order_lines"
            : active === "Presupuestos"
              ? "quote_lines"
          : "order_lines";
    const lineOwnerId = ["Preparación de pedidos", "Envíos"].includes(active) ? row.order_id : row.id;
    const [clients, lines, products, sourceOrderLines] = await Promise.all([
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/" + lineTable).then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
      active === "Albaranes" && row.order_id
        ? fetch("/api/order_lines").then((r) => r.json())
        : Promise.resolve([]),
    ]);
    setPreviewClient(
      clients.find((x: any) => Number(x.id) === Number(row.client_id)) || null,
    );
    if (active === "Compras") {
      const suppliers = await fetch("/api/suppliers").then((r) => r.json());
      setPreviewSupplier(
        (Array.isArray(suppliers) ? suppliers : []).find(
          (x: any) => Number(x.id) === Number(row.supplier_id),
        ) || null,
      );
    }
    const ownLines = (Array.isArray(lines) ? lines : []).filter(
        (x: any) =>
          Number(x.invoice_id || x.delivery_note_id || x.order_id || x.purchase_order_id || x.quote_id) ===
          Number(lineOwnerId),
      );
    const fallbackOrderLines = active === "Albaranes" && ownLines.length < 2
      ? (Array.isArray(sourceOrderLines) ? sourceOrderLines : []).filter((x: any) => Number(x.order_id) === Number(row.order_id))
      : [];
    const selectedLines = fallbackOrderLines.length > ownLines.length ? fallbackOrderLines : ownLines;
    const productRows = Array.isArray(products) ? products : [];
    const preparedLines = selectedLines.map((line: any) => ({
      ...line,
      prepared_quantity: line.preparation_status === "Incidencia"
        ? Number(line.prepared_quantity || 0)
        : Number(line.prepared_quantity || 0) > 0
          ? Number(line.prepared_quantity)
          : Number(line.quantity || 0),
    }));
    setPreviewLines([...preparedLines].sort((a: any, b: any) => {
      const pa = productRows.find((product: any) => Number(product.id) === Number(a.product_id));
      const pb = productRows.find((product: any) => Number(product.id) === Number(b.product_id));
      return String(pa?.warehouse_location || "ZZZ").localeCompare(String(pb?.warehouse_location || "ZZZ"), "es", { numeric: true }) || Number(pa?.picking_order || 0) - Number(pb?.picking_order || 0);
    }));
    setProductOptions(productRows);
    setLocationDrafts(Object.fromEntries(productRows.map((product: any) => [String(product.id), String(product.warehouse_location || "")] )));
    setPreviewLoading(false);
  }
  async function loadBillingOrders() {
    setBillingLoading(true); setBillingError("");
    try {
      const query = new URLSearchParams();
      if (billingFrom) query.set("from", billingFrom);
      if (billingTo) query.set("to", billingTo);
      if (billingClient) query.set("client_id", billingClient);
      const response = await fetch(`/api/billing?${query.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los pedidos");
      setBillingRows(Array.isArray(data) ? data : []);
      setBillingSelected([]);
    } catch (error: any) { setBillingError(error.message || "No se pudieron cargar los pedidos"); }
    finally { setBillingLoading(false); }
  }
  async function createGroupedInvoice() {
    if (!billingSelected.length) return;
    setBillingSaving(true); setBillingError("");
    try {
      const response = await fetch("/api/billing", { method: "POST", headers: actorHeaders, body: JSON.stringify({ order_ids: billingSelected }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo crear la factura");
      setBillingOpen(false); setBillingSelected([]); fetch("/api/orders").then((response) => response.json()).then((items) => setRows(Array.isArray(items) ? items : [])).catch(() => undefined);
    } catch (error: any) { setBillingError(error.message || "No se pudo crear la factura"); }
    finally { setBillingSaving(false); }
  }
  async function updatePreparationLine(line: any, changes: any) {
    const next = { ...line, ...changes };
    setPreviewLines((current) => current.map((item) => item.id === line.id ? next : item));
    const updatedLines = previewLines.map((item) => item.id === line.id ? next : item);
    const hasIncident = updatedLines.some((item) => item.preparation_status === "Incidencia");
    const allDone = updatedLines.length > 0 && updatedLines.every((item) => item.preparation_status === "Preparado");
    const nextShipmentStatus = hasIncident ? "Preparado con incidencia" : allDone ? "Preparado" : "Preparando";
    setPreview((current: any) => current ? { ...current, status: nextShipmentStatus } : current);
    setRows((current) => current.map((item) => item.id === preview?.id ? { ...item, status: nextShipmentStatus } : item));
    try {
      const response = await fetch(`/api/order_lines/${line.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify(next) });
      if (!response.ok) throw new Error("No se pudo actualizar la línea de preparación.");
      if (preview?.id && active === "Preparación de pedidos") {
        const shipmentResponse = await fetch(`/api/shipments/${preview.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ ...preview, status: nextShipmentStatus, prepared_by: user?.username || "Usuario local" }) });
        if (!shipmentResponse.ok) throw new Error("No se pudo actualizar el estado de la preparación.");
      }
      return true;
    } catch {
      setError("No se pudo sincronizar la última modificación de la preparación. Revisa la conexión y vuelve a intentarlo.");
      return false;
    }
  }
  async function updatePreparationLocation(product: any, value: string) {
    if (!product?.id) return;
    const nextLocation = String(value || "").trim().toUpperCase();
    if (!/^[A-Z]-([1-9]|[1-9]\d|[1-9]\d\d|200)$/.test(nextLocation)) {
      setError("La ubicación debe tener el formato letra-número, por ejemplo B-126.");
      return;
    }
    setLocationSavingId(Number(product.id));
    setError("");
    const response = await fetch(`/api/products/${product.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ warehouse_location: nextLocation }) });
    if (!response.ok) {
      setError("No se pudo guardar la ubicación del producto.");
    } else {
      const updated = await response.json().catch(() => ({}));
      setProductOptions((current) => current.map((item) => Number(item.id) === Number(product.id) ? { ...item, warehouse_location: updated.warehouse_location || nextLocation } : item));
    }
    setLocationSavingId(null);
  }
  async function savePreparationLocations() {
    const changedProducts = productOptions.filter((product) => String(locationDrafts[String(product.id)] || "").trim().toUpperCase() !== String(product.warehouse_location || "").trim().toUpperCase());
    if (!changedProducts.length) return;
    const invalid = changedProducts.find((product) => !/^[A-Z]-([1-9]|[1-9]\d|[1-9]\d\d|200)$/.test(String(locationDrafts[String(product.id)] || "").trim().toUpperCase()));
    if (invalid) return setError(`La ubicación de ${invalid.name || "un producto"} debe tener el formato letra-número, por ejemplo B-126.`);
    setLocationSavingId(-1);
    setError("");
    const results = await Promise.all(changedProducts.map(async (product) => {
      const value = String(locationDrafts[String(product.id)] || "").trim().toUpperCase();
      const response = await fetch(`/api/products/${product.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ warehouse_location: value }) });
      return { product, value, response };
    }));
    const failed = results.find((result) => !result.response.ok);
    if (failed) setError("No se pudieron guardar todas las ubicaciones. Revisa la conexión e inténtalo de nuevo.");
    else setProductOptions((current) => current.map((product) => { const saved = results.find((result) => Number(result.product.id) === Number(product.id)); return saved ? { ...product, warehouse_location: saved.value } : product; }));
    setLocationSavingId(null);
  }
  async function savePreparationDeliveryAddress() {
    if (!preview?.id || !isLoadPreparation) return;
    const address = preparationAddressDraft.trim();
    const city = preparationCityDraft.trim();
    const openingTime = preparationOpeningTimeDraft.trim();
    const closingTime = preparationClosingTimeDraft.trim();
    if (!address) {
      setPreparationAddressError("La dirección de entrega es obligatoria.");
      setPreparationAddressMessage("");
      return;
    }
    if ((openingTime && !closingTime) || (!openingTime && closingTime) || (openingTime && closingTime && openingTime >= closingTime)) {
      setPreparationAddressError("Indica una franja válida: la apertura debe ser anterior al cierre.");
      setPreparationAddressMessage("");
      return;
    }
    setPreparationAddressSaving(true);
    setPreparationAddressError("");
    setPreparationAddressMessage("");
    try {
      const geo = await geocodeAddress(address, city);
      const response = await fetch(`/api/shipments/${preview.id}`, {
        method: "PUT",
        headers: actorHeaders,
        body: JSON.stringify({ address, delivery_city: city, delivery_window_start: openingTime || null, delivery_window_end: closingTime || null, ...geo, update_client_address: preparationUpdateClient ? 1 : 0 }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la dirección de entrega.");
      setPreview((current: any) => current ? { ...current, address, delivery_city: city, delivery_window_start: openingTime || null, delivery_window_end: closingTime || null } : current);
      setRows((current) => current.map((item) => item.id === preview.id ? { ...item, address, delivery_city: city, delivery_window_start: openingTime || null, delivery_window_end: closingTime || null } : item));
      if (preview.collection_point_id) {
        setLookups((current: any) => ({
          ...current,
          collection_points: (current.collection_points || []).map((point: any) => Number(point.id) === Number(preview.collection_point_id) ? { ...point, address, city } : point),
        }));
      }
      if (preparationUpdateClient) {
        setPreviewClient((current: any) => current ? { ...current, address, city } : current);
      }
      setPreparationAddressMessage(preparationUpdateClient
        ? "Dirección y horario guardados en el pedido, la nota de carga y la ficha del cliente."
        : "Dirección y horario guardados en el pedido y la nota de carga.");
    } catch (error: any) {
      setPreparationAddressError(error?.message || "No se pudo guardar la dirección de entrega.");
    } finally {
      setPreparationAddressSaving(false);
    }
  }
  async function markPreparationLine(line: any, prepared: boolean) {
    const quantity = prepared ? Math.max(0, Number(line.prepared_quantity ?? line.quantity ?? 0)) : 0;
    const requested = Number(line.quantity || 0);
    if (preparationLineSavingId !== null) return;
    setPreparationLineSavingId(Number(line.id));
    setPreparationValidationMessage("");
    const saved = await updatePreparationLine(line, { prepared: prepared && quantity >= requested ? 1 : 0, prepared_quantity: quantity, preparation_status: prepared && quantity >= requested ? "Preparado" : prepared && quantity > 0 ? "Parcial" : "Pendiente" });
    if (saved) setPreparationValidationMessage(`Línea validada: ${productOptions.find((product: any) => Number(product.id) === Number(line.product_id))?.name || "producto"}.`);
    setPreparationLineSavingId(null);
  }
  async function startPreparation() {
    if (!preview?.id || !isLoadPreparation || ["Preparado", "Preparado con incidencia"].includes(String(preview.status || "")) || (String(preview.status || "") === "Preparando" && String(preview.prepared_by || "").trim())) return;
    const now = new Date().toISOString();
    const startedBy = user?.username || "Usuario local";
    const changes = { status: "Preparando", prepared_by: startedBy, preparation_started_at: now, preparation_started_by: startedBy };
    const response = await fetch(`/api/shipments/${preview.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ ...preview, ...changes }) });
    if (!response.ok) return setError("No se pudo iniciar la preparación. Revisa la conexión e inténtalo de nuevo.");
    setPreview((current: any) => current ? { ...current, ...changes } : current);
    setRows((current) => current.map((item) => item.id === preview.id ? { ...item, ...changes } : item));
  }
  async function openPreparationRow(row: any) {
    if (!row?._virtual_order) return openPreview(row);
    const client = (lookups.clients || []).find((item: any) => Number(item.id) === Number(row.client_id));
    const response = await fetch("/api/shipments", {
      method: "POST",
      headers: actorHeaders,
      body: JSON.stringify({
        code: `ENV-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`,
        order_id: row._source_order_id,
        client_id: row.client_id,
        status: "Preparando",
        preparation_date: row.preparation_date || null,
        expected_delivery_at: row.expected_delivery_at || null,
        address: row.address || client?.address || "",
        delivery_city: row.delivery_city || client?.city || "",
        delivery_window_start: row.delivery_window_start || client?.opening_time || null,
        delivery_window_end: row.delivery_window_end || client?.closing_time || null,
        packages: row.packages || 1,
        urgent: Number(row.urgent || 0),
        notes: row.notes || "Preparación iniciada desde el pedido.",
        prepared_by: user?.username || "Usuario local",
      }),
    });
    const shipment = await response.json().catch(() => ({}));
    if (!response.ok) return setError(shipment.error || "No se pudo crear la nota de carga para este pedido.");
    setRows((current) => [shipment, ...current]);
    await openPreview(shipment);
  }
  async function createPreparationIncident(line: any) {
    const product = productOptions.find((item: any) => Number(item.id) === Number(line.product_id));
    const note = incidentText.trim() || `Falta producto. Cantidad solicitada: ${line.quantity} unidades. Registrar la cantidad real disponible y resolver antes del envío.`;
    const response = await fetch("/api/notes", { method: "POST", headers: actorHeaders, body: JSON.stringify({ title: `Incidencia en preparación · ${preview?.code || "Pedido"}`, content: `${product?.name || `Producto #${line.product_id}`}: ${note}`, priority: "Urgente", module: "Preparación de pedidos", important: 1, completed: 0, record_id: preview?.order_id || preview?.id || null }) });
    if (!response.ok) return alert("No se pudo crear la incidencia.");
    await updatePreparationLine(line, { prepared: 0, preparation_status: "Incidencia" });
    setIncidentLineId(null);
    setIncidentText("");
    setIncidentResolution("partial");
  }
  async function savePreparationAnnotation(asIncident: boolean) {
    const text = preparationAnnotation.trim();
    if (!preview?.id || !text) {
      setPreparationAnnotationError("Escribe una anotación antes de guardarla.");
      return;
    }
    setPreparationAnnotationSaving(true);
    setPreparationAnnotationError("");
    setPreparationAnnotationMessage("");
    const actor = user?.username || "Usuario local";
    const nextStatus = asIncident ? "Preparado con incidencia" : String(preview.status || "Preparando");
    const title = `${asIncident ? "Incidencia" : "Anotación"} en preparación · ${preview.code || "Nota de carga"}`;
    try {
      const noteResponse = await fetch("/api/notes", { method: "POST", headers: actorHeaders, body: JSON.stringify({ title, content: `${text}\n\nResponsable: ${actor}\nNota de carga: ${preview.code || preview.id}`, priority: asIncident ? "Urgente" : "Normal", module: "Preparación de pedidos", important: asIncident ? 1 : 0, completed: 0, record_id: preview.order_id || preview.id, created_by: actor }) });
      const noteData = await noteResponse.json().catch(() => ({}));
      if (!noteResponse.ok) throw new Error(noteData.error || "No se pudo guardar la anotación.");
      if (asIncident) {
        const incidentSummary = [String(preview.incidents || "").trim(), `${actor}: ${text}`].filter(Boolean).join("\n");
        const shipmentResponse = await fetch(`/api/shipments/${preview.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ ...preview, status: nextStatus, incidents: incidentSummary, prepared_by: preview.prepared_by || actor }) });
        const shipmentData = await shipmentResponse.json().catch(() => ({}));
        if (!shipmentResponse.ok) throw new Error(shipmentData.error || "La incidencia se guardó, pero no se pudo actualizar la nota de carga.");
      }
      setPreparationAnnotationMessage(asIncident ? "Incidencia registrada y vinculada a la nota de carga." : "Anotación guardada en el CRM.");
      setPreparationAnnotation("");
      if (asIncident) {
        setPreview((current: any) => current ? { ...current, status: nextStatus, incidents: [String(current.incidents || "").trim(), `${actor}: ${text}`].filter(Boolean).join("\n"), prepared_by: current.prepared_by || actor } : current);
        setRows((current) => current.map((item) => item.id === preview.id ? { ...item, status: nextStatus, prepared_by: item.prepared_by || actor } : item));
      }
    } catch (error: any) {
      setPreparationAnnotationError(error?.message || "No se pudo guardar la anotación.");
    } finally {
      setPreparationAnnotationSaving(false);
    }
  }
  async function createBulkPreparationIncident(lines: any[]) {
    const actionableLines = lines.filter((line) => line.preparation_status !== "Incidencia" && !String(line.incident_resolution || "").trim());
    if (!actionableLines.length) return setBulkIncidentError("No hay líneas nuevas con faltantes que registrar.");
    setBulkIncidentSaving(true);
    setBulkIncidentError("");
    try {
      const summary = actionableLines.map((line) => {
        const product = productOptions.find((item: any) => Number(item.id) === Number(line.product_id));
        const missing = Math.max(0, Number(line.quantity || 0) - Number(line.prepared_quantity || 0));
        return `- ${product?.name || `Producto #${line.product_id}`}: faltan ${missing} unidades`;
      }).join("\n");
      const noteContent = `Líneas incompletas en la preparación:\n${summary}${bulkIncidentText.trim() ? `\n\nObservaciones:\n${bulkIncidentText.trim()}` : ""}`;
      const noteResponse = await fetch("/api/notes", { method: "POST", headers: actorHeaders, body: JSON.stringify({ title: `Incidencia en preparación · ${preview?.code || "Pedido"}`, content: noteContent, priority: "Urgente", module: "Preparación de pedidos", important: 1, completed: 0, record_id: preview?.order_id || preview?.id || null }) });
      const noteData = await noteResponse.json().catch(() => ({}));
      if (!noteResponse.ok) throw new Error(noteData.error || "No se pudo crear la incidencia consolidada.");
      const nextLines = previewLines.map((line) => actionableLines.some((item) => item.id === line.id) ? { ...line, prepared: 0, preparation_status: "Incidencia" } : line);
      const lineResponses = await Promise.all(actionableLines.map((line) => fetch(`/api/order_lines/${line.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ ...line, prepared: 0, preparation_status: "Incidencia" }) })));
      if (lineResponses.some((response) => !response.ok)) throw new Error("La incidencia se creó, pero no se pudieron actualizar todas las líneas del pedido.");
      const nextShipmentStatus = "Preparado con incidencia";
      if (preview?.id) {
        const shipmentResponse = await fetch(`/api/shipments/${preview.id}`, { method: "PUT", headers: actorHeaders, body: JSON.stringify({ ...preview, status: nextShipmentStatus, prepared_by: user?.username || "Usuario local" }) });
        if (!shipmentResponse.ok) throw new Error("La incidencia se creó, pero no se pudo actualizar el estado de la nota de carga.");
      }
      setPreviewLines(nextLines);
      setPreview((current: any) => current ? { ...current, status: nextShipmentStatus } : current);
      setRows((current) => current.map((item) => item.id === preview?.id ? { ...item, status: nextShipmentStatus } : item));
      setBulkIncidentOpen(false);
      setBulkIncidentText("");
    } catch (error: any) {
      setBulkIncidentError(error?.message || "No se pudo registrar la incidencia. Inténtalo de nuevo.");
    } finally {
      setBulkIncidentSaving(false);
    }
  }
  async function resolvePreparationIncident(line: any) {
    const prepared = Number(line.prepared_quantity || 0);
    const missing = Math.max(0, Number(line.quantity || 0) - prepared);
    const now = new Date().toISOString();
    const actor = user?.username || "Usuario local";
    if (incidentResolution === "backorder") {
      if (!missing) return alert("No quedan unidades pendientes para crear otro pedido.");
      const sourceCode = preview?.code || `Pedido #${preview?.order_id || preview?.id || ""}`;
      const nextDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const product = productOptions.find((item: any) => Number(item.id) === Number(line.product_id));
      const unitPrice = Number(line.unit_price || product?.unit_price || 0);
      const response = await fetch("/api/orders", { method: "POST", headers: actorHeaders, body: JSON.stringify({ code: `PEN-${new Date().getFullYear()}-${String(Date.now()).slice(-7)}`, source_order_id: preview?.order_id || preview?.id || null, client_id: preview?.client_id || null, collection_point_id: preview?.collection_point_id || null, address: preview?.address || previewClient?.address || null, status: "Nuevo", preparation_date: nextDate, shipping_date: nextDate, delivery_date: nextDate, notes: `Pendiente del pedido ${sourceCode}. Faltan ${missing} unidades de ${product?.name || "producto"}.`, amount: missing * unitPrice, lines: [{ product_id: Number(line.product_id), quantity: missing, quantity_requested: missing, quantity_unit: "unidad", units_factor: 1, unit_price: unitPrice, discount: 0, vat: Number(line.vat || 21), amount: missing * unitPrice }] }) });
      const created = await response.json().catch(() => ({}));
      if (!response.ok) return alert(created.error || "No se pudo crear el pedido pendiente.");
      await updatePreparationLine(line, { prepared: 1, prepared_quantity: prepared, preparation_status: "Preparado", incident_resolution: `Nuevo pedido ${created.code || created.id}`, incident_resolved_at: now, incident_resolved_by: actor });
    } else {
      await updatePreparationLine(line, { prepared: 1, prepared_quantity: prepared, preparation_status: "Preparado", incident_resolution: incidentResolution === "cancel" ? "Faltante cancelado" : "Envío parcial", incident_resolved_at: now, incident_resolved_by: actor });
    }
    setIncidentLineId(null);
    setIncidentText("");
    setIncidentResolution("partial");
  }
  async function applyNoteIncidentAction() {
    if (!notePreview?.id || noteActionSaving) return;
    const actionLabels: Record<string, { status: string; resolution: string; completed: number }> = {
      partial: { status: "Autorizada", resolution: "Envío parcial autorizado", completed: 1 },
      backorder: { status: "Reposición solicitada", resolution: "Pendiente de reposición", completed: 0 },
      cancel: { status: "Resuelta", resolution: "Faltante cancelado", completed: 1 },
      review: { status: "En revisión", resolution: "Requiere revisión del responsable", completed: 0 },
    };
    const selected = actionLabels[noteAction] || actionLabels.review;
    setNoteActionSaving(true);
    setNoteActionError("");
    try {
      const now = new Date().toISOString();
      let replenishmentCode = "";
      if (noteAction === "backorder") {
        const orderId = Number(notePreview.record_id || 0);
        const sourceOrder = (lookups.orders || []).find((item: any) => Number(item.id) === orderId);
        if (!orderId || !sourceOrder) throw new Error("No se ha encontrado el pedido original para crear la reposición.");
        const linesResponse = await fetch("/api/order_lines", { headers: actorHeaders });
        const allLines = linesResponse.ok ? await linesResponse.json() : [];
        const missingLines = (Array.isArray(allLines) ? allLines : [])
          .filter((line: any) => Number(line.order_id) === orderId && Number(line.quantity || 0) > Number(line.prepared_quantity || 0))
          .map((line: any) => {
            const missing = Math.max(0, Number(line.quantity || 0) - Number(line.prepared_quantity || 0));
            return { ...line, missing };
          })
          .filter((line: any) => line.missing > 0);
        if (!missingLines.length) throw new Error("No quedan unidades pendientes para crear un pedido de reposición.");
        const replenishmentLines = missingLines.map((line: any) => ({
          product_id: Number(line.product_id),
          quantity: line.missing,
          quantity_requested: line.missing,
          quantity_unit: line.quantity_unit || "unidad",
          units_factor: Number(line.units_factor || 1),
          unit_price: Number(line.unit_price || 0),
          discount: Number(line.discount || 0),
          vat: Number(line.vat || 21),
          amount: Number(line.missing) * Number(line.unit_price || 0),
        }));
        const orderResponse = await fetch("/api/orders", {
          method: "POST",
          headers: actorHeaders,
          body: JSON.stringify({
            code: `PEN-${new Date().getFullYear()}-${String(Date.now()).slice(-7)}`,
            source_order_id: orderId,
            client_id: sourceOrder.client_id || null,
            collection_point_id: sourceOrder.collection_point_id || null,
            address: sourceOrder.address || null,
            status: "Nuevo",
            preparation_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            shipping_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            delivery_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            notes: `Reposición del pedido ${sourceOrder.code || orderId}. Creado desde la incidencia ${notePreview.title || "de preparación"}.`,
            lines: replenishmentLines,
          }),
        });
        const orderData = await orderResponse.json().catch(() => ({}));
        if (!orderResponse.ok) throw new Error(orderData.error || "No se pudo crear el pedido de reposición.");
        replenishmentCode = orderData.code || `Pedido #${orderData.id}`;
        selected.resolution = `Pedido de reposición creado: ${replenishmentCode}`;
        selected.status = "Resuelta";
        selected.completed = 1;
      }
      const response = await fetch(`/api/notes/${notePreview.id}`, {
        method: "PUT",
        headers: actorHeaders,
        body: JSON.stringify({ ...notePreview, status: selected.status, resolution: selected.resolution, completed: selected.completed, resolved_at: now, resolved_by: user?.username || "Usuario local" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la resolución.");
      setNotePreview((current: any) => current ? { ...current, ...data, status: selected.status, resolution: selected.resolution, completed: selected.completed, resolved_at: now, resolved_by: user?.username || "Usuario local" } : current);
      setRows((current) => current.map((item) => Number(item.id) === Number(notePreview.id) ? { ...item, ...data, status: selected.status, resolution: selected.resolution, completed: selected.completed, resolved_at: now, resolved_by: user?.username || "Usuario local" } : item));
    } catch (error: any) {
      setNoteActionError(error?.message || "No se pudo guardar la resolución.");
    } finally {
      setNoteActionSaving(false);
    }
  }
  function openIncidentPreparation() {
    const orderId = Number(notePreview?.record_id || 0);
    const shipment = (lookups.shipments || []).find((item: any) => Number(item.order_id) === orderId);
    setNotePreview(null);
    onNavigate?.("Preparación de pedidos");
    if (shipment?.id) window.setTimeout(() => window.dispatchEvent(new CustomEvent("crm:previsualizar-preparacion", { detail: Number(shipment.id) })), 160);
  }
  async function addPreviewLine() {
    if (!preview || !newLine.product_id) return;
    const invoice = active === "Facturas";
    const order = active === "Pedidos";
    const table = invoice
      ? "invoice_lines"
      : order
        ? "order_lines"
        : "delivery_note_lines";
    const line = invoice
      ? {
          invoice_id: preview.id,
          product_id: Number(newLine.product_id),
          quantity: Number(newLine.quantity),
          unit_price: Number(newLine.unit_price),
          amount: Number(newLine.quantity) * Number(newLine.unit_price),
        }
      : order
        ? {
            order_id: preview.id,
            product_id: Number(newLine.product_id),
            quantity: Number(newLine.quantity),
            unit_price: Number(newLine.unit_price),
            amount: Number(newLine.quantity) * Number(newLine.unit_price),
          }
        : {
            delivery_note_id: preview.id,
            product_id: Number(newLine.product_id),
            quantity: Number(newLine.quantity),
          };
    const response = await fetch("/api/" + table, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(line),
    });
    const created = await response.json();
    if (!response.ok)
      return alert(created.error || "No se pudo guardar la línea");
    setPreviewLines((current) => [...current, created]);
    setNewLine({ product_id: "", quantity: "1", unit_price: "0" });
  }
  function formatTableValue(field: string, value: any) {
    if (value === null || value === undefined || value === "") return "—";
    if (["opening_time", "closing_time", "delivery_window_start", "delivery_window_end"].includes(field)) {
      const text = String(value);
      if (/^\d{2}:\d{2}/.test(text)) return text.slice(0, 5);
      const timeMatch = text.match(/T(\d{2}:\d{2})/);
      if (timeMatch) return timeMatch[1];
    }
    if (active === "Documentos" && field === "content") return String(value).replaceAll("\\n", " ").replace(/\s+/g, " ").trim();
    const lookupSource = field === "client_id" ? lookups.clients
      : field === "product_id" ? lookups.products
        : field === "warehouse_id" ? lookups.warehouses
          : ["supplier_id", "primary_supplier_id"].includes(field) ? lookups.suppliers
            : field === "collection_point_id" ? lookups.collection_points
                 : field === "order_id" ? lookups.orders
                   : field === "purchase_order_id" ? lookups.purchase_orders
                : field === "purchase_invoice_id" ? lookups.invoices
                : field === "invoice_id" ? lookups.invoices
                : field === "shipment_id" ? lookups.shipments
                  : [];
    if (lookupSource.length && field.endsWith("_id")) {
      const item = lookupSource.find((entry: any) => Number(entry.id) === Number(value));
      if (item) {
        if (field === "product_id") return active === "Stock" ? (item.name || `Producto ${value}`) : `${item.name || `Producto ${value}`}${item.sku ? ` · ${item.sku}` : ""}`;
        if (field === "client_id") return `${item.name || `Cliente ${value}`}${item.city ? ` · ${item.city}` : ""}`;
        return item.name || item.code || `Registro ${value}`;
      }
    }
    if (field.endsWith("_id") && value !== null && value !== undefined && value !== "") {
      const missingRelationLabels: Record<string, string> = {
        client_id: "Cliente no disponible",
        product_id: "Producto no disponible",
        supplier_id: "Proveedor no disponible",
        primary_supplier_id: "Proveedor principal no disponible",
        warehouse_id: "Almacén no disponible",
        collection_point_id: "Ubicación no disponible",
        order_id: "Pedido no disponible",
        purchase_order_id: "Compra no disponible",
        purchase_invoice_id: "Factura de compra no disponible",
        invoice_id: "Factura no disponible",
        shipment_id: "Hoja de carga no disponible",
      };
      return missingRelationLabels[field] || "Relación no disponible";
    }
    if (["amount", "unit_price", "cost_price", "economic_difference"].includes(field)) {
      return Number(value).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
    }
    const isDateOnly = field.endsWith("_date") || ["date", "issue_date", "order_date"].includes(field);
    const isDateTime = field.endsWith("_at") || field.includes("time") || ["created_at", "updated_at", "deleted_at"].includes(field);
    if (isDateOnly || isDateTime) {
      const raw = String(value).replace("T", " ");
      const datePart = raw.slice(0, 10);
      const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const formatted = `${match[3]}/${match[2]}/${match[1]}`;
        return isDateTime && raw.length >= 16 ? `${formatted} ${raw.slice(11, 16)}` : formatted;
      }
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString("es-ES", isDateOnly ? { day: "2-digit", month: "2-digit", year: "numeric" } : { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    return String(value);
  }
  const dateFields = new Set([
    "date", "issue_date", "order_date", "expected_date", "return_date", "reviewed_at", "authorized_at",
    "movement_date", "delivery_date", "preparation_date", "shipping_date", "valid_until", "due_date",
    "payment_date", "expense_date", "created_at", "updated_at", "deleted_at", "departure_at", "prepared_at",
    "shipped_at", "expected_delivery_at", "delivered_at",
  ]);
  const timeFields = new Set(["opening_time", "closing_time", "delivery_window_start", "delivery_window_end"]);
  const isDateField = (field: string) => dateFields.has(field) || field.endsWith("_date") || field.endsWith("_at");
  const isLoadPreparation = active === "Preparación de pedidos";
  const usesRecordModal = ["Clientes", "Proveedores", "Almacenes", "Lugares de recogida", "Productos"].includes(active);
  const previewLocation = preview ? (lookups.collection_points || []).find((item: any) => Number(item.id) === Number(preview.collection_point_id)) : null;
  const previewLatValue = Number(previewLocation?.latitude ?? previewClient?.latitude);
  const previewLonValue = Number(previewLocation?.longitude ?? previewClient?.longitude);
  const previewLat = Number.isFinite(previewLatValue) ? previewLatValue : null;
  const previewLon = Number.isFinite(previewLonValue) ? previewLonValue : null;
  const hasPreviewCoordinates = Number.isFinite(previewLat) && Number.isFinite(previewLon);
  const previewAddress = preview?.address || previewLocation?.address || previewClient?.address || "";
  const previewCity = preview?.delivery_city || previewLocation?.city || previewClient?.city || preview?.city || "";
  const previewMapQuery = [previewAddress, previewCity, previewLocation?.name, previewClient?.name, "España"].filter(Boolean).join(", ");
  const previewWarehouse = (lookups.warehouses || []).find((item: any) => Number(item.id) === Number(preview?.warehouse_id))
    || (lookups.warehouses || []).find((item: any) => /principal/i.test(String(item.name || "")))
    || (lookups.warehouses || [])[0]
    || { name: "Almacén principal", address: "Madrid" };
  const previewWarehouseAddress = previewWarehouse ? [previewWarehouse.address, previewWarehouse.name, "España"].filter(Boolean).join(", ") : "";
  const previewNavigationOrigin = previewWarehouseCoordinates
    ? `${previewWarehouseCoordinates.latitude},${previewWarehouseCoordinates.longitude}`
    : previewWarehouseAddress;
  const previewNavigationUrl = `https://www.google.com/maps/dir/?api=1${previewNavigationOrigin ? `&origin=${encodeURIComponent(previewNavigationOrigin)}` : ""}&destination=${encodeURIComponent(hasPreviewCoordinates ? `${previewLat},${previewLon}` : previewMapQuery)}`;
  useEffect(() => {
    let cancelled = false;
    setPreviewWarehouseCoordinates(null);
    setPreviewWarehouseDistanceKm(null);
    if (!preview || !Number.isFinite(previewLat) || !Number.isFinite(previewLon) || !previewLat || !previewLon || !previewWarehouseAddress) return () => { cancelled = true; };
    const knownLatitude = Number(previewWarehouse?.latitude);
    const knownLongitude = Number(previewWarehouse?.longitude);
    if (Number.isFinite(knownLatitude) && Number.isFinite(knownLongitude) && knownLatitude && knownLongitude) {
      setPreviewWarehouseCoordinates({ latitude: knownLatitude, longitude: knownLongitude });
      setPreviewWarehouseDistanceKm(Number(haversineKm(knownLatitude, knownLongitude, previewLat, previewLon).toFixed(1)));
      return () => { cancelled = true; };
    }
    // Mientras el almacén no tenga coordenadas propias, usamos el centro de
    // su municipio para mostrar una estimación útil inmediatamente y dejamos
    // que la geocodificación la refine si el callejero reconoce la dirección.
    const fallbackCoordinates = /getafe/i.test(previewWarehouseAddress) ? { latitude: 40.3083, longitude: -3.7327 } : { latitude: 40.4168, longitude: -3.7038 };
    setPreviewWarehouseCoordinates(fallbackCoordinates);
    setPreviewWarehouseDistanceKm(Number(haversineKm(fallbackCoordinates.latitude, fallbackCoordinates.longitude, previewLat, previewLon).toFixed(1)));
    void geocodeAddress(String(previewWarehouse?.address || previewWarehouse?.name || ""), "Madrid").then(async (geo) => {
      // Algunos datos históricos tienen una dirección interna de almacén que
      // no existe en el callejero. En ese caso damos una estimación desde la
      // ciudad del almacén, sin dejar el indicador bloqueado indefinidamente.
      if (!Number.isFinite(Number(geo.latitude)) || !Number.isFinite(Number(geo.longitude))) geo = await geocodeAddress("", "Madrid");
      if (cancelled || !Number.isFinite(Number(geo.latitude)) || !Number.isFinite(Number(geo.longitude))) {
        return;
      }
      const latitude = Number(geo.latitude);
      const longitude = Number(geo.longitude);
      setPreviewWarehouseCoordinates({ latitude, longitude });
      setPreviewWarehouseDistanceKm(Number(haversineKm(latitude, longitude, previewLat, previewLon).toFixed(1)));
    });
    return () => { cancelled = true; };
  }, [preview?.id, previewLat, previewLon, previewWarehouse?.id, previewWarehouse?.address, previewWarehouse?.latitude, previewWarehouse?.longitude]);
  const incompletePreparationLines = previewLines.filter((line: any) => Number(line.prepared_quantity || 0) < Number(line.quantity || 0));
  const actionableIncompletePreparationLines = incompletePreparationLines.filter((line: any) => line.preparation_status !== "Incidencia" && !String(line.incident_resolution || "").trim());
  const isProducts = active === "Productos";
  const preparationRows = isLoadPreparation
    ? [
        ...rows,
        ...(Array.isArray(lookups.orders) ? lookups.orders : [])
          .filter((order: any) =>
            ["Nuevo", "Pendiente", "Confirmado"].includes(String(order.status || "Pendiente")) &&
            Number(order.deleted || 0) !== 1 &&
            !rows.some((shipment: any) => Number(shipment.order_id) === Number(order.id)),
          )
          .map((order: any) => {
            const client = (lookups.clients || []).find((item: any) => Number(item.id) === Number(order.client_id));
            return {
              ...order,
              id: -Math.abs(Number(order.id)),
              order_id: order.id,
              code: order.code,
              client_id: order.client_id,
              status: "Pendiente",
              address: order.address || client?.address || "",
              expected_delivery_at: order.delivery_date || null,
              preparation_date: order.preparation_date || null,
              urgent: Number(order.urgent || 0),
              packages: order.packages || 1,
              notes: order.notes || "Preparación pendiente de iniciar.",
              _virtual_order: true,
              _source_order_id: order.id,
            };
          }),
      ]
    : rows;
  const productCategories = isProducts ? Array.from(new Set(rows.map((row) => String(row.category || "").trim()).filter(Boolean))).sort() : [];
  const productBrands = isProducts ? Array.from(new Set(rows.map((row) => String(row.brand || "").trim()).filter(Boolean))).sort() : [];
  const listFilterActive = ["Pedidos", "Facturas", "Cobros", "Devoluciones", "Presupuestos", "Albaranes", "Compras", "Entradas", "Salidas", "Gastos y tickets"].includes(active);
  const listStatusOptions = Array.from(new Set(rows.map((row: any) => String(row.status || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
  const quickViewOptions = active === "Pedidos"
    ? [{ value: "all", label: "Todos los pedidos" }, { value: "today", label: "Pedidos de hoy" }, { value: "unbilled", label: "Sin facturar" }, { value: "not-shipped", label: "Pendientes de enviar" }, { value: "review", label: "Pendientes de revisar" }]
    : active === "Stock" || active === "Productos"
      ? [{ value: "all", label: "Todo el stock" }, { value: "critical", label: "Stock crítico" }]
      : isLoadPreparation
        ? [{ value: "all", label: "Todas las preparaciones" }, { value: "today", label: "Pedidos de hoy" }, { value: "review", label: "Pendientes de revisar" }]
        : listFilterActive
          ? [{ value: "all", label: "Todos" }, { value: "review", label: "Pendientes de revisar" }]
          : [{ value: "all", label: "Todos" }];
  const filteredRows = preparationRows.filter((row) => {
    const normalizeSearch = (value: any) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const query = normalizeSearch(search).trim();
    const relatedValues = ["client_id", "product_id", "supplier_id", "primary_supplier_id", "warehouse_id", "collection_point_id", "order_id", "shipment_id", "invoice_id"].flatMap((field) => {
      const lookupName = field === "client_id" ? "clients" : field === "product_id" ? "products" : ["supplier_id", "primary_supplier_id"].includes(field) ? "suppliers" : field === "warehouse_id" ? "warehouses" : field === "collection_point_id" ? "collection_points" : field === "order_id" ? "orders" : field === "shipment_id" ? "shipments" : field === "invoice_id" ? "invoices" : "";
      const match = lookupName && (lookups[lookupName] || []).find((item: any) => Number(item.id) === Number(row[field]));
      return match ? [match.name, match.code, match.city, match.email, match.phone] : [];
    });
    const primaryValues = c.fields.slice(0, 4).map((field: string) => row[field]);
    const searchableText = normalizeSearch([...primaryValues, ...relatedValues, JSON.stringify(row)].join(" "));
    const matchesText = !query || query.split(/\s+/).every((token) => searchableText.includes(token));
    const currentBillingStatus = getOrderBillingStatus(row);
    const matchesBilling = active !== "Pedidos" || billingFilter === "todos"
      || (billingFilter === "pendientes" ? currentBillingStatus !== "Facturado" : currentBillingStatus === "Facturado");
    const currentShippingStatus = active === "Pedidos" ? getOrderShippingStatus(row) : "";
    const matchesShipping = active !== "Pedidos" || shippingFilter === "todos"
      || (shippingFilter === "pendientes" ? ["Sin nota de carga", "Pendiente de enviar", "Preparado"].includes(currentShippingStatus) : ["Enviado", "En reparto", "Entregado"].includes(currentShippingStatus));
    const linkedInvoice = active === "Cobros" ? (lookups.invoices || []).find((item: any) => Number(item.id) === Number(row.invoice_id)) : null;
    const rowClientId = row.client_id || linkedInvoice?.client_id || "";
    const rowDate = String(active === "Facturas" ? (row.issue_date || row.created_at) : active === "Cobros" ? (row.payment_date || row.created_at) : active === "Devoluciones" ? (row.return_date || row.created_at) : active === "Pedidos" ? (row.delivery_date || row.created_at) : active === "Preparación de pedidos" ? (row.preparation_date || row.expected_delivery_at || row.created_at) : active === "Entradas" ? (row.receipt_date || row.created_at) : active === "Compras" ? (row.order_date || row.created_at) : (row.created_at || row.movement_date || "")).slice(0, 10);
    const matchesListClient = !listClient || String(rowClientId) === String(listClient);
    const rowSupplierId = row.supplier_id || row.primary_supplier_id || "";
    const matchesListSupplier = !listSupplier || String(rowSupplierId) === String(listSupplier);
    const matchesListFrom = !listDateFrom || (rowDate && rowDate >= listDateFrom);
    const matchesListTo = !listDateTo || (rowDate && rowDate <= listDateTo);
    const matchesListStatus = listStatus === "Todos" || String(row.status || "") === listStatus;
    const available = Number(row.available_stock ?? Number(row.stock || 0) - Number(row.stock_reserved || 0));
    const criticalStock = available <= Number(row.min_stock || 0);
    const today = tabletTodayInput();
    const reviewStatus = ["Pendiente", "Nuevo", "Preparando", "Preparado con incidencia", "En revisión", "Borrador"].includes(String(row.status || ""));
    const matchesQuickView = quickView === "all"
      || (quickView === "today" && rowDate === today)
      || (quickView === "unbilled" && currentBillingStatus !== "Facturado")
      || (quickView === "not-shipped" && ["Pendiente de enviar", "Preparado"].includes(currentShippingStatus))
      || (quickView === "critical" && criticalStock)
      || (quickView === "review" && (reviewStatus || currentBillingStatus !== "Facturado" && active === "Pedidos"));
    if (!isProducts && !isLoadPreparation) return matchesText && matchesBilling && matchesShipping && matchesQuickView && (!listFilterActive || (matchesListClient && matchesListSupplier && matchesListFrom && matchesListTo && matchesListStatus));
    if (isLoadPreparation) return matchesText && matchesQuickView && (!preparationDateFilter || String(row.preparation_date || "").slice(0, 10) === preparationDateFilter);
    const matchesCategory = !productFilters.category || row.category === productFilters.category;
    const matchesBrand = !productFilters.brand || row.brand === productFilters.brand;
    const matchesStock = productFilters.stock === "todos" || (productFilters.stock === "critico" ? available <= Number(row.min_stock || 0) : available > Number(row.min_stock || 0));
    const matchesCodes = productFilters.codes === "todos" || (productFilters.codes === "sin-codigo" ? !row.barcode : Boolean(row.barcode));
    return matchesText && matchesQuickView && matchesCategory && matchesBrand && matchesStock && matchesCodes;
  });
  const sortedRows = isLoadPreparation
    ? [...filteredRows].sort((a, b) => Number(b.urgent || 0) - Number(a.urgent || 0) || String(a.preparation_date || "9999").localeCompare(String(b.preparation_date || "9999")) || String(a.address || "").localeCompare(String(b.address || ""), "es", { numeric: true }))
    : tableSort
    ? [...filteredRows].sort((a, b) => {
        const field = tableSort.field;
        if (field === "stock_status") {
          const rank = (row: any) => {
            const available = Number(row.available_stock ?? Number(row.stock || 0) - Number(row.stock_reserved || 0));
            const minimum = Number(row.min_stock || 0);
            return available <= 0 ? 0 : available <= minimum ? 1 : minimum > 0 && available <= minimum * 1.25 ? 2 : 3;
          };
          const comparison = rank(a) - rank(b);
          return (tableSort.direction === "asc" ? comparison : -comparison) || String(a.product_name || a.name || "").localeCompare(String(b.product_name || b.name || ""), "es");
        }
        const numericFields = ["stock", "stock_reserved", "available_stock", "min_stock", "amount", "quantity", "unit_price", "total_units", "credit_limit"];
        const numeric = numericFields.includes(field);
        const av = numeric ? Number(a[field] || 0) : String(a[field] || "");
        const bv = numeric ? Number(b[field] || 0) : String(b[field] || "");
        const aMissing = !av;
        const bMissing = !bv;
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        const comparison = numeric ? (av as number) - (bv as number) : (av as string).localeCompare(bv as string, "es", { numeric: true });
        return tableSort.direction === "asc" ? comparison : -comparison;
      })
    : active === "Stock" && stockSort !== "none"
    ? [...filteredRows].sort((a, b) => {
        if (stockSort.startsWith("status")) {
          const rank = (row: any) => {
            const available = Number(row.available_stock ?? Number(row.stock || 0) - Number(row.stock_reserved || 0));
            const minimum = Number(row.min_stock || 0);
            if (available <= 0) return 0;
            if (available <= minimum) return 1;
            if (minimum > 0 && available <= minimum * 1.25) return 2;
            return 3;
          };
          const direction = stockSort.endsWith("desc") ? -1 : 1;
          return (rank(a) - rank(b)) * direction || String(a.product_name || "").localeCompare(String(b.product_name || ""), "es");
        }
        const field = stockSort.startsWith("physical") ? "stock" : "available_stock";
        const direction = stockSort.endsWith("desc") ? -1 : 1;
        return (Number(a[field] || 0) - Number(b[field] || 0)) * direction;
      })
    : filteredRows;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => {
    setPage(1);
  }, [search, quickView, listDateFrom, listDateTo, listClient, listStatus, listSupplier, billingFilter, shippingFilter, preparationDateFilter, productFilters]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const preparationUrgentCount = isLoadPreparation ? filteredRows.filter((row) => Number(row.urgent) === 1).length : 0;
  const preparationIncidentCount = isLoadPreparation ? filteredRows.filter((row) => row.status === "Preparado con incidencia").length : 0;
  const stockCellClass = (row: any, field: string) => {
    if (active !== "Stock" || field !== "stock_status") return "";
    const available = Number(row.available_stock ?? Number(row.stock || 0) - Number(row.stock_reserved || 0));
    const minimum = Number(row.min_stock || 0);
    if (available <= 0) return "stock-cell-danger";
    if (available <= minimum) return "stock-cell-warning";
    if (minimum > 0 && available <= minimum * 1.25) return "stock-cell-caution";
    return "stock-cell-ok";
  };
  const renderFormField = (f: string, i: number) => (
    <label key={f}>
      <span className={(active === "Pedidos" && ["client_id", "collection_point_id"].includes(f)) || (active === "Productos" && ["name", "sku", "description", "category", "unit", "created_at", "warehouse_id", "warehouse_location", "inventory_valuation_method", "cost_price", "last_direct_cost", "markup_percent", "unit_price", "accounting_product_group", "accounting_vat_group", "inventory_register_group", "product_tracking_code", "supplier_id"].includes(f)) ? "field-label-required" : undefined}>{active === "Pedidos" && f === "collection_point_id" ? "Lugar de envío" : active === "Productos" && f === "unit" ? "Unidad de medida base" : c.labels[i]}</span>
      {active === "Pedidos" && f === "client_id" ? (
        <>
          <div className="smart-client-picker"><input aria-label="Cliente" autoComplete="off" placeholder={lookups.clients?.length ? "Buscar cliente por nombre, ciudad, teléfono o email…" : "Cargando clientes…"} value={clientSearch} onChange={(event) => { const value = event.target.value; setClientSearch(value); if (!value) handleFormChange("client_id", ""); }} />{lookups.clients?.length > 0 && <button type="button" className="smart-client-clear" onClick={() => { setClientSearch(""); handleFormChange("client_id", ""); }} aria-label="Limpiar cliente" title="Limpiar cliente">×</button>}{!form.client_id && clientSearch.trim().length > 0 && <div className="smart-client-suggestions">{(lookups.clients || []).filter((item: any) => `${item.name || ""} ${item.city || ""} ${item.phone || ""} ${item.email || ""}`.toLowerCase().includes(clientSearch.trim().toLowerCase())).slice(0, 8).map((item: any) => <button type="button" key={item.id} onClick={() => { setClientSearch(`${item.name}${item.city ? ` · ${item.city}` : ""}`); handleFormChange("client_id", String(item.id)); }}><b>{item.name}{item.city ? ` · ${item.city}` : ""}</b><small>{[item.phone, item.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}</small></button>)}{!(lookups.clients || []).some((item: any) => `${item.name || ""} ${item.city || ""} ${item.phone || ""} ${item.email || ""}`.toLowerCase().includes(clientSearch.trim().toLowerCase())) && <span className="smart-client-no-results">No hay clientes que coincidan.</span>}</div>}</div>
        </>
      ) : active === "Pedidos" && f === "collection_point_id" ? (
        <>
          <select aria-label="Lugar de envío" required value={form[f] ?? ""} disabled={!form.client_id} onChange={(e) => { if (e.target.value === "__new__") setNewShippingLocationOpen(true); else handleFormChange(f, e.target.value); }}>
            <option value="">{form.client_id ? "Seleccionar ubicación del cliente…" : "Selecciona primero un cliente"}</option>
            {(lookups.collection_points || []).filter((item: any) => Number(item.client_id) === Number(form.client_id)).map((item: any) => <option key={item.id} value={item.id}>{item.name}{item.address ? ` · ${item.address}` : ""}</option>)}
            {form.client_id && <option value="__new__">＋ Crear nueva ubicación para este cliente</option>}
          </select>
          {newShippingLocationOpen && <div className="shipping-location-quick-form">
            <b>Nueva ubicación del cliente</b>
            <input aria-label="Nombre de la ubicación" placeholder="Nombre (ej. Almacén secundario)" value={newShippingLocation.name} onChange={(e) => setNewShippingLocation({ ...newShippingLocation, name: e.target.value })} />
            <input aria-label="Dirección de envío" placeholder="Dirección de envío" value={newShippingLocation.address} onChange={(e) => setNewShippingLocation({ ...newShippingLocation, address: e.target.value })} />
            <input aria-label="Ciudad de la ubicación" placeholder="Ciudad" value={newShippingLocation.city} onChange={(e) => setNewShippingLocation({ ...newShippingLocation, city: e.target.value })} />
            <label>Horario de apertura<input aria-label="Hora de apertura de la ubicación" type="time" value={newShippingLocation.opening_time} onChange={(e) => setNewShippingLocation({ ...newShippingLocation, opening_time: e.target.value })} /></label>
            <label>Horario de cierre<input aria-label="Hora de cierre de la ubicación" type="time" value={newShippingLocation.closing_time} onChange={(e) => setNewShippingLocation({ ...newShippingLocation, closing_time: e.target.value })} /></label>
            <div><button type="button" className="button primary" onClick={createShippingLocation}>Guardar ubicación</button><button type="button" className="button secondary" onClick={() => setNewShippingLocationOpen(false)}>Cancelar</button></div>
          </div>}
        </>
      ) : active === "Productos" && f === "supplier_id" ? (
        <div className="supplier-picker">
          <input aria-label="Buscar proveedor" autoComplete="off" placeholder="Buscar por nombre, NIF, teléfono o email…" value={supplierSearch || (lookups.suppliers || []).find((item: any) => Number(item.id) === Number(form.supplier_id))?.name || ""} onChange={(event) => { const value = event.target.value; setSupplierSearch(value); if (!value) handleFormChange(f, ""); }} />
          {supplierSearch && !form.supplier_id && <div className="supplier-suggestions">{(lookups.suppliers || []).filter((item: any) => `${item.name || ""} ${item.tax_id || ""} ${item.phone || ""} ${item.email || ""}`.toLowerCase().includes(supplierSearch.toLowerCase())).slice(0, 8).map((item: any) => <button type="button" key={item.id} onClick={() => { setSupplierSearch(item.name || ""); handleFormChange(f, String(item.id)); }}><b>{item.name}</b><small>{[item.tax_id, item.phone, item.email].filter(Boolean).join(" · ") || "Sin datos adicionales"}</small></button>)}{!(lookups.suppliers || []).some((item: any) => `${item.name || ""} ${item.tax_id || ""} ${item.phone || ""} ${item.email || ""}`.toLowerCase().includes(supplierSearch.toLowerCase())) && <span>No hay proveedores que coincidan.</span>}</div>}
          <button type="button" className="button secondary supplier-new-button" onClick={() => setNewSupplierOpen(true)}>＋ Crear proveedor</button>
        </div>
      ) : f === "client_id" || f === "product_id" || f === "warehouse_id" || f === "supplier_id" || f === "primary_supplier_id" || f === "collection_point_id" || f === "order_id" || f === "shipment_id" ? (
        <select
          aria-label={c.labels[i]}
          required={active === "Productos" ? ["warehouse_id", "supplier_id"].includes(f) : c.api === "orders" ? f === "client_id" : !['warehouse_id', 'order_id', 'shipment_id', 'supplier_id', 'primary_supplier_id'].includes(f)}
          value={form[f] ?? ""}
          onChange={(e) => handleFormChange(f, e.target.value)}
        >
          <option value="">Seleccionar...</option>
          {(lookups[f === "client_id" ? "clients" : f === "product_id" ? "products" : ["supplier_id", "primary_supplier_id"].includes(f) ? "suppliers" : f === "collection_point_id" ? "collection_points" : f === "order_id" ? "orders" : f === "shipment_id" ? "shipments" : "warehouses"] || []).map((item: any) => (
            <option key={item.id} value={item.id}>{item.name || item.code || (f === "order_id" ? `Pedido #${item.id}` : f === "shipment_id" ? `Hoja #${item.id}` : `Registro #${item.id}`)}</option>
          ))}
        </select>
      ) : ["Proveedores", "Clientes", "Productos"].includes(active) && f === "active" ? (
        <select aria-label={c.labels[i]} value={String(form[f] ?? "1")} onChange={(e) => handleFormChange(f, e.target.value)}><option value="1">Activo</option><option value="0">Baja</option></select>
      ) : active === "Clientes" && f === "geocoding_status" ? (
        <input aria-label={c.labels[i]} value={form[f] || "Pendiente"} readOnly />
      ) : active === "Productos" && f === "product_status" ? (
        <select aria-label={c.labels[i]} value={form[f] ?? "Activo"} onChange={(e) => handleFormChange(f, e.target.value)}>{["Activo", "Inactivo", "Descatalogado", "Estacional"].map((value) => <option key={value}>{value}</option>)}</select>
      ) : active === "Productos" && ["family", "subfamily"].includes(f) ? (
        <select aria-label={c.labels[i]} value={form[f] ?? ""} onChange={(e) => handleFormChange(f, e.target.value)}><option value="">Seleccionar...</option>{(f === "family" ? ["Agua", "Refresco", "Zumo", "Vino", "Cerveza", "Tónica", "Isotónica"] : ["Con gas", "Sin gas", "Naranja", "Limón", "Tinto", "Blanco", "Premium"]).map((value) => <option key={value}>{value}</option>)}</select>
      ) : active === "Productos" && f === "preorder" ? (
        <select aria-label={c.labels[i]} value={String(form[f] ?? "1")} onChange={(e) => handleFormChange(f, e.target.value)}><option value="1">Sí</option><option value="0">No</option></select>
      ) : active === "Productos" && f === "inventory_valuation_method" ? (
        <select aria-label={c.labels[i]} required value={form[f] ?? "FIFO"} onChange={(e) => handleFormChange(f, e.target.value)}>{["FIFO", "LIFO", "PMP", "Identificación específica"].map((value) => <option key={value}>{value}</option>)}</select>
      ) : active === "Productos" && f === "accounting_product_group" ? (
        <select aria-label={c.labels[i]} required value={form[f] ?? "Mercaderías"} onChange={(e) => handleFormChange(f, e.target.value)}>{["Mercaderías", "Productos terminados", "Materias primas", "Otro"].map((value) => <option key={value}>{value}</option>)}</select>
      ) : active === "Productos" && f === "accounting_vat_group" ? (
        <select aria-label={c.labels[i]} required value={form[f] ?? "21%"} onChange={(e) => handleFormChange(f, e.target.value)}>{["21%", "10%", "4%", "2%", "0%", "Otro"].map((value) => <option key={value}>{value}</option>)}</select>
      ) : active === "Productos" && f === "inventory_register_group" ? (
        <select aria-label={c.labels[i]} required value={form[f] ?? "Mercaderías"} onChange={(e) => handleFormChange(f, e.target.value)}>{["Mercaderías", "Inventario general", "Otro"].map((value) => <option key={value}>{value}</option>)}</select>
      ) : active === "Productos" && ["unit", "purchase_format", "sale_format"].includes(f) ? (
        <select aria-label={c.labels[i]} required={f === "unit"} value={form[f] ?? ""} onChange={(e) => handleFormChange(f, e.target.value)}><option value="">Seleccionar...</option>{["unidad", "caja de 4", "caja de 6", "caja de 8", "caja de 10", "caja de 12", "caja de 15", "caja de 16", "palet"].map((value) => <option key={value}>{value}</option>)}</select>
      ) : active === "Productos" && f === "product_tracking_code" ? (
        <select aria-label={c.labels[i]} required value={form[f] ?? "Sin seguimiento"} onChange={(e) => handleFormChange(f, e.target.value)}><option>Sin seguimiento</option><option>Seguimiento de lote</option><option>Lote y fecha de caducidad</option></select>
      ) : active === "Productos" && ["fixed_supplier", "lot_tracking", "expiry_tracking", "returnable_packaging"].includes(f) ? (
        <select aria-label={c.labels[i]} value={String(form[f] ?? "0")} onChange={(e) => handleFormChange(f, e.target.value)}><option value="0">No</option><option value="1">Sí</option></select>
      ) : active === "Documentos" && f === "type" ? (
        <select aria-label={c.labels[i]} value={form[f] ?? "General"} onChange={(e) => handleFormChange(f, e.target.value)}>{["Presupuesto", "Correo", "Albarán", "Factura", "Hoja de carga", "Contrato", "Alta de cliente", "Condiciones", "General"].map((value) => <option key={value}>{value}</option>)}</select>
      ) : active === "Documentos" && f === "format" ? (
        <select aria-label={c.labels[i]} value={form[f] ?? "HTML"} onChange={(e) => handleFormChange(f, e.target.value)}>{["HTML", "Texto plano", "PDF", "Word", "Correo electrónico"].map((value) => <option key={value}>{value}</option>)}</select>
      ) : active === "Notas" && f === "priority" ? (
        <select aria-label={c.labels[i]} value={form[f] ?? "Normal"} onChange={(e) => handleFormChange(f, e.target.value)}>{["Baja", "Normal", "Alta", "Urgente"].map((value) => <option key={value}>{value}</option>)}</select>
      ) : active === "Notas" && f === "module" ? (
        <select aria-label={c.labels[i]} value={form[f] ?? "General"} onChange={(e) => handleFormChange(f, e.target.value)}>{["General", "Pedidos", "Clientes", "Productos", "Stock", "Envíos", "Compras", "Facturas"].map((value) => <option key={value}>{value}</option>)}</select>
      ) : active === "Pedidos" && f === "urgent" ? (
        <select aria-label={c.labels[i]} value={String(form[f] ?? "0")} onChange={(e) => handleFormChange(f, e.target.value)}><option value="0">No</option><option value="1">Sí</option></select>
      ) : active === "Notas" && ["important", "completed"].includes(f) ? (
        <input type="checkbox" aria-label={c.labels[i]} checked={Boolean(Number(form[f] || 0))} onChange={(e) => handleFormChange(f, e.target.checked ? "1" : "0")} />
      ) : f === "status" ? (
        <select aria-label={c.labels[i]} value={form[f] ?? (active === "Pedidos" ? "Nuevo" : "Pendiente")} onChange={(e) => handleFormChange(f, e.target.value)}>
          {(active === "Facturas" ? ["Proforma", "Pendiente", "Parcial", "Cobrada", "Vencida", "Anulada"] : [...(active === "Documentos" ? ["Activa", "Borrador", "Archivada"] : []), ...(active === "Pedidos" ? ["Nuevo"] : []), "Pendiente", "Confirmado", "Preparando", "Preparado", "Enviado", "Entregado", "Cancelado", "Cobrada"]).map((s) => <option key={s}>{s}</option>)}
        </select>
      ) : ["content", "description"].includes(f) || (active === "Pedidos" && f === "notes") ? (
        <textarea aria-label={c.labels[i]} required={active === "Productos" && f === "description" ? true : !['description', 'notes'].includes(f)} value={form[f] ?? ""} onChange={(e) => handleFormChange(f, e.target.value)} />
      ) : (
        <input
          required={active === "Productos"
            ? ["name", "sku", "category", "created_at", "warehouse_location", "cost_price", "last_direct_cost", "markup_percent", "unit_price"].includes(f)
            : c.api === "orders"
            ? ["code", "client_id"].includes(f)
            : active === "Notas"
            ? ["title", "content"].includes(f)
            : active === "Productos"
            ? f === "name"
            : !["phone", "email", "address", "notes", "opening_time", "closing_time", "delivery_window_start", "delivery_window_end", "attachment_name", "sent_by", "delivered_by"].includes(f) && !(c.api === "expenses" && f === "code")}
          type={["amount", "stock", "stock_reserved", "quantity", "unit_price", "box_price", "pack4_price", "pack6_price", "pallet_price", "client_id", "product_id", "order_id", "invoice_id", "stock_min", "stock_target", "stock_safety", "units_per_case", "cases_per_pallet", "units_per_pallet", "weight_kg", "volume_m3", "picking_order", "target_margin_percent", "min_margin_percent", "freight_cost", "handling_cost", "real_cost", "tax_surcharge_percent", "extra_tax_percent", "cost_price", "last_direct_cost", "markup_percent"].includes(f) ? "number" : timeFields.has(f) ? "time" : ["movement_date", "return_date", "reviewed_at", "authorized_at"].includes(f) ? "datetime-local" : ["expense_date", "delivery_date", "preparation_date", "shipping_date", "created_at"].includes(f) ? "date" : "text"}
          step={["unit_price", "cost_price", "last_direct_cost", "markup_percent"].includes(f) ? "0.01" : undefined}
          value={form[f] ?? ""}
          readOnly={f === "created_by" || f === "category_code" || (f === "code" && isOrderForm && !editing)}
          onChange={(e) => handleFormChange(f, e.target.value)}
        />
      )}
    </label>
  );
  const productSections = [
    { title: "Producto", fields: ["name", "sku", "external_code", "description", "barcode", "supplier_ref", "category", "category_code", "brand", "format", "unit", "purchase_format", "sale_format", "product_status", "active", "created_at", "supplier_id"] },
    { title: "Inventario y logística", fields: ["warehouse_id", "warehouse_location", "preorder", "inventory_valuation_method", "stock", "stock_reserved", "stock_min", "stock_target", "stock_safety", "units_per_case", "cases_per_pallet", "units_per_pallet", "weight_kg", "volume_m3", "picking_order"] },
    { title: "Costes y márgenes", fields: ["cost_price", "last_direct_cost", "unit_price", "markup_percent", "margin_percent", "target_margin_percent", "min_margin_percent", "freight_cost", "handling_cost", "real_cost"] },
    { title: "Precios e impuestos", fields: ["vat", "accounting_product_group", "accounting_vat_group", "inventory_register_group", "tax_surcharge_percent", "extra_tax_name", "extra_tax_percent", "fixed_supplier", "primary_supplier_id"] },
    { title: "Reposición y trazabilidad", fields: ["product_tracking_code", "lot_tracking", "expiry_tracking", "returnable_packaging"] },
  ];
  const createActionLabels: Record<string, string> = {
    Productos: "Crear producto",
    Pedidos: "Crear pedido",
    Stock: "Crear movimiento de stock",
    Envíos: "Crear envío",
    Clientes: "Crear cliente",
    Proveedores: "Crear proveedor",
    Compras: "Crear compra",
    "Compras inteligentes": "Crear solicitud de compra",
    "Gastos y tickets": "Crear gasto",
    Presupuestos: "Crear presupuesto",
    Facturas: "Crear factura",
    Albaranes: "Crear albarán",
    "Preparación de pedidos": "Crear preparación",
    Almacenes: "Crear almacén",
    "Lugares de recogida": "Crear lugar de recogida",
    Entradas: "Crear entrada",
    Salidas: "Crear salida",
    Cobros: "Crear cobro",
    Devoluciones: "Crear devolución",
    Documentos: "Crear plantilla",
    Notas: "Crear nota",
  };
  function nextOrderCode() {
    const year = new Date().getFullYear();
    const prefix = `PED-${year}-`;
    const highest = rows.reduce((max: number, row: any) => {
      const code = String(row.code || "");
      if (!code.startsWith(prefix)) return max;
      const number = Number(code.slice(prefix.length));
      return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 0);
    return `${prefix}${String(highest + 1).padStart(4, "0")}`;
  }
  const isOrderForm = c.api === "orders";
  const formEntity = active === "Facturas" && form.status === "Proforma" ? "proforma" : (isOrderForm ? "pedido" : (createActionLabels[active] || "Crear registro").replace(/^Crear /, ""));
  const formTitle = `${editing ? "Editar" : "Crear"} ${formEntity}`;
  return (
    <>
    <div className={`manager${isLoadPreparation ? " load-preparation-manager" : ""}`}>
      {!isLoadPreparation && <div className="manager-head">
        <div>
          <p className="eyebrow">GESTIÓN · {APP_ENVIRONMENT === "Producción" ? "DATOS OPERATIVOS" : "ENTORNO LOCAL"}</p>
          <h2>{c.title}</h2>
        </div>
        <div>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setQuoteLines([]);
              if (active === "Pedidos") setClientSearch("");
              const nextForm = (
                  (c.movementFilter && active !== "Entradas")
                  ? { movement_type: c.movementFilter || "Entrada", movement_date: tabletTodayInput(), created_by: user?.username || "Usuario local" }
                  : active === "Devoluciones"
                    ? { return_date: tabletTodayInput(), status: "Pendiente", reviewed_by: "", authorized_by: "" }
                  : c.statusFilter
                    ? { status: "Preparando", packages: 1 }
                  : active === "Productos"
                    ? { created_at: tabletTodayInput(), preorder: "1", product_tracking_code: "Sin seguimiento", unit: "unidad", vat: "21", inventory_valuation_method: "FIFO", accounting_product_group: "Mercaderías", accounting_vat_group: "21%", inventory_register_group: "Mercaderías", product_status: "Activo" }
                  : active === "Gastos y tickets"
                    ? { expense_date: tabletTodayInput(), category: "Otros", vat: "21", payment_method: "Tarjeta" }
                  : isOrderForm || active === "Pedidos"
                    ? { code: nextOrderCode(), status: "Nuevo", created_by: user?.username || "Usuario local" }
                    : {}
              );
              beginForm(nextForm);
              setFormOpen(true);
            }}
          >
            {active === "Pedidos" ? "Crear pedido" : createActionLabels[active] || "Crear registro"}
          </button>{" "}
          {active === "Facturas" && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setQuoteLines([]);
                beginForm({ code: `PRO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`, issue_date: tabletTodayInput(), status: "Proforma", vat: 21 });
                setFormOpen(true);
              }}
            >
              Crear proforma
            </button>
          )}{" "}
          {active === "Pedidos" && <button type="button" className="button secondary" onClick={() => { setBillingOpen(true); void loadBillingOrders(); }}>Facturar pedidos</button>}{" "}
          {!isLoadPreparation && <>
            <button type="button" className="button secondary icon-action" onClick={download} aria-label="Descargar Excel/CSV" title="Descargar Excel/CSV">
              <ToolbarIcon name="download" />
              <span className="icon-action-label">Descargar Excel/CSV</span>
            </button>{" "}
            <label className="import-button icon-action" aria-label="Importar CSV" title="Importar CSV">
              <ToolbarIcon name="upload" />
              <span className="icon-action-label">Importar CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) =>
                  e.target.files?.[0] && importCsv(e.target.files[0])
                }
              />
            </label>{" "}
            <button
              type="button"
              className="button secondary icon-action"
              onClick={downloadTemplate}
              aria-label="Descargar plantilla"
              title="Descargar plantilla"
            >
              <ToolbarIcon name="template" />
              <span className="icon-action-label">Descargar plantilla</span>
            </button>
          </>}
        </div>
      </div>}
      {dbError && <div className="db-error">{dbError}</div>}
      {error && <div className="error-message" role="alert">{error}</div>}
      {productSaveMessage && active === "Productos" && <div className="success-message" role="status">{productSaveMessage}</div>}
      {!isLoadPreparation && active !== "Pedidos" && <BusinessRelatedPanels active={active} rows={rows} lookups={lookups} onNavigate={onNavigate} />}
      {isLoadPreparation && <div className="prep-export-row"><button type="button" className="button secondary icon-action" onClick={download} aria-label="Descargar Excel/CSV" title="Descargar Excel/CSV"><ToolbarIcon name="download" /><span className="icon-action-label">Descargar Excel/CSV</span></button></div>}
      {isLoadPreparation && <PreparationDayCards rows={preparationRows} lookups={lookups} dateFilter={preparationDateFilter} onDateFilterChange={setPreparationDateFilter} onOpen={(row) => void openPreparationRow(row)} />}
      {active === "Gastos y tickets" && (
        <ExpenseScanner
          clients={lookups.clients || []}
          actor={user?.username || "Usuario local"}
          onCreated={(created) => setRows((current) => [created, ...current])}
        />
      )}
      <details
        ref={formAccordionRef}
        className={`form-accordion${active === "Productos" ? " product-form-accordion" : ""}${usesRecordModal && editing ? " record-edit-modal" : ""}`}
        open={formOpen || !!editing}
        onToggle={(e: any) => { if (e.currentTarget.open) setFormOpen(true); else closeForm(); }}
      >
        <summary>
          {formTitle}{formDirty && <em className="unsaved-indicator"> · Cambios sin guardar</em>}{" "}
          <span>{formOpen || editing ? "−" : "+"}</span>
        </summary>
        <form className={`record-form${active === "Productos" ? " product-master-form" : ""}`} onSubmit={save}>
          {active === "Presupuestos" && editing && <div className="quote-record-toolbar" role="toolbar" aria-label="Acciones del presupuesto">
            <div><b>Presupuesto comercial</b><small>Previsualiza, envía al cliente o conviértelo en pedido conservando este documento.</small></div>
            <div><button type="button" className="button secondary" onClick={() => void openPreview(editing)}>Vista previa / PDF</button><button type="button" className="button secondary" onClick={() => void sendQuoteToClient(editing)}>Enviar al cliente</button><button type="button" className="button primary" disabled={editing.status === "Convertido"} onClick={() => void convertQuoteToOrder(editing)}>{editing.status === "Convertido" ? "Convertido a pedido" : "Convertir a pedido"}</button></div>
          </div>}
          {active === "Entradas" ? (
            <GoodsReceiptForm
              lookups={lookups}
              actor={user?.username || "Usuario local"}
              onCreated={(created) => {
                setRows((current) => [created, ...current]);
                closeForm(true);
              }}
            />
          ) : active === "Productos" ? (
            <>
              <div className="product-master-toolbar" aria-label="Acciones de la ficha de producto">
                <span>Ficha de producto</span>
                <small>Completa los datos por bloques y conserva el control de costes, stock y reposición.</small>
                <div>
                  <button type="button" className="button secondary" onClick={() => { if (window.confirm("¿Limpiar todos los campos de esta ficha? Se perderán los cambios actuales.")) beginForm({}); }}>Limpiar ficha</button>
                  <button type="button" className="button secondary" onClick={() => setForm((current: any) => ({ ...current, product_status: "Activo" }))}>Marcar activo</button>
                </div>
              </div>
              <section className="product-photo-editor" aria-labelledby="product-photo-editor-title">
                <div className="product-photo-editor-preview">
                  {productDisplayImageSource(form, true)
                    ? <img src={productDisplayImageSource(form, true)} alt={productImageSource(form, true) ? `Vista previa de ${form.name || "producto"}` : `Imagen de referencia para ${form.name || "producto"}`} />
                    : <span aria-hidden="true">Sin imagen</span>}
                </div>
                <div className="product-photo-editor-content">
                  <div>
                    <b id="product-photo-editor-title">Imagen del producto</b>
                    <small>{form.photo_data ? "Nueva imagen seleccionada; se guardará al confirmar." : form.photo_url ? "Imagen actual de Cloudinary." : "Imagen de referencia Cloudinary; añade la foto propia cuando esté disponible."}</small>
                  </div>
                  <label className="button secondary product-photo-select">
                    {form.photo_url || form.photo_data ? "Cambiar imagen" : "Añadir imagen"}
                    <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) attachProductPhoto(file); }} />
                  </label>
                  {(form.photo_url || form.photo_data) && <button type="button" className="button secondary" onClick={() => setForm((current: any) => ({ ...current, photo_name: null, photo_mime: null, photo_data: null, photo_url: null, photo_public_id: null, photo_thumbnail_url: null, photo_web_url: null, photo_bytes: 0, photo_width: 0, photo_height: 0, photo_format: null }))}>Quitar imagen</button>}
                  <small className="product-photo-editor-note">Se optimiza automáticamente al guardarla y se generan versiones para miniatura y web.</small>
                </div>
              </section>
              {productSections.map((section, sectionIndex) => (
                <details className="product-master-section" key={section.title} open={sectionIndex < 2}>
                  <summary><b>{section.title}</b><span>Mostrar más/menos</span></summary>
                  <div className="product-master-grid">
                    {section.fields.map((field) => {
                      const index = c.fields.indexOf(field);
                      return index >= 0 ? renderFormField(field, index) : null;
                    })}
                  </div>
                </details>
              ))}
            </>
          ) : isOrderForm ? (
            <>
            {editing && <div className="order-record-toolbar" role="toolbar" aria-label="Acciones del pedido">
              <div><b>{isOrderSent(editing) ? "Pedido cerrado" : "Pedido editable"}</b><small>{isOrderSent(editing) ? "El pedido ya ha salido del almacén; consulta su documento desde aquí." : "Puedes modificar los datos y las líneas antes de enviarlo."}</small></div>
              <div>{!isOrderSent(editing) && <>{editing.status === "Bloqueado" || editing.status === "Pospuesto" ? <button type="button" className="button primary" onClick={() => void manageOrder(editing, "Pendiente")}>Reactivar pedido</button> : <><button type="button" className="button secondary" onClick={() => void manageOrder(editing, "Bloqueado")}>Bloquear pedido</button><button type="button" className="button secondary" onClick={() => void manageOrder(editing, "Pospuesto")}>Posponer pedido</button></>}<button type="button" className="button danger" onClick={() => void manageOrder(editing, "Cancelado")}>Anular pedido</button></>}{<button type="button" className="button secondary" onClick={() => void openPreview(editing)}>Ver detalle</button>}{getOrderShipment(editing) ? <button type="button" className="button workflow" onClick={() => void openOrderLoadNote(editing)}>Abrir nota de carga</button> : <button type="button" className="button workflow" onClick={() => void createOrderLoadNote(editing)}>Crear nota de carga</button>}</div>
            </div>}
            <details className="order-general-accordion" open>
              <summary><b>Datos generales del pedido</b><span><em className="order-created-date">Fecha del pedido: {formatSpanishDateValue(String(form.created_at || tabletTodayInput()).slice(0, 10), false)}</em> · {orderGeneralComplete ? <em className="accordion-complete" title="Campos obligatorios completos">✓ Completo</em> : <em className="accordion-pending">Pendiente de completar</em>} · Mostrar más/menos</span></summary>
              <div className="order-general-fields">
                {c.fields.filter((f: string) => !["product_id", "quantity", "unit_price", "discount", "amount", "billing_status", "payment_status", "shipping_status", "prepared_by", "shipped_by", "delivered_by"].includes(f)).map((f: string) => renderFormField(f, c.fields.indexOf(f)))}
              </div>
            </details>
            </>
          ) : c.fields.map((f: string) => renderFormField(f, c.fields.indexOf(f)))}
          {(active === "Presupuestos" || isOrderForm) && (
            <section className="quote-lines-editor">
              <div className="quote-lines-head"><div><b>Líneas del {isOrderForm ? "pedido" : "presupuesto"}</b><small>Busca y añade varios productos como en un carrito.</small></div></div>
              <div className="quote-line-add">
                <label className="quote-line-field quote-line-product"><span>Producto</span><div className="quote-product-picker"><input aria-label="Buscar producto" autoComplete="off" placeholder="Buscar por nombre o SKU…" value={quoteProductSearch} onChange={(event) => { const value = event.target.value; const product = (lookups.products || []).find((item: any) => String(item.name).toLowerCase() === value.trim().toLowerCase() || String(item.sku || "").toLowerCase() === value.trim().toLowerCase()); const factor = quoteUnitsFactor(product, quoteLineDraft.quantity_unit); setQuoteProductSearch(value); setQuoteLineDraft({ ...quoteLineDraft, product_id: product ? String(product.id) : "", total_units: product && factor > 0 ? String(Number(quoteLineDraft.quantity || 1) * factor) : "", unit_price: product ? String(Number(product.unit_price || 0) * factor) : quoteLineDraft.unit_price }); }} />{quoteProductSearch && <button type="button" className="quote-product-clear" aria-label="Limpiar producto" onClick={() => { setQuoteProductSearch(""); setQuoteLineDraft({ ...quoteLineDraft, product_id: "", total_units: "", unit_price: "0" }); }}>×</button>}{quoteProductSearch.trim() && !quoteLineDraft.product_id && <div className="quote-product-suggestions">{(lookups.products || []).filter((item: any) => `${item.name || ""} ${item.sku || ""} ${item.brand || ""}`.toLowerCase().includes(quoteProductSearch.trim().toLowerCase())).slice(0, 8).map((item: any) => <button type="button" key={item.id} onClick={() => { const factor = quoteUnitsFactor(item, quoteLineDraft.quantity_unit); setQuoteProductSearch(`${item.name}${item.sku ? ` · ${item.sku}` : ""}`); setQuoteLineDraft({ ...quoteLineDraft, product_id: String(item.id), total_units: factor > 0 ? String(Number(quoteLineDraft.quantity || 1) * factor) : "", unit_price: String(Number(item.unit_price || 0) * factor) }); }}><b>{item.name}</b><small>{[item.sku, item.brand, item.category].filter(Boolean).join(" · ") || "Sin referencia"}</small></button>)}{!(lookups.products || []).some((item: any) => `${item.name || ""} ${item.sku || ""} ${item.brand || ""}`.toLowerCase().includes(quoteProductSearch.trim().toLowerCase())) && <span className="quote-product-no-results">No hay productos que coincidan.</span>}</div>}</div></label>
                <label className="quote-line-field"><span>Tipo de cantidad</span><select aria-label="Tipo de cantidad" value={quoteLineDraft.quantity_unit} onChange={(event) => { const value = event.target.value; const product = (lookups.products || []).find((item: any) => Number(item.id) === Number(quoteLineDraft.product_id)); const factor = quoteUnitsFactor(product, value); setQuoteLineDraft({ ...quoteLineDraft, quantity_unit: value, total_units: product && factor > 0 ? String(Number(quoteLineDraft.quantity || 1) * factor) : "", unit_price: product ? String(Number(product.unit_price || 0) * factor) : quoteLineDraft.unit_price }); }}><option value="unidad">Unidad</option><option value="caja">Caja</option><option value="pack_4">Pack de 4</option><option value="pack_6">Pack de 6</option><option value="palet">Palé</option></select></label>
                <label className="quote-line-field"><span>Cantidad</span><input aria-label="Cantidad" type="number" min="1" step="any" value={quoteLineDraft.quantity} onChange={(event) => { const value = event.target.value; const factor = quoteUnitsFactor(selectedQuoteProduct, quoteLineDraft.quantity_unit); setQuoteLineDraft({ ...quoteLineDraft, quantity: value, total_units: selectedQuoteProduct && factor > 0 ? String(Number(value || 0) * factor) : "" }); }} /></label>
                <label className="quote-line-field"><span>Precio del formato (€)</span><input aria-label="Precio del formato" type="number" min="0" step="any" value={quoteLineDraft.unit_price} onChange={(event) => setQuoteLineDraft({ ...quoteLineDraft, unit_price: event.target.value })} /></label>
                {isOrderForm ? <label className="quote-line-field"><span>Unidades totales{quoteLineDraft.product_id ? " *" : ""}</span><input aria-label="Unidades totales" type="number" min="1" step="any" required={Boolean(quoteLineDraft.product_id)} value={quoteTotalUnits} onChange={(event) => setQuoteLineDraft({ ...quoteLineDraft, total_units: event.target.value })} placeholder="Indica las unidades" /></label> : <label className="quote-line-field"><span>Descuento %</span><input aria-label="Descuento %" type="number" min="0" max="100" step="any" value={quoteLineDraft.discount} onChange={(event) => setQuoteLineDraft({ ...quoteLineDraft, discount: event.target.value })} /></label>}
                <button type="button" className="button secondary" onClick={addQuoteLine}>＋ Añadir línea</button>
              </div>
              {quoteLines.length ? <div className="quote-lines-list">{quoteLines.map((line, index) => <div className="quote-line-row" key={`${line.product_id}-${index}`}><span><b>{line.product_name}</b></span><span className="quote-line-detail"><b>{line.quantity_requested || line.quantity} {quantityUnitLabel(line.quantity_unit)}</b><small>{Number(line.quantity)} unidades totales · {Number(line.format_price ?? line.unit_price).toLocaleString("es-ES", { style: "currency", currency: "EUR" })} por formato</small></span><strong>{Number(line.amount).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong><button type="button" aria-label={`Quitar ${line.product_name}`} onClick={() => setQuoteLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>×</button></div>)}</div> : <p className="quote-lines-empty">Todavía no has añadido productos.</p>}
              <div className="quote-lines-total"><span>Total del {isOrderForm ? "pedido" : "presupuesto"}</span><strong>{quoteLines.reduce((sum, line) => sum + Number(line.amount || 0), 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong></div>
            </section>
          )}
          {active === "Productos" && <>
            <section className="product-form-codes" aria-labelledby="product-form-codes-title">
              <div className="product-form-codes-head">
                <div><b id="product-form-codes-title">Códigos del producto</b><small>Se generan con el código de barras, el número proveedor o la referencia disponible.</small></div>
                <span>Vista previa y descarga</span>
              </div>
              <ProductCodePreview code={String(form.barcode || form.sku || form.category_code || "EXC-PRODUCTO")} name={form.name} price={Number(form.unit_price || 0)} />
            </section>
          </>}
          {active === "Gastos y tickets" && (
            <label className="expense-attachment-field">
              Ticket o justificante
              <input
                type="file"
                accept="image/*,.pdf,application/pdf"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) attachExpenseFile(file);
                }}
              />
              <small>
                Puedes hacer una foto desde la tablet o subir una imagen/PDF.
                {form.attachment_name
                  ? ` Archivo: ${form.attachment_name}`
                  : ""}
              </small>
            </label>
          )}
          {active !== "Entradas" && <button className="button primary">
            {editing ? "Guardar cambios" : formTitle}
          </button>}
          {editing && active !== "Entradas" && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                closeForm();
              }}
            >
              Cancelar
            </button>
          )}
        </form>
      </details>
      {productConfirmOpen && active === "Productos" && (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Confirmar producto">
          <section className="preview-card product-confirm-card">
            <header className="preview-header"><div><b>Confirmar producto</b><small>Revisa la ficha antes de guardar.</small></div><button type="button" className="preview-close" aria-label="Cerrar" onClick={() => setProductConfirmOpen(false)}>×</button></header>
            <div className="product-confirm-grid">
              {[['Producto', form.name], ['Número proveedor', form.sku], ['Descripción', form.description], ['Unidad base', form.unit], ['Categoría', form.category], ['Código categoría', form.category_code], ['Fecha de alta', form.created_at], ['Almacén', (lookups.warehouses || []).find((item: any) => Number(item.id) === Number(form.warehouse_id))?.name || form.warehouse_id], ['Estante', form.warehouse_location], ['Seguimiento', form.product_tracking_code], ['Coste unitario', form.cost_price], ['Coste último directo', form.last_direct_cost || form.cost_price], ['Incremento de venta', form.markup_percent], ['Precio de venta', form.unit_price], ['Grupo contable', form.accounting_product_group], ['IVA', form.accounting_vat_group], ['Proveedor', (lookups.suppliers || []).find((item: any) => Number(item.id) === Number(form.supplier_id))?.name || form.supplier_id]].map(([label, value]) => <div key={label}><small>{label}</small><b>{String(value || '—')}</b></div>)}
            </div>
            <ProductCodePreview code={String(form.barcode || form.sku || form.category_code || "EXC-PRODUCTO")} name={form.name} price={Number(form.unit_price || 0)} />
            <footer className="preview-actions"><button type="button" className="button secondary" onClick={() => setProductConfirmOpen(false)}>Volver a editar</button><button type="button" className="button primary" onClick={() => { setProductConfirmOpen(false); void saveRecord({ preventDefault() {} }, formRef.current); }}>Confirmar y guardar producto</button></footer>
          </section>
        </div>
      )}
      {active === "Documentos" && (
        <section className="document-template-library">
          <div className="document-template-library-head">
            <div>
              <b>Biblioteca de documentos</b>
              <span>Abre una plantilla para verla como documento, imprimirla o descargar su contenido.</span>
            </div>
            <span>{rows.length} plantillas</span>
          </div>
          <div className="document-template-cards">
            {rows.map((row) => (
              <button type="button" className="document-template-card" key={row.id} onClick={() => setDocumentPreview(row)}>
                <span className="document-template-card-icon">{row.type === "Contrato" ? "§" : row.type === "Correo" ? "@" : "▤"}</span>
                <span className="document-template-card-body">
                  <b>{row.title}</b>
                  <small>{row.type} · {row.format || "HTML"}</small>
                  <em>{row.description || "Plantilla disponible para editar"}</em>
                </span>
                <span className="document-template-card-arrow">Abrir →</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className={`panel table-panel${loading ? " is-loading" : ""}`}>
        <div className="table-tools">
          <div className="table-tools-primary">
          <input
            placeholder={isProducts ? "Buscar por nombre, SKU, referencia o código..." : "Buscar en columnas principales..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="list-count" role="status">
            {loading ? "Cargando registros…" : `${filteredRows.length} registros${totalPages > 1 ? ` · página ${currentPage}/${totalPages}` : ""}`}
          </span>
          {quickViewOptions.length > 1 && <div className="saved-views" aria-label="Vistas rápidas">
            <span className="saved-views-label">Vistas</span>
            {quickViewOptions.map((option) => <button key={option.value} type="button" className={`saved-view-button${quickView === option.value ? " is-active" : ""}`} aria-pressed={quickView === option.value} onClick={() => { setQuickView(option.value); try { localStorage.setItem(`excluvas.quick-view.${c.api}`, option.value); } catch {} }}>{option.label}</button>)}
          </div>}
          </div>
          <div className="table-tools-filters">
          {active === "Pedidos" && <select className="billing-filter-select" value={billingFilter} onChange={(event) => setBillingFilter(event.target.value)} aria-label="Filtrar pedidos por facturación"><option value="todos">Facturación: todos</option><option value="pendientes">Sin facturar</option><option value="facturados">Facturados</option></select>}
          {active === "Pedidos" && <select className="billing-filter-select" value={shippingFilter} onChange={(event) => setShippingFilter(event.target.value)} aria-label="Filtrar pedidos por envío"><option value="todos">Envío: todos</option><option value="pendientes">Pendientes de enviar</option><option value="enviados">Enviados o entregados</option></select>}
          {listFilterActive && <>
            <label className="list-filter-field">Cliente<select value={listClient} onChange={(event) => setListClient(event.target.value)} aria-label={`Filtrar ${active.toLowerCase()} por cliente`}><option value="">Todos los clientes</option>{(lookups.clients || []).map((client: any) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
            {active === "Compras" && <label className="list-filter-field">Proveedor<select value={listSupplier} onChange={(event) => setListSupplier(event.target.value)} aria-label="Filtrar compras por proveedor"><option value="">Todos los proveedores</option>{(lookups.suppliers || []).map((supplier: any) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>}
            <label className="list-filter-field">Desde<input type="date" value={listDateFrom} onChange={(event) => setListDateFrom(event.target.value)} aria-label={`Fecha inicial de ${active.toLowerCase()}`} /></label>
            <label className="list-filter-field">Hasta<input type="date" value={listDateTo} onChange={(event) => setListDateTo(event.target.value)} aria-label={`Fecha final de ${active.toLowerCase()}`} /></label>
            <label className="list-filter-field">Estado<select value={listStatus} onChange={(event) => setListStatus(event.target.value)} aria-label={`Filtrar ${active.toLowerCase()} por estado`}><option>Todos</option>{listStatusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
            {(listClient || listSupplier || listDateFrom || listDateTo || listStatus !== "Todos") && <button type="button" className="deleted-toggle" onClick={() => { setListClient(""); setListSupplier(""); setListDateFrom(""); setListDateTo(""); setListStatus("Todos"); }}>Limpiar filtros</button>}
          </>}
          {isLoadPreparation && <div className="prep-date-filter" aria-label="Filtrar preparación por fecha"><label>Preparar el día <input type="date" value={preparationDateFilter} onChange={(event) => setPreparationDateFilter(event.target.value)} /></label><button type="button" className={`button ${preparationDateFilter === tabletTodayInput() ? "primary" : "secondary"}`} aria-pressed={preparationDateFilter === tabletTodayInput()} onClick={() => setPreparationDateFilter(tabletTodayInput())}>Hoy</button><button type="button" className={`button ${preparationDateFilter === tabletDateOffset(1) ? "primary" : "secondary"}`} aria-pressed={preparationDateFilter === tabletDateOffset(1)} onClick={() => setPreparationDateFilter(tabletDateOffset(1))}>Mañana</button><button type="button" className={`button ${preparationDateFilter === "" ? "primary" : "secondary"}`} aria-pressed={preparationDateFilter === ""} onClick={() => setPreparationDateFilter("")}>Todos</button></div>}
          {isLoadPreparation && <div className="prep-summary"><b>{filteredRows.length} pedidos a preparar</b><span>{preparationUrgentCount} urgentes</span><span>{preparationIncidentCount} con incidencia</span></div>}
          {active === "Stock" && (
            <select className="stock-sort-select" value={stockSort} onChange={(event) => setStockSort(event.target.value)} aria-label="Ordenar stock">
              <option value="none">Ordenar stock…</option>
              <option value="physical_asc">Stock físico: menor a mayor</option>
              <option value="physical_desc">Stock físico: mayor a menor</option>
              <option value="available_asc">Saldo para cubrir pedidos: menor a mayor</option>
              <option value="available_desc">Saldo para cubrir pedidos: mayor a menor</option>
              <option value="status_asc">Estado: más urgente primero</option>
              <option value="status_desc">Estado: stock saludable primero</option>
            </select>
          )}
          {["Proveedores", "Clientes", "Productos"].includes(active) && (
            <button
              type="button"
              className={`deleted-toggle${showInactive ? " is-active" : ""}`}
              title={showInactive ? "Ocultar los registros dados de baja" : "Mostrar también los registros dados de baja"}
              aria-pressed={showInactive}
              onClick={() => setShowInactive((current) => !current)}
            >
              {showInactive ? "Ocultar bajas" : "Mostrar bajas"}
            </button>
          )}
          <button
            type="button"
            className={`deleted-toggle${showDeleted ? " is-active" : ""}`}
            title={showDeleted ? "Ocultar los registros enviados a la papelera" : "Mostrar los registros enviados a la papelera"}
            aria-pressed={showDeleted}
            onClick={() => setShowDeleted((current) => !current)}
          >
            {showDeleted ? "Ocultar eliminados" : "Mostrar eliminados"}
          </button>
          </div>
        </div>
        {active === "Stock" && <div className="stock-meaning" role="note"><b>Cómo leer la cobertura:</b><span>Stock físico = existencias actuales</span><span>Necesario = unidades requeridas por pedidos abiertos</span><span>Saldo = stock físico − necesario</span><span className="stock-meaning-alert">Saldo negativo = no se pueden cubrir todos los pedidos</span></div>}
        {isProducts && (
          <>
            <div className="product-filters" aria-label="Filtros de productos">
              <select value={productFilters.category} onChange={(event) => updateProductFilters({ category: event.target.value })}>
                <option value="">Todas las familias</option>
                {productCategories.map((value) => <option key={value}>{value}</option>)}
              </select>
              <select value={productFilters.brand} onChange={(event) => updateProductFilters({ brand: event.target.value })}>
                <option value="">Todas las marcas</option>
                {productBrands.map((value) => <option key={value}>{value}</option>)}
              </select>
              <select value={productFilters.stock} onChange={(event) => updateProductFilters({ stock: event.target.value })}>
                <option value="todos">Todo el stock</option>
                <option value="critico">Stock crítico</option>
                <option value="normal">Stock disponible</option>
              </select>
              <select value={productFilters.codes} onChange={(event) => updateProductFilters({ codes: event.target.value })}>
                <option value="todos">Con o sin código</option>
                <option value="sin-codigo">Sin código</option>
                <option value="con-codigo">Con código</option>
              </select>
              <button type="button" className="button secondary" onClick={() => { setSearch(""); updateProductFilters({ category: "", brand: "", stock: "todos", codes: "todos" }); }}>Limpiar filtros</button>
            </div>
            <div className="product-bulk-toolbar">
              <label className="product-select-all"><input type="checkbox" checked={filteredRows.length > 0 && filteredRows.every((row) => selectedProductIds.includes(Number(row.id)))} onChange={(event) => setSelectedProductIds(event.target.checked ? filteredRows.map((row) => Number(row.id)) : [])} /> Seleccionar visibles</label>
              <span>{selectedProductIds.length ? `${selectedProductIds.length} seleccionados` : "Selecciona productos para acciones masivas"}</span>
              <button type="button" className="row-action workflow" disabled={!selectedProductIds.length} onClick={generateCodesForSelected}>Generar códigos</button>
              <button type="button" className="row-action primary" disabled={!selectedProductIds.length} onClick={() => setBatchLabelProducts(rows.filter((row) => selectedProductIds.includes(Number(row.id))))}>Imprimir etiquetas</button>
              <select className="product-bulk-category" defaultValue="" disabled={!selectedProductIds.length} onChange={(event) => { void changeCategoryForSelected(event.target.value); event.currentTarget.value = ""; }}><option value="">Cambiar familia…</option>{productCategories.map((value) => <option key={value}>{value}</option>)}</select>
              <button type="button" className="row-action danger" disabled={!selectedProductIds.length} onClick={deleteSelectedProducts}>Eliminar seleccionados</button>
            </div>
          </>
        )}
        <div className="columns-accordion">
          <button
            type="button"
            className="columns-toggle"
            onClick={() => setColumnsOpen((v) => !v)}
          >
            ▦ Columnas visibles <span>{columnsOpen ? "−" : "+"}</span>
          </button>
          {columnsOpen && (
            <div className="columns-options">
              {c.fields.map((f: string, i: number) => (
                <label key={f}>
                  <input
                    type="checkbox"
                    checked={visibleFields.includes(f)}
                    onChange={() => toggleColumn(f)}
                  />{" "}
                  {c.labels[i] || f}
                </label>
              ))}
            </div>
          )}
        </div>
        <TopHorizontalScroll className="table-scroll">
          <table>
            <thead>
            <tr>
                {isProducts && <th className="product-check-column"><span className="sr-only">Seleccionar</span></th>}
                {isProducts && <th className="product-image-column">Imagen</th>}
                {visibleFields.map((f: string) => (
                  <th key={f} className={isDateField(f) ? "sortable-date-column" : undefined}>
                    <button type="button" className="table-sort-button" onClick={() => { setStockSort("none"); setDateSort(null); setTableSort((current) => current?.field === f ? { field: f, direction: current.direction === "asc" ? "desc" : "asc" } : { field: f, direction: "asc" }); }} aria-label={`Ordenar ${c.labels[c.fields.indexOf(f)] || f}`} title="Ordenar columna">{c.labels[c.fields.indexOf(f)] || f}<span aria-hidden="true">{tableSort?.field === f ? (tableSort.direction === "asc" ? " ↑" : " ↓") : " ↕"}</span></button>
                  </th>
                ))}
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => (
                  <tr key={r.id ?? r.product_id} data-inline-row={r.id ?? r.product_id} data-row-modal={active === "Presupuestos" || active === "Pedidos" || active === "Envíos" || usesRecordModal || active === "Entradas" ? "true" : undefined} className={`${isProducts && Number(r.stock || 0) - Number(r.stock_reserved || 0) <= Number(r.min_stock || 0) ? "product-row-critical" : ""}${isLoadPreparation && Number(r.urgent) === 1 ? " prep-row-urgent" : ""}${isLoadPreparation && r.status === "Preparado con incidencia" ? " prep-row-incident" : ""}${Number(r.deleted) === 1 ? " deleted-row" : ""}${active === "Pedidos" ? " order-list-row" : ""}`} onClick={(event) => { if (inlineEditing === (r.id ?? r.product_id) || (event.target as HTMLElement).closest("button, input, select, textarea, a")) return; if (active === "Entradas") { void openEntryDetail(r); return; } if (active === "Envíos") { void openPreview(r); return; } if (active === "Presupuestos" || active === "Pedidos") { if (active === "Pedidos" && isOrderSent(r)) void openPreview(r); else void openRecordModal(r); return; } if (isLoadPreparation) { void openPreparationRow(r); return; } if (usesRecordModal) { void openRecordModal(r); return; } beginInline(r); }}>
                    {isProducts && <td className="product-check-column" data-label="Seleccionar"><input type="checkbox" checked={selectedProductIds.includes(Number(r.id))} onChange={() => toggleProductSelection(Number(r.id))} aria-label={`Seleccionar ${r.name}`} /></td>}
                    {isProducts && <td className="product-image-column" data-label="Imagen"><button type="button" className={`product-thumbnail-button${productImageSource(r) ? "" : " product-reference-thumbnail"}`} onClick={() => setProductDetail(r)} aria-label={`Abrir imagen de ${r.name}`}>{<img src={productDisplayImageSource(r)} alt={productImageSource(r) ? "" : `Imagen de referencia para ${r.name}`} loading="lazy" />}</button></td>}
                    {visibleFields.map((f: string) => (
                      <td key={f} data-label={c.labels[c.fields.indexOf(f)] || f} className={`${stockCellClass(r, f)}${active === "Stock" && ["stock", "stock_reserved", "available_stock", "min_stock"].includes(f) && Number(r[f]) < 0 ? " stock-negative" : ""}`}>
                        {inlineEditing === (r.id ?? r.product_id) ? (
                          renderInlineEditor(f, r)
                        ) : (
                            f === "billing_status"
                            ? <span className={`billing-status billing-status-${String(r.billing_status || "Sin facturar").toLowerCase().replaceAll(" ", "-")}`}>{r.billing_status || "Sin facturar"}</span>
                            : f === "payment_status"
                            ? <span className={`payment-status payment-status-${getOrderPaymentStatus(r).toLowerCase().replaceAll(" ", "-")}`}>{getOrderPaymentStatus(r)}</span>
                            : f === "shipping_status"
                            ? <span className={`shipping-status shipping-status-${getOrderShippingStatus(r).toLowerCase().replaceAll(" ", "-")}`}>{getOrderShippingStatus(r)}</span>
                            : f === "client_id" && r.client_name
                            ? `${r.client_name}${r.client_city ? ` · ${r.client_city}` : ""}`
                            : (f === "address" || f === "origin_address") && (r[f] === "[object Object]" || (r[f] && typeof r[f] === "object"))
                              ? (typeof r[f] === "object"
                                ? String(r[f].address || r[f].name || r[f].label || "—")
                                : String(getClient(r.client_id)?.address || "—"))
                              : formatTableValue(f, r[f]) === "[object Object]"
                                ? "—"
                                : formatTableValue(f, r[f])
                        )}
                      </td>
                    ))}
                    <td data-label="Acciones">
                      <div className="row-actions">
                        {isLoadPreparation && (
                          <b className="prep-status-badge">{r.status || "Preparando"}</b>
                        )}
                        {active === "Gastos y tickets" && r.attachment_data && (
                          <button
                            className="row-action primary"
                            onClick={() => downloadAttachment(r)}
                          >
                            Ver justificante
                          </button>
                        )}
                        {active === "Productos" && (
                          <>
                            <button className="row-action primary" onClick={() => setProductDetail(r)}>Ficha</button>
                            <button className="row-action primary" onClick={() => setLabelProduct(r)}>Etiqueta y códigos</button>
                            <button className="row-action workflow" onClick={() => duplicateProduct(r)}>Duplicar</button>
                          </>
                        )}
                        {active === "Documentos" && (
                          <button className="row-action primary" onClick={() => setDocumentPreview(r)}>
                            Abrir documento
                          </button>
                        )}
                        {active === "Notas" && (
                          <button className="row-action primary" onClick={() => setNotePreview(r)}>
                            Vista previa
                          </button>
                        )}
                        {(active === "Facturas" ||
                          active === "Albaranes" ||
                          active === "Preparación de pedidos" ||
                          active === "Cobros" ||
                          active === "Compras") && (
                          <button
                            className="row-action primary"
                            onClick={() => void openPreparationRow(r)}
                          >
                            Vista previa
                          </button>
                        )}
                        {active === "Facturas" && (
                          <>
                            <button className="row-action workflow" onClick={() => void openInvoicePdf(r)}>Ver PDF</button>
                            <button className="row-action" onClick={() => void copyInvoiceLink(r)}>Compartir enlace</button>
                            <button className="row-action workflow" onClick={() => void sendInvoiceEmail(r)}>Enviar email</button>
                          </>
                        )}
                        {active === "Albaranes" && (
                          <button
                            className="row-action workflow"
                            onClick={() => convertDeliveryToInvoice(r)}
                          >
                            Crear factura
                          </button>
                        )}
                        {active === "Facturas" && r.status === "Proforma" && (
                          <button className="row-action workflow" onClick={() => convertProformaToInvoice(r)}>
                            Convertir en factura
                          </button>
                        )}
                        {active === "Pedidos" && (
                          <>
                            <button type="button" className="row-action primary" onClick={() => { if (isOrderSent(r)) void openPreview(r); else void openRecordModal(r); }}>
                              Ver detalle
                            </button>
                            <button type="button" className="row-action workflow" onClick={() => void openCommercialDocumentPdf(r, "order")}>Ver PDF</button>
                            <button type="button" className="row-action" onClick={() => void copyCommercialDocumentLink(r, "order")}>Compartir enlace</button>
                            {getOrderShipment(r) ? <button type="button" className="row-action workflow" onClick={() => void openOrderLoadNote(r)}>
                              Abrir nota de carga
                            </button> : <button type="button" className="row-action workflow" onClick={() => void createOrderLoadNote(r)} disabled={String(r.status || "") === "Cancelado"}>
                              Crear nota de carga
                            </button>}
                          </>
                        )}
                        {active === "Presupuestos" && (
                          <>
                            <button type="button" className="row-action primary" onClick={() => void openPreview(r)}>Vista previa / PDF</button>
                            <button type="button" className="row-action workflow" onClick={() => void openCommercialDocumentPdf(r, "quote")}>Ver PDF</button>
                            <button type="button" className="row-action" onClick={() => void copyCommercialDocumentLink(r, "quote")}>Compartir enlace</button>
                            <button type="button" className="row-action workflow" onClick={() => void sendQuoteToClient(r)}>Enviar al cliente</button>
                            <button type="button" className="row-action workflow" disabled={r.status === "Convertido"} onClick={() => void convertQuoteToOrder(r)}>{r.status === "Convertido" ? "Convertido" : "Convertir a pedido"}</button>
                          </>
                        )}
                        {active === "Entradas" && <button className="row-action primary" onClick={() => void openEntryDetail(r)}>Ver detalle</button>}
                        {active === "Envíos" && <button className="row-action primary" onClick={() => void openPreview(r)}>Abrir entrega y firma</button>}
                        {inlineEditing === (r.id ?? r.product_id) ? (
                          <>
                            <button
                              className="row-action save"
                              onClick={() => saveInline(r)}
                            >
                              Guardar
                            </button>
                            <button
                              className="row-action"
                              onClick={() => {
                                setInlineEditing(null);
                                setInlineDraft({});
                              }}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : active === "Pedidos" || active === "Entradas" || active === "Envíos" ? null : (
                          <button
                            className="row-action"
                            onClick={() => usesRecordModal ? void openRecordModal(r) : beginInline(r)}
                          >
                            Editar
                          </button>
                        )}
                        {user?.role === "admin" && active !== "Pedidos" && (Number(r.deleted) === 1 ? (
                          <button className="row-action save" onClick={() => restore(r.id)}>Recuperar</button>
                        ) : (
                          <button className="row-action danger" onClick={() => remove(r.id)}>Eliminar</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TopHorizontalScroll>
      {!loading && sortedRows.length > 0 && <div className="table-pagination" aria-label="Paginación del listado">
        <span>Mostrando {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sortedRows.length)} de {sortedRows.length}</span>
        <label>Filas<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Filas por página"><option value="15">15</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
        <button type="button" className="button secondary" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
        <b>Página {currentPage} de {totalPages}</b>
        <button type="button" className="button secondary" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Siguiente</button>
      </div>}
      {loading && (
        <div className="data-loading" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <LoadingIndicator label="Cargando datos desde la base de datos…" />
        </div>
      )}
      {!loading && !filteredRows.length && (
        <p className="muted empty-row">{rows.length ? "No hay productos que coincidan con los filtros." : "No hay registros todavía."}</p>
      )}
      {deletedUndo && deletedUndo.api === c.api && <div className="undo-toast" role="status"><span>Se ha enviado a la papelera: <b>{deletedUndo.label}</b></span><button type="button" className="button secondary" onClick={() => void undoDelete()}>Deshacer</button></div>}
      </div>
      {active === "Productos" && newSupplierOpen && <div className="preview-overlay" onMouseDown={(event) => event.target === event.currentTarget && !newSupplierSaving && setNewSupplierOpen(false)}><form className="supplier-create-modal" onSubmit={saveNewSupplier}><header className="preview-header"><div><b>Crear proveedor</b><small>Completa los datos del proveedor y quedará seleccionado en el producto.</small></div><button type="button" className="preview-close" aria-label="Cerrar" onClick={() => !newSupplierSaving && setNewSupplierOpen(false)}>×</button></header><div className="supplier-create-grid"><label>Nombre *<input required autoFocus value={newSupplier.name} onChange={(event) => setNewSupplier({ ...newSupplier, name: event.target.value })} /></label><label>NIF/CIF<input value={newSupplier.tax_id} onChange={(event) => setNewSupplier({ ...newSupplier, tax_id: event.target.value })} /></label><label>Persona de contacto<input value={newSupplier.contact} onChange={(event) => setNewSupplier({ ...newSupplier, contact: event.target.value })} /></label><label>Teléfono<input value={newSupplier.phone} onChange={(event) => setNewSupplier({ ...newSupplier, phone: event.target.value })} /></label><label>Email<input type="email" value={newSupplier.email} onChange={(event) => setNewSupplier({ ...newSupplier, email: event.target.value })} /></label><label>Condiciones de pago<input value={newSupplier.payment_terms} onChange={(event) => setNewSupplier({ ...newSupplier, payment_terms: event.target.value })} /></label><label className="supplier-create-wide">Dirección<textarea value={newSupplier.address} onChange={(event) => setNewSupplier({ ...newSupplier, address: event.target.value })} /></label></div><footer className="preview-actions"><button type="button" className="button secondary" onClick={() => setNewSupplierOpen(false)}>Cancelar</button><button className="button primary" disabled={newSupplierSaving}>{newSupplierSaving ? "Guardando…" : "Guardar proveedor"}</button></footer></form></div>}
      {active === "Productos" && labelProduct && (
        <ProductLabelModal
          product={labelProduct}
          actor={user?.username || "Usuario local"}
          onClose={() => setLabelProduct(null)}
          onSaved={(saved) => {
            setRows((current) => current.map((item) => item.id === saved.id ? saved : item));
            setLabelProduct(saved);
          }}
        />
      )}
      {active === "Productos" && productDetail && (
        <ProductDetailDrawer
          product={productDetail}
          onClose={() => setProductDetail(null)}
          onEdit={() => { beginForm({ ...productDetail }, productDetail); setFormOpen(true); setProductDetail(null); }}
          onLabel={() => { setLabelProduct(productDetail); setProductDetail(null); }}
          onDuplicate={() => { void duplicateProduct(productDetail); setProductDetail(null); }}
        />
      )}
      {active === "Productos" && batchLabelProducts.length > 0 && (
        <ProductBatchLabelModal products={batchLabelProducts} onClose={() => setBatchLabelProducts([])} />
      )}
      {active === "Entradas" && entryDetail && (
        <div className="preview-overlay goods-receipt-detail-overlay" role="dialog" aria-modal="true" aria-label="Detalle de entrada" onMouseDown={(event) => event.target === event.currentTarget && setEntryDetail(null)}>
          <section className="preview-card goods-receipt-detail">
            <header className="preview-header"><div><b>Entrada · {entryDetail.code}</b><small>{entryDetail.supplier_name || "Proveedor sin nombre"} · {formatTableValue("receipt_date", entryDetail.receipt_date)} · {entryDetail.warehouse_name || "Almacén"}</small></div><button type="button" className="preview-close" aria-label="Cerrar" onClick={() => setEntryDetail(null)}>×</button></header>
            <div className="goods-receipt-detail-meta"><span><b>Estado</b>{entryDetail.status}</span><span><b>Pedido de compra</b>{entryDetail.purchase_order_code || "Sin vincular"}</span><span><b>Factura de compra</b>{entryDetail.purchase_invoice_code || "Sin vincular"}</span><span><b>Recepcionado por</b>{entryDetail.received_by || "—"}</span><span><b>Validación responsable</b><select aria-label="Validación de la entrada" value={entryDetail.validation_status || "Pendiente"} disabled={entryValidationSaving} onChange={(event) => void validateEntry(event.target.value)}><option>Pendiente</option><option>Validada</option><option>Rechazada</option></select>{entryDetail.validated_by && <small>{entryDetail.validated_by}{entryDetail.validated_at ? ` · ${formatTableValue("created_at", entryDetail.validated_at)}` : ""}</small>}</span><span><b>Diferencia económica</b>{(entryDetail.lines || []).reduce((sum: number, line: any) => sum + Number(line.economic_difference || 0), 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</span></div>
            {entryDetail.notes && <div className="goods-receipt-detail-notes"><b>Notas de la entrada</b><p>{entryDetail.notes}</p></div>}
            <div className="goods-receipt-detail-lines">{(entryDetail.lines || []).map((line: any) => { const locationStatus = String(line.location_verified_status || "Pendiente"); const locationClass = locationStatus === "Validada por lectura" || locationStatus === "Validada manualmente" ? "is-verified" : locationStatus === "No coincide" ? "is-mismatch" : "is-pending"; return <article key={line.id}><div><b>{line.product_name || line.product_name_snapshot}</b><small>{line.sku || "Sin referencia"}{line.substitute_product_name ? ` · Sustituye a: ${line.substitute_product_name}` : ""}</small></div><span>Esperadas <b>{line.expected_quantity}</b></span><span>Recibidas <b>{line.received_quantity}</b></span><span>Daño <b>{line.damaged_quantity || 0}</b> · Sustituidas <b>{line.substituted_quantity || 0}</b></span><strong className={line.status !== "Correcta" ? "goods-receipt-incident-text" : ""}>{line.status}<small>{Number(line.economic_difference || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</small></strong><div className={`goods-receipt-location-check ${locationClass}`}><div><b>Ubicación de almacenaje</b><small>{line.warehouse_location ? `${line.product_warehouse_name || entryDetail.warehouse_name || "Almacén"} · ${line.warehouse_location}` : "Producto sin ubicación asignada"}</small></div><div className="goods-receipt-location-inputs"><label><span>Lectura opcional</span><input aria-label={`Código de ubicación de ${line.product_name || line.product_name_snapshot || "producto"}`} value={entryLocationDrafts[String(line.id)] ?? ""} placeholder={line.warehouse_location || "Escanea ubicación"} disabled={entryLocationSaving === Number(line.id)} onChange={(event) => setEntryLocationDrafts((current) => ({ ...current, [String(line.id)]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void validateEntryLocation(line, "scan"); } }} /></label><label><span>Motivo si no se lee</span><input aria-label={`Motivo de validación manual de ${line.product_name || line.product_name_snapshot || "producto"}`} value={entryLocationReasons[String(line.id)] ?? ""} placeholder="Escribe el motivo" disabled={entryLocationSaving === Number(line.id)} onChange={(event) => setEntryLocationReasons((current) => ({ ...current, [String(line.id)]: event.target.value }))} /></label></div><div className="goods-receipt-location-actions"><BarcodeScanner label="Escanear ubicación" disabled={entryLocationSaving === Number(line.id)} onDetected={(value) => setEntryLocationDrafts((current) => ({ ...current, [String(line.id)]: value }))} /><button type="button" className="button primary" disabled={entryLocationSaving === Number(line.id)} onClick={() => void validateEntryLocation(line, "scan")}>{entryLocationSaving === Number(line.id) ? "Validando…" : "Validar lectura"}</button><button type="button" className="button secondary" disabled={entryLocationSaving === Number(line.id)} onClick={() => void validateEntryLocation(line, "manual")}>Validar manual</button></div><span className="goods-receipt-location-status">{locationStatus === "Pendiente" ? "Ubicación no verificada" : locationStatus}{line.location_verified_by ? ` · ${line.location_verified_by}` : ""}{line.location_verified_reason ? ` · ${line.location_verified_reason}` : ""}</span></div></article>; })}</div>
            {(entryDetail.incidents || []).length > 0 && <section className="goods-receipt-detail-incidents"><b>Incidencias de la entrada</b>{entryDetail.incidents.map((incident: any) => <article key={incident.id}><div><strong>{incident.type}</strong><span>{incident.product_name ? `${incident.product_name} · ` : ""}{incident.description}</span><small>Estado: {incident.status || "Abierta"}{incident.resolved_by ? ` · ${incident.resolved_by}` : ""} · Reclamación: {incident.claim_status || "No reclamada"}</small>{incident.resolution && <small>{incident.resolution}</small>}{Number(incident.economic_difference || 0) !== 0 && <small>Diferencia económica: {Number(incident.economic_difference).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</small>}</div>{(incident.attachments?.length ? incident.attachments : incident.attachment_data ? [{ name: incident.attachment_name, data: incident.attachment_data }] : []).map((attachment: any, attachmentIndex: number) => <a className="goods-receipt-attachment-link" key={`${attachment.name || "adjunto"}-${attachmentIndex}`} href={attachment.url || attachment.data} target="_blank" rel="noreferrer"><img src={attachment.thumbnail_url || attachment.url || attachment.data} alt={attachment.name || "Fotografía de incidencia"} /><small>Ver adjunto</small></a>)}<div className="goods-receipt-incident-actions"><select aria-label={`Estado de incidencia ${incident.type}`} value={["Pendiente", "Abierta"].includes(incident.status || "") ? "Abierta" : incident.status} disabled={entryIncidentSaving === Number(incident.id)} onChange={(event) => void resolveEntryIncident(incident, event.target.value)}><option>Abierta</option><option>En revisión</option><option>Resuelta</option><option>Rechazada</option></select><button type="button" className="button secondary" disabled={entryIncidentSaving === Number(incident.id) || incident.claim_status === "Preparada"} onClick={() => void claimEntryIncident(incident)}>{incident.claim_status === "Preparada" ? "Reclamación creada" : "Crear reclamación"}</button></div></article>)}</section>}
            <footer className="preview-actions"><button type="button" className="button secondary" onClick={() => setEntryEdit(entryDetail)}>Editar datos</button><button type="button" className="button secondary" onClick={() => window.print()}>Imprimir / guardar PDF</button><button type="button" className="button primary" onClick={() => setEntryDetail(null)}>Cerrar</button></footer>
          </section>
        </div>
      )}
      {active === "Entradas" && entryEdit && <GoodsReceiptEditModal receipt={entryEdit} lookups={lookups} actor={user?.username || "Usuario local"} onClose={() => setEntryEdit(null)} onSaved={(updated) => { setEntryDetail(updated); setRows((current) => current.map((row) => Number(row.id) === Number(updated.id) ? { ...row, ...updated } : row)); }} />}
      {active === "Documentos" && documentPreview && (
        <DocumentTemplatePreview
          template={documentPreview}
          onClose={() => setDocumentPreview(null)}
          actor={user?.username || "Usuario local"}
          onSaved={(saved) => {
            setRows((current) => current.map((row) => row.id === saved.id ? saved : row));
            setDocumentPreview(saved);
          }}
        />
      )}
      {preview && (
        <div className="preview-overlay document-preview-overlay" onClick={() => { setPreview(null); setShipmentLabelOpen(false); }}>
          <div
            className="document-preview"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="preview-close" aria-label="Cerrar detalle" onClick={() => { setPreview(null); setShipmentLabelOpen(false); }}>
              ×
            </button>
            <button type="button" className="preview-close-text" onClick={() => { setPreview(null); setShipmentLabelOpen(false); }}>Cerrar detalle</button>
            <p className="eyebrow">
              EXCLUSIVAS INTELIGENTES · DISTRIBUIDORA DE BEBIDAS
            </p>
            <h2>
            {active === "Facturas"
                ? "FACTURA"
                : active === "Albaranes"
                  ? "ALBARÁN"
                  : active === "Preparación de pedidos"
                    ? "NOTA DE CARGA"
                  : active === "Envíos"
                    ? "ENVÍO"
                  : active === "Presupuestos"
                    ? "PRESUPUESTO"
                  : active === "Compras"
                    ? "ORDEN DE COMPRA"
                  : "PEDIDO"}{" "}
              · {preview.code}
            </h2>
            <div className="document-meta">
              <p>
                <b>{active === "Compras" ? "Proveedor" : "Cliente"}</b>
                <br />
                {(active === "Compras" ? previewSupplier?.name : previewClient?.name) ||
                  (previewLoading
                    ? active === "Compras" ? "Cargando proveedor…" : "Cargando cliente…"
                    : active === "Compras" ? "Proveedor no identificado" : "Cliente no identificado")}
                <br />
                {previewAddress || "Dirección no indicada"}
                {previewCity && <><br />{previewCity}</>}
                <br />
                {previewClient?.tax_id || "NIF/CIF no indicado"}
              </p>
              <p>
                <b>Fecha</b>
                <br />
                {preview.issue_date || preview.order_date ||
                  preview.delivery_date ||
                  preview.expected_delivery_at ||
                  new Date().toLocaleDateString("es-ES")}
                <br />
                <b>Estado:</b> {preview.status}
                {isLoadPreparation && <><br /><b>Preparado por:</b> {preview.prepared_by || "Pendiente de asignar"}<br /><b>Horario de entrega:</b> {preview.delivery_window_start && preview.delivery_window_end ? `${String(preview.delivery_window_start).slice(0, 5)}–${String(preview.delivery_window_end).slice(0, 5)}` : "Pendiente de indicar"}</>}
              </p>
            </div>
            {active === "Pedidos" && <OrderWorkflowPanel order={preview} shipment={getOrderShipment(preview)} billingStatus={getOrderBillingStatus(preview)} paymentStatus={getOrderPaymentStatus(preview)} invoice={previewInvoice || getOrderInvoice(preview)} onOpenPayment={() => openPaymentFromOrder(preview)} onNavigate={onNavigate} />}
            {(active === "Pedidos" || active === "Envíos") && (() => {
              const deliveryShipment = active === "Envíos" ? preview : getOrderShipment(preview);
              if (!deliveryShipment) return null;
              return <DeliverySignaturePanel shipment={deliveryShipment} actor={user?.username || "Usuario local"} client={previewClient} lines={previewLines} products={productOptions} onSaved={(updated) => {
                setLookups((current: any) => ({ ...current, shipments: (current.shipments || []).map((item: any) => Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item) }));
                setPreview((current: any) => current ? active === "Envíos" ? { ...current, ...updated } : { ...current, status: "Entregado", delivery_signature_status: updated.delivery_signature_status, delivery_recipient_name: updated.delivery_recipient_name, delivery_signature_at: updated.delivery_signature_at, delivery_signature_by: updated.delivery_signature_by, delivery_signature_note: updated.delivery_signature_note } : current);
                setRows((current) => current.map((item) => active === "Envíos" && Number(item.id) === Number(updated.id) ? { ...item, ...updated } : active === "Pedidos" && Number(item.id) === Number(updated.order_id || deliveryShipment.order_id) ? { ...item, status: "Entregado" } : item));
              }} />;
            })()}
             {!(["Facturas", "Cobros"] as string[]).includes(active) && (previewLocation || previewAddress || previewClient?.address) && <section className="delivery-map-panel" aria-label="Ruta de entrega"><div className="delivery-map-info"><b>Ubicación de entrega</b><span>{previewLocation?.name || "Dirección del cliente"} · {previewAddress || "Dirección no indicada"}</span>{(previewLocation?.geocoding_status === "Geolocalizada" || previewClient?.geocoding_status === "Geolocalizada") ? <small>Ubicación geolocalizada</small> : <small>Pendiente de geolocalizar</small>}{previewLat && previewLon && <small className="delivery-distance">{previewWarehouseDistanceKm === null ? "Calculando distancia desde el almacén…" : previewWarehouseDistanceKm >= 0 ? `${previewWarehouseDistanceKm.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km estimados desde ${previewWarehouse?.name || "el almacén"}` : "Distancia no disponible: completa las coordenadas del almacén."}</small>}</div><div className="delivery-map-visual">{previewLat && previewLon ? <><IntegratedMap locations={[{ latitude: previewLat, longitude: previewLon, name: previewLocation?.name || previewClient?.name }]} /><a className="button primary delivery-map-navigation" href={previewNavigationUrl} target="_blank" rel="noreferrer"><ToolbarIcon name="map" /> Navegar con Google Maps</a></> : <a className="button secondary icon-action map-action" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(previewMapQuery)}`} target="_blank" rel="noreferrer" aria-label="Buscar dirección en Google Maps" title="Buscar dirección en Google Maps"><ToolbarIcon name="map" /><span className="icon-action-label">Buscar en mapa</span></a>}</div></section>}
            {isLoadPreparation && <section className="preparation-delivery-panel" aria-label="Editar dirección de entrega">
              <div className="preparation-delivery-head"><div><b>Dirección de entrega</b><small>Se guarda en este pedido y en su nota de carga.</small></div></div>
              <div className="preparation-delivery-fields">
                <label>Dirección de entrega<input aria-label="Dirección de entrega" value={preparationAddressDraft} onChange={(event) => { setPreparationAddressDraft(event.target.value); setPreparationAddressError(""); setPreparationAddressMessage(""); }} disabled={preparationAddressSaving} /></label>
                <label>Ciudad<input aria-label="Ciudad de entrega" value={preparationCityDraft} onChange={(event) => { setPreparationCityDraft(event.target.value); setPreparationAddressError(""); setPreparationAddressMessage(""); }} disabled={preparationAddressSaving} /></label>
                <label>Hora de apertura<input aria-label="Hora de apertura de entrega" type="time" value={preparationOpeningTimeDraft} onChange={(event) => { setPreparationOpeningTimeDraft(event.target.value); setPreparationAddressError(""); setPreparationAddressMessage(""); }} disabled={preparationAddressSaving} /></label>
                <label>Hora de cierre<input aria-label="Hora de cierre de entrega" type="time" value={preparationClosingTimeDraft} onChange={(event) => { setPreparationClosingTimeDraft(event.target.value); setPreparationAddressError(""); setPreparationAddressMessage(""); }} disabled={preparationAddressSaving} /></label>
              </div>
              <label className="preparation-update-client"><input type="checkbox" checked={preparationUpdateClient} onChange={(event) => setPreparationUpdateClient(event.target.checked)} disabled={preparationAddressSaving} />Actualizar también la ficha del cliente</label>
              {preparationAddressError && <p className="preparation-address-error" role="alert">{preparationAddressError}</p>}
              {preparationAddressMessage && <p className="preparation-address-success" role="status">{preparationAddressMessage}</p>}
              <div className="preparation-delivery-actions"><button type="button" className="button primary" onClick={() => void savePreparationDeliveryAddress()} disabled={preparationAddressSaving}>{preparationAddressSaving ? "Guardando…" : "Guardar dirección"}</button></div>
            </section>}
            {isLoadPreparation && (!["Preparado", "Preparado con incidencia"].includes(String(preview.status || "")) && (!String(preview.prepared_by || "").trim() || String(preview.status || "") !== "Preparando")) && (
              <div className="preparation-start-banner">
                <div><b>{String(preview.status || "") === "Preparando" ? "Preparación sin responsable asignado" : "Pedido pendiente de preparar"}</b><small>Al iniciar quedará asignado a {user?.username || "tu usuario"} con fecha y hora.</small></div>
                <button type="button" className="button primary" onClick={() => void startPreparation()}>{String(preview.status || "") === "Preparando" ? "Asignarme la preparación" : "Empezar preparación"}</button>
              </div>
            )}
            {isLoadPreparation && (
              <div className="load-instructions">
                <b>Indicaciones para almacén y reparto</b>
                {Number(preview.urgent) === 1 && <strong className="prep-urgent-banner">⚠ PEDIDO URGENTE</strong>}
                <p>{preview.notes || "Sin indicaciones adicionales."}</p>
              </div>
            )}
            {isLoadPreparation && <section className="preparation-annotation-panel" aria-label="Anotaciones e incidencias de preparación">
              <div className="preparation-annotation-head"><div><b>Anotaciones de almacén</b><small>Registra cualquier observación sobre este pedido durante la preparación.</small></div></div>
              <textarea aria-label="Anotación de preparación" value={preparationAnnotation} onChange={(event) => { setPreparationAnnotation(event.target.value); setPreparationAnnotationError(""); setPreparationAnnotationMessage(""); }} placeholder="Ej.: una caja llega rota, falta una referencia o hay que avisar al comercial…" rows={3} disabled={preparationAnnotationSaving} />
              {preparationAnnotationError && <p className="preparation-annotation-error" role="alert">{preparationAnnotationError}</p>}
              {preparationAnnotationMessage && <p className="preparation-annotation-success" role="status">{preparationAnnotationMessage}</p>}
              {preparationScanMessage && <p className={`preparation-scan-message ${preparationScanMessage.kind}`} role="status">{preparationScanMessage.text}</p>}
              <div className="preparation-annotation-actions"><button type="button" className="button secondary" disabled={preparationAnnotationSaving || !preparationAnnotation.trim()} onClick={() => void savePreparationAnnotation(false)}>Guardar anotación</button><button type="button" className="button danger" disabled={preparationAnnotationSaving || !preparationAnnotation.trim()} onClick={() => void savePreparationAnnotation(true)}>{preparationAnnotationSaving ? "Guardando…" : "Generar incidencia"}</button></div>
            </section>}
            {active === "Cobros" && (
              <section className="payment-preview-details" aria-label="Origen del cobro">
                <div><span>Importe cobrado</span><strong>{Number(preview.amount || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong></div>
                <div><span>Factura de origen</span><strong>{previewInvoice?.code || (lookups.invoices || []).find((invoice: any) => Number(invoice.id) === Number(preview.invoice_id))?.code || (preview.invoice_id ? `Factura #${preview.invoice_id}` : "No vinculada")}</strong></div>
                <div><span>Cliente</span><strong>{previewClient?.name || "No indicado"}</strong></div>
                <div><span>Fecha del cobro</span><strong>{preview.payment_date ? String(preview.payment_date).slice(0, 10) : "No indicada"}</strong></div>
                <div><span>Método de pago</span><strong>{preview.method || "No indicado"}</strong></div>
                <div><span>Referencia</span><strong>{preview.reference || "Sin referencia"}</strong></div>
                <div className="payment-preview-notes"><span>Notas</span><p>{preview.notes || "Sin notas adicionales."}</p></div>
              </section>
            )}
            {active !== "Cobros" && <table className="preview-lines">
              {/** En pedidos y documentos con líneas mostramos el formato además de las unidades físicas. */}
              <thead>
                <tr>
                  {isLoadPreparation ? <><th>Ubicación</th><th>Producto</th></> : <th>Producto</th>}
                  <th>{isLoadPreparation ? "Cantidad pedida" : ["Pedidos", "Presupuestos", "Facturas", "Albaranes"].includes(active) ? "Cantidad y formato" : "Cantidad"}</th>
                  {isLoadPreparation && <th>Cantidad preparada</th>}
                  {isLoadPreparation && <th>Estado</th>}
                  {isLoadPreparation && <th>Acciones</th>}
                  {!isLoadPreparation && <th>Precio</th>}
                  {!isLoadPreparation && <th>Importe</th>}
                </tr>
              </thead>
              <tbody>
                {previewLines.map((line: any) => {
                  const product = productOptions.find((p: any) => Number(p.id) === Number(line.product_id));
                  const unitPrice = Number(line.unit_price ?? line.unit_cost ?? product?.unit_price ?? 0);
                  const amount = Number(line.amount ?? (Number(line.quantity || 0) * unitPrice));
                  const requestedQuantity = Number(line.quantity || 0);
                  const preparedQuantity = Number(line.prepared_quantity || 0);
                  // La cantidad real manda sobre el estado histórico: si se
                  // corrige una incidencia y ya coincide con lo pedido, la
                  // línea debe volver a mostrarse como completa antes de
                  // pulsar Validar.
                  const lineIsComplete = preparedQuantity >= requestedQuantity;
                  const lineIsValidated = Number(line.prepared) === 1 && line.preparation_status === "Preparado";
                  const displayLineStatus = lineIsComplete
                    ? lineIsValidated ? "Validado" : "Completo"
                    : line.preparation_status === "Incidencia"
                      ? "Incidencia"
                      : "Incompleto";
                  return (
                  <Fragment key={line.id}>
                  <tr key={line.id}>
                    {isLoadPreparation ? <><td><div className="prep-location-field"><input aria-label={`Ubicación de ${product?.name || "producto"}`} value={locationDrafts[String(product?.id)] ?? product?.warehouse_location ?? ""} placeholder="Ej. B-126" onChange={(event) => setLocationDrafts((current) => ({ ...current, [String(product?.id)]: event.target.value }))} disabled={locationSavingId === -1} /><BarcodeScanner label="Escanear ubicación" disabled={locationSavingId === -1} onDetected={(value) => setLocationDrafts((current) => ({ ...current, [String(product?.id)]: value }))} /></div></td><td><div className="prep-product-cell"><b>{product?.name || `Producto #${line.product_id}`}</b><BarcodeScanner label="Escanear producto" onDetected={(value) => { const normalized = value.trim().toLowerCase(); const matched = productOptions.find((option: any) => [option.barcode, option.sku, option.code].some((candidate: any) => String(candidate || "").trim().toLowerCase() === normalized)); if (!matched) return setPreparationScanMessage({ text: "Código no reconocido. Revisa el producto o usa el campo manual.", kind: "error" }); if (Number(matched.id) !== Number(line.product_id)) return setPreparationScanMessage({ text: "El código corresponde a otro producto. Revisa la línea.", kind: "warning" }); setPreparationScanMessage({ text: `Producto correcto: ${matched.name || product?.name || "producto"}.`, kind: "success" }); }} /></div></td></> : <td>{product?.name || `Producto #${line.product_id}`}</td>}
                    <td>{isLoadPreparation || (["Pedidos", "Presupuestos", "Facturas", "Albaranes"].includes(active) && (line.quantity_unit || line.quantity_requested)) ? <div className="prep-quantity-summary"><b>{line.quantity_requested || line.quantity} {quantityUnitLabel(line.quantity_unit)}{(line.quantity_requested || line.quantity) !== 1 && !String(line.quantity_unit || "unidad").startsWith("pack_") ? "s" : ""}</b><small>· {line.quantity} unidades totales</small></div> : line.quantity}</td>
                    {isLoadPreparation && <td><div className="prep-line-controls"><input className="prep-real-quantity" aria-label={`Cantidad preparada de ${product?.name || "producto"}`} type="number" min="0" max={requestedQuantity} step="any" value={line.prepared_quantity ?? 0} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const raw = event.target.value; setPreviewLines((current) => current.map((item) => { if (item.id !== line.id) return item; if (raw === "") return { ...item, prepared_quantity: "" }; const requested = Number(item.quantity || 0); return { ...item, prepared_quantity: Math.min(requested, Math.max(0, Number(raw) || 0)) }; })) }} onBlur={() => { if (line.prepared_quantity === "") setPreviewLines((current) => current.map((item) => item.id === line.id ? { ...item, prepared_quantity: 0 } : item)); }} /><span className="prep-unit-caption">uds.</span></div></td>}
                    {isLoadPreparation && <td><span className={`prep-line-status prep-line-status-${displayLineStatus.toLowerCase()}`}>{displayLineStatus}</span></td>}
                    {isLoadPreparation && <td><div className="prep-line-actions">{line.preparation_status === "Incidencia" && !lineIsComplete ? <span className="prep-incident-open">Incidencia registrada</span> : <button type="button" className={`row-action ${lineIsValidated ? "validated" : "save"}`} disabled={lineIsValidated || preparationLineSavingId !== null} onClick={() => void markPreparationLine(line, true)}>{preparationLineSavingId === Number(line.id) ? "Validando…" : lineIsValidated ? "Validado ✓" : "Validar"}</button>}</div></td>}
                    {!isLoadPreparation && <td>{unitPrice.toFixed(2)} €</td>}
                    {!isLoadPreparation && <td>{amount.toFixed(2)} €</td>}
                  </tr>
                  {isLoadPreparation && incidentLineId === line.id && <tr className="prep-incident-full-row"><td colSpan={6}><div className="prep-incident-panel"><div className="prep-incident-panel-head"><div><b>Registrar incidencia</b><small>{product?.name || "Producto"} · Se han preparado {Number(line.prepared_quantity || 0)} de {Number(line.quantity || 0)} unidades.</small></div><span>Faltan {Math.max(0, Number(line.quantity || 0) - Number(line.prepared_quantity || 0))} uds.</span></div><label className="prep-incident-note"><span>Qué ha ocurrido</span><textarea aria-label={`Anotación de incidencia de ${product?.name || "producto"}`} value={incidentText} onChange={(event) => setIncidentText(event.target.value)} placeholder="Ej.: se pidieron 12 y solo hay 10 unidades." rows={3} /></label><div className="prep-incident-resolution"><label><span>Cómo resolverlo</span><select value={incidentResolution} onChange={(event) => setIncidentResolution(event.target.value)}><option value="partial">Enviar parcialmente</option><option value="cancel">Cancelar lo que falta</option><option value="backorder">Crear pedido con lo que falta</option></select></label><div><button type="button" className="row-action danger" onClick={() => void createPreparationIncident(line)}>Registrar incidencia</button><button type="button" className="row-action" onClick={() => { setIncidentLineId(null); setIncidentText(""); }}>Cancelar</button></div></div></div></td></tr>}
                  {isLoadPreparation && line.preparation_status === "Incidencia" && incidentLineId !== line.id && <tr className="prep-incident-resolve-row"><td colSpan={6}><div className="prep-incident-resolve"><b>Faltan {Math.max(0, Number(line.quantity || 0) - Number(line.prepared_quantity || 0))} unidades.</b><label>Resolver como<select value={incidentResolution} onChange={(event) => setIncidentResolution(event.target.value)}><option value="partial">Enviar parcialmente</option><option value="cancel">Cancelar lo que falta</option><option value="backorder">Crear pedido con lo que falta</option></select></label><button type="button" className="row-action danger" onClick={() => void resolvePreparationIncident(line)}>Aplicar resolución</button></div></td></tr>}
                  </Fragment>
                  );
                })}
                {previewLoading ? (
                  <tr>
                    <td colSpan={isLoadPreparation ? 6 : 4}><div className="preview-loading-state" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><span>Cargando líneas del documento…</span></div></td>
                  </tr>
                ) : !previewLines.length && (
                  <tr>
                    <td colSpan={isLoadPreparation ? 6 : 4} className="muted">
                      Sin líneas de producto asociadas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>}
            {isLoadPreparation && <div className="prep-location-save-all"><button type="button" className="button primary" onClick={() => void savePreparationLocations()} disabled={locationSavingId === -1}>{locationSavingId === -1 ? "Guardando cambios…" : "Guardar cambios"}</button></div>}
            {isLoadPreparation && actionableIncompletePreparationLines.length > 0 && (
              <section className="prep-bulk-incident" aria-label="Incidencias de preparación">
                <div className="prep-bulk-incident-head">
                  <div><b>Hay líneas incompletas</b><span>{actionableIncompletePreparationLines.length} productos con unidades pendientes</span></div>
                  {!bulkIncidentOpen && <button type="button" className="row-action danger" onClick={() => { setBulkIncidentError(""); setBulkIncidentOpen(true); }}>Registrar incidencia</button>}
                </div>
                <div className="prep-bulk-incident-summary">
                  {incompletePreparationLines.map((line: any) => {
                    const product = productOptions.find((item: any) => Number(item.id) === Number(line.product_id));
                    const missing = Math.max(0, Number(line.quantity || 0) - Number(line.prepared_quantity || 0));
                    return <span key={line.id}>{product?.name || `Producto #${line.product_id}`} · faltan {missing} uds.</span>;
                  })}
                </div>
                {bulkIncidentOpen && <div className="prep-bulk-incident-form"><textarea aria-label="Observaciones de la incidencia" value={bulkIncidentText} onChange={(event) => setBulkIncidentText(event.target.value)} placeholder="Añade una observación común para la incidencia (opcional)." rows={3} />{bulkIncidentError && <p className="prep-bulk-incident-error" role="alert">{bulkIncidentError}</p>}<div className="prep-bulk-incident-actions"><button type="button" className="row-action danger" disabled={bulkIncidentSaving} onClick={() => void createBulkPreparationIncident(incompletePreparationLines)}>{bulkIncidentSaving ? <><span className="button-spinner" aria-hidden="true" /> Registrando…</> : "Confirmar incidencia"}</button><button type="button" className="row-action" disabled={bulkIncidentSaving} onClick={() => { setBulkIncidentOpen(false); setBulkIncidentText(""); setBulkIncidentError(""); }}>Cancelar</button></div></div>}
              </section>
            )}
            {isLoadPreparation && preparationValidationMessage && <p className="preparation-validation-success" role="status">{preparationValidationMessage} Los cambios quedan guardados en la nota de carga.</p>}
            {active !== "Cobros" && active !== "Compras" && !(active === "Pedidos" && isOrderSent(preview)) && <div className="add-line">
              <select
                value={newLine.product_id}
                onChange={(e) => {
                  const p = productOptions.find(
                    (x) => String(x.id) === e.target.value,
                  );
                  setNewLine({
                    ...newLine,
                    product_id: e.target.value,
                    unit_price: String(p?.unit_price || 0),
                  });
                }}
              >
                <option value="">Añadir producto...</option>
                {productOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · Stock {p.stock}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={newLine.quantity}
                onChange={(e) =>
                  setNewLine({ ...newLine, quantity: e.target.value })
                }
                placeholder="Cantidad"
              />
              {(active === "Facturas" || active === "Pedidos") && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newLine.unit_price}
                  onChange={(e) =>
                    setNewLine({ ...newLine, unit_price: e.target.value })
                  }
                  placeholder="Precio"
                />
              )}
              <button className="button primary" onClick={addPreviewLine}>
                ＋ Añadir línea
              </button>
            </div>}
            {active !== "Cobros" && <div className="preview-summary">
              {(() => {
                const lineBase = previewLines.reduce((n: number, line: any) => {
                  const product = productOptions.find((p: any) => Number(p.id) === Number(line.product_id));
                  const quantity = Number(line.quantity || 0);
                  const unitPrice = Number(line.unit_price ?? line.unit_cost ?? product?.unit_price ?? 0);
                  const explicitAmount = Number(line.amount);
                  const amount = Number.isFinite(explicitAmount) && explicitAmount > 0
                    ? explicitAmount
                    : quantity * (Number.isFinite(unitPrice) ? unitPrice : 0);
                  return n + amount;
                }, 0);
                const lineVat = lineBase * (Number(preview.vat || 21) / 100);
                const quoteAmount = Number(preview.amount || 0);
                if (active === "Presupuestos") {
                  return (
                    <>
                      <span>Importe del presupuesto: {quoteAmount.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</span>
                      <strong>Total: {quoteAmount.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong>
                    </>
                  );
                }
                return (
                  <>
                    <span>Base imponible: {lineBase.toFixed(2)} €</span>
                    <span>IVA: {Number(preview.vat || 21)}%</span>
                    <strong>
                      Total:{" "}
                      {(
                        lineBase + lineVat || Number(preview.amount || 0)
                      ).toLocaleString("es-ES", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </strong>
                  </>
                );
              })()}
            </div>}
            <div className="preview-document-actions">
              <button className="button secondary" disabled={previewLoading} onClick={() => window.print()}>
                Imprimir / guardar PDF
              </button>
              {isLoadPreparation && <button className="button workflow" type="button" onClick={() => setShipmentLabelOpen(true)}>
                Etiqueta de envío · QR y barras
              </button>}
            </div>
            {active === "Facturas" && <div className="invoice-document-actions"><button type="button" className="button workflow" onClick={() => void openInvoicePdf(preview)}>Ver PDF generado</button><button type="button" className="button secondary" onClick={() => void copyInvoiceLink(preview)}>Copiar enlace seguro</button><button type="button" className="button workflow" onClick={() => void sendInvoiceEmail(preview)}>Enviar por email</button><button type="button" className="button secondary" onClick={() => void prepareInvoicePdf(preview, true)}>Regenerar PDF</button></div>}
            {active === "Pedidos" && <><div className="document-pdf-actions"><button type="button" className="button workflow" onClick={() => void openCommercialDocumentPdf(preview, "order")}>Ver PDF generado</button><button type="button" className="button secondary" onClick={() => void copyCommercialDocumentLink(preview, "order")}>Copiar enlace seguro</button><button type="button" className="button secondary" onClick={() => void prepareCommercialDocumentPdf(preview, "order", true)}>Regenerar PDF</button></div><div className="order-preview-actions"><button type="button" className="button workflow" onClick={() => void (getOrderShipment(preview) ? openOrderLoadNote(preview) : createOrderLoadNote(preview))}>{getOrderShipment(preview) ? "Abrir nota de carga" : "Crear nota de carga"}</button>{!isOrderSent(preview) && <button type="button" className="button secondary" onClick={() => { setPreview(null); beginInline(preview); }}>Editar pedido</button>}<button type="button" className="button secondary" onClick={() => void convertOrder(preview, "delivery")}>Crear albarán</button><button type="button" className="button primary" onClick={() => void convertOrder(preview, "invoice")}>Crear factura</button></div></>}
            {active === "Presupuestos" && <><div className="document-pdf-actions"><button type="button" className="button workflow" onClick={() => void openCommercialDocumentPdf(preview, "quote")}>Ver PDF generado</button><button type="button" className="button secondary" onClick={() => void copyCommercialDocumentLink(preview, "quote")}>Copiar enlace seguro</button><button type="button" className="button secondary" onClick={() => void prepareCommercialDocumentPdf(preview, "quote", true)}>Regenerar PDF</button></div><div className="quote-preview-actions"><button type="button" className="button secondary" onClick={() => void sendQuoteToClient(preview)}>Enviar al cliente</button><button type="button" className="button primary" disabled={preview.status === "Convertido"} onClick={() => void convertQuoteToOrder(preview)}>{preview.status === "Convertido" ? "Convertido a pedido" : "Convertir a pedido"}</button></div></>}
          </div>
        </div>
      )}
      {shipmentLabelOpen && preview && isLoadPreparation && <ShipmentLabelModal shipment={preview} client={previewClient} lines={previewLines} products={productOptions} address={previewAddress} city={previewCity} onClose={() => setShipmentLabelOpen(false)} />}
      {notePreview && (
        <div className="preview-overlay" onClick={() => setNotePreview(null)}>
          <article className="note-preview-card" onClick={(event) => event.stopPropagation()}>
            <button className="preview-close" onClick={() => setNotePreview(null)}>×</button>
            <p className="eyebrow">NOTAS · EXCLUSIVAS INTELIGENTES</p>
            <h2>{notePreview.title || "Nota"}</h2>
            <div className="note-preview-meta">
              <span><b>Prioridad</b>{notePreview.priority || "Normal"}</span>
              <span><b>Sección</b>{notePreview.module || "General"}</span>
              <span><b>Estado</b>{notePreview.status || (Number(notePreview.completed) === 1 ? "Resuelta" : "Pendiente")}</span>
            </div>
            {String(notePreview.module || "") === "Preparación de pedidos" && <div className="note-preview-incident-context">
              <div><b>Pedido relacionado</b><span>{notePreview.title?.split("·").slice(1).join("·").trim() || (notePreview.record_id ? `Pedido #${notePreview.record_id}` : "Sin pedido relacionado")}</span></div>
              <div><b>Cliente</b><span>{noteIncidentOrderLoading ? "Cargando…" : noteIncidentOrder?.client?.name || "Cliente no indicado"}</span></div>
              <div><b>Dirección de envío</b><span>{noteIncidentOrderLoading ? "Cargando…" : noteIncidentOrder?.address || "Dirección no indicada"}</span></div>
              <div><b>Fecha del pedido</b><span>{noteIncidentOrderLoading ? "Cargando…" : noteIncidentOrder?.order?.created_at ? formatSpanishDateValue(noteIncidentOrder.order.created_at, true) : "—"}</span></div>
              <div><b>Registrada por</b><span>{notePreview.created_by || "Usuario local"}</span></div>
              <div><b>Fecha de registro</b><span>{notePreview.created_at ? formatSpanishDateValue(notePreview.created_at, true) : "—"}</span></div>
              {notePreview.resolution && <div><b>Última resolución</b><span>{notePreview.resolution}{notePreview.resolved_by ? ` · ${notePreview.resolved_by}` : ""}</span></div>}
            </div>}
            <div className="note-preview-content">{notePreview.content || "Sin contenido adicional."}</div>
            {String(notePreview.module || "") === "Preparación de pedidos" && <div className="note-preview-resolution">
              <div className="note-preview-resolution-head"><b>Resolver incidencia</b><small>Guarda la decisión y deja trazabilidad de quién la autoriza.</small></div>
              <div className="note-preview-resolution-controls">
                <select aria-label="Acción de resolución" value={noteAction} onChange={(event) => setNoteAction(event.target.value)} disabled={noteActionSaving}>
                  <option value="partial">Autorizar envío parcial</option>
                  <option value="backorder">Solicitar reposición</option>
                  <option value="cancel">Cancelar unidades faltantes</option>
                  <option value="review">Dejar en revisión</option>
                </select>
                <button className="button primary" disabled={noteActionSaving} onClick={() => void applyNoteIncidentAction()}>{noteActionSaving ? "Guardando…" : "Aplicar resolución"}</button>
              </div>
              {noteActionError && <p className="note-preview-error" role="alert">{noteActionError}</p>}
            </div>}
            <div className="note-preview-actions">
              {String(notePreview.module || "") === "Preparación de pedidos" && <button className="button secondary" onClick={openIncidentPreparation}>Abrir nota de carga</button>}
              <button className="button secondary" onClick={() => { setForm({ ...notePreview }); setEditing(notePreview); setFormOpen(true); setNotePreview(null); }}>Editar nota</button>
              <button className="button primary" onClick={() => setNotePreview(null)}>Cerrar</button>
            </div>
          </article>
        </div>
      )}
      {billingOpen && <div className="preview-overlay" onClick={() => !billingSaving && setBillingOpen(false)}><article className="billing-modal" onClick={(event) => event.stopPropagation()}>
        <button className="preview-close" onClick={() => !billingSaving && setBillingOpen(false)}>×</button>
        <p className="eyebrow">FACTURACIÓN · EXCLUSIVAS INTELIGENTES</p><h2>Facturar pedidos</h2>
        <p className="muted">Selecciona pedidos del mismo cliente para crear una única factura. Los ya facturados quedan bloqueados.</p>
        <div className="billing-toolbar"><label>Entrega desde<input type="date" value={billingFrom} onChange={(e) => setBillingFrom(e.target.value)} /></label><label>Entrega hasta<input type="date" value={billingTo} onChange={(e) => setBillingTo(e.target.value)} /></label><label>Cliente<select value={billingClient} onChange={(e) => setBillingClient(e.target.value)}><option value="">Todos los clientes</option>{(lookups.clients || []).map((client: any) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><button className="button secondary" onClick={() => void loadBillingOrders()}>Buscar</button><button type="button" className="button secondary" onClick={() => setBillingSelected(billingRows.filter((row: any) => !row.billed).map((row: any) => Number(row.id)))} disabled={!billingRows.some((row: any) => !row.billed)}>Seleccionar pendientes</button><button type="button" className="button secondary" onClick={() => setBillingSelected([])} disabled={!billingSelected.length}>Limpiar selección</button></div>
        {billingError && <div className="error-message" role="alert">{billingError}</div>}
        {billingLoading ? <div className="data-loading"><span className="loading-spinner" />Cargando pedidos…</div> : <div className="billing-list">{billingRows.length ? billingRows.map((row: any) => <label className={`billing-row${row.billed ? " billed" : ""}`} key={row.id}><input type="checkbox" disabled={Boolean(row.billed)} checked={billingSelected.includes(Number(row.id))} onChange={() => setBillingSelected((current) => current.includes(Number(row.id)) ? current.filter((id) => id !== Number(row.id)) : [...current, Number(row.id)])} /><span><b>{row.code}</b><small>{row.client_name || "Cliente no indicado"} · Entrega {row.delivery_date || (row.created_at ? formatSpanishDateValue(row.created_at, false) : "Fecha no indicada")}</small></span><strong>{Number(row.amount || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong><em>{row.billed ? "Ya facturado" : row.status || "Pendiente"}</em><button type="button" className="button link-button" onClick={() => { setBillingOpen(false); void openPreview(row); }}>Ver pedido</button></label>) : <p className="empty-state">No hay pedidos para los filtros seleccionados.</p>}</div>}
        <div className="billing-footer"><span>{billingSelected.length} seleccionados · {billingRows.filter((row) => billingSelected.includes(Number(row.id))).reduce((sum, row) => sum + Number(row.amount || 0), 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</span><button className="button primary" disabled={!billingSelected.length || billingSaving} onClick={() => void createGroupedInvoice()}>{billingSaving ? "Creando…" : "Crear factura agrupada"}</button></div>
      </article></div>}
    </div>
    </>
  );
}

function reportDate(value: any) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function reportMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function reportMonthLabel(date: Date) {
  return date.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
}

function ReportAreaChart({
  points,
  label,
}: {
  points: { label: string; value: number }[];
  label: string;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const coords = points
    .map(
      (p, i) =>
        `${24 + (i * 592) / Math.max(points.length - 1, 1)},${174 - (p.value / max) * 132}`,
    )
    .join(" ");
  const area = `24,174 ${coords} 616,174`;
  return (
    <svg
      className="report-svg"
      viewBox="0 0 640 220"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <line x1="24" y1="174" x2="616" y2="174" className="chart-axis" />
      <line x1="24" y1="42" x2="616" y2="42" className="chart-grid" />
      <polygon points={area} className="chart-area" />
      <polyline points={coords} className="chart-line" />
      {points.map((p, i) => {
        const x = 24 + (i * 592) / Math.max(points.length - 1, 1);
        const y = 174 - (p.value / max) * 132;
        return (
          <g key={p.label}>
            <circle
              cx={x}
              cy={y}
              r="4"
              className="chart-dot"
              data-tooltip={`${p.label}: ${p.value.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`}
            />
            <text x={x} y="198" textAnchor="middle" className="chart-label">
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ReportBars({
  items,
  label,
  currency = false,
}: {
  items: { label: string; value: number }[];
  label: string;
  currency?: boolean;
}) {
  const max = Math.max(...items.map((p) => p.value), 1);
  return (
    <svg
      className="report-svg"
      viewBox="0 0 640 220"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {items.map((item, i) => {
        const x = 38 + (i * 570) / Math.max(items.length, 1);
        const h = (item.value / max) * 140;
        return (
          <g key={`${item.label}-${i}`}>
            <rect
              x={x}
              y={174 - h}
              width={Math.min(54, 500 / Math.max(items.length, 1))}
              height={h}
              className={`chart-bar chart-bar-${i % 4}`}
              data-tooltip={`${item.label}: ${currency ? item.value.toLocaleString("es-ES", { style: "currency", currency: "EUR" }) : item.value}`}
            />
            <text
              x={x + 24}
              y="198"
              textAnchor="middle"
              className="chart-label"
            >
              {item.label}
            </text>
          </g>
        );
      })}
      <line x1="24" y1="174" x2="616" y2="174" className="chart-axis" />
    </svg>
  );
}

function ReportScatter({
  items,
  label,
}: {
  items: { label: string; cost: number; price: number; stock: number }[];
  label: string;
}) {
  const maxX = Math.max(...items.map((p) => p.cost), 1),
    maxY = Math.max(...items.map((p) => p.price), 1);
  return (
    <svg
      className="report-svg"
      viewBox="0 0 640 220"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <line x1="46" y1="178" x2="616" y2="178" className="chart-axis" />
      <line x1="46" y1="28" x2="46" y2="178" className="chart-axis" />
      <text x="330" y="214" className="chart-axis-label">
        Coste de compra (€)
      </text>
      <text
        x="12"
        y="105"
        transform="rotate(-90 12 105)"
        className="chart-axis-label"
      >
        Precio venta (€)
      </text>
      {items.map((item, index) => {
        const x = 52 + (item.cost / maxX) * 552,
          y = 172 - (item.price / maxY) * 136;
        return (
          <circle
            key={`${item.label}-${index}`}
            cx={x}
            cy={y}
            r={Math.max(4, Math.min(12, 4 + item.stock / 12))}
            className="chart-scatter"
            data-tooltip={`${item.label}: coste ${item.cost.toFixed(2)} € · venta ${item.price.toFixed(2)} € · stock ${item.stock}`}
          />
        );
      })}
    </svg>
  );
}

function ReportRadar({
  values,
  label,
}: {
  values: { label: string; value: number }[];
  label: string;
}) {
  const cx = 320,
    cy = 110,
    radius = 72,
    max = Math.max(...values.map((v) => v.value), 1);
  const point = (i: number, scale: number) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / values.length;
    return `${cx + Math.cos(angle) * radius * scale},${cy + Math.sin(angle) * radius * scale}`;
  };
  return (
    <svg
      className="report-svg radar-svg"
      viewBox="0 0 640 220"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <polygon
        points={values.map((_, i) => point(i, 1)).join(" ")}
        className="radar-frame"
      />
      <polygon
        points={values.map((_, i) => point(i, 0.5)).join(" ")}
        className="radar-frame radar-inner"
      />
      <polygon
        points={values.map((v, i) => point(i, v.value / max)).join(" ")}
        className="radar-value"
      />
      {values.map((v, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / values.length;
        return (
          <text
            key={v.label}
            x={cx + Math.cos(angle) * 96}
            y={cy + Math.sin(angle) * 96 + 4}
            textAnchor="middle"
            className="chart-label"
          >
            {v.label}
          </text>
        );
      })}
    </svg>
  );
}

function Balance() {
  const isoDay = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = new Date();
  const [range, setRange] = useState({
    from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: isoDay(today),
  });
  const [rows, setRows] = useState<any>({
    invoices: [],
    payments: [],
    purchases: [],
    expenseTickets: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const loadFinancialData = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setLoading(true);
    setLoadError("");
    try {
      const resources = ["invoices", "payments", "purchase_orders", "expenses"];
      const results = await Promise.allSettled(
        resources.map(async (resource) => {
          const response = await fetch(
            `/api/${resource}?view=lookup&limit=5000`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        }),
      );
      const values = results.map((result) =>
        result.status === "fulfilled" && Array.isArray(result.value)
          ? result.value
          : [],
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      setRows({
        invoices: values[0],
        payments: values[1],
        purchases: values[2],
        expenseTickets: values[3],
      });
      if (failed) {
        setLoadError(
          "No se han podido cargar todos los datos financieros. Puedes reintentarlo.",
        );
      }
    } catch {
      setRows({
        invoices: [],
        payments: [],
        purchases: [],
        expenseTickets: [],
      });
      setLoadError(
        controller.signal.aborted
          ? "La carga financiera ha tardado demasiado. Puedes reintentarlo."
          : "No se han podido cargar los datos financieros. Puedes reintentarlo.",
      );
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadFinancialData();
  }, []);
  const inRange = (value: any) => {
    const day = String(value || "").slice(0, 10);
    return day >= range.from && day <= range.to;
  };
  const invoices = rows.invoices.filter(
    (invoice: any) =>
      inRange(
        invoice.issue_date || invoice.invoice_date || invoice.created_at,
      ) && invoice.status !== "Anulada",
  );
  const payments = rows.payments.filter((payment: any) =>
    inRange(payment.payment_date || payment.created_at),
  );
  const purchases = rows.purchases.filter(
    (purchase: any) =>
      inRange(purchase.order_date || purchase.created_at) &&
      purchase.status !== "Cancelada",
  );
  const expenseTickets = rows.expenseTickets.filter((expense: any) =>
    inRange(expense.expense_date || expense.created_at),
  );
  const income = invoices.reduce(
    (total: number, item: any) => total + Number(item.amount || 0),
    0,
  );
  const expenses = [...purchases, ...expenseTickets].reduce(
    (total: number, item: any) => total + Number(item.amount || 0),
    0,
  );
  const collected = payments.reduce(
    (total: number, item: any) => total + Number(item.amount || 0),
    0,
  );
  const pending = Math.max(0, income - collected);
  const balance = income - expenses;
  const money = (value: number) =>
    value.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  const hasFinancialData = Object.values(rows).some(
    (items: any) => Array.isArray(items) && items.length > 0,
  );
  const setPreset = (preset: "week" | "month" | "year") => {
    const end = new Date();
    const start =
      preset === "week"
        ? new Date(end.getTime() - 6 * 86400000)
        : preset === "year"
          ? new Date(end.getFullYear(), 0, 1)
          : new Date(end.getFullYear(), end.getMonth(), 1);
    setRange({ from: isoDay(start), to: isoDay(end) });
  };
  return (
    <div className="balance-page reports">
      <div className="manager-head">
        <div>
          <p className="eyebrow">ANÁLISIS FINANCIERO</p>
          <h2>Balance</h2>
          <p className="muted">
            Ingresos, gastos, cobros y pendientes calculados desde la base de
            datos local.
          </p>
        </div>
        <span className="db-badge">● Datos reales</span>
      </div>
      {loading && <div className="data-loading" role="status"><span className="loading-spinner" aria-hidden="true" /><LoadingIndicator label="Cargando datos financieros…" /></div>}
      {loadError && <div className="error-message balance-load-error" role="alert"><span>{loadError}</span><button type="button" className="button secondary" onClick={() => void loadFinancialData()}>Reintentar</button></div>}
      <div className="panel report-range-panel">
        <div>
          <b>Periodo del balance</b>
          <span className="muted">
            Selecciona una semana, mes, año o cualquier rango de fechas.
          </span>
        </div>
        <div className="report-range-controls">
          <label>
            Desde
            <input
              type="date"
              value={range.from}
              onChange={(event) =>
                setRange({ ...range, from: event.target.value })
              }
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={range.to}
              onChange={(event) =>
                setRange({ ...range, to: event.target.value })
              }
            />
          </label>
          <button className="report-preset" onClick={() => setPreset("week")}>
            Semana
          </button>
          <button className="report-preset" onClick={() => setPreset("month")}>
            Mes
          </button>
          <button className="report-preset" onClick={() => setPreset("year")}>
            Año
          </button>
        </div>
      </div>
      <div className={`balance-results${loading || (loadError && !hasFinancialData) ? " is-hidden" : ""}`}>
      <div className="report-range-cards balance-cards">
        <article>
          <span>INGRESOS / VENTAS</span>
          <strong>{money(income)}</strong>
          <small>{invoices.length} facturas emitidas</small>
        </article>
        <article>
          <span>GASTOS / COMPRAS</span>
          <strong>{money(expenses)}</strong>
          <small>{purchases.length} compras registradas</small>
        </article>
        <article>
          <span>COBRADO</span>
          <strong>{money(collected)}</strong>
          <small>{payments.length} cobros recibidos</small>
        </article>
        <article className={pending > 0 ? "warning-card" : "positive-card"}>
          <span>PENDIENTE DE COBRO</span>
          <strong>{money(pending)}</strong>
          <small>Ingresos menos cobros</small>
        </article>
        <article className={balance >= 0 ? "positive-card" : "negative-card"}>
          <span>BALANCE</span>
          <strong>{money(balance)}</strong>
          <small>Ingresos menos gastos</small>
        </article>
      </div>
      <div className="report-grid-two balance-detail-grid">
        <div className="panel report-detail-panel">
          <div className="report-section-head">
            <div>
              <h3>Facturas del periodo</h3>
              <p className="muted">Ingresos emitidos y estado de cobro</p>
            </div>
          </div>
          <div className="mini-report-table">
            <div className="mini-report-head">
              <span>Factura</span>
              <span>Importe</span>
              <span>Estado</span>
            </div>
            {invoices.length ? (
              invoices.slice(0, 12).map((invoice: any) => (
                <div className="mini-report-row" key={invoice.id}>
                  <span>{invoice.code || `Factura #${invoice.id}`}</span>
                  <b>{money(Number(invoice.amount || 0))}</b>
                  <span
                    className={
                      invoice.status === "Cobrada" ? "ok-text" : "warning-text"
                    }
                  >
                    {invoice.status || "Pendiente"}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">No hay facturas en este periodo.</p>
            )}
          </div>
        </div>
        <div className="panel report-detail-panel">
          <div className="report-section-head">
            <div>
              <h3>Gastos y compras</h3>
              <p className="muted">Pedidos realizados a proveedores</p>
            </div>
          </div>
          <div className="mini-report-table">
            <div className="mini-report-head">
              <span>Compra</span>
              <span>Importe</span>
              <span>Estado</span>
            </div>
            {purchases.length ? (
              purchases.slice(0, 12).map((purchase: any) => (
                <div className="mini-report-row" key={purchase.id}>
                  <span>{purchase.code || `Compra #${purchase.id}`}</span>
                  <b>{money(Number(purchase.amount || 0))}</b>
                  <span>{purchase.status || "Pendiente"}</span>
                </div>
              ))
            ) : (
              <p className="muted">No hay compras en este periodo.</p>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function Reports() {
  const todayReport = new Date();
  const isoReportDay = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const [range, setRange] = useState({
    from: isoReportDay(
      new Date(todayReport.getFullYear(), todayReport.getMonth(), 1),
    ),
    to: isoReportDay(todayReport),
  });
  const [data, setData] = useState<any>({
    orders: 0,
    clients: 0,
    products: 0,
    invoices: 0,
    sales: 0,
    stockValue: 0,
    receivables: 0,
    margin: 0,
    orderStatuses: {},
    criticalProducts: [],
    recentInvoices: [],
    invoiceStatuses: {},
    stockByProduct: [],
    salesTimeline: [],
    clientSales: [],
    stockMovements: [],
    shipmentStatuses: [],
    orderAging: [],
    productScatter: [],
    activityHeatmap: [],
    operationalRadar: [],
    rangeSales: 0,
    rangeExpenses: 0,
    rangeCollected: 0,
    rangeBalance: 0,
    rangeInvoices: 0,
  });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    Promise.all(
      [
        "orders",
        "clients",
        "products",
        "invoices",
        "payments",
        "inventory_movements",
        "shipments",
        "purchase_orders",
        "expenses",
      ].map((x) =>
        fetch(`/api/${x}?view=lookup&limit=5000`).then((r) => r.json()),
      ),
    ).then(
      ([
        orders,
        clients,
        products,
        invoices,
        payments,
        movements,
        shipments,
        purchaseOrders,
        expenseTickets,
      ]) =>
        setData({
          orders: orders.length,
          clients: clients.length,
          products: products.length,
          invoices: invoices.length,
          sales: invoices
            .filter((x: any) => x.status !== "Anulada")
            .reduce((n: number, x: any) => n + Number(x.amount || 0), 0),
          stockValue: products.reduce(
            (n: number, x: any) =>
              n + Number(x.stock || 0) * Number(x.cost_price || 0),
            0,
          ),
          receivables:
            invoices.reduce(
              (n: number, x: any) => n + Number(x.amount || 0),
              0,
            ) -
            payments.reduce(
              (n: number, x: any) => n + Number(x.amount || 0),
              0,
            ),
          margin: products.reduce(
            (n: number, x: any) =>
              n +
              Number(x.stock || 0) *
                Math.max(
                  0,
                  Number(x.unit_price || 0) - Number(x.cost_price || 0),
                ),
            0,
          ),
          orderStatuses: orders.reduce(
            (acc: any, x: any) => ({
              ...acc,
              [x.status || "Pendiente"]:
                (acc[x.status || "Pendiente"] || 0) + 1,
            }),
            {},
          ),
          criticalProducts: products
            .filter(
              (x: any) =>
                Number(x.stock || 0) - Number(x.stock_reserved || 0) <=
                Number(x.min_stock || 0),
            )
            .sort(
              (a: any, b: any) => Number(a.stock || 0) - Number(b.stock || 0),
            )
            .slice(0, 8),
          recentInvoices: invoices.slice(0, 6),
          invoiceStatuses: invoices.reduce(
            (acc: any, x: any) => ({
              ...acc,
              [x.status || "Pendiente"]:
                (acc[x.status || "Pendiente"] || 0) + 1,
            }),
            {},
          ),
          stockByProduct: products
            .map((x: any) => ({
              name: x.name,
              value: Number(x.stock || 0) * Number(x.cost_price || 0),
            }))
            .filter((x: any) => x.value > 0)
            .sort((a: any, b: any) => b.value - a.value)
            .slice(0, 6),
          salesTimeline: (() => {
            const now = new Date();
            const months = Array.from(
              { length: 6 },
              (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1),
            );
            return months.map((month) => {
              const key = reportMonthKey(month);
              return {
                label: reportMonthLabel(month),
                value: invoices
                  .filter((x: any) => {
                    const d = reportDate(
                      x.issue_date || x.invoice_date || x.created_at,
                    );
                    return (
                      d && reportMonthKey(d) === key && x.status !== "Anulada"
                    );
                  })
                  .reduce((n: number, x: any) => n + Number(x.amount || 0), 0),
              };
            });
          })(),
          clientSales: clients
            .map((client: any) => ({
              label: String(client.name || "Cliente").slice(0, 12),
              value: invoices
                .filter(
                  (invoice: any) =>
                    Number(invoice.client_id) === Number(client.id),
                )
                .reduce(
                  (n: number, invoice: any) => n + Number(invoice.amount || 0),
                  0,
                ),
            }))
            .filter((x: any) => x.value > 0)
            .sort((a: any, b: any) => b.value - a.value)
            .slice(0, 6),
          stockMovements: (() => {
            const now = new Date();
            const months = Array.from(
              { length: 6 },
              (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1),
            );
            return months.map((month) => {
              const key = reportMonthKey(month);
              const rows = movements.filter((x: any) => {
                const d = reportDate(x.movement_date || x.created_at);
                return d && reportMonthKey(d) === key;
              });
              return {
                label: reportMonthLabel(month),
                value: rows.reduce(
                  (n: number, x: any) =>
                    n +
                    (String(x.movement_type || "")
                      .toLowerCase()
                      .includes("entrada")
                      ? Number(x.quantity || 0)
                      : -Number(x.quantity || 0)),
                  0,
                ),
              };
            });
          })(),
          shipmentStatuses: Object.entries(
            shipments.reduce(
              (acc: any, x: any) => ({
                ...acc,
                [x.status || "Preparando"]:
                  (acc[x.status || "Preparando"] || 0) + 1,
              }),
              {},
            ),
          ).map(([label, value]) => ({
            label: String(label).slice(0, 10),
            value: Number(value),
          })),
          orderAging: ["0–2 días", "3–7 días", "8–30 días", "+30 días"].map(
            (label, index) => ({
              label,
              value: orders.filter((x: any) => {
                if (["Entregado", "Cancelado"].includes(x.status)) return false;
                const d = reportDate(x.created_at || x.order_date);
                const days = d
                  ? Math.max(
                      0,
                      Math.floor((Date.now() - d.getTime()) / 86400000),
                    )
                  : 0;
                return index === 0
                  ? days <= 2
                  : index === 1
                    ? days >= 3 && days <= 7
                    : index === 2
                      ? days >= 8 && days <= 30
                      : days > 30;
              }).length,
            }),
          ),
          productScatter: products
            .map((x: any) => ({
              label: x.name || "Producto",
              cost: Number(x.cost_price || 0),
              price: Number(x.unit_price || 0),
              stock: Number(x.stock || 0),
            }))
            .filter((x: any) => x.cost > 0 && x.price > 0)
            .slice(0, 24),
          activityHeatmap: ["L", "M", "X", "J", "V", "S"].map((label, day) => ({
            label,
            value: orders.filter((x: any) => {
              const d = reportDate(x.created_at || x.order_date);
              return d && (d.getDay() || 7) - 1 === day;
            }).length,
          })),
          operationalRadar: [
            { label: "Ventas", value: invoices.length },
            { label: "Pedidos", value: orders.length },
            { label: "Clientes", value: clients.length },
            {
              label: "Stock",
              value: products.filter((x: any) => Number(x.stock || 0) > 0)
                .length,
            },
            { label: "Cobros", value: payments.length },
            { label: "Envíos", value: shipments.length },
          ],
          rangeSales: invoices
            .filter((x: any) => {
              const d = String(x.issue_date || x.created_at || "").slice(0, 10);
              return d >= range.from && d <= range.to && x.status !== "Anulada";
            })
            .reduce((n: number, x: any) => n + Number(x.amount || 0), 0),
          rangeExpenses: [...purchaseOrders, ...expenseTickets]
            .filter((x: any) => {
              const d = String(x.order_date || x.created_at || "").slice(0, 10);
              return (
                d >= range.from && d <= range.to && x.status !== "Cancelada"
              );
            })
            .reduce((n: number, x: any) => n + Number(x.amount || 0), 0),
          rangeCollected: payments
            .filter((x: any) => {
              const d = String(x.payment_date || x.created_at || "").slice(
                0,
                10,
              );
              return d >= range.from && d <= range.to;
            })
            .reduce((n: number, x: any) => n + Number(x.amount || 0), 0),
          rangeInvoices: invoices.filter((x: any) => {
            const d = String(x.issue_date || x.created_at || "").slice(0, 10);
            return d >= range.from && d <= range.to;
          }).length,
          rangeBalance:
            invoices
              .filter((x: any) => {
                const d = String(x.issue_date || x.created_at || "").slice(
                  0,
                  10,
                );
                return (
                  d >= range.from && d <= range.to && x.status !== "Anulada"
                );
              })
              .reduce((n: number, x: any) => n + Number(x.amount || 0), 0) -
            [...purchaseOrders, ...expenseTickets]
              .filter((x: any) => {
                const d = String(x.order_date || x.created_at || "").slice(
                  0,
                  10,
                );
                return (
                  d >= range.from && d <= range.to && x.status !== "Cancelada"
                );
              })
              .reduce((n: number, x: any) => n + Number(x.amount || 0), 0),
        }),
    ).finally(() => setLoading(false));
  }, [range.from, range.to]);
  const moneyReport = (value: number) =>
    Number(value || 0).toLocaleString("es-ES", {
      style: "currency",
      currency: "EUR",
    });
  const setReportPreset = (preset: "week" | "month" | "year") => {
    const end = new Date();
    const begin =
      preset === "week"
        ? new Date(end.getTime() - 6 * 86400000)
        : preset === "year"
          ? new Date(end.getFullYear(), 0, 1)
          : new Date(end.getFullYear(), end.getMonth(), 1);
    setRange({ from: isoReportDay(begin), to: isoReportDay(end) });
  };
  return (
    <div className="reports">
      <div className="manager-head">
        <div>
          <p className="eyebrow">INFORMES OPERATIVOS</p>
          <h2>Visión general</h2>
          <p className="muted">Indicadores calculados desde la base de datos.</p>
        </div>
      </div>
      {loading && <div className="data-loading" role="status"><span className="loading-spinner" aria-hidden="true" /><LoadingIndicator label="Cargando informes…" /></div>}
      <div className="financial-report-toolbar">
        <div>
          <b>P&amp;L</b>
          <span>Ventas</span>
          <span>Gastos</span>
        </div>
        <button className="button secondary" onClick={() => window.print()}>
          Exportar
        </button>
      </div>
      <div className="financial-kpis">
        <article>
          <span>Ingresos</span>
          <strong>{moneyReport(data.rangeSales)}</strong>
          <small>{data.rangeInvoices} facturas del periodo</small>
        </article>
        <article>
          <span>Gastos totales</span>
          <strong>{moneyReport(data.rangeExpenses)}</strong>
          <small>Compras registradas</small>
        </article>
        <article className={data.rangeBalance >= 0 ? "positive" : "negative"}>
          <span>Resultado operativo</span>
          <strong>{moneyReport(data.rangeBalance)}</strong>
          <small>Ingresos menos gastos</small>
        </article>
        <article>
          <span>Beneficio disponible</span>
          <strong>
            {moneyReport(data.rangeCollected - data.rangeExpenses)}
          </strong>
          <small>Cobrado menos gastos</small>
        </article>
      </div>
      <div className="financial-report-grid">
        <section className="financial-pl-card">
          <div className="financial-card-title">
            <span>Cuenta de resultados</span>
            <small>
              {range.from} · {range.to}
            </small>
          </div>
          <div className="financial-pl-row">
            <span>Ingresos por ventas</span>
            <b>{moneyReport(data.rangeSales)}</b>
          </div>
          <div className="financial-pl-row">
            <span>Ingresos netos</span>
            <b>{moneyReport(data.rangeSales)}</b>
          </div>
          <div className="financial-pl-row indent negative-row">
            <span>Coste de compras</span>
            <b>-{moneyReport(data.rangeExpenses)}</b>
          </div>
          <div className="financial-pl-row total positive-row">
            <span>Margen bruto</span>
            <b>{moneyReport(data.rangeBalance)}</b>
          </div>
          <div className="financial-pl-row indent">
            <span>Cobros recibidos</span>
            <b>{moneyReport(data.rangeCollected)}</b>
          </div>
          <div className="financial-pl-row total">
            <span>Resultado operativo</span>
            <b>{moneyReport(data.rangeBalance)}</b>
          </div>
          <div className="financial-pl-row">
            <span>Pendiente de cobro</span>
            <b>
              {moneyReport(Math.max(0, data.rangeSales - data.rangeCollected))}
            </b>
          </div>
        </section>
        <aside className="financial-side-stack">
          <section className="financial-side-card">
            <h3>Desglose de gastos</h3>
            <div className="financial-breakdown-row">
              <span>Compras a proveedores</span>
              <b>{data.rangeExpenses ? "100%" : "0%"}</b>
              <i>
                <em style={{ width: data.rangeExpenses ? "100%" : "0%" }} />
              </i>
            </div>
            <div className="financial-breakdown-row">
              <span>Gastos y tickets</span>
              <b>En seguimiento</b>
              <i>
                <em style={{ width: "4%" }} />
              </i>
            </div>
          </section>
          <section className="financial-side-card">
            <h3>Ratios clave</h3>
            <div className="financial-ratio">
              <span>Margen bruto</span>
              <b>
                {data.rangeSales
                  ? String(
                      ((data.rangeBalance / data.rangeSales) * 100).toFixed(1),
                    ) + "%"
                  : "0%"}
              </b>
            </div>
            <div className="financial-ratio">
              <span>Ratio cobrado</span>
              <b>
                {data.rangeSales
                  ? String(
                      ((data.rangeCollected / data.rangeSales) * 100).toFixed(
                        1,
                      ),
                    ) + "%"
                  : "0%"}
              </b>
            </div>
            <div className="financial-ratio">
              <span>Facturas emitidas</span>
              <b>{data.rangeInvoices}</b>
            </div>
            <div className="financial-ratio">
              <span>Por cobrar</span>
              <b>
                {moneyReport(
                  Math.max(0, data.rangeSales - data.rangeCollected),
                )}
              </b>
            </div>
          </section>
        </aside>
      </div>
      <div className="panel report-range-panel">
        <div>
          <b>Periodo financiero</b>
          <span className="muted">
            Ventas, compras y balance del intervalo seleccionado
          </span>
        </div>
        <div className="report-range-controls">
          <label>
            Desde
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </label>
          <button
            className="report-preset"
            onClick={() => setReportPreset("week")}
          >
            Semana
          </button>
          <button
            className="report-preset"
            onClick={() => setReportPreset("month")}
          >
            Mes
          </button>
          <button
            className="report-preset"
            onClick={() => setReportPreset("year")}
          >
            Año
          </button>
        </div>
      </div>
      <div className="report-range-cards">
        <article>
          <span>VENTAS DEL PERIODO</span>
          <strong>{moneyReport(data.rangeSales)}</strong>
          <small>{data.rangeInvoices} facturas emitidas</small>
        </article>
        <article>
          <span>GASTOS / COMPRAS</span>
          <strong>{moneyReport(data.rangeExpenses)}</strong>
          <small>Pedidos a proveedores</small>
        </article>
        <article className={data.rangeBalance >= 0 ? "positive" : "negative"}>
          <span>BALANCE OPERATIVO</span>
          <strong>{moneyReport(data.rangeBalance)}</strong>
          <small>Ventas menos compras</small>
        </article>
        <article>
          <span>COBROS RECIBIDOS</span>
          <strong>{moneyReport(data.rangeCollected)}</strong>
          <small>Movimientos registrados</small>
        </article>
      </div>
      <div className="report-cards">
        <article>
          <span>VENTAS</span>
          <strong>
            {data.sales.toLocaleString("es-ES", {
              style: "currency",
              currency: "EUR",
            })}
          </strong>
        </article>
        <article>
          <span>STOCK VALORADO</span>
          <strong>
            {data.stockValue.toLocaleString("es-ES", {
              style: "currency",
              currency: "EUR",
            })}
          </strong>
        </article>
        <article>
          <span>POR COBRAR</span>
          <strong>
            {Math.max(0, data.receivables).toLocaleString("es-ES", {
              style: "currency",
              currency: "EUR",
            })}
          </strong>
        </article>
        <article>
          <span>MARGEN ESTIMADO</span>
          <strong>
            {data.margin.toLocaleString("es-ES", {
              style: "currency",
              currency: "EUR",
            })}
          </strong>
        </article>
        <article>
          <span>CLIENTES</span>
          <strong>{data.clients}</strong>
        </article>
        <article>
          <span>PRODUCTOS</span>
          <strong>{data.products}</strong>
        </article>
        <article>
          <span>PEDIDOS</span>
          <strong>{data.orders}</strong>
        </article>
        <article>
          <span>FACTURAS</span>
          <strong>{data.invoices}</strong>
        </article>
      </div>
      <div className="panel chart-panel">
        <div className="report-section-head">
          <div>
            <h3>Actividad por módulo</h3>
            <p className="muted">Volumen actual de datos operativos</p>
          </div>
          <span className="report-period">Actualizado ahora</span>
        </div>
        <div className="bars">
          {[
            ["Clientes", data.clients],
            ["Productos", data.products],
            ["Pedidos", data.orders],
            ["Facturas", data.invoices],
          ].map(([name, value]: any) => (
            <div className="bar-row" key={name}>
              <span>{name}</span>
              <i
                style={{ width: `${Math.min(100, Math.max(6, value * 12))}%` }}
              />
              <b>{value}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="report-grid-two">
        <div className="panel report-detail-panel">
          <div className="report-section-head">
            <div>
              <h3>Estado de facturación</h3>
              <p className="muted">Distribución de facturas registradas</p>
            </div>
          </div>
          {(() => {
            const entries = Object.entries(data.invoiceStatuses) as any[];
            const total =
              entries.reduce((n, [, value]) => n + Number(value), 0) || 1;
            const colors = ["#b91c1c", "#f59e0b", "#059669", "#64748b"];
            let offset = 0;
            const stops = entries
              .map(([status, value], i) => {
                const start = offset;
                offset += (Number(value) / total) * 100;
                return `${colors[i % colors.length]} ${start}% ${offset}%`;
              })
              .join(", ");
            return (
              <div className="donut-layout">
                <div
                  className="donut-chart"
                  style={{
                    background: `conic-gradient(${stops || "#e5e7eb 0 100%"})`,
                  }}
                >
                  <div>
                    {entries.reduce((n, [, value]) => n + Number(value), 0)}
                    <small>facturas</small>
                  </div>
                </div>
                <div className="chart-legend">
                  {entries.length ? (
                    entries.map(([status, value], i) => (
                      <div key={status}>
                        <i style={{ background: colors[i % colors.length] }} />{" "}
                        <span>{status}</span>
                        <b>{value}</b>
                      </div>
                    ))
                  ) : (
                    <span className="muted">Sin datos</span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        <div className="panel report-detail-panel">
          <div className="report-section-head">
            <div>
              <h3>Valor del stock</h3>
              <p className="muted">
                Productos con mayor inversión inmovilizada
              </p>
            </div>
          </div>
          <div className="value-bars">
            {data.stockByProduct.length ? (
              data.stockByProduct.map((item: any, index: number) => {
                const max = data.stockByProduct[0]?.value || 1;
                return (
                  <div className="value-bar-row" key={`${item.name}-${index}`}>
                    <span title={item.name}>{item.name}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.max(4, (item.value / max) * 100)}%`,
                        }}
                      />
                    </div>
                    <b>
                      {item.value.toLocaleString("es-ES", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </b>
                  </div>
                );
              })
            ) : (
              <p className="muted">No hay stock valorado.</p>
            )}
          </div>
        </div>
        <div className="panel report-detail-panel">
          <div className="report-section-head">
            <div>
              <h3>Pedidos por estado</h3>
              <p className="muted">Seguimiento de la operación</p>
            </div>
          </div>
          <div className="status-list">
            {Object.entries(data.orderStatuses).length ? (
              Object.entries(data.orderStatuses).map(([status, count]: any) => (
                <div className="status-row" key={status}>
                  <span>{status}</span>
                  <b>{count}</b>
                </div>
              ))
            ) : (
              <p className="muted">Sin pedidos registrados.</p>
            )}
          </div>
        </div>
        <div className="panel report-detail-panel">
          <div className="report-section-head">
            <div>
              <h3>Stock que necesita atención</h3>
              <p className="muted">Disponible frente al mínimo configurado</p>
            </div>
          </div>
          <div className="mini-report-table">
            <div className="mini-report-head">
              <span>Producto</span>
              <span>Disponible</span>
              <span>Mínimo</span>
            </div>
            {data.criticalProducts.length ? (
              data.criticalProducts.map((p: any) => (
                <div className="mini-report-row" key={p.id}>
                  <span>{p.name}</span>
                  <b>{Number(p.stock || 0) - Number(p.stock_reserved || 0)}</b>
                  <span>{p.min_stock || 0}</span>
                </div>
              ))
            ) : (
              <p className="muted">No hay productos en stock crítico.</p>
            )}
          </div>
        </div>
      </div>
      <div className="report-visual-grid">
        <section className="panel report-visual-panel report-span-two">
          <div className="report-section-head">
            <div>
              <h3>Ventas por mes</h3>
              <p className="muted">
                Facturación emitida durante los últimos seis meses
              </p>
            </div>
            <span className="report-chart-tag">ÁREA</span>
          </div>
          {data.salesTimeline.length ? (
            <ReportAreaChart
              points={data.salesTimeline}
              label="Evolución mensual de ventas"
            />
          ) : (
            <p className="muted">
              No hay ventas suficientes para dibujar la evolución.
            </p>
          )}
        </section>
        <section className="panel report-visual-panel">
          <div className="report-section-head">
            <div>
              <h3>Ventas por cliente</h3>
              <p className="muted">Clientes con mayor facturación</p>
            </div>
            <span className="report-chart-tag">BARRAS</span>
          </div>
          {data.clientSales.length ? (
            <ReportBars
              items={data.clientSales}
              label="Ventas por cliente"
              currency
            />
          ) : (
            <p className="muted">Aún no hay facturación asociada a clientes.</p>
          )}
        </section>
        <section className="panel report-visual-panel">
          <div className="report-section-head">
            <div>
              <h3>Flujo de almacén</h3>
              <p className="muted">Entradas y salidas netas de unidades</p>
            </div>
            <span className="report-chart-tag">COLUMNAS</span>
          </div>
          {data.stockMovements.length ? (
            <ReportBars
              items={data.stockMovements.map((x: any) => ({
                ...x,
                value: Math.abs(x.value),
              }))}
              label="Movimiento neto mensual de stock"
            />
          ) : (
            <p className="muted">No hay movimientos de stock registrados.</p>
          )}
        </section>
        <section className="panel report-visual-panel">
          <div className="report-section-head">
            <div>
              <h3>Embudo de envíos</h3>
              <p className="muted">Pedidos por etapa logística</p>
            </div>
            <span className="report-chart-tag">EMBUDO</span>
          </div>
          <div className="report-funnel">
            {data.shipmentStatuses.length ? (
              data.shipmentStatuses
                .sort((a: any, b: any) => b.value - a.value)
                .map((item: any, i: number) => (
                  <div
                    className={`funnel-step funnel-step-${i % 4}`}
                    key={item.label}
                    style={{ width: `${Math.max(42, 100 - i * 12)}%` }}
                  >
                    <span>{item.label}</span>
                    <b>{item.value}</b>
                  </div>
                ))
            ) : (
              <p className="muted">No hay envíos registrados.</p>
            )}
          </div>
        </section>
        <section className="panel report-visual-panel">
          <div className="report-section-head">
            <div>
              <h3>Antigüedad de pedidos</h3>
              <p className="muted">Cuánto tiempo llevan abiertos</p>
            </div>
            <span className="report-chart-tag">DISTRIBUCIÓN</span>
          </div>
          <ReportBars items={data.orderAging} label="Antigüedad de pedidos" />
        </section>
        <section className="panel report-visual-panel">
          <div className="report-section-head">
            <div>
              <h3>Precio frente a coste</h3>
              <p className="muted">
                Cada punto es un producto; el tamaño representa stock
              </p>
            </div>
            <span className="report-chart-tag">DISPERSIÓN</span>
          </div>
          {data.productScatter.length ? (
            <ReportScatter
              items={data.productScatter}
              label="Relación entre coste, precio y stock"
            />
          ) : (
            <p className="muted">
              Faltan productos con coste y precio para comparar.
            </p>
          )}
        </section>
        <section className="panel report-visual-panel">
          <div className="report-section-head">
            <div>
              <h3>Rendimiento operativo</h3>
              <p className="muted">Volumen relativo de cada área</p>
            </div>
            <span className="report-chart-tag">RADAR</span>
          </div>
          <ReportRadar
            values={data.operationalRadar}
            label="Radar de rendimiento operativo"
          />
        </section>
        <section className="panel report-visual-panel">
          <div className="report-section-head">
            <div>
              <h3>Pedidos por día</h3>
              <p className="muted">Concentración semanal de la actividad</p>
            </div>
            <span className="report-chart-tag">MAPA</span>
          </div>
          <div
            className="report-heatmap"
            role="img"
            aria-label="Mapa de calor de pedidos por día"
          >
            {data.activityHeatmap.map((item: any) => (
              <div
                key={item.label}
                className="heat-cell"
                style={{
                  opacity: Math.max(
                    0.2,
                    Math.min(
                      1,
                      item.value /
                        Math.max(
                          ...data.activityHeatmap.map((x: any) => x.value),
                          1,
                        ),
                    ),
                  ),
                }}
                data-tooltip={`${item.label}: ${item.value} pedidos`}
              >
                <b>{item.label}</b>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="panel report-detail-panel">
        <div className="report-section-head">
          <div>
            <h3>Últimas facturas</h3>
            <p className="muted">Importes y estado de cobro</p>
          </div>
        </div>
        <div className="mini-report-table">
          <div className="mini-report-head">
            <span>Factura</span>
            <span>Importe</span>
            <span>Estado</span>
          </div>
          {data.recentInvoices.length ? (
            data.recentInvoices.map((i: any) => (
              <div className="mini-report-row" key={i.id}>
                <span>{i.code || `Factura #${i.id}`}</span>
                <b>
                  {Number(i.amount || 0).toLocaleString("es-ES", {
                    style: "currency",
                    currency: "EUR",
                  })}
                </b>
                <span
                  className={
                    i.status === "Cobrada" ? "ok-text" : "warning-text"
                  }
                >
                  {i.status || "Pendiente"}
                </span>
              </div>
            ))
          ) : (
            <p className="muted">No hay facturas registradas.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function History() {
  const [rows, setRows] = useState<any[]>([]);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  async function loadHistory() {
    setLoading(true);
    const params = new URLSearchParams({ actor, action, resource });
    try {
      const r = await fetch(`/api/audit_logs?${params}`, {
        headers: { "X-Audit-Query": "true", "X-Actor": "Luis" },
      });
      setRows(r.ok ? await r.json() : []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }
  useEffect(() => {
    loadHistory();
    setPage(1);
  }, [actor, action, resource]);
  const filteredRows = rows.filter((row) => {
    const text = `${row.actor || ""} ${row.resource || ""} ${row.action || ""} ${row.method || ""} ${row.details || ""}`.toLocaleLowerCase();
    const date = String(row.created_at || "").slice(0, 10);
    return (!query || text.includes(query.toLocaleLowerCase())) && (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  });
  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div className="history-page">
      <div className="manager-head">
        <div>
          <p className="eyebrow">CONTROL Y TRAZABILIDAD</p>
          <h2>Historial de actividad</h2>
          <p className="muted">
            Registro de consultas, altas, ediciones y borrados realizados en el
            CRM.
          </p>
        </div>
        <span className="db-badge">● Auditoría activa</span>
      </div>
      <div className="panel history-filters">
        <label className="history-search-field">
          Buscar en el historial
          <input placeholder="Usuario, módulo, acción o detalle…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
        </label>
        <label>
          Usuario o asistente
          <select value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">Todos</option>
            <option value="Luis">Luis</option>
            <option value="Jose">Jose</option>
            <option value="Asistente">Asistente</option>
            <option value="Usuario local">Usuario local</option>
          </select>
        </label>
        <label>
          Operación
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Todas</option>
            <option value="Consulta">Consultas</option>
            <option value="Alta">Altas</option>
            <option value="Edición">Ediciones</option>
            <option value="Borrado">Borrados</option>
          </select>
        </label>
        <label>
          Módulo
          <input
            placeholder="Ej.: products"
            value={resource}
            onChange={(e) => setResource(e.target.value)}
          />
        </label>
        <label>
          Desde
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
        </label>
        <label>
          Hasta
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
        </label>
        <button
          className="button secondary"
          onClick={() => {
            setActor("");
            setAction("");
            setResource("");
            setQuery("");
            setFromDate("");
            setToDate("");
            setPage(1);
          }}
        >
          Limpiar filtros
        </button>
      </div>
      <div className="panel history-table">
        <div className="history-summary">
          <b>{filteredRows.length}</b> movimientos encontrados · mostrando {filteredRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredRows.length)}
        </div>
        <TopHorizontalScroll className="history-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Operación</th>
                <th>Recurso</th>
                <th>Método</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Cargando historial…</td>
                </tr>
              ) : rows.length ? (
                visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString("es-ES")
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={
                          row.actor === "Asistente"
                            ? "actor-badge assistant-actor"
                            : "actor-badge"
                        }
                      >
                        {row.actor}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`audit-action action-${String(row.action).toLowerCase()}`}
                      >
                        {row.action}
                      </span>
                    </td>
                    <td>{row.resource}</td>
                    <td>{row.method}</td>
                    <td>{row.details || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No hay movimientos con esos filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </TopHorizontalScroll>
        <div className="history-pagination">
          <span>Página {page} de {pageCount} · 100 por página</span>
          <div>
            <button type="button" className="button secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Anterior</button>
            <button type="button" className="button secondary" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduledTasks() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<any>({
    title: "",
    action_text: "",
    schedule_type: "Unica",
    recurrence: "",
    next_run: "",
    status: "Activa",
  });
  async function load() {
    setLoading(true); setLoadError("");
    try {
      const r = await fetchWithRetry("/api/scheduled_tasks");
      if (!r.ok) throw new Error("No se ha podido cargar las tareas");
      const data = await r.json();
      setRows(Array.isArray(data) ? data : []);
    } catch { setLoadError("No se han podido actualizar las tareas programadas."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(e: any) {
    e.preventDefault();
    const next = form.next_run
      ? new Date(form.next_run).toISOString()
      : new Date(Date.now() + 3600000).toISOString();
    const r = await fetch("/api/scheduled_tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Actor": "Luis" },
      body: JSON.stringify({ ...form, next_run: next, created_by: "Luis" }),
    });
    if (r.ok) {
      setForm({
        title: "",
        action_text: "",
        schedule_type: "Unica",
        recurrence: "",
        next_run: "",
        status: "Activa",
      });
      load();
    }
  }
  async function toggle(row: any) {
    await fetch(`/api/scheduled_tasks/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Actor": "Luis" },
      body: JSON.stringify({
        ...row,
        status: row.status === "Activa" ? "Pausada" : "Activa",
      }),
    });
    load();
  }
  async function runNow(row: any) {
    if (row.status !== "Activa") return;
    const response = await fetch(`/api/scheduled_tasks/${row.id}/run`, { method: "POST", headers: { "X-Actor": "Luis" } });
    if (!response.ok) setLoadError((await response.json().catch(() => ({}))).error || "No se ha podido ejecutar la tarea.");
    await load();
  }
  async function remove(id: number) {
    await fetch(`/api/scheduled_tasks/${id}`, {
      method: "DELETE",
      headers: { "X-Actor": "Luis" },
    });
    load();
  }
  return (
    <div className="scheduled-page">
      <div className="manager-head">
        <div>
          <p className="eyebrow">AUTOMATIZACIÓN LOCAL</p>
          <h2>Tareas programadas</h2>
          <p className="muted">
            Acciones únicas o recurrentes que ejecuta el asistente contra el
            CRM.
          </p>
        </div>
        <span className="db-badge">● Motor activo</span>
      </div>
      {loading && <div className="data-loading" role="status"><span className="loading-spinner" aria-hidden="true" /><LoadingIndicator label="Cargando tareas programadas…" /></div>}
      {loadError && <div className="error-message">{loadError}</div>}
      <div className="panel scheduled-form">
        <h3>Nueva tarea</h3>
        <div className="automation-presets"><span>Crear rápidamente:</span><button type="button" onClick={() => setForm({ ...form, title: "Revisar facturas vencidas", action_text: "Revisar facturas vencidas y crear avisos", schedule_type: "Recurrente", recurrence: "diaria" })}>Facturas vencidas</button><button type="button" onClick={() => setForm({ ...form, title: "Revisar clientes web", action_text: "Revisar clientes web pendientes", schedule_type: "Recurrente", recurrence: "diaria" })}>Clientes web</button><button type="button" onClick={() => setForm({ ...form, title: "Revisar ubicaciones", action_text: "Revisar ubicaciones pendientes de verificar", schedule_type: "Recurrente", recurrence: "diaria" })}>Ubicaciones</button><button type="button" onClick={() => setForm({ ...form, title: "Copia de seguridad diaria", action_text: "Crear copia de seguridad", schedule_type: "Recurrente", recurrence: "diaria" })}>Copia diaria</button></div>
        <form onSubmit={save}>
          <label>
            Título
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            Acción en lenguaje natural
            <input
              required
              placeholder="Ej.: nota: revisar stock de bebidas"
              value={form.action_text}
              onChange={(e) =>
                setForm({ ...form, action_text: e.target.value })
              }
            />
          </label>
          <label>
            Tipo
            <select
              value={form.schedule_type}
              onChange={(e) =>
                setForm({ ...form, schedule_type: e.target.value })
              }
            >
              <option>Unica</option>
              <option>Recurrente</option>
            </select>
          </label>
          <label>
            Repetición
            <input
              placeholder="diaria, semanal o lunes"
              value={form.recurrence}
              onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
            />
          </label>
          <label>
            Próxima ejecución
            <input
              type="datetime-local"
              value={form.next_run}
              onChange={(e) => setForm({ ...form, next_run: e.target.value })}
            />
          </label>
          <button className="button primary">＋ Programar tarea</button>
        </form>
      </div>
      <div className="panel scheduled-list">
        <div className="history-summary">
          <b>{rows.length}</b> tareas guardadas
        </div>
        <TopHorizontalScroll className="history-scroll">
          <table>
            <thead>
              <tr>
                <th>Tarea</th>
                <th>Acción</th>
                <th>Tipo</th>
                <th>Próxima ejecución</th>
                <th>Estado</th>
                <th>Último resultado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <b>{row.title}</b>
                      <small className="task-creator">
                        Creada por {row.created_by}
                      </small>
                    </td>
                    <td>{row.action_text}</td>
                    <td>
                      {row.schedule_type}
                      {row.recurrence ? ` · ${row.recurrence}` : ""}
                    </td>
                    <td>
                      {row.next_run
                        ? new Date(row.next_run).toLocaleString("es-ES")
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`task-status task-${String(row.status).toLowerCase()}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td>{row.last_result || "Pendiente"}</td>
                    <td>
                      <button className="row-action" onClick={() => void runNow(row)} disabled={row.status !== "Activa"}>
                        Ejecutar ahora
                      </button>{" "}
                      <button
                        className="row-action"
                        onClick={() => toggle(row)}
                      >
                        {row.status === "Activa" ? "Pausar" : "Activar"}
                      </button>{" "}
                      <button
                        className="row-action danger"
                        onClick={() => remove(row.id)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>No hay tareas programadas todavía.</td>
                </tr>
              )}
            </tbody>
          </table>
        </TopHorizontalScroll>
      </div>
    </div>
  );
}

function TabletCrudPanel({
  clients,
  products,
  crudType,
  setCrudType,
  crudId,
  crudForm,
  setCrudForm,
  selectCrudRecord,
  saveCrudRecord,
  deleteCrudRecord,
  onBack,
  error,
}: any) {
  const records = crudType === "clients" ? clients : products;
  return (
    <div className="tablet-crud-panel">
      <div className="tablet-title">
        <div>
          <p className="eyebrow">GESTIÓN DESDE LA TABLET</p>
          <h2>Clientes y productos</h2>
          <p>Alta, edición y eliminación sin salir de la visita comercial.</p>
        </div>
        <button className="button secondary" onClick={onBack}>
          ← Volver al pedido
        </button>
      </div>
      <div className="tablet-crud-tabs">
        <button
          className={crudType === "clients" ? "active" : ""}
          onClick={() => {
            setCrudType("clients");
            selectCrudRecord("");
          }}
        >
          Clientes
        </button>
        <button
          className={crudType === "products" ? "active" : ""}
          onClick={() => {
            setCrudType("products");
            selectCrudRecord("");
          }}
        >
          Productos
        </button>
      </div>
      <div className="tablet-crud-body">
        <section className="tablet-crud-list">
          <h3>
            {crudType === "clients"
              ? "Clientes registrados"
              : "Productos registrados"}
          </h3>
          <select
            size={9}
            value={crudId}
            onChange={(event) => selectCrudRecord(event.target.value)}
          >
            <option value="">＋ Nuevo registro</option>
            {records.map((record: any) => (
              <option key={record.id} value={record.id}>
                {record.name}
              </option>
            ))}
          </select>
        </section>
        <section className="tablet-crud-form">
          <h3>{crudId ? "Editar registro" : "Nuevo registro"}</h3>
          <label>
            Nombre
            <input
              value={crudForm.name || ""}
              onChange={(event) =>
                setCrudForm({ ...crudForm, name: event.target.value })
              }
            />
          </label>
          {crudType === "clients" ? (
            <div className="tablet-crud-fields">
              <label>
                Teléfono
                <input
                  value={crudForm.phone || ""}
                  onChange={(event) =>
                    setCrudForm({ ...crudForm, phone: event.target.value })
                  }
                />
              </label>
              <label>
                Correo
                <input
                  value={crudForm.email || ""}
                  onChange={(event) =>
                    setCrudForm({ ...crudForm, email: event.target.value })
                  }
                />
              </label>
              <label>
                Dirección
                <input
                  value={crudForm.address || ""}
                  onChange={(event) =>
                    setCrudForm({ ...crudForm, address: event.target.value })
                  }
                />
              </label>
              <label>
                Ciudad
                <input
                  value={crudForm.city || ""}
                  onChange={(event) =>
                    setCrudForm({ ...crudForm, city: event.target.value })
                  }
                />
              </label>
            </div>
          ) : (
            <div className="tablet-crud-fields">
              <label>
                Referencia / SKU
                <input
                  value={crudForm.sku || ""}
                  onChange={(event) =>
                    setCrudForm({ ...crudForm, sku: event.target.value })
                  }
                />
              </label>
              <label>
                Precio de venta
                <input
                  type="number"
                  step="0.01"
                  value={crudForm.unit_price ?? 0}
                  onChange={(event) =>
                    setCrudForm({ ...crudForm, unit_price: event.target.value })
                  }
                />
              </label>
              <label>
                Coste de compra
                <input
                  type="number"
                  step="0.01"
                  value={crudForm.cost_price ?? 0}
                  onChange={(event) =>
                    setCrudForm({ ...crudForm, cost_price: event.target.value })
                  }
                />
              </label>
              <label>
                Stock inicial
                <input
                  type="number"
                  value={crudForm.stock ?? 0}
                  onChange={(event) =>
                    setCrudForm({ ...crudForm, stock: event.target.value })
                  }
                />
              </label>
            </div>
          )}
          <div className="tablet-crud-actions">
            <button className="button primary" onClick={saveCrudRecord}>
              {crudId ? "Guardar cambios" : "Crear registro"}
            </button>
            {crudId && (
              <button
                className="button danger-outline"
                onClick={deleteCrudRecord}
              >
                Eliminar
              </button>
            )}
          </div>
          {error && <p className="tablet-error">{error}</p>}
        </section>
      </div>
    </div>
  );
}

function tabletTodayInput() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function tabletDateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function ClientPortalDashboard({ data, onNewOrder, onRepeat }: { data: any; onNewOrder: () => void; onRepeat: (order: any) => void }) {
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const shipments = Array.isArray(data?.shipments) ? data.shipments : [];
  const invoices = Array.isArray(data?.invoices) ? data.invoices : [];
  const deliveries = Array.isArray(data?.delivery_notes) ? data.delivery_notes : [];
  const money = (value: number) => Number(value || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  const date = (value: any) => value ? new Date(value).toLocaleDateString("es-ES") : "—";
  const orderShipment = (orderId: number) => shipments.find((shipment) => Number(shipment.order_id) === Number(orderId));
  const statusClass = (value: any) => String(value || "pendiente").toLowerCase().replace(/\s+/g, "-");
  return <section className="client-portal-dashboard">
    <div className="client-portal-dashboard-head"><div><p className="eyebrow">ÁREA DE CLIENTE</p><h2>Hola, {data?.profile?.name || "cliente"}.</h2><p>Consulta tus pedidos, documentos y entregas desde un mismo sitio.</p></div><button type="button" className="button primary" onClick={onNewOrder}>＋ Nuevo pedido</button></div>
    <div className="client-portal-stat-grid"><article><strong>{data?.summary?.orders || 0}</strong><span>Pedidos realizados</span></article><article><strong>{data?.summary?.in_progress || 0}</strong><span>Pedidos en curso</span></article><article><strong>{data?.summary?.shipments || 0}</strong><span>Entregas activas</span></article><article><strong>{data?.summary?.pending_invoices || 0}</strong><span>Facturas pendientes</span></article></div>
    <div className="client-portal-columns">
      <article className="client-portal-panel"><div className="client-portal-panel-head"><div><b>Mis pedidos</b><small>Últimos pedidos y estado de entrega</small></div><button type="button" onClick={onNewOrder}>Repetir o crear</button></div>{orders.length ? <div className="client-portal-order-list">{orders.slice(0, 8).map((order: any) => { const shipment = orderShipment(order.id); return <div className="client-portal-order-row" key={order.id}><div><b>{order.code}</b><small>{date(order.created_at)} · {order.lines?.length || 0} referencias · {money(order.amount)}</small></div><span className={`client-portal-status status-${statusClass(shipment?.status || order.status)}`}>{shipment?.status || order.status || "Pendiente"}</span><div className="client-portal-order-links">{shipment?.public_tracking_token && <a href={`/seguimiento/${shipment.public_tracking_token}`}>Seguimiento</a>}<button type="button" onClick={() => onRepeat(order)}>Repetir</button></div></div>; })}</div> : <p className="client-portal-empty">Todavía no tienes pedidos. Crea el primero desde aquí.</p>}</article>
      <article className="client-portal-panel"><div className="client-portal-panel-head"><div><b>Mis documentos</b><small>Facturas y albaranes disponibles</small></div></div><div className="client-portal-document-list">{[...invoices.map((item: any) => ({ ...item, kind: "Factura" })), ...deliveries.map((item: any) => ({ ...item, kind: "Albarán" }))].slice(0, 10).map((item: any) => <div className="client-portal-document-row" key={`${item.kind}-${item.id}`}><div><b>{item.code}</b><small>{item.kind} · {date(item.issue_date || item.created_at)}{item.amount !== undefined ? ` · ${money(item.amount)}` : ""}</small></div>{item.share_url || item.pdf_url ? <a href={item.share_url || item.pdf_url} target="_blank" rel="noreferrer">Ver PDF</a> : <span className="client-portal-document-pending">Pendiente</span>}</div>)}{!invoices.length && !deliveries.length && <p className="client-portal-empty">Aún no hay documentos asociados.</p>}</div></article>
    </div>
    <div className="client-portal-profile"><span><b>Dirección habitual</b>{data?.profile?.address || "No indicada"}{data?.profile?.city ? ` · ${data.profile.city}` : ""}</span><span><b>Horario de recepción</b>{data?.profile?.opening_time || data?.profile?.closing_time ? `${data.profile.opening_time || "—"} – ${data.profile.closing_time || "—"}` : "Pendiente de confirmar"}</span><span><b>Contacto</b>{data?.profile?.email || data?.profile?.phone || "No indicado"}</span></div>
  </section>;
}

export function ClientOrderPortal({
  onClose,
  onCreated,
  standalone = false,
}: {
  onClose: () => void;
  onCreated: (order: any) => void;
  standalone?: boolean;
}) {
  const [clients, setClients] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [quantityUnit, setQuantityUnit] = useState<"unidad" | "caja" | "pack_4" | "pack_6" | "palet">("unidad");
  const [deliveryDate, setDeliveryDate] = useState(() => tabletTodayInput());
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<any>(null);
  const [portalSession, setPortalSession] = useState<any>(standalone ? undefined : null);
  const [portalData, setPortalData] = useState<any>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [portalTab, setPortalTab] = useState<"actividad" | "pedir">("actividad");

  useEffect(() => {
    if (!standalone) return;
    try {
      const raw = localStorage.getItem("excluvas.portal.session");
      setPortalSession(raw ? JSON.parse(raw) : null);
    } catch {
      setPortalSession(null);
    }
  }, [standalone]);
  useEffect(() => {
    if (standalone && portalSession?.kind === "cliente" && portalSession.id) {
      setClientId(String(portalSession.id));
      setClientSearch(String(portalSession.name || ""));
    }
  }, [standalone, portalSession]);
  useEffect(() => {
    if (!standalone || portalSession?.kind !== "cliente" || !portalSession.token) return;
    let mounted = true;
    setPortalLoading(true);
    setPortalError("");
    fetch("/api/public_portal", { headers: { Authorization: `Bearer ${portalSession.token}` }, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se ha podido cargar tu área de cliente.");
        if (mounted) setPortalData(body);
      })
      .catch((caught) => { if (mounted) setPortalError(caught instanceof Error ? caught.message : "No se ha podido cargar tu área de cliente."); })
      .finally(() => { if (mounted) setPortalLoading(false); });
    return () => { mounted = false; };
  }, [standalone, portalSession]);
  useEffect(() => {
    Promise.all(["clients", "products"].map((resource) =>
      fetch(`/api/${resource}`).then((response) => response.json()),
    )).then(([clientRows, productRows]) => {
      setClients(Array.isArray(clientRows) ? clientRows : []);
      setProducts(Array.isArray(productRows) ? productRows : []);
    }).catch(() => setError("No se han podido cargar los datos del catálogo."));
  }, []);

  const portalClients = standalone && portalSession?.kind === "cliente" ? clients.filter((client) => String(client.id) === String(portalSession.id)) : clients;
  const selectedClient = portalClients.find((client) => String(client.id) === String(clientId)) || (standalone && portalData?.profile ? portalData.profile : null);
  const clientMatches = portalClients.filter((client) => matchesSearch(
    `${client.name || ""} ${client.city || ""} ${client.phone || ""} ${client.email || ""}`,
    clientSearch,
  )).slice(0, 7);
  const productMatches = products.filter((product) => matchesSearch(
    `${product.name || ""} ${product.sku || ""} ${product.barcode || ""} ${product.brand || ""} ${product.format || ""}`,
    productSearch,
  )).slice(0, 8);
  const total = cart.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price), 0);
  const euro = (value: number) => `${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  function unitFactor(product: any, unit: string) {
    if (unit === "caja") return Math.max(1, Number(product?.units_per_case || 1));
    if (unit === "pack_4") return 4;
    if (unit === "pack_6") return 6;
    if (unit === "palet") return Math.max(1, Number(product?.units_per_pallet || Number(product?.units_per_case || 1) * 10));
    return 1;
  }
  function chooseClient(client: any) {
    setClientId(String(client.id));
    setClientSearch(client.name || "");
    setAddress(client.address || "");
  }
  function addProduct() {
    if (!selectedProduct || quantity < 1) return;
    const factor = unitFactor(selectedProduct, quantityUnit);
    const requested = Number(quantity);
    setCart((current) => {
      const existing = current.find((line) => line.product_id === selectedProduct.id && line.quantity_unit === quantityUnit);
      if (existing) return current.map((line) => line.product_id === selectedProduct.id && line.quantity_unit === quantityUnit
          ? { ...line, quantity_requested: Number(line.quantity_requested) + requested, quantity: Number(line.quantity) + requested * factor }
        : line);
      return [...current, {
        product_id: selectedProduct.id,
        name: selectedProduct.name,
        quantity: requested * factor,
        quantity_requested: requested,
        quantity_unit: quantityUnit,
        units_factor: factor,
        unit_price: Number(selectedProduct.unit_price || 0),
      }];
    });
    setSelectedProduct(null);
    setProductSearch("");
    setQuantity(1);
  }
  async function submitOrder(event: FormEvent) {
    event.preventDefault();
    if (!clientId || !cart.length || !deliveryDate) {
      setError("Selecciona tu empresa, al menos un producto y la fecha de entrega.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Actor": "Portal web" },
        body: JSON.stringify({
          code: `WEB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
          client_id: Number(clientId),
          amount: total,
          status: "Pendiente",
          delivery_date: deliveryDate,
          address,
          notes: `${notes}${notes ? "\\n" : ""}Pedido recibido desde el portal web del cliente.`,
          lines: cart.map((line) => ({
            product_id: line.product_id,
            quantity: line.quantity,
            quantity_requested: line.quantity_requested,
            quantity_unit: line.quantity_unit,
            units_factor: line.units_factor,
            unit_price: line.unit_price,
            amount: Number(line.quantity) * Number(line.unit_price),
            vat: 21,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se ha podido enviar el pedido.");
      setSaved(body);
      onCreated(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido enviar el pedido.");
    } finally {
      setSaving(false);
    }
  }
  function openWhatsApp() {
    let number = "";
    try { number = String(localStorage.getItem("excluvas.whatsapp.number") || "").replace(/\D/g, ""); } catch {}
    if (!number) {
      setError("Configura primero el número de WhatsApp Business en Ajustes.");
      return;
    }
    const message = `Hola, soy ${selectedClient?.name || "cliente"}. Quiero realizar un pedido${cart.length ? ` de ${cart.length} productos` : ""}.`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }
  function repeatOrder(order: any) {
    const lines = Array.isArray(order?.lines) ? order.lines : [];
    setCart(lines.map((line: any) => ({
      product_id: Number(line.product_id),
      name: line.product_name || `Producto #${line.product_id}`,
      quantity: Number(line.quantity || 1),
      quantity_requested: Number(line.quantity_requested || line.quantity || 1),
      quantity_unit: line.quantity_unit || "unidad",
      units_factor: Number(line.units_factor || 1),
      unit_price: Number(line.unit_price || 0),
    })));
    setDeliveryDate(order.delivery_date || tabletTodayInput());
    setAddress(order.address || portalData?.profile?.address || "");
    setNotes("Pedido repetido desde el área de cliente.");
    setSaved(null);
    setPortalTab("pedir");
    setError("");
    window.setTimeout(() => document.querySelector(".web-order-catalog")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  return (
    <div className={standalone ? "web-order-page" : "web-order-overlay"}>
      <div className={standalone ? "web-order-window web-order-page-window" : "web-order-window"} role={standalone ? undefined : "dialog"} aria-modal={standalone ? undefined : true} aria-label="Portal web de pedidos">
        <header className="web-order-nav">
          <div className="web-order-brand"><span>E</span><div><b>Exclusivas</b><small>Portal de pedidos</small></div></div>
          <div className="web-order-nav-status"><i /> Conectado al CRM</div>
          <button type="button" className="web-order-close" onClick={onClose} aria-label="Cerrar portal">×</button>
        </header>
        {standalone && portalSession === undefined ? <div className="web-order-access-required"><div className="web-order-access-icon">E</div><p className="eyebrow">ACCESO PROFESIONAL</p><h2>Comprueba tu cuenta para continuar.</h2><p>Inicia sesión desde la web para consultar tus pedidos y preparar uno nuevo.</p><a className="button primary" href="/web#login">Iniciar sesión</a></div> : standalone && portalSession?.kind !== "cliente" ? <div className="web-order-access-required"><div className="web-order-access-icon">E</div><p className="eyebrow">PORTAL DE CLIENTES</p><h2>Este portal es para hacer pedidos.</h2><p>La cuenta de proveedor está activa, pero su área profesional todavía está en preparación.</p><a className="button secondary" href="/web">Volver a la web</a></div> : !saved ? (
          <>
            {standalone && portalData && <ClientPortalDashboard data={portalData} onNewOrder={() => setPortalTab("pedir")} onRepeat={repeatOrder} />}
            {standalone && portalLoading && <div className="client-portal-loading" role="status"><span className="loading-spinner" />Cargando tu área de cliente…</div>}
            {standalone && portalError && <div className="client-portal-error" role="alert">{portalError} <a href="/web#login">Volver a iniciar sesión</a></div>}
            {standalone && portalData && <div className="client-portal-tabs" role="tablist" aria-label="Área de cliente"><button type="button" className={portalTab === "actividad" ? "active" : ""} onClick={() => setPortalTab("actividad")}>Mi actividad</button><button type="button" className={portalTab === "pedir" ? "active" : ""} onClick={() => setPortalTab("pedir")}>Nuevo pedido</button></div>}
            {(!standalone || portalTab === "pedir") && <form onSubmit={submitOrder}>
            <section className="web-order-hero">
              <div><p className="eyebrow">PEDIDOS ONLINE</p><h2>Haz tu pedido de bebidas</h2><p>Selecciona los productos, indica cuándo los necesitas y nosotros nos encargamos del resto.</p></div>
              <div className="web-order-hero-note"><b>Entrega coordinada</b><span>Recibirás confirmación de tu pedido</span></div>
            </section>
            <div className="web-order-body">
              <section className="web-order-card web-order-catalog">
                <div className="web-order-section-title"><div><b>Datos de entrega</b><span>Identifica tu empresa y el destino del pedido.</span></div><strong>1</strong></div>
                <div className="web-order-client-grid">
                  <label className="web-order-field">Empresa o cliente
                    <input value={clientSearch} onChange={(event) => { setClientSearch(event.target.value); setClientId(""); }} placeholder="Buscar por nombre, ciudad o teléfono…" autoComplete="off" />
                    {clientSearch && !selectedClient && <div className="web-order-suggestions">{clientMatches.length ? clientMatches.map((client) => <button type="button" key={client.id} onClick={() => chooseClient(client)}><b>{client.name}</b><small>{client.city || "Madrid"} · {client.phone || "Sin teléfono"}</small></button>) : <span>No hay clientes que coincidan.</span>}</div>}
                  </label>
                  <label className="web-order-field">Fecha de entrega<input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
                </div>
                <label className="web-order-field">Dirección de entrega<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Selecciona un cliente para cargar su dirección" /></label>
                {selectedClient && <div className="web-order-client-info"><span>{selectedClient.email || "Correo no indicado"}</span><span>{selectedClient.phone || "Teléfono no indicado"}</span></div>}
                <div className="web-order-section-title products"><div><b>Catálogo de productos</b><span>Busca por nombre, referencia, marca o formato.</span></div><strong>{cart.length}</strong></div>
                <div className="web-order-product-row">
                  <label className="web-order-field"><span className="sr-only">Buscar producto</span><input value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setSelectedProduct(null); }} placeholder="Buscar producto por nombre, referencia o código…" autoComplete="off" />
                    {productSearch && !selectedProduct && <div className="web-order-suggestions product-results">{productMatches.length ? productMatches.map((product) => <button type="button" key={product.id} onClick={() => { setSelectedProduct(product); setProductSearch(product.name || ""); }}><b>{product.name}</b><small>{product.sku || "Sin referencia"} · Stock {Number(product.stock || 0)}</small></button>) : <span>No hay productos que coincidan.</span>}</div>}
                  </label>
                  <input className="web-order-quantity" type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} aria-label="Cantidad" />
                  <select value={quantityUnit} onChange={(event) => setQuantityUnit(event.target.value as "unidad" | "caja" | "palet")} aria-label="Tipo de cantidad"><option value="unidad">Unidades</option><option value="caja">Cajas</option><option value="palet">Palés</option></select>
                  <button type="button" className="button primary" onClick={addProduct} disabled={!selectedProduct}>Añadir</button>
                </div>
                <div className="web-order-cart">{cart.length ? cart.map((line, index) => <div className="web-order-cart-line" key={`${line.product_id}-${line.quantity_unit}`}><div><b>{line.name}</b><small>{line.quantity_requested} {line.quantity_unit}{line.units_factor > 1 ? ` · ${line.quantity} unidades` : ""}</small></div><strong>{euro(Number(line.quantity) * Number(line.unit_price))}</strong><button type="button" onClick={() => setCart((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Quitar ${line.name}`}>×</button></div>) : <p className="web-order-empty">Añade productos para preparar tu pedido.</p>}</div>
              </section>
              <aside className="web-order-card web-order-summary">
                <div className="web-order-section-title"><div><b>Resumen del pedido</b><span>Revisa los datos antes de enviarlo.</span></div></div>
                <div className="web-order-summary-data"><span>Cliente <b>{selectedClient?.name || "Sin seleccionar"}</b></span><span>Entrega <b>{deliveryDate || "Sin fecha"}</b></span><span>Destino <b>{address || "Sin dirección"}</b></span></div>
                <label className="web-order-field">Notas para el reparto<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Horario, indicaciones o comentarios…" /></label>
                <div className="web-order-total"><span>Total previsto</span><strong>{euro(total)}</strong></div>
                {error && <p className="web-order-error">{error}</p>}
                <button className="button primary web-order-submit" disabled={saving}>{saving ? "Enviando pedido…" : "Enviar pedido al CRM"}</button>
                <button type="button" className="web-order-whatsapp" onClick={openWhatsApp}>Continuar por WhatsApp</button>
                <small className="web-order-privacy">Este portal envía el pedido al CRM para su revisión comercial.</small>
              </aside>
            </div>
          </form>}
          </>
        ) : <div className="web-order-success"><div className="success-icon">✓</div><p className="eyebrow">PEDIDO RECIBIDO</p><h2>Gracias, tu pedido está en marcha</h2><p>El pedido <b>{saved.code || "web"}</b> se ha guardado en el CRM y queda pendiente de preparación.</p><button type="button" className="button primary" onClick={onClose}>Cerrar portal</button></div>}
        {standalone && <footer className="web-order-footer"><span>Exclusivas · Distribución profesional de bebidas</span><span>Pedidos seguros · Atención comercial</span></footer>}
      </div>
    </div>
  );
}

function TabletOperationsMenu({ counts, onOpenOrder, onOpenData, onOpenModule }: { counts: Record<string, number>; onOpenOrder: () => void; onOpenData: () => void; onOpenModule: (module: string) => void }) {
  const options = [
    ["liquidacion", "Informe de liquidación", "Resumen de ventas y cobros"],
    ["documentos", "Estado de documentos", "Pedidos, albaranes y facturas"],
    ["cobrados", "Documentos cobrados", "Facturas y cobros registrados"],
    ["pendientes", "Documentos pendientes", "Facturas pendientes de cobro"],
    ["catalogo", "Catálogo de productos", "Consulta referencias y stock"],
    ["visitas", "Listado de visitas", "Clientes y actividad comercial"],
    ["rutas", "Listado de rutas", "Entregas y envíos previstos"],
  ];
  return <div className="tablet-home-panel">
    <div className="tablet-home-title"><p className="eyebrow">EXCLUSIVAS INTELIGENTES</p><h2>Centro de operaciones</h2><p>Consulta la información de tu ruta o registra un pedido desde la tablet.</p></div>
    <div className="tablet-home-actions"><button type="button" className="button primary" onClick={onOpenOrder}>＋ Nuevo pedido</button><button type="button" className="button secondary" onClick={onOpenData}>Gestionar clientes y productos</button></div>
    <div className="tablet-operation-list">{options.map(([key, title, subtitle]) => <button type="button" key={key} onClick={() => onOpenModule(key)}><span><b>{title}</b><small>{subtitle}</small></span><strong>{counts[key] ?? 0}</strong><i>›</i></button>)}</div>
  </div>;
}

function TabletModulePanel({ module, counts, onBack }: { module: string; counts: Record<string, number>; onBack: () => void }) {
  const labels: Record<string, string> = { liquidacion: "Informe de liquidación", documentos: "Estado de documentos", cobrados: "Documentos cobrados", pendientes: "Documentos pendientes", catalogo: "Catálogo de productos", visitas: "Listado de visitas", rutas: "Listado de rutas" };
  const descriptions: Record<string, string> = { liquidacion: "Resumen disponible de ventas, cobros y documentos del periodo.", documentos: "Seguimiento de los documentos relacionados con la actividad comercial.", cobrados: "Documentos cobrados registrados en el CRM.", pendientes: "Documentos que todavía están pendientes de cobro.", catalogo: "Consulta el catálogo completo desde Nuevo pedido.", visitas: "Clientes disponibles para planificar visitas.", rutas: "Entregas y rutas registradas para seguimiento." };
  return <div className="tablet-module-panel"><button type="button" className="tablet-back-button" onClick={onBack}>‹ Volver al centro de operaciones</button><p className="eyebrow">CONSULTA OPERATIVA</p><h2>{labels[module] || "Consulta"}</h2><p>{descriptions[module] || "Información del CRM."}</p><div className="tablet-module-count"><strong>{counts[module] ?? 0}</strong><span>registros disponibles</span></div><p className="tablet-module-note">Los datos se consultan directamente desde la base de datos del CRM y se actualizan al volver a esta pantalla.</p></div>;
}

function TabletOrderDemo({
  onClose,
  onViewOrders,
  user,
  requireLogin = false,
}: {
  onClose: () => void;
  onViewOrders: () => void;
  user?: any;
  requireLogin?: boolean;
}) {
  const [clients, setClients] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [points, setPoints] = useState<any[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [savingClientAddress, setSavingClientAddress] = useState(false);
  const [pointId, setPointId] = useState("");
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showTabletPrices, setShowTabletPrices] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [quantityUnit, setQuantityUnit] = useState<"unidad" | "caja" | "pack_4" | "pack_6" | "palet">("unidad");
  const [totalUnits, setTotalUnits] = useState(1);
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [preparationDate, setPreparationDate] = useState(() => tabletTodayInput());
  const [shippingDate, setShippingDate] = useState(() => tabletTodayInput());
  const [urgent, setUrgent] = useState(false);
  const [responsible, setResponsible] = useState(user?.username || "");
  const [tabletUsername, setTabletUsername] = useState("");
  const [tabletPassword, setTabletPassword] = useState("");
  const [tabletRemember, setTabletRemember] = useState(false);
  const [tabletLoginError, setTabletLoginError] = useState("");
  const [notes, setNotes] = useState(
    "Avisar al responsable 30 minutos antes de la entrega.",
  );
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Combustible");
  const [expenseVendor, setExpenseVendor] = useState("");
  const [expenseFile, setExpenseFile] = useState<any>(null);
  const [expenseSaved, setExpenseSaved] = useState("");
  const [cart, setCart] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<any>(null);
  const [tabletView, setTabletView] = useState<"inicio" | "pedido" | "datos" | "resumen">(requireLogin ? "inicio" : "pedido");
  const [tabletModule, setTabletModule] = useState("documentos");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    "horizontal",
  );
  const [tabletStarted, setTabletStarted] = useState(!requireLogin);
  const [crudType, setCrudType] = useState<"clients" | "products">("clients");
  const [crudId, setCrudId] = useState("");
  const [crudForm, setCrudForm] = useState<any>({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    sku: "",
    unit_price: 0,
    cost_price: 0,
    stock: 0,
  });
  const [documents, setDocuments] = useState<any>({
    delivery: null,
    shipment: null,
  });
  const [tabletCounts, setTabletCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    if (!requireLogin) return;
    try {
      const remembered = localStorage.getItem("exclusivas.tablet.session");
      if (!remembered) return;
      const session = JSON.parse(remembered);
      if (session?.username) {
        setTabletUsername(session.username);
        setResponsible(session.username);
        setTabletRemember(true);
        setTabletStarted(true);
        setTabletView("inicio");
      }
    } catch { /* Si la preferencia no es válida, se muestra el acceso normal. */ }
  }, [requireLogin]);
  useEffect(() => {
    Promise.all(
      ["clients", "products", "collection_points", "invoices", "delivery_notes", "payments", "shipments"].map((resource) =>
        fetch(`/api/${resource}`).then((response) =>
          response.json(),
        ),
      ),
    )
      .then(([clientRows, productRows, pointRows, invoiceRows, deliveryRows, paymentRows, shipmentRows]) => {
        setClients(Array.isArray(clientRows) ? clientRows : []);
        setProducts(Array.isArray(productRows) ? productRows : []);
        setPoints(Array.isArray(pointRows) ? pointRows : []);
        const invoices = Array.isArray(invoiceRows) ? invoiceRows : [];
        const deliveries = Array.isArray(deliveryRows) ? deliveryRows : [];
        const payments = Array.isArray(paymentRows) ? paymentRows : [];
        const shipments = Array.isArray(shipmentRows) ? shipmentRows : [];
        setTabletCounts({ liquidacion: payments.length, documentos: invoices.length + deliveries.length, cobrados: invoices.filter((row: any) => ["Cobrada", "Pagada"].includes(row.status)).length, pendientes: invoices.filter((row: any) => !["Cobrada", "Pagada", "Anulada"].includes(row.status)).length, catalogo: Array.isArray(productRows) ? productRows.length : 0, visitas: Array.isArray(clientRows) ? clientRows.length : 0, rutas: shipments.length });
      })
      .catch(() => setError("No se han podido cargar los datos del CRM."));
  }, []);
  useEffect(() => {
    const selected = clients.find((client) => String(client.id) === String(clientId));
    if (selected) {
      setDeliveryAddress(selected.address || "");
      setPointId("");
    } else if (!clientId) {
      setDeliveryAddress("");
    }
  }, [clientId, clients]);
  const selectedProduct = products.find(
    (product) => String(product.id) === productId,
  );
  const filteredProducts = products
    .filter((product) => {
      if (!productSearch.trim()) return false;
      return matchesSearch(`${product.name || ""} ${product.sku || ""} ${product.barcode || ""} ${product.brand || ""} ${product.format || ""}`, productSearch);
    })
    .slice(0, 8);
  const clientOptions = clients.map((client) => ({
    ...client,
    display: `${client.name || "Cliente sin nombre"} · ${client.city || "Madrid"}`,
  }));
  const clientPoints = points.filter((point) => !clientId || Number(point.client_id) === Number(clientId));
  const total = cart.reduce(
    (sum, line) => sum + Number(line.quantity) * Number(line.unit_price),
    0,
  );
  const tabletOrderComplete = Boolean(
    clientId && pointId && deliveryDate && preparationDate && shippingDate && cart.length,
  );
  function unitFactor(product: any, unit: string) {
    if (unit === "caja") return Math.max(1, Number(product?.units_per_case || 1));
    if (unit === "pack_4") return 4;
    if (unit === "pack_6") return 6;
    if (unit === "palet") return Math.max(1, Number(product?.units_per_pallet || Number(product?.units_per_case || 1) * 10));
    return 1;
  }
  function addProduct() {
    if (!selectedProduct || quantity < 1 || totalUnits < 1) return;
    const factor = unitFactor(selectedProduct, quantityUnit);
    const requested = Number(quantity);
    setCart((current) => {
      const existing = current.find(
        (line) => line.product_id === selectedProduct.id && line.quantity_unit === quantityUnit,
      );
      if (existing)
        return current.map((line) =>
          line.product_id === selectedProduct.id && line.quantity_unit === quantityUnit
            ? { ...line, quantity_requested: Number(line.quantity_requested) + requested, quantity: Number(line.quantity) + Number(totalUnits) }
            : line,
        );
      return [
        ...current,
        {
          product_id: selectedProduct.id,
          name: selectedProduct.name,
          quantity: Number(totalUnits),
          quantity_requested: requested,
          quantity_unit: quantityUnit,
          units_factor: factor,
          unit_price: Number(selectedProduct.unit_price || 0),
        },
      ];
    });
    setProductId("");
    setProductSearch("");
    setQuantity(1);
    setQuantityUnit("unidad");
  }
  function readTabletExpenseFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      setError("El justificante no puede superar 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setExpenseFile({
        name: file.name,
        mime: file.type || "application/octet-stream",
        data: String(reader.result || ""),
      });
    reader.readAsDataURL(file);
  }
  async function saveTabletExpense() {
    if (!clientId) {
      setError("Selecciona primero el cliente para asociar el gasto.");
      return;
    }
    if (!expenseAmount && !expenseFile) {
      setError("Indica un importe o adjunta el ticket.");
      return;
    }
    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Actor": responsible },
      body: JSON.stringify({
        code: "GAS-" + String(Date.now()).slice(-8),
        client_id: Number(clientId),
        expense_date: tabletTodayInput(),
        category: expenseCategory,
        vendor: expenseVendor,
        amount: Number(expenseAmount || 0),
        vat: 21,
        payment_method: "Tarjeta",
        attachment_name: expenseFile?.name || "",
        attachment_mime: expenseFile?.mime || "",
        attachment_data: expenseFile?.data || "",
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "No se ha podido guardar el gasto.");
      return;
    }
    setExpenseSaved(body.code);
    setExpenseAmount("");
    setExpenseVendor("");
    setExpenseFile(null);
    window.dispatchEvent(new Event("crm-data-changed"));
  }
  async function createOrder() {
    if (!clientId || !pointId || !cart.length || !deliveryDate || !preparationDate || !shippingDate) {
      setError("Completa cliente, lugar de envío, fechas y añade al menos un producto.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Actor": responsible },
        body: JSON.stringify({
          code: `PED-2026-${String(Date.now()).slice(-6)}`,
          client_id: Number(clientId),
          amount: total,
          status: "Nuevo",
          created_by: responsible,
          delivery_date: deliveryDate,
          preparation_date: preparationDate,
          shipping_date: shippingDate,
          urgent: urgent ? 1 : 0,
          collection_point_id: pointId ? Number(pointId) : null,
          address: deliveryAddress,
          notes,
          lines: cart.map((line) => ({
            product_id: line.product_id,
            quantity: line.quantity,
            quantity_requested: line.quantity_requested,
            quantity_unit: line.quantity_unit,
            units_factor: line.units_factor,
            unit_price: line.unit_price,
            amount: Number(line.quantity) * Number(line.unit_price),
            vat: 21,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "No se ha podido crear el pedido.");
      setSaved(body);
      window.dispatchEvent(new Event("crm-data-changed"));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se ha podido crear el pedido.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveClientAddress() {
    if (!clientId || !deliveryAddress.trim()) {
      setError("Selecciona un cliente y escribe una dirección.");
      return;
    }
    setSavingClientAddress(true);
    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Actor": responsible },
        body: JSON.stringify({ address: deliveryAddress.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se ha podido guardar la dirección.");
      setClients((current) => current.map((client) => String(client.id) === String(clientId) ? { ...client, address: deliveryAddress.trim() } : client));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido guardar la dirección.");
    } finally {
      setSavingClientAddress(false);
    }
  }
  function selectCrudRecord(value: string) {
    setCrudId(value);
    const record = (crudType === "clients" ? clients : products).find(
      (item) => String(item.id) === value,
    );
    setCrudForm(
      record
        ? { ...crudForm, ...record }
        : {
            name: "",
            phone: "",
            email: "",
            address: "",
            city: "",
            sku: "",
            unit_price: 0,
            cost_price: 0,
            stock: 0,
          },
    );
  }
  async function saveCrudRecord() {
    if (!crudForm.name?.trim()) {
      setError("Escribe un nombre antes de guardar.");
      return;
    }
    const payload =
      crudType === "clients"
        ? {
            name: crudForm.name,
            phone: crudForm.phone || "",
            email: crudForm.email || "",
            address: crudForm.address || "",
            city: crudForm.city || "",
          }
        : {
            name: crudForm.name,
            sku: crudForm.sku || `EXC-${Date.now().toString().slice(-5)}`,
            unit_price: Number(crudForm.unit_price || 0),
            cost_price: Number(crudForm.cost_price || 0),
            stock: Number(crudForm.stock || 0),
            min_stock: 5,
            created_by: responsible,
          };
    const response = await fetch(
      `/api/${crudType}${crudId ? `/${crudId}` : ""}`,
      {
        method: crudId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "X-Actor": responsible },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      setError("No se ha podido guardar el registro.");
      return;
    }
    const refreshed = await fetch(`/api/${crudType}`).then(
      (result) => result.json(),
    );
    crudType === "clients" ? setClients(refreshed) : setProducts(refreshed);
    setCrudId("");
    setCrudForm({
      name: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      sku: "",
      unit_price: 0,
      cost_price: 0,
      stock: 0,
    });
    setError("");
  }
  async function deleteCrudRecord() {
    if (!crudId || !window.confirm("¿Eliminar este registro del CRM?")) return;
    const response = await fetch(
      `/api/${crudType}/${crudId}`,
      { method: "DELETE", headers: { "X-Actor": responsible } },
    );
    if (response.ok) {
      const refreshed = await fetch(
        `/api/${crudType}`,
      ).then((result) => result.json());
      crudType === "clients" ? setClients(refreshed) : setProducts(refreshed);
      setCrudId("");
      setCrudForm({
        name: "",
        phone: "",
        email: "",
        address: "",
        city: "",
        sku: "",
        unit_price: 0,
        cost_price: 0,
        stock: 0,
      });
    }
  }
  async function generateDeliveryNote() {
    const response = await fetch(
      `/api/orders/convert-delivery/${saved.id}`,
      { method: "POST", headers: { "X-Actor": responsible } },
    );
    const body = await response.json();
    if (response.ok)
      setDocuments((current: any) => ({ ...current, delivery: body }));
    else setError(body.error || "No se ha podido generar el albarán.");
  }
  async function generateShipment() {
    const client = clients.find((item) => Number(item.id) === Number(clientId));
    const point = points.find((item) => Number(item.id) === Number(pointId));
    const response = await fetch("/api/shipments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Actor": responsible },
      body: JSON.stringify({
        code: `ENV-2026-${String(Date.now()).slice(-6)}`,
        order_id: saved.id,
        client_id: Number(clientId),
        status: "Preparando",
        prepared_at: new Date().toISOString(),
        expected_delivery_at: `${deliveryDate}T12:00:00.000Z`,
        origin_address: "Almacén Centro · Calle Logística 10, Madrid",
        address: point?.address || deliveryAddress || client?.address || "Dirección del cliente",
        collection_point_id: pointId ? Number(pointId) : null,
        prepared_by: responsible,
        notes,
      }),
    });
    const body = await response.json();
    if (response.ok)
      setDocuments((current: any) => ({ ...current, shipment: body }));
    else setError(body.error || "No se ha podido generar el envío.");
  }
  async function loginTablet() {
    setTabletLoginError("");
    if (!tabletUsername.trim() || !tabletPassword) {
      setTabletLoginError("Introduce usuario y contraseña.");
      return;
    }
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: tabletUsername.trim(), password: tabletPassword }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Usuario o contraseña incorrectos.");
      setResponsible(body.user.username);
      setTabletStarted(true);
      setTabletView("inicio");
      setTabletPassword("");
      if (tabletRemember) localStorage.setItem("exclusivas.tablet.session", JSON.stringify({ username: body.user.username }));
      else localStorage.removeItem("exclusivas.tablet.session");
    } catch (caught) {
      setTabletLoginError(caught instanceof Error ? caught.message : "No se ha podido iniciar sesión.");
    }
  }
  function logoutTablet() {
    setTabletStarted(false);
    setTabletUsername("");
    setTabletPassword("");
    setResponsible("");
    setSaved(null);
    setDocuments({ delivery: null, shipment: null });
    setTabletView("inicio");
    setTabletRemember(false);
    localStorage.removeItem("exclusivas.tablet.session");
  }
  return (
    <div
      className="tablet-demo-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`tablet-frame ${orientation}`}
        role="dialog"
        aria-modal="true"
        aria-label="Crear pedido desde tablet"
      >
        <div className="tablet-camera" />
        <div className="tablet-screen">
          <div className="tablet-topbar">
            <div className="tablet-brand">
              <span>E</span>
              <b>Exclusivas</b>
              <small>Pedido móvil</small>
            </div>
            <span className="tablet-status">● Conectado al CRM</span>
            <button
              className="tablet-rotate"
              type="button"
              title={`Girar tablet a ${orientation === "horizontal" ? "vertical" : "horizontal"}`}
              aria-label={`Girar tablet a ${orientation === "horizontal" ? "vertical" : "horizontal"}`}
              onClick={() =>
                setOrientation(
                  orientation === "horizontal" ? "vertical" : "horizontal",
                )
              }
            >
              <span aria-hidden="true">⟳</span>
            </button>
            <button
              className="tablet-manage"
              type="button"
              title={tabletView === "pedido" ? "Gestionar datos" : "Volver al centro de operaciones"}
              onClick={() =>
                setTabletView(tabletView === "pedido" ? "datos" : tabletView === "datos" ? "pedido" : "inicio")
              }
            >
              <span aria-hidden="true">
                {tabletView === "pedido" ? "⚙" : "‹"}
              </span>
              <b>{tabletView === "pedido" ? "Datos" : tabletView === "datos" ? "Pedido" : "Menú"}</b>
            </button>
            {tabletStarted && <button className="tablet-logout" type="button" onClick={logoutTablet} title={`Cerrar sesión de ${responsible}`}>Salir</button>}
            <button className="tablet-close" onClick={onClose} aria-label="Cerrar">
              ×
            </button>
          </div>
          {!tabletStarted ? (
            <div className="tablet-welcome">
              <div className="tablet-welcome-intro">
                <div className="tablet-welcome-logo">E</div>
                <div>
                  <p className="eyebrow">EXCLUSIVAS INTELIGENTES</p>
                  <h2>Bienvenido a tu ruta comercial</h2>
                  <p>
                    Registra pedidos, consulta el catálogo y prepara la entrega
                    desde la tablet.
                  </p>
                </div>
              </div>
              <label>Usuario<input autoFocus value={tabletUsername} onChange={(event) => setTabletUsername(event.target.value)} onKeyDown={(event) => event.key === "Enter" && loginTablet()} placeholder="Usuario" /></label>
              <label>Contraseña<input type="password" value={tabletPassword} onChange={(event) => setTabletPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && loginTablet()} placeholder="Contraseña" /></label>
              <label className="tablet-remember"><input type="checkbox" checked={tabletRemember} onChange={(event) => setTabletRemember(event.target.checked)} /> Recordarme en este dispositivo</label>
              {tabletLoginError && <p className="tablet-login-error">{tabletLoginError}</p>}
              <button type="button" className="tablet-welcome-button" onClick={loginTablet}>Entrar en pedidos <span>→</span></button>
              <small>Conectado al CRM local · Datos sincronizados</small>
            </div>
          ) : tabletView === "inicio" ? (
            <TabletOperationsMenu counts={tabletCounts} onOpenOrder={() => setTabletView("pedido")} onOpenData={() => setTabletView("datos")} onOpenModule={(module) => { setTabletModule(module); setTabletView("resumen"); }} />
          ) : tabletView === "resumen" ? (
            <TabletModulePanel module={tabletModule} counts={tabletCounts} onBack={() => setTabletView("inicio")} />
          ) : tabletView === "datos" ? (
            <TabletCrudPanel
              clients={clients}
              products={products}
              crudType={crudType}
              setCrudType={setCrudType}
              crudId={crudId}
              crudForm={crudForm}
              setCrudForm={setCrudForm}
              selectCrudRecord={selectCrudRecord}
              saveCrudRecord={saveCrudRecord}
              deleteCrudRecord={deleteCrudRecord}
              onBack={() => setTabletView("pedido")}
              error={error}
            />
          ) : saved ? (
            <div className="tablet-success">
              <div className="success-icon">✓</div>
              <h2>Pedido creado correctamente</h2>
              {Array.isArray(saved.stock_alerts) && saved.stock_alerts.length > 0 && (
                <div className="tablet-stock-alert">
                  <b>Pedido creado con alerta de stock</b>
                  <span>
                    Se ha registrado correctamente, pero hay{" "}
                    {saved.stock_alerts.length === 1 ? "un producto" : "productos"}{" "}
                    con unidades insuficientes. Revisa la reposición antes del envío.
                  </span>
                </div>
              )}
              <p>
                El pedido <b>{saved.code}</b> está guardado en el CRM y listo
                para preparación.
              </p>
              <div className="tablet-success-data">
                <span>
                  Estado<strong>Pendiente</strong>
                </span>
                <span>
                  Importe
                  <strong>
                    {total.toLocaleString("es-ES", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </strong>
                </span>
                <span>
                  Entrega
                  <strong>
                    {new Date(`${deliveryDate}T12:00:00`).toLocaleDateString(
                      "es-ES",
                    )}
                  </strong>
                </span>
              </div>
              <div className="tablet-documents">
                <h3>Documentación del pedido</h3>
                <div>
                  <button
                    className="button secondary"
                    onClick={generateDeliveryNote}
                    disabled={!!documents.delivery}
                  >
                    {documents.delivery
                      ? `Albarán ${documents.delivery.code}`
                      : "＋ Generar albarán"}
                  </button>
                  <button
                    className="button secondary"
                    onClick={generateShipment}
                    disabled={!!documents.shipment}
                  >
                    {documents.shipment
                      ? `Envío ${documents.shipment.code}`
                      : "＋ Crear nota de envío"}
                  </button>
                </div>
                <small>
                  {documents.delivery && documents.shipment
                    ? "Albarán y envío registrados en el CRM."
                    : "Genera los documentos cuando el cliente confirme el pedido."}
                </small>
              </div>
              <div className="tablet-actions">
                <button className="button secondary" onClick={onClose}>
                  Cerrar demostración
                </button>
                <button className="button primary" onClick={onViewOrders}>
                  Ver pedido en Pedidos
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="tablet-title">
                <div>
                  <p className="eyebrow">NUEVA VENTA EN RUTA</p>
                  <h2>Crear pedido</h2>
                  <p>
                    El comercial visita al cliente y registra el pedido desde la
                    tablet.
                  </p>
                </div>
                <span className="tablet-step">
                  1 <i /> 2 <i /> 3
                </span>
              </div>
              <div className="tablet-body">
                <details className="tablet-form-card tablet-general-accordion" open>
                  <summary>
                    <span>
                      <b>Datos generales del pedido</b>
                      <small>
                        {clientSearch || "Cliente sin seleccionar"} · Preparación: {preparationDate || "sin fecha"} · Envío: {shippingDate || "sin fecha"}
                      </small>
                    </span>
                    <em className={tabletOrderComplete ? "accordion-complete" : "accordion-pending"}>
                      {tabletOrderComplete ? "✓ Completo" : "Pendiente de completar"}
                    </em>
                  </summary>
                  <div className="tablet-general-fields">
                  <label>
                    Cliente
                    <input
                      list="tablet-clientes"
                      value={clientSearch}
                      placeholder="Buscar cliente por nombre, ciudad o teléfono…"
                      onChange={(event) => {
                        const value = event.target.value;
                        const selected = clientOptions.find((client) => client.display === value);
                        setClientSearch(value);
                        setClientId(selected ? String(selected.id) : "");
                      }}
                    />
                    <datalist id="tablet-clientes">
                      {clientOptions.map((client) => (
                        <option key={client.id} value={client.display}>
                          {client.phone || client.email || ""}
                        </option>
                      ))}
                    </datalist>
                    {clientSearch && !clientId && <small className="tablet-field-hint">Escribe o selecciona un cliente de la lista.</small>}
                  </label>
                  <label>
                    Fecha de entrega
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(event) => setDeliveryDate(event.target.value)}
                    />
                  </label>
                  <label>
                    Día de preparación
                    <input type="date" value={preparationDate} onChange={(event) => setPreparationDate(event.target.value)} />
                  </label>
                  <label>
                    Día de envío
                    <input type="date" value={shippingDate} onChange={(event) => setShippingDate(event.target.value)} />
                  </label>
                  <label>
                    Estado del pedido
                    <input value="Nuevo" readOnly aria-label="Estado del pedido" />
                  </label>
                  <label>
                    Urgente
                    <select value={urgent ? "Sí" : "No"} onChange={(event) => setUrgent(event.target.value === "Sí")}>
                      <option>No</option>
                      <option>Sí</option>
                    </select>
                  </label>
                  <label>
                    Lugar de entrega
                    <select
                      value={pointId}
                      onChange={(event) => setPointId(event.target.value)}
                    >
                      <option value="">Dirección del cliente</option>
                      {clientPoints.map((point) => (
                        <option key={point.id} value={point.id}>
                          {point.name} · {point.city}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="tablet-address-field">
                    Dirección de entrega del cliente
                    <textarea
                      value={deliveryAddress}
                      placeholder="Selecciona un cliente para cargar su dirección…"
                      onChange={(event) => setDeliveryAddress(event.target.value)}
                    />
                    <button type="button" className="tablet-save-address" onClick={saveClientAddress} disabled={!clientId || savingClientAddress}>
                      {savingClientAddress ? "Guardando…" : "Guardar esta dirección en el cliente"}
                    </button>
                  </label>
                  <label>
                    Responsable de preparación
                    <select
                      value={responsible}
                      onChange={(event) => setResponsible(event.target.value)}
                    >
                      <option>Luis Vázquez</option>
                      <option>José Martín</option>
                    </select>
                  </label>
                  <label>
                    Notas para almacén
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>
                  <details className="tablet-expense-box">
                    <summary>＋ Registrar gasto o ticket</summary>
                    <p>
                      Se asociará al cliente seleccionado y a la fecha de hoy.
                    </p>
                    <div className="tablet-expense-fields">
                      <label>
                        Categoría
                        <select
                          value={expenseCategory}
                          onChange={(event) =>
                            setExpenseCategory(event.target.value)
                          }
                        >
                          <option>Combustible</option>
                          <option>Comida</option>
                          <option>Aparcamiento</option>
                          <option>Material</option>
                          <option>Otros</option>
                        </select>
                      </label>
                      <label>
                        Importe
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={expenseAmount}
                          onChange={(event) =>
                            setExpenseAmount(event.target.value)
                          }
                          placeholder="0,00"
                        />
                      </label>
                      <label>
                        Establecimiento
                        <input
                          value={expenseVendor}
                          onChange={(event) =>
                            setExpenseVendor(event.target.value)
                          }
                          placeholder="Nombre del establecimiento"
                        />
                      </label>
                    </div>
                    <label className="tablet-expense-file">
                      Hacer foto o subir ticket
                      <input
                        type="file"
                        accept="image/*,.pdf,application/pdf"
                        capture="environment"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) readTabletExpenseFile(file);
                        }}
                      />
                      <small>
                        {expenseFile
                          ? "Adjunto: " + expenseFile.name
                          : "Imagen o PDF hasta 8 MB"}
                      </small>
                    </label>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={saveTabletExpense}
                    >
                      Guardar gasto
                    </button>
                    {expenseSaved && (
                      <small className="tablet-expense-success">
                        Gasto {expenseSaved} guardado correctamente.
                      </small>
                    )}
                  </details>
                  </div>
                </details>
                <section className="tablet-products-card">
                  <div className="tablet-card-head">
                    <div>
                      <h3>Productos del pedido</h3>
                      <p>Selecciona referencias y unidades.</p>
                    </div>
                    <div className="tablet-card-tools">
                      <span>{cart.length} líneas</span>
                      <button
                        type="button"
                        className="tablet-price-toggle"
                        aria-pressed={showTabletPrices}
                        onClick={() =>
                          setShowTabletPrices((current) => !current)
                        }
                        title={
                          showTabletPrices
                            ? "Ocultar importes"
                            : "Mostrar importes"
                        }
                      >
                        {showTabletPrices
                          ? "◉ Ocultar importes"
                          : "◌ Mostrar importes"}
                      </button>
                    </div>
                  </div>
                  <div className="tablet-add-line">
                    <label className="tablet-add-field tablet-product-search">
                      <span>Producto</span>
                      <input
                        type="search"
                        placeholder="Buscar producto por nombre, referencia o código…"
                        value={productSearch}
                        onChange={(event) => {
                          setProductSearch(event.target.value);
                          setProductId("");
                        }}
                        aria-label="Buscar producto"
                      />
                      {productSearch && (
                        <div
                          className="tablet-product-results"
                          role="listbox"
                          aria-label="Resultados de productos"
                        >
                          {filteredProducts.length ? (
                            filteredProducts.map((product) => (
                              <button
                                type="button"
                                key={product.id}
                                role="option"
                                aria-selected={String(product.id) === productId}
                                onClick={() => {
                                  setProductId(String(product.id));
                                  setProductSearch(product.name || "");
                                  setTotalUnits(quantity * unitFactor(product, quantityUnit));
                                }}
                              >
                                <span>
                                  <b>{product.name}</b>
                                  <small>
                                    {product.sku ||
                                      product.barcode ||
                                      "Sin referencia"}{" "}
                                    · Stock{" "}
                                    {Number(product.stock || 0) -
                                      Number(product.stock_reserved || 0)}
                                  </small>
                                </span>
                                {showTabletPrices && (
                                  <strong>
                                    {Number(
                                      product.unit_price || 0,
                                    ).toLocaleString("es-ES", {
                                      style: "currency",
                                      currency: "EUR",
                                    })}
                                  </strong>
                                )}
                              </button>
                            ))
                          ) : (
                            <p>No hay productos que coincidan.</p>
                          )}
                        </div>
                      )}
                    </label>
                    <label className="tablet-add-field">
                      <span>Tipo de cantidad</span>
                      <select
                        value={quantityUnit}
                        onChange={(event) => {
                          const value = event.target.value as "unidad" | "caja" | "pack_4" | "pack_6" | "palet";
                          setQuantityUnit(value);
                          setTotalUnits(selectedProduct ? quantity * unitFactor(selectedProduct, value) : quantity);
                        }}
                      aria-label="Unidad de pedido"
                      >
                      <option value="unidad">Unidades</option>
                      <option value="caja">Cajas</option>
                      <option value="pack_4">Pack de 4</option>
                      <option value="pack_6">Pack de 6</option>
                      <option value="palet">Palés</option>
                      </select>
                    </label>
                    <label className="tablet-add-field">
                      <span>Cantidad</span>
                      <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(event) => {
                        const value = Math.max(1, Number(event.target.value) || 1);
                        setQuantity(value);
                        setTotalUnits(selectedProduct ? value * unitFactor(selectedProduct, quantityUnit) : value);
                      }}
                      aria-label="Cantidad"
                      />
                    </label>
                    <label className="tablet-add-field">
                      <span>Unidades totales</span>
                      <input
                      type="number"
                      min="1"
                      value={totalUnits}
                      onChange={(event) => setTotalUnits(Math.max(1, Number(event.target.value) || 1))}
                      aria-label="Unidades totales"
                      placeholder="Unidades totales"
                      />
                    </label>
                    <button className="button secondary tablet-add-button" onClick={addProduct}>
                      Añadir línea
                    </button>
                  </div>
                  <div className="tablet-cart">
                    {cart.length ? (
                      cart.map((line) => (
                        <div className="tablet-cart-line" key={`${line.product_id}-${line.quantity_unit}`}>
                                  <b>{line.name}</b>
                          <span className="tablet-cart-quantity">
                            <input
                            type="number"
                            min="1"
                            value={line.quantity_requested || line.quantity}
                            onChange={(event) =>
                              setCart((current) =>
                                current.map((item) =>
                                  item.product_id === line.product_id
                                    ? {
                                        ...item,
                                        quantity_requested: Number(event.target.value),
                                        quantity: Number(event.target.value) * Number(item.units_factor || 1),
                                      }
                                    : item,
                                ),
                              )
                            }
                            />
                            <small>{line.quantity_unit === "palet" ? "palés" : line.quantity_unit === "caja" ? "cajas" : "unidades"}</small>
                          </span>
                          <span
                            className={
                              showTabletPrices ? "" : "tablet-price-hidden"
                            }
                          >
                            {showTabletPrices
                              ? (
                                  Number(line.quantity) *
                                  Number(line.unit_price)
                                ).toLocaleString("es-ES", {
                                  style: "currency",
                                  currency: "EUR",
                                })
                              : "•••"}
                          </span>
                          <button
                            onClick={() =>
                              setCart((current) =>
                                current.filter(
                                  (item) => !(item.product_id === line.product_id && item.quantity_unit === line.quantity_unit),
                                ),
                              )
                            }
                            aria-label={`Quitar ${line.name}`}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="tablet-empty-cart">
                        Añade productos para preparar el pedido.
                      </div>
                    )}
                  </div>
                  <div className="tablet-total">
                    <span>Total previsto</span>
                    <strong
                      className={showTabletPrices ? "" : "tablet-price-hidden"}
                    >
                      {showTabletPrices
                        ? total.toLocaleString("es-ES", {
                            style: "currency",
                            currency: "EUR",
                          })
                        : "•••"}
                    </strong>
                  </div>
                </section>
              </div>
              {error && <p className="tablet-error">{error}</p>}
              <div className="tablet-footer">
                <span>El stock se reservará al guardar el pedido.</span>
                <div>
                  <button className="button secondary" onClick={onClose}>
                    Cancelar
                  </button>
                  <button
                    className="button primary"
                    onClick={createOrder}
                    disabled={saving}
                  >
                    {saving ? "Guardando…" : "Crear pedido y preparar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UsersManager({ user }: { user: any }) {
  const roleLabels: Record<string, string> = { admin: "Administrador", user: "Usuario", comercial: "Comercial", almacen: "Almacén", repartidor: "Repartidor" };
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({ username: "", password: "", role: "user", permissions: [] });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const headers = { "Content-Type": "application/json", "X-Actor": user?.username || "Usuario local" };
  async function load() {
    setLoading(true);
    try { const response = await fetchWithRetry("/api/users", { headers: { "X-Actor": user?.username || "Usuario local" } }); if (!response.ok) throw new Error("No se ha podido cargar la lista de usuarios."); const data = await response.json(); setRows(Array.isArray(data) ? data : []); } catch { setError("No se ha podido cargar la lista de usuarios."); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  function startNew() { setEditingId(null); setDraft({ username: "", password: "", role: "user", permissions: [] }); setError(""); setOpen(true); }
  function startEdit(row: any) { let permissions: any[] = []; try { permissions = row.permissions === "*" ? permissionModules : JSON.parse(row.permissions || "[]"); } catch {} setEditingId(row.id); setDraft({ username: row.username, password: "", role: row.role, permissions }); setError(""); setOpen(true); }
  function changeRole(role: string) { setDraft((current: any) => ({ ...current, role, permissions: role === "repartidor" ? ["Reparto"] : current.permissions.filter((permission: string) => permission !== "Reparto") })); }
  function togglePermission(module: string) { setDraft((current: any) => ({ ...current, permissions: current.permissions.includes(module) ? current.permissions.filter((item: string) => item !== module) : [...current.permissions, module] })); }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch(editingId ? `/api/users/${editingId}` : "/api/users", { method: editingId ? "PUT" : "POST", headers, body: JSON.stringify(draft) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se ha podido guardar el usuario.");
      setOpen(false); await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }
  async function remove(row: any) {
    if (Number(row.id) === Number(user?.id)) return setError("No puedes eliminar tu propio usuario durante la sesión.");
    if (!window.confirm(`¿Eliminar el usuario ${row.username}?`)) return;
    const response = await fetch(`/api/users/${row.id}`, { method: "DELETE", headers }); const data = await response.json(); if (!response.ok) return setError(data.error || "No se ha podido eliminar el usuario."); await load();
  }
  return <div className="users-manager">
    <div className="manager-head users-manager-head"><div><b>Usuarios y permisos</b><p>Gestiona quién puede entrar y qué partes del CRM puede utilizar.</p></div><button className="button primary" onClick={startNew}>＋ Nuevo usuario</button></div>
    {error && <p className="users-manager-error">{error}</p>}
    {open && <form className="users-editor" onSubmit={save}><div className="users-editor-title"><b>{editingId ? "Editar usuario" : "Nuevo usuario"}</b><button type="button" onClick={() => setOpen(false)}>×</button></div><div className="users-editor-fields"><label>Usuario<input required value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} /></label><label>Contraseña<input type="password" required={!editingId} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} /></label><label>Rol<select value={draft.role} onChange={(e) => changeRole(e.target.value)}><option value="user">Usuario</option><option value="comercial">Comercial</option><option value="almacen">Almacén</option><option value="repartidor">Repartidor</option><option value="admin">Administrador</option></select><small>{draft.role === "repartidor" ? "Acceso exclusivo a la vista de reparto: entregas, firma, fotos, cobros y devoluciones." : "Elige Administrador para acceso total o un rol operativo para limitarlo."}</small></label></div><div className={`permissions-box${draft.role === "admin" || draft.role === "repartidor" ? " permissions-readonly" : ""}`}><div><b>Permisos de acceso</b><small>{draft.role === "admin" ? "Acceso completo activo. Cambia el rol para poder seleccionar permisos individuales." : draft.role === "repartidor" ? "La vista de reparto es la única disponible para este usuario." : "Marca las secciones que podrá consultar y utilizar este usuario."}</small></div><div className="permission-grid"><label className="permission-option disabled"><input type="checkbox" checked readOnly /> Inicio</label>{draft.role === "repartidor" ? <label className="permission-option disabled"><input type="checkbox" checked readOnly /> Vista de reparto</label> : permissionModules.map((module) => <label className={`permission-option${draft.role === "admin" ? " disabled" : ""}`} key={module}><input type="checkbox" checked={draft.role === "admin" || draft.permissions.includes(module)} disabled={draft.role === "admin"} onChange={() => togglePermission(module)} /> {module}</label>)}</div></div><div className="users-editor-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Guardando…" : "Guardar usuario"}</button></div></form>}
    {loading && <div className="data-loading" role="status"><span className="loading-spinner" aria-hidden="true" /><LoadingIndicator label="Cargando usuarios…" /></div>}
    <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Acceso</th><th>Acciones</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.username}</b>{Number(row.id) === Number(user?.id) && <small> (sesión actual)</small>}</td><td><span className={`role-badge ${row.role === "admin" ? "admin" : "user"}`}>{roleLabels[row.role] || "Usuario"}</span></td><td>{row.role === "admin" || row.permissions === "*" ? "Acceso completo" : (() => { try { return `${JSON.parse(row.permissions || "[]").length} secciones`; } catch { return "Sin permisos"; } })()}</td><td><button className="table-action" onClick={() => startEdit(row)}>Editar</button><button className="table-action danger" onClick={() => remove(row)}>Eliminar</button></td></tr>)}{!loading && !rows.length && <tr><td colSpan={4}>No hay usuarios registrados.</td></tr>}</tbody></table></div>
  </div>;
}

function TrashManager({ user }: { user: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [table, setTable] = useState("");
  const [actor, setActor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const headers = { "Content-Type": "application/json", "X-Actor": user?.username || "Usuario local" };
  async function load() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams(); if (table) params.set("table", table); if (actor) params.set("actor", actor); if (query) params.set("q", query);
      const response = await fetch(`/api/trash?${params.toString()}`, { headers });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo cargar la papelera"); setRows(Array.isArray(data) ? data : []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [table, actor, query]);
  const tableOptions = [["products", "Productos"], ["clients", "Clientes"], ["orders", "Pedidos"], ["invoices", "Facturas"], ["delivery_notes", "Albaranes"], ["shipments", "Envíos"], ["expenses", "Gastos y tickets"], ["notes", "Notas"], ["suppliers", "Proveedores"], ["purchase_orders", "Compras"], ["warehouses", "Almacenes"], ["collection_points", "Lugares de recogida"], ["inventory_movements", "Movimientos de stock"], ["returns", "Devoluciones"], ["payments", "Cobros"], ["quotes", "Presupuestos"], ["users", "Usuarios"]];
  async function restore(row: any) {
    const response = await fetch("/api/trash/restore", { method: "POST", headers, body: JSON.stringify({ table: row.table, id: row.id }) });
    const data = await response.json(); if (!response.ok) return setError(data.error || "No se pudo recuperar el registro"); setRows((current) => current.filter((item) => !(item.table === row.table && item.id === row.id)));
  }
  async function permanentlyDelete(row: any) {
    if (!window.confirm(`¿Eliminar definitivamente ${row.record_label}? Esta acción no se puede deshacer.`)) return;
    const response = await fetch(`/api/trash/${row.table}/${row.id}`, { method: "DELETE", headers });
    const data = await response.json(); if (!response.ok) return setError(data.error || "No se pudo eliminar definitivamente"); setRows((current) => current.filter((item) => !(item.table === row.table && item.id === row.id)));
  }
  return <div className="trash-manager">
    <div className="manager-head trash-manager-head"><div><b>Papelera</b><p>Registros eliminados de forma segura. Puedes recuperarlos cuando quieras.</p></div><span className="trash-count">{rows.length} eliminados</span></div>
    <div className="trash-toolbar"><input placeholder="Buscar registro, sección o usuario…" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={table} onChange={(event) => setTable(event.target.value)}><option value="">Todas las secciones</option>{tableOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><input placeholder="Filtrar por usuario…" value={actor} onChange={(event) => setActor(event.target.value)} /><button type="button" className="button secondary" onClick={() => void load()}>{loading ? "Actualizando…" : "Actualizar"}</button></div>
    {error && <p className="users-manager-error">{error}</p>}
    <div className="trash-table-wrap"><table className="trash-table"><thead><tr><th>Registro</th><th>Sección</th><th>Eliminado por</th><th>Fecha de eliminación</th><th>Acciones</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.table}-${row.id}`}><td><b>{row.record_label}</b><small>ID {row.id}</small></td><td>{row.table_label}</td><td>{row.deleted_by || "Usuario local"}</td><td>{row.deleted_at ? new Date(row.deleted_at).toLocaleString("es-ES") : "—"}</td><td><button className="table-action" onClick={() => void restore(row)}>Recuperar</button><button className="table-action danger" onClick={() => void permanentlyDelete(row)}>Eliminar definitivamente</button></td></tr>)}{!rows.length && <tr><td colSpan={5}>{loading ? "Cargando papelera…" : "La papelera está vacía."}</td></tr>}</tbody></table></div>
  </div>;
}

function QuickExpenseModal({
  clients,
  actor,
  onClose,
  onCreated,
}: {
  clients: any[];
  actor: string;
  onClose: () => void;
  onCreated: (row: any) => void;
}) {
  const [expenseDate, setExpenseDate] = useState(() => tabletTodayInput());
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [category, setCategory] = useState("Combustible");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<any>(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function selectFile(selected: File) {
    if (selected.size > 8 * 1024 * 1024) {
      setError("El justificante no puede superar 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFile({
      name: selected.name,
      mime: selected.type || "application/octet-stream",
      data: String(reader.result || ""),
    });
    reader.readAsDataURL(selected);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!amount || Number(amount) < 0) {
      setError("Indica un importe válido.");
      return;
    }
    setSaving(true);
    setError("");
    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Actor": actor },
      body: JSON.stringify({
        code: "GAS-" + String(Date.now()).slice(-8),
        client_id: clientId ? Number(clientId) : null,
        expense_date: expenseDate,
        category,
        vendor,
        amount: Number(amount),
        vat: 21,
        payment_method: "Tarjeta",
        notes,
        ...(file ? {
          attachment_name: file.name,
          attachment_mime: file.mime,
          attachment_data: file.data,
        } : {}),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(body.error || "No se ha podido guardar el gasto.");
      return;
    }
    onCreated(body);
  }

  return (
    <div className="home-note-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="home-note-modal quick-expense-modal" onSubmit={save}>
        <div className="home-note-modal-head">
          <div><b>Subir gasto</b><small>Registra un gasto desde cualquier punto del CRM.</small></div>
          <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="quick-expense-fields">
          <label>Importe total *<input type="number" min="0" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00 €" autoFocus /></label>
          <label>Fecha *<input type="date" required value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label>
          <label>Cliente <div className="quick-expense-client-search"><input list="quick-expense-clientes" value={clientSearch} onChange={(event) => { const value = event.target.value; setClientSearch(value); const selected = clients.find((client) => `${client.name}${client.city ? ` · ${client.city}` : ""}` === value); setClientId(selected ? String(selected.id) : ""); }} placeholder="Buscar cliente por nombre o ciudad…" /><button type="button" onClick={() => { setClientSearch(""); setClientId(""); }} aria-label="Quitar cliente" title="Sin cliente asociado">×</button><datalist id="quick-expense-clientes">{clients.map((client) => <option key={client.id} value={`${client.name}${client.city ? ` · ${client.city}` : ""}`} />)}</datalist></div><small className="quick-expense-client-hint">{clientId ? "Cliente asociado" : "Opcional: puede quedar como gasto general"}</small></label>
          <label>Categoría <select value={category} onChange={(event) => setCategory(event.target.value)}><option>Combustible</option><option>Gastos de representación</option><option>Comida</option><option>Aparcamiento</option><option>Material</option><option>Otros</option></select></label>
        </div>
        <label>Establecimiento o proveedor<input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="Ej.: Gasolinera, proveedor…" /></label>
        <label>Notas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observaciones opcionales…" /></label>
        <div
          className={`quick-expense-dropzone${dragActive ? " is-dragging" : ""}${file ? " has-file" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            const selected = event.dataTransfer.files?.[0];
            if (selected) selectFile(selected);
          }}
        >
          <span className="quick-expense-drop-icon">↑</span>
          <b>{file ? file.name : "Arrastra aquí el justificante"}</b>
          <small>{file ? "Documento listo para guardar" : "o haz una foto / selecciona un archivo"}</small>
          <label className="quick-expense-file-button">
            {file ? "Cambiar documento" : "Elegir archivo o hacer foto"}
            <input type="file" accept="image/*,.pdf,application/pdf" capture="environment" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) selectFile(selected); }} />
          </label>
        </div>
        {error && <p className="home-note-form-error">{error}</p>}
        <div className="home-note-modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Guardando…" : "Guardar gasto"}</button></div>
      </form>
    </div>
  );
}

function HomeNotePreviewModal({ note, user, onClose, onOpenPreparation, onEdit }: { note: any; user: any; onClose: () => void; onOpenPreparation: () => void; onEdit: () => void }) {
  const [action, setAction] = useState("review");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isIncident = String(note?.module || "") === "Preparación de pedidos";
  const actionLabels: Record<string, { label: string; status: string; resolution: string; completed: number }> = {
    partial: { label: "Autorizar envío parcial", status: "Resuelta", resolution: "Envío parcial autorizado", completed: 1 },
    backorder: { label: "Solicitar reposición", status: "Pendiente de reposición", resolution: "Reposición solicitada", completed: 0 },
    cancel: { label: "Cancelar unidades faltantes", status: "Resuelta", resolution: "Unidades faltantes canceladas", completed: 1 },
    review: { label: "Dejar en revisión", status: "Pendiente", resolution: "Pendiente de revisión", completed: 0 },
  };
  async function applyAction() {
    const selected = actionLabels[action] || actionLabels.review;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Actor": user?.username || "Usuario local" },
        body: JSON.stringify({ ...note, status: selected.status, resolution: selected.resolution, completed: selected.completed, resolved_at: new Date().toISOString(), resolved_by: user?.username || "Usuario local" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la resolución.");
      onClose();
    } catch (e: any) { setError(e.message || "No se pudo guardar la resolución."); }
    finally { setSaving(false); }
  }
  return <div className="preview-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <article className="note-preview-card home-note-preview-card" onClick={(event) => event.stopPropagation()}>
      <button className="preview-close" onClick={onClose} aria-label="Cerrar">×</button>
      <p className="eyebrow">NOTAS · EXCLUSIVAS INTELIGENTES</p>
      <h2>{note.title || "Nota"}</h2>
      <div className="note-preview-meta"><span><b>Prioridad</b>{note.priority || "Normal"}</span><span><b>Sección</b>{note.module || "General"}</span><span><b>Estado</b>{note.status || (Number(note.completed) === 1 ? "Resuelta" : "Pendiente")}</span></div>
      {isIncident && <div className="note-preview-incident-context"><div><b>Pedido relacionado</b><span>{note.title?.split("·").slice(1).join("·").trim() || (note.record_id ? `Pedido #${note.record_id}` : "Sin pedido relacionado")}</span></div><div><b>Registrada por</b><span>{note.created_by || "Usuario local"}</span></div><div><b>Fecha de registro</b><span>{note.created_at ? formatSpanishDateValue(note.created_at, true) : "—"}</span></div></div>}
      <div className="note-preview-content">{note.content || "Sin contenido adicional."}</div>
      {isIncident && <div className="note-preview-resolution"><div className="note-preview-resolution-head"><b>Resolver incidencia</b><small>Guarda la decisión y deja trazabilidad de quién la autoriza.</small></div><div className="note-preview-resolution-controls"><select aria-label="Acción de resolución" value={action} onChange={(event) => setAction(event.target.value)} disabled={saving}><option value="partial">Autorizar envío parcial</option><option value="backorder">Solicitar reposición</option><option value="cancel">Cancelar unidades faltantes</option><option value="review">Dejar en revisión</option></select><button className="button primary" disabled={saving} onClick={() => void applyAction()}>{saving ? "Guardando…" : "Aplicar resolución"}</button></div>{error && <p className="note-preview-error" role="alert">{error}</p>}</div>}
      <div className="note-preview-actions">{isIncident && <button className="button secondary" onClick={onOpenPreparation}>Abrir preparación</button>}<button className="button secondary" onClick={onEdit}>Editar nota</button><button className="button primary" onClick={onClose}>Cerrar</button></div>
    </article>
  </div>;
}

type PromotionDraft = {
  code: string;
  title: string;
  promotion_type: "flash" | "week" | "month";
  description: string;
  kicker: string;
  discount_type: "percent" | "amount" | "none";
  discount_value: string;
  start_at: string;
  end_at: string;
  min_quantity: string;
  stock_limit: string;
  conditions: string;
  product_ids: number[];
};
const promotionTypeLabels: Record<PromotionDraft["promotion_type"], string> = { flash: "Flash · solo hoy", week: "Semana · selección renovada", month: "Mes · ofertas del mes" };
const promotionStatusLabels: Record<string, string> = { Borrador: "Borrador", Publicada: "Publicada", Pausada: "Pausada" };
function localDateTime(offsetHours = 0) {
  const date = new Date(Date.now() + offsetHours * 3600000);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function emptyPromotionDraft(): PromotionDraft {
  return { code: `PROMO-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`, title: "", promotion_type: "flash", description: "", kicker: "OFERTA FLASH · SOLO HOY", discount_type: "percent", discount_value: "", start_at: localDateTime(), end_at: localDateTime(24), min_quantity: "", stock_limit: "", conditions: "", product_ids: [] };
}
function PublicPromotionsManager({ user }: { user: any }) {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [draft, setDraft] = useState<PromotionDraft>(emptyPromotionDraft);
  const [editing, setEditing] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const actor = user?.username || "Usuario local";
  async function load() {
    setLoading(true);
    try {
      const [promotionResponse, productResponse] = await Promise.all([
        fetch("/api/web_promotions?include_deleted=0", { headers: { "X-Actor": actor, "X-Audit-Query": "true" } }),
        fetch("/api/products?view=lookup&limit=2000&include_inactive=1", { headers: { "X-Actor": actor } }),
      ]);
      if (!promotionResponse.ok || !productResponse.ok) throw new Error("No se han podido cargar las promociones.");
      const promotionRows = await promotionResponse.json();
      const productRows = await productResponse.json();
      setPromotions(Array.isArray(promotionRows) ? promotionRows : []);
      setProducts(Array.isArray(productRows) ? productRows.filter((row) => String(row.name || "").trim()) : []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se han podido cargar las promociones."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  function openNew() { setEditing(null); setDraft(emptyPromotionDraft()); setProductSearch(""); setError(""); setModalOpen(true); }
  function openEdit(row: any) {
    let productIds: number[] = [];
    try { productIds = (Array.isArray(row.product_ids) ? row.product_ids : JSON.parse(String(row.product_ids || "[]"))).map(Number).filter(Number.isInteger); } catch {}
    setEditing(row);
    setDraft({ code: row.code || `PROMO-${row.id}`, title: row.title || "", promotion_type: ["flash", "week", "month"].includes(row.promotion_type) ? row.promotion_type : "flash", description: row.description || "", kicker: row.kicker || "", discount_type: ["percent", "amount", "none"].includes(row.discount_type) ? row.discount_type : "percent", discount_value: row.discount_value === null || row.discount_value === undefined ? "" : String(row.discount_value), start_at: String(row.start_at || "").slice(0, 16), end_at: String(row.end_at || "").slice(0, 16), min_quantity: row.min_quantity ? String(row.min_quantity) : "", stock_limit: row.stock_limit ? String(row.stock_limit) : "", conditions: row.conditions || "", product_ids: productIds });
    setProductSearch(""); setError(""); setModalOpen(true);
  }
  function updateDraft(field: keyof PromotionDraft, value: any) {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === "promotion_type" && !editing) next.kicker = value === "flash" ? "OFERTA FLASH · SOLO HOY" : value === "week" ? "SELECCIÓN DE LA SEMANA" : "OFERTAS DEL MES";
      return next;
    });
  }
  function toggleProduct(id: number) { setDraft((current) => ({ ...current, product_ids: current.product_ids.includes(id) ? current.product_ids.filter((value) => value !== id) : [...current.product_ids, id] })); }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    if (!draft.title.trim() || !draft.product_ids.length) { setError("Indica un título y selecciona al menos un producto."); setSaving(false); return; }
    if (draft.end_at < draft.start_at) { setError("La fecha de fin debe ser posterior a la fecha de inicio."); setSaving(false); return; }
    const payload = { ...draft, discount_value: Number(draft.discount_value || 0), min_quantity: Number(draft.min_quantity || 0), stock_limit: draft.stock_limit ? Number(draft.stock_limit) : null, product_ids: JSON.stringify(draft.product_ids), created_by: actor, updated_at: new Date().toISOString() };
    try {
      const response = await fetch(editing ? `/api/web_promotions/${editing.id}` : "/api/web_promotions", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json", "X-Actor": actor }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se ha podido guardar la promoción.");
      setModalOpen(false); setMessage(editing ? "Promoción actualizada." : "Promoción guardada como borrador. Revísala y publícala cuando esté lista."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se ha podido guardar la promoción."); }
    finally { setSaving(false); }
  }
  async function changeStatus(row: any, action: "publish" | "pause") {
    setError(""); setMessage("");
    try {
      const response = await fetch(`/api/web_promotions/${row.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actor } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se ha podido actualizar el estado.");
      setMessage(action === "publish" ? `“${row.title}” ya está visible en la web.` : `“${row.title}” se ha pausado.`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se ha podido actualizar el estado."); }
  }
  const productMap = new Map(products.map((product) => [Number(product.id), product]));
  const visibleProducts = products.filter((product) => matchesSearch(`${product.name} ${product.sku || ""} ${product.brand || ""}`, productSearch)).slice(0, 80);
  const visiblePromotions = promotions.filter((row) => statusFilter === "Todas" || row.status === statusFilter);
  const selectedNames = draft.product_ids.map((id) => productMap.get(id)?.name || `Producto #${id}`);
  const formatDiscount = (row: any) => row.discount_type === "percent" ? `-${Number(row.discount_value || 0)}%` : row.discount_type === "amount" ? `-${Number(row.discount_value || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}` : "Condición especial";
  return <section className="public-promotions-manager"><div className="manager-head"><div><p className="eyebrow">PUBLICACIÓN COMERCIAL</p><h2>Promociones web</h2><p className="muted">Crea una campaña, selecciona referencias y publícala en Flash, Semana o Mes. Solo las promociones publicadas y vigentes aparecen en la web.</p></div><div><button type="button" className="button secondary" onClick={() => void load()}>Actualizar</button><button type="button" className="button primary" onClick={openNew}>Nueva promoción</button></div></div>{message && <div className="success-message" role="status">{message}</div>}{error && !modalOpen && <div className="error-message" role="alert">{error}</div>}<section className="promotion-summary"><article><span>Publicadas</span><strong>{promotions.filter((row) => row.status === "Publicada").length}</strong><small>visibles al público</small></article><article><span>Borradores</span><strong>{promotions.filter((row) => row.status === "Borrador").length}</strong><small>pendientes de revisión</small></article><article><span>Referencias elegidas</span><strong>{new Set(promotions.flatMap((row) => { try { return JSON.parse(String(row.product_ids || "[]")); } catch { return []; } })).size}</strong><small>productos en campañas</small></article></section><section className="promotion-list-panel"><div className="promotion-list-toolbar"><div><b>Campañas</b><small>{loading ? "Cargando…" : `${visiblePromotions.length} campañas encontradas`}</small></div><label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todas</option><option>Publicada</option><option>Borrador</option><option>Pausada</option></select></label></div>{!loading && !visiblePromotions.length && <p className="empty-state">Todavía no hay campañas. Crea la primera promoción para que el equipo pueda revisarla y publicarla.</p>}<div className="promotion-list">{visiblePromotions.map((row) => { let ids: number[] = []; try { ids = JSON.parse(String(row.product_ids || "[]")); } catch {} const names = ids.map((id) => productMap.get(Number(id))?.name || `Producto #${id}`); return <article className="promotion-card" key={row.id}><div className="promotion-card-main"><div className="promotion-card-top"><span className={`promotion-status status-${String(row.status || "Borrador").toLowerCase()}`}>{promotionStatusLabels[row.status] || row.status}</span><span className="promotion-type">{promotionTypeLabels[row.promotion_type] || "Promoción"}</span><strong>{formatDiscount(row)}</strong></div><h3>{row.title}</h3><p>{row.description || "Sin descripción comercial."}</p><small>{row.code} · {String(row.start_at || "").replace("T", " ").slice(0, 16)} → {String(row.end_at || "").replace("T", " ").slice(0, 16)}</small><div className="promotion-product-tags">{names.slice(0, 4).map((name) => <span key={name}>{name}</span>)}{names.length > 4 && <span>+{names.length - 4} referencias</span>}</div></div><div className="promotion-card-actions"><button type="button" className="button secondary" onClick={() => openEdit(row)}>Editar</button>{row.status === "Publicada" ? <button type="button" className="button secondary" onClick={() => void changeStatus(row, "pause")}>Pausar</button> : <button type="button" className="button primary" onClick={() => void changeStatus(row, "publish")}>Publicar</button>}</div></article>; })}</div></section>{modalOpen && <div className="preview-overlay promotion-overlay" onMouseDown={(event) => event.target === event.currentTarget && !saving && setModalOpen(false)}><form className="promotion-modal" onSubmit={(event) => void save(event)}><header><div><p className="eyebrow">{editing ? "EDITAR CAMPAÑA" : "NUEVA CAMPAÑA"}</p><h2>{editing ? "Ajustar promoción" : "Crear promoción web"}</h2><small>Guarda primero como borrador y publícala solo cuando las referencias y fechas estén revisadas.</small></div><button type="button" onClick={() => !saving && setModalOpen(false)} aria-label="Cerrar">×</button></header><div className="promotion-modal-grid"><fieldset><legend>Mensaje comercial</legend><label>Código interno<input required value={draft.code} onChange={(event) => updateDraft("code", event.target.value)} /></label><label>Tipo de promoción<select value={draft.promotion_type} onChange={(event) => updateDraft("promotion_type", event.target.value)}>{Object.entries(promotionTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Título público<input required value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} placeholder="Ej. Refrescos para llenar la cámara" /></label><label>Texto corto<textarea rows={3} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="Qué gana el cliente y por qué debería consultar la oferta." /></label><label>Etiqueta visible<input value={draft.kicker} onChange={(event) => updateDraft("kicker", event.target.value)} /></label><label>Condiciones<textarea rows={3} value={draft.conditions} onChange={(event) => updateDraft("conditions", event.target.value)} placeholder="Ej. Pedido mínimo de 3 cajas. Oferta para clientes profesionales." /></label></fieldset><fieldset><legend>Descuento y vigencia</legend><div className="promotion-inline-fields"><label>Tipo<select value={draft.discount_type} onChange={(event) => updateDraft("discount_type", event.target.value)}><option value="percent">Porcentaje</option><option value="amount">Importe fijo</option><option value="none">Sin descuento</option></select></label><label>Descuento<input type="number" min="0" step="0.01" disabled={draft.discount_type === "none"} value={draft.discount_value} onChange={(event) => updateDraft("discount_value", event.target.value)} /></label></div><div className="promotion-inline-fields"><label>Empieza<input type="datetime-local" required value={draft.start_at} onChange={(event) => updateDraft("start_at", event.target.value)} /></label><label>Termina<input type="datetime-local" required value={draft.end_at} onChange={(event) => updateDraft("end_at", event.target.value)} /></label></div><div className="promotion-inline-fields"><label>Pedido mínimo<input type="number" min="0" step="1" value={draft.min_quantity} onChange={(event) => updateDraft("min_quantity", event.target.value)} placeholder="Opcional" /></label><label>Límite de unidades<input type="number" min="0" step="1" value={draft.stock_limit} onChange={(event) => updateDraft("stock_limit", event.target.value)} placeholder="Opcional" /></label></div><div className="promotion-preview"><span>Así lo verá el cliente</span><strong>{draft.discount_type === "percent" && draft.discount_value ? `-${draft.discount_value}%` : draft.discount_type === "amount" && draft.discount_value ? `-${draft.discount_value} €` : "Condición especial"}</strong><b>{draft.title || "Título de la promoción"}</b><small>{draft.description || "Añade una descripción breve y clara."}</small></div></fieldset></div><fieldset className="promotion-product-picker"><legend>Productos de la promoción <small>{draft.product_ids.length} seleccionados</small></legend><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Buscar por producto, marca o SKU…" />{selectedNames.length > 0 && <div className="promotion-selected-products">{selectedNames.map((name, index) => <button type="button" key={`${draft.product_ids[index]}-${name}`} onClick={() => toggleProduct(draft.product_ids[index])}>{name} ×</button>)}</div>}<div className="promotion-product-options">{visibleProducts.map((product) => <label key={product.id} className={draft.product_ids.includes(Number(product.id)) ? "selected" : ""}><input type="checkbox" checked={draft.product_ids.includes(Number(product.id))} onChange={() => toggleProduct(Number(product.id))} /><span><b>{product.name}</b><small>{product.sku || product.brand || product.format || "Referencia profesional"}</small></span></label>)}{!visibleProducts.length && <small>No hay productos que coincidan con la búsqueda.</small>}</div></fieldset>{error && <p className="error-message" role="alert">{error}</p>}<footer><button type="button" className="button secondary" onClick={() => !saving && setModalOpen(false)}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar borrador"}</button></footer></form></div>}</section>;
}

function WebRegistrationsManager({ user }: { user: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("Pendiente de validar");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/web_registrations?include_closed=1", { headers: { "X-Audit-Query": "true", "X-Actor": user?.username || "Usuario local" } });
      const data = await response.json();
      setRows(Array.isArray(data) ? data : []);
    } catch { setMessage("No se han podido cargar las solicitudes web."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function review(row: any, status: string) {
    const rejectionReason = status === "Rechazada" ? window.prompt("Motivo del rechazo (opcional):", row.rejection_reason || "") : "";
    if (status === "Rechazada" && rejectionReason === null) return;
    setSavingId(Number(row.id)); setMessage("");
    try {
      const response = await fetch(`/api/web_registrations/${row.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Actor": user?.username || "Usuario local" }, body: JSON.stringify({ status, rejection_reason: rejectionReason || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se ha podido actualizar la solicitud.");
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, ...data, status, rejection_reason: rejectionReason || null } : item));
      setMessage(status === "Validada" ? `Solicitud de ${row.company_name} validada y vinculada al CRM en ${data.crm_record_type === "proveedor" ? "Proveedores" : "Clientes"}.` : `Solicitud de ${row.company_name} marcada como ${status.toLowerCase()}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se ha podido actualizar la solicitud."); }
    finally { setSavingId(null); }
  }
  const visibleRows = rows.filter((row) => filter === "Todas" || row.status === filter);
  return <section className="web-registrations-manager"><div className="manager-head"><div><p className="eyebrow">PORTAL WEB · VALIDACIÓN</p><h2>Altas web</h2><p className="muted">Revisa y valida las solicitudes recibidas desde la web pública.</p></div><div><button className="button secondary" onClick={() => void load()}>Actualizar</button></div></div><div className="web-registration-toolbar"><label>Estado<select value={filter} onChange={(event) => setFilter(event.target.value)}><option>Pendiente de validar</option><option>Validada</option><option>Rechazada</option><option>Todas</option></select></label><span>{visibleRows.length} solicitudes</span></div>{message && <p className="success-message" role="status">{message}</p>}{loading ? <div className="data-loading" role="status"><span className="loading-spinner" />Cargando solicitudes…</div> : <div className="web-registration-list">{visibleRows.length ? visibleRows.map((row) => <article className="web-registration-card" key={row.id}><header><div><span className="web-registration-kind">{row.kind === "proveedor" ? "PROVEEDOR" : "CLIENTE"}</span><h3>{row.company_name}</h3></div><b className={`web-registration-status status-${String(row.status).toLowerCase().replaceAll(" ", "-")}`}>{row.status}</b></header><div className="web-registration-data"><span><b>Contacto</b>{row.contact_name}</span><span><b>Email</b>{row.email}</span><span><b>Teléfono</b>{row.phone || "No indicado"}</span><span><b>Ubicación</b>{[row.address, row.city].filter(Boolean).join(" · ") || "No indicada"}</span></div>{row.message && <p>{row.message}</p>}{row.crm_record_id && <div className="web-registration-linked"><b>Vinculada al CRM</b><span>{row.crm_record_type === "proveedor" ? "Proveedor" : "Cliente"} #{row.crm_record_id} · {row.reviewed_by || "Usuario local"}</span></div>}{row.rejection_reason && <div className="web-registration-rejection"><b>Motivo del rechazo</b><span>{row.rejection_reason}</span></div>}<footer><small>{row.created_at ? formatSpanishDateValue(row.created_at, true) : "Fecha no indicada"} · Portal web</small>{row.status === "Pendiente de validar" && <div><button className="button secondary" disabled={savingId === row.id} onClick={() => void review(row, "Rechazada")}>Rechazar</button><button className="button primary" disabled={savingId === row.id} onClick={() => void review(row, "Validada")}>{savingId === row.id ? "Guardando…" : "Validar y crear ficha"}</button></div>}</footer></article>) : <p className="empty-state">No hay solicitudes con este estado.</p>}</div>}</section>;
}

export function OcrIntelligent({ user = { username: "Usuario local" } }: { user?: any }) {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const historyRequestRef = useRef(0);
  const readHistory = async () => { const requestId = ++historyRequestRef.current; try { const response = await fetch(`/api/ocr_documents?refresh=${Date.now()}`, { cache: "no-store", headers: { "X-Audit-Query": "true", "X-Actor": user?.username || "Usuario local" } }); const body = await response.json(); if (requestId === historyRequestRef.current) setHistory(Array.isArray(body) ? body : []); } catch { if (requestId === historyRequestRef.current) setMessage("No se pudo cargar el historial."); } };
  useEffect(() => { void readHistory(); }, []);
  useEffect(() => { const handlePaste = (event: ClipboardEvent) => { const pasted = event.clipboardData?.files?.[0]; if (pasted) { event.preventDefault(); void selectFile(pasted); } }; window.addEventListener("paste", handlePaste); return () => window.removeEventListener("paste", handlePaste); }, []);
  function classify(name: string, text: string) { const value = `${name} ${text}`.toLowerCase(); if (/factura|invoice|iva|base imponible|total a pagar/.test(value)) return "Factura"; if (/presupuesto|cotizaci|proforma|oferta/.test(value)) return "Presupuesto"; return "Otro"; }
  function extractText(selected: File) { return new Promise<string>((resolve) => { if (!selected.type.startsWith("text/") && !/csv|xml|json/i.test(selected.type) && !/\.(txt|csv|xml|json)$/i.test(selected.name)) return resolve(""); const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "").slice(0, 50000)); reader.onerror = () => resolve(""); reader.readAsText(selected); }); }
  async function selectFile(selected?: File) { if (!selected) return; if (selected.size > 25 * 1024 * 1024) { setMessage("El archivo no puede superar 25 MB."); return; } setFile(selected); setLoading(true); setMessage(""); const text = await extractText(selected); const email = text.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || ""; const total = text.match(/(?:total|importe|precio)[^\d]{0,20}([\d.,]+\s*€?)/i)?.[1] || ""; setData({ document_type: classify(selected.name, text), email, total, extracted_text: text }); setLoading(false); }
  async function save() { if (!file || !data) return; setSaving(true); setMessage(""); try { const response = await fetch("/api/ocr_documents", { method: "POST", headers: { "Content-Type": "application/json", "X-Actor": user?.username || "Usuario local" }, body: JSON.stringify({ file_name: file.name, mime_type: file.type || "application/octet-stream", file_size: file.size, document_type: data.document_type, detected_email: data.email, detected_total: data.total, extracted_text: data.extracted_text, status: "Revisado", created_by: user?.username || "Usuario local" }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo guardar el documento."); setMessage("Documento guardado correctamente en el historial."); setFile(null); setData(null); await readHistory(); } catch (error: any) { setMessage(error.message || "No se pudo guardar el documento."); } finally { setSaving(false); } }
  return <section className="ocr-page"><div className="ocr-page-head"><div><p className="eyebrow">AUTOMATIZACIÓN DOCUMENTAL</p><h2>OCR inteligente</h2><p className="muted">Sube un documento para identificarlo y preparar sus datos para el CRM.</p></div></div><div className="ocr-tabs"><b>Nuevo documento</b><span>Historial {history.length}</span></div><div className={`ocr-dropzone${dragging ? " is-dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void selectFile(event.dataTransfer.files?.[0]); }}><span className="ocr-upload-icon">↑</span><h3>Arrastra tu documento aquí</h3><p className="muted">o selecciona un archivo desde tu dispositivo</p><label className="button primary">Subir archivo<input type="file" hidden onChange={(event) => void selectFile(event.target.files?.[0])} /></label><small>PDF, imágenes, Word, Excel, XML, CSV y cualquier otro formato · Máx. 25 MB</small></div>{loading && <div className="ocr-feedback" role="status">Analizando documento…</div>}{data && !loading && <div className="ocr-review"><div className="panel-head"><div><h3>Datos extraídos</h3><p className="muted">Revisa la clasificación antes de guardar.</p></div><span className="scanner-state ready">{data.document_type}</span></div><div className="ocr-fields"><label>Tipo de documento<select value={data.document_type} onChange={(event) => setData({ ...data, document_type: event.target.value })}><option>Factura</option><option>Presupuesto</option><option>Otro</option></select></label><label>Correo detectado<input value={data.email} onChange={(event) => setData({ ...data, email: event.target.value })} placeholder="No detectado" /></label><label>Importe / total<input value={data.total} onChange={(event) => setData({ ...data, total: event.target.value })} placeholder="No detectado" /></label></div><div className="ocr-actions"><button className="button primary" disabled={saving} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar en el historial"}</button><button className="button secondary" onClick={() => { setFile(null); setData(null); }}>Descartar</button></div></div>}{message && <p className="ocr-message" role="status">{message}</p>}<div className="ocr-history"><div className="panel-head"><div><h3>Historial de documentos</h3><p className="muted">Documentos guardados y clasificados.</p></div></div>{history.length ? history.map((item) => <div className="ocr-history-row" key={item.id}><span className="file-icon">▤</span><div><b>{item.file_name}</b><small>{item.created_at ? formatSpanishDateValue(item.created_at, true) : "—"} · {item.created_by || "Usuario local"}</small></div><span className="scanner-state ready">{item.document_type || "Otro"}</span></div>) : <p className="muted empty-row">Aún no hay documentos procesados.</p>}</div></section>;
}

function CrmHome({ routeMode = "crm" }: { routeMode?: keyof typeof routeModuleScopes }) {
  const routePath = typeof window !== "undefined" ? window.location.pathname.replace(/\/$/, "") : "";
  const resolvedRouteMode = routePath === "/ocr" ? "ocr" : routePath === "/almacen" ? "almacen" : routeMode;
  const routeModules = routeModuleScopes[resolvedRouteMode] || routeModuleScopes.crm;
  const [active, setActive] = useState(() => {
    if (typeof window === "undefined") return "Inicio";
    const routeDefault = routeDefaultSections[window.location.pathname.replace(/\/$/, "")];
    if (routeDefault && routeModules.includes(routeDefault)) return routeDefault;
    try {
      const stored = localStorage.getItem("excluvas.active-section") || "Inicio";
      return routeModules.includes(stored) ? stored : routeModules[0];
    } catch { return routeModules[0]; }
  });
  const [assistantFormIntent, setAssistantFormIntent] = useState<any>(null);
  useEffect(() => {
    function assistantFormRequested(event: Event) {
      const detail = (event as CustomEvent<any>).detail;
      const section = String(detail?.section || "");
      if (!section || !routeModules.includes(section)) return;
      setAssistantFormIntent(detail);
      setActive(section);
    }
    window.addEventListener("excluvas:assistant-form", assistantFormRequested);
    return () => window.removeEventListener("excluvas:assistant-form", assistantFormRequested);
  }, [routeModules]);
  useEffect(() => {
    const section = routeDefaultSections[window.location.pathname.replace(/\/$/, "")] || "";
    if (section && routeModules.includes(section)) setActive(section);
  }, [resolvedRouteMode, routeModules]);
  const [webOrderOpen, setWebOrderOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState({
    id: 0,
    username: "Luis",
    role: "admin",
    permissions: "*",
  });
  const allowedModules = allowedModulesFor(currentUser).filter((module) => routeModules.includes(module));
  const canOpenCommercialView = currentUser.role === "admin" || allowedModules.includes("Pedidos");
  const canOpenWarehouseView = currentUser.role === "admin" || allowedModules.includes("Preparación de pedidos");
  const canOpenWebView = currentUser.role === "admin" || allowedModules.includes("Clientes");
  const [homeAmountsVisible, setHomeAmountsVisible] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [homeNotePreview, setHomeNotePreview] = useState<any>(null);
  const [homeNotePreviewLoading, setHomeNotePreviewLoading] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationsSeenAt, setNotificationsSeenAt] = useState(0);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [notificationHistoryOpen, setNotificationHistoryOpen] = useState(false);
  const [stockAlertPreview, setStockAlertPreview] = useState<any>(null);
  async function loadNotifications() {
    try {
      const [response, orders, clients, products] = await Promise.all([
        fetch("/api/audit_logs", { headers: { "X-Audit-Query": "true" } }),
        fetchCompactLookup("orders", currentUser.username || "Usuario local"),
        fetchCompactLookup("clients", currentUser.username || "Usuario local"),
        fetchCompactLookup("products", currentUser.username || "Usuario local"),
      ]);
      const data = await response.json();
      const getOrderId = (item: any) => {
        const resourceMatch = String(item?.resource || "").match(/(?:orders|order)\/(\d+)/i);
        const detailsMatch = String(item?.details || "").match(/(?:orders|order)[\/]?(\d+)/i);
        let structuredOrderId = 0;
        try { structuredOrderId = Number(JSON.parse(String(item?.details || "{}")).order_id || 0); } catch {}
        return Number(item?.order_id || structuredOrderId || (resourceMatch || detailsMatch)?.[1] || 0);
      };
      setNotifications((Array.isArray(data) ? data : [])
        .filter((item: any) => item.method === "POST" && (
          ["Alerta stock", "Incidencia preparación", "Respuesta solicitud precios"].includes(item.action) ||
          item.action === "Alta web" ||
          (item.action === "Alta" && /^orders\/\d+$/i.test(String(item.resource || "")))
        ))
        .slice(0, 8)
        .map((item: any) => {
          const orderId = getOrderId(item);
          const order = orderId ? orders.find((row: any) => Number(row.id) === orderId) : null;
          const client = order ? clients.find((row: any) => Number(row.id) === Number(order.client_id)) : null;
          let shortageDetails: any[] = [];
          try { shortageDetails = Array.isArray(JSON.parse(String(item.details || "[]"))) ? JSON.parse(String(item.details || "[]")) : []; } catch {}
          const stockItems = item.action === "Alerta stock" ? shortageDetails.map((shortage: any) => {
            const product = products.find((row: any) => Number(row.id) === Number(shortage.product_id));
            const physical = Number(product?.stock || 0);
            const reserved = Number(product?.stock_reserved || 0);
            const available = physical - reserved;
            return { ...shortage, product_name: product?.name || `Producto #${shortage.product_id}`, warehouse_location: product?.warehouse_location || "Ubicación no indicada", physical, reserved, pending: reserved, available, deficit: Math.max(0, reserved - physical) };
          }) : [];
          return { ...item, order_id: orderId, order_code: order?.code || "", client_name: client?.name || "Cliente no indicado", stock_items: stockItems, related_order_deleted: Boolean(orderId && !order) };
        })
        .filter((item: any) => !item.related_order_deleted));
    } catch {}
  }
  const unreadNotifications = notifications.filter(
    (item) => !readNotificationIds.includes(String(item.id)) && new Date(item.created_at).getTime() > notificationsSeenAt,
  ).length;
  const visibleNotifications = notificationHistoryOpen
    ? notifications
    : notifications.filter(
      (item) => !readNotificationIds.includes(String(item.id)) && new Date(item.created_at).getTime() > notificationsSeenAt,
    );
  useEffect(() => {
    try {
      setNotificationsSeenAt(
        Number(localStorage.getItem("excluvas.notifications.seen") || 0),
      );
      setReadNotificationIds(JSON.parse(localStorage.getItem("excluvas.notifications.read") || "[]"));
    } catch {}
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!allowedModules.includes(active)) setActive(allowedModules[0] || "Inicio");
  }, [active, currentUser]);
  useEffect(() => {
    if (!allowedModules.includes(active)) return;
    try { localStorage.setItem("excluvas.active-section", active); } catch {}
  }, [active, currentUser]);
  function openNotifications() {
    setNotificationOpen((open) => !open);
  }
  function markNotificationRead(item: any) {
    const id = String(item.id);
    setReadNotificationIds((current) => {
      const next = current.includes(id) ? current : [...current, id];
      try { localStorage.setItem("excluvas.notifications.read", JSON.stringify(next.slice(-200))); } catch {}
      return next;
    });
  }
  function markAllNotificationsRead() {
    const ids = notifications.map((item) => String(item.id));
    setReadNotificationIds((current) => {
      const next = Array.from(new Set([...current, ...ids]));
      try { localStorage.setItem("excluvas.notifications.read", JSON.stringify(next.slice(-200))); } catch {}
      return next;
    });
  }
  function openNotificationTarget(item: any) {
    markNotificationRead(item);
    if (item?.action === "Alta web") {
      setNotificationOpen(false);
      setActive("Altas web");
      return;
    }
    if (item?.action === "Alerta stock") {
      setStockAlertPreview(item);
      setNotificationOpen(false);
      return;
    }
    if (item?.action === "Incidencia preparación") {
      setNotificationOpen(false);
      const match = String(item?.resource || "").match(/^preparation-incidents\/(\d+)$/);
      const noteId = match ? Number(match[1]) : 0;
      if (noteId) {
        try { sessionStorage.setItem("excluvas.pending-note-preview", String(noteId)); } catch {}
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("crm:previsualizar-nota", { detail: noteId })), 160);
      }
      return;
    }
    if (item?.action === "Respuesta solicitud precios") {
      setNotificationOpen(false);
      setActive("Compras inteligentes");
      return;
    }
    const resourceMatch = String(item?.resource || "").match(/(?:orders|order)\/(\d+)/i);
    const detailsMatch = String(item?.details || "").match(/(?:orders|order)[\/]?(\d+)/i);
    const orderId = Number(item?.order_id || (resourceMatch || detailsMatch)?.[1] || 0);
    setNotificationOpen(false);
    if (!orderId) {
      setActive("Pedidos");
      return;
    }
    setActive("Pedidos");
    // El gestor de Pedidos consume este identificador cuando la sección termina de montarse.
    try { sessionStorage.setItem("excluvas.pending-order-preview", JSON.stringify({ id: orderId, code: item?.order_code || "", clientName: item?.client_name || "" })); } catch {}
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("crm:previsualizar-pedido", { detail: { id: orderId, code: item?.order_code || "", clientName: item?.client_name || "" } })), 800);
  }
  function logoutFromMenu() {
    localStorage.removeItem("excluvas.session");
    sessionStorage.removeItem("excluvas.session");
    window.location.reload();
  }
  useEffect(() => {
    try {
      const raw =
        localStorage.getItem("excluvas.session") ||
        sessionStorage.getItem("excluvas.session");
      if (raw) {
        const session = JSON.parse(raw);
        if (["Luis", "Jose"].includes(session.username)) session.role = "admin";
        const nextUser = { id: 0, permissions: "*", ...session };
        setCurrentUser(nextUser);
        const storedSection = localStorage.getItem("excluvas.active-section");
        const routeDefault = routeDefaultSections[window.location.pathname.replace(/\/$/, "")];
        setActive(
          routeDefault && routeModules.includes(routeDefault)
            ? routeDefault
            : resolvedRouteMode === "ocr"
              ? "OCR inteligente"
              : (storedSection && allowedModulesFor(nextUser).includes(storedSection)
                ? storedSection
                : preferredModuleFor(nextUser)),
        );
      }
    } catch {}
  }, [resolvedRouteMode]);
  useEffect(() => {
    if (resolvedRouteMode === "ocr") setActive("OCR inteligente");
  }, [resolvedRouteMode]);
  useEffect(() => {
    if (!currentUser?.username) return;
    // Las secciones cargan sus propios datos compactos al abrirse. Evitamos
    // precargar todos los listados completos al iniciar sesión: Productos,
    // en particular, puede ocupar varios megabytes.
  }, [currentUser.username]);
  const [summary, setSummary] = useState({
    sales: 0,
    openOrders: 0,
    receivables: 0,
    criticalStock: 0,
    products: 0,
    clients: 0,
    orders: 0,
    invoices: 0,
    deliveryNotes: 0,
    payments: 0,
    suppliers: 0,
    reports: 0,
  });
  const [importantNotes, setImportantNotes] = useState<any[]>([]);
  const [homeAlerts, setHomeAlerts] = useState<any[]>([]);
  const [homeActivityTab, setHomeActivityTab] = useState("Pedidos");
  const [homeOrders, setHomeOrders] = useState<any[]>([]);
  const [homeShipments, setHomeShipments] = useState<any[]>([]);
  const [homeClients, setHomeClients] = useState<any[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [pendingOrdersOpen, setPendingOrdersOpen] = useState(false);
  const [openOrderStatus, setOpenOrderStatus] = useState<string | null>(null);
  const [homeNoteModalOpen, setHomeNoteModalOpen] = useState(false);
  const [homeExpenseModalOpen, setHomeExpenseModalOpen] = useState(false);
  const [homeNoteSaving, setHomeNoteSaving] = useState(false);
  const [homeNoteDraft, setHomeNoteDraft] = useState({
    title: "",
    content: "",
    module: "General",
    priority: "Normal",
  });
  const homeActorHeaders = {
    "Content-Type": "application/json",
    "X-Actor": currentUser.username || "Usuario local",
  };
  const homeToday = tabletTodayInput();
  const [homeRangePreset, setHomeRangePresetState] = useState<
    "hoy" | "semana" | "mes" | "trimestre" | "semestre" | "anio" | null
  >("hoy");
  const [homeOrderRangeStart, setHomeOrderRangeStart] = useState(homeToday);
  const [homeOrderRangeEnd, setHomeOrderRangeEnd] = useState(homeToday);
  const [completingNoteId, setCompletingNoteId] = useState<number | null>(null);
  function formatHomeAmount(value: number) {
    return homeAmountsVisible
      ? value.toLocaleString("es-ES", { style: "currency", currency: "EUR" })
      : "••••••";
  }
  const homeOrdersInRange = homeOrders.filter((order) => {
    const date = String(order.delivery_date || order.created_at || "").slice(
      0,
      10,
    );
    return date >= homeOrderRangeStart && date <= homeOrderRangeEnd;
  });
  // La preparación de pedidos se basa en las hojas de carga, no únicamente
  // en el estado del pedido. Así el inicio muestra exactamente las mismas
  // comandas que el tablero de Preparación de pedidos (incluidas las
  // completadas y las que tienen incidencia).
  const homePreparationRows = [
    ...homeShipments.map((shipment) => {
      const order = homeOrders.find((item) => Number(item.id) === Number(shipment.order_id));
      return order
        ? { ...order, ...shipment, id: order.id, preparation_date: shipment.preparation_date || order.preparation_date, delivery_date: shipment.delivery_date || order.delivery_date, preparation_status: shipment.status }
        : shipment;
    }),
    ...homeOrders.filter((order) =>
      !homeShipments.some((shipment) => Number(shipment.order_id) === Number(order.id)) &&
      ["Nuevo", "Pendiente", "Confirmado"].includes(order.status || "Pendiente") &&
      Number(order.deleted || 0) !== 1,
    ),
  ];
  const pendingPreparationOrdersInRange = homePreparationRows.filter((order) => {
    const date = String(order.preparation_date || "").slice(0, 10);
    return Boolean(date) && date >= homeOrderRangeStart && date <= homeOrderRangeEnd;
  });
  const homePreparationStatus = (order: any) => String(order.preparation_status || order.status || "Pendiente");
  const homePreparationStatusRows = (status: string) => pendingPreparationOrdersInRange
    .filter((order) => homePreparationStatus(order) === status)
    .sort((a, b) => String(b.created_at || b.updated_at || b.delivery_date || "").localeCompare(String(a.created_at || a.updated_at || a.delivery_date || "")))
    .slice(0, 10);
  function homeDateInRange(value: any) {
    const date = String(value || "").slice(0, 10);
    return date >= homeOrderRangeStart && date <= homeOrderRangeEnd;
  }
  const homeOrderStatusSteps = [
    { label: "Pedidos", icon: "▣", count: homeOrdersInRange.length },
    {
      label: "Para preparar",
      icon: "○",
      count: pendingPreparationOrdersInRange.length,
    },
    {
      label: "En preparación",
      icon: "◒",
      count: homePreparationStatusRows("Preparando").length,
    },
    {
      label: "Preparados",
      icon: "✓",
      count: homePreparationStatusRows("Preparado").length,
    },
    {
      label: "En ruta",
      icon: "➜",
      count: homePreparationStatusRows("En reparto").length,
    },
    {
      label: "Entregados",
      icon: "●",
      count: homePreparationStatusRows("Entregado").length,
    },
  ];
  const pendingHomeOrders = pendingPreparationOrdersInRange
    .sort((a, b) =>
      String(b.created_at || b.updated_at || b.delivery_date || "").localeCompare(
        String(a.created_at || a.updated_at || a.delivery_date || ""),
      ),
    )
    .slice(0, 10);
  async function updateHomeOrder(order: any, changes: any) {
    const response = await fetch(`/api/orders/${order.id}`, {
      method: "PUT",
      headers: homeActorHeaders,
      body: JSON.stringify({ ...order, ...changes }),
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error || "No se pudo actualizar el pedido");
      return;
    }
    setHomeOrders((current) => current.map((item) => (item.id === data.id ? data : item)));
  }
  async function deleteHomeOrder(order: any) {
    if (!window.confirm(`¿Eliminar el pedido ${order.code}?`)) return;
    const response = await fetch(`/api/orders/${order.id}`, {
      method: "DELETE",
      headers: homeActorHeaders,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error || "No se pudo eliminar el pedido");
      return;
    }
    setHomeOrders((current) => current.filter((item) => item.id !== order.id));
  }
  function goToOrder(order: any) {
    setActive("Pedidos");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("crm:editar-pedido", { detail: order.id })), 0);
  }
  function openHomeAlert(alert: any) {
    setActive(alert.module || "Inicio");
    if (alert.module === "Pedidos" && alert.record_id) {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("crm:previsualizar-pedido", { detail: alert.record_id })), 80);
    }
  }
  function previewHomeOrder(order: any) {
    setActive("Pedidos");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("crm:previsualizar-pedido", { detail: order.id })), 50);
  }
  function renderHomeOrderActions(order: any) {
    const nextStatus: Record<string, string> = {
      Pendiente: "Preparando",
      Confirmado: "Preparando",
      Preparando: "Preparado",
      Preparado: "En reparto",
      "En reparto": "Entregado",
    };
    return (
      <span className="home-order-actions">
        <button type="button" onClick={() => previewHomeOrder(order)}>Vista previa</button>
        <button type="button" onClick={() => goToOrder(order)}>Editar</button>
        {nextStatus[order.status || "Pendiente"] && (
          <button type="button" onClick={() => updateHomeOrder(order, { status: nextStatus[order.status || "Pendiente"] })}>
            {order.status === "En reparto" ? "Entregar" : order.status === "Preparado" ? "Enviar" : order.status === "Preparando" ? "Marcar preparado" : "Preparar"}
          </button>
        )}
        <button type="button" className="danger" onClick={() => deleteHomeOrder(order)}>Eliminar</button>
      </span>
    );
  }
  async function loadImportantNotes() {
    try {
      const r = await fetch("/api/notes");
      const notes = await r.json();
      setImportantNotes(
        (Array.isArray(notes) ? notes : [])
          .filter((n) => Number(n.important) === 1 && Number(n.completed) !== 1)
          .slice(0, 6),
      );
    } catch {}
  }
  async function completeNote(note: any) {
    if (completingNoteId === note.id) return;
    setCompletingNoteId(note.id);
    try {
      const response = await fetch(
        `/api/notes/${note.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Actor": "Luis" },
          body: JSON.stringify({ completed: 1 }),
        },
      );
      if (!response.ok) throw new Error("No se pudo completar la nota");
      window.setTimeout(() => {
        setImportantNotes((current) => current.filter((n) => n.id !== note.id));
        setCompletingNoteId(null);
      }, 420);
    } catch {
      setCompletingNoteId(null);
    }
  }
  function openNoteTarget(note: any) {
    const noteId = Number(note?.id || 0);
    if (!noteId) return;
    // La tarjeta ya contiene el detalle completo cargado desde Inicio. Evita
    // pedir /api/notes/:id, una ruta que no existe y provocaba un 404 fugaz.
    setHomeNotePreview(note);
  }
  async function createHomeNote(event: FormEvent) {
    event.preventDefault();
    if (!homeNoteDraft.title.trim() || !homeNoteDraft.content.trim()) return;
    setHomeNoteSaving(true);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Actor": currentUser.username },
        body: JSON.stringify({ ...homeNoteDraft, important: 1, completed: 0 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo crear la nota");
      setHomeNoteDraft({ title: "", content: "", module: "General", priority: "Normal" });
      setHomeNoteModalOpen(false);
      loadImportantNotes();
    } catch (error: any) {
      alert(error.message || "No se pudo crear la nota");
    } finally {
      setHomeNoteSaving(false);
    }
  }
  useEffect(() => {
    if (active !== "Inicio") return;
    setHomeLoading(true);
    let cancelled = false;
    const loadEssential = async () => {
      try {
        const response = await fetchWithRetry(`/api/summary?from=${encodeURIComponent(homeOrderRangeStart)}&to=${encodeURIComponent(homeOrderRangeEnd)}`);
        const payload = await response.json();
        if (cancelled) return;
        setHomeOrders(Array.isArray(payload.orders) ? payload.orders : []);
        setHomeShipments(Array.isArray(payload.shipments) ? payload.shipments : []);
        setHomeClients(Array.isArray(payload.clients) ? payload.clients : []);
        setImportantNotes(Array.isArray(payload.importantNotes) ? payload.importantNotes : []);
        setHomeAlerts(Array.isArray(payload.alerts) ? payload.alerts : []);
        setSummary((current) => ({ ...current, ...(payload.summary || {}) }));
        setHomeLoading(false);
      } catch {
        if (!cancelled) setHomeLoading(false);
      }
    };
    void loadEssential();
    return () => { cancelled = true; };
  }, [active, homeOrderRangeStart, homeOrderRangeEnd]);
  function setHomeRangePreset(preset: "hoy" | "semana" | "mes" | "trimestre" | "semestre" | "anio") {
    setHomeRangePresetState(preset);
    const today = tabletTodayInput();
    const current = new Date();
    const year = current.getFullYear();
    const month = current.getMonth();
    const format = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (preset === "hoy") {
      setHomeOrderRangeStart(today);
    } else if (preset === "semana") {
      const dayOfWeek = current.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(year, month, current.getDate() + daysToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setHomeOrderRangeStart(format(monday));
      setHomeOrderRangeEnd(format(sunday));
      return;
    } else if (preset === "mes") {
      setHomeOrderRangeStart(`${today.slice(0, 8)}01`);
    } else if (preset === "trimestre") {
      setHomeOrderRangeStart(format(new Date(year, Math.floor(month / 3) * 3, 1)));
    } else if (preset === "semestre") {
      // Semestre móvil: permite comparar los últimos seis meses aunque
      // estemos dentro del segundo semestre natural del año.
      setHomeOrderRangeStart(format(new Date(year, month - 5, 1)));
    } else {
      setHomeOrderRangeStart(`${year}-01-01`);
    }
    setHomeOrderRangeEnd(today);
  }
  return (
    <main className="crm-shell">
      <header className="topline">
        <span>EXCLUSIVAS INTELIGENTES</span>
      </header>
      <div className="appbar">
        <div
          className="brand"
          role="button"
          tabIndex={0}
          aria-label="Ir al inicio"
          onClick={() => setActive("Inicio")}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") && setActive("Inicio")
          }
        >
          <div className="brand-mark">E</div>
          <div>
            <strong>Exclusivas</strong>
            <small>Inteligentes</small>
          </div>
        </div>
        {active === "Inicio" && homeLoading && (
          <div className="global-loading-status" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <LoadingIndicator label="Actualizando datos" />
          </div>
        )}
        <div className="appbar-actions">
          <div className="header-quick-actions" aria-label="Accesos rápidos">
            {canOpenWarehouseView && <>
              <button
                className="button primary quick-icon-action"
                onClick={() => setActive("Preparación de pedidos")}
                aria-label="Preparación de pedidos"
                title="Preparación de pedidos"
              >
                <ToolbarIcon name="preparation" />
                <span className="icon-action-label">Preparación de pedidos</span>
              </button>
              <button
                className="button primary quick-icon-action"
                onClick={() => setActive("Stock")}
                aria-label="Stock"
                title="Stock"
              >
                <ToolbarIcon name="stock" />
                <span className="icon-action-label">Stock</span>
              </button>
            </>}
            {canOpenCommercialView && (
              <a className="button primary quick-icon-action app-route-shortcut" href="/comercial" aria-label="Vista comercial" title="Vista comercial">
                <ToolbarIcon name="commercial" />
                <span className="icon-action-label">Vista comercial</span>
              </a>
            )}
            {canOpenWarehouseView && (
              <a className="button primary quick-icon-action app-route-shortcut" href="/almacen" aria-label="Vista almacén" title="Vista almacén">
                <ToolbarIcon name="warehouse" />
                <span className="icon-action-label">Vista almacén</span>
              </a>
            )}
            {canOpenWarehouseView && (
              <a className="button primary quick-icon-action app-route-shortcut" href="/reparto" aria-label="Vista reparto" title="Vista reparto">
                <ToolbarIcon name="map" />
                <span className="icon-action-label">Vista reparto</span>
              </a>
            )}
            {canOpenWebView && (
              <a className="button primary quick-icon-action app-route-shortcut" href="/web" aria-label="Web pública" title="Web pública">
                <ToolbarIcon name="web" />
                <span className="icon-action-label">Web pública</span>
              </a>
            )}
            <button
              className="button primary quick-icon-action"
              onClick={() => {
                setActive("Pedidos");
                window.setTimeout(() => window.dispatchEvent(new Event("crm:nuevo-pedido")), 120);
              }}
              aria-label="Nuevo pedido"
              title="Nuevo pedido"
            >
              <ToolbarIcon name="order" />
              <span className="icon-action-label">Nuevo pedido</span>
            </button>
            <button
              className="button primary home-expense-launch quick-icon-action"
              onClick={() => setHomeExpenseModalOpen(true)}
              aria-label="Subir gasto"
              title="Subir gasto"
            >
              <ToolbarIcon name="expense" />
              <span className="icon-action-label">Subir gasto</span>
            </button>
            <a
              className="button primary quick-icon-action app-backup-action"
              href="/api/backup"
              download
              aria-label="Descargar copia de seguridad"
              title="Descargar copia de seguridad"
            >
              <ToolbarIcon name="backup" />
              <span className="icon-action-label">Descargar copia de seguridad</span>
            </a>
          </div>
          <div className="notification-box">
            <button
              className={`icon-button notification-button ${notificationOpen ? "open" : ""}`}
              onClick={openNotifications}
              aria-expanded={notificationOpen}
              aria-label="Abrir notificaciones"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
              </svg>
              {unreadNotifications > 0 && (
                <b className="notification-count">{unreadNotifications > 9 ? "9+" : unreadNotifications}</b>
              )}
            </button>
            {notificationOpen && (
              <div className="notification-menu" role="dialog" aria-label="Notificaciones">
                <div className="notification-menu-head">
                  <b>Notificaciones</b>
                  <span>{unreadNotifications} avisos pendientes <button type="button" className="notification-mark-all" onClick={() => setNotificationHistoryOpen((value) => !value)}>{notificationHistoryOpen ? "Ver pendientes" : "Ver historial"}</button>{unreadNotifications > 0 && <button type="button" className="notification-mark-all" onClick={markAllNotificationsRead}>Marcar todas como leídas</button>}</span>
                </div>
                {visibleNotifications.length ? (
                  visibleNotifications.map((item) => (
                    <div
                      className="notification-item"
                      key={item.id}
                      onClick={() => openNotificationTarget(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openNotificationTarget(item); }}
                    >
                      <span className={`notification-item-icon ${!readNotificationIds.includes(String(item.id)) && new Date(item.created_at).getTime() > notificationsSeenAt ? "unread" : ""}`} aria-hidden="true" />
                      <span>
                        <b>
                          {item.action === "Alerta stock"
                            ? `Alerta de stock · ${item.client_name || "Cliente no indicado"} · ${item.order_code || `Pedido ${item.order_id || ""}`}${item.order_id ? ` · ID ${item.order_id}` : ""}`
                            : item.action === "Incidencia preparación"
                              ? `Incidencia en preparación · ${item.client_name || "Cliente no indicado"} · ${item.order_code || `Pedido ${item.order_id || ""}`}${item.order_id ? ` · ID ${item.order_id}` : ""}`
                              : `Nuevo pedido · ${item.client_name || "Cliente no indicado"} · ${item.order_code || `Pedido ${item.order_id || ""}`}${item.order_id ? ` · ID ${item.order_id}` : ""}`}
                        </b>
                        <small> · {new Date(item.created_at).toLocaleString("es-ES")}</small>
                      </span>
                      {readNotificationIds.includes(String(item.id)) ? <small className="notification-read-label">Leída</small> : <button type="button" className="notification-mark-read" onClick={(event) => { event.stopPropagation(); markNotificationRead(item); }}>Marcar leída</button>}
                    </div>
                  ))
                ) : (
                  <p className="notification-empty">No hay avisos nuevos.</p>
                )}
              </div>
            )}
          </div>
          {stockAlertPreview && (
            <div className="preview-overlay stock-alert-overlay" role="dialog" aria-modal="true" aria-label="Alerta de stock" onClick={(event) => { if (event.target === event.currentTarget) setStockAlertPreview(null); }}>
              <section className="stock-alert-card">
                <header className="stock-alert-head"><div><p className="eyebrow">AVISO DE STOCK</p><h2>Déficit detectado</h2><small>{stockAlertPreview.order_code || `Pedido ${stockAlertPreview.order_id || ""}`} · {stockAlertPreview.client_name || "Cliente no indicado"}</small></div><button type="button" className="preview-close" aria-label="Cerrar" onClick={() => setStockAlertPreview(null)}>×</button></header>
                <p className="stock-alert-intro">Este pedido puede dejar productos sin cobertura teniendo en cuenta las unidades ya reservadas por pedidos pendientes.</p>
                <div className="stock-alert-list">{(stockAlertPreview.stock_items || []).map((stock: any) => <article className="stock-alert-item" key={stock.product_id}><div className="stock-alert-item-head"><b>{stock.product_name}</b><span>{stock.warehouse_location}</span></div><div className="stock-alert-metrics"><div><small>Stock físico</small><strong>{stock.physical}</strong></div><div><small>Reservado / pendiente</small><strong>{stock.pending}</strong></div><div><small>Déficit</small><strong className="is-danger">{stock.deficit}</strong></div></div><small className="stock-alert-requested">Este pedido solicita {stock.requested} unidades. El déficit ya tiene en cuenta las reservas de pedidos pendientes.</small></article>)}{!(stockAlertPreview.stock_items || []).length && <p className="empty-state">No se han podido recuperar los productos afectados.</p>}</div>
                <footer className="stock-alert-actions"><button type="button" className="button secondary" onClick={() => setStockAlertPreview(null)}>Cerrar</button><button type="button" className="button secondary" onClick={() => { setStockAlertPreview(null); setActive("Stock"); }}>Ver stock</button><button type="button" className="button primary" onClick={() => { const target = { ...stockAlertPreview, action: "Alta" }; setStockAlertPreview(null); openNotificationTarget(target); }}>Abrir pedido</button></footer>
              </section>
            </div>
          )}
          <button
            className={`user user-menu-trigger ${userMenuOpen ? "open" : ""}`}
            onClick={() => setUserMenuOpen((value) => !value)}
            aria-expanded={userMenuOpen}
            aria-label="Abrir menú de usuario"
          >
          <div>
            <b>{currentUser.username}</b>
            <small>
              {currentUser.role === "admin" ? "Administrador" : "Usuario"}
            </small>
          </div>
          <span className="user-menu-chevron">⌄</span>
          {userMenuOpen && (
            <span className="user-menu" role="menu">
              <span className="user-menu-caption">
                Sesión iniciada como {currentUser.username}
              </span>
              <span className="user-menu-separator" />
              <span
                className="user-menu-action"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  logoutFromMenu();
                }}
              >
                Cerrar sesión
              </span>
            </span>
          )}
          </button>
        </div>
      </div>
      <div className="workspace">
        <Sidebar active={active} setActive={setActive} user={currentUser} moduleScope={routeModules} onLogout={logoutFromMenu} />
        <section
          className={`content ${active === "Inicio" ? "home-content" : ""}`}
        >
          <div
            className={
              active === "Inicio"
                ? "content-head"
                : "content-head section-context"
            }
          >
            <div>
              <p className="eyebrow">
                {new Date()
                  .toLocaleDateString("es-ES", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                  .toUpperCase()}
              </p>
              <h1>{active === "Inicio" ? "Panel principal" : active}</h1>
              <p className="muted">
                Gestión operativa de tu distribuidora de bebidas.
              </p>
            </div>
            <div className="head-actions">
              {active !== "Inicio" && active !== "Preparación de pedidos" && (
                <button className="button secondary">↧ Exportar</button>
              )}
            </div>
          </div>
      {active === "Inicio" && (
            <div className="home-global-range">
              <div>
                <b>Periodo</b>
              </div>
              <div className="home-order-range">
                <div className="home-range-inputs">
                  <label>
                    Desde
                    <input
                      type="date"
                      value={homeOrderRangeStart}
                      max={homeOrderRangeEnd}
                      onChange={(event) => {
                        setHomeRangePresetState(null);
                        setHomeOrderRangeStart(event.target.value);
                      }}
                    />
                  </label>
                  <span>—</span>
                  <label>
                    Hasta
                    <input
                      type="date"
                      value={homeOrderRangeEnd}
                      min={homeOrderRangeStart}
                      onChange={(event) => {
                        setHomeRangePresetState(null);
                        setHomeOrderRangeEnd(event.target.value);
                      }}
                    />
                  </label>
                </div>
                <div className="home-range-presets">
                  <button
                    type="button"
                    className={homeRangePreset === "hoy" ? "active" : ""}
                    aria-pressed={homeRangePreset === "hoy"}
                    onClick={() => setHomeRangePreset("hoy")}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    className={homeRangePreset === "semana" ? "active" : ""}
                    aria-pressed={homeRangePreset === "semana"}
                    onClick={() => setHomeRangePreset("semana")}
                  >
                    Esta semana
                  </button>
                  <button
                    type="button"
                    className={homeRangePreset === "mes" ? "active" : ""}
                    aria-pressed={homeRangePreset === "mes"}
                    onClick={() => setHomeRangePreset("mes")}
                  >
                    Este mes
                  </button>
                  <button type="button" className={homeRangePreset === "trimestre" ? "active" : ""} aria-pressed={homeRangePreset === "trimestre"} onClick={() => setHomeRangePreset("trimestre")}>
                    Trimestre
                  </button>
                  <button type="button" className={homeRangePreset === "semestre" ? "active" : ""} aria-pressed={homeRangePreset === "semestre"} onClick={() => setHomeRangePreset("semestre")}>
                    Semestre
                  </button>
                  <button type="button" className={homeRangePreset === "anio" ? "active" : ""} aria-pressed={homeRangePreset === "anio"} onClick={() => setHomeRangePreset("anio")}>
                    Año actual
                  </button>
                </div>
              </div>
            </div>
          )}
          {homeExpenseModalOpen && active === "Inicio" && (
            <QuickExpenseModal
              clients={homeClients}
              actor={currentUser.username || "Usuario local"}
              onClose={() => setHomeExpenseModalOpen(false)}
              onCreated={() => {
                setHomeExpenseModalOpen(false);
                alert("Gasto guardado correctamente.");
              }}
            />
          )}
          {active === "Inicio" ? (
            <>
              <div className="kpis">
                <article>
                  <span>VENTAS DEL PERIODO</span>
                  <strong>{formatHomeAmount(summary.sales)}</strong>
                  <button className="amount-toggle" type="button" onClick={() => setHomeAmountsVisible((visible) => !visible)} aria-label={homeAmountsVisible ? "Ocultar importes" : "Mostrar importes"} title={homeAmountsVisible ? "Ocultar importes" : "Mostrar importes"}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
                  </button>
                  <small>facturación del periodo</small>
                </article>
                <article>
                  <span>PEDIDOS ABIERTOS</span>
                  <strong>{summary.openOrders}</strong>
                  <b className="neutral">pendientes</b>
                  <small>pedidos abiertos del periodo</small>
                </article>
                <article>
                  <span>POR COBRAR</span>
                  <strong>{formatHomeAmount(summary.receivables)}</strong>
                  <button className="amount-toggle" type="button" onClick={() => setHomeAmountsVisible((visible) => !visible)} aria-label={homeAmountsVisible ? "Ocultar importes" : "Mostrar importes"} title={homeAmountsVisible ? "Ocultar importes" : "Mostrar importes"}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
                  </button>
                  <b className="warning">pendiente</b>
                  <small>facturas pendientes del periodo</small>
                </article>
                <article>
                  <span>STOCK CRÍTICO</span>
                  <strong>{summary.criticalStock}</strong>
                  <b className="danger">Prioridad alta</b>
                  <small>revisar reposición</small>
                </article>
              </div>
              <section className="panel home-alert-center" aria-label="Centro de alertas">
                <div className="home-alert-head">
                  <div><p className="eyebrow">PARA ACTUAR HOY</p><h2>Centro de alertas</h2><p className="muted">Las tareas que necesitan atención antes de seguir avanzando.</p></div>
                  <strong className={homeAlerts.length ? "has-alerts" : "all-clear"}>{homeAlerts.length ? `${homeAlerts.length} pendientes` : "Todo al día"}</strong>
                </div>
                {homeAlerts.length ? <div className="home-alert-grid">{homeAlerts.slice(0, 8).map((alert, index) => <button type="button" key={`${alert.type}-${alert.record_id}-${index}`} className={`home-alert-card ${alert.severity || "info"}`} onClick={() => openHomeAlert(alert)}><span className="home-alert-dot" aria-hidden="true">{alert.severity === "critical" ? "!" : alert.severity === "warning" ? "·" : "＋"}</span><span><b>{alert.title}</b><small>{alert.detail}</small></span><em>Revisar →</em></button>)}</div> : <div className="home-alert-empty"><span>✓</span><p><b>No hay alertas operativas pendientes</b><small>Cuando aparezca una preparación, una factura vencida o una entrada por verificar, la verás aquí.</small></p></div>}
              </section>
              <section className={`panel pending-orders-panel${pendingOrdersOpen ? " open" : " collapsed"}`}>
                <button
                  type="button"
                  className="pending-orders-head"
                  aria-expanded={pendingOrdersOpen}
                  onClick={() => setPendingOrdersOpen((open) => !open)}
                >
                  <span>
                    <b>Pedidos para preparar</b>
                    <small>{pendingHomeOrders.length} pedidos · más recientes primero</small>
                  </span>
                  <strong>{pendingOrdersOpen ? "⌃" : "⌄"}</strong>
                </button>
                {pendingOrdersOpen && (
                  <div className="pending-orders-list">
                    <div className="pending-orders-columns" aria-hidden="true">
                      <span>Pedido</span>
                      <span>Cliente</span>
                      <span>Solicitud</span>
                      <span>Entrega</span>
                      <span>Estado</span>
                      <span>Importe</span>
                      <span>Acciones</span>
                    </div>
                    {pendingHomeOrders.length ? (
                      pendingHomeOrders.map((order) => {
                        const client = homeClients.find(
                          (item) => Number(item.id) === Number(order.client_id),
                        );
                        return (
                          <div className="pending-order-row" key={order.id}>
                            <span className="pending-order-code">{order.code}</span>
                            <span>{client?.name || `Cliente ${order.client_id || "sin asignar"}`}</span>
                            <span>
                              {order.created_at
                                ? new Date(order.created_at).toLocaleString("es-ES", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Sin fecha"}
                            </span>
                            <span>{order.delivery_date || "Sin fecha"}</span>
                            <b>{order.status || "Pendiente"}</b>
                            <strong>
                              {Number(order.amount || 0).toLocaleString("es-ES", {
                                style: "currency",
                                currency: "EUR",
                              })}
                            </strong>
                            {renderHomeOrderActions(order)}
                          </div>
                        );
                      })
                    ) : (
                      <p className="muted pending-orders-empty">No hay pedidos pendientes en este periodo.</p>
                    )}
                  </div>
                )}
              </section>
              {[
                ["Preparando", "Pedidos en preparación"],
                ["Preparado", "Pedidos preparados"],
                ["Preparado con incidencia", "Pedidos con incidencia"],
                ["En reparto", "Pedidos en ruta"],
                ["Entregado", "Pedidos entregados"],
              ].map(([status, title]) => {
                const statusOrders = homePreparationStatusRows(status);
                const open = openOrderStatus === status;
                return (
                  <section className={`panel pending-orders-panel${open ? " open" : " collapsed"}`} key={status}>
                    <button
                      type="button"
                      className="pending-orders-head"
                      aria-expanded={open}
                      onClick={() => setOpenOrderStatus(open ? null : status)}
                    >
                      <span>
                        <b>{title}</b>
                        <small>{statusOrders.length} pedidos · más recientes primero</small>
                      </span>
                      <strong>{open ? "⌃" : "⌄"}</strong>
                    </button>
                    {open && (
                      <div className="pending-orders-list">
                        {statusOrders.length ? (
                          statusOrders.map((order) => (
                            <div className="home-step-order-row" key={order.id}>
                              <b>{order.code}</b>
                              <span>
                                {homeClients.find(
                                  (client) => Number(client.id) === Number(order.client_id),
                                )?.name || `Cliente ${order.client_id || "sin asignar"}`}
                              </span>
                              <span>{order.delivery_date || "Sin fecha"}</span>
                              <strong>
                                {Number(order.amount || 0).toLocaleString("es-ES", {
                                  style: "currency",
                                  currency: "EUR",
                                })}
                              </strong>
                              {renderHomeOrderActions(order)}
                            </div>
                          ))
                        ) : (
                          <p className="muted home-step-orders-empty">
                            No hay pedidos en esta etapa dentro del periodo seleccionado.
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
              <div className="panel orders">
                <div className="panel-head">
                  <div>
                    <h2>Accesos rápidos</h2>
                    <p className="muted">Accesos rápidos a la gestión diaria</p>
                  </div>
                </div>
                {(() => {
                  const activityItems = [
                    ["Productos", summary.products, "registros"],
                    ["Clientes", summary.clients, "registros"],
                    ["Pedidos", summary.openOrders, "abiertos"],
                    ["Facturas", summary.invoices, "documentos"],
                    ["Albaranes", summary.deliveryNotes, "documentos"],
                    ["Cobros", summary.payments, "movimientos"],
                    ["Informes", summary.reports, "datos"],
                    ["Proveedores", summary.suppliers, "registros"],
                  ];
                  const selected = activityItems.find(([module]) => module === homeActivityTab) || activityItems[0];
                  return (
                    <>
                      <div className="activity-tabs" role="tablist" aria-label="Módulos principales">
                        {activityItems.map(([module, count]: any) => (
                          <button
                            type="button"
                            key={module}
                            role="tab"
                            aria-selected={homeActivityTab === module}
                            className={`${homeActivityTab === module ? "active " : ""}${module === "Pedidos" || module === "Facturas" ? "shortcut-alert" : ""}`}
                            onClick={() => {
                              setHomeActivityTab(module);
                              setActive(module);
                            }}
                          >
                            <b>{module}</b><strong>{count}</strong>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className={`activity-tab-content${selected[0] === "Pedidos" || selected[0] === "Facturas" ? " shortcut-alert" : ""}`}
                        onClick={() => setActive(selected[0] as string)}
                      >
                        <div className="shortcut-title">
                          <b>{selected[0]}</b>
                          <strong>{selected[1]}</strong>
                        </div>
                        <span>
                          {selected[1] ? `${selected[1]} ${selected[2]}` : "Sin registros"} · Gestionar →
                        </span>
                      </button>
                    </>
                  );
                })()}
              </div>
              <div className="panel important-notes">
                <div className="panel-head">
                  <div>
                    <h2>Notas importantes</h2>
                    <p className="muted">Avisos y tareas pendientes para hoy</p>
                  </div>
                  <div>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setHomeNoteModalOpen(true)}
                    >
                      + Nueva nota
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setActive("Notas")}
                    >
                      Ver todas
                    </button>
                  </div>
                </div>
                {importantNotes.length ? (
                  <div className="notes-dashboard">
                    {importantNotes.map((note) => (
                      <article
                        key={note.id}
                        className={`${note.priority === "Alta" || note.priority === "Urgente" ? "note-card urgent" : "note-card"}${completingNoteId === note.id ? " note-card-completing" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => openNoteTarget(note)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openNoteTarget(note);
                          }
                        }}
                      >
                        <div>
                          <b>{note.title}</b>
                          <p>{note.content}</p>
                          <small>
                            {note.module || "General"} · Prioridad{" "}
                            {note.priority || "Normal"}
                          </small>
                        </div>
                        {String(note.module || "") !== "Preparación de pedidos" && <button
                          onClick={(event) => { event.stopPropagation(); void completeNote(note); }}
                          aria-label={`Completar nota ${note.title}`}
                          title="Marcar como completada"
                        >
                          <span className="note-check-mark">✓</span>
                        </button>}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="muted empty-row">
                    No hay notas importantes pendientes.
                  </p>
                )}
              </div>
              {homeNoteModalOpen && (
                <div className="home-note-modal-backdrop" role="presentation">
                  <form className="home-note-modal" onSubmit={createHomeNote}>
                    <div className="home-note-modal-head">
                      <div>
                        <b>Nueva nota importante</b>
                        <small>Se mostrará en Inicio y quedará guardada en la base de datos.</small>
                      </div>
                      <button type="button" onClick={() => setHomeNoteModalOpen(false)} aria-label="Cerrar">×</button>
                    </div>
                    <label>Título<input autoFocus value={homeNoteDraft.title} onChange={(event) => setHomeNoteDraft({ ...homeNoteDraft, title: event.target.value })} /></label>
                    <label>Nota<textarea value={homeNoteDraft.content} onChange={(event) => setHomeNoteDraft({ ...homeNoteDraft, content: event.target.value })} /></label>
                    <div className="home-note-modal-fields">
                      <label>Módulo<select value={homeNoteDraft.module} onChange={(event) => setHomeNoteDraft({ ...homeNoteDraft, module: event.target.value })}><option>General</option><option>Pedidos</option><option>Stock</option><option>Envíos</option><option>Clientes</option><option>Compras</option></select></label>
                      <label>Prioridad<select value={homeNoteDraft.priority} onChange={(event) => setHomeNoteDraft({ ...homeNoteDraft, priority: event.target.value })}><option>Normal</option><option>Alta</option><option>Urgente</option></select></label>
                    </div>
                    <div className="home-note-modal-actions"><button type="button" className="button secondary" onClick={() => setHomeNoteModalOpen(false)}>Cancelar</button><button type="submit" className="button primary" disabled={homeNoteSaving}>{homeNoteSaving ? "Guardando…" : "Guardar nota"}</button></div>
                  </form>
                </div>
              )}
            </>
          ) : active === "Promociones web" ? (
            <PublicPromotionsManager user={currentUser} />
          ) : active === "Altas web" ? (
            <WebRegistrationsManager user={currentUser} />
          ) : active === "OCR inteligente" ? (
            <OcrIntelligent user={currentUser} />
          ) : active === "Balance" ? (
            <Balance />
          ) : active === "Contactos" ? (
            <Contacts onNavigate={setActive} />
          ) : active === "Informes" ? (
            <Reports />
          ) : active === "Historial" ? (
            <History />
          ) : active === "Tareas programadas" ? (
            <ScheduledTasks />
          ) : active === "Usuarios y permisos" ? (
            <UsersManager user={currentUser} />
          ) : active === "Compras inteligentes" ? (
            <SmartPurchasing user={currentUser} />
          ) : active === "Papelera" ? (
            <TrashManager user={currentUser} />
          ) : active === "Rutas" ? (
            <RoutesManager user={currentUser} />
          ) : active === "Copias de seguridad" ? (
            <BackupsManager user={currentUser} />
          ) : (
            <Manager
              active={active}
              user={currentUser}
              onNavigate={setActive}
              assistantFormIntent={assistantFormIntent}
              onAssistantFormConsumed={() => setAssistantFormIntent(null)}
            />
          )}
          <footer>
            Exclusivas Inteligentes · Todo en orden para trabajar{" "}
                        <span>● Base de datos sincronizada</span>
          </footer>
        </section>
      </div>
      {webOrderOpen && (
        <ClientOrderPortal
          onClose={() => setWebOrderOpen(false)}
          onCreated={() => {
            window.dispatchEvent(new Event("crm-data-changed"));
          }}
        />
      )}
      {homeNotePreviewLoading && <div className="preview-loading-overlay" role="status">Cargando detalle de la nota…</div>}
      {homeNotePreview && <HomeNotePreviewModal note={homeNotePreview} user={currentUser} onClose={() => setHomeNotePreview(null)} onOpenPreparation={() => { setHomeNotePreview(null); setActive("Preparación de pedidos"); }} onEdit={() => { const id = Number(homeNotePreview.id); setHomeNotePreview(null); setActive("Notas"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("crm:editar-nota", { detail: id })), 160); }} />}
    </main>
  );
}

export default function Home({ routeMode = "crm" }: { routeMode?: keyof typeof routeModuleScopes }) {
  const path = typeof window !== "undefined" ? window.location.pathname.replace(/\/$/, "") : "";
  return path === "/portal-ofertas" ? <SupplierOfferPortal /> : <CrmHome routeMode={routeMode} />;
}
