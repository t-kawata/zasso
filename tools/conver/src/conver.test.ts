// conver.test.ts — conver.ts のユニットテスト
//
// テスト方針:
//   mock.module() はモジュールごとに1度しか呼べないため、before() で全モックを
//   一括設定し、テスト間で共有する可変状態で挙動を制御する。
//   process.exit は mock.method でモック化する。
//
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する。
import { describe, it, mock, before } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
// LoopOptions の型定義（runner.ts からインポートすると NodeNext の型解決で
// never に推論されるため、テスト用にインライン定義する）
// [::TICKET::] PX-151 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-151 --for-spec --no-implementation-order`.
interface MockLoopOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  ticketsPath: string;
  maxCount: number;
  resolveEvery: number;
  pushEnabled: boolean;
  slackWebhookUrl: string;
  verbose: boolean;
  timeoutMs: number;
  noFind?: boolean;
  watcherConfig?: string;
}

// --- 共有モック状態 ---
// mock.module() は各モジュールに1度しか呼べないため、
// テスト間で挙動を切り替えるために共有オブジェクトを使用する。

interface MockState {
  /** parseCliOptions が呼ばれたか */
  parseCliOptionsCalled: boolean;
  /** parseCliOptions に渡された argv */
  parseCliOptionsArgv: string[];
  /** parseCliOptions の戻り値（テストごとに差し替え） */
  parseCliOptionsReturn: Record<string, unknown> | null;
  /** runLoop に渡された options（最後の呼出のみ） */
  runLoopOptions: MockLoopOptions | null;
  /** runLoop の実装（テストごとに差し替え） */
  runLoopImpl: () => Promise<void>;
  /** process.exit が呼ばれたときのコード */
  exitCalls: number[];
  /** loadWatcherConfig の実装（テストごとに差し替え） */
  loadWatcherConfigImpl: (path: string) => Record<string, unknown>;
  /** loadWatcherConfig が throw するエラー（null なら正常系） */
  loadWatcherConfigError: Error | null;
  /** isWithinTimeWindow の戻り値 */
  isWithinTimeWindowResult: boolean;
  /** CronScheduler.start が呼ばれたか */
  cronSchedulerStarted: boolean;
}

const mockState: MockState = {
  parseCliOptionsCalled: false,
  parseCliOptionsArgv: [],
  parseCliOptionsReturn: null,
  runLoopOptions: null,
  runLoopImpl: (): Promise<void> => Promise.resolve(),
  exitCalls: [],
  loadWatcherConfigImpl: () => ({
    intervalMinutes: 5,
    startTime: "09:00",
    endTime: "17:00",
    timezone: "UTC",
  }),
  loadWatcherConfigError: null,
  isWithinTimeWindowResult: true,
  cronSchedulerStarted: false,
};

// --- テスト用ヘルパー ---

/** テスト用のデフォルト MockLoopOptions */
// [::TICKET::] PX-151 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-151 --for-spec --no-implementation-order`.
function baseOptions(overrides?: Partial<MockLoopOptions>): MockLoopOptions {
  return {
    apiKey: "test-api-key",
    model: "test-model",
    baseUrl: "test-base-url",
    ticketsPath: "/tmp/test-tickets.json",
    maxCount: 999999,
    resolveEvery: 1,
    pushEnabled: false,
    slackWebhookUrl: "https://hooks.slack.com/test",
    verbose: false,
    timeoutMs: 5000,
    ...overrides,
  };
}

// --- モック設定 ---

