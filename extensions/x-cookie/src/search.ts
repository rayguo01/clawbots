import type { CookieMap } from "./types.js";
import {
  FALLBACK_TWEET_FEATURE_SWITCHES,
  FALLBACK_TWEET_FIELD_TOGGLES,
  FALLBACK_SEARCH_QUERY_ID,
} from "./constants.js";
import { buildFeatureMap, buildFieldToggleMap, xGraphqlGet } from "./http.js";

function unwrapTweetResult(result: any): any {
  if (!result) return null;
  if (result.__typename === "TweetWithVisibilityResults" && result.tweet) return result.tweet;
  return result;
}

function formatTweet(tweet: any): Record<string, unknown> | null {
  if (!tweet) return null;
  const legacy = tweet.legacy ?? {};
  const user = tweet.core?.user_results?.result?.legacy ?? {};
  return {
    tweet_id: tweet.rest_id ?? legacy.id_str,
    author: user.name ? `${user.name} (@${user.screen_name})` : undefined,
    username: user.screen_name,
    text: legacy.full_text ?? "",
    created_at: legacy.created_at,
    reply_count: legacy.reply_count ?? 0,
    retweet_count: legacy.retweet_count ?? 0,
    like_count: legacy.favorite_count ?? 0,
    url: tweet.rest_id ? `https://x.com/i/status/${tweet.rest_id}` : undefined,
  };
}

export async function searchTweets(
  query: string,
  count: number,
  cookieMap: CookieMap,
): Promise<{ query: string; tweets: any[] }> {
  const features = buildFeatureMap("", FALLBACK_TWEET_FEATURE_SWITCHES);
  const fieldToggles = buildFieldToggleMap(FALLBACK_TWEET_FIELD_TOGGLES);

  const payload = await xGraphqlGet(
    FALLBACK_SEARCH_QUERY_ID,
    "SearchTimeline",
    {
      rawQuery: query,
      count,
      querySource: "typed_query",
      product: "Latest",
    },
    features,
    fieldToggles,
    cookieMap,
  );

  const instructions =
    (payload as any)?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ?? [];
  const tweets: any[] = [];

  for (const instruction of instructions) {
    for (const entry of instruction.entries ?? []) {
      const result = entry?.content?.itemContent?.tweet_results?.result;
      const tweet = unwrapTweetResult(result);
      if (tweet) {
        const formatted = formatTweet(tweet);
        if (formatted) tweets.push(formatted);
      }
    }
  }

  return { query, tweets };
}
