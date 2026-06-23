# RFC_003: ランタイム抽象化（conver-runtime）実装チケット分解設計書

> **生成元:** crates/conver/rfc-003-runtime/RFC_003.md
> **生成日:** 2026-06-23
> **分析済みセクション:** Abstract, Motivation, Design (§1〜§10), Implementation, Appendix A〜C

---

## Phase 0: 型定義基盤（Layer 0 — 純粋データ型）

> **外部依存:** serde (derive), thiserror
> **特徴:** 全チケットが外部モジュールへの依存を持たない。単独でコンパイル・テスト可能。

### Milestone M0: エラー型と列挙型の定義

> **DB:** メモリ内完結（不使用）

#### チケット M0-1: RuntimeError enum + ExtractError struct

* **参照設計書:** RFC_003.md (§9, §5.1)
* **依存・関連チケット:** 先行実装不要。M1-4, M2-1, M3-1 から依存される。
* **対象不変条件 / 規範:**
  - §9 RuntimeError の 7 variant がすべて定義されること
  - §5.1 ExtractError が reason + expected_schema + sample の3フィールドを持つこと
  - ExtractError が `std::error::Error` trait を実装すること
* **実装の背景と目的:** ランタイム全体のエラー型を一元定義する。`RuntimeError` は thiserror による自動 Display/Error 実装で共通エラーハンドリングを提供。`ExtractError` は抽出層専用のエラー型として、失敗理由・期待スキーマ・サンプルテキストの3情報を上位に伝達する。
* **実装スコープ:**
  - `crates/conver/rfc-003-runtime/src/error.rs` の新規作成
  - `RuntimeError` enum（7 variant）:
    - `SpawnFailed(String)` — プロセス起動失敗
    - `StreamError(String)` — ストリーム読み取りエラー
    - `ExtractError(#[from] ExtractError)` — 抽出エラー
    - `UnsupportedBackend(String)` — 未サポートのバックエンド
    - `Timeout(u64)` — タイムアウト
    - `Cancelled` — ユーザーキャンセル
    - `Io(#[from] std::io::Error)` — I/Oエラー
  - thiserror の `#[error("...")]` アトリビュートによる Display 実装（日本語メッセージは国際的デバッグ環境に合わせ英語にすること — `#[error("Spawn failed: {0}")]` 形式）
  - `RuntimeError` への `ExtractError` の自動変換（`#[from]`）
  - `ExtractError` struct:
    - `reason: String`
    - `expected_schema: String`
    - `sample: String`
    - `# [derive(Debug, Clone)]`
    - `std::fmt::Display` 実装: `"ExtractError: {reason} (expected: {expected_schema})"`
    - `std::error::Error` 実装
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. `RuntimeError::Timeout(30)` の文字列表現に `"30"` が含まれること（正常系）
  2. `RuntimeError::SpawnFailed("binary not found".into())` の文字列表現に `"binary"` が含まれること（正常系）
  3. `ExtractError` の文字列表現に reason と expected_schema が含まれること（正常系）
  4. `ExtractError` が `&dyn std::error::Error` として扱えること（コンパイル時検証）
  5. `RuntimeError` が `impl From<ExtractError> for RuntimeError` を満たすこと（コンパイル時検証）
  6. `RuntimeError` が `impl From<std::io::Error> for RuntimeError` を満たすこと（コンパイル時検証）
  7. `ExtractError` の全フィールドが public であること（アクセス検証）
* **計装方法・観測対象:** `RuntimeError` の variant 数（7）。`ExtractError` のフィールド数（3）。コンパイル時の trait 実装充足。

---

#### チケット M0-2: RuntimeEvent enum

* **参照設計書:** RFC_003.md (§4)
* **依存・関連チケット:** 先行実装不要。M1-1, M2-1, M3-1, M3-3 から依存される。
* **対象不変条件 / 規範:**
  - §4: 5 variant がすべて定義されること
  - §4: `Completed` が終端イベントであること
* **実装の背景と目的:** バックエンドからの生出力を型付けされた5 variant のイベントに正規化する。全コンポーネント間の通信プロトコルの中核となる列挙型。
* **実装スコープ:**
  - `crates/conver/rfc-003-runtime/src/event.rs` の新規作成
  - `RuntimeEvent` enum（5 variant）:
    - `StdoutChunk(String)` — stdout テキスト出力
    - `StderrChunk(String)` — stderr テキスト出力
    - `StructuredCandidate(String)` — JSON候補（tentative）
    - `Progress { message: String }` — 進捗報告
    - `Completed` — セッション正常完了
  - Derive: `#[derive(Debug, Clone, PartialEq)]`
  - `serde::Serialize` + `serde::Deserialize` も derive すること（イベントの永続化・転送に備える）
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. 各 variant が `Debug` を実装していること（コンパイル時検証）
  2. 各 variant が `Clone` を実装していること（コンパイル時検証）
  3. 各 variant が `PartialEq` を実装していること（コンパイル時検証）
  4. `StdoutChunk("text".into())` がエラーなく生成できること（正常系）
  5. `Progress { message: "working".into() }` がエラーなく生成できること（正常系）
  6. variant 数が5であること（代数的検証: match 網羅性）
* **計装方法・観測対象:** `RuntimeEvent` の variant 数（5）。各 variant が Clone + Debug + PartialEq を実装すること。

---

#### チケット M0-3: SessionState enum + RuntimeResult struct

* **参照設計書:** RFC_003.md (§3)
* **依存・関連チケット:** 先行実装不要。M1-3, M2-1, M3-1 から依存される。
* **対象不変条件 / 規範:**
  - §3 SessionState: 4 variant の状態遷移（Running → Cancelling → Completed/Failed）
  - §3 RuntimeResult: 6フィールドの完全性
  - §3 RuntimeResult::empty() のデフォルト値
* **実装の背景と目的:** セッションの状態機械と最終結果を表現する。SessionState はセッションライフサイクルの全段階をカバーし、RuntimeResult は await_result() の戻り値として全実行結果を集約する。
* **実装スコープ:**
  - `crates/conver/rfc-003-runtime/src/session.rs` の新規作成（RuntimeSession trait は含めない）
  - `SessionState` enum（4 variant）:
    - `Running` — 実行中
    - `Cancelling` — キャンセル要求済み
    - `Completed` — 完了
    - `Failed` — エラー発生
    - Derive: `#[derive(Debug, Clone, PartialEq)]`
    - `serde::Serialize` + `serde::Deserialize` も derive
  - `RuntimeResult` struct（6フィールド）:
    - `text: String` — 全stdoutテキスト
    - `structured_candidates: Vec<String>` — 抽出候補
    - `completed: bool` — 正常完了フラグ
    - `cancelled: bool` — キャンセルフラグ
    - `duration_secs: u64` — 実行時間
    - `json_block_count: usize` — JSONブロック数
    - Derive: `#[derive(Debug, Clone)]`
    - `impl RuntimeResult { pub fn empty() -> Self { ... } }`
      - text: String::new(), structured_candidates: Vec::new()
      - completed: true, cancelled: false
      - duration_secs: 0, json_block_count: 0
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. `SessionState::Running ≠ SessionState::Completed` であること（正常系）
  2. `SessionState::Running ≠ SessionState::Failed` であること（正常系）
  3. `RuntimeResult::empty()` の completed が true であること（正常系）
  4. `RuntimeResult::empty()` の cancelled が false であること（正常系）
  5. `RuntimeResult::empty()` の text が空文字列であること（正常系）
  6. `RuntimeResult::empty()` の json_block_count が 0 であること（正常系）
  7. SessionState が PartialEq を実装していること（コンパイル時検証）
  8. SessionState の variant 数が4であること（match 網羅性検証、コンパイル時）
