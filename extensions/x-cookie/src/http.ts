import type { CookieMap, QueryInfo } from "./types.js";
import {
  DEFAULT_BEARER_TOKEN,
  DEFAULT_USER_AGENT,
  FALLBACK_TWEET_DETAIL_FEATURE_DEFAULTS,
  FALLBACK_TWEET_DETAIL_FEATURE_SWITCHES,
  FALLBACK_TWEET_DETAIL_FIELD_TOGGLES,
  FALLBACK_TWEET_DETAIL_QUERY_ID,
  FALLBACK_TWEET_FEATURE_SWITCHES,
  FALLBACK_TWEET_FIELD_TOGGLES,
  FALLBACK_TWEET_QUERY_ID,
} from "./constants.js";
import { buildCookieHeader } from "./cookies.js";

let cachedHomeHtml: { userAgent: string; html: string } | null = null;

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}: ${text.slice(0, 200)}`);
  }
  return text;
}

async function fetchHomeHtml(userAgent: string): Promise<string> {
  if (cachedHomeHtml?.userAgent === userAgent) return cachedHomeHtml.html;
  const html = await fetchText("https://x.com", { headers: { "user-agent": userAgent } });
  cachedHomeHtml = { userAgent, html };
  return html;
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
    accept: "application/json",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    "accept-language": "en",
  };
  if (cookieMap.auth_token) headers["x-twitter-auth-type"] = "OAuth2Session";
  const cookieHeader = buildCookieHeader(cookieMap);
  if (cookieHeader) headers.cookie = cookieHeader;
  if (cookieMap.ct0) headers["x-csrf-token"] = cookieMap.ct0;
  return headers;
}

async function resolveQueryInfo(
  operationName: string,
  bundlePattern: RegExp,
  fallbackQueryId: string,
  fallbackFeatures: string[],
  fallbackToggles: string[],
): Promise<QueryInfo> {
  const userAgent = process.env.X_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  const html = await fetchHomeHtml(userAgent);

  // Try to find the chunk containing this operation
  const patterns = [/api:"([a-zA-Z0-9_-]+)"/, /main\.([a-z0-9]+)\.js/];

  for (const pattern of patterns) {
    const hashMatch = html.match(pattern);
    if (!hashMatch) continue;

    const hash = hashMatch[1];
    const prefix = pattern === patterns[0] ? "api" : "main";
    const chunkUrl = `https://abs.twimg.com/responsive-web/client-web/${prefix}.${hash}${prefix === "api" ? "a" : ""}.js`;

    try {
      const chunk = await fetchText(chunkUrl, { headers: { "user-agent": userAgent } });
      const qidMatch = chunk.match(
        new RegExp(`queryId:"([^"]+)",operationName:"${operationName}"`),
      );
      const featMatch = chunk.match(
        new RegExp(`operationName:"${operationName}"[\\s\\S]*?featureSwitches:\\[(.*?)\\]`),
      );
      const toggleMatch = chunk.match(
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
    } catch {
      // Try next pattern
    }
  }

  return {
    queryId: fallbackQueryId,
    featureSwitches: fallbackFeatures,
    fieldToggles: fallbackToggles,
    html,
  };
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
  const url = new URL(`https://x.com/i/api/graphql/${queryId}/${operationName}`);
  url.searchParams.set("variables", JSON.stringify(variables));
  if (Object.keys(features).length > 0) url.searchParams.set("features", JSON.stringify(features));
  if (Object.keys(fieldToggles).length > 0)
    url.searchParams.set("fieldToggles", JSON.stringify(fieldToggles));

  const response = await fetch(url.toString(), { headers: buildRequestHeaders(cookieMap) });
  const text = await response.text();
  if (!response.ok) throw new Error(`X API error (${response.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

export async function xGraphqlPost(
  queryId: string,
  operationName: string,
  variables: Record<string, unknown>,
  features: Record<string, boolean>,
  fieldToggles: Record<string, boolean>,
  cookieMap: CookieMap,
): Promise<unknown> {
  const url = `https://x.com/i/api/graphql/${queryId}/${operationName}`;
  const headers = buildRequestHeaders(cookieMap);
  headers["content-type"] = "application/json";

  const body = JSON.stringify({ variables, features, fieldToggles, queryId });
  const response = await fetch(url, { method: "POST", headers, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`X API error (${response.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
