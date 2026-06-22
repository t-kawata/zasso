---
ticket_id: 142
title: "PJSIP 2.17 source integration + FFI stub resolution"
slug: pjsip-217-source-integration-ffi-stub-resolution
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0142-pjsip-217-ffi/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0142-pjsip-217-ffi/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0142-pjsip-217-ffi/review.md
---
# PJSIP 2.17 source integration + FFI stub resolution

## Summary

PJSIP 2.17 のソースコードを `crates/siprs/vendor/pjsip/` に配置し（.git 除去済み）、
`cargo build -p siprs --features pjsip` で実際の CMake ビルド + bindgen バインディング生成 +
PJSIP リンクが一貫して動作する状態にする。さらに、PJSIP 不在のために `todo!()` のまま
保留されていた FFI 実装（PjsuaBackend 14 メソッド、AudioBridge conf_connect/disconnect）を
実際の PJSUA C API 呼び出しで実装し、テストを通過させる。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§27, §28, §39)

## Background

### なぜ必要か

M19-1 の spec では「PJSIP ソースの自動ダウンロードは Non-scope」とし、「実際の PJSUA API
呼び出しは別チケット」として保留した。しかし、PJSIP 不在で `todo!()` のまま残された
以下のコードは、PJSIP ソースが配置された時点で解決可能になる：

1. **PjsuaBackend 全 14 メソッド** — `#[cfg(feature = "pjsip")]` ブロック内で `todo!()`
2. **AudioBridge::connect_to_conference()** — `pjsua_conf_add_port()` + `pjsua_conf_connect()`
3. **AudioBridge::disconnect()** — `pjsua_conf_disconnect()`
4. **build.rs のリンク設定** — 実 PJSIP ライブラリ名と cmake 出力構造に合わせた調整

また M19-1 の `.gitignore` は `vendor/pjsip/` を git 除外対象としており、
「ソースコードを zasso の git 管理下に置く」という本チケットの要件と矛盾している。

### 調査で判明した事実

1. **PJSIP 2.17 の cmake ビルドは正常動作する**: cmake configure + build が [100%] 成功
2. **ライブラリ命名が build.rs の想定と異なる**: `libpj.a` ではなく `libpjlib.a`
3. **cmake の出力構造はフラットではない**: ライブラリがサブディレクトリ（`pjlib/`, `pjmedia/` 等）に分散
4. **追加のリンク必須ライブラリが存在する**: `pjsua-lib`, `pjmedia-audiodev`, `pjmedia-codec`, `pjsip-ua`, `speex` 等

## Investigation

### 証拠 1: PJSIP 2.17 の cmake ビルド成功

```bash
$ PROJECT_ROOT=$(git rev-parse --show-toplevel)
$ PJSIP_DIR="$PROJECT_ROOT/crates/siprs/vendor/pjsip"
$ cmake -B "$PJSIP_DIR/build" -S "$PJSIP_DIR" \
    -DPJMEDIA_WITH_VIDEO=OFF \
    -DPJ_HAS_SSL=OFF \
    -DPJMEDIA_HAS_SRTP=OFF
-- Configuring done
-- Generating done
$ cmake --build "$PJSIP_DIR/build" -j$(sysctl -n hw.logicalcpu)
[100%] Built target pjsua2-test
```

- CMake configure: 成功（9.6s）
- CMake build: 成功（全ターゲット [100%]）
- CoreAudio 自動検出 ✅（macOS システムフレームワーク）
- OpenSSL 検出 ✅（GCM サポート）
- OPUS 未検出 ⚠（`brew install opus` で解決可能、後続対応）
- `PJMEDIA_WITH_VIDEO=OFF` 確認済み

### 証拠 2: 実際のライブラリ名

cmake ビルドで生成される静的ライブラリ:

| ライブラリファイル | build.rs 内の想定名 | 判定 |
|---|---|---|
| `libpjlib.a` | `pj` | ❌ `pjlib` が正解 |
| `libpjlib-util.a` | `pjlib-util` | ✅ |
| `libpjmedia.a` | `pjmedia` | ✅ |
| `libpjnath.a` | `pjnath` | ✅ |
| `libpjsip.a` | `pjsip` | ✅ |
| `libpjsua2.a` | `pjsua2` | ✅ |
| `libresample.a` | `resample` | ✅ |

