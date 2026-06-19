---
title: "ggufrs アーキテクチャ転換: mistralrs → llama.cpp"
created_at: 2026-06-19
updated_at: 2026-06-19
---

# ggufrs アーキテクチャ転換: mistralrs → llama.cpp

## 背景

ggufrs は当初、mistralrs v0.8.1 を推論バックエンドとして開発を開始した。
mistralrs は「Rust で書かれた LLM 推論ライブラリ」として以下の理由で選択された：

- 純 Rust ビルド（C++ コンパイラ不要）
- OpenAI 互換サーバーの内包
- GGUF / UQFF 両形式のサポート

しかし開発を進めるうちに、複数の問題が顕在化した。

## mistralrs を断念した理由

### 1. Qwen3.5 アーキテクチャ非対応 (2026-06-18 発覚)

mistralrs v0.8.1 は Qwen3.5 の GGUF アーキテクチャ（`qwen35`）を未サポート。
`Unknown GGUF architecture 'qwen35'` エラーが発生し、デフォルトモデルとして
使用できなかった。

**対応**: Gemma4 E2B / E4B（UQFF 形式）に差し替え。
→ この時点で「mistralrs がサポートするモデルに制限される」というリスクが顕在化。

### 2. CPU メモリ検出のバグ (2026-06-19 発覚、INFO02.md)

Gemma4 E2B モデルロード時に以下のエラーが発生：

```
This model does not fit on the devices ["cpu (avail: 0MB)", "cpu (avail: 0MB)"]
```

外部専門家による調査で原因特定：
- `auto_device_map.rs` の CPU デバイス二重pushバグ
- `sysinfo` v0.36.1 の macOS ARM における `available_memory=0` 問題
- マルチモーダルモデルの activation 推計値の過大評価

**対応**: `DeviceMapSetting::dummy()` で Auto device map をバイパス。
→ ワークアラウンドで回避できたが、「環境依存のバグに振り回される」という
　 mistralrs の品質に対する不信感が決定的になった。

### 3. 推論のハング (2026-06-19 発覚)

DeviceMap バイパスを適用後も、通常テキスト生成（256トークン）が完了せず
長時間停止。Structured Output は成功したが、generate() の通常パスで
ハングする現象が確認された。

### 4. UQFF 形式の特殊性

Gemma4 を動かすために採用した UQFF 形式は mistralrs 独自の量子化形式であり、
他のツール（llama.cpp, Ollama 等）では使用できない。モデル選択の自由度が
極端に制限される。

## llama.cpp への移行判断

### 判断基準

| 基準 | mistralrs | llama.cpp |
|------|-----------|-----------|
| macOS サポート | 問題あり | 安定 |
| モデル形式 | GGUF/UQFF | GGUF のみ（標準形式） |
| コミュニティ規模 | 小 | 大（10倍以上） |
| バグ対応 | 開発者1名 | 大規模コミュニティ |
| Rust バインディング | mistralrs（純Rust） | llama-cpp-2（C++ FFI） |
| OpenAI 互換サーバー | 内蔵 | 自前実装が必要 |

### 結論

llama.cpp は以下の点で優位：
- モデル形式が GGUF のみで **シンプル**（UQFF のような独自形式に振り回されない）
- **macOS 対応が安定**（Apple Silicon 向けに Metal バックエンド含む）
- **コミュニティが大規模**（バグ遭遇時の解決策が見つかりやすい）
- **llama-cpp-2 クレート** が Rust からの統合を提供

## ビルド環境 (Build Environment)

### ターゲット OS

ggufrs は **macOS / Windows / Linux** の3プラットフォームでのビルドをサポートする。

llama-cpp-2 は `build.rs` で `cmake` を呼び出して llama.cpp の C++ ソースをコンパイルする。
`cmake` が各プラットフォームに適した C++ コンパイラを自動選択するため、
ビルド手順は全プラットフォームで `cargo build` 一発で完結する。

### 各プラットフォームの要件

| OS | 必要要件 | 備考 |
|----|---------|------|
| **macOS** | Xcode CLI Tools (`xcode-select --install`) | Metal バックエンド利用可能 |
| **Windows** | Visual Studio 2022 (C++ ワークロード) + CMake | CMake は VS に同梱、または `winget install CMake` |
| **Linux** | build-essential (gcc/clang) + cmake | CUDA バックエンド利用可能 |

### クロスプラットフォーム設計の担保

