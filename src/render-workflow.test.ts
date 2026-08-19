import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const renderPath = path.join(repoRoot, ".github", "workflows", "render.yml");
const renderText = readFileSync(renderPath, "utf8");
const render = parseYaml(renderText) as {
  on?: { workflow_call?: { inputs?: Record<string, { default?: string; required?: boolean; type?: string }> } };
  jobs?: Record<string, { steps?: Array<{ uses?: string }> }>;
};

const cardsPath = path.join(repoRoot, ".github", "workflows", "cards.yml");
const cardsText = readFileSync(cardsPath, "utf8");

/**
 * These assertions exist because `render.yml` is the single highest-risk
 * artifact this phase ships: it is the reusable workflow strangers paste
 * `uses: WayneLY-Chen/Readme-Atelier/.github/workflows/render.yml@v1` at,
 * and once published at `@v1` its path and inputs are a one-way contract.
 *
 * The specific failure mode this file guards against (RESEARCH.md
 * Pitfall 1) is copying this repo's own `.github/workflows/cards.yml`
 * verbatim, which uses `uses: ./` for self-checkout dogfooding. Inside a
 * reusable workflow invoked from a SECOND repository, the github context
 * (and therefore the checkout `./` resolves against) belongs to the
 * CALLER, not this repository - `./` would silently resolve to the
 * adopter's checkout, where action.yml does not exist, and the job would
 * fail outright the first time a real stranger ever used it. Nothing in
 * local development or this repo's own dogfood run (cards.yml) can catch
 * that, because dogfooding is exactly the one case where `./` happens to
 * be correct - the same shape of blind spot as the Phase 4 stale-dist
 * incident (a local pass masking a runner-only failure).
 */
describe("render.yml — the published @v1 reusable workflow contract", () => {
  it("is valid YAML declaring on.workflow_call", () => {
    expect(render.on?.workflow_call).toBeDefined();
  });

  it("declares a config-path input, optional, defaulting to widgets.yml", () => {
    const configPath = render.on?.workflow_call?.inputs?.["config-path"];
    expect(configPath).toBeDefined();
    expect(configPath?.required).toBe(false);
    expect(configPath?.default).toBe("widgets.yml");
  });

  it("contains no local (`./`) action reference on any line — the #1 cross-repo pitfall", () => {
    const offending = renderText
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => !line.trim().startsWith("#") && /uses:\s*\.\//.test(line));

    expect(
      offending,
      `render.yml must never reference an action via a local './' path — a local reference ` +
        `resolves against the CALLER's checkout when invoked cross-repo, not this repository. ` +
        `Found on line(s): ${offending.map((o) => o.n).join(", ")}`,
    ).toEqual([]);
  });

  it("has a step whose uses: is the fully-qualified WayneLY-Chen/Readme-Atelier@v1 reference", () => {
    const steps = Object.values(render.jobs ?? {}).flatMap((job) => job.steps ?? []);
    const usesValues = steps.map((step) => step.uses).filter((v): v is string => Boolean(v));

    expect(usesValues).toContain("WayneLY-Chen/Readme-Atelier@v1");
  });

  it("still contains the config-path input wired through as an expression", () => {
    expect(renderText).toContain("config-path");
    expect(renderText).toContain("WayneLY-Chen/Readme-Atelier@v1");
  });
});

/**
 * Drift guard for the Open Question 1 ruling: cards.yml intentionally keeps
 * testing HEAD via `uses: ./` self-checkout dogfooding, and must not be
 * "fixed" to match render.yml's fully-qualified form — the two files serve
 * different purposes (dogfood HEAD vs. published @v1 contract) on purpose.
 */
describe("cards.yml — self-checkout dogfood reference is unchanged (Open Question 1)", () => {
  it("still uses the local './' action reference", () => {
    expect(cardsText).toMatch(/uses:\s*\.\//);
  });
});
