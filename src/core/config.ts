import { LineCounter, parseDocument, stringify as yamlStringify } from "yaml";
import type { Document, YAMLError } from "yaml";
import { z } from "zod";
import { listNames as listWidgetNames } from "./registry.js";

/** One entry in `widgets.yml`'s `cards:` array (D-09). */
export interface CardEntry {
  type: string;
  id?: string;
  options?: Record<string, unknown>;
}

/** The fully-validated, defaults-applied shape of `widgets.yml` (D-08/09/10/11). */
export interface ResolvedConfig {
  theme: "editorial";
  language: "en" | "zh-TW";
  timezone: string;
  cards: CardEntry[];
}

/**
 * A single, human-actionable config problem (D-12). All fields except
 * `message` are optional: the three UX-01/encoding pre-checks (BOM handling
 * aside, which is silent) fire before a YAML document even exists, so they
 * carry no line/column/source-line information — just a named, actionable
 * message. Every error produced from a real YAML node has all of them.
 */
export interface FormattedConfigError {
  message: string;
  line?: number;
  column?: number;
  sourceLine?: string;
  underline?: string;
  acceptedValues?: string[];
  didYouMean?: string;
}

export type ParseConfigResult =
  | { ok: true; config: ResolvedConfig }
  | { ok: false; errors: FormattedConfigError[] };

/**
 * D-10's `id:` character set. Kept deliberately narrow —
 * lowercase-ascii-letters, digits, hyphen only.
 *
 * This is NOT primarily a path-traversal guard. Path traversal only requires
 * excluding '.', '/', '\\', whitespace, and control characters — uppercase
 * letters are perfectly filename-safe, so traversal alone would justify
 * `^[A-Za-z0-9-]+$`, not lowercase-only.
 *
 * The real reason is a filesystem-collision hazard created by D-10 itself:
 * D-10's duplicate-id detection is deliberately CASE-SENSITIVE ('Foo' !==
 * 'foo'), so `id: Foo` and `id: foo` on two different cards both pass
 * validation as distinct ids. But on a case-INSENSITIVE filesystem — default
 * macOS, and all of Windows, both real targets for local `npm run preview`
 * use — `Foo-light.svg` and `foo-light.svg` are the SAME path. One card's
 * output silently overwrites the other's, the adopter ends up with one file
 * where they configured two cards, and nothing in the build reports a
 * problem (both writes succeed; only the second write's content survives).
 * Forcing lowercase makes that collision structurally unrepresentable.
 *
 * Do NOT relax this to `^[A-Za-z0-9-]+$` on the reasoning that "uppercase is
 * traversal-safe" — that reasoning is true but incomplete, and relaxing it
 * silently reintroduces the case-collision hazard above, given that D-10's
 * duplicate check stays case-sensitive by design.
 */
const ID_PATTERN = /^[a-z0-9-]+$/;
const ID_PATTERN_MESSAGE = "僅允許小寫英文字母、數字與連字號（-）";

