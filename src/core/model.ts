/**
 * The slice of ProfileData a widget declares it needs. The core unions this
 * across every enabled widget before doing a single shared GitHub fetch.
 */
export type DataCapability = "stats" | "calendar" | "commitTimestamps" | "languages";

export interface ProfileData {
  login: string;
  name: string | null;
  avatarUrl: string;
  followers: number;
  /** ISO timestamp of when this data was fetched. */
  fetchedAt: string;
  stats: {
    totalCommits: number;
    totalPRs: number;
    totalIssues: number;
    totalStars: number;
  };
  contributionCalendar?: { date: string; count: number }[];
  commitTimestamps?: string[];
  languages?: { name: string; color: string; bytes: number }[];
}

/**
 * Field names use the UI-SPEC's role vocabulary (paper/ink/accent/rule/muted)
 * — the authoritative source for THEME-02 in this phase — not
 * ARCHITECTURE.md's earlier draft names (background/text/border).
 */
export interface Theme {
  name: string;
  mode: "light" | "dark";
  paper: string;
  ink: string;
  accent: string;
  rule: string;
  muted: string;
}

export interface WidgetSize {
  width: number;
  height: number;
}

export interface RenderOptions {
  now: Date;
  seed: number;
  timezone: string;
  language: "en" | "zh-TW";
}
