import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { spotifyFetch } from "./spotify-api.js";

// ── Schemas ─────────────────────────────────────────────────

const SearchSchema = Type.Object({
  query: Type.String({ description: "Search query (song name, artist, album, etc.)." }),
  type: Type.Optional(
    Type.String({
      description:
        'Comma-separated types: "track", "artist", "album", "playlist". Default: "track".',
    }),
  ),
  limit: Type.Optional(
    Type.Number({ description: "Max results (1-50). Default: 10.", minimum: 1, maximum: 50 }),
  ),
});

const PlaySchema = Type.Object({
  uri: Type.Optional(
    Type.String({
      description:
        'Spotify URI to play (e.g. "spotify:track:xxx"). If omitted, resumes current playback.',
    }),
  ),
  contextUri: Type.Optional(
    Type.String({
      description:
        'Context URI (album/playlist/artist, e.g. "spotify:album:xxx"). Plays from this context.',
    }),
  ),
  deviceId: Type.Optional(
    Type.String({ description: "Target device ID. If omitted, uses active device." }),
  ),
});

const PauseSchema = Type.Object({
  deviceId: Type.Optional(Type.String({ description: "Target device ID." })),
});

const SkipSchema = Type.Object({
  deviceId: Type.Optional(Type.String({ description: "Target device ID." })),
});

const SeekSchema = Type.Object({
  positionMs: Type.Number({ description: "Position in milliseconds to seek to." }),
  deviceId: Type.Optional(Type.String({ description: "Target device ID." })),
});

const VolumeSchema = Type.Object({
  volumePercent: Type.Number({ description: "Volume level (0-100).", minimum: 0, maximum: 100 }),
  deviceId: Type.Optional(Type.String({ description: "Target device ID." })),
});

const ShuffleSchema = Type.Object({
  state: Type.Boolean({ description: "true to enable shuffle, false to disable." }),
  deviceId: Type.Optional(Type.String({ description: "Target device ID." })),
});

const RepeatSchema = Type.Object({
  state: Type.String({
    description: '"track" (repeat current), "context" (repeat album/playlist), or "off".',
  }),
  deviceId: Type.Optional(Type.String({ description: "Target device ID." })),
});

const TransferSchema = Type.Object({
  deviceId: Type.String({ description: "Device ID to transfer playback to." }),
  play: Type.Optional(
    Type.Boolean({ description: "Start playing after transfer. Default: true." }),
  ),
});

const QueueSchema = Type.Object({
  uri: Type.String({ description: 'Spotify URI to add to queue (e.g. "spotify:track:xxx").' }),
  deviceId: Type.Optional(Type.String({ description: "Target device ID." })),
});

const DevicesSchema = Type.Object({});

const NowPlayingSchema = Type.Object({});

// ── Tools ───────────────────────────────────────────────────

export function createSpotifyTools(): AnyAgentTool[] {
  return [
    createSearchTool(),
    createNowPlayingTool(),
    createPlayTool(),
    createPauseTool(),
    createNextTool(),
    createPrevTool(),
    createSeekTool(),
    createVolumeTool(),
    createShuffleTool(),
    createRepeatTool(),
    createDevicesTool(),
    createTransferTool(),
    createQueueTool(),
  ];
}

function createSearchTool(): AnyAgentTool {
  return {
    label: "Spotify: Search",
    name: "spotify_search",
    description: "Search Spotify for tracks, artists, albums, or playlists.",
    parameters: SearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const type = String(params.type ?? "track");
      const limit = Number(params.limit ?? 10);
      const qs = new URLSearchParams({
        q: String(params.query),
        type,
        limit: String(limit),
      });
      const res = await spotifyFetch(`/search?${qs}`);
      const data = (await res.json()) as Record<string, unknown>;

      const results: Record<string, unknown> = {};
      for (const t of type.split(",")) {
        const key = `${t.trim()}s`;
        const section = data[key] as { items?: unknown[] } | undefined;
        if (section?.items) {
          results[key] = section.items.map((item) => formatItem(item as SpotifyItem));
        }
      }
      return jsonResult(results);
    },
  };
}

