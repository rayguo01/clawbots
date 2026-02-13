import type { CookieMap } from "./types.js";
import {
  FALLBACK_CREATE_TWEET_QUERY_ID,
  FALLBACK_TWEET_FEATURE_SWITCHES,
  FALLBACK_TWEET_FIELD_TOGGLES,
} from "./constants.js";
import { buildFeatureMap, buildFieldToggleMap, xGraphqlPost } from "./http.js";

async function resolveCreateTweetQueryId(): Promise<string> {
  // CreateTweet mutation uses a different queryId; use fallback for now.
  // The exact queryId can change but the fallback works reliably.
  return FALLBACK_CREATE_TWEET_QUERY_ID;
}

export async function postTweet(
  text: string,
  cookieMap: CookieMap,
  replyToId?: string,
): Promise<{ tweet_id: string; text: string }> {
  const queryId = await resolveCreateTweetQueryId();

  const variables: Record<string, unknown> = {
    tweet_text: text,
    dark_request: false,
    media: { media_entities: [], possibly_sensitive: false },
    semantic_annotation_ids: [],
  };

  if (replyToId) {
    variables.reply = {
      in_reply_to_tweet_id: replyToId,
      exclude_reply_user_ids: [],
    };
  }

  const features = buildFeatureMap("", FALLBACK_TWEET_FEATURE_SWITCHES);
  const fieldToggles = buildFieldToggleMap(FALLBACK_TWEET_FIELD_TOGGLES);

  const result = (await xGraphqlPost(
    queryId,
    "CreateTweet",
    variables,
    features,
    fieldToggles,
    cookieMap,
  )) as any;

  const tweetResult = result?.data?.create_tweet?.tweet_results?.result;
  if (!tweetResult) {
    throw new Error(
      "Failed to create tweet: " + JSON.stringify(result?.errors ?? result).slice(0, 400),
    );
  }

  const tweetId = tweetResult.rest_id ?? tweetResult.legacy?.id_str;
  const tweetText = tweetResult.legacy?.full_text ?? text;

  return { tweet_id: tweetId, text: tweetText };
}

export async function postThread(
  tweets: string[],
  cookieMap: CookieMap,
): Promise<{
  thread: Array<{ tweet_id: string; text: string }>;
  count: number;
  url: string | null;
}> {
  const posted: Array<{ tweet_id: string; text: string }> = [];
  let replyToId: string | undefined;

  for (const text of tweets) {
    const result = await postTweet(text, cookieMap, replyToId);
    posted.push(result);
    replyToId = result.tweet_id;
  }

  return {
    thread: posted,
    count: posted.length,
    url: posted.length > 0 ? `https://x.com/i/status/${posted[0].tweet_id}` : null,
  };
}
