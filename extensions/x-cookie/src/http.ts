import type { CookieMap, QueryInfo } from "./types.js";
import {
  DEFAULT_BEARER_TOKEN,
  DEFAULT_USER_AGENT,
  FALLBACK_ARTICLE_FEATURE_SWITCHES,
  FALLBACK_ARTICLE_FIELD_TOGGLES,
  FALLBACK_ARTICLE_QUERY_ID,
  FALLBACK_TWEET_DETAIL_FEATURE_DEFAULTS,
  FALLBACK_TWEET_DETAIL_FEATURE_SWITCHES,
  FALLBACK_TWEET_DETAIL_FIELD_TOGGLES,
  FALLBACK_TWEET_DETAIL_QUERY_ID,
  FALLBACK_TWEET_FEATURE_SWITCHES,
  FALLBACK_TWEET_FIELD_TOGGLES,
  FALLBACK_TWEET_QUERY_ID,
} from "./constants.js";
import { buildCookieHeader } from "./cookies.js";

// Cache HTML, main JS bundle, and ClientTransaction instance (expires after 30 min)
let cachedHomeHtml: { userAgent: string; html: string; ts: number } | null = null;
let cachedMainJs: { hash: string; js: string; ts: number } | null = null;
let cachedTransactionGenerator: { ts: number; ct: any } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}: ${text.slice(0, 200)}`);
  }
  return text;
}

async function fetchHomeHtml(userAgent: string): Promise<string> {
  const now = Date.now();
  if (cachedHomeHtml?.userAgent === userAgent && now - cachedHomeHtml.ts < CACHE_TTL_MS)
    return cachedHomeHtml.html;
  const html = await fetchText("https://x.com", { headers: { "user-agent": userAgent } });
  cachedHomeHtml = { userAgent, html, ts: now };
  return html;
}

async function fetchMainJs(userAgent: string): Promise<string> {
  const html = await fetchHomeHtml(userAgent);
  const mainMatch = html.match(/main\.([a-z0-9]+)\.js/);
  if (!mainMatch) return "";

  const hash = mainMatch[1];
  const now = Date.now();
  if (cachedMainJs?.hash === hash && now - cachedMainJs.ts < CACHE_TTL_MS) return cachedMainJs.js;

  const url = `https://abs.twimg.com/responsive-web/client-web/main.${hash}.js`;
  const js = await fetchText(url, { headers: { "user-agent": userAgent } });
  cachedMainJs = { hash, js, ts: now };
  return js;
}

async function generateTransactionId(method: string, apiPath: string): Promise<string | undefined> {
  const userAgent = process.env.X_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  try {
    const now = Date.now();
    if (!cachedTransactionGenerator || now - cachedTransactionGenerator.ts > CACHE_TTL_MS) {
      const html = await fetchHomeHtml(userAgent);
      // X no longer exposes ondemand.s.*.js in HTML; use main.js as the key source
      const mainJs = await fetchMainJs(userAgent);
      if (!mainJs) return undefined;
      const { ClientTransaction } = await import("xclienttransaction");
      const ct = new ClientTransaction(html, mainJs);
      cachedTransactionGenerator = { ts: now, ct };
    }
    return cachedTransactionGenerator.ct.generateTransactionId(method, apiPath);
  } catch {
    return undefined;
  }
}

function parseStringList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^\"|\"$/g, ""));
}

function resolveFeatureValue(html: string, key: string): boolean | undefined {
  const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const unescaped = new RegExp(`"${keyPattern}"\\s*:\\s*\\{"value"\\s*:\\s*(true|false)`);
  const escaped = new RegExp(
    `\\\\"${keyPattern}\\\\"\\s*:\\s*\\\\{\\\\"value\\\\"\\s*:\\s*(true|false)`,
  );
  const match = html.match(unescaped) ?? html.match(escaped);
  if (!match) return undefined;
  return match[1] === "true";
}

