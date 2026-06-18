---
ticket_id: 148
title: "M18-3: RustMediaPort → pjmedia_port C ラッパー（conference 接続）"
slug: m18-3-rustmediaport-pjmedia-port-c-conference
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0148-m18-3-rustmediaport-pjmedia-port-c-conference/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0148-m18-3-rustmediaport-pjmedia-port-c-conference/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0148-m18-3-rustmediaport-pjmedia-port-c-conference/review.md
---
# M18-3: `RustMediaPort` → `pjmedia_port` C ラッパー（conference 接続）

## Summary

`AudioBridge::connect_to_conference()` / `disconnect()` の `#[cfg(feature = "pjsip")]` 実装がスタブのまま。
`RustMediaPort` を `pjmedia_port` C 構造体にラップし、`pjsua_conf_add_port()` / `pjsua_conf_connect()` で
PJSIP conference bridge に接続する。これで siprs crate 最後の `[::STUB::]` が解決される。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§27, §39.2, §39.3)

## Background

### 未解決の 2 スタブ

`media.rs:232` と `media.rs:257` が唯一の残存スタブ。`connect_to_conference` は `self.connected = true` を設定するのみで、
実際の `pjsua_conf_add_port()` / `pjsua_conf_connect()` を呼んでいない。

### pjmedia_port 構造体

bindgen で生成された `pjmedia_port` は `get_frame` / `put_frame` 関数ポインタを持つ:

```rust
pub struct pjmedia_port {
    pub info: pjmedia_port_info,
    pub port_data: pjmedia_port_port_data,
    pub grp_lock: *mut pj_grp_lock_t,
    pub get_clock_src: Option<...>,
    pub put_frame: Option<unsafe extern "C" fn(*mut pjmedia_port, *mut pjmedia_frame) -> pj_status_t>,
    pub get_frame: Option<unsafe extern "C" fn(*mut pjmedia_port, *mut pjmedia_frame) -> pj_status_t>,
    pub on_destroy: Option<...>,
}
```

M18-1 で定義済みの `rust_media_port_get_frame` / `rust_media_port_put_frame` を
これらの関数ポインタに設定する。

## Investigation

### 証拠 1: 既存の extern "C" 関数

`media.rs` に extern "C" 関数 `rust_media_port_get_frame` / `rust_media_port_put_frame` が
定義済み。これらは `port: *mut c_void` を `RustMediaPort` として解釈し、`read_frame`/`write_frame` を呼ぶ。

### 証拠 2: pjmedia_port 構造体は bindgen で完全に可視

```rust
pub struct pjmedia_port {
    pub info: pjmedia_port_info,
    pub port_data: pjmedia_port_port_data,
    pub grp_lock: *mut pj_grp_lock_t,
    pub get_clock_src: ...,
    pub put_frame: Option<unsafe extern "C" fn(*mut pjmedia_port, *mut pjmedia_frame) -> pj_status_t>,
    pub get_frame: Option<unsafe extern "C" fn(*mut pjmedia_port, *mut pjmedia_frame) -> pj_status_t>,
    pub on_destroy: ...,
}
```

全フィールドが利用可能。

### 証拠 3: pjsua_conf_add_port のシグネチャ

bindgen 出力:
```rust
pub fn pjsua_conf_add_port(
    pool: *mut pj_pool_t,
    desc: *const pjmedia_port,
    p_id: *mut pjsua_conf_port_id,
) -> pj_status_t;
```

`pj_pool_t` の確保が必要（`pjsua_pool_create` を使用）。

## Scope

### 1. `src/ffi/media.rs` — pjmedia_port ラッパー構築関数

