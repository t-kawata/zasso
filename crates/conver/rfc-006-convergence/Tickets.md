# RFC_006: 数学的定式化・収束制御 実装チケット分解設計書

> **生成元:** crates/conver/rfc-006-convergence/RFC_006.md
> **生成日:** 2026-06-23
> **分析済みセクション:** §1 開発空間, §2 RFCツリー形式化, §3 乖離関数Δ, §4 観測ベクトルo_r, §5 収束ループ制御, §6 人間介入モデル, §7 完了条件, §8 Omissions Ledger, Appendix A-D

---

## Phase I: 純粋ロジック実装（Layer 0 + Layer 1）

> **外部依存:** chrono（時刻型）、serde / serde_json（シリアライズ）— いずれも既に `conver-core` の依存関係に含まれる
> **I/O依存:** なし — 全テストがメモリ内完結・決定論的
> **対象ファイル:** `crates/conver/rfc-002-core/src/deviation.rs` / `observation.rs` / `convergence.rs`

### M1: 乖離型定義と基本演算

> **DB:** 不使用（メモリ内完結）

#### チケット M1-1: OmissionKind 4分類列挙型

* **参照設計書:** RFC_006.md (§8 Omissions Ledger)
* **依存・関連チケットID:**
  - 先行実装必須: なし（本チケットが最基底）
  - 後続: M1-2（OmissionEntryがOmissionKindに依存）
* **対象不変条件 / 規範:**
  - §8: 乖離の4分類（M/C/U/X）のみが存在し、これら以外の分類は定義されない
  - 各バリアントはRFC_006 §3.2の定義に従う
* **実装の背景と目的:** OmissionKind は全乖離計算の最基底となる列挙型である。4分類（ImplementationMissing / ImplementationContradiction / SpecificationDeficiency / StructuralInconsistency）の正確な定義が、その上位すべての演算の正しさを保証する。この型が不正確だと乖離関数Δ全体が無意味になるため、最初に確定させる。
* **実装スコープ:**
  - `deviation.rs` 内に `OmissionKind` enum を定義
  - 4バリアント: `ImplementationMissing`, `ImplementationContradiction`, `SpecificationDeficiency`, `StructuralInconsistency`
  - `#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]` を付与
  - 各バリアントにドキュメンテーションコメント（RFC_006 §3.2の定義文をそのまま記載）
  - スタブは含まない
* **テストコードによる検証:**
  1. 4バリアントすべてがインスタンス化可能であること
  2. Serde のラウンドトリップ（シリアライズ→デシリアライズ）が正しいこと
  3. PartialEq が異種間で false を返すこと
  4. 各バリアントの Debug 表示が判別可能であること
  5. match が網羅的であること（コンパイル時検証）
* **計装方法・観測対象:** 全バリアントの網羅的マッチがコンパイルを通ることを確認する。バリアント数の変更はコンパイルエラーとして検出される。

#### チケット M1-2: OmissionEntry 個別エントリ構造体

* **参照設計書:** RFC_006.md (§8 Omissions Ledger)
* **依存・関連チケットID:**
  - 先行実装必須: M1-1（OmissionKindに依存）
  - 後続: M1-3（OmissionsLedgerがVec<OmissionEntry>を保持）
* **対象不変条件 / 規範:**
  - §8: 各エントリは `kind: OmissionKind` と `rfc_node_id: String` を必須として持つ
  - `kind` はM/C/U/Xのいずれか（OmissionKindで型保証）
  - オプショナルフィールド（ticket_id, code_location, stub_id）は `Option<T>` で表現
* **実装の背景と目的:** OmissionEntry は乖離関数Δの1成分を表現する個別レコードである。この構造体が正しく定義されることで、上位のOmissionsLedgerやDeviationCalculatorが依存するデータ構造が確定する。
* **実装スコープ:**
  - `deviation.rs` 内に `OmissionEntry` struct を定義
  - フィールド:
    - `kind: OmissionKind`
    - `rfc_node_id: String`
    - `ticket_id: Option<String>`
    - `description: String`
    - `code_location: Option<String>`
    - `stub_id: Option<String>`
    - `severity: String`（"critical" / "major" / "minor"）
    - `detected_at: chrono::DateTime<chrono::Utc>`
  - `#[derive(Debug, Clone, Serialize, Deserialize)]`
  - スタブは含まない
* **テストコードによる検証:**
  1. 全フィールドを設定したインスタンスが構築可能であること
  2. オプショナルフィールドが None でも構築可能であること
  3. Serde JSON ラウンドトリップが正しいこと
  4. 各OmissionKindとの組み合わせが正常に動作すること
* **計装方法・観測対象:** 構造体の全フィールドが正しくシリアライズ/デシリアライズされることを確認する。

#### チケット M1-3: OmissionsLedger コレクション

* **参照設計書:** RFC_006.md (§3.4, §8)
* **依存・関連チケットID:**
  - 先行実装必須: M1-1, M1-2（OmissionKind / OmissionEntryに依存）
  - 後続: M1-7（DeviationCalculatorがOmissionsLedgerを受け取る）、M1-12（ConvergenceControllerが参照）、M1-14（CompletionVerifierが参照）