追加で必要なライブラリ:
- `pjsua-lib`（pjsua C API — コア機能）
- `pjmedia-audiodev`（音声デバイス抽象化）
- `pjmedia-codec`（コーデック）
- `pjsip-ua`（SIP User Agent）
- `pjsip-simple`（SIP SIMPLE）
- `speex`（AEC）
- `srtp`（SRTP、後続対応）
- `gsm`, `g7221`, `ilbc`（third_party コーデック）

### 証拠 3: .gitignore が vendor/pjsip/ を除外している

```gitignore
# PJSIP ソースコード（開発者が手動配置）
vendor/pjsip/
```

本チケットの要件（zasso の git 管理下に pjsip ソースを含める）と矛盾するため、
`.gitignore` から `vendor/pjsip/` 行を削除し、代わりに `vendor/pjsip/.github/` など
不要なディレクトリのみを除外する。

### 証拠 4: cmake crate の出力構造の課題

`cmake::Config::new("vendor/pjsip").build()` は PJSIP に `cmake --install` ターゲットが
ない場合に失敗する可能性がある。確実な動作のため、cmake crate は使用せず
`std::process::Command` で直接 cmake を呼び出し、ライブラリ探索は `find` ベースで行う。

### 証拠 5: bindgen の clang include パスの課題

PJSIP cmake ビルド後、ヘッダファイルは以下の場所に分散する:
- `vendor/pjsip/pjlib/include/`
- `vendor/pjsip/pjmedia/include/`
- `vendor/pjsip/pjsip/include/`
- `vendor/pjsip/build/pjlib/include/`（cmake 生成の autoconf 互換ヘッダ）
- `vendor/pjsip/build/pjmedia/include/`
- `vendor/pjsip/build/pjsip/include/`

bindgen にこれらのパスを全て渡す必要がある。

### 証拠 6: 未実装 todo!() メソッド一覧

**`ffi/pjsua_backend.rs` — cfg(pjsip) ブロック内:**

```rust
// 14 メソッド全てが todo!()
todo!("PjsuaBackend::initialize")     // pjsua_create → pjsua_init → pjsua_start
todo!("PjsuaBackend::shutdown")       // pjsua_destroy
todo!("PjsuaBackend::create_transport") // pjsua_transport_create
todo!("PjsuaBackend::add_account")    // pjsua_acc_add
todo!("PjsuaBackend::remove_account") // pjsua_acc_del
todo!("PjsuaBackend::set_registration") // pjsua_acc_set_registration
todo!("PjsuaBackend::make_call")      // pjsua_call_make_call
todo!("PjsuaBackend::answer_call")    // pjsua_call_answer
todo!("PjsuaBackend::hangup")         // pjsua_call_hangup
todo!("PjsuaBackend::conf_connect")    // pjsua_conf_connect
todo!("PjsuaBackend::conf_disconnect") // pjsua_conf_disconnect
todo!("PjsuaBackend::configure_codecs") // pjsua_codec_set_priority
todo!("PjsuaBackend::send_dtmf")      // pjsua_call_dial_dtmf
todo!("PjsuaBackend::transfer_call")  // pjsua_call_xfer
```

**`ffi/media.rs` — cfg(pjsip) ブロック内:**

```rust
// TODO: pjsua_conf_add_port() / pjsua_conf_connect() を呼び出す
// TODO: pjsua_conf_disconnect() を呼び出す
```

## Scope

### 1. `.gitignore` 修正

`vendor/pjsip/` の除外行を削除。代わりに `vendor/pjsip/.github/` など不要なメタデータのみ除外。
これにより PJSIP ソースが zasso の git 管理下に入る。

### 2. `build.rs` 修正（リンク設定の実 PJSIP 対応）

**必須ライブラリリストの修正:**

```rust
fn required_libraries() -> &'static [&'static str] {
    &[
        // PJSIP core
        "pjsua2", "pjsua-lib", "pjsip", "pjsip-ua", "pjsip-simple",
        // Media
        "pjmedia", "pjmedia-audiodev", "pjmedia-codec",
        // NAT
        "pjnath",
        // Utility
        "pjlib", "pjlib-util",
        // Third party
        "resample", "speex",
        // Codec backends
        "gsm", "g7221", "ilbc",
    ]
}
```

**cmake ビルド方式の変更:**

