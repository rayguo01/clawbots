import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { fitbitFetch } from "./fitbit-api.js";

// ── Helpers ─────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Schemas ─────────────────────────────────────────────────

const ProfileSchema = Type.Object({});

const DailyActivitySchema = Type.Object({
  date: Type.Optional(Type.String({ description: "Date in YYYY-MM-DD format. Default: today." })),
});

const StepsRangeSchema = Type.Object({
  startDate: Type.Optional(
    Type.String({ description: "Start date in YYYY-MM-DD format. Default: 7 days ago." }),
  ),
  endDate: Type.Optional(
    Type.String({ description: "End date in YYYY-MM-DD format. Default: today." }),
  ),
});

const HeartRateSchema = Type.Object({
  date: Type.Optional(Type.String({ description: "Date in YYYY-MM-DD format. Default: today." })),
});

const SleepSchema = Type.Object({
  date: Type.Optional(Type.String({ description: "Date in YYYY-MM-DD format. Default: today." })),
});

const ActivityLogsSchema = Type.Object({
  afterDate: Type.Optional(
    Type.String({
      description: "List activities after this date (YYYY-MM-DD). Default: 7 days ago.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({ description: "Max results (1-100). Default: 10.", minimum: 1, maximum: 100 }),
  ),
  sort: Type.Optional(
    Type.String({ description: '"asc" or "desc". Default: "desc" (most recent first).' }),
  ),
});

// ── Tools ───────────────────────────────────────────────────

export function createFitbitTools(): AnyAgentTool[] {
  return [
    createProfileTool(),
    createDailyActivityTool(),
    createStepsRangeTool(),
    createHeartRateTool(),
    createSleepTool(),
    createActivityLogsTool(),
  ];
}

function createProfileTool(): AnyAgentTool {
  return {
    label: "Fitbit: Profile",
    name: "fitbit_profile",
    description:
      "Get the user's Fitbit profile including display name, age, height, weight, and member since date.",
    parameters: ProfileSchema,
    execute: async () => {
      const res = await fitbitFetch("/1/user/-/profile.json");
      const data = (await res.json()) as { user?: FitbitProfile };
      const u = data.user;
      if (!u) return jsonResult({ error: "No profile data returned." });
      return jsonResult({
        displayName: u.displayName,
        age: u.age,
        gender: u.gender,
        height: u.height,
        weight: u.weight,
        averageDailySteps: u.averageDailySteps,
        memberSince: u.memberSince,
        timezone: u.timezone,
      });
    },
  };
}

function createDailyActivityTool(): AnyAgentTool {
  return {
    label: "Fitbit: Daily Activity",
    name: "fitbit_daily_activity",
    description:
      "Get daily activity summary: steps, calories, distance, floors, active minutes for a given date.",
    parameters: DailyActivitySchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const date = String(params.date ?? todayStr());
      const res = await fitbitFetch(`/1/user/-/activities/date/${date}.json`);
      const data = (await res.json()) as { summary?: FitbitActivitySummary };
      const s = data.summary;
      if (!s) return jsonResult({ date, error: "No activity data for this date." });
      return jsonResult({
        date,
        steps: s.steps,
        caloriesOut: s.caloriesOut,
        distances: s.distances,
        floors: s.floors,
        fairlyActiveMinutes: s.fairlyActiveMinutes,
        veryActiveMinutes: s.veryActiveMinutes,
        lightlyActiveMinutes: s.lightlyActiveMinutes,
        sedentaryMinutes: s.sedentaryMinutes,
        restingHeartRate: s.restingHeartRate,
      });
    },
  };
}

function createStepsRangeTool(): AnyAgentTool {
  return {
    label: "Fitbit: Steps Range",
    name: "fitbit_steps_range",
    description: "Get daily step counts over a date range. Useful for weekly/monthly trends.",
    parameters: StepsRangeSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const end = String(params.endDate ?? todayStr());
      const start = String(params.startDate ?? defaultStartDate(7));
      const res = await fitbitFetch(`/1/user/-/activities/steps/date/${start}/${end}.json`);
      const data = (await res.json()) as {
        "activities-steps"?: { dateTime: string; value: string }[];
      };
      const steps = (data["activities-steps"] ?? []).map((d) => ({
        date: d.dateTime,
        steps: Number(d.value),
      }));
      return jsonResult({ startDate: start, endDate: end, days: steps });
    },
  };
}