* **対象不変条件 / 規範:**
  - §3.4 `calculate()` が `OmissionsLedger` を引数として受け取る
  - `count_by_kind(kind)` が指定された種類の件数を正しく返す
  - `has_kind(kind)` が1件以上の存在を判定する
  - `is_empty()` が全件数0を判定する
  - 初期容量指定で生成可能（`new(initial_capacity: usize)`）
* **実装の背景と目的:** OmissionsLedger は乖離エントリのコレクションとして、DeviationCalculator・ConvergenceController・CompletionVerifier の3コンポーネントから参照される中心的なデータ構造である。各コンポーネントが必要とするkind別集計・存在判定・空判定を提供する。
* **実装スコープ:**
  - `deviation.rs` 内に `OmissionsLedger` struct を定義
  - フィールド: `omissions: Vec<OmissionEntry>`
  - メソッド:
    - `new(initial_capacity: usize) -> Self`
    - `count_by_kind(&self, kind: OmissionKind) -> usize`
    - `has_kind(&self, kind: OmissionKind) -> bool`
    - `is_empty(&self) -> bool`
  - テストヘルパーとして `push(&mut self, entry: OmissionEntry)` を `#[cfg(test)]` ブロックに提供
  - スタブは含まない
* **テストコードによる検証:**
  1. 空のLedgerで `count_by_kind` が全種0を返すこと
  2. 特定のkindのみ追加後、そのkindのカウントのみ増加すること
  3. 複数kind混在時、各カウントが独立していること
  4. `has_kind` が存在種に対してtrue、不在種に対してfalseを返すこと
  5. `is_empty` が空状態でtrue、非空でfalseを返すこと
  6. 大量エントリ（1000件）でもパニックしないこと
* **計装方法・観測対象:** カウント演算がO(n)線形時間で完了することをベンチマークで確認する。メモリ内完結のため決定論的。

---

### M2: 乖離関数計算

> **DB:** 不使用（メモリ内完結）

#### チケット M2-1: DeviationComponents + DeviationScore 型定義

* **参照設計書:** RFC_006.md (§3.1 - 3.3)
* **依存・関連チケットID:**
  - 先行実装必須: M1-3（OmissionsLedgerを使用するが、本チケットは型定義のみのため、OmissionKind/M1-1が先行すれば十分）
  - 後続: M2-2（DeviationCalculatorがDrivationScoreを返す）、M1-8（ObservationVectorがDrivationScoreから展開）
* **対象不変条件 / 規範:**
  - §3.1: Δ = αM + βC + γU + δX の線形結合
  - `is_converged()` は Δ = 0 の場合のみtrue
  - `improved_since(previous)` は `self.delta < previous.delta` で判定
  - `zero()` は Δ = 0 の状態を返す
* **実装の背景と目的:** DeviationScore は乖離関数Δの計算結果を保持する中心的な型である。大域スコア（delta）と成分内訳（DeviationComponents）、ノード別内訳（per_node）を保持する。この型の不変条件が正しいことによって、収束判定（Δ=0）と改善判定（Δ減少）の信頼性が保証される。
* **実装スコープ:**
  - `deviation.rs` 内に以下のstructを定義：
    - `DeviationComponents { m: usize, c: usize, u: usize, x: usize }`
    - `DeviationScore { delta: f64, components: DeviationComponents, per_node: Vec<(String, f64)> }`
  - DeviationScore のメソッド:
    - `zero() -> Self`
    - `is_converged(&self) -> bool`
    - `improved_since(&self, previous: &DeviationScore) -> bool`
  - `#[derive(Debug, Clone, Serialize, Deserialize)]`
  - スタブは含まない
* **テストコードによる検証:**
  1. `zero()` が delta=0, 全components=0, per_node=空 を返すこと
  2. `is_converged()` が delta=0 でtrue、delta>0 でfalseを返すこと
  3. `is_converged()` が浮動小数点誤差に対してロバストであること（`== 0.0` で判定可）
  4. `improved_since()` が減少時にtrue、増加/同値時にfalseを返すこと
  5. Serde JSON ラウンドトリップが正しいこと
* **計装方法・観測対象:** 浮動小数点比較が f64 の `==` で十分であることを確認（Δは整数演算の重み付き和で、誤差累積は生じない設計）。

#### チケット M2-2: DeviationCalculator 乖離関数計算機

* **参照設計書:** RFC_006.md (§3.3 - 3.4)
* **依存・関連チケットID:**
  - 先行実装必須: M1-3（OmissionsLedger）、M2-1（DeviationScore）
  - 後続: M1-12（ConvergenceControllerがDeviationCalculatorを内包）、M1-14（CompletionVerifierがΔを受け取る）
  - リソース共有: `DeviationSettings` 型（RFC_002）との結合
* **対象不変条件 / 規範:**
  - §3.3: デフォルト重み α=2.0, β=2.0, γ=1.0, δ=1.0
  - §3.4: `calculate()` が Δ = αM + βC + γU + δX を正しく計算する
  - §3.4: `calculate_per_node()` がRFCノード別の集計も行う
  - 重みは `DeviationSettings` からの設定が可能
