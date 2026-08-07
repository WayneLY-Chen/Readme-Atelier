import { appendFileSync } from "node:fs";

/**
 * Appends `content` (plus a trailing newline) to the file at
 * `GITHUB_STEP_SUMMARY` (D-14). Node-only I/O, kept out of `src/core/` per
 * the zero-fs boundary rule.
 *
 * When `GITHUB_STEP_SUMMARY` is unset — every context outside a real GitHub
 * Actions run, including local `npm test` and `npm run preview` — this is a
 * safe no-op rather than throwing, since nothing outside an Actions runner
 * defines that variable.
 */
export function writeStepSummary(content: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  appendFileSync(summaryPath, content + "\n");
}
