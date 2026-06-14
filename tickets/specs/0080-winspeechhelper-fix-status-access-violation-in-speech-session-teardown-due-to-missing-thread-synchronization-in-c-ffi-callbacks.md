---
ticket_id: 80
title: "[win/SpeechHelper] Fix STATUS_ACCESS_VIOLATION in speech session teardown due to missing thread synchronization in C# FFI callbacks"
slug: winspeechhelper-fix-status-access-violation-in-speech-session-teardown-due-to-missing-thread-synchronization-in-c-ffi-callbacks
status: reviewed
created_at: 2026-06-14
updated_at: 2026-06-14
plan_path: C:\Users\kawat\shyme\zasso\tickets\context\0080-winspeechhelper-fix-status-access-violation-in-speech-session-teardown-due-to-missing-thread-synchronization-in-c-ffi-callbacks\plan.md
implementation_path: C:\Users\kawat\shyme\zasso\tickets\context\0080-winspeechhelper-fix-status-access-violation-in-speech-session-teardown-due-to-missing-thread-synchronization-in-c-ffi-callbacks\implementation.md
review_report_path: C:\Users\kawat\shyme\zasso\tickets\context\0080-winspeechhelper-fix-status-access-violation-in-speech-session-teardown-due-to-missing-thread-synchronization-in-c-ffi-callbacks\review.md
---
# [win/SpeechHelper] Fix STATUS_ACCESS_VIOLATION in speech session teardown due to missing thread synchronization in C# FFI callbacks

## Summary

Windows 音声認識のセッション終了 (teardown) 時に稀に `STATUS_ACCESS_VIOLATION (0xc0000005)` でクラッシュする問題を修正する。原因は C# Native AOT DLL 側のスレッド同期欠如により、C# スレッドプール上のコールバックが解放済みの関数ポインター（ダングリングポインター）を呼び出すこと。

## Background

`cargo run --bin test-run -- --engine os` 実行中、`Session stopped.` のログ直後に以下のクラッシュが発生：

```
[Win/SpeechHelper] Session stopped.
error: process didn't exit successfully: (exit code: 0xc0000005, STATUS_ACCESS_VIOLATION)
Segmentation fault
```

コード解析により、クラッシュは C# 側の以下の複合的なスレッド同期欠如が原因と特定された。

## Scope

- **修正対象**: `crates/voiput/native/cs/SpeechHelper/SpeechHelper.cs` のみ
- **修正内容**: スレッド間で共有される全コールバックデリゲートと状態フラグへの `volatile` 付与、TOCTOU race の修正、fire-and-forget 停止の同期化、コールバック null 化漏れの補完
- **Rust 側は修正不要**: コード解析により、Rust 側 (`crates/voiput/src/backends/win.rs`) の Drop 順序は正しいことを確認済み

## Non-scope

- macOS バックエンド (`mac.rs`, `mac_ffi.rs`) の修正 — 同様の race 条件はあるが、本チケットでは Windows のみ対応。別チケットで対応する
- ログ出力の肥大化抑制 — `_debugFrameCounter` によるガードは現状維持
- Rust FFI 宣言 (`win_ffi.rs`) の変更 — 不要

## Investigation

### 現場のログ

```
[Win/SpeechHelper] Session stopped.
↓ 直後にクラッシュ
error: exit code: 0xc0000005, STATUS_ACCESS_VIOLATION
```

### コード解析結果

#### C# 側の問題一覧

**① 全共有フィールドに `volatile` がない（ファイル: `SpeechHelper.cs`）**

以下のフィールドは C# ThreadPool スレッド（コールバック）と Rust FFI スレッドの 2 スレッド間で読み書きされるが、いずれも `volatile` なし：

| フィールド | 行 | 読み取りスレッド | 書き込みスレッド |
|-----------|-----|-----------------|-----------------|
| `_audioDataCallback` | 55 | `OnAudioQuantumStarted` (L576, L647, L653) | `SetAudioDataCallback` (L348, L354) |
| `_resultCallback` | 53 | `SendResult` (L883, L907) | `Cleanup` (L443) |
| `_errorCallback` | 54 | `ReportError` (L922, L937) | `Cleanup` (L444) |
| `_readyCallback` | 56 | `OnAudioQuantumStarted` (L654) | `SetReadyCallback` (該当行) |
| `_hasNotifiedReady` | 57 | `OnAudioQuantumStarted` (L654) | 同関数内 (L656) |
| `_isRunning` | 63 | `StopInternal` (L402), `OnHypothesisGenerated` (L793), `OnResultGenerated` (L807) | `CleanupResources` (L945) |
| `_isCapturing` | 69 | `OnAudioQuantumStarted` (L574) | `StopCaptureInternal` (L525), `StartCaptureAsync` (L470) |

**② TOCTOU race: `_audioDataCallback` の null チェックと呼び出しが非アトミック（L647-653）**

