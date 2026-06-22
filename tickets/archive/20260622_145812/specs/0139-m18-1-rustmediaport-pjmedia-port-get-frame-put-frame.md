---
ticket_id: 139
title: "M18-1: RustMediaPort — pjmedia_port / get_frame / put_frame"
slug: m18-1-rustmediaport-pjmedia-port-get-frame-put-frame
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0139-m18-1-rustmediaport-pjmedia-port-get-frame-put-frame/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0139-m18-1-rustmediaport-pjmedia-port-get-frame-put-frame/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0139-m18-1-rustmediaport-pjmedia-port-get-frame-put-frame/review.md
---

# M18-1: `RustMediaPort` — `pjmedia_port` / `get_frame` / `put_frame`

## Summary

PJSIP conference bridge と Rust `AudioWorkerTask` を接続する lock-free メディアポート。
RT callback 側（`get_frame`/`put_frame`）ではロック・メモリ確保・非同期待機を行わず、
`ArrayQueue` からの pop/push と `memcpy` のみを実行する。
すべての重い処理は `AudioWorkerTask` 側で行われる。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§39.2, §39.1)

## Background

### なぜ必要か

PJSIP の conference bridge は C の `pjmedia_port` インターフェース経由で
メディアフレームをやり取りする。Rust 側で音声処理（ミキシング、リサンプル、
フォーマット変換）を行うには、この C インターフェースを実装したカスタムメディアポート
が必要である。`RustMediaPort` は以下を提供する:

1. **RT callback 安全**: `get_frame`/`put_frame` はロック・メモリ確保なし
2. **lock-free 通信**: `ArrayQueue` 経由で Rust AudioWorkerTask とデータを交換
3. **PJSIP conference bridge 統合**: `pjmedia_port` として登録可能

### RFC 準拠

| 条項 | 内容 |
|------|------|
| §39.1 | PJSIP callback は OS の最優先リアルタイムスレッドで駆動。`ArrayQueue` pop/push, `memcpy`, ゼロフィルのみ許容 |
| §39.2 | custom media port 設計: `get_frame` / `put_frame` を持つ `RustMediaPort` |

### 設計判断

1. **ArrayQueue + oldest-drop**: AudioMixer（M15-1）と同じパターンを採用。
   `rx_queue`（RT→Rust）と `tx_queue`（Rust→RT）の二方向。

2. **`MAX_FRAME_BYTES` 固定長バッファ**: 48kHz/stereo/20ms の最大フレームに対応する
   固定長配列 `[u8; MAX_FRAME_BYTES]` を `MediaFrame` として定義。
   これにより RT callback 内でのメモリ確保を完全に排除する。

3. **extern "C" 関数は手動定義**: bindgen 未生成のため `pjmedia_port` 構造体と
   callback 関数ポインタの型を手動定義。M19-1 完了後 bindgen 生成型に置き換える。

4. **`PortDirection` で方向を明示**: `Capture`（受信音声、remote→local）と
   `Playback`（送信音声、local→remote）の2値を enum で表現。

## Investigation

### 証拠 1: メディア関連 FFI コードは存在しない

`grep -rn "RustMediaPort\|MediaFrame\|PortDirection\|pjmedia_port" crates/siprs/src/` → 0 hits

### 証拠 2: ArrayQueue oldest-drop パターンは AudioMixer で実証済み

**ファイル:** `crates/siprs/src/audio/mixer.rs:103-113`

```rust
pub(crate) struct AudioMixer {
    out_queue: ArrayQueue<Vec<i16>>,
    in_queue: ArrayQueue<Vec<i16>>,
    // ...
}
```

`push_in_frame` / `pop_in_frame` / `push_out_frame` / `pop_out_frame` の
oldest-drop ロジックが実装済み。M18-1 でも同一パターンを採用する。

### 証拠 3: crossbeam-queue は既に依存関係にある

**ファイル:** `crates/siprs/Cargo.toml`

```toml
crossbeam-queue = "0.3"
```

新規依存クレート不要。

### 証拠 4: NativeConfPortId は runtime/backend.rs で定義済み

```rust
pub(crate) type NativeConfPortId = i32;
```

`conf_connect` / `conf_disconnect` で使用。M18-2 で本格的に使用。

### 証拠 5: MediaInitFailed は error.rs で定義済み

```rust
MediaInitFailed,  // retryable: true
```

## Scope

### 新規ファイル

#### 1. `crates/siprs/src/ffi/media.rs` — RustMediaPort

**`MAX_FRAME_BYTES` 定数:**

