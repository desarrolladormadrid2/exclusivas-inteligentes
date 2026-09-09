import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import runtime from "../dist/server/index.js";
import { crmApiHandler } from "./crm-api.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(projectRoot, "dist", "client");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function assetPath(requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const relative = decoded.replace(/^\/+/, "");
  const candidate = path.resolve(clientRoot, relative);
  return candidate.startsWith(clientRoot + path.sep) ? candidate : null;
}

const assets = {
  async fetch(request) {
    const url = new URL(request.url);
    const file = assetPath(url.pathname);
    if (!file) return new Response("Not found", { status: 404 });
    try {
      const body = await fs.readFile(file);
      return new Response(body, {
        headers: {
          "content-type": contentTypes[path.extname(file).toLowerCase()] ?? "application/octet-stream",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};

export default async function vercelHandler(req, res) {
  if (req.url?.startsWith("/_next/") || req.url?.startsWith("/favicon")) {
    const response = await assets.fetch(new Request(`https://${req.headers.host ?? "localhost"}${req.url}`));
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    return res.end(Buffer.from(await response.arrayBuffer()));
  }

  if (req.url?.startsWith("/api/")) {
    return crmApiHandler(req, res);
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else if (value !== undefined) headers.set(key, value);
  }

  const body = req.method === "GET" || req.method === "HEAD" ? undefined : req;
  const request = new Request(`https://${req.headers.host ?? "localhost"}${req.url}`, {
    method: req.method,
    headers,
    body,
    duplex: "half",
  });
  const response = await runtime.fetch(request, { ASSETS: assets }, { waitUntil() {}, passThroughOnException() {} });

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (req.method === "HEAD") return res.end();
  res.end(Buffer.from(await response.arrayBuffer()));
}
