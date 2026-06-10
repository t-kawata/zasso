# M9-1 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/registry.rs` | 修正 | `shutdown_all()` + `stop()` + 2テスト追加 |

## 実装したメソッド

| メソッド | 説明 |
|---------|------|
| `shutdown_all()` | 逆順→cancel_token→Stopped→child.take()→shutdown().await |
| `stop(name)` | 単一停止、NotFound エラー |

## デッドロック回避パターン

```
Mutex ロック内 → child.take() → Mutex ロック解放
  → child_guard.shutdown().await  // ロックなしで await
```

## 検証結果

- `cargo check`: 警告ゼロ
- `cargo test`: 73/73 通過、1 ignored（0.01s）
- 品質チェック: issue 0
- 依存追加: なし

## Phase 2 完結 🎉
