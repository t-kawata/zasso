# M1-1 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/src/lib.rs` | 修正 | `impl RestartPolicy` ブロック追加（on_crash_default + next_delay）+ 9テスト追加 |

## 実装したメソッド

| メソッド | 可視性 | 内容 |
|---------|--------|------|
| `on_crash_default()` | `pub` | OnCrash { 3, 1s, 2.0, 30s } を返す静的コンストラクタ |
| `next_delay(attempt)` | `pub(crate)` | `initial_delay * factor^attempt` を計算、max_delay でクランプ |

## 検証結果

- `cargo check`: 警告ゼロで通過
- `cargo test`: 41/41 通過（既存32 + M1-1:9、0.00s）
- 品質チェック: issue 0
- 翻訳可能性 grep: 問題なし
- 既存コードへの影響: なし（impl ブロック追加 + テスト追加のみ）