function createHeartRateTool(): AnyAgentTool {
  return {
    label: "Fitbit: Heart Rate",
    name: "fitbit_heart_rate",
    description:
      "Get heart rate data for a date: resting heart rate and time spent in each heart rate zone.",
    parameters: HeartRateSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const date = String(params.date ?? todayStr());
      const res = await fitbitFetch(`/1/user/-/activities/heart/date/${date}/1d.json`);
      const data = (await res.json()) as { "activities-heart"?: FitbitHeartDay[] };
      const day = data["activities-heart"]?.[0];
      if (!day?.value) return jsonResult({ date, error: "No heart rate data for this date." });
      return jsonResult({
        date: day.dateTime,
        restingHeartRate: day.value.restingHeartRate,
        heartRateZones: day.value.heartRateZones?.map((z) => ({
          name: z.name,
          min: z.min,
          max: z.max,
          minutes: z.minutes,
          caloriesOut: z.caloriesOut,
        })),
      });
    },
  };
}

function createSleepTool(): AnyAgentTool {
  return {
    label: "Fitbit: Sleep",
    name: "fitbit_sleep",
    description:
      "Get sleep data for a date: duration, efficiency, stages (deep, light, REM, wake).",
    parameters: SleepSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const date = String(params.date ?? todayStr());
      const res = await fitbitFetch(`/1.2/user/-/sleep/date/${date}.json`);
      const data = (await res.json()) as { sleep?: FitbitSleepLog[]; summary?: FitbitSleepSummary };
      const logs = data.sleep ?? [];
      const summary = data.summary;
      return jsonResult({
        date,
        sleepRecords: logs.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration,
          efficiency: s.efficiency,
          minutesAsleep: s.minutesAsleep,
          minutesAwake: s.minutesAwake,
          stages: s.levels?.summary
            ? {
                deep: s.levels.summary.deep?.minutes,
                light: s.levels.summary.light?.minutes,
                rem: s.levels.summary.rem?.minutes,
                wake: s.levels.summary.wake?.minutes,
              }
            : undefined,
        })),
        totalMinutesAsleep: summary?.totalMinutesAsleep,
        totalSleepRecords: summary?.totalSleepRecords,
      });
    },
  };
}

function createActivityLogsTool(): AnyAgentTool {
  return {
    label: "Fitbit: Activity Logs",
    name: "fitbit_activity_logs",
    description:
      "List recent exercise/activity logs (runs, walks, bike rides, etc.) with duration, calories, and distance.",
    parameters: ActivityLogsSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const afterDate = String(params.afterDate ?? defaultStartDate(7));
      const limit = Number(params.limit ?? 10);
      const sort = String(params.sort ?? "desc");
      const qs = new URLSearchParams({
        afterDate,
        offset: "0",
        limit: String(limit),
        sort,
      });
      const res = await fitbitFetch(`/1/user/-/activities/list.json?${qs}`);
      const data = (await res.json()) as { activities?: FitbitActivityLog[] };
      const activities = (data.activities ?? []).map((a) => ({
        name: a.activityName,
        startTime: a.startTime,
        duration: a.duration,
        activeDuration: a.activeDuration,
        calories: a.calories,
        steps: a.steps,
        distance: a.distance,
        distanceUnit: a.distanceUnit,
        averageHeartRate: a.averageHeartRate,
      }));
      return jsonResult({ afterDate, activities, count: activities.length });
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────

function defaultStartDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ── Types ───────────────────────────────────────────────────

type FitbitProfile = {
  displayName?: string;
  age?: number;
  gender?: string;
  height?: number;
  weight?: number;
  averageDailySteps?: number;
  memberSince?: string;
  timezone?: string;
};

type FitbitActivitySummary = {
  steps?: number;
  caloriesOut?: number;
  distances?: { activity: string; distance: number }[];
  floors?: number;
  fairlyActiveMinutes?: number;
  veryActiveMinutes?: number;
  lightlyActiveMinutes?: number;
  sedentaryMinutes?: number;
  restingHeartRate?: number;
};

type FitbitHeartDay = {
  dateTime?: string;
  value?: {
    restingHeartRate?: number;
    heartRateZones?: {
      name: string;
      min: number;
      max: number;
      minutes: number;
      caloriesOut: number;
    }[];
  };
};

type FitbitSleepLog = {
  startTime?: string;
  endTime?: string;
  duration?: number;
  efficiency?: number;
  minutesAsleep?: number;
  minutesAwake?: number;
  levels?: {
    summary?: {
      deep?: { minutes?: number };
      light?: { minutes?: number };
      rem?: { minutes?: number };
      wake?: { minutes?: number };
    };
  };
};

type FitbitSleepSummary = {
  totalMinutesAsleep?: number;
  totalSleepRecords?: number;
};

type FitbitActivityLog = {
  activityName?: string;
  startTime?: string;
  duration?: number;
  activeDuration?: number;
  calories?: number;
  steps?: number;
  distance?: number;
  distanceUnit?: string;
  averageHeartRate?: number;
};