* **計装方法・観測対象:** SessionState の variant 数（4）。RuntimeResult のフィールド数（6）。PartialEq 実装の充足。

---

#### チケット M0-4: RuntimeRequest struct

* **参照設計書:** RFC_003.md (§2)
* **依存・関連チケット:** 先行実装不要。M1-2, M2-2, M3-1 から依存される。
* **対象不変条件 / 規範:**
  - §2 RuntimeRequest: 4フィールド + builder パターン
  - §2 デフォルト値: timeout_secs=1800, max_retries=3
* **実装の背景と目的:** 全backendに共通の実行リクエスト形式を定義する。builder パターンにより各フィールドを段階的に設定可能。環境変数マップ生成（to_env_map）により子プロセスへのパラメータ伝搬を実現する。
* **実装スコープ:**
  - `crates/conver/rfc-003-runtime/src/backend.rs` の新規作成（RuntimeBackend trait は含めない）
  - `RuntimeRequest` struct（4フィールド）:
    - `command_text: String` — slash-command内容
    - `context: Option<String>` — 追加コンテキスト
    - `timeout_secs: u64` — タイムアウト（0=無効、デフォルト1800）
    - `max_retries: u32` — 最大リトライ回数（デフォルト3）
    - Derive: `#[derive(Debug, Clone)]`
    - `serde::Serialize` + `serde::Deserialize` も derive
  - Builder メソッド:
    - `RuntimeRequest::new(command_text: impl Into<String>) -> Self`
    - `.with_context(context: impl Into<String>) -> Self`
    - `.with_timeout(secs: u64) -> Self`
    - `.with_max_retries(retries: u32) -> Self`
  - デフォルト値条件:
    - timeout_secs のデフォルト = 1800（30分）
    - max_retries のデフォルト = 3
    - context のデフォルト = None
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. builder パターンで全フィールドが設定できること（正常系）
  2. デフォルト値が正しいこと（正常系）
  3. `with_timeout(0)` でタイムアウト無効が設定できること（境界値）
* **計装方法・観測対象:** RuntimeRequest のフィールド数（4）。builder メソッドの網羅率（4/4）。

---

## Phase 1: 純粋ロジック（Layer 1 — 外部I/Oなし）

> **外部依存:** serde_json
> **特徴:** 全関数が純粋（外部I/O・非同期処理なし）。決定論的テストが可能。

### Milestone M1: 振る舞いの実装

> **DB:** メモリ内完結

#### チケット M1-1: RuntimeEvent メソッド群（is_terminal + summary）

* **参照設計書:** RFC_003.md (§4)
* **依存・関連チケット:** 先行実装必須: M0-2（RuntimeEvent enum）。M3-1, M3-3 から依存される。
* **対象不変条件 / 規範:**
  - §4: `Completed` のみ `is_terminal() == true`
  - §4: `summary()` の最大長80文字制限
  - §4: 各 variant の summary 書式
* **実装の背景と目的:** RuntimeEvent に2つの純粋メソッドを追加する。`is_terminal()` はイベントストリームの終端検出に使用。`summary()` はUI表示・ログ出力向けの短い要約を提供する。
* **実装スコープ:**
  - `impl RuntimeEvent` ブロック（event.rs 内）:
    - `pub fn is_terminal(&self) -> bool`: `Completed` のみ true
    - `pub fn summary(&self) -> String`:
      - `StdoutChunk(s)`: 先頭77文字 + "..."（80文字超過時）、またはトリム済み全文
      - `StderrChunk(s)`: `"[stderr] {s.trim()}"`
      - `StructuredCandidate(s)`: `"[json] {s.len()} bytes"`
      - `Progress { message }`: message そのまま
      - `Completed`: `"[completed]"`
    - 最大80文字の保証
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. `Completed.is_terminal()` が true であること（正常系）
  2. `StdoutChunk` と `Progress` の `is_terminal()` が false であること（正常系）
  3. 200文字の `StdoutChunk` の `summary()` が 80 文字を超えないこと（境界値）
  4. `StructuredCandidate` の `summary()` に `"[json]"` と `"bytes"` が含まれること（正常系）
  5. 各 variant の summary フォーマットが仕様通りであること（正常系）
* **計装方法・観測対象:** summary() の出力長（最大80文字制約）。is_terminal() の variant 別結果（5 variant 中 1 のみ true）。

---

#### チケット M1-2: RuntimeRequest builder + to_env_map + Display

* **参照設計書:** RFC_003.md (§2)
* **依存・関連チケット:** 先行実装必須: M0-4（RuntimeRequest struct）。M3-1 から依存される。
* **対象不変条件 / 規範:**
  - §2: builder パターンが全フィールド immutable 更新できること
  - §2: `to_env_map()` が `CONVER_*` 環境変数を生成すること
  - §2: Display が "RuntimeRequest(timeout=Xs, retries=Y)" 形式
* **実装の背景と目的:** RuntimeRequest に完了メソッド群を追加。`to_env_map()` は子プロセスにパラメータを環境変数経由で伝搬するための変換。Display はログ出力・デバッグ表示用。
* **実装スコープ:**
  - `impl RuntimeRequest` ブロック（backend.rs 内）:
    - 既存 builder メソッド群（M0-4 で実装済みと仮定）
    - `pub fn to_env_map(&self) -> Vec<(&str, String)>`:
      - context が Some なら `("CONVER_CONTEXT", ctx)` を追加
      - `("CONVER_TIMEOUT", secs.to_string())` を常に追加
      - `("CONVER_MAX_RETRIES", retries.to_string())` を常に追加
    - `impl fmt::Display for RuntimeRequest`:
      - `"RuntimeRequest(timeout={timeout_secs}s, retries={max_retries})"`
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. builder チェーン `RuntimeRequest::new("/test").with_context("ctx").with_timeout(300).with_max_retries(5)` の各フィールドが正しいこと（正常系）
  2. `RuntimeRequest::new("/cmd")` のデフォルト値検証（正常系）
  3. `to_env_map()` に `CONVER_CONTEXT` が含まれること（正常系）
  4. `to_env_map()` に `("CONVER_TIMEOUT", "60")` が含まれること（正常系）
  5. context なしのリクエストで `CONVER_CONTEXT` が env_map に含まれないこと（境界値）
  6. `Display` が `"RuntimeRequest(timeout=1800s, retries=3)"` 形式であること（正常系）
