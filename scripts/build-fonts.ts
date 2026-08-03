import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";
import { convert } from "fontverter";
import opentype, { type Font, type Glyph } from "opentype.js";

// Only the default import is safe at runtime (see src/vendor.d.ts) —
// opentype.js@2.0.0's UMD bundle has no detectable named exports, so `Font`/
// `Glyph` must be read off the default export object, exactly like `parse`.
const parseFont = opentype.parse;
const OpentypeFont = opentype.Font;
const OpentypeGlyph = opentype.Glyph;

/**
 * ASCII printable range (0x20 space through 0x7E tilde) — 95 characters,
 * enough to cover the English-only content this plan renders (headings,
 * labels, digits). See 01-01-PLAN.md Task 1 action item 2.
 */
const ASCII_PRINTABLE = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) =>
  String.fromCharCode(0x20 + i),
).join("");

const KERNING_SAMPLES = ["AV", "To", "0123456789"];

interface AdvanceWidthLike {
  getAdvanceWidth(text: string, size: number): number;
}

export class AdvanceWidthDriftError extends Error {
  constructor(sample: string, fontLabel: string, fullWidth: number, subsetWidth: number) {
    super(
      `AdvanceWidthDriftError: subsetting "${fontLabel}" changed the advance width of ` +
        `sample "${sample}" from ${fullWidth} (full font) to ${subsetWidth} (subset font).`,
    );
    this.name = "AdvanceWidthDriftError";
  }
}

/**
 * RESEARCH.md Open Questions #3: verify that hb-subset's subsetting does not
 * silently drift kerning/hmtx advance widths relative to the full,
 * unsubsetted font. Throws AdvanceWidthDriftError naming the offending
 * sample and both measured widths on the first mismatch.
 */
export function assertAdvanceWidthPreserved(
  fullFont: AdvanceWidthLike,
  subsetFontHandle: AdvanceWidthLike,
  samples: string[],
  fontLabel: string,
): void {
  for (const sample of samples) {
    const fullWidth = fullFont.getAdvanceWidth(sample, 44);
    const subsetWidth = subsetFontHandle.getAdvanceWidth(sample, 44);
    if (fullWidth !== subsetWidth) {
      throw new AdvanceWidthDriftError(sample, fontLabel, fullWidth, subsetWidth);
    }
  }
}

interface FontSourceSpec {
  label: string;
  sourceFile: string;
  outputFile: string;
}

const FONTSOURCE_FILES_DIR = path.join(
  "node_modules",
  "@fontsource",
  "ibm-plex-mono",
  "files",
);
const OUTPUT_DIR = "assets/fonts";

// Deviation from plan (recorded in SUMMARY.md): the plan named
// `ibm-plex-mono-latin-{400,600}-normal.ttf` as the source files. Fontsource
// v5 npm packages ship .woff/.woff2 only, no .ttf/.otf — confirmed by
// listing FONTSOURCE_FILES_DIR before hardcoding these names. subset-font
// accepts WOFF2 input directly (harfbuzz decompresses it internally), so the
// pipeline shape downstream of subsetFont() is unchanged.
const SOURCES: FontSourceSpec[] = [
  {
    label: "ibm-plex-mono-regular",
    sourceFile: path.join(FONTSOURCE_FILES_DIR, "ibm-plex-mono-latin-400-normal.woff2"),
    outputFile: path.join(OUTPUT_DIR, "ibm-plex-mono-regular.subset.ttf"),
  },
  {
    label: "ibm-plex-mono-semibold",
    sourceFile: path.join(FONTSOURCE_FILES_DIR, "ibm-plex-mono-latin-600-normal.woff2"),
    outputFile: path.join(OUTPUT_DIR, "ibm-plex-mono-semibold.subset.ttf"),
  },
];

async function buildOne(spec: FontSourceSpec): Promise<void> {
  const originalBuffer = readFileSync(spec.sourceFile);

  // assertAdvanceWidthPreserved needs an opentype.js-parseable "full font" to
  // compare against. opentype.js cannot parse WOFF2 directly (only sfnt/OTTO/
  // WOFF), so convert the *unsubsetted* original to sfnt via fontverter —
  // pure format conversion, no glyph subsetting — before parsing it.
  const fullSfntBuffer = await convert(originalBuffer, "sfnt");
  const fullFont: Font = parseFont(fullSfntBuffer);

  // Pitfall 1: targetFormat must be explicit — omitting it can silently
  // produce a WOFF2 buffer that opentype.js cannot parse.
  const subsetBuffer = await subsetFont(originalBuffer, ASCII_PRINTABLE, {
    targetFormat: "sfnt",
  });

  writeFileSync(spec.outputFile, subsetBuffer);

  // Pitfall 1 self-verification: re-parse what was just written and confirm
  // it is a real, non-empty sfnt font.
  const subsetFontParsed: Font = parseFont(subsetBuffer);
  if (!(subsetFontParsed.numGlyphs > 0)) {
    throw new Error(
      `Font subsetting produced an unparseable or empty output for "${spec.label}" ` +
        `(${spec.outputFile}): numGlyphs was ${subsetFontParsed.numGlyphs}.`,
    );
  }

  // Kerning/hmtx fidelity check (RESEARCH.md Open Questions #3).
  assertAdvanceWidthPreserved(fullFont, subsetFontParsed, KERNING_SAMPLES, spec.label);

  console.log(
    `[build-fonts] ${spec.label}: wrote ${spec.outputFile} ` +
      `(numGlyphs=${subsetFontParsed.numGlyphs}); advance-width fidelity OK for samples ` +
      `${JSON.stringify(KERNING_SAMPLES)}.`,
  );
}

