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

// ============================================================
// isInTimeWindow の曜日フィルタ（daysOfWeek）
// @verifies C001
// @verifies C003
// @verifies C004
// ============================================================
// [::TICKET::] PX-173 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-173 --for-spec --no-implementation-order`.
describe("isInTimeWindow — daysOfWeek", () => {
  // --- C001: 後方互換（undefined = 全曜日） ---

  it("daysOfWeek undefined → 日曜・水曜・土曜すべて active（後方互換）", () => {
    const sunday = new Date("2026-08-23T10:00:00Z");
    const wednesday = new Date("2026-08-26T10:00:00Z");
    const saturday = new Date("2026-08-29T10:00:00Z");
    for (const now of [sunday, wednesday, saturday]) {
      assert.strictEqual(isInTimeWindow(now, "09:00", "17:00", "UTC", undefined), true);
    }
  });

  it("daysOfWeek=[0,1,2,3,4,5,6] と undefined が全サンプルで等価", () => {
    const instants = ["2026-08-23T10:00:00Z", "2026-08-24T00:30:00Z", "2026-08-29T23:00:00Z"];
    for (const iso of instants) {
      const base = isInTimeWindow(new Date(iso), "09:00", "17:00", "UTC", undefined);
      const allDays = isInTimeWindow(new Date(iso), "09:00", "17:00", "UTC", [0, 1, 2, 3, 4, 5, 6]);
      assert.strictEqual(base, allDays);
    }
  });

  // --- C003: 同一日窓の曜日フィルタ ---

  it("平日 [1..5] + 09:00-17:00: 月10時 true / 土10時 false / 月08時 false", () => {
    assert.strictEqual(
      isInTimeWindow(new Date("2026-08-24T10:00:00Z"), "09:00", "17:00", "UTC", [1, 2, 3, 4, 5]),
      true,
    );
    assert.strictEqual(
      isInTimeWindow(new Date("2026-08-29T10:00:00Z"), "09:00", "17:00", "UTC", [1, 2, 3, 4, 5]),
      false,
    );
    assert.strictEqual(
      isInTimeWindow(new Date("2026-08-24T08:00:00Z"), "09:00", "17:00", "UTC", [1, 2, 3, 4, 5]),
      false,
    );
  });

  it("daysOfWeek=[0]（日曜のみ）で日曜 active、月曜 inactive", () => {
    assert.strictEqual(isInTimeWindow(new Date("2026-08-23T10:00:00Z"), "00:00", "23:59", "UTC", [0]), true);
    assert.strictEqual(isInTimeWindow(new Date("2026-08-24T10:00:00Z"), "00:00", "23:59", "UTC", [0]), false);
  });

  it("daysOfWeek=[6]（土曜のみ）で土曜 active、日曜 inactive", () => {
    assert.strictEqual(isInTimeWindow(new Date("2026-08-29T10:00:00Z"), "00:00", "23:59", "UTC", [6]), true);
    assert.strictEqual(isInTimeWindow(new Date("2026-08-23T10:00:00Z"), "00:00", "23:59", "UTC", [6]), false);
  });

  // @verifies C003
  it("曜日判定は config.timezone 基準（JST=月09:30 / NY=日20:30 の同一瞬間）", () => {
    const instant = new Date("2026-08-24T00:30:00Z");
    assert.strictEqual(isInTimeWindow(instant, "00:00", "23:59", "Asia/Tokyo", [1]), true);
    assert.strictEqual(isInTimeWindow(instant, "00:00", "23:59", "America/New_York", [1]), false);
  });

  // --- C004: 日跨ぎ窓（開始日帰属・連続性） ---

  // @verifies C004
  it("日跨ぎ窓 22:00-06:00 + daysOfWeek=[1]: 月23時 active / 火03時 active / 火23時 inactive / 日23時 inactive", () => {
    assert.strictEqual(isInTimeWindow(new Date("2026-08-24T23:00:00Z"), "22:00", "06:00", "UTC", [1]), true);
    assert.strictEqual(isInTimeWindow(new Date("2026-08-25T03:00:00Z"), "22:00", "06:00", "UTC", [1]), true);
    assert.strictEqual(isInTimeWindow(new Date("2026-08-25T23:00:00Z"), "22:00", "06:00", "UTC", [1]), false);
    assert.strictEqual(isInTimeWindow(new Date("2026-08-23T23:00:00Z"), "22:00", "06:00", "UTC", [1]), false);
  });

  it("日跨ぎ窓の開始時刻ちょうど（22:00）と終了時刻ちょうど（06:00）で active", () => {
    assert.strictEqual(isInTimeWindow(new Date("2026-08-24T22:00:00Z"), "22:00", "06:00", "UTC", [1]), true);
    assert.strictEqual(isInTimeWindow(new Date("2026-08-25T06:00:00Z"), "22:00", "06:00", "UTC", [1]), true);
  });
});
