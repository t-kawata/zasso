// watcher.test.ts — watcher.ts のユニットテスト
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する
//
// loadWatcherConfig のファイルI/Oテストは一時ファイルを作成して行う。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  WatcherConfig,
  ValidationResult,
  validateWatcherConfig,
  loadWatcherConfig,
} from "./watcher.js";

/** 完全に有効な WatcherConfig オブジェクト */
function validConfig(): WatcherConfig {
  return {
    intervalMinutes: 30,
    startTime: "09:00",
    endTime: "17:30",
    timezone: "Asia/Tokyo",
  };
}

/** テスト用に一時ディレクトリに JSON 設定ファイルを書き込み、そのパスを返す */
function writeTempConfig(data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "wc-"));
  const path = join(dir, "watcher-config.json");
  writeFileSync(path, JSON.stringify(data), "utf-8");
  return path;
}

// ============================================================
// validateWatcherConfig のテスト
// ============================================================
describe("validateWatcherConfig", () => {
  // --- 正常系 ---
  it("全フィールドが正しい有効値 → valid: true, errors: []", () => {
    const result = validateWatcherConfig(validConfig());
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it("intervalMinutes=1（最小値）→ valid: true", () => {
    const config = { ...validConfig(), intervalMinutes: 1 };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, true);
  });

  it("intervalMinutes=525600（最大値）→ valid: true", () => {
    const config = { ...validConfig(), intervalMinutes: 525_600 };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, true);
  });

  it("startTime=00:00（境界値）→ valid: true", () => {
    const config = { ...validConfig(), startTime: "00:00" };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, true);
  });

  it("endTime=23:59（境界値）→ valid: true", () => {
    const config = { ...validConfig(), endTime: "23:59" };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, true);
  });

  // --- 異常系: 型・構造エラー ---
  it("null 入力 → errors に欠落エラー", () => {
    const result = validateWatcherConfig(null);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it("undefined 入力 → errors に欠落エラー", () => {
    const result = validateWatcherConfig(undefined);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it("{} 空オブジェクト → errors に全4フィールド欠落", () => {
    const result = validateWatcherConfig({});
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, 4);
  });

  // --- 異常系: intervalMinutes ---
  it("intervalMinutes=0 → errors に範囲エラー", () => {
    const config = { ...validConfig(), intervalMinutes: 0 };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("intervalMinutes")));
  });

  it("intervalMinutes=-1 → errors に範囲エラー", () => {
    const config = { ...validConfig(), intervalMinutes: -1 };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("intervalMinutes")));
  });

  it("intervalMinutes=1.5（小数）→ errors に整数チェックエラー", () => {
    const config = { ...validConfig(), intervalMinutes: 1.5 };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("整数")));
  });

  it('intervalMinutes="abc"（非数値）→ errors に型エラー', () => {
    const config = { ...validConfig(), intervalMinutes: "abc" };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("数値")));
  });

  // --- 異常系: startTime ---
  it('startTime="25:00"（時が範囲外）→ errors にフォーマットエラー', () => {
    const config = { ...validConfig(), startTime: "25:00" };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("startTime")));
  });

  it('startTime="09:60"（分が範囲外）→ errors にフォーマットエラー', () => {
    const config = { ...validConfig(), startTime: "09:60" };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("startTime")));
  });

  it('startTime=""（空文字）→ errors にフォーマットエラー', () => {
    const config = { ...validConfig(), startTime: "" };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("startTime")));
  });

  // --- 異常系: endTime ---
  it('endTime="abc" → errors にフォーマットエラー', () => {
    const config = { ...validConfig(), endTime: "abc" };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("endTime")));
  });

  // --- 異常系: timezone ---
  it('timezone=""（空文字）→ errors にタイムゾーンエラー', () => {
    const config = { ...validConfig(), timezone: "" };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("timezone")));
  });

  it('timezone="Invalid/Zone"（不正IANA名）→ errors にタイムゾーンエラー', () => {
    const config = { ...validConfig(), timezone: "Invalid/Zone" };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("timezone")));
  });

  // --- 複合エラー ---
  it("intervalMinutes=0 + 不正startTime + 空timezone → 3件のエラー", () => {
    const config = {
      intervalMinutes: 0,
      startTime: "99:99",
      endTime: "17:30",
      timezone: "",
    };
    const result = validateWatcherConfig(config);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, 3);
  });
});

// ============================================================
// loadWatcherConfig のテスト（ファイルI/O結合テスト）
// ============================================================
describe("loadWatcherConfig", () => {
  it("有効なJSON設定ファイル → パース成功、正しいWatcherConfig返却", () => {
    const config: WatcherConfig = {
      intervalMinutes: 15,
      startTime: "08:00",
      endTime: "22:00",
      timezone: "America/New_York",
    };
    const path = writeTempConfig(config);
    const loaded = loadWatcherConfig(path);
    assert.strictEqual(loaded.intervalMinutes, 15);
    assert.strictEqual(loaded.startTime, "08:00");
    assert.strictEqual(loaded.endTime, "22:00");
    assert.strictEqual(loaded.timezone, "America/New_York");
  });

  it("存在しないファイルパス → ENOENT を throw", () => {
    assert.throws(
      () => loadWatcherConfig("/nonexistent/watcher-config.json"),
      { code: "ENOENT" },
    );
  });

  it("不正なJSONファイル → SyntaxError を throw", () => {
    const dir = mkdtempSync(join(tmpdir(), "wc-"));
    const path = join(dir, "bad.json");
    writeFileSync(path, "{invalid json}", "utf-8");
    assert.throws(
      () => loadWatcherConfig(path),
      SyntaxError,
    );
  });

  it("必須フィールド欠落のJSON → Error（バリデーションメッセージ含む）を throw", () => {
    const path = writeTempConfig({ intervalMinutes: 30 });
    assert.throws(
      () => loadWatcherConfig(path),
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes("バリデーション"),
    );
  });
});