* **実装の背景と目的:** DeviationCalculator は乖離関数Δの計算エンジンである。`from_settings()` で設定値（αβγδ）を注入可能にすることで、`settings.json` によるユーザー上書きを可能にする。重みの設計意図（§3.3: X/Cを高く、U/Mを低く）はデフォルト値としてコード化される。
* **実装スコープ:**
  - `deviation.rs` 内に `DeviationCalculator` struct を定義
  - フィールド: `alpha: f64, beta: f64, gamma: f64, delta: f64`
  - メソッド:
    - `from_settings(settings: &DeviationSettings) -> Self` — DeviationSettings（RFC_002）から構築
    - `defaults() -> Self` — デフォルト重みで構築
    - `calculate(&self, omissions: &OmissionsLedger) -> DeviationScore`
    - `calculate_per_node(&self, omissions: &OmissionsLedger) -> DeviationScore`
  - DeviationSettings のimportはRFC_002の該当モジュールから行う（本RFC範囲外、外部依存）
  - スタブは含まない
* **テストコードによる検証:**
  1. omissions空で Delta=0 を返すこと
  2. M=2, X=1 で Δ = 2*1.0 + 1*2.0 = 4.0 を返すこと（デフォルト重み）
  3. 全4種1件ずつで Δ = 2.0 + 2.0 + 1.0 + 1.0 = 6.0 を返すこと
  4. `calculate_per_node()` がノード別に正しく集計すること
  5. カスタム重み（α=3, β=1.5, γ=0.5, δ=2）で正しく計算されること
  6. 浮動小数点の計算精度が 1e-9 以内であること
* **計装方法・観測対象:** Δの計算は加算と乗算のみから成る決定論的演算。計算結果をスナップショットテストで保存し、リファクタリング時の退行を防止する。

---

### M3: 人間介入モデル

> **DB:** 不使用（メモリ内完結）

#### チケット M3-1: InterventionKind 9種の介入種別

* **参照設計書:** RFC_006.md (§6.1)
* **依存・関連チケットID:**
  - 先行実装必須: なし
  - 後続: M3-2（InterventionがInterventionKindに依存）
* **対象不変条件 / 規範:**
  - §6.1: 介入型は9種類のみ。以下の網羅：
    - `InjectContext(String)` — 追加調査・制約・方針を注入
    - `ReviseRfcNode(String)` — 特定RFCノードを手動改訂
    - `SplitRfcNode { source, targets }` — RFCノード分割
    - `MergeRfcNodes { sources, target }` — RFCノード統合
    - `PatchTreeEdge { from, to, kind }` — 辺修正
    - `AbortTicket(String)` — チケット中断
    - `RollbackRound(u32)` — 過去ラウンドに巻き戻し
    - `OverrideConvergence(String)` — 非ゼロ乖離のまま強制終了
    - `FreezeSubgraph(String)` — サブグラフ改変禁止
* **実装の背景と目的:** 人間介入モデルは制御系外部からの操作を形式化する。9種の介入種別を明確に定義することで、観測ベクトルへの記録（`η_r`）や介入の事後分析が可能になる。各バリアントが保持するデータの型によって、介入の種類とスコープが静的に保証される。
* **実装スコープ:**
  - `observation.rs` 内に `InterventionKind` enum を定義
  - 9バリアント（上記網羅）
  - `#[derive(Debug, Clone, Serialize, Deserialize)]`
  - スタブは含まない
* **テストコードによる検証:**
  1. 全9バリアントがインスタンス化可能であること
  2. 各バリアントの内部データが正しく保持されること
  3. Serde JSON ラウンドトリップが全バリアントで正しいこと
  4. match が網羅的であること（コンパイル時検証）
* **計装方法・観測対象:** 全バリアントの網羅的マッチがコンパイルを通ることを確認。バリアント追加・削除はコンパイルエラーとして検出される。

#### チケット M3-2: Intervention 介入記録 + summary()

* **参照設計書:** RFC_006.md (§6.1)
* **依存・関連チケットID:**
  - 先行実装必須: M3-1（InterventionKindに依存）
  - 後続: M1-8（ObservationVectorがinterventions: Vec<String>を保持 — 介入要約はObservationVector構築時に生成）
* **対象不変条件 / 規範:**
  - §6.1: 各介入は `kind` + `timestamp` + `reason` を持つ
  - `summary()` が `"{KIND_STR}: {reason}"` 形式の要約を生成する
  - `InterventionKind` の各バリアントが正しい文字列表現にマッピングされる
* **実装の背景と目的:** Intervention は人間の介入操作を記録するレコードである。`summary()` メソッドは観測ベクトルの介入イベント欄（`η_r: Vec<String>`）に格納するための文字列を生成する。
* **実装スコープ:**
  - `observation.rs` 内に `Intervention` struct を定義
  - フィールド: `kind: InterventionKind`, `timestamp: DateTime<Utc>`, `reason: String`
  - メソッド: `summary(&self) -> String`
    - `InjectContext(_)` → `"INJECT_CONTEXT: {reason}"` 形式
    - 全9バリアント対応（ハードコード文字列ではなく定数として保持）
  - `#[derive(Debug, Clone, Serialize, Deserialize)]`
  - スタブは含まない
