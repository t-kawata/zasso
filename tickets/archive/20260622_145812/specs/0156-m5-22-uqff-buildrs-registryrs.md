---
ticket_id: 156
title: "M5-2.2: UQFF モデル読み込み対応 (build.rs + registry.rs)"
slug: m5-22-uqff-buildrs-registryrs
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0156-m5-22-uqff-buildrs-registryrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0156-m5-22-uqff-buildrs-registryrs/review.md
---

# M5-2.2: UQFF モデル読み込み対応 (build.rs + registry.rs)

## Summary

Gemma4 E2B / E4B は UQFF（Universal Quantized File Format）形式のため、
既存の `GgufModelBuilder` では読み込めない可能性が高い。
本チケットでは build.rs に Gemma4 モデルのダウンロード定義を追加し、
registry.rs に UQFF モデル読み込みの分岐ロジックを実装する。

## Background

### 経緯

M5-2.1 で `ModelConfig::gemma4_e2b()` / `gemma4_e4b()` の設定構造体を追加した。
しかし現在の registry.rs のモデルロードは `GgufModelBuilder` に固定されており、
UQFF 形式のモデルファイル（`.uqff`）を読み込むことができない。

Gemma4 の UQFF モデルは mistralrs の `UqffVisionModelBuilder` を使用して
読み込む必要がある。本チケットではファイル拡張子に基づいて
適切なビルダーを選択する分岐ロジックを実装する。

### 現在の実装状況

- `build.rs`: Qwen3.5 2モデルのダウンロード定義のみ。Gemma4 の URL 未追加
- `registry.rs`: `GgufModelBuilder` 固定。UQFF 分岐なし
- `ModelConfig`: `gemma4_e2b()` / `gemma4_e4b()` は ✅ 完了（M5-2.1）
- `gemma4-e2b-uqff/` および `gemma4-e4b-uqff/` ディレクトリは未作成

### このチケットの必要性

Gemma4 モデルを実際にロードするためのパスが存在しない。
build.rs のダウンロードと registry.rs の読み込み分岐の両方が揃わなければ、
M5-2.3 以降の Gemma4 切り替えは動作しない。

## Scope

### 実装するもの

1. **build.rs: Gemma4 UQFF ダウンロード定義追加**
   - `MODEL_FILES` に2エントリ追加（Qwen3.5 のエントリは維持）
   - サブディレクトリ（`gemma4-e2b-uqff/`, `gemma4-e4b-uqff/`）の自動作成対応
   - E2B: `models/gemma4-e2b-uqff/q4k-0.uqff`（≈3.1GB）
   - E4B: `models/gemma4-e4b-uqff/q4k-0.uqff`（≈5.0GB）

2. **registry.rs: ファイル拡張子によるビルダー分岐**
   - `.gguf` → 既存の `GgufModelBuilder` パス
   - `.uqff` → 新規 `UqffVisionModelBuilder` パス
   - UQFF 用にはモデル名 → HuggingFace リポジトリ名のマッピング関数を追加
   - 未知の拡張子は `GgufError::ModelLoadFailed` を返す

3. **テスト追加**
   - UQFF ファイルパス検出のユニットテスト
   - 未知拡張子のエラーテスト
   - 既存 GGUF パスが従来通り動作することの確認

### 実装しないもの

- ModelConfig 構造体の変更（model_id フィールド追加等）— ヘルパー関数で対応
- デフォルトモデルの切り替え — M5-2.3 で行う
- test-run の修正 — M5-2.3 で行う
- enable_thinking の追加 — M5-2.3 で行う
- Qwen3.5 の MODEL_FILES 削除 — 維持する

## Investigation

### build.rs 設計

#### ダウンロード URL

| モデル | ファイルパス | URL |
|--------|-------------|-----|
| E2B | `models/gemma4-e2b-uqff/q4k-0.uqff` | `https://huggingface.co/mistralrs-community/gemma-4-E2B-it-UQFF/resolve/main/q4k-0.uqff` |
| E4B | `models/gemma4-e4b-uqff/q4k-0.uqff` | `https://huggingface.co/mistralrs-community/gemma-4-E4B-it-UQFF/resolve/main/q4k-0.uqff` |

出典: `crates/ggufrs/docs/mistralrs-gemma4-e2b-e4b/mistralrs-gemma4-guide.md` §1

#### サブディレクトリ対応