cmake crate は使わず `std::process::Command` で直接 cmake を呼び出す。
ビルド成功後、`find` で `.a` ファイルを収集し、フラットな `lib/` ディレクトリに
シンボリックリンクまたはコピーを作成してから `emit_link_directives` を出力する。

```rust
fn build_pjsip_from_source(src_dir: &Path, build_dir: &Path) -> Result<(), Box<dyn Error>> {
    // 1. cmake configure
    run_cmake_configure(src_dir, build_dir)?;
    // 2. cmake build
    run_cmake_build(build_dir)?;
    // 3. ライブラリ収集: find *.a → flat lib/
    collect_libraries(build_dir, &build_dir.join("lib"))?;
    Ok(())
}
```

**bindgen include パスの拡張:**

```rust
fn collect_clang_args(src_dir: &Path, build_dir: &Path) -> Vec<String> {
    // vendor/pjsip/pjlib/include/ などソースの include ディレクトリ
    // build/pjlib/include/ など cmake 生成の autoconf ヘッダ
    // PJSIP_INCLUDE_DIR 環境変数
}
```

### 3. `ffi/pjsua_backend.rs` — 実 PJSUA FFI 呼び出し

`#[cfg(feature = "pjsip")]` ブロック内の全 14 メソッドを実際の PJSUA C API 呼び出しで実装する。

**実装パターン（各メソッド共通）:**

```rust
fn initialize(&mut self, _config: &ClientConfig) -> Result<ClientCapabilities, SipError> {
    // 1. 定数参照: pjsua.h の PJSUA_INVALID_ID 等は bindings 経由で利用
    // 2. pjsua_create(): PJSUA インスタンス作成
    // 3. pjsua_init(&pjsua_config, &pjsua_logging_config, &pjsua_media_config)
    // 4. pjsua_start()
    // 5. 成功時: ClientCapabilities を返す
    // エラー時: pj_status_to_sip_error() で変換
}
```

**各メソッドの呼び出す C API:**

| メソッド | PJSUA C API | 備考 |
|---|---|---|
| `initialize` | `pjsua_create()` → `pjsua_init()` → `pjsua_start()` | 要 pjsua_config 構築 |
| `shutdown` | `pjsua_destroy()` | idempotent |
| `create_transport` | `pjsua_transport_create()` | UDP/TCP/TLS 選択 |
| `add_account` | `pjsua_acc_add_local()` or `pjsua_acc_add()` | アカウント追加 |
| `remove_account` | `pjsua_acc_del()` | idempotent |
| `set_registration` | `pjsua_acc_set_registration()` | ON/OFF 切替 |
| `make_call` | `pjsua_call_make_call()` | 発信 |
| `answer_call` | `pjsua_call_answer()` | 応答（code 指定） |
| `hangup` | `pjsua_call_hangup()` | 切断 |
| `conf_connect` | `pjsua_conf_connect()` | conference 接続 |
| `conf_disconnect` | `pjsua_conf_disconnect()` | conference 切断 |
| `configure_codecs` | `pjsua_codec_set_priority()` | PCMU=255, Opus=254, 他=0 |
| `send_dtmf` | `pjsua_call_dial_dtmf()` | RFC 2833 または SIP INFO |
| `transfer_call` | `pjsua_call_xfer()` | REFER 転送 |

**エラー処理:** 各 API 呼び出しの戻り値 `pj_status_t` を `pj_status_to_sip_error()` で変換。
`PJ_SUCCESS(0)` 以外はエラーとして扱う。

### 4. `ffi/media.rs` — AudioBridge conf_connect/disconnect 実装

`#[cfg(feature = "pjsip")]` ブロック内の `connect_to_conference()` と `disconnect()` を
実際の PJSIP API 呼び出しに置き換える:

```rust
#[cfg(feature = "pjsip")]
pub fn connect_to_conference(&mut self) -> Result<(), SipError> {
    if self.connected { return Ok(()); }
    // SAFETY: PJSUA conference port API の不変条件に従う
    unsafe {
        let capture_id = pjsua_conf_add_port(/* capture_port */)?;
        let playback_id = pjsua_conf_add_port(/* playback_port */)?;
        pjsua_conf_connect(capture_id, PJSUA_INVALID_ID)?;
        pjsua_conf_connect(PJSUA_INVALID_ID, playback_id)?;
    }
    self.connected = true;
    Ok(())
}
```

