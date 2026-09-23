import { spawn } from "node:child_process";
import process from "node:process";

const port = Number(process.env.BENCHMARK_PORT || 3311);
const rounds = Math.max(3, Number(process.env.BENCHMARK_ROUNDS || 5));
const benchmarkDate = /^\d{4}-\d{2}-\d{2}$/.test(String(process.env.BENCHMARK_DATE || ""))
  ? String(process.env.BENCHMARK_DATE)
  : new Date().toISOString().slice(0, 10);
const modes = ["local", "remote"];
const cases = [
  { section: "Inicio", name: "Resumen del dashboard", path: `/api/summary?from=${benchmarkDate}&to=${benchmarkDate}` },
  { section: "Pedidos", name: "Pedidos para preparar", path: `/api/orders?preparation_date=${benchmarkDate}&limit=5000` },
  { section: "Preparación", name: "Envíos del día", path: `/api/shipments?date=${benchmarkDate}&limit=5000` },
  { section: "Preparación", name: "Todas las líneas y lotes", path: "/api/order_lines?limit=5000" },
  { section: "Clientes", name: "Clientes con saldo pendiente", path: "/api/clients?limit=5000" },
  { section: "Productos", name: "Catálogo para selección", path: "/api/products?view=lookup&limit=2000" },
  { section: "Almacén", name: "Stock disponible", path: "/api/stock" },
  { section: "Almacén", name: "Entradas y diferencias", path: "/api/goods_receipts?limit=500" },
  { section: "Carga", name: "Rutas del día con paradas", path: `/api/routes?date=${benchmarkDate}` },
  { section: "Reparto", name: "Kilómetros de vehículos", path: `/api/vehicle_trips?date=${benchmarkDate}` },
  { section: "Cierre diario", name: "Cierres y cobros", path: `/api/driver_daily_closures?date=${benchmarkDate}` },
  { section: "Facturación", name: "Pedidos pendientes de facturar", path: `/api/billing?from=${benchmarkDate}&to=${benchmarkDate}` },
  { section: "Facturación", name: "Facturas", path: "/api/invoices?limit=5000" },
  { section: "Cobros", name: "Pagos", path: "/api/payments?limit=5000" },
  { section: "Gastos", name: "Gastos para el cierre", path: "/api/expenses?view=lookup&limit=500" },
  { section: "Auditoría", name: "Histórico de actividad", path: "/api/audit_logs?limit=500" },
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

function refreshPath(pathname, round) {
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}refresh=benchmark-${Date.now()}-${round}`;
}

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

async function measure(test) {
  const values = [];
  let bytes = 0;
  for (let index = 0; index < rounds; index += 1) {
    const started = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}${refreshPath(test.path, index)}`, {
      headers: { "X-Audit-Query": "false" },
    });
    const body = await response.arrayBuffer();
    if (!response.ok) throw new Error(`${test.path} respondió ${response.status}`);
    values.push(performance.now() - started);
    bytes = body.byteLength;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const round = (value) => Math.round(value * 10) / 10;
  return {
    avg_ms: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    median_ms: round(percentile(sorted, 0.5)),
    p95_ms: round(percentile(sorted, 0.95)),
    response_bytes: bytes,
  };
}

function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 5000).unref();
  });
}

const report = { generated_at: new Date().toISOString(), benchmark_date: benchmarkDate, rounds, cases, modes: {}, comparison: [] };
for (const mode of modes) {
  const child = start(mode);
  try {
    await waitForServer();
    report.modes[mode] = {};
    for (const test of cases) report.modes[mode][test.path] = await measure(test);
  } finally {
    await stop(child);
  }
}

for (const test of cases) {
  const local = report.modes.local[test.path];
  const remote = report.modes.remote[test.path];
  const saving = remote.avg_ms > 0 ? ((remote.avg_ms - local.avg_ms) / remote.avg_ms) * 100 : 0;
  report.comparison.push({
    section: test.section,
    name: test.name,
    path: test.path,
    local_avg_ms: local.avg_ms,
    remote_avg_ms: remote.avg_ms,
    local_faster_percent: Math.round(saving * 10) / 10,
    remote_p95_ms: remote.p95_ms,
  });
}
report.comparison.sort((a, b) => b.remote_avg_ms - a.remote_avg_ms);
console.log(JSON.stringify(report, null, 2));
