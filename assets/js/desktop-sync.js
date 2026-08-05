/* Sync status chip — desktop app only. Loads on the web too, but does nothing
   there (window.desktop is undefined), so one codebase serves both. */
(function () {
  "use strict";
  var D = window.desktop && window.desktop.sync;
  if (!D) return;

  var host = document.querySelector(".top-actions");
  if (!host) return;

  var chip = document.createElement("button");
  chip.className = "sync-chip";
  chip.type = "button";
  chip.title = "Click for sync settings";
  host.appendChild(chip);

  var css = document.createElement("style");
  css.textContent =
    ".sync-chip{display:inline-flex;align-items:center;gap:.45rem;border:1.5px solid var(--line);" +
    "background:var(--panel,#fff);border-radius:99px;padding:.4rem .8rem;font:inherit;font-size:.76rem;" +
    "font-weight:700;cursor:pointer;color:var(--ink)}" +
    ".sync-chip .dot{width:8px;height:8px;border-radius:50%;background:#9A8B75}" +
    ".sync-chip.ok .dot{background:var(--green)}.sync-chip.off .dot{background:#C0272D}" +
    ".sync-chip.pending .dot{background:#E9B44C}" +
    ".sync-chip.busy .dot{animation:syncpulse 1s infinite}" +
    "@keyframes syncpulse{50%{opacity:.25}}";
  document.head.appendChild(css);

  function paint(st) {
    var cls = "sync-chip", txt;
    if (!st.configured) { txt = "Sync not set up"; }
    else if (st.online === false) { cls += " off"; txt = "Offline" + (st.pending ? " · " + st.pending + " waiting" : ""); }
    else if (st.pending) { cls += " pending"; txt = st.pending + " to sync"; }
    else { cls += " ok"; txt = "Synced"; }
    if (st.running) cls += " busy";
    chip.className = cls;
    chip.innerHTML = "<span class='dot'></span><span>" + txt + "</span>";
  }

  function refresh() { D.status().then(paint); }
  D.onStatus(paint);
  refresh();
  setInterval(refresh, 10000);

  // browser-level connectivity events give us an instant reconnect trigger
  window.addEventListener("online", function () { D.now().then(paint); });
  window.addEventListener("offline", refresh);

  chip.addEventListener("click", function () {
    D.status().then(function (st) {
      if (!st.configured) return setup();
      var msg = "Sync status\n\n" +
        (st.online === false ? "⚠ Offline — will retry automatically\n" : "● Online\n") +
        (st.pending ? st.pending + " record(s) waiting to upload\n" : "Everything is uploaded\n") +
        (st.lastSync ? "Last sync: " + new Date(st.lastSync).toLocaleString() + "\n" : "") +
        (st.error ? "Last error: " + st.error + "\n" : "") +
        "\nOK = sync now, Cancel = change settings";
      if (confirm(msg)) D.now().then(paint);
      else setup();
    });
  });

  function setup() {
    var url = prompt("Supabase Project URL (https://xxxx.supabase.co):", "");
    if (url === null) return;
    var anon = prompt("Supabase anon public key:", "");
    if (anon === null) return;
    var key = prompt("Your sync key (the one you put in the SQL policy):", "");
    if (key === null) return;
    D.configure({ url: url, anonKey: anon, posKey: key }).then(function (ok) {
      if (!ok) { alert("Those values look incomplete — sync not enabled."); return; }
      D.now().then(function (st) {
        paint(st);
        alert(st.online === false
          ? "Saved, but the first sync failed:\n\n" + (st.error || "unknown error")
          : "Connected — cloud sync is on.");
      });
    });
  }
})();
