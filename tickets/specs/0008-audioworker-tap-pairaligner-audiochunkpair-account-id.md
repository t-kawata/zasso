---
ticket_id: 8
title: AudioWorker Tap 配送実装 — PairAligner の AudioChunkPair 変換と account_id 解決
slug: audioworker-tap-pairaligner-audiochunkpair-account-id
status: specified
created_at: 2026-06-22
updated_at: 2026-06-22
---
# AudioWorker Tap 配送実装 — PairAligner の AudioChunkPair 変換と account_id 解決

## Summary

`AudioWorker::process_frame()` 内で `PairAligner::try_pair()` が生成した `(out, in, ts)` タプルを `AudioChunkPair` に変換し、`tap_txs` チャネルを介して購読者（`AudioTapHandle`）に配送する。これにより `subscribe_audio()` で取得したタップハンドルが実際に音声データを受信できるようになる。

## Background

現在、`AudioWorker` の `process_frame()` は PairAligner の `try_pair()` を呼び出しているが、その戻り値を `while let Some((_out, _in, _ts))` で受けるだけで何も処理していない。これは `worker.rs:91` の `[::STUB::]` としてマークされている。

`AudioChunkPair` の生成には `call_id` と `account_id` が必要だが、AudioWorker は `call_id` のみを保持し、`account_id` を保持していない。また `AudioChunk` への変換（`Vec<i16>` と `AudioFormat` から AudioChunk を構築）のロジックも存在しない。

このギャップにより、`subscribe_audio()` を呼び出しても `AudioTapHandle` に音声データが一切流れてこない状態が続いている。

## Scope

1. `AudioWorker` が `account_id` を保持するようにする（現在は `_call_id` のみ）
2. `process_frame()` 内で `try_pair()` の戻り値を `AudioChunkPair` に変換する処理を実装
3. 変換した `AudioChunkPair` を `tap_txs` の各 Sender に配送する
4. 既存の unit test を拡張し、配送が正しく行われることを確認する

## Non-scope

- `AudioWorker` の起動パス（Reactor からの spawn）— 別チケット
- AudioMixer や PairAligner のアルゴリズム変更
- `subscribe_audio` API の変更
- `AudioFormat` から `AudioChunk` への変換ロジック（既存の `AudioChunk` API を使用）

## Investigation

### 現状のコード構造

#### AudioWorker 構造体（`crates/siprs/src/audio/worker.rs:24-37`）

```rust
pub(crate) struct AudioWorker {
    mixer: Arc<AudioMixer>,
    _call_id: CallId,        // 保持しているが未使用
    _format: AudioFormat,     // 保持しているが未使用
    tap_txs: Vec<tokio::sync::mpsc::Sender<AudioChunkPair>>,
    pair_aligner: PairAligner,
    _shutdown: watch::Receiver<bool>,
}
```

**問題**: `account_id: AccountId` フィールドが存在しない。`call_id` も `_call_id` として未使用。

#### process_frame の該当箇所（`worker.rs:86-92`）

```rust
while let Some((_out, _in, _ts)) = self.pair_aligner.try_pair() {
    // [::STUB::] M18: (out, in, ts) を AudioChunkPair に変換し tap_txs に配送
}
```

`try_pair()` の戻り値は `Option<(Vec<i16>, Vec<i16>, Instant)>` であり、生の PCM I16 フレームとタイムスタンプを提供する。

#### AudioChunkPair のコンストラクタ（`chunk.rs:89-102`）

```rust
pub fn new(
    call_id: CallId,
    account_id: AccountId,
    in_chunk: AudioChunk,
    out_chunk: AudioChunk,
) -> Self { ... }
```

`Vec<i16>` から `AudioChunk` を構築するには、以下の既存 API が利用可能：
- `AudioChunk::I16(Vec<i16>)` — I16 バリアント直接構築
- `AudioChunkPair::new()` — コンストラクタ

#### tap_txs の配送方法

`tap_txs` は `Vec<tokio::sync::mpsc::Sender<AudioChunkPair>>`。各 Sender に `.send()` で配送する。`process_frame()` は Tokio blocking pool で同期的に動作するため、`blocking_send()` または `try_send()` を使用する必要がある（`Realtime` モード想定 → `try_send()`）。

