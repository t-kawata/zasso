# M6-1 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/registry.rs` | 修正 | `impl ProcessRegistry` に4メソッド追加 + 6テスト追加 |

## 実装したメソッド

| メソッド | シグネチャ | 説明 |
|---------|-----------|------|
| `new()` | `-> Self` | 空レジストリ作成 |
| `snapshot()` | `-> HashMap<String, ProcessState>` | 全状態スナップショット |
| `subscribe_output(name)` | `-> Option<Receiver>` | 出力購読（None=非存在） |
| `pipe_output_to(name, sink)` | `-> Option<JoinHandle>` | 出力転送タスク（None=非存在） |

## 検証結果

- `cargo check`: 警告ゼロで通過
- `cargo test`: 67/67 通過（既存61 + M6-1:6、0.01s）
- 品質チェック: issue 0
- 依存追加: なし
