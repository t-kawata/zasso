// watcher.ts — Watcher 設定ファイルの型定義・バリデーション・読み込み
//
// 責務:
// - WatcherConfig インターフェースの定義（intervalMinutes, startTime, endTime, timezone）
// - ValidationResult インターフェースの定義
// - validateWatcherConfig: 純粋関数による全フィールド検証
// - loadWatcherConfig: ファイル読み込み + JSONパース + バリデーションの一貫実行
//
// Layer 0/1 純粋ロジック（loadWatcherConfig のみファイルI/Oを含む）
import { readFileSync } from "node:fs";

/** "HH:mm" 形式（24時間表記）の検証用正規表現 */
const TIME_FORMAT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** intervalMinutes の最小値（分） */
const INTERVAL_MIN_MINUTES = 1;

/** intervalMinutes の最大値（分）= 365日 × 24時間 × 60分 */
const INTERVAL_MAX_MINUTES = 525_600;

/**
 * Watcher 設定ファイルの型定義。
 * -w/--watcher フラグで指定されるJSON設定ファイルの内容に対応する。
 */
// [::TICKET::] PX-173 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-173 --for-spec --no-implementation-order`.
export interface WatcherConfig {
  /** 定期実行間隔（分）。1以上、525600（1年分）以下。 */
  intervalMinutes: number;
  /** 開始時刻 "HH:mm" 形式（24時間表記）。例: "09:00" */
  startTime: string;
  /** 終了時刻 "HH:mm" 形式（24時間表記）。例: "17:30" */
  endTime: string;
  /** IANA タイムゾーン名。例: "Asia/Tokyo", "America/New_York" */
  timezone: string;
  /** 実行を許可する曜日（0=日曜〜6=土曜）。未指定は全曜日。 */
  daysOfWeek?: number[];
}

/**
 * バリデーション結果。
 * valid が false の場合、errors に検証エラーメッセージが格納される。
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 設定オブジェクトが正しい WatcherConfig か検証する純粋関数。
 * ファイルI/Oは行わず、与えられたオブジェクトの各フィールドを型・値範囲・
 * フォーマットの観点で検証する。
 * @param config 検証対象のオブジェクト（unknown として受け取り安全に狭める）
 * @returns 検証結果
 */
export function validateWatcherConfig(config: unknown): ValidationResult {
  const errors: string[] = [];

  if (config === null || config === undefined || typeof config !== "object") {
    errors.push("設定が null、undefined、またはオブジェクトではありません");
    return { valid: false, errors };
  }

  const candidate = config as Record<string, unknown>;

  // intervalMinutes の検証
  if (candidate.intervalMinutes === undefined || candidate.intervalMinutes === null) {
    errors.push("intervalMinutes が設定されていません");
  } else if (typeof candidate.intervalMinutes !== "number") {
    errors.push("intervalMinutes は数値である必要があります");
  } else if (!Number.isInteger(candidate.intervalMinutes)) {
    errors.push("intervalMinutes は整数である必要があります");
  } else if (
    candidate.intervalMinutes < INTERVAL_MIN_MINUTES ||
    candidate.intervalMinutes > INTERVAL_MAX_MINUTES
  ) {
    errors.push(
      `intervalMinutes は ${INTERVAL_MIN_MINUTES} 以上 ${INTERVAL_MAX_MINUTES} 以下である必要があります`,
    );
  }

  // startTime の検証
  if (candidate.startTime === undefined || candidate.startTime === null) {
    errors.push("startTime が設定されていません");
  } else if (typeof candidate.startTime !== "string") {
    errors.push("startTime は文字列である必要があります");
  } else if (!TIME_FORMAT_PATTERN.test(candidate.startTime)) {
    errors.push(
      `startTime の形式が不正です（"HH:mm" 形式、例: "09:00"）: ${candidate.startTime}`,
    );
  }

  // endTime の検証
  if (candidate.endTime === undefined || candidate.endTime === null) {
    errors.push("endTime が設定されていません");
  } else if (typeof candidate.endTime !== "string") {
    errors.push("endTime は文字列である必要があります");
  } else if (!TIME_FORMAT_PATTERN.test(candidate.endTime)) {
    errors.push(
      `endTime の形式が不正です（"HH:mm" 形式、例: "17:30"）: ${candidate.endTime}`,
    );
  }

  // timezone の検証
  if (candidate.timezone === undefined || candidate.timezone === null) {
    errors.push("timezone が設定されていません");
  } else if (typeof candidate.timezone !== "string") {
    errors.push("timezone は文字列である必要があります");
  } else if (candidate.timezone.trim() === "") {
    errors.push("timezone が空文字です");
  } else if (!isValidTimezone(candidate.timezone)) {
    errors.push(
      `timezone が有効なIANAタイムゾーン名ではありません: ${candidate.timezone}`,
    );
  }

  // daysOfWeek の検証（オプショナル — 未指定は全曜日）
  validateDaysOfWeek(candidate.daysOfWeek, errors);

  return { valid: errors.length === 0, errors };
}