function createNowPlayingTool(): AnyAgentTool {
  return {
    label: "Spotify: Now Playing",
    name: "spotify_now_playing",
    description: "Get the currently playing track and playback state.",
    parameters: NowPlayingSchema,
    execute: async () => {
      const res = await spotifyFetch("/me/player");
      if (res.status === 204) {
        return jsonResult({ playing: false, message: "No active playback." });
      }
      const data = (await res.json()) as SpotifyPlaybackState;
      return jsonResult({
        playing: data.is_playing,
        track: data.item ? formatItem(data.item) : null,
        progressMs: data.progress_ms,
        device: data.device
          ? {
              id: data.device.id,
              name: data.device.name,
              type: data.device.type,
              volumePercent: data.device.volume_percent,
            }
          : null,
        shuffleState: data.shuffle_state,
        repeatState: data.repeat_state,
      });
    },
  };
}

function createPlayTool(): AnyAgentTool {
  return {
    label: "Spotify: Play",
    name: "spotify_play",
    description:
      "Start or resume playback. Optionally play a specific track/album/playlist, or target a specific device.",
    parameters: PlaySchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = params.deviceId ? `?device_id=${encodeURIComponent(String(params.deviceId))}` : "";
      const body: Record<string, unknown> = {};
      if (params.uri) body.uris = [params.uri];
      if (params.contextUri) body.context_uri = params.contextUri;

      await spotifyFetch(`/me/player/play${qs}`, {
        method: "PUT",
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });
      return jsonResult({ playing: true });
    },
  };
}

function createPauseTool(): AnyAgentTool {
  return {
    label: "Spotify: Pause",
    name: "spotify_pause",
    description: "Pause playback.",
    parameters: PauseSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = params.deviceId ? `?device_id=${encodeURIComponent(String(params.deviceId))}` : "";
      await spotifyFetch(`/me/player/pause${qs}`, { method: "PUT" });
      return jsonResult({ paused: true });
    },
  };
}

function createNextTool(): AnyAgentTool {
  return {
    label: "Spotify: Next Track",
    name: "spotify_next",
    description: "Skip to the next track.",
    parameters: SkipSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = params.deviceId ? `?device_id=${encodeURIComponent(String(params.deviceId))}` : "";
      await spotifyFetch(`/me/player/next${qs}`, { method: "POST" });
      return jsonResult({ skipped: "next" });
    },
  };
}

function createPrevTool(): AnyAgentTool {
  return {
    label: "Spotify: Previous Track",
    name: "spotify_previous",
    description: "Go back to the previous track.",
    parameters: SkipSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = params.deviceId ? `?device_id=${encodeURIComponent(String(params.deviceId))}` : "";
      await spotifyFetch(`/me/player/previous${qs}`, { method: "POST" });
      return jsonResult({ skipped: "previous" });
    },
  };
}

function createSeekTool(): AnyAgentTool {
  return {
    label: "Spotify: Seek",
    name: "spotify_seek",
    description: "Seek to a position in the current track.",
    parameters: SeekSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = new URLSearchParams({ position_ms: String(params.positionMs) });
      if (params.deviceId) qs.set("device_id", String(params.deviceId));
      await spotifyFetch(`/me/player/seek?${qs}`, { method: "PUT" });
      return jsonResult({ seeked: true, positionMs: params.positionMs });
    },
  };
}

function createVolumeTool(): AnyAgentTool {
  return {
    label: "Spotify: Volume",
    name: "spotify_volume",
    description: "Set the playback volume (0-100).",
    parameters: VolumeSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = new URLSearchParams({ volume_percent: String(params.volumePercent) });
      if (params.deviceId) qs.set("device_id", String(params.deviceId));
      await spotifyFetch(`/me/player/volume?${qs}`, { method: "PUT" });
      return jsonResult({ volume: params.volumePercent });
    },
  };
}