const CardEntrySchema = z
  .object({
    type: z.string(),
    id: z.string().regex(ID_PATTERN, ID_PATTERN_MESSAGE).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/**
 * `theme` currently has exactly one legal value. THEME-03/04's multi-theme
 * catalog (dracula, nord, tokyonight, ...) is Phase 2 scope — this schema
 * honestly reflects what exists today rather than pre-declaring THEME-02's
 * eventual catalog.
 */
const RootConfigSchema = z
  .object({
    theme: z.enum(["editorial"]).default("editorial"),
    language: z.enum(["en", "zh-TW"]).default("en"),
    timezone: z.string().default("UTC"),
    cards: z.array(CardEntrySchema).default([{ type: "almanac" }]),
  })
  .strict();

/** D-11's built-in default — every card enabled, editorial theme, UTC. */
const DEFAULT_CONFIG: ResolvedConfig = {
  theme: "editorial",
  language: "en",
  timezone: "UTC",
  cards: [{ type: "almanac" }],
};

type YamlRange = readonly [number, number, number];

interface Location {
  line?: number;
  column?: number;
  sourceLine?: string;
  underline?: string;
}

function locationFromRange(
  yamlLines: string[],
  lineCounter: LineCounter,
  range: YamlRange | undefined,
): Location {
  if (!range) {
    return {};
  }
  const start = lineCounter.linePos(range[0]);
  const end = lineCounter.linePos(range[1]);
  const line = start.line;
  const column = start.col;
  const sourceLine = yamlLines[line - 1] ?? "";
  const underlineLength =
    end.line === start.line ? Math.max(1, end.col - start.col) : Math.max(1, sourceLine.length - (column - 1));
  const underline = " ".repeat(Math.max(0, column - 1)) + "^".repeat(underlineLength);
  return { line, column, sourceLine, underline };
}

function rangeOf(node: unknown): YamlRange | undefined {
  if (node && typeof node === "object" && "range" in node) {
    return (node as { range?: YamlRange }).range;
  }
  return undefined;
}

/**
 * Small hand-written Levenshtein edit distance — not worth a dependency for
 * a did-you-mean suggestion over a handful of registered widget names.
 */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[rows - 1][cols - 1];
}

function didYouMean(value: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshtein(value, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= 2 ? best : undefined;
}

/**
 * Requirement (coordinator, post-checkpoint): the rejection message for a
 * non-matching `id:` must state the allowed character set explicitly and
 * name both the offending value and its line, so a stranger can fix it from
 * the message text alone — "Invalid id" or a raw zod regex dump is not
 * acceptable (same D-12 standard the rest of config validation is held to).
 */
function formatIdRegexMessage(value: string, line: number | undefined): string {
  const lineNote = line !== undefined ? `第 ${line} 行的 ` : "";
  const suggestion = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return (
    `${lineNote}id: "${value}" 不符合規則——${ID_PATTERN_MESSAGE}。` +
    `請全部改成小寫，例如 "${suggestion}"。`
  );
}

function collectYamlSyntaxErrors(doc: Document, yamlLines: string[]): FormattedConfigError[] {
  return doc.errors.map((error: YAMLError) => {
    // YAMLError.linePos already gives {line, col} pairs directly (unlike
    // zod-issue locations, which come from a byte-offset range and need
    // LineCounter.linePos() to convert) — no offset math needed here.
    const [start, end] = error.linePos ?? [];
    const line = start?.line;
    const column = start?.col;
    const sourceLine = line !== undefined ? yamlLines[line - 1] ?? "" : undefined;
    const underlineLength =
      start && end && end.line === start.line ? Math.max(1, end.col - start.col) : 1;
    const underline =
      column !== undefined ? " ".repeat(Math.max(0, column - 1)) + "^".repeat(underlineLength) : undefined;
    return {
      message: `widgets.yml 語法錯誤：${error.message.split("\n")[0]}`,
      line,
      column,
      sourceLine,
      underline,
    };
  });
}

function collectZodErrors(
  doc: Document,
  lineCounter: LineCounter,
  yamlLines: string[],
  zodError: z.ZodError,
): FormattedConfigError[] {
  const errors: FormattedConfigError[] = [];

  for (const issue of zodError.issues) {
    if (issue.code === "unrecognized_keys") {
      const parentPath = issue.path as (string | number)[];
      const parentNode = doc.getIn(parentPath, true) as
        | { items?: { key?: { value?: unknown; range?: YamlRange } }[] }
        | undefined;
      for (const key of issue.keys) {
        const item = parentNode?.items?.find((it) => it.key?.value === key);
        const loc = locationFromRange(yamlLines, lineCounter, item?.key?.range);
        const where = parentPath.length === 0 ? "頂層" : `"${parentPath.join(".")}" 底下`;
        errors.push({
          message: `未知的設定鍵 "${key}"，${where}沒有這個欄位，請檢查是否為拼字錯誤`,
          ...loc,
        });
      }
      continue;
    }

    const path = issue.path as (string | number)[];
    const node = doc.getIn(path, true);
    const loc = locationFromRange(yamlLines, lineCounter, rangeOf(node));

    if (path[path.length - 1] === "id" && issue.code === "invalid_format") {
      const rawValue = doc.getIn(path);
      errors.push({
        message: formatIdRegexMessage(String(rawValue), loc.line),
        ...loc,
      });
      continue;
    }

    if (issue.code === "invalid_value") {
      const acceptedValues = (issue.values as unknown[]).map((v) => String(v));
      const rawValue = doc.getIn(path);
      const guess = typeof rawValue === "string" ? didYouMean(rawValue, acceptedValues) : undefined;
      errors.push({
        message: `未知的值 "${String(rawValue)}"`,
        acceptedValues,
        didYouMean: guess,
        ...loc,
      });
      continue;
    }

    errors.push({ message: issue.message, ...loc });
  }

  return errors;
}

/**
 * D-10's cross-field checks that a single zod field validator cannot express
 * (each array item is validated independently by zod; nothing compares two
 * items to each other): an unknown `type:` (matched with a did-you-mean
 * suggestion against every currently-registered widget name) and duplicate
 * resolved ids (case-SENSITIVE exact-string comparison — 'A' and 'a' are
 * different ids by design, see ID_PATTERN's own comment for why the id
 * character set is restricted to compensate for this on real filesystems).
 * Runs against the raw parsed YAML object, not the zod-validated result, so
 * these checks still fire even when a card entry also fails structural
 * validation for an unrelated reason (D-12: report every problem, not just
 * the first).
 */
function collectSemanticErrors(
  doc: Document,
  lineCounter: LineCounter,
  yamlLines: string[],
  rawObj: unknown,
): FormattedConfigError[] {
  const errors: FormattedConfigError[] = [];
  const rawCards = Array.isArray((rawObj as { cards?: unknown })?.cards)
    ? ((rawObj as { cards: unknown[] }).cards)
    : [];
  const knownNames = listWidgetNames();

  // Map from resolved id -> every array index that resolved to it, in
  // encounter order. Exact, case-sensitive string equality (JS `===`,
  // UTF-16 code unit comparison) — no normalization or folding (D-10).
  const idOccurrences = new Map<string, number[]>();

  rawCards.forEach((entryUnknown, index) => {
    const entry = entryUnknown as Record<string, unknown> | null;
    if (!entry || typeof entry !== "object" || typeof entry.type !== "string") {
      // zod already reports a missing/non-string `type` for this entry.
      return;
    }

    const typeValue = entry.type;
    if (!knownNames.includes(typeValue)) {
      const node = doc.getIn(["cards", index, "type"], true);
      const loc = locationFromRange(yamlLines, lineCounter, rangeOf(node));
      errors.push({
        message: `未知的卡片類型 "${typeValue}"`,
        acceptedValues: knownNames,
        didYouMean: didYouMean(typeValue, knownNames),
        ...loc,
      });
    }

    const finalId = typeof entry.id === "string" ? entry.id : typeValue;
    const indices = idOccurrences.get(finalId) ?? [];
    indices.push(index);
    idOccurrences.set(finalId, indices);
  });

  for (const [id, indices] of idOccurrences) {
    if (indices.length < 2) {
      continue;
    }
    const lastIndex = indices[indices.length - 1] as number;
    const entry = rawCards[lastIndex] as Record<string, unknown>;
    const hasExplicitId = typeof entry.id === "string";
    const path = hasExplicitId ? ["cards", lastIndex, "id"] : ["cards", lastIndex, "type"];
    const node = doc.getIn(path, true);
    const loc = locationFromRange(yamlLines, lineCounter, rangeOf(node));
    errors.push({
      message: `重複的 id "${id}"，出現在第 ${indices.join(" 與第 ")} 個 card，請加上 id: 區分`,
      ...loc,
    });
  }

  return errors;
}

/**
 * Validate `yamlText` (already read from disk by the caller — this module is
 * zero-fs) against `widgets.yml`'s schema. Collects EVERY problem in one
 * pass (D-12) rather than stopping at the first: YAML syntax errors, zod
 * structural issues (including `.strict()`-caught unknown keys), and the
 * cross-field D-10 checks a single-field validator cannot express.
 */
/**
 * T-01-09 (this plan's threat model): a defensive upper bound on
 * `widgets.yml` size, checked before any YAML parsing is attempted. A
 * pathologically large file — whether malicious or just an accidental
 * paste — should fail fast with a named reason instead of spending
 * `parseDocument`'s composition time on it. 1 MiB is generous: the largest
 * plausible real `widgets.yml` (dozens of cards, each with a small
 * `options:` block) is a few KB.
 */
const MAX_CONFIG_TEXT_LENGTH = 1_048_576;

export function parseConfig(yamlTextRaw: string): ParseConfigResult {
  if (yamlTextRaw.length > MAX_CONFIG_TEXT_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          message:
            `widgets.yml 過大（${yamlTextRaw.length} 字元，上限 ${MAX_CONFIG_TEXT_LENGTH} 字元）。` +
            "請確認這是你自己撰寫的設定檔，而不是誤貼了其他內容。",
        },
      ],
    };
  }

  // UX-01/encoding defense 1: strip a leading UTF-8 BOM. YAML permits a BOM
  // at the start of a document and it is not part of the content, but
  // whether the `yaml` package itself already strips it was not verified,
  // so this is handled explicitly here rather than relied upon.
  const yamlText = yamlTextRaw.replace(/^﻿/, "");

  // UX-01/encoding defense 2: U+FFFD (the Unicode replacement character) in
  // the decoded source is the most reliable signal that the file was saved
  // in a non-UTF-8 encoding and then decoded as UTF-8 by the caller. Catch
  // this before attempting a YAML parse, which would otherwise surface a
  // much harder-to-diagnose syntax error.
  if (yamlText.includes("�")) {
    return {
      ok: false,
      errors: [
        {
          message:
            "widgets.yml 似乎不是以 UTF-8 編碼儲存（偵測到 Unicode 替代字元 U+FFFD）。" +
            "請將檔案另存為 UTF-8 編碼後再試一次。",
        },
      ],
    };
  }

  const lineCounter = new LineCounter();
  const doc = parseDocument(yamlText, { lineCounter });
  const yamlLines = yamlText.split(/\r\n|\n/);

  if (doc.errors.length > 0) {
    return { ok: false, errors: collectYamlSyntaxErrors(doc, yamlLines) };
  }

  const rawObj = (doc.toJS() ?? {}) as unknown;

  const errors: FormattedConfigError[] = [];

  const zodResult = RootConfigSchema.safeParse(rawObj);
  if (!zodResult.success) {
    errors.push(...collectZodErrors(doc, lineCounter, yamlLines, zodResult.error));
  }

  // UX-01/encoding defense 3 (`.strict()` on both schemas) surfaces here as
  // ordinary `unrecognized_keys` zod issues, already handled above.

  errors.push(...collectSemanticErrors(doc, lineCounter, yamlLines, rawObj));

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, config: zodResult.data as ResolvedConfig };
}

