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
// LoopOptions の型定義（runner.ts からインポートすると NodeNext の型解決で
// never に推論されるため、テスト用にインライン定義する）
interface MockLoopOptions {
  apiKey: string;
  model: string;
  ticketsPath: string;
  maxCount: number;
  resolveEvery: number;
  pushEnabled: boolean;
  slackWebhookUrl: string;
  verbose: boolean;
  timeoutMs: number;
}

// --- 共有モック状態 ---
// mock.module() は各モジュールに1度しか呼べないため、
// テスト間で挙動を切り替えるために共有オブジェクトを使用する。

interface MockState {
  /** parseCliOptions が呼ばれたか */
  parseCliOptionsCalled: boolean;
  /** parseCliOptions に渡された argv */
  parseCliOptionsArgv: string[];
  /** runLoop に渡された options（最後の呼出のみ） */
  runLoopOptions: MockLoopOptions | null;
  /** runLoop の実装（テストごとに差し替え） */
  runLoopImpl: () => Promise<void>;
  /** process.exit が呼ばれたときのコード */
  exitCalls: number[];
}

const mockState: MockState = {
  parseCliOptionsCalled: false,
  parseCliOptionsArgv: [],
  runLoopOptions: null,
  runLoopImpl: (): Promise<void> => Promise.resolve(),
  exitCalls: [],
};

// --- テスト用ヘルパー ---

/** テスト用のデフォルト MockLoopOptions */
function baseOptions(overrides?: Partial<MockLoopOptions>): MockLoopOptions {
  return {
    apiKey: "test-api-key",
    model: "test-model",
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
});

// --- テスト ---

describe("conver", () => {
  // ★ 最初のテストで import が発生する。main() が自動実行される。
  //   最初のテストでエラーモックを使うことで、catch ブロックの挙動を検証する。

  it("import 時に runLoop エラー → process.exit(1) が呼ばれる", async () => {
    mockState.runLoopImpl = () => Promise.reject(new Error("test error"));
    mockState.exitCalls = [];
    mockState.parseCliOptionsCalled = false;

    mock.method(process, "exit", (code?: number) => {
      mockState.exitCalls.push(code ?? 0);
    });

    await import("./conver.js");

    // await import() の解決後、main() の .catch() がマイクロタスクで実行される。
    // setImmediate でマイクロタスクキューをフラッシュする。
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.strictEqual(mockState.exitCalls[0], 1);
    assert.strictEqual(mockState.parseCliOptionsCalled, true);
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
    assert.strictEqual(mockState.parseCliOptionsCalled, true);
  });

  it("parseCliOptions は process.argv で呼ばれる", () => {
    // 最初の import 時に parseCliOptions が process.argv で呼ばれたことを確認する
    assert.ok(mockState.parseCliOptionsArgv.length > 0);
    assert.deepStrictEqual(
      mockState.parseCliOptionsArgv,
      process.argv,
    );
  });
});