* **計装方法・観測対象:** builder パターンの各メソッド戻り値のフィールド一致。to_env_map の要素数とキー名。

---

#### チケット M1-3: RuntimeResult::empty メソッド

* **参照設計書:** RFC_003.md (§3)
* **依存・関連チケット:** 先行実装必須: M0-3（RuntimeResult struct）。
* **対象不変条件 / 規範:**
  - §3: `empty()` が全フィールドにデフォルト値をセットすること
* **実装の背景と目的:** `RuntimeResult` のテスト用・初期状態用コンストラクタ。M0-3 で構造体定義のみ行い、メソッド実装は本チケットで完了させる。
* **実装スコープ:**
  - `impl RuntimeResult` ブロック（session.rs 内）:
    - `pub fn empty() -> Self`
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. `RuntimeResult::empty().completed` が true であること（正常系）
  2. `RuntimeResult::empty().cancelled` が false であること（正常系）
  3. `RuntimeResult::empty().text` が空であること（正常系）
  4. `RuntimeResult::empty().json_block_count` が 0 であること（正常系）
  5. `RuntimeResult::empty().duration_secs` が 0 であること（正常系）
* **計装方法・観測対象:** `empty()` の全フィールド値が仕様通りであること。

---

#### チケット M1-4: StructuredPayloadExtractor trait + ExtractError 完全版

* **参照設計書:** RFC_003.md (§5.1)
* **依存・関連チケット:** 先行実装必須: M0-1（ExtractError の完全版）。M1-5, M1-7, M1-8 から依存される。
* **対象不変条件 / 規範:**
  - §5.1: `extract_structured<T: DeserializeOwned>()` の型境界
  - §5.1: 抽出失敗時の `ExtractError` 返却
* **実装の背景と目的:** 構造化データ抽出の抽象 trait を定義する。`serde::de::DeserializeOwned` を型境界とすることで、任意の Deserialize 実装型への変換を可能にする。この trait が非決定論的出力を決定論的データ構造に変換する唯一の経路となる。
* **実装スコープ:**
  - `crates/conver/rfc-003-runtime/src/extractor.rs` の新規作成
  - `StructuredPayloadExtractor` trait:
    - `fn extract_structured<T: serde::de::DeserializeOwned>(&self, text: &str) -> Result<T, ExtractError>`
    - オブジェクト安全でない（ジェネリックメソッドのため）→ `dyn StructuredPayloadExtractor` は使用可能か？設計書では `Box<dyn StructuredPayloadExtractor>` が使われている（CompositeExtractor, RetryExtractor）。その場合、trait はオブジェクト安全である必要があるが、ジェネリックメソッドはオブジェクト安全ではない。
      - **ただし**、`extract_structured` がジェネリックである以上、この trait はオブジェクト安全ではない。`Box<dyn StructuredPayloadExtractor>` の使用箇所（§5.4, §5.5）ではコンパイルエラーになる可能性がある。
      - **解決策案**: 設計書の記述を尊重し、`Box<dyn StructuredPayloadExtractor>` を使うようにする場合、trait をオブジェクト安全にするために型消去（type erasure）が必要。または trait のメソッドから `<T>` を取り除き、戻り値を `Box<dyn Any>` などにする代替手段もある。
      - **本チケットの方針**: 設計書通りのジェネリック trait として定義する。`CompositeExtractor` と `RetryExtractor` のチケット（M1-7, M1-8）で `Box<dyn StructuredPayloadExtractor>` のコンパイル問題が発生した場合、`erased_serde` などの型消去クレート導入か、enum-dispatch パターンに変更する。本チケットでは trait 定義のみを行い、テストは具象型で行う。
  - `ExtractError` struct:
    - M0-1 で定義済み。本モジュールで re-export または use する。
  - **[::STUB::] 要解決:** `Box<dyn StructuredPayloadExtractor>` がジェネリックメソッドによりオブジェクト安全でない問題。M1-7（CompositeExtractor）で解決するか、または本チケットの後に型消去チケットを追加する。
* **テストコードによる検証:**
  1. 具象型 `impl StructuredPayloadExtractor for JsonExtractor` がコンパイルできること（コンパイル時検証）
  2. `extract_structured::<serde_json::Value>()` が正常 JSON で動作すること（正常系）
  3. ジェネリックトレイトとしての型境界 `T: DeserializeOwned` が強制されていること（コンパイル時検証）
* **計装方法・観測対象:** trait 定義のコンパイル通過。具象実装1種の動作確認。

---

#### チケット M1-5: JsonExtractor（3形式抽出）

* **参照設計書:** RFC_003.md (§5.2)
* **依存・関連チケット:** 先行実装必須: M1-4（StructuredPayloadExtractor trait）。M1-7（CompositeExtractor）から依存される。
* **対象不変条件 / 規範:**
  - §5.2: 3形式の抽出優先順位（フェンスドブロック > ブレース > 行JSON）
  - §5.2: ネストした `{}` の対応が正しいこと
  - §5.2: JSONパース失敗時のエラー情報完全性
