require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const toolsDir = path.resolve(__dirname, "..", "tools");
const wmicCompat = path.join(toolsDir, "wmic.exe");
if (fs.existsSync(wmicCompat)) process.env.PATH = `${toolsDir}${path.delimiter}${process.env.PATH || ""}`;

const wa = require("@open-wa/wa-automate");
const config = require("./config.cjs");
const { createCrmClient } = require("./crm-client.cjs");
const { ingestMessage } = require("./ingest.cjs");

const crm = createCrmClient(config);

async function start() {
  console.log(`[OpenWA] Iniciando sesión ${config.sessionId}`);
  console.log(`[OpenWA] CRM: ${config.crmApiBaseUrl}`);
  const client = await wa.create({ sessionId: config.sessionId, multiDevice: true, headless: config.headless, useChrome: config.useChrome, executablePath: config.executablePath || undefined, qrTimeout: config.qrTimeout, authTimeout: 60, cacheEnabled: true });
  client.onStateChanged((state) => console.log(`[OpenWA] Estado: ${state}`));
  client.onMessage(async (message) => {
    try {
      const result = await ingestMessage(client, message, { crm, maxAudioBytes: config.maxAudioBytes });
      if (!result.ignored) console.log(`[OpenWA] Mensaje ${result.messageType} guardado en el CRM`);
    } catch (error) {
      console.error(`[OpenWA] No se pudo guardar el mensaje: ${error?.message || error}`);
    }
  });
  console.log("[OpenWA] Sesión lista. Los mensajes se guardarán como pendientes de interpretación.");
}

start().catch((error) => { console.error(`[OpenWA] Error fatal: ${error?.stack || error}`); process.exitCode = 1; });
