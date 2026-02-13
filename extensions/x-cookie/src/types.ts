export type CookieMap = Record<string, string>;

export type CookieFileData =
  | { cookies: CookieMap; updated_at: number; source?: string }
  | { version: number; updatedAt: string; cookieMap: CookieMap; source?: string };

export type QueryInfo = {
  queryId: string;
  featureSwitches: string[];
  fieldToggles: string[];
  html: string;
};