* **実装の背景と目的:** デフォルトの JSON 抽出器。Claude Code からの出力には ` ```json ` フェンスドブロック、生 JSON、行 JSON の3形式が混在するため、最適な形式から優先的に抽出する。JSON抽出は非決定論的出力を決定論的データに変換する最前線。
* **実装スコープ:**
  - `extractor.rs` に以下を追加:
  - `JsonExtractor` struct:
    - `pub struct JsonExtractor;`
    - `impl JsonExtractor { pub fn new() -> Self { Self } }`
  - 内部メソッド（非公開、`fn`）:
    - `fn extract_json_text(&self, text: &str) -> Option<String>`:
      - 優先1: `extract_fenced_block(text)` → Some なら即座にその値を返す
      - 優先2: `extract_balanced_braces(text)` → Some なら返す
      - 優先3: `extract_line_json(text)` → Some なら返す
      - すべて None なら None
    - `fn extract_fenced_block(&self, text: &str) -> Option<String>`:
      - ` ```json ` で始まる行を検出
      - 対応する ` ``` ` までの中身を結合
      - 途中でファイル終端に達した場合も、収集済みブロックを返す（不完全ブロック対応）
    - `fn extract_balanced_braces(&self, text: &str) -> Option<String>`:
      - 最初の `{` の位置から探索開始
      - 深さカウント（`{` +1, `}` -1）
      - 深さ0に戻った位置までを抽出
    - `fn extract_line_json(&self, text: &str) -> Option<String>`:
      - 各行で `{` で始まり `}` で終わるものを検出
      - 最長行を選択（部分JSONより完全JSON行を優先）
  - `impl StructuredPayloadExtractor for JsonExtractor`:
    - `extract_json_text` で JSON 文字列を抽出
    - `serde_json::from_str::<T>()` でパース
    - 失敗時は `ExtractError` を理由付きで返す
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. ` ```json {"k":"v"} ``` ` フェンスドブロックから抽出できること（正常系）
  2. `{"a": 1, "b": [2, 3]}` ブレースから抽出できること（正常系）
  3. `{"x": 42}` 行JSONから抽出できること（正常系）
  4. `{"outer": {"inner": [1, 2, 3]}}` ネスト JSON が正しく抽出できること（正常系）
  5. プレーンテキストから抽出しようとしてエラーになること（異常系）
  6. JSONオブジェクトを `String` として抽出しようとして型不一致エラーになること（異常系）
  7. ` ```json {"x": 1}`（閉じ ``` なし）の不完全ブロックが抽出できること（境界値）
  8. 複数ブロックがある場合、最初のブロックが抽出されること（正常系）
  9. `extract_fails_on_no_json`: `"This is plain text"` で `reason` に `"not found"` が含まれること（異常系）
* **計装方法・観測対象:** 3形式それぞれの抽出成功率。ネスト深さに対する抽出正確性。エラー時の reason, schema, sample の完全性。

---

#### チケット M1-6: MarkdownExtractor

* **参照設計書:** RFC_003.md (§5.3)
* **依存・関連チケット:** 先行実装不要（StructuredPayloadExtractor を実装しない独立ユーティリティ）。事実上の依存なし。
* **対象不変条件 / 規範:**
  - §5.3: `extract_code_blocks()` が指定言語のコードブロックのみ抽出すること
  - §5.3: `extract_first_heading()` が最初の見出しを抽出すること
* **実装の背景と目的:** Markdown テキストからコードブロックや見出しを抽出するユーティリティ。StructuredPayloadExtractor の対象外だが、conver-core での Markdown 解析に利用される可能性がある。
* **実装スコープ:**
  - `extractor.rs` に追加（同一ファイル内）
  - `MarkdownExtractor` struct:
    - `pub struct MarkdownExtractor;`
    - `impl MarkdownExtractor { pub fn new() -> Self { Self } }`
  - メソッド:
    - `pub fn extract_code_blocks(&self, text: &str, language: &str) -> Vec<String>`:
      - ```{language} のフェンスドブロックを全件抽出
      - 言語指定なし（ ` ``` ` ）のブロックも含める（`|| trimmed == "```"`）
    - `pub fn extract_first_heading(&self, text: &str) -> Option<String>`:
      - `#` で始まる最初の行を検出
      - `# ` プレフィックス除去後にトリム
  - `StructuredPayloadExtractor` は実装しない（設計書の記述通り）
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. `extract_code_blocks(text, "json")` で `{"k": "v"}` が抽出できること（正常系）
  2. `extract_code_blocks` で指定言語以外のブロックが除外されること（正常系）
  3. `extract_first_heading("# Title\n## Sub")` が `Some("Title")` を返すこと（正常系）
  4. 見出しのないテキストで `extract_first_heading` が None を返すこと（異常系）
  5. 複数コードブロックから正しい個数のブロックが抽出されること（正常系）
* **計装方法・観測対象:** 抽出されたブロック数と言語フィルタリングの正確性。見出し抽出の位置正確性。

---

#### チケット M1-7: CompositeExtractor（フォールバック連鎖）

* **参照設計書:** RFC_003.md (§5.4)
* **依存・関連チケット:** 先行実装必須: M1-4（StructuredPayloadExtractor trait）, M1-5（JsonExtractor）。M3-1（ClaudeCodeBackend）から依存される（間接的）。
* **対象不変条件 / 規範:**
  - §5.4: 先頭から順に抽出器を試行し、最初の成功を返す
  - §5.4: 全抽出器失敗時に最後の ExtractError を返す
  - §5.4: 空の抽出器リストではデフォルトエラーを返す
* **実装の背景と目的:** 複数の StructuredPayloadExtractor を直列に接続し、フォールバック連鎖を実現する。`default_json()` で単一抽出器、`lenient()` で寛容な構成を提供。現設計では JsonExtractor のみだが、将来 TomlExtractor などの追加時に構成変更のみで対応可能。
* **実装スコープ:**
  - `extractor.rs` に追加
  - `CompositeExtractor` struct:
    - `extractors: Vec<Box<dyn StructuredPayloadExtractor>>`
    - Derive: 手動実装（derive 不可のため）
  - コンストラクタ:
    - `pub fn new(extractors: Vec<Box<dyn StructuredPayloadExtractor>>) -> Self`
    - `pub fn default_json() -> Self`: JsonExtractor のみ
    - `pub fn lenient() -> Self`: JsonExtractor のみ（設計上 TomlExtractor の記述があるが未実装のため JsonExtractor 単体で構成）
  - `impl StructuredPayloadExtractor for CompositeExtractor`:
    - 各抽出器を順に試行
    - 最初に成功した結果を返す
    - 全失敗時: 最後のエラーを返す（空リスト時はデフォルトエラー）
  - **[::STUB::] M1-7-STUB-1:** `CompositeExtractor::lenient()` が設計書コメント上では `TomlExtractor → JsonExtractor` と記述されているが、TomlExtractor は未実装。現状は `JsonExtractor` 単体で構成し、`TomlExtractor` 実装時（将来チケット）に連鎖を拡張する。
* **テストコードによる検証:**
  1. `CompositeExtractor::default_json().extract_structured("{\"ok\": true}")` が成功すること（正常系）
  2. 空の抽出器リストでエラーになること（異常系）
  3. `lenient()` の戻り値が `JsonExtractor` 単体構成であること（正常系）
* **計装方法・観測対象:** フォールバックの試行順序。全失敗時のエラー情報完全性。

---

#### チケット M1-8: RetryExtractor + RetryFeedback

* **参照設計書:** RFC_003.md (§5.5)
* **依存・関連チケット:** 先行実装必須: M1-4（StructuredPayloadExtractor trait）, M0-1（RuntimeError: `UnsupportedBackend` / `StreamError`）
* **対象不変条件 / 規範:**
  - §5.5: 通常リトライと reformat-only の動作分岐
  - §5.5: 最終試行で `reformat_only=true` となること
  - §5.5: 全試行失敗時に最後の ExtractError が返されること
  - §5.5: RetryFeedback::Display のフォーマット厳守
* **実装の背景と目的:** 抽出失敗時の自動リトライ戦略を提供する。`regenerate` クロージャを介して Claude Code に修正フィードバックを送信し、修正されたテキストで再抽出を試行。最終試行では新規推論を禁止し構造補正のみを要求する reformat-only モードに切り替える。
* **実装スコープ:**
  - `extractor.rs` に追加
  - `RetryFeedback` struct（6フィールド）:
    - `attempt: u32`, `max_attempts: u32`
    - `failure_reason: String`, `expected_schema: String`
    - `reformat_only: bool`, `text_sample: String`
    - Derive: `#[derive(Debug, Clone)]`
    - `impl Display`:
      - "=== JSON Extraction Feedback ==="
      - "Attempt: {attempt}/{max_attempts}"
      - "Failure: {failure_reason}"
      - "Expected schema: {expected_schema}"
      - "Mode: REFORMAT ONLY" or "Mode: RETRY"
      - reformat_only 時: "Do NOT generate new reasoning. Correct structure only."
      - 通常時: "Fix the JSON output to match the expected schema."
      - サンプルテキスト先頭100文字表示
  - `RetryExtractor` struct:
    - `inner: Box<dyn StructuredPayloadExtractor>`
    - `max_attempts: u32`
  - コンストラクタ:
    - `pub fn new(extractor: Box<dyn StructuredPayloadExtractor>, max_attempts: u32) -> Self`
  - `pub fn extract_with_retry<T, F>(&self, text: &str, mut regenerate: F) -> Result<T, ExtractError>`
    - where `T: DeserializeOwned, F: FnMut(RetryFeedback) -> Result<String, RuntimeError>`
    - attempt 1〜max_attempts のループ
    - 成功 → 即座に Ok(payload) を返す
    - 通常失敗（attempt < max_attempts）→ regenerate 呼び出し、新しいテキストで再試行
    - regenerate が Err を返した場合 → 元のエラーを返す
    - 最終試行失敗（attempt == max_attempts）→ reformat-only で regenerate → それでも失敗なら元のエラーを返す
  - 注: `Box<dyn StructuredPayloadExtractor>` のオブジェクト安全性問題。M1-4 の [::STUB::] 参照。本チケットでは設計書の型シグネチャ通りに記述し、コンパイルエラーが発生した場合は M1-4 の解決策（型消去）を本チケットで適用する。
  - **[::STUB::] M1-8-STUB-1:** （M1-4に連動）`Box<dyn StructuredPayloadExtractor>` がジェネリックメソッドによりオブジェクト安全でない場合、本チケットで以下のいずれかの対処が必要：
    - a) trait を enum dispatch に変更
    - b) `erased_serde` クレート導入
    - c) `dyn` の代わりに具象型 enum（ExtractorKind）を使用
