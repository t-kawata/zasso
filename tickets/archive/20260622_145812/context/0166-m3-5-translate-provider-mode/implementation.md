# M3-5: Translate provider mode — 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `src/provider/translate.rs` | **新規** | handle_translate — スタブ実装（llm-bridge-core API 調査後に本実装） |
| `src/provider/mod.rs` | 修正 | pub mod translate; 追加 |
| `src/http/routes.rs` | 修正 | [::STUB::] → handle_translate 呼び出し |
| `Cargo.toml` | 修正 | llm-bridge-core 0.2.6 追加（optional, server feature） |

## 解決したスタブ
- routes.rs:142 — Translate mode の [::STUB::] ✅ 解決（handle_translate() 呼び出しに置き換え）

## 残存スタブ（translate.rs 内部）
- translate.rs:4,19 — llm-bridge-core API の本実装待ち

## テスト結果
| 条件 | 単体テスト | 結果 |
|------|-----------|------|
| default features | **138 passed** | ✅ |
| --no-default-features | **95 passed** | ✅ |