```rust
/// RustMediaPort から pjmedia_port C 構造体を構築し、PJSIP conference bridge に登録する。
///
/// # SAFETY
///
/// - `port` は本関数の呼び出し期間中有効な RustMediaPort への参照でなければならない。
/// - 返された conf_port_id は disconnect まで有効。
#[cfg(feature = "pjsip")]
pub(crate) fn register_media_port(
    port: &RustMediaPort,
) -> Result<(bindings::pjsua_conf_port_id, *mut bindings::pj_pool_t), SipError> {
    unsafe {
        // 1. pj_pool_t を確保
        let pool = bindings::pjsua_pool_create(
            c"rust-media-port".as_ptr(),
            512 as pj_size_t,
            512 as pj_size_t,
        );
        if pool.is_null() {
            return Err(SipError::native_error("pjsua_pool_create failed", -1, None, None));
        }

        // 2. pjmedia_port 構造体を構築
        let mut media_port: Box<bindings::pjmedia_port> = Box::new(std::mem::zeroed());
        bindings::pjmedia_port_info_init2(
            &mut media_port.info,
            c"rust-port".as_ptr() as *mut _,
            bindings::PJMEDIA_SIG_PORT_CLASS as u32,
            0 as bindings::pjmedia_dir,
            &format, // pjmedia_format の設定
        );

        // 3. get_frame / put_frame 関数ポインタを設定
        media_port.get_frame = Some(rust_media_port_get_frame);
        media_port.put_frame = Some(rust_media_port_put_frame);

        // 4. pjsua_conf_add_port() で conference に登録
        let mut conf_port_id: bindings::pjsua_conf_port_id = 0;
        let status = bindings::pjsua_conf_add_port(pool, &mut media_port, &mut conf_port_id);
        if status != 0 {
            return Err(pj_status_to_sip_error(status, "pjsua_conf_add_port"));
        }

        // media_port のメモリをリーク（PJSIP が所有）
        let leaked = Box::into_raw(media_port);
        Ok((conf_port_id, pool))
    }
}
```

### 2. `AudioBridge::connect_to_conference()` cfg(pjsip) 実装

```rust
#[cfg(feature = "pjsip")]
pub fn connect_to_conference(&mut self) -> Result<(), SipError> {
    if self.connected {
        return Ok(());
    }
    let (capture_id, _pool) = register_media_port(&self.capture_port)?;
    let (playback_id, _pool) = register_media_port(&self.playback_port)?;

    unsafe {
        // capture → conf
        let status = bindings::pjsua_conf_connect(capture_id, bindings::PJSUA_INVALID_ID);
        if status != 0 { return Err(pj_status_to_sip_error(status, "pjsua_conf_connect capture")); }
        // conf → playback
        let status = bindings::pjsua_conf_connect(bindings::PJSUA_INVALID_ID, playback_id);
        if status != 0 { return Err(pj_status_to_sip_error(status, "pjsua_conf_connect playback")); }
    }
    self.connected = true;
    Ok(())
}
```

### 3. `AudioBridge::disconnect()` cfg(pjsip) 実装

```rust
#[cfg(feature = "pjsip")]
pub fn disconnect(&mut self) -> Result<(), SipError> {
    if !self.connected { return Ok(()); }
    // conf ポートの切断と削除
    unsafe {
        let _ = bindings::pjsua_conf_disconnect(capture_id, bindings::PJSUA_INVALID_ID);
        let _ = bindings::pjsua_conf_disconnect(bindings::PJSUA_INVALID_ID, playback_id);
    }
    self.connected = false;
    Ok(())
}
```

### 4. 既存スタブの解決

`media.rs:232` と `media.rs:257` の `[::STUB::]` マーカーを削除する。

## Non-scope

- PJSUA ランタイムを使わないユニットテスト（PJSIP 結合テストは M20-1）
- pj_pool_t のリーク管理（PJSIP のライフサイクルに任せる現状の設計）

## Test Plan

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 1 | cfg(pjsip) コンパイル検証 | 正常 | `--features pjsip` でビルド成功 |
| 2 | cfg(not pjsip) スタブ維持 | 回帰 | PJSIP なしでもビルド成功 |
| 3 | 既存テスト維持 | 回帰 | 392 passed |
| 4 | pjmedia_port レイアウト | 正常 | `PjStrRaw` と `pj_str_t` の互換性（後続） |

### ユニットテスト不可能な項目

| # | 項目 | 理由 |
|---|------|------|
| 1 | pjsua_conf_add_port 成功 | PJSIP conference bridge のランタイムが必要 |
| 2 | get_frame/put_frame の実呼び出し | 同上 |

## Acceptance Criteria

- [ ] `cargo check -p siprs --features pjsip` 成功（0 error）
- [ ] `cargo test -p siprs` 392 passed
- [ ] `media.rs:232` の `[::STUB::]` 削除
- [ ] `media.rs:257` の `[::STUB::]` 削除
- [ ] `make check-be` 成功
- [ ] `cargo fmt --check` 通過
- [ ] `node .../find-all-stubs.js crates/siprs` が 0 を返す（siprs のスタブ完全解決 🎉）
