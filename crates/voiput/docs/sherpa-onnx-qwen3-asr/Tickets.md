# RFC: trate 抽象化層の導入と Qwen3-ASR ローカル音声認識バックエンドの実装 — 実装チケット分解設計書

> **生成元:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md`
> **生成日:** 2026-06-16
> **分析済みセクション:** §1 (全体アーキテクチャ)、§2 (trate トレイト設計)、§3 (SttEngine::Local)、§4 (Qwen3-ASR 設定)、§5 (Qwen3AsrBackend)、§6 (LocalRecognizer)、§7 (SpeechRecognizer)、§8 (モデルライフサイクル)、§9 (PostCorrection)、§10 (Config バリデーション)、§11 (テスト)、§12 (依存関係)、Implementation (実装順序)

---

## 第1段階: 純粋ロジック・型定義の完全隔離

> **外部依存:** なし（anyhow のみ）。sherpa-onnx への依存は第3段階以降。
> **原則:** この段階の全チケットはコンパイルが通る状態を維持しながら進める。trate crate は voiput から完全に独立しているため、並行して作業可能。

### マイルストーン M0: trate crate のスキャフォールディング

> **注意:** 本プロジェクトには `[workspace]` セクションを持つ Cargo.toml は存在しない（確認済み: 2026-06-16）。trate は独立した crate として作成し、voiput から path 依存で参照する。workspace 化は将来課題とする。
> **DB:** 使用しない（メモリ内完結）

#### ✅ チケット M0-1: trate Cargo.toml + lib.rs の作成

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§1 — crates/trate/ ディレクトリ構成、§12 — 依存関係)
* **依存・関連チケットID:** 後続: M1-1 (AsrBackend trait 定義)、M1-2 (LocalAsrBackend trait 定義)。先行実装必須のチケットはなし。
* **対象不変条件 / 規範:**
  - trate crate は `sherpa-onnx` に依存しない（純粋なトレイト定義のみの軽量クレート）
  - エディション 2021
  - 依存は `anyhow = "1"` のみ
  - 本プロジェクトは cargo workspace を使用していない。trate は独立した Cargo.toml を持つ単独 crate とし、voiput から path 依存で参照する。
* **実装の背景と目的:** AsrBackend トレイトを外部クレートから実装可能にするための crate として trate を新設する。このチケットではクレートの骨格（Cargo.toml + 空の lib.rs）のみを作成し、後続のトレイト定義チケットの土台とする。本プロジェクトは cargo workspace を使用していないため、trate は独立した単独 crate として作成する。
* **実装スコープ:**
  - `crates/trate/Cargo.toml` 作成:
    ```toml
    [package]
    name = "trate"
    version = "0.1.0"
    edition = "2021"

    [dependencies]
    anyhow = "1"
    ```
  - `crates/trate/src/lib.rs` 作成（空。後続チケットでトレイト定義を追加）
  - `make check-be` でコンパイル確認（この時点では trate は空クレート）
* **テストコードによる検証:**
  1. `cargo check`（voiput 単独）が成功すること
  2. `cargo check --manifest-path crates/trate/Cargo.toml` が成功すること
  3. trate が `anyhow` のみに依存していること（`cargo tree --manifest-path crates/trate/Cargo.toml` で確認）
* **計装方法・観測対象:** `cargo check` の成功。Cargo.toml の依存関係ツリー。

#### チケット ✅ M0-2: trate クレートの empty lib.rs コンパイル確認

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§1 — crates/trate/src/lib.rs)
* **依存・関連チケットID:** M0-1 が完了していること。後続: M1-1, M1-2。
* **対象不変条件 / 規範:** trate crate が空の状態でビルド可能であること
* **実装の背景と目的:** trate crate が独立した Rust パッケージとして正しくビルド可能であることを最低限確認する。後続チケットでトレイト定義を追加するための基盤確認。
* **実装スコープ:**
  - `crates/trate/src/lib.rs` の空ファイル作成（内容なし）
* **テストコードによる検証:**
  1. `cargo check --manifest-path crates/trate/Cargo.toml` が成功すること
* **計装方法・観測対象:** `cargo check` exit code 0

---

### マイルストーン M1: AsrBackend + LocalAsrBackend トレイト定義

> **DB:** 使用しない（メモリ内完結）

#### ✅ チケット M1-1: AsrBackend トレイトの定義

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§2 — trate crate のトレイト設計、§2.1 — 将来のローカルASRモデル追加、§2.2 — 既存トレイトからの移行)
* **依存・関連チケットID:** 先行実装必須: M0-1。後続: M1-2 (LocalAsrBackend は AsrBackend を継承)、M3-2 (voiput 移行)。並列可能: M2 群（voiput 型定義）。
* **対象不変条件 / 規範:**
  - `transcribe(&mut self, samples: &[f32]) -> Result<String>` のシグネチャは既存 voiput の `AsrBackend::transcribe` と完全に同一であること
  - `post_correct()`, `insert_punctuation()`, `backend_name()`, `record_asr_usage()` はデフォルト実装を持つこと
  - トレイトは `Send` を継承すること（`PseudoAsrStreamer` がスレッド間転送を要求するため）
  - **⚠️ 以下のメソッドは既存の実コードから意図的に変更されている（後述の「設計上の変更点」を参照）:**
    - 既存 `model_name() -> String` → trate `backend_name() -> &'static str`（名称・戻り値型とも変更）
    - 既存 `insert_punctuation(_locale: &StreamerLocale)` → trate `(_locale: &str)`（trate が voiput 内部型に依存しないための設計判断）
    - 既存で必須だった `post_correct()`, `record_asr_usage()` → trate ではデフォルト実装化
* **実装の背景と目的:** voiput 内部の非公開トレイト `AsrBackend` を trate crate に抽出し、外部クレートから実装可能にする。`transcribe()` のシグネチャは完全に維持するが、その他メソッドは trate が voiput 内部型（`StreamerLocale`）に依存しないよう、かつ新規バックエンドの実装負荷を下げるために変更を加える。これらの変更は M3-3（OpenAIBackend 移行）で対処する。
* **設計上の変更点（既存コードとの差異）:**
  1. `model_name() -> String` → `backend_name() -> &'static str`:
     - 理由: 設定可能なモデル名（"whisper-1" 等）ではなく、固定のバックエンド識別子（"openai-whisper", "qwen3-asr" 等）を返す設計に変更。`OpenAIBackend` 側で従来の動的モデル名の提供が必要な場合は別途対応する。
  2. `insert_punctuation(locale: &StreamerLocale)` → `locale: &str`:
     - 理由: trate は voiput 内部の `StreamerLocale` 型に依存できないため。呼び出し側（PseudoAsrStreamer / BackendWrapper）で `StreamerLocale` → `&str` の変換が必要。
  3. `post_correct()`, `record_asr_usage()` にデフォルト実装を追加:
     - 理由: ローカル ASR バックエンド（Qwen3AsrBackend）はこれらのメソッドを必要としないため。既存の OpenAIBackend の明示的実装はそのまま維持される。
* **実装スコープ:**
  - `crates/trate/src/lib.rs` に `AsrBackend` トレイトを定義（RFC §2 のコードブロック通り）:
    ```rust
    pub trait AsrBackend: Send {
        fn transcribe(&mut self, samples: &[f32]) -> Result<String>;
        fn post_correct(&mut self, text: &str) -> Result<String> { Ok(text.to_string()) }
        fn backend_name(&self) -> &'static str { "unknown" }
        fn record_asr_usage(&mut self, _duration_ms: u64) {}
        fn insert_punctuation(&mut self, text: &str, _locale: &str) -> Result<String> { Ok(text.to_string()) }
    }
    ```
  - 型エイリアスや再公開は不要（lib.rs に直接定義）
  - `mod local;` の宣言を追加（M1-2 で local.rs を追加するため、今宣言）
* **テストコードによる検証:**
  1. MockBackend でトレイトが実装可能であること（コンパイル時検証）
  2. MockBackend の `transcribe()` が期待通り動作すること（正常系）
  3. `backend_name()` がデフォルト値 "unknown" を返すこと（デフォルト実装検証）
  4. `post_correct()`, `insert_punctuation()`, `record_asr_usage()` のデフォルト実装が動作すること
* **計装方法・観測対象:** コンパイル成功。MockBackend による各メソッドの戻り値検証。