```rust
/// 最大フレームサイズ（48kHz / stereo / 20ms / 16bit）。
///
/// 計算: 48000 * 2 * 20/1000 * 2 = 3840 bytes
pub(crate) const MAX_FRAME_BYTES: usize = 3840;
```

**`MediaFrame` — 固定長バッファ:**

```rust
/// 固定長メディアフレーム。
///
/// RT callback 内でのメモリ確保を排除するため、固定長配列を使用する。
#[derive(Debug, Clone)]
pub(crate) struct MediaFrame {
    /// フレームデータ。
    data: [u8; MAX_FRAME_BYTES],
    /// 有効データ長（バイト）。
    len: usize,
}
```

**`PortDirection` enum:**

```rust
/// メディアポートの方向。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PortDirection {
    /// 受信（遠端 → ローカル）。PJSIP の PJMEDIA_DIR_CAPTURE 相当。
    Capture,
    /// 送信（ローカル → 遠端）。PJSIP の PJMEDIA_DIR_PLAYBACK 相当。
    Playback,
}
```

**`RustMediaPort` 構造体:**

```rust
/// PJSIP conference bridge と Rust AudioWorkerTask を接続するメディアポート。
///
/// # RT callback 安全性
///
/// `get_frame` / `put_frame` は以下の操作のみを行う:
/// - `ArrayQueue::pop()` / `push()`（lock-free）
/// - `copy_nonoverlapping`（memcpy）
/// - `write_bytes`（ゼロフィル）
///
/// メモリ確保・ロック・非同期待機は一切行わない。
pub(crate) struct RustMediaPort {
    /// ポート方向。
    direction: PortDirection,
    /// 1 フレームあたりのバイト数。
    frame_size: usize,
    /// RT callback → Rust 方向のキュー（Capture: 受信フレーム, Playback: 空）。
    rx_queue: ArrayQueue<Vec<i16>>,
    /// Rust → RT callback 方向のキュー（Capture: 空, Playback: 送信フレーム）。
    tx_queue: ArrayQueue<Vec<i16>>,
    /// ゼロフィル用バッファ（アンダーラン時）。
    silence_buffer: Vec<i16>,
}
```

**`RustMediaPort` メソッド:**

```rust
impl RustMediaPort {
    /// 新しい RustMediaPort を生成する。
    pub fn new(
        direction: PortDirection,
        frame_size: usize,
        queue_capacity: usize,
    ) -> Self;

    /// 受信キューにフレームを push する（AudioWorkerTask から呼ぶ）。
    /// 満杯時は oldest-drop。
    pub fn push_rx(&self, frame: Vec<i16>);

    /// 送信キューからフレームを pop する（AudioWorkerTask から呼ぶ）。
    pub fn pop_tx(&self) -> Option<Vec<i16>>;

    /// RT callback が呼び出す get_frame 相当の処理。
    /// データあり → コピー、なし → ゼロフィル。
    pub(crate) fn read_frame(&self, output: &mut [i16]);

    /// RT callback が呼び出す put_frame 相当の処理。
    /// データをキューに push、満杯時は oldest-drop。
    pub(crate) fn write_frame(&self, input: &[i16]);
}
```

**extern "C" callback 関数:**

```rust
/// pjmedia_port.get_frame 相当の extern "C" 関数。
///
/// # SAFETY
///
/// `port` は有効な `RustMediaPort` のポインタでなければならない。
/// `frame` は有効な `pjmedia_frame` 構造体へのポインタでなければならない。
/// この関数は PJSIP のリアルタイムスレッドから呼ばれる。
#[no_mangle]
pub unsafe extern "C" fn rust_media_port_get_frame(
    port: *mut std::ffi::c_void,
    frame: *mut std::ffi::c_void,
) -> i32 {
    // SAFETY 呼び出し元が正しいポインタを渡すことを前提
    let media_port = &*(port as *const RustMediaPort);
    let pj_frame = &mut *(frame as *mut PjmediaFrame);
    let samples = pj_frame.size as usize / 2; // 16bit = 2 bytes
    let output = std::slice::from_raw_parts_mut(pj_frame.buf as *mut i16, samples);
    media_port.read_frame(output);
    0 // PJ_SUCCESS
}

/// pjmedia_port.put_frame 相当の extern "C" 関数。
#[no_mangle]
pub unsafe extern "C" fn rust_media_port_put_frame(
    port: *mut std::ffi::c_void,
    frame: *mut std::ffi::c_void,
) -> i32 {
    let media_port = &*(port as *const RustMediaPort);
    let pj_frame = &*(frame as *const PjmediaFrame);
    let samples = pj_frame.size as usize / 2;
    let input = std::slice::from_raw_parts(pj_frame.buf as *const i16, samples);
    media_port.write_frame(input);
    0 // PJ_SUCCESS
}
```

