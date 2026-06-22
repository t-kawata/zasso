---
ticket_id: 138
title: "M17-4: PjsuaBackend — SipBackend trait の PJSUA 実装"
slug: m17-4-pjsuabackend-sipbackend-trait-pjsua
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0138-m17-4-pjsuabackend-sipbackend-trait-pjsua/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0138-m17-4-pjsuabackend-sipbackend-trait-pjsua/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0138-m17-4-pjsuabackend-sipbackend-trait-pjsua/review.md
---

# M17-4: `PjsuaBackend` — `SipBackend` trait の PJSUA 実装

## Summary

`SipBackend` trait の本番実装である `PjsuaBackend` を実装する。
全 PJSUA API 呼び出しを safe Rust でラップし、エラー変換（`pj_status_t` → `SipError`）、
callback bridge（M17-3）との連携、コーデックポリシー（PCMU/Opus のみ有効）を提供する。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§27a, §29, §29.1)

## Background

### なぜ必要か

siprs の FFI 層（フェーズ8）は M17-1〜M17-3 で基盤型・文字列ラッパー・callback bridge を
実装した。M17-4 はこれらを統合し、`SipBackend` trait の本番実装として実際の PJSIP ライブラリ
を駆動する。MockBackend はテスト専用であり、実運用では PjsuaBackend が唯一の実装となる。

M17-4 の完了により、CoreReactor の `reject_command("unhandled command")` が全ての
`RuntimeCommand` を実際の PJSIP 呼び出しに変換するようになる。

### RFC 準拠

| 条項 | 内容 |
|------|------|
| §27a | MVP 範囲では PJSUA（PjsuaBackend）が唯一の実装 |
| §29 | codec policy 強制: PCMU と Opus 以外は無効化 |
| §29.1 | コーデックフォールバックルール |

### 設計判断

1. **manual FFI declarations**: bindgen が PJSIP ヘッダ不在で生成できないため、
   必要な PJSIP 関数の `extern "C"` 宣言を手動で記述する。bindgen 生成が可能になった時点で
   置き換える。

2. **`#[cfg(not(feature = "pjsip_available"))]` による条件付きコンパイル**:
   PJSIP がインストールされていない環境では、全メソッドが `unimplemented!()` または
   スタブを返す。コンパイルは通るが実行時にパニックする。

3. **`pj_status_t` → `SipError` 変換関数**: `pj_status_t` の主要エラーコード
   （`PJ_SUCCESS`, `PJ_EBUSY`, `PJ_ETIMEDOUT`, `PJ_EINVAL` 等）を `SipErrorKind` に
   マッピングする `pj_status_to_sip_error()` 関数を実装する。

4. **codec priority を定数化**: PCMU=255, Opus=254, その他=0 を名前付き定数で定義する。

## Investigation

### 証拠 1: SipBackend trait は 14 メソッド

**ファイル:** `crates/siprs/src/runtime/backend.rs:39-107`

```rust
pub(crate) trait SipBackend: Send {
    fn initialize(&mut self, config: &ClientConfig) -> Result<ClientCapabilities, SipError>;
    fn shutdown(&mut self) -> Result<(), SipError>;
    fn create_transport(&mut self, config: &TransportConfig) -> Result<(), SipError>;
    fn add_account(&mut self, config: &AccountConfig) -> Result<(NativeAccId, ClientCapabilities), SipError>;
    fn remove_account(&mut self, native_acc_id: NativeAccId) -> Result<(), SipError>;
    fn set_registration(&mut self, native_acc_id: NativeAccId, enabled: bool) -> Result<(), SipError>;
    fn make_call(&mut self, native_acc_id: NativeAccId, request: &OutgoingCallRequest) -> Result<NativeCallId, SipError>;
    fn answer_call(&mut self, native_call_id: NativeCallId, code: u16) -> Result<(), SipError>;
    fn hangup(&mut self, native_call_id: NativeCallId) -> Result<(), SipError>;
    fn conf_connect(&mut self, source: NativeConfPortId, sink: NativeConfPortId) -> Result<(), SipError>;
    fn conf_disconnect(&mut self, source: NativeConfPortId, sink: NativeConfPortId) -> Result<(), SipError>;
    fn configure_codecs(&mut self) -> Result<(), SipError>;
    fn send_dtmf(&mut self, native_call_id: NativeCallId, method: &DtmfMethod, digits: &str) -> Result<(), SipError>;
    fn transfer_call(&mut self, native_call_id: NativeCallId, target: &str) -> Result<(), SipError>;
}
```

