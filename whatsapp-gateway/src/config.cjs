const path = require("node:path");

function booleanEnv(name, fallback) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "si", "sí"].includes(value);
}

function positiveNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const root = path.resolve(__dirname, "..");

module.exports = {
  sessionId: String(process.env.OPENWA_SESSION_ID || "exclusivas-inteligentes").trim(),
  headless: booleanEnv("OPENWA_HEADLESS", true),
  useChrome: booleanEnv("OPENWA_USE_CHROME", true),
  executablePath: String(process.env.OPENWA_EXECUTABLE_PATH || "").trim(),
  qrTimeout: positiveNumberEnv("OPENWA_QR_TIMEOUT_SECONDS", 120),
  crmApiBaseUrl: String(process.env.CRM_API_BASE_URL || "http://127.0.0.1:3001/api").replace(/\/$/, ""),
  crmActor: String(process.env.CRM_ACTOR || "WhatsApp · OpenWA").trim(),
  crmApiKey: String(process.env.CRM_API_KEY || "").trim(),
  maxAudioBytes: positiveNumberEnv("MAX_AUDIO_BYTES", 8 * 1024 * 1024),
  sessionsDir: path.join(root, "sessions"),
};