// ---------------------------------------------------------------------------
// Source Serif 4 (Task 1, Plan 02): a single Fontsource chunk already covers
// the full range we need — ASCII plus Latin-1 Supplement (verified
// empirically: 0 missing code points across both ranges in
// source-serif-4-latin-400-normal.woff2) — so this needs no special-casing
// beyond a proportional-font kerning sample (buildOne()'s mono samples don't
// exercise real kerning since a monospace font's glyphs don't shift for
// adjacent-pair kerning the way a proportional font's do).
// ---------------------------------------------------------------------------

const SOURCE_SERIF_4_SOURCE = path.join(
  "node_modules",
  "@fontsource",
  "source-serif-4",
  "files",
  "source-serif-4-latin-400-normal.woff2",
);
const SOURCE_SERIF_4_OUTPUT = path.join(OUTPUT_DIR, "source-serif-4.subset.ttf");
const SOURCE_SERIF_4_LABEL = "source-serif-4";
const SOURCE_SERIF_4_KERNING_SAMPLES = ["AV", "To"];

/** U+00A0 (no-break space) through U+00FF (ÿ) — the Latin-1 Supplement block. */
const LATIN1_SUPPLEMENT = Array.from({ length: 0xff - 0xa0 + 1 }, (_, i) =>
  String.fromCharCode(0xa0 + i),
).join("");

async function buildSourceSerif4(): Promise<void> {
  const originalBuffer = readFileSync(SOURCE_SERIF_4_SOURCE);

  const fullSfntBuffer = await convert(originalBuffer, "sfnt");
  const fullFont: Font = parseFont(fullSfntBuffer);

  const subsetText = ASCII_PRINTABLE + LATIN1_SUPPLEMENT;
  const subsetBuffer = await subsetFont(originalBuffer, subsetText, {
    targetFormat: "sfnt",
  });

  writeFileSync(SOURCE_SERIF_4_OUTPUT, subsetBuffer);

  const subsetFontParsed: Font = parseFont(subsetBuffer);
  if (!(subsetFontParsed.numGlyphs > 0)) {
    throw new Error(
      `Font subsetting produced an unparseable or empty output for "${SOURCE_SERIF_4_LABEL}" ` +
        `(${SOURCE_SERIF_4_OUTPUT}): numGlyphs was ${subsetFontParsed.numGlyphs}.`,
    );
  }

  // Kerning fidelity on a real proportional (non-monospace) font — the
  // dimension RESEARCH.md Open Questions #3 flagged and Plan 01 deferred
  // because IBM Plex Mono's fixed advances don't exercise GPOS kerning the
  // way a proportional face's pairs do.
  assertAdvanceWidthPreserved(
    fullFont,
    subsetFontParsed,
    SOURCE_SERIF_4_KERNING_SAMPLES,
    SOURCE_SERIF_4_LABEL,
  );

  console.log(
    `[build-fonts] ${SOURCE_SERIF_4_LABEL}: wrote ${SOURCE_SERIF_4_OUTPUT} ` +
      `(numGlyphs=${subsetFontParsed.numGlyphs}); advance-width fidelity OK for samples ` +
      `${JSON.stringify(SOURCE_SERIF_4_KERNING_SAMPLES)}.`,
  );
}

// ---------------------------------------------------------------------------
// Noto Serif TC (Task 1, Plan 02).
//
// Deviation from the plan text's literal "single source file" wording
// (recorded in SUMMARY.md): Fontsource splits Noto Serif TC into dozens of
// unicode-range chunks for web delivery (unlike IBM Plex Mono/Source Serif 4,
// which each ship one file covering everything this project needs). The
// "chinese-traditional" chunk covers ASCII plus the full moe-common-chars.txt
// Hanzi tier plus the CJK Symbols/Punctuation block (、。「」『』—…　) — but
// NOT the separate Unicode "Fullwidth Forms" block (U+FF00–FFEF), which is
// where the copywriting contract's "宜："/"忌：" prefixes' fullwidth colon
// (U+FF1A) lives. Verified empirically (not assumed) by iterating each
// candidate chunk's cmap: the fullwidth punctuation this project's copy
// contract actually uses is split across three other numbered chunks
// (119 → ；, 122 → ！（）？, 123 → ，。、：), each confirmed to share the
// same unitsPerEm/ascender/descender as the chinese-traditional chunk (same
// underlying font family, just a different unicode-range split), so their
// glyph outlines can be copied in directly with no scaling. This keeps the
// plan's declared single output artifact (assets/fonts/noto-serif-tc.subset.ttf)
// intact rather than adding a second committed font file.
// ---------------------------------------------------------------------------

