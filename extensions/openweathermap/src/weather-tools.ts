import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { owmFetch, geocodeCity } from "./weather-api.js";

// ── Schemas ─────────────────────────────────────────────────

const CurrentWeatherSchema = Type.Object({
  city: Type.Optional(
    Type.String({
      description: '城市名称（如 "Shanghai"、"London"、"Tokyo"）。city 和 lat/lon 二选一。',
    }),
  ),
  latitude: Type.Optional(Type.Number({ description: "纬度。与 longitude 一起使用。" })),
  longitude: Type.Optional(Type.Number({ description: "经度。与 latitude 一起使用。" })),
  units: Type.Optional(
    Type.String({
      description: '"metric"（摄氏度，默认）、"imperial"（华氏度）、"standard"（开尔文）。',
    }),
  ),
  lang: Type.Optional(
    Type.String({ description: '天气描述语言（如 "zh_cn"、"en"）。默认 "zh_cn"。' }),
  ),
});

const ForecastSchema = Type.Object({
  city: Type.Optional(Type.String({ description: "城市名称。city 和 lat/lon 二选一。" })),
  latitude: Type.Optional(Type.Number({ description: "纬度。" })),
  longitude: Type.Optional(Type.Number({ description: "经度。" })),
  units: Type.Optional(Type.String({ description: '"metric"（默认）、"imperial"、"standard"。' })),
  lang: Type.Optional(Type.String({ description: '天气描述语言。默认 "zh_cn"。' })),
});

const AirQualitySchema = Type.Object({
  city: Type.Optional(Type.String({ description: "城市名称。city 和 lat/lon 二选一。" })),
  latitude: Type.Optional(Type.Number({ description: "纬度。" })),
  longitude: Type.Optional(Type.Number({ description: "经度。" })),
});

// ── Tools ───────────────────────────────────────────────────

export function createWeatherTools(): AnyAgentTool[] {
  return [createCurrentWeatherTool(), createForecastTool(), createAirQualityTool()];
}

async function resolveCoords(
  params: Record<string, unknown>,
): Promise<{ lat: string; lon: string; resolvedCity?: string }> {
  if (params.latitude != null && params.longitude != null) {
    return { lat: String(params.latitude), lon: String(params.longitude) };
  }
  if (params.city) {
    const geo = await geocodeCity(String(params.city));
    if (!geo) throw new Error(`无法找到城市: ${params.city}`);
    return {
      lat: String(geo.lat),
      lon: String(geo.lon),
      resolvedCity: `${geo.name}, ${geo.country}`,
    };
  }
  throw new Error("请提供城市名称或经纬度坐标。");
}

function createCurrentWeatherTool(): AnyAgentTool {
  return {
    label: "天气：当前天气",
    name: "weather_current",
    description: "获取指定城市或坐标的当前天气信息（温度、体感温度、湿度、风速、天气状况等）。",
    parameters: CurrentWeatherSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const reqParams: Record<string, string> = {
        units: String(params.units ?? "metric"),
        lang: String(params.lang ?? "zh_cn"),
      };

      // Current weather API supports q= for city name directly
      if (params.city && params.latitude == null) {
        reqParams.q = String(params.city);
      } else {
        const coords = await resolveCoords(params);
        reqParams.lat = coords.lat;
        reqParams.lon = coords.lon;
      }

      const data = await owmFetch("/data/2.5/weather", reqParams);
      return jsonResult(formatCurrentWeather(data));
    },
  };
}

function createForecastTool(): AnyAgentTool {
  return {
    label: "天气：5天预报",
    name: "weather_forecast",
    description:
      "获取指定城市或坐标未来 5 天的天气预报（每 3 小时一个数据点）。适合回答'明天天气如何'、'这周末会下雨吗'等问题。",
    parameters: ForecastSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const reqParams: Record<string, string> = {
        units: String(params.units ?? "metric"),
        lang: String(params.lang ?? "zh_cn"),
      };

      if (params.city && params.latitude == null) {
        reqParams.q = String(params.city);
      } else {
        const coords = await resolveCoords(params);
        reqParams.lat = coords.lat;
        reqParams.lon = coords.lon;
      }

      const data = await owmFetch("/data/2.5/forecast", reqParams);
      const list = (data.list as ForecastItem[]) ?? [];
      const city = data.city as { name?: string; country?: string } | undefined;

      // Group by date for a cleaner summary
      const dailyMap = new Map<string, ForecastItem[]>();
      for (const item of list) {
        const date = item.dt_txt?.split(" ")[0] ?? "unknown";
        if (!dailyMap.has(date)) dailyMap.set(date, []);
        dailyMap.get(date)!.push(item);
      }

      const daily = Array.from(dailyMap.entries()).map(([date, items]) => {
        const temps = items.map((i) => i.main?.temp ?? 0);
        const conditions = items.map((i) => i.weather?.[0]?.description ?? "");
        return {
          date,
          tempMin: Math.min(...temps),
          tempMax: Math.max(...temps),
          conditions: [...new Set(conditions.filter(Boolean))],
          details: items.map(formatForecastItem),
        };
      });

      return jsonResult({
        city: city?.name,
        country: city?.country,
        days: daily,
      });
    },
  };
}

