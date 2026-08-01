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
  save();

  /* ================= helpers ================= */
  function clientOf(sale) {
    return db.clients.filter(function (c) { return c.id === sale.clientId; })[0] ||
           { name: "Unknown", business: "", phone: "", email: "", address: "", city: "" };
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

      var sale = {
        id: db.sales.reduce(function (m, s) { return Math.max(m, s.id); }, 0) + 1,
        no: "PI-" + (++db.nextNo),
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
      $("#inv-select").value = sale.id;
      renderInvoice();
      $$(".side nav button[data-view=invoice]")[0].click();
    });
  }

  /* ================= PROFORMA INVOICE ================= */
  function renderInvoiceSelect() {
    var sel = $("#inv-select");
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = db.sales.slice().reverse().map(function (s) {
      var c = clientOf(s);
      return '<option value="' + s.id + '">' + s.no + " — " + esc(c.name) + " — " + fmt$(totalOf(s)) + " (" + statusOf(s) + ")</option>";
    }).join("") || "<option value=''>No invoices yet — create one under Sales</option>";
    if (cur && $$("option", sel).some(function (o) { return o.value === cur; })) sel.value = cur;
  }

  function renderInvoice() {
    var host = $("#invoice-sheet");
    if (!host) return;
    var id = parseInt($("#inv-select").value, 10);
    var sale = db.sales.filter(function (s) { return s.id === id; })[0];
    if (!sale) { host.innerHTML = '<div class="panel muted">No invoice selected. Record a sale first under <b>Sales</b>.</div>'; return; }
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
      '<div class="inv-title">PROFORMA INVOICE</div>' +
      '<div class="inv-meta">' +
      "<span>Invoice No.<b>" + sale.no + "</b></span>" +
      "<span>Date<b>" + sale.date + "</b></span>" +
      "<span>Valid until<b>" + valid.toISOString().slice(0, 10) + "</b></span>" +
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
      "<div>This proforma invoice is not a demand for payment.<br>Prices valid until the date shown above.<br>Free shipping across the USA on standard orders.</div>" +
      '<div class="inv-sign">Authorized signature</div>' +
      "</div>" +
      '<div class="inv-foot">Thank you for your business! · ' + COMPANY.name + " · " + COMPANY.phone + " · " + COMPANY.email + "</div>" +
      "</div>";
  }

  var invSel = $("#inv-select");
  if (invSel) {
    $("#inv-new").addEventListener("click", function () {
      $$(".side nav button[data-view=sales]")[0].click();
      var n = $("#s-name"); if (n) n.focus();
    });
    invSel.addEventListener("change", renderInvoice);
    $("#inv-print").addEventListener("click", function () { window.print(); });
    $("#inv-pay").addEventListener("click", function () {
      var id = $("#inv-select").value;
      $$(".side nav button[data-view=payment]")[0].click();
      if ($("#pay-invoice")) { $("#pay-invoice").value = id; paintPayBalance(); }
    });
  }

  /* ================= CLIENT DATABASE ================= */
  function renderClients() {
    var body = $("#clients-body");
    if (!body) return;
    var q = ($("#client-search").value || "").toLowerCase();
    var rows = db.clients.filter(function (c) {
      return !q || (c.name + " " + (c.business || "") + " " + (c.phone || "")).toLowerCase().indexOf(q) >= 0;
    }).map(function (c) {
      var sales = db.sales.filter(function (s) { return s.clientId === c.id; });
      var invoiced = sales.reduce(function (a, s) { return a + totalOf(s); }, 0);
      var balance = sales.reduce(function (a, s) { return a + balanceOf(s); }, 0);
      return "<tr><td><b>" + esc(c.name) + "</b></td><td>" + esc(c.business || "—") + "</td>" +
        "<td>" + esc(c.phone || "—") + "</td><td>" + esc(c.email || "—") + "</td><td>" + esc(c.city || "—") + "</td>" +
        '<td class="num">' + sales.length + '</td><td class="num">' + fmt$(invoiced) + "</td>" +
        '<td class="num">' + (balance > 0 ? "<b style='color:var(--red)'>" + fmt$(balance) + "</b>" : fmt$(0)) + "</td></tr>";
    });
    body.innerHTML = rows.join("") ||
      "<tr><td colspan='8' style='text-align:center;color:var(--muted);padding:1.6rem'>No clients yet — they're added automatically when you record a sale.</td></tr>";
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
      return '<option value="' + s.id + '">' + s.no + " — " + esc(clientOf(s).name) +
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
        rows.push({ date: p.date, no: s.no, client: clientOf(s).name, method: p.method, ref: p.ref, amount: p.amount });
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
    renderClientPicker();
    renderInvoiceSelect();
    renderInvoice();
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