* **テストコードによる検証:**
  1. `retry_succeeds_without_regeneration`: 正常 JSON で即座に成功すること（正常系）
  2. `retry_regenerates_on_extract_failure`: 1回の regenerate で修正 JSON が返され成功すること（正常系）
  3. `retry_reformat_only_on_final_attempt`: 最終試行で reformat_only=true が regenerate に渡されること（正常系）
  4. `retry_all_attempts_fail`: 全試行（max_attempts=1）失敗時にエラーが返ること（異常系）
  5. `retry_exhausts_attempts`: max_attempts=5 で regenerate が5回呼ばれること（正常系）
  6. `retry_feedback_display_format`: `RetryFeedback` の Display 出力に attempt/max、failure_reason が含まれること（正常系）
  7. `retry_feedback_shows_reformat_mode`: reformat_only=true 時、"REFORMAT ONLY" と "Do NOT generate new reasoning" が含まれること（正常系）
* **計装方法・観測対象:** リトライ回数の正確性（max_attempts 到達）。reformat_only フラグの設定タイミング。regenerate クロージャ呼び出し回数。

---

#### チケット M1-9: EventLogger

* **参照設計書:** RFC_003.md (§8)
* **依存・関連チケット:** 先行実装必須: M0-2（RuntimeEvent）
* **対象不変条件 / 規範:**
  - §8: 各 variant に応じた正しいログレベル
  - §8: `log_events()` が複数イベントを一括処理すること
* **実装の背景と目的:** すべての RuntimeEvent を構造化ログに記録するヘルパー。デバッグ・監査・トレースの基盤。ログレベルは variant の重要度に応じて使い分ける。
* **実装スコープ:**
  - `crates/conver/rfc-003-runtime/src/logging.rs` の新規作成
  - `EventLogger` struct:
    - `pub struct EventLogger;`
  - メソッド:
    - `pub fn log_event(event: &RuntimeEvent)`:
      - `StdoutChunk` → `log::debug!("[runtime:stdout] {}", s.trim())`
      - `StderrChunk` → `log::warn!("[runtime:stderr] {}", s.trim())`
      - `StructuredCandidate` → `log::info!("[runtime:json] {} bytes candidate", json.len())`
      - `Progress` → `log::info!("[runtime:progress] {}", message)`
      - `Completed` → `log::info!("[runtime] session completed")`
    - `pub fn log_events(events: &[RuntimeEvent])`:
      - 各イベントを順に `log_event` に委譲
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. 全5 variant がエラーなく `log_event` に渡せること（正常系）
  2. `log_events` が空スライスでパニックしないこと（境界値）
  3. `log_events` が複数イベントを全て処理すること（正常系）
  *注: 実際のログ出力テストはテストランナーのログキャプチャに依存するため、パニックしないことと型レベルでの完全性を主に検証する。*
* **計装方法・観測対象:** log クレートへの呼び出しが variant ごとに正しいレベルで行われること。ログメッセージのプレフィックス形式。

---

## Phase 2: トレイト定義（Layer 2 — 抽象インターフェース）

> **外部依存:** なし
> **特徴:** 純粋なトレイト定義。実装なし。コンパイル時検証のみ。

### Milestone M2: RuntimeSession と RuntimeBackend の抽象化

> **DB:** メモリ内完結

#### チケット M2-1: RuntimeSession trait

* **参照設計書:** RFC_003.md (§3)
* **依存・関連チケット:** 先行実装必須: M0-2（RuntimeEvent）, M0-1（RuntimeError）, M0-3（SessionState + RuntimeResult）, M1-3（RuntimeResult::empty）。M2-2 から依存される。
* **対象不変条件 / 規範:**
  - §3: 5メソッド（state, is_done, stream_events, cancel, await_result）のシグネチャ
  - §3: ライフサイクル図の状態遷移の一貫性
  - §3: is_done() のデフォルト実装
* **実装の背景と目的:** 実行中のセッションを抽象化するトレイト。イベントストリーム取得、協力的キャンセル、完了待機の3操作を提供する。このトレイトを実装することで任意の backend のセッションが RuntimeBackend の関連型として利用可能になる。
* **実装スコープ:**
  - `session.rs` に trait 定義を追加
  - `pub trait RuntimeSession`:
    - `fn state(&self) -> SessionState`
    - `fn is_done(&self) -> Result<bool, RuntimeError>`:
      - デフォルト実装: `self.state() == SessionState::Completed || self.state() == SessionState::Failed`
    - `fn stream_events(&mut self) -> Result<Vec<RuntimeEvent>, RuntimeError>`
    - `fn cancel(&mut self) -> Result<(), RuntimeError>`
    - `fn await_result(self) -> Result<RuntimeResult, RuntimeError>`
  - 必要な use 文（`use crate::event::RuntimeEvent;` 等）
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. trait 定義がコンパイルできること（コンパイル時検証）
  2. `impl RuntimeSession for SomeStruct` のモック実装がコンパイルできること（コンパイル時検証）
  3. モック実装での全メソッド呼び出しテスト:
     - `state()` が SessionState を返すこと
     - `is_done()` のデフォルト実装が正しいこと
     - `stream_events()` が Vec<RuntimeEvent> を返すこと
     - `cancel()` が Ok(()) を返すこと
     - `await_result()` が RuntimeResult を返すこと