#### ✅ チケット M1-2: LocalAsrBackend トレイトの定義

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§2.1 — 将来のローカルASRモデル追加に備えた LocalAsrBackend)
* **依存・関連チケットID:** 先行実装必須: M1-1 (AsrBackend を継承するため)。後続: M4-3 (Qwen3AsrBackend が LocalAsrBackend を impl)。
* **対象不変条件 / 規範:**
  - `LocalAsrBackend: AsrBackend`（継承関係）
  - `model_path(&self) -> &str` はエラーメッセージ用の識別情報を提供する
  - `is_healthy(&self) -> bool` はバックエンドが正常に初期化されているか確認する
* **実装の背景と目的:** ローカル ASR バックエンドに固有の情報（モデルパス、ヘルスチェック）を提供する拡張トレイト。将来 Whisper / SenseVoice 等の追加時もこのトレイトを実装することで、`LocalRecognizer` からの統一的アクセスを可能にする。
* **実装スコープ:**
  - `crates/trate/src/local.rs` 作成（RFC §2.1 のコードブロック通り）:
    ```rust
    use crate::AsrBackend;

    pub trait LocalAsrBackend: AsrBackend {
        fn model_path(&self) -> &str;
        fn is_healthy(&self) -> bool;
    }
    ```
  - `crates/trate/src/lib.rs` で `pub mod local;` を宣言（M1-1 で宣言済みなら修正不要）
* **テストコードによる検証:**
  1. MockLocalBackend で `LocalAsrBackend` が実装可能であること（コンパイル時検証）
  2. `LocalAsrBackend` が `AsrBackend` のメソッドをすべて継承していること
  3. `model_path()`, `is_healthy()` が期待通り動作すること
* **計装方法・観測対象:** コンパイル成功。MockLocalBackend による各メソッドの戻り値検証。

#### ✅ チケット M1-3: trate クレートのモックベース単体テスト

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§11.1 — trate クレートのテスト)
* **依存・関連チケットID:** 先行実装必須: M1-1, M1-2。後続チケットのブロッカーではない（trate 単体テストは trate 内部で完結）。
* **対象不変条件 / 規範:**
  - 全テストがメモリ内完結（ファイルI/O、ネットワークI/O なし）
  - 決定論的（同一入力 → 同一出力、乱数依存なし、クロック依存なし）
  - ミリ秒単位で完結
* **実装の背景と目的:** `AsrBackend` トレイトの契約が正しく機能することを MockBackend を用いて検証する。このテストは trate crate に同梱され、`cargo test -p trate` で単独実行可能。sherpa-onnx やモデルファイルに依存しないため、CI でも常に成功する。
* **実装スコープ:**
  - `crates/trate/src/lib.rs` 内の `#[cfg(test)] mod tests` に実装
  - `MockBackend` 構造体の定義（RFC §11.1 のコードブロック通り）
  - テストケース:
    - `test_mock_backend_transcribe_empty` — 空のサンプル配列で空文字列が返ること
    - `test_mock_backend_transcribe_non_empty` — 非空サンプルでモック結果が返ること
    - `test_mock_backend_default_backend_name` — デフォルトで "unknown" が返ること
    - `test_mock_backend_post_correct_passthrough` — `post_correct` デフォルト実装が素通しであること
    - `test_mock_backend_insert_punctuation_passthrough` — `insert_punctuation` デフォルト実装が素通しであること
* **テストコードによる検証:**
  1. 正常系: 空入力 → 空文字列出力
  2. 正常系: 非空入力 → モック結果出力
  3. デフォルト実装: `backend_name()` → "unknown"
  4. デフォルト実装: `post_correct()` → 入力がそのまま出力
  5. デフォルト実装: `insert_punctuation()` → 入力がそのまま出力
* **計装方法・観測対象:** `cargo test -p trate` の全テスト成功。カバレッジ 100%（MockBackend の全メソッド網羅）。

---

### マイルストーン M2: voiput 型定義拡張（LocalAsrKind / Qwen3AsrModelPaths / Qwen3AsrConfig / SttEngine::Local / Constants）

> **DB:** 使用しない（メモリ内完結）
> **警告:** `SttEngine::Local` バリアントを追加した瞬間、既存の全 `match SttEngine` 式が非網羅になりコンパイルエラーが発生する。これは許容される中間状態だが、次のマイルストーン M3（SpeechRecognizer 移行）までに解消すること。この期間中は `make check-be` が失敗することをチームに周知する。

#### ✅ チケット M2-1: LocalAsrKind 列挙型の定義

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§3 — SttEngine::Local バリアント)
* **依存・関連チケットID:** 先行実装必須: なし（純粋な型定義）。後続: M2-4 (SttEngine::Local)、M4-1 (local/mod.rs で使用)。
* **対象不変条件 / 規範:**
  - `#[derive(Debug, Clone, Copy, PartialEq, Eq)]`
  - バリアントは `Qwen3Asr` のみ（将来 `Whisper`, `SenseVoice` 等が追加される想定）
* **実装の背景と目的:** ローカル ASR バックエンドの種別を表す enum。SttEngine::Local の内部データとして保持され、LocalRecognizer::new() でバックエンドのディスパッチに使用される。将来のモデル追加はこの enum にバリアントを追加するのみ。
* **実装スコープ:**
  - `crates/voiput/src/types.rs` に追加（RFC §3 のコードブロック通り）:
    ```rust
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum LocalAsrKind {
        Qwen3Asr,
    }
    ```
* **テストコードによる検証:**
  1. `LocalAsrKind::Qwen3Asr` が `Debug` トレイトを実装していること
  2. `LocalAsrKind::Qwen3Asr` が `Clone` + `Copy` 可能であること
  3. `LocalAsrKind::Qwen3Asr == LocalAsrKind::Qwen3Asr` が成立すること（PartialEq + Eq）
* **計装方法・観測対象:** コンパイル成功。derive マクロによる自動実装の確認。

#### ✅ チケット M2-2: SttEngine::Local バリアントの追加

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§3 — SttEngine::Local バリアント)
* **依存・関連チケットID:** 先行実装必須: M2-1 (LocalAsrKind)。後続: M3-2 (SpeechRecognizer 分岐追加)、M5-1 (LocalRecognizer::new の kind 引数)。**このチケット実施後、既存の全 match SttEngine 式が非網羅になる。**
* **対象不変条件 / 規範:**
  - `SttEngine` は `#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]` を維持
  - `#[default]` は `Os` のまま変更しない
  - 新バリアント: `Local { backend: LocalAsrKind }`
* **実装の背景と目的:** 新しい認識エンジン種別として Local（ローカル ASR）を追加する。既存の OpenAI / Os と並ぶ第3の選択肢。このバリアント追加により、SpeechRecognizer の dispatch ロジックで match 分岐が可能になる。
* **実装スコープ:**
  - `crates/voiput/src/types.rs` の `SttEngine` enum に以下を追加:
    ```rust
    Local { backend: LocalAsrKind },
    ```
* **テストコードによる検証:**
  1. `SttEngine::Local { backend: LocalAsrKind::Qwen3Asr }` が構築可能であること
  2. `SttEngine::default()` が `SttEngine::Os` を返すこと（既存動作不変）
  3. `SttEngine::Local { backend: LocalAsrKind::Qwen3Asr }.debug` がフォーマット可能であること
* **計装方法・観測対象:** コンパイルが通ること（ただし既存 match の非網羅エラーは後続チケットで解消）。型の構築可能性。

#### ✅ チケット M2-3: Qwen3AsrModelPaths + Qwen3AsrConfig 構造体の定義

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§4 — Qwen3-ASR 設定構造体)
* **依存・関連チケットID:** 先行実装必須: なし。後続: M4-2 (Qwen3AsrBackend::new で config を使用)、M6-2 (VoiputConfigBuilder.validate で qwen3_asr_config を検証)。
* **対象不変条件 / 規範:**
  - `Qwen3AsrModelPaths` は 4 つの必須フィールド（encoder, decoder, joiner, tokens）を持つ
  - `Qwen3AsrConfig` は `model_paths`, `provider`, `num_threads`, `debug` の 4 フィールドを持つ
  - いずれも `#[derive(Debug, Clone)]`