現在の ggufrs のコードは以下の理由で移植性を備えている：

- **プラットフォーム固有のコードは build.rs のみ**（curl / powershell の分岐）— 移行後も同様
- **推論エンジンは `InferenceEngine` トレイトで抽象化済み** — 実装差し替えのみ
- **設定パスは `PathBuf` を使用**（OS 非依存）
- **サーバーは Axum**（全プラットフォーム対応）
- **mistralrs にあった macOS 固有のバグ**（`sysinfo` の `available_memory=0`）**から解放される**

## mistralrs 削除範囲

### 現在の依存関係

```
Cargo.toml
  └── mistralrs = "0.8.1"   ← これを削除

ggufrs 内の使用箇所:
├── error.rs          → MistralrsError バリアント
├── registry.rs       → GgufModelBuilder, UqffMultimodalModelBuilder, DeviceMapSetting
├── inference/
│   ├── mod.rs        → （トレイト定義のみ、間接的依存）
│   ├── generate.rs   → RequestBuilder, SamplingParams, Constraint, Response 他
│   ├── stream.rs     → Response, ChatCompletionChunkResponse 他
│   └── raw.rs        → RequestBuilder, Response
├── server/
│   └── openai.rs     → ChatCompletionResponse, RequestBuilder, TextMessages, Response
└── lib.rs            → pub use mistralrs::* (re-export)
```

### 置き換え計画（大まか）

| コンポーネント | 現状 (mistralrs) | 移行先 (llama-cpp-2) |
|--------------|-----------------|---------------------|
| モデルロード | `GgufModelBuilder::new(dir, patterns).build()` | `LlamaModel::load_from_file(path, params)` |
| 推論 | `Model::send_chat_request(request)` | `LlamaModel::infer(prompt, params)` または llama_context 直接操作 |
| SamplingParams | mistralrs の構造体 | llama-cpp-2 の `InferenceParams` |
| JSON 制約 | `Constraint::JsonSchema` | llama.cpp の GBNF 文法 |
| ChatCompletionResponse | mistralrs の型 | 自前の構造体 (Serialize) |
| サーバーハンドラ | mistralrs 型に依存 | 自前の型に置き換え |

### 変更不要なコンポーネント

- `server/router.rs` — Axum ルーター定義（mistralrs 非依存）
- `config.rs` — 設定構造体（mistralrs 非依存）
- `inference/mod.rs` — `InferenceEngine` トレイト定義 + `GenerateParams`（mistralrs 非依存）
- `consts/settings.rs` — 定数定義（mistralrs 非依存）
- `build.rs` — ダウンロード URL の差し替えのみ
- `test-run.rs` — `InferenceEngine` 経由のためそのまま動作

### 削除するコンポーネント

- `server/openai.rs` 内の Anthropic 互換エンドポイント（`anthropic_messages_handler`）
- `llm-bridge-core` 依存関係（Anthropic 変換用）
- `inference/raw.rs`（`send_raw()` メソッド → mistralrs RequestBuilder に依存）

## 移行による副作用

### 良い影響

- **モデル選択の自由度が向上**: あらゆる GGUF モデルが使用可能に
- **ビルドが安定化**: mistralrs の頻繁な破壊的変更から解放
- **macOS Metal 対応**: llama.cpp の Metal バックエンドで GPU 推論が可能に

### 悪い影響

- **C++ コンパイラが必要**: llama-cpp-2 は C++ FFI のためビルド環境に C++ ツールチェーンが必要（macOS の Xcode CLI tools で対応可能）
- **OpenAI 互換レスポンスの自前実装**: mistralrs の `ChatCompletionResponse` 型を自前の構造体で代替する必要がある
- **Anthropic 互換エンドポイント廃止**: `POST /anthropic/v1/messages` は削除（別レイヤーで対応する方針）

## 参考ドキュメント

- `crates/ggufrs/docs/mistralrs-gemma4-e2b-e4b/INFO.md` — Gemma4 パフォーマンス推定
- `crates/ggufrs/docs/mistralrs-gemma4-e2b-e4b/INFO02.md` — mistralrs 調査回答（DeviceMap 問題）
- `crates/ggufrs/docs/mistralrs-gemma4-e2b-e4b/mistralrs-gemma4-guide.md` — Gemma4 導入手順書
- `crates/ggufrs/Tickets.md` — M5-2.x チケット一覧