* **テストコードによる検証:**
  1. 全9種の介入で summary() が正しいプレフィックスを含むこと
  2. summary() が reason を含むこと
  3. summary() のフォーマットが `"{PREFIX}: {reason}"` に従うこと
  4. Serde JSON ラウンドトリップが正しいこと
  5. タイムスタンプが正しく保持されること
* **計装方法・観測対象:** summary() の出力は決定論的（文字列操作のみ）。全バリアントの prefix がユニークであることをテストで検証する。

---

### M4: 観測ベクトル

> **DB:** 不使用（メモリ内完結）

#### チケット M4-1: ObservationVector 11フィールド観測ベクトル

* **参照設計書:** RFC_006.md (§4.1)
* **依存・関連チケットID:**
  - 先行実装必須: M2-1（DeviationScoreからフィールド展開）、M3-2（Intervention::summary()をVec<String>として保持）
  - 後続: M2-2（ObservationRecorderがObservationVectorを永続化）
* **対象不変条件 / 規範:**
  - §4.1: 観測ベクトルは11フィールドから成る：
    - `r: u32` — ループ回数
    - `delta: f64` — 大域乖離スコア
    - `m: usize`, `c: usize`, `u: usize`, `x: usize` — 成分内訳
    - `v_count: u32` — RFCノード数
    - `k_count: u32` — 全チケット数
    - `duration_secs: u64` — ラウンド所要時間（秒）
    - `debt_index: f64` — 負債指標（0.0〜1.0）
    - `interventions: Vec<String>` — 介入イベント列
* **実装の背景と目的:** ObservationVector は各ループ反復のスナップショットを記録する。DeviationScore から乖離情報を展開し、RFC/チケット数・所要時間・負債指標・介入履歴を併せ持つことで、収束の時系列分析を可能にする。11フィールドすべてが `round_log.jsonl` に JSON として保存される。
* **実装スコープ:**
  - `observation.rs` 内に `ObservationVector` struct を定義
  - フィールド: `r`, `delta`, `m`, `c`, `u`, `x`, `v_count`, `k_count`, `duration_secs`, `debt_index`, `interventions`
  - コンストラクタ:
    - `new(round: u32, deviation: &DeviationScore, rfc_count: u32, ticket_count: u32, duration_secs: u64, debt_index: f64, interventions: Vec<String>) -> Self`
  - `#[derive(Debug, Clone, Serialize, Deserialize)]`
  - スタブは含まない
* **テストコードによる検証:**
  1. DeviationScore から全フィールドが正しく展開されること
  2. `new()` で渡した値と各フィールドが一致すること
  3. `debt_index` が 0.0〜1.0 の範囲であること（設計意図。ランタイムチェックはしないがテストで確認）
  4. Serde JSON ラウンドトリップで全フィールドが保存・復元されること
  5. `interventions` が空Vecでも動作すること
* **計装方法・観測対象:** 全フィールドのJSONシリアライゼーションをスナップショットテストで検証。フィールド追加は構造体変更によるコンパイルエラーで検出可能。

---

### M5: ラウンド管理と収束制御

> **DB:** 不使用（メモリ内完結）

#### チケット M5-1: RoundManager ラウンドカウンター + ConvergenceError

* **参照設計書:** RFC_006.md (§5.4)
* **依存・関連チケットID:**
  - 先行実装必須: なし（u32カウンターのみ）
  - 後続: M5-3（ConvergenceControllerがRoundManagerを内包）
* **対象不変条件 / 規範:**
  - `current_round` は `max_rounds` を超えない
  - `start_next_round()` は上限超過時に `Err(ConvergenceError::LoopLimitExceeded)` を返す
  - デフォルト上限は3（RFC_006 §5.1）
  - `current_round()` は現在のラウンド番号を返す
* **実装の背景と目的:** RoundManager は収束ループの反復回数を管理する。無限ループ防止機構として、設定可能な上限値（デフォルト3）を超えた場合にエラーを返す。この単純なカウンターが、conver の停止性を保証する基盤となる。
* **実装スコープ:**
  - `convergence.rs` 内に以下を定義：
    - `RoundManager` struct: `current_round: u32`, `max_rounds: u32`
    - `new(max_rounds: u32) -> Self`
    - `start_next_round(&mut self) -> Result<u32, ConvergenceError>`
    - `current_round(&self) -> u32`
  - `ConvergenceError` enum: `LoopLimitExceeded { current: u32, max: u32 }`
    - `#[derive(Debug, thiserror::Error)]` — thiserror 使用
    - `#[error("ループ上限超過: {current}/{max}")]` 
  - スタブは含まない
* **テストコードによる検証:**
  1. `new(3)` で生成後、`current_round() == 0` であること
  2. 3回 `start_next_round()` が成功し、返り値が1, 2, 3であること
  3. 4回目の `start_next_round()` が `LoopLimitExceeded` エラーを返すこと
  4. `max_rounds = 0` で最初の呼出しがエラーになること
  5. エラーの Display 実装が `"ループ上限超過: 3/3"` 形式であること
