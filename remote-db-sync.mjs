import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

// Capa de acceso síncrono a Turso para entornos que no pueden usar async.
// Cada operación SQL se resuelve en un worker que mantiene una conexión HTTPS
// persistente (keep-alive) con el pipeline v2 de Turso. El hilo principal
// espera el resultado con Atomics.wait, como exige la API síncrona del CRM.
// Frente a la versión anterior (execFileSync + curl.exe nuevo por consulta,
// que congelaba el event loop ~1s por SQL), esto reutiliza una única conexión
// TLS y evita el coste de arrancar un subproceso por cada petición.

const CTRL_SLOTS = 6;
const HEADER_BYTES = CTRL_SLOTS * 4;
const CHUNK_SIZE = 24 * 1024 * 1024; // hasta 24MB por petición/respuesta (snapshots)
const shared = new SharedArrayBuffer(HEADER_BYTES + CHUNK_SIZE + CHUNK_SIZE);
const ctrl = new Int32Array(shared, 0, CTRL_SLOTS); // 0 reqSeq, 1 reqLen, 2 resSeq, 3 resLen, 4 ready, 5 alive
const reqData = new Uint8Array(shared, HEADER_BYTES, CHUNK_SIZE);
const resData = new Uint8Array(shared, HEADER_BYTES + CHUNK_SIZE, CHUNK_SIZE);

let worker = null;
let workerDead = false;
let dbUrl = "";
let dbToken = "";

function workerSource() {
  return fileURLToPath(new URL("./remote-db-worker.mjs", import.meta.url));
}

function terminateWorker() {
  try { if (worker) worker.terminate(); } catch {}
  worker = null;
  workerDead = false;
  Atomics.store(ctrl, 4, 0);
}

function ensureWorker() {
  if (worker) return;
  Atomics.store(ctrl, 4, 0);
  if (Atomics.load(ctrl, 0) >= 2147483600) Atomics.store(ctrl, 0, 0);
  const initialSeq = Atomics.load(ctrl, 0);
  worker = new Worker(workerSource(), {
    workerData: {
      url: dbUrl,
      authToken: dbToken,
      ctrl,
      reqData,
      resData,
      CHUNK_SIZE,
      initialSeq,
    },
  });
  worker.on("error", () => { workerDead = true; });
  worker.on("exit", () => { workerDead = true; });
  worker.unref();
  const deadline = Date.now() + 5000;
  while (Atomics.load(ctrl, 4) !== 1) {
    Atomics.wait(ctrl, 4, 0, 100);
    if (workerDead || Date.now() > deadline) {
      terminateWorker();
      throw new Error("No se pudo iniciar el worker de Turso");
    }
  }
}

function executeBatch(statements) {
  if (!dbUrl || !dbToken) throw new Error("Turso no configurado (TURSO_DATABASE_URL/TURSO_AUTH_TOKEN)");
  const body = JSON.stringify({ requests: statements.map(({ sql, args = [] }) => ({ type: "execute", stmt: { sql, args: args.map(encodeValue) } })) });
  const bytes = Buffer.from(body, "utf8");
  if (bytes.length > CHUNK_SIZE) throw new Error("Consulta demasiado grande para Turso");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    ensureWorker();
    try {
      return executeBatchOnce(bytes);
    } catch (error) {
      if (!workerDead && !String(error.message).includes("Worker no responde")) throw error;
      terminateWorker();
      if (attempt === 1) throw error;
    }
  }
  throw new Error("No se pudo ejecutar la consulta en Turso");
}

function executeBatchOnce(bytes) {
  Atomics.store(ctrl, 2, -1);
  reqData.set(bytes);
  Atomics.store(ctrl, 1, bytes.length);
  Atomics.add(ctrl, 0, 1);
  const seq = Atomics.load(ctrl, 0);
  Atomics.notify(ctrl, 0);
  const started = Date.now();
  while (true) {
    Atomics.wait(ctrl, 2, -1, 500);
    if (Atomics.load(ctrl, 2) === seq) break;
    if (workerDead || Date.now() - started > 120000) {
      throw new Error("Worker no responde");
    }
  }
  const resLen = Atomics.load(ctrl, 3);
  const resText = Buffer.from(resData.buffer, resData.byteOffset, resLen).toString("utf8");
  const res = JSON.parse(resText);
  if (!res.ok) throw new Error(res.error || "Turso no ha devuelto una respuesta válida");
  const results = res.payload.results || [];
  for (const item of results) {
    if (!item || item.type !== "ok") throw new Error(item?.error?.message || "Turso no ha devuelto una respuesta válida");
    if (item.response?.result?.type === "error") throw new Error(item.response.result.error?.message || "Error SQL en Turso");
  }
  return results.map((item) => item.response?.result || {});
}

function decodeValue(value) {
  if (value == null || typeof value !== "object") return value;
  if (value.type === "null") return null;
  if (value.type === "integer" || value.type === "float") return Number(value.value);
  if (value.type === "blob") return Buffer.from(value.value, "base64");
  return value.value;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "bigint") return { type: "integer", value: String(value) };
  if (typeof value === "number") return Number.isInteger(value) ? { type: "integer", value: String(value) } : { type: "float", value };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { type: "blob", base64: Buffer.from(value).toString("base64") };
  return { type: "text", value: String(value) };
}

function splitStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    if (quote) {
      if (char === quote && sql[index + 1] === quote) index += 1;
      else if (char === quote) quote = null;
    } else if (char === "'" || char === '"' || char === "`") quote = char;
    else if (char === ";") {
      if (sql.slice(start, index).trim()) statements.push(sql.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (sql.slice(start).trim()) statements.push(sql.slice(start).trim());
  return statements;
}

function rowsFrom(result) {
  const columns = (result.cols || []).map((column) => column.name);
  return (result.rows || []).map((row) => Object.fromEntries(columns.map((column, index) => [column, decodeValue(row[index])])))
}

export function createRemoteDatabaseSync({ url, authToken }) {
  dbUrl = url;
  dbToken = authToken;
  return {
    batch(statements) {
      return executeBatch(statements).map(rowsFrom);
    },
    exec(sql) {
      const executable = [];
      for (const statement of splitStatements(sql)) {
        // El esquema se migra de forma controlada. Los índices, en cambio,
        // se aseguran en cada inicio con IF NOT EXISTS.
        if (/^(PRAGMA|CREATE\s+TABLE|CREATE\s+TRIGGER|CREATE\s+INDEX|ALTER\s+TABLE|DROP\s+(TABLE|INDEX|TRIGGER))/i.test(statement)) continue;
        executable.push({ sql: statement });
      }
      if (executable.length) executeBatch(executable);
    },
    prepare(sql) {
      return {
        all(...args) { return rowsFrom(executeBatch([{ sql, args }])[0]); },
        get(...args) { return rowsFrom(executeBatch([{ sql, args }])[0])[0]; },
        run(...args) {
          const result = executeBatch([{ sql, args }])[0];
          return { changes: Number(result.affected_row_count || 0), lastInsertRowid: result.last_insert_rowid == null ? 0 : Number(result.last_insert_rowid) };
        },
      };
    },
  };
}