* **実装の背景と目的:** Qwen3-ASR バックエンドの設定情報を保持するデータ構造。VAD モデル管理パターン（VadModelPaths）と一貫した設計とすることで、既存のパス解決関数（resolve_vad_model_path）を流用可能にする。また、`VoiputConfig` 構造体への `qwen3_asr_config` フィールド追加と `VoiputConfigBuilder` への builder メソッド追加も本チケットで行う（M5-1 の `LocalRecognizer::new` と M6-2 のバリデーションの前提条件）。
* **実装スコープ:**
  - `crates/voiput/src/types.rs` に追加（RFC §4 のコードブロック通り）:
    ```rust
    #[derive(Debug, Clone)]
    pub struct Qwen3AsrModelPaths {
        pub encoder: String,
        pub decoder: String,
        pub joiner: String,
        pub tokens: String,
    }

    #[derive(Debug, Clone)]
    pub struct Qwen3AsrConfig {
        pub model_paths: Qwen3AsrModelPaths,
        pub provider: String,
        pub num_threads: i32,
        pub debug: bool,
    }
    ```
  - `crates/voiput/src/config.rs` の `VoiputConfig` 構造体にフィールド追加:
    ```rust
    /// Qwen3-ASR 設定（engine == Local(Qwen3Asr) の場合のみ必要）
    pub qwen3_asr_config: Option<Qwen3AsrConfig>,
    ```
  - `crates/voiput/src/config.rs` の `VoiputConfigBuilder` にフィールド追加:
    ```rust
    qwen3_asr_config: Option<Qwen3AsrConfig>,
    ```
  - `VoiputConfigBuilder` に builder メソッド追加:
    ```rust
    pub fn qwen3_asr_config(mut self, c: Qwen3AsrConfig) -> Self {
        self.qwen3_asr_config = Some(c);
        self
    }
    ```
  - `build()` メソッドの `Ok(VoiputConfig { ... })` に `qwen3_asr_config: self.qwen3_asr_config` を追加
* **テストコードによる検証:**
  1. `Qwen3AsrModelPaths` がすべてのフィールドを公開し構築可能であること
  2. `Qwen3AsrConfig` が `Debug` + `Clone` を実装していること
  3. フィールドアクセスが期待通り動作すること
* **計装方法・観測対象:** コンパイル成功。構造体のインスタンス化とフィールドアクセス。

#### ✅ チケット M2-4: Qwen3 モデルファイル名定数の追加

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§4 — constants.rs モデルファイル名定数)
* **依存・関連チケットID:** 先行実装必須: なし（定数なので純粋）。後続: M2-5 (パス解決関数で使用)、M7-1 (build.rs で使用)。
* **対象不変条件 / 規範:**
  - 定数名は `pub(crate)` 可視性
  - モデルファイル名は HuggingFace pantinor/sherpa-onnx-qwen3-asr-0.6b-int8 のファイル名と一致すること
  - サブディレクトリ名は VAD モデルとの `tokens.txt` 衝突回避のため `qwen3-asr/`
* **実装の背景と目的:** Qwen3-ASR モデルファイル名とサブディレクトリ名を定数として一元管理する。これにより build.rs のダウンロード処理と実行時のパス解決で同一のファイル名を使用することが保証される。VAD モデル管理パターンとの一貫性も確保する。
* **実装スコープ:**
  - `crates/voiput/src/constants.rs` に追加（RFC §4 のコードブロック通り）:
    ```rust
    pub(crate) const MODEL_FILENAME_QWEN3_ENCODER: &str = "encoder.int8.onnx";
    pub(crate) const MODEL_FILENAME_QWEN3_DECODER: &str = "decoder.int8.onnx";
    pub(crate) const MODEL_FILENAME_QWEN3_JOINER: &str = "joiner.int8.onnx";
    pub(crate) const MODEL_FILENAME_QWEN3_TOKENS: &str = "tokens.txt";
    pub(crate) const QWEN3_MODEL_SUBDIR: &str = "qwen3-asr";
    ```
* **テストコードによる検証:**
  1. 各定数が正しいファイル名文字列を保持していること
  2. `QWEN3_MODEL_SUBDIR` が "qwen3-asr" であること
  3. VAD モデルの `tokens.txt` と Qwen3-ASR の `tokens.txt` が同一名だが別ディレクトリで管理される設計であること（コードレビューで確認）
* **計装方法・観測対象:** コンパイル成功。定数値のリテラル一致確認。

#### ✅ チケット M2-5: パス解決の純粋関数群

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§4 — resolve_qwen3_model_paths コードブロック、Implementation Step 3 + Appendix C — resolve_qwen3_asr_config)
* **依存・関連チケットID:** 先行実装必須: M2-3 (Qwen3AsrConfig), M2-4 (定数)。後続: M4-2 (Qwen3AsrBackend::new が config を要求)。
* **対象不変条件 / 規範:**
  - `resolve_qwen3_model_paths()`: 既存の `resolve_vad_model_path()` を流用する
  - `resolve_qwen3_asr_config()`: `model_dir` が設定されている場合に各モデルファイルの相対パスを解決する
  - 絶対パス（`/` 始まり）は解決せずそのまま使用する
  - パス解決に副作用（ファイル作成・ネットワークアクセス）がない純粋関数であること
* **実装の背景と目的:** Qwen3-ASR モデルファイルへのパスを、設定ファイルから解決する純粋関数群。絶対パスと相対パスの両方に対応し、model_dir 設定との組み合わせを処理する。VAD モデルパターンと完全に一貫した設計。
* **実装スコープ:**
  - `recognizer.rs` に `resolve_qwen3_model_paths()` 実装（RFC §4 のコードブロック通り）
  - `recognizer.rs` に `resolve_qwen3_asr_config()` 実装（RFC Appendix C のコードブロック通り）
  - いずれも `pub(crate)` または内部関数として定義
* **テストコードによる検証:**
  1. 絶対パス指定時にそのままのパスが返ること
  2. 相対パス + model_dir 指定時に結合されたパスが返ること
  3. model_dir 未指定時に相対パスがそのまま返ること
  4. サブディレクトリ名 `qwen3-asr` が正しくパスに含まれること
  5. `resolve_qwen3_asr_config()` が `qwen3_asr_config = None` 時に `None` を返すこと
* **計装方法・観測対象:** 関数の入出力ペアの検証。外部依存なしの純粋関数であるため、決定論的テストが可能。

---

## 第2段階: voiput の trate 移行と型アダプテーション

> **外部依存:** trate crate（workspace 内パス依存）
> **原則:** この段階では trate crate へのトレイト移行を完了させる。ただし、RFC のトレイト設計は既存の `AsrBackend` から以下の変更を含むため、単なるコード移動ではなくメソッド名・引数型の変更が発生する。詳細は M1-1「設計上の変更点」を参照。
>
> | メソッド | 既存（voiput） | 新規（trate） |
> |---------|----------------|---------------|
> | `transcribe()` | `(&mut self, samples: &[f32]) -> Result<String>` | **同一** |
> | `model_name()` | `(&self) -> String` | `backend_name() -> &'static str`（名称・戻り値型変更） |
> | `insert_punctuation()` locale型 | `&StreamerLocale` | `&str`（trate が voiput 型に依存しないための変更） |
> | `post_correct()` | 必須（デフォルト実装なし） | デフォルト実装化（既存の明示的実装はそのまま維持） |
> | `record_asr_usage()` | 必須（デフォルト実装なし） | デフォルト実装化（既存の明示的実装はそのまま維持） |

### マイルストーン M3: voiput → trate AsrBackend 移行

> **DB:** 使用しない

#### ✅ チケット M3-1: voiput Cargo.toml への trate 依存追加

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (Implementation Step 2 — voiput の trate 依存)
* **依存・関連チケットID:** 先行実装必須: M0-1 (trate crate が存在すること)、M1-1 (AsrBackend trait が定義されていること)。後続: M3-2, M3-3。
* **対象不変条件 / 規範:**
  - 依存パスは `path = "../trate"`（相対パス依存）
  - 本プロジェクトは cargo workspace を使用していないため、workspace 解決ではなく明示的な path 依存
* **実装の背景と目的:** voiput crate が trate crate を参照できるようにするための依存関係追加。このチケットのみでは voiput のコンパイルに変化はない（trate の型をまだ use していないため）が、後続の AsrBackend 移行チケットの前提条件となる。
* **実装スコープ:**
  - `crates/voiput/Cargo.toml` の `[dependencies]` に追記:
    ```toml
    trate = { path = "../trate" }
    ```
