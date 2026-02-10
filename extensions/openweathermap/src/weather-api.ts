const OWM_BASE = "https://api.openweathermap.org";

function getApiKey(): string {
  const key =
    process.env.NANOBOTS_OPENWEATHERMAP_API_KEY?.trim() ||
    process.env.OPENWEATHERMAP_API_KEY?.trim() ||
    "";
  if (!key) {
    throw new Error(
      "OpenWeatherMap API Key 未配置。请设置 NANOBOTS_OPENWEATHERMAP_API_KEY 环境变量。",
    );
  }
  return key;
}

/**
 * Make a request to the OpenWeatherMap API.
 * All requests are GET with query parameters.
 */
export async function owmFetch(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  params.appid = getApiKey();

  const qs = new URLSearchParams(params);
  const url = `${OWM_BASE}${path}?${qs}`;

  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenWeatherMap API 错误 ${response.status}: ${text}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

/**
 * Geocode a city name to coordinates using OpenWeatherMap Geocoding API.
 */
export async function geocodeCity(
  city: string,
): Promise<{ lat: number; lon: number; name: string; country: string } | null> {
  const data = await owmFetch("/geo/1.0/direct", { q: city, limit: "1" });
  const results = data as unknown as Array<{
    lat: number;
    lon: number;
    name: string;
    country: string;
  }>;
  if (!Array.isArray(results) || results.length === 0) return null;
  return results[0];
}
