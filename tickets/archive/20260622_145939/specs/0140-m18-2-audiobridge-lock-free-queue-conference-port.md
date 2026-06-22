---
ticket_id: 140
title: "M18-2: AudioBridge — lock-free queue 接続・Conference port 統合"
slug: m18-2-audiobridge-lock-free-queue-conference-port
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0140-m18-2-audiobridge-lock-free-queue-conference-port/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0140-m18-2-audiobridge-lock-free-queue-conference-port/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0140-m18-2-audiobridge-lock-free-queue-conference-port/review.md
---

# M18-2: `AudioBridge` — lock-free queue 接続・Conference port 統合

## Summary

`AudioWorkerTask` と `RustMediaPort`（M18-1）の間のデータフローを管理するブリッジ。
通話確立時に PJSIP conference bridge に 2 つの custom port（capture tap / playback inject）を接続し、
通話終了時に切断する。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§39.2, §39.3)

## Background

### なぜ必要か

M18-1 で `RustMediaPort`（lock-free キュー + `get_frame`/`put_frame`）を実装した。
しかし、実際の通話でこれを利用するには以下の統合が必要である:

1. **2 ポート管理**: 通話ごとに capture tap port（受信）と playback inject port（送信）の
   2 つの `RustMediaPort` をペアで管理する
2. **Conference bridge 接続**: `pjsua_conf_connect()` 経由で PJSIP conference bridge に接続
3. **AudioWorkerTask 連携**: フレーム処理ループ内で `push_to_rt` / `pop_from_rt` を呼び出す
4. **接続状態管理**: 通話開始 → 接続 → 切断 → 後処理のライフサイクル

### RFC 準拠

| 条項 | 内容 |
|------|------|
| §39.2 | AudioBridge 構造体: 2 つの `RustMediaPort` を内包 |
| §39.3 | データフロー: capture tap → AudioWorker → mix → playback inject |

### 設計判断

1. **`AudioBridge` は 2 つの `RustMediaPort` を内包**: capture（受信）方向と playback（送信）方向で
   別々のポートを持つ。`new()` で両方を生成する。

2. **接続管理は `connected` フラグのみ**: `connect_to_conference` は実際の PJSIP API 呼び出しを
   stub で代替（PJSIP 不在のため）。

3. **AudioWorkerTask との API は `ArrayQueue` 直接操作**: `push_to_rt` と `pop_from_rt` は
   AudioWorker がフレーム処理ループ内で呼び出す。

4. **`disconnect` は idempotent**: 複数回呼び出しても安全。

## Investigation

### 証拠 1: RustMediaPort は M18-1 で実装済み

**ファイル:** `crates/siprs/src/ffi/media.rs`

```rust
pub(crate) struct RustMediaPort {
    direction: PortDirection,
    frame_samples: usize,
    rx_queue: ArrayQueue<Vec<i16>>,
    tx_queue: ArrayQueue<Vec<i16>>,
    silence: Vec<i16>,
}
```

公開 API:
- `new(direction, frame_samples, queue_capacity) -> Self`
- `push_rx(&self, frame: Vec<i16>)` — 受信キューに push
- `pop_tx(&self) -> Option<Vec<i16>>` — 送信キューから pop
- `read_frame(&self, output: &mut [i16])` — get_frame 相当
- `write_frame(&self, input: &[i16])` — put_frame 相当

### 証拠 2: AudioMixer の ArrayQueue oldest-drop パターン

**ファイル:** `crates/siprs/src/audio/mixer.rs`

`push_in_frame` / `pop_in_frame` の oldest-drop ロジックが実装済み。
AudioBridge も同一パターンを採用。

### 証拠 3: PjsuaBackend に conf_connect/conf_disconnect stub

**ファイル:** `crates/siprs/src/ffi/pjsua_backend.rs`

```rust
fn conf_connect(&mut self, _source: NativeConfPortId, _sink: NativeConfPortId) -> Result<(), SipError> {
    unimplemented!("PjsuaBackend::conf_connect requires PJSIP headers")
}
```

### 証拠 4: 既存の AudioBridge コードは存在しない

`grep -rn "AudioBridge" crates/siprs/src/` → 0 hits

## Scope

### 新規ファイル

なし（`src/ffi/media.rs` に `AudioBridge` を追加）。

### 既存ファイル変更

#### 1. `crates/siprs/src/ffi/media.rs` — AudioBridge 追加

```rust
/// AudioWorkerTask と RustMediaPort の間のデータフローを管理するブリッジ。
///
/// 通話ごとに 2 つの RustMediaPort を持つ:
/// - `capture_port`: 受信（遠端 → ローカル）。PJSIP が書き込んだデータを AudioWorker が読み出す。
/// - `playback_port`: 送信（ローカル → 遠端）。AudioWorker が書き込んだデータを PJSIP が読み出す。
///
/// # データフロー（§39.3）
///
/// ```text
/// PJSIP conf bridge ──put_frame──→ capture_port.rx_queue ──pop_from_rt──→ AudioWorker
/// PJSIP conf bridge ←─get_frame── playback_port.tx_queue ←─push_to_rt─── AudioWorker
/// ```
pub(crate) struct AudioBridge {
    /// 受信ポート（遠端 → ローカル）。
    capture_port: RustMediaPort,
    /// 送信ポート（ローカル → 遠端）。
    playback_port: RustMediaPort,
    /// conference bridge 接続済みフラグ。
    connected: bool,
}
```

**メソッド:**

```rust
impl AudioBridge {
    /// 新しい AudioBridge を生成する。
    ///
    /// capture と playback の 2 つの RustMediaPort を同時に生成する。
    pub fn new(frame_samples: usize, queue_capacity: usize) -> Self;

