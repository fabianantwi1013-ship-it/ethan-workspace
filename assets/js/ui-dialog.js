/* In-app dialogs.

   Electron does not implement window.prompt() — it silently does nothing — so
   every prompt-driven flow needs a real dialog. These are promise-based and
   work identically in the browser and the desktop app.

     efPrompt({title, message, value, password})  -> Promise<string|null>
     efChoose({title, message, options})          -> Promise<value|null>
     efConfirm({title, message, okText})          -> Promise<boolean>

   options: [{ value, label, hint }]  (a plain string is shorthand for both) */
(function () {
  "use strict";
  if (window.efPrompt) return;

  var css = document.createElement("style");
  css.textContent =
    ".efd-veil{position:fixed;inset:0;background:rgba(30,20,8,.5);z-index:300;display:flex;" +
    "align-items:center;justify-content:center;padding:1.2rem}" +
    ".efd{background:#fff;border-radius:16px;width:min(460px,100%);max-height:86vh;display:flex;" +
    "flex-direction:column;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.35);" +
    "font-family:inherit;color:#2A1E10}" +
    ".efd h3{margin:0;padding:1.1rem 1.3rem .5rem;font-size:1.05rem;font-weight:800}" +
    ".efd .efd-msg{padding:0 1.3rem;font-size:.86rem;color:#6B5B47;white-space:pre-wrap;line-height:1.5}" +
    ".efd .efd-body{padding:1rem 1.3rem;overflow-y:auto}" +
    ".efd input{width:100%;padding:.7rem .9rem;border:1.5px solid #E5DDD0;border-radius:10px;" +
    "font:inherit;font-size:.95rem;box-sizing:border-box}" +
    ".efd input:focus{outline:2px solid #E9B44C;border-color:transparent}" +
    ".efd-opt{display:block;width:100%;text-align:left;padding:.7rem .9rem;margin-bottom:.45rem;" +
    "border:1.5px solid #E5DDD0;border-radius:10px;background:#fff;font:inherit;font-size:.9rem;" +
    "font-weight:700;cursor:pointer}" +
    ".efd-opt:hover{border-color:#C8721C;background:#FDF7EC}" +
    ".efd-opt small{display:block;font-weight:400;color:#8A7A64;margin-top:.15rem;font-size:.78rem}" +
    ".efd-foot{display:flex;justify-content:flex-end;gap:.6rem;padding:.9rem 1.3rem 1.2rem}" +
    ".efd-foot button{padding:.6rem 1.1rem;border-radius:10px;font:inherit;font-weight:700;" +
    "font-size:.86rem;cursor:pointer;border:1.5px solid #E5DDD0;background:#fff}" +
    ".efd-foot .efd-ok{background:#C8721C;border-color:#C8721C;color:#fff}";
  document.head.appendChild(css);

  function shell(opts) {
    var veil = document.createElement("div");
    veil.className = "efd-veil";
    var box = document.createElement("div");
    box.className = "efd";
    veil.appendChild(box);
    if (opts.title) {
      var h = document.createElement("h3");
      h.textContent = opts.title;
      box.appendChild(h);
    }
    if (opts.message) {
      var m = document.createElement("div");
      m.className = "efd-msg";
      m.textContent = opts.message;
      box.appendChild(m);
    }
    var body = document.createElement("div");
    body.className = "efd-body";
    box.appendChild(body);
    document.body.appendChild(veil);
    return { veil: veil, box: box, body: body };
  }

  function footer(box, okText, onOk, onCancel, showOk) {
    var f = document.createElement("div");
    f.className = "efd-foot";
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", onCancel);
    f.appendChild(cancel);
    if (showOk !== false) {
      var ok = document.createElement("button");
      ok.type = "button";
      ok.className = "efd-ok";
      ok.textContent = okText || "OK";
      ok.addEventListener("click", onOk);
      f.appendChild(ok);
    }
    box.appendChild(f);
  }

  function bindKeys(veil, close, submit) {
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter" && submit) { e.preventDefault(); submit(); }
    }
    document.addEventListener("keydown", onKey, true);
    return function () { document.removeEventListener("keydown", onKey, true); };
  }

  window.efPrompt = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var s = shell(opts);
      var input = document.createElement("input");
      input.type = opts.password ? "password" : "text";
      input.value = opts.value == null ? "" : String(opts.value);
      if (opts.placeholder) input.placeholder = opts.placeholder;
      s.body.appendChild(input);

      var unbind;
      function done(v) { unbind(); s.veil.remove(); resolve(v); }
      footer(s.box, opts.okText, function () { done(input.value); }, function () { done(null); });
      unbind = bindKeys(s.veil, function () { done(null); }, function () { done(input.value); });
      s.veil.addEventListener("mousedown", function (e) { if (e.target === s.veil) done(null); });
      setTimeout(function () { input.focus(); input.select(); }, 30);
    });
  };

  window.efChoose = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var s = shell(opts);
      var unbind;
      function done(v) { unbind(); s.veil.remove(); resolve(v); }
      (opts.options || []).forEach(function (o) {
        var opt = (typeof o === "string") ? { value: o, label: o } : o;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "efd-opt";
        b.textContent = opt.label;
        if (opt.hint) {
          var small = document.createElement("small");
          small.textContent = opt.hint;
          b.appendChild(small);
        }
        b.addEventListener("click", function () { done(opt.value); });
        s.body.appendChild(b);
      });
      footer(s.box, null, null, function () { done(null); }, false);
      unbind = bindKeys(s.veil, function () { done(null); }, null);
      s.veil.addEventListener("mousedown", function (e) { if (e.target === s.veil) done(null); });
    });
  };

  window.efConfirm = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var s = shell(opts);
      var unbind;
      function done(v) { unbind(); s.veil.remove(); resolve(v); }
      footer(s.box, opts.okText || "OK", function () { done(true); }, function () { done(false); });
      unbind = bindKeys(s.veil, function () { done(false); }, function () { done(true); });
      s.veil.addEventListener("mousedown", function (e) { if (e.target === s.veil) done(false); });
    });
  };
})();
