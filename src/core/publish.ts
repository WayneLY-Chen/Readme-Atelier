import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";

/**
 * Deliberate exception to the "src/core/** never imports fs/path/process"
 * boundary rule (`.planning/phases/01-engine-core-zero-api-publish-pipeline/01-CONTEXT.md`'s
 * `<code_context>`, restated in `01-05-PLAN.md` Task 2): publishing is a
 * GitHub Actions Runtime responsibility, not render logic, and RESEARCH.md's
 * "重大修正" section requires shelling out to the `git` CLI directly (a JS
 * action cannot `uses:` another action from inside its own execution). This
 * file stays under `src/core/` to match RESEARCH.md's existing naming rather
 * than introduce a fresh path the rest of the phase's documents don't use; a
 * future, stricter pass could move it to `src/node/publish.ts`.
 *
 * The one piece kept genuinely injectable — the actual `git` invocation — is
 * `execFn`, so `publish.test.ts` can run the exact production code path
 * (writing files, building the argument sequence, calling `core.setSecret`)
 * against BOTH a fast fake (asserting call order/ordering-of-setSecret
 * without spawning a process) and the real `@actions/exec` + git CLI against
 * a local bare repository (proving the actual force-orphan publish works).
 */
export type ExecFn = (
  command: string,
  args: string[],
  /**
   * `silent` is REQUIRED, not optional, and that is deliberate: it is the
   * control that stops `@actions/exec` echoing the token-bearing remote URL
   * to the Actions log (see the security note on `publishOutputBranch`).
   * Making it non-optional means a future call site that forgets it fails to
   * compile rather than silently leaking.
   */
  options: { cwd: string; silent: boolean },
) => Promise<number>;

const defaultExec: ExecFn = (command, args, options) => exec.exec(command, args, options);

export interface PublishOptions {
  /** The GitHub Actions token used to push. Never logged, never echoed. */
  token: string;
  /** `"owner/repo"` — normally `process.env.GITHUB_REPOSITORY` (action-entry.ts's job). */
  repo: string;
  /**
   * Deliberately NOT exposed as a production-facing config knob (T-01-11):
   * every real call site omits this and gets the hardcoded default. Only
   * `publish.test.ts` overrides it, to point at a scratch bare repo without
   * touching the real `output` branch name/semantics.
   */
  branch?: string;
  /**
   * Test-only escape hatch (RESEARCH.md Pattern 3): lets `publish.test.ts`
   * point the git remote at a local `file://` bare repository instead of a
   * real `https://github.com/...` URL. Never set by any production caller.
   */
  remoteUrlOverride?: string;
  /** Test-only: substitute the real `@actions/exec` call with a fake. */
  execFn?: ExecFn;
}

/**
 * Publishes `files` to `opts.repo`'s `output` branch (default) as a single
 * force-orphan commit — the branch's history is REPLACED, not appended to,
 * on every run (DIST-04). Never called until every card has rendered and
 * passed both size-guard layers (`core/pipeline.ts`'s `renderAllCards`) —
 * `src/action-entry.ts` enforces that ordering, not this function.
 *
 * Security (T-01-10), two independent layers:
 *
 * 1. `core.setSecret(opts.token)` is the FIRST line of this function, before
 *    the remote URL string (which embeds the token) is ever constructed. No
 *    line in this file passes the constructed `remoteUrl` — or any string
 *    built from `opts.token` — into `console.log`/`core.info`.
 *
 * 2. Every git invocation passes `silent: true`. This is NOT cosmetic and must
 *    not be removed to make logs chattier. `@actions/exec` echoes the full
 *    command line it is about to spawn to its output stream BEFORE spawning
 *    (`toolrunner.js`: `if (!silent && outStream) outStream.write(commandString)`),
 *    so without `silent` the `remote add origin <url-with-token>` invocation
 *    writes the token to the Actions log verbatim. Layer 1 alone would leave
 *    the token's confidentiality resting entirely on GitHub's runtime
 *    log-masking — a control this repository does not own, cannot test, and
 *    which does nothing at all when this function is called outside Actions.
 *
 * The `finally` block below removes the temp directory because `.git/config`
 * inside it persists the token-bearing remote URL on disk after the push.
 */
export async function publishOutputBranch(
  files: Record<string, string>,
  opts: PublishOptions,
): Promise<void> {
  core.setSecret(opts.token);

  // T-01-11: `branch` never accepts arbitrary external input in production —
  // every real caller omits `opts.branch` and gets this literal default.
  const branch = opts.branch ?? "output";
  const run = opts.execFn ?? defaultExec;

  const dir = mkdtempSync(path.join(tmpdir(), "readme-atelier-output-"));
  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, filename), content, "utf8");
  }

  // `silent: true` — see the security note above. Removing it leaks the token.
  const git = (args: string[]) => run("git", args, { cwd: dir, silent: true });

  try {
    await git(["init", "-q"]);
    await git(["checkout", "-q", "-b", branch]);
    await git(["config", "user.name", "github-actions[bot]"]);
    await git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    await git(["add", "-A"]);
    await git(["commit", "-q", "-m", "chore: publish rendered cards"]);

    const remoteUrl =
      opts.remoteUrlOverride ?? `https://x-access-token:${opts.token}@github.com/${opts.repo}.git`;

    await git(["remote", "add", "origin", remoteUrl]);
    // --force is the mechanism that makes this a force-orphan publish: the
    // branch was just created fresh in `dir` with a single commit, so pushing
    // with --force replaces whatever the remote's `output` branch previously
    // held rather than merging with it.
    await git(["push", "--force", "origin", `${branch}:${branch}`]);
  } finally {
    // `.git/config` in here holds the token-bearing remote URL. Remove it on
    // the failure path too — a push that fails is exactly when the directory
    // would otherwise be left behind. Cleanup must never mask the original
    // error, so its own failure is swallowed deliberately.
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort: the OS temp dir is reclaimed eventually */
    }
  }
}
