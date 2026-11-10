// time-window.ts — 時間窓判定関数（日跨ぎ対応）
//
// 責務:
// - isInTimeWindow: 現在時刻が設定された時間枠（startTime〜endTime）内に
//   いるかを判定する純粋関数
// - startTime > endTime の場合、日跨ぎ（深夜を跨ぐ窓）とみなして処理
//
// Layer 0/1 純粋ロジック（副作用なし、ファイルI/Oなし）
//
// 依存: P6-1 (WatcherConfig の startTime/endTime フォーマット)
// 依存出力: P7-1 (CronScheduler), P8-1 (ステップ境界時間制御)

/** "HH:mm" 形式（24時間表記）の検証用正規表現 */
const TIME_FORMAT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * "HH:mm" 形式の時刻文字列をパースし、0時からの経過分数を返す。
 * バリデーションも兼ねており、不正な形式の場合はエラーを投げる。
 * @param timeStr "HH:mm" 形式の時刻文字列（例: "09:00", "23:59"）
 * @returns 0時からの経過分数（例: "09:00" → 540）
 * @throws 不正な形式の場合 Error
 */
function parseTimeToMinutes(timeStr: string): number {
  if (typeof timeStr !== "string" || !TIME_FORMAT_PATTERN.test(timeStr)) {
    throw new Error(
      `時刻文字列の形式が不正です（"HH:mm" 形式、例: "09:00"）: ${timeStr}`,
    );
  }

  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 曜日名（"Sun"〜"Sat"）→ 曜日番号（0=日曜〜6=土曜） */
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * 指定された時刻（Date）が設定された時間枠（startTime〜endTime）内に
 * あるかを判定する純粋関数。
 *
 * startTime > endTime の場合は日跨ぎ（深夜跨ぎ）の時間枠として扱う。
 * daysOfWeek が指定された場合、曜日フィルタを適用する。日跨ぎ窓では
 * 「窓インスタンスの開始日」の曜日で判定し、窓の連続性を保つ。
 * タイムゾーン変換は Intl.DateTimeFormat.formatToParts で行うため、
 * 外部ライブラリへの依存はない。
 *
 * @param now 判定対象の時刻
 * @param startTime 開始時刻 "HH:mm" 形式（24時間表記）
 * @param endTime 終了時刻 "HH:mm" 形式（24時間表記）
 * @param timezone IANA タイムゾーン名（例: "Asia/Tokyo", "America/New_York"）
 * @param daysOfWeek 実行を許可する曜日（0=日曜〜6=土曜）。未指定は全曜日
 * @returns 時間枠内なら true、枠外なら false
 * @throws startTime または endTime が "HH:mm" 形式でない場合 Error
 */
export function isInTimeWindow(
  now: Date,
  startTime: string,
  endTime: string,
  timezone: string,
  daysOfWeek?: number[],
): boolean {
  // 開始・終了時刻を0時からの経過分数に変換
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  // 設定タイムゾーンの壁時計で時・分・曜日を取得
  const { hour, minute, weekday } = getLocalizedDateTimeParts(now, timezone);
  const currentMinutes = hour * 60 + minute;

  // 曜日フィルタ（未指定は全曜日）
  if (!isAllowedDay(currentMinutes, startMinutes, endMinutes, weekday, daysOfWeek)) {
    return false;
  }

  // 日跨ぎ判定: startMinutes > endMinutes なら深夜を跨ぐ時間枠
  if (startMinutes <= endMinutes) {
    return isWithinSameDayWindow(currentMinutes, startMinutes, endMinutes);
  }
  return isWithinCrossDayWindow(currentMinutes, startMinutes, endMinutes);
}

/** The wall-clock fields of an instant in a configured timezone. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface LocalizedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

/**
 * 設定タイムゾーンの壁時計で年・月・日・時・分・曜日を返す。
 * Intl.DateTimeFormat.formatToParts を1回呼ぶだけで全情報を得る。
 */
// [::TICKET::] PX-173 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-173 --for-spec --no-implementation-order`.
export function getLocalizedDateTimeParts(
  now: Date,
  timezone: string,
): LocalizedDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);

  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let weekday = 0;
  for (const part of parts) {
    if (part.type === "year") {
      year = parseInt(part.value, 10);
    } else if (part.type === "month") {
      month = parseInt(part.value, 10);
    } else if (part.type === "day") {
      day = parseInt(part.value, 10);
    } else if (part.type === "hour") {
      hour = parseInt(part.value, 10);
    } else if (part.type === "minute") {
      minute = parseInt(part.value, 10);
    } else if (part.type === "weekday") {
      weekday = WEEKDAY_INDEX[part.value] ?? 0;
    }
  }
  return { year, month, day, hour, minute, weekday };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function toIsoDate(parts: Pick<LocalizedDateTimeParts, "year" | "month" | "day">): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** Shift an ISO calendar date by whole days without DST arithmetic. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + deltaDays));
  return toIsoDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

/**
 * The calendar date on which the current window instance started, in the
 * configured timezone. A cross-midnight window viewed after midnight belongs
 * to the previous day, which is the date `days` filters must match.
 */
export function getWindowStartIsoDate(
  now: Date,
  startTime: string,
  endTime: string,
  timezone: string,
): string {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const parts = getLocalizedDateTimeParts(now, timezone);
  const currentMinutes = parts.hour * 60 + parts.minute;
  const isoDate = toIsoDate(parts);
  if (startMinutes > endMinutes && currentMinutes <= endMinutes) {
    return shiftIsoDate(isoDate, -1);
  }
  return isoDate;
}

/**
 * 曜日フィルタ。daysOfWeek が未指定・空配列の場合は全曜日を許可する。
 * 日跨ぎ窓（startMinutes > endMinutes）の深夜側は前日開始の窓インスタンス
 * とみなし、前日の曜日で判定する（開始日帰属）。
 */
// [::TICKET::] PX-173 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-173 --for-spec --no-implementation-order`.
function isAllowedDay(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number,
  weekday: number,
  daysOfWeek?: number[],
): boolean {
  if (daysOfWeek === undefined || daysOfWeek.length === 0) {
    return true;
  }
  const windowStartDay =
    startMinutes > endMinutes && currentMinutes <= endMinutes
      ? (weekday + 6) % 7
      : weekday;
  return daysOfWeek.includes(windowStartDay);
}

/** 同一日内の時間窓判定（境界を含む） */
// [::TICKET::] PX-173 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-173 --for-spec --no-implementation-order`.
function isWithinSameDayWindow(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/** 日跨ぎ時間窓の判定（例: 22:00〜06:00、境界を含む） */
// [::TICKET::] PX-173 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-173 --for-spec --no-implementation-order`.
function isWithinCrossDayWindow(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}