function createShuffleTool(): AnyAgentTool {
  return {
    label: "Spotify: Shuffle",
    name: "spotify_shuffle",
    description: "Toggle shuffle mode on or off.",
    parameters: ShuffleSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = new URLSearchParams({ state: String(params.state) });
      if (params.deviceId) qs.set("device_id", String(params.deviceId));
      await spotifyFetch(`/me/player/shuffle?${qs}`, { method: "PUT" });
      return jsonResult({ shuffle: params.state });
    },
  };
}

function createRepeatTool(): AnyAgentTool {
  return {
    label: "Spotify: Repeat",
    name: "spotify_repeat",
    description: 'Set repeat mode: "track", "context" (album/playlist), or "off".',
    parameters: RepeatSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = new URLSearchParams({ state: String(params.state) });
      if (params.deviceId) qs.set("device_id", String(params.deviceId));
      await spotifyFetch(`/me/player/repeat?${qs}`, { method: "PUT" });
      return jsonResult({ repeat: params.state });
    },
  };
}

function createDevicesTool(): AnyAgentTool {
  return {
    label: "Spotify: List Devices",
    name: "spotify_devices",
    description: "List all available Spotify Connect devices (phones, computers, speakers, etc.).",
    parameters: DevicesSchema,
    execute: async () => {
      const res = await spotifyFetch("/me/player/devices");
      const data = (await res.json()) as { devices?: SpotifyDevice[] };
      const devices = (data.devices ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        isActive: d.is_active,
        volumePercent: d.volume_percent,
      }));
      return jsonResult({ devices, count: devices.length });
    },
  };
}

function createTransferTool(): AnyAgentTool {
  return {
    label: "Spotify: Transfer Playback",
    name: "spotify_transfer",
    description: "Transfer playback to a different device (e.g. from phone to speaker).",
    parameters: TransferSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      await spotifyFetch("/me/player", {
        method: "PUT",
        body: JSON.stringify({
          device_ids: [params.deviceId],
          play: params.play ?? true,
        }),
      });
      return jsonResult({ transferred: true, deviceId: params.deviceId });
    },
  };
}

function createQueueTool(): AnyAgentTool {
  return {
    label: "Spotify: Add to Queue",
    name: "spotify_queue",
    description: "Add a track to the playback queue.",
    parameters: QueueSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = new URLSearchParams({ uri: String(params.uri) });
      if (params.deviceId) qs.set("device_id", String(params.deviceId));
      await spotifyFetch(`/me/player/queue?${qs}`, { method: "POST" });
      return jsonResult({ queued: true, uri: params.uri });
    },
  };
}

// ── Types ───────────────────────────────────────────────────

type SpotifyItem = {
  id?: string;
  name?: string;
  uri?: string;
  type?: string;
  artists?: { name?: string; id?: string }[];
  album?: { name?: string; id?: string };
  duration_ms?: number;
  external_urls?: { spotify?: string };
  images?: { url?: string; width?: number; height?: number }[];
};

type SpotifyDevice = {
  id?: string;
  name?: string;
  type?: string;
  is_active?: boolean;
  volume_percent?: number;
};

type SpotifyPlaybackState = {
  is_playing?: boolean;
  item?: SpotifyItem;
  progress_ms?: number;
  device?: SpotifyDevice;
  shuffle_state?: boolean;
  repeat_state?: string;
};

function formatItem(item: SpotifyItem) {
  return {
    id: item.id,
    name: item.name,
    uri: item.uri,
    type: item.type,
    artists: item.artists?.map((a) => a.name).join(", "),
    album: item.album?.name,
    durationMs: item.duration_ms,
    url: item.external_urls?.spotify,
  };
}
