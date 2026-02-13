# 知识库云端文档重设计 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 重新设计知识库页面的"云端文档"区域，从"多文件夹多选"改为"知识库根目录"概念，添加文件夹浏览器 Modal，移除连接/断开按钮（连接状态从 Services 页面管理）。

**Architecture:** 后端新增文件夹浏览 API（支持 parentId 参数），前端重写 `renderKnowledgeCard()` 为三种卡片状态（未连接/已连接未设置根目录/已连接已设置根目录），新增文件夹浏览器 Modal。Notion 保持现有行为不变。

**Tech Stack:** TypeScript (后端), ES5 vanilla JS (前端), Google Drive API v3

---

### Task 1: 后端 — 扩展 Google Drive folders API 支持 parentId

**Files:**

- Modify: `extensions/knowledge-base/src/web-routes.ts:113-145`

**Context:**
当前 `GET /api/knowledge/google-drive/folders` 只查询根目录下的文件夹。需要支持 `?parentId=xxx` 查询参数，以便前端能浏览子目录。同时新增 `?folderId=xxx` 端点获取单个文件夹信息（用于显示已选根目录的路径）。

**Step 1: 修改现有 folders 路由**

将 `web-routes.ts` 中的 `/api/knowledge/google-drive/folders` handler 修改为：

```typescript
api.registerHttpRoute({
  path: "/api/knowledge/google-drive/folders",
  handler: async (req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }

    try {
      const token = await loadToken("google");
      if (!token) {
        sendJson(res, 200, { connected: false, folders: [] });
        return;
      }

      const url = new URL(req.url!, "http://localhost");
      const parentId = url.searchParams.get("parentId");
      const parent = parentId || "root";

      const query = `mimeType='application/vnd.google-apps.folder' and trashed=false and '${parent}' in parents`;
      const gRes = await googleFetch(
        `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=100&orderBy=name`,
      );
      const data = (await gRes.json()) as { files?: Array<{ id: string; name: string }> };
      const folders = (data.files ?? []).map((f) => ({ id: f.id, name: f.name }));
      sendJson(res, 200, { connected: true, folders, parentId: parentId || null });
    } catch (err) {
      sendJson(res, 500, {
        connected: true,
        folders: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});
```

**Step 2: 新增 folder-info 路由**

在 folders 路由之后新增：

```typescript
// GET /api/knowledge/google-drive/folder-info?folderId=xxx — get folder name by ID
api.registerHttpRoute({
  path: "/api/knowledge/google-drive/folder-info",
  handler: async (req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }

    try {
      const token = await loadToken("google");
      if (!token) {
        sendJson(res, 404, { error: "Not connected" });
        return;
      }

      const url = new URL(req.url!, "http://localhost");
      const folderId = url.searchParams.get("folderId");
      if (!folderId) {
        sendJson(res, 400, { error: "Missing folderId" });
        return;
      }

      const gRes = await googleFetch(`/drive/v3/files/${folderId}?fields=id,name,parents`);
      const data = (await gRes.json()) as { id: string; name: string; parents?: string[] };
      sendJson(res, 200, { id: data.id, name: data.name, parents: data.parents });
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  },
});
```

**Step 3: 修改 knowledge config 类型**

修改 `extensions/knowledge-base/src/types.ts`，在 `GoogleDriveKnowledgeConfig` 中添加 rootFolder：

```typescript
export type GoogleDriveKnowledgeConfig = KnowledgeSourceConfig & {
  folders?: string[];
  rootFolder?: { id: string; name: string };
  fileTypes?: string[];
  maxFileSize?: string;
};
```

**Step 4: 修改 syncGoogleDrive**

修改 `extensions/knowledge-base/src/connectors/google-drive.ts` 中的 `listFiles` 函数，当 `config.rootFolder` 存在时，直接使用其 `id` 作为根目录来列举文件，无需再按名称查找文件夹：

在 `listFiles` 函数开头，添加 rootFolder 支持：

