(function () {
  "use strict";
  var $ = function (sel) {
    return document.querySelector(sel);
  };
  var app = $("#app");

  var state = {
    step: 1,
    page: "setup", // "setup", "settings", or "skills"
    telegram: { botToken: "", userId: "", verified: false, botName: "" },
    whatsapp: { configured: false },
    model: { provider: "google", model: "gemini-3-pro", apiKey: "" },
    oauthProviders: [],
    skills: {
      "nano-banana-pro": { configured: false, apiKey: "" },
      "oura-ring": { configured: false, apiKey: "" },
    },
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
    } else if (hash === "skills") {
      state.page = "skills";
      renderSkills();
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
      "<h1>Nanobots 设置</h1>" +
      '<p class="subtitle">第 1 步：连接消息平台</p>' +
      stepIndicator(1) +
      '<div class="card">' +
      "<h2>Telegram</h2>" +
      '<div class="field">' +
      "<label>Bot Token</label>" +
      '<input type="text" id="tg-token" placeholder="123456:ABC-DEF..." value="' +
      esc(state.telegram.botToken) +
      '">' +
      '<div class="hint">在 Telegram 中找到 @BotFather 创建机器人并获取 Token</div>' +
      "</div>" +
      '<div class="field">' +
      "<label>你的 User ID</label>" +
      '<input type="text" id="tg-userid" placeholder="123456789" value="' +
      esc(state.telegram.userId) +
      '">' +
      '<div class="hint">向 @userinfobot 发送消息以获取你的 User ID</div>' +
      "</div>" +
      '<div id="tg-status" class="status-msg"></div>' +
      '<div class="actions">' +
      '<button class="btn btn-secondary" id="tg-verify">验证</button>' +
      '<button class="btn btn-primary" id="tg-save">保存</button>' +
      "</div>" +
      "</div>" +
      '<div class="card">' +
      "<h2>WhatsApp</h2>" +
      '<div class="qr-area" id="wa-qr">' +
      '<button class="btn btn-secondary" id="wa-start">生成二维码</button>' +
      "</div>" +
      '<div id="wa-status" class="status-msg"></div>' +
      "</div>" +
      '<div class="actions">' +
      '<button class="btn btn-primary" id="next-step">下一步 &rarr;</button>' +
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
      el.innerHTML = '<span class="badge badge-error">请输入 Bot Token</span>';
      return;
    }
    el.innerHTML = "验证中...";
    api("/api/setup/telegram/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken: token }),
    }).then(function (d) {
      if (d.ok) {
        state.telegram.verified = true;
        state.telegram.botName = d.botName;
        el.innerHTML = '<span class="badge badge-success">成功: @' + esc(d.botName) + "</span>";
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
        '<span class="badge badge-error">Bot Token 和 User ID 都是必填项</span>';
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
        $("#tg-status").innerHTML = '<span class="badge badge-success">已保存!</span>';
      } else {
        $("#tg-status").innerHTML =
          '<span class="badge badge-error">' + esc(d.error || "保存失败") + "</span>";
      }
    });
  }

  // ── WhatsApp QR flow ───────────────────────────────────────
  var waPolling = null;

  function startWhatsApp(force) {
    var qrArea = $("#wa-qr");
    var statusEl = $("#wa-status");
    qrArea.innerHTML = "<p>正在生成二维码...</p>";
    statusEl.innerHTML = "";
    var opts = { method: "POST" };
    if (force) opts.body = JSON.stringify({ force: true });
    api("/api/setup/whatsapp/qr", opts).then(function (d) {
      if (d.ok && d.qrDataUrl) {
        qrArea.innerHTML =
          '<img src="' + d.qrDataUrl + '" alt="WhatsApp QR" style="max-width:256px">';
        statusEl.innerHTML =
          '<span class="badge badge-pending">在 WhatsApp 中扫描此二维码 &rarr; 已关联设备</span>';
        pollWhatsApp();
      } else if (d.message && d.message.indexOf("already linked") !== -1) {
        qrArea.innerHTML =
          '<button class="btn btn-secondary" id="wa-relink">重新关联 WhatsApp</button>';
        statusEl.innerHTML = '<span class="badge badge-success">' + esc(d.message) + "</span>";
        bind("wa-relink", "click", function () {
          startWhatsApp(true);
        });
      } else {
        qrArea.innerHTML = '<button class="btn btn-secondary" id="wa-start">生成二维码</button>';
        statusEl.innerHTML =
          '<span class="badge badge-error">' + esc(d.message || d.error || "失败") + "</span>";
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
          if (statusEl) statusEl.innerHTML = '<span class="badge badge-success">已连接!</span>';
          var qrArea = $("#wa-qr");
          if (qrArea) qrArea.innerHTML = '<span class="badge badge-success">WhatsApp 已关联</span>';
          state.whatsapp.configured = true;
        }
      });
    }, 3000);
  }

  // ── Step 2: Model ─────────────────────────────────────────
  var MODEL_PRESETS = [
    {
      provider: "google",
      model: "gemini-3-pro",
      label: "Google Gemini 3 Pro",
      desc: "推荐，有免费额度",
      authMode: "api-key",
      placeholder: "AIza...",
    },
    {
      provider: "google",
      model: "gemini-3-flash",
      label: "Google Gemini 3 Flash",
      desc: "更快更省，有免费额度",
      authMode: "api-key",
      placeholder: "AIza...",
    },
    {
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      label: "Claude Sonnet 4.5 (订阅版)",
      desc: "使用你的 Claude Pro/Team 订阅",
      authMode: "setup-token",
      placeholder: "sk-ant-oat01-...",
    },
    {
      provider: "anthropic",
      model: "claude-opus-4-5",
      label: "Claude Opus 4.5 (订阅版)",
      desc: "使用你的 Claude Pro/Team 订阅",
      authMode: "setup-token",
      placeholder: "sk-ant-oat01-...",
    },
    {
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      label: "Anthropic Claude Sonnet (API Key)",
      desc: "按量计费",
      authMode: "api-key",
      placeholder: "sk-ant-...",
    },
    {
      provider: "openai",
      model: "gpt-4o",
      label: "OpenAI GPT-4o",
      desc: "按量计费",
      authMode: "api-key",
      placeholder: "sk-...",
    },
  ];

  function getSelectedPreset() {
    var chosen = document.querySelector('input[name="model-choice"]:checked');
    return chosen ? MODEL_PRESETS[parseInt(chosen.value, 10)] : MODEL_PRESETS[0];
  }

  function updateCredentialField(preset) {
    var label = document.getElementById("m-cred-label");
    var input = document.getElementById("m-apikey");
    var hint = document.getElementById("m-cred-hint");
    if (!label || !input || !hint) return;

    if (preset.authMode === "setup-token") {
      label.textContent = "Setup Token";
      input.placeholder = preset.placeholder;
      hint.innerHTML =
        "<strong>如何获取 Setup Token：</strong><br>" +
        "1. 安装 Claude Code: <code>npm install -g @anthropic-ai/claude-code</code><br>" +
        "2. 运行 <code>claude</code> 并登录你的 Anthropic 账号<br>" +
        "3. 运行 <code>claude setup-token</code> 生成 Token<br>" +
        "4. 复制 <code>sk-ant-oat01-...</code> Token 并粘贴到上方";
    } else {
      label.textContent = "API Key";
      input.placeholder = preset.placeholder;
      hint.textContent = "所选服务商的 API Key";
    }
  }

  function renderModel() {
    var cards = "";
    for (var i = 0; i < MODEL_PRESETS.length; i++) {
      var p = MODEL_PRESETS[i];
      var selected =
        state.model.provider === p.provider &&
        state.model.model === p.model &&
        (state.model.authMode || "api-key") === p.authMode;
      cards +=
        '<div class="card model-card' +
        (selected ? " model-selected" : "") +
        '" data-idx="' +
        i +
        '">' +
        '<div class="model-card-header">' +
        '<input type="radio" name="model-choice" id="mc-' +
        i +
        '" value="' +
        i +
        '"' +
        (selected ? " checked" : "") +
        ">" +
        '<label for="mc-' +
        i +
        '"><strong>' +
        esc(p.label) +
        "</strong></label>" +
        "</div>" +
        '<div class="hint" style="margin-left:24px">' +
        esc(p.provider + "/" + p.model) +
        (p.desc ? " &mdash; " + esc(p.desc) : "") +
        "</div>" +
        "</div>";
    }

    var defaultPreset = MODEL_PRESETS[0];
    var credLabel = defaultPreset.authMode === "setup-token" ? "Setup Token" : "API Key";
    var credHint =
      defaultPreset.authMode === "setup-token"
        ? "<strong>如何获取 Setup Token：</strong><br>" +
          "1. 安装 Claude Code: <code>npm install -g @anthropic-ai/claude-code</code><br>" +
          "2. 运行 <code>claude</code> 并登录你的 Anthropic 账号<br>" +
          "3. 运行 <code>claude setup-token</code> 生成 Token<br>" +
          "4. 复制 <code>sk-ant-oat01-...</code> Token 并粘贴到上方"
        : "所选服务商的 API Key";

    app.innerHTML =
      '<div class="container">' +
      "<h1>Nanobots 设置</h1>" +
      '<p class="subtitle">第 2 步：选择 AI 模型</p>' +
      stepIndicator(2) +
      '<div id="model-choices">' +
      cards +
      "</div>" +
      '<div class="card">' +
      '<div class="field">' +
      '<label id="m-cred-label">' +
      credLabel +
      "</label>" +
      '<input type="password" id="m-apikey" placeholder="' +
      esc(defaultPreset.placeholder) +
      '" value="' +
      esc(state.model.apiKey) +
      '">' +
      '<div class="hint" id="m-cred-hint">' +
      credHint +
      "</div>" +
      "</div>" +
      '<div id="m-status" class="status-msg"></div>' +
      '<div class="actions">' +
      '<button class="btn btn-secondary" id="m-back">&larr; 上一步</button>' +
      '<button class="btn btn-primary" id="m-save">保存并完成</button>' +
      "</div>" +
      "</div>" +
      "</div>";

    // Bind radio change to update placeholder and credential label
    for (var j = 0; j < MODEL_PRESETS.length; j++) {
      (function (idx) {
        bind("mc-" + idx, "change", function () {
          updateCredentialField(MODEL_PRESETS[idx]);
          // Update visual selection
          var allCards = document.querySelectorAll(".model-card");
          for (var k = 0; k < allCards.length; k++) {
            allCards[k].classList.remove("model-selected");
          }
          allCards[idx].classList.add("model-selected");
        });
      })(j);
    }

    // Apply correct credential field for initially selected preset
    var initialChecked = document.querySelector('input[name="model-choice"]:checked');
    if (initialChecked) {
      updateCredentialField(MODEL_PRESETS[parseInt(initialChecked.value, 10)]);
    }

    bind("m-back", "click", function () {
      state.step = 1;
      render();
    });
    bind("m-save", "click", saveModel);
  }

  function saveModel() {
    var chosen = document.querySelector('input[name="model-choice"]:checked');
    if (!chosen) {
      $("#m-status").innerHTML = '<span class="badge badge-error">请选择一个模型</span>';
      return;
    }
    var preset = MODEL_PRESETS[parseInt(chosen.value, 10)];
    var credValue = v("m-apikey");
    state.model = {
      provider: preset.provider,
      model: preset.model,
      apiKey: credValue,
      authMode: preset.authMode,
    };
    $("#m-status").innerHTML = "保存中...";

    var payload = { provider: preset.provider, model: preset.model, authMode: preset.authMode };
    if (preset.authMode === "setup-token") {
      payload.setupToken = credValue;
    } else {
      payload.apiKey = credValue;
    }

    api("/api/setup/model/save", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then(function (d) {
      if (d.ok) {
        state.step = 3;
        render();
      } else {
        $("#m-status").innerHTML =
          '<span class="badge badge-error">' + esc(d.error || "保存失败") + "</span>";
      }
    });
  }

  // ── Step 3: Dashboard (setup complete) ────────────────────
  function renderDone() {
    // Channel status items
    var tgStatus = state.telegram.botToken
      ? '<span class="badge badge-success">已连接</span>'
      : '<span class="badge badge-error">未配置</span>';
    var tgDetail = state.telegram.userId
      ? '<div class="hint">User ID: ' + esc(state.telegram.userId) + "</div>"
      : "";

    var waStatus = state.whatsapp.configured
      ? '<span class="badge badge-success">已连接</span>'
      : '<span class="badge badge-error">未配置</span>';

    // Model info — show friendly label from presets if possible
    var modelRaw = state.model.model || "";
    var modelLabel = modelRaw || "未配置";
    for (var mi = 0; mi < MODEL_PRESETS.length; mi++) {
      if (
        MODEL_PRESETS[mi].model === modelRaw ||
        MODEL_PRESETS[mi].provider + "/" + MODEL_PRESETS[mi].model === modelRaw
      ) {
        modelLabel = MODEL_PRESETS[mi].label;
        break;
      }
    }
    var modelStatus = modelRaw
      ? '<span class="badge badge-success">已启用</span>'
      : '<span class="badge badge-error">未配置</span>';

    app.innerHTML =
      '<div class="container">' +
      '<div class="dashboard-header">' +
      "<h1>Nanobots</h1>" +
      '<span class="badge badge-success">运行中</span>' +
      "</div>" +
      '<p class="subtitle">AI 助手已就绪，去 WhatsApp 或 Telegram 上聊天吧！</p>' +
      '<div class="card">' +
      "<h2>消息通道</h2>" +
      '<div class="config-row">' +
      '<div class="config-label">Telegram</div>' +
      '<div class="config-value">' +
      tgStatus +
      "</div>" +
      "</div>" +
      tgDetail +
      '<div class="config-row">' +
      '<div class="config-label">WhatsApp</div>' +
      '<div class="config-value">' +
      waStatus +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="card">' +
      "<h2>AI 模型</h2>" +
      '<div class="config-row">' +
      '<div class="config-label">模型</div>' +
      '<div class="config-value">' +
      modelStatus +
      "</div>" +
      "</div>" +
      '<div class="config-detail"><code>' +
      esc(modelLabel) +
      "</code></div>" +
      "</div>" +
      '<div class="actions">' +
      '<button class="btn btn-primary" id="reconfig-btn">重新配置</button>' +
      '<a href="#skills" class="btn btn-secondary">技能管理</a>' +
      '<a href="#settings" class="btn btn-secondary">服务管理</a>' +
      "</div>" +
      "</div>";

    bind("reconfig-btn", "click", function () {
      state.step = 1;
      render();
    });
  }

  // ── Skills page ───────────────────────────────────────────
  function renderSkills() {
    var skill = state.skills["nano-banana-pro"];
    var statusBadge = skill.configured
      ? '<span class="badge badge-success">已配置 ✓</span>'
      : '<span class="badge badge-error">未配置</span>';
    var placeholder = skill.configured ? "已配置（重新输入可覆盖）" : "AIza...";

    app.innerHTML =
      '<div class="container">' +
      '<div class="settings-header">' +
      '<a href="#" class="btn btn-secondary btn-sm">&larr; 返回</a>' +
      "<h1>技能管理</h1>" +
      '<p class="subtitle">配置 AI 助手的扩展技能</p>' +
      "</div>" +
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>🍌 图片生成 (Nano Banana Pro)</h2>" +
      statusBadge +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">通过 Google Gemini 生成和编辑图片</p>' +
      '<div class="field">' +
      "<label>Gemini API Key</label>" +
      '<input type="password" id="skill-apikey" placeholder="' +
      esc(placeholder) +
      '">' +
      '<div class="hint">从 <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a> 免费获取 API Key</div>' +
      "</div>" +
      '<div id="skill-status" class="status-msg"></div>' +
      '<div class="actions">' +
      '<button class="btn btn-primary" id="skill-save">保存</button>' +
      "</div>" +
      "</div>" +
      // ── ezBookkeeping card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>💰 智能记账 (ezBookkeeping)</h2>" +
      '<span class="badge badge-success" id="ezb-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">自然语言记账，对话即记录。用户只需说"午饭花了15块"，助手自动完成记账。</p>' +
      '<div class="hint"><strong>功能：</strong>记录支出/收入、查询账单、统计汇总、分类管理</div>' +
      '<div class="hint"><strong>特点：</strong>每个用户自动创建独立账户，无需注册。首次使用时根据用户时区自动选择币种（SGD/CNY/USD 等）。</div>' +
      '<div class="hint"><strong>预设分类：</strong>餐饮、交通、购物、住房、娱乐、医疗、教育、通讯、礼物等</div>' +
      "</div>" +
      // ── xiao-fan-ka card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>🍜 小饭卡 (Xiao Fan Ka)</h2>" +
      '<span class="badge badge-success" id="xfk-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">AI 私人找店助手。说"附近有什么好吃的"即可获得个性化餐厅推荐。</p>' +
      '<div class="hint"><strong>功能：</strong>口味画像建立、大众点评 + 小红书双源搜索、交叉验证、个性化排序推荐</div>' +
      '<div class="hint"><strong>特点：</strong>像朋友推荐，2-3 句话不写报告。警惕刷评（陈晓卿定律），用得越久越懂你。</div>' +
      '<div class="hint"><strong>依赖：</strong>Python 3 + ddgs（容器内已预装）</div>' +
      "</div>" +
      // ── food-scout card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>🔍 食探 (Food Scout)</h2>" +
      '<span class="badge badge-success" id="foodscout-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">拍照识别食物、AI 估算卡路里和营养。支持自然语言查询全球食物营养数据，记录饮食和体重。</p>' +
      '<div class="hint"><strong>功能：</strong>拍照识食、营养查询（87+ 内置食物 + API 自学习）、饮食记录、每日/每周汇总、体重趋势</div>' +
      '<div class="hint"><strong>特点：</strong>用食物翻译热量（"多了两个馒头的量"），不报数字、不说教。查不到的食物自动从 API Ninjas 学习，越用越聪明。</div>' +
      '<div class="hint"><strong>配置：</strong>由管理员设置 NANOBOTS_NINJAS_API_KEY 环境变量（可选，无 key 仅用本地数据库）</div>' +
      "</div>" +
      // ── xiao-chu-niang card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>🥘 小厨娘 (Xiao Chu Niang)</h2>" +
      '<span class="badge badge-success" id="xcn-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">智能餐食规划，你的做饭搭子。说"今晚吃什么""帮我规划一周食谱"即可触发。</p>' +
      '<div class="hint"><strong>功能：</strong>自动生成膳食计划 + 购物清单，支持新加坡和中国市场，覆盖中日韩法泰越等多菜系</div>' +
      '<div class="hint"><strong>特点：</strong>自动检测地区和族裔偏好，营养均衡（3+1+1 原则），食材复用优化，预算控制</div>' +
      '<div class="hint"><strong>依赖：</strong>无额外依赖，使用 AI 助手内置的网络搜索能力</div>' +
      "</div>" +
      // ── AI News Collector card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>📰 AI 新闻速递 (AI News Collector)</h2>" +
      '<span class="badge badge-success" id="ainews-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">多维度搜索、聚合并按热度排序 AI 领域最新动态。说"今天有什么 AI 新闻"即可触发。</p>' +
      '<div class="hint"><strong>功能：</strong>6 维搜索（周报聚合、社区热度、产品发布、融资商业、研究突破、监管政策），交叉验证去重，热度排序</div>' +
      '<div class="hint"><strong>输出：</strong>15-25 条中文摘要，按 1-5 星热度降序排列，附原文链接</div>' +
      '<div class="hint"><strong>依赖：</strong>无额外依赖，使用 AI 助手内置的网络搜索能力</div>' +
      "</div>" +
      // ── Deep Research card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>🔬 深度研究 (Deep Research)</h2>" +
      '<span class="badge badge-success" id="deepresearch-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">通过 Gemini Deep Research API 对任意主题进行深度调研，生成结构化研究报告。说"帮我深入研究一下XX"即可触发。</p>' +
      '<div class="hint"><strong>功能：</strong>深度研究、本地文件 RAG 增强、成本预估（dry-run）、追问链、自适应轮询</div>' +
      '<div class="hint"><strong>输出：</strong>结构化 Markdown 报告（含来源引用），15-25 条新闻按热度排序</div>' +
      '<div class="hint"><strong>依赖：</strong>Gemini API Key（与图片生成共用）+ uv（容器内已预装）</div>' +
      '<div class="hint"><strong>费用：</strong>每次研究约 $1-3，可用 --dry-run 预估</div>' +
      "</div>" +
      // ── Travel Planner card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>✈️ 旅行规划 (Travel Planner)</h2>" +
      '<span class="badge badge-success" id="travel-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">规划完整的一日游、步行游览和多站行程，带时间预算和路线优化。说"帮我规划一下巴黎一日游"即可触发。</p>' +
      '<div class="hint"><strong>功能：</strong>步行/驾车/骑行路线规划、时间预算、可行性检查、路线优化建议</div>' +
      '<div class="hint"><strong>配置：</strong>由管理员设置 CAMINO_API_KEY 环境变量</div>' +
      "</div>" +
      // ── Luma Events card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>🎯 活动发现 (Luma Events)</h2>" +
      '<span class="badge badge-success" id="luma-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">从 lu.ma 获取全球城市的科技活动、创业聚会、行业会议等信息。说"新加坡最近有什么活动"即可触发。</p>' +
      '<div class="hint"><strong>功能：</strong>多城市活动搜索、日期过滤、票务信息（免费/付费/剩余名额）、主办方信息</div>' +
      '<div class="hint"><strong>覆盖：</strong>新加坡、雅加达、曼谷、班加罗尔、旧金山、纽约、伦敦、迪拜等全球主要城市</div>' +
      '<div class="hint"><strong>特点：</strong>无需 API Key，直接从 lu.ma 公开页面提取数据</div>' +
      "</div>" +
      // ── TopHub Trends card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>🔥 热榜追踪 (TopHub Trends)</h2>" +
      '<span class="badge badge-success" id="tophub-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">实时获取知乎、微博、B站、抖音等中文平台热榜，分析热点趋势，提供内容创作选题建议。说"今天有什么热点"即可触发。</p>' +
      '<div class="hint"><strong>数据源：</strong>TopHub 聚合热榜（知乎、微博、B站、抖音、百度、头条等）</div>' +
      '<div class="hint"><strong>功能：</strong>热点趋势分析、话题分类、高潜力话题筛选、内容选题建议</div>' +
      '<div class="hint"><strong>特点：</strong>无需 API Key，纯公开数据抓取</div>' +
      "</div>" +
      // ── World News Trends card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>🌍 国际新闻 (World News Trends)</h2>" +
      '<span class="badge badge-success" id="worldnews-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">聚合 BBC、Al Jazeera、CNA、TechCrunch 等国际主流媒体 RSS，实时获取全球热点新闻。说"最近国际上有什么大事"即可触发。</p>' +
      '<div class="hint"><strong>数据源：</strong>BBC (World/Asia/Tech/Business/Science)、Al Jazeera、CNA (Channel NewsAsia)、TechCrunch、Ars Technica</div>' +
      '<div class="hint"><strong>功能：</strong>多源并行抓取、自动去重、按分区过滤（world/asia/tech/business/science）</div>' +
      '<div class="hint"><strong>特点：</strong>无需 API Key，纯公开 RSS feed</div>' +
      "</div>" +
      // ── Humanizer card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>✍️ 去AI味 (Humanizer)</h2>" +
      '<span class="badge badge-success" id="humanizer-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">去除文本中的 AI 生成痕迹，使文章更自然、更有人味。发送文章并说"帮我去AI味"即可触发。</p>' +
      '<div class="hint"><strong>功能：</strong>24 种 AI 写作模式检测、智能改写、爆款 6 维度评分、人味 5 维度评分</div>' +
      '<div class="hint"><strong>适用：</strong>公众号文章、社交媒体文案、营销内容、博客文章等中文内容润色</div>' +
      '<div class="hint"><strong>特点：</strong>纯 AI 驱动，无额外依赖</div>' +
      "</div>" +
      // ── Voice message card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>🎤 语音消息 (Voice Message)</h2>" +
      '<span class="badge badge-success" id="voice-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">自动将语音消息转为文字，支持 WhatsApp 和 Telegram 语音/音频。</p>' +
      '<div class="hint"><strong>工作原理：</strong>收到语音消息后，自动调用 Gemini Flash 进行语音识别（STT），转写结果交给 AI 助手处理。</div>' +
      '<div class="hint"><strong>支持格式：</strong>OGG、MP3、M4A、WAV 等常见音频格式</div>' +
      '<div class="hint"><strong>费用：</strong>使用已配置的 Gemini API Key，每条语音约 $0.001（几乎免费）</div>' +
      "</div>" +
      // ── Oura Ring card ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>💍 Oura 智能戒指 (Oura Ring)</h2>" +
      '<span class="badge badge-success" id="oura-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">同步 Oura Ring 健康数据 — 睡眠、准备度、活动、心率、压力、血氧、运动记录。</p>' +
      '<div class="hint"><strong>数据：</strong>睡眠评分/阶段、身体准备度、步数/卡路里、静息心率、压力水平、血氧 SpO2、运动日志</div>' +
      '<div class="hint"><strong>触发：</strong>说"我昨晚睡得怎么样""今天的运动数据""这周的健康状况"等</div>' +
      '<div class="field" style="margin-top:12px">' +
      "<label>Oura Personal Access Token</label>" +
      '<input type="password" id="oura-apikey" placeholder="粘贴你的 Oura Token">' +
      '<div class="hint">从 <a href="https://cloud.ouraring.com/personal-access-tokens" target="_blank">cloud.ouraring.com/personal-access-tokens</a> 获取 Token</div>' +
      "</div>" +
      '<div id="oura-status" class="status-msg"></div>' +
      '<div class="actions">' +
      '<button class="btn btn-primary" id="oura-save">保存</button>' +
      "</div>" +
      "</div>" +
      // ── Baoyu Visual Skills section ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>🎨 视觉创作 (Baoyu Skills)</h2>" +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">文章配图、信息图、小红书图文、封面图生成。依赖图片生成（Nano Banana Pro）。</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
      '<div class="hint">📖 文章配图 <span class="badge badge-success" id="baoyu-illustrator-badge">加载中...</span></div>' +
      '<div class="hint">📊 信息图 <span class="badge badge-success" id="baoyu-infographic-badge">加载中...</span></div>' +
      '<div class="hint">📕 小红书图文 <span class="badge badge-success" id="baoyu-xhs-badge">加载中...</span></div>' +
      '<div class="hint">🖼️ 封面图 <span class="badge badge-success" id="baoyu-cover-badge">加载中...</span></div>' +
      "</div>" +
      '<div class="hint"><strong>触发：</strong>说"为文章配图""生成信息图""做小红书图片""生成封面图"</div>' +
      '<div class="hint"><strong>依赖：</strong>需要已配置 Gemini API Key（图片生成）</div>' +
      "</div>" +
      // ── Baoyu Utility Skills section ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>🔧 网页/推文抓取 (Baoyu Tools)</h2>" +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">将网页或 X(Twitter) 内容转为 Markdown 格式保存。</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
      '<div class="hint">🌐 网页转 Markdown <span class="badge badge-success" id="baoyu-url-badge">加载中...</span></div>' +
      '<div class="hint">🐦 推文转 Markdown <span class="badge badge-success" id="baoyu-x-badge">加载中...</span></div>' +
      "</div>" +
      '<div class="hint"><strong>触发：</strong>发送网址说"保存这个网页"或"帮我保存这条推文"</div>' +
      '<div class="hint"><strong>依赖：</strong>bun 运行时 + Chromium（网页抓取需要）</div>' +
      "</div>" +
      // ── Marketing Skills section ──
      '<div class="card">' +
      '<div class="service-header">' +
      "<h2>📝 内容营销 (Marketing Skills)</h2>" +
      '<span class="badge badge-success" id="marketing-badge">加载中...</span>' +
      "</div>" +
      '<p class="hint" style="margin-bottom:12px">10 个营销策略技能，涵盖文案、心理学、定价、发布、社交等。纯文本对话，无需额外配置。</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">' +
      '<div class="hint">✏️ 文案编辑 (Copy Editing)</div>' +
      '<div class="hint">📝 文案写作 (Copywriting)</div>' +
      '<div class="hint">🧠 营销心理学 (Marketing Psychology)</div>' +
      '<div class="hint">💡 营销创意 (Marketing Ideas)</div>' +
      '<div class="hint">📱 社交内容 (Social Content)</div>' +
      '<div class="hint">💰 定价策略 (Pricing Strategy)</div>' +
      '<div class="hint">📈 页面优化 (Page CRO)</div>' +
      '<div class="hint">🚀 发布策略 (Launch Strategy)</div>' +
      '<div class="hint">🎯 用户引导 (Onboarding CRO)</div>' +
      '<div class="hint">📧 邮件序列 (Email Sequence)</div>' +
      "</div>" +
      '<div class="hint"><strong>触发：</strong>说"帮我改文案""营销策略""定价建议""写发布计划"等</div>' +
      "</div>" +
      "</div>";

    bind("skill-save", "click", saveSkill);
    bind("oura-save", "click", saveOuraKey);

    // Load current status
    api("/api/setup/skills/status").then(function (d) {
      if (d && d["nano-banana-pro"]) {
        state.skills["nano-banana-pro"].configured = d["nano-banana-pro"].configured;
        // Update badge without full re-render
        var header = document.querySelector(".service-header");
        if (header) {
          var badge = header.querySelector(".badge");
          if (badge && d["nano-banana-pro"].configured) {
            badge.className = "badge badge-success";
            badge.textContent = "已配置 ✓";
            var input = document.getElementById("skill-apikey");
            if (input) input.placeholder = "已配置（重新输入可覆盖）";
          }
        }
      }
      // ezBookkeeping badge
      var ezbBadge = document.getElementById("ezb-badge");
      if (ezbBadge) {
        if (d && d["ezbookkeeping"] && d["ezbookkeeping"].configured) {
          ezbBadge.className = "badge badge-success";
          ezbBadge.textContent = "已启用 ✓";
        } else {
          ezbBadge.className = "badge badge-error";
          ezbBadge.textContent = "未配置";
        }
      }
      // xiao-fan-ka badge
      var xfkBadge = document.getElementById("xfk-badge");
      if (xfkBadge) {
        if (d && d["xiao-fan-ka"] && d["xiao-fan-ka"].configured) {
          xfkBadge.className = "badge badge-success";
          xfkBadge.textContent = "已就绪 ✓";
        } else {
          xfkBadge.className = "badge badge-error";
          xfkBadge.textContent = "缺少依赖";
        }
      }
      // food-scout badge
      var fsBadge = document.getElementById("foodscout-badge");
      if (fsBadge) {
        if (d && d["food-scout"] && d["food-scout"].configured) {
          fsBadge.className = "badge badge-success";
          fsBadge.textContent = "已就绪 ✓";
        } else {
          fsBadge.className = "badge badge-error";
          fsBadge.textContent = "未配置";
        }
      }
      // xiao-chu-niang badge
      var xcnBadge = document.getElementById("xcn-badge");
      if (xcnBadge) {
        if (d && d["xiao-chu-niang"] && d["xiao-chu-niang"].configured) {
          xcnBadge.className = "badge badge-success";
          xcnBadge.textContent = "已就绪 ✓";
        } else {
          xcnBadge.className = "badge badge-error";
          xcnBadge.textContent = "未就绪";
        }
      }
      // AI News Collector badge
      var ainewsBadge = document.getElementById("ainews-badge");
      if (ainewsBadge) {
        if (d && d["ai-news-collector"] && d["ai-news-collector"].configured) {
          ainewsBadge.className = "badge badge-success";
          ainewsBadge.textContent = "已就绪 ✓";
        } else {
          ainewsBadge.className = "badge badge-error";
          ainewsBadge.textContent = "未就绪";
        }
      }
      // Deep Research badge
      var drBadge = document.getElementById("deepresearch-badge");
      if (drBadge) {
        if (d && d["deep-research"] && d["deep-research"].configured) {
          drBadge.className = "badge badge-success";
          drBadge.textContent = "已就绪 ✓";
        } else {
          drBadge.className = "badge badge-error";
          drBadge.textContent = "需要 Gemini API Key";
        }
      }
      // Travel Planner badge
      var travelBadge = document.getElementById("travel-badge");
      if (travelBadge) {
        if (d && d["travel-planner"] && d["travel-planner"].configured) {
          travelBadge.className = "badge badge-success";
          travelBadge.textContent = "已就绪 ✓";
        } else {
          travelBadge.className = "badge badge-error";
          travelBadge.textContent = "未配置";
        }
      }
      // Humanizer badge
      var humanizerBadge = document.getElementById("humanizer-badge");
      if (humanizerBadge) {
        if (d && d["humanizer"] && d["humanizer"].configured) {
          humanizerBadge.className = "badge badge-success";
          humanizerBadge.textContent = "已就绪 ✓";
        } else {
          humanizerBadge.className = "badge badge-error";
          humanizerBadge.textContent = "未就绪";
        }
      }
      // World News Trends badge
      var worldnewsBadge = document.getElementById("worldnews-badge");
      if (worldnewsBadge) {
        if (d && d["world-news-trends"] && d["world-news-trends"].configured) {
          worldnewsBadge.className = "badge badge-success";
          worldnewsBadge.textContent = "已就绪 ✓";
        } else {
          worldnewsBadge.className = "badge badge-error";
          worldnewsBadge.textContent = "缺少 Python3";
        }
      }
      // TopHub Trends badge
      var tophubBadge = document.getElementById("tophub-badge");
      if (tophubBadge) {
        if (d && d["tophub-trends"] && d["tophub-trends"].configured) {
          tophubBadge.className = "badge badge-success";
          tophubBadge.textContent = "已就绪 ✓";
        } else {
          tophubBadge.className = "badge badge-error";
          tophubBadge.textContent = "缺少 Python3";
        }
      }
      // Luma Events badge
      var lumaBadge = document.getElementById("luma-badge");
      if (lumaBadge) {
        if (d && d["luma"] && d["luma"].configured) {
          lumaBadge.className = "badge badge-success";
          lumaBadge.textContent = "已就绪 ✓";
        } else {
          lumaBadge.className = "badge badge-error";
          lumaBadge.textContent = "缺少 Python3";
        }
      }
      // Voice message badge
      var voiceBadge = document.getElementById("voice-badge");
      if (voiceBadge) {
        if (d && d["voice-message"] && d["voice-message"].configured) {
          voiceBadge.className = "badge badge-success";
          voiceBadge.textContent = "已启用 ✓";
        } else {
          voiceBadge.className = "badge badge-error";
          voiceBadge.textContent = "未启用";
        }
      }
      // Oura Ring badge
      var ouraBadge = document.getElementById("oura-badge");
      if (ouraBadge) {
        if (d && d["oura-ring"] && d["oura-ring"].configured) {
          ouraBadge.className = "badge badge-success";
          ouraBadge.textContent = "已配置 ✓";
          var ouraInput = document.getElementById("oura-apikey");
          if (ouraInput) ouraInput.placeholder = "已配置（重新输入可覆盖）";
        } else {
          ouraBadge.className = "badge badge-error";
          ouraBadge.textContent = "未配置";
        }
      }
      // Baoyu visual skills badges
      var baoyuVisualMap = {
        "baoyu-article-illustrator": "baoyu-illustrator-badge",
        "baoyu-infographic": "baoyu-infographic-badge",
        "baoyu-xhs-images": "baoyu-xhs-badge",
        "baoyu-cover-image": "baoyu-cover-badge",
      };
      for (var bk in baoyuVisualMap) {
        var bBadge = document.getElementById(baoyuVisualMap[bk]);
        if (bBadge) {
          if (d && d[bk] && d[bk].configured) {
            bBadge.className = "badge badge-success";
            bBadge.textContent = "就绪 ✓";
          } else {
            bBadge.className = "badge badge-error";
            bBadge.textContent = "需配置图片生成";
          }
        }
      }
      // Baoyu utility skills badges
      var baoyuUtilMap = {
        "baoyu-url-to-markdown": "baoyu-url-badge",
        "baoyu-danger-x-to-markdown": "baoyu-x-badge",
      };
      for (var uk in baoyuUtilMap) {
        var uBadge = document.getElementById(baoyuUtilMap[uk]);
        if (uBadge) {
          if (d && d[uk] && d[uk].configured) {
            uBadge.className = "badge badge-success";
            uBadge.textContent = "就绪 ✓";
          } else {
            uBadge.className = "badge badge-error";
            uBadge.textContent = "需安装依赖";
          }
        }
      }
      // Marketing skills badge
      var mktBadge = document.getElementById("marketing-badge");
      if (mktBadge) {
        mktBadge.className = "badge badge-success";
        mktBadge.textContent = "已就绪 ✓";
      }
    });
  }

  function saveSkill() {
    var apiKeyVal = v("skill-apikey");
    var statusEl = $("#skill-status");
    if (!apiKeyVal) {
      statusEl.innerHTML = '<span class="badge badge-error">请输入 API Key</span>';
      return;
    }
    statusEl.innerHTML = "保存中...";
    api("/api/setup/skills/save", {
      method: "POST",
      body: JSON.stringify({ "nano-banana-pro": { apiKey: apiKeyVal } }),
    }).then(function (d) {
      if (d.ok) {
        state.skills["nano-banana-pro"].configured = true;
        statusEl.innerHTML = '<span class="badge badge-success">已保存!</span>';
        // Update badge
        var header = document.querySelector(".service-header");
        if (header) {
          var badge = header.querySelector(".badge");
          if (badge) {
            badge.className = "badge badge-success";
            badge.textContent = "已配置 ✓";
          }
        }
        var input = document.getElementById("skill-apikey");
        if (input) {
          input.value = "";
          input.placeholder = "已配置（重新输入可覆盖）";
        }
      } else {
        statusEl.innerHTML =
          '<span class="badge badge-error">' + esc(d.error || "保存失败") + "</span>";
      }
    });
  }

  function saveOuraKey() {
    var apiKeyVal = v("oura-apikey");
    var statusEl = $("#oura-status");
    if (!apiKeyVal) {
      statusEl.innerHTML = '<span class="badge badge-error">请输入 Token</span>';
      return;
    }
    statusEl.innerHTML = "保存中...";
    api("/api/setup/skills/save", {
      method: "POST",
      body: JSON.stringify({ "oura-ring": { apiKey: apiKeyVal } }),
    }).then(function (d) {
      if (d.ok) {
        statusEl.innerHTML = '<span class="badge badge-success">已保存!</span>';
        var ouraBadge = document.getElementById("oura-badge");
        if (ouraBadge) {
          ouraBadge.className = "badge badge-success";
          ouraBadge.textContent = "已配置 ✓";
        }
        var input = document.getElementById("oura-apikey");
        if (input) {
          input.value = "";
          input.placeholder = "已配置（重新输入可覆盖）";
        }
      } else {
        statusEl.innerHTML =
          '<span class="badge badge-error">' + esc(d.error || "保存失败") + "</span>";
      }
    });
  }

  // ── Settings page (OAuth service management) ──────────────
  function renderSettings() {
    app.innerHTML =
      '<div class="container">' +
      '<div class="settings-header">' +
      '<a href="#" class="btn btn-secondary btn-sm">&larr; 返回</a>' +
      "<h1>服务管理</h1>" +
      '<p class="subtitle">连接外部服务以增强 AI 助手功能</p>' +
      "</div>" +
      '<div id="services-list"><p>加载中...</p></div>' +
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
        if (el) el.innerHTML = '<p class="badge badge-error">加载服务列表失败</p>';
      });
  }

  function renderServiceCards() {
    var el = $("#services-list");
    if (!el) return;

    if (!state.oauthProviders.length) {
      el.innerHTML = '<div class="card"><p>暂无可用服务。</p></div>';
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
      ? '<span class="badge badge-success">已连接</span>'
      : provider.configured
        ? '<span class="badge badge-pending">未连接</span>'
        : '<span class="badge badge-error">未配置</span>';

    var actionBtn = "";
    if (provider.connected) {
      actionBtn =
        '<button class="btn btn-danger btn-sm" id="svc-disconnect-' +
        esc(provider.id) +
        '">断开连接</button>';
    } else if (provider.configured) {
      actionBtn =
        '<button class="btn btn-primary btn-sm" id="svc-connect-' +
        esc(provider.id) +
        '">连接</button>';
    } else {
      var envNames = provider.envHint
        ? esc(provider.envHint.clientId) + " 和 " + esc(provider.envHint.clientSecret)
        : "client ID 和 client secret";
      actionBtn = '<p class="hint">设置 ' + envNames + " 环境变量以启用。</p>";
    }

    var scopeList = "";
    if (provider.scopes && provider.scopes.length) {
      var labels = provider.scopes.map(function (s) {
        // Shorten Google scope URLs to readable labels
        var parts = s.split("/");
        return parts[parts.length - 1];
      });
      scopeList = '<div class="hint">权限范围: ' + esc(labels.join(", ")) + "</div>";
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
          var w = 500,
            h = 600;
          var left = (screen.width - w) / 2;
          var top = (screen.height - h) / 2;
          window.open(
            d.url,
            "oauth",
            "width=" + w + ",height=" + h + ",left=" + left + ",top=" + top,
          );
        } else {
          alert(d.error || "启动 OAuth 流程失败");
        }
      });
    });
  }

  // Called by OAuth callback popup to refresh provider list
  window.onOAuthDone = function () {
    if (state.page === "settings") {
      loadOAuthProviders();
    }
  };

  function bindDisconnect(providerId) {
    bind("svc-disconnect-" + providerId, "click", function () {
      if (!confirm("确定要断开 " + providerId + " 的连接吗？")) return;
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
      if (data.channels) {
        if (data.channels.telegram && data.channels.telegram.configured) {
          state.telegram.botToken = "configured";
          state.telegram.userId = data.channels.telegram.userId || "";
        }
        if (data.channels.whatsapp && data.channels.whatsapp.configured) {
          state.whatsapp.configured = true;
        }
      }
      if (data.model && data.model.defaultModel) {
        var dm = data.model.defaultModel;
        var slashIdx = dm.indexOf("/");
        if (slashIdx > 0) {
          state.model.provider = dm.substring(0, slashIdx);
          state.model.model = dm.substring(slashIdx + 1);
        } else {
          state.model.model = dm;
        }
      }
      route();
    })
    .catch(function () {
      state.step = 1;
      route();
    });
})();