* **計装方法・観測対象:** トレイトメソッド数（5）。デフォルト実装メソッド数（1）。関連型の有無（なし）。

---

#### チケット M2-2: RuntimeBackend trait

* **参照設計書:** RFC_003.md (§2)
* **依存・関連チケット:** 先行実装必須: M2-1（RuntimeSession trait）, M0-1（RuntimeError）, M0-4（RuntimeRequest）。M3-1（ClaudeCodeBackend）から依存される。
* **対象不変条件 / 規範:**
  - §2: 関連型 `type Session: RuntimeSession`
  - §2: `start_run(&self, request: RuntimeRequest) -> Result<Self::Session, RuntimeError>`
* **実装の背景と目的:** 実行 backend の抽象化。各 backend はこの trait を実装し、自身が生成するセッションの具象型を関連型として宣言する。conver-core の WorkflowController がこの trait を利用する。
* **実装スコープ:**
  - `backend.rs` に trait 定義を追加
  - `pub trait RuntimeBackend`:
    - `type Session: RuntimeSession`
    - `fn start_run(&self, request: RuntimeRequest) -> Result<Self::Session, RuntimeError>`
  - 必要な use 文（`use crate::session::RuntimeSession;` 等）
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. trait 定義がコンパイルできること（コンパイル時検証）
  2. `impl RuntimeBackend for SomeBackend` のモック実装がコンパイルできること（コンパイル時検証）
  3. 関連型 `type Session` が RuntimeSession を実装していることのコンパイル時検証
  4. モック backend の `start_run()` が Result<MockSession, RuntimeError> を返すこと
* **計装方法・観測対象:** 関連型のトレイト境界充足。メソッド数（1）。

---

## Phase 3: ライフサイクル管理（Layer 3 — 非同期ランタイム・プロセス管理）

> **外部依存:** tokio（非同期ランタイム）※注: 設計書では std::thread + mpsc を使用しており tokio は不要。プロセス管理は std::process で行う。
> **特徴:** 子プロセス管理、スレッド管理、シグナル処理

### Milestone M3: ClaudeCodeBackend, TimeoutMonitor, 実装完了

> **DB:** メモリ内完結

#### チケット M3-1: ClaudeCodeBackend + ClaudeSession

* **参照設計書:** RFC_003.md (§6)
* **依存・関連チケット:**
  - 先行実装必須: M2-1（RuntimeSession trait）, M2-2（RuntimeBackend trait）, M0-1（RuntimeError）, M0-2（RuntimeEvent）, M0-4（RuntimeRequest）, M1-1（event methods）, M1-2（builder + to_env_map）, M0-3（SessionState + RuntimeResult）
  - M3-2（TimeoutMonitor）と連携可能
* **対象不変条件 / 規範:**
  - §6: ClaudeCodeBackend が RuntimeBackend を実装し、`type Session = ClaudeSession`
  - §6: `start_run()` が `claude --print {command_text}` を子プロセスとして起動
  - §6: ClaudeSession が RuntimeSession を完全実装
  - §6: `cancel()` が SIGTERM（Unix）で協力的停止、force-kill 禁止
  - §6: タイムアウトチェック（timeout_secs > 0 の場合）
  - §6: stderr → StderrChunk, stdout → StdoutChunk/StructuredCandidate の分離