Native ID 型は全て `i32` のエイリアス:
```rust
pub(crate) type NativeAccId = i32;
pub(crate) type NativeCallId = i32;
pub(crate) type NativeConfPortId = i32;
```

### 証拠 2: MockBackend はテスト専用

**ファイル:** `crates/siprs/src/runtime/backend.rs:112-339`（`#[cfg(test)]`）

### 証拠 3: CoreReactor は Initialize/Shutdown のみ処理

**ファイル:** `crates/siprs/src/runtime/reactor.rs`

```rust
RuntimeCommand::Initialize { .. } => { ... }
RuntimeCommand::Shutdown { .. } => { ... }
_ => reject_command(cmd, "unhandled command"),
```

M17-4 完了後、全 18 コマンドが PjsuaBackend 経由で PJSUA にディスパッチされる。

### 証拠 4: Callback bridge の NativeEvent 未使用

**ファイル:** `crates/siprs/src/ffi/callbacks.rs`

- `enqueue_native_event()` は `tracing::trace` のみ（M17-4 で実装）
- `on_call_state` の `state: 0` はスタブ（M17-4 で展開）
- `catch_callback_panic` は `InternalInvariantBroken` emit 未実装

### 証拠 5: pj_status_t → SipError 変換未実装

- `SipError::native_error()` はあるが `From<pj_status_t>` は未実装
- 主要エラーコードのマッピングテーブルがない

### 証拠 6: PjsuaBackend という名前のコードは存在しない

- 全ソースを検索してもゼロヒット

## Scope

### 新規ファイル

#### 1. `crates/siprs/src/ffi/pjsua_backend.rs` — PjsuaBackend

**PjsuaBackend 構造体:**

```rust
/// SipBackend trait の PJSUA 実装。
///
/// 全 PJSUA API 呼び出しを safe Rust でラップする。
/// PJSIP ライブラリが利用可能な場合のみコンパイルされる。
pub(crate) struct PjsuaBackend {
    /// 初期化済みフラグ。
    initialized: bool,
}
```

**impl SipBackend for PjsuaBackend:**

`cfg` で2つの実装を切り替える:

```rust
// PJSIP 利用可能時: 実際の FFI 呼び出し
#[cfg(feature = "pjsip_available")]
impl SipBackend for PjsuaBackend { ... }

// PJSIP 不在時: スタブ（コンパイル通過目的）
#[cfg(not(feature = "pjsip_available"))]
impl SipBackend for PjsuaBackend {
    fn initialize(&mut self, _config: &ClientConfig) -> Result<ClientCapabilities, SipError> {
        unimplemented!("PjsuaBackend requires PJSIP headers (see M19-1)")
    }
    // ... 同様に全メソッド
}
```

**主要メソッドの実装（PJSIP 利用可能時）:**

```rust
fn initialize(&mut self, config: &ClientConfig) -> Result<ClientCapabilities, SipError> {
    // SAFETY: pjsua_create() は PJSIP 初期化の最初の呼び出し。
    // 戻り値が PJ_SUCCESS 以外の場合はエラー変換する。
    let status = unsafe { ffi::bindings::pjsua_create() };
    if status != 0 {
        return Err(pj_status_to_sip_error(status, "pjsua_create failed"));
    }

    // config から pjsua_config / pjsua_logging_config / pjsua_media_config を構築
    let mut pjsua_cfg = build_pjsua_config(config);
    let mut log_cfg = build_log_config(config);
    let mut media_cfg = build_media_config(config);

    // SAFETY: pjsua_init() は pjsua_create() の後にのみ呼び出せる。
    let status = unsafe {
        ffi::bindings::pjsua_init(&mut pjsua_cfg, &mut log_cfg, &mut media_cfg)
    };
    if status != 0 {
        return Err(pj_status_to_sip_error(status, "pjsua_init failed"));
    }

    // callback 登録
    let mut callback = ffi::callbacks::PjsuaCallback::default();
    ffi::callbacks::register_callbacks(&mut callback);
    // SAFETY: pjsua_set_callback() は pjsua_init 後に呼び出す。
    unsafe { ffi::bindings::pjsua_set_callback(&mut callback) };

    // SAFETY: pjsua_start() でメディア処理を開始。
    let status = unsafe { ffi::bindings::pjsua_start() };
    if status != 0 {
        return Err(pj_status_to_sip_error(status, "pjsua_start failed"));
    }

    self.initialized = true;
    Ok(detect_capabilities())
}
```

