/**
 * Batería autenticada del portal de clientes en producción.
 *
 * Uso:
 *   node tests/production-customer-portal-battery.mjs
 *
 * Crea un alta/pedido identificable, recorre el flujo real en la interfaz y
 * elimina lógicamente los datos operativos al terminar. La solicitud de alta
 * queda cerrada como rechazada en el histórico para conservar trazabilidad;
 * no se envían correos ni se realizan pagos externos.
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseUrl = String(process.env.BASE_URL || "https://crm.desarrolladormadrid.com").replace(/\/$/, "");
const outputDir = process.env.SCREENSHOT_DIR || "tmp/production-customer-portal-battery";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const actor = `PW-CUSTOMER-AUDIT-${suffix}`;
const email = `pw-customer-audit-${suffix}@example.test`;
const password = `Audit-${String(Date.now()).slice(-8)}!`;
const company = `PW-CUSTOMER-AUDIT-${suffix}`;
const deliveryAddress = "Calle Mayor 1";
const deliveryCity = "Palencia";
const screenshots = [];
const results = [];
const startedAt = Date.now();
const created = { registrationId: null, clientId: null, collectionPointId: null, orderId: null, shipmentId: null };
const apiTimings = [];

function api(path) { return `${baseUrl}/api/${String(path).replace(/^\//, "")}`; }
function check(condition, message) { if (!condition) throw new Error(message); }
function recordScreenshot(path) { screenshots.push(path); return path; }
async function readResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: typeof response.status === "function" ? response.status() : response.status, data, bytes: Buffer.byteLength(text) };
}
async function call(path, options = {}, expected = null) {
  const started = performance.now();
  const response = await fetch(api(path), options);
  const elapsed = Number((performance.now() - started).toFixed(1));
  const body = await readResponse(response);
  const wanted = expected === null ? null : (Array.isArray(expected) ? expected : [expected]);
  const expectedFailure = wanted?.includes(response.status);
  if ((!response.ok && !expectedFailure) || (wanted && !wanted.includes(response.status))) {
    throw new Error(`${options.method || "GET"} /api/${path}: ${response.status} en ${elapsed} ms · ${JSON.stringify(body.data).slice(0, 500)}`);
  }
  return { ...body, elapsed };
}
async function get(path, headers = {}) { return (await call(path, { headers })).data; }
async function remove(path) {
  if (!path) return;
  await call(path, { method: "DELETE", headers: { "content-type": "application/json", "x-actor": actor } }, [200, 204, 404]).catch(() => undefined);
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
function getAccessibleName(element) {
  const aria = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby");
  if (aria) return aria;
  const title = element.getAttribute("title");
  if (title) return title;
  const id = element.getAttribute("id");
  if (id) {
    const label = element.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  const parentLabel = element.closest("label");
  if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim();
  return element.textContent?.trim() || element.getAttribute("placeholder") || "";
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 441, height: 820 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors = [];
const httpErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("response", (response) => {
  if (response.url().includes("/api/") && response.status() >= 400) httpErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
});

try {
  await test("versión y activos PWA cliente", async () => {
    const version = await get("version");
    const runtime = await get("runtime/database");
    check(version.ok && version.environment === "production", `Versión no válida: ${JSON.stringify(version)}`);
    check(runtime.source === "SQLite local", `Producción no usa SQLite local: ${JSON.stringify(runtime)}`);
    for (const asset of ["/cliente/sw.js", "/cliente/manifest.webmanifest"]) {
      const response = await fetch(`${baseUrl}${asset}`);
      check(response.ok, `${asset} devuelve ${response.status}`);
    }
    console.log(`  producción ${version.version} · ${runtime.source}`);
  });

  await test("pantalla pública cliente y accesibilidad básica", async () => {
    const response = await page.goto(`${baseUrl}/cliente`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    check(response && response.status() < 500, `/cliente devuelve ${response?.status()}`);
    check((await page.getByRole("heading", { level: 1 }).first().innerText()) === "Todos tus pedidos online", "Título del portal incorrecto");
    const accessibility = await page.evaluate(() => {
      const controls = [...document.querySelectorAll("button, a, input, select, textarea")].filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && !element.hasAttribute("disabled");
      });
      const unnamed = controls.filter((element) => {
        const aria = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title");
        const parentLabel = element.closest("label")?.textContent?.trim();
        return !(aria || parentLabel || element.textContent?.trim() || element.getAttribute("placeholder"));
      });
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      return { controls: controls.length, unnamed: unnamed.length, unnamedHtml: unnamed.slice(0, 5).map((element) => element.outerHTML), tabs: tabs.length, tabsWithState: tabs.filter((tab) => tab.hasAttribute("aria-selected")).length, horizontalOverflow };
    });
    check(!accessibility.unnamed, `Controles sin nombre accesible: ${JSON.stringify(accessibility.unnamedHtml)}`);
    check(accessibility.tabs === 2 && accessibility.tabsWithState === 2, `Pestañas sin estado accesible: ${JSON.stringify(accessibility)}`);
    await page.keyboard.press("Tab");
    check(await page.evaluate(() => document.activeElement && document.activeElement !== document.body), "El teclado no obtiene foco visible");
    check(!accessibility.horizontalOverflow, "La pantalla cliente tiene scroll horizontal en móvil");
    await page.screenshot({ path: recordScreenshot(`${outputDir}/customer-login-mobile.png`), fullPage: true });
  });

  await test("registro real de cliente desde la interfaz", async () => {
    await page.getByRole("tab", { name: "Registrarme" }).click();
    await page.getByLabel("Razón social / empresa *").fill(company);
    await page.getByLabel("Nombre comercial *").fill(`Cliente portal ${suffix}`);
    await page.getByLabel("Persona de contacto *").fill("Cliente de auditoría");
    await page.getByLabel("Email *").fill(email);
    await page.getByLabel("Teléfono").fill("600000009");
    await page.getByLabel("Ciudad fiscal").fill(deliveryCity);
    await page.getByLabel("Domicilio fiscal").fill(deliveryAddress);
    await page.getByLabel("Dirección principal de entrega *").fill(deliveryAddress);
    await page.getByLabel("Ciudad de entrega *").fill(deliveryCity);
    await page.getByLabel("Contraseña *", { exact: true }).fill(password);
    await page.getByLabel("Repite la contraseña *", { exact: true }).fill(password);
    await page.getByLabel("¿Qué necesitas?").fill("Prueba autenticada del portal de cliente");
    const registrationResponse = page.waitForResponse((response) => response.url().endsWith("/api/web_registrations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Solicitar registro" }).click();
    const registrationBody = await readResponse(await registrationResponse);
    check(registrationBody.data?.id, `Alta no creada: ${JSON.stringify(registrationBody.data)}`);
    created.registrationId = Number(registrationBody.data.id);
    check([200, 201].includes(registrationBody.status), `Respuesta inesperada al crear el alta: HTTP ${registrationBody.status}`);
    check((await page.getByText("Perfil pendiente de validación").count()) === 1, "No aparece el estado pendiente de validación");
    await page.screenshot({ path: recordScreenshot(`${outputDir}/customer-registration-pending-mobile.png`), fullPage: true });
  });

  await test("bloqueo de acceso mientras el CRM valida la cuenta", async () => {
    const pending = await call("public_login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "cliente", email, password }) }, 403);
    check(pending.data?.code === "ACCOUNT_PENDING", `Respuesta pendiente incorrecta: ${JSON.stringify(pending.data)}`);
    const registrationRows = await get("web_registrations?include_closed=1", { "x-audit-query": "true" });
    const row = registrationRows.find((item) => String(item.email).toLowerCase() === email.toLowerCase());
    check(row && Number(row.id) === created.registrationId && row.status === "Pendiente de validar", "El alta no aparece pendiente en CRM");
  });

  await test("validación desde CRM y creación de dirección geolocalizable", async () => {
    const validated = await call(`web_registrations/${created.registrationId}`, { method: "PUT", headers: { "content-type": "application/json", "x-actor": actor }, body: JSON.stringify({ status: "Validada" }) });
    check(validated.data?.status === "Validada" && validated.data?.crm_record_id, `Validación incorrecta: ${JSON.stringify(validated.data)}`);
    created.clientId = Number(validated.data.crm_record_id);
    const points = await get(`collection_points?refresh=1&limit=5000`);
    const point = points.find((item) => Number(item.client_id) === created.clientId && String(item.address).toLowerCase().includes("calle mayor 1"));
    check(point, "La dirección principal no se creó en Lugares de recogida");
    created.collectionPointId = Number(point.id);
    check(String(point.city).toLowerCase() === deliveryCity.toLowerCase(), "La ciudad de entrega no se conserva");
  });

  let portalToken = "";
  let product = null;
  await test("login autenticado y carga del área de cliente", async () => {
    await page.getByRole("button", { name: "Comprobar acceso" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    const loginResponse = page.waitForResponse((response) => response.url().endsWith("/api/public_login") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Entrar en mi área" }).click();
    const loginBody = await readResponse(await loginResponse);
    check(loginBody.status === 200 && loginBody.data?.portal?.token, `Login no válido: ${JSON.stringify(loginBody.data)}`);
    portalToken = loginBody.data.portal.token;
    await page.waitForSelector(".client-portal-dashboard", { timeout: 30000 });
    check((await page.getByText("Cuenta validada").count()) === 1, "No aparece cuenta validada");
    check((await page.getByText("Mis pedidos").count()) === 1 && (await page.getByText("Mis documentos").count()) === 1, "Faltan paneles del área cliente");
    const dashboardA11y = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth + 1, tabs: [...document.querySelectorAll('[role="tab"]')].map((tab) => ({ selected: tab.getAttribute("aria-selected"), controls: tab.getAttribute("aria-controls") })) }));
    check(!dashboardA11y.overflow, "El área autenticada tiene scroll horizontal en móvil");
    check(dashboardA11y.tabs.length === 2 && dashboardA11y.tabs.every((tab) => tab.selected && tab.controls), `Estado de pestañas autenticadas incorrecto: ${JSON.stringify(dashboardA11y)}`);
    await page.screenshot({ path: recordScreenshot(`${outputDir}/customer-dashboard-mobile.png`), fullPage: true });
  });

  await test("búsqueda de catálogo y creación de pedido desde el portal", async () => {
    const products = await get("products?view=lookup&profile=order&limit=2000");
    product = products.find((item) => Number(item.stock || 0) > 0 && Number(item.unit_price || 0) > 0) || products.find((item) => Number(item.stock || 0) > 0) || products[0];
    check(product?.id && product?.name, "No hay producto utilizable en el catálogo");
    await page.getByRole("tab", { name: "Nuevo pedido" }).click();
    const productInput = page.getByPlaceholder("Buscar producto por nombre, referencia o código…");
    await productInput.fill(String(product.name));
    await page.locator(".product-results button").first().waitFor({ state: "visible", timeout: 10000 });
    await page.locator(".product-results button").first().click();
    await page.getByRole("button", { name: "Añadir" }).click();
    check((await page.locator(".web-order-cart-line").count()) === 1, "El producto no entra en el carrito");
    await page.getByLabel("Notas para el reparto").fill("PW-CUSTOMER-AUDIT · Entrega de prueba");
    const orderResponse = page.waitForResponse((response) => response.url().endsWith("/api/orders") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Enviar pedido al CRM" }).click();
    const orderBody = await readResponse(await orderResponse);
    check(orderBody.status === 201 && orderBody.data?.id, `Pedido no creado: ${JSON.stringify(orderBody.data)}`);
    created.orderId = Number(orderBody.data.id);
    const success = await page.getByText("PEDIDO RECIBIDO").count();
    check(success === 1, "No aparece la confirmación del pedido");
    await page.screenshot({ path: recordScreenshot(`${outputDir}/customer-order-success-mobile.png`), fullPage: true });
  });

  await test("actividad, seguimiento y rendimiento del portal autenticado", async () => {
    const portalHeaders = { authorization: `Bearer ${portalToken}` };
    await page.goto(`${baseUrl}/cliente`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(".client-portal-dashboard", { timeout: 30000 });
    const portalSamples = [];
    const catalogSamples = [];
    for (let index = 0; index < 5; index += 1) {
      const portalResult = await call("public_portal", { headers: portalHeaders });
      portalSamples.push(portalResult.elapsed);
      check(portalResult.data?.profile?.id === created.clientId, "El portal no devuelve el cliente autenticado");
      check(portalResult.data?.orders?.some((order) => Number(order.id) === created.orderId), "El pedido no aparece en Mi actividad");
      const catalogResult = await call("products?view=lookup&profile=order&limit=2000");
      catalogSamples.push(catalogResult.elapsed);
    }
    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const portalLast = await call("public_portal", { headers: portalHeaders });
    apiTimings.push({ endpoint: "/api/public_portal", median_ms: median(portalSamples), max_ms: Math.max(...portalSamples), bytes: portalLast.bytes });
    const catalogLast = await call("products?view=lookup&profile=order&limit=2000");
    apiTimings.push({ endpoint: "/api/products?view=lookup&profile=order", median_ms: median(catalogSamples), max_ms: Math.max(...catalogSamples), bytes: catalogLast.bytes });
    const orderText = await page.locator("body").innerText();
    check(orderText.includes("Mis pedidos") && orderText.includes("PEDIDO"), "La pantalla no conserva la actividad del cliente");
    await page.screenshot({ path: recordScreenshot(`${outputDir}/customer-activity-with-order-mobile.png`), fullPage: true });
    check(!consoleErrors.length, `Errores de consola: ${consoleErrors.slice(0, 3).join(" | ")}`);
    console.log(`  portal benchmark ${JSON.stringify(apiTimings)}`);
  });
} catch (error) {
  process.exitCode = 1;
} finally {
  // Cerrar la solicitud de alta y retirar los datos operativos de la prueba.
  if (created.registrationId) await call(`web_registrations/${created.registrationId}`, { method: "PUT", headers: { "content-type": "application/json", "x-actor": actor }, body: JSON.stringify({ status: "Rechazada", rejection_reason: "Prueba automatizada completada" }) }, [200]).catch(() => undefined);
  if (created.orderId && !created.shipmentId) {
    const shipments = await get("shipments?refresh=1&limit=5000").catch(() => []);
    const testShipment = Array.isArray(shipments) ? shipments.find((row) => Number(row.order_id) === created.orderId) : null;
    if (testShipment?.id) created.shipmentId = Number(testShipment.id);
  }
  if (created.orderId) await remove(`orders/${created.orderId}`);
  if (created.shipmentId) await remove(`shipments/${created.shipmentId}`);
  if (created.collectionPointId) await remove(`collection_points/${created.collectionPointId}`);
  if (created.clientId) await remove(`clients/${created.clientId}`);
  const leaks = [];
  if (created.clientId) {
    const [clients, orders, shipments, points] = await Promise.all([
      get("clients?refresh=1&limit=5000").catch(() => []),
      get("orders?refresh=1&limit=5000").catch(() => []),
      get("shipments?refresh=1&limit=5000").catch(() => []),
      get("collection_points?refresh=1&limit=5000").catch(() => []),
    ]);
    for (const [resource, rows] of [["clients", clients], ["orders", orders], ["shipments", shipments], ["collection_points", points]]) {
      const remaining = Array.isArray(rows) ? rows.filter((row) => JSON.stringify(row).includes(company) || Number(row.client_id) === created.clientId || Number(row.id) === created.clientId).length : 0;
      if (remaining) leaks.push({ resource, remaining });
    }
  }
  await page.close();
  await context.close();
  await browser.close();
  const passed = results.filter((row) => row.status === "PASS").length;
  const failed = results.filter((row) => row.status === "FAIL").length;
  console.log(`SUMMARY ${JSON.stringify({ actor, baseUrl, total_ms: Date.now() - startedAt, passed, failed, results, apiTimings, httpErrors, consoleErrors: consoleErrors.slice(0, 10), screenshots, leaks, registration_historical_record: Boolean(created.registrationId) })}`);
  if (failed || leaks.length || httpErrors.length || consoleErrors.length) process.exitCode = 1;
}
