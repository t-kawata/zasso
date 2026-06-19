# 実装サマリ: PjsuaBackend EventBus 結合と統合テスト安定化

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| src/runtime/command.rs | 修正 | RuntimeCommand に `NativeEvent { event }` バリアント追加（fire-and-forget） |
| src/ffi/callbacks.rs | 修正 | `enqueue_native_event` の `_handle.send()` を復活（コメントアウト解除） |
| src/runtime/reactor.rs | 修正 | NativeEvent ハンドラ追加（→ SipEventPayload 変換 → EventBus publish） |

## 検証結果

| チェック | 結果 |
|---------|------|
| cargo check --features pjsip | ✅ 警告なし |
| cargo test --lib | ✅ 392 passed |

## 修正内容

### 1. RuntimeCommand::NativeEvent 追加
- 既存の reply 付きコマンドとは異なり、fire-and-forget（reply なし）
- command.rs に `NativeEvent { event: NativeEvent }` を追加

### 2. enqueue_native_event 送信復活
- callbacks.rs の `_handle.send()` のコメントアウトを解除
- global_runtime() から RuntimeHandle を取得して送信

### 3. Reactor NativeEvent ハンドラ
- RegistrationStarted → RegistrationStarted イベント publish
- CallStateChanged (state=1) → CallDisconnected publish
- CallStateChanged (state=3) → CallConnected publish
- DtmfDigit → DtmfReceived publish
- RegistrationStateChanged, CallMediaStateChanged 等はポーリングで代替

## 残課題
- PjsuaBackend シングルトン化: 複数テスト連続実行の対応は次チケット
- RegistrationStateChanged の完全対応: NativeEvent から PJSIP API 呼び出しで状態取得が必要
