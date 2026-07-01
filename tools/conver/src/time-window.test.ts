// time-window.test.ts — time-window.ts のユニットテスト
//
// テスト対象: isInTimeWindow()
// テスト戦略: 全ケースを純粋関数の入力→出力で検証（外部依存なし）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isInTimeWindow } from "./time-window.js";

// ============================================================
// isInTimeWindow のテスト
// ============================================================
describe("isInTimeWindow", () => {
  // ============================================================
  // 正常系: 同一日内（startMinutes <= endMinutes）
  // ============================================================

  it("同一日内（start < end）で範囲内 → true", () => {
    // 10:00 は 09:00〜17:00 の範囲内
    const now = new Date("2026-07-01T10:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "09:00", "17:00", "UTC"), true);
  });

  it("同一日内（start < end）で開始前 → false", () => {
    // 08:00 は 09:00〜17:00 の範囲外（前）
    const now = new Date("2026-07-01T08:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "09:00", "17:00", "UTC"), false);
  });

  it("同一日内（start < end）で終了後 → false", () => {
    // 18:00 は 09:00〜17:00 の範囲外（後）
    const now = new Date("2026-07-01T18:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "09:00", "17:00", "UTC"), false);
  });

  // ============================================================
  // 正常系: 日跨ぎ（startMinutes > endMinutes）
  // ============================================================

  it("日跨ぎ（start > end）で範囲内（深夜側）→ true", () => {
    // 02:00 は 22:00〜06:00 の範囲内（深夜側）
    const now = new Date("2026-07-01T02:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "22:00", "06:00", "UTC"), true);
  });

  it("日跨ぎ（start > end）で範囲内（夜側）→ true", () => {
    // 23:30 は 22:00〜06:00 の範囲内（夜側）
    const now = new Date("2026-07-01T23:30:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "22:00", "06:00", "UTC"), true);
  });

  it("日跨ぎ（start > end）で範囲外（昼間）→ false", () => {
    // 12:00 は 22:00〜06:00 の範囲外
    const now = new Date("2026-07-01T12:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "22:00", "06:00", "UTC"), false);
  });

  // ============================================================
  // 境界値
  // ============================================================

  it("境界値: 開始時刻ちょうど → true", () => {
    const now = new Date("2026-07-01T09:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "09:00", "17:00", "UTC"), true);
  });

  it("境界値: 終了時刻ちょうど → true", () => {
    const now = new Date("2026-07-01T17:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "09:00", "17:00", "UTC"), true);
  });

  it("境界値: 日跨ぎ開始時刻ちょうど → true", () => {
    const now = new Date("2026-07-01T22:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "22:00", "06:00", "UTC"), true);
  });

  it("境界値: 日跨ぎ終了時刻ちょうど → true", () => {
    const now = new Date("2026-07-01T06:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "22:00", "06:00", "UTC"), true);
  });

  // ============================================================
  // 異常系: 不正な時刻文字列
  // ============================================================

  it("不正な startTime 文字列 → throw Error", () => {
    const now = new Date("2026-07-01T10:00:00.000Z");
    assert.throws(
      () => isInTimeWindow(now, "invalid", "17:00", "UTC"),
      Error,
    );
  });

  it("空文字の endTime → throw Error", () => {
    const now = new Date("2026-07-01T10:00:00.000Z");
    assert.throws(
      () => isInTimeWindow(now, "09:00", "", "UTC"),
      Error,
    );
  });

  it("数値の startTime → throw Error", () => {
    const now = new Date("2026-07-01T10:00:00.000Z");
    // TypeScript の型チェックを迂回するため any 経由で呼び出し
    assert.throws(
      () => isInTimeWindow(now, 12345 as unknown as string, "17:00", "UTC"),
      Error,
    );
  });

  // ============================================================
  // タイムゾーン変換
  // ============================================================

  it("タイムゾーン変換: JST 09:00 = UTC 00:00 が範囲内（JST基準）→ true", () => {
    // 2026-07-01T00:00:00Z = 2026-07-01 09:00 JST
    const now = new Date("2026-07-01T00:00:00.000Z");
    // JST 09:00 は 09:00〜17:00 の範囲内
    assert.strictEqual(isInTimeWindow(now, "09:00", "17:00", "Asia/Tokyo"), true);
  });

  it("タイムゾーン変換: JST 09:00 = UTC 00:00 が範囲外（UTC基準）→ false", () => {
    // 同じ時刻でも UTC 基準だと 00:00 なので範囲外
    const now = new Date("2026-07-01T00:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "09:00", "17:00", "UTC"), false);
  });

  // ============================================================
  // 全時間帯（境界付近の連続性）
  // ============================================================

  it("00:00（深夜0時）が日跨ぎ範囲内 → true", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "22:00", "06:00", "UTC"), true);
  });

  it("00:00（深夜0時）が同一日内範囲外 → false", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    assert.strictEqual(isInTimeWindow(now, "09:00", "17:00", "UTC"), false);
  });
});
