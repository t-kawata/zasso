# Implementation: Fix STATUS_ACCESS_VIOLATION in Win SpeechHelper

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| crates/voiput/native/cs/SpeechHelper/SpeechHelper.cs | 修正 | 全5ステップ |

## 実装内容

### Step A: volatile 付与（7フィールド）
スレッド間共有フィールドに volatile を追加:
- _resultCallback, _errorCallback, _audioDataCallback, _readyCallback (callback delegates)
- _hasNotifiedReady, _isRunning, _isCapturing (state flags)

### Step B: TOCTOU race 修正（L647-658）
_audioDataCallback と _readyCallback を local copy してから null チェック＋呼び出し。
元の二重読み取り（null チェックと呼び出しで別の読み取り）を1回の読み取り＋local 変数に変更。

### Step C: GetFrame() 後の _isCapturing 再チェック（L583 直後）
フレーム取得後に再度 _isCapturing を確認。解放済み COM オブジェクトへのアクセスを防止。

### Step D: CleanupResources() で callback null 化漏れ修復（末尾）
_audioDataCallback と _readyCallback を明示的に null 化（defense in depth）。

### Step E: StopInternal の同期化（L400-432）
Task.Run(async => { ... }) を StopInternalAsync().GetAwaiter().GetResult() に変更。
既存の CheckHealth() と同じパターン。デッドロックは発生しない（同期コンテキスト null）。

## 検証結果
- C# DLL build: 成功
- Rust cargo check: 成功
- test-run --engine os: 全テスト通過（ユーザー確認済み）