```typescript
async function listFiles(config: GoogleDriveKnowledgeConfig): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];

  // Collect all folder IDs to scan
  const folderIds: string[] = [];

  // If rootFolder is set, use it directly
  if (config.rootFolder?.id) {
    folderIds.push(config.rootFolder.id);
  }

  // Also check legacy folders config
  const folders = config.folders ?? [];
  for (const folder of folders) {
    const folderQuery = `name = '${folder.replace(/^\//, "")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const folderRes = await googleFetch(
      `/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`,
    );
    const folderData = (await folderRes.json()) as DriveListResponse;
    const folderId = folderData.files?.[0]?.id;
    if (folderId) folderIds.push(folderId);
  }

  const fileTypes = config.fileTypes ?? ["pdf", "docx", "md", "txt"];

  for (const folderId of folderIds) {
    let pageToken: string | undefined;
    do {
      const query = `'${folderId}' in parents and trashed = false`;
      let url = `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size),nextPageToken&pageSize=100`;
      if (pageToken) url += `&pageToken=${pageToken}`;

      const res = await googleFetch(url);
      const data = (await res.json()) as DriveListResponse;

      for (const file of data.files ?? []) {
        if (isGoogleDocType(file.mimeType)) {
          allFiles.push(file);
          continue;
        }
        const ext = resolveFileExtension(file.mimeType) ?? file.name.split(".").pop() ?? "";
        if (fileTypes.includes(ext)) {
          allFiles.push(file);
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }
  return allFiles;
}
```

**Step 5: 验证 Docker 构建**

Run: `cd /mnt/d/02.mycode/toy/research/nanobots && pnpm build`
Expected: 编译成功无错误

---

### Task 2: 前端 — 更新 state 和 KNOWLEDGE_SOURCES 定义

**Files:**

- Modify: `extensions/web-setup/public/app.js:17-42` (state.knowledge)
- Modify: `extensions/web-setup/public/app.js:1603-1625` (KNOWLEDGE_SOURCES)

**Context:**
需要在 state 中为 Google Drive 和 Dropbox 添加 `rootFolder` 字段（`{id, name}` 或 `null`），KNOWLEDGE_SOURCES 需要区分 `folderBrowser` 类型（Google Drive/Dropbox）和 `databaseSelect` 类型（Notion）。

**Step 1: 修改 state.knowledge**

```javascript
knowledge: {
  googleDrive: {
    connected: false,
    enabled: false,
    folders: [],
    selectedFolders: [],
    rootFolder: null,  // { id: "...", name: "..." } or null
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
    rootFolder: null,
    lastSynced: null,
    fileCount: 0,
  },
},
```

**Step 2: 修改 KNOWLEDGE_SOURCES**

```javascript
var KNOWLEDGE_SOURCES = [
  {
    id: "googleDrive",
    name: "Google Drive",
    icon: "gdrive",
    desc: "同步 Google Docs、Sheets 等云端文件",
    itemLabel: "文件夹",
    type: "folderBrowser",
    serviceProvider: "google",
  },
  {
    id: "notion",
    name: "Notion",
    icon: "notion",
    desc: "同步 Notion 页面和数据库内容",
    itemLabel: "数据库",
    type: "databaseSelect",
    serviceProvider: "notion",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    icon: "dropbox",
    desc: "同步 Dropbox 云存储中的文件",
    itemLabel: "文件夹",
    type: "folderBrowser",
    serviceProvider: "dropbox",
  },
];
```

**Step 3: 修改 init 加载逻辑**

在 init 函数中，加载 knowledge config 后把 rootFolder 也同步到 state。需要在现有的 `api("/api/knowledge/config")` 调用基础上（如果没有此调用就新增一个），从 config 中读取 rootFolder：

在 init 的 `Promise.all` 中新增一项：

```javascript
api("/api/knowledge/config").catch(function () { return {}; }),
```

在 results 处理中解析 rootFolder：

```javascript
var knowledgeConfig = results[6] || {};
var gdConfig = knowledgeConfig["google-drive"] || {};
if (gdConfig.rootFolder) {
  state.knowledge.googleDrive.rootFolder = gdConfig.rootFolder;
}
var dbConfig = knowledgeConfig.dropbox || {};
if (dbConfig.rootFolder) {
  state.knowledge.dropbox.rootFolder = dbConfig.rootFolder;
}
```

---

### Task 3: 前端 — 重写 renderKnowledgeCard 函数

**Files:**

- Modify: `extensions/web-setup/public/app.js:1705-1807`

**Context:**
将 `renderKnowledgeCard` 拆分为两个渲染路径：

- `type === "folderBrowser"` (Google Drive / Dropbox) → 三种状态卡片
- `type === "databaseSelect"` (Notion) → 保持现有逻辑

三种 folderBrowser 状态：

1. **未连接**: 显示"未连接"状态 + "前往服务页面连接"链接
2. **已连接、未设置根目录**: 显示"已连接" + "设置知识库目录"按钮
3. **已连接、已设置根目录**: 显示"已连接" + 根目录路径 + "修改"按钮 + "同步"按钮

**Step 1: 重写 renderKnowledgeCard**

```javascript
function renderKnowledgeCard(sourceMeta) {
  if (sourceMeta.type === "databaseSelect") {
    return renderNotionCard(sourceMeta);
  }
  return renderFolderBrowserCard(sourceMeta);
}

function renderNotionCard(sourceMeta) {
  // Keep the exact existing logic from the old renderKnowledgeCard
  var sourceData = state.knowledge[sourceMeta.id];
  var connected = sourceData.connected;
  var statusClass = connected ? "enabled" : "needs-config";
  var statusText = connected ? "已连接" : "未连接";

  var buttonHtml = "";
  if (connected) {
    buttonHtml =
      '<button class="knowledge-sync-btn" data-source="' + sourceMeta.id + '">同步</button>';
  } else {
    buttonHtml = '<a class="knowledge-go-service-link" href="#services">前往服务页面连接</a>';
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
    var items = sourceData.databases;
    var selectedItems = sourceData.selectedDatabases;
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

function renderFolderBrowserCard(sourceMeta) {
  var sourceData = state.knowledge[sourceMeta.id];
  var connected = sourceData.connected;

  // State 1: Not connected
  if (!connected) {
    return (
      '<div class="knowledge-card">' +
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
      '<span class="status-badge needs-config"><span class="status-badge-dot"></span>未连接</span>' +
      '<a class="knowledge-go-service-link" href="#services">前往服务页面连接</a>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  var rootFolder = sourceData.rootFolder;
  var syncInfo = "";
  if (sourceData.lastSynced) {
    syncInfo =
      '<div class="knowledge-sync-info">最后同步: ' +
      new Date(sourceData.lastSynced).toLocaleString() +
      " · " +
      sourceData.fileCount +
      " 个文件</div>";
  }

  // State 2: Connected, no root folder set
  if (!rootFolder) {
    return (
      '<div class="knowledge-card knowledge-card-connected">' +
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
      '<span class="status-badge enabled"><span class="status-badge-dot"></span>已连接</span>' +
      '<button class="knowledge-set-root-btn" data-source="' +
      sourceMeta.id +
      '">设置知识库目录</button>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  // State 3: Connected, root folder set
  return (
    '<div class="knowledge-card knowledge-card-connected">' +
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
    '<span class="status-badge enabled"><span class="status-badge-dot"></span>已连接</span>' +
    '<button class="knowledge-sync-btn" data-source="' +
    sourceMeta.id +
    '">同步</button>' +
    "</div>" +
    "</div>" +
    '<div class="knowledge-root-info">' +
    '<div class="knowledge-root-path">' +
    '<span class="knowledge-root-icon">' +
    ICONS.folder +
    "</span>" +
    '<span class="knowledge-root-name">' +
    escapeHtml(rootFolder.name) +
    "</span>" +
    "</div>" +
    '<button class="knowledge-change-root-btn" data-source="' +
    sourceMeta.id +
    '">修改</button>' +
    "</div>" +
    syncInfo +
    "</div>"
  );
}
```

---

### Task 4: 前端 — 文件夹浏览器 Modal

**Files:**

- Modify: `extensions/web-setup/public/app.js` (在 `closeBestPracticeModal` 之后新增函数)

**Context:**
创建文件夹浏览器 Modal，用于选择知识库根目录。Modal 包含：

- 当前路径（面包屑导航）
- 文件夹列表（可点击进入子目录）
- "返回上级"按钮
- "选择此目录"按钮

**Step 1: 新增 renderFolderBrowserModal**

```javascript
function renderFolderBrowserModal(source, folders, breadcrumb) {
  var folderListHtml = "";
  if (folders.length === 0) {
    folderListHtml = '<div class="fb-empty">此目录下没有子文件夹</div>';
  } else {
    folderListHtml = folders
      .map(function (f) {
        return (
          '<div class="fb-folder-item" data-folder-id="' +
          escapeHtml(f.id) +
          '" data-folder-name="' +
          escapeHtml(f.name) +
          '">' +
          '<span class="fb-folder-icon">' +
          ICONS.folder +
          "</span>" +
          '<span class="fb-folder-name">' +
          escapeHtml(f.name) +
          "</span>" +
          '<span class="fb-folder-arrow">' +
          ICONS.chevronRight +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  var breadcrumbHtml = breadcrumb
    .map(function (item, idx) {
      if (idx === breadcrumb.length - 1) {
        return '<span class="fb-breadcrumb-current">' + escapeHtml(item.name) + "</span>";
      }
      return (
        '<span class="fb-breadcrumb-item" data-folder-id="' +
        (item.id || "") +
        '" data-index="' +
        idx +
        '">' +
        escapeHtml(item.name) +
        "</span>" +
        '<span class="fb-breadcrumb-sep">/</span>'
      );
    })
    .join("");

  var currentFolder = breadcrumb[breadcrumb.length - 1];
  var isRoot = breadcrumb.length <= 1;
  var selectDisabled = isRoot ? " disabled" : "";
  var selectTitle = isRoot ? "请进入一个文件夹后选择" : "";

  return (
    '<div class="fb-modal-overlay" id="fbModal">' +
    '<div class="fb-modal">' +
    '<div class="fb-modal-header">' +
    "<h2>选择知识库目录</h2>" +
    '<button class="fb-modal-close" id="fbModalClose">&times;</button>' +
    "</div>" +
    '<div class="fb-breadcrumb">' +
    breadcrumbHtml +
    "</div>" +
    '<div class="fb-modal-body" id="fbFolderList">' +
    folderListHtml +
    "</div>" +
    '<div class="fb-modal-footer">' +
    '<button class="fb-modal-cancel" id="fbModalCancel">取消</button>' +
    '<button class="fb-modal-select" id="fbModalSelect"' +
    selectDisabled +
    ' title="' +
    selectTitle +
    '"' +
    ' data-source="' +
    source +
    '"' +
    ' data-folder-id="' +
    escapeHtml(currentFolder.id || "") +
    '"' +
    ' data-folder-name="' +
    escapeHtml(currentFolder.name) +
    '"' +
    ">选择此目录</button>" +
    "</div>" +
    "</div>" +
    "</div>"
  );
}
```

**Step 2: 新增 showFolderBrowserModal / closeFolderBrowserModal / navigateFolder**

```javascript
var fbState = {
  source: null,
  breadcrumb: [], // [{id: null, name: "根目录"}, {id: "xxx", name: "folder1"}, ...]
  loading: false,
};

function showFolderBrowserModal(source) {
  fbState.source = source;
  fbState.breadcrumb = [{ id: null, name: "根目录" }];
  fbState.loading = true;

  // Render loading state
  var existing = document.getElementById("fbModal");
  if (existing) existing.remove();

  var div = document.createElement("div");
  div.innerHTML = renderFolderBrowserModal(source, [], [{ id: null, name: "根目录" }]);
  document.body.appendChild(div.firstElementChild);
  bindFolderBrowserEvents();

  // Load root folders
  loadFolderContents(null);
}

function closeFolderBrowserModal() {
  var modal = document.getElementById("fbModal");
  if (modal) modal.remove();
  fbState.source = null;
  fbState.breadcrumb = [];
}

function loadFolderContents(parentId) {
  var source = fbState.source;
  var sourceMap = { googleDrive: "google-drive", dropbox: "dropbox" };
  var apiSource = sourceMap[source];

  var url = "/api/knowledge/" + apiSource + "/folders";
  if (parentId) url += "?parentId=" + encodeURIComponent(parentId);

  api(url)
    .then(function (res) {
      if (!res.connected) {
        closeFolderBrowserModal();
        showToast("服务未连接", "error");
        return;
      }
      updateFolderBrowserContent(res.folders || []);
    })
    .catch(function (err) {
      showToast("加载文件夹失败: " + err.message, "error");
    });
}

function navigateToFolder(folderId, folderName) {
  fbState.breadcrumb.push({ id: folderId, name: folderName });
  updateFolderBrowserUI();
  loadFolderContents(folderId);
}

function navigateToBreadcrumb(index) {
  fbState.breadcrumb = fbState.breadcrumb.slice(0, index + 1);
  var current = fbState.breadcrumb[fbState.breadcrumb.length - 1];
  updateFolderBrowserUI();
  loadFolderContents(current.id);
}

function updateFolderBrowserContent(folders) {
  var listEl = document.getElementById("fbFolderList");
  if (!listEl) return;

  if (folders.length === 0) {
    listEl.innerHTML = '<div class="fb-empty">此目录下没有子文件夹</div>';
  } else {
    listEl.innerHTML = folders
      .map(function (f) {
        return (
          '<div class="fb-folder-item" data-folder-id="' +
          escapeHtml(f.id) +
          '" data-folder-name="' +
          escapeHtml(f.name) +
          '">' +
          '<span class="fb-folder-icon">' +
          ICONS.folder +
          "</span>" +
          '<span class="fb-folder-name">' +
          escapeHtml(f.name) +
          "</span>" +
          '<span class="fb-folder-arrow">' +
          ICONS.chevronRight +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  // Rebind click events on folder items
  var items = listEl.querySelectorAll(".fb-folder-item");
  items.forEach(function (item) {
    item.addEventListener("click", function () {
      var fid = this.getAttribute("data-folder-id");
      var fname = this.getAttribute("data-folder-name");
      navigateToFolder(fid, fname);
    });
  });

  // Update select button state
  var selectBtn = document.getElementById("fbModalSelect");
  if (selectBtn) {
    var current = fbState.breadcrumb[fbState.breadcrumb.length - 1];
    var isRoot = fbState.breadcrumb.length <= 1;
    selectBtn.disabled = isRoot;
    selectBtn.setAttribute("data-folder-id", current.id || "");
    selectBtn.setAttribute("data-folder-name", current.name);
    selectBtn.title = isRoot ? "请进入一个文件夹后选择" : "";
  }
}

function updateFolderBrowserUI() {
  var breadcrumbEl = document.querySelector(".fb-breadcrumb");
  if (!breadcrumbEl) return;

  breadcrumbEl.innerHTML = fbState.breadcrumb
    .map(function (item, idx) {
      if (idx === fbState.breadcrumb.length - 1) {
        return '<span class="fb-breadcrumb-current">' + escapeHtml(item.name) + "</span>";
      }
      return (
        '<span class="fb-breadcrumb-item" data-folder-id="' +
        (item.id || "") +
        '" data-index="' +
        idx +
        '">' +
        escapeHtml(item.name) +
        "</span>" +
        '<span class="fb-breadcrumb-sep">/</span>'
      );
    })
    .join("");

  // Rebind breadcrumb click events
  var crumbs = breadcrumbEl.querySelectorAll(".fb-breadcrumb-item");
  crumbs.forEach(function (crumb) {
    crumb.addEventListener("click", function () {
      var idx = parseInt(this.getAttribute("data-index"), 10);
      navigateToBreadcrumb(idx);
    });
  });

  // Show loading in folder list
  var listEl = document.getElementById("fbFolderList");
  if (listEl) {
    listEl.innerHTML = '<div class="fb-loading">加载中...</div>';
  }
}

function selectRootFolder(source, folderId, folderName) {
  var sourceMap = { googleDrive: "google-drive", dropbox: "dropbox" };
  var apiSource = sourceMap[source];

  // Save to config
  var config = {};
  config[apiSource] = {
    enabled: true,
    rootFolder: { id: folderId, name: folderName },
  };

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
        state.knowledge[source].rootFolder = { id: folderId, name: folderName };
        state.knowledge[source].enabled = true;
        closeFolderBrowserModal();
        showToast("知识库目录已设置为: " + folderName, "success");
        render();
      } else {
        showToast("保存失败", "error");
      }
    })
    .catch(function (err) {
      showToast("保存失败: " + err.message, "error");
    });
}

function bindFolderBrowserEvents() {
  document.getElementById("fbModalClose").addEventListener("click", closeFolderBrowserModal);
  document.getElementById("fbModalCancel").addEventListener("click", closeFolderBrowserModal);
  document.getElementById("fbModal").addEventListener("click", function (e) {
    if (e.target === this) closeFolderBrowserModal();
  });
  document.getElementById("fbModalSelect").addEventListener("click", function () {
    var source = this.getAttribute("data-source");
    var folderId = this.getAttribute("data-folder-id");
    var folderName = this.getAttribute("data-folder-name");
    if (!folderId || this.disabled) return;
    selectRootFolder(source, folderId, folderName);
  });
}
```

**Step 3: 新增 chevronRight icon**

在 ICONS 对象中添加：

```javascript
chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>',
```

---

### Task 5: 前端 — 更新 bindKnowledgeEvents 和 saveKnowledgeConfig

**Files:**

- Modify: `extensions/web-setup/public/app.js:2364-2421`
- Modify: `extensions/web-setup/public/app.js:2790-2811`

**Context:**

- 移除 `connectKnowledge` 和 `disconnectKnowledge` 的事件绑定
- 新增 `knowledge-set-root-btn` 和 `knowledge-change-root-btn` 的事件绑定
- 更新 `saveKnowledgeConfig` 以正确处理 rootFolder 字段

**Step 1: 重写 bindKnowledgeEvents**

```javascript
function bindKnowledgeEvents() {
  // Set root folder buttons (folderBrowser cards)
  var setRootBtns = document.querySelectorAll(
    ".knowledge-set-root-btn, .knowledge-change-root-btn",
  );
  setRootBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var source = this.getAttribute("data-source");
      showFolderBrowserModal(source);
    });
  });

  // Sync buttons
  var syncBtns = document.querySelectorAll(".knowledge-sync-btn");
  syncBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var source = this.getAttribute("data-source");
      syncKnowledge(source);
    });
  });

  // Notion database checkboxes
  var checkboxes = document.querySelectorAll(".knowledge-folder-item input");
  checkboxes.forEach(function (checkbox) {
    checkbox.addEventListener("change", function () {
      var card = this.closest(".knowledge-card");
      var source = "notion";
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
```

**Step 2: 更新 saveKnowledgeConfig**

```javascript
function saveKnowledgeConfig() {
  var config = {};

  // Google Drive
  var gd = state.knowledge.googleDrive;
  var gdConfig = { enabled: gd.enabled };
  if (gd.rootFolder) {
    gdConfig.rootFolder = gd.rootFolder;
  }
  if (gd.selectedFolders && gd.selectedFolders.length > 0) {
    gdConfig.folders = gd.selectedFolders;
  }
  config["google-drive"] = gdConfig;

  // Notion
  var n = state.knowledge.notion;
  config.notion = {
    enabled: n.enabled,
    databases: n.selectedDatabases || [],
  };

  // Dropbox
  var db = state.knowledge.dropbox;
  var dbConfig = { enabled: db.enabled };
  if (db.rootFolder) {
    dbConfig.rootFolder = db.rootFolder;
  }
  config.dropbox = dbConfig;

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
```

**Step 3: 可以删除不再使用的 `connectKnowledge` 和 `disconnectKnowledge` 函数**

---

### Task 6: 前端 CSS — 文件夹浏览器 Modal 样式

**Files:**

- Modify: `extensions/web-setup/public/style.css` (在 Knowledge Page section 末尾添加)

**Step 1: 添加新样式**

```css
/* ===== Knowledge Root Folder Info ===== */
.knowledge-root-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid var(--border-soft);
  background: var(--bg-warm);
}

.knowledge-root-path {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--title);
}

.knowledge-root-icon {
  display: flex;
  color: var(--primary);
}

.knowledge-root-icon svg {
  width: 16px;
  height: 16px;
}

.knowledge-root-name {
  font-weight: 600;
}

.knowledge-change-root-btn {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}

.knowledge-change-root-btn:hover {
  border-color: var(--primary-soft);
  color: var(--primary);
  background: var(--primary-ultra-soft);
}

.knowledge-set-root-btn {
  padding: 6px 16px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
  background: var(--primary);
  color: white;
}

.knowledge-set-root-btn:hover {
  background: var(--primary-light);
  transform: translateY(-1px);
}

.knowledge-go-service-link {
  font-size: 0.8rem;
  color: var(--primary);
  text-decoration: none;
  font-weight: 600;
  transition: var(--transition);
}

.knowledge-go-service-link:hover {
  text-decoration: underline;
}

/* ===== Folder Browser Modal ===== */
.fb-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: bpFadeIn 0.2s ease;
}

.fb-modal {
  background: var(--card);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: bpSlideUp 0.3s ease;
}

.fb-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-soft);
}

.fb-modal-header h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--title);
  margin: 0;
}

.fb-modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--muted);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.fb-modal-close:hover {
  color: var(--title);
}

.fb-breadcrumb {
  padding: 12px 24px;
  font-size: 0.82rem;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-soft);
}

.fb-breadcrumb-item {
  color: var(--primary);
  cursor: pointer;
  font-weight: 600;
}

.fb-breadcrumb-item:hover {
  text-decoration: underline;
}

.fb-breadcrumb-current {
  color: var(--title);
  font-weight: 700;
}

.fb-breadcrumb-sep {
  color: var(--muted);
  margin: 0 2px;
}

.fb-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
  min-height: 200px;
  max-height: 400px;
}

.fb-folder-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition);
  border: 1px solid transparent;
}

