# 実装サマリ: M1-5 — ModelRegistry 同期メソッド (registry.rs)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/ggufrs/src/registry.rs` | **修正** | ModelRegistry struct + 4メソッド + テスト5件 + STUB解決 |

## 追加した機能

| メソッド | 機能 | ロック |
|---------|------|:------:|
| `new()` | 空のレジストリ生成 | — |
| `from_config()` | ModelConfig 一括変換 | — |
| `add_model()` | モデル追加 | write |
| `list_models()` | モデル名一覧 | read |

## 検証結果

| 項目 | 結果 |
|------|------|
| `make check-ggufrs` | ✅ 0 warnings, 0 errors |
| `cargo test` | ✅ **87 passed** (+5)、0 failed |
| 品質チェック | ⚠️ 2 expect — RwLock poisoned 検出で正当 |

## スタブ解決状況

- ✅ registry.rs M1-5 STUB 解決
- ⏳ M2-2 STUB は未解決

## 残課題

M1 完了！次は M2（非同期基盤）に進むこと。
