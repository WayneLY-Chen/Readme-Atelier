import * as core from "@actions/core";
import { writeStepSummary } from "./step-summary.js";

/**
 * D-04: log GraphQL point cost to BOTH surfaces — `core.info` (plain Actions
 * log line, what `console.log`/`npm run preview` users see too) and
 * `GITHUB_STEP_SUMMARY` (Markdown job summary, what a consumer actually
 * looks at without digging into raw Actions logs). The two messages are
 * allowed to differ in format (plain text vs. Markdown) — D-04 only requires
 * both surfaces receive the number, not that they receive identical text.
 *
 * `deps` lets tests substitute fakes for both sinks without needing a real
 * `GITHUB_STEP_SUMMARY` file or capturing `@actions/core`'s stdout — the same
 * injectable-dependency shape `publish.ts`'s `execFn` established in Phase 1.
 * Production callers omit `deps` and get the real `core.info`/
 * `writeStepSummary` (which is itself a safe no-op outside a real Actions
 * run — see `node/step-summary.ts`'s own doc comment).
 */
export function logPointCost(
  cost: number,
  deps?: { info?: (message: string) => void; summary?: (content: string) => void },
): void {
  const info = deps?.info ?? core.info;
  const summary = deps?.summary ?? writeStepSummary;

  info(`GraphQL point cost for this run: ${cost}`);
  summary(`**GraphQL point cost:** ${cost}`);
}
