/* Preload bridge — runs with Node access, exposes a minimal, explicit API to the
   web app. Phase 2: SQLite storage. Phase 3: sync engine. Phase 5 adds hardware. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  version: "0.3.0",
  platform: process.platform,
  storage: {
    load: () => ipcRenderer.sendSync("storage:load"),
    save: (blob) => ipcRenderer.send("storage:save", blob),
    pending: () => ipcRenderer.invoke("storage:pending")
  },
  hardware: {
    config: () => ipcRenderer.invoke("hw:config"),
    setConfig: (c) => ipcRenderer.invoke("hw:setConfig", c),
    printers: () => ipcRenderer.invoke("hw:printers"),
    print: (doc) => ipcRenderer.invoke("hw:print", doc),
    drawer: () => ipcRenderer.invoke("hw:drawer"),
    test: () => ipcRenderer.invoke("hw:test")
  },
  sync: {
    status: () => ipcRenderer.invoke("sync:status"),
    configure: (cfg) => ipcRenderer.invoke("sync:configure", cfg),
    now: () => ipcRenderer.invoke("sync:now"),
    conflicts: () => ipcRenderer.invoke("sync:conflicts"),
    onStatus: (fn) => ipcRenderer.on("sync:status", (_e, st) => fn(st))
  }
});