現在の build.rs は `create_dir_all(&model_dir)` で `models/` のみ作成する。
Gemma4 モデルはサブディレクトリに配置するため、各ファイルの親ディレクトリを
作成する処理を追加する:

```
models/
├── gemma4-e2b-uqff/
│   └── q4k-0.uqff       ← 新規
├── gemma4-e4b-uqff/
│   └── q4k-0.uqff       ← 新規
├── Qwen3.5-0.8B-Q4_K_M.gguf  ← 維持
└── Qwen3.5-2B-Q4_K_M.gguf    ← 維持
```

ダウンロード前に `file_path.parent()` で親ディレクトリを作成する処理を
ダウンロードループに追加する。

#### MODEL_FILES 形式

現在の `(&str, &str)` 形式を維持:
```rust
const MODEL_FILES: &[(&str, &str)] = &[
    ("Qwen3.5-0.8B-Q4_K_M.gguf", "https://..."),
    ("Qwen3.5-2B-Q4_K_M.gguf", "https://..."),
    ("gemma4-e2b-uqff/q4k-0.uqff", "https://..."),   // 追加
    ("gemma4-e4b-uqff/q4k-0.uqff", "https://..."),   // 追加
];
```

### registry.rs 設計

#### 分岐ロジック

`get()` メソッドのステップ3（モデルロード）に拡張子による分岐を追加:

```rust
let model_path = PathBuf::from(&model_path_str);
let extension = model_path.extension()
    .map(|e| e.to_string_lossy().to_lowercase());

match extension.as_deref() {
    Some("gguf") => {
        // 既存の GgufModelBuilder パス
        let model_dir = model_path.parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| model_path_str.clone());
        let file_pattern = model_path.file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "**".to_string());
        let mut builder = GgufModelBuilder::new(model_dir, vec![file_pattern]);
        if let Some(ref template) = chat_template {
            builder = builder.with_chat_template(template);
        }
        builder.build().await
            .map_err(|e| GgufError::ModelLoadFailed {
                name: name.to_string(),
                source: Box::new(std::io::Error::other(format!("{e:#}"))),
            })
    }
    Some("uqff") => {
        // UqffVisionModelBuilder パス
        let repo = model_name_to_uqff_repo(name);
        UqffVisionModelBuilder::new(
            repo,
            UqffSource::LocalFile {
                path: model_path.to_string_lossy().to_string(),
            },
        )
        .build()
        .await
        .map_err(|e| GgufError::ModelLoadFailed {
            name: name.to_string(),
            source: Box::new(std::io::Error::other(format!("{e:#}"))),
        })
    }
    _ => {
        return Err(GgufError::ModelLoadFailed {
            name: name.to_string(),
            source: Box::new(std::io::Error::other(
                format!("unsupported model format: {:?}", extension),
            )),
        })
    }
}
```

#### リポジトリ名マッピング

UqffVisionModelBuilder の model_id 引数に渡す HuggingFace リポジトリ名を
モデル名から解決するヘルパー関数:

```rust
/// モデル名から UQFF リポジトリ名を解決する
fn model_name_to_uqff_repo(name: &str) -> &'static str {
    match name {
        "gemma4-e2b" => "mistralrs-community/gemma-4-E2B-it-UQFF",
        "gemma4-e4b" => "mistralrs-community/gemma-4-E4B-it-UQFF",
        _ => name, // fallback: モデル名をそのまま使用
    }
}
```

#### 新しいインポート

```rust
use mistralrs::{GgufModelBuilder, Model, UqffSource, UqffVisionModelBuilder};
```

### mistralrs API 確認

`UqffVisionModelBuilder` の `build()` は `Result<Model, Error>` を返す（`GgufModelBuilder` と同様）ため、
`Arc<Model>` 型を変更する必要はない。

```rust
// UqffVisionModelBuilder 署名（推定）
impl UqffVisionModelBuilder {
    pub fn new(model_id: impl Into<String>, source: UqffSource) -> Self;
    pub async fn build(self) -> Result<Model, mistralrs::MistralRsError>;
}

pub enum UqffSource {
    HuggingFace { filename: String },
    LocalFile { path: String },
}
```

### 依存チケットの状態

