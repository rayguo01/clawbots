import type { OAuthProviderConfig } from "./core.js";

/**
 * Resolve OAuth provider config from environment variables.
 * Users configure their own Google OAuth app credentials via env vars
 * or through the web setup UI.
 */
function envOrEmpty(key: string): string {
  return process.env[key]?.trim() ?? "";
}

export function getGoogleProvider(): OAuthProviderConfig {
  return {
    id: "google",
    name: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/drive",
    ],
    clientId: envOrEmpty("NANOBOTS_GOOGLE_CLIENT_ID") || envOrEmpty("GOOGLE_CLIENT_ID"),
    clientSecret: envOrEmpty("NANOBOTS_GOOGLE_CLIENT_SECRET") || envOrEmpty("GOOGLE_CLIENT_SECRET"),
    scopeSeparator: " ",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    tokenNeverExpires: false,
    envHint: {
      clientId: "NANOBOTS_GOOGLE_CLIENT_ID",
      clientSecret: "NANOBOTS_GOOGLE_CLIENT_SECRET",
    },
  };
}

export function getTodoistProvider(): OAuthProviderConfig {
  return {
    id: "todoist",
    name: "Todoist",
    authUrl: "https://todoist.com/oauth/authorize",
    tokenUrl: "https://todoist.com/oauth/access_token",
    scopes: ["data:read_write", "data:delete"],
    clientId: envOrEmpty("NANOBOTS_TODOIST_CLIENT_ID") || envOrEmpty("TODOIST_CLIENT_ID"),
    clientSecret:
      envOrEmpty("NANOBOTS_TODOIST_CLIENT_SECRET") || envOrEmpty("TODOIST_CLIENT_SECRET"),
    scopeSeparator: ",",
    extraAuthParams: {},
    tokenNeverExpires: true,
    envHint: {
      clientId: "NANOBOTS_TODOIST_CLIENT_ID",
      clientSecret: "NANOBOTS_TODOIST_CLIENT_SECRET",
    },
  };
}

export function getNotionProvider(): OAuthProviderConfig {
  return {
    id: "notion",
    name: "Notion",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    clientId: envOrEmpty("NANOBOTS_NOTION_CLIENT_ID") || envOrEmpty("NOTION_CLIENT_ID"),
    clientSecret: envOrEmpty("NANOBOTS_NOTION_CLIENT_SECRET") || envOrEmpty("NOTION_CLIENT_SECRET"),
    extraAuthParams: { owner: "user" },
    tokenAuthMethod: "basic",
    tokenContentType: "json",
    envHint: {
      clientId: "NANOBOTS_NOTION_CLIENT_ID",
      clientSecret: "NANOBOTS_NOTION_CLIENT_SECRET",
    },
  };
}

export function getSpotifyProvider(): OAuthProviderConfig {
  return {
    id: "spotify",
    name: "Spotify",
    authUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    scopes: [
      "user-read-playback-state",
      "user-modify-playback-state",
      "user-read-currently-playing",
      "playlist-read-private",
      "playlist-modify-public",
      "playlist-modify-private",
      "user-library-read",
      "user-library-modify",
    ],
    clientId: envOrEmpty("NANOBOTS_SPOTIFY_CLIENT_ID") || envOrEmpty("SPOTIFY_CLIENT_ID"),
    clientSecret:
      envOrEmpty("NANOBOTS_SPOTIFY_CLIENT_SECRET") || envOrEmpty("SPOTIFY_CLIENT_SECRET"),
    tokenAuthMethod: "basic",
    envHint: {
      clientId: "NANOBOTS_SPOTIFY_CLIENT_ID",
      clientSecret: "NANOBOTS_SPOTIFY_CLIENT_SECRET",
    },
  };
}

export function getFitbitProvider(): OAuthProviderConfig {
  return {
    id: "fitbit",
    name: "Fitbit",
    authUrl: "https://www.fitbit.com/oauth2/authorize",
    tokenUrl: "https://api.fitbit.com/oauth2/token",
    scopes: ["activity", "heartrate", "sleep", "profile"],
    clientId: envOrEmpty("NANOBOTS_FITBIT_CLIENT_ID") || envOrEmpty("FITBIT_CLIENT_ID"),
    clientSecret: envOrEmpty("NANOBOTS_FITBIT_CLIENT_SECRET") || envOrEmpty("FITBIT_CLIENT_SECRET"),
    tokenAuthMethod: "basic",
    envHint: {
      clientId: "NANOBOTS_FITBIT_CLIENT_ID",
      clientSecret: "NANOBOTS_FITBIT_CLIENT_SECRET",
    },
  };
}