function createAirQualityTool(): AnyAgentTool {
  return {
    label: "天气：空气质量",
    name: "weather_air_quality",
    description: "获取指定城市或坐标的空气质量指数（AQI）和污染物浓度（PM2.5、PM10、O3 等）。",
    parameters: AirQualitySchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const coords = await resolveCoords(params);

      const data = await owmFetch("/data/2.5/air_pollution", {
        lat: coords.lat,
        lon: coords.lon,
      });

      const list = (data.list as AirPollutionItem[]) ?? [];
      if (list.length === 0) {
        return jsonResult({ error: "无法获取空气质量数据。" });
      }

      const item = list[0];
      const aqi = item.main?.aqi;
      const aqiLabel = AQI_LABELS[aqi ?? 0] ?? "未知";

      return jsonResult({
        city: coords.resolvedCity,
        aqi,
        aqiLabel,
        components: item.components,
      });
    },
  };
}

// ── Types & Helpers ─────────────────────────────────────────

const AQI_LABELS: Record<number, string> = {
  1: "优 (Good)",
  2: "良 (Fair)",
  3: "轻度污染 (Moderate)",
  4: "中度污染 (Poor)",
  5: "重度污染 (Very Poor)",
};

type WeatherDesc = { id?: number; main?: string; description?: string; icon?: string };

type CurrentWeatherData = Record<string, unknown> & {
  name?: string;
  main?: {
    temp?: number;
    feels_like?: number;
    humidity?: number;
    pressure?: number;
    temp_min?: number;
    temp_max?: number;
  };
  weather?: WeatherDesc[];
  wind?: { speed?: number; deg?: number; gust?: number };
  clouds?: { all?: number };
  visibility?: number;
  sys?: { country?: string; sunrise?: number; sunset?: number };
};

type ForecastItem = {
  dt?: number;
  dt_txt?: string;
  main?: {
    temp?: number;
    feels_like?: number;
    humidity?: number;
    pressure?: number;
    temp_min?: number;
    temp_max?: number;
  };
  weather?: WeatherDesc[];
  wind?: { speed?: number; deg?: number; gust?: number };
  pop?: number;
};

type AirPollutionItem = {
  main?: { aqi?: number };
  components?: {
    co?: number;
    no?: number;
    no2?: number;
    o3?: number;
    so2?: number;
    pm2_5?: number;
    pm10?: number;
    nh3?: number;
  };
};

function formatCurrentWeather(data: CurrentWeatherData) {
  const w = data.weather?.[0];
  return {
    city: data.name,
    country: data.sys?.country,
    condition: w?.description,
    temperature: data.main?.temp,
    feelsLike: data.main?.feels_like,
    tempMin: data.main?.temp_min,
    tempMax: data.main?.temp_max,
    humidity: data.main?.humidity,
    pressure: data.main?.pressure,
    windSpeed: data.wind?.speed,
    windDeg: data.wind?.deg,
    windGust: data.wind?.gust,
    clouds: data.clouds?.all,
    visibility: data.visibility,
    sunrise: data.sys?.sunrise ? new Date(data.sys.sunrise * 1000).toISOString() : undefined,
    sunset: data.sys?.sunset ? new Date(data.sys.sunset * 1000).toISOString() : undefined,
  };
}

function formatForecastItem(item: ForecastItem) {
  return {
    time: item.dt_txt,
    condition: item.weather?.[0]?.description,
    temp: item.main?.temp,
    feelsLike: item.main?.feels_like,
    humidity: item.main?.humidity,
    windSpeed: item.wind?.speed,
    rainChance: item.pop != null ? Math.round(item.pop * 100) : undefined,
  };
}
