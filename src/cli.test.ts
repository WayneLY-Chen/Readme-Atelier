import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CLI_PATH = resolve(REPO_ROOT, "src/cli.ts");

// Resolved as an absolute file:// URL (not the bare specifier "tsx/esm"):
// Node resolves `--import` specifiers relative to the spawned process's
// cwd, which below is a temp directory outside this repo's node_modules
// tree — a bare specifier would fail with ERR_MODULE_NOT_FOUND there. A raw
// Windows filesystem path (`C:\...`) is also rejected by Node's ESM loader
// for `--import` (ERR_UNSUPPORTED_ESM_URL_SCHEME) — it must be a real
// `file://` URL.
const TSX_ESM_LOADER = pathToFileURL(
  createRequire(import.meta.url).resolve("tsx/esm"),
).href;

/**
 * A `NODE_OPTIONS=--import=...` preload that throws the moment anything
 * calls `fetch()`. Injected into every subprocess run below as a real
 * runtime assertion — not just an absence-of-import check — that the
 * zero-capability Almanac path never reaches the network (DATA-03's
 * extended guarantee, exercised through the real CLI entry point rather
 * than a mocked/in-process call).
 */
const NO_NETWORK_PRELOAD = join(tmpdir(), "readme-atelier-cli-test-no-network.mjs");
writeFileSync(
  NO_NETWORK_PRELOAD,
  'globalThis.fetch = () => { throw new Error("DATA-03 violation: fetch() was called for a zero-capability render"); };\n',
  "utf8",
);
const NO_NETWORK_NODE_OPTIONS = `--import=${pathToFileURL(NO_NETWORK_PRELOAD).href}`;

/**
 * A `NODE_OPTIONS=--import=...` preload that stubs `globalThis.fetch` with a
 * literal, GitHub-shaped success response instead of throwing (Plan 02-03
 * Task 3) — the opposite of `NO_NETWORK_PRELOAD` above. Every call is
 * recorded (count + the sent GraphQL `query`/`variables`) to the file named
 * by `READU_STUB_FETCH_LOG` (set per-test, not at preload-write time, so
 * each test gets its own isolated log without needing a separate preload
 * file per test). The response echoes `variables.login` back as `user.login`
 * so a test can assert the real `GITHUB_LOGIN` env var value flowed all the
 * way through `cli.ts` -> `fetchSharedData` -> `fetchProfileData` -> the
 * actual GraphQL variables sent over the wire.
 */
const STUB_FETCH_PRELOAD = join(tmpdir(), "readme-atelier-cli-test-stub-fetch.mjs");
writeFileSync(
  STUB_FETCH_PRELOAD,
  [
    'import { appendFileSync } from "node:fs";',
    "globalThis.fetch = async (_url, init) => {",
    "  const logPath = process.env.READU_STUB_FETCH_LOG;",
    "  const bodyText = (init && init.body) || \"{}\";",
    "  if (logPath) {",
    "    appendFileSync(logPath, bodyText + \"\\n\");",
    "  }",
    "  let parsed = {};",
    "  try { parsed = JSON.parse(String(bodyText)); } catch {}",
    "  const login = (parsed && parsed.variables && parsed.variables.login) || \"\";",
    "  const responseBody = {",
    "    data: {",
    "      user: {",
    "        login,",
    "        name: null,",
    "        avatarUrl: \"\",",
    "        followers: { totalCount: 9 },",
    "        contributionsCollection: {",
    "          restrictedContributionsCount: 0,",
    "          commitContributionsByRepository: [",
    "            { contributions: { totalCount: 3 }, repository: { isFork: false } },",
    "          ],",
    "          issueContributionsByRepository: [],",
    "          pullRequestContributionsByRepository: [],",
    "        },",
    "        repositories: { nodes: [{ stargazerCount: 7 }] },",
    "      },",
    "      rateLimit: { cost: 5, limit: 5000, remaining: 4995 },",
    "    },",
    "  };",
    "  return new Response(JSON.stringify(responseBody), {",
    "    status: 200,",
    "    headers: { \"content-type\": \"application/json\" },",
    "  });",
    "};",
    "",
  ].join("\n"),
  "utf8",
);
const STUB_FETCH_NODE_OPTIONS = `--import=${pathToFileURL(STUB_FETCH_PRELOAD).href}`;

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Run the real `src/cli.ts` entry point as a subprocess via
 * `node --import tsx/esm`, rather than the `tsx` CLI shim/`.cmd` wrapper:
 * `execFileSync`/`spawnSync` on Windows cannot invoke a `.cmd` file
 * directly (it is a batch script, not a native executable) without `shell:
 * true`, and `shell: true` reintroduces its own argument-escaping hazards.
 * Loading tsx's own ESM loader directly into a real `node` process
 * sidesteps both problems — this is the same underlying mechanism the
 * `tsx` CLI itself uses — and combines cleanly with the no-network
 * `NODE_OPTIONS` preload above (Node merges multiple `--import` sources).
 *
 * Uses `spawnSync` (not `execFileSync`) specifically so BOTH stdout and
 * stderr are captured regardless of exit status — `execFileSync` only
 * returns stdout on success and throws away stdout on failure, which would
 * make the "prints a formatted error to stderr, exits non-zero" test case
 * impossible to assert on directly.
 */
