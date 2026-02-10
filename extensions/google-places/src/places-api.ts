const PLACES_BASE = "https://places.googleapis.com/v1";

const DEFAULT_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.priceLevel",
  "places.websiteUri",
  "places.currentOpeningHours",
  "places.nationalPhoneNumber",
].join(",");

const DETAIL_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "types",
  "priceLevel",
  "websiteUri",
  "currentOpeningHours",
  "nationalPhoneNumber",
  "editorialSummary",
  "reviews",
  "googleMapsUri",
].join(",");

function getApiKey(): string {
  const key =
    process.env.NANOBOTS_GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    "";
  if (!key) {
    throw new Error(
      "Google Places API key not configured. Set NANOBOTS_GOOGLE_PLACES_API_KEY environment variable.",
    );
  }
  return key;
}

/**
 * Make a request to the Google Places API (New).
 */
export async function placesFetch(
  path: string,
  options?: RequestInit & { fieldMask?: string },
): Promise<Response> {
  const apiKey = getApiKey();
  const url = path.startsWith("https://") ? path : `${PLACES_BASE}${path}`;

  const headers = new Headers(options?.headers);
  headers.set("X-Goog-Api-Key", apiKey);
  headers.set("X-Goog-FieldMask", options?.fieldMask ?? DEFAULT_FIELD_MASK);
  if (!headers.has("Content-Type") && options?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Places API error ${response.status}: ${text}`);
  }

  return response;
}

export { DETAIL_FIELD_MASK };
