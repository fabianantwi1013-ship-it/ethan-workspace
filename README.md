# Ethan Foods POS — Workspace

The staff sales office for Ethan Foods: sales, invoices, clients, payments,
returns and reporting. It runs two ways from **one** set of source files:

- **Web** — `index.html` on GitHub Pages, data kept in the browser.
- **Windows desktop app** — the same UI wrapped in Electron, data kept in a
  local SQLite database and synced to the cloud when there's internet.

---

## Quick start

| I want to… | Do this |
|---|---|
| Use the app | Launch **Ethan Foods POS** from the Start menu (password: `ethan2026`) |
| Run it in dev | `cd desktop && npm install && npm start` |
| Build the installer | `cd desktop && npm run dist` → `desktop/dist/Ethan Foods POS Setup <version>.exe` |
| Publish an update | Bump `version` in `desktop/package.json`, then `npm run release` |

---

## Repo layout

```
index.html              the whole UI (one page, no build step)
assets/css/             styles
assets/js/workspace.js  all app logic — sales, invoices, clients, reports
assets/js/desktop-*.js  desktop-only add-ons (sync chip, hardware); inert on web
desktop/                the Electron app
  main.js               window + IPC wiring
  preload.js            the only bridge between UI and Node
  storage.js            SQLite: schema, diffing, tombstones, conflict log
  sync.js               background push/pull engine
  hardware.js           ESC/POS printing, cash drawer
```

The desktop app **loads the same `index.html`** — there is no second copy of the
UI to keep in step. `assets/js/desktop-*.js` check for `window.desktop` and do
nothing in a plain browser, so one codebase serves both.

---

## How offline → online sync works

**Local first, always.** Every save writes to SQLite on the laptop before
anything else. Losing internet mid-sale changes nothing about how the app
behaves — the sale completes, the invoice prints, work continues.

**The outbox.** Each record (client, sale, return) is a row carrying:

- a `uuid` generated on the device — the record's permanent identity
- `updated_at` — when it last changed
- `synced` — `0` means "still needs to go up"
- `deleted` — a tombstone, so deletions travel too instead of records
  reappearing from another device

**The loop** runs every 30 seconds, plus immediately when Windows reports the
network is back:

1. **Push** — unsynced rows are upserted to Supabase *by uuid*. Because the uuid
   is fixed and the write is an upsert, a retry after a dropped connection
   updates the same row rather than creating a second sale. A row is only marked
   synced if it wasn't edited again while the request was in flight.
2. **Pull** — rows newer than the stored cursor (`server_seq`) come down in
   pages of 500.
3. **Failure** — no crash, no lost data: the error is shown on the status chip
   and retried with backoff (1 min, then 5 min).

**Conflicts** (the same record edited in two places): **last write wins**, judged
by `updated_at`. That's the right call for a one-owner shop — but the losing
version is never destroyed. It's archived in the local `conflict_log` table with
both copies and a timestamp, so a bad overwrite can always be recovered.

**Status chip** (top right of the app):

| Chip | Meaning |
|---|---|
| 🟢 Synced | Everything is up in the cloud |
| 🟡 *N* to sync | Working locally, *N* records queued |
| 🔴 Offline · *N* waiting | No connection; retrying automatically |

Click it for details, to force a sync, or to change settings.

### Turning sync on

The Supabase project URL and publishable key ship with the app. The only thing
to enter is the **sync key** — the secret set in the SQL policy — which is
what actually unlocks the data and stays on the device:

> Click the sync chip → type the sync key → it turns green.

The cloud table `pos_records` has row-level security: without the sync key in the
request header, the API returns **zero rows** even with a valid publishable key.

---

## Where the data lives

| What | Where |
|---|---|
| Local database | `%APPDATA%\Ethan Foods POS\ethan-pos.db` |
| Sync settings | `%APPDATA%\Ethan Foods POS\sync-config.json` |
| Hardware settings | `%APPDATA%\Ethan Foods POS\hardware-config.json` |
| The app itself | `%LOCALAPPDATA%\Programs\Ethan Foods POS\` |

Data sits **outside** the program folder on purpose: updating or reinstalling the
app never touches it. **To back up, copy `ethan-pos.db`.** To move to a new
laptop, install the app there and drop that file in the same place.

---

## POS hardware (all optional)

Nothing needs to be plugged in — with no hardware configured the app works
exactly as it does today. Configure via **🖨 Hardware** in the top bar.

**Receipt printer.** Two transports:

- *USB* — install the printer's normal Windows driver, then pick it from the
  list. Raw ESC/POS bytes are sent straight to the print queue, so the printer
  receives the commands rather than a driver-rendered image.
- *Network* — enter the printer's IP address (port 9100).

Once set, invoices gain a **🧾 Thermal receipt** button that prints an 80mm
receipt built from whatever invoice is on screen.

**Cash drawer.** Plugs into the printer's RJ11 port and opens on the ESC/POS
kick pulse sent with each receipt. Toggle it on in Hardware settings.

**Barcode scanner.** Most scanners act as keyboards; nothing to install. On the
Sales screen a scan adds that product as a line item (scanning it again bumps
the quantity). The first time an unknown barcode is scanned, the app asks which
product it belongs to and remembers it.

*No printer yet?* Any 80mm ESC/POS USB thermal printer works. The Epson TM-T20III
is the safe default (it's the reference implementation for ESC/POS and has a
drawer port); cheaper generic clones almost all speak the same commands.

---

## Releasing an update

The app checks GitHub Releases on launch and every 6 hours. Updates download
quietly and install **when the app is next closed**, so an update can never
interrupt a sale.

1. Make your changes and commit them.
2. Bump `version` in `desktop/package.json` (e.g. `0.1.0` → `0.1.1`).
3. `cd desktop && npm run release`
   (needs a `GH_TOKEN` environment variable with `repo` scope).

That builds the installer and publishes it to the `ethan-workspace` releases
page. Every installed copy picks it up automatically.

To build an installer **without** publishing, use `npm run dist`.

### The "unknown publisher" warning

The installer isn't code-signed, so Windows shows a blue
**"Windows protected your PC"** box on first run. Click **More info → Run
anyway**. This is expected and happens once per version. Removing it means
buying a code-signing certificate (roughly $200–500/year) — worth doing before
wide distribution, unnecessary for one client.

If the installer file disappears after building, Windows Defender likely
quarantined it for the same reason. Restore it from Defender's protection
history, or add the `desktop\dist` folder to Defender exclusions.

---

## Tests

Automated tests cover the risky parts — storage diffing, the sync engine
(including offline → reconnect → no duplicates), and ESC/POS output:

```
cd desktop
$env:ELECTRON_RUN_AS_NODE=1
.\node_modules\electron\dist\electron.exe <path-to-test-file>
```

They must run through Electron's Node (not plain `node`) because `better-sqlite3`
is compiled against Electron's ABI.
