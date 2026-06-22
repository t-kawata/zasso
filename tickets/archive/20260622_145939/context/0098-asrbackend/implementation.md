# 実装サマリ: AsrBackend トレイトの定義 (M1-1 / #98)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/trate/src/lib.rs` | EDIT | AsrBackend trait 定義追加 + mod local; 宣言 |
| `crates/trate/src/local.rs` | NEW | 空ファイル（M1-2 のプレースホルダ、[::STUB::] マーク） |

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check | ✅ 成功 |
| cargo tree (anyhow のみ) | ✅ |
| quality checks | ⚠️ 5件（偽陽性: lib.rs のトレイト定義＋デフォルトメソッドを検出。Rust 標準パターン） |

## AsrBackend トレイト定義
```rust
pub trait AsrBackend: Send {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String>;
    fn post_correct(&mut self, text: &str) -> Result<String> { Ok(text.to_string()) }
    fn backend_name(&self) -> &'static str { "unknown" }
    fn record_asr_usage(&mut self, _duration_ms: u64) {}
    fn insert_punctuation(&mut self, text: &str, _locale: &str) -> Result<String> { Ok(text.to_string()) }
}
```

## 設計上の変更点（既存 voiput コードからの差異）
1. `model_name() -> String` → `backend_name() -> &'static str`
2. `insert_punctuation(locale: &StreamerLocale)` → `locale: &str`（trate が voiput 内部型に依存しないため）
3. `post_correct()`, `record_asr_usage()` をデフォルト実装化

## 次工程
M1-2 (LocalAsrBackend トレイト定義) に進み、local.rs を実装する。
