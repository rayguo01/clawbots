import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { placesFetch, DETAIL_FIELD_MASK } from "./places-api.js";

// ── Schemas ─────────────────────────────────────────────────

const TextSearchSchema = Type.Object({
  query: Type.String({ description: 'Search query (e.g. "coffee shop near Orchard Road").' }),
  latitude: Type.Optional(Type.Number({ description: "Bias search around this latitude." })),
  longitude: Type.Optional(Type.Number({ description: "Bias search around this longitude." })),
  radius: Type.Optional(Type.Number({ description: "Search radius in meters (default: 5000)." })),
  openNow: Type.Optional(
    Type.Boolean({ description: "Only return places that are currently open." }),
  ),
  minRating: Type.Optional(
    Type.Number({ description: "Minimum rating (0.0-5.0).", minimum: 0, maximum: 5 }),
  ),
  maxResults: Type.Optional(
    Type.Number({ description: "Max results (1-20). Default: 10.", minimum: 1, maximum: 20 }),
  ),
  language: Type.Optional(
    Type.String({ description: 'Language code (e.g. "zh-CN", "en"). Default: "en".' }),
  ),
});

const NearbySearchSchema = Type.Object({
  latitude: Type.Number({ description: "Center latitude." }),
  longitude: Type.Number({ description: "Center longitude." }),
  radius: Type.Optional(
    Type.Number({
      description: "Search radius in meters (1-50000). Default: 1000.",
      minimum: 1,
      maximum: 50000,
    }),
  ),
  type: Type.Optional(
    Type.String({ description: 'Place type filter (e.g. "restaurant", "cafe", "hospital").' }),
  ),
  maxResults: Type.Optional(
    Type.Number({ description: "Max results (1-20). Default: 10.", minimum: 1, maximum: 20 }),
  ),
  rankBy: Type.Optional(Type.String({ description: '"POPULARITY" (default) or "DISTANCE".' })),
  language: Type.Optional(Type.String({ description: 'Language code. Default: "en".' })),
});

const PlaceDetailsSchema = Type.Object({
  placeId: Type.String({ description: "Google Place ID." }),
  language: Type.Optional(Type.String({ description: 'Language code. Default: "en".' })),
});

// ── Tools ───────────────────────────────────────────────────

export function createGooglePlacesTools(): AnyAgentTool[] {
  return [createTextSearchTool(), createNearbySearchTool(), createPlaceDetailsTool()];
}

function createTextSearchTool(): AnyAgentTool {
  return {
    label: "Google Places: Text Search",
    name: "google_places_search",
    description:
      'Search for places using natural language queries (e.g. "best ramen in Shibuya", "pharmacies near me"). Use for locations outside mainland China; for Chinese mainland locations use amap tools instead.',
    parameters: TextSearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const body: Record<string, unknown> = {
        textQuery: params.query,
        pageSize: params.maxResults ?? 10,
      };

      if (params.latitude != null && params.longitude != null) {
        body.locationBias = {
          circle: {
            center: { latitude: params.latitude, longitude: params.longitude },
            radius: Number(params.radius ?? 5000),
          },
        };
      }

      if (params.openNow) body.openNow = true;
      if (params.minRating) body.minRating = params.minRating;
      if (params.language) body.languageCode = params.language;

      const res = await placesFetch("/places:searchText", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { places?: PlaceResult[] };
      const places = (data.places ?? []).map(formatPlace);
      return jsonResult({ places, count: places.length });
    },
  };
}

function createNearbySearchTool(): AnyAgentTool {
  return {
    label: "Google Places: Nearby Search",
    name: "google_places_nearby",
    description:
      "Search for places near a specific location by type (restaurant, cafe, hospital, etc.). Use for locations outside mainland China; for Chinese mainland locations use amap tools instead.",
    parameters: NearbySearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const body: Record<string, unknown> = {
        locationRestriction: {
          circle: {
            center: { latitude: params.latitude, longitude: params.longitude },
            radius: Number(params.radius ?? 1000),
          },
        },
        maxResultCount: params.maxResults ?? 10,
      };

      if (params.type) body.includedTypes = [params.type];
      if (params.rankBy) body.rankPreference = params.rankBy;
      if (params.language) body.languageCode = params.language;

      const res = await placesFetch("/places:searchNearby", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { places?: PlaceResult[] };
      const places = (data.places ?? []).map(formatPlace);
      return jsonResult({ places, count: places.length });
    },
  };
}

function createPlaceDetailsTool(): AnyAgentTool {
  return {
    label: "Google Places: Place Details",
    name: "google_places_details",
    description:
      "Get detailed information about a specific place including reviews and opening hours.",
    parameters: PlaceDetailsSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const placeId = encodeURIComponent(String(params.placeId));
      const qs = params.language
        ? `?languageCode=${encodeURIComponent(String(params.language))}`
        : "";

      const res = await placesFetch(`/places/${placeId}${qs}`, {
        method: "GET",
        fieldMask: DETAIL_FIELD_MASK,
      });
      const place = (await res.json()) as PlaceResult;
      return jsonResult({ place: formatPlaceDetail(place) });
    },
  };
}

// ── Types ───────────────────────────────────────────────────

type PlaceResult = {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  priceLevel?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  editorialSummary?: { text?: string };
  reviews?: {
    text?: { text?: string };
    rating?: number;
    authorAttribution?: { displayName?: string };
  }[];
  googleMapsUri?: string;
};

function formatPlace(p: PlaceResult) {
  return {
    id: p.id,
    name: p.displayName?.text,
    address: p.formattedAddress,
    location: p.location,
    rating: p.rating,
    ratingCount: p.userRatingCount,
    types: p.types,
    priceLevel: p.priceLevel,
    website: p.websiteUri,
    phone: p.nationalPhoneNumber,
    openNow: p.currentOpeningHours?.openNow,
  };
}

function formatPlaceDetail(p: PlaceResult) {
  return {
    ...formatPlace(p),
    openingHours: p.currentOpeningHours?.weekdayDescriptions,
    summary: p.editorialSummary?.text,
    googleMapsUrl: p.googleMapsUri,
    reviews: p.reviews?.slice(0, 5).map((r) => ({
      author: r.authorAttribution?.displayName,
      rating: r.rating,
      text: r.text?.text,
    })),
  };
}