* **計装方法・観測対象:** ラウンドカウントは決定論的カウンター。上限超過は常にエラー型で表現されるため、呼出し元でのパターンマッチングによる網羅的エラー処理がコンパイル時検証される。

#### チケット M5-2: ConvergenceResult 収束ループ結果型

* **参照設計書:** RFC_006.md (§5.2)
* **依存・関連チケットID:**
  - 先行実装必須: M2-1（DeviationScore）、M5-1（ConvergenceError）
  - 後続: M5-3（ConvergenceControllerが戻り値として使用）
  - リソース共有: `WorkflowState` 型（RFC_002） — enum バリアントを Feedback 内で保持
* **対象不変条件 / 規範:**
  - 収束ループの結果は以下の2状態のみ：
    - `Converged(DeviationScore)` — Δ=0、収束完了
    - `Feedback { round: u32, score: DeviationScore, feedback_to: WorkflowState }` — Δ>0、フィードバック実行
  - これら以外の状態は存在しない
* **実装の背景と目的:** ConvergenceResult は `ConvergenceController::converge_round()` の戻り値型である。`Converged` と `Feedback` の2バリアントのみを持つことで、収束ループがとりうる結果を網羅的に表現する。`Feedback` が `WorkflowState` を保持することで、呼出し元は次に遷移すべき状態を明示的に知ることができる。
* **実装スコープ:**
  - `convergence.rs` 内に `ConvergenceResult` enum を定義
  - バリアント: `Converged(DeviationScore)`, `Feedback { round: u32, score: DeviationScore, feedback_to: WorkflowState }`
  - `#[derive(Debug)]`
  - スタブは含まない
* **テストコードによる検証:**
  1. `Converged(score)` が `matches!` で判別可能であること
  2. `Feedback{ round, score, feedback_to }` の全フィールドにアクセス可能であること
  3. match が網羅的であること（コンパイル時検証）
* **計装方法・観測対象:** 網羅的マッチのコンパイル保証。バリアント追加はコンパイルエラーとして検出。

#### チケット M5-3: ConvergenceController 収束ループ制御

* **参照設計書:** RFC_006.md (§5.1 - 5.2)
* **依存・関連チケットID:**
  - 先行実装必須: M1-3（OmissionsLedger）、M2-2（DeviationCalculator）、M5-1（RoundManager）、M5-2（ConvergenceResult）
  - リソース共有: `WorkflowState`（RFC_002）への依存
* **対象不変条件 / 規範:**
  - §5.2: `determine_feedback_phase()` のフィードバック先決定ルール：
    - X (StructuralInconsistency) → `ChecklistPending`
    - U (SpecificationDeficiency) → `Grilling`
    - M (ImplementationMissing) → `ChecklistApproved`
    - C (ImplementationContradiction) → `ChecklistApproved`
    - なし (Δ=0) → `None`
  - 優先順位: **X > U > M,C**（複数種類同時存在時、上位のPhaseから再実行）
  - §5.2: `converge_round()` の状態遷移：
    - Δ=0 → `Done` + `Converged` を返す
    - Δ>0 → フィードバック先に状態遷移 + `Feedback` を返す
    - ループ上限超過時 → `ConvergenceError::LoopLimitExceeded`
* **実装の背景と目的:** ConvergenceController は収束ループの制御中枢である。乖離関数の計算結果をもとにフィードバック先を決定し、大域状態を遷移させる。優先順位の設計（X > U > M,C）は、構造不整合が最も深刻で先に修正すべきという設計判断（§3.3）を反映する。
* **実装スコープ:**
  - `convergence.rs` 内に `ConvergenceController` struct を定義
  - フィールド: `round_manager: RoundManager`, `deviation_calculator: DeviationCalculator`, `max_rounds: u32`
  - メソッド:
    - `new(max_rounds: u32, deviation_settings: &DeviationSettings) -> Self`
    - `determine_feedback_phase(&self, omissions: &OmissionsLedger) -> Option<WorkflowState>`
    - `converge_round(&mut self, omissions: &OmissionsLedger, state: &mut WorkflowState) -> Result<ConvergenceResult, ConvergenceError>`
  - スタブは含まない
* **テストコードによる検証:**
  1. Xのみ → `Some(WorkflowState::ChecklistPending)` を返すこと
  2. Uのみ → `Some(WorkflowState::Grilling)` を返すこと
  3. Mのみ → `Some(WorkflowState::ChecklistApproved)` を返すこと
  4. Cのみ → `Some(WorkflowState::ChecklistApproved)` を返すこと
  5. 空omissions → `None` を返すこと
  6. X + U 混在 → X が優先されること
  7. Δ=0 → `Converged` + 状態が `Done` になること
  8. Δ>0 → `Feedback` + 状態がフィードバック先になること
  9. ループ上限超過エラーが正しく伝播すること
* **計装方法・観測対象:** フィードバック先決定は決定論的条件分岐。全組み合わせ（4種単独 + 6種の2種混合）をテストケースとして網羅する。状態遷移は `&mut WorkflowState` への副作用として観測。