/**
 * D-11: a missing `widgets.yml` is not an error. `yamlText === undefined`
 * means "the caller confirmed the file does not exist" — distinct from an
 * empty string, which is a real (if degenerate) file content and goes
 * through `parseConfig`'s normal validation path, picking up zod's
 * `.default()` values for every field. This distinction has its own test:
 * an existing-but-empty `cards: []` is NOT the same code path as a missing
 * file, even though both end up producing zero or default cards.
 */
export function loadConfigOrDefault(yamlText: string | undefined): {
  config: ResolvedConfig;
  usedDefault: boolean;
  equivalentYaml: string;
} {
  if (yamlText === undefined) {
    return {
      config: DEFAULT_CONFIG,
      usedDefault: true,
      equivalentYaml: configToYaml(DEFAULT_CONFIG),
    };
  }

  const result = parseConfig(yamlText);
  if (!result.ok) {
    // Surface validation errors to the caller via a thrown, structured
    // error rather than silently falling back to defaults — falling back
    // here would hide a real typo behind what looks like a working run.
    throw new ConfigValidationError(result.errors);
  }
  return {
    config: result.config,
    usedDefault: false,
    equivalentYaml: configToYaml(result.config),
  };
}

export class ConfigValidationError extends Error {
  readonly errors: FormattedConfigError[];
  constructor(errors: FormattedConfigError[]) {
    super(`ConfigValidationError: widgets.yml has ${errors.length} problem(s)`);
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
}

/**
 * Stringify a ResolvedConfig back to a complete, valid, directly-copyable
 * `widgets.yml`. Built from the same YAML package's `stringify`, not a
 * hand-written string template, so the default-config text and the actual
 * default object can never drift apart from each other.
 */
function configToYaml(config: ResolvedConfig): string {
  return yamlStringify(config);
}

/**
 * Render `errors` (D-12) into the terminal-ready, one-shot-report format:
 * a header naming how many problems exist, then each problem with its
 * location (when known), the quoted+underlined source line, the message,
 * accepted values, and a did-you-mean suggestion.
 */
export function formatConfigErrors(errors: FormattedConfigError[]): string {
  const out: string[] = [];
  out.push(`✗ widgets.yml 設定有誤（${errors.length} 個問題）`);
  out.push("");

  for (const error of errors) {
    if (error.line !== undefined && error.sourceLine !== undefined) {
      out.push(`  widgets.yml:${error.line}:${error.column ?? 1}`);
      const prefix = `      ${error.line} | `;
      out.push(`${prefix}${error.sourceLine}`);
      if (error.underline) {
        out.push(`${" ".repeat(prefix.length)}${error.underline}`);
      }
    }
    out.push(`  ${error.message}`);
    if (error.acceptedValues && error.acceptedValues.length > 0) {
      out.push(`  可用：${error.acceptedValues.join(", ")}`);
    }
    if (error.didYouMean) {
      out.push(`  你是不是要打 "${error.didYouMean}"？`);
    }
    out.push("");
  }

  return out.join("\n").trimEnd();
}
