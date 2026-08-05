/* Ethan Foods POS — POS hardware (Phase 5). All of it is optional:
   with nothing configured the app behaves exactly as before.

   PRINTER  ESC/POS receipt printing over two transports:
     "windows" – raw bytes to an installed Windows printer queue (USB printers).
                 Uses winspool via a tiny C# shim, so no native npm module and
                 no driver surgery — the printer just needs its normal driver.
     "network" – TCP to port 9100 (Ethernet/Wi-Fi printers).
   DRAWER   Cash drawers plug into the printer's RJ11 port and open on the
            ESC p kick pulse, sent down the same channel as a receipt.

   Config: userData/hardware-config.json  { mode, printerName, host, port, drawer } */
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const { execFile } = require("child_process");

let cfgFile;
let cfg = { mode: "none", printerName: "", host: "", port: 9100, drawer: false };

function init(userDataDir) {
  cfgFile = path.join(userDataDir, "hardware-config.json");
  try { Object.assign(cfg, JSON.parse(fs.readFileSync(cfgFile, "utf8"))); } catch (e) {}
  return getConfig();
}
function getConfig() { return { ...cfg }; }
function setConfig(next) {
  Object.assign(cfg, next || {});
  cfg.port = Number(cfg.port) || 9100;
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
  return getConfig();
}

/* ---------- ESC/POS command builder ---------- */
const ESC = 0x1b, GS = 0x1d;
const CMD = {
  init: [ESC, 0x40],
  alignLeft: [ESC, 0x61, 0], alignCenter: [ESC, 0x61, 1], alignRight: [ESC, 0x61, 2],
  boldOn: [ESC, 0x45, 1], boldOff: [ESC, 0x45, 0],
  doubleOn: [GS, 0x21, 0x11], doubleOff: [GS, 0x21, 0x00],
  cut: [GS, 0x56, 0x42, 0x00],
  kick: [ESC, 0x70, 0x00, 0x19, 0xfa]        // drawer pin 2, 25ms/250ms pulse
};

/* Turn the receipt description the renderer sends into ESC/POS bytes.
   lines: [{ text, align?, bold?, double?, feed? } | { hr: true }] */
function buildReceipt(doc) {
  const chunks = [Buffer.from(CMD.init)];
  const put = (arr) => chunks.push(Buffer.from(arr));
  const text = (s) => chunks.push(Buffer.from(String(s) + "\n", "utf8"));

  for (const line of doc.lines || []) {
    if (line.hr) { text("-".repeat(doc.width || 42)); continue; }
    put(line.align === "center" ? CMD.alignCenter
      : line.align === "right" ? CMD.alignRight : CMD.alignLeft);
    if (line.bold) put(CMD.boldOn);
    if (line.double) put(CMD.doubleOn);
    text(line.text == null ? "" : line.text);
    if (line.double) put(CMD.doubleOff);
    if (line.bold) put(CMD.boldOff);
  }
  put(CMD.alignLeft);
  text("\n\n");
  if (doc.openDrawer && cfg.drawer) put(CMD.kick);
  put(CMD.cut);
  return Buffer.concat(chunks);
}

/* ---------- transports ---------- */
function sendNetwork(buf) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: cfg.host, port: cfg.port }, () => {
      sock.write(buf, () => sock.end());
    });
    sock.setTimeout(8000);
    sock.on("error", reject);
    sock.on("timeout", () => { sock.destroy(); reject(new Error("printer timed out")); });
    sock.on("close", resolve);
  });
}

/* Raw pass-through to a Windows print queue (no driver rendering, so ESC/POS
   codes reach the printer intact). */
const RAW_PS = `
param([string]$PrinterName, [string]$File)
$code = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr h, int lvl, ref DOCINFO di);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
  public static void Send(string printer, byte[] bytes) {
    IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("cannot open printer: " + printer);
    DOCINFO di = new DOCINFO(); di.pDocName = "Ethan Foods receipt"; di.pDataType = "RAW";
    if (!StartDocPrinter(h, 1, ref di)) { ClosePrinter(h); throw new Exception("StartDocPrinter failed"); }
    StartPagePrinter(h);
    IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, p, bytes.Length);
    int written; WritePrinter(h, p, bytes.Length, out written);
    Marshal.FreeCoTaskMem(p);
    EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h);
  }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
[RawPrint]::Send($PrinterName, [System.IO.File]::ReadAllBytes($File))
`;

function sendWindows(buf) {
  return new Promise((resolve, reject) => {
    if (!cfg.printerName) return reject(new Error("no printer selected"));
    const tmpBin = path.join(os.tmpdir(), "ef-receipt-" + Date.now() + ".bin");
    const tmpPs = path.join(os.tmpdir(), "ef-rawprint.ps1");
    try {
      fs.writeFileSync(tmpBin, buf);
      fs.writeFileSync(tmpPs, RAW_PS, "utf8");
    } catch (e) { return reject(e); }
    execFile("powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tmpPs, "-PrinterName", cfg.printerName, "-File", tmpBin],
      { timeout: 20000 },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpBin); } catch (e) {}
        if (err) reject(new Error((stderr || err.message).trim().split("\n")[0]));
        else resolve();
      });
  });
}

async function send(buf) {
  if (cfg.mode === "network") return sendNetwork(buf);
  if (cfg.mode === "windows") return sendWindows(buf);
  throw new Error("No receipt printer configured");
}

async function printReceipt(doc) {
  await send(buildReceipt(doc));
  return { ok: true };
}

async function openDrawer() {
  if (!cfg.drawer) throw new Error("Cash drawer is switched off in settings");
  await send(Buffer.from(CMD.kick));
  return { ok: true };
}

async function testPrint() {
  return printReceipt({
    width: 42,
    lines: [
      { text: "ETHAN FOODS", align: "center", bold: true, double: true },
      { text: "printer test", align: "center" },
      { hr: true },
      { text: "If you can read this, the receipt" },
      { text: "printer is working correctly." },
      { hr: true },
      { text: new Date().toLocaleString(), align: "center" }
    ],
    openDrawer: false
  });
}

/* Installed Windows printers, so the settings screen can offer a list. */
function listPrinters() {
  return new Promise((resolve) => {
    execFile("powershell.exe",
      ["-NoProfile", "-Command", "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name"],
      { timeout: 15000 },
      (err, stdout) => {
        if (err) return resolve([]);
        resolve(String(stdout).split(/\r?\n/).map(s => s.trim()).filter(Boolean));
      });
  });
}

module.exports = { init, getConfig, setConfig, printReceipt, openDrawer, testPrint, listPrinters };
