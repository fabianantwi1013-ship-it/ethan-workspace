/* Preload bridge — runs with Node access, exposes a minimal, explicit API to the
   web app. Phase 2: SQLite-backed storage. Phase 5 adds printing/drawer. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  version: "0.2.0",
  platform: process.platform,
  storage: {
    load: () => ipcRenderer.sendSync("storage:load"),
    save: (blob) => ipcRenderer.send("storage:save", blob),
    pending: () => ipcRenderer.invoke("storage:pending")
  }
});
