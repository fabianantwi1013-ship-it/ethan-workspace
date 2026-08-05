/* POS hardware in the UI — desktop only, and only when configured.
   1. "🧾 Thermal receipt" button on invoices, printing 80mm ESC/POS.
   2. Barcode scanner (keyboard-wedge): a scan on the Sales screen adds that
      product as a line item.
   3. "🖨 Hardware" settings button in the top bar.
   The web version loads this file too and simply does nothing. */
(function () {
  "use strict";
  var HW = window.desktop && window.desktop.hardware;
  if (!HW) return;

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var W = 42;                                        // characters per 80mm line

  /* ---------- receipt layout ---------- */
  function pad(left, right) {
    left = String(left); right = String(right);
    var space = W - left.length - right.length;
    if (space < 1) { left = left.slice(0, W - right.length - 1); space = 1; }
    return left + " ".repeat(space) + right;
  }

  /* Reads the on-screen invoice sheet and re-expresses it for a thermal roll,
     so the receipt always matches whatever is displayed. */
  function receiptFromSheet(sheet) {
    var txt = function (sel) { var e = $(sel, sheet); return e ? e.textContent.trim() : ""; };
    var lines = [
      { text: "ETHAN FOODS", align: "center", bold: true, double: true },
      { text: "+1 (888) 301-7785", align: "center" },
      { text: "Info@ethanfoods.net", align: "center" },
      { hr: true },
      { text: txt(".inv-title"), align: "center", bold: true }
    ];
    $$(".inv-meta span", sheet).forEach(function (s) {
      var label = s.childNodes[0] ? s.childNodes[0].textContent.trim() : "";
      var value = $("b", s) ? $("b", s).textContent.trim() : "";
      if (label || value) lines.push({ text: pad(label, value) });
    });
    var billTo = $(".inv-billto", sheet);
    if (billTo) {
      lines.push({ hr: true });
      billTo.innerText.split("\n").map(function (l) { return l.trim(); })
        .filter(Boolean).forEach(function (l) { lines.push({ text: l.slice(0, W) }); });
    }
    lines.push({ hr: true });
    $$(".inv-table tbody tr", sheet).forEach(function (tr) {
      var c = $$("td", tr).map(function (td) { return td.textContent.trim(); });
      if (c.length < 4) return;
      lines.push({ text: c[0].slice(0, W) });
      lines.push({ text: pad("  " + c[1] + " x " + c[2], c[3]) });
    });
    lines.push({ hr: true });
    $$(".inv-totals > div", sheet).forEach(function (d) {
      var sp = $$("span", d);
      if (sp.length < 2) return;
      var isGrand = d.classList.contains("grand");
      lines.push({ text: pad(sp[0].textContent.trim(), sp[1].textContent.trim()), bold: isGrand });
    });
    var stamp = $(".inv-stamp", sheet);
    if (stamp) {
      lines.push({ hr: true });
      lines.push({ text: "*** " + stamp.textContent.trim() + " ***", align: "center", bold: true });
    }
    lines.push({ hr: true });
    lines.push({ text: "Thank you! Think health,", align: "center" });
    lines.push({ text: "choose Le Ginger", align: "center" });
    lines.push({ text: "ethanfoods.net", align: "center" });
    return { width: W, lines: lines, openDrawer: true };
  }

  function printSheet(sheetSelector) {
    var sheet = $(sheetSelector + " .inv-sheet");
    if (!sheet) { alert("Open an invoice first."); return; }
    HW.print(receiptFromSheet(sheet)).then(function (r) {
      if (r && r.ok === false) alert("Could not print:\n\n" + r.error);
    });
  }

  /* ---------- buttons on both invoice screens ---------- */
  [["#view-invoice .toolbar", "#invoice-sheet"],
   ["#view-sinvoice .toolbar", "#sinvoice-sheet"]].forEach(function (pair) {
    var bar = $(pair[0]);
    if (!bar) return;
    var b = document.createElement("button");
    b.className = "btn btn-line";
    b.type = "button";
    b.textContent = "🧾 Thermal receipt";
    b.addEventListener("click", function () { printSheet(pair[1]); });
    bar.appendChild(b);
  });

  /* ---------- hardware settings ---------- */
  var top = $(".top-actions");
  if (top) {
    var cog = document.createElement("button");
    cog.className = "sync-chip";
    cog.type = "button";
    cog.innerHTML = "<span>🖨 Hardware</span>";
    cog.addEventListener("click", settings);
    top.appendChild(cog);
  }

  function settings() {
    HW.config().then(function (c) {
      HW.printers().then(function (list) {
        var menu = "Receipt printer setup\n\n" +
          "Current: " + (c.mode === "none" ? "not configured" :
            c.mode === "windows" ? "USB printer — " + (c.printerName || "?") :
            "network printer — " + c.host + ":" + c.port) +
          "\nCash drawer: " + (c.drawer ? "enabled" : "disabled") +
          "\n\nChoose:\n" +
          "1 = USB printer (installed in Windows)\n" +
          "2 = Network printer (IP address)\n" +
          "3 = Turn printing off\n" +
          "4 = Toggle cash drawer\n" +
          "5 = Print a test receipt";
        var pick = prompt(menu, "1");
        if (pick === null) return;
        pick = pick.trim();

        if (pick === "1") {
          if (!list.length) { alert("No printers found. Install the printer's Windows driver first."); return; }
          var numbered = list.map(function (p, i) { return (i + 1) + ") " + p; }).join("\n");
          var n = prompt("Which printer?\n\n" + numbered, "1");
          if (n === null) return;
          var chosen = list[parseInt(n, 10) - 1];
          if (!chosen) { alert("That number wasn't in the list."); return; }
          HW.setConfig({ mode: "windows", printerName: chosen })
            .then(function () { alert("Saved: " + chosen + "\n\nRun option 5 to test it."); });

        } else if (pick === "2") {
          var host = prompt("Printer IP address:", c.host || "192.168.1.100");
          if (host === null) return;
          var port = prompt("Port (usually 9100):", String(c.port || 9100));
          if (port === null) return;
          HW.setConfig({ mode: "network", host: host.trim(), port: port.trim() })
            .then(function () { alert("Saved.\n\nRun option 5 to test it."); });

        } else if (pick === "3") {
          HW.setConfig({ mode: "none" }).then(function () { alert("Receipt printing turned off."); });

        } else if (pick === "4") {
          HW.setConfig({ drawer: !c.drawer })
            .then(function (n2) { alert("Cash drawer " + (n2.drawer ? "enabled" : "disabled") + "."); });

        } else if (pick === "5") {
          HW.test().then(function (r) {
            alert(r && r.ok === false ? "Test failed:\n\n" + r.error : "Test sent to the printer.");
          });
        }
      });
    });
  }

  /* ---------- barcode scanner (keyboard wedge) ----------
     Scanners type very fast and finish with Enter. We watch for that rhythm at
     the document level, so no field needs focus; typing by hand never triggers
     it because human keystrokes are far slower. */
  var buf = "", lastKey = 0;
  document.addEventListener("keydown", function (e) {
    var now = Date.now();
    if (now - lastKey > 120) buf = "";          // gap = new (or human) input
    lastKey = now;

    if (e.key === "Enter") {
      if (buf.length >= 4) { onScan(buf); e.preventDefault(); }
      buf = "";
      return;
    }
    if (e.key.length === 1) buf += e.key;
  });

  function onScan(code) {
    // Only meaningful on the Sales screen, where line items live
    var salesView = $("#view-sales");
    if (!salesView || !salesView.classList.contains("active")) {
      toast("Scanned " + code + " — open Sales to add it to an order");
      return;
    }
    var map = {};
    try { map = JSON.parse(localStorage.getItem("ef_barcodes") || "{}"); } catch (err) {}
    var productName = map[code];

    if (!productName) {
      var sel = $(".it-name");
      if (!sel) return;
      var options = $$("option", sel).map(function (o) { return o.textContent; });
      var numbered = options.map(function (p, i) { return (i + 1) + ") " + p; }).join("\n");
      var n = prompt("New barcode " + code + "\n\nWhich product is this?\n\n" + numbered, "1");
      if (n === null) return;
      productName = options[parseInt(n, 10) - 1];
      if (!productName) return;
      map[code] = productName;
      try { localStorage.setItem("ef_barcodes", JSON.stringify(map)); } catch (err) {}
    }
    addLine(productName);
  }

  function addLine(productName) {
    var rows = $$(".item-row");
    // reuse a blank first row, otherwise add a new one
    var row = rows.filter(function (r) {
      return $(".it-name", r).selectedIndex === 0 && $(".it-qty", r).value === "1" && rows.length === 1;
    })[0];
    var existing = rows.filter(function (r) { return $(".it-name", r).value === productName; })[0];

    if (existing) {
      var q = $(".it-qty", existing);
      q.value = String((parseInt(q.value, 10) || 0) + 1);
      q.dispatchEvent(new Event("input", { bubbles: true }));
      toast(productName + " ×" + q.value);
      return;
    }
    if (!row) { $("#add-item").click(); row = $$(".item-row").pop(); }
    var sel = $(".it-name", row);
    sel.value = productName;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    toast("Added " + productName);
  }

  var toastTimer;
  function toast(msg) {
    var el = $("#hw-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "hw-toast";
      el.style.cssText = "position:fixed;bottom:1.4rem;left:50%;transform:translateX(-50%);" +
        "background:#2A1E10;color:#fff;padding:.7rem 1.2rem;border-radius:10px;font-size:.86rem;" +
        "font-weight:700;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.3);transition:opacity .2s";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = "0"; }, 2200);
  }
})();