**注意:** `RustMediaPort` を `pjmedia_port` として登録するには `pjmedia_port` 構造体の
構築が必要。この構造体には `get_frame` / `put_frame` 関数ポインタが含まれる。
extern "C" 関数 `rust_media_port_get_frame` / `rust_media_port_put_frame` は M18-1 で
既に定義済み。

### 5. `vendor/.gitignore` 更新

```gitignore
# PJSIP ソースコード（zasso git で管理 — 削除しない）
# vendor/pjsip/  ← この行を削除

# PJSIP の GitHub メタデータは不要
vendor/pjsip/.github/

# cmake build ディレクトリは除外
vendor/pjsip/build/

# Prebuilt バイナリ
vendor/prebuilt/*/
```

### 6. 既存 stub の再評価

`find-all-stubs.js` で検出される 11 件のうち、本チケットで解決するもの:

| スタブ | 状態 | 対応 |
|--------|------|------|
| `build.rs:124`（生成ファイル内） | 本チケットで解決 | PJSIP 存在時は実バインディング、不在時もスタブ維持 |
| `pjsua_backend.rs`（14 todo!()） | ✅ 解決 | 実 PJSUA FFI 呼び出しに置き換え |
| `media.rs` cfg(pjsip) ブロック | ✅ 解決 | 実 conf API 呼び出しに置き換え |
| 他 8 件（mixer/worker/client/callbacks） | 継続保留 | 各マイルストーンで解決予定 |

## Non-scope

- **M16-1 (AudioWorker 統合)**: mixer/worker/client の AudioWorker 関連スタブは本チケットで触らない
- **M16-3 (subscribe_audio)**: フォーマット変換統合は本チケットで触らない
- **M17-2 (rubato resampler)**: リサンプラ実装は本チケットで触らない
- **M17-4 (callback event extraction)**: callbacks.rs の state/info 抽出は本チケットで触らない
- **M19-2 (feature flags)**: TLS/SRTP feature flag のコード適用は本チケットで触らない
- **M19-3 (metrics)**: metrics カウンター実装は本チケットで触らない
- **Opus コーデック**: PJSIP が `brew install opus` を必要とするが、PCMU のみで動作検証可能
- **実際の SIP サーバとの結合試験**: M20-1 のスコープ
- **pjsua_callback の完全実装**: callback bridge（M17-3）の extern "C" callback は実装済み。
  `on_incoming_call` 等の PJSUA への実際の登録は本チケットの範囲だが、callback 内部の
  イベント変換ロジックは既存の `enqueue_native_event` を流用する

## Test Plan

### ユニットテスト計画

#### build.rs テスト（手動検証）

| # | 検証内容 | コマンド | 期待結果 |
|---|---------|---------|---------|
| 1 | PJSIP なしビルド | `cargo check -p siprs` | スタブバインディング成功 |
| 2 | PJSIP ありビルド | `cargo check -p siprs --features pjsip` | PJSIP リンク + 実バインディング成功 |
| 3 | リンク指示確認 | ↑ の `-vv` 出力 | 全必須ライブラリが `rustc-link-lib` に含まれる |
| 4 | bindgen 実バインディング | ↑ の OUT_DIR | `pjsua_create` 等の関数宣言が存在 |

#### 既存 390 テストの維持

```bash
cargo test -p siprs
# → 既存 390 テスト + 新規テストが全て通過
```

#### 新規テスト: cfg(pjsip) コンパイル検証

`#[cfg(feature = "pjsip")]` ブロックのメソッドがコンパイル可能であることの検証。
実際の PJSUA 起動は伴わないため、`pjsua_create` 失敗で早期 return する:

```rust
#[cfg(feature = "pjsip")]
#[test]
fn test_pjsua_backend_initialize_compiles() {
    // PJSIP が利用可能な環境でのみ実行
    // pjsua_create() が呼び出せることの確認（成功は期待しない）
    let mut backend = PjsuaBackend::new();
    let config = ClientConfig::default();
    let result = backend.initialize(&config);
    // PJSIP ライブラリがリンクされていれば pjsua_create が呼び出せる
    assert!(result.is_ok() || result.is_err());
}
```

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | `pjsua_create` → `pjsua_init` → `pjsua_start` 成功 | PJSIP ランタイムが必要。SIP サーバとの結合試験は M20-1 |
| 2 | 実際の SIP 発信/着信 | SIP サーバが必要。M20-1 で E2E |
| 3 | conference bridge 統合の動作確認 | PJSIP ランタイム + メディアストリームが必要 |
| 4 | Windows/Ubuntu でのビルド確認 | CI 環境が必要（M20） |
| 5 | Opus コーデック統合 | `brew install opus` が別途必要 |