---

### M6: 完了条件検証

> **DB:** 不使用（メモリ内完結）

#### チケット M6-1: CompletionReport + CompletionError + CompletionVerifier

* **参照設計書:** RFC_006.md (§7)
* **依存・関連チケットID:**
  - 先行実装必須: M1-3（OmissionsLedgerを引数で受け取る）
  - リソース共有: `TicketDag`, `TicketRecord`, `TicketStatus`（RFC_002）
* **対象不変条件 / 規範:**
  - §7: 以下の6条件の論理積が完了条件：
    1. RFC_TREE.json と全RFC_XXX.md の整合性が成立（`rfc_tree.is_empty()` で簡易判定）
    2. 全チケットDAGが完了状態（`TicketStatus::Done`）
    3. 未解決STUBがゼロ、または明示的override下にある
    4. omission ledger が空
    5. 乖離関数 Δ = 0
    6. 強制停止や暫定凍結が残っていない（[::STUB::] — 条件6は別途フラグ管理）
  - 全条件充足時: `Ok(CompletionReport { converged: true, delta })`
  - 未充足時: `Err(CompletionError::NotConverged(failures))`
* **実装の背景と目的:** CompletionVerifier は「収束したかどうか」を形式的に判定する。6条件の論理積による判定により、「主観的に完成した気がする」ではなく、機械的に検証可能な基準で完了を判断する。条件6（凍結・停止）のフラグ管理は Phase III で実装されるスタブとしてマークされる。
* **実装スコープ:**
  - `convergence.rs` 内に以下を定義：
    - `CompletionReport { converged: bool, delta: f64 }` — `#[derive(Debug)]`
    - `CompletionError::NotConverged(Vec<String>)` — `#[derive(Debug, thiserror::Error)]`
    - `CompletionVerifier` struct — メソッドのみ
    - `verify(&self, rfc_tree: &str, tickets: &[TicketDag], stub_count: usize, omissions: &OmissionsLedger, delta: f64, has_override: bool) -> Result<CompletionReport, CompletionError>`
  - 条件6（凍結・停止）は `[::STUB::]` としてマーク。フラグ引数が外部から与えられることを前提とし、verifier内部でのフラグ管理はPhase IIIで実装。該当部分に `// [::STUB::] M6-1 条件6: 凍結・停止フラグの保持と検証は Phase III で実装。現在は引数で受け取ったhas_overrideのみを使用。` を付記。
* **テストコードによる検証:**
  1. 全条件充足時（空omissions, Δ=0, STUB=0, overrideなし）→ Ok
  2. Δ > 0 → Err に "Δ = N > 0" を含む
  3. STUB > 0 かつ overrideなし → Err に "未解決STUB: N件" を含む
  4. STUB > 0 かつ overrideあり → Ok に変わる
  5. omissions非空 → Err に "未解決omissions: N件" を含む
  6. 未完了チケット → Err に "未完了チケット: id1, id2" を含む
  7. rfc_tree 空 → Err に "RFC_TREE.json が空" を含む
  8. 複数条件同時違反 → 全failureが収集されること
* **計装方法・観測対象:** 6条件の各チェックは独立した失敗メッセージの収集として実装。全条件がチェックされること（早期リターンではなく全チェック実行）をテストで確認する。

---

## Phase II: Mock/Fake による制御された実行の導入（Layer 2）

> **外部依存:** `StorageBackend` trait（RFC_004）、`StorageError` — 既存のトレイト定義を使用
> **テスト戦略:** テスト内で `StorageBackend` を実装した Fake/Mock を使用し、実I/Oなしで検証

### M7: 観測ベクトルの永続化

> **DB:** メモリ内 Fake で代用

#### チケット M7-1: ObservationRecorder 観測記録器

* **参照設計書:** RFC_006.md (§4.2)
* **依存・関連チケットID:**
  - 先行実装必須: M4-1（ObservationVectorに依存）
  - リソース共有: `StorageBackend` trait（RFC_004）— ファイルI/Oの抽象化
* **対象不変条件 / 規範:**
  - §4.2: 観測ベクトルは `round_log.jsonl` に append-only で保存される
  - `append()`: JSON 1行を追記する（LLM呼出しは誘発しない）
  - `latest()`: 最終行を読み出してデシリアライズする
  - `all()`: 全行を時系列順に読み出す
  - 不正なJSON行はスキップされる（`all()` の lines parse で `if let Ok` で無視）
* **実装の背景と目的:** ObservationRecorder は観測ベクトルの永続化を担当する。`StorageBackend` trait を介してファイルI/Oを抽象化することで、テスト時にはメモリ内Fakeを使用し、本番では実ファイルに書き出す。`round_log.jsonl` は append-only であり、既存のログ行を変更しないことが不変条件となる。
* **実装スコープ:**
  - `observation.rs` 内に `ObservationRecorder` struct を定義（フィールドなし）
  - メソッド:
    - `append(&self, storage: &mut dyn StorageBackend, obs: &ObservationVector) -> Result<(), StorageError>`
      - `serde_json::to_string(obs)?` で JSON 化
      - `storage.append("round_log.jsonl", line.as_bytes())?` で追記
    - `latest(&self, storage: &dyn StorageBackend) -> Result<Option<ObservationVector>, StorageError>`
      - `storage.read_to_string("round_log.jsonl")?` で全行取得
      - `lines().last()` で最終行をパース
    - `all(&self, storage: &dyn StorageBackend) -> Result<Vec<ObservationVector>, StorageError>`
      - 全行を順次パース（parsing error行は `if let Ok` でスキップ）
  - スタブは含まない
