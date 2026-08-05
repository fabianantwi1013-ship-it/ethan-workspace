/* Ethan Foods POS — Electron main process.
   Phase 1: wrap the existing web app (../index.html) in a desktop window.
   The UI is loaded from the repo root, unchanged — same files GitHub Pages serves. */
const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const storage = require("./storage");
const sync = require("./sync");
const { autoUpdater } = require("electron-updater");

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: "Ethan Foods POS",
    icon: path.join(__dirname, "..", "assets", "img", "brand", "favicon-512.png"),
    backgroundColor: "#F7F2E9",
    webPreferences: {
      contextIsolation: true,     // web app cannot reach Node directly
      nodeIntegration: false,     // ...only through preload bridges (Phase 2)
      preload: path.join(__dirname, "preload.js")
    }
  });

  Menu.setApplicationMenu(null);  // kiosk-clean: no File/Edit menu bar

  // Dev: load the UI straight from the repo. Packaged: from extraResources,
  // so the same source files serve the website, dev app and installed app.
  win.loadFile(app.isPackaged
    ? path.join(process.resourcesPath, "app-ui", "index.html")
    : path.join(__dirname, "..", "index.html"));
}

app.whenReady().then(() => {
  const dbFile = storage.init();
  console.log("SQLite:", dbFile);

  // load is sendSync: the web app reads its data once, synchronously, at boot
  ipcMain.on("storage:load", (e) => { e.returnValue = storage.load(); });
  // saves are fire-and-forget; better-sqlite3 is synchronous in the main process
  ipcMain.on("storage:save", (e, blob) => {
    try { storage.save(blob); } catch (err) { console.error("save failed:", err); }
  });
  ipcMain.handle("storage:pending", () => storage.pendingCount());

  // --- sync engine ---
  sync.init(app.getPath("userData"), (st) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send("sync:status", st);
  });
  ipcMain.handle("sync:status", () => sync.getStatus());
  ipcMain.handle("sync:configure", (e, cfg) => sync.configure(cfg));
  ipcMain.handle("sync:now", async () => { await sync.kick(); return sync.getStatus(); });
  ipcMain.handle("sync:conflicts", () => storage.conflicts(50));

  createWindow();

  // --- auto-update from GitHub Releases ---
  // Downloads quietly in the background; installs when the app is next closed,
  // so an update can never interrupt a sale in progress.
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("error", (e) => console.error("update error:", e.message));
    autoUpdater.on("update-downloaded", (info) => {
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send("update:ready", { version: info.version });
      }
    });
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