- **M5-2.1** (#155): ✅ reviewed — `ModelConfig::gemma4_e2b()` / `gemma4_e4b()` 完了
- **M5-1** (#153): ✅ reviewed — build.rs 骨格完了
- 本チケット（#156）の先行実装必須は全て完了
- 本チケットは M5-2.3 の先行実装必須

### スタブ状況

本チケットが解決する STUB は存在しない（純粋な新規追加）。

## Test Plan

### ユニットテスト計画

**対象**: `registry.rs` — 拡張子依存のビルダー分岐ロジック

| # | テストケース | 種別 | 内容 |
|---|------------|------|------|
| 1 | `uqff_model_path_returns_model_load_failed` | 異常系 | `.uqff` パスのモデルを未ダウンロード状態で `get()` → `ModelLoadFailed`（UQFF パスに入ることの確認） |
| 2 | `unknown_extension_returns_model_load_failed` | 異常系 | `.safetensors` 等の未知拡張子 → エラーメッセージに "unsupported model format" を含む |
| 3 | `gguf_model_path_uses_gguf_model_builder` | 正常系 | `.gguf` パスの既存テストが従来通り `ModelLoadFailed` を返す（GgufModelBuilder パス維持） |

**注意**: 実際のモデルファイルが必要なテストは書けないため、異常系で「分岐が正しく動作していること」を確認する。

### ビルド検証

| # | 検証項目 | 方法 |
|---|---------|------|
| 1 | `cargo check` 通過 | `cargo check` 実行 |
| 2 | `cargo build` でモデルダウンロード | `cargo build` 実行後、モデルファイル存在確認 |
| 3 | 既存テスト全通過 | `cargo test` 実行 |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| UQFF ビルダーが実際にモデルをロードできること | ≈3.1GB/5.0GB の実モデルが必要。M5-2.3 の test-run で確認する |
| ダウンロードが正しい URL から行われること | build.rs はビルドスクリプトであり単体テスト不可。目視確認 |

## Boy Scout Rule — 翻訳可能性計画

### 現在のコードの評価

- `build.rs`: 関数名（`model_directory`, `download_file`）は動詞句。適切。
- `registry.rs` `get()` メソッド: 責務がやや大きい（モデル検索 → ロック → ビルダー構築 → ロード → キャッシュ）。今回の拡張でさらに大きくなるため、ビルダー構築部分を関数抽出することを検討する。

### 翻訳可能性ルール

1. **関数名は動詞句**:
   - `model_name_to_uqff_repo()` — 「モデル名から UQFF リポジトリを解決する」
   - `build_model_with_gguf()` — 「GGUF ビルダーでモデルを構築する」（抽出時）
   - `build_model_with_uqff()` — 「UQFF ビルダーでモデルを構築する」（抽出時）

2. **変数名はドメイン概念**:
   - `repo` — HuggingFace リポジトリ名
   - `extension` — ファイル拡張子（既存の `file_pattern` と区別）

3. **エラーハンドリング**:
   - 未知の拡張子は判別可能なエラーメッセージを返す（`?` 演算子で伝播）

## Acceptance Criteria

- [ ] build.rs に Gemma4 E2B/E4B のダウンロード定義が追加されている
- [ ] build.rs がサブディレクトリ（`gemma4-e2b-uqff/` 等）を作成する
- [ ] Qwen3.5 の MODEL_FILES エントリが維持されている
- [ ] registry.rs が `.uqff` 拡張子を検出し `UqffVisionModelBuilder` パスを通す
- [ ] registry.rs が `.gguf` 拡張子で従来の `GgufModelBuilder` パスを通す
- [ ] 未知の拡張子でエラーを返す
- [ ] `cargo check` が通過する
- [ ] 既存テスト全168件が通過する
- [ ] 新規テスト 3 ケースが追加される

## Notes

- `UqffVisionModelBuilder::new()` の model_id 引数には HuggingFace リポジトリ名を渡す。
  mistralrs はこの情報をトークナイザー設定の解決に使用する可能性がある。
- `UqffSource::LocalFile` でローカルファイルを指定する。
  パスは `model_path.to_string_lossy()` から取得する。
- 参照:
  - `crates/ggufrs/docs/mistralrs-gemma4-e2b-e4b/mistralrs-gemma4-guide.md`
  - `crates/ggufrs/Tickets.md` L626-642

### 成果物

- 計画: context/0156-m5-22-uqff-buildrs-registryrs/plan.md（未作成）
- 実装サマリ: context/0156-m5-22-uqff-buildrs-registryrs/implementation.md（未作成）
- レビュー報告書: context/0156-m5-22-uqff-buildrs-registryrs/review.md（未作成）
