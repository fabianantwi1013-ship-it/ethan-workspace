/* Ethan Foods — Workspace: Sales form, Proforma Invoices, Client Database,
   Account, Payments and Reports. Everything is saved in the browser
   (localStorage), so records persist between visits on this computer. */
(function () {
  "use strict";

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var fmt$ = function (n) {
    return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var fmt$0 = function (n) { return "$" + Math.round(n || 0).toLocaleString("en-US"); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  var todayISO = function () { return new Date().toISOString().slice(0, 10); };

  var COMPANY = {
    name: "Ethan Foods",
    phone: "+1 (888) 301-7785",
    email: "Info@ethanfoods.net",
    web: "ethanfoods.net"
  };

  var CATALOG = [
    { name: "Le Ginger — Regular (8 × 16oz)", price: 42 },
    { name: "Le Ginger — Mango (8 × 16oz)", price: 42 },
    { name: "Sobolo — Hibiscus (8 × 16oz)", price: 42 },
    { name: "Le Ginger — Moringa (8 × 16oz)", price: 42 },
    { name: "Le Ginger — Pineapple (8 × 16oz)", price: 42 },
    { name: "Le Ginger — Turmeric (8 × 16oz)", price: 42 },
    { name: "Custom item…", price: 0 }
  ];

  /* ================= shell: nav + date stamp ================= */
  var stampEl = $("#stamp");
  if (stampEl) {
    stampEl.textContent = new Date().toLocaleDateString("en-US",
      { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }
  $$(".side nav button").forEach(function (b) {
    b.addEventListener("click", function () {
      $$(".side nav button").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      $$(".view").forEach(function (v) { v.classList.remove("active"); });
      var view = $("#view-" + b.getAttribute("data-view"));
      if (view) view.classList.add("active");
      $("#page-title").textContent = b.textContent.replace(/\d+$/, "").trim();
    });
  });

  /* ================= storage ================= */
  var KEY = "ef_workspace_v1";
  var db;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  function seed() {
    return {
      nextNo: 1003,
      clients: [
        { id: 1, name: "Maame Efua", business: "Efua's African Market", phone: "+1 (614) 555-0141",
          email: "maame@efuasmarket.com", address: "2280 Morse Rd", city: "Columbus, OH", created: "2026-06-02" },
        { id: 2, name: "Kwaku Boateng", business: "", phone: "+1 (973) 555-0132",
          email: "kwaku.b@gmail.com", address: "114 Clinton Ave", city: "Newark, NJ", created: "2026-06-20" }
      ],
      sales: [
        { id: 1, no: "PI-1001", date: "2026-07-12", clientId: 1, type: "Wholesale",
          items: [{ name: "Le Ginger — Regular (8 × 16oz)", qty: 10, price: 42 },
                  { name: "Sobolo — Hibiscus (8 × 16oz)", qty: 6, price: 42 }],
          delivery: 25, discount: 40, taxRate: 6.5, validDays: 14,
          notes: "Monthly restock for the Morse Rd store.",
          payments: [{ date: "2026-07-14", amount: 400, method: "Bank Transfer", ref: "TRF-8841" }] },
        { id: 2, no: "PI-1002", date: "2026-07-25", clientId: 2, type: "Retail",
          items: [{ name: "Le Ginger — Mango (8 × 16oz)", qty: 2, price: 42 }],
          delivery: 0, discount: 0, taxRate: 6.5, validDays: 14,
          notes: "", payments: [] }
      ]
    };
  }

  try {
    db = JSON.parse(localStorage.getItem(KEY));
    if (!db || !db.sales) db = seed();
  } catch (e) { db = seed(); }
  // migrations
  db.sales.forEach(function (s) {
    if (!s.docType) s.docType = s.no.indexOf("R-") === 0 ? "receipt" : "proforma";
  });
  if (!db.nextInv) db.nextInv = 2000;
  if (!db.issues) db.issues = [];   // returns & spoilage ledger
  save();

  /* ================= helpers ================= */
  function clientOf(sale) {
    return db.clients.filter(function (c) { return c.id === sale.clientId; })[0] ||
           { name: "Walk-in customer", business: "", phone: "", email: "", address: "", city: "" };
  }
  function subtotal(sale) {
    return sale.items.reduce(function (a, i) { return a + i.qty * i.price; }, 0);
  }
  function taxOf(sale) {
    return Math.round((subtotal(sale) + (sale.delivery || 0) - (sale.discount || 0)) * (sale.taxRate || 0)) / 100;
  }
  function totalOf(sale) {
    return subtotal(sale) + (sale.delivery || 0) - (sale.discount || 0) + taxOf(sale);
  }
  function paidOf(sale) {
    return (sale.payments || []).reduce(function (a, p) { return a + p.amount; }, 0);
  }
  function balanceOf(sale) { return Math.max(0, Math.round((totalOf(sale) - paidOf(sale)) * 100) / 100); }
  function statusOf(sale) {
    var b = balanceOf(sale);
    return b <= 0.005 ? "Paid" : paidOf(sale) > 0 ? "Partial" : "Unpaid";
  }
  function displayNo(sale) { return sale.invNo || sale.no; }
  function statusBadge(st) {
    var cls = st === "Paid" ? "ok" : st === "Partial" ? "warn" : "bad";
    return '<span class="badge ' + cls + '">' + st + "</span>";
  }
  function findClient(name, phone) {
    var n = (name || "").trim().toLowerCase();
    return db.clients.filter(function (c) {
      return c.name.trim().toLowerCase() === n ||
             (phone && c.phone && c.phone.replace(/\D/g, "") === phone.replace(/\D/g, "") && phone.replace(/\D/g, "").length > 6);
    })[0];
  }
  function nextClientId() {
    return db.clients.reduce(function (m, c) { return Math.max(m, c.id); }, 0) + 1;
  }

  /* ================= SALES form ================= */
  var itemsHost = $("#sale-items");

  function addItemRow(preset) {
    var row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML =
      '<select class="it-name">' + CATALOG.map(function (p) {
        return '<option data-price="' + p.price + '">' + esc(p.name) + "</option>";
      }).join("") + "</select>" +
      '<input class="it-qty" type="number" min="1" value="' + (preset ? preset.qty : 1) + '">' +
      '<input class="it-price" type="number" min="0" step="0.01" value="' + (preset ? preset.price : CATALOG[0].price).toFixed(2) + '">' +
      '<span class="line-total">$0.00</span>' +
      '<button type="button" class="rm" title="Remove">×</button>';
    itemsHost.appendChild(row);

    var sel = $(".it-name", row), qty = $(".it-qty", row), price = $(".it-price", row);
    sel.addEventListener("change", function () {
      var p = parseFloat(sel.options[sel.selectedIndex].getAttribute("data-price"));
      if (p > 0) price.value = p.toFixed(2);
      recalc();
    });
    [qty, price].forEach(function (i) { i.addEventListener("input", recalc); });
    $(".rm", row).addEventListener("click", function () {
      if (itemsHost.children.length > 1) { row.remove(); recalc(); }
    });
    recalc();
  }

  function readItems() {
    return $$(".item-row", itemsHost).map(function (row) {
      return {
        name: $(".it-name", row).value,
        qty: Math.max(1, parseInt($(".it-qty", row).value, 10) || 1),
        price: Math.max(0, parseFloat($(".it-price", row).value) || 0)
      };
    }).filter(function (i) { return i.qty > 0; });
  }

  function recalc() {
    var items = readItems();
    var sub = items.reduce(function (a, i) { return a + i.qty * i.price; }, 0);
    var delivery = parseFloat($("#s-delivery").value) || 0;
    var discount = parseFloat($("#s-discount").value) || 0;
    var taxRate = parseFloat($("#s-tax").value) || 0;
    var tax = Math.round((sub + delivery - discount) * taxRate) / 100;
    $$(".item-row", itemsHost).forEach(function (row) {
      var q = parseFloat($(".it-qty", row).value) || 0, p = parseFloat($(".it-price", row).value) || 0;
      $(".line-total", row).textContent = fmt$(q * p);
    });
    $("#sum-sub").textContent = fmt$(sub + delivery - discount);
    $("#sum-tax").textContent = fmt$(tax);
    $("#sum-total").textContent = fmt$(sub + delivery - discount + tax);
  }

  function renderClientPicker() {
    var sel = $("#s-existing");
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">— New client —</option>' +
      db.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
        .map(function (c) {
          return '<option value="' + c.id + '">' + esc(c.name) + (c.business ? " — " + esc(c.business) : "") + "</option>";
        }).join("");
    if (cur && $$("option", sel).some(function (o) { return o.value === cur; })) sel.value = cur;
  }

  var existingSel = $("#s-existing");
  if (existingSel) {
    existingSel.addEventListener("change", function () {
      var c = db.clients.filter(function (x) { return x.id === parseInt(existingSel.value, 10); })[0];
      if (!c) return;
      $("#s-name").value = c.name || "";
      $("#s-business").value = c.business || "";
      $("#s-phone").value = c.phone || "";
      $("#s-email").value = c.email || "";
      $("#s-address").value = c.address || "";
      $("#s-city").value = c.city || "";
    });
  }

  if (itemsHost) {
    var head = document.createElement("div");
    head.className = "item-head";
    head.innerHTML = "<span>Product</span><span>Qty</span><span>Unit $</span><span style='text-align:right'>Total</span><span></span>";
    itemsHost.parentElement.insertBefore(head, itemsHost);
    addItemRow();
    $("#add-item").addEventListener("click", function () { addItemRow(); });
    ["#s-delivery", "#s-discount", "#s-tax"].forEach(function (s) {
      $(s).addEventListener("input", recalc);
    });

    $("#sale-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var items = readItems();
      if (!items.length) { alert("Add at least one order item."); return; }

      var name = $("#s-name").value.trim(), phone = $("#s-phone").value.trim();
      var client = findClient(name, phone);
      if (!client) {
        client = { id: nextClientId(), name: name, business: $("#s-business").value.trim(),
                   phone: phone, email: $("#s-email").value.trim(),
                   address: $("#s-address").value.trim(), city: $("#s-city").value.trim(),
                   created: todayISO() };
        db.clients.push(client);
      } else {
        // refresh any newly supplied details
        if ($("#s-business").value.trim()) client.business = $("#s-business").value.trim();
        if ($("#s-email").value.trim()) client.email = $("#s-email").value.trim();
        if ($("#s-address").value.trim()) client.address = $("#s-address").value.trim();
        if ($("#s-city").value.trim()) client.city = $("#s-city").value.trim();
      }

      var docType = $("#s-doctype") ? $("#s-doctype").value : "proforma";
      var sale = {
        id: db.sales.reduce(function (m, s) { return Math.max(m, s.id); }, 0) + 1,
        no: docType === "invoice" ? "INV-" + (++db.nextInv) : "PI-" + (++db.nextNo),
        docType: docType,
        date: todayISO(),
        clientId: client.id,
        type: $("#s-type").value,
        items: items,
        delivery: parseFloat($("#s-delivery").value) || 0,
        discount: parseFloat($("#s-discount").value) || 0,
        taxRate: parseFloat($("#s-tax").value) || 0,
        validDays: parseInt($("#s-valid").value, 10) || 14,
        notes: $("#s-notes").value.trim(),
        payments: []
      };
      db.sales.push(sale);
      save();

      this.reset();
      itemsHost.innerHTML = "";
      addItemRow();
      $("#s-tax").value = "6.5"; $("#s-valid").value = "14"; recalc();

      renderEverything();
      if (docType === "invoice") {
        $("#sinv-select").value = sale.id;
        renderSInvoice();
        $$(".side nav button[data-view=sinvoice]")[0].click();
      } else {
        $("#inv-select").value = sale.id;
        renderInvoice();
        $$(".side nav button[data-view=invoice]")[0].click();
      }
    });
  }

  /* ================= INVOICES (proforma + sales invoice) ================= */
  function docSales(kind) {
    return db.sales.filter(function (s) { return (s.docType || "proforma") === kind; });
  }

  function renderDocSelect(selId, kind, emptyMsg) {
    var sel = $(selId);
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = docSales(kind).slice().reverse().map(function (s) {
      var c = clientOf(s);
      return '<option value="' + s.id + '">' + displayNo(s) + " — " + esc(c.name) + " — " + fmt$(totalOf(s)) + " (" + statusOf(s) + ")</option>";
    }).join("") || "<option value=''>" + emptyMsg + "</option>";
    if (cur && $$("option", sel).some(function (o) { return o.value === cur; })) sel.value = cur;
  }
  function renderInvoiceSelect() {
    renderDocSelect("#inv-select", "proforma", "No proforma invoices yet — create one under Sales");
    renderDocSelect("#sinv-select", "invoice", "No sales invoices yet — create one under Sales or convert a proforma");
  }

  function renderDocSheet(selId, hostId, kind) {
    var host = $(hostId);
    if (!host) return;
    var id = parseInt(($(selId) || {}).value, 10);
    var sale = db.sales.filter(function (s) { return s.id === id; })[0];
    if (!sale) { host.innerHTML = '<div class="panel muted">Nothing selected. Record a sale first under <b>Sales</b>.</div>'; return; }
    var isFinal = kind === "invoice";
    var title = isFinal ? "SALES INVOICE" : "PROFORMA INVOICE";
    var c = clientOf(sale);
    var st = statusOf(sale);
    var valid = new Date(sale.date);
    valid.setDate(valid.getDate() + (sale.validDays || 14));

    host.innerHTML =
      '<div class="inv-sheet">' +
      '<div class="inv-stamp ' + st.toLowerCase() + '">' + st.toUpperCase() + "</div>" +
      '<div class="inv-top">' +
      '<img src="assets/img/brand/ethan-foods-logo.png" alt="Ethan Foods">' +
      '<div class="inv-co"><b>' + COMPANY.name + "</b><br>" + COMPANY.phone + "<br>" + COMPANY.email + "<br>" + COMPANY.web + "</div>" +
      "</div>" +
      '<div class="inv-title">' + title + "</div>" +
      '<div class="inv-meta">' +
      "<span>Invoice No.<b>" + displayNo(sale) + "</b></span>" +
      "<span>Date<b>" + sale.date + "</b></span>" +
      "<span>" + (isFinal ? "Payment due" : "Valid until") + "<b>" + valid.toISOString().slice(0, 10) + "</b></span>" +
      "<span>Client type<b>" + esc(sale.type || "Retail") + "</b></span>" +
      "</div>" +
      '<div class="inv-billto"><h4>Bill to</h4><b>' + esc(c.name) + "</b>" +
      (c.business ? " — " + esc(c.business) : "") + "<br>" +
      [c.address, c.city].filter(Boolean).map(esc).join(", ") +
      (c.phone ? "<br>" + esc(c.phone) : "") + (c.email ? " · " + esc(c.email) : "") +
      "</div>" +
      '<table class="inv-table"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th></tr></thead><tbody>' +
      sale.items.map(function (i) {
        return "<tr><td>" + esc(i.name) + '</td><td class="num">' + i.qty +
          '</td><td class="num">' + fmt$(i.price) + '</td><td class="num">' + fmt$(i.qty * i.price) + "</td></tr>";
      }).join("") +
      "</tbody></table>" +
      '<div class="inv-totals">' +
      "<div><span>Subtotal</span><span>" + fmt$(subtotal(sale)) + "</span></div>" +
      (sale.delivery ? "<div><span>Delivery</span><span>" + fmt$(sale.delivery) + "</span></div>" : "") +
      (sale.discount ? "<div><span>Discount</span><span>−" + fmt$(sale.discount) + "</span></div>" : "") +
      "<div><span>Tax (" + (sale.taxRate || 0) + "%)</span><span>" + fmt$(taxOf(sale)) + "</span></div>" +
      '<div class="grand"><span>Total</span><span>' + fmt$(totalOf(sale)) + "</span></div>" +
      (paidOf(sale) ? "<div><span>Paid to date</span><span>" + fmt$(paidOf(sale)) + "</span></div>" +
        "<div><span><b>Balance due</b></span><span><b>" + fmt$(balanceOf(sale)) + "</b></span></div>" : "") +
      "</div>" +
      (sale.notes ? '<div class="inv-notes"><b>Notes:</b> ' + esc(sale.notes) + "</div>" : "") +
      '<div class="inv-terms">' +
      "<div>" + (isFinal
        ? "Payment is due by the date shown above.<br>Please quote invoice number " + displayNo(sale) + " with your payment.<br>Free shipping across the USA on standard orders."
        : "This proforma invoice is not a demand for payment.<br>Prices valid until the date shown above.<br>Free shipping across the USA on standard orders.") + "</div>" +
      '<div class="inv-sign">Authorized signature</div>' +
      "</div>" +
      '<div class="inv-foot">Thank you for your business! · ' + COMPANY.name + " · " + COMPANY.phone + " · " + COMPANY.email + "</div>" +
      "</div>";
  }
  function renderInvoice() { renderDocSheet("#inv-select", "#invoice-sheet", "proforma"); }
  function renderSInvoice() { renderDocSheet("#sinv-select", "#sinvoice-sheet", "invoice"); }

  function goToPayment(saleId) {
    $$(".side nav button[data-view=payment]")[0].click();
    if ($("#pay-invoice")) { $("#pay-invoice").value = saleId; paintPayBalance(); }
  }

  var invSel = $("#inv-select");
  if (invSel) {
    $("#inv-new").addEventListener("click", function () {
      $$(".side nav button[data-view=sales]")[0].click();
      if ($("#s-doctype")) $("#s-doctype").value = "proforma";
      var n = $("#s-name"); if (n) n.focus();
    });
    invSel.addEventListener("change", renderInvoice);
    $("#inv-print").addEventListener("click", function () { window.print(); });
    $("#inv-pay").addEventListener("click", function () { goToPayment($("#inv-select").value); });
    $("#inv-convert").addEventListener("click", function () {
      var id = parseInt($("#inv-select").value, 10);
      var s = db.sales.filter(function (x) { return x.id === id; })[0];
      if (!s) { alert("Choose a proforma invoice first."); return; }
      if (!confirm("Convert " + s.no + " into a final sales invoice?")) return;
      s.docType = "invoice";
      s.invNo = "INV-" + (++db.nextInv);
      save();
      renderEverything();
      $("#sinv-select").value = s.id;
      renderSInvoice();
      $$(".side nav button[data-view=sinvoice]")[0].click();
    });
  }

  var sinvSel = $("#sinv-select");
  if (sinvSel) {
    $("#sinv-new").addEventListener("click", function () {
      $$(".side nav button[data-view=sales]")[0].click();
      if ($("#s-doctype")) $("#s-doctype").value = "invoice";
      var n = $("#s-name"); if (n) n.focus();
    });
    sinvSel.addEventListener("change", renderSInvoice);
    $("#sinv-print").addEventListener("click", function () { window.print(); });
    $("#sinv-pay").addEventListener("click", function () { goToPayment($("#sinv-select").value); });
  }

  /* ================= CLIENT DATABASE ================= */
  function clientStats(c) {
    var sales = db.sales.filter(function (s) { return s.clientId === c.id; });
    var byProduct = {};
    var packs = 0;
    sales.forEach(function (s) {
      s.items.forEach(function (i) {
        packs += i.qty;
        var k = shortName(i.name);
        byProduct[k] = (byProduct[k] || 0) + i.qty;
      });
    });
    var top = Object.keys(byProduct).sort(function (a, b) { return byProduct[b] - byProduct[a]; })[0];
    return {
      sales: sales,
      invoiced: sales.reduce(function (a, s) { return a + totalOf(s); }, 0),
      balance: sales.reduce(function (a, s) { return a + balanceOf(s); }, 0),
      packs: packs,
      topProduct: top || null,
      topQty: top ? byProduct[top] : 0
    };
  }

  function renderClientChamp() {
    var host = $("#client-champ");
    if (!host) return;
    var best = null, bestStats = null;
    db.clients.forEach(function (c) {
      var st = clientStats(c);
      if (!st.packs) return;
      if (!bestStats || st.packs > bestStats.packs ||
          (st.packs === bestStats.packs && st.invoiced > bestStats.invoiced)) {
        best = c; bestStats = st;
      }
    });
    if (!best) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML =
      '<img src="' + matchImg(bestStats.topProduct || "") + '" alt="" style="height:74px">' +
      '<div style="flex:1"><div style="font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:800">🏆 Top customer — buys the most</div>' +
      '<div style="font-family:var(--font-display);font-size:1.25rem;margin:.15rem 0">' + esc(best.name) +
      (best.business ? ' <span style="font-size:.85rem;color:var(--muted)">· ' + esc(best.business) + "</span>" : "") + "</div>" +
      '<div style="font-size:.86rem;color:var(--muted)"><b style="color:var(--ink)">' + bestStats.packs + ' packs</b> across ' +
      bestStats.sales.length + " purchases · " + fmt$(bestStats.invoiced) + " total</div></div>" +
      '<div style="text-align:right"><div style="font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:800">Most bought</div>' +
      '<div style="font-weight:800;margin-top:.15rem">' + esc(bestStats.topProduct || "—") + "</div>" +
      '<div style="font-size:.82rem;color:var(--muted)">' + bestStats.topQty + " packs</div></div>";
  }

  function renderClients() {
    var body = $("#clients-body");
    if (!body) return;
    renderClientChamp();
    var q = ($("#client-search").value || "").toLowerCase();
    var rows = db.clients.filter(function (c) {
      return !q || (c.name + " " + (c.business || "") + " " + (c.phone || "")).toLowerCase().indexOf(q) >= 0;
    }).map(function (c) {
      var st = clientStats(c);
      return "<tr><td><b>" + esc(c.name) + "</b>" + (c.email ? "<br><small class='muted'>" + esc(c.email) + "</small>" : "") + "</td>" +
        "<td>" + esc(c.business || "—") + "</td>" +
        "<td>" + esc(c.phone || "—") + "</td><td>" + esc(c.city || "—") + "</td>" +
        '<td class="num">' + st.sales.length + "</td>" +
        '<td class="num"><b>' + st.packs + "</b></td>" +
        "<td>" + (st.topProduct ? esc(st.topProduct) + " <small class='muted'>· " + st.topQty + "</small>" : "—") + "</td>" +
        '<td class="num">' + fmt$(st.invoiced) + "</td>" +
        '<td class="num">' + (st.balance > 0 ? "<b style='color:var(--red)'>" + fmt$(st.balance) + "</b>" : fmt$(0)) + "</td></tr>";
    });
    body.innerHTML = rows.join("") ||
      "<tr><td colspan='9' style='text-align:center;color:var(--muted);padding:1.6rem'>No clients yet — they're added automatically when you record a sale.</td></tr>";
  }

  var clientSearch = $("#client-search");
  if (clientSearch) {
    clientSearch.addEventListener("input", renderClients);
    $("#client-toggle").addEventListener("click", function () {
      var f = $("#client-form");
      f.hidden = !f.hidden;
    });
    $("#client-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var existing = findClient($("#c-name").value, $("#c-phone").value);
      if (existing) { alert("This client already exists: " + existing.name); return; }
      db.clients.push({
        id: nextClientId(), name: $("#c-name").value.trim(), business: $("#c-business").value.trim(),
        phone: $("#c-phone").value.trim(), email: $("#c-email").value.trim(),
        address: $("#c-address").value.trim(), city: $("#c-city").value.trim(), created: todayISO()
      });
      save(); this.reset(); this.hidden = true;
      renderEverything();
    });
  }

  /* ================= ACCOUNT ================= */
  function renderAccount() {
    if (!$("#acc-invoiced")) return;
    var invoiced = db.sales.reduce(function (a, s) { return a + totalOf(s); }, 0);
    var received = db.sales.reduce(function (a, s) { return a + paidOf(s); }, 0);
    $("#acc-invoiced").textContent = fmt$(invoiced);
    $("#acc-received").textContent = fmt$(received);
    $("#acc-outstanding").textContent = fmt$(invoiced - received);
    $("#acc-unpaid").textContent = db.sales.filter(function (s) { return statusOf(s) !== "Paid"; }).length;

    $("#account-body").innerHTML = db.clients.map(function (c) {
      var sales = db.sales.filter(function (s) { return s.clientId === c.id; });
      if (!sales.length) return "";
      var inv = sales.reduce(function (a, s) { return a + totalOf(s); }, 0);
      var paid = sales.reduce(function (a, s) { return a + paidOf(s); }, 0);
      var bal = inv - paid;
      var st = bal <= 0.005 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
      return "<tr><td><b>" + esc(c.name) + "</b>" + (c.business ? " <span class='muted'>· " + esc(c.business) + "</span>" : "") + "</td>" +
        '<td class="num">' + sales.length + '</td><td class="num">' + fmt$(inv) + "</td>" +
        '<td class="num">' + fmt$(paid) + '</td><td class="num"><b>' + fmt$(bal) + "</b></td>" +
        "<td>" + statusBadge(st) + "</td></tr>";
    }).join("") || "<tr><td colspan='6' style='text-align:center;color:var(--muted);padding:1.6rem'>Nothing invoiced yet.</td></tr>";
  }

  /* ================= PAYMENT ================= */
  function renderPaySelect() {
    var sel = $("#pay-invoice");
    if (!sel) return;
    var cur = sel.value;
    var open = db.sales.filter(function (s) { return statusOf(s) !== "Paid"; });
    var done = db.sales.filter(function (s) { return statusOf(s) === "Paid"; });
    sel.innerHTML = open.concat(done).map(function (s) {
      return '<option value="' + s.id + '">' + displayNo(s) + " — " + esc(clientOf(s).name) +
        " — balance " + fmt$(balanceOf(s)) + "</option>";
    }).join("") || "<option value=''>No invoices yet</option>";
    if (cur && $$("option", sel).some(function (o) { return o.value === cur; })) sel.value = cur;
    paintPayBalance();
  }
  function paintPayBalance() {
    var sel = $("#pay-invoice");
    if (!sel || !sel.value) { $("#pay-balance").textContent = "—"; return; }
    var s = db.sales.filter(function (x) { return x.id === parseInt(sel.value, 10); })[0];
    if (!s) return;
    $("#pay-balance").innerHTML = "Total " + fmt$(totalOf(s)) + " · paid " + fmt$(paidOf(s)) +
      " · <b>balance " + fmt$(balanceOf(s)) + "</b> " + statusBadge(statusOf(s));
    $("#pay-amount").value = balanceOf(s) ? balanceOf(s).toFixed(2) : "";
  }
  function renderPayments() {
    var body = $("#payments-body");
    if (!body) return;
    var rows = [];
    db.sales.forEach(function (s) {
      (s.payments || []).forEach(function (p) {
        rows.push({ date: p.date, no: displayNo(s), client: clientOf(s).name, method: p.method, ref: p.ref, amount: p.amount });
      });
    });
    rows.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    body.innerHTML = rows.map(function (r) {
      return "<tr><td>" + r.date + "</td><td><b>" + r.no + "</b></td><td>" + esc(r.client) + "</td>" +
        "<td>" + esc(r.method) + "</td><td>" + esc(r.ref || "—") + '</td><td class="num"><b>' + fmt$(r.amount) + "</b></td></tr>";
    }).join("") || "<tr><td colspan='6' style='text-align:center;color:var(--muted);padding:1.6rem'>No payments recorded yet.</td></tr>";
  }

  var payForm = $("#pay-form");
  if (payForm) {
    $("#pay-date").value = todayISO();
    $("#pay-invoice").addEventListener("change", paintPayBalance);
    payForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var s = db.sales.filter(function (x) { return x.id === parseInt($("#pay-invoice").value, 10); })[0];
      if (!s) { alert("Choose an invoice first."); return; }
      var amount = parseFloat($("#pay-amount").value);
      if (!(amount > 0)) { alert("Enter a valid amount."); return; }
      s.payments = s.payments || [];
      s.payments.push({
        date: $("#pay-date").value || todayISO(),
        amount: Math.round(amount * 100) / 100,
        method: $("#pay-method").value,
        ref: $("#pay-ref").value.trim()
      });
      save();
      $("#pay-ref").value = "";
      renderEverything();
    });
  }

  /* ================= POS REGISTER ================= */
  var IMG_RULES = [
    ["mango", "le-ginger-mango"],
    ["sobolo", "sobolo-hibiscus"], ["hibiscus", "sobolo-hibiscus"], ["sorrel", "sobolo-hibiscus"],
    ["moringa", "le-ginger-moringa"],
    ["pineapple", "le-ginger-pineapple"],
    ["turmeric", "le-ginger-turmeric"], ["tumeric", "le-ginger-turmeric"],
    ["regular", "le-ginger-regular"]
  ];
  function matchImg(name) {
    var n = (name || "").toLowerCase();
    for (var i = 0; i < IMG_RULES.length; i++) {
      if (n.indexOf(IMG_RULES[i][0]) >= 0) return "assets/img/products/" + IMG_RULES[i][1] + "-cutout.png";
    }
    return "assets/img/brand/ethan-foods-mark.png";
  }
  function shortName(name) {
    return (name || "Item")
      .replace(/8\s*(juice\s*)?pack[^a-z0-9]*(juice\s*)?(of\s*)?/i, "")
      .replace(/\s*\((mild|spicy|8 × 16oz)\)\s*/i, "")
      .replace(/\ble[- ]?ginger[- ]?/i, "").replace(/juice/i, "")
      .replace(/\s*\(8 × 16oz\)\s*/i, "")
      .replace(/^[\s—–-]+|[\s—–-]+$/g, "").trim() || name;
  }

  var ticket = [];              // [{name, price, qty}]
  var regMethod = null;
  if (!db.nextReceipt) db.nextReceipt = 1000;

  function regTotals() {
    var sub = ticket.reduce(function (a, l) { return a + l.qty * l.price; }, 0);
    var disc = Math.min(sub, parseFloat($("#reg-disc").value) || 0);
    var taxRate = parseFloat($("#reg-tax").value) || 0;
    var tax = Math.round((sub - disc) * taxRate) / 100;
    return { sub: sub, disc: disc, taxRate: taxRate, tax: tax, total: sub - disc + tax };
  }

  function renderRegTiles() {
    var host = $("#reg-tiles");
    if (!host) return;
    host.innerHTML = CATALOG.filter(function (p) { return p.price > 0; }).map(function (p, i) {
      return '<button type="button" class="reg-tile" data-tile="' + i + '">' +
        '<img src="' + matchImg(p.name) + '" alt="">' +
        "<b>" + esc(shortName(p.name)) + "</b>" +
        "<span>" + fmt$(p.price) + "</span></button>";
    }).join("") +
      '<button type="button" class="reg-tile custom" data-tile="custom"><b style="font-size:1.6rem">＋</b><b>Custom item</b></button>';
  }

  function renderRegCust() {
    var sel = $("#reg-cust");
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">Walk-in customer</option>' +
      db.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
        .map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("");
    if (cur && $$("option", sel).some(function (o) { return o.value === cur; })) sel.value = cur;
  }

  function renderTicket() {
    var host = $("#reg-lines");
    if (!host) return;
    $("#reg-next-no").textContent = "receipt R-" + (db.nextReceipt + 1);
    host.innerHTML = ticket.map(function (l, i) {
      return '<div class="reg-line"><span>' + esc(l.name) + "<br><small class='muted'>" + fmt$(l.price) + " each</small></span>" +
        '<span class="qtyc"><button data-reg-dec="' + i + '">−</button><b>' + l.qty + '</b><button data-reg-inc="' + i + '">+</button></span>' +
        '<span class="amt">' + fmt$(l.qty * l.price) + "</span>" +
        '<button class="rm" data-reg-rm="' + i + '">×</button></div>';
    }).join("") || '<div class="reg-empty">Tap a product to start the sale.</div>';
    var t = regTotals();
    $("#reg-sub").textContent = fmt$(t.sub - t.disc);
    $("#reg-taxv").textContent = fmt$(t.tax);
    $("#reg-total").textContent = fmt$(t.total);
    paintChange();
  }

  function paintChange() {
    var t = regTotals();
    var tendered = parseFloat($("#reg-tendered").value) || 0;
    $("#reg-change").textContent = fmt$(Math.max(0, tendered - t.total));
  }

  function resetRegister() {
    ticket = []; regMethod = null;
    $("#reg-disc").value = "0"; $("#reg-tendered").value = "";
    $$("#reg-methods button").forEach(function (b) { b.classList.remove("active"); });
    $("#reg-cash-row").hidden = true;
    $("#reg-cust").value = "";
    $("#reg-done").hidden = true;
    $("#reg-sell").hidden = false;
    renderTicket();
  }

  function completeSale() {
    if (!ticket.length) { alert("The sale is empty — tap a product first."); return; }
    if (!regMethod) { alert("Choose how the customer is paying (Cash, Card or Mobile)."); return; }
    var t = regTotals();
    var tendered = parseFloat($("#reg-tendered").value) || 0;
    if (regMethod === "Cash" && tendered + 0.005 < t.total) {
      alert("Cash received (" + fmt$(tendered) + ") is less than the total (" + fmt$(t.total) + ").");
      return;
    }
    var sale = {
      id: db.sales.reduce(function (m, s) { return Math.max(m, s.id); }, 0) + 1,
      no: "R-" + (++db.nextReceipt),
      docType: "receipt",
      date: todayISO(),
      clientId: parseInt($("#reg-cust").value, 10) || null,
      type: "In-store",
      items: ticket.map(function (l) { return { name: l.name, qty: l.qty, price: l.price }; }),
      delivery: 0, discount: t.disc, taxRate: t.taxRate, validDays: 0,
      notes: "Register sale",
      payments: [{ date: todayISO(), amount: Math.round(t.total * 100) / 100,
                   method: regMethod, ref: "Register" }]
    };
    db.sales.push(sale);
    save();
    renderReceipt(sale, regMethod === "Cash" ? tendered : null);
    $("#reg-sell").hidden = true;
    $("#reg-done").hidden = false;
    renderEverything();
  }

  function renderReceipt(sale, tendered) {
    var t = { sub: subtotal(sale), disc: sale.discount || 0, tax: taxOf(sale), total: totalOf(sale) };
    var c = clientOf(sale);
    var now = new Date();
    $("#reg-receipt").innerHTML =
      '<div class="rc-center"><img src="assets/img/brand/ethan-foods-mark.png" alt="">' +
      "<br><b>ETHAN FOODS</b><br>" + COMPANY.phone + "<br>" + COMPANY.email + "</div><hr>" +
      '<div class="rc-row"><span>Receipt</span><span>' + sale.no + "</span></div>" +
      '<div class="rc-row"><span>Date</span><span>' + sale.date + " " +
      now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) + "</span></div>" +
      '<div class="rc-row"><span>Customer</span><span>' + esc(c.name) + "</span></div><hr>" +
      sale.items.map(function (i) {
        return '<div class="rc-row"><span>' + i.qty + " × " + esc(shortName(i.name)) + "</span><span>" + fmt$(i.qty * i.price) + "</span></div>";
      }).join("") + "<hr>" +
      '<div class="rc-row"><span>Subtotal</span><span>' + fmt$(t.sub) + "</span></div>" +
      (t.disc ? '<div class="rc-row"><span>Discount</span><span>−' + fmt$(t.disc) + "</span></div>" : "") +
      '<div class="rc-row"><span>Tax</span><span>' + fmt$(t.tax) + "</span></div>" +
      '<div class="rc-row big"><span>TOTAL</span><span>' + fmt$(t.total) + "</span></div><hr>" +
      '<div class="rc-row"><span>Paid — ' + esc(sale.payments[0].method) + "</span><span>" +
      fmt$(tendered !== null ? tendered : t.total) + "</span></div>" +
      (tendered !== null ? '<div class="rc-row"><span>Change</span><span>' + fmt$(Math.max(0, tendered - t.total)) + "</span></div>" : "") +
      '<hr><div class="rc-center">Thank you! Think health,<br>choose Le Ginger 🌿<br>ethanfoods.net</div>';
  }

  if ($("#reg-tiles")) {
    renderRegTiles();
    renderTicket();
    document.addEventListener("click", function (e) {
      var tile = e.target.closest("[data-tile]");
      if (tile) {
        var v = tile.getAttribute("data-tile");
        var item;
        if (v === "custom") {
          var name = prompt("Item name:");
          if (!name) return;
          var price = parseFloat(prompt("Price ($):") || "");
          if (!(price >= 0)) return;
          item = { name: name.trim(), price: Math.round(price * 100) / 100 };
        } else {
          var p = CATALOG.filter(function (x) { return x.price > 0; })[parseInt(v, 10)];
          item = { name: p.name, price: p.price };
        }
        var line = ticket.filter(function (l) { return l.name === item.name && l.price === item.price; })[0];
        if (line) line.qty++;
        else ticket.push({ name: item.name, price: item.price, qty: 1 });
        renderTicket();
        return;
      }
      var inc = e.target.closest("[data-reg-inc]"), dec = e.target.closest("[data-reg-dec]"),
          rm = e.target.closest("[data-reg-rm]");
      if (inc || dec || rm) {
        var i = parseInt((inc || dec || rm).getAttribute(inc ? "data-reg-inc" : dec ? "data-reg-dec" : "data-reg-rm"), 10);
        if (rm) ticket.splice(i, 1);
        else if (inc) ticket[i].qty++;
        else { ticket[i].qty--; if (ticket[i].qty <= 0) ticket.splice(i, 1); }
        renderTicket();
        return;
      }
      var mb = e.target.closest("#reg-methods button");
      if (mb) {
        regMethod = mb.getAttribute("data-method");
        $$("#reg-methods button").forEach(function (b) { b.classList.toggle("active", b === mb); });
        $("#reg-cash-row").hidden = regMethod !== "Cash";
        if (regMethod === "Cash") $("#reg-tendered").focus();
      }
    });
    ["#reg-disc", "#reg-tax"].forEach(function (s) { $(s).addEventListener("input", renderTicket); });
    $("#reg-tendered").addEventListener("input", paintChange);
    $("#reg-complete").addEventListener("click", completeSale);
    $("#reg-clear").addEventListener("click", function () {
      if (!ticket.length || confirm("Clear this sale?")) resetRegister();
    });
    $("#reg-new").addEventListener("click", resetRegister);
    $("#reg-print").addEventListener("click", function () { window.print(); });
  }

  /* ================= DAY SUMMARY ================= */
  function renderEod() {
    if (!$("#eod-date")) return;
    if (!$("#eod-date").value) $("#eod-date").value = todayISO();
    var day = $("#eod-date").value;

    var regSales = db.sales.filter(function (s) { return s.date === day && s.no.indexOf("R-") === 0; });
    var regGross = regSales.reduce(function (a, s) { return a + totalOf(s); }, 0);

    var pays = [];
    db.sales.forEach(function (s) {
      (s.payments || []).forEach(function (p) { if (p.date === day) pays.push(p); });
    });
    var received = pays.reduce(function (a, p) { return a + p.amount; }, 0);
    var cash = pays.filter(function (p) { return p.method === "Cash"; })
      .reduce(function (a, p) { return a + p.amount; }, 0);

    $("#eod-count").textContent = regSales.length;
    $("#eod-gross").textContent = fmt$(regGross);
    $("#eod-cash").textContent = fmt$(cash);
    $("#eod-received").textContent = fmt$(received);

    var byM = {};
    pays.forEach(function (p) {
      byM[p.method] = byM[p.method] || { n: 0, amt: 0 };
      byM[p.method].n++; byM[p.method].amt += p.amount;
    });
    $("#eod-pay").innerHTML = Object.keys(byM).sort(function (a, b) { return byM[b].amt - byM[a].amt; })
      .map(function (k) {
        return "<tr><td>" + esc(k) + '</td><td class="num">' + byM[k].n + '</td><td class="num"><b>' + fmt$(byM[k].amt) + "</b></td></tr>";
      }).join("") || "<tr><td colspan='3' class='muted' style='padding:1.2rem;text-align:center'>No payments this day.</td></tr>";

    var byP = {};
    regSales.forEach(function (s) {
      s.items.forEach(function (i) {
        byP[i.name] = byP[i.name] || { qty: 0, rev: 0 };
        byP[i.name].qty += i.qty; byP[i.name].rev += i.qty * i.price;
      });
    });
    $("#eod-prod").innerHTML = Object.keys(byP).sort(function (a, b) { return byP[b].rev - byP[a].rev; })
      .map(function (k) {
        return "<tr><td>" + esc(shortName(k)) + '</td><td class="num">' + byP[k].qty + '</td><td class="num"><b>' + fmt$(byP[k].rev) + "</b></td></tr>";
      }).join("") || "<tr><td colspan='3' class='muted' style='padding:1.2rem;text-align:center'>No register sales this day.</td></tr>";

    $("#eod-list").innerHTML = regSales.slice().reverse().map(function (s) {
      return "<tr><td><b>" + s.no + "</b></td><td>" + esc(clientOf(s).name) + "</td>" +
        "<td>" + s.items.map(function (i) { return i.qty + "× " + esc(shortName(i.name)); }).join(", ") + "</td>" +
        "<td>" + esc((s.payments[0] || {}).method || "—") + "</td>" +
        '<td class="num"><b>' + fmt$(totalOf(s)) + "</b></td></tr>";
    }).join("") || "<tr><td colspan='5' class='muted' style='padding:1.2rem;text-align:center'>No register sales this day.</td></tr>";
  }
  if ($("#eod-date")) {
    $("#eod-date").addEventListener("change", renderEod);
    $("#eod-print").addEventListener("click", function () { window.print(); });
  }

  /* ================= WEBSITE ORDERS (from the shop checkout) ================= */
  var WEB_KEY = "ef_web_orders_v1";
  function webOrders() {
    try { return JSON.parse(localStorage.getItem(WEB_KEY)) || []; } catch (e) { return []; }
  }
  function saveWebOrders(list) {
    try { localStorage.setItem(WEB_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function renderWebOrders() {
    var body = $("#weborders-body");
    if (!body) return;
    var list = webOrders();
    var fresh = list.filter(function (o) { return o.status === "New"; }).length;
    var badge = $("#web-count");
    if (badge) { badge.textContent = fresh; badge.hidden = !fresh; }

    body.innerHTML = list.map(function (o) {
      var d = new Date(o.date);
      var when = (d.getMonth() + 1) + "/" + d.getDate() + " " +
        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      var c = o.customer || {};
      var contact = [c.phone, c.email, c.address].filter(Boolean).map(esc).join("<br>");
      var items = (o.items || []).map(function (i) { return i.qty + "× " + esc(i.name); }).join("<br>");
      var action = o.status === "New"
        ? '<button class="btn btn-ginger" style="white-space:nowrap" data-import="' + o.id + '">Create invoice</button>'
        : '<span class="muted">' + esc(o.invoiceNo || "") + "</span>";
      return "<tr><td><b>" + esc(o.no) + "</b>" +
        (c.note ? "<br><small class='muted'>“" + esc(c.note) + "”</small>" : "") + "</td>" +
        "<td>" + when + "</td><td><b>" + esc(c.name || "—") + "</b></td>" +
        "<td style='font-size:.8rem'>" + (contact || "—") + "</td>" +
        "<td style='font-size:.82rem'>" + items + "</td>" +
        '<td class="num"><b>' + fmt$(o.total) + "</b></td>" +
        "<td>" + (o.status === "New" ? '<span class="badge info">New</span>' : '<span class="badge ok">Invoiced</span>') + "</td>" +
        "<td>" + action + "</td></tr>";
    }).join("") ||
      "<tr><td colspan='8' style='text-align:center;color:var(--muted);padding:1.8rem'>No website orders yet. When a customer checks out on the shop, their order and contact details land here.</td></tr>";
  }

  /* ---- online sync: pull orders from the Google Sheet bridge ---- */
  var SYNC_KEY_STORE = "ef_sync_key";
  function syncStatus(msg, ok) {
    var el = $("#sync-status");
    if (el) { el.textContent = msg; el.style.color = ok ? "var(--green)" : "var(--muted)"; }
  }
  function syncWebOrders(manual) {
    var hook = (window.EF_CONFIG || {}).orderWebhook;
    var key = localStorage.getItem(SYNC_KEY_STORE) || "";
    if (!hook) { syncStatus("Online sync not configured yet — orders from this browser only."); return; }
    if (!key) { syncStatus("Sync key needed — click “Connect sync”."); return; }
    syncStatus("Syncing…");
    fetch(hook + (hook.indexOf("?") >= 0 ? "&" : "?") + "key=" + encodeURIComponent(key))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { syncStatus("Sync failed: " + data.error); return; }
        var remote = data.orders || [];
        var local = webOrders();
        var known = {};
        local.forEach(function (o) { known[o.no] = true; });
        var added = 0;
        remote.forEach(function (o) {
          if (o && o.no && !known[o.no]) { local.push(o); added++; }
        });
        if (added) {
          local.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
          saveWebOrders(local);
          renderWebOrders();
        }
        syncStatus("✓ Synced " + new Date().toLocaleTimeString() + " — " + remote.length +
          " online orders" + (added ? " (" + added + " new)" : ""), true);
      })
      .catch(function (e) { syncStatus("Sync failed — check your connection. " + (manual ? e : "")); });
  }
  if ($("#sync-now")) {
    $("#sync-now").addEventListener("click", function () { syncWebOrders(true); });
    $("#sync-connect").addEventListener("click", function () {
      var k = prompt("Paste the sync key (the KEY you set in the Google Apps Script):",
        localStorage.getItem(SYNC_KEY_STORE) || "");
      if (k !== null) {
        localStorage.setItem(SYNC_KEY_STORE, k.trim());
        syncWebOrders(true);
      }
    });
    syncWebOrders(false);
    setInterval(function () { syncWebOrders(false); }, 120000);   // refresh every 2 minutes
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-import]");
    if (!btn) return;
    var list = webOrders();
    var o = list.filter(function (x) { return String(x.id) === btn.getAttribute("data-import"); })[0];
    if (!o) return;
    var c = o.customer || {};
    var client = findClient(c.name, c.phone);
    if (!client) {
      client = { id: nextClientId(), name: c.name || "Website customer", business: "",
                 phone: c.phone || "", email: c.email || "", address: c.address || "",
                 city: "", created: todayISO() };
      db.clients.push(client);
    }
    var sale = {
      id: db.sales.reduce(function (m, s) { return Math.max(m, s.id); }, 0) + 1,
      no: "PI-" + (++db.nextNo),
      docType: "proforma",
      date: todayISO(), clientId: client.id, type: "Retail",
      items: (o.items || []).map(function (i) { return { name: i.name, qty: i.qty, price: i.price }; }),
      delivery: 0, discount: 0, taxRate: 0, validDays: 14,
      notes: "Website order " + o.no + (c.note ? " — “" + c.note + "”" : ""),
      payments: []
    };
    db.sales.push(sale);
    save();
    o.status = "Invoiced"; o.invoiceNo = sale.no;
    saveWebOrders(list);
    renderEverything();
    $("#inv-select").value = sale.id;
    renderInvoice();
    $$(".side nav button[data-view=invoice]")[0].click();
  });

  /* ================= RETURNS & SPOILAGE ================= */
  var ISSUE_REASONS = {
    "return": ["Damaged in transit", "Quality complaint", "Wrong item delivered",
               "Customer changed mind", "Expired on arrival", "Other"],
    spoilage: ["Expired", "Broken / leaking bottle", "Storage failure",
               "Production fault", "Other"]
  };
  var issueKind = "return";

  function issueSetup() {
    if (!$("#issue-form")) return;
    $("#is-date").value = todayISO();

    $("#is-product").innerHTML = CATALOG.filter(function (p) { return p.price > 0; })
      .map(function (p) { return "<option>" + esc(p.name) + "</option>"; }).join("") +
      '<option value="__custom">Custom / other product…</option>';
    $("#is-product").addEventListener("change", function () {
      $("#is-custom-wrap").hidden = this.value !== "__custom";
    });

    function paintKind() {
      $("#is-reason").innerHTML = ISSUE_REASONS[issueKind]
        .map(function (r) { return "<option>" + r + "</option>"; }).join("");
      var isReturn = issueKind === "return";
      $("#is-invoice-wrap").hidden = !isReturn;
      $("#is-refund-wrap").hidden = !isReturn;
    }
    $$("#is-kind button").forEach(function (b) {
      b.addEventListener("click", function () {
        issueKind = b.getAttribute("data-kind");
        $$("#is-kind button").forEach(function (x) { x.classList.toggle("active", x === b); });
        paintKind();
      });
    });
    paintKind();

    $("#is-refund").addEventListener("change", function () {
      $("#is-refund-fields").hidden = !this.checked;
      if (this.checked && !$("#is-refund-amt").value) {
        var qty = parseInt($("#is-qty").value, 10) || 1;
        var val = parseFloat($("#is-value").value) || 0;
        $("#is-refund-amt").value = (qty * val).toFixed(2);
      }
    });

    $("#issue-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var product = $("#is-product").value === "__custom" ? $("#is-custom").value.trim() : $("#is-product").value;
      if (!product) { alert("Enter the product name."); return; }
      var qty = Math.max(1, parseInt($("#is-qty").value, 10) || 1);
      var val = Math.max(0, parseFloat($("#is-value").value) || 0);
      var refund = issueKind === "return" && $("#is-refund").checked;
      db.issues.unshift({
        id: db.issues.reduce(function (m, x) { return Math.max(m, x.id || 0); }, 0) + 1,
        date: $("#is-date").value || todayISO(),
        kind: issueKind,
        product: product, qty: qty, unitValue: val,
        saleId: issueKind === "return" ? (parseInt($("#is-invoice").value, 10) || null) : null,
        reason: $("#is-reason").value,
        refundAmount: refund ? Math.max(0, parseFloat($("#is-refund-amt").value) || 0) : 0,
        refundMethod: refund ? $("#is-refund-method").value : null,
        notes: $("#is-notes").value.trim()
      });
      save();
      this.reset();
      $("#is-date").value = todayISO(); $("#is-qty").value = "1"; $("#is-value").value = "42.00";
      $("#is-refund-fields").hidden = true; $("#is-custom-wrap").hidden = true;
      renderEverything();
    });
  }
  issueSetup();

  function renderIssueInvoiceSelect() {
    var sel = $("#is-invoice");
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = "<option value=''>— Not linked —</option>" +
      db.sales.slice(-50).reverse().map(function (s) {
        return '<option value="' + s.id + '">' + displayNo(s) + " — " + esc(clientOf(s).name) + "</option>";
      }).join("");
    if (cur && $$("option", sel).some(function (o) { return o.value === cur; })) sel.value = cur;
  }

  function issuesInDays(days) {
    var cutoff = Date.now() - days * 86400000;
    return db.issues.filter(function (x) { return new Date(x.date).getTime() >= cutoff; });
  }

  function renderIssues() {
    var body = $("#issues-body");
    if (!body) return;
    var recent = issuesInDays(30);
    var rets = recent.filter(function (x) { return x.kind === "return"; });
    var spoil = recent.filter(function (x) { return x.kind === "spoilage"; });
    $("#is-kpi-returns").textContent = rets.reduce(function (a, x) { return a + x.qty; }, 0) + " packs";
    $("#is-kpi-refunds").textContent = fmt$(rets.reduce(function (a, x) { return a + (x.refundAmount || 0); }, 0));
    $("#is-kpi-spoilqty").textContent = spoil.reduce(function (a, x) { return a + x.qty; }, 0) + " packs";
    $("#is-kpi-spoilval").textContent = fmt$(spoil.reduce(function (a, x) { return a + x.qty * x.unitValue; }, 0));

    body.innerHTML = db.issues.slice(0, 100).map(function (x) {
      var sale = x.saleId ? db.sales.filter(function (s) { return s.id === x.saleId; })[0] : null;
      return "<tr><td>" + x.date + "</td>" +
        "<td>" + (x.kind === "return" ? '<span class="badge warn">Return</span>' : '<span class="badge bad">Spoilt</span>') + "</td>" +
        "<td>" + esc(shortName(x.product)) + (sale ? "<br><small class='muted'>" + displayNo(sale) + "</small>" : "") +
        (x.notes ? "<br><small class='muted'>" + esc(x.notes) + "</small>" : "") + "</td>" +
        '<td class="num">' + x.qty + "</td>" +
        '<td class="num">' + fmt$(x.qty * x.unitValue) + "</td>" +
        "<td>" + esc(x.reason || "—") + "</td>" +
        "<td>" + (x.refundAmount ? "<b>" + fmt$(x.refundAmount) + "</b><br><small class='muted'>" + esc(x.refundMethod || "") + "</small>" : "—") + "</td>" +
        '<td><button class="rm" data-issue-del="' + x.id + '" title="Delete">×</button></td></tr>';
    }).join("") ||
      "<tr><td colspan='8' style='text-align:center;color:var(--muted);padding:1.6rem'>Nothing recorded yet — hopefully it stays that way! 🌿</td></tr>";
  }

  document.addEventListener("click", function (e) {
    var del = e.target.closest("[data-issue-del]");
    if (!del) return;
    if (!confirm("Delete this record?")) return;
    var id = parseInt(del.getAttribute("data-issue-del"), 10);
    db.issues = db.issues.filter(function (x) { return x.id !== id; });
    save();
    renderEverything();
  });

  /* ================= REPORT ================= */
  function reportSales() {
    var range = $("#report-range").value;
    if (range === "all") return db.sales;
    var days = parseInt(range, 10);
    var cutoff = Date.now() - days * 86400000;
    return db.sales.filter(function (s) { return new Date(s.date).getTime() >= cutoff; });
  }
  function renderReport() {
    if (!$("#rep-sales")) return;
    var sales = reportSales();
    var revenue = sales.reduce(function (a, s) { return a + totalOf(s); }, 0);
    var received = sales.reduce(function (a, s) { return a + paidOf(s); }, 0);
    $("#rep-sales").textContent = sales.length;
    $("#rep-revenue").textContent = fmt$(revenue);
    $("#rep-received").textContent = fmt$(received);
    $("#rep-outstanding").textContent = fmt$(revenue - received);

    // sales by month (last 6 months, all data)
    var months = [], now = new Date();
    for (var m = 5; m >= 0; m--) {
      var d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      var key = d.toISOString().slice(0, 7);
      var label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      var tot = db.sales.filter(function (s) { return s.date.slice(0, 7) === key; })
        .reduce(function (a, s) { return a + totalOf(s); }, 0);
      months.push({ label: label, total: tot });
    }
    var maxM = Math.max.apply(null, months.map(function (x) { return x.total; })) || 1;
    $("#report-months").innerHTML = months.map(function (x) {
      return '<div class="hbar"><span>' + x.label + '</span><div class="track"><i style="width:' +
        (x.total / maxM * 100) + '%"></i></div><span class="num">' + fmt$(x.total) + "</span></div>";
    }).join("");

    // top clients
    var byClient = {};
    sales.forEach(function (s) {
      var c = clientOf(s);
      byClient[c.name] = (byClient[c.name] || 0) + totalOf(s);
    });
    var tc = Object.keys(byClient).map(function (k) { return { name: k, v: byClient[k] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 6);
    var maxC = tc.length ? tc[0].v : 1;
    $("#report-clients").innerHTML = tc.map(function (x) {
      return '<div class="hbar"><span style="width:74px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(x.name) +
        '</span><div class="track"><i style="width:' + (x.v / maxC * 100) + '%"></i></div><span class="num">' + fmt$(x.v) + "</span></div>";
    }).join("") || '<p class="muted">No sales in this period.</p>';

    // sales by US season — across ALL recorded sales, so the yearly pattern shows
    if ($("#report-seasons")) {
      var SEASONS = [
        { key: "Summer", label: "☀️ Summer", months: [5, 6, 7], hint: "Jun–Aug" },
        { key: "Fall",   label: "🍂 Fall",   months: [8, 9, 10], hint: "Sep–Nov" },
        { key: "Winter", label: "❄️ Winter", months: [11, 0, 1], hint: "Dec–Feb" },
        { key: "Spring", label: "🌱 Spring", months: [2, 3, 4], hint: "Mar–May" }
      ];
      var seasonAgg = {};
      SEASONS.forEach(function (s) { seasonAgg[s.key] = { rev: 0, packs: 0, n: 0 }; });
      db.sales.forEach(function (s) {
        var m = new Date(s.date).getMonth();
        var season = SEASONS.filter(function (x) { return x.months.indexOf(m) >= 0; })[0];
        if (!season) return;
        var a = seasonAgg[season.key];
        a.rev += totalOf(s);
        a.n++;
        a.packs += s.items.reduce(function (t, i) { return t + i.qty; }, 0);
      });
      var maxRev = Math.max.apply(null, SEASONS.map(function (s) { return seasonAgg[s.key].rev; })) || 1;
      $("#report-seasons").innerHTML = SEASONS.map(function (s) {
        var a = seasonAgg[s.key];
        return '<div class="hbar"><span title="' + s.hint + '">' + s.label +
          '</span><div class="track"><i style="width:' + (a.rev / maxRev * 100) + '%"></i></div>' +
          '<span class="num">' + fmt$0(a.rev) + "<br><small class='muted' style='font-weight:400'>" +
          a.packs + " packs · " + a.n + " sales</small></span></div>";
      }).join("");
      var best = SEASONS.slice().sort(function (a, b) { return seasonAgg[b.key].rev - seasonAgg[a.key].rev; })[0];
      var bestAgg = seasonAgg[best.key];
      $("#report-season-note").innerHTML = bestAgg.rev
        ? "🏆 Best season so far: <b>" + best.label + " (" + best.hint + ")</b> with " +
          fmt$0(bestAgg.rev) + " from " + bestAgg.packs + " packs. This gets more reliable as more sales are recorded across the year."
        : "Record sales through the year and this will show which season sells most.";
    }

    // returns & spoilage losses for the same period
    if ($("#rep-loss")) {
      var rng = $("#report-range").value;
      var iss = rng === "all" ? db.issues : issuesInDays(parseInt(rng, 10));
      var rts = iss.filter(function (x) { return x.kind === "return"; });
      var spl = iss.filter(function (x) { return x.kind === "spoilage"; });
      function lossCard(label, value) {
        return "<div><span class='muted'>" + label + "</span><b>" + value + "</b></div>";
      }
      $("#rep-loss").innerHTML =
        lossCard("Packs returned", rts.reduce(function (a, x) { return a + x.qty; }, 0)) +
        lossCard("Value of returns", fmt$(rts.reduce(function (a, x) { return a + x.qty * x.unitValue; }, 0))) +
        lossCard("Refunds paid out", fmt$(rts.reduce(function (a, x) { return a + (x.refundAmount || 0); }, 0))) +
        lossCard("Packs spoilt", spl.reduce(function (a, x) { return a + x.qty; }, 0)) +
        lossCard("Spoilage value", fmt$(spl.reduce(function (a, x) { return a + x.qty * x.unitValue; }, 0)));
    }

    // products sold
    var byProd = {};
    sales.forEach(function (s) {
      s.items.forEach(function (i) {
        byProd[i.name] = byProd[i.name] || { qty: 0, rev: 0 };
        byProd[i.name].qty += i.qty; byProd[i.name].rev += i.qty * i.price;
      });
    });
    $("#report-products").innerHTML = Object.keys(byProd).sort(function (a, b) { return byProd[b].rev - byProd[a].rev; })
      .map(function (k) {
        return "<tr><td>" + esc(k) + '</td><td class="num">' + byProd[k].qty + '</td><td class="num"><b>' + fmt$(byProd[k].rev) + "</b></td></tr>";
      }).join("") || "<tr><td colspan='3' style='text-align:center;color:var(--muted);padding:1.6rem'>No sales in this period.</td></tr>";
  }

  var repRange = $("#report-range");
  if (repRange) {
    repRange.addEventListener("change", renderReport);
    $("#report-print").addEventListener("click", function () { window.print(); });
  }

  /* ================= boot ================= */
  function renderEverything() {
    renderWebOrders();
    renderRegCust();
    renderEod();
    renderClientPicker();
    renderInvoiceSelect();
    renderIssueInvoiceSelect();
    renderIssues();
    renderInvoice();
    renderSInvoice();
    renderClients();
    renderAccount();
    renderPaySelect();
    renderPayments();
    renderReport();
  }
  renderEverything();

  // live-refresh the inbox when an order is placed in another tab of this browser
  window.addEventListener("storage", function (e) {
    if (e.key === WEB_KEY) renderWebOrders();
  });
})();