#### AudioFormat の保持

`AudioWorker` はすでに `_format: AudioFormat` を保持している。これを活用して `AudioChunk` の構築時にフォーマット情報を付与する。ただし `AudioChunk` の enum はフォーマット情報を内包しない（生のバイナリのみ）ため、`AudioChunkPair` にフォーマット情報を付与する必要は現状ない（`AudioChunkPair` 自体も format フィールドを持たない）。

### 既存テストの状況

- `test_single_source` — out_queue のフレームが PairAligner に転送されることのみ確認
- `test_tap_delivery` — in/out フレームが PairAligner でペアリングされることのみ確認（配送までは検証していない）
- `test_empty_frame` — 空フレームでエラーにならないことのみ確認

### 犯罪・スタブ状況

- Malfeasance 犯罪: **0件**
- 既存スタブ: 本件を除き0件（本チケットで解決予定の `worker.rs:91` が唯一の残スタブ）

## Test Plan

### ユニットテスト計画

| # | テスト | 種別 | 内容 |
|---|-------|------|------|
| 1 | `test_tap_delivery_with_account_id` | 正常系 | AudioWorker が account_id を保持し、try_pair → AudioChunkPair 変換 → tap_txs 配送まで一貫して行えること |
| 2 | `test_tap_delivery_multiple_subscribers` | 正常系 | 複数の tap_tx Sender がすべて AudioChunkPair を受信できること |
| 3 | `test_tap_delivery_full_channel` | 異常系 | tap_tx チャネルが満杯の場合に process_frame がエラーにならず継続すること（Realtime モード） |
| 4 | `test_tap_delivery_zero_pairs` | 境界値 | try_pair が None を返す場合に process_frame が正常動作すること |
| 5 | `test_worker_holds_account_id` | 正常系 | AudioWorker::new() で account_id が正しく設定されること |

### Mock/Stub の要否
- `tokio::sync::mpsc::channel` の実チャネルを使用（mock不要）
- `AudioMixer` は実インスタンスを使用（軽量）

### カバレッジ目標
- `worker.rs` の新規実装行: 90%以上
- `AudioChunkPair` 変換パス: 100%

### ユニットテスト不可能な項目（例外）
- PJSIP 結合時の E2E 動作確認: 実 PBX 結合試験として別チケットで対応（本チケットは unit test で完結）

## Boy Scout Rule — 翻訳可能性計画

1. **`_call_id` の prefix 除去**: `account_id` 追加に伴い、`_call_id` も使用するため `_` プレフィックスを外し、意味のあるフィールド名にする
2. **配送ループの関数抽出**: `while let Some(...)` のループ本体を `deliver_to_taps()` のような名前の関数に抽出し、`process_frame()` の責務を明確にする
3. **`tap_txs` の名前改善**: 配送対象であることを明確にするため `tap_senders` または `tap_tx_channels` にリネームする

## Acceptance Criteria

- [ ] `AudioWorker` が `account_id: AccountId` フィールドを持ち、`new()` で設定されること
- [ ] `process_frame()` 内で `try_pair()` の戻り値を `AudioChunkPair` に変換し、`tap_txs` の全 Sender に配送すること
- [ ] `tap_tx` チャネル満杯時も `process_frame()` がエラーを返さず継続すること（Realtime モード）
- [ ] 既存テスト（`test_single_source`, `test_tap_delivery`, `test_empty_frame`）が通過すること
- [ ] 新規追加した全テスト（5件）が PASS すること
- [ ] `worker.rs:91` の `[::STUB::]` マーカーが除去されていること
- [ ] `cargo test` 458/458 + 新規テストが全 PASS すること

### 依存チケット

- M20-13（Ticket #7）: 受け入れ基準検証完了済み。本チケット解決後、AudioTap の E2E 確認が必要

## Notes

### 成果物

- 計画: context/0008-audioworker-tap-pairaligner-audiochunkpair-account-id/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0008-audioworker-tap-pairaligner-audiochunkpair-account-id/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0008-audioworker-tap-pairaligner-audiochunkpair-account-id/review.md（未作成、/review-ticket 全チェック通過後に作成）