export function buildFeatureMap(
  html: string,
  keys: string[],
  defaults?: Record<string, boolean>,
): Record<string, boolean> {
  const features: Record<string, boolean> = {};
  for (const key of keys) {
    const value = resolveFeatureValue(html, key);
    if (value !== undefined) features[key] = value;
    else if (defaults && Object.prototype.hasOwnProperty.call(defaults, key))
      features[key] = defaults[key] ?? true;
    else features[key] = true;
  }
  if (
    !Object.prototype.hasOwnProperty.call(
      features,
      "responsive_web_graphql_exclude_directive_enabled",
    )
  ) {
    features.responsive_web_graphql_exclude_directive_enabled = true;
  }
  return features;
}

export function buildFieldToggleMap(keys: string[]): Record<string, boolean> {
  const toggles: Record<string, boolean> = {};
  for (const key of keys) {
    if (key === "withGrokAnalyze" || key === "withDisallowedReplyControls") toggles[key] = false;
    else toggles[key] = true;
  }
  return toggles;
}

export function buildRequestHeaders(cookieMap: CookieMap): Record<string, string> {
  const userAgent = process.env.X_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  const bearerToken = process.env.X_BEARER_TOKEN?.trim() || DEFAULT_BEARER_TOKEN;

  const headers: Record<string, string> = {
    authorization: bearerToken,
    "user-agent": userAgent,
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br",
    "content-type": "application/json",
    origin: "https://x.com",
    referer: "https://x.com/",
    "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
  };
  if (cookieMap.auth_token) headers["x-twitter-auth-type"] = "OAuth2Session";
  const cookieHeader = buildCookieHeader(cookieMap);
  if (cookieHeader) headers.cookie = cookieHeader;
  if (cookieMap.ct0) headers["x-csrf-token"] = cookieMap.ct0;
  return headers;
}

export async function resolveQueryInfo(
  operationName: string,
  _bundlePattern: RegExp,
  fallbackQueryId: string,
  fallbackFeatures: string[],
  fallbackToggles: string[],
): Promise<QueryInfo> {
  const userAgent = process.env.X_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  const html = await fetchHomeHtml(userAgent);

  try {
    const js = await fetchMainJs(userAgent);
    if (js) {
      const qidMatch = js.match(new RegExp(`queryId:"([^"]+)",operationName:"${operationName}"`));
      const featMatch = js.match(
        new RegExp(`operationName:"${operationName}"[\\s\\S]*?featureSwitches:\\[(.*?)\\]`),
      );
      const toggleMatch = js.match(
        new RegExp(`operationName:"${operationName}"[\\s\\S]*?fieldToggles:\\[(.*?)\\]`),
      );

      if (qidMatch) {
        const features = parseStringList(featMatch?.[1]);
        const toggles = parseStringList(toggleMatch?.[1]);
        return {
          queryId: qidMatch[1],
          featureSwitches: features.length > 0 ? features : fallbackFeatures,
          fieldToggles: toggles.length > 0 ? toggles : fallbackToggles,
          html,
        };
      }
    }
  } catch {
    // Fall through to fallback
  }

  return {
    queryId: fallbackQueryId,
    featureSwitches: fallbackFeatures,
    fieldToggles: fallbackToggles,
    html,
  };
}

/** Resolve a single queryId for an operation, with fallback. */
export async function resolveQueryId(
  operationName: string,
  fallbackQueryId: string,
): Promise<string> {
  const userAgent = process.env.X_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  try {
    const js = await fetchMainJs(userAgent);
    if (js) {
      const m = js.match(new RegExp(`queryId:"([^"]+)",operationName:"${operationName}"`));
      if (m) return m[1];
    }
  } catch {
    // Fall through
  }
  return fallbackQueryId;
}

export async function resolveTweetQueryInfo(): Promise<QueryInfo> {
  return resolveQueryInfo(
    "TweetResultByRestId",
    /main\.([a-z0-9]+)\.js/,
    FALLBACK_TWEET_QUERY_ID,
    FALLBACK_TWEET_FEATURE_SWITCHES,
    FALLBACK_TWEET_FIELD_TOGGLES,
  );
}

export async function resolveTweetDetailQueryInfo(): Promise<QueryInfo> {
  return resolveQueryInfo(
    "TweetDetail",
    /api:"([a-zA-Z0-9_-]+)"/,
    FALLBACK_TWEET_DETAIL_QUERY_ID,
    FALLBACK_TWEET_DETAIL_FEATURE_SWITCHES,
    FALLBACK_TWEET_DETAIL_FIELD_TOGGLES,
  );
}

