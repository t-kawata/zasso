# 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `inference/generate.rs` | 🆕 新規 | GgufEngine への InferenceEngine 実装（generate / generate_structured）+ GenerateParams→SamplingParams変換 + テスト8ケース + M3-3/M3-4用STUB |
| `inference/mod.rs` | 🔧 変更 | `pub mod generate;` 追加 + STUBコメント削除 |
| `registry.rs` | 🔧 変更 | GgufModelBuilderによるモデルロード実装。ダブルチェック＋ロック解放→非同期ロード→再ロックパターン。load_immediate/load_all も同時解決 |
| `lib.rs` | 🔧 変更 | mistralrs型の先行pub use（Constraint, RequestBuilder, Response）+ M3-5 STUB更新 |

## 実装内容

### 1. GgufEngine への InferenceEngine 実装
- `generate()`: `self.registry.get()` → `RequestBuilder` → `model.send_chat_request()` → テキスト抽出
- `generate_structured()`: 同上 + `Constraint::JsonSchema` で出力拘束
- エラーハンドリング: `map_err(GgufError::MistralrsError)` で mistralrs エラー伝播

### 2. ModelRegistry モデルロード（GgufModelBuilder）
- `get()`: 読み取りロック→ダブルチェック→書き込みロックで準備→ロック解放→非同期build→再ロックで保存
- `load_immediate()`: lazy_load=false のモデルを順次ロード
- `load_all()`: 全モデルを順次ロード
- std::sync::RwLock の Send 制約を回避：await前にロック解放

### 3. GenerateParams → SamplingParams 変換
- temperature (f32→f64), max_tokens (u32→usize), top_p (f32→f64), 各種ペナルティ

### 4. lib.rs 公開型
- `pub use mistralrs::{Constraint, RequestBuilder, Response};`

## 解決した STUB（7箇所）
- inference/mod.rs:5 ✅
- registry.rs:5 ✅ registry.rs:148 ✅ registry.rs:165/169 ✅
- registry.rs:184/189 ✅ registry.rs:204/208 ✅

## 残存 STUB（12箇所）
- generate.rs: 137 (M3-3), 147 (M3-4) — 計画通り
- lib.rs: M3-5, M4-1, M4-2, M2-1, M2-2 — 別チケット
- 他: M5-2 (test-run.rs), M4-1/M4-2 (server/mod.rs), settings.rs

## 検証結果
- `cargo check --lib`: ✅ PASS
- `cargo test --lib`: 131 passed, 0 failed
- `cargo clippy --lib`: ✅ 新規警告なし（既存警告のみ）
- 品質チェック: ✅ テストコードの unwrap のみ（許容範囲）
