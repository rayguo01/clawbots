import type { CookieMap } from "./types.js";
import {
  FALLBACK_TWEET_DETAIL_FEATURE_DEFAULTS,
  FALLBACK_TWEET_DETAIL_FEATURE_SWITCHES,
  FALLBACK_TWEET_DETAIL_FIELD_TOGGLES,
  FALLBACK_TWEET_DETAIL_QUERY_ID,
  FALLBACK_HOME_TIMELINE_QUERY_ID,
  FALLBACK_USER_TWEETS_QUERY_ID,
  FALLBACK_TWEET_FEATURE_SWITCHES,
  FALLBACK_TWEET_FIELD_TOGGLES,
} from "./constants.js";
import {
  buildFeatureMap,
  buildFieldToggleMap,
  resolveTweetQueryInfo,
  resolveTweetDetailQueryInfo,
  xGraphqlGet,
} from "./http.js";

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
    quote_count: legacy.quote_count ?? 0,
    bookmark_count: legacy.bookmark_count ?? 0,
    url: tweet.rest_id ? `https://x.com/i/status/${tweet.rest_id}` : undefined,
  };
}

function extractTweetsFromTimeline(payload: any): any[] {
  const instructions =
    payload?.data?.home?.home_timeline_urt?.instructions ??
    payload?.data?.user?.result?.timeline_v2?.timeline?.instructions ??
    payload?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ??
    [];

  const tweets: any[] = [];
  for (const instruction of instructions) {
    const entries = instruction.entries ?? [];
    for (const entry of entries) {
      const result =
        entry?.content?.itemContent?.tweet_results?.result ??
        entry?.content?.items?.[0]?.item?.itemContent?.tweet_results?.result;
      const tweet = unwrapTweetResult(result);
      if (tweet) {
        const formatted = formatTweet(tweet);
        if (formatted) tweets.push(formatted);
      }
    }
  }
  return tweets;
}

export async function getTweet(
  tweetId: string,
  cookieMap: CookieMap,
): Promise<Record<string, unknown>> {
  const queryInfo = await resolveTweetDetailQueryInfo();
  const features = buildFeatureMap(
    queryInfo.html,
    queryInfo.featureSwitches,
    FALLBACK_TWEET_DETAIL_FEATURE_DEFAULTS,
  );
  const fieldToggles = buildFieldToggleMap(queryInfo.fieldToggles);

  const payload = await xGraphqlGet(
    queryInfo.queryId,
    "TweetDetail",
    {
      focalTweetId: tweetId,
      with_rux_injections: false,
      includePromotedContent: false,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
      withV2Timeline: true,
    },
    features,
    fieldToggles,
    cookieMap,
  );

  // Extract the focal tweet and replies
  const instructions =
    (payload as any)?.data?.threaded_conversation_with_injections_v2?.instructions ?? [];
  let focalTweet: any = null;
  const replies: any[] = [];

  for (const instruction of instructions) {
    for (const entry of instruction.entries ?? []) {
      const result = entry?.content?.itemContent?.tweet_results?.result;
      const tweet = unwrapTweetResult(result);
      if (!tweet) continue;

      const formatted = formatTweet(tweet);
      if (!formatted) continue;

      if (formatted.tweet_id === tweetId) {
        focalTweet = formatted;
      } else {
        // Check sub-entries for replies
        const items = entry?.content?.items ?? [];
        for (const item of items) {
          const subResult = item?.item?.itemContent?.tweet_results?.result;
          const subTweet = unwrapTweetResult(subResult);
          if (subTweet) {
            const subFormatted = formatTweet(subTweet);
            if (subFormatted) replies.push(subFormatted);
          }
        }
        if (!items.length) replies.push(formatted);
      }
    }
  }

  if (!focalTweet) {
    // Fallback: try single tweet fetch
    const tweetQueryInfo = await resolveTweetQueryInfo();
    const tweetFeatures = buildFeatureMap(tweetQueryInfo.html, tweetQueryInfo.featureSwitches);
    const tweetToggles = buildFieldToggleMap(tweetQueryInfo.fieldToggles);
    const tweetPayload = await xGraphqlGet(
      tweetQueryInfo.queryId,
      "TweetResultByRestId",
      { tweetId, withCommunity: false, includePromotedContent: false, withVoice: true },
      tweetFeatures,
      tweetToggles,
      cookieMap,
    );
    const result = (tweetPayload as any)?.data?.tweetResult?.result;
    focalTweet = formatTweet(unwrapTweetResult(result));
  }

  return { ...focalTweet, replies };
}

export async function getUserTweets(
  username: string,
  count: number,
  cookieMap: CookieMap,
): Promise<{ user: string; tweets: any[] }> {
  // First resolve user ID from screen_name
  const userId = await resolveUserId(username, cookieMap);

  const features = buildFeatureMap("", FALLBACK_TWEET_FEATURE_SWITCHES);
  const fieldToggles = buildFieldToggleMap(FALLBACK_TWEET_FIELD_TOGGLES);

  const payload = await xGraphqlGet(
    FALLBACK_USER_TWEETS_QUERY_ID,
    "UserTweets",
    {
      userId,
      count,
      includePromotedContent: false,
      withQuickPromoteEligibilityTweetFields: true,
      withVoice: true,
      withV2Timeline: true,
    },
    features,
    fieldToggles,
    cookieMap,
  );

  return { user: username, tweets: extractTweetsFromTimeline(payload) };
}

export async function getTimeline(count: number, cookieMap: CookieMap): Promise<{ tweets: any[] }> {
  const features = buildFeatureMap("", FALLBACK_TWEET_FEATURE_SWITCHES);
  const fieldToggles = buildFieldToggleMap(FALLBACK_TWEET_FIELD_TOGGLES);

  const payload = await xGraphqlGet(
    FALLBACK_HOME_TIMELINE_QUERY_ID,
    "HomeTimeline",
    {
      count,
      includePromotedContent: false,
      latestControlAvailable: true,
      requestContext: "launch",
      withCommunity: true,
    },
    features,
    fieldToggles,
    cookieMap,
  );

  return { tweets: extractTweetsFromTimeline(payload) };
}

async function resolveUserId(username: string, cookieMap: CookieMap): Promise<string> {
  const url = `https://x.com/i/api/graphql/xmU6X_CKVnQ5lSrCbAmJsg/UserByScreenName`;
  const params = new URLSearchParams({
    variables: JSON.stringify({ screen_name: username, withSafetyModeUserFields: true }),
    features: JSON.stringify({
      hidden_profile_subscriptions_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      highlights_tweets_tab_ui_enabled: true,
      responsive_web_twitter_article_notes_tab_enabled: true,
      subscriptions_feature_can_gift_premium: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
    }),
    fieldToggles: JSON.stringify({ withAuxiliaryUserLabels: false }),
  });

  const { buildRequestHeaders } = await import("./http.js");
  const response = await fetch(`${url}?${params.toString()}`, {
    headers: buildRequestHeaders(cookieMap),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Failed to resolve user @${username}: ${text.slice(0, 200)}`);

  const data = JSON.parse(text) as any;
  const userId = data?.data?.user?.result?.rest_id;
  if (!userId) throw new Error(`User @${username} not found`);
  return userId;
}