const NOTO_TC_FILES_DIR = path.join("node_modules", "@fontsource", "noto-serif-tc", "files");
const NOTO_TC_PRIMARY_SOURCE = path.join(
  NOTO_TC_FILES_DIR,
  "noto-serif-tc-chinese-traditional-400-normal.woff2",
);
const NOTO_TC_PUNCTUATION_SUPPLEMENT_SOURCES = [
  path.join(NOTO_TC_FILES_DIR, "noto-serif-tc-123-400-normal.woff2"), // ，。、：
  path.join(NOTO_TC_FILES_DIR, "noto-serif-tc-122-400-normal.woff2"), // ！（）？
  path.join(NOTO_TC_FILES_DIR, "noto-serif-tc-119-400-normal.woff2"), // ；
];
const NOTO_TC_OUTPUT = path.join(OUTPUT_DIR, "noto-serif-tc.subset.ttf");
const NOTO_TC_LABEL = "noto-serif-tc";
const MOE_COMMON_CHARS_FILE = path.join("scripts", "fixtures", "moe-common-chars.txt");
const MOE_EXPECTED_COUNT = 4808;
const MOE_TOLERANCE = 50;

/**
 * Full/half-width punctuation named in the plan's action text. The
 * half-width half of this set is already covered by ASCII_PRINTABLE; harmless
 * to include again here since subset-font silently ignores requested
 * characters a given source font doesn't contain (verified empirically) —
 * no error, just no glyph produced for that character from that source.
 */
const FULL_AND_HALF_WIDTH_PUNCTUATION = "，。、；：？！「」『』（）—…　";

/** RESEARCH.md Open Questions #3's mixed-CJK-and-Latin measurement dimension,
 * explicitly deferred by Plan 01 (no CJK font existed yet). Both Hanzi are
 * verified present in moe-common-chars.txt (see buildNotoSerifTC's own guard
 * below) — they are among the most frequent characters in the table. */
const MIXED_CJK_LATIN_KERNING_SAMPLE = "中文 Kerning 42";

function extractGlyphs(font: Font): Glyph[] {
  const glyphs: Glyph[] = [];
  for (let i = 0; i < font.numGlyphs; i++) {
    glyphs.push(font.glyphs.get(i));
  }
  return glyphs;
}

/**
 * Copy glyphs for `neededChars` that `primaryFont` is missing in from
 * `supplementSourceFiles`, in order, stopping once every character has been
 * found. Each supplement source is itself run through subsetFont() first
 * (never merging a full, unsubsetted multi-thousand-glyph chunk wholesale),
 * so the merge only ever pulls in the handful of glyphs actually missing.
 * Throws if any requested character cannot be found in any supplement.
 */
async function mergeSupplementalPunctuation(
  primaryFont: Font,
  supplementSourceFiles: string[],
  neededChars: string,
): Promise<Font> {
  const glyphs = extractGlyphs(primaryFont);
  let nextIndex = glyphs.length;
  const stillMissing = new Set(
    Array.from(neededChars).filter((ch) => primaryFont.charToGlyphIndex(ch) === 0),
  );

  for (const sourceFile of supplementSourceFiles) {
    if (stillMissing.size === 0) {
      break;
    }
    const sourceBuffer = readFileSync(sourceFile);
    const supplementSubsetBuffer = await subsetFont(
      sourceBuffer,
      Array.from(stillMissing).join(""),
      { targetFormat: "sfnt" },
    );
    const supplementFont = parseFont(supplementSubsetBuffer);

    for (const ch of Array.from(stillMissing)) {
      const glyphIndex = supplementFont.charToGlyphIndex(ch);
      if (glyphIndex === 0) {
        continue;
      }
      const sourceGlyph = supplementFont.glyphs.get(glyphIndex);
      const codePoint = ch.codePointAt(0);
      glyphs.push(
        new OpentypeGlyph({
          index: nextIndex++,
          name: sourceGlyph.name ?? `uni${codePoint!.toString(16).toUpperCase()}`,
          unicode: codePoint,
          advanceWidth: sourceGlyph.advanceWidth,
          path: sourceGlyph.path,
        }),
      );
      stillMissing.delete(ch);
    }
  }

  if (stillMissing.size > 0) {
    throw new Error(
      `mergeSupplementalPunctuation: could not find a glyph for: ${JSON.stringify(Array.from(stillMissing))} ` +
        `in any of the supplement sources tried.`,
    );
  }

  return new OpentypeFont({
    familyName: "NotoSerifTCSubset",
    styleName: "Regular",
    unitsPerEm: primaryFont.unitsPerEm,
    ascender: primaryFont.ascender,
    descender: primaryFont.descender,
    glyphs,
  });
}

