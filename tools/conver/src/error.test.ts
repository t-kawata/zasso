// error.test.ts — CommandTimeoutError のユニットテスト
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CommandTimeoutError } from "./error.js";

describe("CommandTimeoutError", () => {
  it("name プロパティが CommandTimeoutError である", () => {
    const error = new CommandTimeoutError("test message");
    assert.strictEqual(error.name, "CommandTimeoutError");
  });

  it("Error のインスタンスである", () => {
    const error = new CommandTimeoutError("test message");
    assert.ok(error instanceof Error);
  });

  it("message がコンストラクタ引数と一致する", () => {
    const message = "Command timed out after 5000ms";
    const error = new CommandTimeoutError(message);
    assert.strictEqual(error.message, message);
  });

  it("stack が定義されている（Error 継承の確認）", () => {
    const error = new CommandTimeoutError("test");
    assert.strictEqual(typeof error.stack, "string");
  });

  it("空文字メッセージでも例外が発生しない", () => {
    assert.doesNotThrow(() => {
      new CommandTimeoutError("");
    });
  });

  it("長文メッセージでも name の値は正しい", () => {
    const longMessage = "x".repeat(1000);
    const error = new CommandTimeoutError(longMessage);
    assert.strictEqual(error.name, "CommandTimeoutError");
    assert.strictEqual(error.message, longMessage);
  });
});
