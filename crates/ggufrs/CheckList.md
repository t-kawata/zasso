# RFC 要件チェックリスト

> **⚠️ このファイルはスクリプトにより自動生成された雛形です。**
> AIが目視チェックし、補足事項・プロジェクト固有の制約を追記してから使用すること。

生成日時: 2026-06-19T07:36:46.520Z
DesignTree バージョン: 1

---

## 全体チェック

- [ ] RFC全体にTBD / TODO / スタブ / 委譲 が0件であること
- [ ] 全セクションにコードスニペットが含まれていること
- [ ] DesignTreeの全ノードがRFCのいずれかのセクションに対応していること

---

## §1 アーキテクチャ全体 — mistralrs→llama-cpp-2 転換設計 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §1.1 依存関係: mistralrs削除 + llama-cpp-2追加 ✅

- [ ] **依存関係: mistralrs削除 + llama-cpp-2追加** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §1.2 モデルロード: GgufModelBuilder → LlamaModel::load_from_file ✅

- [ ] **モデルロード: GgufModelBuilder → LlamaModel::load_from_file** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §1.3 llama-cpp-2 の C++ FFI 管理 (build.rs + cmake) ✅

- [ ] **llama-cpp-2 の C++ FFI 管理 (build.rs + cmake)** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §1.4 Feature flags: mistralrs GPU features → llama-cpp-2 build features ✅

- [ ] **Feature flags: mistralrs GPU features → llama-cpp-2 build features** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §2 推論API: InferenceEngine トレイトの llama-cpp-2 対応 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §2.1 generate(): LlamaModel::infer() へのマッピング ✅

- [ ] **generate(): LlamaModel::infer() へのマッピング** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §2.2 generate_structured(): GBNF 文法による JSON 制約生成 ✅

- [ ] **generate_structured(): GBNF 文法による JSON 制約生成** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §2.3 generate_stream(): ffi::TokenCallback → futures::Stream ✅

- [ ] **generate_stream(): ffi::TokenCallback → futures::Stream** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §2.4 send_raw(): mistralrs RequestBuilder パススルーの扱い (削除/代替) ✅

- [ ] **send_raw(): mistralrs RequestBuilder パススルーの扱い (削除/代替)** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §2.5 GenerateParams → InferenceParams マッピング ✅

- [ ] **GenerateParams → InferenceParams マッピング** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §3 サーバー: OpenAI 互換レスポンスの自前実装 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §3.1 ChatCompletionRequest / ChatCompletionResponse 自前定義 ✅

- [ ] **ChatCompletionRequest / ChatCompletionResponse 自前定義** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §3.2 ルーター: mistralrs-server-core 依存の排除 ✅

- [ ] **ルーター: mistralrs-server-core 依存の排除** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §3.3 Anthropic 互換エンドポイント削除 (llm-bridge-core 依存削除) ✅

- [ ] **Anthropic 互換エンドポイント削除 (llm-bridge-core 依存削除)** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §4 エラー型: MistralrsError → LlamaCppError 置き換え ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §4.1 GgufError バリアント再設計 (mistralrs特化バリアント削除) ✅

- [ ] **GgufError バリアント再設計 (mistralrs特化バリアント削除)** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §4.2 From トレイト実装: llama-cpp-2 エラー型からの変換 ✅

- [ ] **From トレイト実装: llama-cpp-2 エラー型からの変換** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §5 対象4モデルの ModelConfig 定義と build.rs ダウンロード ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §5.1 Qwen3.5 0.8B / 2B の ModelConfig (GGUF形式に復帰) ✅

- [ ] **Qwen3.5 0.8B / 2B の ModelConfig (GGUF形式に復帰)** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §5.2 Gemma4 E2B / E4B の ModelConfig (UQFF→GGUF形式切替) ✅

- [ ] **Gemma4 E2B / E4B の ModelConfig (UQFF→GGUF形式切替)** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §5.3 build.rs: 4モデルのダウンロードURL (HuggingFace GGUF) ✅

