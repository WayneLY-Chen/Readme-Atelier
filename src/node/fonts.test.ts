import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { measureAdvanceWidth } from "../core/font.js";
import { loadAllFonts } from "./fonts.js";

// This file's own doc comment (fonts.ts) is the authority for why this
// module — and only this module in src/node — is allowed to touch
// process.cwd()/fs at all: src/cli.ts's local preview relies on the default
// argument resolving to the repo root, while a real Action run needs an
// explicit baseDir. Both contracts had zero direct assertions before this
// plan (04-04 Task 2) even though loadAllFonts()'s default-argument path was
// already exercised indirectly by every widget test's beforeAll(loadAllFonts)
// call, which is why the coverage report showed this file at 100% statement
// coverage before this file existed — a genuinely misleading number the plan
// asked to record, not chase (see 04-04-SUMMARY.md).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const EXPECTED_FACES = ["mono-regular", "mono-semibold", "serif", "noto-tc"];

describe("loadAllFonts — default base directory (src/cli.ts's local-preview contract)", () => {
  it("populates every expected face so a subsequent text-to-path call succeeds", () => {
    // process.cwd() during `npm test` is this repo's own root, matching
    // src/cli.ts's real-world assumption (a local `npm run preview` run
    // FROM this repo's checkout).
    expect(() => loadAllFonts()).not.toThrow();
    for (const name of EXPECTED_FACES) {
      expect(() => measureAdvanceWidth(name, "A", 16)).not.toThrow();
    }
  });
});

describe("loadAllFonts — explicit base directory (src/action-entry.ts's real-Action contract)", () => {
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Simulate a real Action run: the process's cwd is the CONSUMER's
    // checked-out workspace (here, a freshly created empty temp directory
    // with no assets/ at all), never this repo. If loadAllFonts() were
    // silently falling back to process.cwd() instead of honouring an
    // explicit baseDir argument, every case in this describe block would
    // fail with ENOENT against the bogus cwd below.
    const bogusCwd = mkdtempSync(path.join(tmpdir(), "readme-atelier-bogus-cwd-"));
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(bogusCwd);
  });

  afterEach(() => {
    const bogusCwd = cwdSpy.mock.results[0]?.value as string | undefined;
    cwdSpy.mockRestore();
    if (bogusCwd) {
      rmSync(bogusCwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  it("is honoured over process.cwd(), matching what a real Actions run depends on", () => {
    expect(() => loadAllFonts(repoRoot)).not.toThrow();
    for (const name of EXPECTED_FACES) {
      expect(() => measureAdvanceWidth(name, "A", 16)).not.toThrow();
    }
  });
});

describe("loadAllFonts — a base directory with no font assets (genuine error path)", () => {
  let emptyDir: string;

  beforeEach(() => {
    emptyDir = mkdtempSync(path.join(tmpdir(), "readme-atelier-no-fonts-"));
  });

  afterEach(() => {
    rmSync(emptyDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  it("fails with an error naming the missing path, rather than silently producing a renderer with no glyphs", () => {
    let caught: unknown;
    try {
      loadAllFonts(emptyDir);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(
      path.join(emptyDir, "assets/fonts/ibm-plex-mono-regular.subset.ttf"),
    );
  });
});
