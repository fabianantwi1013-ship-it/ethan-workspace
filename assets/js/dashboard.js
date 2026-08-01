/* Ethan Foods — POS dashboard.
   Data sources, in order of preference:
     1. LIVE  — /api/data served by server.py, which proxies the WooCommerce
                REST API (see woo-config.json). Used automatically when present.
     2. DEMO  — 90 days of deterministic generated sales, so the dashboard
                still works when opened as a plain file or before keys exist. */
(function () {
  "use strict";

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var fmt$ = function (n) {
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var fmt$0 = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };
  var title = function (s) { return s.replace(/[-_]/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };

  var DAY = 86400000;

  /* ---------- state (filled by demo or live loader) ---------- */
  var PRODUCTS = [];   // {key,name,sku,price,cost,stock,reorder,img}
  var orders = [];     // {no,date,hour,customer,channel,pay,lines:[{label,qty,price,cost}],subtotal,discount,tax,total,refunded,status}
  var customers = [];  // {name,city,since,orders,spent,last}
  var TODAY = new Date();
  var LIVE = false;

  /* ---------- product image matching (works for demo & live names) ---------- */
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
      .replace(/\s*\((mild|spicy)\)\s*/i, "")
      .replace(/\ble[- ]?ginger[- ]?/i, "").replace(/juice/i, "")
      .replace(/^[\s—–-]+|[\s—–-]+$/g, "").trim() || name;
  }

  /* ============================================================
     DEMO DATA (seeded so figures are stable between reloads)
     ============================================================ */
  function buildDemoData() {
    var seed = 20260731;
    function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
    function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
    function between(a, b) { return a + rnd() * (b - a); }

    TODAY = new Date(2026, 6, 31);
    LIVE = false;

    PRODUCTS = [
      { key: "regular",   name: "Le Ginger — Regular",   sku: "EF-REG-8", price: 42, cost: 18.5, stock: 64, reorder: 24 },
      { key: "mango",     name: "Le Ginger — Mango",     sku: "EF-MAN-8", price: 42, cost: 19.0, stock: 41, reorder: 24 },
      { key: "sobolo",    name: "Sobolo — Hibiscus",     sku: "EF-SOB-8", price: 42, cost: 17.5, stock: 18, reorder: 24 },
      { key: "moringa",   name: "Le Ginger — Moringa",   sku: "EF-MOR-8", price: 42, cost: 19.5, stock: 33, reorder: 20 },
      { key: "pineapple", name: "Le Ginger — Pineapple", sku: "EF-PIN-8", price: 42, cost: 19.0, stock: 9,  reorder: 20 },
      { key: "turmeric",  name: "Le Ginger — Turmeric",  sku: "EF-TUR-8", price: 42, cost: 19.5, stock: 27, reorder: 20 }
    ];
    PRODUCTS.forEach(function (p) { p.img = matchImg(p.name); });

    var PAY = ["Card", "Card", "Card", "Cash", "Mobile Pay"];
    var CHANNEL = ["Online", "Online", "In-store", "Wholesale"];
    var FIRST = ["Maame", "Kwaku", "Vicentia", "Ama", "Kofi", "Efua", "Yaw", "Akosua", "Linda", "Marcus",
                 "Denise", "Samuel", "Grace", "Tunde", "Naomi", "Victor", "Patricia", "Jerome", "Abena", "Daniel"];
    var LAST = ["Mensah", "Freeman", "Boateng", "Owusu", "Johnson", "Appiah", "Williams", "Asante", "Brown",
                "Osei", "Carter", "Addo", "Thompson", "Sarpong", "Davis"];
    var CITIES = ["Columbus, OH", "Newark, NJ", "Bronx, NY", "Atlanta, GA", "Houston, TX", "Chicago, IL",
                  "Worcester, MA", "Alexandria, VA", "Charlotte, NC", "Philadelphia, PA"];

    orders = []; customers = [];
    var orderNo = 3407;
    for (var c = 0; c < 48; c++) {
      customers.push({
        name: pick(FIRST) + " " + pick(LAST), city: pick(CITIES),
        since: new Date(TODAY.getTime() - Math.floor(between(30, 700)) * DAY),
        orders: 0, spent: 0, last: null
      });
    }
    for (var d = 89; d >= 0; d--) {
      var date = new Date(TODAY.getTime() - d * DAY);
      var dow = date.getDay();
      var base = 5 + (dow === 5 ? 3 : 0) + (dow === 6 ? 4 : 0) + (dow === 0 ? 2 : 0);
      var growth = 1 + (89 - d) / 89 * 0.35;
      var n = Math.max(1, Math.round(base * growth * between(0.6, 1.4)));
      for (var i = 0; i < n; i++) {
        var lines = [], used = {};
        var nLines = rnd() < 0.72 ? 1 : (rnd() < 0.8 ? 2 : 3);
        for (var l = 0; l < nLines; l++) {
          var p;
          do { p = PRODUCTS[Math.floor(Math.pow(rnd(), 1.35) * PRODUCTS.length)]; } while (used[p.key]);
          used[p.key] = 1;
          lines.push({ label: shortName(p.name), qty: rnd() < 0.82 ? 1 : 2, price: p.price, cost: p.cost });
        }
        var channel = pick(CHANNEL);
        if (channel === "Wholesale") lines.forEach(function (li) { li.qty += Math.floor(between(3, 10)); });
        var subtotal = lines.reduce(function (a, li) { return a + li.qty * li.price; }, 0);
        var discount = rnd() < 0.08 ? Math.round(subtotal * 10) / 100 : 0;
        var tax = Math.round((subtotal - discount) * 6.5) / 100;
        var refunded = rnd() < 0.018;
        var hour = Math.floor(Math.min(23, Math.max(7, 13 + (rnd() + rnd() - 1) * 7)));
        var cust = customers[Math.floor(Math.pow(rnd(), 1.6) * customers.length)];
        var total = subtotal - discount + tax;
        orders.push({
          no: "EF-" + (orderNo++), date: date, hour: hour, customer: cust.name,
          channel: channel,
          pay: channel === "In-store" ? pick(PAY) : (channel === "Wholesale" ? "Invoice" : pick(["Card", "Card", "Mobile Pay"])),
          lines: lines, subtotal: subtotal, discount: discount, tax: tax, total: total,
          refunded: refunded,
          status: refunded ? "Refunded" : (d === 0 && rnd() < 0.3 ? "Processing" : (channel === "Wholesale" && rnd() < 0.25 ? "Pending" : "Completed"))
        });
        cust.orders++; cust.spent += refunded ? 0 : total;
        if (!cust.last || date > cust.last) cust.last = date;
      }
    }
    orders.reverse();
  }

  /* ============================================================
     LIVE DATA — transform the WooCommerce payload from server.py
     ============================================================ */
  var EST_COST_RATIO = 0.45;   // Woo has no cost prices; estimate margin at 45% of retail

  function buildLiveData(payload) {
    LIVE = true;
    TODAY = new Date();

    PRODUCTS = (payload.products || []).map(function (p) {
      var price = parseFloat(p.price) || 0;
      return {
        key: String(p.id), name: p.name, sku: p.sku || "—",
        price: price, cost: Math.round(price * EST_COST_RATIO * 100) / 100,
        stock: (typeof p.stock_quantity === "number") ? p.stock_quantity : null,
        stockStatus: p.stock_status,
        reorder: 20, img: matchImg(p.name)
      };
    });

    var custByKey = {};
    orders = (payload.orders || []).map(function (o) {
      var date = new Date(o.date_created);
      var b = o.billing || {};
      var name = ((b.first_name || "") + " " + (b.last_name || "")).trim() || "Guest";
      var st = (o.status || "").toLowerCase();
      var refunded = st === "refunded" || st === "cancelled" || st === "failed";
      var via = (o.created_via || "").toLowerCase();
      var channel = via === "checkout" || via === "store-api" ? "Online" :
                    via === "admin" ? "Manual" : via ? title(via) : "Online";
      var lines = (o.line_items || []).map(function (li) {
        var price = parseFloat(li.price) || 0;
        return { label: shortName(li.name), qty: li.quantity || 0, price: price,
                 cost: Math.round(price * EST_COST_RATIO * 100) / 100 };
      });
      var total = parseFloat(o.total) || 0;
      var tax = parseFloat(o.total_tax) || 0;
      var discount = parseFloat(o.discount_total) || 0;

      var key = (b.email || name).toLowerCase();
      var cust = custByKey[key];
      if (!cust) {
        cust = custByKey[key] = {
          name: name, city: [b.city, b.state].filter(Boolean).join(", ") || "—",
          since: date, orders: 0, spent: 0, last: null
        };
      }
      cust.orders++; cust.spent += refunded ? 0 : total;
      if (!cust.last || date > cust.last) cust.last = date;
      if (date < cust.since) cust.since = date;

      return {
        no: "#" + (o.number || o.id), date: date, hour: date.getHours(),
        customer: name, channel: channel,
        pay: o.payment_method_title || "Other",
        lines: lines, subtotal: total - tax + discount, discount: discount, tax: tax,
        total: total, refunded: refunded, status: title(st || "unknown")
      };
    }).sort(function (a, b) { return b.date - a.date; });

    customers = Object.keys(custByKey).map(function (k) { return custByKey[k]; });
  }

  /* ---------- aggregation ---------- */
  function inRange(o, days) { return (TODAY - o.date) / DAY < days; }
  function sum(list, f) { return list.reduce(function (a, x) { return a + f(x); }, 0); }
  function aggregate(days) {
    var cur = orders.filter(function (o) { return inRange(o, days) && !o.refunded; });
    var prev = orders.filter(function (o) {
      var age = (TODAY - o.date) / DAY; return age >= days && age < days * 2 && !o.refunded;
    });
    var gross = sum(cur, function (o) { return o.total; });
    var prevGross = sum(prev, function (o) { return o.total; });
    return {
      orders: cur, gross: gross, tx: cur.length,
      items: sum(cur, function (o) { return sum(o.lines, function (l) { return l.qty; }); }),
      avg: cur.length ? gross / cur.length : 0,
      dGross: prevGross ? (gross - prevGross) / prevGross * 100 : 0,
      dTx: prev.length ? (cur.length - prev.length) / prev.length * 100 : 0,
      discounts: sum(cur, function (o) { return o.discount; }),
      tax: sum(cur, function (o) { return o.tax; }),
      refunds: sum(orders.filter(function (o) { return inRange(o, days) && o.refunded; }), function (o) { return o.total; })
    };
  }

  /* ---------- tiny SVG chart builders ---------- */
  var NS = "http://www.w3.org/2000/svg";
  function svgEl(w, h) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 " + w + " " + h);
    return s;
  }
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function lineChart(host, series, labels) {
    var W = 640, H = 240, PL = 46, PB = 26, PT = 12;
    var s = svgEl(W, H);
    var max = Math.max.apply(null, series) * 1.15 || 1;
    var iw = (W - PL - 12) / Math.max(series.length - 1, 1);
    for (var g = 0; g <= 4; g++) {
      var y = PT + (H - PB - PT) * g / 4;
      el("line", { x1: PL, y1: y, x2: W - 8, y2: y, stroke: "#EDE7DA", "stroke-width": 1 }, s);
      el("text", { x: PL - 8, y: y + 4, "text-anchor": "end", "font-size": 10, fill: "#9A8B75" }, s)
        .textContent = fmt$0(max * (1 - g / 4));
    }
    var pts = series.map(function (v, i) {
      return [PL + i * iw, PT + (H - PB - PT) * (1 - v / max)];
    });
    var dAttr = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var grad = el("linearGradient", { id: "gA", x1: 0, y1: 0, x2: 0, y2: 1 }, s);
    el("stop", { offset: "0%", "stop-color": "#C8721C", "stop-opacity": .28 }, grad);
    el("stop", { offset: "100%", "stop-color": "#C8721C", "stop-opacity": 0 }, grad);
    el("path", { d: dAttr + " L" + pts[pts.length - 1][0] + " " + (H - PB) + " L" + PL + " " + (H - PB) + " Z", fill: "url(#gA)" }, s);
    el("path", { d: dAttr, fill: "none", stroke: "#C8721C", "stroke-width": 2.5, "stroke-linecap": "round" }, s);
    el("circle", { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 4.5, fill: "#C8721C", stroke: "#fff", "stroke-width": 2 }, s);
    var step = Math.ceil(labels.length / 7);
    labels.forEach(function (lb, i) {
      if (i % step === 0 || i === labels.length - 1) {
        el("text", { x: PL + i * iw, y: H - 8, "text-anchor": "middle", "font-size": 10, fill: "#9A8B75" }, s).textContent = lb;
      }
    });
    host.innerHTML = ""; host.appendChild(s);
  }

  function barChart(host, values, labels, color) {
    var W = 640, H = 210, PL = 40, PB = 24, PT = 10;
    var s = svgEl(W, H);
    var max = Math.max.apply(null, values) * 1.15 || 1;
    var bw = (W - PL - 12) / values.length;
    for (var g = 0; g <= 3; g++) {
      var y = PT + (H - PB - PT) * g / 3;
      el("line", { x1: PL, y1: y, x2: W - 8, y2: y, stroke: "#EDE7DA" }, s);
      el("text", { x: PL - 8, y: y + 4, "text-anchor": "end", "font-size": 10, fill: "#9A8B75" }, s)
        .textContent = fmt$0(max * (1 - g / 3));
    }
    values.forEach(function (v, i) {
      var h = (H - PB - PT) * v / max;
      el("rect", {
        x: PL + i * bw + bw * 0.18, y: H - PB - h, width: bw * 0.64, height: Math.max(h, 1.5),
        rx: 4, fill: color || "#1F7A43", opacity: v ? 1 : .35
      }, s);
      if (labels[i]) {
        el("text", { x: PL + i * bw + bw / 2, y: H - 7, "text-anchor": "middle", "font-size": 9.5, fill: "#9A8B75" }, s).textContent = labels[i];
      }
    });
    host.innerHTML = ""; host.appendChild(s);
  }

  function donut(host, parts) {
    var size = 180, r = 70, cx = 90, cy = 90, thick = 26;
    var s = svgEl(size, size);
    var total = sum(parts, function (p) { return p.v; }) || 1;
    var a0 = -Math.PI / 2;
    parts.forEach(function (p) {
      var frac = Math.max(p.v / total, 0.004);
      var a1 = a0 + frac * Math.PI * 2 - 0.03;
      var large = frac > 0.5 ? 1 : 0;
      var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      el("path", {
        d: "M" + x0 + " " + y0 + " A" + r + " " + r + " 0 " + large + " 1 " + x1 + " " + y1,
        fill: "none", stroke: p.c, "stroke-width": thick, "stroke-linecap": "round"
      }, s);
      a0 = a1 + 0.03;
    });
    host.innerHTML = ""; host.appendChild(s);
  }

  function spark(host, series, color) {
    var W = 120, H = 34;
    var s = svgEl(W, H);
    var max = Math.max.apply(null, series) || 1;
    var min = Math.min.apply(null, series);
    var iw = W / Math.max(series.length - 1, 1);
    var d = series.map(function (v, i) {
      var y = H - 3 - (H - 6) * (v - min) / (max - min || 1);
      return (i ? "L" : "M") + (i * iw).toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
    el("path", { d: d, fill: "none", stroke: color || "#C8721C", "stroke-width": 2 }, s);
    host.innerHTML = ""; host.appendChild(s);
  }

  /* ---------- render: overview ---------- */
  var range = 7;
  var PAY_COLORS = ["#C8721C", "#1F7A43", "#E9B44C", "#2D6CB5", "#8A4FA8", "#C0272D", "#5C8A5C"];

  function renderOverview() {
    var A = aggregate(range);

    $("#kpi-gross .value").textContent = fmt$(A.gross);
    $("#kpi-tx .value").textContent = A.tx.toLocaleString();
    $("#kpi-avg .value").textContent = fmt$(A.avg);
    $("#kpi-items .value").textContent = A.items.toLocaleString();
    setDelta("#kpi-gross .delta", A.dGross);
    setDelta("#kpi-tx .delta", A.dTx);

    var days = dailySeries(Math.max(range, 2));

    if ($("#chart-trend")) lineChart($("#chart-trend"), days.gross, days.labels);

    if ($("#chart-hours")) {
      var hours = [], hl = [];
      for (var h = 7; h <= 22; h++) {
        hours.push(sum(A.orders.filter(function (o) { return o.hour === h; }), function (o) { return o.total; }));
        hl.push(h <= 12 ? h + (h === 12 ? "p" : "a") : (h - 12) + "p");
      }
      barChart($("#chart-hours"), hours, hl, "#1F7A43");
    }

    if ($("#chart-pay")) {
      var payAgg = {};
      A.orders.forEach(function (o) { payAgg[o.pay] = (payAgg[o.pay] || 0) + o.total; });
      var parts = Object.keys(payAgg).sort(function (a, b) { return payAgg[b] - payAgg[a]; })
        .slice(0, 7).map(function (k, i) { return { k: k, v: payAgg[k], c: PAY_COLORS[i % PAY_COLORS.length] }; });
      donut($("#chart-pay"), parts.length ? parts : [{ k: "No sales", v: 1, c: "#EFEAE0" }]);
      $("#pay-center").innerHTML = "<b>" + fmt$0(A.gross) + "</b><span>total</span>";
      $("#pay-legend").innerHTML = parts.map(function (p) {
        return "<span><i style='background:" + p.c + "'></i>" + p.k + " · " + Math.round(p.v / (A.gross || 1) * 100) + "%</span>";
      }).join("");
    }

    if ($("#top-products")) {
      var byLabel = {};
      A.orders.forEach(function (o) {
        o.lines.forEach(function (l) {
          var t = byLabel[l.label] = byLabel[l.label] || { qty: 0, rev: 0, buyers: {} };
          t.qty += l.qty; t.rev += l.qty * l.price;
          if (o.customer) t.buyers[o.customer] = (t.buyers[o.customer] || 0) + l.qty;
        });
      });
      var top = Object.keys(byLabel).map(function (k) {
        var t = byLabel[k];
        var best = Object.keys(t.buyers).sort(function (a, b) { return t.buyers[b] - t.buyers[a]; })[0];
        return { label: k, qty: t.qty, rev: t.rev, buyer: best, buyerQty: best ? t.buyers[best] : 0 };
      }).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 6);
      var maxRev = top.length ? top[0].rev : 1;
      $("#top-products").innerHTML = top.map(function (t) {
        return '<div class="rank-row"><img src="' + matchImg(t.label) + '" alt="">' +
          '<div><b>' + t.label + '</b>' +
          (t.buyer ? '<div style="font-size:.74rem;color:var(--muted);margin:.12rem 0 .25rem">👤 Best customer: <b style="color:var(--ink)">' + t.buyer + '</b> · ' + t.buyerQty + ' packs</div>' : '') +
          '<div class="bar"><i style="width:' + (t.rev / maxRev * 100) + '%"></i></div></div>' +
          '<div style="text-align:right"><span class="num">' + fmt$0(t.rev) + '</span><br><small class="muted">' + t.qty + ' packs</small></div></div>';
      }).join("") || '<p class="muted">No sales in this period.</p>';
    }

    if ($("#sk-discounts")) {
      $("#sk-discounts").textContent = fmt$(A.discounts);
      $("#sk-tax").textContent = fmt$(A.tax);
      $("#sk-refunds").textContent = fmt$(A.refunds);
      var margin = sum(A.orders, function (o) {
        return sum(o.lines, function (l) { return l.qty * (l.price - l.cost); });
      });
      $("#sk-margin").textContent = fmt$0(margin) + (LIVE ? "*" : "");
    }

    if ($("#recent-body")) {
      $("#recent-body").innerHTML = orders.slice(0, 8).map(orderRow).join("") ||
        "<tr><td colspan='8' class='muted' style='padding:1.4rem'>No orders yet.</td></tr>";
    }

    if ($("#alerts")) {
      var month = aggregate(30);
      var soldByLabel = {};
      month.orders.forEach(function (o) {
        o.lines.forEach(function (l) { soldByLabel[l.label] = (soldByLabel[l.label] || 0) + l.qty; });
      });
      var tracked = PRODUCTS.filter(function (p) { return typeof p.stock === "number"; })
        .map(function (p) {
          var sold30 = soldByLabel[shortName(p.name)] || 0;
          var velocity = sold30 / 30;
          return {
            p: p, sold30: sold30,
            daysLeft: velocity ? Math.round(p.stock / velocity) : null,
            suggest: Math.max(p.reorder * 2 - p.stock, Math.ceil(velocity * 30) - p.stock, 0)
          };
        });
      var low = tracked.filter(function (t) { return t.p.stock <= t.p.reorder; })
        .sort(function (a, b) { return a.p.stock / a.p.reorder - b.p.stock / b.p.reorder; });

      $("#alerts").innerHTML =
        !tracked.length ? '<div class="alert-row" style="background:var(--blue-soft)">ℹ️<span>Stock tracking is not enabled for these products.</span></div>' :
        low.length ? low.map(function (t) {
          var critical = t.p.stock <= t.p.reorder / 2;
          return '<div class="alert-row ' + (critical ? "bad" : "warn") + '">' + (critical ? "🚨" : "⚠️") +
            '<span><b>' + t.p.name + '</b> — <b>' + t.p.stock + ' packs left</b> (reorder point: ' + t.p.reorder + ')' +
            '<br><small>Sold ' + t.sold30 + ' in the last 30 days' +
            (t.daysLeft !== null ? ' · runs out in about <b>' + (t.daysLeft > 60 ? "60+" : t.daysLeft) + ' days</b>' : "") +
            (t.suggest ? ' · suggested order: <b>' + t.suggest + ' packs</b>' : "") +
            '</small></span></div>';
        }).join("") :
        (function () {
          var soonest = tracked.filter(function (t) { return t.daysLeft !== null; })
            .sort(function (a, b) { return a.daysLeft - b.daysLeft; })[0];
          return '<div class="alert-row" style="background:var(--green-soft)">✅<span>All products are above reorder levels.' +
            (soonest ? '<br><small>Next to watch: <b>' + soonest.p.name + '</b> — ' + soonest.p.stock +
              ' left, about ' + (soonest.daysLeft > 60 ? "60+" : soonest.daysLeft) + ' days of stock at the current pace.</small>' : "") +
            "</span></div>";
        })();
    }
  }

  function dailySeries(days) {
    var gross = [], tx = [], items = [], labels = [];
    for (var d = days - 1; d >= 0; d--) {
      var dayOrders = orders.filter(function (o) {
        return Math.floor((TODAY - o.date) / DAY) === d && !o.refunded;
      });
      gross.push(sum(dayOrders, function (o) { return o.total; }));
      tx.push(dayOrders.length);
      items.push(sum(dayOrders, function (o) { return sum(o.lines, function (l) { return l.qty; }); }));
      var dt = new Date(TODAY.getTime() - d * DAY);
      labels.push((dt.getMonth() + 1) + "/" + dt.getDate());
    }
    return { gross: gross, tx: tx, items: items, labels: labels };
  }

  function setDelta(sel, v) {
    var e = $(sel);
    e.textContent = (v >= 0 ? "▲ " : "▼ ") + Math.abs(v).toFixed(1) + "% vs prev. period";
    e.className = "delta " + (v >= 0 ? "up" : "down");
  }

  /* ---------- render: orders ---------- */
  function statusBadge(st) {
    var map = { Completed: "ok", Processing: "info", Pending: "warn", "On Hold": "warn",
                Refunded: "bad", Cancelled: "bad", Failed: "bad" };
    return '<span class="badge ' + (map[st] || "neutral") + '">' + st + '</span>';
  }
  function orderRow(o) {
    var d = o.date;
    var ds = (d.getMonth() + 1) + "/" + d.getDate() + " " + (o.hour % 12 || 12) + (o.hour < 12 ? "am" : "pm");
    var itemTxt = o.lines.map(function (l) { return l.qty + "× " + l.label; }).join(", ") || "—";
    return "<tr><td><b>" + o.no + "</b></td><td>" + ds + "</td><td>" + o.customer + "</td>" +
      "<td>" + itemTxt + "</td><td><span class='badge neutral'>" + o.channel + "</span></td>" +
      "<td>" + o.pay + "</td><td>" + statusBadge(o.status) + "</td>" +
      "<td class='num'><b>" + fmt$(o.total) + "</b></td></tr>";
  }

  var orderFilter = { q: "", status: "all", channel: "all" };
  function fillFilters() {
    var statuses = {}, channels = {};
    orders.forEach(function (o) { statuses[o.status] = 1; channels[o.channel] = 1; });
    $("#order-status").innerHTML = '<option value="all">All statuses</option>' +
      Object.keys(statuses).sort().map(function (s) { return "<option>" + s + "</option>"; }).join("");
    $("#order-channel").innerHTML = '<option value="all">All channels</option>' +
      Object.keys(channels).sort().map(function (s) { return "<option>" + s + "</option>"; }).join("");
  }
  function renderOrders() {
    var list = orders.filter(function (o) {
      if (orderFilter.status !== "all" && o.status !== orderFilter.status) return false;
      if (orderFilter.channel !== "all" && o.channel !== orderFilter.channel) return false;
      if (orderFilter.q) {
        var q = orderFilter.q.toLowerCase();
        if (o.no.toLowerCase().indexOf(q) < 0 && o.customer.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    }).slice(0, 60);
    $("#orders-body").innerHTML = list.map(orderRow).join("") ||
      "<tr><td colspan='8' style='text-align:center;color:var(--muted);padding:2rem'>No orders match.</td></tr>";
    $("#orders-count").textContent = list.length + " shown · " + orders.length + " total";
  }

  /* ---------- render: inventory ---------- */
  function renderInventory() {
    var A30 = aggregate(30);
    var soldByLabel = {};
    A30.orders.forEach(function (o) {
      o.lines.forEach(function (l) { soldByLabel[l.label] = (soldByLabel[l.label] || 0) + l.qty; });
    });
    $("#inv-body").innerHTML = PRODUCTS.map(function (p) {
      var sold30 = soldByLabel[shortName(p.name)] || 0;
      var hasStock = typeof p.stock === "number";
      var velocity = sold30 / 30;
      var daysLeft = hasStock && velocity ? Math.round(p.stock / velocity) : null;
      var pct = hasStock ? Math.min(100, p.stock / (p.reorder * 3) * 100) : 0;
      var cls = !hasStock ? (p.stockStatus === "outofstock" ? "bad" : "ok") :
                p.stock <= p.reorder / 2 ? "bad" : p.stock <= p.reorder ? "warn" : "ok";
      var barColor = cls === "ok" ? "#1F7A43" : cls === "warn" ? "#E9B44C" : "#C0272D";
      var statusTxt = !hasStock ? (p.stockStatus === "outofstock" ? "Out of stock" : "In stock") :
                      cls === "ok" ? "In stock" : cls === "warn" ? "Low" : "Critical";
      return "<tr>" +
        "<td><div class='prod'><img src='" + p.img + "' alt=''>" + p.name + "</div></td>" +
        "<td>" + p.sku + "</td>" +
        "<td class='num'>" + fmt$(p.price) + "</td>" +
        "<td class='num'>" + fmt$(p.cost) + (LIVE ? "*" : "") + "</td>" +
        "<td class='num'><b>" + (hasStock ? p.stock : "—") + "</b></td>" +
        "<td>" + (hasStock ? "<div class='stock-bar'><i style='width:" + pct + "%;background:" + barColor + "'></i></div>" : "<span class='muted'>not tracked</span>") + "</td>" +
        "<td class='num'>" + sold30 + "</td>" +
        "<td class='num'>" + (daysLeft === null ? "—" : (daysLeft > 60 ? "60+" : daysLeft) + " days") + "</td>" +
        "<td><span class='badge " + cls + "'>" + statusTxt + "</span></td></tr>";
    }).join("") || "<tr><td colspan='9' class='muted' style='padding:1.4rem'>No products found.</td></tr>";

    var tracked = PRODUCTS.filter(function (p) { return typeof p.stock === "number"; });
    $("#inv-units").textContent = tracked.length ?
      sum(tracked, function (p) { return p.stock; }) + " packs" : "—";
    $("#inv-cost").textContent = tracked.length ?
      fmt$0(sum(tracked, function (p) { return p.stock * p.cost; })) + (LIVE ? "*" : "") : "—";
    $("#inv-retail").textContent = tracked.length ?
      fmt$0(sum(tracked, function (p) { return p.stock * p.price; })) : "—";
    $("#inv-low").textContent = tracked.filter(function (p) { return p.stock <= p.reorder; }).length + " SKUs";
  }

  /* ---------- render: customers ---------- */
  function renderCustomers() {
    if (!$("#cust-body")) return;   // customers view replaced by the Client Database
    var sorted = customers.filter(function (c) { return c.orders > 0; })
      .sort(function (a, b) { return b.spent - a.spent; });
    var colorPool = ["#C8721C", "#1F7A43", "#2D6CB5", "#A8700F", "#8A4FA8", "#C0272D"];
    $("#cust-body").innerHTML = sorted.slice(0, 20).map(function (c, i) {
      var initials = c.name.split(" ").map(function (w) { return w[0] || ""; }).join("").toUpperCase().slice(0, 2);
      var lastDays = Math.round((TODAY - c.last) / DAY);
      var tier = c.spent > 400 ? '<span class="badge ok">VIP</span>' :
                 c.spent > 150 ? '<span class="badge info">Repeat</span>' : '<span class="badge neutral">New</span>';
      return "<tr><td><div class='cust-head'><span class='avatar' style='background:" + colorPool[i % colorPool.length] + "'>" +
        initials + "</span><b>" + c.name + "</b></div></td>" +
        "<td>" + c.city + "</td><td class='num'>" + c.orders + "</td>" +
        "<td class='num'><b>" + fmt$(c.spent) + "</b></td>" +
        "<td>" + (lastDays === 0 ? "Today" : lastDays + "d ago") + "</td><td>" + tier + "</td></tr>";
    }).join("") || "<tr><td colspan='6' class='muted' style='padding:1.4rem'>No customers yet.</td></tr>";

    var active = sorted.length || 1;
    var repeat = sorted.filter(function (c) { return c.orders > 1; }).length;
    $("#cust-active").textContent = sorted.length;
    $("#cust-repeat").textContent = Math.round(repeat / active * 100) + "%";
    $("#cust-ltv").textContent = fmt$0(sum(sorted, function (c) { return c.spent; }) / active);
    $("#cust-new").textContent = sorted.filter(function (c) { return (TODAY - c.since) / DAY < 90; }).length;
  }

  function renderAll() {
    $("#stamp").textContent = TODAY.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    fillFilters();
    renderOverview();
    renderOrders();
    renderInventory();
    renderCustomers();
  }

  function setNote(mode, detail) {
    var note = $("#data-note");
    var pill = $("#reg-pill-label");
    if (mode === "live") {
      note.style.background = "var(--green-soft)"; note.style.color = "var(--green)";
      note.innerHTML = "🟢 <b>Live data</b> — connected to " + detail.store.replace(/^https?:\/\//, "") +
        " · " + detail.orders.length + " orders / " + detail.products.length + " products · synced " +
        new Date(detail.fetched_at).toLocaleTimeString() +
        (LIVE ? " · <span title='WooCommerce has no cost prices; margin and cost figures marked * are estimated at 45% of retail.'>* = estimated</span>" : "");
      if (pill) pill.textContent = "WooCommerce connected";
    } else if (mode === "error") {
      note.style.background = "var(--red-soft)"; note.style.color = "var(--red)";
      note.innerHTML = "⚠️ <b>Showing demo data</b> — the WooCommerce sync failed: " + detail +
        " <br>Check woo-config.json and that server.py is running, then reload.";
    } else {
      note.innerHTML = "📊 <b>Demo mode</b> — all figures below are realistic sample data.";
    }
  }

  /* ---------- KPI detail modal ---------- */
  function rangeLabel() { return range === 1 ? "today" : "last " + range + " days"; }
  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function statCard(label, value) {
    return "<div><span class='muted'>" + label + "</span><b>" + value + "</b></div>";
  }
  function miniOrderRows(list) {
    return list.map(function (o) {
      return "<tr><td><b>" + o.no + "</b></td><td>" + (o.date.getMonth() + 1) + "/" + o.date.getDate() +
        "</td><td>" + o.customer + "</td><td>" + o.channel + "</td><td class='num'><b>" + fmt$(o.total) + "</b></td></tr>";
    }).join("");
  }
  function byChannelTable(A) {
    var ch = {};
    A.orders.forEach(function (o) {
      ch[o.channel] = ch[o.channel] || { n: 0, rev: 0 };
      ch[o.channel].n++; ch[o.channel].rev += o.total;
    });
    return "<table class='tbl'><thead><tr><th>Channel</th><th class='num'>Orders</th><th class='num'>Revenue</th><th class='num'>Share</th></tr></thead><tbody>" +
      Object.keys(ch).sort(function (a, b) { return ch[b].rev - ch[a].rev; }).map(function (k) {
        return "<tr><td>" + k + "</td><td class='num'>" + ch[k].n + "</td><td class='num'>" + fmt$(ch[k].rev) +
          "</td><td class='num'>" + Math.round(ch[k].rev / (A.gross || 1) * 100) + "%</td></tr>";
      }).join("") + "</tbody></table>";
  }

  var KPI_DETAILS = {
    gross: function (A, days) {
      return "<div class='chart' id='md-chart'></div>" +
        "<div class='stat-grid'>" +
        statCard("Gross sales", fmt$(A.gross)) +
        statCard("Discounts", "−" + fmt$(A.discounts)) +
        statCard("Tax collected", fmt$(A.tax)) +
        statCard("Refunds", "−" + fmt$(A.refunds)) +
        statCard("Est. margin", fmt$0(sum(A.orders, function (o) {
          return sum(o.lines, function (l) { return l.qty * (l.price - l.cost); });
        })) + (LIVE ? "*" : "")) +
        statCard("Best day", (function () {
          var m = 0, mi = 0;
          days.gross.forEach(function (v, i) { if (v > m) { m = v; mi = i; } });
          return days.labels[mi] + " · " + fmt$0(m);
        })()) +
        "</div><h4>Revenue by channel</h4>" + byChannelTable(A);
    },
    tx: function (A, days) {
      var st = {};
      A.orders.forEach(function (o) { st[o.status] = (st[o.status] || 0) + 1; });
      var hourCount = {};
      A.orders.forEach(function (o) { hourCount[o.hour] = (hourCount[o.hour] || 0) + 1; });
      var busiest = Object.keys(hourCount).sort(function (a, b) { return hourCount[b] - hourCount[a]; })[0];
      return "<div class='chart' id='md-chart'></div>" +
        "<div class='stat-grid'>" +
        statCard("Transactions", A.tx) +
        statCard("Avg. per day", (A.tx / Math.max(range, 1)).toFixed(1)) +
        statCard("Busiest hour", busiest != null ? ((busiest % 12 || 12) + (busiest < 12 ? "am" : "pm")) : "—") +
        Object.keys(st).map(function (k) { return statCard(k, st[k]); }).join("") +
        "</div><h4>Latest transactions in this period</h4>" +
        "<table class='tbl'><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Channel</th><th class='num'>Total</th></tr></thead><tbody>" +
        miniOrderRows(A.orders.slice(0, 10)) + "</tbody></table>";
    },
    avg: function (A) {
      var totals = A.orders.map(function (o) { return o.total; });
      var biggest = A.orders.slice().sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
      var ch = {};
      A.orders.forEach(function (o) {
        ch[o.channel] = ch[o.channel] || { n: 0, rev: 0 };
        ch[o.channel].n++; ch[o.channel].rev += o.total;
      });
      return "<div class='stat-grid'>" +
        statCard("Average ticket", fmt$(A.avg)) +
        statCard("Median ticket", fmt$(median(totals))) +
        statCard("Smallest", fmt$(totals.length ? Math.min.apply(null, totals) : 0)) +
        statCard("Largest", fmt$(totals.length ? Math.max.apply(null, totals) : 0)) +
        "</div><h4>Average ticket by channel</h4>" +
        "<table class='tbl'><thead><tr><th>Channel</th><th class='num'>Orders</th><th class='num'>Avg. ticket</th></tr></thead><tbody>" +
        Object.keys(ch).map(function (k) {
          return "<tr><td>" + k + "</td><td class='num'>" + ch[k].n + "</td><td class='num'>" + fmt$(ch[k].rev / ch[k].n) + "</td></tr>";
        }).join("") + "</tbody></table>" +
        "<h4>Biggest orders</h4>" +
        "<table class='tbl'><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Channel</th><th class='num'>Total</th></tr></thead><tbody>" +
        miniOrderRows(biggest) + "</tbody></table>";
    },
    items: function (A, days) {
      var byLabel = {};
      A.orders.forEach(function (o) {
        o.lines.forEach(function (l) {
          byLabel[l.label] = byLabel[l.label] || { qty: 0, rev: 0 };
          byLabel[l.label].qty += l.qty; byLabel[l.label].rev += l.qty * l.price;
        });
      });
      var keys = Object.keys(byLabel).sort(function (a, b) { return byLabel[b].qty - byLabel[a].qty; });
      return "<div class='chart' id='md-chart'></div>" +
        "<div class='stat-grid'>" +
        statCard("Packs sold", A.items) +
        statCard("Avg. packs / order", A.tx ? (A.items / A.tx).toFixed(1) : "0") +
        statCard("Flavors sold", keys.length) +
        "</div><h4>Packs by product</h4>" +
        "<table class='tbl'><thead><tr><th>Product</th><th class='num'>Packs</th><th class='num'>Revenue</th><th class='num'>Share</th></tr></thead><tbody>" +
        keys.map(function (k) {
          return "<tr><td>" + k + "</td><td class='num'><b>" + byLabel[k].qty + "</b></td><td class='num'>" +
            fmt$(byLabel[k].rev) + "</td><td class='num'>" + Math.round(byLabel[k].qty / (A.items || 1) * 100) + "%</td></tr>";
        }).join("") + "</tbody></table>";
    }
  };
  var KPI_TITLES = { gross: "Gross Sales", tx: "Transactions", avg: "Avg. Ticket", items: "Packs Sold" };

  function openKpiModal(key) {
    var A = aggregate(range);
    var days = dailySeries(Math.max(range, 7));
    var veil = document.createElement("div");
    veil.className = "modal-veil";
    veil.innerHTML = "<div class='modal'><div class='modal-head'><h3>" +
      KPI_TITLES[key] + " — " + rangeLabel() +
      "</h3><button class='x' aria-label='Close'>×</button></div><div class='modal-body'>" +
      KPI_DETAILS[key](A, days) + "</div></div>";
    document.body.appendChild(veil);
    var chart = veil.querySelector("#md-chart");
    if (chart) {
      if (key === "gross") lineChart(chart, days.gross, days.labels);
      if (key === "tx") barChart(chart, days.tx, days.labels, "#1F7A43");
      if (key === "items") barChart(chart, days.items, days.labels, "#E9B44C");
    }
    function close() { veil.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    veil.addEventListener("click", function (e) {
      if (e.target === veil || e.target.classList.contains("x")) close();
    });
    document.addEventListener("keydown", onKey);
  }

  [["#kpi-gross", "gross"], ["#kpi-tx", "tx"], ["#kpi-avg", "avg"], ["#kpi-items", "items"]].forEach(function (pair) {
    var card = $(pair[0]);
    if (!card) return;
    card.setAttribute("data-detail", pair[1]);
    card.addEventListener("click", function () { openKpiModal(pair[1]); });
  });

  /* ---------- wire up ---------- */
  $$(".side nav button").forEach(function (b) {
    b.addEventListener("click", function () {
      $$(".side nav button").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      $$(".view").forEach(function (v) { v.classList.remove("active"); });
      $("#view-" + b.getAttribute("data-view")).classList.add("active");
      $("#page-title").textContent = b.textContent.trim();
    });
  });
  $$(".range button").forEach(function (b) {
    b.addEventListener("click", function () {
      $$(".range button").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      range = parseInt(b.getAttribute("data-days"), 10);
      renderOverview();
    });
  });
  $("#order-search").addEventListener("input", function (e) { orderFilter.q = e.target.value; renderOrders(); });
  $("#order-status").addEventListener("change", function (e) { orderFilter.status = e.target.value; renderOrders(); });
  $("#order-channel").addEventListener("change", function (e) { orderFilter.channel = e.target.value; renderOrders(); });

  /* ---------- boot: try live, fall back to demo ---------- */
  buildDemoData();          // instant paint so the page is never blank
  renderAll();
  setNote("demo");

  if (location.protocol === "http:" || location.protocol === "https:") {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (ctl) setTimeout(function () { ctl.abort(); }, 25000);
    fetch("/api/data", ctl ? { signal: ctl.signal } : {})
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        if (payload.unconfigured) { setNote("demo"); return; }
        if (payload.error) { setNote("error", payload.error); return; }
        if (!payload.orders) { return; }
        buildLiveData(payload);
        renderAll();
        setNote("live", payload);
      })
      .catch(function () { /* no proxy running — stay on demo */ });
  }
})();