* **テストコードによる検証:**
  1. Fake/Mock の `StorageBackend` を使用して全メソッドをテスト
     - Fake は `HashMap<String, Vec<u8>>` または類似のインメモリ実装
  2. `append()` → `latest()` で最新の観測ベクトルが取得できること
  3. 3件の `append()` → `all()` で3件すべてが時系列順に取得できること
  4. 空のストレージで `latest()` → `None` を返すこと
  5. 空のストレージで `all()` → 空Vecを返すこと
  6. 不正なJSON行が混在しても、正常な行は正しく取得できること
* **計装方法・観測対象:** Fake StorageBackend の状態をテスト終了後に検査することで、append-only 不変条件（既存行の非変更）を検証する。

---

## Phase III: ライフサイクル管理の統合（Layer 3）

> **外部依存:** 全 Phase I / Phase II コンポーネント
> **テスト戦略:** Fake StorageBackend 上での統合シナリオテスト

### M8: 全コンポーネント統合

> **DB:** メモリ内完結（Fake StorageBackend）

#### チケット M8-1: 条件6（凍結・停止フラグ）の完全実装

* **参照設計書:** RFC_006.md (§7, 条件6)
* **依存・関連チケットID:**
  - 先行実装必須: M6-1（CompletionVerifier の [::STUB::] 解決）
* **対象不変条件 / 規範:**
  - §7 条件6: 強制停止や暫定凍結が残っていないこと
  - 完了条件の6条件すべてが実装され、CompletionVerifier が完全に動作すること
* **実装の背景と目的:** チケット M6-1 では条件6のチェックを `[::STUB::]` としてマークしていた。本チケットで凍結・停止フラグの管理機構を実装し、CompletionVerifier の条件6を完全なものにする。フラグ管理は ConvergenceController または上位のオーケストレータで行うことを想定する。
* **実装スコープ:**
  - 凍結状態を保持する型（`FreezeState` または既存型へのフィールド追加）
  - CompletionVerifier の条件6チェックを [::STUB::] から完全実装に置き換え
  - `[::STUB::]` マーカーの除去
  - 犯罪レコード（Malfeasance.json）の解決登録
* **テストコードによる検証:**
  1. 凍結フラグ有り → CompletionVerifier がエラーを返すこと
  2. 凍結フラグ無し → CompletionVerifier が成功すること
  3. スタブから完全実装への移行後も既存の全テストがパスすること
* **計装方法・観測対象:** CompletionVerifier の条件6が組み込まれたことによる全6条件の充足確認。

#### チケット M8-2: 収束ループ結合シナリオテスト

* **参照設計書:** RFC_006.md (§5, §7)
* **依存・関連チケットID:**
  - 先行実装必須: M5-3（ConvergenceController）、M6-1（CompletionVerifier）、M7-1（ObservationRecorder）、M8-1（条件6解決）
* **対象不変条件 / 規範:**
  - 全コンポーネントが結合して正しく動作すること
  - 以下のエンドツーエンドシナリオが成り立つこと：
    1. omissions を設定 → DeviationCalculator が Δ を計算
    2. Δ>0 → ConvergenceController がフィードバック先を決定
    3. 観測ベクトルを記録
    4. ループ上限到達 → LoopLimitExceeded
    5. Δ=0 → Done 遷移 → CompletionVerifier が確認
* **実装の背景と目的:** 個別チケットで実装された各コンポーネントが、結合時に正しく連携することを検証する。このテストでは Fake StorageBackend 上で完全な収束ループのシミュレーションを行い、結合不変条件が満たされることを確認する。
* **実装スコープ:**
  - `convergence.rs`（または `tests/`）に統合テストを追加
  - テストシナリオ：
    - 収束成功シナリオ: omissions を追加→解決→Δ=0 を繰り返し、最終的に Done
    - ループ上限到達シナリオ: 解消されない omissions で上限到達→LoopLimitExceeded
    - 人間介入シナリオ: Intervention の記録と観測ベクトルへの反映
  - Fake StorageBackend 上で ObservationRecorder の動作を検証
  - スタブは含まない
* **テストコードによる検証:**
  1. 収束成功: omissions を追加 → converge_round → フィードバック → omissions解決 → converge_round → Converged
  2. ループ上限: 解消不能な omissions を設定 → 3回 converge_round → LoopLimitExceeded
  3. 観測記録: 各 converge_round 後に ObservationRecorder で記録 → all() で時系列取得
  4. 介入記録: Intervention 作成 → ObservationVector に反映 → 永続化
  5. 完了検証: Δ=0 + omissions空 + STUB=0 → CompletionVerifier が Ok
