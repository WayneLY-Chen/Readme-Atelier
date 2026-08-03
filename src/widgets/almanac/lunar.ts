import { Solar } from "lunar-typescript";

/**
 * lunar-typescript's real supported year range, per RESEARCH.md Pitfall 2:
 * the library computes via astronomical algorithm and never throws on its
 * own, so "supported" here means "verified accurate against an independent
 * public source," not "does not crash."
 *
 * Verified empirically against Hong Kong Observatory's official published
 * Gregorian/lunar conversion tables (hko.gov.hk/tc/gts/time/conversion1_text
 * .htm), which explicitly state their own coverage as "年份(1901-2100)" and
 * 404 for 1899, 1900, and 2101. Cross-checked multiple dates at both
 * boundaries (1901-01-01, 1901-01-06, 2100-01-01, 2100-01-10, 2100-12-22,
 * 2100-12-31) against HKO's published day-in-month, month-boundary, and
 * year-ganzhi values — lunar-typescript matched HKO exactly on every point
 * checked. 1900 is deliberately excluded from the verified range (not just
 * 1899) because HKO's own table starts at 1901, not 1900 — RESEARCH.md's
 * Pitfall 2 example text used "1900–2100" only as an illustration, not a
 * pre-verified boundary; this task's own empirical check is authoritative.
 */
const VERIFIED_MIN_YEAR = 1901;
const VERIFIED_MAX_YEAR = 2100;
const VERIFIED_RANGE_LABEL = `${VERIFIED_MIN_YEAR}–${VERIFIED_MAX_YEAR}`;

/** UI-SPEC "Degenerate States #1" error message shape. */
export class LunarRangeError extends Error {
  constructor(date: Date, verifiedRange: string = VERIFIED_RANGE_LABEL) {
    super(
      `Almanac: cannot compute lunar date for ${date.toISOString()}\n` +
        `Lunar-calendar library supports ${verifiedRange}. This date falls outside that range.`,
    );
    this.name = "LunarRangeError";
  }
}

export interface AlmanacContent {
  gregorian: { year: number; month: number; day: number; weekday: number };
  /**
   * Numeric lunar month/day (1-based). Added beyond the plan text's literal
   * four-field interface (deviation, recorded in SUMMARY.md): English mode's
   * "{Nth} Month, {Nth} Day" copy (UI-SPEC "Card chrome strings") needs
   * numbers to format ordinals from, and lunar-typescript's Lunar class
   * already exposes getMonth()/getDay() as numbers alongside the
   * Chinese-numeral string variants below — using them is not new library
   * surface, just an additional pair of fields on this interface.
   */
  lunarMonth: number;
  lunarDay: number;
  /** e.g. "六" */
  lunarMonthZh: string;
  /** e.g. "十九" */
  lunarDayZh: string;
  /** e.g. "甲子" */
  dayGanZhi: string;
  /** One of 建除滿平定執破危成收開閉 */
  zhiXing: string;
}

interface ZonedWallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedWallClockParts(date: Date, timeZone: string): ZonedWallClockParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string): number => {
    const value = parts.find((part) => part.type === type)?.value;
    if (value === undefined) {
      throw new Error(`zonedWallClockParts: missing "${type}" part for timezone "${timeZone}"`);
    }
    return Number(value);
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Re-express `date`'s instant as the wall-clock date/time it corresponds to
 * in `timeZone`, packed into a Date object whose *local* getters
 * (getFullYear/getMonth/getDate/getDay/...) return that wall-clock value
 * regardless of the current process's own system timezone.
 *
 * This matters because lunar-typescript's `Solar.fromDate()` reads a Date
 * via local getters, not UTC getters — a naive `new Date(now)` would use the
 * *process's* local timezone instead of the caller's requested `timezone`,
 * and using UTC getters directly would ignore `timezone` entirely and get
 * day boundaries wrong (D-07: "today" is timezone-driven, not UTC-driven).
 * The local Date constructor and local getters are mutual inverses within a
 * single process regardless of that process's actual system timezone, so
 * this round-trips correctly on any runtime (dev machine or CI runner).
 */
function toZonedLocalDate(date: Date, timeZone: string): Date {
  const { year, month, day, hour, minute, second } = zonedWallClockParts(date, timeZone);
  return new Date(year, month - 1, day, hour, minute, second);
}

/**
 * Pure function: given an instant (`now`) and an IANA timezone name, compute
 * this card's full calendrical content. Throws LunarRangeError for any
 * timezone-local year outside lunar-typescript's verified-accurate range
 * (see VERIFIED_MIN_YEAR/VERIFIED_MAX_YEAR above) instead of returning a
 * result the library was never confirmed correct for.
 */
export function getAlmanacContent(now: Date, timezone: string): AlmanacContent {
  const zonedDate = toZonedLocalDate(now, timezone);
  const zonedYear = zonedDate.getFullYear();
  if (zonedYear < VERIFIED_MIN_YEAR || zonedYear > VERIFIED_MAX_YEAR) {
    throw new LunarRangeError(now);
  }

  const solar = Solar.fromDate(zonedDate);
  const lunar = solar.getLunar();
  return {
    gregorian: {
      year: zonedDate.getFullYear(),
      month: zonedDate.getMonth() + 1,
      day: zonedDate.getDate(),
      weekday: zonedDate.getDay(),
    },
    lunarMonth: lunar.getMonth(),
    lunarDay: lunar.getDay(),
    lunarMonthZh: lunar.getMonthInChinese(),
    lunarDayZh: lunar.getDayInChinese(),
    dayGanZhi: lunar.getDayInGanZhi(),
    zhiXing: lunar.getZhiXing(),
  };
}
