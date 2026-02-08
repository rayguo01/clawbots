(function () {
  "use strict";
  var $ = function (sel) {
    return document.querySelector(sel);
  };
  var app = $("#app");

  var state = {
    step: 1,
    page: "setup", // "setup" or "settings"
    telegram: { botToken: "", userId: "", verified: false, botName: "" },
    whatsapp: { configured: false },
    model: { provider: "anthropic", model: "claude-sonnet-4-5-20250929", apiKey: "" },
    oauthProviders: [],
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
    opts = opts || {};
    if (opts.body && !opts.headers) {
      opts.headers = { "Content-Type": "application/json" };
    }
    return fetch(path, opts).then(function (r) {
      return r.json();
    });
  }

  // ── route dispatch ──────────────────────────────────────────
  function route() {
    var hash = window.location.hash.replace("#", "");
    if (hash === "settings") {
      state.page = "settings";
      renderSettings();
    } else {
      state.page = "setup";
      render();
    }
  }

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

  function startWhatsApp(force) {
    var qrArea = $("#wa-qr");
    var statusEl = $("#wa-status");
    qrArea.innerHTML = "<p>Generating QR code...</p>";
    statusEl.innerHTML = "";
    var opts = { method: "POST" };
    if (force) opts.body = JSON.stringify({ force: true });
    api("/api/setup/whatsapp/qr", opts).then(function (d) {
      if (d.ok && d.qrDataUrl) {
        qrArea.innerHTML =
          '<img src="' + d.qrDataUrl + '" alt="WhatsApp QR" style="max-width:256px">';
        statusEl.innerHTML =
          '<span class="badge badge-pending">Scan this QR in WhatsApp &rarr; Linked Devices</span>';
        pollWhatsApp();
      } else if (d.message && d.message.indexOf("already linked") !== -1) {
        qrArea.innerHTML =
          '<button class="btn btn-secondary" id="wa-relink">Relink WhatsApp</button>';
        statusEl.innerHTML = '<span class="badge badge-success">' + esc(d.message) + "</span>";
        bind("wa-relink", "click", function () {
          startWhatsApp(true);
        });
      } else {
        qrArea.innerHTML =
          '<button class="btn btn-secondary" id="wa-start">Generate QR Code</button>';
        statusEl.innerHTML =
          '<span class="badge badge-error">' + esc(d.message || d.error || "Failed") + "</span>";
        bind("wa-start", "click", function () {
          startWhatsApp();
        });
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
      '<div style="margin-top:24px">' +
      '<a href="#settings" class="btn btn-secondary">Manage Services</a>' +
      "</div>" +
      "</div>" +
      "</div>";
  }

  // ── Settings page (OAuth service management) ──────────────
  function renderSettings() {
    app.innerHTML =
      '<div class="container">' +
      '<div class="settings-header">' +
      '<a href="#" class="btn btn-secondary btn-sm">&larr; Setup</a>' +
      "<h1>Services</h1>" +
      '<p class="subtitle">Connect external services for your AI agent</p>' +
      "</div>" +
      '<div id="services-list"><p>Loading...</p></div>' +
      "</div>";

    loadOAuthProviders();
  }

  function loadOAuthProviders() {
    api("/api/oauth/providers")
      .then(function (data) {
        state.oauthProviders = data.providers || [];
        renderServiceCards();
      })
      .catch(function () {
        var el = $("#services-list");
        if (el) el.innerHTML = '<p class="badge badge-error">Failed to load services</p>';
      });
  }

  function renderServiceCards() {
    var el = $("#services-list");
    if (!el) return;

    if (!state.oauthProviders.length) {
      el.innerHTML = '<div class="card"><p>No services available yet.</p></div>';
      return;
    }

    var html = "";
    for (var i = 0; i < state.oauthProviders.length; i++) {
      var p = state.oauthProviders[i];
      html += renderServiceCard(p);
    }
    el.innerHTML = html;

    // Bind buttons
    for (var j = 0; j < state.oauthProviders.length; j++) {
      var prov = state.oauthProviders[j];
      if (prov.connected) {
        bindDisconnect(prov.id);
      } else if (prov.configured) {
        bindConnect(prov.id);
      }
    }
  }

  function renderServiceCard(provider) {
    var statusBadge = provider.connected
      ? '<span class="badge badge-success">Connected</span>'
      : provider.configured
        ? '<span class="badge badge-pending">Not connected</span>'
        : '<span class="badge badge-error">Not configured</span>';

    var actionBtn = "";
    if (provider.connected) {
      actionBtn =
        '<button class="btn btn-danger btn-sm" id="svc-disconnect-' +
        esc(provider.id) +
        '">Disconnect</button>';
    } else if (provider.configured) {
      actionBtn =
        '<button class="btn btn-primary btn-sm" id="svc-connect-' +
        esc(provider.id) +
        '">Connect</button>';
    } else {
      actionBtn =
        '<p class="hint">Set NANOBOTS_GOOGLE_CLIENT_ID and NANOBOTS_GOOGLE_CLIENT_SECRET env vars to enable.</p>';
    }

    var scopeList = "";
    if (provider.scopes && provider.scopes.length) {
      var labels = provider.scopes.map(function (s) {
        // Shorten Google scope URLs to readable labels
        var parts = s.split("/");
        return parts[parts.length - 1];
      });
      scopeList = '<div class="hint">Scopes: ' + esc(labels.join(", ")) + "</div>";
    }

    return (
      '<div class="card service-card">' +
      '<div class="service-header">' +
      "<h2>" +
      esc(provider.name) +
      "</h2>" +
      statusBadge +
      "</div>" +
      scopeList +
      '<div class="actions">' +
      actionBtn +
      "</div>" +
      "</div>"
    );
  }

  function bindConnect(providerId) {
    bind("svc-connect-" + providerId, "click", function () {
      api("/api/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      }).then(function (d) {
        if (d.ok && d.url) {
          window.location.href = d.url;
        } else {
          alert(d.error || "Failed to start OAuth flow");
        }
      });
    });
  }

  function bindDisconnect(providerId) {
    bind("svc-disconnect-" + providerId, "click", function () {
      if (!confirm("Disconnect " + providerId + "?")) return;
      api("/api/oauth/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      }).then(function () {
        loadOAuthProviders();
      });
    });
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
  window.addEventListener("hashchange", route);

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
      route();
    })
    .catch(function () {
      state.step = 1;
      route();
    });
})();
