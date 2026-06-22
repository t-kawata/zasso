# Plan: Fix STATUS_ACCESS_VIOLATION in Win SpeechHelper

## 要件

C# Native AOT DLL (`SpeechHelper.cs`) のスレッド同期欠如により、セッション終了時に C# ThreadPool 上のコールバックが null 化された関数ポインターを呼び出し 0xc0000005 でクラッシュする問題を修正する。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| crates/voiput/native/cs/SpeechHelper/SpeechHelper.cs | 修正 | 全5ステップ |

## 実装手順

### Step A: volatile 付与（L53-57, L63, L69）
7つのスレッド間共有フィールドに volatile を追加:
- _resultCallback, _errorCallback, _audioDataCallback, _readyCallback
- _hasNotifiedReady, _isRunning, _isCapturing

### Step B: TOCTOU race 修正（L647-658）
_audioDataCallback と _readyCallback を local copy してから null チェック＋呼び出し。
元の2重読み取り（null チェックと呼び出しで別の読み取り）を1回の読み取り＋local 変数に変更。

### Step C: GetFrame() 後の _isCapturing 再チェック（L583 直後）
var frame = _frameOutputNode?.GetFrame();
if (frame == null) return;
if (!_isCapturing) return;  // ← 追加

### Step D: CleanupResources() で _audioDataCallback も null 化（末尾）
_audioDataCallback = null;
_readyCallback = null;

### Step E: StopInternal の同期化（L400-432）
Task.Run(async () => { ... }) を StopInternalAsync().GetAwaiter().GetResult() に変更。
既存の CheckHealth() と同じパターン。

## Boy Scout 改善
- volatile / local copy / 同期待機の各箇所に理由を日本語コメントで追加

## テスト計画
1. C# ビルド: powershell -File native/cs/build.ps1
2. Rust ビルド: cargo check -p voiput
3. 通常テスト: cargo run --bin test-run -- --engine os → 全テスト通過
4. ストレステスト: start→3s→stop を10回連続 → クラッシュなし
5. 強制終了テスト: 音声認識モードから Ctrl+C を5回 → クラッシュなし

## リスク
- GetAwaiter().GetResult() デッドロック: 同期コンテキストが null のため発生しない。CheckHealth() で実績あり
- 同期待機の遅延: StopAsync() は 10ms 未満
