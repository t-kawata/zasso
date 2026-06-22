# レビュー報告書: streamer.rs AsrBackend 移行 + lib.rs 再公開更新 (M3-2 / #107)

## 再レビュー（2026-06-16）— 警告・エラー完全解決の原則を適用

### 本レビューで修正したエラー

当初 M3-2 の実装完了時点では 2 件のコンパイルエラーが残っていたが、再レビューにおいて全件修正し、
`cargo check` 0 errors / 0 warnings / `cargo test` 154 passed を達成した。

| # | エラー | ファイル | 修正内容 |
|---|--------|---------|---------|
| 1 | `E0308: expected &str, found &StreamerLocale` | `streamer.rs:552` | `StreamerLocale::as_str()` メソッドを追加し、呼び出し側を `&self.config.locale` → `self.config.locale.as_str()` に変更 |
| 2 | `E0407: model_name not in trait` | `openai.rs:789` | `backend_name()` に変更（`"openai-whisper"` 固定値）。旧 `model_name()` は `#[allow(dead_code)]` + `[::STUB::] M3-3` で維持 |
| 3 | `E0407: model_name not in trait` | `streamer.rs:621` (MockBackend) | `backend_name()` に変更 |
| 4 | `E0407: model_name not in trait` | `binary/test-run.rs:808` (MockStreamerBackend) | `backend_name()` に変更 |

### 変更ファイル一覧（再レビューでの追加修正）

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/pipeline/streamer.rs` | EDIT | `StreamerLocale::as_str()` 追加 + 呼び出し側修正 + MockBackend `backend_name()` |
| `crates/voiput/src/backends/openai.rs` | EDIT | `model_name()` → `backend_name()` + 旧メソッドを `#[allow(dead_code)]` で維持 |
| `crates/voiput/src/binary/test-run.rs` | EDIT | MockStreamerBackend `model_name()` → `backend_name()` |

### チェック結果

| チェック項目 | 結果 | 詳細 |
|-------------|------|------|
| Acceptance Criteria (5項目) | ✅ 全件合格 | trait削除、use trate、lib.rs更新、コンパイル確認、voiput::AsrBackend互換 |
| cargo check（エラー） | ✅ 0件 | 全エラー修正済み |
| cargo check（警告） | ✅ 0件 | 全警告修正済み |
| cargo test --lib | ✅ 154 passed | 全テスト通過 |
| 依存関係 | ✅ | M3-1 (#106) reviewed、矛盾なし |
| 翻訳可能性 | ✅ | `StreamerLocale::as_str()` 説明的、`backend_name()` 一貫性保持 |
| スタブ | ✅ | `openai.rs` の `[::STUB::] M3-3` は解決保留（正しい）。それ以外の新規スタブなし |

### スタブ評価

| スタブ | 分類 | 備考 |
|--------|------|------|
| `openai.rs` の `#[allow(dead_code)] fn model_name()` | 保留妥当 | M3-3 で削除予定。`[::STUB::]` マーカー付き |
| `recognizer.rs` の 4 件の `[::STUB::]` | 保留妥当 | M6-1 で解決予定（#107 のスコープ外） |
| `recognizer.rs` の 2 件の `#[allow(dead_code)]`（M2-5） | 保留妥当 | M4-2 で解決予定（#107 のスコープ外） |

## 結論
**PASS** — 全エラー・警告を解決。品質基準を満たす。
