(function () {
  "use strict";

  // ===== 1. STATE =====
  var state = {
    currentTab: "skills",
    loading: true,
    channels: {
      telegram: { configured: false, userId: "" },
      whatsapp: { configured: false },
    },
    model: { configured: false },
    skills: {},
    oauthStatus: {},
    activeCategory: "daily",
    expandedSkill: null,
    knowledge: {
      googleDrive: {
        connected: false,
        enabled: false,
        folders: [],
        selectedFolders: [],
        lastSynced: null,
        fileCount: 0,
      },
      notion: {
        connected: false,
        enabled: false,
        databases: [],
        selectedDatabases: [],
        lastSynced: null,
        fileCount: 0,
      },
      dropbox: {
        connected: false,
        enabled: false,
        folders: [],
        selectedFolders: [],
        lastSynced: null,
        fileCount: 0,
      },
    },
    xCookiesStatus: { configured: false, source: null, hasMaskedAuthToken: null },
    adminServicesStatus: {},
    expandedService: null,
    showOnboarding: false,
    onboardingChannel: null,
    whatsappQR: null,
    whatsappPollInterval: null,
  };

  // ===== 2. API HELPERS =====
  function api(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function postJson(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // ===== 3. TOAST NOTIFICATION =====
  function showToast(message, type) {
    var toast = document.createElement("div");
    toast.className = "toast toast-" + (type || "info");
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.classList.add("show");
    }, 10);
    setTimeout(function () {
      toast.classList.remove("show");
      setTimeout(function () {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }

  // ===== 3.5. HTML ESCAPING =====
  function escapeHtml(str) {
    if (!str) return "";
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== 4. SVG ICONS =====
  var ICONS = {
    food: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>',
    restaurant:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
    camera:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    wallet:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    ring: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
    activity:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    checklist:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    fileText:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    newspaper:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><line x1="12" y1="11" x2="16" y2="11"/><line x1="12" y1="7" x2="16" y2="7"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="8" y1="19" x2="16" y2="19"/></svg>',
    trendingUp:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    globe:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
    plane:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
    mapPin:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    image:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    megaphone:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a9 9 0 0 1 18 0v5"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    messageSquare:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    wrench:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    gdrive:
      '<svg viewBox="0 0 24 24" fill="none"><path d="M8.01 2.76L1.34 14.24h6.67L14.68 2.76H8.01z" fill="#4285F4"/><path d="M14.68 2.76l-6.67 11.48 3.33 5.76 6.67-11.48" fill="#FBBC04"/><path d="M22.66 14.24h-6.67l3.33 5.76h6.67l-3.33-5.76z" fill="#EA4335"/><path d="M8.01 2.76l-3.34 5.76L11.34 20l3.34-5.76" fill="#34A853"/><path d="M14.68 2.76L8.01 14.24h6.67" fill="#188038" opacity=".4"/></svg>',
    notion:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.21 2.168c-.42-.326-.98-.7-2.055-.607L3.01 2.72c-.467.046-.56.28-.374.466l1.823 1.022zm.793 3.175v13.903c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.933-.56.933-1.167V6.356c0-.606-.233-.933-.746-.886l-15.177.886c-.56.047-.747.327-.747.933v.094zm14.337.373c.093.42 0 .84-.42.886l-.7.14v10.264c-.607.327-1.167.514-1.634.514-.747 0-.933-.234-1.494-.934l-4.577-7.186v6.952l1.447.327s0 .84-1.167.84l-3.221.187c-.093-.187 0-.653.327-.746l.84-.233V8.966L7.39 8.826c-.094-.42.14-1.026.793-1.073l3.454-.233 4.764 7.279V8.5l-1.214-.14c-.093-.513.28-.886.747-.933l3.455-.187v.516z"/></svg>',
    dropbox:
      '<svg viewBox="0 0 24 24" fill="#0061FF"><path d="M12 6.8L6.3 10.5 12 14.2l-5.7 3.7L.6 14.2 6.3 10.5.6 6.8 6.3 3.1 12 6.8zm0 0l5.7-3.7 5.7 3.7-5.7 3.7L12 6.8zm5.7 7.4L12 14.2l5.7-3.7 5.7 3.7-5.7 3.7zm-5.7.9l5.7 3.7-5.7 3.7V15.1zm0 0L6.3 18.8l-5.7-3.7L6.3 11.4 12 15.1z"/></svg>',
    database:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
    folder:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    telegram:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>',
    whatsapp:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
    building:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    upload:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>',
  };

  // ===== 5. CATEGORIES =====
  var CATEGORIES = [
    { id: "daily", name: "日常生活" },
    { id: "health", name: "健康运动" },
    { id: "work", name: "工作协作" },
    { id: "news", name: "资讯研究" },
    { id: "travel", name: "出行活动" },
    { id: "content", name: "内容创作" },
    { id: "marketing", name: "营销增长" },
  ];

  // ===== 5.5. SERVICES_META =====
  var SERVICES_META = [
    // OAuth services
    { id: "google", name: "Google", desc: "日历、邮件、网盘", type: "oauth", icon: "calendar" },
    { id: "github", name: "GitHub", desc: "仓库、提交记录", type: "oauth", icon: "globe" },
    { id: "todoist", name: "Todoist", desc: "任务管理", type: "oauth", icon: "checklist" },
    { id: "notion", name: "Notion", desc: "笔记、数据库", type: "oauth", icon: "fileText" },
    { id: "spotify", name: "Spotify", desc: "音乐播放控制", type: "oauth", icon: "mic" },
    { id: "microsoft365", name: "Microsoft 365", desc: "邮件、日历", type: "oauth", icon: "mail" },
    { id: "fitbit", name: "Fitbit", desc: "健康数据", type: "oauth", icon: "activity" },
    { id: "dropbox", name: "Dropbox", desc: "文件存储", type: "oauth", icon: "fileText" },
    // User credentials
    {
      id: "x-cookies",
      name: "X (Twitter)",
      desc: "发推、浏览、搜索推文",
      type: "credentials",
      icon: "shield",
    },
    // Admin API keys
    {
      id: "google-places",
      name: "Google Places",
      desc: "全球地点搜索",
      type: "admin",
      envVar: "NANOBOTS_GOOGLE_PLACES_API_KEY",
      icon: "wrench",
    },
    {
      id: "amap",
      name: "高德地图",
      desc: "中国地点搜索",
      type: "admin",
      envVar: "NANOBOTS_AMAP_API_KEY",
      icon: "mapPin",
    },
    {
      id: "openweathermap",
      name: "OpenWeatherMap",
      desc: "天气数据",
      type: "admin",
      envVar: "NANOBOTS_OPENWEATHERMAP_API_KEY",
      icon: "sun",
    },
    {
      id: "amadeus",
      name: "Amadeus",
      desc: "航班酒店搜索",
      type: "admin",
      envVar: "NANOBOTS_AMADEUS_API_KEY",
      icon: "plane",
    },
  ];

  // ===== 6. SKILLS_META =====
  var SKILLS_META = [
    {
      id: "xiao-chu-niang",
      name: "小厨娘",
      desc: "智能烹饪助手",
      fullDesc:
        "小厨娘是你的私人烹饪顾问。告诉它冰箱里有什么食材，它会为你推荐合适的菜谱，详细的步骤让厨房新手也能轻松上手。还能根据家庭成员的口味偏好和饮食限制，为你定制每周菜单和购物清单。",
      subtitle: "智能烹饪助手 · 日常生活",
      categories: ["daily"],
      icon: "food",
      iconClass: "icon-food",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: [
        "根据现有食材智能推荐菜谱",
        "分步骤烹饪指导，适合新手",
        "个性化饮食偏好与忌口设置",
        "每周菜单自动规划与购物清单",
        "营养成分分析与热量估算",
      ],
      triggers: [
        "吃什么",
        "食谱",
        "做饭",
        "菜谱",
        "一周食谱",
        "晚饭做什么",
        "买菜清单",
        "想做饭",
        "菜谱推荐",
        "冰箱里有",
        "教我做菜",
      ],
    },
    {
      id: "xiao-fan-ka",
      name: "小饭卡",
      desc: "美食发现助手",
      fullDesc:
        "小饭卡帮你发现身边的美食宝藏。结合你的个人口味偏好和当前位置，精准推荐附近的优质餐厅。支持按菜系、价格、评分等多维度筛选，再也不用纠结今天去哪吃。",
      subtitle: "美食发现助手 · 日常生活",
      categories: ["daily"],
      icon: "restaurant",
      iconClass: "icon-restaurant",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: [
        "基于地理位置的附近餐厅推荐",
        "个性化口味偏好记忆",
        "多维度筛选：菜系/价格/评分",
        "餐厅详情与用户评价展示",
        "智能避开踩雷餐厅",
      ],
      triggers: [
        "餐厅",
        "好吃的",
        "找店",
        "去哪吃",
        "聚餐",
        "约会吃饭",
        "美食",
        "附近美食",
        "推荐餐厅",
        "附近好吃的",
      ],
    },
    {
      id: "food-scout",
      name: "Food Scout",
      desc: "食物识别助手",
      fullDesc:
        "拍张照片就能识别食物种类并自动估算卡路里和营养成分。帮你轻松记录每日饮食摄入，搭配智能分析，让你对自己的饮食习惯了如指掌。",
      subtitle: "食物识别助手 · 日常生活 · 健康运动",
      categories: ["daily", "health"],
      icon: "camera",
      iconClass: "icon-camera",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: [
        "拍照智能识别食物种类",
        "自动估算热量与营养成分",
        "每日饮食摄入记录",
        "周期性饮食报告分析",
        "膳食均衡度评估建议",
      ],
      triggers: ["拍照", "卡路里", "体重", "营养", "减肥", "识别食物", "多少卡路里"],
    },
    {
      id: "ezbookkeeping",
      name: "ezBookkeeping",
      desc: "智能记账助手",
      fullDesc:
        "用自然语言轻松记账，只需说一句'午饭花了35元'即可自动归类并记录。支持多币种、分类统计、月度报告，让理财变得毫不费力。需要先配置 ezBookkeeping 服务连接。",
      subtitle: "智能记账助手 · 日常生活",
      categories: ["daily"],
      icon: "wallet",
      iconClass: "icon-wallet",
      type: "api-key",
      oauthProvider: null,
      apiKeyField: {
        label: "服务器地址",
        placeholder: "https://your-server.com",
        hint: "ezBookkeeping 服务器 URL",
      },
      features: [
        "自然语言一句话记账",
        "自动分类与标签归档",
        "多币种支持与汇率转换",
        "月度/年度消费报告",
        "预算超支智能提醒",
      ],
      triggers: ["花了", "收入", "工资", "开销", "账单", "记一笔", "本月开支"],
    },
    {
      id: "weather",
      name: "天气查询",
      desc: "天气预报助手",
      fullDesc:
        "实时获取精准天气预报，包含温度、湿度、风力、空气质量等详细信息。还能根据天气情况给出穿衣建议和出行提醒，让你每天出门都有准备。",
      subtitle: "天气预报助手 · 日常生活",
      categories: ["daily"],
      icon: "sun",
      iconClass: "icon-weather",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: [
        "实时天气与多日预报",
        "温度/湿度/风力/空气质量",
        "智能穿衣搭配建议",
        "恶劣天气预警提醒",
        "多城市天气对比查询",
      ],
      triggers: ["天气", "天气预报", "温度", "气温", "穿什么", "今天冷吗", "会下雨吗"],
    },
    {
      id: "voice-message",
      name: "Voice Message",
      desc: "语音转写助手",
      fullDesc:
        "自动将语音消息转换为文字，支持中英文混合识别。不方便听语音的时候，直接看文字就好。支持长语音分段处理，识别准确率高达 98%。",
      subtitle: "语音转写助手 · 日常生活",
      categories: ["daily"],
      icon: "mic",
      iconClass: "icon-voice",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: [
        "语音消息自动转文字",
        "中英文混合识别",
        "长语音分段处理",
        "高准确率语音识别",
        "支持多种方言",
      ],
      triggers: ["语音转文字", "音频转写", "录音识别", "帮我听语音"],
    },
    {
      id: "oura-ring",
      name: "Oura Ring",
      desc: "健康数据助手",
      fullDesc:
        "追踪睡眠、活动和身体状态。通过 Oura Ring 的生物指标数据，深度分析你的睡眠质量、活动量、心率变异性和身体准备度，帮助你优化健康状态。",
      subtitle: "健康数据助手 · 健康运动",
      categories: ["health"],
      icon: "ring",
      iconClass: "icon-ring",
      type: "api-key",
      oauthProvider: null,
      apiKeyField: {
        label: "Personal Access Token",
        placeholder: "XXXXXXXX",
        hint: "从 Oura 开发者后台获取",
      },
      features: [
        "睡眠质量分析",
        "活动量追踪",
        "心率变异性监测",
        "身体准备度评分",
        "趋势分析与建议",
      ],
      triggers: ["睡眠质量", "心率", "血氧", "运动记录", "睡眠报告", "昨晚睡得怎么样", "今日活动"],
    },
    {
      id: "fitbit-insights",
      name: "Fitbit Insights",
      desc: "运动追踪助手",
      fullDesc:
        "记录运动数据和健康趋势。连接你的 Fitbit 设备，自动追踪步数、心率、睡眠和运动数据，生成健康趋势分析报告。",
      subtitle: "运动追踪助手 · 健康运动",
      categories: ["health"],
      icon: "activity",
      iconClass: "icon-activity",
      type: "oauth",
      oauthProvider: "fitbit",
      apiKeyField: null,
      features: ["步数与运动记录", "心率监测", "睡眠分析", "健康趋势图", "运动目标追踪"],
      triggers: ["运动数据", "步数", "睡眠", "心率", "健身", "今天走了多少步", "运动记录"],
    },
    {
      id: "google-calendar",
      name: "Google 日历",
      desc: "日程管理助手",
      fullDesc:
        "管理日程、提醒和会议。连接你的 Google 日历，轻松查看今日日程、创建会议、设置提醒，还能自动检测日程冲突。",
      subtitle: "日程管理助手 · 工作协作",
      categories: ["work"],
      icon: "calendar",
      iconClass: "icon-calendar",
      type: "oauth",
      oauthProvider: "google",
      apiKeyField: null,
      features: ["查看今日日程", "创建/修改日程", "会议提醒", "日程冲突检测", "多日历支持"],
      triggers: ["今天有什么安排", "帮我建个日程", "明天的会议"],
    },
    {
      id: "microsoft365",
      name: "Microsoft 365",
      desc: "办公助手",
      fullDesc:
        "管理邮件、日历和通讯录。连接 Microsoft 365 账户，统一管理 Outlook 邮件、日历和联系人，提高工作效率。",
      subtitle: "办公助手 · 工作协作",
      categories: ["work"],
      icon: "mail",
      iconClass: "icon-mail",
      type: "oauth",
      oauthProvider: "microsoft365",
      apiKeyField: null,
      features: ["收发邮件", "日历管理", "通讯录查询", "邮件搜索", "会议安排"],
      triggers: ["Outlook邮件", "微软日历", "发邮件", "会议安排", "查看邮件", "日程安排"],
    },
    {
      id: "gmail",
      name: "Gmail",
      desc: "邮件助手",
      fullDesc:
        "智能管理 Gmail 邮件。连接你的 Gmail 账户，快速查看收件箱、发送邮件、搜索历史邮件，还能自动生成邮件摘要。",
      subtitle: "邮件助手 · 工作协作",
      categories: ["work"],
      icon: "mail",
      iconClass: "icon-mail",
      type: "oauth",
      oauthProvider: "google",
      apiKeyField: null,
      features: ["查看收件箱", "发送邮件", "搜索邮件", "邮件摘要", "标签管理"],
      triggers: ["查邮件", "发邮件", "未读邮件"],
    },
    {
      id: "todoist",
      name: "Todoist",
      desc: "任务管理助手",
      fullDesc:
        "管理任务和待办事项。连接 Todoist 账户，通过自然语言创建任务、查看待办、设置优先级和截止日期，让任务管理更高效。",
      subtitle: "任务管理助手 · 工作协作",
      categories: ["work"],
      icon: "checklist",
      iconClass: "icon-checklist",
      type: "oauth",
      oauthProvider: "todoist",
      apiKeyField: null,
      features: ["创建任务", "查看待办", "设置优先级", "项目管理", "截止日期提醒"],
      triggers: ["添加任务", "今天的待办", "任务列表"],
    },
    {
      id: "notion",
      name: "Notion",
      desc: "笔记助手",
      fullDesc:
        "管理 Notion 页面和数据库。连接 Notion 工作区，创建页面、查询数据库、更新内容、搜索笔记，让知识管理更轻松。",
      subtitle: "笔记助手 · 工作协作",
      categories: ["work"],
      icon: "fileText",
      iconClass: "icon-fileText",
      type: "oauth",
      oauthProvider: "notion",
      apiKeyField: null,
      features: ["创建页面", "查询数据库", "更新内容", "搜索笔记", "模板使用"],
      triggers: [
        "Notion页面",
        "笔记",
        "数据库",
        "知识库管理",
        "创建笔记",
        "查找笔记",
        "Notion搜索",
      ],
    },
    {
      id: "contract-agent",
      name: "合同审核",
      desc: "合同分析助手",
      fullDesc:
        "智能审核合同条款。上传合同文件，AI 会自动分析条款、识别风险点、提取关键条款、给出修改建议并进行合规检查。",
      subtitle: "合同分析助手 · 工作协作",
      categories: ["work"],
      icon: "shield",
      iconClass: "icon-shield",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["合同条款分析", "风险点识别", "关键条款提取", "修改建议", "合规检查"],
      triggers: ["合同", "协议", "审查", "风险分析", "条款", "签约", "保密协议"],
    },
    {
      id: "ai-news-collector",
      name: "AI News",
      desc: "AI 新闻聚合",
      fullDesc:
        "每日精选 AI 领域最新动态。自动聚合来自顶级科技媒体和研究机构的 AI 新闻，包括技术突破、产品发布、行业趋势和重要论文。",
      subtitle: "AI 新闻聚合 · 资讯研究",
      categories: ["news"],
      icon: "newspaper",
      iconClass: "icon-newspaper",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["AI 领域新闻聚合", "每日精选推送", "技术趋势分析", "重要发布追踪", "多来源整合"],
      triggers: ["AI新闻", "AI动态", "今天有什么新技术"],
    },
    {
      id: "tophub-trends",
      name: "TopHub 热点",
      desc: "热点资讯助手",
      fullDesc:
        "聚合各平台热门话题。实时汇总微博、知乎、B站、抖音等主流平台的热搜榜单，一键掌握全网热点和话题趋势。",
      subtitle: "热点资讯助手 · 资讯研究",
      categories: ["news"],
      icon: "trendingUp",
      iconClass: "icon-trendingUp",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["全网热点聚合", "多平台覆盖", "实时更新", "话题趋势分析", "热度排名"],
      triggers: ["热榜", "热搜", "热点趋势", "今天什么火", "选题灵感", "今日热点", "热门话题"],
    },
    {
      id: "world-news-trends",
      name: "World News",
      desc: "国际新闻助手",
      fullDesc:
        "全球重要新闻速览。聚合国际主流媒体的新闻报道，涵盖政治、经济、科技、文化等领域，多语言来源确保视野全面。",
      subtitle: "国际新闻助手 · 资讯研究",
      categories: ["news"],
      icon: "globe",
      iconClass: "icon-globe",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["国际新闻聚合", "多语言来源", "地区分类", "重大事件追踪", "新闻摘要"],
      triggers: [
        "国际新闻",
        "世界新闻",
        "全球热点",
        "国际头条",
        "海外新闻",
        "BBC新闻",
        "科技新闻",
        "亚洲新闻",
        "世界大事",
        "全球新闻",
      ],
    },
    {
      id: "deep-research",
      name: "Deep Research",
      desc: "深度研究助手",
      fullDesc:
        "对复杂话题进行深入研究。提出你的研究问题，AI 会进行多角度分析、查找权威来源、生成结构化报告，并标注引用来源。",
      subtitle: "深度研究助手 · 资讯研究",
      categories: ["news"],
      icon: "search",
      iconClass: "icon-search",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["深度话题研究", "多角度分析", "引用来源标注", "结构化报告", "跟踪研究"],
      triggers: [
        "深度研究",
        "调研",
        "分析报告",
        "帮我研究一下",
        "深入了解",
        "做个调查",
        "深入研究",
        "帮我调研",
        "分析一下",
      ],
    },
    {
      id: "travel-planner",
      name: "Travel Planner",
      desc: "旅行规划助手",
      fullDesc:
        "智能规划旅行行程。告诉它你的目的地和偏好，AI 会自动生成行程规划、推荐景点、搜索机票酒店、估算预算并提供签证信息。",
      subtitle: "旅行规划助手 · 出行活动",
      categories: ["travel"],
      icon: "plane",
      iconClass: "icon-plane",
      type: "api-key",
      oauthProvider: null,
      apiKeyField: {
        label: "Camino API Key",
        placeholder: "cam_xxxx",
        hint: "从 Camino API 获取",
      },
      features: ["行程自动规划", "机票酒店搜索", "景点推荐", "预算估算", "签证信息"],
      triggers: [
        "旅行规划",
        "行程安排",
        "一日游",
        "路线规划",
        "步行游览",
        "自驾游",
        "骑行路线",
        "去哪玩",
        "旅行计划",
      ],
    },
    {
      id: "luma",
      name: "Luma",
      desc: "活动发现助手",
      fullDesc:
        "发现附近的线下活动和聚会。基于你的位置和兴趣，推荐周边的聚会、讲座、工作坊、社交活动等，帮你扩展社交圈。",
      subtitle: "活动发现助手 · 出行活动",
      categories: ["travel"],
      icon: "mapPin",
      iconClass: "icon-mapPin",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["附近活动发现", "活动详情查看", "类型筛选", "时间筛选", "活动提醒"],
      triggers: [
        "活动",
        "聚会",
        "会议",
        "技术活动",
        "创业活动",
        "线下活动",
        "什么活动",
        "哪些活动",
        "附近活动",
        "周末活动",
        "有什么聚会",
      ],
    },
    {
      id: "nano-banana-pro",
      name: "Nano Banana Pro",
      desc: "AI 图片生成",
      fullDesc:
        "用文字描述生成精美图片。基于 Google Gemini 的强大图像生成能力，输入描述即可生成高清图片，支持多种风格和批量生成。",
      subtitle: "AI 图片生成 · 内容创作",
      categories: ["content"],
      icon: "image",
      iconClass: "icon-image",
      type: "api-key",
      oauthProvider: null,
      apiKeyField: {
        label: "Gemini API Key",
        placeholder: "AIza...",
        hint: "从 Google AI Studio 获取",
      },
      features: ["文字生成图片", "多种风格选择", "高清输出", "图片编辑", "批量生成"],
      triggers: ["生成图片", "画图", "修图", "AI绘画", "图片编辑", "画一张", "帮我做图"],
    },
    {
      id: "baoyu-article-illustrator",
      name: "文章配图",
      desc: "文章插图生成",
      fullDesc:
        "为文章自动生成配图。分析文章内容后，自动生成与主题匹配的插图，支持多种风格和尺寸，确保风格一致性。",
      subtitle: "文章插图生成 · 内容创作",
      categories: ["content"],
      icon: "image",
      iconClass: "icon-image",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["根据文章内容生成配图", "多种风格", "尺寸自适应", "批量生成", "风格一致性"],
      triggers: ["文章配图", "插图生成"],
    },
    {
      id: "baoyu-infographic",
      name: "信息图",
      desc: "信息图生成",
      fullDesc:
        "将数据和概念可视化。输入数据或概念，自动生成美观的信息图，支持流程图、对比图、统计图表等多种形式。",
      subtitle: "信息图生成 · 内容创作",
      categories: ["content"],
      icon: "image",
      iconClass: "icon-image",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["数据可视化", "流程图生成", "对比图", "统计图表", "概念图解"],
      triggers: ["信息图", "数据可视化", "做个信息图"],
    },
    {
      id: "baoyu-xhs-images",
      name: "小红书图",
      desc: "小红书配图生成",
      fullDesc:
        "生成适合小红书的精美图片。专为小红书平台优化，提供多种排版模板、滤镜效果和文字叠加功能，一键生成吸睛配图。",
      subtitle: "小红书配图生成 · 内容创作",
      categories: ["content"],
      icon: "image",
      iconClass: "icon-image",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["小红书风格适配", "多种排版模板", "文字叠加", "滤镜效果", "批量生成"],
      triggers: ["小红书配图", "做小红书图", "小红书图片", "小红书种草"],
    },
    {
      id: "baoyu-cover-image",
      name: "封面图",
      desc: "封面图生成",
      fullDesc:
        "为文章和视频生成封面。智能设计封面图，支持多平台尺寸、标题排版、品牌色适配，提供多种模板选择。",
      subtitle: "封面图生成 · 内容创作",
      categories: ["content"],
      icon: "image",
      iconClass: "icon-image",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["封面图设计", "多平台尺寸", "标题排版", "品牌色适配", "模板选择"],
      triggers: ["封面图", "文章封面", "生成封面", "做个封面图"],
    },
    {
      id: "humanizer",
      name: "Humanizer",
      desc: "文案润色助手",
      fullDesc:
        "让 AI 文案更自然。将生硬的 AI 生成文案改写为更人性化、口语化的表达，支持多语言和风格调整，同时保留原意。",
      subtitle: "文案润色助手 · 内容创作",
      categories: ["content"],
      icon: "edit",
      iconClass: "icon-edit",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["AI 文案人性化", "口语化改写", "风格调整", "多语言支持", "保留原意"],
      triggers: ["去AI味", "润色文案", "润色文章", "改写文章", "改写一下", "更自然一点", "AI痕迹"],
    },
    {
      id: "baoyu-url-to-markdown",
      name: "URL 解析",
      desc: "网页解析工具",
      fullDesc:
        "将网页内容转为结构化文本。提取网页核心内容，转换为 Markdown 格式，去除广告和无关元素，支持批量处理。",
      subtitle: "网页解析工具 · 内容创作",
      categories: ["content"],
      icon: "globe",
      iconClass: "icon-globe",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["网页内容提取", "Markdown 转换", "图片保留", "去除广告", "批量处理"],
      triggers: [
        "网页保存",
        "网页转markdown",
        "解析网页",
        "提取网页内容",
        "读取网页",
        "抓取网页",
        "打开链接",
        "读取链接",
      ],
    },
    {
      id: "x-assistant",
      name: "X 助手",
      desc: "推特管家",
      fullDesc:
        "你的推特管家。发推文、浏览时间线、查看用户推文、搜索推文，一句话搞定。支持发推文串、查看推文详情和互动数据。需要配置 X Cookie 才能使用。",
      subtitle: "推特管家 · 社交媒体",
      categories: ["content"],
      icon: "megaphone",
      iconClass: "icon-megaphone",
      type: "service-dep",
      oauthProvider: null,
      requiredServices: ["x-cookies"],
      apiKeyField: null,
      features: ["发推文 / 推文串", "浏览时间线", "查看用户推文", "搜索推文", "推文详情"],
      triggers: ["发推", "推文", "推特", "tweet", "timeline", "时间线", "搜索推文"],
    },
    {
      id: "copy-editing",
      name: "文案编辑",
      desc: "营销文案编辑",
      fullDesc:
        "优化营销文案表达。校正语法错误、统一风格、提升可读性、优化 SEO，让你的营销文案更专业更有效。",
      subtitle: "营销文案编辑 · 营销增长",
      categories: ["marketing"],
      icon: "edit",
      iconClass: "icon-edit",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["文案优化", "语法校正", "风格统一", "可读性提升", "SEO 优化"],
      triggers: ["优化文案", "编辑文案", "文案校对", "修改文案"],
    },
    {
      id: "copywriting",
      name: "文案创作",
      desc: "营销文案创作",
      fullDesc:
        "生成各类营销文案。创作广告文案、产品描述、营销标题、社媒文案，支持 A/B 测试文案生成。",
      subtitle: "营销文案创作 · 营销增长",
      categories: ["marketing"],
      icon: "edit",
      iconClass: "icon-edit",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["广告文案", "产品描述", "标题创作", "社媒文案", "A/B 测试文案"],
      triggers: ["写文案", "广告词", "营销文案", "文案创作"],
    },
    {
      id: "marketing-psychology",
      name: "心理学营销",
      desc: "营销心理学助手",
      fullDesc:
        "运用心理学原理优化营销。分析心理触发点、优化说服力、建立用户心理模型，提供转化心理学策略和案例分析。",
      subtitle: "营销心理学助手 · 营销增长",
      categories: ["marketing"],
      icon: "megaphone",
      iconClass: "icon-megaphone",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["心理触发点分析", "说服力优化", "用户心理建模", "转化心理学", "案例分析"],
      triggers: ["营销心理", "说服力优化", "消费者行为", "心理学营销"],
    },
    {
      id: "marketing-ideas",
      name: "营销创意",
      desc: "营销点子生成器",
      fullDesc:
        "激发营销创意灵感。进行创意脑暴、活动策划、渠道建议、竞品分析，洞察行业趋势，为你的营销活动提供创意支持。",
      subtitle: "营销点子生成器 · 营销增长",
      categories: ["marketing"],
      icon: "megaphone",
      iconClass: "icon-megaphone",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["创意脑暴", "活动策划", "渠道建议", "竞品分析", "趋势洞察"],
      triggers: ["营销创意", "活动点子", "增长策略", "推广方案"],
    },
    {
      id: "social-content",
      name: "社媒内容",
      desc: "社交媒体内容助手",
      fullDesc:
        "创作社媒平台内容。为不同社交平台适配内容、制定内容日历、策划话题、设计互动策略，并提供数据分析。",
      subtitle: "社交媒体内容助手 · 营销增长",
      categories: ["marketing"],
      icon: "megaphone",
      iconClass: "icon-megaphone",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["多平台适配", "内容日历", "话题策划", "互动策略", "数据分析"],
      triggers: ["社媒内容", "发什么帖子", "社交媒体", "内容日历"],
    },
    {
      id: "pricing-strategy",
      name: "定价策略",
      desc: "定价分析助手",
      fullDesc:
        "制定最优定价方案。分析定价模型、对比竞品价格、应用价值定价、设计促销策略，评估价格弹性。",
      subtitle: "定价分析助手 · 营销增长",
      categories: ["marketing"],
      icon: "trendingUp",
      iconClass: "icon-trendingUp",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["定价模型分析", "竞品价格对比", "价值定价", "促销策略", "价格弹性"],
      triggers: ["定价建议", "如何定价", "定价策略", "付费方案"],
    },
    {
      id: "page-cro",
      name: "页面 CRO",
      desc: "转化率优化助手",
      fullDesc:
        "优化落地页转化率。分析页面结构、优化转化漏斗、提供 A/B 测试建议、优化 CTA 按钮，改进用户体验。",
      subtitle: "转化率优化助手 · 营销增长",
      categories: ["marketing"],
      icon: "trendingUp",
      iconClass: "icon-trendingUp",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["页面分析", "转化漏斗", "A/B 测试建议", "CTA 优化", "用户体验改进"],
      triggers: ["优化页面", "提高转化", "转化率优化", "CRO"],
    },
    {
      id: "launch-strategy",
      name: "发布策略",
      desc: "产品发布策略助手",
      fullDesc:
        "制定产品发布计划。规划发布流程、设计渠道策略、制定预热方案、构建发布时间线、策划 PR 活动。",
      subtitle: "产品发布策略助手 · 营销增长",
      categories: ["marketing"],
      icon: "megaphone",
      iconClass: "icon-megaphone",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["发布计划制定", "渠道策略", "预热方案", "发布时间线", "PR 策略"],
      triggers: ["发布计划", "上线策略", "产品发布", "Go-to-Market"],
    },
    {
      id: "onboarding-cro",
      name: "Onboarding 优化",
      desc: "用户引导优化助手",
      fullDesc:
        "优化用户引导流程。分析引导流程、提升激活率、改进留存、设计首次体验、设置成就里程碑。",
      subtitle: "用户引导优化助手 · 营销增长",
      categories: ["marketing"],
      icon: "trendingUp",
      iconClass: "icon-trendingUp",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["引导流程优化", "激活率提升", "留存分析", "首次体验设计", "里程碑设置"],
      triggers: ["优化引导", "提升激活", "用户引导", "新手体验"],
    },
    {
      id: "email-sequence",
      name: "邮件序列",
      desc: "邮件营销助手",
      fullDesc:
        "设计自动化邮件序列。规划邮件流程、设置触发条件、创作邮件模板、追踪转化效果、进行 A/B 测试。",
      subtitle: "邮件营销助手 · 营销增长",
      categories: ["marketing"],
      icon: "mail",
      iconClass: "icon-mail",
      type: "instant",
      oauthProvider: null,
      apiKeyField: null,
      features: ["邮件序列设计", "触发条件设置", "模板创作", "转化追踪", "A/B 测试"],
      triggers: ["邮件序列", "设计邮件", "邮件营销", "自动邮件"],
    },
    {
      id: "shipcast",
      name: "ShipCast",
      desc: "更新推文助手",
      fullDesc:
        "将代码更新转为社媒内容。连接 GitHub 仓库，自动提取代码更新信息，转化为适合社交媒体的推文内容，支持多平台发布和定期汇总。",
      subtitle: "更新推文助手 · 营销增长",
      categories: ["marketing"],
      icon: "megaphone",
      iconClass: "icon-megaphone",
      type: "service-dep",
      oauthProvider: null,
      requiredServices: ["github", "x-cookies"],
      apiKeyField: null,
      features: ["代码更新摘要", "推文自动生成", "技术内容转化", "多平台发布", "定期汇总"],
      triggers: ["生成更新推文", "发布更新", "代码更新推文", "Build in Public"],
    },
  ];

  // ===== 7. UTILITY FUNCTIONS =====
  function getSkillsForCategory(categoryId) {
    return SKILLS_META.filter(function (s) {
      return s.categories.indexOf(categoryId) !== -1;
    });
  }

  function getServiceName(svcId) {
    for (var i = 0; i < SERVICES_META.length; i++) {
      if (SERVICES_META[i].id === svcId) return SERVICES_META[i].name;
    }
    return svcId;
  }

  function getSkillStatus(skill) {
    var skillState = state.skills[skill.id] || {};
    var configured = false;
    var enabled = skillState.enabled !== false;
    var configHint = "";

    if (skill.type === "instant") {
      configured = true;
    } else if (skill.type === "api-key") {
      configured = skillState.configured || false;
      if (!configured) configHint = "需要配置 API Key";
    } else if (skill.type === "oauth") {
      var provider = skill.oauthProvider;
      configured = (state.oauthStatus[provider] && state.oauthStatus[provider].connected) || false;
      if (!configured) configHint = "需要连接 " + getServiceName(provider);
    } else if (skill.type === "service-dep") {
      var missing = (skill.requiredServices || []).filter(function (svc) {
        if (svc === "x-cookies") return !(state.xCookiesStatus && state.xCookiesStatus.configured);
        return !(state.oauthStatus[svc] && state.oauthStatus[svc].connected);
      });
      configured = missing.length === 0;
      if (!configured) {
        configHint = "需要配置: " + missing.map(getServiceName).join("、");
      }
    }

    var statusClass = "disabled";
    var statusText = "未启用";
    if (enabled && configured) {
      statusClass = "enabled";
      statusText = "已启用";
    } else if (!configured && skill.type !== "instant") {
      statusClass = "needs-config";
      statusText = "需要配置";
    }

    return {
      configured: configured,
      enabled: enabled,
      statusClass: statusClass,
      statusText: statusText,
      configHint: configHint,
    };
  }

  function getCategoryCount(categoryId) {
    return getSkillsForCategory(categoryId).length;
  }

  // ===== 8. RENDER NAV =====
  function renderNav() {
    var hasChannel = state.channels.telegram.configured || state.channels.whatsapp.configured;
    var statusHtml = hasChannel
      ? '<div class="nav-status"><span class="status-dot-pulse"></span>运行中</div>'
      : '<div class="nav-status nav-status-offline"><span class="status-dot-pulse"></span>未连接</div>';

    var navHtml =
      '<nav class="top-nav">' +
      '<div class="nav-left">' +
      '<a class="brand" href="#skills">' +
      '<div class="brand-icon">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="5" y="8" width="14" height="10" rx="2"/>' +
      '<path d="M12 8V5"/>' +
      '<circle cx="12" cy="3" r="2"/>' +
      '<circle cx="9" cy="13" r="1" fill="currentColor" stroke="none"/>' +
      '<circle cx="15" cy="13" r="1" fill="currentColor" stroke="none"/>' +
      '<path d="M9 17h6"/>' +
      '<path d="M3 12H1"/>' +
      '<path d="M23 12h-2"/>' +
      "</svg>" +
      "</div>" +
      '<span class="brand-name">Nanobots</span>' +
      "</a>" +
      "</div>" +
      '<div class="nav-center">' +
      '<div class="nav-tabs">' +
      '<button class="nav-tab ' +
      (state.currentTab === "im" ? "active" : "") +
      '" data-tab="im">' +
      ICONS.messageSquare +
      "接入IM</button>" +
      '<button class="nav-tab ' +
      (state.currentTab === "skills" ? "active" : "") +
      '" data-tab="skills">' +
      ICONS.wrench +
      "技能库</button>" +
      '<button class="nav-tab ' +
      (state.currentTab === "services" ? "active" : "") +
      '" data-tab="services">' +
      ICONS.globe +
      "服务</button>" +
      '<button class="nav-tab ' +
      (state.currentTab === "knowledge" ? "active" : "") +
      '" data-tab="knowledge">' +
      ICONS.book +
      "知识库</button>" +
      "</div>" +
      "</div>" +
      '<div class="nav-right">' +
      statusHtml +
      "</div>" +
      "</nav>";
    return navHtml;
  }

  // ===== 9. RENDER SKILLS PAGE =====
  function renderSkillCard(skill) {
    var status = getSkillStatus(skill);
    var keywordTags = skill.triggers
      .slice(0, 2)
      .map(function (t) {
        return '<span class="keyword-tag">' + t + "</span>";
      })
      .join("");

    return (
      '<div class="skill-card" data-skill-id="' +
      skill.id +
      '">' +
      '<div class="skill-card-top">' +
      '<div class="skill-icon-wrap ' +
      skill.iconClass +
      '">' +
      ICONS[skill.icon] +
      "</div>" +
      '<span class="status-badge ' +
      status.statusClass +
      '">' +
      '<span class="status-badge-dot"></span>' +
      status.statusText +
      "</span>" +
      "</div>" +
      '<div class="skill-name">' +
      skill.name +
      "</div>" +
      '<div class="skill-desc">' +
      skill.desc +
      "</div>" +
      (status.configHint ? '<div class="skill-config-hint">' + status.configHint + "</div>" : "") +
      '<div class="skill-card-bottom">' +
      '<div class="skill-keywords">' +
      keywordTags +
      "</div>" +
      '<label class="toggle">' +
      '<input type="checkbox" ' +
      (status.enabled && status.configured ? "checked" : "") +
      (!status.configured && skill.type === "api-key" ? " disabled" : "") +
      ">" +
      '<span class="toggle-track"></span>' +
      "</label>" +
      "</div>" +
      "</div>"
    );
  }

  function renderExpandedCard(skill) {
    var status = getSkillStatus(skill);
    var featuresHtml = skill.features
      .map(function (f) {
        return (
          '<li class="feature-item">' +
          '<span class="feature-check">' +
          ICONS.check +
          "</span>" +
          f +
          "</li>"
        );
      })
      .join("");

    var triggersHtml = skill.triggers
      .map(function (t) {
        return '<span class="trigger-chip">' + t + "</span>";
      })
      .join("");

    var apiKeySectionHtml = "";
    if (skill.type === "api-key") {
      var skillState = state.skills[skill.id] || {};
      var apiKeyValue = skillState.apiKey || "";
      apiKeySectionHtml =
        '<div class="expanded-section api-key-section">' +
        "<h4>API 配置</h4>" +
        '<div class="api-key-form">' +
        '<label class="api-key-label">' +
        skill.apiKeyField.label +
        "</label>" +
        '<input type="text" class="api-key-input" placeholder="' +
        skill.apiKeyField.placeholder +
        '" value="' +
        escapeHtml(apiKeyValue) +
        '">' +
        '<p class="api-key-hint">' +
        skill.apiKeyField.hint +
        "</p>" +
        '<button class="api-key-save-btn">保存配置</button>' +
        "</div>" +
        "</div>";
    }

    return (
      '<div class="skill-card expanded" data-skill-id="' +
      skill.id +
      '">' +
      '<button class="close-btn">' +
      ICONS.x +
      "</button>" +
      '<div class="expanded-layout">' +
      '<div class="expanded-left">' +
      '<div class="expanded-header">' +
      '<div class="expanded-icon ' +
      skill.iconClass +
      '">' +
      ICONS[skill.icon] +
      "</div>" +
      '<div class="expanded-title-area">' +
      '<div class="expanded-title">' +
      skill.name +
      "</div>" +
      '<div class="expanded-subtitle">' +
      skill.subtitle +
      "</div>" +
      "</div>" +
      '<span class="status-badge ' +
      status.statusClass +
      '">' +
      '<span class="status-badge-dot"></span>' +
      status.statusText +
      "</span>" +
      "</div>" +
      '<div class="expanded-desc">' +
      skill.fullDesc +
      "</div>" +
      (status.configHint
        ? '<div class="skill-config-hint expanded-config-hint">' +
          status.configHint +
          (skill.type !== "api-key" ? ' — <a href="#services">前往服务页配置</a>' : "") +
          "</div>"
        : "") +
      '<div class="expanded-features">' +
      "<h4>核心功能</h4>" +
      '<ul class="feature-list">' +
      featuresHtml +
      "</ul>" +
      "</div>" +
      "</div>" +
      '<div class="expanded-right">' +
      '<div class="expanded-section">' +
      "<h4>触发关键词</h4>" +
      '<div class="trigger-list">' +
      triggersHtml +
      "</div>" +
      "</div>" +
      apiKeySectionHtml +
      '<div class="expanded-toggle-area">' +
      '<div class="toggle-label">' +
      '<span class="toggle-label-main">启用此技能</span>' +
      '<span class="toggle-label-sub">开启后可通过对话激活</span>' +
      "</div>" +
      '<label class="toggle-large">' +
      '<input type="checkbox" ' +
      (status.enabled && status.configured ? "checked" : "") +
      (!status.configured && skill.type === "api-key" ? " disabled" : "") +
      ">" +
      '<span class="toggle-track"></span>' +
      "</label>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderSkillsPage() {
    var categoryPillsHtml = CATEGORIES.map(function (cat) {
      var count = getCategoryCount(cat.id);
      var active = cat.id === state.activeCategory ? "active" : "";
      return (
        '<button class="category-pill ' +
        active +
        '" data-category="' +
        cat.id +
        '">' +
        cat.name +
        '<span class="pill-count">' +
        count +
        "</span>" +
        "</button>"
      );
    }).join("");

    var skills = getSkillsForCategory(state.activeCategory);
    var skillCardsHtml = skills
      .map(function (skill) {
        if (state.expandedSkill === skill.id) {
          return renderExpandedCard(skill);
        } else {
          return renderSkillCard(skill);
        }
      })
      .join("");

    return (
      '<main class="main">' +
      '<div class="page-header">' +
      "<h1>技能库</h1>" +
      "<p>为你的 AI 助手装备各种实用技能，让它更懂你的生活</p>" +
      "</div>" +
      '<div class="categories">' +
      categoryPillsHtml +
      "</div>" +
      '<div class="skills-grid">' +
      skillCardsHtml +
      "</div>" +
      "</main>"
    );
  }

  // ===== 9.5. RENDER SERVICES PAGE =====
  function renderServicesPage() {
    var oauthCards = SERVICES_META.filter(function (s) {
      return s.type === "oauth";
    })
      .map(function (service) {
        var oauthInfo = state.oauthStatus[service.id] || {};
        var connected = oauthInfo.connected || false;
        var configured = oauthInfo.configured !== false;
        var statusClass = connected ? "enabled" : "needs-config";
        var statusText = connected ? "已连接" : "未连接";
        var buttonHtml = "";
        if (connected) {
          buttonHtml =
            '<button class="service-disconnect-btn" data-provider="' +
            service.id +
            '">断开</button>';
        } else if (configured) {
          buttonHtml =
            '<button class="service-connect-btn" data-provider="' + service.id + '">连接</button>';
        } else {
          statusText = "未配置";
          buttonHtml = '<span class="service-hint">需管理员配置 OAuth</span>';
        }
        return (
          '<div class="service-card">' +
          '<div class="service-card-icon ' +
          ("icon-" + service.icon) +
          '">' +
          (ICONS[service.icon] || "") +
          "</div>" +
          '<div class="service-card-info">' +
          '<div class="service-card-name">' +
          service.name +
          "</div>" +
          '<div class="service-card-desc">' +
          service.desc +
          "</div>" +
          "</div>" +
          '<div class="service-card-right">' +
          '<span class="status-badge ' +
          statusClass +
          '"><span class="status-badge-dot"></span>' +
          statusText +
          "</span>" +
          buttonHtml +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    // X Cookie credentials card
    var xStatus = state.xCookiesStatus || {};
    var xStatusClass = xStatus.configured ? "enabled" : "needs-config";
    var xStatusText = xStatus.configured ? "已配置" : "未配置";
    var credentialsCards =
      '<div class="service-card service-card-expandable" data-service="x-cookies">' +
      '<div class="service-card-icon icon-shield">' +
      (ICONS.shield || "") +
      "</div>" +
      '<div class="service-card-info">' +
      '<div class="service-card-name">X Cookie</div>' +
      '<div class="service-card-desc">发推、浏览、搜索推文</div>' +
      "</div>" +
      '<div class="service-card-right">' +
      '<span class="status-badge ' +
      xStatusClass +
      '"><span class="status-badge-dot"></span>' +
      xStatusText +
      "</span>" +
      '<button class="service-expand-btn">' +
      (state.expandedService === "x-cookies" ? "收起" : "配置") +
      "</button>" +
      "</div>" +
      "</div>";

    if (state.expandedService === "x-cookies") {
      credentialsCards +=
        '<div class="service-expand-panel">' +
        '<div class="x-cookies-guide">' +
        "<p><strong>如何获取 Cookie：</strong></p>" +
        '<ol class="x-cookies-steps">' +
        '<li>在 Chrome 浏览器中打开 <a href="https://x.com" target="_blank" rel="noopener">x.com</a> 并登录你的账号</li>' +
        "<li>按 <kbd>F12</kbd> 打开开发者工具（或右键 → 检查）</li>" +
        "<li>切换到顶部的 <strong>Application</strong>（应用）标签页</li>" +
        "<li>在左侧栏找到 <strong>Cookies</strong> → <strong>https://x.com</strong></li>" +
        "<li>在 Cookie 列表中找到 <code>auth_token</code>，双击复制它的值</li>" +
        "<li>同样找到 <code>ct0</code>，双击复制它的值</li>" +
        "</ol>" +
        "</div>" +
        '<div class="x-cookies-form">' +
        '<label class="api-key-label">auth_token</label>' +
        '<input type="text" class="x-cookies-input" data-field="auth_token" placeholder="粘贴 auth_token 的值">' +
        '<label class="api-key-label" style="margin-top:10px">ct0</label>' +
        '<input type="text" class="x-cookies-input" data-field="ct0" placeholder="粘贴 ct0 的值">' +
        '<p class="api-key-hint">Cookie 会过期，届时需要重新获取并填入</p>' +
        '<button class="x-cookies-save-btn">保存 Cookie</button>' +
        "</div>" +
        "</div>";
    }

    var adminCards = SERVICES_META.filter(function (s) {
      return s.type === "admin";
    })
      .map(function (service) {
        var adminInfo = state.adminServicesStatus[service.id] || {};
        var adminConfigured = adminInfo.configured || false;
        var adminStatusClass = adminConfigured ? "enabled" : "disabled";
        var adminStatusText = adminConfigured ? "已配置" : "未配置";
        return (
          '<div class="service-card">' +
          '<div class="service-card-icon ' +
          ("icon-" + service.icon) +
          '">' +
          (ICONS[service.icon] || ICONS.wrench || "") +
          "</div>" +
          '<div class="service-card-info">' +
          '<div class="service-card-name">' +
          service.name +
          "</div>" +
          '<div class="service-card-desc">' +
          service.desc +
          "</div>" +
          "</div>" +
          '<div class="service-card-right">' +
          '<span class="status-badge ' +
          adminStatusClass +
          '"><span class="status-badge-dot"></span>' +
          adminStatusText +
          "</span>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    return (
      '<main class="main">' +
      '<div class="page-header">' +
      "<h1>服务连接</h1>" +
      "<p>连接第三方服务，为你的 AI 助手解锁更多能力</p>" +
      "</div>" +
      '<div class="services-section">' +
      '<h3 class="services-section-title">账号授权</h3>' +
      '<div class="services-list">' +
      oauthCards +
      "</div>" +
      "</div>" +
      '<div class="services-section">' +
      '<h3 class="services-section-title">凭证配置</h3>' +
      '<div class="services-list">' +
      credentialsCards +
      "</div>" +
      "</div>" +
      '<div class="services-section">' +
      '<h3 class="services-section-title">系统服务</h3>' +
      '<p class="services-section-hint">以下服务由管理员通过环境变量配置</p>' +
      '<div class="services-list">' +
      adminCards +
      "</div>" +
      "</div>" +
      "</main>"
    );
  }

  // ===== 10. RENDER IM PAGE =====
  function renderChannelCard(type) {
    var channel = state.channels[type];
    var icon = ICONS[type];
    var title = type === "telegram" ? "Telegram" : "WhatsApp";
    var configured = channel.configured;

    var statusHtml = configured
      ? '<div class="channel-status channel-status-connected">' +
        '<span class="status-dot"></span>已连接' +
        (type === "telegram" && channel.userId
          ? '<span class="channel-user-id">@' + escapeHtml(channel.userId) + "</span>"
          : "") +
        "</div>"
      : '<div class="channel-status channel-status-disconnected">' +
        '<span class="status-dot"></span>未连接' +
        "</div>";

    var formHtml = "";
    if (!configured) {
      if (type === "telegram") {
        formHtml = renderTelegramForm();
      } else {
        formHtml = renderWhatsAppForm();
      }
    }

    var actionHtml = configured
      ? '<button class="channel-disconnect-btn" data-channel="' + type + '">断开连接</button>'
      : '<button class="channel-connect-btn" data-channel="' + type + '">连接</button>';

    return (
      '<div class="channel-card ' +
      (state.onboardingChannel === type ? "expanded" : "") +
      '" data-channel="' +
      type +
      '">' +
      '<div class="channel-card-header">' +
      '<div class="channel-icon">' +
      icon +
      "</div>" +
      '<div class="channel-info">' +
      '<div class="channel-title">' +
      title +
      "</div>" +
      statusHtml +
      "</div>" +
      actionHtml +
      "</div>" +
      formHtml +
      "</div>"
    );
  }

  function renderTelegramForm() {
    return (
      '<div class="channel-form telegram-form">' +
      '<div class="form-group">' +
      "<label>Bot Token</label>" +
      '<input type="text" class="telegram-token-input" placeholder="110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw">' +
      "</div>" +
      '<div class="form-group">' +
      "<label>User ID</label>" +
      '<input type="text" class="telegram-userid-input" placeholder="123456789">' +
      "</div>" +
      '<button class="telegram-verify-btn">验证并连接</button>' +
      "</div>"
    );
  }

  function renderWhatsAppForm() {
    var qrHtml = state.whatsappQR
      ? '<img src="' +
        escapeHtml(state.whatsappQR) +
        '" class="whatsapp-qr" alt="WhatsApp QR Code">'
      : '<button class="whatsapp-generate-qr-btn">生成二维码</button>';

    return (
      '<div class="channel-form whatsapp-form">' +
      '<p class="whatsapp-hint">用手机 WhatsApp 扫描下方二维码连接</p>' +
      '<div class="whatsapp-qr-container">' +
      qrHtml +
      "</div>" +
      "</div>"
    );
  }

  function renderIMPage() {
    return (
      '<main class="main">' +
      '<div class="page-header">' +
      "<h1>接入IM</h1>" +
      "<p>连接你的 Telegram 或 WhatsApp 账号，开始与 AI 助手对话</p>" +
      "</div>" +
      '<div class="channels-grid">' +
      renderChannelCard("telegram") +
      renderChannelCard("whatsapp") +
      "</div>" +
      "</main>"
    );
  }

  // ===== 11. RENDER KNOWLEDGE PAGE =====
  var KNOWLEDGE_SOURCES = [
    {
      id: "googleDrive",
      name: "Google Drive",
      icon: "gdrive",
      desc: "同步 Google Docs、Sheets 等云端文件",
      itemLabel: "文件夹",
    },
    {
      id: "notion",
      name: "Notion",
      icon: "notion",
      desc: "同步 Notion 页面和数据库内容",
      itemLabel: "数据库",
    },
    {
      id: "dropbox",
      name: "Dropbox",
      icon: "dropbox",
      desc: "同步 Dropbox 云存储中的文件",
      itemLabel: "文件夹",
    },
  ];

  var BEST_PRACTICES = [
    {
      id: "personal",
      name: "个人文档目录",
      desc: "推荐的个人知识库结构，让 AI 帮你系统化管理知识",
      icon: "folder",
      defaultRoot: "PersonalBrain",
      tree: [
        { path: "00_收件箱", desc: "快速捕获，AI 自动归类" },
        { path: "10_日记", desc: "每日日志 (YYYY-MM-DD.md)" },
        { path: "20_项目", desc: "活跃项目跟踪" },
        { path: "30_研究", desc: "深度研究笔记" },
        { path: "40_知识库", desc: "原子概念提取" },
        { path: "50_资源", desc: "精选内容与参考" },
        { path: "90_计划", desc: "执行方案" },
        { path: "99_系统/归档", desc: "历史记录" },
        { path: "99_系统/提示词", desc: "AI 人设" },
        { path: "99_系统/模板", desc: "Markdown 模板" },
      ],
    },
    {
      id: "company",
      name: "公司文档目录",
      desc: "推荐的企业知识库结构，让 AI 成为你的全能商业助手",
      icon: "building",
      defaultRoot: "CompanyBrain",
      tree: [
        { path: "00-Index/Home.md", desc: "知识库首页" },
        { path: "01-Company/公司简介.md", desc: "" },
        { path: "01-Company/品牌规范.md", desc: "" },
        { path: "01-Company/组织架构.md", desc: "" },
        { path: "01-Company/人事/假期政策.md", desc: "" },
        { path: "01-Company/人事/入职流程.md", desc: "" },
        { path: "01-Company/人事/考勤制度.md", desc: "" },
        { path: "01-Company/法务/合同审批流程.md", desc: "" },
        { path: "01-Company/法务/用户协议模板.md", desc: "" },
        { path: "01-Company/法务/隐私政策模板.md", desc: "" },
        { path: "01-Company/财务/付款流程.md", desc: "" },
        { path: "01-Company/财务/发票管理.md", desc: "" },
        { path: "01-Company/财务/报销制度.md", desc: "" },
        { path: "02-Products/MyProduct/_概览.md", desc: "" },
        { path: "02-Products/MyProduct/01-核心定义/产品定位与推广策略.md", desc: "" },
        { path: "02-Products/MyProduct/01-核心定义/功能清单.md", desc: "" },
        { path: "02-Products/MyProduct/01-核心定义/定价策略.md", desc: "" },
        { path: "02-Products/MyProduct/01-核心定义/目标市场.md", desc: "" },
        { path: "02-Products/MyProduct/01-核心定义/竞品对比.md", desc: "" },
        { path: "02-Products/MyProduct/02-客户/客户画像-学生.md", desc: "" },
        { path: "02-Products/MyProduct/02-客户/客户画像-家长.md", desc: "" },
        { path: "02-Products/MyProduct/02-客户/用户痛点.md", desc: "" },
        { path: "02-Products/MyProduct/02-客户/用户需求分析报告.md", desc: "" },
        { path: "02-Products/MyProduct/03-销售/成功案例.md", desc: "" },
        { path: "02-Products/MyProduct/03-销售/渠道策略.md", desc: "" },
        { path: "02-Products/MyProduct/03-销售/销售话术.md", desc: "" },
        { path: "02-Products/MyProduct/04-市场/SEO策略.md", desc: "" },
        { path: "02-Products/MyProduct/04-市场/主页文案.md", desc: "" },
        { path: "02-Products/MyProduct/04-市场/品牌故事.md", desc: "" },
        { path: "02-Products/MyProduct/04-市场/定价页文案.md", desc: "" },
        { path: "02-Products/MyProduct/04-市场/宣传文案.md", desc: "" },
        { path: "02-Products/MyProduct/04-市场/市场研究分析报告.md", desc: "" },
        { path: "02-Products/MyProduct/04-市场/社交媒体.md", desc: "" },
        { path: "02-Products/MyProduct/04-市场/社交媒体战略.md", desc: "" },
        { path: "02-Products/MyProduct/04-市场/综合市场分析报告.md", desc: "" },
        { path: "02-Products/MyProduct/05-技术/API文档.md", desc: "" },
        { path: "02-Products/MyProduct/05-技术/技术架构.md", desc: "" },
        { path: "02-Products/MyProduct/05-技术/技术说明.md", desc: "" },
        { path: "02-Products/MyProduct/05-技术/版本记录.md", desc: "" },
        { path: "02-Products/MyProduct/06-支持/FAQ.md", desc: "" },
        { path: "02-Products/MyProduct/06-支持/使用教程.md", desc: "" },
        { path: "02-Products/MyProduct/06-支持/故障排查.md", desc: "" },
        { path: "Templates/Agent定义模板.md", desc: "" },
        { path: "Templates/FAQ模板.md", desc: "" },
        { path: "Templates/产品概览模板.md", desc: "" },
        { path: "Templates/会议纪要模板.md", desc: "" },
        { path: "Templates/客户画像模板.md", desc: "" },
      ],
    },
  ];

  function renderKnowledgeCard(sourceMeta) {
    var sourceData = state.knowledge[sourceMeta.id];
    var connected = sourceData.connected;
    var statusClass = connected ? "enabled" : "needs-config";
    var statusText = connected ? "已连接" : "未连接";

    var buttonHtml = "";
    if (connected) {
      buttonHtml =
        '<button class="knowledge-sync-btn" data-source="' +
        sourceMeta.id +
        '">同步</button>' +
        '<button class="knowledge-disconnect-btn" data-source="' +
        sourceMeta.id +
        '">断开</button>';
    } else {
      buttonHtml =
        '<button class="knowledge-connect-btn" data-source="' + sourceMeta.id + '">连接</button>';
    }

    var syncInfo = "";
    if (connected && sourceData.lastSynced) {
      syncInfo =
        '<div class="knowledge-sync-info">最后同步: ' +
        new Date(sourceData.lastSynced).toLocaleString() +
        "</div>";
    }

    var selectionHtml = "";
    if (connected) {
      var items = sourceMeta.id === "notion" ? sourceData.databases : sourceData.folders;
      var selectedItems =
        sourceMeta.id === "notion" ? sourceData.selectedDatabases : sourceData.selectedFolders;
      if (items && items.length > 0) {
        var checkboxesHtml = items
          .map(function (item) {
            var checked = selectedItems.indexOf(item.id) !== -1 ? "checked" : "";
            return (
              '<label class="knowledge-folder-item">' +
              '<input type="checkbox" value="' +
              escapeHtml(item.id) +
              '" ' +
              checked +
              ">" +
              '<span class="knowledge-folder-icon">' +
              ICONS.folder +
              "</span>" +
              '<span class="knowledge-folder-name">' +
              escapeHtml(item.name) +
              "</span>" +
              "</label>"
            );
          })
          .join("");
        selectionHtml =
          '<div class="knowledge-body">' +
          '<div class="knowledge-body-header">' +
          '<span class="knowledge-body-icon">' +
          ICONS.database +
          "</span>" +
          "<span>选择要同步的" +
          sourceMeta.itemLabel +
          "</span>" +
          "</div>" +
          '<div class="knowledge-folder-list">' +
          checkboxesHtml +
          "</div>" +
          "</div>";
      }
    }

    return (
      '<div class="knowledge-card' +
      (connected ? " knowledge-card-connected" : "") +
      '">' +
      '<div class="knowledge-card-header">' +
      '<div class="knowledge-card-icon icon-' +
      sourceMeta.icon +
      '">' +
      (ICONS[sourceMeta.icon] || "") +
      "</div>" +
      '<div class="knowledge-card-info">' +
      '<div class="knowledge-card-name">' +
      sourceMeta.name +
      "</div>" +
      '<div class="knowledge-card-desc">' +
      sourceMeta.desc +
      "</div>" +
      "</div>" +
      '<div class="knowledge-card-right">' +
      '<span class="status-badge ' +
      statusClass +
      '"><span class="status-badge-dot"></span>' +
      statusText +
      "</span>" +
      buttonHtml +
      "</div>" +
      "</div>" +
      syncInfo +
      selectionHtml +
      "</div>"
    );
  }

  function renderBestPracticeCard(bp) {
    return (
      '<div class="knowledge-card bp-card" data-bp="' +
      bp.id +
      '">' +
      '<div class="knowledge-card-header">' +
      '<div class="knowledge-card-icon icon-bp-' +
      bp.id +
      '">' +
      (ICONS[bp.icon] || "") +
      "</div>" +
      '<div class="knowledge-card-info">' +
      '<div class="knowledge-card-name">' +
      escapeHtml(bp.name) +
      "</div>" +
      '<div class="knowledge-card-desc">' +
      escapeHtml(bp.desc) +
      "</div>" +
      "</div>" +
      '<div class="knowledge-card-right">' +
      '<span class="bp-badge">推荐</span>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderKnowledgePage() {
    var cards = KNOWLEDGE_SOURCES.map(function (source) {
      return renderKnowledgeCard(source);
    }).join("");

    var bpCards = BEST_PRACTICES.map(function (bp) {
      return renderBestPracticeCard(bp);
    }).join("");

    var anyConnected = state.knowledge.googleDrive.connected || state.knowledge.dropbox.connected;
    var syncBtnDisabled = !anyConnected ? " disabled" : "";
    var syncBtnTitle = !anyConnected ? "请先连接云服务" : "同步个人档案";

    var profileSyncCard =
      '<div class="knowledge-card bp-profile-card">' +
      '<div class="knowledge-card-header">' +
      '<div class="knowledge-card-icon icon-bp-profile">' +
      ICONS.user +
      "</div>" +
      '<div class="knowledge-card-info">' +
      '<div class="knowledge-card-name">同步个人档案到云端</div>' +
      '<div class="knowledge-card-desc">将 AI 学习到的你的个人画像同步到云端知识库根目录</div>' +
      "</div>" +
      '<div class="knowledge-card-right">' +
      '<button class="knowledge-sync-btn bp-sync-profile-btn"' +
      syncBtnDisabled +
      ' title="' +
      syncBtnTitle +
      '">同步</button>' +
      "</div>" +
      "</div>" +
      "</div>";

    return (
      '<main class="main">' +
      '<div class="page-header">' +
      "<h1>知识库</h1>" +
      "<p>连接你的云端文档，让 AI 助手学习你的知识</p>" +
      "</div>" +
      '<div class="knowledge-section">' +
      '<h3 class="knowledge-section-title">云端文档</h3>' +
      '<div class="knowledge-list">' +
      cards +
      "</div>" +
      "</div>" +
      '<div class="knowledge-section">' +
      '<h3 class="knowledge-section-title">最佳实践</h3>' +
      '<div class="knowledge-list">' +
      bpCards +
      "</div>" +
      profileSyncCard +
      "</div>" +
      "</main>"
    );
  }

  function renderBestPracticeModal(bp) {
    var treeHtml = bp.tree
      .map(function (item) {
        var isFile = item.path.indexOf(".md") !== -1;
        var icon = isFile ? ICONS.database : ICONS.folder;
        var parts = item.path.split("/");
        var indent = (parts.length - 1) * 20;
        var name = parts[parts.length - 1];
        var desc = item.desc
          ? '<span class="bp-tree-desc">' + escapeHtml(item.desc) + "</span>"
          : "";
        return (
          '<div class="bp-tree-item" style="padding-left:' +
          indent +
          'px">' +
          '<span class="bp-tree-icon">' +
          icon +
          "</span>" +
          '<span class="bp-tree-name">' +
          escapeHtml(name) +
          "</span>" +
          desc +
          "</div>"
        );
      })
      .join("");

    var targetOptions = "";
    if (state.knowledge.googleDrive.connected) {
      targetOptions += '<option value="google-drive">Google Drive</option>';
    }
    if (state.knowledge.dropbox.connected) {
      targetOptions += '<option value="dropbox">Dropbox</option>';
    }
    var noTarget = !targetOptions;
    if (noTarget) {
      targetOptions = '<option value="">请先连接云服务</option>';
    }

    var descText =
      bp.id === "personal"
        ? "推荐的个人知识库目录结构，帮助你系统化地管理个人知识。AI 助手会自动将内容归类到对应目录中。"
        : "推荐的企业知识库目录结构，覆盖公司信息、产品、销售、市场、技术、支持等完整维度。所有文件包含结构化模板。";

    return (
      '<div class="bp-modal-overlay" id="bpModal">' +
      '<div class="bp-modal">' +
      '<div class="bp-modal-header">' +
      "<h2>" +
      escapeHtml(bp.name) +
      "</h2>" +
      '<button class="bp-modal-close" id="bpModalClose">&times;</button>' +
      "</div>" +
      '<div class="bp-modal-body">' +
      '<p class="bp-modal-desc">' +
      descText +
      "</p>" +
      '<div class="bp-tree-container">' +
      treeHtml +
      "</div>" +
      '<div class="bp-modal-form">' +
      '<label class="bp-form-label">根文件夹名称</label>' +
      '<input type="text" class="bp-form-input" id="bpRootName" value="' +
      escapeHtml(bp.defaultRoot) +
      '">' +
      '<label class="bp-form-label">创建到</label>' +
      '<select class="bp-form-select" id="bpTarget"' +
      (noTarget ? " disabled" : "") +
      ">" +
      targetOptions +
      "</select>" +
      (noTarget
        ? '<p class="bp-form-hint">请先在上方「云端文档」区域连接 Google Drive 或 Dropbox</p>'
        : "") +
      "</div>" +
      "</div>" +
      '<div class="bp-modal-footer">' +
      '<button class="bp-modal-cancel" id="bpModalCancel">取消</button>' +
      '<button class="bp-modal-confirm" id="bpModalConfirm" data-bp="' +
      bp.id +
      '"' +
      (noTarget ? " disabled" : "") +
      ">创建目录结构</button>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function showBestPracticeModal(bpId) {
    var bp = null;
    for (var i = 0; i < BEST_PRACTICES.length; i++) {
      if (BEST_PRACTICES[i].id === bpId) {
        bp = BEST_PRACTICES[i];
        break;
      }
    }
    if (!bp) return;

    var existing = document.getElementById("bpModal");
    if (existing) existing.remove();

    var div = document.createElement("div");
    div.innerHTML = renderBestPracticeModal(bp);
    document.body.appendChild(div.firstElementChild);

    document.getElementById("bpModalClose").addEventListener("click", closeBestPracticeModal);
    document.getElementById("bpModalCancel").addEventListener("click", closeBestPracticeModal);
    document.getElementById("bpModal").addEventListener("click", function (e) {
      if (e.target === this) closeBestPracticeModal();
    });
    document.getElementById("bpModalConfirm").addEventListener("click", function () {
      var rootName = document.getElementById("bpRootName").value.trim();
      var target = document.getElementById("bpTarget").value;
      if (!rootName || !target) return;
      createBestPracticeStructure(bpId, rootName, target);
    });
  }

  function closeBestPracticeModal() {
    var modal = document.getElementById("bpModal");
    if (modal) modal.remove();
  }

  function createBestPracticeStructure(template, rootName, target) {
    var btn = document.getElementById("bpModalConfirm");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "创建中...";
    }

    postJson("/api/knowledge/create-structure", {
      template: template,
      rootName: rootName,
      target: target,
    })
      .then(function (res) {
        closeBestPracticeModal();
        if (res.ok) {
          var msg =
            "创建成功！文件夹: " + res.created.folders + " 个，文件: " + res.created.files + " 个";
          if (res.errors && res.errors.length > 0) {
            msg += "（" + res.errors.length + " 个错误）";
          }
          showToast(msg, "success");
          loadKnowledgeStatus().then(function () {
            render();
          });
        } else {
          showToast("创建失败: " + (res.error || "未知错误"), "error");
        }
      })
      .catch(function (err) {
        closeBestPracticeModal();
        showToast("创建失败: " + err.message, "error");
      });
  }

  function syncProfile() {
    var target = state.knowledge.googleDrive.connected ? "google-drive" : "dropbox";
    var rootName = "PersonalBrain";

    var btn = document.querySelector(".bp-sync-profile-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "同步中...";
    }

    postJson("/api/knowledge/sync-profile", {
      target: target,
      rootName: rootName,
    })
      .then(function (res) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "同步";
        }
        if (res.ok) {
          showToast("个人档案已同步到 " + res.path, "success");
        } else {
          showToast("同步失败: " + (res.error || "未知错误"), "error");
        }
      })
      .catch(function (err) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "同步";
        }
        showToast("同步失败: " + err.message, "error");
      });
  }

  // ===== 12. RENDER ONBOARDING =====
  function renderOnboarding() {
    if (!state.showOnboarding) return "";

    return (
      '<div class="onboarding-overlay">' +
      '<div class="onboarding-content">' +
      '<div class="onboarding-header">' +
      "<h1>欢迎使用 Nanobots</h1>" +
      "<p>选择一个 IM 平台开始使用你的 AI 助手</p>" +
      "</div>" +
      '<div class="onboarding-channels">' +
      '<div class="onboarding-channel-card" data-channel="telegram">' +
      '<div class="onboarding-channel-icon">' +
      ICONS.telegram +
      "</div>" +
      '<div class="onboarding-channel-title">Telegram</div>' +
      '<p class="onboarding-channel-desc">通过 Telegram 机器人与 AI 助手对话</p>' +
      "</div>" +
      '<div class="onboarding-channel-card" data-channel="whatsapp">' +
      '<div class="onboarding-channel-icon">' +
      ICONS.whatsapp +
      "</div>" +
      '<div class="onboarding-channel-title">WhatsApp</div>' +
      '<p class="onboarding-channel-desc">通过 WhatsApp 与 AI 助手对话</p>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  // ===== 13. MAIN RENDER =====
  function render() {
    var appContainer = document.getElementById("app");
    if (!appContainer) return;

    // Clear WhatsApp polling if navigating away from IM
    if (state.currentTab !== "im" && state.whatsappPollInterval) {
      clearInterval(state.whatsappPollInterval);
      state.whatsappPollInterval = null;
    }

    var html = renderNav();
    if (state.currentTab === "skills") {
      html += renderSkillsPage();
    } else if (state.currentTab === "services") {
      html += renderServicesPage();
    } else if (state.currentTab === "im") {
      html += renderIMPage();
    } else if (state.currentTab === "knowledge") {
      html += renderKnowledgePage();
    }
    html += renderOnboarding();

    appContainer.innerHTML = html;
    bindEvents();
  }

  // ===== 14. BIND EVENTS =====
  function bindEvents() {
    bindNavEvents();
    if (state.currentTab === "skills") {
      bindSkillsEvents();
    } else if (state.currentTab === "services") {
      bindServicesEvents();
    } else if (state.currentTab === "im") {
      bindIMEvents();
    } else if (state.currentTab === "knowledge") {
      bindKnowledgeEvents();
    }
    if (state.showOnboarding) {
      bindOnboardingEvents();
    }
  }

  function bindNavEvents() {
    var tabs = document.querySelectorAll(".nav-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var targetTab = this.getAttribute("data-tab");
        window.location.hash = targetTab;
      });
    });
  }

  function bindSkillsEvents() {
    var categoryPills = document.querySelectorAll(".category-pill");
    categoryPills.forEach(function (pill) {
      pill.addEventListener("click", function () {
        state.activeCategory = this.getAttribute("data-category");
        state.expandedSkill = null;
        render();
      });
    });

    var skillCards = document.querySelectorAll(".skill-card:not(.expanded)");
    skillCards.forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest(".toggle")) return;
        var skillId = this.getAttribute("data-skill-id");
        state.expandedSkill = skillId;
        render();
      });
    });

    var closeBtn = document.querySelector(".close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        state.expandedSkill = null;
        render();
      });
    }

    var toggles = document.querySelectorAll(
      ".skill-card .toggle input, .expanded-toggle-area .toggle-large input",
    );
    toggles.forEach(function (toggle) {
      toggle.addEventListener("change", function (e) {
        e.stopPropagation();
        var card = this.closest(".skill-card");
        var skillId = card.getAttribute("data-skill-id");
        var skill = SKILLS_META.find(function (s) {
          return s.id === skillId;
        });
        if (!skill) return;

        if (this.checked) {
          handleSkillEnable(skill);
        } else {
          handleSkillDisable(skill);
        }
      });
    });

    var apiKeySaveBtn = document.querySelector(".api-key-save-btn");
    if (apiKeySaveBtn) {
      apiKeySaveBtn.addEventListener("click", function () {
        var card = this.closest(".skill-card");
        var skillId = card.getAttribute("data-skill-id");
        var input = card.querySelector(".api-key-input");
        var apiKey = input.value.trim();
        if (!apiKey) {
          showToast("请输入有效的配置信息", "error");
          return;
        }
        saveSkillApiKey(skillId, apiKey);
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.expandedSkill) {
        state.expandedSkill = null;
        render();
      }
    });
  }

  function bindServicesEvents() {
    // OAuth connect buttons
    var connectBtns = document.querySelectorAll(".service-connect-btn");
    connectBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var provider = this.getAttribute("data-provider");
        var popup = window.open("about:blank", "oauth", "width=600,height=700");
        postJson("/api/oauth/start", { provider: provider })
          .then(function (res) {
            if (res.error) {
              if (popup) popup.close();
              showToast("连接失败: " + res.error, "error");
              return;
            }
            if (popup) popup.location.href = res.url;
            window.onOAuthDone = function () {
              window.onOAuthDone = null;
              loadOAuthStatus().then(function () {
                render();
              });
            };
          })
          .catch(function (err) {
            if (popup) popup.close();
            showToast("连接失败: " + err.message, "error");
          });
      });
    });

    // OAuth disconnect buttons
    var disconnectBtns = document.querySelectorAll(".service-disconnect-btn");
    disconnectBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var provider = this.getAttribute("data-provider");
        if (!confirm("确定要断开 " + provider + " 服务？")) return;
        postJson("/api/oauth/disconnect", { provider: provider })
          .then(function () {
            if (state.oauthStatus[provider]) {
              state.oauthStatus[provider].connected = false;
            }
            showToast("已断开", "success");
            render();
          })
          .catch(function (err) {
            showToast("断开失败: " + err.message, "error");
          });
      });
    });

    // X Cookie expand button
    var expandBtn = document.querySelector(".service-expand-btn");
    if (expandBtn) {
      expandBtn.addEventListener("click", function () {
        state.expandedService = state.expandedService === "x-cookies" ? null : "x-cookies";
        render();
      });
    }

    // X Cookie save button
    var xCookiesSaveBtn = document.querySelector(".x-cookies-save-btn");
    if (xCookiesSaveBtn) {
      xCookiesSaveBtn.addEventListener("click", function () {
        var inputs = document.querySelectorAll(".x-cookies-input");
        var authToken = "";
        var ct0 = "";
        inputs.forEach(function (input) {
          if (input.getAttribute("data-field") === "auth_token") authToken = input.value.trim();
          if (input.getAttribute("data-field") === "ct0") ct0 = input.value.trim();
        });
        if (!authToken || !ct0) {
          showToast("请填写 auth_token 和 ct0 两个值", "error");
          return;
        }
        saveXCookies(authToken, ct0);
      });
    }
  }

  function bindIMEvents() {
    var connectBtns = document.querySelectorAll(".channel-connect-btn");
    connectBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var channel = this.getAttribute("data-channel");
        state.onboardingChannel = channel;
        render();
      });
    });

    var telegramVerifyBtn = document.querySelector(".telegram-verify-btn");
    if (telegramVerifyBtn) {
      telegramVerifyBtn.addEventListener("click", function () {
        var tokenInput = document.querySelector(".telegram-token-input");
        var userIdInput = document.querySelector(".telegram-userid-input");
        var botToken = tokenInput.value.trim();
        var userId = userIdInput.value.trim();

        if (!botToken || !userId) {
          showToast("请填写完整的 Telegram 配置信息", "error");
          return;
        }

        verifyTelegram(botToken, userId);
      });
    }

    var whatsappGenerateQrBtn = document.querySelector(".whatsapp-generate-qr-btn");
    if (whatsappGenerateQrBtn) {
      whatsappGenerateQrBtn.addEventListener("click", function () {
        generateWhatsAppQR();
      });
    }

    var disconnectBtns = document.querySelectorAll(".channel-disconnect-btn");
    disconnectBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var channel = this.getAttribute("data-channel");
        disconnectChannel(channel);
      });
    });
  }

  function bindKnowledgeEvents() {
    var connectBtns = document.querySelectorAll(".knowledge-connect-btn");
    connectBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var source = this.getAttribute("data-source");
        connectKnowledge(source);
      });
    });

    var syncBtns = document.querySelectorAll(".knowledge-sync-btn");
    syncBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var source = this.getAttribute("data-source");
        syncKnowledge(source);
      });
    });

    var disconnectBtns = document.querySelectorAll(".knowledge-disconnect-btn");
    disconnectBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var source = this.getAttribute("data-source");
        disconnectKnowledge(source);
      });
    });

    var checkboxes = document.querySelectorAll(".knowledge-folder-item input");
    checkboxes.forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        var card = this.closest(".knowledge-card");
        var source = card
          .querySelector(".knowledge-connect-btn, .knowledge-sync-btn, .knowledge-disconnect-btn")
          .getAttribute("data-source");
        var checkedBoxes = card.querySelectorAll(".knowledge-folder-item input:checked");
        var selectedIds = Array.from(checkedBoxes).map(function (cb) {
          return cb.value;
        });
        updateKnowledgeSelection(source, selectedIds);
      });
    });

    // Best practice card click → open modal
    var bpCards = document.querySelectorAll(".bp-card");
    bpCards.forEach(function (card) {
      card.addEventListener("click", function () {
        var bpId = this.getAttribute("data-bp");
        showBestPracticeModal(bpId);
      });
    });

    // Sync profile button
    var syncProfileBtn = document.querySelector(".bp-sync-profile-btn");
    if (syncProfileBtn) {
      syncProfileBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        syncProfile();
      });
    }
  }

  function bindOnboardingEvents() {
    var channelCards = document.querySelectorAll(".onboarding-channel-card");
    channelCards.forEach(function (card) {
      card.addEventListener("click", function () {
        var channel = this.getAttribute("data-channel");
        state.showOnboarding = false;
        state.currentTab = "im";
        state.onboardingChannel = channel;
        window.location.hash = "im";
        render();
      });
    });
  }

  // ===== 15. SKILL HANDLERS =====
  function handleSkillEnable(skill) {
    if (skill.type === "oauth") {
      var provider = skill.oauthProvider;
      var isConnected = state.oauthStatus[provider] && state.oauthStatus[provider].connected;
      if (isConnected) {
        toggleSkill(skill.id, true);
      } else {
        handleOAuthEnable(skill);
      }
    } else if (skill.type === "api-key") {
      var skillState = state.skills[skill.id] || {};
      if (!skillState.configured) {
        showToast("请先配置 API Key", "error");
        render();
        return;
      }
      toggleSkill(skill.id, true);
    } else if (skill.type === "service-dep") {
      var allConnected = (skill.requiredServices || []).every(function (svc) {
        if (svc === "x-cookies") return state.xCookiesStatus && state.xCookiesStatus.configured;
        return state.oauthStatus[svc] && state.oauthStatus[svc].connected;
      });
      if (!allConnected) {
        showToast("请先在「服务」页面连接所需服务", "info");
        state.currentTab = "services";
        window.location.hash = "services";
        render();
        return;
      }
      toggleSkill(skill.id, true);
    } else {
      toggleSkill(skill.id, true);
    }
  }

  function handleSkillDisable(skill) {
    if (skill.type === "oauth" && skill.oauthProvider) {
      var provider = skill.oauthProvider;
      // Check if any OTHER enabled skill shares the same OAuth provider
      var otherUsingProvider = SKILLS_META.some(function (s) {
        return (
          s.id !== skill.id &&
          s.type === "oauth" &&
          s.oauthProvider === provider &&
          (state.skills[s.id] || {}).enabled !== false &&
          (state.oauthStatus[provider] || {}).connected
        );
      });

      // Disconnect OAuth FIRST (no gateway restart), then toggle off (triggers restart last)
      var disconnectStep = otherUsingProvider
        ? Promise.resolve()
        : postJson("/api/oauth/disconnect", { provider: provider }).then(function () {
            if (state.oauthStatus[provider]) {
              state.oauthStatus[provider].connected = false;
            }
            if (provider === "google") {
              state.knowledge.googleDrive.connected = false;
            } else if (provider === "notion") {
              state.knowledge.notion.connected = false;
            }
          });

      disconnectStep
        .then(function () {
          return postJson("/api/setup/skills/toggle", {
            skillId: skill.id,
            enabled: false,
          });
        })
        .then(function (res) {
          if (!res.ok) throw new Error("toggle failed");
          if (!state.skills[skill.id]) state.skills[skill.id] = {};
          state.skills[skill.id].enabled = false;
          showToast("技能已停用", "success");
          render();
        })
        .catch(function (err) {
          showToast("操作失败: " + err.message, "error");
          render();
        });
    } else {
      toggleSkill(skill.id, false);
    }
  }

  function toggleSkill(skillId, enabled) {
    postJson("/api/setup/skills/toggle", { skillId: skillId, enabled: enabled })
      .then(function (res) {
        if (res.ok) {
          if (!state.skills[skillId]) state.skills[skillId] = {};
          state.skills[skillId].enabled = enabled;
          showToast(enabled ? "技能已启用" : "技能已停用", "success");
          render();
        } else {
          showToast("操作失败", "error");
          render();
        }
      })
      .catch(function (err) {
        showToast("操作失败: " + err.message, "error");
        render();
      });
  }

  function saveSkillApiKey(skillId, apiKey) {
    var payload = {};
    payload[skillId] = { apiKey: apiKey };
    postJson("/api/setup/skills/save", payload)
      .then(function (res) {
        if (res.ok) {
          if (!state.skills[skillId]) state.skills[skillId] = {};
          state.skills[skillId].apiKey = apiKey;
          state.skills[skillId].configured = true;
          showToast("配置已保存", "success");
          render();
        } else {
          showToast("保存失败", "error");
        }
      })
      .catch(function (err) {
        showToast("保存失败: " + err.message, "error");
      });
  }

  function saveXCookies(authToken, ct0) {
    postJson("/api/setup/x-cookies/save", { auth_token: authToken, ct0: ct0 })
      .then(function (res) {
        if (res.ok) {
          state.xCookiesStatus = {
            configured: true,
            source: "file",
            hasMaskedAuthToken: authToken.slice(0, 6) + "...",
          };
          if (!state.skills["x-assistant"]) {
            state.skills["x-assistant"] = {};
          }
          state.skills["x-assistant"].configured = true;
          showToast("Cookie 已保存", "success");
          render();
        } else {
          showToast("保存失败: " + (res.error || "未知错误"), "error");
        }
      })
      .catch(function (err) {
        showToast("保存失败: " + err.message, "error");
      });
  }

  function handleOAuthEnable(skill) {
    var provider = skill.oauthProvider;
    // Open popup synchronously (in user gesture context) to avoid popup blocker
    var popup = window.open("about:blank", "oauth", "width=600,height=700");
    postJson("/api/oauth/start", { provider: provider })
      .then(function (res) {
        if (res.error) {
          if (popup) popup.close();
          showToast("OAuth 启动失败: " + res.error, "error");
          render();
          return;
        }
        if (res.url) {
          if (popup) {
            popup.location.href = res.url;
          } else {
            popup = window.open(res.url, "oauth", "width=600,height=700");
          }
          var checkClosed = setInterval(function () {
            if (popup && popup.closed) {
              clearInterval(checkClosed);
              render();
            }
          }, 500);
          window.onOAuthDone = function () {
            clearInterval(checkClosed);
            if (popup) popup.close();
            loadOAuthStatus().then(function () {
              toggleSkill(skill.id, true);
            });
          };
        }
      })
      .catch(function (err) {
        if (popup) popup.close();
        showToast("OAuth 启动失败: " + err.message, "error");
        render();
      });
  }

  // ===== 16. IM HANDLERS =====
  function verifyTelegram(botToken, userId) {
    postJson("/api/setup/telegram/verify", { botToken: botToken })
      .then(function (res) {
        if (res.ok) {
          return postJson("/api/setup/telegram/save", { botToken: botToken, userId: userId });
        } else {
          throw new Error(res.error || "验证失败");
        }
      })
      .then(function (res) {
        if (res.ok) {
          state.channels.telegram.configured = true;
          state.channels.telegram.userId = userId;
          state.onboardingChannel = null;
          showToast("Telegram 连接成功", "success");
          render();
        } else {
          throw new Error("保存失败");
        }
      })
      .catch(function (err) {
        showToast("Telegram 连接失败: " + err.message, "error");
      });
  }

  function generateWhatsAppQR() {
    postJson("/api/setup/whatsapp/qr", {})
      .then(function (res) {
        if (res.qr) {
          state.whatsappQR = res.qr;
          render();
          pollWhatsAppStatus();
        } else {
          showToast("生成二维码失败", "error");
        }
      })
      .catch(function (err) {
        showToast("生成二维码失败: " + err.message, "error");
      });
  }

  function pollWhatsAppStatus() {
    if (state.whatsappPollInterval) {
      clearInterval(state.whatsappPollInterval);
    }
    state.whatsappPollInterval = setInterval(function () {
      api("/api/setup/whatsapp/status")
        .then(function (res) {
          if (res.connected) {
            clearInterval(state.whatsappPollInterval);
            state.whatsappPollInterval = null;
            state.channels.whatsapp.configured = true;
            state.whatsappQR = null;
            state.onboardingChannel = null;
            showToast("WhatsApp 连接成功", "success");
            render();
          }
        })
        .catch(function () {});
    }, 3000);
  }

  function disconnectChannel(channel) {
    if (
      !confirm("确定要断开 " + (channel === "telegram" ? "Telegram" : "WhatsApp") + " 连接吗？")
    ) {
      return;
    }
    postJson("/api/setup/" + channel + "/disconnect", {})
      .then(function (res) {
        if (res.ok) {
          state.channels[channel].configured = false;
          state.channels[channel].userId = "";
          showToast("已断开连接", "success");
          render();
        } else {
          showToast("断开失败: " + (res.error || "未知错误"), "error");
        }
      })
      .catch(function (err) {
        showToast("断开失败: " + err.message, "error");
      });
  }

  // ===== 17. KNOWLEDGE HANDLERS =====
  function connectKnowledge(source) {
    var providerMap = { googleDrive: "google", notion: "notion", dropbox: "dropbox" };
    var provider = providerMap[source];
    if (!provider) return;

    var popup = window.open("about:blank", "oauth", "width=600,height=700");
    postJson("/api/oauth/start", { provider: provider })
      .then(function (res) {
        if (res.error) {
          if (popup) popup.close();
          showToast("OAuth 启动失败: " + res.error, "error");
          return;
        }
        if (res.url) {
          if (popup) {
            popup.location.href = res.url;
          } else {
            popup = window.open(res.url, "oauth", "width=600,height=700");
          }
          window.onOAuthDone = function () {
            if (popup) popup.close();
            loadKnowledgeStatus().then(function () {
              showToast("连接成功", "success");
              render();
            });
          };
        }
      })
      .catch(function (err) {
        if (popup) popup.close();
        showToast("连接失败: " + err.message, "error");
      });
  }

  function syncKnowledge(source) {
    var sourceMap = { googleDrive: "google-drive", notion: "notion", dropbox: "dropbox" };
    var apiSource = sourceMap[source];
    postJson("/api/knowledge/sync", { source: apiSource })
      .then(function (res) {
        if (res.ok) {
          showToast("同步已开始", "success");
          loadKnowledgeStatus().then(function () {
            render();
          });
        } else {
          showToast("同步失败", "error");
        }
      })
      .catch(function (err) {
        showToast("同步失败: " + err.message, "error");
      });
  }

  function disconnectKnowledge(source) {
    var providerMap = { googleDrive: "google", notion: "notion", dropbox: "dropbox" };
    var provider = providerMap[source];
    postJson("/api/oauth/disconnect", { provider: provider })
      .then(function (res) {
        if (res.ok) {
          state.knowledge[source].connected = false;
          showToast("已断开连接", "success");
          render();
        } else {
          showToast("断开失败", "error");
        }
      })
      .catch(function (err) {
        showToast("断开失败: " + err.message, "error");
      });
  }

  function updateKnowledgeSelection(source, selectedIds) {
    var field = source === "notion" ? "selectedDatabases" : "selectedFolders";
    state.knowledge[source][field] = selectedIds;
    saveKnowledgeConfig();
  }

  function saveKnowledgeConfig() {
    var config = {};
    Object.keys(state.knowledge).forEach(function (source) {
      config[source] = state.knowledge[source];
    });
    fetch("/api/knowledge/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (res.ok) {
          showToast("配置已保存", "success");
        }
      })
      .catch(function (err) {
        showToast("保存失败: " + err.message, "error");
      });
  }

  function loadKnowledgeStatus() {
    return api("/api/knowledge/status")
      .then(function (res) {
        Object.keys(res).forEach(function (sourceKey) {
          var source = sourceKey === "google-drive" ? "googleDrive" : sourceKey;
          if (state.knowledge[source]) {
            state.knowledge[source].lastSynced = res[sourceKey].lastSynced;
            state.knowledge[source].fileCount = res[sourceKey].fileCount;
          }
        });
      })
      .catch(function () {});
  }

  function parseOAuthStatus(res) {
    var map = {};
    var list = Array.isArray(res) ? res : res.status || res;
    if (Array.isArray(list)) {
      list.forEach(function (p) {
        map[p.id] = p;
      });
    } else {
      map = list;
    }
    return map;
  }

  function loadOAuthStatus() {
    return api("/api/oauth/status")
      .then(function (res) {
        state.oauthStatus = parseOAuthStatus(res);
        Object.keys(state.oauthStatus).forEach(function (provider) {
          var connected = state.oauthStatus[provider].connected;
          if (provider === "google") {
            state.knowledge.googleDrive.connected = connected;
          } else if (provider === "notion") {
            state.knowledge.notion.connected = connected;
          } else if (provider === "dropbox") {
            state.knowledge.dropbox.connected = connected;
          }
        });
      })
      .catch(function () {});
  }

  // ===== 18. ROUTER =====
  function route() {
    var hash = window.location.hash.replace("#", "") || "skills";
    if (["im", "skills", "services", "knowledge"].indexOf(hash) !== -1) {
      state.currentTab = hash;
    } else {
      state.currentTab = "skills";
    }
    render();
  }

  window.addEventListener("hashchange", route);

  // ===== 19. INIT =====
  function init() {
    Promise.all([
      api("/api/setup/status"),
      api("/api/setup/skills/status"),
      api("/api/oauth/status").catch(function () {
        return {};
      }),
      api("/api/knowledge/status").catch(function () {
        return {};
      }),
      api("/api/setup/x-cookies/status").catch(function () {
        return { configured: false, source: null, hasMaskedAuthToken: null };
      }),
      api("/api/setup/admin-services/status").catch(function () {
        return {};
      }),
    ])
      .then(function (results) {
        var setupStatus = results[0];
        var skillsStatus = results[1];
        var oauthStatus = results[2];
        var knowledgeStatus = results[3];
        var xCookiesStatus = results[4];
        var adminServicesStatus = results[5];

        state.xCookiesStatus = xCookiesStatus;
        state.adminServicesStatus = adminServicesStatus;

        var channels = setupStatus.channels || {};
        var tg = channels.telegram || {};
        var wa = channels.whatsapp || {};
        state.channels.telegram.configured = tg.configured || false;
        state.channels.telegram.userId = tg.userId || "";
        state.channels.whatsapp.configured = wa.configured || false;
        state.model.configured = (setupStatus.model || {}).configured || false;

        state.skills = skillsStatus;

        state.oauthStatus = parseOAuthStatus(oauthStatus);
        Object.keys(state.oauthStatus).forEach(function (provider) {
          var connected = state.oauthStatus[provider].connected;
          if (provider === "google") {
            state.knowledge.googleDrive.connected = connected;
          } else if (provider === "notion") {
            state.knowledge.notion.connected = connected;
          } else if (provider === "dropbox") {
            state.knowledge.dropbox.connected = connected;
          }
        });

        Object.keys(knowledgeStatus).forEach(function (sourceKey) {
          var source = sourceKey === "google-drive" ? "googleDrive" : sourceKey;
          if (state.knowledge[source]) {
            state.knowledge[source].lastSynced = knowledgeStatus[sourceKey].lastSynced;
            state.knowledge[source].fileCount = knowledgeStatus[sourceKey].fileCount;
          }
        });

        var hasChannel = state.channels.telegram.configured || state.channels.whatsapp.configured;
        state.showOnboarding = !hasChannel;

        state.loading = false;
        route();
      })
      .catch(function (err) {
        console.error("Init failed:", err);
        showToast("加载失败，请刷新页面重试", "error");
        state.loading = false;
        render();
      });
  }

  // ===== 20. START =====
  init();
})();
