(function () {
  "use strict";
  var $ = function (sel) {
    return document.querySelector(sel);
  };
  var app = $("#app");

  var state = {
    step: 1,
    telegram: { botToken: "", userId: "", verified: false, botName: "" },
    whatsapp: { configured: false },
    model: { provider: "anthropic", model: "claude-sonnet-4-5-20250929", apiKey: "" },
  };

  // ── helpers ────────────────────────────────────────────────
  function stepIndicator(current) {
    var items = [1, 2, 3]
      .map(function (n) {
        var cls = "step-indicator";
        if (n < current) cls += " done";
        else if (n === current) cls += " active";
        return '<div class="' + cls + '"></div>';
      })
      .join("");
    return '<div class="steps">' + items + "</div>";
  }

  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      return r.json();
    });
  }

  // ── render dispatch ────────────────────────────────────────
  function render() {
    switch (state.step) {
      case 1:
        renderChannels();
        break;
      case 2:
        renderModel();
        break;
      case 3:
        renderDone();
        break;
      default:
        renderChannels();
    }
  }

  // ── Step 1: Channels ──────────────────────────────────────
  function renderChannels() {
    app.innerHTML =
      '<div class="container">' +
      "<h1>Nanobots Setup</h1>" +
      '<p class="subtitle">Step 1: Connect messaging platform</p>' +
      stepIndicator(1) +
      '<div class="card">' +
      "<h2>Telegram</h2>" +
      '<div class="field">' +
      "<label>Bot Token</label>" +
      '<input type="text" id="tg-token" placeholder="123456:ABC-DEF..." value="' +
      esc(state.telegram.botToken) +
      '">' +
      '<div class="hint">Find @BotFather on Telegram to create a bot and get a token</div>' +
      "</div>" +
      '<div class="field">' +
      "<label>Your User ID</label>" +
      '<input type="text" id="tg-userid" placeholder="123456789" value="' +
      esc(state.telegram.userId) +
      '">' +
      '<div class="hint">Send a message to @userinfobot to get your User ID</div>' +
      "</div>" +
      '<div id="tg-status" class="status-msg"></div>' +
      '<div class="actions">' +
      '<button class="btn btn-secondary" id="tg-verify">Verify</button>' +
      '<button class="btn btn-primary" id="tg-save">Save</button>' +
      "</div>" +
      "</div>" +
      '<div class="card">' +
      "<h2>WhatsApp</h2>" +
      '<div class="qr-area" id="wa-qr">' +
      '<button class="btn btn-secondary" id="wa-start">Generate QR Code</button>' +
      "</div>" +
      '<div id="wa-status" class="status-msg"></div>' +
      "</div>" +
      '<div class="actions">' +
      '<button class="btn btn-primary" id="next-step">Next &rarr;</button>' +
      "</div>" +
      "</div>";

    bind("tg-verify", "click", verifyTelegram);
    bind("tg-save", "click", saveTelegram);
    bind("wa-start", "click", startWhatsApp);
    bind("next-step", "click", function () {
      state.step = 2;
      render();
    });
  }

  function verifyTelegram() {
    var token = v("tg-token");
    var el = $("#tg-status");
    if (!token) {
      el.innerHTML = '<span class="badge badge-error">Please enter a Bot Token</span>';
      return;
    }
    el.innerHTML = "Verifying...";
    api("/api/setup/telegram/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken: token }),
    }).then(function (d) {
      if (d.ok) {
        state.telegram.verified = true;
        state.telegram.botName = d.botName;
        el.innerHTML = '<span class="badge badge-success">OK: @' + esc(d.botName) + "</span>";
      } else {
        el.innerHTML = '<span class="badge badge-error">' + esc(d.error) + "</span>";
      }
    });
  }

  function saveTelegram() {
    var token = v("tg-token");
    var userId = v("tg-userid");
    if (!token || !userId) {
      $("#tg-status").innerHTML =
        '<span class="badge badge-error">Bot Token and User ID are both required</span>';
      return;
    }
    api("/api/setup/telegram/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken: token, userId: userId }),
    }).then(function (d) {
      if (d.ok) {
        state.telegram.botToken = token;
        state.telegram.userId = userId;
        $("#tg-status").innerHTML = '<span class="badge badge-success">Saved!</span>';
      } else {
        $("#tg-status").innerHTML =
          '<span class="badge badge-error">' + esc(d.error || "Save failed") + "</span>";
      }
    });
  }

  // ── WhatsApp QR flow ───────────────────────────────────────
  var waPolling = null;

  function startWhatsApp() {
    var qrArea = $("#wa-qr");
    var statusEl = $("#wa-status");
    qrArea.innerHTML = "<p>Generating QR code...</p>";
    statusEl.innerHTML = "";
    api("/api/setup/whatsapp/qr", { method: "POST" }).then(function (d) {
      if (d.ok && d.qrDataUrl) {
        qrArea.innerHTML =
          '<img src="' + d.qrDataUrl + '" alt="WhatsApp QR" style="max-width:256px">';
        statusEl.innerHTML =
          '<span class="badge badge-pending">Scan this QR in WhatsApp &rarr; Linked Devices</span>';
        pollWhatsApp();
      } else {
        qrArea.innerHTML =
          '<button class="btn btn-secondary" id="wa-start">Generate QR Code</button>';
        statusEl.innerHTML =
          '<span class="badge badge-error">' + esc(d.message || d.error || "Failed") + "</span>";
        bind("wa-start", "click", startWhatsApp);
      }
    });
  }

  function pollWhatsApp() {
    if (waPolling) clearInterval(waPolling);
    waPolling = setInterval(function () {
      api("/api/setup/whatsapp/status").then(function (d) {
        if (d.connected) {
          clearInterval(waPolling);
          waPolling = null;
          var statusEl = $("#wa-status");
          if (statusEl) statusEl.innerHTML = '<span class="badge badge-success">Connected!</span>';
          var qrArea = $("#wa-qr");
          if (qrArea) qrArea.innerHTML = '<span class="badge badge-success">WhatsApp linked</span>';
          state.whatsapp.configured = true;
        }
      });
    }, 3000);
  }

  // ── Step 2: Model ─────────────────────────────────────────
  function renderModel() {
    app.innerHTML =
      '<div class="container">' +
      "<h1>Nanobots Setup</h1>" +
      '<p class="subtitle">Step 2: Configure AI model</p>' +
      stepIndicator(2) +
      '<div class="card">' +
      "<h2>Default Model</h2>" +
      '<div class="field">' +
      "<label>Provider</label>" +
      '<select id="m-provider">' +
      '<option value="anthropic"' +
      sel("anthropic", state.model.provider) +
      ">Anthropic (Claude)</option>" +
      '<option value="openai"' +
      sel("openai", state.model.provider) +
      ">OpenAI</option>" +
      '<option value="google"' +
      sel("google", state.model.provider) +
      ">Google (Gemini)</option>" +
      "</select>" +
      "</div>" +
      '<div class="field">' +
      "<label>Model</label>" +
      '<input type="text" id="m-model" placeholder="claude-sonnet-4-5-20250929" value="' +
      esc(state.model.model) +
      '">' +
      '<div class="hint">Format: model-name (e.g. claude-sonnet-4-5-20250929, gpt-4o)</div>' +
      "</div>" +
      '<div class="field">' +
      "<label>API Key</label>" +
      '<input type="password" id="m-apikey" placeholder="sk-ant-..." value="' +
      esc(state.model.apiKey) +
      '">' +
      '<div class="hint">Your API key for the selected provider</div>' +
      "</div>" +
      '<div id="m-status" class="status-msg"></div>' +
      '<div class="actions">' +
      '<button class="btn btn-secondary" id="m-back">&larr; Back</button>' +
      '<button class="btn btn-primary" id="m-save">Save &amp; Finish</button>' +
      "</div>" +
      "</div>" +
      "</div>";

    bind("m-back", "click", function () {
      state.step = 1;
      render();
    });
    bind("m-save", "click", saveModel);
  }

  function saveModel() {
    var provider = v("m-provider");
    var model = v("m-model");
    var apiKey = v("m-apikey");
    if (!model) {
      $("#m-status").innerHTML = '<span class="badge badge-error">Please enter a model name</span>';
      return;
    }
    state.model = { provider: provider, model: model, apiKey: apiKey };
    $("#m-status").innerHTML = "Saving...";
    api("/api/setup/model/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: provider, model: model, apiKey: apiKey }),
    }).then(function (d) {
      if (d.ok) {
        state.step = 3;
        render();
      } else {
        $("#m-status").innerHTML =
          '<span class="badge badge-error">' + esc(d.error || "Save failed") + "</span>";
      }
    });
  }

  // ── Step 3: Done ──────────────────────────────────────────
  function renderDone() {
    app.innerHTML =
      '<div class="container">' +
      stepIndicator(3) +
      '<div class="done-page">' +
      '<div class="icon">&#x2705;</div>' +
      "<h2>Setup Complete!</h2>" +
      "<p>Your Nanobots agent is ready.</p>" +
      "<p>Go chat on WhatsApp or Telegram!</p>" +
      "</div>" +
      "</div>";
  }

  // ── util ──────────────────────────────────────────────────
  function v(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }
  function bind(id, ev, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  }
  function esc(s) {
    if (!s) return "";
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function sel(val, current) {
    return val === current ? " selected" : "";
  }

  // ── init ──────────────────────────────────────────────────
  api("/api/setup/status")
    .then(function (data) {
      state.step = data.currentStep || 1;
      if (data.channels && data.channels.telegram) {
        if (data.channels.telegram.configured) {
          state.telegram.botToken = "configured";
          state.telegram.userId = data.channels.telegram.userId || "";
        }
      }
      if (data.model && data.model.defaultModel) {
        state.model.model = data.model.defaultModel;
      }
      render();
    })
    .catch(function () {
      state.step = 1;
      render();
    });
})();