before(() => {
  // mock.module() はモジュールごとに1度しか呼べないため、before() で一括設定する
  mock.module("./cli.js", {
    exports: {
      parseCliOptions: (argv: string[]) => {
        mockState.parseCliOptionsCalled = true;
        mockState.parseCliOptionsArgv = [...argv];
        // watcher テスト用に戻り値を差し替え可能
        if (mockState.parseCliOptionsReturn) {
          return mockState.parseCliOptionsReturn;
        }
        return baseOptions();
      },
    },
  });
  mock.module("./runner.js", {
    exports: {
      runLoop: (options: MockLoopOptions): Promise<void> => {
        mockState.runLoopOptions = options;
        return mockState.runLoopImpl();
      },
    },
  });
  mock.module("./watcher.js", {
    exports: {
      loadWatcherConfig: (path: string): Record<string, unknown> => {
        if (mockState.loadWatcherConfigError) {
          throw mockState.loadWatcherConfigError;
        }
        return mockState.loadWatcherConfigImpl(path);
      },
    },
  });
  mock.module("./step-timer.js", {
    exports: {
      isWithinTimeWindow: (): boolean => {
        return mockState.isWithinTimeWindowResult;
      },
    },
  });
  mock.module("./cron-scheduler.js", {
    exports: {
      CronScheduler: class {
        start(callback: () => void): void {
          mockState.cronSchedulerStarted = true;
          // 実際の CronScheduler は定期実行するが、テストでは
          // コールバックを即時呼び出して runLoop の呼出を検証する
          callback();
        }
        stop(): void {}
        isRunning(): boolean {
          return false;
        }
      },
    },
  });
});

// --- テスト ---