async function buildNotoSerifTC(): Promise<void> {
  const moeCommonChars = readFileSync(MOE_COMMON_CHARS_FILE, "utf8");
  const moeCharCount = new Set(Array.from(moeCommonChars)).size;
  if (Math.abs(moeCharCount - MOE_EXPECTED_COUNT) > MOE_TOLERANCE) {
    console.warn(
      `[build-fonts] WARNING: ${MOE_COMMON_CHARS_FILE} has ${moeCharCount} distinct characters, ` +
        `outside the expected ${MOE_EXPECTED_COUNT} ± ${MOE_TOLERANCE} range for 教育部常用國字. ` +
        `Verify the source list (see scripts/fixtures/ provenance notes in the Task 1 SUMMARY).`,
    );
  }
  if (!moeCommonChars.includes("中") || !moeCommonChars.includes("文")) {
    throw new Error(
      `buildNotoSerifTC: ${MOE_COMMON_CHARS_FILE} is missing "中" or "文" — the mixed CJK/Latin ` +
        `kerning-fidelity sample ("${MIXED_CJK_LATIN_KERNING_SAMPLE}") depends on both being present.`,
    );
  }

  const originalBuffer = readFileSync(NOTO_TC_PRIMARY_SOURCE);
  const fullSfntBuffer = await convert(originalBuffer, "sfnt");
  const fullFont: Font = parseFont(fullSfntBuffer);

  const subsetText = ASCII_PRINTABLE + moeCommonChars + FULL_AND_HALF_WIDTH_PUNCTUATION;
  const primarySubsetBuffer = await subsetFont(originalBuffer, subsetText, {
    targetFormat: "sfnt",
  });
  const primarySubsetFont: Font = parseFont(primarySubsetBuffer);
  if (!(primarySubsetFont.numGlyphs > 0)) {
    throw new Error(
      `Font subsetting produced an unparseable or empty output for "${NOTO_TC_LABEL}" primary subset ` +
        `(numGlyphs was ${primarySubsetFont.numGlyphs}).`,
    );
  }

  // Kerning/hmtx fidelity check, mixed-script sample (RESEARCH.md Open
  // Questions #3, deferred by Plan 01).
  assertAdvanceWidthPreserved(
    fullFont,
    primarySubsetFont,
    [MIXED_CJK_LATIN_KERNING_SAMPLE],
    NOTO_TC_LABEL,
  );

  const mergedFont = await mergeSupplementalPunctuation(
    primarySubsetFont,
    NOTO_TC_PUNCTUATION_SUPPLEMENT_SOURCES,
    FULL_AND_HALF_WIDTH_PUNCTUATION,
  );
  const mergedBuffer = Buffer.from(mergedFont.toArrayBuffer());

  writeFileSync(NOTO_TC_OUTPUT, mergedBuffer);

  // Pitfall 1 self-verification: re-parse what was just written.
  const writtenFont: Font = parseFont(mergedBuffer);
  if (!(writtenFont.numGlyphs > 0)) {
    throw new Error(
      `Font subsetting produced an unparseable or empty output for "${NOTO_TC_LABEL}" ` +
        `(${NOTO_TC_OUTPUT}): numGlyphs was ${writtenFont.numGlyphs}.`,
    );
  }
  // Merge self-check: the fullwidth colon the copywriting contract actually
  // uses ("宜："/"忌：") must resolve to a real glyph, not .notdef, in the
  // *written* file — not just in the pre-serialization in-memory Font.
  if (writtenFont.charToGlyphIndex("：") === 0) {
    throw new Error(
      `buildNotoSerifTC: merge did not produce a usable glyph for "：" (U+FF1A) in the written file.`,
    );
  }

  console.log(
    `[build-fonts] ${NOTO_TC_LABEL}: wrote ${NOTO_TC_OUTPUT} ` +
      `(numGlyphs=${writtenFont.numGlyphs}, moe-common-chars distinct=${moeCharCount}); ` +
      `advance-width fidelity OK for "${MIXED_CJK_LATIN_KERNING_SAMPLE}"; ` +
      `fullwidth-punctuation merge OK (：present).`,
  );
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const spec of SOURCES) {
    await buildOne(spec);
  }
  await buildSourceSerif4();
  await buildNotoSerifTC();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
