// cli.test.ts — parseCliOptions のユニットテスト
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する
//
// process.exit(1) / exit(0) を含むテスト（--help 表示、必須フラグ欠如など）は
// test.sh の統合テストで検証する。本ファイルでは全フラグ指定時の正常系と
// デフォルト値・型変換の確認に集中する。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCliOptions } from "./cli.js";

describe("parseCliOptions", () => {
  it("全フラグ指定時のパース結果が期待値と一致する", () => {
    const argv = [
      "node",
      "conver.js",
      "-k",
      "sk-test-key",
      "-s",
      "https://hooks.slack.com/test",
      "-t",
      "/path/to/Tickets.json",
      "-c",
      "5",
      "-r",
      "1",
      "-p",
      "0",
      "-m",
      "deepseek-v4-pro",
      "-v",
      "1",
      "--timeout",
      "3600",
    ];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.apiKey, "sk-test-key");
    assert.strictEqual(options.slackWebhookUrl, "https://hooks.slack.com/test");
    assert.strictEqual(options.ticketsPath, "/path/to/Tickets.json");
    assert.strictEqual(options.maxCount, 5);
    assert.strictEqual(options.resolveEvery, 1);
    assert.strictEqual(options.pushEnabled, false);
    assert.strictEqual(options.model, "deepseek-v4-pro");
    assert.strictEqual(options.verbose, true);
    assert.strictEqual(options.timeoutMs, 3600000);
  });

  it("最小構成（必須フラグのみ）でデフォルト値が適用される", () => {
    const argv = ["node", "conver.js", "-k", "sk-test-key", "-s", "https://hooks.slack.com/test"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.model, "deepseek-v4-flash");
    assert.strictEqual(options.ticketsPath, "./Tickets.json");
    assert.strictEqual(options.maxCount, 999999);
    assert.strictEqual(options.resolveEvery, 3);
    assert.strictEqual(options.pushEnabled, true);
    assert.strictEqual(options.verbose, false);
    assert.strictEqual(options.timeoutMs, 1800000);
  });

  it("-v 1 で verbose=true になる", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-v", "1"];
    assert.strictEqual(parseCliOptions(argv).verbose, true);
  });

  it("-v 0 で verbose=false になる", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-v", "0"];
    assert.strictEqual(parseCliOptions(argv).verbose, false);
  });

  it("-p 1 で pushEnabled=true になる", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-p", "1"];
    assert.strictEqual(parseCliOptions(argv).pushEnabled, true);
  });

  it("-p 0 で pushEnabled=false になる", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-p", "0"];
    assert.strictEqual(parseCliOptions(argv).pushEnabled, false);
  });

  it("--timeout 3600 で timeoutMs=3600000 になる", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "--timeout", "3600"];
    assert.strictEqual(parseCliOptions(argv).timeoutMs, 3600000);
  });

  it("-c 5 -r 1 で maxCount=5, resolveEvery=1 になる", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-c", "5", "-r", "1"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.maxCount, 5);
    assert.strictEqual(options.resolveEvery, 1);
  });
});