* **実装の背景と目的:** デフォルトの runtime backend。`claude` CLI を子プロセスとして実行し、stdout/stderr を行単位で分離収集する。JSON候補の自動検出、協力的キャンセル、タイムアウト監視を含む本格的な実装。
* **実装スコープ:**
  - `crates/conver/rfc-003-runtime/src/claude.rs` の新規作成
  - **ClaudeCodeBackend** struct:
    - `claude_path: String`（デフォルト: `"claude"`）
    - `extra_env: Vec<(String, String)>`
    - `pub fn new() -> Self`
    - `pub fn with_claude_path(path: impl Into<String>) -> Self`
    - `pub fn with_env(key: impl Into<String>, value: impl Into<String>) -> Self`
    - `impl RuntimeBackend for ClaudeCodeBackend`:
      - `type Session = ClaudeSession`
      - `fn start_run(&self, request: RuntimeRequest) -> Result<ClaudeSession, RuntimeError>`:
        - `Command::new(&self.claude_path).arg("--print").arg(&request.command_text)`
        - `stdout(Stdio::piped()).stderr(Stdio::piped())`
        - 環境変数設定: `request.to_env_map()` + `self.extra_env`
        - `cmd.spawn()` → `RuntimeError::SpawnFailed` にマップ
  - **ClaudeSession** struct（10フィールド）:
    - `child: Option<Child>`, `state: Arc<AtomicBool>`, `cancelled: Arc<AtomicBool>`
    - `output: String`, `stderr_output: String`, `structured_candidates: Vec<String>`
    - `start_time: Instant`, `timeout_secs: u64`, `json_block_count: usize`
  - 内部メソッド:
    - `fn read_stdout(&mut self) -> Result<Vec<RuntimeEvent>, RuntimeError>`:
      - BufReader + `child.stdout.as_ref()` で行単位読み取り
      - 各行を出力に追加
      - 行の先頭が `{` または ` ```json ` → `StructuredCandidate`
      - それ以外 → `StdoutChunk`
      - キャンセルチェック各行
      - `WouldBlock` → break（ノンブロッキング）
    - `fn read_stderr(&mut self) -> Result<Vec<RuntimeEvent>, RuntimeError>`:
      - 同上、`StderrChunk` として収集
    - `fn check_timeout(&self) -> Result<(), RuntimeError>`:
      - `timeout_secs > 0` かつ経過秒 > timeout_secs → `RuntimeError::Timeout`
  - `impl RuntimeSession for ClaudeSession`:
    - `fn state(&self) -> SessionState`: cancelled → Cancelling, state → Completed, それ以外 → Running
    - `fn stream_events(&mut self) -> Result<Vec<RuntimeEvent>, RuntimeError>`:
      - タイムアウトチェック → `check_timeout()`
      - stderr 読み取り → stdout 読み取り
      - `child.try_wait()` → Some(status) → Completed, None → 継続
      - キャンセルかつイベントなし → Completed
    - `fn cancel(&mut self) -> Result<(), RuntimeError>`:
      - `cancelled.store(true, ...)`
      - Unix: `unsafe { libc::kill(pid, libc::SIGTERM) }` — SIGKILL は使わない
      - Windows: `child.kill()`
    - `fn await_result(mut self) -> Result<RuntimeResult, RuntimeError>`:
      - `child.wait()` でプロセス完了待機
      - キャンセル済みの場合はエラーにしない
      - `RuntimeResult` を構築して返す
  - **[::STUB::] M3-1-STUB-1:** Windows 環境の `cancel()` は `child.kill()` で代替しているが、これは SIGTERM 相当の協力的停止ではない。本番 Windows サポート時には `Ctrl+C` 相当のシグナル送信に変更する。
  - **[::STUB::] M3-1-STUB-2:** タイムアウト検出時の自動キャンセル呼び出しは未実装。現在は `Timeout` エラーを返すのみであり、子プロセスは生存し続ける。クリーンアップ処理は `await_result()` または呼び出し元の `drop` に委ねる。
* **テストコードによる検証:**
  注: 実際の子プロセス起動を含むテストは CI/結合テストで実施。単体テストでは以下のモック検証を行う：
  1. `ClaudeCodeBackend::new()` のデフォルト `claude_path` が `"claude"` であること（正常系）
  2. builder メソッドで各フィールドが設定できること（正常系）
  3. `ClaudeSession::state()` の初期状態が `Running` であること（正常系）
  4. `ClaudeSession::check_timeout()` で timeout_secs=0 の場合はエラーにならないこと（境界値）
  5. `ClaudeSession::check_timeout()` で経過 > timeout の場合は `RuntimeError::Timeout` が返ること（正常系、Instant の調整が必要な場合は mock_instant 相当で代替）
* **計装方法・観測対象:** ClaudeCodeBackend のフィールド設定完全性。ClaudeSession のメソッド呼び出し可能確認。タイムアウト分岐のカバレッジ。

---

#### チケット M3-2: TimeoutMonitor + NotifyingTimeoutMonitor

* **参照設計書:** RFC_003.md (§7)
* **依存・関連チケット:** 先行実装不要（独立モジュール）。M3-1 と連携（タイムアウトフラグ提供）。
* **対象不変条件 / 規範:**
  - §7: `TimeoutMonitor::start(timeout_secs, cancel_flag)` が指定秒数後にフラグをセット
  - §7: `timeout_secs == 0` の場合は監視スレッドを起動しない
  - §7: `NotifyingTimeoutMonitor` が `mpsc` チャネル経由で通知
* **実装の背景と目的:** 長時間実行セッションのタイムアウトを別スレッドで監視する。基本版（TimeoutMonitor）はキャンセルフラグをセットし、通知版（NotifyingTimeoutMonitor）は mpsc チャネルで通知を送信する。
* **実装スコープ:**
  - `crates/conver/rfc-003-runtime/src/timeout.rs` の新規作成
  - **TimeoutMonitor**:
    - `cancelled: Arc<AtomicBool>`
    - `handle: Option<thread::JoinHandle<()>>`
    - `pub fn start(timeout_secs: u64, cancel_flag: Arc<AtomicBool>) -> Self`:
      - timeout_secs == 0 → スレッド起動なし
      - それ以外 → `thread::spawn` で sleep → cancel_flag セット
    - `pub fn is_timed_out(&self) -> bool`: cancel_flag の状態確認
  - **NotifyingTimeoutMonitor**:
    - `timeout_secs: u64`, `sender: mpsc::Sender<()>`
    - `pub fn new(timeout_secs: u64) -> (Self, mpsc::Receiver<()>)`:
      - mpsc::channel を作成して返す
    - `pub fn start(self) -> thread::JoinHandle<()>`:
      - スレッド起動: sleep → sender.send(())
  - **[::STUB::] なし**
* **テストコードによる検証:**
  注: `thread::sleep` を含むテストは時間がかかるため、短いタイムアウト（10ms〜100ms）で検証する。
  1. `TimeoutMonitor::start(0, flag)` でスレッドが起動せず、handle が None であること（境界値）
  2. `TimeoutMonitor::start(1, flag)` でスレッドが起動すること（正常系）
  3. `is_timed_out()` が初期状態で false を返すこと（正常系）
  4. `NotifyingTimeoutMonitor::new(1)` が `(Self, Receiver)` を返すこと（正常系）
* **計装方法・観測対象:** スレッド起動条件（timeout_secs == 0 の分岐）。フラグ状態の初期値と設定値。

---

## Phase 4: 統合（Layer 4 — モジュール統合・ビルド・検証）

> **外部依存:** serde (derive), serde_json, thiserror, log, libc (unix), tempfile (dev)
> **特徴:** 全モジュールの統合、ビルド通過、結合テスト

### Milestone M4: Cargo.toml, lib.rs, 結合テスト, ビルド検証

> **DB:** メモリ内完結

#### チケット M4-1: Cargo.toml 設定 + lib.rs（全モジュール宣言・公開API再公開）

* **参照設計書:** RFC_003.md（Implementation §Cargo.toml, §lib.rs）
* **依存・関連チケット:** 先行実装必須: 全 Phase 0〜3 の全チケット。M4-2 から依存される。
* **対象不変条件 / 規範:**
  - Implementation: 依存クレートの過不足・バージョン一致
  - §10: 全10モジュールの宣言と全公開APIの再公開
  - モジュールパスの一貫性
* **実装の背景と目的:** crate 全体のエントリポイント。全モジュールを宣言し、外部から利用可能な API を再公開する。Cargo.toml では依存関係と cfg 条件付き依存（unix での libc）を設定する。
* **実装スコープ:**
  - `crates/conver/rfc-003-runtime/Cargo.toml` の新規作成:
    ```toml
    [package]
    name = "conver-runtime"
    version = "0.1.0"
    edition = "2021"

    [dependencies]
    serde = { version = "1", features = ["derive"] }
    serde_json = "1"
    thiserror = "2"
    log = "0.4"

    [target.'cfg(unix)'.dependencies]
    libc = "0.2"

    [dev-dependencies]
    tempfile = "3"
    ```
  - `crates/conver/rfc-003-runtime/src/lib.rs` の新規作成:
    - 10モジュール宣言: `pub mod backend;`, `pub mod session;`, `pub mod event;`, `pub mod extractor;`, `pub mod claude;`, `pub mod timeout;`, `pub mod error;`, `pub mod logging;`
    - 公開APIの再公開（設計書 §10 に完全準拠）:
      ```
      pub use backend::{RuntimeBackend, RuntimeRequest};
      pub use session::{RuntimeSession, RuntimeResult, SessionState};
      pub use event::RuntimeEvent;
      pub use extractor::{
          StructuredPayloadExtractor, ExtractError, RetryFeedback,
          JsonExtractor, MarkdownExtractor, CompositeExtractor, RetryExtractor,
      };
      pub use claude::{ClaudeCodeBackend, ClaudeSession};
      pub use timeout::{TimeoutMonitor, NotifyingTimeoutMonitor};
      pub use error::RuntimeError;
      ```
  - **[::STUB::] なし**
* **テストコードによる検証:**
  1. `cargo check -p conver-runtime` がエラーなく通過すること（コンパイル時検証）
  2. 全モジュールの use パスが解決できること（コンパイル時検証）
  3. 外部 crate（conver-core を模したダミー）から `use conver_runtime::RuntimeBackend` 等がインポートできること（コンパイル時検証）
* **計装方法・観測対象:** 公開シンボル数（設計書 §10 との一致確認）。コンパイルエラー数（0）。

---

#### チケット M4-2: 結合テスト + 単体テスト全件実施 + ビルド検証

* **参照設計書:** RFC_003.md（テスト §tests, Appendix C）
* **依存・関連チケット:** 先行実装必須: M4-1（Cargo.toml + lib.rs）, 全 Phase 0〜3 の全チケット
* **対象不変条件 / 規範:**
  - Appendix C: 16項目の完了条件をすべて満たすこと
  - §tests: 設計書内の全テストがパスすること
  - `cargo test -p conver-runtime` が全テストパスすること
* **実装の背景と目的:** 設計書内の全テストコードをモジュール内テストとして実装し、結合テスト用バイナリを作成する。Appendix C の16項目の完了条件を検証可能な形でテストコード化する。
* **実装スコープ:**
  1. 各ソースファイル内の `#[cfg(test)] mod tests` の実装完了確認:
     - error.rs: `runtime_error_variants`, `extract_error_contains_details`, `extract_error_implements_error_trait`
     - event.rs: `terminal_event_detection`, `event_summary_length_limit`, `event_summary_for_json`
     - session.rs: `session_state_transitions`, `empty_result`
     - backend.rs: `request_builder_pattern`, `request_defaults`, `request_to_env_map`
     - extractor.rs: JsonExtractor 8 tests, MarkdownExtractor 2 tests, CompositeExtractor 1 test, RetryExtractor 5 tests, RetryFeedback 2 tests
  2. 結合テストバイナリの作成:
     - `crates/conver/rfc-003-runtime/tests/test-run.rs` の新規作成
     - 受入テストの実装（設計書 §D 準拠）
     - `cargo run --bin test-run -p conver-runtime` で実行可能
  3. Appendix C 完了条件の確認:
     - 条件1: JsonExtractor 3形式抽出（3形式のテスト済み）
     - 条件2: ExtractError の reason + schema + sample
     - 条件3: RetryExtractor 指定回数リトライ
     - 条件4: 最終試行 reformat_only
     - 条件5: 全試行失敗時のエラー返却
     - 条件6: RuntimeRequest builder 全フィールド
     - 条件7: to_env_map() 環境変数
     - 条件8: cancel() 協力的動作（SIGTERM）
     - 条件9: RuntimeEvent::Completed 終端認識
     - 条件10: SessionState 状態遷移
     - 条件11: MarkdownExtractor 抽出
     - 条件12: CompositeExtractor フォールバック
     - 条件13: TimeoutMonitor フラグセット
     - 条件14: ExtractError の std::error::Error 実装
     - 条件15: cargo test 全パス
     - 条件16: 親RFCとの矛盾なし
  4. `make check-be` または `cargo check -p conver-runtime` 完了確認
  - **[::STUB::] M4-2-STUB-1:** Appendix C 条件8「cancel() 協力的動作」のテストは実際の子プロセスを起動するため、CI 環境でのみ実行可能。単体テストでは `cancel()` のフラグ設定とシグナル送信部分の呼び出しのみを検証する。
  - **[::STUB::] M4-2-STUB-2:** 条件16「親RFCとの矛盾なし」は自動テストでは検証不可能。手動レビューによる確認が必要。