* **計装方法・観測対象:** 結合テストの各ステップで状態をアサーション。観測ベクトルの時系列が期待される収束パターンと一致することを確認。

---

## Phase IV: プラットフォーム固有・統合・E2E（Layer 4）

> **外部依存:** conver-core crate 全体

### M9: 受入テスト

> **DB:** 不使用（テストバイナリ内で完結）

#### チケット M9-1: test-run.rs 受入テストバイナリ

* **参照設計書:** RFC_006.md (§D 受入テスト)
* **依存・関連チケットID:**
  - 先行実装必須: 全 Phase I〜III チケット
* **対象不変条件 / 規範:**
  - §D: `cargo run --bin test-run -p conver-core` で実行可能
  - 以下の5項目を検証：
    1. 乖離関数 Δ = αM + βC + γU + δX
    2. 観測ベクトル o_r
    3. 収束ループ制御
    4. 完了条件
    5. 人間介入モデル
  - 全テストパスで "PASS"、1件でも失敗で "FAIL" を表示
* **実装の背景と目的:** 受入テストバイナリは、RFC_006 の完了条件を満たしたことの宣言的証明である。`cargo run --bin test-run -p conver-core` 一発で全項目の PASS/FAIL が確認できる。これは CI パイプラインの一部としても使用される。
* **実装スコープ:**
  - `conver-core/tests/test-run.rs` にバイナリを追加
  - `Cargo.toml` に `[[bin]]` セクション追加：
    ```toml
    [[bin]]
    name = "test-run"
    path = "tests/test-run.rs"
    ```
  - 以下の5テストを含む：
    1. `test_deviation_function()`: DeviationCalculator で Δ 計算
    2. `test_observation_vector()`: ObservationVector の構築
    3. `test_convergence_loop()`: ConvergenceController の converge_round
    4. `test_completion_conditions()`: CompletionVerifier の verify
    5. `test_human_intervention()`: Intervention の summary
  - 各テストは独立した関数として実装（`fn test_xxx()`）
  - `main()` 関数で全テストを逐次実行し PASS/FAIL を集計
  - 各テストの説明を `println!` で表示
  - スタブは含まない
* **テストコードによる検証:**
  1. バイナリが `cargo run --bin test-run -p conver-core` で実行可能であること
  2. 全5テストが PASS すること
  3. 失敗時に FAIL カウントが増加すること
  4. 各テストの出力が何を検証しているか説明を含むこと
* **計装方法・観測対象:** バイナリの終了コード（0 = PASS, 非0 = FAIL）と標準出力の PASS/FAIL 集計。

---

## チケット依存関係グラフ（総合）

```
Phase I (Layer 0 + Layer 1):
  M1-1 (OmissionKind) ──→ M1-2 (OmissionEntry) ──→ M1-3 (OmissionsLedger)
  M2-1 (DeviationScore) ──→ M2-2 (DeviationCalculator) ──→ M5-3 (ConvergenceController)
  M1-3 (OmissionsLedger) ──────────────────────────────────→ M5-3
  M3-1 (InterventionKind) ──→ M3-2 (Intervention)
  M2-1 (DeviationScore) ──→ M4-1 (ObservationVector)
  M5-1 (RoundManager) ──→ M5-2 (ConvergenceResult) ──→ M5-3
  M1-3 (OmissionsLedger) ──→ M6-1 (CompletionVerifier)

Phase II (Layer 2):
  M4-1 (ObservationVector) ──→ M7-1 (ObservationRecorder)

Phase III (Layer 3):
  M6-1 ──→ M8-1 (条件6実装) ──→ M8-2 (結合テスト)

Phase IV (Layer 4):
  全Phase I-III ──→ M9-1 (test-run.rs)
```

### 推奨実装順序（依存解決順）

```
M1-1 → M1-2 → M1-3          [乖離型定義系]
M2-1 → M2-2                  [乖離関数計算系]
M3-1 → M3-2                  [人間介入系]
M4-1                         [観測ベクトル]
M5-1 → M5-2 → M5-3          [収束制御系]
M6-1                         [完了条件検証]
M7-1                         [観測記録]
M8-1 → M8-2                  [結合・統合]
M9-1                         [受入テスト]
```

M5-3（ConvergenceController）は M1-3、M2-2、M5-1、M5-2 の4チケット完了までブロックされる。
M8-2（結合テスト）は Phase I + Phase II の全チケット完了までブロックされる（最も依存数の多いチケット）。

### 並行実行可能なグループ

以下のグループ内のチケットは相互依存がないため並行実装可能：

- **グループA（型定義系）**: M1-1, M2-1, M3-1, M5-1
- **グループB（中間層）**: M1-3（M1-2完了後）, M2-2（M2-1完了後）, M3-2（M3-1完了後）, M4-1（M2-1完了後）
- **グループC（制御系）**: M5-3（グループA+B完了後）, M6-1（M1-3完了後）, M7-1（M4-1完了後）
- **グループD（統合）**: M8-1, M8-2（グループC完了後）
- **グループE（受入）**: M9-1（全完了後）
