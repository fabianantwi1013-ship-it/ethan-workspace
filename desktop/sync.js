/* Ethan Foods POS — background sync engine (Phase 3).

   Local SQLite is always the source of truth; this engine mirrors it to Supabase.

   PUSH  rows with synced = 0 (the outbox) are upserted to pos_records by uuid.
         Upserts are idempotent — retrying after a dropped connection cannot
         duplicate a sale. A row is only marked synced if it wasn't edited again
         while the push was in flight.
   PULL  rows with server_seq greater than our stored cursor come down in pages.
         Conflict rule: last-write-wins on updated_at; when the local copy loses
         but had unsynced changes, the losing version is kept in conflict_log.
   LOOP  every 30s while the app runs, plus immediately when the renderer reports
         the network came back. Failures back off (1min → 5min) and never crash.

   Config lives in userData/sync-config.json (NOT in the repo): url, anonKey, posKey. */
const fs = require("fs");
const path = require("path");
const storage = require("./storage");

let cfgFile;
let config = null;
let status = { configured: false, online: null, pending: 0, lastSync: null, error: null, running: false };
let timer = null;
let backoffMs = 0;
let onStatusChange = null;

function init(userDataDir, statusCallback) {
  cfgFile = path.join(userDataDir, "sync-config.json");
  onStatusChange = statusCallback || null;
  try { config = JSON.parse(fs.readFileSync(cfgFile, "utf8")); } catch (e) { config = null; }
  status.configured = isConfigured();
  refreshPending();
  timer = setInterval(() => { run("interval"); }, 30000);
  run("startup");
}

function isConfigured() {
  return !!(config && config.url && config.anonKey && config.posKey);
}

function configure(newCfg) {
  config = {
    url: String(newCfg.url || "").trim().replace(/\/+$/, ""),
    anonKey: String(newCfg.anonKey || "").trim(),
    posKey: String(newCfg.posKey || "").trim()
  };
  fs.writeFileSync(cfgFile, JSON.stringify(config, null, 2));
  status.configured = isConfigured();
  status.error = null;
  backoffMs = 0;
  run("configured");
  return status.configured;
}

function getStatus() {
  refreshPending();
  return { ...status };
}

function refreshPending() {
  try { status.pending = storage.pendingCount(); } catch (e) {}
}

function emit() {
  refreshPending();
  if (onStatusChange) onStatusChange({ ...status });
}

function headers() {
  return {
    "apikey": config.anonKey,
    "Authorization": "Bearer " + config.anonKey,
    "x-pos-key": config.posKey,
    "Content-Type": "application/json"
  };
}

let inFlight = null;          // promise of the cycle currently running
async function run(reason) {
  if (!isConfigured()) return;
  // a cycle is already running: wait for it, then run once more so changes made
  // during that cycle aren't stranded until the next interval
  if (inFlight) { await inFlight; if (reason === "interval") return; }
  if (backoffMs && reason === "interval" && Date.now() < backoffMs) return;
  const cycle = cycleOnce();
  inFlight = cycle;
  await cycle;
  inFlight = null;
}

async function cycleOnce() {
  status.running = true;
  emit();
  try {
    await push();
    await pull();
    status.online = true;
    status.error = null;
    status.lastSync = Date.now();
    backoffMs = 0;
  } catch (err) {
    status.online = false;
    status.error = String(err.message || err).slice(0, 200);
    // back off: 1 min after first failure, 5 min after repeated ones
    backoffMs = Date.now() + (backoffMs ? 300000 : 60000);
  }
  status.running = false;
  emit();
}

async function push() {
  const batch = storage.unsyncedRows(400);
  if (!batch.length) return;
  const payload = batch.map(r => ({
    uuid: r.uuid,
    table_name: r.table,
    json: JSON.parse(r.json),
    updated_at: r.updated_at,
    deleted: !!r.deleted,
    device_id: storage.getMeta("device_id")
  }));
  const res = await fetch(config.url + "/rest/v1/pos_records?on_conflict=uuid", {
    method: "POST",
    headers: { ...headers(), "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("push HTTP " + res.status + ": " + (await res.text()).slice(0, 120));
  storage.markSynced(batch);   // only rows unchanged since we read them
}

async function pull() {
  let cursor = Number(storage.getMeta("last_seq") || 0);
  for (;;) {
    const res = await fetch(config.url +
      "/rest/v1/pos_records?select=uuid,table_name,json,updated_at,deleted,device_id,server_seq" +
      "&server_seq=gt." + cursor + "&order=server_seq.asc&limit=500",
      { headers: headers() });
    if (!res.ok) throw new Error("pull HTTP " + res.status + ": " + (await res.text()).slice(0, 120));
    const rows = await res.json();
    if (!rows.length) break;
    storage.applyRemote(rows);
    cursor = rows[rows.length - 1].server_seq;
    storage.setMeta("last_seq", cursor);
    if (rows.length < 500) break;
  }
}

function kick() { backoffMs = 0; return run("kick"); }
function stop() { if (timer) clearInterval(timer); }

module.exports = { init, configure, getStatus, kick, stop };
