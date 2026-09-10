import { workerData } from "node:worker_threads";
import https from "node:https";

const { url, authToken, ctrl, reqData, resData, CHUNK_SIZE, initialSeq } = workerData;
const agent = new https.Agent({ keepAlive: true, maxSockets: 4, timeout: 25000 });
const endpoint = String(url).replace(/^libsql:/, "https:") + "/v2/pipeline";
let lastReq = initialSeq;
Atomics.store(ctrl, 4, 1);
Atomics.notify(ctrl, 4);

function post(payloadJson) {
  return new Promise((resolve) => {
    const req = https.request(endpoint, {
      method: "POST",
      agent,
      headers: { Authorization: "Bearer " + authToken, "Content-Type": "application/json" },
      timeout: 25000,
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 300) return resolve({ ok: false, error: "Turso HTTP " + res.statusCode + ": " + data.slice(0, 200) });
        try { resolve({ ok: true, payload: JSON.parse(data) }); }
        catch (e) { resolve({ ok: false, error: "Turso: respuesta no JSON (" + e.message + ")" }); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("Turso: timeout de red")));
    req.on("error", (e) => resolve({ ok: false, error: "Turso: " + e.message }));
    req.write(payloadJson);
    req.end();
  });
}

while (true) {
  Atomics.store(ctrl, 5, (Atomics.load(ctrl, 5) + 1) % 1000000000);
  Atomics.wait(ctrl, 0, lastReq, 10000);
  const seen = Atomics.load(ctrl, 0);
  lastReq = seen;
  const len = Atomics.load(ctrl, 1);
  if (len <= 0 || len > CHUNK_SIZE) continue;
  const reqJson = Buffer.from(reqData.buffer, reqData.byteOffset, len).toString("utf8");
  const out = await post(reqJson);
  const payloadOut = JSON.stringify(out);
  const outBytes = Buffer.from(payloadOut, "utf8");
  if (outBytes.length > CHUNK_SIZE) {
    const oversized = Buffer.from(JSON.stringify({ ok: false, error: "Turso: respuesta demasiado grande" }), "utf8");
    resData.set(oversized);
    Atomics.store(ctrl, 3, oversized.length);
  } else {
    resData.set(outBytes);
    Atomics.store(ctrl, 3, outBytes.length);
  }
  Atomics.store(ctrl, 2, seen);
  Atomics.notify(ctrl, 2);
}