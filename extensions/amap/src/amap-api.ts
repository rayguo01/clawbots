const AMAP_BASE = "https://restapi.amap.com/v5";

function getApiKey(): string {
  const key = process.env.NANOBOTS_AMAP_API_KEY?.trim() || process.env.AMAP_API_KEY?.trim() || "";
  if (!key) {
    throw new Error("高德地图 API Key 未配置。请设置 NANOBOTS_AMAP_API_KEY 环境变量。");
  }
  return key;
}

/**
 * Make a request to the Amap (高德) Web Service API.
 * All requests are GET with query parameters.
 */
export async function amapFetch(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const apiKey = getApiKey();
  params.key = apiKey;
  // Request extended fields (tel, rating, business_area)
  if (!params.show_fields) {
    params.show_fields = "business,tel,rating";
  }

  const qs = new URLSearchParams(params);
  const url = `${AMAP_BASE}${path}?${qs}`;

  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`高德地图 API 错误 ${response.status}: ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (data.status !== "1" && data.infocode !== "10000") {
    throw new Error(`高德地图 API 错误: ${data.info ?? "unknown error"} (code: ${data.infocode})`);
  }

  return data;
}
