import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { githubFetch } from "./github-api.js";
import { twitterFetch } from "./twitter-api.js";

// ── Schemas ─────────────────────────────────────────────────

const ListReposSchema = Type.Object({
  sort: Type.Optional(
    Type.String({
      description: 'Sort field: "pushed", "updated", "created", "full_name". Default "pushed".',
    }),
  ),
  per_page: Type.Optional(
    Type.Number({ description: "Results per page (1-100). Default 20.", minimum: 1, maximum: 100 }),
  ),
});

const GetCommitsSchema = Type.Object({
  owner: Type.String({ description: "Repository owner (user or org)." }),
  repo: Type.String({ description: "Repository name." }),
  since: Type.String({ description: "ISO 8601 date string. Only commits after this date." }),
});

const PostTweetSchema = Type.Object({
  text: Type.String({ description: "Tweet text (max 280 characters)." }),
});

const PostThreadSchema = Type.Object({
  tweets: Type.Array(Type.String({ description: "Text for each tweet in the thread." }), {
    description: "Array of tweet texts. First tweet starts the thread, rest are replies.",
    minItems: 1,
  }),
});

// ── Tools ───────────────────────────────────────────────────

export function createShipcastTools(): AnyAgentTool[] {
  return [
    createListReposTool(),
    createGetCommitsTool(),
    createPostTweetTool(),
    createPostThreadTool(),
  ];
}

function createListReposTool(): AnyAgentTool {
  return {
    label: "Shipcast: List GitHub Repos",
    name: "shipcast_list_repos",
    description:
      "List the authenticated user's GitHub repositories, sorted by most recently pushed. Use this to help the user pick which repo to track for auto-tweeting.",
    parameters: ListReposSchema,
    execute: async (_toolCallId, args) => {
      const params = args as { sort?: string; per_page?: number };
      const sort = params.sort ?? "pushed";
      const perPage = params.per_page ?? 20;

      const response = await githubFetch(`/user/repos?sort=${sort}&per_page=${perPage}`);
      const repos = (await response.json()) as Array<{
        full_name: string;
        description: string | null;
        html_url: string;
        pushed_at: string;
        language: string | null;
        private: boolean;
        stargazers_count: number;
      }>;

      return jsonResult({
        repos: repos.map((r) => ({
          full_name: r.full_name,
          description: r.description,
          url: r.html_url,
          pushed_at: r.pushed_at,
          language: r.language,
          private: r.private,
          stars: r.stargazers_count,
        })),
        count: repos.length,
      });
    },
  };
}

function createGetCommitsTool(): AnyAgentTool {
  return {
    label: "Shipcast: Get Commits",
    name: "shipcast_get_commits",
    description:
      "Get recent commits from a GitHub repository since a given date. Use this to find new commits that haven't been tweeted yet.",
    parameters: GetCommitsSchema,
    execute: async (_toolCallId, args) => {
      const { owner, repo, since } = args as { owner: string; repo: string; since: string };

      const response = await githubFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?since=${encodeURIComponent(since)}`,
      );
      const commits = (await response.json()) as Array<{
        sha: string;
        commit: {
          message: string;
          author: { name: string; date: string };
        };
        html_url: string;
      }>;

      return jsonResult({
        commits: commits.map((c) => ({
          sha: c.sha.slice(0, 7),
          message: c.commit.message,
          author: c.commit.author.name,
          date: c.commit.author.date,
          url: c.html_url,
        })),
        count: commits.length,
      });
    },
  };
}

function createPostTweetTool(): AnyAgentTool {
  return {
    label: "Shipcast: Post Tweet",
    name: "shipcast_post_tweet",
    description:
      "Post a single tweet to X (Twitter). Use this to share a code update, shipping announcement, or dev log entry.",
    parameters: PostTweetSchema,
    execute: async (_toolCallId, args) => {
      const { text } = args as { text: string };

      const response = await twitterFetch("/tweets", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      const data = (await response.json()) as { data: { id: string; text: string } };

      return jsonResult({
        tweet_id: data.data.id,
        text: data.data.text,
        url: `https://x.com/i/status/${data.data.id}`,
      });
    },
  };
}

function createPostThreadTool(): AnyAgentTool {
  return {
    label: "Shipcast: Post Thread",
    name: "shipcast_post_thread",
    description:
      "Post a thread (multiple connected tweets) to X (Twitter). Use this for longer updates that need more than 280 characters, like weekly summaries or detailed feature announcements.",
    parameters: PostThreadSchema,
    execute: async (_toolCallId, args) => {
      const { tweets } = args as { tweets: string[] };

      const posted: Array<{ tweet_id: string; text: string }> = [];
      let replyToId: string | undefined;

      for (const text of tweets) {
        const body: Record<string, unknown> = { text };
        if (replyToId) {
          body.reply = { in_reply_to_tweet_id: replyToId };
        }

        const response = await twitterFetch("/tweets", {
          method: "POST",
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as { data: { id: string; text: string } };

        posted.push({ tweet_id: data.data.id, text: data.data.text });
        replyToId = data.data.id;
      }

      return jsonResult({
        thread: posted,
        count: posted.length,
        url: posted.length > 0 ? `https://x.com/i/status/${posted[0].tweet_id}` : null,
      });
    },
  };
}
