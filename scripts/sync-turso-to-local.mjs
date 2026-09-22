import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@libsql/client";

const root = process.cwd();
const dataDir = path.join(root, "data");
const targetPath = path.join(dataDir, "excluvas.sqlite");
const envPath = process.env.SYNC_ENV_FILE || path.join(root, ".env.local");
const dryRun = process.argv.includes("--dry-run");

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, "utf8").split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf("=");
    if (separator <= 0) return [];
    return [[line.slice(0, separator).trim(), line.slice(separator + 1).trim()]];
  }));
}

const env = { ...readEnv(envPath), ...process.env };
if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
  throw new Error(`Faltan TURSO_DATABASE_URL/TURSO_AUTH_TOKEN en ${envPath}`);
}

const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const asValue = (value) => value instanceof Uint8Array ? Buffer.from(value) : value instanceof ArrayBuffer ? Buffer.from(value) : value;

async function remoteRows(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows.map((row) => ({ ...row }));
}

async function loadSchema() {
  const rows = await remoteRows("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END, name");
  return rows.filter((row) => row.type === "table" || row.type === "index" || row.type === "trigger");
}

async function tableRows(table) {
  const columns = await remoteRows(`PRAGMA table_info(${quote(table)})`);
  const names = columns.map((row) => String(row.name));
  const rows = await remoteRows(`SELECT * FROM ${quote(table)}`);
  return { names, rows };
}

function rowValues(row, columns) {
  return columns.map((column) => asValue(row[column]));
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  const schema = await loadSchema();
  const tables = schema.filter((row) => row.type === "table").map((row) => String(row.name));
  const counts = {};
  for (const table of tables) counts[table] = Number((await remoteRows(`SELECT COUNT(*) AS count FROM ${quote(table)}`))[0]?.count || 0);
  if (dryRun) {
    await client.close();
    console.log(JSON.stringify({ ok: true, dry_run: true, tables: tables.length, counts }, null, 2));
    return;
  }

  const tempPath = `${targetPath}.sync-${process.pid}-${Date.now()}`;
  const local = new DatabaseSync(tempPath);
  local.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=OFF; PRAGMA foreign_keys=OFF;");
  const tableSql = schema.filter((row) => row.type === "table");
  for (const row of tableSql) local.exec(String(row.sql));

  for (const table of tables) {
    const { names, rows } = await tableRows(table);
    if (!rows.length) continue;
    const placeholders = names.map(() => "?").join(",");
    const insert = local.prepare(`INSERT INTO ${quote(table)} (${names.map(quote).join(",")}) VALUES (${placeholders})`);
    local.exec("BEGIN");
    try {
      for (const row of rows) insert.run(...rowValues(row, names));
      local.exec("COMMIT");
    } catch (error) {
      try { local.exec("ROLLBACK"); } catch {}
      throw new Error(`No se pudo copiar ${table}: ${error.message}`);
    }
  }
  for (const row of schema.filter((entry) => entry.type === "index" || entry.type === "trigger")) {
    try { local.exec(String(row.sql)); } catch (error) { throw new Error(`No se pudo crear ${row.type} ${row.name}: ${error.message}`); }
  }
  local.exec("PRAGMA foreign_keys=ON; PRAGMA optimize;");
  local.close();
  await client.close();

  const backupPath = fs.existsSync(targetPath) ? `${targetPath}.before-sync-${new Date().toISOString().replaceAll(/[:.]/g, "-")}` : null;
  if (backupPath) fs.renameSync(targetPath, backupPath);
  fs.renameSync(tempPath, targetPath);
  console.log(JSON.stringify({ ok: true, target: targetPath, backup: backupPath, tables: tables.length, counts }, null, 2));
}

main().catch(async (error) => {
  try { await client.close(); } catch {}
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
