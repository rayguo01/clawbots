import crypto from "node:crypto";
import { loadCredential, saveCredential, type EzbCredential } from "./ezbookkeeping-store.js";

const EZB_URL = process.env.NANOBOTS_EZBOOKKEEPING_URL || "http://ezbookkeeping:8080";
const EZB_SECRET = process.env.NANOBOTS_EZBOOKKEEPING_SECRET || "nanobots-ezb-secret";
const EZB_DEFAULT_CURRENCY = process.env.NANOBOTS_EZBOOKKEEPING_CURRENCY || "SGD";

// ── Password generation ───────────────────────────────────────

function generatePassword(sessionKey: string): string {
  return crypto.createHmac("sha256", EZB_SECRET).update(sessionKey).digest("hex");
}

function generateUsername(sessionKey: string): string {
  return `nb_${sessionKey.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

// ── Default Chinese categories ────────────────────────────────

type PresetCategory = {
  name: string;
  type: number; // 1=Income, 2=Expense, 3=Transfer
  icon: string;
  color: string; // 6-char hex RGB
  subCategories: Array<{ name: string; type: number; icon: string; color: string }>;
};

const DEFAULT_CATEGORIES: PresetCategory[] = [
  // ── Expense (type=2) ──
  {
    name: "餐饮",
    type: 2,
    icon: "1",
    color: "E74C3C",
    subCategories: [
      { name: "早餐", type: 2, icon: "1", color: "E74C3C" },
      { name: "午餐", type: 2, icon: "1", color: "E74C3C" },
      { name: "晚餐", type: 2, icon: "1", color: "E74C3C" },
      { name: "饮料", type: 2, icon: "1", color: "E74C3C" },
      { name: "零食", type: 2, icon: "1", color: "E74C3C" },
    ],
  },
  {
    name: "交通",
    type: 2,
    icon: "18",
    color: "3498DB",
    subCategories: [
      { name: "公共交通", type: 2, icon: "18", color: "3498DB" },
      { name: "打车", type: 2, icon: "18", color: "3498DB" },
      { name: "加油", type: 2, icon: "18", color: "3498DB" },
    ],
  },
  {
    name: "购物",
    type: 2,
    icon: "24",
    color: "9B59B6",
    subCategories: [
      { name: "日用品", type: 2, icon: "24", color: "9B59B6" },
      { name: "衣服", type: 2, icon: "24", color: "9B59B6" },
      { name: "电子产品", type: 2, icon: "24", color: "9B59B6" },
    ],
  },
  {
    name: "住房",
    type: 2,
    icon: "30",
    color: "1ABC9C",
    subCategories: [
      { name: "房租", type: 2, icon: "30", color: "1ABC9C" },
      { name: "水电煤", type: 2, icon: "30", color: "1ABC9C" },
      { name: "物业费", type: 2, icon: "30", color: "1ABC9C" },
    ],
  },
  {
    name: "娱乐",
    type: 2,
    icon: "36",
    color: "F39C12",
    subCategories: [
      { name: "电影", type: 2, icon: "36", color: "F39C12" },
      { name: "游戏", type: 2, icon: "36", color: "F39C12" },
      { name: "运动健身", type: 2, icon: "36", color: "F39C12" },
      { name: "旅游", type: 2, icon: "36", color: "F39C12" },
    ],
  },
  {
    name: "医疗",
    type: 2,
    icon: "42",
    color: "E67E22",
    subCategories: [
      { name: "看病", type: 2, icon: "42", color: "E67E22" },
      { name: "药品", type: 2, icon: "42", color: "E67E22" },
    ],
  },
  {
    name: "教育",
    type: 2,
    icon: "48",
    color: "2ECC71",
    subCategories: [
      { name: "书籍", type: 2, icon: "48", color: "2ECC71" },
      { name: "课程", type: 2, icon: "48", color: "2ECC71" },
    ],
  },
  {
    name: "通讯",
    type: 2,
    icon: "54",
    color: "34495E",
    subCategories: [
      { name: "话费", type: 2, icon: "54", color: "34495E" },
      { name: "网费", type: 2, icon: "54", color: "34495E" },
    ],
  },
  {
    name: "礼物",
    type: 2,
    icon: "12",
    color: "E91E63",
    subCategories: [
      { name: "送礼", type: 2, icon: "12", color: "E91E63" },
      { name: "红包", type: 2, icon: "12", color: "E91E63" },
    ],
  },
  {
    name: "其他支出",
    type: 2,
    icon: "60",
    color: "95A5A6",
    subCategories: [],
  },
  // ── Income (type=1) ──
  {
    name: "工资",
    type: 1,
    icon: "6",
    color: "27AE60",
    subCategories: [
      { name: "工资收入", type: 1, icon: "6", color: "27AE60" },
      { name: "奖金", type: 1, icon: "6", color: "27AE60" },
      { name: "加班费", type: 1, icon: "6", color: "27AE60" },
    ],
  },
  {
    name: "投资",
    type: 1,
    icon: "12",
    color: "2980B9",
    subCategories: [
      { name: "投资收益", type: 1, icon: "12", color: "2980B9" },
      { name: "利息", type: 1, icon: "12", color: "2980B9" },
    ],
  },
  {
    name: "兼职",
    type: 1,
    icon: "18",
    color: "8E44AD",
    subCategories: [],
  },
  {
    name: "其他收入",
    type: 1,
    icon: "24",
    color: "95A5A6",
    subCategories: [
      { name: "红包收入", type: 1, icon: "24", color: "95A5A6" },
      { name: "报销", type: 1, icon: "24", color: "95A5A6" },
    ],
  },
  // ── Transfer (type=3) ──
  {
    name: "转账",
    type: 3,
    icon: "1",
    color: "7F8C8D",
    subCategories: [
      { name: "银行转账", type: 3, icon: "1", color: "7F8C8D" },
      { name: "信用卡还款", type: 3, icon: "1", color: "7F8C8D" },
    ],
  },
];

// ── Core auth flow ────────────────────────────────────────────

async function register(sessionKey: string, currency: string): Promise<{ token: string }> {
  const username = generateUsername(sessionKey);
  const password = generatePassword(sessionKey);

  const res = await fetch(`${EZB_URL}/api/register.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@nanobots.local`,
      nickname: sessionKey,
      password,
      language: "zh-Hans",
      defaultCurrency: currency,
      firstDayOfWeek: 1,
      categories: DEFAULT_CATEGORIES,
    }),
  });

  const data = (await res.json()) as EzbApiResponse;
  if (!data.success) {
    throw new Error(`ezBookkeeping register failed: ${data.errorMessage || res.status}`);
  }
  return { token: data.result.token as string };
}

async function login(sessionKey: string): Promise<{ token: string }> {
  const username = generateUsername(sessionKey);
  const password = generatePassword(sessionKey);

  const res = await fetch(`${EZB_URL}/api/authorize.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginName: username, password }),
  });

  const data = (await res.json()) as EzbApiResponse;
  if (!data.success) {
    throw new Error(`ezBookkeeping login failed: ${data.errorMessage || res.status}`);
  }
  return { token: data.result.token as string };
}

