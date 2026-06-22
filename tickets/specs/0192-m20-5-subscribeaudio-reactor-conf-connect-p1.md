---
ticket_id: 192
title: M20-5: SubscribeAudio Reactor ハンドラ — conf_connect 統合（P1）
slug: m20-5-subscribeaudio-reactor-conf-connect-p1
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/shyme/shyme/zasso/tickets/context/0192-m20-5-subscribeaudio-reactor-conf-connect-p1/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0192-m20-5-subscribeaudio-reactor-conf-connect-p1/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0192-m20-5-subscribeaudio-reactor-conf-connect-p1/review.md
---
# M20-5: SubscribeAudio Reactor ハンドラ — conf_connect 統合（P1）

## Summary

`SipClient::subscribe_audio()` の Reactor 側実装（conf_connect 統合）を完了する。
現在はスタブ状態であり、トランシーバのチャネルは作られるが reactor 経由の conf_connect
や AudioWorkerTask の起動が行われていない。このチケットで RuntimeCommand::SubscribeAudio
の拡張、Reactor ハンドラの実装、ConfConnect 統合、AudioTapHandle の正当な返却までを完成させる。

## Background

- M16-1 （AudioTapHandle/subscribe_audio API 定義）で 購読API の型定義は完了
- M20-2 （ConfConnect/ConfDisconnect RuntimeCommand 新設）で conference port 接続のコマンドパスは完了
- しかし **両者の接続（glue）が未実装**: `SipClient::subscribe_audio()` は mpsc チャネルを作って AudioTapHandle を返すが、reactor に何も送信せず、conf_connect も AudioWorkerTask の起動も行われない

## Scope

1. `RuntimeCommand::SubscribeAudio` の拡張（format/capacity/mode 追加、戻り値型変更）
2. `Reactor::handle_subscribe_audio()` の実装（RFC02 §5.3 疑似実装に従う）
3. `SipClient::subscribe_audio()` の reactor 経由ルーティング化
4. `reject_command()` の SubscribeAudio 対応更新
5. reactor の `#[allow(dead_code)]` 縮小該当箇所の解除
6. テストコード追加（MockBackend を使用したユニットテスト）

## Non-scope

- AudioWorkerTask の PairAligner → tap_txs 配送（worker.rs の TODO。別チケット scope）
- 通話切断時の conf_disconnect 自動クリーンアップ（通話切断イベントとの連携、別チケット）
- Lossless モードのバックプレッシャー制御実装（AudioWorkerTask 実装完了後に接続）
- `subscribe_audio` の RealData 形式の PJSIP conf_port 統合（別チケット M20-12 想定）

## Investigation

### 証拠1: `SipClient::subscribe_audio()` はスタブ（client.rs:497-509）

```rust
pub fn subscribe_audio(
    &self,
    call_id: CallId,
    format: crate::audio::format::AudioFormat,
    capacity: usize,
    mode: AudioTapMode,
) -> Result<AudioTapHandle, SipError> {
    self.ensure_not_shutdown()?;
    let (tx, rx) = tokio::sync::mpsc::channel(capacity);
    let handle = AudioTapHandle::new(rx);
    let _ = (call_id, format, mode, tx);  // ← すべて unused!
    Ok(handle)  // ← reactor を経由せずに handle を返す
}
```

- capacity で mpsc チャネルを作って AudioTapHandle を返しているが、`tx` は誰にも渡されずドロップされる
- つまり購読者側の `handle.recv()` は常に `None` を返す（tx が drop された状態の Receiver）
- reactor に何も送信していないので conf_connect も AudioWorkerTask の起動も行われない

### 証拠2: `RuntimeCommand::SubscribeAudio` は引数不足（command.rs:164-167）

```rust
SubscribeAudio {
    call_id: CallId,
    reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
},
```

- `format` / `capacity` / `mode` フィールドがない
- 戻り値が `Result<(), SipError>` だが、必要なのは `Result<AudioTapHandle, SipError>` である
- `reply` は `reply_tx` 命名に統一すべき（他のコマンドとの一貫性）

### 証拠3: Reactor ハンドラは未実装（reactor.rs:473-481）

```rust
RuntimeCommand::SubscribeAudio { call_id, reply } => {
    let result = (|| -> Result<(), SipError> {
        let _ = call_id;
        Err(SipError::invalid_state(
            "SubscribeAudio: not implemented (see M18)",
        ))
    })();
    let _ = reply.send(result);
}
```

- 常に `InvalidState` エラーを返すスタブ
- M18 と書かれているが実際の依存は M20-2（ConfConnect）であり記述が誤っている

### 証拠4: 関連する型は全て定義済み

| 型 | ファイル | 状態 |
|--------|----------|--------|
| `AudioTapHandle` | `audio/tap.rs:32-54` | 定義済み、`recv()` / `try_recv()` 実装済み |
| `AudioTapMode` | `audio/tap.rs:16-27` | `Realtime` / `Lossless` 定義済み、`Default` 実装済み |
| `AudioChunkPair` | `audio/chunk.rs` (推定) | M1-2 で定義済み |
| `AudioFormat` | `audio/format.rs` | M1-1 で定義済み |
| `MediaDirection` | `runtime/command.rs:21-28` | `Inbound` / `Outbound` / `Both` 定義済み |
| `ConfConnect/ConfDisconnect` | `runtime/command.rs:178-188` + `runtime/reactor.rs:489-504` | 定義済み、実装済み |
| `AudioWorker` | `audio/worker.rs:24-96` | 定義済み、tap_txs 配送は TODO |
| `handle_conf_connect()` | `runtime/reactor.rs:589-608` | 実装済み（native_call_id → conf_port 解決） |
| `resolve_native_call_id()` | `runtime/reactor.rs:630-639` | 実装済み |

