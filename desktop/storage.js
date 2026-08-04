/* Ethan Foods POS — local SQLite storage (Phase 2).

   The web app keeps one in-memory object: { clients[], sales[], issues[], nextNo… }.
   Here that object is decomposed into row-level tables so Phase 3 can sync per record:

     clients / sales / issues:
       id         local numeric id (what the UI references)
       uuid       globally unique identity — generated once, used for cloud sync
       json       the record itself (uuid excluded, so diffing stays stable)
       updated_at ms timestamp of last local change
       deleted    tombstone (rows are never hard-deleted, so deletions sync too)
       synced     0 = waiting to be pushed to the cloud (the "outbox" flag)

     meta: counters (nextNo/nextInv/nextReceipt), device_id, sync bookkeeping.

   save(blob) diffs incoming records against stored json: only rows that actually
   changed are rewritten and marked unsynced. */
const path = require("path");
const crypto = require("crypto");

const TABLES = ["clients", "sales", "issues"];
const COUNTERS = ["nextNo", "nextInv", "nextReceipt"];
let db;

function init(dirOverride) {
  const Database = require("better-sqlite3");
  const dir = dirOverride || require("electron").app.getPath("userData");
  const file = path.join(dir, "ethan-pos.db");
  db = new Database(file);
  db.pragma("journal_mode = WAL");

  for (const t of TABLES) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${t} (
      id INTEGER PRIMARY KEY,
      uuid TEXT UNIQUE NOT NULL,
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      synced INTEGER NOT NULL DEFAULT 0
    )`);
  }
  db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)");
  if (!getMeta("device_id")) setMeta("device_id", crypto.randomUUID());
  return file;
}

function getMeta(key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value : null;
}
function setMeta(key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) " +
             "ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value));
}

/* record -> canonical json WITHOUT uuid (uuid lives in its own column;
   keeping it out of the payload makes renderer/db comparisons stable) */
function canonicalJson(rec) {
  const copy = JSON.parse(JSON.stringify(rec));
  delete copy.uuid;
  return JSON.stringify(copy);
}

/* Rebuild the app's single blob from rows. Returns null when totally empty
   (renderer then falls back to localStorage migration or seed data). */
function load() {
  let empty = true;
  const out = {};
  for (const t of TABLES) {
    out[t] = db.prepare(`SELECT id, uuid, json FROM ${t} WHERE deleted = 0 ORDER BY id`).all()
      .map(r => {
        const rec = JSON.parse(r.json);
        rec.id = r.id;
        rec.uuid = r.uuid;
        return rec;
      });
    if (out[t].length) empty = false;
  }
  for (const k of COUNTERS) {
    const v = getMeta(k);
    if (v !== null) { out[k] = Number(v); empty = false; }
  }
  return empty ? null : out;
}

function save(blob) {
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const t of TABLES) {
      const incoming = Array.isArray(blob[t]) ? blob[t] : [];
      const existing = new Map(
        db.prepare(`SELECT id, uuid, json, deleted FROM ${t}`).all().map(r => [r.id, r]));
      const upsert = db.prepare(
        `INSERT INTO ${t} (id, uuid, json, updated_at, deleted, synced) VALUES (?, ?, ?, ?, 0, 0)
         ON CONFLICT(id) DO UPDATE SET
           json = excluded.json, updated_at = excluded.updated_at, deleted = 0, synced = 0`);
      const seen = new Set();

      for (const rec of incoming) {
        if (typeof rec.id !== "number") continue;
        seen.add(rec.id);
        const prev = existing.get(rec.id);
        const uuid = rec.uuid || (prev && prev.uuid) || crypto.randomUUID();
        const json = canonicalJson(rec);
        if (!prev || prev.json !== json || prev.deleted) upsert.run(rec.id, uuid, json, now);
      }

      // anything stored but no longer in the blob was deleted in the UI → tombstone
      const markDel = db.prepare(
        `UPDATE ${t} SET deleted = 1, synced = 0, updated_at = ? WHERE id = ?`);
      for (const [id, r] of existing) {
        if (!seen.has(id) && !r.deleted) markDel.run(now, id);
      }
    }
    for (const k of COUNTERS) {
      if (blob[k] !== undefined && blob[k] !== null) setMeta(k, blob[k]);
    }
  });
  tx();
}

/* For the sync engine + status chip: how many rows still need pushing. */
function pendingCount() {
  let n = 0;
  for (const t of TABLES) {
    n += db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE synced = 0`).get().c;
  }
  return n;
}

module.exports = { init, load, save, pendingCount, getMeta, setMeta, TABLES };
