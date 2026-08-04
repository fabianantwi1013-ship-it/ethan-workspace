/* Ethan Foods POS — Electron main process.
   Phase 1: wrap the existing web app (../index.html) in a desktop window.
   The UI is loaded from the repo root, unchanged — same files GitHub Pages serves. */
const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

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
  win.loadFile(path.join(__dirname, "..", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
