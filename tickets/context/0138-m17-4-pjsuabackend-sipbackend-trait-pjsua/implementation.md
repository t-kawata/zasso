# M17-4: PjsuaBackend — 実装サマリ

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/ffi/pjsua_backend.rs` | 新規 | PjsuaBackend struct + pj_status_to_sip_error + CODEC_PRIO定数 + #[cfg]切替実装 + 7テスト |
| `src/ffi/mod.rs` | 変更 | `#[cfg(any(feature="pjsip", test))] pub mod pjsua_backend;` |
| `src/runtime/reactor.rs` | 変更 | 全18 RuntimeCommandのdispatch実装（ID mapping + backend呼び出し） |
| `Cargo.toml` | 変更 | [features] に pjsip = [] 追加 |

## 検証結果
- ✅ `cargo check -p siprs` — 成功
- ✅ `cargo test` — 376 PASS（369→376、+7 テスト）
- ✅ `make check` / `make test` — 14 PASS
- ✅ 品質チェック — 0 issues
- ✅ `cargo fmt` — 通過

## 主要コンポーネント
1. **PjsuaBackend struct** — cfg切替でPJSIP有無に対応
2. **pj_status_to_sip_error** — 主要エラーコード（PJ_EBUSY/-1, PJ_ETIMEDOUT/-2, PJ_EINVAL/-3）をSipErrorに変換
3. **CODEC_PRIO定数** — PCMU=255, Opus=254, 他=0
4. **reactor dispatch** — 全18コマンドをbackend + ClientState経由で処理
   - audio関連4コマンドは M18 保留（エラー通知のみ）
   - それ以外は全コマンドで RuntimeId ↔ NativeId の変換を実装
5. **cfg制御** — feature="pjsip" で本番実装、それ以外は stub（unimplemented!）

## 既知の制約
- PJSIP FFI 呼び出し（pjsua_create / pjsua_init 等）は M19-1 まで stub
- コメントアウトした `#[cfg(feature = "pjsip")]` の本番実装は M19-1 で有効化
- reactor の audio source 系コマンドは M18 に委譲
- callback bridge の NativeEvent 実連携は M19-1 以降