describe("conver", () => {
  // entry.ts（エントリポイント）と同等の main() 呼び出しをテストする。

  it("runLoop エラー時に process.exit(1) が呼ばれる", async () => {
    mockState.runLoopImpl = () => Promise.reject(new Error("test error"));
    mockState.exitCalls = [];
    mockState.parseCliOptionsCalled = false;

    mock.method(process, "exit", (code?: number) => {
      mockState.exitCalls.push(code ?? 0);
    });

    const { main } = await import("./conver.js");
    // entry.ts 相当: main() → catch → process.exit(1)
    main().catch(() => process.exit(1));

    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.strictEqual(mockState.exitCalls[0], 1);
    assert.strictEqual(mockState.parseCliOptionsCalled, true);
  });

  it("main(): 起動時に全7項目のパラメータログが key=value 形式で出力される", async () => {
    mockState.runLoopImpl = () => Promise.resolve();
    mockState.parseCliOptionsCalled = false;

    const logLines: string[] = [];
    // Passthrough swap: capture startup writes while still forwarding to the
    // real stdout so the node:test runner's own TAP output is not swallowed.
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout.write as any) = ((s: string) => {
      logLines.push(String(s).replace(/\n$/, ""));
      return origWrite(s);
    }) as any;

    try {
      const { main } = await import("./conver.js");
      await main();

      // "  " で始まる行 = パラメータ行, "model" から始まるが先頭空白のため
      const paramLines = logLines.filter((l) => l.startsWith("  "));
      assert.strictEqual(paramLines.length, 9);
      assert.ok(paramLines[0].startsWith("  model="));
      assert.ok(paramLines[1].startsWith("  baseUrl="));
      assert.ok(paramLines[2].startsWith("  ticketsPath="));
      assert.ok(paramLines[3].startsWith("  maxCount="));
      assert.ok(paramLines[4].startsWith("  resolveEvery="));
      assert.ok(paramLines[5].startsWith("  pushEnabled="));
      assert.ok(paramLines[6].startsWith("  timeoutMs="));
      assert.ok(paramLines[7].startsWith("  noFind="));
      assert.ok(paramLines[8].startsWith("  watcherConfig="));
    } finally {
      (process.stdout.write as any) = origWrite;
    }
  });

  it("main(): parseCliOptions → runLoop の呼出連鎖", async () => {
    mockState.runLoopImpl = () => Promise.resolve();
    mockState.parseCliOptionsCalled = false;

    const { main } = await import("./conver.js");
    await main();

    const actualOptions = mockState.runLoopOptions;
    assert.notStrictEqual(actualOptions, null);
    if (actualOptions === null) return; // 型ガード（実際にはここには到達しない）
    assert.strictEqual(actualOptions.apiKey, "test-api-key");
    assert.strictEqual(actualOptions.model, "test-model");
    assert.strictEqual(actualOptions.baseUrl, "test-base-url");
    assert.strictEqual(mockState.parseCliOptionsCalled, true);
  });

  it("main(): -k 省略（apiKey 空文字）時に keyless 警告を stderr へ出力", async () => {
    mockState.runLoopImpl = () => Promise.resolve();
    mockState.parseCliOptionsCalled = false;
    mockState.parseCliOptionsReturn = { ...baseOptions(), apiKey: "" };

    const errLines: string[] = [];
    const origErr = process.stderr.write.bind(process.stderr);
    (process.stderr.write as any) = ((s: string) => {
      errLines.push(String(s));
      return origErr(s);
    }) as any;

    try {
      const { main } = await import("./conver.js");
      await main();
      assert.ok(errLines.some((l) => l.includes("keyless")));
    } finally {
      (process.stderr.write as any) = origErr;
      mockState.parseCliOptionsReturn = null;
    }
  });

  it("parseCliOptions は process.argv で呼ばれる", () => {
    // 最初の import 時に parseCliOptions が process.argv で呼ばれたことを確認する
    assert.ok(mockState.parseCliOptionsArgv.length > 0);
    assert.deepStrictEqual(
      mockState.parseCliOptionsArgv,
      process.argv,
    );
  });

  // ============================================================
  // Watcher モード起動パステスト（P8-3）
  // ============================================================

  it("UT2: watcherConfig指定 + 時間枠内 → runLoop + CronScheduler 起動", async () => {
    mockState.parseCliOptionsReturn = {
      ...baseOptions(),
      watcherConfig: "/tmp/watcher.json",
      noFind: false,
      bindReviewInOneSession: true,
    };
    mockState.loadWatcherConfigError = null;
    mockState.isWithinTimeWindowResult = true;
    mockState.cronSchedulerStarted = false;
    mockState.runLoopOptions = null;
    mockState.exitCalls = [];

    mock.method(process, "exit", (code?: number) => {
      mockState.exitCalls.push(code ?? 0);
    });

    const { main } = await import("./conver.js");
    await main();

    // runLoop が呼ばれ、CronScheduler が起動したことを確認
    assert.notStrictEqual(mockState.runLoopOptions, null);
    assert.ok(mockState.cronSchedulerStarted);
    // exit は呼ばれていない
    assert.strictEqual(mockState.exitCalls.length, 0);
  });

  it("UT3: watcherConfig指定 + 時間枠外 → process.exit(0)（即時終了）", async () => {
    mockState.parseCliOptionsReturn = {
      ...baseOptions(),
      watcherConfig: "/tmp/watcher.json",
      noFind: false,
      bindReviewInOneSession: true,
    };
    mockState.loadWatcherConfigError = null;
    mockState.isWithinTimeWindowResult = false;
    mockState.cronSchedulerStarted = false;
    mockState.runLoopOptions = null;
    mockState.exitCalls = [];

    mock.method(process, "exit", (code?: number) => {
      mockState.exitCalls.push(code ?? 0);
    });

    const { main } = await import("./conver.js");
    await main();

    // 時間枠外のため runLoop 未呼出、exit(0)
    assert.strictEqual(mockState.runLoopOptions, null);
    assert.strictEqual(mockState.exitCalls[0], 0);
    assert.ok(!mockState.cronSchedulerStarted);
  });

  it("UT4: watcherConfig指定 + 設定ファイル不在 → process.exit(1)", async () => {
    mockState.parseCliOptionsReturn = {
      ...baseOptions(),
      watcherConfig: "/tmp/nonexistent.json",
      noFind: false,
      bindReviewInOneSession: true,
    };
    mockState.loadWatcherConfigError = new Error("ENOENT: file not found");
    mockState.isWithinTimeWindowResult = true;
    mockState.cronSchedulerStarted = false;
    mockState.runLoopOptions = null;
    mockState.exitCalls = [];

    mock.method(process, "exit", (code?: number) => {
      mockState.exitCalls.push(code ?? 0);
    });

    const { main } = await import("./conver.js");
    await main();

    // loadWatcherConfig がエラーを投げたため exit(1)
    assert.strictEqual(mockState.runLoopOptions, null);
    assert.strictEqual(mockState.exitCalls[0], 1);
    assert.ok(!mockState.cronSchedulerStarted);
  });

  it("UT5: watcherConfig空文字列 → 通常モード（runLoop呼出）", async () => {
    // 空文字列は falsy なので通常モードとして扱われる
    mockState.parseCliOptionsReturn = {
      ...baseOptions(),
      watcherConfig: "",
      noFind: false,
      bindReviewInOneSession: true,
    };
    mockState.loadWatcherConfigError = null;
    mockState.isWithinTimeWindowResult = true;
    mockState.cronSchedulerStarted = false;
    mockState.runLoopOptions = null;
    mockState.exitCalls = [];

    mock.method(process, "exit", (code?: number) => {
      mockState.exitCalls.push(code ?? 0);
    });

    const { main } = await import("./conver.js");
    await main();

    // 空文字列は watcherConfig falsy → runNormalMode → runLoop 呼出
    assert.notStrictEqual(mockState.runLoopOptions, null);
    assert.ok(!mockState.cronSchedulerStarted);
    assert.strictEqual(mockState.exitCalls.length, 0);
  });
});

