# 実装サマリ: SttEngine::Local バリアントの追加 (M2-2 / #102)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/types.rs` | EDIT | SttEngine に Local { backend: LocalAsrKind } 追加 |

## 検証結果
| 項目 | 結果 | 備考 |
|------|------|------|
| types.rs 編集 | ✅ | Local バリアント追加済み、#[default] は Os 維持 |
| match 非網羅エラー | ✅ 4件確認 | validate_config, start, stop, tick — M6-1 で解消 |
| src-tauri 側 cargo check | ✅ 成功 | trate/voiput は src-tauri 依存外のため影響なし |

## 既知の4エラー（M6-1 で解消）
```
error[E0004]: `SttEngine::Local { .. }` not covered
  → recognizer.rs:217 (validate_config)
  → recognizer.rs:363 (start)
  → recognizer.rs:400 (stop)
  → recognizer.rs:522 (tick)
```

## 次工程
M2-3 (Qwen3AsrModelPaths + Qwen3AsrConfig) または M2-4 (Constants) を並行着手可能。
