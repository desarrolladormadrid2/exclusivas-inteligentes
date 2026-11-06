import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.BASE_URL || "https://exclusivas-inteligentes.vercel.app";
const screenshotDir = path.join(process.cwd(), "tests", "screenshots");
await fs.mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

const sections = [
  ["Envíos", "Envíos"], ["Clientes", "Clientes"], ["Contactos", "Contactos"], ["Pedidos", "Pedidos"],
  ["Presupuestos", "Presupuestos"], ["Albaranes", "Albaranes"], ["Facturas", "Facturas"], ["Cobros", "Cobros"],
  ["Productos", "Productos"], ["Stock", "Stock y movimientos"], ["Almacenes", "Almacenes"],
  ["Preparación de pedidos", "Preparación de pedidos"], ["Lugares de recogida", "Lugares de recogida"],
  ["Entradas", "Entradas"], ["Salidas", "Salidas"], ["Devoluciones", "Devoluciones"], ["Proveedores", "Proveedores"],
  ["Compras", "Compras"], ["Compras inteligentes", "Compras inteligentes"], ["Gastos y tickets", "Gastos y tickets"],
  ["Balance", "Balance"], ["Informes", "Informes"], ["Tareas programadas", "Tareas programadas"],
  ["Notas", "Notas"], ["Historial", "Historial"], ["Usuarios y permisos", "Usuarios y permisos"],
  ["Papelera", "Papelera"], ["Documentos", "Documentos"],
];
const sectionGroups = { Balance: "Análisis y control", Informes: "Análisis y control", "Tareas programadas": "Automatización", Notas: "Automatización", "Usuarios y permisos": "Configuración", Papelera: "Configuración", Documentos: "Configuración", Historial: "Configuración" };

async function waitForData() {
  await page.waitForFunction(() => !document.body.innerText.includes("Actualizando datos") && !document.body.innerText.includes("Cargando datos desde la base de datos"), { timeout: 25000 }).catch(() => undefined);
  await page.waitForTimeout(700);
}

try {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
  const password = page.locator('input[type="password"]').first();
  if (await password.count()) {
    await password.fill("Temporal2026");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByText("Panel principal", { exact: true }).waitFor({ state: "visible", timeoutMs: 30000 });
  }
  await waitForData();
  await page.screenshot({ path: path.join(screenshotDir, "production-sections-home.png"), fullPage: false });

  for (const [label, heading] of sections) {
    let button = page.getByRole("button", { name: label, exact: true }).last();
    if (!(await button.count()) && sectionGroups[label]) {
      const groupButton = page.getByRole("button", { name: sectionGroups[label], exact: true }).last();
      if (await groupButton.count()) {
        await groupButton.evaluate((element) => element.scrollIntoView({ block: "center" }));
        await groupButton.click();
        await page.waitForTimeout(200);
        button = page.getByRole("button", { name: label, exact: true }).last();
      }
    }
    if (!(await button.count())) throw new Error(`No existe el acceso a ${label}`);
    await button.click();
    await waitForData();
    const body = await page.locator("body").innerText();
    if (!body.includes(heading)) throw new Error(`${label} no muestra la cabecera esperada: ${heading}`);
    if (body.includes("NaN") || body.includes("[object Object]")) throw new Error(`${label} contiene datos inválidos`);
    if (["Productos", "Pedidos", "Preparación de pedidos", "Documentos"].includes(label)) {
      await page.screenshot({ path: path.join(screenshotDir, `production-sections-${label.toLowerCase().replaceAll(" ", "-")}.png`), fullPage: false });
    }
    console.log(`PASS section ${label}`);
  }

  const documentRows = page.getByRole("row");
  if (await documentRows.count() > 1) {
    await documentRows.nth(1).getByRole("button", { name: "Abrir documento", exact: true }).click();
    await page.waitForTimeout(350);
    const preview = page.locator(".document-sheet pre").first();
    const previewText = await preview.innerText();
    if (!previewText.length || !previewText.includes("\n") || previewText.includes("\\n")) throw new Error("La previsualización de documentos no conserva los saltos de línea");
    await page.screenshot({ path: path.join(screenshotDir, "production-document-template-preview.png"), fullPage: false });
    await page.getByRole("button", { name: "Cerrar", exact: true }).first().click();
    console.log("PASS document template preview: content and line breaks");
  }

  const products = page.getByRole("button", { name: "Productos", exact: true }).last();
  await products.click();
  await waitForData();
  const search = page.getByPlaceholder(/Buscar por nombre, SKU/i).first();
  if (await search.count()) {
    await search.fill("Agua Tónica Mediterránea");
    await page.waitForTimeout(700);
    const filtered = await page.locator("body").innerText();
    if (!filtered.includes("Agua Tónica Mediterránea")) throw new Error("La búsqueda de productos no devuelve el producto esperado");
  }
  const labelButton = page.getByRole("button", { name: "Etiqueta y códigos", exact: true }).first();
  if (!(await labelButton.count())) throw new Error("No se puede abrir la etiqueta del producto filtrado");
  await labelButton.click();
  await page.waitForTimeout(700);
  const svgDownload = page.locator('a[download$="-barras.svg"]').first();
  const qrDownload = page.locator('a[download$="-qr.png"]').first();
  const svgHref = await svgDownload.getAttribute("href");
  const qrHref = await qrDownload.getAttribute("href");
  if (!svgHref?.startsWith("data:image/svg+xml")) throw new Error("El código de barras no ofrece un SVG descargable");
  if (!qrHref?.startsWith("data:image/png")) throw new Error("El QR no ofrece un PNG descargable");
  await page.screenshot({ path: path.join(screenshotDir, "production-product-label.png"), fullPage: false });
  await page.getByRole("button", { name: "Cerrar", exact: true }).last().click();
  console.log("PASS product label downloads: SVG barcode + PNG QR");
  if (errors.length) throw new Error(`Errores de consola: ${errors.join(" | ")}`);
  console.log(`PASS production sections: ${sections.length} · search · console clean`);
} catch (error) {
  await page.screenshot({ path: path.join(screenshotDir, "production-sections-failed.png"), fullPage: false }).catch(() => undefined);
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