## Boy Scout Rule — 翻訳可能性計画

### 改善対象

1. **`pjsua_backend.rs` の cfg(pjsip) ブロック**: `todo!()` を実際の FFI 呼び出しに
   置き換えることで、「PJSIP を初期化する」「アカウントを追加する」「発信する」という
   一文として読めるようになる。

2. **`required_libraries()` の拡充**: ライブラリ名の実態に合わせて修正し、
   「どの PJSIP ライブラリをリンクするか」がコードから明白になる。

3. **`build_pjsip_from_source()` の明確化**: cmake ビルド・ライブラリ収集・ヘッダ収集の
   三段階をそれぞれ関数化し、`main()` から呼び出す構造により処理の流れが追跡可能になる。

## Acceptance Criteria

- [ ] `vendor/pjsip/` が `.gitignore` で除外されていないこと（zasso git 管理下）
- [ ] `cargo check -p siprs`（PJSIP なし）が成功し、スタブバインディングが生成されること
- [ ] `cargo check -p siprs --features pjsip`（PJSIP あり）が成功し、PJSIP ライブラリがリンクされること
- [ ] `cargo test -p siprs`（PJSIP なし）が全テスト通過すること（390 テスト維持）
- [ ] `cargo test -p siprs --features pjsip`（PJSIP あり）が全テスト通過すること
- [ ] `pjsua_backend.rs` の cfg(pjsip) ブロックが `todo!()` ではなく実 PJSUA FFI 呼び出しで実装されていること
- [ ] `media.rs` の cfg(pjsip) ブロックの `connect_to_conference()` / `disconnect()` が実 PJSUA API で実装されていること
- [ ] `make check-be` 成功（プロジェクト全体への影響なし）
- [ ] `make test` 成功
- [ ] `cargo fmt --check` 通過
- [ ] `vendor/pjsip/` の `.git` ディレクトリが削除されていること（サブモジュール化防止）

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M17-1 (#131) | 先行: bindgen 設定済み（本チケットで PJSIP ヘッダ利用） |
| M17-3 (#133) | 先行: callback bridge + enqueue_native_event 実装済み |
| M17-4 (#138) | 先行: PjsuaBackend 骨格 + pj_status_t 変換実装済み |
| M18-1 (#139) | 先行: RustMediaPort + extern "C" get_frame/put_frame 実装済み |
| M18-2 (#140) | 先行: AudioBridge 骨格実装済み |
| M19-1 (#141) | 先行: build.rs 三段階フロー実装済み（本チケットでリンク設定修正） |
| M19-2 (未作成) | 後続: feature flags |
| M19-3 (未作成) | 後続: metrics |
| M20-1 (未作成) | 後続: 結合テスト（E2E SIP サーバ） |

### clang include パス

PJSIP の cmake ビルド後、bindgen に以下の include パスを渡す必要がある:

```
-Ivendor/pjsip/pjlib/include
-Ivendor/pjsip/pjlib-util/include
-Ivendor/pjsip/pjmedia/include
-Ivendor/pjsip/pjnath/include
-Ivendor/pjsip/pjsip/include
-Ivendor/pjsip/build/pjlib/include      # cmake 生成の autoconf 互換ヘッダ
-Ivendor/pjsip/build/pjmedia/include
-Ivendor/pjsip/build/pjsip/include
```

これらのパスは `collect_clang_args()` で動的に収集する。

### リンク順序の重要性

静的リンクでは依存の逆順（ボトムアップ）でライブラリを指定する必要がある。
macOS の linker は左から右にシンボルを解決するため、依存されるライブラリを先に、
依存するライブラリを後に指定する:

```text
speex → resample → gsm → g7221 → ilbc
  → pjlib → pjlib-util
  → pjnath
  → pjmedia → pjmedia-audiodev → pjmedia-codec
  → pjsip → pjsip-simple → pjsip-ua
  → pjsua-lib
  → pjsua2
```
