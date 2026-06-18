# 実装サマリ: macOS prebuilt PJSIP の TLS バックエンド切替

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `vendor/pjsip/pjlib/CMakeLists.txt` | 修正 | macOS で OpenSSL/GnuTLS/mbedTLS の SSL バックエンドソースをビルド対象から除外。Apple Security Framework のみを使用 |
| `vendor/prebuilt/aarch64-apple-darwin/lib/*.a` | 差替 | CMake で再ビルドした 18 の static library（SRTP_WITH_OPENSSL=OFF） |
| `vendor/prebuilt/aarch64-apple-darwin/lib.bak/` | 新規 | 旧 prebuilt のバックアップ |
| `vendor/prebuilt/BUILD.md` | 新規 | prebuilt 再ビルド手順のドキュメント |
| `build.rs` | 修正 | macOS フレームワークリンク強化（Security 常時リンク、CoreServices・AudioToolbox 追加） |

## 検証結果

| チェック | 結果 |
|---------|------|
| OpenSSL シンボル消失（nm 確認） | ✅ 全 18 ライブラリで 0 symbols |
| `cargo check --features pjsip` | ✅ |
| `cargo test --lib` | ✅ 392 passed |
| 統合テストバイナリリンク | ✅ |
| 統合テスト一覧表示 | ✅ 15 tests listed |
| 旧 prebuilt バックアップ | ✅ vendor/prebuilt/.../lib.bak/ |

## フレームワーク（macOS）

CoreAudio / CoreFoundation / CoreServices / AudioToolbox / Security
全フレームワークは macOS 標準搭載。OpenSSL 不要。
