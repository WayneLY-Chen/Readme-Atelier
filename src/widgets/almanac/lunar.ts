import { Solar } from "lunar-typescript";

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
 * this card's full calendrical content. Year-range guarding against
 * lunar-typescript's real supported range is added in Task 3.
 */
export function getAlmanacContent(now: Date, timezone: string): AlmanacContent {
  const zonedDate = toZonedLocalDate(now, timezone);
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
