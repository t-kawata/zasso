# ggufrs 実装チケット分解設計書

> **生成元:** crates/ggufrs/RFC.md
> **生成日:** 2026-06-17
> **分析済みセクション:** §1(全体アーキテクチャ), §2(モデル管理), §3(サーバーモード), §4(モデル自動ダウンロード), §5(推論実行IF), §6(設定管理), §7(テスト), §8(エラー型), §9(依存関係管理), Appendix(A-E)

---

## フェーズ A: 純粋ロジック基盤 (Layer 0 + Layer 1)

> **外部依存:** thiserror, serde, serde_json, anyhow, async-trait（Cargo.toml 宣言のみ）
> **非同期I/O:** なし
> **テスト:** 全テストが決定論的・メモリ内完結・ミリ秒単位で完了

### マイルストーン M0: 型定義 — Layer 0

> **この段階では構造体・列挙型・トレイトの骨格のみを定義する。実装ロジックは M1 以降。**

#### ✅ チケット M0-1: Cargo.toml / lib.rs プロジェクト骨格

* **参照設計書:** crates/ggufrs/RFC.md (§8.1 Cargo.toml, §8.3 mistralrs 型の re-export)
* **依存・関連チケットID:** 全チケットの先行実装必須
* **対象不変条件 / 規範:** Cargo.toml に依存関係を直接手書きせず `cargo add` を使用する。`[::STUB::]` 未マークのスタブ禁止。`default-features = false` + `features = ["gguf"]` を基本とする。
* **実装の背景と目的:** 全チケットのビルド基盤。最初に crate の骨格を確立し、以降のチケットが段階的に機能を追加できるようにする。mistralrs のバージョンは固定せず `cargo update` で追従可能な状態とし、`Cargo.lock` はバージョン管理対象とする。
* **実装スコープ:**
  - `crates/ggufrs/Cargo.toml` 作成（package 定義、dependencies、features、bin）
  - `crates/ggufrs/src/lib.rs` 作成（空の crate ルート、`pub use mistralrs::{...}` re-export の [::STUB::] 宣言）
  - `crates/ggufrs/src/consts/mod.rs` 作成（空の mod 宣言）
  - `crates/ggufrs/src/inference/mod.rs` 作成（空の mod 宣言）
  - `crates/ggufrs/src/server/mod.rs` 作成（空の mod 宣言）
  - Makefile に ggufrs crate 用ターゲット追加（`make check-be` でビルド検証可能）
  - `crates/ggufrs/.gitignore` 作成（`/models/`）
  - dependencies: `cargo add mistralrs --no-default-features --features gguf` 等、`cargo add` で追加
    - **`llm-bridge-core = "0.2"`** を含める（Anthropic ↔ OpenAI プロトコル変換。RFC §3.1 参照。ドキュメント: [docs.rs](https://docs.rs/llm-bridge-core/latest/llm_bridge_core/), [GitHub](https://github.com/TokenFleet-AI/llm-bridge-rust/tree/master)）

* **テストコードによる検証:**
  1. `make check-be` が成功する（空の crate がコンパイル可能）
  2. `crates/ggufrs/` で `cargo build` が成功する
  3. dependencies が期待通り解決されている（`cargo tree` で確認）

* **計装方法・観測対象:** コンパイル成功/失敗

#### ✅ チケット M0-2: 静的定数定義 (consts/settings.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§4.1 静的定数、Appendix C)
* **依存・関連チケットID:** 先行実装必須: M0-1。後続: M0-4（GgufError は定数参照しないが同時期実装可能）、全チケットから参照。
* **対象不変条件 / 規範:** マジックナンバーの直書き禁止。設定値は `consts/settings.rs` で一元管理し、`consts/mod.rs` 経由で参照する。テストコード内も含めてポート番号等を直書きしない。
* **実装の背景と目的:** zasso CLAUDE.md の「設定値は consts/settings.rs で一元管理」ルールを遵守する。GGUFRS_GPU_PROVIDER 環境変数名のような文字列定数もここで定義する。
* **実装スコープ:**
  - `consts/settings.rs` 作成
  - 定数定義:
    - `DEFAULT_RT_PORT: u16 = 3910` — REST API / OpenAI 互換エンドポイント
    - `DEFAULT_SW_PORT: u16 = 3911` — 静的コンテンツポート（未使用時は 0）
    - `DEFAULT_MODEL_DIR: &str = "models"` — モデルファイル格納ディレクトリ
    - `CURL_TIMEOUT_SECS: u64 = 60` — モデルダウンロードのタイムアウト（voiput 準拠）
    - `DEFAULT_CONTEXT_SIZE: u32 = 32768` — Qwen3.5 のデフォルトコンテキスト長
    - `DEFAULT_MAX_TOKENS: u32 = 256` — 推論のデフォルト最大トークン数
    - `DEFAULT_TEMPERATURE: f32 = 0.1` — 推論のデフォルト温度パラメータ
    - `GPU_PROVIDER_ENV_VAR: &str = "GGUFRS_GPU_PROVIDER"` — GPU プロバイダー環境変数名
  - `consts/mod.rs` で `pub mod settings;` を宣言
  - 全ての定数に「なぜこの値か」を日本語コメントで記述

* **テストコードによる検証:**
  1. 定数値がコンパイル時に評価可能である（`const` であること）
  2. 数値範囲が適切である（ポート番号 0-65535、コンテキストサイズ正数等）

* **計装方法・観測対象:** コンパイル時定数評価

#### ✅ チケット M0-3: GpuProvider 列挙型 (config.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§5 GPU自動検出機構)
* **依存・関連チケットID:** 先行実装必須: M0-1。後続: M1-2（GpuProvider メソッド実装）。
* **対象不変条件 / 規範:** `GpuProvider` は5バリアントで固定。`serde::Deserialize` / `Serialize` を derive し JSON config で使用可能にする。
* **実装の背景と目的:** GPUプロバイダー選択は設定の一部であり、`config.rs` で宣言する。この段階では列挙型の定義のみ。
* **実装スコープ:**
  - `config.rs` 作成
  - `GpuProvider` 列挙型定義: `Auto`, `Metal`, `DirectML`, `Cuda`, `Cpu`
  - `#[derive(Debug, Clone, Copy, PartialEq, Default, serde::Serialize, serde::Deserialize)]`（`Auto` が先頭バリアントのため `Default` は `Auto` を返す）
  - `GpuConfig` 構造体定義: `provider: GpuProvider`, `cpu_only: bool`
    - `#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]`
    - `Default` は手動実装: `GpuProvider::Auto`, `false`
  - すべてのフィールド・バリアントに日本語コメントで意図を説明

* **テストコードによる検証:**
  1. `GpuProvider` の全バリアントが JSON シリアライズ・デシリアライズ可能
  2. `GpuConfig::default()` が `GpuProvider::Auto`, `cpu_only: false` を返す

#### ✅ チケット M0-4: GgufError 列挙型 (error.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§6 エラー型)
* **依存・関連チケットID:** 先行実装必須: M0-1。後続: M1-3（From impls）、全実装チケットのエラー伝搬基盤。
* **対象不変条件 / 規範:** `GgufError` は6バリアントで固定（ModelNotFound, ModelLoadFailed, InferenceFailed, ServerStartupFailed, InvalidConfig, MistralrsError）。`thiserror` で `#[derive(Error)]` を使用。各バリアントに `#[error("...")]` 属性で日本語エラーメッセージを記述。`std::error::Error` トレイトを実装。
* **実装の背景と目的:** crate 内の全エラーを単一の列挙型に集約し、`?` 演算子による透過的なエラー伝搬を可能にする。`thiserror` の `#[from]` 属性により `mistralrs::Error` からの自動変換が可能。
* **実装スコープ:**
  - `error.rs` 作成
  - `GgufError` 列挙型定義（6バリアント）
  - 各バリアントのフィールド設計:
    - `ModelNotFound(String)` — モデル名
    - `ModelLoadFailed { name: String, source: Box<dyn std::error::Error + Send + Sync> }`
    - `InferenceFailed(Box<dyn std::error::Error + Send + Sync>)`
    - `ServerStartupFailed(Box<dyn std::error::Error + Send + Sync>)`
    - `InvalidConfig(String)`
    - `MistralrsError(#[from] mistralrs::Error)`

* **テストコードによる検証:**
  1. `GgufError` が `std::error::Error` トレイトを実装している
  2. 各バリアントが `Display` で適切なメッセージを出力する
  3. `GgufError` が `Send + Sync` を満たす

#### ✅ チケット M0-5: 設定構造体定義 (config.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§2.2 ModelConfig と ModelInfo, §3.1 ServerConfig, §4.2 JSON マルチソースマージ)
* **依存・関連チケットID:** 先行実装必須: M0-1, M0-2（`DEFAULT_RT_PORT` を `ServerConfig::default()` で使用）、M0-3（GpuProvider をフィールドに含む）。後続: M1-1（ModelConfig コンストラクタ）、M1-4（GgufConfig merge_overlay）。
* **対象不変条件 / 規範:** `ModelConfig` / `ServerConfig` / `GgufConfig` は全て `serde::Deserialize` + `Serialize` を derive し、JSON config との相互変換を保証する。さらに `Clone`, `Debug`, `PartialEq` も derive する（テスト・clone 操作・デバッグ出力で必要）。`ServerConfig` と `GpuConfig` は `Default` の手動実装が必要（`SocketAddr` が Default 非対応のため）。フィールドは全て `pub` または getter を持つ。設定値のデフォルトは `consts/settings.rs` の定数を参照する。
* **実装の背景と目的:** この段階では各構造体のフィールド定義と JSON 入出力のみ。実際のマージロジックやビルダーメソッドは M1 で実装する。構造体定義を先行させることで、以降のチケットが型に依存できるようになる。
* **実装スコープ:**
  - `ModelConfig` 構造体定義（全てのフィールド）
    - `name: String`, `model_path: PathBuf`, `lazy_load: bool`
    - `context_size: Option<u32>`, `gpu_layers: Option<u32>`, `batch_size: Option<u32>`, `chat_template: Option<String>`
    - `#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]`
  - `ServerConfig` 構造体定義
    - `bind: SocketAddr`, `models: Vec<String>`, `auto_start_server: bool`
    - `#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]`
    - `impl Default` 手動実装: `bind = ([127, 0, 0, 1], DEFAULT_RT_PORT).into()`, `models = vec![]`, `auto_start_server = false`
  - `GpuConfig` 構造体定義（M0-3 で定義済みであることを確認するのみ。M0-3 に Default 手動実装在り）
  - `GgufConfig` 構造体定義
    - `models: Vec<ModelConfig>`, `server: ServerConfig`, `gpu: GpuConfig`
    - `#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]`
  - `ConfigLayer` 列挙型定義（RFC §4.2 `merge()` メソッドの引数型）
    - ```rust
      pub enum ConfigLayer {
          Code(GgufConfig),
          JsonStr(String),
          File(PathBuf),
      }
      ```

* **テストコードによる検証:**
  1. 各構造体が JSON との間でシリアライズ・デシリアライズ可能
  2. デフォルト値（RFC §4.3 の JSON スキーマに準拠）で正しくデシリアライズされる
  3. フィールド欠落時に適切なエラーになる

#### ✅ チケット M0-6: ModelInfo 構造体定義 (registry.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§2.2 ModelConfig と ModelInfo)
* **依存・関連チケットID:** 先行実装必須: M0-5（ModelConfig からの変換）。後続: M1-5（ModelRegistry 同期メソッド）。
* **対象不変条件 / 規範:** `ModelInfo` は `ModelConfig` の全フィールドを内包し、加えて `model: Option<Arc<Model>>` を保持する。`From<ModelConfig>` を実装し、`ModelConfig` から一意に変換可能。`model` フィールドのみ `pub(crate)` で外部からの直接操作を制限。
* **実装の背景と目的:** 「設定（ModelConfig）」と「実行時状態（ModelInfo）」の2層分離を実現する。`ModelInfo` は ModelRegistry 内部でのみ生成・保持され、外部には `Arc<Model>` のみが公開される。
* **実装スコープ:**
  - `registry.rs` 作成
  - `ModelInfo` 構造体定義（ModelConfig の全フィールド + `model: Option<Arc<Model>>`）
  - `impl From<ModelConfig> for ModelInfo`
  - 全フィールドに日本語コメントを付与

* **テストコードによる検証:**
  1. `ModelInfo::from(ModelConfig::qwen3_5_0_8b())` で全フィールドが正しくコピーされる
  2. `model` フィールドが初期状態で `None` である
  3. `ModelConfig` の `qwen3_5_2b()` / `custom()` でも同様に正しく変換される

---

### マイルストーン M1: 純粋関数 — Layer 1

> **この段階では非同期I/Oを一切含まない。全関数が同期的かつ決定論的。**

#### チケット M1-1: ModelConfig ビルトインコンストラクタ (config.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§2.2 ModelConfig, `qwen3_5_0_8b()`, `qwen3_5_2b()`, `custom()`)
* **依存・関連チケットID:** 先行実装必須: M0-5。後続: テストコードで直接使用。
* **対象不変条件 / 規範:** `qwen3_5_0_8b()` は name="qwen3.5-0.8b", path="models/Qwen3.5-0.8B-Q4_K_M.gguf", lazy_load=true, context_size=32768 で固定。`qwen3_5_2b()` も同様に固定。`custom()` は引数以外の全オプションフィールドを `None` にする。これらの関数は純粋コンストラクタであり、副作用を持たない。
* **実装の背景と目的:** ビルトインモデル設定の提供は ggufrs の価値提案の核。`custom()` は crate 利用者が任意の mistralrs 対応モデルを登録するための汎用インターフェース。Qwen3.5 シリーズ以外を利用する場合も全く同じ型システム内で設定可能であることを保証する。
* **実装スコープ:**
  - `ModelConfig::qwen3_5_0_8b()` 実装
  - `ModelConfig::qwen3_5_2b()` 実装
  - `ModelConfig::custom(name, path)` 実装

* **テストコードによる検証:**
  1. `qwen3_5_0_8b().name == "qwen3.5-0.8b"`
  2. `qwen3_5_2b().name == "qwen3.5-2b"`
  3. `custom("test", "custom/path").model_path == PathBuf::from("custom/path")`
  4. `custom()` の全オプションフィールドが `None` である
  5. 全コンストラクタで `lazy_load == true`
  6. 呼び出しのべき等性: 同一コンストラクタを2回呼んで全フィールドが等しい

#### チケット M1-2: GpuProvider メソッド実装 (config.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§5 GPU自動検出機構, `detect()`, `from_str()`, `mistralrs_feature()`)
* **依存・関連チケットID:** 先行実装必須: M0-3。後続: M3-2（InferenceEngine 実装時に GPU feature を解決）。
* **対象不変条件 / 規範:** `detect()` は macOS → Metal、Windows → DirectML、その他 → Cpu を返す。`GGUFRS_GPU_PROVIDER` 環境変数が設定されていればそれを優先する。`from_str()` は大文字小文字を区別せず、未知の値には `None` を返す。`mistralrs_feature()` は Cpu/Auto に対して空文字列を返す。
* **実装の背景と目的:** 環境変数によるランタイム上書きとコンパイル時デフォルトのハイブリッド方式。これによりユーザーはビルドオプションと実行時設定の両方で GPU プロバイダーを制御できる。
* **実装スコープ:**
  - `GpuProvider::detect()` — `cfg!(target_os)` + 環境変数チェック
  - `GpuProvider::from_str(s: &str) -> Option<Self>` — 文字列パース
  - `GpuProvider::mistralrs_feature(&self) -> &'static str` — mistralrs feature flag 名

* **テストコードによる検証:**
  1. `from_str("metal") == Some(GpuProvider::Metal)`（大文字小文字不問）
  2. `from_str("unknown") == None`
  3. `mistralrs_feature()` の戻り値が空文字列または有効な feature 名である
  4. `detect()` が macOS で Metal を返す（cfg テストはプラットフォーム依存のため注釈付き）

#### チケット M1-3: GgufError From トレイト実装 (error.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§6 エラー型、各バリアントの From 実装)
* **依存・関連チケットID:** 先行実装必須: M0-4。後続: 全実装チケットで `?` 演算子使用時に必要。
* **対象不変条件 / 規範:** `From<mistralrs::Error>` は `#[from]` 属性で自動導出。`From<std::io::Error>` と `From<serde_json::Error>` は手動実装し、それぞれ `InvalidConfig` にマッピング。`From<anyhow::Error>` は実装せず、anyhow は上位層でのみ使用する。
* **実装の背景と目的:** `?` 演算子による透過的なエラー伝搬を crate 全体で可能にする。mistralrs のエラー型変更に追随しやすいよう `#[from]` 属性で自動導出する部分と、意味的に適切なバリアントにマッピングする手動実装部分を明確に分離する。
* **実装スコープ:**
  - `impl From<std::io::Error> for GgufError`（→ InvalidConfig）
  - `impl From<serde_json::Error> for GgufError`（→ InvalidConfig）
  - `From<mistralrs::Error>` は #[from] で自動導出（M0-4 で定義済みであれば確認のみ）

* **テストコードによる検証:**
  1. `GgufError::from(io::Error::new(io::ErrorKind::NotFound, "test"))` が `InvalidConfig` バリアント
  2. `GgufError::from(serde_json::from_str::<GgufConfig>("invalid{") .unwrap_err())` が `InvalidConfig` バリアント
  3. 各 From 実装がエラーメッセージを保持している

#### チケット M1-4: GgufConfig マージロジック (config.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§4.2 JSON マルチソースマージ, §Implementation 設定マージの実装詳細)
* **依存・関連チケットID:** 先行実装必須: M0-5。後続: M3-1（ファイルI/O を含む完全実装）。
* **対象不変条件 / 規範:** `merge_overlay()` は上位優先度の設定を `self` に上書きマージする。models は `name` フィールドをキーにマージし、同名モデルは上書き、新規モデルは追加。server と gpu は上書き（`bind.port() != 0` かつ `provider != Auto` の場合のみ）。この関数は純粋で、外部I/O・エラーを発生させない。
* **実装の背景と目的:** 3層マージの核となるロジック。この段階では同期的なマージのみを実装し、ファイル読み取りや JSON パースは M3-1 で追加する。これによりマージロジックを早期に単独テストできる。
* **実装スコープ:**
  - `GgufConfig::from_code(models: Vec<ModelConfig>) -> Self` 実装（最下層コンストラクタ）
    - `ServerConfig::default()` + `GpuConfig::default()` と指定されたモデルで GgufConfig を生成
    - コードベタ書きの優先度が最も低い（ファイル・埋め込み JSON で上書き可能）
  - `GgufConfig::merge_overlay(&mut self, overlay: GgufConfig)` — **`pub(crate)`** 実装
    - 上位優先度の設定を `self` に上書きマージする内部ヘルパー
    - models は name ベースマージ（同名は上書き、新規は追加）
    - server は条件付き上書き（`bind.port() != 0` の場合のみ）
    - gpu は条件付き上書き（`provider != Auto` の場合のみ）
  - `ConfigLayer` から `GgufConfig` への変換ロジック（`merge()` で使用、M3-1 で実装）

* **テストコードによる検証:**
  1. 同名モデルをマージすると後続の設定で上書きされる
  2. 異名モデルをマージすると両方保持される
  3. server の `bind` がポート 0 の場合は上書きされない
  4. gpu の `provider` が `Auto` の場合は上書きされない
  5. 空の overlay をマージしても何も変わらない
  6. 3層すべてをマージした最終結果が優先順位通りになる

#### チケット M1-5: ModelRegistry 同期メソッド (registry.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§2.1 ModelRegistry, `new()`, `from_config()`, `add_model()`, `list_models()`)
* **依存・関連チケットID:** 先行実装必須: M0-6（ModelInfo）。後続: M2-2（非同期メソッド追加）。
* **対象不変条件 / 規範:** `new()` は空の Registry を生成。`from_config()` は各 ModelConfig を ModelInfo に変換して保持。`add_model()` はスレッドセーフにモデルを追加（RwLock 使用）。`list_models()` は登録済みモデル名の一覧を返す。この段階では全て同期的。
* **実装の背景と目的:** ModelRegistry の同期 API を先行実装し、非同期メソッド（モデルロード等）は M2-2 で追加する。分割により同期部分の単体テストを早期に行える。
* **実装スコープ:**
  - `ModelRegistry` 構造体定義（`models: RwLock<Vec<ModelInfo>>`）
  - `ModelRegistry::new()`
  - `ModelRegistry::from_config(models: Vec<ModelConfig>)`
  - `ModelRegistry::add_model(&self, config: ModelConfig)`
  - `ModelRegistry::list_models(&self) -> Vec<String>`

* **テストコードによる検証:**
  1. `new()` が空の Registry を生成する
  2. `add_model()` 後に `list_models()` がそのモデル名を含む
  3. `from_config()` で複数モデルを生成し `list_models()` の長さが一致する
  4. 同一モデル名を2回追加すると両方保持される（重複排除は行わない）
  5. 複数スレッドからの `add_model()` が競合しない（スレッドセーフ）

---

## フェーズ B: 非同期基盤 (Layer 2)

> **外部依存:** tokio, async-trait, futures, mockall（dev）
> **非同期I/O:** トレイト定義のみ。実I/O は mock で代替。

### マイルストーン M2: 非同期ランタイム

#### チケット M2-1: InferenceEngine トレイト定義 (inference/mod.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§2.3 推論単位でのモデル切替, `InferenceEngine` トレイト)
* **依存・関連チケットID:** 先行実装必須: M0-2（`DEFAULT_TEMPERATURE` 等の `GenerateParams` デフォルト値）、M0-3, M0-4。先行実装必須: M1-5（ModelRegistry の型が必要）。後続: M2-4（モックテスト）、M3-2/M3-3/M3-4（実装）。
* **対象不変条件 / 規範:** トレイトは4メソッドを規定。全てのメソッドは `model_name: &str` を第一引数に取る。`Send + Sync` をスーパートレイトとして要求する。`#[async_trait]` マクロを使用。トレイト自体の変更なく mistralrs の新機能に対応できるよう、`send_raw()` で低レベルアクセス経路を確保する。
* **実装の背景と目的:** ggufrs の最も重要な抽象化。このトレイトが crate の公開APIの中核となる。4メソッドのうち3つが高レベルAPI、1つが低レベルAPIという設計により、使いやすさと拡張性を両立する。`Send + Sync` 要求により `Arc<dyn InferenceEngine>` としてスレッドセーフに共有可能。
* **実装スコープ:**
  - `inference/mod.rs` に `InferenceEngine` トレイト定義
  - 4メソッドの完全なシグネチャ
  - `GenerateParams` 構造体定義（トレイトメソッドの引数型）
    - フィールド: `temperature: Option<f32>`, `max_tokens: Option<u32>`, `top_p: Option<f32>`, `presence_penalty: Option<f32>`, `frequency_penalty: Option<f32>`
    - `#[derive(Debug, Clone, PartialEq)]`
    - `impl Default`: 各フィールドを `consts/settings.rs` の定数（`DEFAULT_TEMPERATURE`, `DEFAULT_MAX_TOKENS` 等）で初期化、未指定フィールドは `None`
  - `pub use` による lib.rs からの再公開
  - トレイト用の `pub mod` 宣言
  - 日本語コメントで各型・メソッドの責務・引数・戻り値を説明

* **テストコードによる検証:**
  1. トレイトが `Send + Sync` を満たす（コンパイル時検証）
  2. トレイトがオブジェクトセーフである（`dyn InferenceEngine` として使用可能）
  3. 実際に `#[async_trait]` が正しく機能する（単一メソッドのみのダミー実装で確認）

#### チケット M2-2: ModelRegistry 非同期メソッド (registry.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§2.1 ModelRegistry, `get()`, `load_immediate()`, `load_all()`)
* **依存・関連チケットID:** 先行実装必須: M1-5。後続: M2-3（GgufEngine::new()）、M3-2（実モデルロード）。
* **対象不変条件 / 規範:** `get()` は lazy_load=true かつ未ロードの場合のみロードを試みる。`load_immediate()` は lazy_load=false のモデルのみロード。`load_all()` は全モデルを強制ロード。ロード中は書き込みロックを取得し、それ以外は読み取りロックで動作。この段階ではモデルロードは `[::STUB::]` として `todo!()` または `Err(ModelLoadFailed)` を返す（M3-2 で実装）。
* **実装の背景と目的:** モデルの遅延ロード機構の非同期ラッパーを先に実装し、実際の GgufModelBuilder 呼び出しは M3-2 で実装する。これにより ModelRegistry のロック戦略と async インターフェースを早期に確定できる。
* **実装スコープ:**
  - `ModelRegistry::get(&self, name: &str) -> Result<Arc<Model>>` — [::STUB::] モデルロード（M3-2 で実装）
  - `ModelRegistry::load_immediate(&self) -> Result<()>`
  - `ModelRegistry::load_all(&self) -> Result<()>`
  - RwLock の適切な読み取り/書き込み選択
  - 未登録モデル名 → `GgufError::ModelNotFound` エラー

* **テストコードによる検証:**
  1. 未登録モデル名で `get()` が `ModelNotFound` エラー
  2. `load_immediate()` が lazy_load=false のモデルのみロード対象とする
  3. `get()` が既ロードモデルに対しては再ロードしない
  4. 複数スレッドからの同時 `get()` がデータ競合を起こさない

#### チケット M2-3: GgufEngine::new() 実装 (lib.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§1.2 GgufEngine のライフサイクル, `GgufEngine::new()`)
* **依存・関連チケットID:** 先行実装必須: M2-2（ModelRegistry 非同期メソッド）、M0-5（GgufConfig）。後続: M3-1（GgufConfig::build 完全実装）、M4-2（サーバー起動）。
* **対象不変条件 / 規範:** `new()` は設定から ModelRegistry を構築し、lazy_load=false のモデルをプリロードする。`server_handle` は初期状態で `None`。`GgufEngine` は `registry` と `server_handle` の2フィールドのみを持つ。
* **実装の背景と目的:** ggufrs crate のエントリポイント。`GgufEngine::new()` が crate 利用者の最初の接触点となる。この段階ではサーバー関連機能は含めず、モデル管理と推論の基盤を提供する。
* **実装スコープ:**
  - `GgufEngine` 構造体定義
    - `registry: Arc<ModelRegistry>`
    - `server_handle: Mutex<Option<JoinHandle<Result<()>>>>`
  - `GgufEngine::new(config: GgufConfig) -> Result<Self>`
    - ModelRegistry::from_config() 呼び出し
    - load_immediate() 呼び出し
  - 全フィールド・メソッドに日本語コメント

* **テストコードによる検証:**
  1. `GgufEngine::new()` が正常に初期化される
  2. `new()` 後の `list_models()` が設定通りのモデル一覧を返す
  3. 空の設定で `new()` した場合の動作（空 Registry）

#### チケット M2-4: mockall ベース単体テスト (lib.rs tests + inference/mod.rs tests)

* **参照設計書:** crates/ggufrs/RFC.md (§9.1 単体テスト)
* **依存・関連チケットID:** 先行実装必須: M2-1（InferenceEngine トレイト）、M2-2（ModelRegistry）。
* **対象不変条件 / 規範:** mockall の `mock!` マクロで InferenceEngine のモックを生成。各テストは Arrange-Act-Assert パターンに従う。実モデルは一切使用しない。全テストはメモリ内完結・決定論的。
* **実装の背景と目的:** InferenceEngine トレイトの単体テストにより、トレイトの契約が正しいことを早期に検証する。ModelRegistry の各メソッドの境界値テストもここで実施する。実モデルが必要な結合テストは Phase E で行う。
* **実装スコープ:**
  - `mockall` を `[dev-dependencies]` に追加
  - `MockEngine` の mock! 定義（4メソッド）
  - InferenceEngine モックテスト:
    - `generate()` 正常系 + 異常系（ModelNotFound）
    - `generate_structured()` 正常系 + 異常系
    - `generate_stream()` 正常系 + 異常系
    - `send_raw()` 正常系 + 異常系
  - InferenceEngine トレイト境界テスト（`Send + Sync`, オブジェクトセーフ）
  - ModelRegistry 非同期メソッドの統合テスト（M1-5 の同期テストは M1-5 で実施済みのため、ここでは async の層を追加するテストのみ）:
    - モック ModelRegistry に対する `get()` の呼び出し検証
  - GgufError の mistralrs::Error からの変換テスト（From 実装は M1-3 でテスト済みのため、ここではエラー伝搬パスのみ）

* **テストコードによる検証:**
  1. 全テスト通過
  2. mockall が期待通りの呼び出しを検証する
  3. 異常系で正しいエラー型が返る
  4. テストカバレッジがこのフェーズの対象コードを網羅

---

## フェーズ C: 実実装 (Layer 3 — 前半)

> **外部依存:** mistralrs（実I/O）, serde_json（JSON config）
> **非同期I/O:** ファイル読み取り、mistralrs 推論呼び出し

### マイルストーン M3: 本実装

#### チケット M3-1: GgufConfig::build 完全実装 (config.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§4.2 JSON マルチソースマージ, §Implementation 設定マージの実装詳細)
* **依存・関連チケットID:** 先行実装必須: M1-4（merge_overlay）。先行実装必須: M0-5（構造体定義）。後続: 全エントリポイント。
* **対象不変条件 / 規範:** `build()` は3層を順次マージする。ファイル読み取りに失敗した場合は `GgufError::InvalidConfig` を返す。include_str! の JSON が不正な場合も `InvalidConfig`。マージ順序（低→高: コード → 埋め込みJSON → ファイルJSON）は不変。
* **実装の背景と目的:** RFC の3層マージの中核実装。このチケットで初めてファイル I/O が導入される。include_str! はコンパイル時に埋め込まれるため、ファイル不存在のエラーは `build()` では発生せず、`from_file()` のみで発生する。この設計により、組み込み用途（voiput crate 等）ではファイル不在のリスクなく設定可能。
* **実装スコープ:**
  - `GgufConfig::build(code_layer, embedded_json, file_path)` 完全実装
  - `GgufConfig::from_file(path, base)` — ファイル読み取り + マージ
  - `GgufConfig::from_json_str(json, base)` — JSON パース + マージ
  - `GgufConfig::merge(layers: Vec<ConfigLayer>) -> Result<Self>` — 任意の層数を動的にマージ（`build()` の一般化）
    - `ConfigLayer::Code` → 直接適用
    - `ConfigLayer::JsonStr` → `serde_json::from_str` + `merge_overlay`
    - `ConfigLayer::File` → `std::fs::read_to_string` + `serde_json::from_str` + `merge_overlay`
    - 層の順序（低→高）でマージ適用
  - エラーハンドリング：ファイル不存在・JSON不正・必須フィールド欠落

* **テストコードによる検証:**
  1. 3層マージの結合テスト（コード設定 + 埋め込みJSON + ファイルJSON）
  2. ファイル不存在時のエラー
  3. 不正なJSONファイルのエラー
  4. コード設定のみ（ファイル・埋め込みなし）で意図通り動作
  5. ファイルJSONがコード設定を上書きすることを確認

#### チケット M3-2: InferenceEngine generate / generate_structured 実装 (inference/generate.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§2.3 推論単位でのモデル切替, `generate()`, `generate_structured()`, §5.1 Structured Output)
* **依存・関連チケットID:** 先行実装必須: M2-1（トレイト定義）、M2-2（ModelRegistry::get）。後続: M3-3/M3-4（同じ impl ブロック内だが並行可能）、M4-1（サーバーからの呼び出し）。
* **対象不変条件 / 規範:** `generate()` は `ModelRegistry::get(model_name)` でモデルを解決し、mistralrs の同期的推論 API を呼び出す。`generate_structured()` は mistralrs の Constraint::Grammar / Json を使用して JSON Schema 拘束を適用。どちらも model_name でモデルを切り替え可能。GenerateParams の値は mistralrs のパラメータに適切にマッピングされる。
* **実装の背景と目的:** ggufrs の最も基本的な推論機能。このチケットで初めて mistralrs の実際の推論 API が呼ばれる。GgufModelBuilder の設定（context_size, gpu_layers 等）が ModelInfo のフィールドから正しく渡されることを保証する。
* **実装スコープ:**
  - `inference/generate.rs` 作成
  - `generate()` 実装（モデル解決 → mistralrs 推論 → 文字列出力）
  - `generate_structured()` 実装（モデル解決 → JSON Schema 拘束推論 → Value 出力）
  - `[::STUB::]` ModelRegistry::get 内の実際のモデルロードロジック（GgufModelBuilder）
  - `From<GenerateParams>` for mistralrs::GenerationParams（または同等の変換）
  - `inference/mod.rs` で generate.rs を `pub mod` として宣言

* **テストコードによる検証:**
  1. generate() が正常に文字列を返す（環境にモデルがあれば結合テスト、なければ mock 検証）
  2. generate_structured() が JSON Schema に従った出力を返す
  3. 存在しないモデル名で `ModelNotFound` エラー
  4. GenerateParams の各フィールドが mistralrs パラメータに正しくマッピングされる
  5. モデル切り替え（0.8B → 2B）が正しく動作する

#### チケット M3-3: InferenceEngine generate_stream 実装 (inference/stream.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§2.3 `generate_stream()`, §5.2 ストリーミングと通常生成)
* **依存・関連チケットID:** 先行実装必須: M2-1（トレイト定義）、M2-2（ModelRegistry::get）。並行可能: M3-2（依存関係は同一だがファイル分割されている）。
* **対象不変条件 / 規範:** 戻り値は `Pin<Box<dyn Stream<Item = Result<String>> + Send>>`。ストリームは各チャンクを逐次的に生成し、エラー時は `Err` 項目を出力してストリームが終了する。チャンクの順序は保証される。
* **実装の背景と目的:** ストリーミング生成はユーザー体験の要。最初のトークンが生成されるまでのレイテンシを最小化するため、逐次生成を採用する。
* **実装スコープ:**
  - `inference/stream.rs` 作成
  - `generate_stream()` 実装（mistralrs のストリーミング API を `futures::Stream` でラップ）
  - モデル解決 → ストリーム作成
  - `inference/mod.rs` で stream.rs を `pub mod` として宣言

* **テストコードによる検証:**
  1. ストリームから全チャンクを収集できる
  2. ストリームが正しい順序でチャンクを生成する
  3. エラー時にストリームが適切に終了する
  4. 空メッセージ時の動作

#### チケット M3-4: InferenceEngine send_raw 実装 (inference/raw.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§2.3 `send_raw()`, 低レベルAPI設計)
* **依存・関連チケットID:** 先行実装必須: M2-1（トレイト定義）、M2-2（ModelRegistry::get）。並行可能: M3-2/M3-3。
* **対象不変条件 / 規範:** `send_raw()` は mistralrs の `RequestBuilder` をそのまま受け取り、モデル名でモデルを解決して mistralrs に委譲する。戻り値は `ChatCompletionResponse`。このメソッドは mistralrs の全機能を透過的に提供するためのパススルーであり、ggufrs が引数や戻り値を解釈・加工しない。
* **実装の背景と目的:** 高レベル3メソッドの限界を超えた mistralrs の全機能（tools, web search, code execution 等）にアクセスするためのパス。mistralrs が新機能を追加した場合も、`RequestBuilder` の拡張のみで対応でき、ggufrs のトレイト自体の変更は不要。
* **実装スコープ:**
  - `inference/raw.rs` 作成
  - `send_raw()` 実装（RequestBuilder を mistralrs に委譲）
  - `inference/mod.rs` で raw.rs を `pub mod` として宣言

* **テストコードによる検証:**
  1. send_raw が適切な ChatCompletionResponse を返す（mock 検証）
  2. モデル名の解決が正しく行われる
  3. RequestBuilder の内容が改変されずに mistralrs に渡される

#### チケット M3-5: lib.rs 統合・re-export 実装 (lib.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§8.3 mistralrs 型の re-export, モジュール構成)
* **依存・関連チケットID:** 先行実装必須: M3-2/M3-3/M3-4（InferenceEngine 実装完了）、M2-3（GgufEngine::new()）。後続: M4-2、M5-2。
* **対象不変条件 / 規範:** 全ての公開型・トレイトが `pub use` で lib.rs から再エクスポートされる。crate 利用者は `use ggufrs::*` で全機能にアクセス可能。mistralrs の主要型（Model, RequestBuilder, TextMessages 等）も同様に re-export。
* **実装の背景と目的:** crate の公開APIを統一的に提供する。crate 利用者が ggufrs だけを依存関係に追加すればよく、mistralrs を直接依存に追加する必要をなくす。
* **実装スコープ:**
  - 全モジュールの `pub mod` 宣言
  - 全公開型の `pub use` re-export（mistralrs 型を含む）
  - ドキュメンテーションコメント（lib.rs の crate レベル doc comment）

* **テストコードによる検証:**
  1. `use ggufrs::*` で全公開型がインポート可能
  2. ドキュメンテーションコメントが `cargo doc --no-deps` で正しく生成される
  3. `cargo build` が成功する

---

## フェーズ D: サーバーモード (Layer 3 — 後半)

> **外部依存:** axum, tokio (signal), futures, reqwest（dev）
> **非同期I/O:** Axum サーバー起動、HTTP リクエスト処理

### マイルストーン M4: サーバー起動・運用

#### チケット M4-1: サーバールーター + ハンドラ実装 (server/router.rs, server/openai.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§3.1 ハイブリッドアーキテクチャ, §3.2 ルーティング設計, §3.3 複数モデルのルーティング)
* **依存・関連チケットID:** 先行実装必須: M3-2/M3-3/M3-4（InferenceEngine 全実装完了）。先行実装必須: M2-1（AppState 型定義に必要）。
* **対象不変条件 / 規範:** `AppState = Arc<dyn InferenceEngine + Send + Sync>`。`AppError` は `GgufError` から自動変換。ハンドラはリクエストボディから model フィールドを抽出し、InferenceEngine のメソッドを呼び出す。3つのエンドポイントを実装：OpenAI /v1/chat/completions、/v1/models、Anthropic /anthropic/v1/messages。
* **実装の背景と目的:** サーバーモードのコア実装。Axum のルーター層でモデル名を解決し、実際の LLM 推論は InferenceEngine に委譲する。OpenAI 互換と Anthropic 互換の2系統のエンドポイントを同一サーバーで提供する。
* **実装スコープ:**
  - `server/router.rs` 作成
    - `build_router(engine: AppState) -> Router`
    - `AppState` 型エイリアス
    - `AppError` 型エイリアス + `From<GgufError>` 実装
  - `server/openai.rs` 作成
    - `openai_chat_handler()` — POST /v1/chat/completions（引数: `Json<ChatCompletionRequest>`、戻り値: `Result<Json<ChatCompletionResponse>, AppError>`）
    - `list_models_handler()` — GET /v1/models（戻り値: `Json<serde_json::Value>`、OpenAI 互換モデル一覧形式）
    - `anthropic_messages_handler()` — POST /anthropic/v1/messages
      - **mistralrs は Anthropic 互換型を提供しない**ため、引数・戻り値とも `Json<serde_json::Value>` を取る
      - `llm_bridge_core::transform::anthropic_to_openai()` でリクエストを OpenAI 形式に変換してから `send_raw()` に委譲
      - `engine.send_raw()` の結果を `serde_json::to_value()` で汎用 JSON に変換し、`llm_bridge_core::transform::openai_to_anthropic()` で Anthropic 形式に逆変換して応答
  - `server/mod.rs` でルーターを `pub` として統合
  - `ChatCompletionRequest` / `ChatCompletionResponse` の mistralrs 型を使用（OpenAI ハンドラ用）
  - `llm-bridge-core` の transform モジュールを使用（RFC §3.1 参照: [docs.rs](https://docs.rs/llm-bridge-core/latest/llm_bridge_core/), [GitHub](https://github.com/TokenFleet-AI/llm-bridge-rust/tree/master)）

* **テストコードによる検証:**
  1. モックエンジンを使ってサーバーが正しくリクエストをルーティングする
  2. model フィールドが正しく抽出される
  3. 未知のモデル名で適切なエラーレスポンスが返る
  4. OpenAI 互換レスポンス形式に準拠している
  5. Anthropic 互換レスポンス形式に準拠している

#### チケット M4-2: GgufEngine サーバー統合 (lib.rs, server/mod.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§3.4 非同期サーバー起動とシャットダウン, §Implementation サーバー起動のフラグ制御)
* **依存・関連チケットID:** 先行実装必須: M4-1（ルーター実装）、M2-3（GgufEngine::new()）。後続: M5-2（test-run バイナリから呼び出し）。
* **対象不変条件 / 規範:** `start_server()` は `self: Arc<Self>` を要求し、JoinHandle を内部に保存して返す。`new_with_auto_start()` は `auto_start_server=true` の場合のみサーバーを自動起動。`Drop` 実装は `server_handle.abort()` を呼ぶ。`shutdown_signal()` は Ctrl+C と SIGTERM を補足。
* **実装の背景と目的:** サーバーのライフサイクル管理。`start_server()` はいつでも呼び出し可能で、呼び出し元は戻り値の JoinHandle で死活監視・abort・終了待機ができる。Drop 時の graceful shutdown によりリソースリークを防止する。
* **実装スコープ:**
  - `GgufEngine::start_server(self: Arc<Self>, config: ServerConfig) -> Result<JoinHandle<Result<()>>>`
    - build_router 呼び出し
    - TcpListener::bind + axum::serve
    - graceful shutdown 信号処理
    - JoinHandle の内部保存
  - `GgufEngine::new_with_auto_start(config: GgufConfig) -> Result<Arc<Self>>`
    - auto_start_server フラグチェック
    - tokio::spawn による自動起動
  - `GgufEngine::drop()` — server_handle.abort()
  - `shutdown_signal()` — Ctrl+C + SIGTERM

* **テストコードによる検証:**
  1. start_server が正常にサーバーを起動する（ポート 0 で bind 確認）
  2. 起動したサーバーにリクエストが到達する（mock エンジン使用）
  3. auto_start_server=true で new 時にサーバーが起動する
  4. auto_start_server=false でサーバーが起動しない
  5. Drop 時にサーバーが graceful shutdown される

#### チケット M4-3: サーバー結合テスト (tests/server_integration_test.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§9.1 単体テスト, §9.2 結合テスト)
* **依存・関連チケットID:** 先行実装必須: M4-1（ルーター）、M4-2（サーバー起動）。並行可能: 他テスト。
* **対象不変条件 / 規範:** mockall のモックエンジンを使用。実モデルは不要。サーバーはポート 0 で起動し OS が自動割当。各テストは独立したサーバーインスタンスで実行。
* **実装の背景と目的:** サーバーの結合テストにより、ルーター・ハンドラ・モデル解決の一連の流れが正しく動作することを確認する。モックエンジンを使用するため、実モデルがなくても高速に実行可能。
* **実装スコープ:**
  - `tests/server_integration_test.rs` 作成
  - テスト: OpenAI 互換エンドポイントのリクエスト/レスポンス
  - テスト: Anthropic 互換エンドポイントのリクエスト/レスポンス
  - テスト: モデル切り替え（model フィールドの変更）
  - テスト: 未知のモデル名 → エラーレスポンス
  - テスト: 不正なリクエストボディ → エラーレスポンス
  - テスト: サーバー起動 → リクエスト → シャットダウンのライフサイクル

* **テストコードによる検証:**
  1. 全テスト通過
  2. サーバーが正しくリクエストを処理する
  3. エラーケースで適切な HTTP ステータスコードが返る

---

## フェーズ E: ビルド・ツーリング・結合テスト (Layer 4)

> **外部依存:** curl / powershell（build.rs）、reqwest（test クライアント）
> **非同期I/O:** モデルファイルダウンロード、ファイルシステム操作

### マイルストーン M5: プラットフォーム統合

#### チケット M5-1: build.rs モデル自動ダウンロード

* **参照設計書:** crates/ggufrs/RFC.md (§7.1 ダウンロード方式, §7.2 ファイル構成, Appendix A)
* **依存・関連チケットID:** 先行実装必須: M0-1（Cargo.toml）。独立して実装可能（他のクレートコードに依存しない）。
* **対象不変条件 / 規範:** ダウンロードは curl（Unix）または powershell（Windows）で行う。タイムアウトは60秒。ダウンロード失敗時は不完全ファイルを削除して panic。モデルファイルが既に存在する場合はスキップする。`cargo:rerun-if-changed=models/` で再ビルド条件を指定。
* **実装の背景と目的:** 「clone & build」だけで推論実行を可能にするための最重要機能。voiput crate と同一方式を採用し、プロジェクト全体の一貫性を保つ。2つのビルトインモデル（Qwen3.5-0.8B, Qwen3.5-2B）を自動ダウンロードする。
* **実装スコープ:**
  - `crates/ggufrs/build.rs` 作成
  - `MODEL_FILES` 定数配列（ファイル名 + URL）
  - ダウンロード関数: `cfg(not(target_os = "windows"))` curl 版 + `cfg(target_os = "windows")` powershell 版
  - main 関数: ディレクトリ作成 → ダウンロード → 存在確認
  - 変更検知: `cargo:rerun-if-changed=models/`
  - `crates/ggufrs/.gitignore` に `/models/` が含まれていることを確認

* **テストコードによる検証:**
  1. build.rs がコンパイル可能である（`cargo check`）
  2. モデルが存在しない場合にダウンロードが試行される（手動確認用）
  3. モデルが既に存在する場合はスキップされる（冪等性）
  4. 全ダウンロード完了後にモデルファイルの存在を確認する assert が通る
  5. `.gitignore` に `/models/` が含まれている（ファイル読み取りで確認）

#### チケット M5-2: test-run バイナリ (src/bin/test-run.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§9.3 test-run バイナリ)
* **依存・関連チケットID:** 先行実装必須: M3-5（lib.rs 統合）。先行推奨: M4-2（サーバー起動、必須ではない）。
* **対象不変条件 / 規範:** 3パターンの推論を順次実行：Structured Output → 通常生成 → ストリーミング生成。各パターンはセパレーターとラベル付きで表示。最終サマリーで全パターンの PASS/FAIL を一覧表示。`cargo run --bin test-run` で実行可能。
* **実装の背景と目的:** 人間が目視確認できる全パターン推論実行バイナリ。開発中のクイックチェックと、エンドツーエンドの動作検証を目的とする。実モデルを使用するため、build.rs でモデルがダウンロード済みであることが前提。
* **実装スコープ:**
  - `src/bin/test-run.rs` 作成
  - GgufEngine 初期化（CPU-Only モード）
  - Pattern 1: Structured Output（校正アシスタント JSON 出力）
  - Pattern 2: Text Generation（Rust 説明）
  - Pattern 3: Streaming Generation（自己紹介）
  - サマリー表示（PASS / FAIL）
  - エラー時は即座に panic せず、サマリーで FAIL 表示

* **テストコードによる検証:**
  1. コンパイル可能（`cargo check --bin test-run`）
  2. 全パターンが順次実行される（実行結果は目視確認）
  3. モデル不在時に明確なエラーメッセージを表示する

#### チケット M5-3: 結合テスト (tests/integration_test.rs)

* **参照設計書:** crates/ggufrs/RFC.md (§9.2 結合テスト)
* **依存・関連チケットID:** 先行実装必須: M5-1（build.rs: モデルがダウンロード済み）。先行実装必須: M3-5（全推論機能実装完了）。
* **対象不変条件 / 規範:** 実モデル（Qwen3.5-0.8B）を使用。モデルが存在しない場合はテストが失敗する（フォールバックなし）。`GpuProvider::Cpu` + `cpu_only: true` で GPU 非依存。`#[ignore]` 属性で CI ではスキップ可能。
* **実装の背景と目的:** 実際の GGUF モデルを使ったエンドツーエンドの結合テスト。build.rs がダウンロードしたモデルを使用するため、手動配置は不要。開発環境でのみ実行し、CI では `#[ignore]` で明示的にスキップする。
  - **モデルパス解決**: `env!("CARGO_MANIFEST_DIR")` を使用してコンパイル時に `crates/ggufrs/models/` を解決すること（`std::env::current_dir()` は cargo test のワーキングディレクトリに依存し不安定なため使用禁止）。
* **実装スコープ:**
  - `tests/integration_test.rs` 作成
  - `test_real_model_structured_output()` — 実際のモデルで Structured Output 推論
  - `test_real_model_generate()` — 実際のモデルで通常生成
  - `test_model_not_found_error()` — ModelRegistry のエラーパス
  - `test_server_with_mock_engine()` — モック + Axum サーバー結合（実モデル不要）
  - `#[ignore]` 属性の適切な付与

* **テストコードによる検証:**
  1. `cargo test` で全テストが通過（モデルが存在する環境）
  2. 実モデルテストが正しい推論結果を返す
  3. エラーパスで適切なエラー型が返る
  4. `#[ignore]` テストが `cargo test` でスキップされる

#### チケット M5-4: Cargo.toml feature flags 最終調整 + GPU 自動検証

* **参照設計書:** crates/ggufrs/RFC.md (§8.1 Cargo.toml, §8.2 GPU feature の分離)
* **依存・関連チケットID:** 先行実装必須: M0-1（Cargo.toml 骨格）。後続処理なし（最終調整）。
* **対象不変条件 / 規範:** `default = ["cpu"]`。cpu feature は空。metal/cuda/directml は mistralrs の対応 feature を有効化。`make check-be` が成功すること。GPU feature がコンパイル時に正しく分離されていること。
* **実装の背景と目的:** 開発の最終段階で feature flags を再確認・調整する。実際の mistralrs の feature 構造と ggufrs の feature 設計が一致していることを検証し、必要に応じて調整する。
* **実装スコープ:**
  - Cargo.toml feature 定義の最終確認
  - `make check-be` 全 feature 組み合わせでのビルド検証
  - ドキュメンテーションコメントの補完
  - 全ファイルの最終コードレビュー

* **テストコードによる検証:**
  1. `cargo build --features metal` が成功する（macOS）
  2. `cargo build --features cuda` が成功する（CUDA 環境）
  3. `cargo build`（CPU モード）が成功する
  4. `cargo test` 全テスト通過
  5. `cargo clippy` が warnings 0 で通過

---

## チケット依存関係サマリー

```
M0-1: Cargo.toml プロジェクト骨格
  ├── M0-2: consts/settings.rs
  ├── M0-3: GpuProvider 列挙型
  ├── M0-4: GgufError 列挙型
  ├── M0-5: 設定構造体定義 ← M0-2(Default定数), M0-3
  │   └── M0-6: ModelInfo 構造体 ← M0-5
  │       └── M1-5: ModelRegistry 同期メソッド ← M0-6
  │           └── M2-2: ModelRegistry 非同期メソッド ← M1-5
  │               ├── M2-3: GgufEngine::new() ← M2-2
  │               └── M3-2: InferenceEngine generate/structured ← M2-2, M2-1
  │                   ├── M3-3: InferenceEngine stream ← M2-2, M2-1
  │                   ├── M3-4: InferenceEngine send_raw ← M2-2, M2-1
  │                   │   └── M3-5: lib.rs 統合 ← M3-2,M3-3,M3-4
  │                   │       ├── M5-2: test-run バイナリ ← M3-5
  │                   │       └── M5-3: 結合テスト ← M3-5
  │                   └── M4-1: サーバールーター ← M3-2,M3-3,M3-4, M2-1
  │                       └── M4-2: GgufEngine サーバー統合 ← M4-1, M2-3
  │                           └── M4-3: サーバー結合テスト ← M4-1, M4-2
  ├── M1-1: ModelConfig コンストラクタ ← M0-5
  ├── M1-2: GpuProvider メソッド ← M0-3
  ├── M1-3: GgufError From impls ← M0-4
  ├── M1-4: GgufConfig マージロジック ← M0-5
  │   └── M3-1: GgufConfig::build + merge 完全実装 ← M1-4, M0-5(ConfigLayer)
  └── M5-1: build.rs ← M0-1 (独立)

M2-1: InferenceEngine トレイト定義 + GenerateParams ← M0-2(定数), M0-3, M0-4
  ├── M2-4: mockall 単体テスト ← M2-1, M2-2
  └── (上記 M3-2,M3-3,M3-4 へ)

M5-4: feature flags 最終調整 ← 全チケット完了後
```

## 実装順序の推奨

```
Phase A (純粋ロジック):
  Step 1: M0-1 (Cargo.toml) → M0-2 (定数) → M0-3 (GpuProvider) → M0-4 (GgufError) → M0-5 (設定構造体) → M0-6 (ModelInfo)
  Step 2: M1-1 (ModelConfig コンストラクタ) → M1-2 (GpuProvider メソッド) → M1-3 (From impls) → M1-4 (マージロジック) → M1-5 (Registry 同期)

Phase B (非同期基盤):
  Step 3: M2-1 (トレイト定義) → M2-2 (Registry 非同期) → M2-3 (GgufEngine::new) → M2-4 (単体テスト)

Phase C (実実装):
  Step 4: M3-1 (GgufConfig::build) — 並行可: M3-2 (generate) + M3-3 (stream) + M3-4 (raw) → M3-5 (lib.rs 統合)

Phase D (サーバー):
  Step 5: M4-1 (ルーター) → M4-2 (サーバー統合) → M4-3 (サーバー結合テスト)

Phase E (ビルド・ツーリング):
  Step 6: M5-1 (build.rs) — M5-2 (test-run) — M5-3 (結合テスト) — M5-4 (最終調整)
```