* **テストコードによる検証:**
  1. `cargo check` が成功すること（既存挙動不変）
  2. `cargo tree` で trate が依存ツリーに現れること
* **計装方法・観測対象:** cargo check の exit code。依存ツリーの表示。

#### ✅ チケット M3-2: pipeline/streamer.rs AsrBackend トレイトの削除と trate 参照への変更 + lib.rs 再公開更新

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§2.2 — 既存 AsrBackend トレイトからの移行、Appendix B — PseudoAsrStreamer の型パラメータ制約)
* **依存・関連チケットID:** 先行実装必須: M3-1。後続: M3-3。**M2-2 (SttEngine::Local) とは独立しているため並行可能。**
* **対象不変条件 / 規範:**
  - `PseudoAsrStreamer<B>` の型制約 `B: AsrBackend + Send + Sync + 'static` は維持（`AsrBackend` の所在のみ変更）
  - transcribe() のシグネチャ `(&mut self, samples: &[f32]) -> Result<String>` は一切変更しない
  - トレイト定義の削除後、そのトレイトを実装していた型（OpenAIBackend）がコンパイルエラーになる中間状態が発生するが、M3-3 で解消する
  - `lib.rs` の `pub use pipeline::streamer::AsrBackend` はリンク切れになるため、`pub use trate::AsrBackend` に置き換える。これにより外部 crate（binary/test-run.rs）の `use voiput::AsrBackend` が引き続き動作する。
* **実装の背景と目的:** voiput 内部の `AsrBackend` トレイト定義を削除し、trate crate の `AsrBackend` を使用するように変更する。これにより外部クレートからの実装が可能になる。`PseudoAsrStreamer` や `BackendWrapper` などの周辺型はトレイトの所在変更のみで、実装内容に影響はない。また、`lib.rs` で `pub use trate::AsrBackend` として再公開することで、外部の `use voiput::AsrBackend` コードを引き続き動作させる。
* **実装スコープ:**
  - `crates/voiput/src/pipeline/streamer.rs` から既存の `AsrBackend` トレイト定義（5メソッド）を削除
  - 代わりに `use trate::AsrBackend;` を追加
  - `PseudoAsrStreamer`、`BackendWrapper` の型制約はそのまま（trate の AsrBackend が継承する Send により充足）
  - `crates/voiput/src/lib.rs` L75-77 の再公開行を変更:
    ```rust
    // 変更前: pub use pipeline::streamer::{AsrBackend, ...};
    // 変更後: pub use pipeline::streamer::{BackendWrapper, PseudoAsrStreamer, StreamerConfig, StreamerEvent, StreamerLocale};
    pub use trate::AsrBackend;
    ```
* **テストコードによる検証:**
  1. 既存の `PseudoAsrStreamer` 関連テストが変更なくコンパイル・通過すること（MockBackend の更新は M3-3 で行う）
  2. `BackendWrapper` の型制約が充足されていること
  3. `cargo check` が成功すること（ただし OpenAIBackend の impl は M3-3 までエラー）
  4. `voiput::AsrBackend` のパスが trate のトレイトを解決すること（コンパイル時検証）
* **計装方法・観測対象:** `cargo check` で streamer.rs 関連のエラーがゼロであること（OpenAIBackend + MockBackend のエラーは許容）。

#### ✅ チケット M3-3: OpenAIBackend の AsrBackend 実装修正

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (Appendix A — 既存コードの AsrBackend → trate 移行パターン、M1-1「設計上の変更点」)
* **依存・関連チケットID:** 先行実装必須: M3-2。後続: M3-4。**M2-2 (SttEngine::Local) とは独立しているため並行可能。**
* **対象不変条件 / 規範:**
  - 移行前: `use crate::pipeline::streamer::AsrBackend;`
  - 移行後: `use trate::AsrBackend;`
  - **⚠️ `model_name()` → `backend_name()` の変更、および `insert_punctuation()` の locale 引数型変更が必要（下記実装スコープ参照）**
  - `transcribe()` のシグネチャは変更なし
  - `post_correct()` と `record_asr_usage()` は既存の明示的実装をそのまま維持（trate のデフォルト実装でオーバーライドされる）
* **実装の背景と目的:** OpenAIBackend の `AsrBackend` 実装を、移設先の `trate::AsrBackend` トレイトに適合させる。M1-1「設計上の変更点」で述べた通り、`model_name()` は `backend_name()` に名称変更され、戻り値も `String` から `&'static str` に変更される。また `insert_punctuation()` の locale 引数は `&StreamerLocale` から `&str` に変更される。これは trate が voiput 内部型に依存しないための設計判断である。
* **実装スコープ:**
  - `crates/voiput/src/backends/openai.rs` の use 行を変更:
    ```rust
    // 移行前: use crate::pipeline::streamer::AsrBackend;
    // 移行後: use trate::AsrBackend;
    ```
  - `model_name(&self) -> String` → `backend_name(&self) -> &'static str` に変更:
    ```rust
    // 変更前: fn model_name(&self) -> String { self.openai_config.model.clone() }
    // 変更後: fn backend_name(&self) -> &'static str { "openai-whisper" }
    ```
    - 従来の動的モデル名（"whisper-1" 等）が必要な場合は、別途 `OpenAIBackend` の公開メソッドとして提供することを検討する
  - `insert_punctuation(&mut self, text: &str, _locale: &StreamerLocale)`
    → `insert_punctuation(&mut self, text: &str, _locale: &str)` に変更:
    ```rust
    // 変更前: fn insert_punctuation(&mut self, text: &str, _locale: &StreamerLocale) -> Result<String> {
    // 変更後: fn insert_punctuation(&mut self, text: &str, _locale: &str) -> Result<String> {
    ```
    - 実装本体は `_locale` が未使用のため、引数名と型の変更のみでロジック不変
  - `post_correct()`, `record_asr_usage()` は既存の実装をそのまま維持（デフォルト実装でオーバーライド）
* **テストコードによる検証:**
  1. `impl AsrBackend for OpenAIBackend` が trate のトレイト境界を充足すること（コンパイル時検証）
  2. `backend_name()` が `"openai-whisper"` を返すこと
  3. `transcribe()` の動作が移行前後で不変であること
  4. `post_correct()` / `record_asr_usage()` の動作が移行前後で不変であること
* **計装方法・観測対象:** コンパイル成功。各メソッドの戻り値検証。

#### ✅ チケット M3-4: テストコードのトレイト変更対応（streamer.rs + binary/test-run.rs）

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (Appendix A — 移行パターン)
* **依存・関連チケットID:** 先行実装必須: M3-3 (OpenAIBackend 側の対応完了)。後続: M3-5（最終検証）。
* **対象不変条件 / 規範:**
  - `streamer.rs` の `MockBackend` と `binary/test-run.rs` の `MockStreamerBackend` が trate の `AsrBackend` トレイトを正しく実装すること
  - これらのテストコードはトレイトの移行に伴い以下のメソッド変更が必要:
    - `model_name() -> String` → `backend_name() -> &'static str`
  - `binary/test-run.rs` の `use voiput::AsrBackend` パスは M3-2 の lib.rs 再公開更新により自動的に trate を指すため、use 行の変更は不要（lib.rs が `pub use trate::AsrBackend` を再公開するため）
* **実装の背景と目的:** streamer.rs 内の `MockBackend`（テスト用）と `binary/test-run.rs` 内の `MockStreamerBackend` は、いずれも `AsrBackend` トレイトを実装している。trate 移行に伴い `model_name()` → `backend_name()` のメソッド変更が必要。これらを更新せずに M3-3 のみ完了しても、`make test` が失敗する。
* **実装スコープ:**
  - `crates/voiput/src/pipeline/streamer.rs` L612-625 の `MockBackend`:
    ```rust
    impl AsrBackend for MockBackend {
        fn transcribe(&mut self, _samples: &[f32]) -> Result<String> { /* 変更なし */ }
        fn post_correct(&mut self, text: &str) -> Result<String> { /* 変更なし */ }
        // 変更前: fn model_name(&self) -> String { "mock".to_string() }
        // 変更後:
        fn backend_name(&self) -> &'static str { "mock" }
        fn record_asr_usage(&mut self, _duration_ms: u64) {}  // 変更なし
    }
    ```
  - `binary/test-run.rs` L800 の `MockStreamerBackend`:
    - `model_name()` → `backend_name()` の変更（同上）
    - use 行は `use voiput::AsrBackend` のまま（lib.rs が trate を再公開するため変更不要）
