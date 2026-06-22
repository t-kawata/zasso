---
ticket_id: 82
title: STATUS_ACCESS_VIOLATION修正 — WinSpeechBackend 三重init/cleanup + ホットキースレッド未停止
slug: status-access-violation-winspeechbackend-initcleanup
status: done
created_at: 2026-06-15
updated_at: 2026-06-15
plan_path: C:\Users\kawat\shyme\zasso\tickets\context\0082-status-access-violation-winspeechbackend-initcleanup\plan.md
implementation_path: C:\Users\kawat\shyme\zasso\tickets\context\0082-status-access-violation-winspeechbackend-initcleanup\implementation.md
---
# STATUS_ACCESS_VIOLATION修正 — WinSpeechBackend 三重init/cleanup + ホットキースレッド未停止

## Summary

`cargo run --bin test-run -- --openai-key=sk-xxx` の実行中に `STATUS_ACCESS_VIOLATION (0xc0000005)` でプロセスが強制終了する問題を修正する。

## Background

### クラッシュ症状

```
error: process didn't exit successfully:
  `target\debug\test-run.exe --openai-key=sk-xxx`
  (exit code: 0xc0000005, STATUS_ACCESS_VIOLATION)
```

- Rust のパニックではない（スタックトレースなし）
- OS レベルでの強制終了（アクセス違反）
- 本チケット作成直前のコミット a5bc1ae で `--openai-key` 必須化＋PostCorrection 修正を入れた後から発生

### 関連チケット

- #50: Native FFI（win_ffi.rs）— 初期化・コールバックの FFI を定義
- #72: hotkey/ モジュール — ホットキー監視の設計
- #80: WinspeechHelper STATUS_ACCESS_VIOLATION — 前回の同種障害（スレッド同期不足）。今回の調査結果と差異あり

## Scope

1. `speech_helper_check_health()` の `CompileConstraintsAsync()` 依存を排除（またはタイムアウト機構を追加）
2. `Voiput::drop()` にホットキースレッドの明示的停止処理を追加
3. `test_voiput()` の内部ロジック改善。WinSpeechBackend の init/cleanup がテストと本番で二重実行されない構造にする
4. 必要に応じて `speech_helper_init()` のガード（二重呼び出し防止）を WinSpeechBackend に追加

## Non-scope

- macOS バックエンドの init/cleanup 見直しは含めない（macOS では本現象の報告なし）
- OpenAI バックエンドそのものの修正は含めない
- rdev / win_hook の低レベルキーボードフック機構そのものの再設計は含めない

## Investigation

### 証拠 1: C# SpeechHelper.Init() が同一プロセス内で最大 3 回呼ばれる

`test-run.rs` の実行パスを追跡した結果、`speech_helper_init()` が以下の 3 回呼ばれる：

**1回目** — `test_voiput()` の最小構成テスト（test-run.rs:905-907）:
```rust
let config = build_voiput_config(args);  // ← post_correction_openai_config が必ず設定される
match Voiput::new(config) { ... }        // → WinSpeechBackend::new() → speech_helper_init()
```

**2回目** — `test_voiput()` の start/stop テスト（test-run.rs:916-917）:
```rust
let mut voiput = Voiput::new(build_voiput_config(args)).unwrap(); // → 2回目の init
```

**3回目** — Phase 3 本番ループ用（test-run.rs:177）:
```rust
let mut voiput = match Voiput::new(config) { ... }; // → 3回目の init
```

C# 側の実装（`SpeechHelper.cs:86-95`）:
```csharp
[UnmanagedCallersOnly(EntryPoint = "speech_helper_init")]
public static int Init(double speechTimeoutSec)
{
    WinRT.ComWrappersSupport.InitializeComWrappers(); // 1プロセス1回前提
    _speechTimeoutSec = speechTimeoutSec;
    return 0;
}
```

各 `Init()` の後、`WinSpeechBackend::new()` は `speech_helper_check_health()` を呼ぶ（`backends/win.rs:291-298`）。

### 証拠 2: health_check がこの環境でハングすることをユーザー自身が確認済み

