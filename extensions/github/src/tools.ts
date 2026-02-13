import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { githubFetch } from "./github-api.js";

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

export function createGitHubTools(): AnyAgentTool[] {
  return [createListReposTool(), createGetCommitsTool()];
}

function createListReposTool(): AnyAgentTool {
  return {
    label: "GitHub: List Repos",
    name: "github_list_repos",
    description:
      "List the authenticated user's GitHub repositories, sorted by most recently pushed.",
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
    label: "GitHub: Get Commits",
    name: "github_get_commits",
    description: "Get recent commits from a GitHub repository since a given date.",
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