* **テストコードによる検証:**
  1. `make test` の既存テストが全件パスすること（MockBackend の更新後）
  2. `streamer.rs` の `test_empty_audio`, `test_restart` が正常に動作すること
  3. `binary/test-run.rs` のテストコードがコンパイル可能であること
* **計装方法・観測対象:** `cargo test` の成功。

#### ✅ チケット M3-5: voiput 移行完了確認（make check-be + テスト全件パス）

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (Implementation Step 2 — 6. make check-be でコンパイルを確認)
* **依存・関連チケットID:** 先行実装必須: M3-4。後続: 第3段階全体。
* **対象不変条件 / 規範:**
  - 既存テストが全て緑であること
  - cargo check が警告ゼロであること
* **実装の背景と目的:** trate 移行が完了したことを正式に確認するゲートチケット。この時点で `SttEngine::Local` 追加による非網羅 match はまだ残っている可能性がある（M2-2 が先に実施された場合）が、少なくとも AsrBackend 移行関連のコードは完全に動作する。
* **実装スコープ:**
  - `make check-be` 実行
  - `make test` 実行
  - テスト結果の確認
  - 実装作業なし（検証のみ）
* **テストコードによる検証:**
  1. `make check-be` 成功（trate 関連のコンパイルエラーゼロ）
  2. `make test` 全件パス（既存回帰ゼロ）
* **計装方法・観測対象:** make コマンドの exit code。

---

## 第3段階: ライフサイクル管理 — Qwen3AsrBackend / LocalRecognizer / SpeechRecognizer

> **外部依存:** sherpa-onnx（既存依存、version 1.13.2）、tokio（既存）
> **原則:** この段階のチケットは逐次実行（Qwen3AsrBackend → LocalRecognizer → SpeechRecognizer dispatch → Config validation）。各チケット完了時に `make check-be` が通ることを確認する。

### マイルストーン M4: Qwen3AsrBackend 実装（sherpa-onnx OfflineRecognizer）

> **DB:** 使用しない
> **注意:** sherpa-onnx の `OfflineRecognizer` は内部状態を持つため、`Qwen3AsrBackend` は `Mutex<OfflineRecognizer>` で保護する。この Mutex は認識精度には影響せず、複数スレッドからの `transcribe()` 呼び出しをシリアライズするための排他制御である。

#### ✅ チケット M4-1: local モジュール宣言 + lib.rs 公開

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§1 — crates/voiput/src/local/ ディレクトリ構成)
* **依存・関連チケットID:** 先行実装必須: なし（モジュール宣言のみ）。後続: M4-2 (qwen3.rs 実装の前提)、M5-1 (recognizer.rs の前提)。
* **対象不変条件 / 規範:**
  - `pub mod local` で外部公開
  - サブモジュール（`qwen3`, `recognizer`）はモジュール内で `pub mod` または `mod` として宣言
* **実装の背景と目的:** Qwen3-ASR 関連コードを格納する `local/` モジュールを作成し、voiput の lib.rs から公開する。これにより Qwen3AsrBackend や LocalRecognizer が `voiput::local::qwen3` 等のパスでアクセス可能になる。
* **実装スコープ:**
  - `crates/voiput/src/local/mod.rs` 作成:
    ```rust
    pub mod qwen3;
    pub mod recognizer;
    ```
  - `crates/voiput/src/local/qwen3.rs` 作成（空ファイル。M4-2 で実装）
  - `crates/voiput/src/local/recognizer.rs` 作成（空ファイル。M5-1 で実装）
  - `crates/voiput/src/lib.rs` に `pub mod local;` 追加
* **テストコードによる検証:**
  1. `cargo check -p voiput` が成功すること
  2. `voiput::local::qwen3::Qwen3AsrBackend`（将来型）のパスが解決可能であること（コンパイル時に未定義ならエラー — コンパイルで確認）
* **計装方法・観測対象:** コンパイル成功。

#### ✅ チケット M4-2: Qwen3AsrBackend の new() と transcribe() 実装

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§5 — Qwen3AsrBackend 実装)
* **依存・関連チケットID:** 先行実装必須: M2-3 (Qwen3AsrConfig)、M4-1 (local モジュール)。後続: M4-3 (LocalAsrBackend impl)。
* **対象不変条件 / 規範:**
  - `OfflineRecognizer::create()` が `None` を返した場合 → `anyhow!` でエラーを返す（RFC §5）
  - `samples` のサンプリングレートは常に 16000 固定（`PseudoAsrStreamer` パイプラインの不変条件）
  - `Mutex` で `OfflineRecognizer` を保護する（`create_stream()` が `&self` を取るため複数スレッドからの同時呼び出しを排他する必要がある）
  - `transcribe()` は `mut self` ではなく `&mut self` を取るが、内部の `Mutex` により排他制御は二重となる（安全側への倒れ込み）
* **実装の背景と目的:** sherpa-onnx の `OfflineRecognizer` をラップする `Qwen3AsrBackend` 構造体を実装する。このチケットでは `new()`（モデルロード）と `transcribe()`（認識実行＋結果取得）の 2 メソッドを実装する。RFC §5 のコードブロックをそのまま実装する。
* **⚠️ スタブ解決の義務: M2-5 で追加した 2 箇所の `[::STUB::]`（`resolve_qwen3_model_paths` / `resolve_qwen3_asr_config`）を本チケットで解決すること。** これらの関数は `Qwen3AsrBackend::new()` で初めて使用され、unused warning が解消される。
* **実装スコープ:**
  - `crates/voiput/src/local/qwen3.rs` に以下の実装（RFC §5 のコードブロック通り）:
    - `const QWEN3_SAMPLE_RATE: i32 = 16000`
    - `Qwen3AsrBackend` 構造体定義（`recognizer: Mutex<OfflineRecognizer>`, `config: Qwen3AsrConfig`）
    - `impl Qwen3AsrBackend { pub fn new(config: &Qwen3AsrConfig) -> Result<Self> }`
      - 引数の `config` は `resolve_qwen3_asr_config()` で解決済みの値を渡すことを前提とする
      - `OfflineRecognizerConfig::default()` から設定構築
      - `qwen3_asr` モデル設定（encoder/decoder/joiner）のセット
      - `tokens`, `provider`, `num_threads`, `debug` のセット
      - `OfflineRecognizer::create()` → `None` ならエラー
    - `impl AsrBackend for Qwen3AsrBackend { fn transcribe(...) }`
      - `recognizer.lock().unwrap()` で排他
      - `create_stream()`, `accept_waveform(QWEN3_SAMPLE_RATE, samples)`, `decode(stream)`, `get_result()`
      - `get_result()` → `None` ならエラー
  - `impl AsrBackend` に `fn backend_name(&self) -> &'static str { "qwen3-asr" }` を追加
* **テストコードによる検証:**
  1. モデル不在時: `Qwen3AsrBackend::new()` がエラーを返すこと（異常系）。モデルファイルが存在しない環境で常に検証可能。`qwen3_config_or_skip()` でスキップではなく、存在しないパスを強制的に渡してエラーを確認してもよい。
  2. コンパイル時検証: `AsrBackend` トレイト境界を充足していること
  3. `backend_name()` が `"qwen3-asr"` を返すこと
* **計装方法・観測対象:** エラーケースの検証は存在しないパスを渡すことで実現。正常系の結合テストは M8-2 で行う。

#### ✅ チケット M4-3: Qwen3AsrBackend の LocalAsrBackend 実装 + validate_qwen3_model_files

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§5 — LocalAsrBackend for Qwen3AsrBackend、§8.2 — 実行時のモデル検出とエラーハンドリング)
* **依存・関連チケットID:** 先行実装必須: M4-2。後続: M5-1 (LocalRecognizer が LocalAsrBackend を Box で保持)。
* **対象不変条件 / 規範:**
  - `model_path()` は `self.config.model_paths.encoder` を返す
  - `is_healthy()` は `OfflineRecognizer` が作成済み（＝`Self` が存在する）なら常に `true`
  - `validate_qwen3_model_files()` はファイル存在チェックのみ行う（SHA256 等の追加検証は行わない — `OfflineRecognizer::create()` 自体が整合性を検証するため）
