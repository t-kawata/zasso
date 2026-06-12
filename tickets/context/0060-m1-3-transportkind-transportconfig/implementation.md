# Implementation: M1-3 TransportKind / TransportConfig 定義

## 変更ファイル一覧

| ファイル | 種別 | 行数 | 内容 |
|----------|------|------|------|
| crates/siprs/src/transport.rs | 新規 | 360行 | TransportKind + TransportConfig + 設定型 全定義 + 21 tests |
| crates/siprs/src/lib.rs | 修正 | +1行 | pub mod transport; 追加 |
| crates/siprs/Cargo.toml | 修正 | +1行 | tls = [] feature 追加 |

## 実装内容

### transport.rs 主要構成

1. **TransportKind** — Udp / Tcp / Tls(`#[cfg(feature = "tls")]`), as_str(), Display
2. **UdpTransportConfig** / **TcpTransportConfig** — bind_addr: SocketAddr, new()
3. **TlsConfig** (`#[cfg(feature = "tls")]`) — verify_server, ca_cert_path, client_cert_path, client_key_path, server_name, allow_insecure_cipher_legacy, new() / default_verified() / insecure()
4. **TlsTransportConfig** (`#[cfg(feature = "tls")]`) — bind_addr + TlsConfig
5. **TransportConfig** — Udp / Tcp / Tls(`#[cfg(feature = "tls")]`), udp(port) / tcp(port) / tls(port, tls), bind_addr(), kind()
6. **21 テスト**（14 通常 + 7 `#[cfg(feature = "tls")]` 条件付き）

### 設計判断
- TLS 型は `#[cfg(feature = "tls")]` で完全 conditional compilation
- `TlsConfig::new()` の 6 引数は quality check で指摘されたが、RFC §12 の全フィールドを直接マッピングする意図的な設計（builder は over-engineering）
- TLS 条件付きテストは `#[cfg(feature = "tls")] mod tls_tests` で分離
- 全 match 式で TLS variant を `#[cfg(feature = "tls")]` ガードし、feature 無効時のコンパイルを保証

## ビルド・テスト結果

### TLS 無効（デフォルト）
- cargo build → ✅ OK
- cargo test → ✅ 70 unit + 1 doc-test = 71 passed
- cargo clippy -- -D warnings → ✅ OK

### TLS 有効（--features tls）
- cargo build → ✅ OK
- cargo test → ✅ 77 unit + 1 doc-test = 78 passed
- cargo clippy --features tls -- -D warnings → ✅ OK

### Quality Checks
- run-quality-checks.js: 1 issue（TlsConfig::new の 6 引数 → RFC 準拠の意図的設計、許容範囲）
- 翻訳可能性: 全関数が動詞句、unwrap/expect/dbg なし