// --- C003: プロセスレベルのクラッシュガード ---
// @verifies C003

// [::TICKET::] PX-149, PX-150 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-149|PX-150) --for-spec --no-implementation-order`.
describe("reportFatalError / installCrashHandlers", () => {
  // PX-150: クラッシュハンドラは exit せずログのみ（夜間ループの完走を保証する）
  // @verifies C003
  it("reportFatalError はエラーメッセージをログし exit しない", async () => {
    const logLines: string[] = [];
    const exitCalls: number[] = [];
    mock.method(console, "error", (...args: unknown[]) => {
      logLines.push(args.join(" "));
    });
    mock.method(process, "exit", (code?: number) => {
      exitCalls.push(code ?? 0);
    });

    const { reportFatalError } = await import("./conver.js");
    reportFatalError("致命的エラー (unhandledRejection)", new Error("boom"));

    assert.strictEqual(exitCalls.length, 0);
    assert.ok(logLines.join("\n").includes("boom"));
  });

  it("installCrashHandlers は uncaughtException / unhandledRejection を登録する", async () => {
    const exitCalls: number[] = [];
    mock.method(process, "exit", (code?: number) => {
      exitCalls.push(code ?? 0);
    });

    const { installCrashHandlers } = await import("./conver.js");
    installCrashHandlers();
    assert.ok(process.listenerCount("uncaughtException") > 0);
    assert.ok(process.listenerCount("unhandledRejection") > 0);

    // 後片付け — テストプロセス全体に影響を与えないよう即時除去する
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
    assert.strictEqual(exitCalls.length, 0);
  });

  it("IT: installCrashHandlers はサブプロセスの unhandledRejection をログして継続する（exit しない）", async () => {
    const script = `
      import('./dist/conver.js').then((m) => {
        m.installCrashHandlers();
        Promise.reject(new Error('boom'));
      });
    `;
    // PX-150: クラッシュハンドラはログして継続するため、保留タスクが無ければ
    // プロセスは正常終了（exit 0 → execFileAsync は resolve）する。
    const result = await execFileAsync(process.execPath, ["-e", script], {
      cwd: process.cwd(),
    })
      .then((res) => ({ ok: true as const, stderr: res.stderr }))
      .catch((err: { code?: number; signal?: string; stderr?: string }) => ({
        ok: false as const,
        code: err.code ?? null,
        signal: err.signal ?? null,
        stderr: err.stderr ?? String(err),
      }));

    assert.strictEqual(result.ok, true);
    assert.ok(String(result.stderr).includes("致命的エラー (unhandledRejection)"));
  });
});