.fb-folder-item:hover {
  background: var(--primary-ultra-soft);
  border-color: var(--primary-soft);
}

.fb-folder-icon {
  display: flex;
  color: var(--primary);
}

.fb-folder-icon svg {
  width: 18px;
  height: 18px;
}

.fb-folder-name {
  flex: 1;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--title);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fb-folder-arrow {
  display: flex;
  color: var(--muted);
}

.fb-folder-arrow svg {
  width: 16px;
  height: 16px;
}

.fb-empty,
.fb-loading {
  padding: 40px 20px;
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
}

.fb-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-soft);
}

.fb-modal-cancel {
  padding: 8px 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}

.fb-modal-cancel:hover {
  background: var(--bg-warm);
}

.fb-modal-select {
  padding: 8px 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}

.fb-modal-select:hover:not(:disabled) {
  background: var(--primary-light);
  transform: translateY(-1px);
}

.fb-modal-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Step 2: 可以删除不再使用的 CSS**

删除 `.knowledge-connect-btn` 和 `.knowledge-disconnect-btn` 样式。

---

### Task 7: Docker 构建和测试

**Step 1: 构建并部署**

Run: `cd /mnt/d/02.mycode/toy/research/nanobots && pnpm ship`
Expected: Docker 构建成功

**Step 2: 验证 API**

Run: `curl http://localhost:8080/api/knowledge/google-drive/folders`
Expected: `{"connected":true,"folders":[...],"parentId":null}`

Run: `curl "http://localhost:8080/api/knowledge/google-drive/folders?parentId=SOME_FOLDER_ID"`
Expected: 返回子目录列表

**Step 3: 验证前端**

访问 `http://localhost:8080` → 知识库页面：

- Google Drive 卡片显示三种状态之一
- 点击"设置知识库目录"打开文件夹浏览器 Modal
- 可以浏览子目录
- 选择目录后保存并显示在卡片上
- Notion 卡片保持原有的数据库多选行为
