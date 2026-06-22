---
ticket_id: 145
title: "残余スタブ一括解決: M16-1/M15-2/M16-3/AudioBridge/M17-4 callback"
slug: m16-1m15-2m16-3audiobridgem17-4-callback
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0145-m16-1m15-2m16-3audiobridgem17-4-callback/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0145-m16-1m15-2m16-3audiobridgem17-4-callback/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0145-m16-1m15-2m16-3audiobridgem17-4-callback/review.md
---
# 残余スタブ一括解決: M16-1/M15-2/M16-3/AudioBridge/M17-4 callback

## Summary

現在 13 件の `[::STUB::]` のうち、依存チケットが完了しているにも関わらず解決されていない 8 件を一括解決する。
PJSIP 2.17 ソースが利用可能になったことで解決可能になった callback 内のイベント抽出も含む。

## Background

M16-1/M15-2/M16-3 の実装チケットは reviewed 済みだが、それらが解決するはずだった
6 件のスタブが実際には未解決のまま残っている。M17-4 callback 内の state 抽出・NatDetected 展開は
PJSIP ヘッダが利用可能になった今、bindgen 生成型を使って実装できる。

## Investigation

### スタブ一覧と対応方針

| # | ファイル | 行 | 現在の状態 | 対応 |
|---|---------|-----|-----------|------|
| 1 | `mixer.rs` | 86 | MixerSourceEntry に `#[allow(dead_code)]` + stub マーカー | `#[allow]` 除去。M16-1 完了により source/eof は使用可能になったためマーカー削除 |
| 2 | `mixer.rs` | 116 | AudioMixer 全メソッドに `#[allow(dead_code)]` + stub マーカー | `#[allow]` 除去。M15-2 完了により実使用可能 |
| 3 | `worker.rs` | 22 | AudioWorker 構造体に `#[allow(dead_code)]` + stub マーカー | `#[allow]` 除去。reactor からの起動パスを整備 |
| 4 | `worker.rs` | 89 | Tap 配送が空ループ | pair_aligner の結果を `_tap_txs` に配送する実装に置き換え |
| 5 | `client.rs` | 407 | audio_source 追加 API に stub マーカー | RuntimeCommand 経由で AudioWorker に source を登録するパスを実装 |
| 6 | `client.rs` | 487 | subscribe_audio の tx が未使用 | AudioWorker に tx を渡すパスを実装 |
| 7 | `callbacks.rs` | 268 | `state: 0` 固定 | pjsip_event の bindgen 生成型を使い state を抽出 |
| 8 | `callbacks.rs` | 385 | `info: String::new()` 固定 | pj_stun_nat_detect_result から情報を展開 |

## Scope

### 1. mixer.rs — MixerSourceEntry 有効化

`#[allow(dead_code)]` と `[::STUB::]` マーカーを削除。
source/eof フィールドは MixerSourceEntry 上に既に存在するため、マーカーのみ除去。

### 2. mixer.rs — AudioMixer 全メソッド有効化

`#[allow(dead_code)]` と `[::STUB::]` マーカーを削除。
`pop_out_frame` / `pop_in_frame` は既に AudioWorker が使用している。
`push_out_frame` / `push_in_frame` / `apply_gain` 等も同様に使用可能。

### 3. worker.rs — AudioWorker 起動パス + Tap 配送

**AudioWorker 起動**: reactor の `RuntimeCommand::StartAudioWorker` 相当の処理で
`tokio::task::spawn_blocking` 経由で AudioWorker のプロセスループを起動する。

**Tap 配送**: `process_frame()` 内の `try_pair()` 結果を `tap_txs` に配送する:

```rust
while let Some(pair) = self.pair_aligner.try_pair() {
    // 配送失敗（チャネル満杯）は oldest-drop 相当として無視
    self.tap_txs.retain(|tx| tx.try_send(pair.clone()).is_ok());
}
```

### 4. client.rs — audio_source / subscribe_audio の配線

**add_audio_source**: RuntimeCommand::AddAudioSource 経由で AudioWorker のミキサーに
source を登録するコマンドパスを実装。

**subscribe_audio**: `tx` を AudioWorker に渡し、Tap 配送チャネルとして登録するパスを実装。

### 5. callbacks.rs — pjsip_event state 抽出

`on_call_state` の `_e: *mut c_void` を `*mut bindings::pjsip_event` にキャストし、
`pjsip_event.body.tsx_state.state` または `pjsip_event.body.call_state` から
通話状態を抽出する。

```rust
pub extern "C" fn on_call_state(call_id: i32, e: *mut std::ffi::c_void) {
    catch_callback_panic("on_call_state", || {
        let state = unsafe {
            let ev = e as *const crate::ffi::bindings::pjsip_event;
            (*ev).body.tsx_state.state as u32
        };
        tracing::debug!(call_id, state, "on_call_state");
        enqueue_native_event(NativeEvent::CallStateChanged { call_id, state });
    });
}
```

### 6. callbacks.rs — NatDetected info 展開

`on_nat_detect` の `_info` を `*mut bindings::pj_stun_nat_detect_result` にキャストし、
NAT タイプを文字列に変換する。

## Non-scope

- **media.rs pjmedia_port ラッピング**（2 スタブ）: `RustMediaPort` を `pjmedia_port` C 構造体で
  ラップする作業は pjmedia_port の関数ポインタ設定を含む複雑な unsafe コードが必要なため、
  独立した別チケットとする。
- **build.rs stub**（1 件）: PJSIP 不在時に OUT_DIR へ書き込まれるスタブファイル。常に存在する。
- **reactor.rs AccountConfigPatch**（1 件）: M19-2 feature flags で解決予定。

## Test Plan

### 既存テストの維持

```bash
cargo test -p siprs          # 390 passed（PJSIP なし）
cargo test -p siprs --features pjsip  # 389 passed（PJSIP あり）
```

### 新規テスト

| # | テスト | 内容 | ファイル |
|---|--------|------|---------|
| 1 | mixer 全メソッド使用 | 各メソッドが dead_code になっていないことの確認 | mixer.rs |
| 2 | worker process_frame | Tap 配送が正しく行われること | worker.rs |
| 3 | callbacks state 抽出 | pjsip_event から正しい state が取得できること | callbacks.rs |

## Acceptance Criteria

- [ ] 8 件のスタブが `[::STUB::]` マーカーごと削除されていること
- [ ] `#[allow(dead_code)]` が適切に削除/縮小されていること
- [ ] `cargo test -p siprs`（PJSIP なし）全 390 テスト通過
- [ ] `cargo test -p siprs --features pjsip` 全 389 テスト通過
- [ ] `make check-be` 成功
- [ ] `cargo fmt --check` 通過
