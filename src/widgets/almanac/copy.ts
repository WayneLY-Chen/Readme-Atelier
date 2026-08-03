/**
 * English-only copy for the Almanac card (Task 2 scope). zh-TW copy is left
 * for Plan 02 to avoid a large edit collision with this file later.
 */

export interface YijiEntry {
  auspicious: string;
  avoid: string;
}

/**
 * 建除十二神 → developer 宜/忌 mapping table (D-06), English half.
 *
 * Deviation from the plan text (recorded in SUMMARY.md): keyed by the
 * single-character 建除神 name exactly as Lunar.getZhiXing() returns it at
 * runtime, NOT by the Traditional-Chinese characters 01-UI-SPEC.md's zh-TW
 * column prints. lunar-typescript's default locale is "chs" (Simplified) —
 * there is no "cht"/zh-TW locale for these internal message strings at all
 * (confirmed by reading its I18n dictionary: only "chs" and "en" exist) — so
 * getZhiXing() returns 满/开/闭 (Simplified) rather than 滿/開/閉
 * (Traditional) for three of the twelve names; the other nine happen to be
 * identical between scripts. This only matters as an internal lookup key
 * here (Task 2 is English-mode only, and the English value is unaffected by
 * which script variant the key uses) — flagged for Plan 02, which will need
 * its own Traditional-Chinese label strings for the zh-TW render path rather
 * than trusting this library's zh output directly.
 */
export const yijiTableEn: Record<string, YijiEntry> = {
  建: {
    auspicious: "start a new project or branch",
    avoid: "rewriting the architecture from scratch",
  },
  除: {
    auspicious: "delete dead code, prune dependencies",
    avoid: "merging an unreviewed PR",
  },
  满: {
    auspicious: "ship a patch release, write docs",
    avoid: "refactoring core modules",
  },
  平: {
    auspicious: "code review, run the linter",
    avoid: "rushing a launch",
  },
  定: {
    auspicious: "pin dependency versions",
    avoid: "changing requirements last-minute",
  },
  執: {
    auspicious: "hunt bugs, write tests",
    avoid: "adding new features",
  },
  破: {
    auspicious: "tear down and rebuild a god function",
    avoid: "deploying on Friday, force-pushing",
  },
  危: {
    auspicious: "back up the database",
    avoid: "editing production data directly",
  },
  成: {
    auspicious: "ship, deploy to production",
    avoid: "scope-creep arguments",
  },
  收: {
    auspicious: "merge branches, close out the sprint",
    avoid: "delivering at the last minute",
  },
  开: {
    auspicious: "open a new repo, spin up a service",
    avoid: "deprecating the old system",
  },
  闭: {
    auspicious: "wrap up, write the changelog, cut the release",
    avoid: "starting a new branch or project",
  },
};

export const chromeEn = {
  title: "THE ALMANAC",
  weekdayNames: [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ] as const,
  lunarLabel: "LUNAR",
  ganzhiLabel: "SEXAGENARY DAY",
  auspiciousPrefix: "AUSPICIOUS: ",
  avoidPrefix: "AVOID: ",
};

const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const STEM_ELEMENT_EN: Record<string, string> = {
  甲: "Wood",
  乙: "Wood",
  丙: "Fire",
  丁: "Fire",
  戊: "Earth",
  己: "Earth",
  庚: "Metal",
  辛: "Metal",
  壬: "Water",
  癸: "Water",
};

const BRANCH_ANIMAL_EN: Record<string, string> = {
  子: "Rat",
  丑: "Ox",
  寅: "Tiger",
  卯: "Rabbit",
  辰: "Dragon",
  巳: "Snake",
  午: "Horse",
  未: "Goat",
  申: "Monkey",
  酉: "Rooster",
  戌: "Dog",
  亥: "Pig",
};

function ordinal(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo < 11 || lastTwo > 13) {
    if (last === 1) return `${n}st`;
    if (last === 2) return `${n}nd`;
    if (last === 3) return `${n}rd`;
  }
  return `${n}th`;
}

/** e.g. gregorianCaptionEn(8, 2026) -> "August 2026" */
export function gregorianCaptionEn(month: number, year: number): string {
  return `${MONTH_NAMES_EN[month - 1]} ${year}`;
}

/**
 * e.g. lunarValueEn(6, 19) -> "6th Month, 19th Day" (matches D-08's
 * reference example). lunar-typescript's Lunar.getMonth() returns a negative
 * number to flag a leap month (闰月) — this is a known simplification, not
 * fully handled by v1's English copy (no leap-month indicator exists in the
 * UI-SPEC's chrome string contract); Math.abs() avoids rendering a
 * nonsensical "-6th Month" until a future plan adds a leap-month treatment.
 */
export function lunarValueEn(month: number, day: number): string {
  return `${ordinal(Math.abs(month))} Month, ${ordinal(day)} Day`;
}

/**
 * Translate (not transliterate — see UI-SPEC "干支 in English") a two-Hanzi
 * 干支 pair like "甲子" into English, e.g. "Wood Rat". Throws if either
 * character falls outside the known 10-stem/12-branch set.
 */
export function ganZhiToEnglish(ganZhi: string): string {
  const [stem, branch] = Array.from(ganZhi);
  const element = stem ? STEM_ELEMENT_EN[stem] : undefined;
  const animal = branch ? BRANCH_ANIMAL_EN[branch] : undefined;
  if (!element || !animal) {
    throw new Error(`ganZhiToEnglish: unrecognized 干支 value "${ganZhi}"`);
  }
  return `${element} ${animal}`;
}