* **テストコードによる検証:**
  1. `cargo test -p conver-runtime` が全テストパスすること（検証コマンド）
  2. Appendix C 完了条件1〜15 に対応するテストが存在しパスすること（網羅性）
  3. `cargo check -p conver-runtime` が警告0で通過すること（品質）
* **計装方法・観測対象:** 全テスト数と合格率。Appendix C 完了条件充足率（16/16）。

---

## フェーズ依存関係グラフ

```
M0-1 (error.rs) ───────────────────────────────────────────────────────────┐
M0-2 (event.rs) ───┬── M1-1 (event methods) ─┐                           │
                    │                          │                           │
M0-3 (session.rs) ─┼── M1-3 (RuntimeResult) ──┤                           │
                    │                          │                           │
M0-4 (request.rs) ─┼── M1-2 (builder) ────────┤                           │
                    │                          │                           │
                    └── M1-9 (EventLogger) ────┤                           │
                                               │                           │
M1-4 (extractor trait) ─┬── M1-5 (JsonExtractor) ──┐                    │
                        │                           │                    │
                        └── M1-6 (MarkdownExtractor)┐│                    │
                                                   ││                    │
                        M1-7 (CompositeExtractor) ←┘│                    │
                        M1-8 (RetryExtractor) ←─────┘                    │
                                                                         │
M2-1 (RuntimeSession) ← ← ← M0-1, M0-2, M0-3, M1-3 ←────────────────────┘
M2-2 (RuntimeBackend) ← ← ← M2-1, M0-1, M0-4, M1-2
│
M3-1 (ClaudeCodeBackend) ← M2-1, M2-2, M0-1, M0-2, M0-4, M1-1, M1-2
M3-2 (TimeoutMonitor) ───→ M3-1 (連携任意)
│
M4-1 (lib.rs + Cargo.toml) ← 全 Phase 0〜3
M4-2 (結合テスト) ← M4-1, 全 Phase 0〜3
```

## 実装順序（推奨）

| 順序 | チケット | 理由 |
|------|---------|------|
| 1 | M0-1, M0-2, M0-3, M0-4 | 並列実装可能（外部依存なしの型定義） |
| 2 | M1-1, M1-2, M1-3, M1-9 | M0型に対する純粋関数（並列可能） |
| 3 | M1-4, M1-6 | extractor trait と独立ユーティリティ（並列可能） |
| 4 | M1-5 | JsonExtractor（M1-4 に依存） |
| 5 | M1-7, M1-8 | 複合抽出器（M1-4, M1-5 に依存、並列可能） |
| 6 | M2-1 | RuntimeSession trait（M0群に依存） |
| 7 | M2-2 | RuntimeBackend trait（M2-1 に依存） |
| 8 | M3-2 | TimeoutMonitor（独立モジュール、M3-1 と並列可能） |
| 9 | M3-1 | ClaudeCodeBackend（M2-1, M2-2 に依存） |
| 10 | M4-1 | lib.rs + Cargo.toml（全チケット完了後に依存） |
| 11 | M4-2 | 結合テスト + 検証（M4-1 に依存） |

**並列実行可能グループ**: (M0-1, M0-2, M0-3, M0-4), (M1-1, M1-2, M1-3, M1-9), (M1-4, M1-6), (M1-7, M1-8), (M2-1, M2-2), (M3-1, M3-2)
