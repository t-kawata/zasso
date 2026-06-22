---
ticket_id: 151
title: macOS prebuilt PJSIP の TLS バックエンドを Apple Security Framework に切り替え
slug: macos-prebuilt-pjsip-tls-apple-security-framework
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: |
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0151-macos-prebuilt-pjsip-tls-apple-security-framework/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0151-macos-prebuilt-pjsip-tls-apple-security-framework/review.md
---

# macOS prebuilt PJSIP の TLS バックエンドを Apple Security Framework に切り替え

## Summary

macOS 向け prebuilt PJSIP ライブラリ（`vendor/prebuilt/aarch64-apple-darwin/lib/*.a`）を、
OpenSSL バックエンドから Apple Security Framework バックエンドに切り替えて再ビルドする。

これにより、macOS 上で `features = "pjsip"` を使用する際に OpenSSL のインストールが不要になり、
統合テストバイナリ（#150）のリンクが正常に動作するようになる。

## Background

現在の macOS 向け prebuilt PJSIP は OpenSSL バックエンドでビルドされているため、
`--features pjsip` で統合テストバイナリをリンクする際に OpenSSL のシンボル
（`SSL_*`, `X509_*`, `EVP_*`, `BIO_*`, `PEM_*`, `ERR_*`, `EC_*`, `ASN1_*` 等）が
未解決となり、リンクに失敗する。これは macOS に OpenSSL が標準搭載されていないためである。

PJSIP は macOS 向けに Apple Security Framework（macOS 標準搭載）を TLS バックエンドとして
選択できる。実際、現在の prebuilt 内にも `ssl_sock_apple.m.o` が含まれており、
Apple バックエンドのソースコード自体はコンパイルされている。しかし OpenSSL バックエンド
（`ssl_sock_ossl.c.o`）も同時に含まれているため、静的リンク時に OpenSSL が要求される。

## Scope

1. PJSIP 2.17 を Apple Security Framework バックエンドで macOS 向けにビルドする手順の確立
2. 再ビルドした `.a` ファイルで `vendor/prebuilt/aarch64-apple-darwin/lib/` を更新
3. `build.rs` の macOS 用 TLS リンク設定を確認・修正（既存の Security.framework リンクで十分か検証）
4. 統合テストバイナリのリンクが通ることを確認

## Non-scope

- **Linux prebuilt の変更**: Linux は OpenSSL バックエンドのまま（`-lssl -lcrypto` は Linux では問題なく利用可能）
- **Windows prebuilt の変更**: 本チケットでは対象外
- **source build fallback の改善**: source build が整備されている場合の設定は別チケット
- **`build.rs` の大規模リファクタリング**: リンク設定の確認と必要最小限の修正に留める
- **CI/CD パイプラインへの prebuilt 自動ビルド追加**: 手動ビルド手順の確立まで

## Investigation

### 証拠 1: リンクエラーの再現

```bash
$ cargo test --features pjsip -- --ignored --list
# → エラー: linking with `cc` failed
```

OpenSSL シンボル不足によるリンク失敗。具体的な未解決シンボル:

```
_X509_get_subject_name
_X509_get_serialNumber
_X509_get_version
_X509_getm_notAfter
_X509_getm_notBefore
_X509_up_ref
_SSL_CTX_new
_SSL_new
_SSL_read
_SSL_write
_EVP_CipherInit_ex
_EVP_DigestUpdate
...（数百の OpenSSL シンボル）
```

### 証拠 2: prebuilt に含まれる TLS バックエンドの実態

```bash
$ nm -u vendor/prebuilt/aarch64-apple-darwin/lib/libpjsua-lib.a | grep '\.o:'
# → 以下の TLS バックエンドが全て含まれている
```

| オブジェクトファイル | バックエンド | macOS 標準 | 現状のリンク対象 |
|-------------------|------------|-----------|----------------|
| `ssl_sock_apple.m.o` | Apple Security Framework | ✅ | ✅（コンパイルされる）|
| `ssl_sock_ossl.c.o` | OpenSSL | ❌ | ✅（問題の原因）|
| `ssl_sock_gtls.c.o` | GnuTLS | ❌ | ✅（未使用）|
| `ssl_sock_mbedtls.c.o` | mbedTLS | ❌ | ✅（未使用）|

