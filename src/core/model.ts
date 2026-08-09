/**
 * The slice of ProfileData a widget declares it needs. The core unions this
 * across every enabled widget before doing a single shared GitHub fetch.
 */
/**
 * "identity" (MAST-01, added Phase 3): declares no new GraphQL fragment
 * of its own — `core/fetch.ts`'s `buildQuery` already sends `user { login
 * name avatarUrl followers {...} }` unconditionally whenever
 * `capabilities.size > 0`. Declaring this capability exists ONLY to move a
 * masthead-only (or masthead + other zero-capability cards) render OUT of
 * `collectCapabilities(...).size === 0`'s zero-fetch fast path, since the
 * masthead needs a real `data.login` to print the subtitle.
 *
 * "repoList" (CARD-03, added Phase 3): The Graveyard's repo-list query —
 * see `core/fetch.ts`'s `REPO_LIST_FRAGMENT`. Fetches unconditionally at
 * `privacy: PUBLIC` (DATA-05's private-data boundary, extended to this new
 * capability — see 03-02-PLAN.md prohibitions).
 */
export type DataCapability = "stats" | "calendar" | "commitTimestamps" | "languages" | "identity" | "repoList";

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
  /**
   * Only populated when "repoList" is a requested capability (CARD-03). Raw,
   * unfiltered pass-through of the GraphQL response's `pushedAt` — `null`
   * when a repository has never received a push. Interpreting `null` (e.g.
   * falling back to `createdAt` for the 180-day burial threshold) is the
   * consuming widget's (The Graveyard, Plan 03-04) responsibility, not
   * `core/fetch.ts`'s — see RESEARCH.md's "core only composes queries,
   * widgets interpret ProfileData" boundary.
   */
  repositories?: { name: string; nameWithOwner: string; url: string; createdAt: string; pushedAt: string | null; isFork: boolean }[];
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
  /**
   * NEW, optional (MAST-01/02/03). Only set when a `name === "masthead"`
   * widget is present in the enabled set (`core/pipeline.ts`'s
   * `renderAllCards`) — every widget must treat `undefined` as "masthead is
   * off, render nothing extra," never as `0`. Always set together with
   * `totalPages` or not at all (see `PageNumberInvariantError`).
   */
  pageNumber?: number;
  totalPages?: number;
}