/** Ensure default categories exist (for users registered before categories were added). */
async function ensureCategories(token: string): Promise<void> {
  const res = await fetch(`${EZB_URL}/api/v1/transaction/categories/list.json`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as EzbApiResponse;
  if (!data.success) return;

  const hasCategories = Object.values(data.result as Record<string, unknown[]>).some(
    (arr) => arr.length > 0,
  );
  if (hasCategories) return;

  // No categories — batch-create defaults
  await fetch(`${EZB_URL}/api/v1/transaction/categories/add_batch.json`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ categories: DEFAULT_CATEGORIES }),
  });
}

/** Ensure at least one account exists; create a default cash account if empty. */
async function ensureDefaultAccount(token: string, currency: string): Promise<string> {
  const res = await fetch(`${EZB_URL}/api/v1/accounts/list.json`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as EzbApiResponse;
  if (data.success && Array.isArray(data.result) && data.result.length > 0) {
    const accounts = data.result as Array<{ id: string; category: number }>;
    const cash = accounts.find((a) => a.category === 1);
    return (cash || accounts[0]).id;
  }

  // No accounts — create a default cash account
  const createRes = await fetch(`${EZB_URL}/api/v1/accounts/add.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Timezone-Offset": String(-new Date().getTimezoneOffset()),
    },
    body: JSON.stringify({
      name: "现金",
      category: 1,
      type: 1,
      icon: "1",
      color: "4CAF50",
      currency,
      balance: 0,
      comment: "",
      hidden: false,
    }),
  });
  const createData = (await createRes.json()) as EzbApiResponse;
  if (!createData.success) {
    throw new Error(`Failed to create default account: ${createData.errorMessage}`);
  }
  return createData.result.id as string;
}

/**
 * Ensure the user identified by sessionKey has a valid token.
 * Auto-registers on first use, re-logins on token expiry.
 */
export async function ensureAuthenticated(
  sessionKey: string,
  currency?: string,
): Promise<EzbCredential> {
  const cached = await loadCredential(sessionKey);
  if (cached) return cached;

  const cur = currency || EZB_DEFAULT_CURRENCY;

  // First time: try register, fallback to login (already registered)
  let token: string;
  try {
    const reg = await register(sessionKey, cur);
    token = reg.token;
  } catch {
    const auth = await login(sessionKey);
    token = auth.token;
  }

  await ensureCategories(token);
  const defaultAccountId = await ensureDefaultAccount(token, cur);

  const cred: EzbCredential = {
    sessionKey,
    username: generateUsername(sessionKey),
    token,
    defaultAccountId,
    createdAt: Date.now(),
  };
  await saveCredential(sessionKey, cred);
  return cred;
}

// ── Authenticated fetch with auto re-login ────────────────────

type EzbApiResponse = {
  success: boolean;
  result: any;
  errorCode?: string;
  errorMessage?: string;
};

export async function ezbFetch(
  sessionKey: string,
  path: string,
  options?: RequestInit & { utcOffset?: number; currency?: string },
): Promise<EzbApiResponse> {
  let cred = await ensureAuthenticated(sessionKey, options?.currency);

  const doFetch = async (token: string): Promise<Response> => {
    const headers = new Headers(options?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && options?.body) {
      headers.set("Content-Type", "application/json");
    }
    // Set timezone offset for time-dependent endpoints
    if (options?.utcOffset !== undefined) {
      headers.set("X-Timezone-Offset", String(options.utcOffset));
    }
    return fetch(`${EZB_URL}${path}`, { ...options, headers });
  };

  let res = await doFetch(cred.token);

  // 401 → re-login and retry once
  if (res.status === 401) {
    const auth = await login(sessionKey);
    cred = { ...cred, token: auth.token };
    await saveCredential(sessionKey, cred);
    res = await doFetch(cred.token);
  }

  const data = (await res.json()) as EzbApiResponse;
  if (!data.success) {
    throw new Error(`ezBookkeeping API error: ${data.errorMessage || `HTTP ${res.status}`}`);
  }
  return data;
}
