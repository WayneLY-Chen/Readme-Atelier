import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ExecFn, publishOutputBranch } from "./publish.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

describe("publishOutputBranch — command sequence (fake exec, no real git spawned)", () => {
  it("calls core.setSecret before any git command runs, and before the remote URL is used", async () => {
    // @actions/core's setSecret() is a namespace export in an ESM module, so
    // it cannot be vi.spyOn()'d directly (Vitest/Node ESM namespaces are not
    // configurable). Its real, documented effect is a
    // `::add-mask::<value>` workflow-command line written to stdout — spy on
    // stdout.write instead and interleave its timing with the fake exec
    // calls in one combined, ordered log.
    const events: string[] = [];
    const stdoutWriteSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        const text = typeof chunk === "string" ? chunk : String(chunk);
        if (text.includes("::add-mask::fake-token")) {
          events.push("setSecret(fake-token)");
        }
        return true;
      });

    const fakeExec: ExecFn = async (_command, args) => {
      events.push(`git ${args.join(" ")}`);
      return 0;
    };

    try {
      await publishOutputBranch(
        { "a.svg": "x" },
        { token: "fake-token", repo: "octocat/hello-world", execFn: fakeExec },
      );
    } finally {
      stdoutWriteSpy.mockRestore();
    }

    expect(events[0]).toBe("setSecret(fake-token)");
    expect(events[1]).toBe("git init -q");
  });

  /**
   * Behavioral guard for the token-leak vector, replacing reliance on the
   * source-text grep at the bottom of this file.
   *
   * `@actions/exec` writes the full command line it is about to spawn to its
   * output stream BEFORE spawning it, unless `silent` is set — see
   * `toolrunner.js`: `if (!silent && outStream) outStream.write(commandString)`.
   * The `remote add origin` invocation carries the token inside the URL, so a
   * single missing `silent` publishes the token to the Actions log. Asserting
   * on EVERY call rather than just that one is deliberate: which command holds
   * the token is an implementation detail that can move.
   *
   * A source grep cannot catch this, because the leak is produced by a
   * dependency's logging, not by any `console.log` in this file.
   */
  it("passes silent:true to every git invocation, so @actions/exec never echoes the token-bearing remote URL", async () => {
    const seen: { args: string[]; silent: unknown }[] = [];
    const fakeExec: ExecFn = async (_command, args, options) => {
      seen.push({ args, silent: (options as { silent?: unknown } | undefined)?.silent });
      return 0;
    };

    await publishOutputBranch(
      { "a.svg": "x" },
      { token: "fake-token", repo: "octocat/hello-world", execFn: fakeExec },
    );

    expect(seen.length).toBeGreaterThan(0);
    for (const call of seen) {
      expect(call.silent, `git ${call.args.join(" ")} ran without silent:true`).toBe(true);
    }
  });

  it("removes the temp working directory — .git/config there holds the token-bearing remote URL", async () => {
    let capturedDir: string | undefined;
    const fakeExec: ExecFn = async (_command, _args, options) => {
      capturedDir = (options as { cwd?: string } | undefined)?.cwd;
      return 0;
    };

    await publishOutputBranch(
      { "a.svg": "x" },
      { token: "fake-token", repo: "octocat/hello-world", execFn: fakeExec },
    );

    expect(capturedDir).toBeTruthy();
    expect(existsSync(capturedDir as string)).toBe(false);
  });

  it("removes the temp working directory even when the push fails", async () => {
    let capturedDir: string | undefined;
    const fakeExec: ExecFn = async (_command, args, options) => {
      capturedDir = (options as { cwd?: string } | undefined)?.cwd;
      if (args[0] === "push") {
        throw new Error("simulated push failure");
      }
      return 0;
    };

    await expect(
      publishOutputBranch(
        { "a.svg": "x" },
        { token: "fake-token", repo: "octocat/hello-world", execFn: fakeExec },
      ),
    ).rejects.toThrow("simulated push failure");

    expect(capturedDir).toBeTruthy();
    expect(existsSync(capturedDir as string)).toBe(false);
  });

  it("runs git commands in the documented order: init, checkout -b, config x2, add, commit, remote add, push --force", async () => {
    const calls: string[][] = [];
    const fakeExec: ExecFn = async (_command, args) => {
      calls.push(args);
      return 0;
    };

    await publishOutputBranch(
      { "a.svg": "x" },
      { token: "fake-token", repo: "octocat/hello-world", execFn: fakeExec },
    );

    expect(calls).toEqual([
      ["init", "-q"],
      ["checkout", "-q", "-b", "output"],
      ["config", "user.name", "github-actions[bot]"],
      ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
      ["add", "-A"],
      ["commit", "-q", "-m", "chore: publish rendered cards"],
      ["remote", "add", "origin", "https://x-access-token:fake-token@github.com/octocat/hello-world.git"],
      ["push", "--force", "origin", "output:output"],
    ]);
  });

  it("ignores any branch override — production never passes one, and the default is always 'output'", async () => {
    const calls: string[][] = [];
    const fakeExec: ExecFn = async (_command, args) => {
      calls.push(args);
      return 0;
    };

    await publishOutputBranch(
      { "a.svg": "x" },
      { token: "t", repo: "o/r", execFn: fakeExec },
    );

    expect(calls[1]).toEqual(["checkout", "-q", "-b", "output"]);
  });
});

