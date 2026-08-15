import { describe, expect, it } from "vitest";
import viteConfigModule from "../vitest.config.js";

/**
 * QA-01 / RESEARCH.md Pitfall 3: Vitest 4's default coverage report shows
 * only files a test happened to import — a source file with zero tests is
 * invisible rather than reported at 0%, which would hide exactly the
 * never-tested logic QA-01 exists to find. `coverage.include` is what makes
 * a never-imported file visible in the report at all.
 *
 * This test is the permanent guard against a future "simplify the config"
 * edit silently removing or narrowing that key: without it, the report would
 * quietly shrink and nothing would fail.
 */
describe("vitest.config.ts — coverage block (QA-01)", () => {
  // `defineConfig` in this project's vitest.config.ts returns the plain
  // config object synchronously (no function/promise form is used), so the
  // default export can be read directly without invoking anything.
  const config = viteConfigModule as unknown as {
    test?: {
      coverage?: {
        provider?: string;
        include?: string[];
        exclude?: string[];
        reporter?: string[];
        thresholds?: unknown;
        lines?: unknown;
        functions?: unknown;
        branches?: unknown;
      };
    };
  };
  const coverage = config.test?.coverage;

  it("has a coverage block on test", () => {
    expect(coverage).toBeDefined();
  });

  it("uses the v8 provider", () => {
    expect(coverage?.provider).toBe("v8");
  });

  it("includes the whole src TypeScript tree, so a never-imported file still appears in the report", () => {
    expect(coverage?.include).toBeDefined();
    expect(coverage?.include).toContain("src/**/*.ts");
  });

  it("excludes test files and the ambient declaration file", () => {
    expect(coverage?.exclude).toContain("src/**/*.test.ts");
    expect(coverage?.exclude).toContain("src/vendor.d.ts");
  });

  it("has no numeric coverage gate (user explicitly declined one)", () => {
    expect(coverage?.thresholds).toBeUndefined();
    expect(coverage?.lines).toBeUndefined();
    expect(coverage?.functions).toBeUndefined();
    expect(coverage?.branches).toBeUndefined();
  });
});