export function getDropboxProvider(): OAuthProviderConfig {
  return {
    id: "dropbox",
    name: "Dropbox",
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    scopes: ["files.metadata.read", "files.content.read", "account_info.read"],
    clientId: envOrEmpty("NANOBOTS_DROPBOX_CLIENT_ID") || envOrEmpty("DROPBOX_APP_KEY"),
    clientSecret: envOrEmpty("NANOBOTS_DROPBOX_CLIENT_SECRET") || envOrEmpty("DROPBOX_APP_SECRET"),
    extraAuthParams: { token_access_type: "offline" },
    envHint: {
      clientId: "NANOBOTS_DROPBOX_CLIENT_ID",
      clientSecret: "NANOBOTS_DROPBOX_CLIENT_SECRET",
    },
  };
}

export function getMicrosoft365Provider(): OAuthProviderConfig {
  return {
    id: "microsoft365",
    name: "Microsoft 365",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      "User.Read",
      "Mail.Read",
      "Mail.ReadWrite",
      "Mail.Send",
      "Calendars.Read",
      "Calendars.ReadWrite",
      "Contacts.Read",
      "offline_access",
    ],
    clientId: envOrEmpty("NANOBOTS_MICROSOFT365_CLIENT_ID") || envOrEmpty("AZURE_CLIENT_ID"),
    clientSecret:
      envOrEmpty("NANOBOTS_MICROSOFT365_CLIENT_SECRET") || envOrEmpty("AZURE_CLIENT_SECRET"),
    extraAuthParams: { prompt: "consent" },
    envHint: {
      clientId: "NANOBOTS_MICROSOFT365_CLIENT_ID",
      clientSecret: "NANOBOTS_MICROSOFT365_CLIENT_SECRET",
    },
  };
}

export function getGitHubProvider(): OAuthProviderConfig {
  return {
    id: "github",
    name: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo"],
    clientId: envOrEmpty("NANOBOTS_GITHUB_CLIENT_ID") || envOrEmpty("GITHUB_CLIENT_ID"),
    clientSecret: envOrEmpty("NANOBOTS_GITHUB_CLIENT_SECRET") || envOrEmpty("GITHUB_CLIENT_SECRET"),
    tokenNeverExpires: true,
    envHint: {
      clientId: "NANOBOTS_GITHUB_CLIENT_ID",
      clientSecret: "NANOBOTS_GITHUB_CLIENT_SECRET",
    },
  };
}

export function getTwitterProvider(): OAuthProviderConfig {
  return {
    id: "twitter",
    name: "X (Twitter)",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    clientId: envOrEmpty("NANOBOTS_TWITTER_CLIENT_ID") || envOrEmpty("TWITTER_CLIENT_ID"),
    clientSecret:
      envOrEmpty("NANOBOTS_TWITTER_CLIENT_SECRET") || envOrEmpty("TWITTER_CLIENT_SECRET"),
    tokenAuthMethod: "basic",
    usePKCE: true,
    envHint: {
      clientId: "NANOBOTS_TWITTER_CLIENT_ID",
      clientSecret: "NANOBOTS_TWITTER_CLIENT_SECRET",
    },
  };
}

export type OAuthProviderSummary = {
  id: string;
  name: string;
  configured: boolean; // client ID + secret are set
  connected: boolean; // has valid token
  scopes: string[];
};

export function getAvailableProviders(): OAuthProviderConfig[] {
  return [
    getGoogleProvider(),
    getTodoistProvider(),
    getNotionProvider(),
    getSpotifyProvider(),
    getFitbitProvider(),
    getDropboxProvider(),
    getMicrosoft365Provider(),
    getGitHubProvider(),
    getTwitterProvider(),
  ];
}

export function getProviderById(id: string): OAuthProviderConfig | null {
  const providers = getAvailableProviders();
  return providers.find((p) => p.id === id) ?? null;
}