**`PjmediaFrame` 手動定義:**

```rust
/// pjmedia_frame の手動定義（bindgen 代替）。
#[repr(C)]
pub(crate) struct PjmediaFrame {
    pub buf: *mut u8,
    pub size: u32,
    pub timestamp: u32,
    pub seq: u16,
    pub bit_info: u8,
    pub frame_type: u8,
    pub samples: u32,
}
```

### 既存ファイル変更

なし（`ffi/mod.rs` に `pub mod media;` 追加のみ）。

## Non-scope

- **AudioBridge（conf_connect/conf_disconnect 統合）**: M18-2 のスコープ。
- **PJSIP conference port 登録**: `pjsua_conf_add_port()` の呼び出しは M18-2。
- **AudioMixer との直接統合**: `RustMediaPort` は純粋な lock-free キューインターフェース。
  ミキサーとの接続は AudioWorkerTask が行う（M15-2）。
- **bindgen 生成型との統合**: M19-1 以降。

## Test Plan

### ユニットテスト計画

テストは `ffi/media.rs` 内の `#[cfg(test)]` モジュールに実装する。

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 1 | `test_new_port` | 正常 | 各 direction で new 成功 |
| 2 | `test_push_pop_roundtrip` | 正常 | push → pop でデータ一致 |
| 3 | `test_read_frame_data` | 正常 | データあり → read_frame で正しく読み出せる |
| 4 | `test_read_frame_underrun` | 正常 | 空キュー → read_frame でゼロフィル |
| 5 | `test_write_frame_overflow` | 正常 | 満杯 → oldest-drop + 新データ保持 |
| 6 | `test_media_frame_layout` | 正常 | MediaFrame のサイズが MAX_FRAME_BYTES |
| 7 | `test_port_direction_display` | 正常 | Capture / Playback 表示 |
| 8 | `test_pjmedia_frame_layout` | 正常 | PjmediaFrame のレイアウト確認 |

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | extern "C" get_frame/put_frame の PJSIP 結合 | PJSIP conference bridge との結合が必要。M20-1 で E2E |
| 2 | miri による stacked borrows 検証 | CI 環境で `cargo miri` を実行可能になった時点で |

## Boy Scout Rule — 翻訳可能性計画

### 改善対象

1. **`ffi/media.rs`（新規作成）**: RT callback と AudioWorker の責務を明確に分離。
   `read_frame` / `write_frame` は PJSIP の naming に合わせるが、コメントで
   「RT callback 安全」の理由を明記。

2. **`AudioMixer` の oldest-drop ロジック（既存コード）**: 本チケットでは触らないが、
   M18-1 で同一パターンを使用する際に、共通化の余地があれば抽出を検討。

## Acceptance Criteria

- [ ] `make check` 成功（0 error, 0 warning）
- [ ] `make test` 全 PASS（既存 376 テスト維持）
- [ ] `cargo check -p siprs` 成功
- [ ] `RustMediaPort::new()` が各 direction / frame_size で正常動作
- [ ] `push_rx` → `read_frame` でデータが正しくコピーされること
- [ ] 空キューでの `read_frame` → ゼロフィルが行われること
- [ ] 満杯キューでの `write_frame` → oldest-drop されること
- [ ] `MediaFrame` のサイズが `MAX_FRAME_BYTES`（3840）であること
- [ ] `PjmediaFrame` のレイアウトが期待値と一致すること
- [ ] `cargo fmt --check` 通過

## Notes

### M18 マイルストーン

```text
M18-1 (#139) ──→ RustMediaPort（lock-free キュー + get_frame/put_frame）
                     │
M18-2         ──→ AudioBridge（conf_connect + conference port 統合）
```

### MAX_FRAME_BYTES 計算根拠

| パラメータ | 値 |
|-----------|-----|
| サンプルレート | 48,000 Hz |
| チャネル数 | 2（stereo）|
| フレーム時間 | 20 ms |
| サンプル形式 | 16bit（2 bytes）|

```
48,000 * 2 * (20/1000) * 2 = 3,840 bytes
```

### 既存 ArrayQueue パターンとの整合

AudioMixer の `push_in_frame`/`pop_in_frame` と同じ oldest-drop パターンを使用する。
将来的に共通部分を抽出可能だが、現時点では AudioMixer と RustMediaPort の
queue の意味が異なる（mixer は「ミキサー→RT callback」、port は「port→RT callback」）
ため、独立した実装とする。
