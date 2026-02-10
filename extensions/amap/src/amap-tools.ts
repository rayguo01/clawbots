import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { amapFetch } from "./amap-api.js";

// ── Schemas ─────────────────────────────────────────────────

const TextSearchSchema = Type.Object({
  keywords: Type.String({
    description: '搜索关键字（如"咖啡店"、"火锅"、"医院"）。多个关键字用"|"分隔。',
  }),
  region: Type.Optional(
    Type.String({ description: '搜索城市或区域（如"上海"、"北京"、"深圳南山区"）。' }),
  ),
  cityLimit: Type.Optional(Type.Boolean({ description: "是否限制在指定城市内搜索。默认 false。" })),
  types: Type.Optional(
    Type.String({ description: 'POI 类型代码（如"050000"餐饮）。多个用"|"分隔。' }),
  ),
  pageSize: Type.Optional(
    Type.Number({ description: "每页结果数（1-25）。默认 10。", minimum: 1, maximum: 25 }),
  ),
  page: Type.Optional(
    Type.Number({ description: "页码（1-100）。默认 1。", minimum: 1, maximum: 100 }),
  ),
});

const NearbySearchSchema = Type.Object({
  longitude: Type.Number({ description: "中心点经度。" }),
  latitude: Type.Number({ description: "中心点纬度。" }),
  keywords: Type.Optional(Type.String({ description: '搜索关键字（如"奶茶"）。' })),
  types: Type.Optional(Type.String({ description: 'POI 类型代码。多个用"|"分隔。' })),
  radius: Type.Optional(
    Type.Number({
      description: "搜索半径（米），0-50000。默认 3000。",
      minimum: 0,
      maximum: 50000,
    }),
  ),
  pageSize: Type.Optional(
    Type.Number({ description: "每页结果数（1-25）。默认 10。", minimum: 1, maximum: 25 }),
  ),
  page: Type.Optional(Type.Number({ description: "页码。默认 1。", minimum: 1, maximum: 100 })),
});

const PlaceDetailSchema = Type.Object({
  placeId: Type.String({ description: "高德 POI ID。" }),
});

// ── Tools ───────────────────────────────────────────────────

export function createAmapTools(): AnyAgentTool[] {
  return [createTextSearchTool(), createNearbySearchTool(), createPlaceDetailTool()];
}

function createTextSearchTool(): AnyAgentTool {
  return {
    label: "高德地图：关键字搜索",
    name: "amap_search",
    description:
      "通过关键字搜索中国大陆的地点（餐厅、商店、景点等）。适合用户说'找一家上海的火锅店'这类请求。仅用于中国大陆地点搜索；其他地区请用 google_places 工具。",
    parameters: TextSearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const reqParams: Record<string, string> = {
        keywords: String(params.keywords),
        page_size: String(params.pageSize ?? 10),
        page_num: String(params.page ?? 1),
      };
      if (params.region) reqParams.region = String(params.region);
      if (params.cityLimit) reqParams.city_limit = "true";
      if (params.types) reqParams.types = String(params.types);

      const data = await amapFetch("/place/text", reqParams);
      const pois = (data.pois as AmapPoi[]) ?? [];
      return jsonResult({
        places: pois.map(formatPoi),
        count: pois.length,
        total: data.count,
      });
    },
  };
}

function createNearbySearchTool(): AnyAgentTool {
  return {
    label: "高德地图：周边搜索",
    name: "amap_nearby",
    description:
      "搜索中国大陆指定经纬度坐标附近的地点。适合用户说'我附近有什么好吃的'这类请求（需要先知道用户位置）。仅用于中国大陆；其他地区请用 google_places 工具。",
    parameters: NearbySearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const reqParams: Record<string, string> = {
        location: `${params.longitude},${params.latitude}`,
        radius: String(params.radius ?? 3000),
        page_size: String(params.pageSize ?? 10),
        page_num: String(params.page ?? 1),
      };
      if (params.keywords) reqParams.keywords = String(params.keywords);
      if (params.types) reqParams.types = String(params.types);

      const data = await amapFetch("/place/around", reqParams);
      const pois = (data.pois as AmapPoi[]) ?? [];
      return jsonResult({
        places: pois.map(formatPoi),
        count: pois.length,
        total: data.count,
      });
    },
  };
}

function createPlaceDetailTool(): AnyAgentTool {
  return {
    label: "高德地图：地点详情",
    name: "amap_detail",
    description: "通过高德 POI ID 获取地点的详细信息。",
    parameters: PlaceDetailSchema,
    execute: async (_toolCallId, args) => {
      const { placeId } = args as { placeId: string };
      const data = await amapFetch("/place/detail", {
        id: placeId,
      });
      const pois = (data.pois as AmapPoi[]) ?? [];
      if (pois.length === 0) {
        return jsonResult({ error: "地点未找到。" });
      }
      return jsonResult({ place: formatPoi(pois[0]) });
    },
  };
}

// ── Types ───────────────────────────────────────────────────

type AmapPoi = {
  id?: string;
  name?: string;
  address?: string;
  location?: string; // "lng,lat"
  type?: string;
  typecode?: string;
  tel?: string;
  rating?: string;
  business_area?: string;
  cityname?: string;
  adname?: string;
  business?: { tel?: string; rating?: string; business_area?: string };
};

function formatPoi(poi: AmapPoi) {
  const loc = poi.location?.split(",");
  return {
    id: poi.id,
    name: poi.name,
    address: poi.address,
    location: loc ? { longitude: parseFloat(loc[0]), latitude: parseFloat(loc[1]) } : null,
    type: poi.type,
    phone: poi.business?.tel || poi.tel,
    rating: poi.business?.rating || poi.rating,
    businessArea: poi.business?.business_area || poi.business_area,
    city: poi.cityname,
    district: poi.adname,
  };
}