    /// conference bridge に capture/inject port を接続する。
    ///
    /// PJSIP の `pjsua_conf_connect()` を呼び出して、
    /// capture_port と playback_port を conference bridge に接続する。
    /// PJSIP 不在時は connected フラグのみ設定する。
    pub fn connect_to_conference(&mut self) -> Result<(), SipError>;

    /// conference bridge から切断し、port を破棄する。
    /// idempotent: 複数回呼び出し可能。
    pub fn disconnect(&mut self) -> Result<(), SipError>;

    /// OUT 方向: AudioWorkerTask の処理結果を RT callback に送る。
    /// playback_port の tx_queue に push。満杯時は oldest-drop。
    pub fn push_to_rt(&self, frame: Vec<i16>);

    /// IN 方向: RT callback からの受信データを AudioWorkerTask が取得する。
    /// capture_port の rx_queue から pop。データなしは None。
    pub fn pop_from_rt(&self) -> Option<Vec<i16>>;

    /// conference bridge 接続済みか確認する。
    pub fn is_connected(&self) -> bool;
}
```

**`connect_to_conference` の詳細フロー:**

```rust
pub fn connect_to_conference(&mut self) -> Result<(), SipError> {
    if self.connected {
        return Ok(()); // idempotent
    }
    // [::STUB::] M19-1: PJSIP 利用可能時は実際の pjsua_conf_connect を呼ぶ
    // 1. capture_port を conference bridge に登録
    //    let capture_id = pjsua_conf_add_port(capture_port, ...);
    // 2. playback_port を conference bridge に登録
    //    let playback_id = pjsua_conf_add_port(playback_port, ...);
    // 3. capture ポートを conf に接続: pjsua_conf_connect(capture_id, ...)
    // 4. playback ポートを conf に接続: pjsua_conf_connect(..., playback_id)
    self.connected = true;
    Ok(())
}
```

### 2. `crates/siprs/src/ffi/media.rs` — `#![allow(dead_code)]` 更新

M18-1 で付与した `#![allow(dead_code)]` を、M18-2 完了後に `AudioBridge` と
`RustMediaPort` が使用開始されるため、適宜縮小する。

## Non-scope

- **AudioWorkerTask への統合**: AudioWorker のフレーム処理ループ内で `push_to_rt` /
  `pop_from_rt` を呼び出す実装は M15-2 の範囲。
- **PJSIP conference bridge の実際の API 呼び出し**: M19-1 以降、PJSIP が利用可能に
  なった時点で実装。
- **metrics カウンター**: M19-3 のスコープ。

## Test Plan

### ユニットテスト計画

テストは `ffi/media.rs` 内の既存 `#[cfg(test)]` モジュールに追加する。

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 1 | `test_audio_bridge_new` | 正常 | new 後に is_connected == false |
| 2 | `test_audio_bridge_push_pop_roundtrip` | 正常 | push_to_rt → pop_from_rt が独立 |
| 3 | `test_audio_bridge_queue_independence` | 正常 | capture と playback の queue が干渉しない |
| 4 | `test_audio_bridge_connect_disconnect` | 正常 | connect → is_connected == true, disconnect → false |
| 5 | `test_audio_bridge_disconnect_idempotent` | 正常 | 複数回 disconnect が安全 |
| 6 | `test_audio_bridge_overflow` | 境界 | push_to_rt 満杯 → oldest-drop |

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | 実際の PJSIP conference bridge 接続 | PJSIP ライブラリがシステムに必要。M20-1 で E2E |
| 2 | AudioWorkerTask との結合テスト | M15-2 + M20-1 で実施予定 |

## Boy Scout Rule — 翻訳可能性計画

### 改善対象

1. **`ffi/media.rs` の `#![allow(dead_code)]` 縮小**: AudioBridge 追加後、
   `RustMediaPort` が AudioBridge 経由で使用されるため、不要になった allow を削除する。

2. **AudioBridge メソッドの命名**: `push_to_rt`/`pop_from_rt` は方向が明確で翻訳可能。
   コメントでデータフローを図示する（spec の ASCII 図をコードコメントに転記）。

## Acceptance Criteria

- [ ] `make check` 成功（0 error, 0 warning）
- [ ] `make test` 全 PASS（既存 384 テスト維持）
- [ ] `cargo check -p siprs` 成功
- [ ] `AudioBridge::new()` → `is_connected() == false`
- [ ] `connect_to_conference()` → `is_connected() == true`
- [ ] `disconnect()` → `is_connected() == false`（idempotent）
- [ ] `push_to_rt` → `pop_from_rt` でデータが一致
- [ ] capture と playback の queue が独立していること
- [ ] 満杯時の oldest-drop が機能すること
- [ ] `cargo fmt --check` 通過

## Notes

### M18 マイルストーン

```text
M18-1 (#139) ✅ reviewed — RustMediaPort（lock-free キュー）
                     │
M18-2 (#140)     ──→ AudioBridge（2 ポート管理 + conference 接続）
```

### AudioBridge データフロー図

```
PJSIP conference bridge
       │
       ├── put_frame() ──→ capture_port.rx_queue ──→ AudioWorker.pop_from_rt()
       │                                                      │
       │                                              [ミキシング/加工]
       │                                                      │
       └── get_frame() ←── playback_port.tx_queue ←── AudioWorker.push_to_rt()
```

### M19-1 以降の実装

`connect_to_conference` 内の PJSIP API 呼び出しは、M19-1（vendor/ からの PJSIP ビルド）完了後に
実際の `pjsua_conf_add_port()` / `pjsua_conf_connect()` に置き換える。