export async function xGraphqlGet(
  queryId: string,
  operationName: string,
  variables: Record<string, unknown>,
  features: Record<string, boolean>,
  fieldToggles: Record<string, boolean>,
  cookieMap: CookieMap,
): Promise<unknown> {
  const apiPath = `/i/api/graphql/${queryId}/${operationName}`;
  const url = new URL(`https://x.com${apiPath}`);
  url.searchParams.set("variables", JSON.stringify(variables));
  if (Object.keys(features).length > 0) url.searchParams.set("features", JSON.stringify(features));
  if (Object.keys(fieldToggles).length > 0)
    url.searchParams.set("fieldToggles", JSON.stringify(fieldToggles));

  const headers = buildRequestHeaders(cookieMap);
  const txId = await generateTransactionId("GET", apiPath);
  if (txId) headers["x-client-transaction-id"] = txId;

  const response = await fetch(url.toString(), { headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`X API error (${response.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

export async function resolveArticleQueryInfo(): Promise<QueryInfo> {
  const userAgent = process.env.X_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  const html = await fetchHomeHtml(userAgent);

  try {
    // Try to find the TwitterArticles bundle hash
    const bundleMatch = html.match(/"bundle\.TwitterArticles":"([a-z0-9]+)"/);
    if (bundleMatch) {
      const bundleHash = bundleMatch[1];
      const chunkUrl = `https://abs.twimg.com/responsive-web/client-web/bundle.TwitterArticles.${bundleHash}a.js`;
      const chunk = await fetchText(chunkUrl, { headers: { "user-agent": userAgent } });

      const qidMatch = chunk.match(/queryId:"([^"]+)",operationName:"ArticleEntityResultByRestId"/);
      const featMatch = chunk.match(
        /operationName:"ArticleEntityResultByRestId"[\s\S]*?featureSwitches:\[(.*?)\]/,
      );
      const toggleMatch = chunk.match(
        /operationName:"ArticleEntityResultByRestId"[\s\S]*?fieldToggles:\[(.*?)\]/,
      );

      if (qidMatch) {
        const features = parseStringList(featMatch?.[1]);
        const toggles = parseStringList(toggleMatch?.[1]);
        return {
          queryId: qidMatch[1],
          featureSwitches: features.length > 0 ? features : FALLBACK_ARTICLE_FEATURE_SWITCHES,
          fieldToggles: toggles.length > 0 ? toggles : FALLBACK_ARTICLE_FIELD_TOGGLES,
          html,
        };
      }
    }

    // Fallback: try main.js
    const js = await fetchMainJs(userAgent);
    if (js) {
      const m = js.match(/queryId:"([^"]+)",operationName:"ArticleEntityResultByRestId"/);
      if (m) {
        return {
          queryId: m[1],
          featureSwitches: FALLBACK_ARTICLE_FEATURE_SWITCHES,
          fieldToggles: FALLBACK_ARTICLE_FIELD_TOGGLES,
          html,
        };
      }
    }
  } catch {
    // Fall through to fallback
  }

  return {
    queryId: FALLBACK_ARTICLE_QUERY_ID,
    featureSwitches: FALLBACK_ARTICLE_FEATURE_SWITCHES,
    fieldToggles: FALLBACK_ARTICLE_FIELD_TOGGLES,
    html,
  };
}

export async function xGraphqlPost(
  queryId: string,
  operationName: string,
  variables: Record<string, unknown>,
  features: Record<string, boolean>,
  fieldToggles: Record<string, boolean>,
  cookieMap: CookieMap,
): Promise<unknown> {
  const apiPath = `/i/api/graphql/${queryId}/${operationName}`;
  const url = `https://x.com${apiPath}`;
  const headers = buildRequestHeaders(cookieMap);
  const txId = await generateTransactionId("POST", apiPath);
  if (txId) headers["x-client-transaction-id"] = txId;

  const body = JSON.stringify({ variables, features, fieldToggles, queryId });
  const response = await fetch(url, { method: "POST", headers, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`X API error (${response.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