* **実装の背景と目的:** Qwen3AsrBackend に LocalAsrBackend トレイトを実装する。これにより `Box<dyn LocalAsrBackend>` として LocalRecognizer に保持される。また、実行時のモデルファイル検証関数 `validate_qwen3_model_files()` を実装する。
* **実装スコープ:**
  - `crates/voiput/src/local/qwen3.rs` に追記:
    ```rust
    impl LocalAsrBackend for Qwen3AsrBackend {
        fn model_path(&self) -> &str {
            &self.config.model_paths.encoder
        }
        fn is_healthy(&self) -> bool {
            true // OfflineRecognizer が create() 成功済み = 常に healthy
        }
    }
    ```
  - `validate_qwen3_model_files()` 関数の実装（RFC §8.2 のコードブロック通り）。`recognizer.rs` または `local/qwen3.rs` に配置。ファイル存在チェックのみで、欠落時はエラーメッセージとともに `make download-models` の実行を促す。
* **テストコードによる検証:**
  1. `model_path()` が encoder パスを返すこと
  2. `is_healthy()` が `true` を返すこと
  3. `validate_qwen3_model_files()`:
     - 全ファイル存在時 → `Ok(())`
     - 1ファイル欠落時 → `Err`（bail!）に特定の文字列が含まれること
* **計装方法・観測対象:** テスト用に一時ディレクトリを作成し、ファイルの有無を制御して validate 関数の挙動を確認。

---

### マイルストーン M5: LocalRecognizer + LocalRecognizerAdapter

> **DB:** 使用しない
> **設計判断:** `LocalRecognizer` は Facade パターンにより、複数の Local ASR バックエンドを `Box<dyn LocalAsrBackend>` として統一的に扱う。`LocalRecognizerAdapter` は OpenAIRecognizer と同様の 3タスク構成（ticker + capture + streamer）を持ち、PseudoAsrStreamer との統合を担当する。

#### ✅ チケット M5-1: LocalRecognizer Facade の実装

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§6 — LocalRecognizer 統合)
* **依存・関連チケットID:** 先行実装必須: M4-3 (Qwen3AsrBackend impl LocalAsrBackend)、M2-1 (LocalAsrKind)。後続: M5-2 (LocalRecognizerAdapter)。
* **対象不変条件 / 規範:**
  - `LocalRecognizer` は `Box<dyn LocalAsrBackend>` を内部に保持する
  - `AsrBackend for LocalRecognizer` の `transcribe()` は内部の `self.backend.transcribe(samples)` に委譲する
  - `new()` は `LocalAsrKind` に応じてバックエンドを生成する（現時点では Qwen3Asr のみ）
  - `VoiputConfig.qwen3_asr_config` が `None` の場合、`SttEngine::Local(Qwen3Asr)` では構築時にエラーを返す
* **実装の背景と目的:** 複数のローカル ASR モデルを単一の `AsrBackend` 実装として扱うための Facade。PseudoAsrStreamer は `AsrBackend` トレイトに対してのみプログラミングされており、内部のバックエンドが変わっても一切の修正が不要になる。
* **実装スコープ:**
  - `crates/voiput/src/local/recognizer.rs` に実装（RFC §6 のコードブロック通り）:
    - `LocalRecognizer` 構造体（`backend: Box<dyn LocalAsrBackend>`, `kind: LocalAsrKind`, `locale: LocaleCode`）
    - `impl LocalRecognizer { pub fn new(kind: LocalAsrKind, config: &VoiputConfig) -> Result<Self> }`
      - 現時点では `LocalAsrKind::Qwen3Asr` のみの分岐
      - Qwen3Asr の場合は `qwen3_asr_config` の existence check → `Qwen3AsrBackend::new()`
    - `impl AsrBackend for LocalRecognizer { fn transcribe() { self.backend.transcribe(samples) } }`
    - `fn backend_name()` で kind に応じた名前を返す
* **テストコードによる検証:**
  1. `LocalRecognizer::new(LocalAsrKind::Qwen3Asr, config)` が `qwen3_asr_config = None` 時にエラーを返すこと
  2. `LocalRecognizer` が `AsrBackend` トレイトを実装していること（コンパイル時検証）
  3. `backend_name()` が `"qwen3-asr"` を返すこと
* **計装方法・観測対象:** コンパイル時検証 + エラーケースの単体テスト。

#### ✅ チケット M5-2: LocalRecognizerAdapter の実装

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§7 — SpeechRecognizer ディスパッチ — LocalRecognizerAdapter)
* **依存・関連チケットID:** 先行実装必須: M5-1 (LocalRecognizer)。後続: M6-1 (SpeechRecognizer が adapter を使用)。
* **対象不変条件 / 規範:**
  - `LocalRecognizerAdapter` は OpenAIRecognizer と同様の 3タスク構成（ticker + capture + streamer）を持つ
  - `PseudoAsrStreamer<LocalRecognizer>` を内部で保持する
  - `new()` で `LocalRecognizer` を生成し、PseudoAsrStreamer でラップする
  - `unimplemented!()` / `todo!()` の使用は禁止（RFC §7 明記）
* **実装の背景と目的:** LocalRecognizer アダプターは、`OpenAIRecognizer` と同様のインターフェースを `SpeechRecognizer` に提供する。これにより `SpeechRecognizer` は OpenAI と Local のバックエンドを同一のパターン（`start/stop/tick/set_locale/update_config`）で操作できる。
* **実装スコープ:**
  - `crates/voiput/src/recognizer.rs` に `LocalRecognizerAdapter` 構造体を追加:
    - `streamer: Arc<Mutex<Option<PseudoAsrStreamer<LocalRecognizer>>>>`
    - `tx: mpsc::Sender<SttEvent>`
    - `language: LocaleCode`
    - その他 OpenAIRecognizer と同様のフィールド
  - `impl LocalRecognizerAdapter`:
    - `pub fn new(tx: mpsc::Sender<SttEvent>, config: &VoiputConfig) -> Result<Self>`
    - `pub fn start(&mut self)`
    - `pub fn stop(&mut self)`
    - `pub fn set_locale(&mut self, locale: LocaleCode)`
    - `pub fn update_config(&mut self, config: &VoiputConfig) -> Result<()>`
* **テストコードによる検証:**
  1. `new()` が正しい config で成功すること（正常系）
  2. `new()` が不正な config（qwen3_asr_config = None）でエラーを返すこと（異常系）
  3. `set_locale()` が内部ロケールを更新すること
  4. `stop()` → `start()` の再開がエラーなく動作すること
  5. `unimplemented!()` / `todo!()` が使用されていないこと（コードレビュー）
* **計装方法・観測対象:** `new()` の成功/失敗条件。`set_locale()` の内部状態変更。

---

### マイルストーン M6: SpeechRecognizer ディスパッチ + Config バリデーション

> **DB:** 使用しない
> **注意:** このマイルストーンで既存の match 非網羅エラーがすべて解消される。M6-3 で `make check-be` の完全成功を確認する。

#### ✅ チケット M6-1: SpeechRecognizer の start/stop/tick/set_locale/update_config Local 分岐

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§7 — SpeechRecognizer ディスパッチ、各メソッドの動作表)
* **依存・関連チケットID:** 先行実装必須: M2-2 (SttEngine::Local), M5-2 (LocalRecognizerAdapter)。依存されるチケット: なし（このチケット完了で match 非網羅エラーが解消される）。
* **対象不変条件 / 規範:**
  - `tick()` は Local バックエンドでは **no-op**（PseudoAsrStreamer タスクがバックグラウンド処理を行うため）
  - `set_locale()` は `LocalRecognizerAdapter` 内部のロケールを更新する
  - `update_config()` は以下の順序で実行: ① 動作中なら `stop()` ② `LocalRecognizerAdapter` を再生成（古いインスタンスの Drop で OfflineRecognizer 解放）③ `start()` で再開
  - `validate_config()` は SttEngine::Local の場合常に `Ok(())`（詳細検証は VoiputConfigBuilder.validate に委譲）
  - **`unimplemented!()` / `todo!()` の使用禁止**
