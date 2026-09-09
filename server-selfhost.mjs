import http from "node:http";
import { crmApiHandler } from "./api/crm-api.mjs";
import appHandler from "./api/index.mjs";

const host = String(process.env.HOST || "127.0.0.1").trim();
const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`PORT no válido: ${process.env.PORT}`);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/")) return await crmApiHandler(req, res);
    return await appHandler(req, res);
  } catch (error) {
    console.error("[selfhost] Error de petición", error);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Error interno del servidor" }));
  }
});

server.listen(port, host, () => {
  console.log(`Exclusivas Inteligentes self-hosted en http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`[selfhost] Cerrando por ${signal}`);
  server.close(() => process.exit(0));
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
