import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "action.yml");
const manifestText = readFileSync(manifestPath, "utf8");
const manifest = parseYaml(manifestText) as {
  name: string;
  description: string;
  inputs: Record<string, { required?: boolean; default?: string; description?: string }>;
  runs: { using: string; main: string };
};

/**
 * These assertions exist because `action.yml` is the ONE file in this repository
 * that neither `tsc` nor the rest of the test suite can reach. It is consumed by
 * GitHub's workflow parser, not by any code here, so a mistake in it is invisible
 * locally and only surfaces as a failed run on a real runner.
 *
 * That is not hypothetical: the first real Actions run of this project failed
 * with `Unrecognized named-value: 'github'` because the `github-token` input's
 * DESCRIPTION contained the literal text `${'$'}{{ github.token }}` as
 * documentation. GitHub evaluates every expression in this file, the `github`
 * context does not exist at action-metadata level, and the whole action failed
 * to load - not the step, the entire action. Documentation prose broke the
 * program.
 */
describe("action.yml", () => {
  it("contains no ${{ }} expressions anywhere, including inside descriptions", () => {
    // GitHub evaluates expressions in this file, and almost no context is
    // available here. Writing one - even as an example in prose - makes the
    // action fail to load. Documentation belongs in README/docs, not here.
    const offending = manifestText
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => line.includes("${{"));

    expect(
      offending,
      `action.yml must contain no \${{ }} expressions; found on line(s) ${offending
        .map((o) => o.n)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("declares runs.using node24 and a main that exists on disk", () => {
    // node20 is being removed from GitHub runners; node24 is the current target
    // and matches the Node version this project is developed against.
    expect(manifest.runs.using).toBe("node24");
    expect(existsSync(path.join(repoRoot, manifest.runs.main))).toBe(true);
  });

  it("declares every input that action-entry.ts actually reads", () => {
    // Drift guard: an input read by the code but undeclared here silently
    // resolves to "" at runtime, which for `github-token` means an
    // unauthenticated push that fails late, after every card has rendered.
    const entry = readFileSync(path.join(repoRoot, "src", "action-entry.ts"), "utf8");
    const read = [...entry.matchAll(/getInput\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);

    expect(read.length).toBeGreaterThan(0);
    for (const name of read) {
      expect(Object.keys(manifest.inputs), `action-entry.ts reads input "${name}"`).toContain(name);
    }
  });

  it("marks github-token required and gives config-path a default", () => {
    expect(manifest.inputs["github-token"]?.required).toBe(true);
    expect(manifest.inputs["config-path"]?.default).toBe("widgets.yml");
  });

  it("declares profile-login as optional with no default (GAP-05-01: fallback is code-computed from the repo owner, not a manifest default)", () => {
    expect(manifest.inputs["profile-login"]).toBeDefined();
    expect(manifest.inputs["profile-login"]?.required).toBe(false);
    expect(manifest.inputs["profile-login"]?.default).toBeUndefined();
  });
});

/**
 * Plan 02-03 Task 3: source-level proof that `action-entry.ts` really wires
 * the new three-stage pipeline (resolveCards -> fetchSharedData ->
 * renderAllCards), the new Editorial Stat Card widget, the dual-surface
 * point-cost logger, and the token-safe fetch-failure formatter — not just
 * `cli.ts`. Same "read the source, grep for the identifier" style this file
 * already uses above for `action.yml`'s own drift guards.
 *
 * Phase 5 Plan 01: the five individual `register(xxxWidget)` calls this
 * block used to assert directly on `entrySource` were consolidated into
 * `src/widgets/all.ts`'s `registerAllWidgets()` (QA-03/D-12 — one
 * registration list, not three hand-copied ones). The drift guard's
 * protection is unchanged, only its target moved: `action-entry.ts` is now
 * asserted to call `registerAllWidgets(`, and the five individual
 * `register(...)` lines are asserted directly against `src/widgets/all.ts`'s
 * own source instead.
 */
describe("action-entry.ts — Plan 02-03 pipeline wiring (DATA-01/02/07)", () => {
  const entrySource = readFileSync(path.join(repoRoot, "src", "action-entry.ts"), "utf8");
  const allWidgetsSource = readFileSync(path.join(repoRoot, "src", "widgets", "all.ts"), "utf8");

  it("registers every built-in widget via registerAllWidgets()", () => {
    expect(entrySource).toContain("registerAllWidgets(");
  });

  it("src/widgets/all.ts registers the Almanac widget", () => {
    expect(allWidgetsSource).toContain("register(almanacWidget)");
  });

  it("src/widgets/all.ts registers the Editorial Stat Card widget", () => {
    expect(allWidgetsSource).toContain("register(editorialStatCardWidget)");
  });

  it("src/widgets/all.ts registers the masthead widget (Phase 3, MAST-01/02)", () => {
    expect(allWidgetsSource).toContain("register(mastheadWidget)");
  });

  it("src/widgets/all.ts registers the-graveyard widget (Phase 3, CARD-03)", () => {
    expect(allWidgetsSource).toContain("register(theGraveyardWidget)");
  });

  it("src/widgets/all.ts registers the-record widget (Phase 4, CARD-04)", () => {
    expect(allWidgetsSource).toContain("register(theRecordWidget)");
  });

  it("calls resolveCards(), fetchSharedData(), and logPointCost() — not the old single-call renderAllCards(config, ...) shape", () => {
    expect(entrySource).toContain("resolveCards(");
    expect(entrySource).toContain("fetchSharedData(");
    expect(entrySource).toContain("logPointCost(");
  });

  it("formats fetch failures via formatFetchFailureMessage() rather than serializing the raw error", () => {
    expect(entrySource).toContain("formatFetchFailureMessage(");
  });
});

/**
 * GAP-05-01 source-level wiring proof, same "read the source, grep for the
 * identifier" style as the block above. `action-entry.ts`'s own top-level
 * `await run()` makes it unsafe to import directly in a test (it would
 * execute a real Action run) — `resolveProfileLogin`'s actual behavior is
 * unit-tested directly in `src/core/profile-login.test.ts`; this only
 * proves action-entry.ts calls it, reads the new input, and keeps the
 * unrelated `owner`/`GITHUB_REPOSITORY` publish-target read (T-01-11)
 * completely separate from it.
 */
describe("action-entry.ts — GAP-05-01 profile-login wiring", () => {
  const entrySource = readFileSync(path.join(repoRoot, "src", "action-entry.ts"), "utf8");

  it("reads the profile-login input and resolves it via resolveProfileLogin()", () => {
    expect(entrySource).toContain('core.getInput("profile-login")');
    expect(entrySource).toContain("resolveProfileLogin(");
  });

  it("still derives owner exclusively from GITHUB_REPOSITORY — T-01-11's publish-target boundary is untouched", () => {
    expect(entrySource).toContain("process.env.GITHUB_REPOSITORY");
    expect(entrySource).toContain('const owner = repo.split("/")[0];');
  });

  it("passes the resolved profileLogin (not owner) into fetchSharedData()", () => {
    expect(entrySource).toContain("fetchSharedData(cards, token, profileLogin, now)");
  });

  it("passes a loginHint into formatFetchFailureMessage() on fetch failure, so org-repo guidance can be appended", () => {
    expect(entrySource).toMatch(/formatFetchFailureMessage\(error,\s*\{\s*login:\s*profileLogin/);
  });
});
