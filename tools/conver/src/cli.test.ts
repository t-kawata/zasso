// cli.test.ts — parseCliOptions のユニットテスト
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する
//
// process.exit(1) / exit(0) を含むテスト（--help 表示、必須フラグ欠如など）は
// test.sh の統合テストで検証する。本ファイルでは全フラグ指定時の正常系と
// デフォルト値・型変換の確認に集中する。
import path from "node:path";
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
    assert.strictEqual(options.ticketsPath, path.resolve("./Tickets.json"));
    assert.strictEqual(options.maxCount, 999999);
    assert.strictEqual(options.resolveEvery, 3);
    assert.strictEqual(options.pushEnabled, true);
    assert.strictEqual(options.verbose, true);
    assert.strictEqual(options.timeoutMs, 1800000);
    assert.strictEqual(options.bindReviewInOneSession, true);
    assert.strictEqual(options.watcherConfig, undefined);
  });

  it("-w /path/to/config.json で watcherConfig に格納される", () => {
    const argv = ["node", "conver.js", "-k", "sk-test-key", "-s", "https://hooks.slack.com/test", "-w", "/path/to/watcher.json"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.watcherConfig, "/path/to/watcher.json");
  });

  it("--watcher /path/to/config.json でロングオプション同等", () => {
    const argv = ["node", "conver.js", "-k", "sk-test-key", "-s", "https://hooks.slack.com/test", "--watcher", "/path/to/watcher.json"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.watcherConfig, "/path/to/watcher.json");
  });

  it("全フラグ指定時に -w が混在しても正しい", () => {
    const argv = [
      "node", "conver.js",
      "-k", "sk-test-key",
      "-s", "https://hooks.slack.com/test",
      "-t", "/path/to/Tickets.json",
      "-c", "5",
      "-r", "1",
      "-p", "0",
      "-m", "deepseek-v4-pro",
      "-v", "1",
      "--timeout", "3600",
      "-w", "/custom/watcher.json",
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
    assert.strictEqual(options.watcherConfig, "/custom/watcher.json");
  });

  it("最小構成 + -w 指定でデフォルト値 + watcherConfig が正しい", () => {
    const argv = ["node", "conver.js", "-k", "sk-test-key", "-s", "https://hooks.slack.com/test", "-w", "/min/watcher.json"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.model, "deepseek-v4-flash");
    assert.strictEqual(options.watcherConfig, "/min/watcher.json");
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

  // @verifies C005
  // [::TICKET::] PX-145 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-145 --for-spec --no-implementation-order`.
  it("-x 5 で maxRetries=5 になる（短縮フラグ）", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-x", "5"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.maxRetries, 5);
  });

  // @verifies C005
  it("--max-retries 省略でデフォルト 3 になる", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.maxRetries, 3);
  });

  // @verifies C005
  it("-r 1 -x 7 が共存し resolveEvery/maxRetries 両方が正しい（-r 衝突なし）", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-r", "1", "-x", "7"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.resolveEvery, 1);
    assert.strictEqual(options.maxRetries, 7);
  });
});
