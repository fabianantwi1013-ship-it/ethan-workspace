/* Preload bridge — runs with Node access, exposes a minimal, explicit API to the
   web app. Phase 1: just a marker so the UI can know it's running on desktop.
   Phase 2 adds storage (SQLite); Phase 5 adds printing/drawer. */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  version: "0.1.0",
  platform: process.platform
});