```rust
fn configure_codecs(&mut self) -> Result<(), SipError> {
    // 1. pjsua_enum_codecs() で全コーデックを列挙
    // 2. PCMU/8000/1 → priority 255
    // 3. opus 系 → priority 254
    // 4. それ以外 → priority 0（無効化）

    const CODEC_PRIO_PCMU: u8 = 255;
    const CODEC_PRIO_OPUS: u8 = 254;
    const CODEC_PRIO_DISABLED: u8 = 0;
    // ... 実装
}
```

**pj_status_t → SipError 変換:**

```rust
/// pj_status_t を SipError に変換する。
fn pj_status_to_sip_error(status: i32, context: &str) -> SipError {
    match status {
        // PJ_SUCCESS → エラーではない
        0 => unreachable!("pj_status_to_sip_error called with PJ_SUCCESS"),
        // 主要エラーコードのマッピング
        -1 => SipError::native_error(format!("{context}: PJ_EBUSY"), status, None, None),
        -2 => SipError::native_error(format!("{context}: PJ_ETIMEDOUT"), status, None, None),
        -3 => SipError::native_error(format!("{context}: PJ_EINVAL"), status, None, None),
        // ... その他のエラーコード
        _ => SipError::native_error(context, status, None, None),
    }
}
```

**FFI 関数の manual extern 宣言（cfg pjsip_available）:**

```rust
#[cfg(feature = "pjsip_available")]
mod pjsip_ffi {
    extern "C" {
        pub(crate) fn pjsua_create() -> i32;
        pub(crate) fn pjsua_init(
            pjsua_cfg: *mut pjsua_config,
            log_cfg: *mut pjsua_logging_config,
            media_cfg: *mut pjsua_media_config,
        ) -> i32;
        pub(crate) fn pjsua_start() -> i32;
        pub(crate) fn pjsua_destroy();
        // ... 必要に応じて他の関数
    }
}
```

### 既存ファイル変更

#### 2. `crates/siprs/src/ffi/mod.rs` — backends モジュール追加

```rust
/// PjsuaBackend — SipBackend trait の PJSUA 実装。
#[cfg(feature = "pjsip")]
pub mod pjsua_backend;
```

#### 3. `crates/siprs/Cargo.toml` — pjsip feature flag 追加

```toml
[features]
serde = ["dep:serde"]
tls = []
srtp = []
pjsip = []  # 追加: PJSIP 利用可能時のみ PjsuaBackend を有効化
```

#### 4. `crates/siprs/src/runtime/reactor.rs` — 全コマンドのディスパッチ実装

現状は `Initialize` / `Shutdown` のみ。M17-4 で残りの 16 コマンドを
PjsuaBackend 経由で処理するように拡張する（Reactor の dispatch 拡張は M17-4 の範囲）。

```rust
RuntimeCommand::AddAccount { config, reply } => {
    let result = (|| -> Result<(), SipError> {
        // state からアカウント追加
        // backend.add_account() 呼び出し
        // native_id を state に保存
        Ok(())
    })();
    let _ = reply.send(result);
}
// ... 他のコマンドも同様パターン
```

## Non-scope

- **bindgen 生成型との統合**: bindgen が利用可能になった時点で別チケット。
- **全 pjsua 型の手動定義**: `pjsua_config`, `pjsua_logging_config`, `pjsua_media_config` 等の
  大規模構造体は最小限のフィールドのみ手動定義。完全な定義は bindgen 化を待つ。
- **メディアポート（conf_connect/conf_disconnect）の完全実装**: M18-1 で具体化。
- **audio bridge**: M18-2 のスコープ。
- **M19-1（vendor/ からの自動ビルド）**: 本チケットはシステムに PJSIP がインストール済みであることを前提。