`win_ffi.rs:91-94`（未コミットの変更）:
```rust
#[ignore = "WinRT SpeechRecognizer CompileConstraintsAsync がこの環境でハングするため"]
fn test_health_check_default() { ... }
```

「ハングする」＝内部の `CompileConstraintsAsync()`（`SpeechHelper.cs:131-145`）が戻らない。

`SpeechHelper.cs:101-173`:
```csharp
[UnmanagedCallersOnly(EntryPoint = "speech_helper_check_health")]
public static int CheckHealth()
{
    return Task.Run(async () =>
    {
        // ...
        var recognizer = new SpeechRecognizer(new Language("ja-JP"));
        var compilationResult = await recognizer.CompileConstraintsAsync(); // ← ハング箇所
        // ...
    }).GetAwaiter().GetResult();
}
```

`Task.Run(…).GetAwaiter().GetResult()` は **ThreadPool スレッドで同期待ち**するパターン。これが WinRT の STA/MTA 問題と組み合わさるとデッドロックやハングを引き起こすことがある。

### 証拠 3: 「ハングに至らない場合」もメモリ破壊の可能性

`CompileConstraintsAsync()` がタイムアウトやエラーで戻った場合でも：
- 内部的に `new SpeechRecognizer()` で確保された WinRT オブジェクトが解放されずに残る
- 次の `Init()` → `InitializeComWrappers()` で COM ラッパー状態が不整合になる
- 任意のタイミングで `STATUS_ACCESS_VIOLATION` が発生しうる

### 証拠 4: ホットキースレッドが一度も停止されない

`enable_hotkeys()` は以下の 3 スレッドを起動するが、停止コードがない：

| スレッド | ファイル | 行 |
|---------|----------|-----|
| rdev リスナー | `hotkey/win.rs` | 190 (`std::thread::spawn`) |
| GetAsyncKeyState ポーリング | `hotkey/win.rs` | 206 (`std::thread::spawn`) |
| sync→async ブリッジ | `hotkey/win.rs` | 178 (`std::thread::spawn`) |

`stop_monitoring()` は定義されている（`hotkey/win.rs:101-109`）が、どこからも呼ばれていない。
`Voiput::drop()`（`voiput.rs:501-504`）は空実装:
```rust
impl Drop for Voiput {
    fn drop(&mut self) {
        // SpeechRecognizer の Drop が自動的に stop() + cleanup() を呼ぶ
        // ← ホットキー停止処理なし
    }
}
```

`MONITORING_ACTIVE` は `true` のままとなり、スレッドはプロセス終了まで走り続ける。終了時に OS が強制終了すると、スレッドが `GetAsyncKeyState`（user32.dll FFI）実行中や `HOTKEY_SENDER` の Mutex 操作中だった場合に `STATUS_ACCESS_VIOLATION` が発生する。

### 証拠 5: test_voiput() で WinSpeechBackend が init/cleanup を繰り返す

`test_voiput()` の構造:
1. `test_voiput()` 1つ目の Voiput 構築 → init（完了後 Drop → cleanup）
2. `test_voiput()` 2つ目の Voiput 構築 → start/stop → enable_hotkeys（完了後 Drop → cleanup）
3. Phase 3 で再度 Voiput 構築 → init

特に 2→3 の間で hotkey スレッドが生き残るため、3 の `speech_helper_init()` 実行中に hotkey スレッドが `GetAsyncKeyState` 等の FFI を呼ぶ競合が発生する。

## 依存・関連チケットID

- **依存（先行実装必須）**: なし
- **関連（リソース共有）**: #50（Native FFI — win_ffi.rs の FFI 定義）, #72（hotkey/ モジュール）
- **関連（類似障害・参考）**: #80（WinspeechHelper STATUS_ACCESS_VIOLATION — 前回のスレッド同期修正と異なる原因であるため識別済み）

## Test Plan

### ユニットテスト計画

1. **`WinSpeechBackend::new()` の二重 init 防止 guard テスト**
   - `new()` が 2 回呼ばれた場合、2 回目は早期 return することを確認
   - 正常系: `new()` → `new()` がエラーにならない
   - 異常系: N/A（ガードの動作確認）

