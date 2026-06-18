# 実装サマリ: M1-2 — GpuProvider メソッド実装 (config.rs)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/ggufrs/src/config.rs` | **修正** | impl GpuProvider（3メソッド）+ テスト13件追加 |

## 追加したメソッド

| メソッド | 機能 | 戻り値例 |
|---------|------|---------|
| `detect()` | 環境変数優先→OS検出 | Metal (macOS), Cuda (env), Cpu (他) |
| `from_str(s)` | 大文字小文字不問のパース | `Some(Metal)`, `None` |
| `mistralrs_feature()` | feature flag 名 | `"metal"`, `"cuda"`, `""` |

## 検証結果

| 検証項目 | 結果 |
|---------|------|
| `make check-ggufrs` | ✅ 通過 (0 warnings, 0 errors) |
| `cargo test` (ggufrs) | ✅ **70 passed** (+13), 0 failed |
| 品質チェック | ✅ 24 unwrap（テストコード内で正当） |

## 残課題

次は M1-3（GgufError From トレイト実装）に進むこと。
