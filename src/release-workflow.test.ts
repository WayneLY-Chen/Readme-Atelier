import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releasePath = path.join(repoRoot, ".github", "workflows", "release.yml");
const releaseText = readFileSync(releasePath, "utf8");
const release = parseYaml(releaseText) as {
  on?: { release?: { types?: string[] } };
  jobs?: Record<string, { steps?: Array<{ name?: string; run?: string; env?: Record<string, unknown> }> }>;
};

const ciPath = path.join(repoRoot, ".github", "workflows", "ci.yml");
const ciText = readFileSync(ciPath, "utf8");

/**
 * These assertions exist because of the Phase 4 incident: a shipped Action
 * ran two-phases-stale `dist/index.js` with no automated check catching the
 * drift before release. release.yml is the structural fix - rebuild from
 * source, compare against the committed bundle, and only move the v1 tag if
 * they match. This file guards that the workflow actually enforces the
 * guarantee it claims to, not just that it exists.
 */
describe("release.yml — DIST-02 release-triggered v1 move", () => {
  it("triggers only on release published events", () => {
    expect(release.on?.release?.types).toContain("published");
  });

  const allSteps = Object.values(release.jobs ?? {}).flatMap((job) => job.steps ?? []);
  const runLines = allSteps.map((step) => step.run).filter((v): v is string => Boolean(v));

  it("rebuilds via the full npm run build script", () => {
    expect(runLines.some((run) => run.includes("npm run build"))).toBe(true);
  });

  it("never invokes ncc directly — a partial rebuild silently drops postbuild vendoring", () => {
    // A run: block that calls `ncc build` (or similar) directly instead of
    // going through `npm run build` would rebuild without postbuild.ts's
    // vendoring step, making the dist comparison below meaninglessly pass
    // against an incomplete bundle. Guard against a future "optimization"
    // that reintroduces that half-rebuild.
    const callsNccDirectly = runLines.some((run) => /(^|\s)ncc\s+build/.test(run));
    expect(callsNccDirectly).toBe(false);
  });

  it("compares the rebuilt dist/ against the committed bundle", () => {
    expect(runLines.some((run) => run.includes("git diff --exit-code dist/"))).toBe(true);
  });

  it("moves the v1 tag via git tag -fa and force-pushes it", () => {
    expect(runLines.some((run) => run.includes("git tag -fa v1"))).toBe(true);
    expect(runLines.some((run) => run.includes("git push origin v1 --force"))).toBe(true);
  });

  it("passes the release tag_name through env:, never interpolated directly in run:", () => {
    // Workflow script injection guard: github.event.release.tag_name is an
    // externally-controlled string. The Move v1 step's run: block must
    // reference it only via the env-derived shell variable, never via a
    // direct ${{ }} expression substitution inside the script.
    const moveV1Step = allSteps.find((step) => step.name === "Move v1");
    expect(moveV1Step).toBeDefined();
    expect(moveV1Step?.env).toBeDefined();
    expect(Object.values(moveV1Step?.env ?? {})).toContain("${{ github.event.release.tag_name }}");
    expect(moveV1Step?.run ?? "").not.toContain("${{");
  });
});

describe("ci.yml — PR-time dist-staleness second layer of defense", () => {
  it("also runs the dist comparison", () => {
    expect(ciText).toContain("git diff --exit-code dist/");
  });
});