- [ ] **build.rs: 4モデルのダウンロードURL (HuggingFace GGUF)** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §5.4 context_size 等の設定値調整 (モデル別最適値) ✅

- [ ] **context_size 等の設定値調整 (モデル別最適値)** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §6 マイグレーション計画: 既存コードの差分修正 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §6.1 registry.rs: Model 型の差し替えとローダー変更 ✅

- [ ] **registry.rs: Model 型の差し替えとローダー変更** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §6.2 lib.rs: mistralrs re-export 削除 + llama-cpp-2 型は非公開 ✅

- [ ] **lib.rs: mistralrs re-export 削除 + llama-cpp-2 型公開** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §6.3 テストコード修正: mistralrs依存テストの書き換え ✅

- [ ] **テストコード修正: mistralrs依存テストの書き換え** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §6.4 GPU 自動検出: GpuProvider::mistralrs_feature() → llama-cpp-2 build feature ✅

- [ ] **GPU 自動検出: GpuProvider::mistralrs_feature() → llama-cpp-2 build feature** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §7 ChatCompletionRequest も mistralrs 型依存から自前定義に変更 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §8 llama-cpp-2 v0.1.150 の cargo features 確認と対応方針 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §9 gbnf クレートの型の公開範囲 (内部隠蔽 vs 公開API化) ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §10 ストリーミング SSE チャンク型の定義要否 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

<!-- AI補足欄: 上記チェック項目に加え、プロジェクト固有の制約・注意事項をここに追記すること -->

---

## AI補足: プロジェクト固有の追加チェック項目

### クロスカッティングチェック

- [ ] **参照URLの完全性**: 以下の URL が RFC に記載されていること
  - llama-cpp-2: https://crates.io/crates/llama-cpp-2, https://docs.rs/llama-cpp-2/latest/llama_cpp_2/
  - gbnf: https://github.com/richardanaya/gbnf, https://crates.io/crates/gbnf, https://docs.rs/gbnf/latest/gbnf/
  - Gemma4 E2B GGUF: https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF
  - Gemma4 E4B GGUF: https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF
- [ ] **旧mistralrs型の完全除去**: 以下の型が lib.rs の re-export および全使用箇所から削除されていること
  - `Model`, `RequestBuilder`, `TextMessages`, `TextMessageRole`
  - `Constraint`, `ChatCompletionResponse`, `IsqBits`
- [ ] **旧依存関係の削除**: Cargo.toml から `mistralrs` と `llm-bridge-core` が削除されていること
- [ ] **新依存関係の追加**: Cargo.toml に `llama-cpp-2 = "0.1.150"` と `gbnf = "0.2.7"` が追加されていること
- [ ] **llama-cpp-2 v0.1.150 の cargo features**: docs.rs で確認した features 一覧が RFC に正確に記載されていること
- [ ] **unsloth GGUF ファイル名の正確性**: build.rs に記載するファイル名が HuggingFace リポジトリの内容と一致すること
- [ ] **GBNF 型は公開APIに含めない**: gbnf への依存は内部実装の詳細として隠蔽し、`generate_structured` のシグネチャは `schema: serde_json::Value` のまま維持すること
- [ ] **model フィールドの解決**: サーバーハンドラはリクエストの `model` フィールドを ModelRegistry で解決し、ルーターは Registry 経由で LlamaModel を取得すること
- [ ] **context_size=2048 の位置づけ**: デフォルト値であることを明記し、ModelConfig でユーザーが自由に設定可能であることを説明すること
- [ ] **ストリーミング SSE レスポンス**: ChatCompletionChunk 型を定義し、Axum の SSE と OpenAI 互換フォーマットで逐次出力すること
- [ ] **テストカバレッジ維持**: 移行後も mockall ベースの単体テストと実モデル結合テストが維持されること（旧175テスト相当）