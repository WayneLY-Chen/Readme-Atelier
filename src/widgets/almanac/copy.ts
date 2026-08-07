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
 * getZhiXing() returns 满/执/开/闭 (Simplified) rather than 滿/執/開/閉
 * (Traditional) for four of the twelve names; the other eight happen to be
 * identical between scripts. Verified empirically (not by manual Unicode
 * decoding, which was tried first and got 執/执 wrong — U+6267 is actually
 * the Simplified 执, not Traditional 執 at U+57F7 — hence the direct runtime
 * scan): ran getZhiXing() across 400 consecutive days and printed the code
 * point of every distinct value returned. This only matters as an internal
 * lookup key here (Task 2 is English-mode only, and the English value is
 * unaffected by which script variant the key uses) — flagged for Plan 02,
 * which will need its own Traditional-Chinese label strings for the zh-TW
 * render path rather than trusting this library's zh output directly.
 */
// Deviation from the plan text (recorded in SUMMARY.md, Plan 02 Task 3):
// Plan 02's new width-budget tooling measured all 24 English phrases for
// real (glyph path bounding-box width via measureAdvanceWidth, not eyeballed
// character counts) and found 8 of them exceeded the 260-user-unit T3/17px
// budget (01-UI-SPEC.md's claim that "all 24 phrases... are pre-checked
// against the 260-user-unit slot budget" was true for the zh-TW column but
// not verified for English — this task's own measurement is the first real
// check). The 8 entries below were rewritten to fit, preserving the terse-
// imperative voice guardrail and each phrase's original meaning; nothing
// else in the table changed.
export const yijiTableEn: Record<string, YijiEntry> = {
  建: {
    auspicious: "start a new project or branch",
    avoid: "a full architecture rewrite", // was "rewriting the architecture from scratch" (318px > 260px)
  },
  除: {
    auspicious: "delete dead code, prune deps", // was "delete dead code, prune dependencies" (309px > 260px)
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
    avoid: "late requirement changes", // was "changing requirements last-minute" (287px > 260px)
  },
  执: {
    auspicious: "hunt bugs, write tests",
    avoid: "adding new features",
  },
  破: {
    auspicious: "refactor a god function", // was "tear down and rebuild a god function" (300px > 260px)
    avoid: "Friday ships, force pushes", // was "deploying on Friday, force-pushing" (286px > 260px)
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
    auspicious: "merge and close the sprint", // was "merge branches, close out the sprint" (295px > 260px)
    avoid: "delivering at the last minute",
  },
  开: {
    auspicious: "open a repo, spin up a service", // was "open a new repo, spin up a service" (278px > 260px)
    avoid: "deprecating the old system",
  },
  闭: {
    auspicious: "wrap up, changelog, ship it", // was "wrap up, write the changelog, cut the release" (363px > 260px)
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

// Deviation from the plan text (recorded in SUMMARY.md, Plan 02 Task 3):
// the D-08 reference example format "{Nth} Month, {Nth} Day" (e.g. "6th
// Month, 19th Day") is what 01-UI-SPEC.md's "Lunar value" row and D-08's
// context text both show, and 01-UI-SPEC.md's own "Text slot budgets" table
// asserts this slot is "Bounded by calendar math (month 1-12, day 1-30) in
// both languages" — i.e. it claims the 160-unit budget is safe purely
// because the *cardinality* of the value space is small, without anyone
// having actually measured a rendered path bounding-box for it. That claim
// is wrong: measuring all 360 month x day combinations (measureAdvanceWidth,
// serif, T3/17px) found the double-digit-ordinal cases exceed the budget —
// worst case "10th Month, 22nd Day" at ~177 units, 17 units over. This is
// the SECOND instance of this same class of UI-SPEC error in this plan (the
// first was the 260-unit 宜/忌 phrase budget above, where 8 of 24 English
// phrases were over) — UI-SPEC repeatedly asserted a text budget was safe
// by construction/cardinality without a build-time measurement to back it,
// and both times the assertion was false for English.
//
// Fix (same rule as the 宜/忌 table: shorten the copy, never widen the
// budget): dropped the ordinal suffixes and "Month"/"Day" is-plural-of-slot
// phrasing in favor of "Month {N}, Day {N}" — plain cardinal numbers, same
// editorial register as the rest of the card's numeric fields. Measured
// worst case across the full 1-12 x 1-30 value space: "Month 10, Day 10" at
// ~138.6 units, comfortably inside the 160-unit budget (was 176.95px > 160px
// for the ordinal form's worst case).
/** e.g. lunarValueEn(6, 19) -> "Month 6, Day 19". lunar-typescript's
 * Lunar.getMonth() returns a negative number to flag a leap month (闰月) —
 * this is a known simplification, not fully handled by v1's English copy (no
 * leap-month indicator exists in the UI-SPEC's chrome string contract);
 * Math.abs() avoids rendering a nonsensical "Month -6" until a future plan
 * adds a leap-month treatment. */
export function lunarValueEn(month: number, day: number): string {
  return `Month ${Math.abs(month)}, Day ${day}`;
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

/**
 * 建除十二神 → developer 宜/忌 mapping table (D-06), zh-TW half. Keyed by
 * the exact same runtime characters as yijiTableEn (see that table's own
 * doc comment) — 满/执/开/闭 rather than 01-UI-SPEC.md's Traditional
 * 滿/執/開/閉 — purely so both tables share one lookup discipline
 * (`table[content.zhiXing]`) at the call site. The *values* here are the
 * real Traditional-Chinese phrases from the UI-SPEC's zh-TW column; the key
 * spelling is an internal implementation detail, never rendered directly.
 */
export const yijiTableZh: Record<string, YijiEntry> = {
  建: {
    auspicious: "起新專案、開新分支",
    avoid: "砍掉重練現有架構",
  },
  除: {
    auspicious: "刪除死程式碼、清依賴",
    avoid: "merge 未經 review 的 PR",
  },
  满: {
    auspicious: "發布小版本、寫文件",
    avoid: "重構核心模組",
  },
  平: {
    auspicious: "code review、統一格式",
    avoid: "倉促上線",
  },
  定: {
    auspicious: "鎖定版本號",
    avoid: "臨時改需求",
  },
  执: {
    auspicious: "抓 bug、寫測試",
    avoid: "新增功能",
  },
  破: {
    auspicious: "砍掉重練、拆解怪獸函式",
    avoid: "週五上線、force push",
  },
  危: {
    auspicious: "備份資料庫",
    avoid: "直接改 production 資料",
  },
  成: {
    auspicious: "發版、上線",
    avoid: "吵架、開會吵需求",
  },
  收: {
    auspicious: "合併分支、結算 sprint",
    avoid: "拖到最後一刻才交付",
  },
  开: {
    auspicious: "開新 repo、啟動新服務",
    avoid: "deprecate 舊系統",
  },
  闭: {
    auspicious: "收尾、寫 changelog、封版",
    avoid: "開新分支、起新專案",
  },
};

/**
 * zh-TW chrome strings (01-UI-SPEC.md "Card chrome strings"). mastheadEyebrow
 * is deliberately English/ASCII (it is brand furniture, not translated
 * content, per UI-SPEC's Header row note) and is shown in zh-TW mode only —
 * never rendered in en mode, which has no masthead eyebrow at all.
 */
export const chromeZh = {
  title: "曆日",
  mastheadEyebrow: "THE ALMANAC",
  weekdayNames: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const,
  lunarLabel: "農曆",
  ganzhiLabel: "干支",
  auspiciousPrefix: "宜：",
  avoidPrefix: "忌：",
};

/** e.g. gregorianCaptionZh(8, 2026) -> "2026年8月" */
export function gregorianCaptionZh(month: number, year: number): string {
  return `${year}年${month}月`;
}

/**
 * lunar-typescript's getMonthInChinese()/getDayInChinese() use the
 * "正/冬/臘"-style traditional month-naming convention, but return the
 * *Simplified* form of exactly two characters: 腊 (month 12; Traditional
 * 臘) and 闰 (leap-month prefix; Traditional 閏). Verified by direct runtime
 * scan (not assumption): ran getMonthInChinese() across 3000 consecutive
 * days, diffed every distinct character returned against
 * scripts/fixtures/moe-common-chars.txt (the Traditional-only common-char
 * tier), and confirmed these are the only two mismatches — the same
 * "scan, don't hand-decode" discipline Plan 01 used for yijiTableEn's
 * 建除神 keys. Left unconverted, either character would throw
 * GlyphCoverageError against the zh-TW Noto Serif TC subset (D-03 excludes
 * Simplified Chinese).
 */
const SIMPLIFIED_TO_TRADITIONAL_LUNAR: Record<string, string> = {
  腊: "臘",
  闰: "閏",
};

function toTraditionalLunarLabel(s: string): string {
  return Array.from(s)
    .map((ch) => SIMPLIFIED_TO_TRADITIONAL_LUNAR[ch] ?? ch)
    .join("");
}

/** e.g. lunarValueZh("六", "十九") -> "六月十九" (UI-SPEC reference example). */
export function lunarValueZh(monthCn: string, dayCn: string): string {
  return `${toTraditionalLunarLabel(monthCn)}月${dayCn}`;
}
