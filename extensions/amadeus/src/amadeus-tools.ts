import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { amadeusFetch } from "./amadeus-api.js";

// ── Schemas ─────────────────────────────────────────────────

const LocationSearchSchema = Type.Object({
  keyword: Type.String({ description: '搜索关键字（如 "London"、"Tokyo"、"PEK"、"上海"）。' }),
  subType: Type.Optional(
    Type.String({ description: '"CITY"、"AIRPORT" 或 "CITY,AIRPORT"（默认）。' }),
  ),
});

const FlightSearchSchema = Type.Object({
  origin: Type.String({
    description:
      '出发地 IATA 代码（如 "PEK"、"SHA"、"LAX"）。不确定代码时先用 amadeus_search_locations 查询。',
  }),
  destination: Type.String({ description: '目的地 IATA 代码（如 "NRT"、"LHR"、"CDG"）。' }),
  departureDate: Type.String({ description: "出发日期，格式 YYYY-MM-DD。" }),
  returnDate: Type.Optional(
    Type.String({ description: "返程日期，格式 YYYY-MM-DD。不填则搜索单程。" }),
  ),
  adults: Type.Optional(
    Type.Number({ description: "成人数量（默认 1）。", minimum: 1, maximum: 9 }),
  ),
  travelClass: Type.Optional(
    Type.String({ description: '"ECONOMY"（默认）、"PREMIUM_ECONOMY"、"BUSINESS"、"FIRST"。' }),
  ),
  maxResults: Type.Optional(
    Type.Number({ description: "最多返回结果数（默认 5，最大 10）。", minimum: 1, maximum: 10 }),
  ),
});

const HotelSearchSchema = Type.Object({
  cityCode: Type.String({
    description:
      '城市 IATA 代码（如 "PAR"、"TYO"、"LON"）。不确定代码时先用 amadeus_search_locations 查询。',
  }),
  checkInDate: Type.String({ description: "入住日期，格式 YYYY-MM-DD。" }),
  checkOutDate: Type.Optional(
    Type.String({ description: "退房日期，格式 YYYY-MM-DD。默认入住后 1 晚。" }),
  ),
  adults: Type.Optional(
    Type.Number({ description: "成人数量（默认 1）。", minimum: 1, maximum: 9 }),
  ),
  maxResults: Type.Optional(
    Type.Number({ description: "最多返回酒店数（默认 5，最大 10）。", minimum: 1, maximum: 10 }),
  ),
});

// ── Tools ───────────────────────────────────────────────────

export function createAmadeusTools(): AnyAgentTool[] {
  return [createLocationSearchTool(), createFlightSearchTool(), createHotelSearchTool()];
}

function createLocationSearchTool(): AnyAgentTool {
  return {
    label: "Amadeus：搜索机场/城市",
    name: "amadeus_search_locations",
    description:
      "通过关键字搜索机场或城市的 IATA 代码。在搜索航班或酒店前，先用此工具查找正确的城市/机场代码。",
    parameters: LocationSearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const data = await amadeusFetch("/v1/reference-data/locations", {
        keyword: String(params.keyword),
        subType: String(params.subType ?? "CITY,AIRPORT"),
        "page[limit]": "10",
      });
      const locations = (data.data as AmadeusLocation[]) ?? [];
      return jsonResult({
        locations: locations.map((loc) => ({
          type: loc.subType,
          code: loc.iataCode,
          name: loc.name,
          city: loc.address?.cityName,
          country: loc.address?.countryName,
        })),
        count: locations.length,
      });
    },
  };
}

function createFlightSearchTool(): AnyAgentTool {
  return {
    label: "Amadeus：搜索航班",
    name: "amadeus_search_flights",
    description:
      "搜索两个城市/机场之间的航班报价（价格、航空公司、中转、时长等）。需要 IATA 代码，不确定时先用 amadeus_search_locations 查询。注意：测试环境返回模拟数据，仅供参考。",
    parameters: FlightSearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const reqParams: Record<string, string> = {
        originLocationCode: String(params.origin).toUpperCase(),
        destinationLocationCode: String(params.destination).toUpperCase(),
        departureDate: String(params.departureDate),
        adults: String(params.adults ?? 1),
        max: String(params.maxResults ?? 5),
        currencyCode: "USD",
      };
      if (params.returnDate) reqParams.returnDate = String(params.returnDate);
      if (params.travelClass) reqParams.travelClass = String(params.travelClass);

      const data = await amadeusFetch("/v2/shopping/flight-offers", reqParams);
      const offers = (data.data as FlightOffer[]) ?? [];
      const dictionaries = data.dictionaries as
        | {
            carriers?: Record<string, string>;
          }
        | undefined;

      return jsonResult({
        flights: offers.map((offer) => formatFlightOffer(offer, dictionaries)),
        count: offers.length,
      });
    },
  };
}

