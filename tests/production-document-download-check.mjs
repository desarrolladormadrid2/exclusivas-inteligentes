import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.BASE_URL || 'https://exclusivas-inteligentes.vercel.app';
const screenshotDir = path.join(process.cwd(), 'tests', 'screenshots');
await fs.mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
  const password = page.locator('input[type="password"]').first();
  if (await password.count()) {
    await password.fill('Temporal2026');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForTimeout(3500);
  }
  const adminGroup = page.getByRole('button', { name: 'Configuración', exact: true }).last();
  if (await adminGroup.count()) {
    await adminGroup.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await adminGroup.click();
  }
  await page.getByRole('button', { name: 'Documentos', exact: true }).last().click();
  await page.waitForFunction(() => !document.body.innerText.includes('Cargando datos desde la base de datos') && !document.body.innerText.includes('Cargando registros'), { timeout: 30000 }).catch(() => {});
  const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Abrir documento', exact: true }) }).first();
  await row.getByRole('button', { name: 'Abrir documento', exact: true }).click();
  await page.waitForTimeout(400);
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.getByRole('button', { name: 'Descargar texto', exact: true }).click();
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  await page.screenshot({ path: path.join(screenshotDir, 'production-document-download-success.png'), fullPage: false });
  console.log(`PASS production document download: ${suggested}`);
} catch (error) {
  await page.screenshot({ path: path.join(screenshotDir, 'production-document-download-failed.png'), fullPage: false }).catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