function runCli(args: string[], cwd: string): CliResult {
  const result = spawnSync(process.execPath, ["--import", TSX_ESM_LOADER, CLI_PATH, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: NO_NETWORK_NODE_OPTIONS },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Same real-subprocess mechanism as `runCli`, generalized for Plan 02-03
 * Task 3's tests: a caller-chosen `NODE_OPTIONS` preload (the stub-fetch one
 * above, or the pre-existing `NO_NETWORK_PRELOAD`) and explicit env
 * overrides — `unset` names are deleted from the inherited `process.env`
 * entirely (not set to `undefined`, which `spawnSync`'s `env` option cannot
 * represent) so a test can assert the "credentials genuinely absent" case
 * even if the outer test-runner's own environment happens to define them.
 */
function runCliWithEnv(
  args: string[],
  cwd: string,
  nodeOptions: string,
  env: Record<string, string> = {},
  unset: string[] = [],
): CliResult {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env, NODE_OPTIONS: nodeOptions };
  for (const key of unset) {
    delete childEnv[key];
  }
  const result = spawnSync(process.execPath, ["--import", TSX_ESM_LOADER, CLI_PATH, ...args], {
    cwd,
    encoding: "utf8",
    env: childEnv,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const tmpDirs: string[] = [];

/**
 * A fresh, empty working directory per test — `.preview/` and `widgets.yml`
 * are written and read relative to this, never the real repo root
 * (acceptance criteria: these tests must not pollute or depend on it).
 * `assets/fonts/*.subset.ttf` is copied in because `node/fonts.ts` reads
 * font bytes via a path relative to `process.cwd()`, and the CLI subprocess
 * above runs with `cwd` set to this directory, not the repo root.
 */
function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "readme-atelier-cli-test-"));
  tmpDirs.push(dir);
  cpSync(join(REPO_ROOT, "assets"), join(dir, "assets"), { recursive: true });
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("Plan 04 Task 3: cli.ts — real widgets.yml wiring (UX-04)", () => {
  it(
    "no widgets.yml present: applies D-11 defaults, prints the full equivalent YAML, and writes both Almanac preview files",
    () => {
      const dir = makeTmpDir();

      const result = runCli(["widgets.yml"], dir);

      expect(result.status).toBe(0);

      // D-11: the run prints a complete, copy-pasteable equivalent config,
      // honestly framed as a snapshot rather than a live/continuously
      // updated preview (must_haves transparency prohibition).
      expect(result.stdout).toContain("cards:");
      expect(result.stdout).toContain("almanac");
      expect(result.stdout).not.toMatch(/即時|持續更新|live preview/i);

      expect(existsSync(join(dir, ".preview/almanac-light.svg"))).toBe(true);
      expect(existsSync(join(dir, ".preview/almanac-dark.svg"))).toBe(true);
      expect(readFileSync(join(dir, ".preview/almanac-light.svg"), "utf8")).toContain("<path");
    },
    30_000,
  );

  it(
    "an invalid widgets.yml: prints a D-12-formatted error, exits non-zero, and writes no .preview/* files at all",
    () => {
      const dir = makeTmpDir();
      writeFileSync(join(dir, "widgets.yml"), "cards:\n  - type: almanc\n", "utf8");

      const result = runCli(["widgets.yml"], dir);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("widgets.yml 設定有誤");
      expect(result.stderr).toContain("almanc");

      // Validate-before-write: no .preview directory should exist at all,
      // not just an empty one.
      expect(existsSync(join(dir, ".preview"))).toBe(false);
    },
    30_000,
  );

  it(
    "an existing, empty cards: [] renders zero cards and warns, rather than erroring or falling back to defaults",
    () => {
      const dir = makeTmpDir();
      writeFileSync(join(dir, "widgets.yml"), "cards: []\n", "utf8");

      const result = runCli(["widgets.yml"], dir);

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("zero cards");
      // No card output exists (nothing to render).
      expect(existsSync(join(dir, ".preview/almanac-light.svg"))).toBe(false);
    },
    30_000,
  );
});

describe("Plan 02-03 Task 3: cli.ts real end-to-end wiring (resolveCards -> fetchSharedData -> renderAllCards)", () => {
  it(
    "a widgets.yml enabling almanac + editorial-stat-card, with GITHUB_TOKEN/GITHUB_LOGIN set: fetches exactly once, sends user(login) with the real login, and writes all four .preview/* files",
    () => {
      const dir = makeTmpDir();
      writeFileSync(
        join(dir, "widgets.yml"),
        "cards:\n  - type: almanac\n  - type: editorial-stat-card\n",
        "utf8",
      );
      const logPath = join(dir, "fetch-calls.log");

      const result = runCliWithEnv(["widgets.yml"], dir, STUB_FETCH_NODE_OPTIONS, {
        GITHUB_TOKEN: "fake-pat-value",
        GITHUB_LOGIN: "octocat",
        READU_STUB_FETCH_LOG: logPath,
      });

      expect(result.status).toBe(0);

      expect(existsSync(join(dir, ".preview/almanac-light.svg"))).toBe(true);
      expect(existsSync(join(dir, ".preview/almanac-dark.svg"))).toBe(true);
      expect(existsSync(join(dir, ".preview/editorial-stat-card-light.svg"))).toBe(true);
      expect(existsSync(join(dir, ".preview/editorial-stat-card-dark.svg"))).toBe(true);
      expect(readFileSync(join(dir, ".preview/editorial-stat-card-light.svg"), "utf8")).toContain(
        "<path",
      );

      const logLines = readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
      // DATA-01's core guarantee, proven through a real subprocess and a real
      // network-layer interception — not just by reading the pipeline's own
      // source structure.
      expect(logLines).toHaveLength(1);

      const sentBody = JSON.parse(logLines[0] as string) as { query: string; variables: { login: string } };
      expect(sentBody.query).toContain("user(login");
      expect(sentBody.query).not.toContain("viewer");
      expect(sentBody.variables.login).toBe("octocat");
    },
    30_000,
  );

  it(
    "the same widgets.yml WITHOUT GITHUB_TOKEN/GITHUB_LOGIN: exits non-zero, names the missing env vars, and writes no .preview/* files",
    () => {
      const dir = makeTmpDir();
      writeFileSync(
        join(dir, "widgets.yml"),
        "cards:\n  - type: almanac\n  - type: editorial-stat-card\n",
        "utf8",
      );

      // NO_NETWORK_PRELOAD, not the stub: if the missing-credentials check
      // were ever accidentally skipped, this would fail loudly (a thrown
      // fetch) instead of silently succeeding against the stub.
      const result = runCliWithEnv(["widgets.yml"], dir, NO_NETWORK_NODE_OPTIONS, {}, [
        "GITHUB_TOKEN",
        "GITHUB_LOGIN",
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("GITHUB_TOKEN");
      expect(result.stderr).toContain("GITHUB_LOGIN");
      expect(existsSync(join(dir, ".preview"))).toBe(false);
    },
    30_000,
  );

  it(
    "an almanac-only (zero-capability) widgets.yml still needs no GITHUB_TOKEN/GITHUB_LOGIN and never touches the network (DATA-03 regression, unaffected by the new pipeline shape)",
    () => {
      const dir = makeTmpDir();
      writeFileSync(join(dir, "widgets.yml"), "cards:\n  - type: almanac\n", "utf8");

      const result = runCliWithEnv(["widgets.yml"], dir, NO_NETWORK_NODE_OPTIONS, {}, [
        "GITHUB_TOKEN",
        "GITHUB_LOGIN",
      ]);

      expect(result.status).toBe(0);
      expect(existsSync(join(dir, ".preview/almanac-light.svg"))).toBe(true);
      expect(existsSync(join(dir, ".preview/almanac-dark.svg"))).toBe(true);
    },
    30_000,
  );
});
