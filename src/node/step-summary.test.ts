import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeStepSummary } from "./step-summary.js";

// GITHUB_STEP_SUMMARY only exists inside a real GitHub Actions run — a local
// `npm test` or `npm run preview` never defines it, which is exactly the
// branch that had never been exercised before this plan (04-04 Task 2):
// point-cost.test.ts calls logPointCost() with the variable unset, covering
// the no-op return, but nothing had ever set the variable to a real file and
// checked the append actually happens.
const ORIGINAL_SUMMARY_ENV = process.env.GITHUB_STEP_SUMMARY;

describe("writeStepSummary — GITHUB_STEP_SUMMARY set to a real temp file", () => {
  let tempDir: string;
  let summaryFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "readme-atelier-step-summary-"));
    summaryFile = path.join(tempDir, "summary.md");
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
  });

  afterEach(() => {
    if (ORIGINAL_SUMMARY_ENV === undefined) {
      delete process.env.GITHUB_STEP_SUMMARY;
    } else {
      process.env.GITHUB_STEP_SUMMARY = ORIGINAL_SUMMARY_ENV;
    }
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  it("appends content plus a trailing newline to the file", () => {
    writeStepSummary("first line");
    expect(readFileSync(summaryFile, "utf8")).toBe("first line\n");
  });

  it("appends rather than truncates across repeated calls", () => {
    writeStepSummary("first line");
    writeStepSummary("second line");
    writeStepSummary("third line");
    expect(readFileSync(summaryFile, "utf8")).toBe("first line\nsecond line\nthird line\n");
  });

  it("appends onto pre-existing file content rather than overwriting it", () => {
    writeFileSync(summaryFile, "pre-existing content\n");
    writeStepSummary("appended line");
    expect(readFileSync(summaryFile, "utf8")).toBe("pre-existing content\nappended line\n");
  });
});

describe("writeStepSummary — GITHUB_STEP_SUMMARY unset (every context outside a real Actions run)", () => {
  beforeEach(() => {
    delete process.env.GITHUB_STEP_SUMMARY;
  });

  afterEach(() => {
    if (ORIGINAL_SUMMARY_ENV === undefined) {
      delete process.env.GITHUB_STEP_SUMMARY;
    } else {
      process.env.GITHUB_STEP_SUMMARY = ORIGINAL_SUMMARY_ENV;
    }
  });

  it("is a silent no-op — does not throw and touches no file", () => {
    expect(() => writeStepSummary("never written anywhere")).not.toThrow();
  });
});