PJSIP の configure で TLS バックエンドを明示しない場合、デフォルトで OpenSSL が選択される。
macOS 向けには `--with-apple-core-audio --with-apple-security` を指定する必要がある。

### 証拠 3: Apple バックエンド以外の脆弱な依存は存在しない

全未解決シンボルを調査した結果、OpenSSL 以外の外部依存は以下の通りであり、
全て macOS に標準搭載されている:

| カテゴリ | シンボル例 | 提供元 | macOS 標準 |
|---------|-----------|-------|-----------|
| CoreAudio | `AudioComponent*`, `AudioUnit*`, `AudioConverter*` | システムフレームワーク | ✅ |
| CoreFoundation | `CFRunLoop*`, `CFRelease`, `CFString*`, `CFUUID*` | システムフレームワーク | ✅ |
| POSIX/libc | `malloc`, `memcpy`, `socket`, `pthread_*` | システム標準 | ✅ |
| SRTP 暗号 | `srtp_*` | ライブラリ内蔵 | ✅（静的リンク）|
| OpenSSL | `SSL_*`, `X509_*`, `EVP_*`, `BIO_*`, `PEM_*`, `ERR_*`, `EC_*`, `ASN1_*` | **外部要インストール** | **❌** |

### 証拠 4: 現在の build.rs の macOS TLS リンク設定

```rust
// build.rs:66-68
if cfg_enabled("tls") {
    println!("cargo:rustc-link-lib=framework=Security");
}
```

`tls` feature 有効時、Security.framework はリンクされる。Apple バックエンドでビルドし直せば、
OpenSSL のシンボルが存在しなくなるため、この設定のみで十分となる。

### 証拠 5: prebuilt の現状確認

```bash
$ ls vendor/prebuilt/aarch64-apple-darwin/lib/*.a
# 19 個の static library が存在
```

再ビルド時は同じ 19 ライブラリを全て置き換える必要がある。

## Test Plan

### ユニットテスト計画

本チケットの成果物は prebuilt ライブラリの差し替えであるため、ユニットテストの対象は以下:

| テスト | 内容 | 種別 |
|-------|------|------|
| `cargo check -p siprs --features pjsip` | pjsip feature 有効時のコンパイル確認 | コンパイルテスト |
| `cargo test -p siprs --lib` | 既存 392 テストの通過確認 | 回帰テスト |
| `cargo test -p siprs --features pjsip -- --ignored --test-threads=1` | 統合テストバイナリのリンク + 実行確認 | 結合テスト |
| `nm -u vendor/prebuilt/aarch64-apple-darwin/lib/*.a \| grep -c 'SSL_\|X509_\|EVP_'` | OpenSSL シンボルが prebuilt から消えたことの確認 | 静的検証 |

### ユニットテスト不可能な項目（例外）

- prebuilt ライブラリのビルド自体: 外部ビルドツールチェイン（PJSIP configure/make）に依存。CI での自動化は別チケット
- 実際の TLS ハンドシェイクの検証: 実 SIP サーバとの結合試験（M20-2）でカバー

## Boy Scout Rule — 翻訳可能性計画

本チケットで変更するファイル:
- `build.rs`: 関数名は動詞句（`emit_platform_link_directives` 等）、ハードコード値なし、コメントは「なぜ」を説明
- prebuilt ライブラリ: バイナリファイルのため翻訳可能性の対象外

既存の `build.rs` は翻訳可能性要件を満たしている。本チケットではスコープ外の修正は不要。

## Acceptance Criteria

- [ ] macOS 上で `cargo check -p siprs --features pjsip` が成功する（現状維持）
- [ ] `cargo test -p siprs --lib` が 392 passed（現状維持）
- [ ] Apple Security Framework バックエンドで再ビルドした prebuilt に差し替え後、`cargo test -p siprs --features pjsip -- --ignored --test-threads=1` で統合テストバイナリのリンクが成功する
- [ ] 再ビルド後の prebuilt から OpenSSL シンボル（`SSL_*`, `X509_*`, `EVP_*` 等）が消失したことを `nm` で確認する
- [ ] prebuilt 再ビルド手順をドキュメント化する（`vendor/prebuilt/README.md` または `BUILD.md`）
