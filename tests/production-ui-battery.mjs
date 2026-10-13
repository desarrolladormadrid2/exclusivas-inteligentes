import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseUrl = String(process.env.BASE_URL || "https://crm.desarrolladormadrid.com").replace(/\/$/, "");
const outputDir = process.env.SCREENSHOT_DIR || "tmp/production-ui-battery";
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 441, height: 820 },
];
const routes = [
  { path: "/", label: "inicio", markers: ["Exclusivas"] },
  { path: "/web", label: "web", markers: ["Exclusivas"] },
  { path: "/cliente", label: "cliente", markers: ["Todos tus pedidos online", "Cliente", "Pedidos"] },
  { path: "/portal-pedidos", label: "portal-pedidos", markers: ["Pedidos", "cliente", "Cliente"] },
  { path: "/pwa", label: "pwa", markers: ["¿Dónde vas a trabajar?", "Almacén", "Reparto"] },
  { path: "/comercial", label: "comercial", markers: ["Comercial", "Pedidos", "Iniciar sesión", "Acceso"] },
  { path: "/almacen", label: "almacen", markers: ["Almacén", "Preparación", "Iniciar sesión", "Acceso"] },
  { path: "/reparto", label: "reparto", markers: ["Reparto", "ruta", "Iniciar sesión", "Acceso"] },
  { path: "/crm", label: "crm", markers: ["CRM", "Gestión", "Iniciar sesión", "Acceso"] },
];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    for (const route of routes) {
      const started = performance.now();
      const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(900);
      const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
      const marker = route.markers.find((candidate) => text.toLowerCase().includes(candidate.toLowerCase()));
      const screenshotPath = `${outputDir}/${route.label}-${viewport.name}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      if (!response || response.status() >= 500) throw new Error(`${route.path} devolvió ${response?.status() || "sin respuesta"}`);
      if (!marker) throw new Error(`${route.path} no muestra un marcador esperado (${route.markers.join(", ")})`);
      const elapsed = Number((performance.now() - started).toFixed(1));
      results.push({ route: route.path, viewport: viewport.name, status: "PASS", http: response.status(), marker, elapsed_ms: elapsed, screenshot: screenshotPath });
      console.log(`PASS ${viewport.name} ${route.path} · ${response.status()} · ${elapsed} ms · ${marker}`);
    }
    await page.close();
  }
  console.log(`SUMMARY ${JSON.stringify({ baseUrl, routes: results.length, passed: results.length, failed: 0, screenshots: outputDir })}`);
} finally {
  await browser.close();
}
