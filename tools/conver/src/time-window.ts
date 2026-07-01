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

/**
 * 指定された時刻（Date）が設定された時間枠（startTime〜endTime）内に
 * あるかを判定する純粋関数。
 *
 * startTime > endTime の場合は日跨ぎ（深夜跨ぎ）の時間枠として扱う。
 * タイムゾーン変換は Intl.DateTimeFormat.formatToParts で行うため、
 * 外部ライブラリへの依存はない。
 *
 * @param now 判定対象の時刻
 * @param startTime 開始時刻 "HH:mm" 形式（24時間表記）
 * @param endTime 終了時刻 "HH:mm" 形式（24時間表記）
 * @param timezone IANA タイムゾーン名（例: "Asia/Tokyo", "America/New_York"）
 * @returns 時間枠内なら true、枠外なら false
 * @throws startTime または endTime が "HH:mm" 形式でない場合 Error
 */
export function isInTimeWindow(
  now: Date,
  startTime: string,
  endTime: string,
  timezone: string,
): boolean {
  // 開始・終了時刻を0時からの経過分数に変換
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  // Intl.DateTimeFormat でタイムゾーン変換後の時・分を取得
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const timeParts = timeFormatter.formatToParts(now);
  let currentHour = 0;
  let currentMinute = 0;
  for (const part of timeParts) {
    if (part.type === "hour") {
      currentHour = parseInt(part.value, 10);
    } else if (part.type === "minute") {
      currentMinute = parseInt(part.value, 10);
    }
  }
  const currentMinutes = currentHour * 60 + currentMinute;

  // 日跨ぎ判定: startMinutes > endMinutes なら深夜を跨ぐ時間枠
  if (startMinutes <= endMinutes) {
    // 同一日内
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  // 日跨ぎ（例: 22:00〜06:00）
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}