* **実装の背景と目的:** SpeechRecognizer に SttEngine::Local の分岐を追加する。各メソッドの動作は RFC §7 の動作表に従い、OpenAI バックエンドと同等の振る舞いを提供する。これにより M2-2 で発生した match 非網羅エラーがすべて解消される。
* **⚠️ スタブ解決の義務: M2-2 で追加した 4 箇所の `[::STUB::]` マーカーを全て除去すること。** 除去漏れがある場合、`find-all-stubs.js` で検出される。
* **スタブ一覧（M2-2 で追加、本チケットで解決）:**
  1. `recognizer.rs:226` — `validate_config()`: `SttEngine::Local { .. } => Ok(())`（暫定）
  2. `recognizer.rs:389` — `start()`: `SttEngine::Local { .. } => { log::error!("..."); ... }`（暫定）
  3. `recognizer.rs:425` — `stop()`: `SttEngine::Local { .. } => {}`（暫定）
  4. `recognizer.rs:550` — `tick()`: `SttEngine::Local { .. } => {}`（暫定）
* **実装スコープ:**
  - `crates/voiput/src/recognizer.rs` の各メソッドに `SttEngine::Local` の分岐を追加:
    - `SpeechRecognizer` 構造体に `local_recognizer: Option<LocalRecognizerAdapter>` フィールド追加
    - `start()`: `SttEngine::Local` の場合 → `local_recognizer.start()`（RFC §7 コードブロック通り）
    - `stop()`: `SttEngine::Local` の場合 → `local_recognizer.stop()`
    - `tick()`: `SttEngine::Local` の場合 → no-op（早期 return）
    - `set_locale()`: `LocalRecognizerAdapter` の `set_locale()` を呼ぶ
    - `update_config()`: stop → 再生成(start) の順序で実行
    - `validate_config()`: `SttEngine::Local` の場合 → `Ok(())`
  - **上記 4 箇所の `[::STUB::]` を除去し、本実装に置き換える**
* **テストコードによる検証:**
  1. `SttEngine::Local` 時の全メソッドがパニックしないこと（エラー時は log::error で出力）
  2. `tick()` が no-op であること（内部状態不変）
  3. `set_locale()` が内部ロケールを更新すること
  4. `start()` → `stop()` → `start()` の再開がエラーなく動作すること
  5. `update_config()` が古いインスタンスを解放し新しいインスタンスで再開すること
* **計装方法・観測対象:** 各メソッドの呼び出し結果（戻り値 + パニックの有無）。内部状態の変化（is_running フラグ等）。

#### ✅ チケット M6-2: VoiputConfigBuilder.validate() の Local 検証

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§10 — VoiputConfigBuilder バリデーション)
* **依存・関連チケットID:** 先行実装必須: M2-2 (SttEngine::Local), M2-3 (Qwen3AsrConfig)。後続: なし。
* **対象不変条件 / 規範:**
  - `SttEngine::Local(Qwen3Asr)` 時: `qwen3_asr_config` が `None` の場合はエラーリストに追加
  - `SttEngine::OpenAI` 時: 既存と同様に `openai_config` の existence check
  - `SttEngine::Os` 時: 追加設定不要（既存のまま）
  - エラーメッセージは日本語（ユーザーが即座に理解できる）
* **実装の背景と目的:** VoiputConfigBuilder の validate() メソッドに、SttEngine::Local 選択時の設定検証を追加する。これにより、Local バックエンドに必要な設定（モデルファイルパス等）が漏れている場合にビルド時または起動時に明確なエラーを報告できる。
* **実装スコープ:**
  - `crates/voiput/src/config.rs` の `VoiputConfigBuilder::validate()` に RFC §10 の分岐を追加:
    ```rust
    SttEngine::Local { backend: LocalAsrKind::Qwen3Asr } => {
        if self.qwen3_asr_config.is_none() {
            errors.push("SttEngine::Local(Qwen3Asr) を選択する場合、...".into());
        }
    }
    ```
* **テストコードによる検証:**
  1. `SttEngine::Local(Qwen3Asr)` + `qwen3_asr_config = None` → エラーが発生すること
  2. `SttEngine::Local(Qwen3Asr)` + `qwen3_asr_config = Some(...)` → `Ok(())`
  3. `SttEngine::OpenAI` + `openai_config = None` → エラーが発生すること（既存動作不変）
  4. `SttEngine::Os` → 常に `Ok(())`（既存動作不変）
  5. エラーメッセージが日本語であること
* **計装方法・観測対象:** validate() の戻り値（Ok / Err とエラー内容）。エラーメッセージの言語確認。

#### ✅ チケット M6-3: コンパイル完了確認（make check-be 全警告ゼロ）

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (Implementation Step 5 — 4. make check-be でコンパイルを確認)
* **依存・関連チケットID:** 先行実装必須: M6-1, M6-2。依存されるチケット: 第4段階全体。
* **対象不変条件 / 規範:**
  - `cargo check` が警告ゼロ
  - `SttEngine::Local` の全 match が網羅されていること
  - 未使用コード・未使用インポートの警告がないこと
* **実装の背景と目的:** 第3段階の完了を確認する検証ゲート。この時点で SttEngine::Local 関連の全コード（型定義 → Qwen3AsrBackend → LocalRecognizer → SpeechRecognizer dispatch → Config validation）がコンパイル可能な状態になる。
* **実装スコープ:**
  - `make check-be` 実行
  - 発生した警告の修正（未使用 import の削除、未使用変数の `_` プレフィックス等）
  - `cargo check` のクリーン成功確認
* **テストコードによる検証:**
  1. `make check-be` が警告ゼロで成功すること
  2. `cargo check` が 0 warnings であること
* **計装方法・観測対象:** `make check-be` exit code 0 + 警告カウント 0。

---

## 第4段階: プラットフォーム結合 — Build / Fixtures / Integration Test

> **外部依存:** HuggingFace（モデルダウンロード）、ffmpeg（テストフィクスチャ生成）、hound crate（WAV 生成）
> **原則:** この段階では実際のモデルファイルと音声ファイルを使用した結合テストを実施する。モデル不在時はテストをスキップする設計とし、CI ではモデルをキャッシュする運用を想定。

### マイルストーン M7: build.rs モデルダウンロード + テストフィクスチャ

> **DB:** 使用しない（ファイルシステムへのダウンロード）

#### ✅ チケット M7-1: build.rs への Qwen3-ASR モデルファイルダウンロード追加

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§8.1 — build.rs によるダウンロード)
* **依存・関連チケットID:** 先行実装必須: M2-4 (モデルファイル名定数)。後続: M7-2。
* **対象不変条件 / 規範:**
  - `QWEN3_MODEL_FILES` 定数は4ファイル（encoder, decoder, joiner, tokens）の URL ペアを定義する
  - ダウンロード先は `models/qwen3-asr/` サブディレクトリ（RFC §8.1 のディレクトリ構造通り）
  - 既存の VAD モデルダウンロードループに Qwen3 ファイルのダウンロードを追加する
  - サブディレクトリの自動作成が必要（`std::fs::create_dir_all`）
  - `cargo:rerun-if-changed=models/` により既存ファイルは再ダウンロードしない
  - VAD モデルの `tokens.txt` とファイル名が衝突するため、`qwen3-asr/` サブディレクトリで分離する（RFC §8.1 最終段落）
* **実装の背景と目的:** Qwen3-ASR の ONNX モデルファイル（約600MB）をビルド時に自動ダウンロードする。既存の VAD モデルダウンロードパターン（build.rs）を完全に踏襲し、`cargo:rerun-if-changed` によりキャッシュを効かせる。
* **実装スコープ:**
  - `crates/voiput/build.rs` に以下を追加:
    - `QWEN3_MODEL_FILES` 定数（RFC §8.1 のコードブロック通り、4ファイルの URL ペア）
    - ダウンロードループへの統合（各ファイルを `models/qwen3-asr/` にダウンロード）
    - サブディレクトリ作成処理（`create_dir_all("models/qwen3-asr")`）
  - `make download-models` 相当の方法でファイルが正しく配置されることを確認する
* **テストコードによる検証:**
  1. `make download-models` を mininal 実行し、4ファイルが `models/qwen3-asr/` に存在すること
  2. `cargo:rerun-if-changed` により、既存ファイルは再ダウンロードされないこと
  3. ダウンロード失敗時のエラーハンドリングが適切であること（ネットワークエラー → ビルド警告 + 継続、またはエラー終了）
* **計装方法・観測対象:** ファイル存在確認。ダウンロード処理の成否。ビルド時間の増分測定。