function createHotelSearchTool(): AnyAgentTool {
  return {
    label: "Amadeus：搜索酒店",
    name: "amadeus_search_hotels",
    description:
      "搜索指定城市的酒店及价格。需要城市 IATA 代码，不确定时先用 amadeus_search_locations 查询。注意：测试环境返回模拟数据，仅供参考。",
    parameters: HotelSearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const cityCode = String(params.cityCode).toUpperCase();
      const maxResults = Number(params.maxResults ?? 5);

      // Step 1: Get hotel list by city
      const listData = await amadeusFetch("/v1/reference-data/locations/hotels/by-city", {
        cityCode,
        radius: "30",
        radiusUnit: "KM",
      });
      const hotelList = (listData.data as HotelListItem[]) ?? [];
      if (hotelList.length === 0) {
        return jsonResult({ error: "未找到该城市的酒店。", cityCode });
      }

      // Take first batch of hotel IDs (API limit ~50 per request)
      const hotelIds = hotelList
        .slice(0, Math.min(20, hotelList.length))
        .map((h) => h.hotelId)
        .join(",");

      // Step 2: Get hotel offers
      const offerParams: Record<string, string> = {
        hotelIds,
        adults: String(params.adults ?? 1),
        checkInDate: String(params.checkInDate),
        roomQuantity: "1",
        currency: "USD",
      };
      if (params.checkOutDate) offerParams.checkOutDate = String(params.checkOutDate);

      const offersData = await amadeusFetch("/v3/shopping/hotel-offers", offerParams);
      const hotels = (offersData.data as HotelOffer[]) ?? [];

      return jsonResult({
        hotels: hotels.slice(0, maxResults).map(formatHotelOffer),
        count: Math.min(hotels.length, maxResults),
        cityCode,
      });
    },
  };
}

// ── Types ───────────────────────────────────────────────────

type AmadeusLocation = {
  subType?: string;
  name?: string;
  iataCode?: string;
  address?: { cityName?: string; countryName?: string };
};

type FlightSegment = {
  departure?: { iataCode?: string; at?: string };
  arrival?: { iataCode?: string; at?: string };
  carrierCode?: string;
  number?: string;
  duration?: string;
  numberOfStops?: number;
};

type FlightItinerary = {
  duration?: string;
  segments?: FlightSegment[];
};

type FlightOffer = {
  id?: string;
  source?: string;
  itineraries?: FlightItinerary[];
  price?: { total?: string; currency?: string; grandTotal?: string };
  travelerPricings?: { fareDetailsBySegment?: { cabin?: string }[] }[];
  numberOfBookableSeats?: number;
};

type HotelListItem = {
  hotelId: string;
  name?: string;
};

type HotelOffer = {
  hotel?: {
    hotelId?: string;
    name?: string;
    rating?: string;
    cityCode?: string;
    latitude?: number;
    longitude?: number;
  };
  offers?: {
    id?: string;
    checkInDate?: string;
    checkOutDate?: string;
    room?: { description?: { text?: string } };
    price?: { total?: string; currency?: string };
    policies?: { cancellation?: { description?: { text?: string } } };
  }[];
};

// ── Formatters ──────────────────────────────────────────────

function formatFlightOffer(
  offer: FlightOffer,
  dictionaries?: { carriers?: Record<string, string> },
) {
  const itineraries = (offer.itineraries ?? []).map((it) => {
    const segments = (it.segments ?? []).map((seg) => ({
      from: seg.departure?.iataCode,
      to: seg.arrival?.iataCode,
      departAt: seg.departure?.at,
      arriveAt: seg.arrival?.at,
      airline: dictionaries?.carriers?.[seg.carrierCode ?? ""] ?? seg.carrierCode,
      flightNo: seg.carrierCode && seg.number ? `${seg.carrierCode}${seg.number}` : undefined,
      duration: seg.duration,
    }));
    return {
      totalDuration: it.duration,
      stops: segments.length - 1,
      segments,
    };
  });

  const cabin = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin;

  return {
    price: offer.price?.grandTotal ?? offer.price?.total,
    currency: offer.price?.currency,
    cabin,
    seatsLeft: offer.numberOfBookableSeats,
    itineraries,
  };
}

function formatHotelOffer(hotel: HotelOffer) {
  const cheapest = hotel.offers?.[0];
  return {
    name: hotel.hotel?.name,
    hotelId: hotel.hotel?.hotelId,
    rating: hotel.hotel?.rating ? `${hotel.hotel.rating} star` : undefined,
    checkIn: cheapest?.checkInDate,
    checkOut: cheapest?.checkOutDate,
    room: cheapest?.room?.description?.text,
    price: cheapest?.price?.total,
    currency: cheapest?.price?.currency,
    cancellation: cheapest?.policies?.cancellation?.description?.text,
  };
}