### 証拠5: 依存関係

- **必須依存（完了済み）**: M20-2 （ConfConnect/ConfDisconnect RuntimeCommand + backend trait）
- **前提（完了済み）**: M16-1 （AudioTapHandle/subscribe_audio API 型定義）
- **前提（完了済み）**: M11-3 （Reactor loop）
- **参照設計書**: RFC02.md §5（§5.1, §5.2, §5.3, §5.4）

### 証拠6: 犯罪チェック（Malfeasance.json）

未解決の犯罪は 0 件。本チケットに関連する `[::STUB::]` 未付与の不完全実装として
現状の `SipClient::subscribe_audio()` が該当するが、これは本チケットで完全実装されるため
新たな犯罪にはならない。

## Test Plan

### ユニットテスト計画

**テスト対象モジュール**: `runtime/reactor.rs`（CoreReactor の SubscribeAudio 処理）

**モック**: MockBackend（M10-2 で実装済み、conf_connect/conf_disconnect は no-op 実装済み）

| # | テストケース | 種別 | 検証内容 |
|---|------------|------|---------|
| 1 | SubscribeAudio 正常系（Realtime） | 正常系 | 有効な call_id に対して `Ok(AudioTapHandle)` が返り、内部で ConfConnect(Both) が発行されることを確認 |
| 2 | SubscribeAudio 正常系（Lossless） | 正常系 | Lossless モード指定でも `Ok(AudioTapHandle)` が返ることを確認 |
| 3 | 存在しない call_id → CallNotFound | 異常系 | 未登録の call_id で `SipErrorKind::CallNotFound` が返る |
| 4 | Shutdown 後に SubscribeAudio → InvalidState | 異常系 | Shutdown 完了後に subscribe_audio すると reject_command により `InvalidState` が返る |
| 5 | Realtime モードで capacity 超過時 oldest-drop 確認 | 境界値 | 本チケットの scope ではないが、AudioTapHandle の既存テスト（tap.rs）がカバーする |
| 6 | SubscribeAudio → conf_connect 内部発行のトレース | 検証 | reactor ハンドラ内で `handle_conf_connect()` が呼ばれること（state 操作で確認） |

**カバレッジ目標**: 新しい SubscribeAudio ハンドラのロジックパス 90%以上

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| PJSIP conf_port との実際の接続 | PJSIP 実機結合が必要。Docker Asterisk 統合テストでカバー（既存の統合テストフレームワーク使用） |
| AudioWorker の tap_txs 配送 | AudioWorker 内の PairAligner → tap_txs 配送が未実装（別チケット scope）のため本チケットでは検証不可 |
| 通話切断時の conf_disconnect 自動クリーンアップ | 切断イベントとの連携が必要（別チケット scope） |

## Boy Scout Rule — 翻訳可能性計画

### `client.rs` subscribe_audio 関数

- 現状の `let _ = (call_id, format, mode, tx);` は「捨てている」という意図をコードが語っていない
- 改善: reactor 経由の `send_and_wait` に置き換え、関数全体が「reactor に SubscribeAudio を送信し、結果として AudioTapHandle を受け取る」という散文として読めるようにする

### `runtime/reactor.rs` SubscribeAudio ハンドラ

- 現状はクロージャ内で `let _ = call_id;` とエラーを返すだけのスタブ
- 改善後は RFC02 §5.3 の 7 ステップが自然言語の逐語訳として読めるように実装する:
  1. call_id を解決する
  2. 存在しない場合はエラーを返す
  3. conf_port を接続する（ConfConnect 発行）
  4. チャネルを生成する
  5. AudioTapHandle を構築する
  6. AudioWorker の tap_txs に tx を追加する
  7. reply でハンドルを返す

### `runtime/command.rs` RuntimeCommand::SubscribeAudio

- `reply` を他の ConfConnect/ConfDisconnect に合わせて `reply_tx` にリネームする（命名統一）
- format/capacity/mode フィールドを追加し、コマンド構造だけで処理内容がわかるようにする

## Acceptance Criteria

- [ ] `RuntimeCommand::SubscribeAudio` が format/capacity/mode/tx を含む拡張シグネチャに変更されている
- [ ] `Reactor` の SubscribeAudio ハンドラが call_id 解決 → ConfConnect → AudioTapHandle 返却の流れを実装している
- [ ] `SipClient::subscribe_audio()` が reactor 経由で動作する（send_and_wait で結果を受け取る）
- [ ] 存在しない call_id で `CallNotFound` エラーが返る
- [ ] Shutdown 後に `InvalidState` エラーが返る（reject_command 経由）
- [ ] 既存テストがすべて通過する
- [ ] Malfeasance.json に新たな犯罪を追加していない

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0192-m20-5-subscribeaudio-reactor-conf-connect-p1/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0192-m20-5-subscribeaudio-reactor-conf-connect-p1/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0192-m20-5-subscribeaudio-reactor-conf-connect-p1/review.md（未作成、/review-ticket 全チェック通過後に作成）
