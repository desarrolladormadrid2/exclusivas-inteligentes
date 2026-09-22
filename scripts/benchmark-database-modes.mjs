import { spawn } from "node:child_process";
import process from "node:process";

const port = Number(process.env.BENCHMARK_PORT || 3311);
const rounds = Math.max(3, Number(process.env.BENCHMARK_ROUNDS || 5));
const modes = ["local", "remote"];
const endpoints = [
  "/api/clients",
  "/api/products",
  "/api/orders",
  "/api/order_lines",
  "/api/shipments",
  "/api/stock",
  "/api/invoices",
  "/api/payments",
  "/api/vehicles",
  "/api/routes",
];

function start(mode) {
  const child = spawn(process.execPath, ["--env-file-if-exists=.env.local", "server-selfhost.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_MODE: mode, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stderr.write(`[${mode}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${mode}] ${chunk}`));
  return child;
}

async function waitForServer() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/version`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("El servidor de pruebas no respondió en 120 segundos.");
}

async function measure(pathname) {
  const values = [];
  for (let index = 0; index < rounds; index += 1) {
    const started = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { headers: { "X-Audit-Query": "false" } });
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`${pathname} respondió ${response.status}`);
    values.push(performance.now() - started);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  return {
    avg_ms: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
    median_ms: Math.round(percentile(0.5) * 10) / 10,
    p95_ms: Math.round(percentile(0.95) * 10) / 10,
  };
}

const report = { generated_at: new Date().toISOString(), rounds, modes: {} };
for (const mode of modes) {
  const child = start(mode);
  try {
    await waitForServer();
    report.modes[mode] = {};
    for (const endpoint of endpoints) report.modes[mode][endpoint] = await measure(endpoint);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}
console.log(JSON.stringify(report, null, 2));