#### ✅ チケット M7-2: テスト用サンプル音声ファイルの配置

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§11.2 — テスト用サンプル音声ファイル、Appendix D — 生成方法)
* **依存・関連チケットID:** 先行実装必須: なし（独立したフィクスチャ準備）。後続: M8-2 (Qwen3AsrBackend 結合テスト)。
* **対象不変条件 / 規範:**
  - サンプル音声ファイルは `crates/voiput/tests/fixtures/silence_16k_mono.wav` に配置
  - フォーマット: 16kHz モノラル、PCM s16le、0.5〜1秒
  - OpenAI バックエンドのテスト用にも使用可能な汎用ファイルとする
  - 無音ファイルの代わりに短い発話を含む WAV ファイルでもよい
* **実装の背景と目的:** Qwen3AsrBackend の結合テストで使用するテストフィクスチャを準備する。CI 環境でもテストが実行できるよう、自動生成またはリポジトリにコミットする方法を選択する。
* **実装スコープ:**
  - `crates/voiput/tests/fixtures/` ディレクトリを作成（存在しない場合）
  - `silence_16k_mono.wav` を配置（RFC Appendix D のいずれかの方法）:
    - 方法A: `ffmpeg` で生成 → `ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 0.5 -acodec pcm_s16le -ar 16000 -ac 1 crates/voiput/tests/fixtures/silence_16k_mono.wav`
    - 方法B: テストコード内で `hound` を使用してプログラム的に生成（`generate_silence_wav()` 関数）
  - `tests/fixtures/.gitkeep` または同様のプレースホルダ（空ディレクトリを git 追跡するため）
* **テストコードによる検証:**
  1. ファイルが正しいフォーマットであること（`hound::WavReader` で読み取り可能）
  2. サンプリングレートが 16000 であること
  3. チャンネル数が 1（モノラル）であること
  4. ビット深度が 16 であること
* **計装方法・観測対象:** WAV ファイルのヘッダー検証（hound で読み取り）。ファイルサイズの確認。

---

### マイルストーン M8: 結合テスト + 全テスト通過確認

> **DB:** 使用しない
> **テスト戦略:** Qwen3AsrBackend の結合テストは実モデルファイル（約600MB）を必要とする。モデル不在時はスキップする設計とし、CI ではモデルキャッシュからの実行を想定。

#### ✅ チケット M8-1: Qwen3AsrBackend 結合テスト（実モデル + 実音声、モデル不在時スキップ）

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§11.2 — Qwen3AsrBackend のテスト)
* **依存・関連チケットID:** 先行実装必須: M4-2 (Qwen3AsrBackend), M7-2 (テストフィクスチャ)。
* **対象不変条件 / 規範:**
  - モデルファイルが存在しない場合はテストをスキップ（eprintln でメッセージ出力 + return）
  - テストは `#[cfg(test)]` 内で動作し、特別な feature flag を必要としない
  - `qwen3_config_or_skip()` ヘルパーでモデル存在チェック → 不在時は `None` を返す
  - WAV 読み込みには `hound` crate を使用（`Cargo.toml` に `[dev-dependencies]` として追加）
  - テスト用音声ファイルは `tests/fixtures/silence_16k_mono.wav`（M7-2 で配置済み）
* **実装の背景と目的:** Qwen3AsrBackend が実際のモデルファイルと音声データに対して正しく動作することを検証する。モデル不在時はテストをスキップするため、開発環境・CI のどちらでも問題なく実行できる。このテストにより、`OfflineRecognizer::create()` のモデルロードと `transcribe()` の認識実行が実際の環境で機能することを確認する。
* **実装スコープ:**
  - `crates/voiput/Cargo.toml` の `[dev-dependencies]` に `hound = "3"` を追加（未導入の場合）
  - `crates/voiput/src/local/qwen3.rs` の `#[cfg(test)] mod tests` に以下を実装（RFC §11.2 のコードブロック通り）:
    - `qwen3_config_or_skip()` ヘルパー関数
    - `test_qwen3_backend_new()` — Qwen3AsrBackend::new() の成功確認
    - `test_qwen3_backend_transcribe()` — 実際の認識実行と結果取得の確認
  - `transcribe()` テストでは WAV ファイルを hound で読み込み、モノラル f32 に変換して渡す
* **テストコードによる検証:**
  1. `test_qwen3_backend_new`: モデル存在時 → `Ok(())` / モデル不在時 → スキップ
  2. `test_qwen3_backend_transcribe`: 認識結果が `Ok(text)` であること。text が空文字列でないこと（無音でも tokens.txt に応じて何らかの結果が返る）
  3. WAV 読み込み処理が正しくモノラル f32 に変換されていること
* **計装方法・観測対象:** モデル存在時の結合テスト結果（認識結果テキスト）。モデル不在時のスキップメッセージ。

#### ✅ チケット M8-2: 全テスト通過確認（make test 全件グリーン）

* **参照設計書:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (Implementation Step 7 — 4. make test で全テストが通過することを確認)
* **依存・関連チケットID:** 先行実装必須: M8-1、および第1〜3段階の全チケット。依存されるチケット: なし（最終検証）。
* **対象不変条件 / 規範:**
  - `make test` が全テスト通過（trate + voiput の全テスト）
  - Qwen3-ASR モデル不在時もテスト全体は成功（Qwen3 関連テストはスキップされるだけで全体が失敗しない）
  - `cargo test` が警告なく完了すること
* **実装の背景と目的:** RFC 実装の完了を確認する最終検証ゲート。trate crate のモックベース単体テストと Qwen3AsrBackend の結合テスト（モデル存在時のみ）を含む全テストが通過することを確認する。
* **実装スコープ:**
  - `make test` 実行
  - 失敗したテストの特定と修正
  - Qwen3-ASR モデルが存在する環境での結合テスト実行結果の確認
  - 全テスト通過の正式報告
* **テストコードによる検証:**
  1. `make test` が exit code 0 で完了すること
  2. trate crate の全テストが通過すること（`cargo test -p trate`）
  3. voiput crate の全テストが通過すること（モデル不在時もスキップ以外の異常なし）
  4. モデル存在環境で Qwen3AsrBackend 結合テストが実際に認識結果を返すこと
* **計装方法・観測対象:** `make test` exit code。テスト結果のサマリー（passed / failed / skipped 数）。

---

## チケット依存関係グラフ（全体）

```
M0-1 (trate Cargo.toml)
  └── M1-1 (AsrBackend trait)
       ├── M1-2 (LocalAsrBackend trait)
       │    └── M4-3 (Qwen3AsrBackend: LocalAsrBackend)
       └── M1-3 (trate unit tests) ◆ 独立（M1-1完了後並行可能）

M2-1 (LocalAsrKind)
  └── M2-2 (SttEngine::Local)
       ├── M6-1 (SpeechRecognizer dispatch)
       └── M6-2 (Config validation)

M2-3 (Qwen3AsrModelPaths + Qwen3AsrConfig)  ◆ M2-1 と独立、並行実装可能
  ├── M4-2 (Qwen3AsrBackend new/transcribe)
  │    └── M4-3 (Qwen3AsrBackend: LocalAsrBackend)
  │         └── M5-1 (LocalRecognizer)
  │              └── M5-2 (LocalRecognizerAdapter)
  │                   └── M6-1 (SpeechRecognizer dispatch)
  └── M6-2 (Config validation)  ◆ M2-2 からも依存。両方から合流。

M2-4 (Constants)
  ├── M2-5 (Path resolution functions)
  │    └── M4-2 (Qwen3AsrBackend new — config 解決に使用)
  └── M7-1 (build.rs download)

M0-1 → M3-1 (voiput trate dependency)
  └── M3-2 (streamer.rs migration + lib.rs pub use)
       └── M3-3 (OpenAIBackend impl 修正)
            └── M3-4 (テストコード移行対応)
                 └── M3-5 (verification gate)
       └── M3-3 (OpenAIBackend impl)
            └── M3-4 (verification gate)

M7-2 (Test fixtures) → M8-1 (Integration tests)
M8-1 → M8-2 (Final verification)
```

**並行実行可能なグループ:**
- グループA: M1-1 + M2-1 + M2-3 + M2-4（型定義のみ、互いに独立）
- グループB: M1-2 + M1-3 + M2-2（それぞれ M1-1 / M2-1 完了後並行可能）。M2-5 は M2-3 + M2-4 完了後。
- グループC: M3 系列は逐次（M3-1 → M3-2 → M3-3 → M3-4 → M3-5）。M3-1 は M0-1 + M1-1 完了後、M2 群と独立して開始可能。
- グループD: M0-1 + M2 群（trate scaffold と voiput 型定義は独立して並行可能）