```csharp
// この間に他スレッドが _audioDataCallback = null にすると null delegate 呼出 => 0xc0000005
if (sampleCount > 0 && _audioDataCallback != null)  // ここで true
{
    _audioDataCallback((IntPtr)dataInBytes, ...);    // ここで null 呼出
}
```

同様の問題が `_readyCallback` (L654-657) にも存在。

**③ `StopInternal()` が fire-and-forget（L400-432）**

```csharp
private static void StopInternal()
{
    if (!_isRunning) return;
    Task.Run(async () =>  // 即 return。クリーンアップ完了を待たない
    {
        // ... cleanup ...
    });
}
```

- `Cleanup()` (L438-445) が `StopInternal()` を呼び出した直後に同期的に `_resultCallback = null; _errorCallback = null;` を実行するが、実際のリソース解放は未完了
- その間も `OnAudioQuantumStarted` は ThreadPool 上で動き続ける

**④ `_audioDataCallback` / `_readyCallback` が `Cleanup()` で null 化されない（L439-445）**

```csharp
public static void Cleanup()
{
    StopInternal();
    _resultCallback = null;    // null 化される
    _errorCallback = null;     // null 化される
    // _audioDataCallback は null 化されない => 欠陥
    // _readyCallback は null 化されない => 欠陥
}
```

**⑤ `OnAudioQuantumStarted` の `_isCapturing` ガードがシングルチェック（L574）**

```csharp
if (!_isCapturing) return;                          // volatile なし。stale true を読む可能性
var frame = _frameOutputNode?.GetFrame();            // 解放済み COM オブジェクトを触る危険
if (frame == null) return;
// ここでも _isCapturing の再チェックがない
```

#### クラッシュシーケンス（確定）

```
Thread A (Rust FFI: stop_native_audio_capture)    Thread B (C# ThreadPool: OnAudioQuantumStarted)
─────────────────────────────────────────────     ─────────────────────────────────────────────────
① speech_helper_stop_capture()                     ┬ _isCapturing == true (stale) => 通過 (L574)
   => _isCapturing = false                         │
② speech_helper_set_audio_data_callback(None)      ┼ _audioDataCallback != null => true (L647)
   => _audioDataCallback = null                     │
③                                                  ┼ _audioDataCallback(...) (L653)
                                                   └ => null delegate => 0xc0000005
```

#### Rust 側は問題ないことの確認

- `stop_native_audio_capture()` (win.rs L171-180): `speech_helper_stop_capture()` => `speech_helper_set_audio_data_callback(None)` => `WIN_AUDIO_SENDER` クリア の順序は正しい（FFI 呼出はコンパイラバリアとして機能）
- `WinSpeechBackend::drop()` (win.rs L708-716): `stop()` => `cleanup()` => `WIN_GLOBAL_TX` クリア。各段階で Mutex ロックがハードウェアバリアを発行
- 問題は C# 側が正しく同期されていない一点に集約される

### 証拠の出典

- `crates/voiput/native/cs/SpeechHelper/SpeechHelper.cs` L53-74, L400-432, L438-445, L570-685, L940-958
- `crates/voiput/src/backends/win.rs` L171-180 (stop_native_audio_capture), L644-669 (stop), L708-716 (Drop)

## Test Plan

### ユニットテスト計画

この問題はハードウェア依存（実際の音声デバイス・WinRT ランタイム）のため、純粋な C# 単体テストでは再現不可能。テストは実機手動テストとする。

### ユニットテスト不可能な項目（例外）

- 理由: WinRT の `AudioGraph` + `SpeechRecognizer` は実機のオーディオデバイスと Windows 音声認識サービスに依存。モックでスレッド競合を忠実に再現することは現実的でない
- 代替: 手動テストで start/stop の連続実行と Ctrl+C 強制終了を繰り返す

### 手動テスト計画

1. 通常テスト: `cargo run --bin test-run -- --engine os` が全テスト通過すること
2. ストレステスト: start => 3秒 => stop => start => 3秒 => stop を 10 回連続。クラッシュしないこと
3. 強制終了テスト: 音声認識モードに入った状態で Ctrl+C で強制終了を 5 回。クラッシュしないこと

## Boy Scout Rule — 翻訳可能性計画

変更は最小限（`volatile` 追加、local copy パターン、同期待機の 3 パターンのみ）。ファイル全体のリファクタリングは行わない。

- `StopInternal` の fire-and-forget を同期待機に変更するにあたり、変数名・コメントは「なぜ fire-and-forget をやめるのか」を日本語で説明する
- 翻訳可能性の既存欠陥（英語/日本語混在ログ等）は、本チケットのスコープを超えるため修正しない

## Acceptance Criteria

- [ ] `cargo run --bin test-run -- --engine os` が全テスト通過すること
- [ ] 認識セッションの start/stop 連続実行でクラッシュしないこと
- [ ] 音声認識モードからの Ctrl+C 強制終了でクラッシュしないこと
