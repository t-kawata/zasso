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
export interface WatcherConfig {
  /** 定期実行間隔（分）。1以上、525600（1年分）以下。 */
  intervalMinutes: number;
  /** 開始時刻 "HH:mm" 形式（24時間表記）。例: "09:00" */
  startTime: string;
  /** 終了時刻 "HH:mm" 形式（24時間表記）。例: "17:30" */
  endTime: string;
  /** IANA タイムゾーン名。例: "Asia/Tokyo", "America/New_York" */
  timezone: string;
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

  const obj = config as Record<string, unknown>;

  // intervalMinutes の検証
  if (obj.intervalMinutes === undefined || obj.intervalMinutes === null) {
    errors.push("intervalMinutes が設定されていません");
  } else if (typeof obj.intervalMinutes !== "number") {
    errors.push("intervalMinutes は数値である必要があります");
  } else if (!Number.isInteger(obj.intervalMinutes)) {
    errors.push("intervalMinutes は整数である必要があります");
  } else if (
    obj.intervalMinutes < INTERVAL_MIN_MINUTES ||
    obj.intervalMinutes > INTERVAL_MAX_MINUTES
  ) {
    errors.push(
      `intervalMinutes は ${INTERVAL_MIN_MINUTES} 以上 ${INTERVAL_MAX_MINUTES} 以下である必要があります`,
    );
  }

  // startTime の検証
  if (obj.startTime === undefined || obj.startTime === null) {
    errors.push("startTime が設定されていません");
  } else if (typeof obj.startTime !== "string") {
    errors.push("startTime は文字列である必要があります");
  } else if (!TIME_FORMAT_PATTERN.test(obj.startTime)) {
    errors.push(
      `startTime の形式が不正です（"HH:mm" 形式、例: "09:00"）: ${obj.startTime}`,
    );
  }

  // endTime の検証
  if (obj.endTime === undefined || obj.endTime === null) {
    errors.push("endTime が設定されていません");
  } else if (typeof obj.endTime !== "string") {
    errors.push("endTime は文字列である必要があります");
  } else if (!TIME_FORMAT_PATTERN.test(obj.endTime)) {
    errors.push(
      `endTime の形式が不正です（"HH:mm" 形式、例: "17:30"）: ${obj.endTime}`,
    );
  }

  // timezone の検証
  if (obj.timezone === undefined || obj.timezone === null) {
    errors.push("timezone が設定されていません");
  } else if (typeof obj.timezone !== "string") {
    errors.push("timezone は文字列である必要があります");
  } else if (obj.timezone.trim() === "") {
    errors.push("timezone が空文字です");
  } else if (!isValidTimezone(obj.timezone)) {
    errors.push(
      `timezone が有効なIANAタイムゾーン名ではありません: ${obj.timezone}`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 文字列が有効な IANA タイムゾーン名か検証する。
 * Node.js の Intl.supportedValuesOf("timeZone") で判定する。
 * @param tz 検証対象のタイムゾーン名
 * @returns 有効なタイムゾーンなら true
 */
function isValidTimezone(tz: string): boolean {
  try {
    const available = Intl.supportedValuesOf("timeZone");
    return available.includes(tz);
  } catch {
    // Intl.supportedValuesOf が未サポートの環境では寛容に扱う
    return true;
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
