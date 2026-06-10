# M0-1 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/Cargo.toml` | 新規作成 | package 定義 (name=process-registry, edition=2021)。依存クレートなし |
| `crates/procreg/src/lib.rs` | 新規作成 | 4純粋データ型 + 日本語 doc コメント + 13ユニットテスト |

## 実装した型

- `ProcessDef` — プロセス定義（8フィールド、Clone + Debug）
- `RestartPolicy` — 再起動ポリシー（Never / OnCrash / Always、Clone + Debug + PartialEq）
- `ReadyCondition` — 起動完了条件（Immediate / Delay / LogContains / TcpPort、Clone + Debug）
- `ShutdownTimeoutConfig` — シャットダウンタイムアウト設定（2フィールド + Default impl）

## 検証結果

- `cargo check`: 警告ゼロで通過
- `cargo test`: 13/13 通過（0.00s）
- 品質チェック: issue 0
- 翻訳可能性 grep: 問題なし
- メインプロジェクト（src-tauri）: 影響なし

## 計画との一致

実装は計画通り。スコープ外の serde, tokio, thiserror, petgraph 等の依存は一切追加していない。
