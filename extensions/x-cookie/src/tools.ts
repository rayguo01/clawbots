import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { requireXCookies } from "./cookies.js";
import { postTweet, postThread } from "./post.js";
import { getTweet, getArticle, getUserTweets, getTimeline } from "./read.js";
import { searchTweets } from "./search.js";

function extractTweetId(input: string): string {
  // Support full URL or plain tweet ID
  const urlMatch = input.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  if (/^\d+$/.test(input.trim())) return input.trim();
  // Detect article URL and give a helpful error
  if (/(?:twitter\.com|x\.com)\/i\/article\//.test(input)) {
    throw new Error(`This is an X Article URL. Please use the x_get_article tool instead.`);
  }
  throw new Error(`Invalid tweet ID or URL: ${input}`);
}

function extractArticleId(input: string): string {
  const urlMatch = input.match(/(?:twitter\.com|x\.com)\/i\/article\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  if (/^\d+$/.test(input.trim())) return input.trim();
  throw new Error(`Invalid article ID or URL: ${input}`);
}

export function createXTools(): AnyAgentTool[] {
  return [
    createPostTweetTool(),
    createPostThreadTool(),
    createGetTweetTool(),
    createGetArticleTool(),
    createGetUserTweetsTool(),
    createGetTimelineTool(),
    createSearchTool(),
  ];
}

function createPostTweetTool(): AnyAgentTool {
  return {
    label: "X: Post Tweet",
    name: "x_post_tweet",
    description:
      "Post a single tweet to X (Twitter). Use this to share updates, announcements, or short messages. Max 280 characters.",
    parameters: Type.Object({
      text: Type.String({ description: "Tweet text (max 280 characters)." }),
    }),
    execute: async (_toolCallId, args) => {
      const { text } = args as { text: string };
      const cookies = await requireXCookies();
      const result = await postTweet(text, cookies);
      return jsonResult({
        tweet_id: result.tweet_id,
        text: result.text,
        url: `https://x.com/i/status/${result.tweet_id}`,
      });
    },
  };
}

function createPostThreadTool(): AnyAgentTool {
  return {
    label: "X: Post Thread",
    name: "x_post_thread",
    description:
      "Post a thread (multiple connected tweets) to X (Twitter). Use this for longer updates that need more than 280 characters.",
    parameters: Type.Object({
      tweets: Type.Array(Type.String({ description: "Text for each tweet in the thread." }), {
        description: "Array of tweet texts. First tweet starts the thread, rest are replies.",
        minItems: 1,
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { tweets } = args as { tweets: string[] };
      const cookies = await requireXCookies();
      const result = await postThread(tweets, cookies);
      return jsonResult(result);
    },
  };
}

function createGetTweetTool(): AnyAgentTool {
  return {
    label: "X: Get Tweet",
    name: "x_get_tweet",
    description:
      "Get a tweet's full details including text, author, engagement metrics, and replies. Accepts a tweet ID or full URL.",
    parameters: Type.Object({
      tweet_id: Type.String({
        description:
          "Tweet ID (e.g. '1234567890') or full URL (e.g. 'https://x.com/user/status/1234567890').",
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { tweet_id } = args as { tweet_id: string };
      const id = extractTweetId(tweet_id);
      const cookies = await requireXCookies();
      const result = await getTweet(id, cookies);
      return jsonResult(result);
    },
  };
}

function createGetArticleTool(): AnyAgentTool {
  return {
    label: "X: Get Article",
    name: "x_get_article",
    description:
      "Get an X Article (long-form post) content. Use this for URLs like https://x.com/i/article/<id>. Returns the article title, full text, author info, and cover image.",
    parameters: Type.Object({
      article_id: Type.String({
        description:
          "Article ID (e.g. '1234567890') or full URL (e.g. 'https://x.com/i/article/1234567890').",
      }),
    }),
    execute: async (_toolCallId, args) => {
      const { article_id } = args as { article_id: string };
      const id = extractArticleId(article_id);
      const cookies = await requireXCookies();
      const result = await getArticle(id, cookies);
      return jsonResult(result);
    },
  };
}

function createGetUserTweetsTool(): AnyAgentTool {
  return {
    label: "X: Get User Tweets",
    name: "x_get_user_tweets",
    description:
      "Get recent tweets from a specific X (Twitter) user. Returns a list of their latest tweets with text, timestamps, and metrics.",
    parameters: Type.Object({
      username: Type.String({
        description: "X username without the @ symbol (e.g. 'elonmusk').",
      }),
      count: Type.Optional(
        Type.Number({
          description: "Number of tweets to fetch (default 20, max 50).",
          default: 20,
        }),
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { username, count = 20 } = args as { username: string; count?: number };
      const cookies = await requireXCookies();
      const result = await getUserTweets(username, Math.min(count, 50), cookies);
      return jsonResult(result);
    },
  };
}

function createGetTimelineTool(): AnyAgentTool {
  return {
    label: "X: Get Timeline",
    name: "x_get_timeline",
    description:
      "Get the authenticated user's home timeline — tweets from people they follow. Returns recent tweets with text, authors, and metrics.",
    parameters: Type.Object({
      count: Type.Optional(
        Type.Number({
          description: "Number of tweets to fetch (default 20, max 50).",
          default: 20,
        }),
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { count = 20 } = args as { count?: number };
      const cookies = await requireXCookies();
      const result = await getTimeline(Math.min(count, 50), cookies);
      return jsonResult(result);
    },
  };
}

function createSearchTool(): AnyAgentTool {
  return {
    label: "X: Search Tweets",
    name: "x_search",
    description:
      "Search for tweets on X (Twitter) by keyword, phrase, or advanced query. Returns matching tweets sorted by recency.",
    parameters: Type.Object({
      query: Type.String({
        description:
          "Search query. Supports keywords, phrases, and X advanced search syntax (e.g. 'from:user', 'lang:en').",
      }),
      count: Type.Optional(
        Type.Number({
          description: "Number of results to fetch (default 20, max 50).",
          default: 20,
        }),
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { query, count = 20 } = args as { query: string; count?: number };
      const cookies = await requireXCookies();
      const result = await searchTweets(query, Math.min(count, 50), cookies);
      return jsonResult(result);
    },
  };
}
