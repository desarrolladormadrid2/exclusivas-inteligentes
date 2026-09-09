import { execFileSync } from "node:child_process";

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

export function createRemoteDatabaseSync({ url, authToken }) {
  const endpoint = `${url.replace(/^libsql:/, "https:")}/v2/pipeline`;
  function executeBatch(statements) {
    const body = JSON.stringify({ requests: statements.map(({ sql, args = [] }) => ({ type: "execute", stmt: { sql, args: args.map(encodeValue) } })) });
    const curlBinary = process.platform === "win32" ? "curl.exe" : "curl";
    // No pasar el JSON como argumento: los snapshots pueden ocupar varios MB
    // y Windows limita el tamaño total de la línea de comandos (E2BIG).
    const output = execFileSync(curlBinary, ["-sS", "--fail-with-body", "--connect-timeout", "10", "--max-time", "90", "-X", "POST", endpoint, "-H", `Authorization: Bearer ${authToken}`, "-H", "Content-Type: application/json", "--data-binary", "@-"], { input: body, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const payload = JSON.parse(output);
    const results = payload.results || [];
    for (const item of results) {
      if (!item || item.type !== "ok") throw new Error(item?.error?.message || "Turso no ha devuelto una respuesta válida");
      if (item.response?.result?.type === "error") throw new Error(item.response.result.error?.message || "Error SQL en Turso");
    }
    return results.map((item) => item.response?.result || {});
  }
  function execute(sql, args = []) {
    return executeBatch([{ sql, args }])[0] || {};
  }
  function rowsFrom(result) {
    const columns = (result.cols || []).map((column) => column.name);
    return (result.rows || []).map((row) => Object.fromEntries(columns.map((column, index) => [column, decodeValue(row[index])])))
  }
  return {
    batch(statements) {
      return executeBatch(statements).map(rowsFrom);
    },
    exec(sql) {
      const executable = [];
      for (const statement of splitStatements(sql)) {
        // El esquema se migra de forma controlada. Los índices, en cambio,
        // se pueden asegurar en cada inicio porque usan IF NOT EXISTS y son
        // los que aceleran las búsquedas habituales del CRM.
        // Las migraciones se ejecutan de forma puntual, no en cada petición.
        // Repetir ALTER/índices contra Turso ralentiza el arranque y puede
        // provocar un timeout de la función serverless.
        if (/^(PRAGMA|CREATE\s+TABLE|CREATE\s+TRIGGER|CREATE\s+INDEX|ALTER\s+TABLE|DROP\s+(TABLE|INDEX|TRIGGER))/i.test(statement)) continue;
        executable.push({ sql: statement });
      }
      if (executable.length) executeBatch(executable);
    },
    prepare(sql) {
      return {
        all(...args) { return rowsFrom(execute(sql, args)); },
        get(...args) { return rowsFrom(execute(sql, args))[0]; },
        run(...args) {
          const result = execute(sql, args);
          return { changes: Number(result.affected_row_count || 0), lastInsertRowid: result.last_insert_rowid == null ? 0 : Number(result.last_insert_rowid) };
        },
      };
    },
  };
}