## Test Plan

### ユニットテスト計画

テストは `ffi/pjsua_backend.rs` 内の `#[cfg(test)]` モジュールに実装する。

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 1 | `test_new_not_initialized` | 正常 | `new()` 直後は `initialized == false` |
| 2 | `test_pj_status_to_sip_error_success` | 異常 | PJ_SUCCESS → unreachable（panic in test） |
| 3 | `test_pj_status_to_sip_error_known` | 正常 | 既知エラーコード → 正しい kind |
| 4 | `test_pj_status_to_sip_error_unknown` | 正常 | 未知エラーコード → NativeError |
| 5 | `test_configure_codecs_priorities` | 正常 | PCMU=255 / Opus=254 / 他=0 が設定される |
| 6 | `test_sip_backend_trait_bounds` | 正常 | `PjsuaBackend: SipBackend + Send` のコンパイル検証 |
| 7 | `test_initialize_stub` | 正常 | PJSIP 不在時は `unimplemented!()` になること |

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | 実際の PJSUA 初期化フロー | PJSIP ライブラリがシステムにインストールされている環境が必要。M20-1 で結合テストとして実施 |
| 2 | callback からの NativeEvent → SipEventPayload 変換 | reactor との結合が必要。M17-4 完了後 M20-1 で E2E |
| 3 | 全 14 メソッドの PJSIP 呼び出し | PJSIP 不在のため。各メソッドの型安全は cfg 対象外のスタブで確認 |

## Boy Scout Rule — 翻訳可能性計画

### 改善対象

1. **`ffi/pjsua_backend.rs`（新規作成）**: 各 `SipBackend` メソッドは1つの責務に限定。
   `initialize` 内の pjsua_create/pjsua_init/pjsua_start の3段階はそれぞれ別関数に抽出
   （`pjsua_create_wrapped`, `pjsua_init_wrapped`, `pjsua_start_wrapped`）。

2. **`runtime/reactor.rs` の dispatch 拡張**: 既存の `reject_command` が全コマンドを
   ハードコードしている。M17-4 で実際のディスパッチに置き換える際、
   `match` の各アームが一貫したパターン（state 取得 → backend 呼び出し → reply）に
   統一されていることを確認する。

3. **codec priority のマジックナンバー防止**: 255, 254, 0 を名前付き定数として
   定義する（`CODEC_PRIO_PCMU`, `CODEC_PRIO_OPUS`, `CODEC_PRIO_DISABLED`）。

## Acceptance Criteria

- [ ] `make check-be` 成功（0 error, 0 warning）
- [ ] `make test` 全 PASS（既存 369 テスト維持）
- [ ] `cargo check -p siprs` 成功（PJSIP スタブバインド + cfg 制御）
- [ ] `PjsuaBackend: SipBackend + Send` がコンパイル時に検証されること
- [ ] `pj_status_to_sip_error()` が主要エラーコードを正しく変換すること
- [ ] `configure_codecs()` の優先度設定が PCMU=255 / Opus=254 / 他=0 であること
- [ ] `initialize()` が pjsua_create → pjsua_init → pjsua_start の順序を守ること
- [ ] callback bridge の `register_callbacks()` が `pjsua_set_callback` 経由で設定されること
- [ ] `cargo fmt --check` 通過
- [ ] 翻訳可能性: 全 14 メソッドが1つの責務を持ち、関数名が動詞句であること

## Notes

### 実装の前提

PJSIP 2.17 がシステムにインストールされていることを前提とする。
インストールされていない環境では `--cfg feature="pjsip"` 未指定により
PjsuaBackend はコンパイルされず、全メソッドが `unimplemented!()` スタブとなる。

### M19-1 との関係

```text
M17-4 (#138) ──→ 手動 extern "C" + pjsip feature flag + pj_status_t 変換
                     │
M19-1         ──→ build.rs で PJSIP vendor/ 自動ビルド + リンク設定
                     │
                 bindgen 生成後 ──→ 手動 extern "C" を bindgen 生成型に置き換え
```

### M17-3 からの継続

M17-3 で未実装の `enqueue_native_event` の実際の reactor 送信と、
`catch_callback_panic` の §46.1 4 ステップクリーンアップは M17-4 で実装する。