/**
 * daysOfWeek を検証する。undefined / null は許容（全曜日 = 後方互換）。
 * @param value 検証対象の値（WatcherConfig.daysOfWeek）
 * @param errors 検証エラーを追記する配列
 */
// [::TICKET::] PX-173 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-173 --for-spec --no-implementation-order`.
function validateDaysOfWeek(value: unknown, errors: string[]): void {
  if (value === undefined || value === null) {
    return;
  }
  if (!Array.isArray(value)) {
    errors.push("daysOfWeek は配列である必要があります");
    return;
  }
  if (value.length === 0) {
    errors.push("daysOfWeek は空配列にできません（未指定なら省略してください）");
    return;
  }
  const seen = new Set<number>();
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item)) {
      errors.push(`daysOfWeek の要素は整数である必要があります: ${item}`);
    } else if (item < 0 || item > 6) {
      errors.push(
        `daysOfWeek の要素は 0(日)〜6(土) の範囲である必要があります: ${item}`,
      );
    } else if (seen.has(item)) {
      errors.push(`daysOfWeek に重複した値があります: ${item}`);
    } else {
      seen.add(item);
    }
  }
}

/**
 * 文字列が有効な IANA タイムゾーン名か検証する。
 * Node.js の Intl.supportedValuesOf("timeZone") で判定する。
 * @param tz 検証対象のタイムゾーン名
 * @returns 有効なタイムゾーンなら true
 */
// [::TICKET::] PX-173 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-173 --for-spec --no-implementation-order`.
function isValidTimezone(tz: string): boolean {
  try {
    // Intl.supportedValuesOf("timeZone") は有効な IANA 名の一部（例: "UTC"）を
    // 返さないことがあるため、実際に Intl.DateTimeFormat が構築できるかで判定する。
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    // 不正なタイムゾーン名は RangeError になり false を返す
    return false;
  }
}

/**
 * JSON 設定ファイルを読み込み、パース・バリデーションして WatcherConfig を返す。
 * ファイルが存在しない、JSON として不正、またはバリデーションに失敗した場合は
 * Error を throw する。
 * @param configPath 設定ファイルのパス
 * @returns 検証済みの WatcherConfig
 * @throws ファイル不在時は ENOENT、JSONパースエラー時は SyntaxError、
 *         バリデーション失敗時は Error（メッセージに詳細を含む）
 */
export function loadWatcherConfig(configPath: string): WatcherConfig {
  const raw = readFileSync(configPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  const validation = validateWatcherConfig(parsed);

  if (!validation.valid) {
    throw new Error(
      `Watcher 設定ファイルのバリデーションに失敗しました: ${validation.errors.join("; ")}`,
    );
  }

  return parsed as WatcherConfig;
}