2. **`Voiput::drop()` によるホットキー停止テスト**
   - テスト用の Receiver モックを用いて、Voiput 構築 → enable_hotkeys → drop 後に `MONITORING_ACTIVE` が `false` になることを確認
   - 正常系: enable_hotkeys() 後の drop で `stop_monitoring()` が呼ばれる
   - 異常系: enable_hotkeys() 未実行での Voiput::drop() がパニックしない

3. **`test_voiput()` のクリーンアップ検証テスト**
   - テスト内で hotkey_rx が None であることや、グローバル状態がリセットされていることをアサート
   - 各テスト実行後に `stop_monitoring()` 相当の後片付けが行われていることを確認

4. **`build_voiput_config()` のテスト用スタブ構築**
   - テスト内で `build_voiput_config()` を直接使わず、必要最小限の config で Voiput を構築する分離テスト
   - 正常系: engine=Os + post_correction_openai_config=None で構築できる
   - 異常系: N/A

### ユニットテスト不可能な項目（例外）

- `speech_helper_check_health()` → `CompileConstraintsAsync()` の呼び出し: 実機の WinRT SpeechRecognizer に依存するため。修正方針として CompileConstraintsAsync 呼び出し自体の削除/無効化を含める。
- ホットキースレッドの実動作（rdev / GetAsyncKeyState）: OS スレッドに依存するため。ただし停止フラグの atomic 操作は単体テスト可能。
- C# SpeechHelper ライブラリの Init/InitializeComWrappers の二重呼び出し耐性: このチケットでは Rust 側でガードを入れることで対処し、C# 側は触らない。

## Boy Scout Rule — 翻訳可能性計画

### 修正対象コード

- `crates/voiput/src/binary/test-run.rs`:
  - `test_voiput()` 内の config 構築を `build_voiput_config(args)` で統一した直後に、テストのみで使うべきでない `speech_helper_init()` が呼ばれてしまう問題。テスト用には必要最小限の config で Voiput を構築するヘルパー関数を分離する。
- `crates/voiput/src/voiput.rs`:
  - `Drop` 実装がコメントのみの空実装。`// SpeechRecognizer の Drop が自動的に～` というコメントが誤解を生みやすい。実際のクリーンアップ責務が Voiput → SpeechRecognizer → WinSpeechBackend の3層に分散している。Drop の責務範囲をコメントで明確にするか、不足しているクリーンアップを追加する。
- `crates/voiput/src/backends/win.rs`:
  - `speech_helper_init()` などの FFI 関数呼び出しが `new()` 内にベタ書き。ガード関数または 1度だけ初期化する仕組みに抽出する。
- `crates/voiput/src/hotkey/win.rs`:
  - `MONITORING_ACTIVE` と `stop_monitoring()` が存在するが呼び出し側がない。`stop_monitoring()` の呼び出し経路を明示的に Voiput の Drop に追加し、不足の責任範囲を補完する。

### 改善具体案

- `WinSpeechBackend::new()` 内の `speech_helper_init()` → `init_speech_helper_once()` のような名前付きヘルパーに抽出し、二重呼び出しをガードする
- `test_voiput()` と Phase 3 で `build_voiput_config(args)` を共用している部分を整理し、テストと本番の init を分離する
- `Voiput::drop()` にホットキー停止の明示的呼び出しを追加し、「なぜホットキー停止が必要か」をコメントで説明する

## Acceptance Criteria

- [ ] `cargo run --bin test-run -- --engine os --openai-key=sk-xxx` が `STATUS_ACCESS_VIOLATION` で落ちない
- [ ] `make test` が全テスト通過する
- [ ] `test_voiput()` の実行中に `speech_helper_init()` が 1 回だけ呼ばれる（ガードが効いている）
- [ ] `Voiput::drop()` で `stop_monitoring()` が呼ばれ、ホットキースレッドが停止する
- [ ] `test_voiput()` 終了後のグローバル状態（MONITORING_ACTIVE / WIN_GLOBAL_TX 等）が適切にリセットされている

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0082-status-access-violation-winspeechbackend-initcleanup/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0082-status-access-violation-winspeechbackend-initcleanup/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0082-status-access-violation-winspeechbackend-initcleanup/review.md（未作成、/review-ticket 全チェック通過後に作成）