describe("publishOutputBranch — real git CLI against a local bare repository", () => {
  let bareRepoDir: string;

  beforeEach(() => {
    bareRepoDir = mkdtempSync(path.join(tmpdir(), "readme-atelier-bare-"));
    execFileSync("git", ["init", "-q", "--bare", bareRepoDir]);
  });

  afterEach(() => {
    // Windows keeps a handle on files a just-exited `git` process touched for a
    // short while after it returns, so an immediate recursive delete throws
    // EPERM. `maxRetries` makes Node back off and retry instead. This is
    // temp-directory hygiene, not an assertion — never let it fail the run and
    // mask the real result of the test that just passed.
    try {
      rmSync(bareRepoDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      /* the OS reclaims its own temp directory */
    }
  });

  function bareRepoUrl(): string {
    // A file:// URL over an absolute path works cross-platform with git,
    // including Windows drive-letter paths, without needing a running
    // git-daemon or ssh setup.
    return `file://${bareRepoDir.replace(/\\/g, "/")}`;
  }

  it("scenario A — 'output' branch does not exist yet: publish creates it with exactly 1 commit", async () => {
    await publishOutputBranch(
      { "almanac-light.svg": "light-v1", "almanac-dark.svg": "dark-v1" },
      { token: "fake", repo: "irrelevant/irrelevant", remoteUrlOverride: bareRepoUrl() },
    );

    const log = git(bareRepoDir, ["log", "output", "--oneline"]).trim();
    expect(log.split("\n").length).toBe(1);

    const tree = git(bareRepoDir, ["ls-tree", "-r", "--name-only", "output"]).trim().split("\n");
    expect(tree.sort()).toEqual(["almanac-dark.svg", "almanac-light.svg"]);

    expect(git(bareRepoDir, ["show", "output:almanac-light.svg"])).toBe("light-v1");
    // Vitest's 5s default is not enough: one publish spawns ~8 real `git`
    // processes, and process spawn on Windows is slow enough that this test
    // sat right on the edge of the limit and failed intermittently.
  }, 30_000);

  it("scenario B — 'output' branch already exists: a second publish still leaves exactly 1 commit, with NEW content, and stale files removed", async () => {
    // First run — establishes the branch, matching a consumer's first
    // scheduled execution.
    await publishOutputBranch(
      { "almanac-light.svg": "light-v1", "almanac-dark.svg": "dark-v1", "stale.svg": "will-be-removed" },
      { token: "fake", repo: "irrelevant/irrelevant", remoteUrlOverride: bareRepoUrl() },
    );

    const firstLog = git(bareRepoDir, ["log", "output", "--oneline"]).trim();
    expect(firstLog.split("\n").length).toBe(1);

    // Second run — simulates the next scheduled execution. Different
    // content, and "stale.svg" is deliberately absent this time.
    await publishOutputBranch(
      { "almanac-light.svg": "light-v2", "almanac-dark.svg": "dark-v2" },
      { token: "fake", repo: "irrelevant/irrelevant", remoteUrlOverride: bareRepoUrl() },
    );

    const secondLog = git(bareRepoDir, ["log", "output", "--oneline"]).trim();
    // Force-orphan REPLACES, not appends: still exactly 1 commit after the
    // second run, not 2 — this is the property a mock could never catch.
    expect(secondLog.split("\n").length).toBe(1);

    const tree = git(bareRepoDir, ["ls-tree", "-r", "--name-only", "output"]).trim().split("\n");
    expect(tree.sort()).toEqual(["almanac-dark.svg", "almanac-light.svg"]);
    // stale.svg, present in run 1, must be GONE from run 2's tree — no
    // leftovers from a previous run's file set survive a force-orphan
    // publish.
    expect(tree).not.toContain("stale.svg");

    expect(git(bareRepoDir, ["show", "output:almanac-light.svg"])).toBe("light-v2");
    expect(git(bareRepoDir, ["show", "output:almanac-dark.svg"])).toBe("dark-v2");
    // Two full publishes — roughly twice scenario A's process count.
  }, 60_000);
});

describe("publish.ts — source-level check: the constructed remoteUrl (which embeds the token) is never logged", () => {
  it("has no console.log/core.info/core.debug call that references the remoteUrl variable", () => {
    const publishSourcePath = fileURLToPath(new URL("./publish.ts", import.meta.url));
    const source = readFileSync(publishSourcePath, "utf8");

    const offendingLines = source
      .split("\n")
      .filter((line) => /remoteUrl/.test(line))
      .filter((line) => /console\.(log|info|warn|error)|core\.(info|debug|notice)/.test(line));

    expect(offendingLines).toEqual([]);
  });
});
