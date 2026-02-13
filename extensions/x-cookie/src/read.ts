import type { CookieMap } from "./types.js";
import {
  FALLBACK_TWEET_DETAIL_FEATURE_DEFAULTS,
  FALLBACK_TWEET_DETAIL_FEATURE_SWITCHES,
  FALLBACK_TWEET_DETAIL_FIELD_TOGGLES,
  FALLBACK_HOME_TIMELINE_QUERY_ID,
  FALLBACK_USER_TWEETS_QUERY_ID,
  FALLBACK_USER_BY_SCREEN_NAME_QUERY_ID,
  FALLBACK_TWEET_FEATURE_SWITCHES,
  FALLBACK_TWEET_FIELD_TOGGLES,
} from "./constants.js";
import {
  buildFeatureMap,
  buildFieldToggleMap,
  buildRequestHeaders,
  resolveArticleQueryInfo,
  resolveQueryId,
  resolveQueryInfo,
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

  const result: Record<string, unknown> = {
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

  // Extract embedded article content if present
  const articleResult =
    tweet.article?.article_results?.result ??
    legacy.article?.article_results?.result ??
    tweet.article_results?.result;
  if (articleResult) {
    const article: Record<string, unknown> = {
      article_id: articleResult.rest_id,
      title: articleResult.title,
      url: articleResult.rest_id ? `https://x.com/i/article/${articleResult.rest_id}` : undefined,
    };
    // Include full text content
    if (articleResult.plain_text) {
      article.plain_text = articleResult.plain_text;
    }
    if (articleResult.content_state?.blocks) {
      article.content_text = articleResult.content_state.blocks
        .map((block: any) => {
          const text = block?.text ?? "";
          switch (block?.type) {
            case "header-one":
              return `# ${text}`;
            case "header-two":
              return `## ${text}`;
            case "header-three":
              return `### ${text}`;
            case "blockquote":
              return `> ${text}`;
            case "unordered-list-item":
              return `- ${text}`;
            case "ordered-list-item":
              return `1. ${text}`;
            default:
              return text;
          }
        })
        .join("\n\n");
    }
    if (articleResult.preview_text) {
      article.preview_text = articleResult.preview_text;
    }
    if (articleResult.cover_media?.media_info?.original_img_url) {
      article.cover_image = articleResult.cover_media.media_info.original_img_url;
    }
    result.article = article;
  }

  return result;
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

// --- X Article support ---

function extractArticleEntityFromTweet(tweet: any): any {
  return (
    tweet?.article?.article_results?.result ??
    tweet?.article?.result ??
    tweet?.legacy?.article?.article_results?.result ??
    tweet?.legacy?.article?.result ??
    tweet?.article_results?.result ??
    null
  );
}

function extractArticleIdFromUrls(urls: any[] | undefined): string | null {
  if (!Array.isArray(urls)) return null;
  for (const url of urls) {
    const candidate = url?.expanded_url ?? url?.url;
    if (!candidate) continue;
    try {
      const match = new URL(candidate).pathname.match(/\/(?:i\/)?article\/(\d+)/);
      if (match?.[1]) return match[1];
    } catch {
      continue;
    }
  }
  return null;
}

function extractArticleIdFromTweet(tweet: any): string | null {
  const embedded = extractArticleEntityFromTweet(tweet);
  if (embedded?.rest_id) return embedded.rest_id;
  const noteUrls = tweet?.note_tweet?.note_tweet_results?.result?.entity_set?.urls;
  const legacyUrls = tweet?.legacy?.entities?.urls;
  return extractArticleIdFromUrls(noteUrls) ?? extractArticleIdFromUrls(legacyUrls);
}

function articleContentToText(article: any): string {
  if (!article) return "";

  // Try plain_text first
  if (typeof article.plain_text === "string" && article.plain_text.trim()) {
    return article.plain_text;
  }

  // Convert content_state blocks to text
  const blocks = article.content_state?.blocks;
  if (Array.isArray(blocks) && blocks.length > 0) {
    return blocks
      .map((block: any) => {
        const text = block?.text ?? "";
        switch (block?.type) {
          case "header-one":
            return `# ${text}`;
          case "header-two":
            return `## ${text}`;
          case "header-three":
            return `### ${text}`;
          case "blockquote":
            return `> ${text}`;
          case "unordered-list-item":
            return `- ${text}`;
          case "ordered-list-item":
            return `1. ${text}`;
          default:
            return text;
        }
      })
      .join("\n\n");
  }

  // Fallback to preview_text
  if (typeof article.preview_text === "string" && article.preview_text.trim()) {
    return article.preview_text;
  }

  return "";
}

async function fetchArticleEntityById(articleId: string, cookieMap: CookieMap): Promise<any> {
  const queryInfo = await resolveArticleQueryInfo();
  const features = buildFeatureMap(queryInfo.html, queryInfo.featureSwitches);
  const fieldToggles = buildFieldToggleMap(queryInfo.fieldToggles);

  const payload = await xGraphqlGet(
    queryInfo.queryId,
    "ArticleEntityResultByRestId",
    { articleEntityId: articleId },
    features,
    fieldToggles,
    cookieMap,
  );

  return (
    (payload as any)?.data?.article_result_by_rest_id?.result ??
    (payload as any)?.data?.article_result_by_rest_id ??
    (payload as any)?.data?.article_entity_result?.result ??
    null
  );
}

export async function getArticle(
  articleId: string,
  cookieMap: CookieMap,
): Promise<Record<string, unknown>> {
  const errors: string[] = [];
  let articleEntity: any = null;
  let tweetInfo: Record<string, unknown> | null = null;

  // Strategy 1: Try TweetDetail with the article ID as focalTweetId
  // (sometimes article ID equals the tweet ID that created it)
  try {
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
        focalTweetId: articleId,
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

    // Search all entries for article content matching our articleId
    const instructions =
      (payload as any)?.data?.threaded_conversation_with_injections_v2?.instructions ?? [];
    for (const instruction of instructions) {
      for (const entry of instruction.entries ?? []) {
        const result = entry?.content?.itemContent?.tweet_results?.result;
        const tweet = unwrapTweetResult(result);
        if (!tweet) continue;

        const embedded = extractArticleEntityFromTweet(tweet);
        if (embedded && (embedded.rest_id === articleId || embedded.title)) {
          articleEntity = embedded;
          tweetInfo = formatTweet(tweet);
          break;
        }
      }
      if (articleEntity) break;
    }
  } catch (e) {
    errors.push(`TweetDetail: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Strategy 2: Direct ArticleEntityResultByRestId
  if (!articleEntity || !articleContentToText(articleEntity)) {
    try {
      const directEntity = await fetchArticleEntityById(articleId, cookieMap);
      if (directEntity && articleContentToText(directEntity)) {
        articleEntity = directEntity;
      } else if (!articleEntity) {
        articleEntity = directEntity;
      }
    } catch (e) {
      errors.push(`ArticleEntityResultByRestId: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const title = articleEntity?.title ?? "";
  const text = articleContentToText(articleEntity);
  const coverImage = articleEntity?.cover_media?.media_info?.original_img_url ?? undefined;

  // If both strategies failed completely, throw so the caller sees the error
  if (!articleEntity && errors.length > 0) {
    throw new Error(`Failed to fetch article ${articleId}: ${errors.join("; ")}`);
  }

  return {
    article_id: articleId,
    title,
    text:
      text ||
      "(Article content could not be extracted. Try using x_get_tweet with the tweet URL instead.)",
    cover_image: coverImage,
    url: `https://x.com/i/article/${articleId}`,
    ...(tweetInfo
      ? { author: tweetInfo.author, username: tweetInfo.username, created_at: tweetInfo.created_at }
      : {}),
    ...(errors.length > 0 ? { warnings: errors } : {}),
  };
}

export async function getUserTweets(
  username: string,
  count: number,
  cookieMap: CookieMap,
): Promise<{ user: string; tweets: any[] }> {
  // First resolve user ID from screen_name
  const userId = await resolveUserId(username, cookieMap);

  const queryInfo = await resolveQueryInfo(
    "UserTweets",
    /unused/,
    FALLBACK_USER_TWEETS_QUERY_ID,
    FALLBACK_TWEET_FEATURE_SWITCHES,
    FALLBACK_TWEET_FIELD_TOGGLES,
  );
  const features = buildFeatureMap(queryInfo.html, queryInfo.featureSwitches);
  const fieldToggles = buildFieldToggleMap(queryInfo.fieldToggles);

  const payload = await xGraphqlGet(
    queryInfo.queryId,
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
  const queryInfo = await resolveQueryInfo(
    "HomeTimeline",
    /unused/,
    FALLBACK_HOME_TIMELINE_QUERY_ID,
    FALLBACK_TWEET_FEATURE_SWITCHES,
    FALLBACK_TWEET_FIELD_TOGGLES,
  );
  const features = buildFeatureMap(queryInfo.html, queryInfo.featureSwitches);
  const fieldToggles = buildFieldToggleMap(queryInfo.fieldToggles);

  const payload = await xGraphqlGet(
    queryInfo.queryId,
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
  const qid = await resolveQueryId("UserByScreenName", FALLBACK_USER_BY_SCREEN_NAME_QUERY_ID);
  const url = `https://x.com/i/api/graphql/${qid}/UserByScreenName`;
  const params = new URLSearchParams({
    variables: JSON.stringify({ screen_name: username, withSafetyModeUserFields: true }),
    features: JSON.stringify({
      hidden_profile_subscriptions_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      subscriptions_verification_info_is_identity_verified_enabled: true,
      subscriptions_verification_info_verified_since_enabled: true,
      highlights_tweets_tab_ui_enabled: true,
      responsive_web_twitter_article_notes_tab_enabled: true,
      subscriptions_feature_can_gift_premium: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
      profile_label_improvements_pcf_label_in_post_enabled: true,
    }),
    fieldToggles: JSON.stringify({ withAuxiliaryUserLabels: false }),
  });

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
