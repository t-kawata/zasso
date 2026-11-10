// [::TICKET::] PX-151 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-151 --for-spec --no-implementation-order`.
// cli.test.ts — parseCliOptions のユニットテスト
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する
//
// process.exit(1) / exit(0) を含むテスト（--help 表示、必須フラグ欠如など）は
// test.sh の統合テストで検証する。本ファイルでは全フラグ指定時の正常系と
// デフォルト値・型変換の確認に集中する。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCliOptions, normalizeBaseUrl } from "./cli.js";

describe("parseCliOptions", () => {
// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
// [::TICKET::] PX-403 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-403 --for-spec --no-implementation-order`.
  it("全フラグ指定時のパース結果が期待値と一致する", () => {
    const argv = [
      "node",
      "conver.js",
      "-k",
      "sk-test-key",
      "-s",
      "https://hooks.slack.com/test",
      "-c",
      "5",
      "-r",
      "1",
      "-p",
      "0",
      "-m",
      "deepseek-v4-pro",
      "-u",
      "https://openrouter.ai/api",
      "-v",
      "1",
      "--timeout",
      "3600",
    ];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.apiKey, "sk-test-key");
    assert.strictEqual(options.slackWebhookUrl, "https://hooks.slack.com/test");
    assert.deepStrictEqual(options.packages, []);
    assert.strictEqual(options.maxCount, 5);
    assert.strictEqual(options.resolveEvery, 1);
    assert.strictEqual(options.pushEnabled, false);
    assert.strictEqual(options.model, "deepseek-v4-pro");
    assert.strictEqual(options.baseUrl, "https://openrouter.ai/api");
    assert.strictEqual(options.verbose, true);
    assert.strictEqual(options.timeoutMs, 3600000);
  });

  it("最小構成（必須フラグのみ）でデフォルト値が適用される", () => {
    const argv = ["node", "conver.js", "-k", "sk-test-key", "-s", "https://hooks.slack.com/test"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.model, "deepseek-flash");
    assert.strictEqual(options.baseUrl, "https://api.deepseek.com/anthropic");
    assert.deepStrictEqual(options.packages, []);
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
      "-P", "doors-core",
      "-P", "doors-operation",
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
    assert.deepStrictEqual(options.packages, ["doors-core", "doors-operation"]);
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
    assert.strictEqual(options.model, "deepseek-flash");
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

  it("-P を繰り返すと package 配列になり、カンマ区切りも分割される", () => {
    const argv = [
      "node", "conver.js", "-k", "k", "-s", "s",
      "-P", "doors-core,doors-operation", "-P", "pjsip-prebuilt",
    ];
    const options = parseCliOptions(argv);
    assert.deepStrictEqual(options.packages, [
      "doors-core",
      "doors-operation",
      "pjsip-prebuilt",
    ]);
  });

  it("--package のロングオプションも同じ配列になる", () => {
    const argv = [
      "node", "conver.js", "-k", "k", "-s", "s",
      "--package", "doors-core", "--package", "doors-cli",
    ];
    const options = parseCliOptions(argv);
    assert.deepStrictEqual(options.packages, ["doors-core", "doors-cli"]);
  });

  it("-r と -P が共存し resolveEvery と packages が正しい", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-r", "1", "-P", "doors-core"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.resolveEvery, 1);
    assert.deepStrictEqual(options.packages, ["doors-core"]);
  });

  // @verifies C001
  it("-u 指定で baseUrl が格納される（短縮フラグ）", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-u", "https://openrouter.ai/api"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.baseUrl, "https://openrouter.ai/api");
  });

  // @verifies C001
  it("--url ロング形式で baseUrl が格納される", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "--url", "http://localhost:11434"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.baseUrl, "http://localhost:11434");
  });

  // @verifies C001
  it("baseUrl の末尾スラッシュは正規化される", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-u", "https://foo/api/"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.baseUrl, "https://foo/api");
  });

  // @verifies C001
  it("-u 空文字はデフォルト baseUrl にフォールバックする", () => {
    const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-u", ""];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.baseUrl, "https://api.deepseek.com/anthropic");
  });

  // @verifies C002
  it("-k 省略時も apiKey が空文字になり exit しない", () => {
    const argv = ["node", "conver.js", "-s", "https://hooks.slack.com/x"];
    const options = parseCliOptions(argv);
    assert.strictEqual(options.apiKey, "");
  });

  // @verifies C001
  it("normalizeBaseUrl: 空文字・空白はデフォルト、末尾スラッシュは除去、スキーマなしは透過", () => {
    assert.strictEqual(normalizeBaseUrl(""), "https://api.deepseek.com/anthropic");
    assert.strictEqual(normalizeBaseUrl("   "), "https://api.deepseek.com/anthropic");
    assert.strictEqual(normalizeBaseUrl("https://x/"), "https://x");
    assert.strictEqual(normalizeBaseUrl("https://x//"), "https://x");
    assert.strictEqual(normalizeBaseUrl("localhost:11434"), "localhost:11434");
  });
});

describe("dashboard flags", () => {
  it("--no-dashboard disables the fixed header", () => {
    const options = parseCliOptions(["node", "conver.js", "-k", "k", "-s", "s", "--no-dashboard"]);
    assert.strictEqual(options.noDashboard, true);
  });

  it("--dashboard-interval accepts a value in range and clamps out-of-range values", () => {
    assert.strictEqual(
      parseCliOptions(["node", "conver.js", "-k", "k", "-s", "s", "--dashboard-interval", "10"]).dashboardIntervalSeconds,
      10,
    );
    assert.strictEqual(
      parseCliOptions(["node", "conver.js", "-k", "k", "-s", "s", "--dashboard-interval", "0"]).dashboardIntervalSeconds,
      1,
    );
    assert.strictEqual(
      parseCliOptions(["node", "conver.js", "-k", "k", "-s", "s", "--dashboard-interval", "999"]).dashboardIntervalSeconds,
      60,
    );
  });
});
