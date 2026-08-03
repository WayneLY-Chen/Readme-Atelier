import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";
import { convert } from "fontverter";
import opentype, { type Font } from "opentype.js";

const parseFont = opentype.parse;

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

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const spec of SOURCES) {
    await buildOne(spec);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
