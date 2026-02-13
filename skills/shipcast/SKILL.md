---
name: shipcast
description: "Shipcast - Auto-tweet your code shipping updates. Push code to GitHub, AI rewrites commits into engaging tweets, posts on schedule. Keywords: shipcast, tweet, post tweet, announce, ship, shipped, auto tweet, dev log, build in public, coding update, share update, publish tweet. 关键词：生成更新推文、发布更新、代码更新推文、Build in Public。"
metadata:
  {
    "openclaw":
      {
        "emoji": "🚀",
        "requires":
          { "tools": ["github_list_repos", "github_get_commits", "x_post_tweet", "x_post_thread"] },
      },
  }
---

# Shipcast 🚀

Push code → AI writes tweet → Auto post. Build in public, effortlessly.

**Trigger words**: "shipcast", "tweet my code", "auto tweet", "announce", "ship it", "post update", "dev log", "build in public", "share what I shipped", "tweet", "post to twitter", "post to x"

## Dependencies

- `github_list_repos` tool (GitHub API)
- `github_get_commits` tool (GitHub API)
- `x_post_tweet` tool (X Cookie API)
- `x_post_thread` tool (X Cookie API)
- GitHub OAuth connected + X Cookie configured

## First-Time Setup Flow

When the user first mentions shipcast or auto-tweeting:

1. **Check setup**: Verify GitHub OAuth is connected and X Cookie is configured. If not, tell the user:

   > Go to Nanobots Setup → Services, connect your GitHub account and configure X Cookie.
   > Stop here until both are set up.

2. **Pick repo**: Use `github_list_repos` to show the user their repos. Ask which one(s) to track.

3. **Set preferences**: Ask the user:
   - **Language**: Tweet in English, Chinese, or match repo language?
   - **Style**: Professional / casual / fun?
   - **Schedule**: When to post? (e.g. "every day at 10am", "weekdays 9am SGT")

4. **Create cron job**: Set up an `isolated` cron job based on the schedule:

   ```
   shipcast_cron:
     schedule: "0 10 * * *"
     mode: isolated
     prompt: |
       You are Shipcast. Check for new commits and post a tweet.

       ## Instructions
       1. Read knowledge/shipcast/{owner}-{repo}/last-published.md to find the last published commit date
       2. Use github_get_commits with since = last published date
       3. Filter out junk commits (see filtering rules below)
       4. If there are meaningful commits, compose a tweet following the writing guidelines
       5. Post with x_post_tweet (or x_post_thread for big updates)
       6. Update last-published.md with the latest commit date

       ## Repo config
       - repo: {owner}/{repo}
       - language: {language}
       - style: {style}
   ```

5. **Confirm**: Show the user a summary and confirm.

## Commit Filtering Rules

Skip these commits — they add no value to a tweet:

- Merge commits (`Merge branch`, `Merge pull request`)
- Lint/format only (`fix lint`, `prettier`, `format code`)
- Dependency updates (`bump`, `update deps`, `renovate`, `dependabot`)
- CI/config changes (`update CI`, `.github/workflows`, `Dockerfile`)
- WIP commits (`wip`, `temp`, `fixup`, `squash`)

## Tweet Writing Guidelines

Write tweets as the developer (first person). Goals:

- **Specific & valuable**: What did you build? Why does it matter?
- **Concise**: 1-2 sentences max. Every word earns its place.
- **Human**: Sound like a real dev sharing genuine progress, not a marketing bot.
- **Moderate emoji**: 0-2 per tweet. Never overdo it.
- **No hashtag spam**: At most 1-2 relevant hashtags, or none.

### Good examples:

- "Just shipped OAuth PKCE support for our bot framework. Twitter integration now works out of the box 🔐"
- "Added real-time commit tracking to Shipcast. Push code, get tweets. Zero config."
- "New: AI-powered meal planning that knows Singapore hawker prices. Built it because I was tired of deciding what to cook 🍜"

### Bad examples (avoid):

- "🚀🔥 JUST SHIPPED!!! 💪 #coding #buildinpublic #devlife #ship" (hashtag/emoji spam)
- "Updated some files and fixed some bugs" (too vague)
- "Committed 47 files across 12 modules refactoring the..." (too technical)

## Thread Guidelines

Use threads (x_post_thread) when:

- A single tweet can't capture a significant update
- Weekly summary of multiple features
- Launch announcements with context

Thread structure:

1. **Hook**: What you shipped (the exciting bit)
2. **Detail**: How it works or why it matters (1-2 tweets)
3. **CTA**: Link to repo, demo, or ask for feedback

## Knowledge Base Structure

Store state in `knowledge/shipcast/{owner}-{repo}/last-published.md`:

```markdown
---
repo: owner/repo
last_commit_sha: abc1234
last_commit_date: 2026-02-10T08:30:00Z
last_tweet_id: "1234567890"
---
```

## Manual Mode

Users can also trigger Shipcast manually:

- "Tweet about my latest commits" → fetch + compose + post
- "Draft a tweet for my project" → fetch + compose + show (don't post)
- "What have I shipped this week?" → fetch + summarize (no tweet)
